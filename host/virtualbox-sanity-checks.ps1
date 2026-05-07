# ============================================================
#  VirtualBox Requirements Checker for Windows 11 Home
#  Run in PowerShell as Administrator for best results
# ============================================================

$ErrorActionPreference = 'Stop'

$pass = "[PASS]"
$fail = "[FAIL]"
$warn = "[WARN]"
$sep  = "=" * 55

try {

Write-Host ""
Write-Host $sep
Write-Host "   VirtualBox Requirements Checker - Windows 11 Home"
Write-Host $sep

# ── 1. OS VERSION ────────────────────────────────────────────
Write-Host "`n[1] Operating System"
$os = Get-CimInstance Win32_OperatingSystem
$osName    = $os.Caption
$osBuild   = $os.BuildNumber
$osArch    = $os.OSArchitecture

Write-Host "    OS      : $osName"
Write-Host "    Build   : $osBuild"
Write-Host "    Arch    : $osArch"

if ($osArch -like "*64*") {
    Write-Host "    $pass 64-bit OS detected (required)"
} else {
    Write-Host "    $fail 32-bit OS detected. VirtualBox requires 64-bit Windows."
}

# ── 2. RAM ───────────────────────────────────────────────────
Write-Host "`n[2] RAM (Memory)"
$ramBytes = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
$ramGB    = [math]::Round($ramBytes / 1GB, 2)
Write-Host "    Total RAM : $ramGB GB"

if ($ramGB -ge 8) {
    Write-Host "    $pass Sufficient RAM (8 GB+ recommended)"
} elseif ($ramGB -ge 4) {
    Write-Host "    $warn RAM is $ramGB GB. VirtualBox works but 8 GB+ is recommended."
} else {
    Write-Host "    $fail Only $ramGB GB RAM. Minimum 4 GB required; 8 GB+ recommended."
}

# ── 3. DISK SPACE ────────────────────────────────────────────
Write-Host "`n[3] Disk Space (C: Drive)"
$disk      = Get-PSDrive C
$freeGB    = [math]::Round($disk.Free / 1GB, 2)
$totalGB   = [math]::Round(($disk.Used + $disk.Free) / 1GB, 2)
Write-Host "    Free Space  : $freeGB GB"
Write-Host "    Total Space : $totalGB GB"

if ($freeGB -ge 30) {
    Write-Host "    $pass Enough free disk space (30 GB+ recommended)"
} elseif ($freeGB -ge 10) {
    Write-Host "    $warn $freeGB GB free. VirtualBox installs but VMs need more space."
} else {
    Write-Host "    $fail Only $freeGB GB free. Please free up space before installing."
}

# ── 4. CPU VIRTUALISATION ────────────────────────────────────
Write-Host "`n[4] CPU Virtualisation"
$cpu = Get-CimInstance Win32_Processor
Write-Host "    CPU : $($cpu.Name)"

# Method 1: WMI (unreliable on some newer CPUs)
$vmxEnabled = $cpu.VirtualizationFirmwareEnabled

# Method 2: systeminfo (more reliable)
$sysinfo = systeminfo | Select-String "Virtualization Enabled In Firmware"
$sysinfoEnabled = $sysinfo -match "Yes"

if ($vmxEnabled -or $sysinfoEnabled) {
    Write-Host "    $pass Hardware Virtualisation is ENABLED in BIOS/UEFI"
} else {
    Write-Host "    $fail Hardware Virtualisation is DISABLED."
    Write-Host "         Fix: Restart PC -> Enter BIOS/UEFI -> Enable Intel VT-x or AMD-V"
    Write-Host "         Note: If Task Manager (Performance > CPU) shows Enabled, ignore this."
}

# ── 5. HYPER-V ───────────────────────────────────────────────
Write-Host "`n[5] Hyper-V (Conflict Check)"
$hyperv = Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -ErrorAction SilentlyContinue
if ($hyperv -and $hyperv.State -eq "Enabled") {
    Write-Host "    $warn Hyper-V is ENABLED. This can conflict with VirtualBox."
    Write-Host "         Fix: Run as Admin → 'Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All'"
} else {
    Write-Host "    $pass Hyper-V is not enabled (no conflict)"
}

# ── 6. WINDOWS HYPERVISOR PLATFORM ──────────────────────────
Write-Host "`n[6] Windows Hypervisor Platform"
$whp = Get-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -ErrorAction SilentlyContinue
if ($whp -and $whp.State -eq "Enabled") {
    Write-Host "    $warn Windows Hypervisor Platform is ENABLED."
    Write-Host "         This may conflict with VirtualBox 6.x but is OK for VirtualBox 7+"
} else {
    Write-Host "    $pass Windows Hypervisor Platform is not enabled"
}

# ── 7. VIRTUAL MACHINE PLATFORM ─────────────────────────────
Write-Host "`n[7] Virtual Machine Platform (WSL2)"
$vmp = Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -ErrorAction SilentlyContinue
if ($vmp -and $vmp.State -eq "Enabled") {
    Write-Host "    $warn Virtual Machine Platform (WSL2) is ENABLED."
    Write-Host "         May conflict with older VirtualBox. Use VirtualBox 7+ to avoid issues."
} else {
    Write-Host "    $pass Virtual Machine Platform is not enabled"
}

# ── 8. SECURE BOOT ───────────────────────────────────────────
Write-Host "`n[8] Secure Boot"
try {
    $sb = Confirm-SecureBootUEFI -ErrorAction Stop
    if ($sb) {
        Write-Host "    $warn Secure Boot is ENABLED."
        Write-Host "         VirtualBox 7+ supports Secure Boot. Older versions may have issues."
    } else {
        Write-Host "    $pass Secure Boot is disabled (no issue)"
    }
} catch {
    Write-Host "    $warn Could not detect Secure Boot status (may need Admin rights)"
}

# ── 9. EXISTING VIRTUALBOX ───────────────────────────────────
Write-Host "`n[9] Existing VirtualBox Installation"
$vbox = Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* `
        -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "*VirtualBox*" }
if ($vbox) {
    Write-Host "    $warn VirtualBox is already installed: $($vbox.DisplayName) $($vbox.DisplayVersion)"
} else {
    Write-Host "    $pass No existing VirtualBox installation found"
}

# ── SUMMARY ──────────────────────────────────────────────────
Write-Host ""
Write-Host $sep
Write-Host "   SUMMARY"
Write-Host $sep
Write-Host ""
Write-Host ""
Write-Host "SUMMARY"
Write-Host ""
Write-Host "  If all items show PASS you are ready to install VirtualBox."
Write-Host "  Fix any FAIL items before installing."
Write-Host "  WARN items are warnings - review but may not block installation."
Write-Host ""
Write-Host "  Download VirtualBox from: virtualbox.org"
Write-Host ""
} catch {
    Write-Host "`n[ERROR] Sanity check failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
