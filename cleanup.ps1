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

Write-Host ""
Write-Host "Cleanup complete." -ForegroundColor Green
} catch {
    Write-Host "ERROR: Cleanup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
