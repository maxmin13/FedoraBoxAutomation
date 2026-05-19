# ============================================================
#  VirtualBox Requirements Checker for Windows 11 Home
#  Run in PowerShell as Administrator for best results.
#
#  Usage:
#    .\virtualbox-sanity-checks.ps1          # human-readable output
#    .\virtualbox-sanity-checks.ps1 -Json    # JSON array for the GUI
# ============================================================

param(
    # When set, the script writes a JSON array to stdout instead of coloured text.
    # The Electron GUI passes this flag and parses the result.
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

. "$PSScriptRoot\common.ps1"
Start-Log

# Collect all check results in this list.
# Each entry is a hashtable with id, label, status, and detail.
$results = [System.Collections.Generic.List[hashtable]]::new()

# ── Helpers ───────────────────────────────────────────────────────────────────

function Add-Result {
    param(
        [string] $Id,
        [string] $Label,
        [string] $Status,   # 'pass', 'warn', or 'fail'
        [string] $Detail
    )
    $results.Add(@{
        id     = $Id
        label  = $Label
        status = $Status
        detail = $Detail
    })
}

function Write-Check {
    param([string]$Status, [string]$Message)
    if ($Json) { return }
    switch ($Status) {
        'pass' { Write-Host "    [PASS] $Message" -ForegroundColor Green  }
        'warn' { Write-Host "    [WARN] $Message" -ForegroundColor Yellow }
        'fail' { Write-Host "    [FAIL] $Message" -ForegroundColor Red    }
    }
}

function Write-Section {
    param([string]$Title)
    if ($Json) { return }
    Write-Host ""
    Write-Host $Title -ForegroundColor Cyan
}

# ── 1. OS VERSION ─────────────────────────────────────────────────────────────

Write-Section "[1] Operating System"

try {
    $os      = Get-CimInstance Win32_OperatingSystem
    $osName  = $os.Caption
    $osBuild = $os.BuildNumber
    $osArch  = $os.OSArchitecture

    if (-not $Json) {
        Write-Host "    OS    : $osName"
        Write-Host "    Build : $osBuild"
        Write-Host "    Arch  : $osArch"
    }

    if ($osArch -like "*64*") {
        Write-Check 'pass' "64-bit OS detected (required)"
        Add-Result -Id 'os' -Label 'Operating System' -Status 'pass' `
            -Detail "$osName build $osBuild (64-bit)"
    } else {
        Write-Check 'fail' "32-bit OS detected. VirtualBox requires 64-bit Windows."
        Add-Result -Id 'os' -Label 'Operating System' -Status 'fail' `
            -Detail "32-bit OS detected. VirtualBox requires 64-bit Windows."
    }
} catch {
    Add-Result -Id 'os' -Label 'Operating System' -Status 'fail' -Detail "Check failed: $_"
}

# ── 2. RAM ────────────────────────────────────────────────────────────────────

Write-Section "[2] RAM (Memory)"

try {
    $ramBytes   = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
    $ramGB      = [math]::Round($ramBytes / 1GB, 2)
    $osForRam   = Get-CimInstance Win32_OperatingSystem
    $freeRamMB  = [math]::Round($osForRam.FreePhysicalMemory / 1024)
    $totalRamMB = [math]::Round($osForRam.TotalVisibleMemorySize / 1024)
    $usedPct    = [math]::Round((($totalRamMB - $freeRamMB) / $totalRamMB) * 100)

    if (-not $Json) {
        Write-Host "    Total : $ramGB GB"
        Write-Host "    Free  : $freeRamMB MB ($usedPct% in use)"
    }

    $ramStatus  = if ($ramGB -ge 8)        { 'pass' } elseif ($ramGB -ge 4)        { 'warn' } else { 'fail' }
    $freeStatus = if ($freeRamMB -ge 5120) { 'pass' } elseif ($freeRamMB -ge 3072) { 'warn' } else { 'fail' }
    $order      = @{ pass = 0; warn = 1; fail = 2 }
    $status     = if ($order[$freeStatus] -ge $order[$ramStatus]) { $freeStatus } else { $ramStatus }

    $detail = "$ramGB GB total, $freeRamMB MB free ($usedPct% in use)."
    if ($ramGB -lt 8)        { $detail += " 8 GB+ recommended." }
    if ($freeRamMB -lt 5120) { $detail += " Close other apps to free memory before starting a VM." }

    Write-Check $status "RAM: $ramGB GB total, $freeRamMB MB free"
    Add-Result -Id 'ram' -Label 'RAM (Memory)' -Status $status -Detail $detail
} catch {
    Add-Result -Id 'ram' -Label 'RAM (Memory)' -Status 'fail' -Detail "Check failed: $_"
}

# ── 3. DISK SPACE ─────────────────────────────────────────────────────────────

Write-Section "[3] Disk Space (C:)"

try {
    $disk    = Get-PSDrive C
    $freeGB  = [math]::Round($disk.Free / 1GB, 2)
    $totalGB = [math]::Round(($disk.Used + $disk.Free) / 1GB, 2)

    if (-not $Json) {
        Write-Host "    Free  : $freeGB GB"
        Write-Host "    Total : $totalGB GB"
    }

    if ($freeGB -ge 30) {
        Write-Check 'pass' "Enough free disk space ($freeGB GB free)"
        Add-Result -Id 'disk' -Label 'Disk Space (C:)' -Status 'pass' `
            -Detail "$freeGB GB free of $totalGB GB total"
    } elseif ($freeGB -ge 10) {
        Write-Check 'warn' "$freeGB GB free. VMs need at least 30 GB."
        Add-Result -Id 'disk' -Label 'Disk Space (C:)' -Status 'warn' `
            -Detail "$freeGB GB free of $totalGB GB total. 30 GB+ recommended."
    } else {
        Write-Check 'fail' "Only $freeGB GB free. Please free up space."
        Add-Result -Id 'disk' -Label 'Disk Space (C:)' -Status 'fail' `
            -Detail "Only $freeGB GB free. At least 30 GB required for a VM."
    }
} catch {
    Add-Result -Id 'disk' -Label 'Disk Space (C:)' -Status 'fail' -Detail "Check failed: $_"
}

# ── 4. CPU VIRTUALISATION ─────────────────────────────────────────────────────

Write-Section "[4] CPU Virtualisation"

try {
    $cpu = Get-CimInstance Win32_Processor

    if (-not $Json) {
        Write-Host "    CPU   : $($cpu.Name)"
        Write-Host "    Cores : $($cpu.NumberOfCores) physical, $($cpu.NumberOfLogicalProcessors) logical"
    }

    $vmxEnabled     = $cpu.VirtualizationFirmwareEnabled
    $sysinfo        = systeminfo | Select-String "Virtualization Enabled In Firmware"
    $sysinfoEnabled = $sysinfo -match "Yes"

    if ($vmxEnabled -or $sysinfoEnabled) {
        Write-Check 'pass' "Hardware Virtualisation is ENABLED in BIOS/UEFI"
        Add-Result -Id 'cpu' -Label 'CPU Virtualisation' -Status 'pass' `
            -Detail "$($cpu.Name) - $($cpu.NumberOfCores) cores, VT-x/AMD-V enabled"
    } else {
        Write-Check 'warn' "Hardware Virtualisation appears DISABLED - but this check is not always reliable."
        Add-Result -Id 'cpu' -Label 'CPU Virtualisation' -Status 'warn' `
            -Detail "VT-x/AMD-V not detected, but the check may give false negatives. Verify the setting in BIOS/UEFI before concluding it is disabled."
    }
} catch {
    Add-Result -Id 'cpu' -Label 'CPU Virtualisation' -Status 'fail' -Detail "Check failed: $_"
}

# ── 5. HYPER-V ────────────────────────────────────────────────────────────────

Write-Section "[5] Hyper-V"

try {
    $hyperv = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All `
        -ErrorAction SilentlyContinue

    if ($hyperv -and $hyperv.State -eq "Enabled") {
        Write-Check 'warn' "Hyper-V is ENABLED. This can conflict with VirtualBox."
        Add-Result -Id 'hyperv' -Label 'Hyper-V' -Status 'warn' `
            -Detail "Hyper-V is enabled and may conflict with VirtualBox. Disable it and reboot."
    } else {
        Write-Check 'pass' "Hyper-V is not enabled (no conflict)"
        Add-Result -Id 'hyperv' -Label 'Hyper-V' -Status 'pass' -Detail "Not enabled"
    }
} catch {
    Add-Result -Id 'hyperv' -Label 'Hyper-V' -Status 'warn' `
        -Detail "Could not check Hyper-V status (run as Administrator for accurate results)."
}

# ── 6. WINDOWS HYPERVISOR PLATFORM ───────────────────────────────────────────

Write-Section "[6] Windows Hypervisor Platform"

try {
    $whp = Get-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform `
        -ErrorAction SilentlyContinue

    if ($whp -and $whp.State -eq "Enabled") {
        Write-Check 'warn' "Windows Hypervisor Platform is ENABLED. May conflict with VirtualBox 6.x."
        Add-Result -Id 'whp' -Label 'Windows Hypervisor Platform' -Status 'warn' `
            -Detail "Enabled. OK for VirtualBox 7+, may conflict with VirtualBox 6.x."
    } else {
        Write-Check 'pass' "Windows Hypervisor Platform is not enabled"
        Add-Result -Id 'whp' -Label 'Windows Hypervisor Platform' -Status 'pass' -Detail "Not enabled"
    }
} catch {
    Add-Result -Id 'whp' -Label 'Windows Hypervisor Platform' -Status 'warn' `
        -Detail "Could not check Windows Hypervisor Platform status (run as Administrator)."
}

# ── 7. VIRTUAL MACHINE PLATFORM ───────────────────────────────────────────────

Write-Section "[7] Virtual Machine Platform (WSL2)"

try {
    $vmp = Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform `
        -ErrorAction SilentlyContinue

    if ($vmp -and $vmp.State -eq "Enabled") {
        Write-Check 'warn' "Virtual Machine Platform (WSL2) is ENABLED."
        Add-Result -Id 'vmp' -Label 'Virtual Machine Platform (WSL2)' -Status 'warn' `
            -Detail "Enabled. Use VirtualBox 7+ to avoid conflicts."
    } else {
        Write-Check 'pass' "Virtual Machine Platform is not enabled"
        Add-Result -Id 'vmp' -Label 'Virtual Machine Platform (WSL2)' -Status 'pass' -Detail "Not enabled"
    }
} catch {
    Add-Result -Id 'vmp' -Label 'Virtual Machine Platform (WSL2)' -Status 'warn' `
        -Detail "Could not check Virtual Machine Platform status (run as Administrator)."
}

# ── 8. SECURE BOOT ────────────────────────────────────────────────────────────

Write-Section "[8] Secure Boot"

try {
    $sb = Confirm-SecureBootUEFI -ErrorAction Stop
    if ($sb) {
        Write-Check 'warn' "Secure Boot is ENABLED. VirtualBox 7+ supports it; older versions may not."
        Add-Result -Id 'secboot' -Label 'Secure Boot' -Status 'warn' -Detail "Enabled. OK for VirtualBox 7+."
    } else {
        Write-Check 'pass' "Secure Boot is disabled"
        Add-Result -Id 'secboot' -Label 'Secure Boot' -Status 'pass' -Detail "Disabled"
    }
} catch {
    Write-Check 'warn' "Could not detect Secure Boot status (may need Admin rights)"
    Add-Result -Id 'secboot' -Label 'Secure Boot' -Status 'warn' `
        -Detail "Could not detect status. Run as Administrator for accurate results."
}

# ── 9. VIRTUALBOX INSTALLATION ────────────────────────────────────────────────

Write-Section "[9] VirtualBox Installation"

try {
    $vbox = Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* `
            -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like "*VirtualBox*" }

    if ($vbox) {
        $vboxVersion  = $vbox.DisplayVersion
        $majorVersion = [int]($vboxVersion -split '\.')[0]
        if ($majorVersion -ge 7) {
            Write-Check 'pass' "VirtualBox $vboxVersion is installed (7.0+ recommended)"
            Add-Result -Id 'vboxinst' -Label 'VirtualBox' -Status 'pass' `
                -Detail "VirtualBox $vboxVersion installed"
        } else {
            Write-Check 'warn' "VirtualBox $vboxVersion is installed. Version 7.0+ is recommended."
            Add-Result -Id 'vboxinst' -Label 'VirtualBox' -Status 'warn' `
                -Detail "VirtualBox $vboxVersion installed. Version 7.0+ is recommended for best compatibility."
        }
    } else {
        Write-Check 'fail' "VirtualBox is not installed."
        Add-Result -Id 'vboxinst' -Label 'VirtualBox' -Status 'fail' -Detail "Not installed."
    }
} catch {
    Add-Result -Id 'vboxinst' -Label 'VirtualBox' -Status 'fail' -Detail "Check failed: $_"
}

# ── 10. POWERSHELL VERSION ────────────────────────────────────────────────────

Write-Section "[10] PowerShell Version"

try {
    $psVersion = $PSVersionTable.PSVersion
    $psMajor   = $psVersion.Major
    $psMinor   = $psVersion.Minor

    if ($psMajor -ge 5 -and ($psMajor -gt 5 -or $psMinor -ge 1)) {
        Write-Check 'pass' "PowerShell $psVersion (5.1+ required)"
        Add-Result -Id 'posh' -Label 'PowerShell Version' -Status 'pass' `
            -Detail "PowerShell $psVersion"
    } else {
        Write-Check 'fail' "PowerShell $psVersion is too old. Version 5.1+ is required."
        Add-Result -Id 'posh' -Label 'PowerShell Version' -Status 'fail' `
            -Detail "PowerShell $psVersion. Version 5.1+ required."
    }
} catch {
    Add-Result -Id 'posh' -Label 'PowerShell Version' -Status 'fail' -Detail "Check failed: $_"
}

# ── OUTPUT ────────────────────────────────────────────────────────────────────

if ($Json) {
    # @() forces an array even when $results has exactly one entry —
    # ConvertTo-Json would otherwise output a bare object {} instead of [{}].
    @($results) | ConvertTo-Json -Depth 3
} else {
    $sep = "=" * 55
    Write-Host ""
    Write-Host $sep
    Write-Host "   SUMMARY"
    Write-Host $sep
    Write-Host ""
    Write-Host "  PASS = ready  |  WARN = review  |  FAIL = fix before continuing"
    Write-Host ""
}

