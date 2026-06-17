#Requires -Version 5.1
<#
.SYNOPSIS
    Mounts a shared folder at /mnt/log inside the VM, then installs a systemd timer
    that rsyncs /var/log -> /mnt/log every 30 seconds.
.PARAMETER VmName
    Name of the registered VirtualBox VM.
.PARAMETER HostPath
    Host directory to sync logs into. Defaults to <VM folder>\guest-logs.
.PARAMETER NonInteractive
    Skip all prompts; fail immediately if required data is missing.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\share-logs.ps1"
#>

param(
    [string]$VmName        = '',
    [string]$HostPath      = '',
    [string]$VmUser        = '',
    [string]$VmPass        = '',
    [string]$LoginUser     = '',
    [switch]$NonInteractive,
    [switch]$ForceRestart
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common.ps1"

# ---------------------------------------------------------------------------

Write-Header "Log Share + Sync Setup"

$script:vbox = Find-VBoxManage
if (-not $script:vbox) { Write-Host "  ERROR: VBoxManage.exe not found." -ForegroundColor Red; exit 1 }
Write-Host "  VBoxManage: $script:vbox" -ForegroundColor DarkGray

$registeredVms = & $script:vbox list vms 2>$null | ForEach-Object { if ($_ -match '"(.+)"') { $Matches[1] } }

if (-not $NonInteractive -and $registeredVms) {
    Write-Host ""
    Write-Host "  Registered VMs:" -ForegroundColor DarkGray
    $registeredVms | ForEach-Object { Write-Host "    - $_" -ForegroundColor DarkGray }
}

if ([string]::IsNullOrWhiteSpace($VmName)) {
    if ($NonInteractive) { Write-Host "  ERROR: -VmName is required in non-interactive mode." -ForegroundColor Red; exit 1 }
    while ($true) {
        Write-Host ""
        $VmName = (Read-Host "VM name").Trim()
        if ([string]::IsNullOrWhiteSpace($VmName)) { Write-Host "  VM name cannot be empty." -ForegroundColor Yellow; continue }
        if ($registeredVms -notcontains $VmName)   { Write-Host "  No VM named '$VmName' found." -ForegroundColor Yellow; continue }
        break
    }
} elseif ($registeredVms -notcontains $VmName) {
    Write-Host "  ERROR: No VM named '$VmName' found." -ForegroundColor Red; exit 1
}

# Derive default HostPath from VM config file location
if ([string]::IsNullOrWhiteSpace($HostPath)) {
    $ErrorActionPreference = 'SilentlyContinue'
    $vmInfo = & $script:vbox showvminfo $VmName --machinereadable 2>$null
    $ErrorActionPreference = 'Stop'
    $cfgLine = $vmInfo | Where-Object { $_ -match '^CfgFile=' }
    if ($cfgLine -match '^CfgFile="(.+)"') {
        $HostPath = Join-Path (Split-Path $Matches[1] -Parent) 'guest-logs'
    } else {
        Write-Host "  ERROR: Could not determine VM folder to set default HostPath." -ForegroundColor Red
        exit 1
    }
}

Write-Host "  Host path: $HostPath" -ForegroundColor DarkGray

$hostDirCreated = $false
if (-not (Test-Path $HostPath)) {
    New-Item -ItemType Directory -Path $HostPath -Force | Out-Null
    Write-Host "  Created: $HostPath" -ForegroundColor DarkGray
    $hostDirCreated = $true
}

# Share name that share-folder.ps1 will register (leaf of HostPath, spaces -> underscore).
$shareName = (Split-Path $HostPath -Leaf) -replace '\s+', '_'

# ---------------------------------------------------------------------------
Write-Header "Step 1 - Mount Shared Folder"

$shareFolderArgs = @{
    VmName     = $VmName
    HostPath   = $HostPath
    MountPoint = '/mnt/log'
}
if ($VmUser)         { $shareFolderArgs['VmUser']         = $VmUser    }
if ($VmPass)         { $shareFolderArgs['VmPass']         = $VmPass    }
if ($LoginUser)      { $shareFolderArgs['LoginUser']      = $LoginUser  }
if ($NonInteractive) { $shareFolderArgs['NonInteractive'] = $true       }
if ($ForceRestart)   { $shareFolderArgs['ForceRestart']   = $true       }
& "$PSScriptRoot\share-folder.ps1" @shareFolderArgs
if ($LASTEXITCODE -ne 0) {
    if ($hostDirCreated -and (Test-Path $HostPath -PathType Container)) {
        Write-Host "  Removing host directory created during this run..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $HostPath -ErrorAction SilentlyContinue
    }
    Write-Host "  ERROR: Could not set up the shared folder. See the output above for details." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
Write-Header "Step 2 - Install Log Sync Timer"

$tmpFile = $null

try {
    if ([string]::IsNullOrWhiteSpace($VmUser) -or [string]::IsNullOrWhiteSpace($VmPass)) {
        $creds = Get-VmCredentials -VmName $VmName
        if (-not $creds) { throw "No credentials supplied or saved for '$VmName'." }
        $vmUser = $creds.User
        $vmPass = $creds.Pass
    } else {
        $vmUser = $VmUser
        $vmPass = $VmPass
    }

    $setupScript = @'
#!/bin/bash
set -e
dnf install -y rsync

cat > /etc/rsync-log-excludes << EXCLUDEOF
journal/
btmp
wtmp
lastlog
tallylog
sa/
speech-dispatcher/
EXCLUDEOF

cat > /usr/local/bin/log-sync.sh << 'SYNCEOF'
#!/bin/bash
if ! mountpoint -q /mnt/log; then
    echo "ERROR: /mnt/log is not mounted, skipping sync" >&2
    exit 1
fi
rsync -rlpt --no-owner --no-group --delete --exclude-from=/etc/rsync-log-excludes /var/log/ /mnt/log/
date -Iseconds > /mnt/log/.last-sync
SYNCEOF

chmod +x /usr/local/bin/log-sync.sh

cat > /etc/systemd/system/log-sync.service << SVCEOF
[Unit]
Description=Sync /var/log to /mnt/log
After=remote-fs.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/log-sync.sh
SVCEOF

cat > /etc/systemd/system/log-sync.timer << TMREOF
[Unit]
Description=Sync /var/log to /mnt/log every 30 seconds

[Timer]
OnBootSec=30s
OnUnitActiveSec=30s
AccuracySec=1s

[Install]
WantedBy=timers.target
TMREOF

systemctl daemon-reload
systemctl enable --now log-sync.timer
rm -f /tmp/log-sync-setup.sh
echo "log-sync.timer installed and started."
'@

    $tmpFile = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "log-sync-setup.sh")
    [System.IO.File]::WriteAllText($tmpFile, ($setupScript -replace "`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))

    Write-Host "  Uploading setup script..." -ForegroundColor Cyan
    $ErrorActionPreference = 'SilentlyContinue'
    & $script:vbox guestcontrol $VmName copyto $tmpFile "/tmp/log-sync-setup.sh" --username $vmUser --password $vmPass 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to upload setup script to VM." }
    $ErrorActionPreference = 'Stop'

    Write-Host "  Running setup script..." -ForegroundColor Cyan
    $ErrorActionPreference = 'SilentlyContinue'
    $result   = & $script:vbox guestcontrol $VmName run --exe /bin/bash --username $vmUser --password $vmPass --wait-stdout --wait-stderr -- /tmp/log-sync-setup.sh 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'

    if ($exitCode -ne 0) { throw "Setup script failed (exit $exitCode): $result" }

    Remove-Item $tmpFile -ErrorAction SilentlyContinue

    Write-Host ""
    Write-Host "  log-sync.timer active." -ForegroundColor Green
    Write-Host "  /var/log -> /mnt/log synced every 30 seconds." -ForegroundColor Cyan
    Write-Host "  View logs on host at: $HostPath" -ForegroundColor Cyan

} catch {
    $msg = $_.Exception.Message
    Write-Host "  Removing shared folder registration due to timer setup failure..." -ForegroundColor Yellow
    $ErrorActionPreference = 'SilentlyContinue'
    & $script:vbox sharedfolder remove $VmName --name $shareName 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'
    if ($hostDirCreated -and (Test-Path $HostPath -PathType Container)) {
        Write-Host "  Removing host directory created during this run..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $HostPath -ErrorAction SilentlyContinue
    }
    if ($null -ne $tmpFile) { Remove-Item $tmpFile -ErrorAction SilentlyContinue }
    Write-Host "  ERROR: $msg" -ForegroundColor Red
    exit 1
}
