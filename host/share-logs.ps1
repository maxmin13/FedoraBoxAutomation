#Requires -Version 5.1
<#
.SYNOPSIS
    Shares C:\Temp\logs into the VM at /mnt/log, then installs a systemd timer
    that rsyncs /var/log -> /mnt/log every 30 seconds.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\share-logs.ps1"
#>

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common.ps1"

# ---------------------------------------------------------------------------

Write-Header "Log Share + Sync Setup"

$script:vbox = Find-VBoxManage
if (-not $script:vbox) { Write-Host "  ERROR: VBoxManage.exe not found." -ForegroundColor Red; exit 1 }
Write-Host "  VBoxManage: $script:vbox" -ForegroundColor DarkGray

$registeredVms = & $script:vbox list vms 2>$null | ForEach-Object { if ($_ -match '"(.+)"') { $Matches[1] } }
if ($registeredVms) {
    Write-Host ""
    Write-Host "  Registered VMs:" -ForegroundColor DarkGray
    $registeredVms | ForEach-Object { Write-Host "    - $_" -ForegroundColor DarkGray }
}

$vmName = ''
while ($true) {
    Write-Host ""
    $vmName = (Read-Host "VM name").Trim()
    if ([string]::IsNullOrWhiteSpace($vmName)) { Write-Host "  VM name cannot be empty." -ForegroundColor Yellow; continue }
    if ($registeredVms -notcontains $vmName)   { Write-Host "  No VM named '$vmName' found." -ForegroundColor Yellow; continue }
    break
}

# ---------------------------------------------------------------------------
Write-Header "Step 1 - Mount Shared Folder"

& "$PSScriptRoot\share-folder.ps1" -VmName $vmName -HostPath "C:\Temp\logs" -MountPoint "/mnt/log"
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: share-folder.ps1 failed." -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------------------
Write-Header "Step 2 - Install Log Sync Timer"

$creds = Get-VmCredentials -VmName $vmName
if (-not $creds) {
    Write-Host "  ERROR: No saved credentials for '$vmName'." -ForegroundColor Red
    exit 1
}
$vmUser = $creds.User
$vmPass = $creds.Pass

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
rsync -a --delete --exclude-from=/etc/rsync-log-excludes /var/log/ /mnt/log/
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
& $script:vbox guestcontrol $vmName copyto $tmpFile "/tmp/log-sync-setup.sh" --username $vmUser --password $vmPass 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "  ERROR: Failed to upload setup script to VM." -ForegroundColor Red; exit 1 }
$ErrorActionPreference = 'Stop'

Write-Host "  Running setup script..." -ForegroundColor Cyan
$ErrorActionPreference = 'SilentlyContinue'
$result   = & $script:vbox guestcontrol $vmName run --exe /bin/bash --username $vmUser --password $vmPass --wait-stdout --wait-stderr -- /tmp/log-sync-setup.sh 2>&1
$exitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'

if ($exitCode -ne 0) {
    Write-Host "  ERROR: Setup script failed (exit $exitCode): $result" -ForegroundColor Red
    exit 1
}

Remove-Item $tmpFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  log-sync.timer active." -ForegroundColor Green
Write-Host "  /var/log -> /mnt/log synced every 30 seconds." -ForegroundColor Cyan
Write-Host "  View logs on host at: C:\Temp\logs" -ForegroundColor Cyan
