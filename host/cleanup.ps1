#Requires -Version 5.1
<#
.SYNOPSIS
    Removes failed VMs and cleans up stale inaccessible VM registrations from VirtualBox.

.DESCRIPTION
    Performs two cleanup steps:
      1. Unregisters and deletes the named failed VM (Fedora-44) including its disk files.
      2. Unregisters all inaccessible VMs whose configuration files are already missing,
         so they no longer clutter the VirtualBox Manager list.

    ISO files are not affected by this script.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\cleanup.ps1"
#>

$ErrorActionPreference = 'Stop'

try {
# Unregister and delete the failed VM
$vmName = "Fedora-44"
$vboxManage = "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"

$vmList = & $vboxManage list vms 2>$null
if ($vmList -match [regex]::Escape("`"$vmName`"")) {
    try {
        & $vboxManage unregistervm $vmName --delete
        Write-Host "VM '$vmName' deleted." -ForegroundColor Green
    } catch {
        Write-Host "Failed to delete VM '$vmName': $_" -ForegroundColor Red
    }
} else {
    Write-Host "VM '$vmName' not found, skipping." -ForegroundColor Yellow
}

# Remove stale inaccessible VM registrations (files already gone)
Write-Host ""
Write-Host "Checking for inaccessible VMs..." -ForegroundColor Cyan
$inaccessible = & $vboxManage list vms 2>$null | Where-Object { $_ -match '^"<inaccessible>"' }
if ($inaccessible) {
    foreach ($entry in $inaccessible) {
        if ($entry -match '\{([^}]+)\}') {
            $uuid = $Matches[1]
            try {
                & $vboxManage unregistervm $uuid 2>$null
                Write-Host "  Removed inaccessible VM {$uuid}." -ForegroundColor Green
            } catch {
                Write-Host "  Failed to remove {$uuid}: $_" -ForegroundColor Red
            }
        }
    }
} else {
    Write-Host "  No inaccessible VMs found." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Cleanup complete." -ForegroundColor Green
} catch {
    Write-Host "ERROR: Cleanup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
