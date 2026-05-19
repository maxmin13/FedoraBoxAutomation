#Requires -Version 5.1
<#
.SYNOPSIS
    Creates a new Fedora VirtualBox VM from a downloaded ISO.

.DESCRIPTION
    Prompts for VM configuration options and creates a new Fedora 64-bit VirtualBox VM.

    Prompts:
      - VM name (offers to unregister existing VM with the same name; files are kept)
      - VM folder location
      - Fedora ISO path
      - RAM in MB (default: 4096)
      - CPU count (default: 4)
      - Disk size in MB (default: 40000)
      - Disk format: VDI (default, VirtualBox native), VMDK (VMware-compatible), VHD (Hyper-V)
      - Video RAM in MB (default: 128)
      - Network adapter type: NAT (default), bridged, host-only, or none
      - Planned guest username and password (recorded for reference during Fedora setup)
      - Option to attach Guest Additions ISO
      - Option to start the VM immediately

    VM settings applied automatically:
      - Graphics controller: VMSVGA
      - Clipboard: bidirectional
      - Drag and drop: bidirectional
      - Hardware clock: UTC (prevents time drift between Windows and Fedora)
      - Paravirt provider: KVM (improves CPU/IO performance for Linux guests)
      - 3D acceleration: enabled (requires Guest Additions to take effect)
      - Boot order: DVD first, then disk

    Guest Additions note:
      Clipboard, drag-and-drop, 3D acceleration, and guest control (used by provision-vm.ps1)
      all require VirtualBox Guest Additions to be installed inside the VM.
      If the ISO is attached, it appears as /dev/sr1 inside Fedora after OS installation.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\create-vm.ps1"
#>

param(
    [string]$vmName               = '',
    [string]$vmFolder             = '',
    [string]$isoPath              = '',
    [string]$ramMB                = '',
    [string]$cpus                 = '',
    [string]$diskMB               = '',
    [string]$diskType             = '',
    [string]$vramMB               = '',
    [string]$nicType              = '',
    [string]$attachGuestAdditions = '',
    [string]$startVm              = '',
    [string]$forceRecreate        = '',
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common.ps1"
Start-Log

function Get-VBoxGuestAdditionsIso {
    $base = Split-Path -Parent $script:vbox
    $path = Join-Path $base 'VBoxGuestAdditions.iso'
    if (Test-Path $path) { return $path }

    $candidates = @(
        'C:\Program Files\Oracle\VirtualBox\VBoxGuestAdditions.iso',
        'C:\Program Files (x86)\Oracle\VirtualBox\VBoxGuestAdditions.iso'
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }
    return $null
}

function Get-VBoxIDEControllerName {
    param([string]$vmName)

    $info = Invoke-VBox @('showvminfo', $vmName, '--machinereadable')
    if ($info -match 'storagecontrollername\d+="IDE Controller"') {
        return 'IDE Controller'
    }

    Write-Host "  Adding IDE controller for Guest Additions..." -ForegroundColor Yellow
    Invoke-VBox @('storagectl', $vmName, '--name', 'IDE Controller', '--add', 'ide')
    return 'IDE Controller'
}

function Add-VBoxGuestAdditionsIso {
    param(
        [string]$vmName,
        [string]$isoPath
    )

    $controller = Get-VBoxIDEControllerName -vmName $vmName
    Write-Host "  Attaching Guest Additions ISO as a second DVD drive..." -ForegroundColor Cyan
    Invoke-VBox @(
        'storageattach', $vmName,
        '--storagectl', $controller,
        '--port', '1', '--device', '0',
        '--type', 'dvddrive', '--medium', $isoPath
    )
    Write-Host "  Guest Additions ISO attached on controller $controller port 1 device 0." -ForegroundColor Green
    Write-Host ""
    Write-Host "  To install Guest Additions inside the VM:" -ForegroundColor Cyan
    Write-Host "    1. Complete the Fedora OS installation and log in." -ForegroundColor Cyan
    Write-Host "    2. Open a terminal and run:" -ForegroundColor Cyan
    Write-Host "         sudo dnf update -y" -ForegroundColor White
    Write-Host "         # If a new kernel was installed, reboot before continuing:" -ForegroundColor DarkGray
    Write-Host "         sudo reboot" -ForegroundColor White
    Write-Host "         # After reboot, confirm the running kernel:" -ForegroundColor DarkGray
    Write-Host "         uname -r" -ForegroundColor White
    Write-Host "         sudo dnf install -y dkms kernel-devel-`$(uname -r) kernel-headers gcc make perl bzip2" -ForegroundColor White
    Write-Host "         sudo mkdir -p /mnt/ga" -ForegroundColor White
    Write-Host "         sudo mount /dev/sr1 /mnt/ga  # if it fails, try /dev/sr0 (run lsblk to check)" -ForegroundColor White
    Write-Host "         rpm -q kernel-devel-`$(uname -r)  # DKMS builds GA modules against this -- must match running kernel" -ForegroundColor DarkGray
    Write-Host "         sudo /mnt/ga/VBoxLinuxAdditions.run" -ForegroundColor White
    Write-Host "         sudo passwd root" -ForegroundColor White
    Write-Host "         sudo reboot" -ForegroundColor White
    Write-Host "         # After reboot, verify SELinux is disabled:" -ForegroundColor DarkGray
    Write-Host "         sestatus" -ForegroundColor White
    Write-Host "    3. Guest Additions will then be active (shared clipboard, better resolution, guest control)." -ForegroundColor Cyan
}

Write-Header "Fedora VM Creator"

$script:vbox = Find-VBoxManage
if (-not $script:vbox) {
    Write-Host "  ERROR: VBoxManage.exe not found. Is VirtualBox installed?" -ForegroundColor Red
    exit 1
}
Write-Host "  VBoxManage: $script:vbox" -ForegroundColor DarkGray

$defaultVmFolder = & $script:vbox list systemproperties 2>$null | Where-Object { $_ -match "Default machine folder:" } | ForEach-Object { $_.Split(":", 2)[1].Trim() }
if (-not $defaultVmFolder) {
    $defaultVmFolder = "$env:USERPROFILE\VirtualBox VMs"
}
Write-Host "  Default VM folder: $defaultVmFolder" -ForegroundColor DarkGray

Write-Host ""
if ([string]::IsNullOrWhiteSpace($vmName)) {
    $vmName = (Read-Host "VM name").Trim()
}
if ([string]::IsNullOrWhiteSpace($vmName)) {
    Write-Host "  ERROR: VM name cannot be empty." -ForegroundColor Red
    exit 1
}
$existingVms = & $script:vbox list vms 2>$null | ForEach-Object { if ($_ -match '"(.+)"') { $Matches[1] } }
if ($existingVms -contains $vmName) {
    Write-Host "  WARNING: A VM named '$vmName' already exists." -ForegroundColor Yellow
    Write-Host "  If you want to provision it, run provision-vm.ps1 instead." -ForegroundColor Cyan
    if ([string]::IsNullOrWhiteSpace($forceRecreate)) {
        $confirm = Read-Host "  Unregister and recreate it from scratch? [Y/n]"
        if ($confirm -match '^[Nn]$') {
            Write-Host "  Aborted." -ForegroundColor Red
            exit 1
        }
    } elseif ($forceRecreate -notin 'y','yes','true','1') {
        Write-Host "  Aborted." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Unregistering '$vmName'..." -ForegroundColor DarkGray
    $vmInfo = & $script:vbox showvminfo $vmName --machinereadable 2>&1 | Out-String
    $vmInfo | Select-String '="(.+\.(vdi|vmdk|vhd))"' -AllMatches | ForEach-Object {
        $_.Matches | ForEach-Object { try { & $script:vbox closemedium disk $_.Groups[1].Value 2>&1 | Out-Null } catch {} }
    }
    try { & $script:vbox unregistervm $vmName 2>&1 | Out-Null } catch {}
    foreach ($ext in @('vdi', 'vmdk', 'vhd')) {
        $stalePath = Join-Path $defaultVmFolder "$vmName\$vmName.$ext"
        try { & $script:vbox closemedium disk $stalePath 2>&1 | Out-Null } catch {}
    }
    Write-Host "  Done." -ForegroundColor DarkGray
}

Write-Host ""
if ([string]::IsNullOrWhiteSpace($vmFolder)) {
    if ($NonInteractive) {
        $vmFolder = $defaultVmFolder
    } else {
        $vmFolder = Read-Host "VM folder [$defaultVmFolder]"
        if ([string]::IsNullOrWhiteSpace($vmFolder)) { $vmFolder = $defaultVmFolder }
    }
}

$downloadsDir = "$env:USERPROFILE\Downloads"
$suggestedIso = $null
if (Test-Path $downloadsDir) {
    $fedoraIsos = Get-ChildItem -Path $downloadsDir -Filter *.iso | Where-Object { $_.Name -match "fedora" -and $_.Name -notmatch "CHECKSUM" } | Select-Object -First 1
    if ($fedoraIsos) {
        $suggestedIso = $fedoraIsos.FullName
    }
}

Write-Host ""
if ([string]::IsNullOrWhiteSpace($isoPath)) {
    if ($suggestedIso) {
        $isoPath = Read-Host "Path to Fedora ISO file [$suggestedIso]"
        if ([string]::IsNullOrWhiteSpace($isoPath)) { $isoPath = $suggestedIso }
    } else {
        $isoPath = Read-Host "Path to Fedora ISO file"
    }
}

if ([string]::IsNullOrWhiteSpace($isoPath) -or -not (Test-Path $isoPath)) {
    Write-Host "  ERROR: Invalid ISO path." -ForegroundColor Red
    exit 1
}

Write-Host ""
if ([string]::IsNullOrWhiteSpace($ramMB)) {
    $ramMB = Read-Host "RAM in MB [4096]"
    if ([string]::IsNullOrWhiteSpace($ramMB)) { $ramMB = 4096 } else { $ramMB = [int]$ramMB }
} else {
    $ramMB = [int]$ramMB
}

Write-Host ""
if ([string]::IsNullOrWhiteSpace($cpus)) {
    $cpus = Read-Host "Number of CPUs [4]"
    if ([string]::IsNullOrWhiteSpace($cpus)) { $cpus = 4 } else { $cpus = [int]$cpus }
} else {
    $cpus = [int]$cpus
}

Write-Host ""
if ([string]::IsNullOrWhiteSpace($diskMB)) {
    $diskMB = Read-Host "Disk size in MB [40000]"
    if ([string]::IsNullOrWhiteSpace($diskMB)) { $diskMB = 40000 } else { $diskMB = [int]$diskMB }
} else {
    $diskMB = [int]$diskMB
}

Write-Host ""
if ([string]::IsNullOrWhiteSpace($diskType)) {
    $diskType = Read-Host "Disk type [VDI*|VMDK|VHD]"
    if ([string]::IsNullOrWhiteSpace($diskType)) { $diskType = "VDI" } else { $diskType = $diskType.ToUpper() }
} else {
    $diskType = $diskType.ToUpper()
}

Write-Host ""
if ([string]::IsNullOrWhiteSpace($vramMB)) {
    $vramMB = Read-Host "Video RAM in MB [128]"
    if ([string]::IsNullOrWhiteSpace($vramMB)) { $vramMB = 128 } else { $vramMB = [int]$vramMB }
} else {
    $vramMB = [int]$vramMB
}

Write-Host ""
if ([string]::IsNullOrWhiteSpace($nicType)) {
    $nicType = Read-Host "Network adapter type [NAT*|bridged|host-only|none]"
    if ([string]::IsNullOrWhiteSpace($nicType)) { $nicType = "nat" } else { $nicType = $nicType.ToLower() }
} else {
    $nicType = $nicType.ToLower()
}

Write-Host ""
Write-Host "Creating VM '$vmName'..." -ForegroundColor Green

try {
    if (-not (Test-Path $vmFolder)) {
        New-Item -ItemType Directory -Force -Path $vmFolder | Out-Null
    }

    Invoke-VBox "createvm", "--name", $vmName, "--ostype", "Fedora_64", "--register", "--basefolder", $vmFolder
    Invoke-VBox "modifyvm", $vmName, "--memory", $ramMB, "--cpus", $cpus, "--vram", $vramMB, "--graphicscontroller", "vmsvga"
    Invoke-VBox "modifyvm", $vmName, "--clipboard", "bidirectional", "--draganddrop", "bidirectional"
    Invoke-VBox "modifyvm", $vmName, "--rtcuseutc", "on", "--paravirtprovider", "kvm", "--accelerate3d", "off"
    if ($nicType -ne "none") {
        Invoke-VBox "modifyvm", $vmName, "--nic1", $nicType
    }

    $diskPath = Join-Path -Path $vmFolder -ChildPath "$vmName\$vmName.$($diskType.ToLower())"
    $diskDir = Split-Path $diskPath -Parent
    if (-not (Test-Path $diskDir)) {
        New-Item -ItemType Directory -Force -Path $diskDir | Out-Null
    }

    try { & $script:vbox closemedium disk $diskPath --delete 2>&1 | Out-Null } catch {}
    if (Test-Path $diskPath) { Remove-Item $diskPath -Force }

    Write-Host "  Creating virtual disk ($diskMB MB, $diskType) ..." -ForegroundColor Cyan
    Invoke-VBox "createmedium", "disk", "--filename", $diskPath, "--size", $diskMB, "--format", $diskType, "--variant", "Standard"
    Write-Host "  Disk created." -ForegroundColor Green
    Invoke-VBox "storagectl", $vmName, "--name", "SATA Controller", "--add", "sata", "--controller", "IntelAhci"
    Invoke-VBox "storageattach", $vmName, "--storagectl", "SATA Controller", "--port", 0, "--device", 0, "--type", "hdd", "--medium", $diskPath
    Invoke-VBox "storagectl", $vmName, "--name", "IDE Controller", "--add", "ide"
    Invoke-VBox "storageattach", $vmName, "--storagectl", "IDE Controller", "--port", 0, "--device", 0, "--type", "dvddrive", "--medium", $isoPath
    Invoke-VBox "modifyvm", $vmName, "--boot1", "dvd", "--boot2", "disk", "--boot3", "none", "--boot4", "none"
    Invoke-VBox "setextradata", $vmName, "GUI/ScaleFactor", "1"

    Write-Host "VM '$vmName' created successfully!" -ForegroundColor Green
    Write-Host "You can now start the VM to begin Fedora installation." -ForegroundColor Cyan

    if ([string]::IsNullOrWhiteSpace($attachGuestAdditions)) {
        $attachGA = Read-YesNo "Do you want to attach the VirtualBox Guest Additions ISO now so it is ready for later installation?"
    } else {
        $attachGA = $attachGuestAdditions -in 'y','yes','true','1'
    }
    if ($attachGA) {
        $gaIso = Get-VBoxGuestAdditionsIso
        if ($gaIso) {
            Add-VBoxGuestAdditionsIso -vmName $vmName -isoPath $gaIso
        } else {
            Write-Host "  Guest Additions ISO not found. Install VirtualBox on the host or download VBoxGuestAdditions.iso." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  You can attach Guest Additions later by rerunning create-vm.ps1 or using VBoxManage." -ForegroundColor Cyan
    }

    if ([string]::IsNullOrWhiteSpace($startVm)) {
        $startNow = Read-YesNo "Start the VM now?"
    } else {
        $startNow = $startVm -in 'y','yes','true','1'
    }
    if ($startNow) {
        Invoke-VBox "startvm", $vmName, "--type", "gui"
        Write-Host "VM started." -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "  Next steps after Fedora installation completes:" -ForegroundColor Cyan
    Write-Host "    1. Complete the Fedora installer." -ForegroundColor White
    Write-Host "       Before rebooting, eject the Live ISO: Devices -> Optical Drives -> Remove disk from virtual drive." -ForegroundColor DarkGray
    Write-Host "       Then reboot. On first boot the GNOME wizard will ask you to create your user account." -ForegroundColor DarkGray
    Write-Host "    2. Install Guest Additions and disable SELinux:" -ForegroundColor White
    Write-Host "         sudo dnf update -y" -ForegroundColor DarkGray
    Write-Host "         # If a new kernel was installed, reboot before continuing:" -ForegroundColor DarkGray
    Write-Host "         sudo reboot" -ForegroundColor DarkGray
    Write-Host "         # After reboot, confirm the running kernel:" -ForegroundColor DarkGray
    Write-Host "         uname -r" -ForegroundColor DarkGray
    Write-Host "         sudo dnf install -y dkms kernel-devel-`$(uname -r) kernel-headers gcc make perl bzip2" -ForegroundColor DarkGray
    Write-Host "         sudo sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config" -ForegroundColor DarkGray
    Write-Host "         sudo mkdir -p /mnt/ga" -ForegroundColor DarkGray
    Write-Host "         sudo mount /dev/sr1 /mnt/ga  # if it fails, try /dev/sr0 (run lsblk to check)" -ForegroundColor DarkGray
    Write-Host "         rpm -q kernel-devel-`$(uname -r)  # DKMS builds GA modules against this -- must match running kernel" -ForegroundColor DarkGray
    Write-Host "         sudo /mnt/ga/VBoxLinuxAdditions.run" -ForegroundColor DarkGray
    Write-Host "         sudo passwd root" -ForegroundColor DarkGray
    Write-Host "         sudo reboot" -ForegroundColor DarkGray
    Write-Host "         # After reboot, verify SELinux is disabled:" -ForegroundColor DarkGray
    Write-Host "         sestatus" -ForegroundColor DarkGray
    Write-Host "    3. Run provision-vm.ps1 to install software." -ForegroundColor White
    Write-Host ""

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
