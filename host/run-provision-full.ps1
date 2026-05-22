#Requires -Version 5.1
<#
.SYNOPSIS
    Runs the full VM base setup (system-prep, network-config, selinux-config, desktop-config, utilities)
    non-interactively via guestcontrol.
.PARAMETER VmName
    Name of the registered VirtualBox VM.
.PARAMETER VmUser
    Username for guestcontrol authentication (typically root).
.PARAMETER VmPass
    Password for guestcontrol authentication.
.PARAMETER LoginUser
    Desktop login username used by scripts to configure home directory and PATH.
.PARAMETER Hostname
    Hostname to set inside the VM.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\run-provision-full.ps1" `
        -VmName FedoraBox -VmUser root -VmPass secret -LoginUser maxmin -Hostname fedorabox -NonInteractive
#>
param(
    [string]$VmName    = '',
    [string]$VmUser    = '',
    [string]$VmPass    = '',
    [string]$LoginUser = '',
    [string]$Hostname  = '',
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common.ps1"

$script:vbox = Find-VBoxManage
if (-not $script:vbox) {
    Write-Host "ERROR: VBoxManage.exe not found. Is VirtualBox installed?" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($VmName))    { $VmName    = (Read-Host "VM name").Trim() }
if ([string]::IsNullOrWhiteSpace($VmUser))    { $VmUser    = (Read-Host "VM root username").Trim() }
if ([string]::IsNullOrWhiteSpace($VmPass))    { $VmPass    = (Read-Host "VM root password") }
if ([string]::IsNullOrWhiteSpace($LoginUser)) { $LoginUser = (Read-Host "Desktop username").Trim() }
if ([string]::IsNullOrWhiteSpace($Hostname))  { $Hostname  = (Read-Host "VM hostname").Trim() }

$script:vmName = $VmName
$script:vmUser = $VmUser
$script:vmPass = $VmPass

$projectRoot = Split-Path $PSScriptRoot -Parent
$setupRoot   = Join-Path $projectRoot "vm\setup"
$assetsRoot  = Join-Path $projectRoot "assets"

function Invoke-GuestUploadAndRun {
    param([string]$LocalPath, [string]$ScriptArgs = '')

    $fileName  = [System.IO.Path]::GetFileName($LocalPath)
    $guestPath = "/tmp/$fileName"

    Write-Host "  Uploading $fileName..." -NoNewline
    $ua = @('guestcontrol', $script:vmName, 'copyto', $LocalPath, $guestPath, '--username', $script:vmUser, '--password', $script:vmPass)
    $r  = & $script:vbox @ua 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Host "  ERROR: $r" -ForegroundColor Red
        return $false
    }
    Write-Host " OK" -ForegroundColor Green

    # Strip CRLF and chmod +x
    $ErrorActionPreference = 'SilentlyContinue'
    & $script:vbox guestcontrol $script:vmName run --exe /bin/bash `
        --username $script:vmUser --password $script:vmPass `
        --wait-stdout --wait-stderr `
        -- -c "sed -i 's/\r//' $guestPath && chmod +x $guestPath" 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'

    $cmd = if ($script:vmUser -eq 'root') {
        if ($ScriptArgs) { "$guestPath $ScriptArgs" } else { $guestPath }
    } else {
        if ($ScriptArgs) { "sudo $guestPath $ScriptArgs" } else { "sudo $guestPath" }
    }

    Write-Host "  Running: $cmd" -ForegroundColor DarkGray

    $runArgs = @(
        'guestcontrol', $script:vmName,
        'run', '--exe', '/bin/bash',
        '--username', $script:vmUser, '--password', $script:vmPass,
        '--wait-stdout', '--wait-stderr',
        '--timeout', '3600000',
        '--', '-c', $cmd
    )

    $ErrorActionPreference = 'SilentlyContinue'
    $result = & $script:vbox @runArgs 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'

    $result | ForEach-Object { Write-Host $_.ToString() }

    if ($exitCode -ne 0) {
        Write-Host "  ERROR: $fileName exited with code $exitCode" -ForegroundColor Red
        return $false
    }
    return $true
}

# Upload common.sh
$commonScript = Join-Path $projectRoot "vm\lib\common.sh"
if (Test-Path $commonScript) {
    Write-Host "  Uploading common.sh..." -NoNewline
    $ua = @('guestcontrol', $script:vmName, 'copyto', $commonScript, '/tmp/common.sh', '--username', $script:vmUser, '--password', $script:vmPass)
    $r  = & $script:vbox @ua 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Host " WARNING: $r" -ForegroundColor Yellow } else { Write-Host " OK" -ForegroundColor Green }
}

# Upload background image (best-effort)
$bgFileName  = ''
$bgLocalPath = Join-Path $assetsRoot "blue-background.png"
if (Test-Path $bgLocalPath) {
    Write-Host "  Uploading background image..." -NoNewline
    $ua = @('guestcontrol', $script:vmName, 'copyto', $bgLocalPath, '/usr/share/backgrounds/blue-background.png', '--username', $script:vmUser, '--password', $script:vmPass)
    $r  = & $script:vbox @ua 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green; $bgFileName = 'blue-background.png' }
    else { Write-Host " WARNING: could not upload background image" -ForegroundColor Yellow }
}

$steps = @(
    @{ Path = Join-Path $setupRoot 'system-prep.sh';    Args = $LoginUser },
    @{ Path = Join-Path $setupRoot 'network-config.sh'; Args = $Hostname },
    @{ Path = Join-Path $setupRoot 'selinux-config.sh'; Args = '' },
    @{ Path = Join-Path $setupRoot 'desktop-config.sh'; Args = "$LoginUser $bgFileName".Trim() },
    @{ Path = Join-Path $setupRoot 'utilities.sh';      Args = '' }
)

foreach ($step in $steps) {
    if (-not (Test-Path $step.Path)) {
        Write-Host "  SKIPPED (not found): $($step.Path)" -ForegroundColor Yellow
        continue
    }
    Write-Header (Split-Path $step.Path -Leaf)
    $ok = Invoke-GuestUploadAndRun -LocalPath $step.Path -ScriptArgs $step.Args
    if (-not $ok) {
        Write-Host ""
        Write-Host "  ERROR: base setup failed at $(Split-Path $step.Path -Leaf)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "  Base setup complete. Reboot the VM to apply all changes." -ForegroundColor Green
exit 0
