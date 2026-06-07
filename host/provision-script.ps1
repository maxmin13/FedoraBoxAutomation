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
    powershell -ExecutionPolicy Bypass -File ".\provision-script.ps1" `
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

$script:vbox = Find-VBoxManage
if (-not $script:vbox) {
    Write-Host "ERROR: VBoxManage.exe not found. Is VirtualBox installed?" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($VmName))       { $VmName        = (Read-Host "VM name").Trim() }
if ([string]::IsNullOrWhiteSpace($VmUser)) {
    if ($NonInteractive) { Write-Host "ERROR: VM root username is required."; exit 1 }
    $VmUser = (Read-Host "VM root username").Trim()
}
if ([string]::IsNullOrWhiteSpace($VmPass)) {
    if ($NonInteractive) { Write-Host "ERROR: VM root password is required."; exit 1 }
    $VmPass = (Read-Host "VM root password")
}
if ([string]::IsNullOrWhiteSpace($ScriptRelPath)) { $ScriptRelPath = (Read-Host "Script relative path (e.g. setup/guest-additions.sh)").Trim() }

$script:vmName = $VmName
$script:vmUser = $VmUser
$script:vmPass = $VmPass

$projectRoot = Split-Path $PSScriptRoot -Parent
$localPath   = Join-Path $projectRoot "vm\$ScriptRelPath"

if (-not (Test-Path $localPath)) {
    Write-Host "ERROR: Script not found: $localPath" -ForegroundColor Red
    exit 1
}

# Upload vm/lib/common.sh so guest scripts can source it
Copy-GuestCommonSh -ProjectRoot $projectRoot

$label    = [System.IO.Path]::GetFileNameWithoutExtension($localPath)
$exitCode = Invoke-GuestScript -LocalPath $localPath -ScriptArgs $ScriptArgs -Label $label
exit $exitCode
