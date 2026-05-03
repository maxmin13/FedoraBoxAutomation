#Requires -Version 5.1
<#
.SYNOPSIS
    Uploads a file to a running VirtualBox VM.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\Send-FileToVM.ps1"
#>

$ErrorActionPreference = 'Stop'

# --- Helpers ------------------------------------------------------------------

function Write-Header {
    param([string]$Text)
    $line = "-" * 60
    Write-Host ""
    Write-Host $line -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host $line -ForegroundColor Cyan
}

function Find-VBoxManage {
    $candidates = @(
        "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe",
        "C:\Program Files (x86)\Oracle\VirtualBox\VBoxManage.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    $found = Get-Command "VBoxManage.exe" -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    return $null
}

# --- Check VBoxManage ---------------------------------------------------------

try {

Write-Header "Send File to VirtualBox VM"

$vbox = Find-VBoxManage
if (-not $vbox) {
    Write-Host "  ERROR: VBoxManage.exe not found. Is VirtualBox installed?" -ForegroundColor Red
    exit 1
}
Write-Host "  VBoxManage: $vbox" -ForegroundColor DarkGray

# --- Prompt: VM name ----------------------------------------------------------

Write-Host ""
$runningVMs = & $vbox list runningvms 2>$null
if ($runningVMs) {
    Write-Host "  Running VMs:" -ForegroundColor DarkGray
    $runningVMs | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
} else {
    Write-Host "  WARNING: No running VMs found. Make sure the VM is started." -ForegroundColor Yellow
}

Write-Host ""
$vmName = (Read-Host "VM name").Trim()
if ([string]::IsNullOrWhiteSpace($vmName)) {
    Write-Host "  ERROR: VM name cannot be empty." -ForegroundColor Red
    exit 1
}

# --- Prompt: credentials ------------------------------------------------------

$vmUser = (Read-Host "Guest username").Trim()
$vmPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR(
        (Read-Host "Guest password" -AsSecureString)))

# --- Prompt: local file -------------------------------------------------------

$defaultFile = Join-Path $PSScriptRoot "scripts\install-java.sh"
Write-Host ""
Write-Host "  Default file: $defaultFile" -ForegroundColor DarkGray
$localPath = (Read-Host "Local file to upload [default: $defaultFile]").Trim()
if ([string]::IsNullOrWhiteSpace($localPath)) { $localPath = $defaultFile }

if (-not (Test-Path $localPath)) {
    Write-Host "  ERROR: File not found: $localPath" -ForegroundColor Red
    exit 1
}

# --- Prompt: destination path -------------------------------------------------

$fileName    = [System.IO.Path]::GetFileName($localPath)
$defaultDest = "/tmp/$fileName"
$guestPath   = (Read-Host "Destination path in VM [default: $defaultDest]").Trim()
if ([string]::IsNullOrWhiteSpace($guestPath)) { $guestPath = $defaultDest }

# --- Upload -------------------------------------------------------------------

Write-Header "Uploading..."

Write-Host "  From : $localPath"
Write-Host "  To   : ${vmName}:${guestPath}"
Write-Host ""

$uploadArgs = @(
    "guestcontrol", $vmName,
    "copyto", $localPath, $guestPath,
    "--username", $vmUser,
    "--password", $vmPass
)

$result = & $vbox @uploadArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  FAILED" -ForegroundColor Red
    Write-Host "  $result" -ForegroundColor Red
    exit 1
}

Write-Host "  Upload OK" -ForegroundColor Green

# --- Make executable ----------------------------------------------------------

Write-Host "  Setting executable permission..." -NoNewline

$chmodArgs = @(
    "guestcontrol", $vmName,
    "run", "--exe", "/bin/bash",
    "--username", $vmUser,
    "--password", $vmPass,
    "--wait-stdout", "--wait-stderr",
    "--", "-c", "chmod +x $guestPath"
)

$result2 = & $vbox @chmodArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host " FAILED" -ForegroundColor Yellow
    Write-Host "  $result2" -ForegroundColor Yellow
    Write-Host "  Run manually inside the VM: chmod +x $guestPath" -ForegroundColor Yellow
} else {
    Write-Host " OK" -ForegroundColor Green
}

# --- Done ---------------------------------------------------------------------

Write-Host ""
Write-Host "  File uploaded to: $guestPath" -ForegroundColor Green
Write-Host "  Run it inside the VM with:" -ForegroundColor Cyan
Write-Host "    sudo $guestPath <args>" -ForegroundColor White
Write-Host ""
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
