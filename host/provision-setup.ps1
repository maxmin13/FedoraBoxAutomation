#Requires -Version 5.1
<#
.SYNOPSIS
    Runs the full VM base setup (system-prep, network-config, selinux-config,
    desktop-config, utilities) non-interactively via guestcontrol.
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
    powershell -ExecutionPolicy Bypass -File ".\provision-setup.ps1" `
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
if ([string]::IsNullOrWhiteSpace($Hostname) -and -not $NonInteractive) {
    $Hostname = (Read-Host "VM hostname (leave blank to skip)").Trim()
}

$script:vmName = $VmName
$script:vmUser = $VmUser
$script:vmPass = $VmPass

$projectRoot = Split-Path $PSScriptRoot -Parent
$setupRoot   = Join-Path $projectRoot "vm\setup"
$assetsRoot  = Join-Path $projectRoot "assets"

# Upload vm/lib/common.sh so guest scripts can source it
Copy-GuestCommonSh -ProjectRoot $projectRoot

# Upload background image (best-effort)
$bgFileName  = ''
$bgLocalPath = Join-Path $assetsRoot "blue-background.png"
if (Test-Path $bgLocalPath) {
    Write-Host "  Uploading background image..." -NoNewline
    $ua = @('guestcontrol', $script:vmName, 'copyto', $bgLocalPath,
            '/usr/share/backgrounds/blue-background.png',
            '--username', $script:vmUser, '--password', $script:vmPass)
    $ErrorActionPreference = 'SilentlyContinue'
    & $script:vbox @ua 2>&1 | Out-Null
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -eq 0) { Write-Host " OK" -ForegroundColor Green; $bgFileName = 'blue-background.png' }
    else             { Write-Host " WARNING: could not upload background image" -ForegroundColor Yellow }
}

$steps = [System.Collections.Generic.List[hashtable]]::new()
$steps.Add(@{ Path = Join-Path $setupRoot 'system-prep.sh';    Args = $LoginUser })
if (-not [string]::IsNullOrWhiteSpace($Hostname)) {
    $steps.Add(@{ Path = Join-Path $setupRoot 'network-config.sh'; Args = $Hostname })
}
$steps.Add(@{ Path = Join-Path $setupRoot 'selinux-config.sh'; Args = '' })
$steps.Add(@{ Path = Join-Path $setupRoot 'desktop-config.sh'; Args = "$LoginUser $bgFileName".Trim() })
$steps.Add(@{ Path = Join-Path $setupRoot 'utilities.sh';      Args = '' })

foreach ($step in $steps) {
    if (-not (Test-Path $step.Path)) {
        Write-Host "  SKIPPED (not found): $($step.Path)" -ForegroundColor Yellow
        continue
    }
    Write-Header (Split-Path $step.Path -Leaf)
    $exitCode = Invoke-GuestScript -LocalPath $step.Path -ScriptArgs $step.Args
    if ($exitCode -ne 0) {
        Write-Host ""
        Write-Host "  ERROR: base setup failed at $(Split-Path $step.Path -Leaf)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "  Base setup complete. Reboot the VM to apply all changes." -ForegroundColor Green
exit 0
