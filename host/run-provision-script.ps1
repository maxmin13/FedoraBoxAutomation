#Requires -Version 5.1
<#
.SYNOPSIS
    Uploads and runs a single guest script inside a running VM via guestcontrol.
.PARAMETER VmName
    Name of the registered VirtualBox VM.
.PARAMETER VmUser
    Username for guestcontrol authentication (typically root).
.PARAMETER VmPass
    Password for guestcontrol authentication.
.PARAMETER LoginUser
    Desktop login username (used by scripts that configure user home directories).
.PARAMETER ScriptRelPath
    Path to the script relative to the vm/ directory (e.g. setup/guest-additions.sh).
.PARAMETER ScriptArgs
    Arguments to pass to the script.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\run-provision-script.ps1" `
        -VmName FedoraBox -VmUser root -VmPass secret -LoginUser maxmin `
        -ScriptRelPath setup/guest-additions.sh -NonInteractive
#>
param(
    [string]$VmName        = '',
    [string]$VmUser        = '',
    [string]$VmPass        = '',
    [string]$LoginUser     = '',
    [string]$ScriptRelPath = '',
    [string]$ScriptArgs    = '',
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common.ps1"

# Converts raw 2>&1 output (mix of strings and ErrorRecord objects) to a
# plain string and maps known VBoxManage errors to friendly sentences.
function Get-VBoxErrMsg {
    param([object[]]$Output)
    $text = ($Output | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { [string]$_ }
    }) -join ' '
    if ($text -match 'current status is: starting') {
        return 'Guest Additions are not yet ready - start the VM, wait 30 seconds, then try again'
    }
    if ($text -match 'VERR_DUPLICATE') {
        return 'A previous guest session is still active - wait a few seconds and try again'
    }
    if ($text -match 'VERR_AUTHENTICATION_FAILURE|authentication failure') {
        return 'Wrong username or password'
    }
    return $text
}

$script:vbox = Find-VBoxManage
if (-not $script:vbox) {
    Write-Host "ERROR: VBoxManage.exe not found. Is VirtualBox installed?" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($VmName))        { $VmName        = (Read-Host "VM name").Trim() }
if ([string]::IsNullOrWhiteSpace($VmUser))         { $VmUser        = (Read-Host "VM root username").Trim() }
if ([string]::IsNullOrWhiteSpace($VmPass))         { $VmPass        = (Read-Host "VM root password") }
if ([string]::IsNullOrWhiteSpace($ScriptRelPath))  { $ScriptRelPath = (Read-Host "Script relative path (e.g. setup/guest-additions.sh)").Trim() }

$script:vmName = $VmName
$script:vmUser = $VmUser
$script:vmPass = $VmPass

$projectRoot = Split-Path $PSScriptRoot -Parent
$localPath   = Join-Path $projectRoot "vm\$ScriptRelPath"

if (-not (Test-Path $localPath)) {
    Write-Host "ERROR: Script not found: $localPath" -ForegroundColor Red
    exit 1
}

# Upload common.sh so guest scripts can source it
$commonScript = Join-Path $projectRoot "vm\lib\common.sh"
if (Test-Path $commonScript) {
    Write-Host "  Uploading common.sh..." -NoNewline
    $ua = @('guestcontrol', $script:vmName, 'copyto', $commonScript, '/tmp/common.sh', '--username', $script:vmUser, '--password', $script:vmPass)
    $ErrorActionPreference = 'SilentlyContinue'
    $r  = & $script:vbox @ua 2>&1
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) {
        Write-Host " WARNING: $(Get-VBoxErrMsg $r)" -ForegroundColor Yellow
    } else { Write-Host " OK" -ForegroundColor Green }
}

# Upload the target script
$fileName  = [System.IO.Path]::GetFileName($localPath)
$guestPath = "/tmp/$fileName"

Write-Host "  Uploading $fileName..." -NoNewline
$uploadArgs = @('guestcontrol', $script:vmName, 'copyto', $localPath, $guestPath, '--username', $script:vmUser, '--password', $script:vmPass)
$ErrorActionPreference = 'SilentlyContinue'
$result = & $script:vbox @uploadArgs 2>&1
$ErrorActionPreference = 'Stop'
if ($LASTEXITCODE -ne 0) {
    Write-Host " FAILED" -ForegroundColor Red
    Write-Host "  ERROR: $(Get-VBoxErrMsg $result)" -ForegroundColor Red
    exit 1
}
Write-Host " OK" -ForegroundColor Green

# Strip CRLF and chmod +x
$ErrorActionPreference = 'SilentlyContinue'
& $script:vbox guestcontrol $script:vmName run --exe /bin/bash `
    --username $script:vmUser --password $script:vmPass `
    --wait-stdout --wait-stderr `
    -- -c "sed -i 's/\r//' $guestPath && chmod +x $guestPath" 2>&1 | Out-Null
$ErrorActionPreference = 'Stop'

# Build command (root runs directly; other users prefix with sudo)
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

$result | ForEach-Object {
    $line = if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message } else { [string]$_ }
    Write-Host $line
}

if ($exitCode -ne 0) {
    Write-Host "  ERROR: Script exited with code $exitCode" -ForegroundColor Red
}

exit $exitCode
