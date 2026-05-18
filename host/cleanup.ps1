#Requires -Version 5.1
<#
.SYNOPSIS
    Removes failed VMs and cleans up stale inaccessible VM registrations from VirtualBox.

.DESCRIPTION
    Performs two cleanup steps:
      1. Unregisters and deletes the named VM including its disk files.
      2. Unregisters all inaccessible VMs whose configuration files are already missing,
         so they no longer clutter the VirtualBox Manager list.

    ISO files are not affected by this script.

.PARAMETER VmName
    Name of the VM to delete. When supplied the interactive prompt is skipped.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\cleanup.ps1"
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\cleanup.ps1" -VmName "Fedora-44"
#>
param(
    [string]$VmName = ''
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common.ps1"
Start-Log

try {
    Write-Header "VirtualBox Cleanup"

    $script:vbox = Find-VBoxManage
    if (-not $script:vbox) { Write-Host "  ERROR: VBoxManage.exe not found." -ForegroundColor Red; exit 1 }
    Write-Host "  VBoxManage: $script:vbox" -ForegroundColor DarkGray

    $registeredVms = & $script:vbox list vms 2>$null | ForEach-Object { if ($_ -match '"(.+)"') { $Matches[1] } }

    if ([string]::IsNullOrWhiteSpace($VmName)) {
        if ($registeredVms) {
            Write-Host ""
            Write-Host "  Registered VMs:" -ForegroundColor DarkGray
            $registeredVms | ForEach-Object { Write-Host "    - $_" -ForegroundColor DarkGray }
        }
        while ($true) {
            Write-Host ""
            $vmName = (Read-Host "VM name to delete").Trim()
            if ([string]::IsNullOrWhiteSpace($vmName)) { Write-Host "  VM name cannot be empty." -ForegroundColor Yellow; continue }
            break
        }
    } else {
        $vmName = $VmName.Trim()
        Write-Host "  VM name: $vmName" -ForegroundColor DarkGray
    }

    $vmList = & $script:vbox list vms 2>$null
    if ($vmList -match [regex]::Escape("`"$vmName`"")) {
        try {
            & $script:vbox unregistervm $vmName --delete
            Write-Host "  VM '$vmName' deleted." -ForegroundColor Green
        } catch {
            Write-Host "  Failed to delete VM '$vmName': $_" -ForegroundColor Red
        }
    } else {
        Write-Host "  VM '$vmName' not found, skipping." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "  Checking for inaccessible VMs..." -ForegroundColor Cyan
    $inaccessible = & $script:vbox list vms 2>$null | Where-Object { $_ -match '^"<inaccessible>"' }
    if ($inaccessible) {
        foreach ($entry in $inaccessible) {
            if ($entry -match '\{([^}]+)\}') {
                $uuid = $Matches[1]
                try {
                    & $script:vbox unregistervm $uuid 2>$null
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
    Write-Host "  Cleanup complete." -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Cleanup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Stop-Transcript | Out-Null
}
