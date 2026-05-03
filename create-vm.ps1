#Requires -Version 5.1
<#
.SYNOPSIS
    Creates a new Fedora VirtualBox VM from a downloaded ISO.

.DESCRIPTION
    Prompts for VM configuration options and creates a new VirtualBox VM
    with Fedora ISO attached, ready for installation.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\create-vm.ps1"
#>

$ErrorActionPreference = 'Stop'

function Write-Header {
    param([string]$Text)
    $line = "-" * 60
    Write-Host ""
    Write-Host $line -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host $line -ForegroundColor Cyan
}

function Read-YesNo {
    param(
        [string]$Prompt,
        [bool]$Default = $true
    )
    $hint = if ($Default) { "Y/n" } else { "y/N" }
    while ($true) {
        $raw = Read-Host "$Prompt [$hint]"
        if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
        switch ($raw.Trim().ToLower()) {
            { $_ -in "y","yes" } { return $true }
            { $_ -in "n","no"  } { return $false }
        }
        Write-Host "  Please answer y or n." -ForegroundColor Yellow
    }
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

function Invoke-VBox {
    param([string[]]$VBoxArgs)
    $argText = $VBoxArgs -join ' '
    Write-Host "Running: $($script:vbox) $argText" -ForegroundColor DarkGray

    $result = & $script:vbox @VBoxArgs
    $exitCode = $LASTEXITCODE
    $output = if ($result -is [array]) { $result -join "`n" } else { [string]$result }
    if ($exitCode -ne 0) {
        throw "VBoxManage error (exit code $exitCode): $output"
    }
    return $output
}

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

function Attach-VBoxGuestAdditionsIso {
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
    Write-Host "         sudo mkdir -p /mnt/ga" -ForegroundColor White
    Write-Host "         sudo mount /dev/sr1 /mnt/ga" -ForegroundColor White
    Write-Host "         sudo /mnt/ga/VBoxLinuxAdditions.run" -ForegroundColor White
    Write-Host "    3. Reboot the VM when the installer finishes." -ForegroundColor Cyan
    Write-Host "    4. Guest Additions will then be active (shared clipboard, better resolution, guest control)." -ForegroundColor Cyan
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
$vmName = (Read-Host "VM name").Trim()
if ([string]::IsNullOrWhiteSpace($vmName)) {
    Write-Host "  ERROR: VM name cannot be empty." -ForegroundColor Red
    exit 1
}
$existingVms = & $script:vbox list vms 2>$null | ForEach-Object { if ($_ -match '"(.+)"') { $Matches[1] } }
if ($existingVms -contains $vmName) {
    Write-Host "  WARNING: A VM named '$vmName' already exists." -ForegroundColor Yellow
    $confirm = Read-Host "  Unregister it to proceed? [y/N]"
    if ($confirm -notmatch '^[Yy]$') {
        Write-Host "  Aborted. Choose a different VM name or unregister it manually." -ForegroundColor Red
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
$vmFolder = Read-Host "VM folder [$defaultVmFolder]"
if ([string]::IsNullOrWhiteSpace($vmFolder)) { $vmFolder = $defaultVmFolder }

$downloadsDir = "$env:USERPROFILE\Downloads"
$suggestedIso = $null
if (Test-Path $downloadsDir) {
    $fedoraIsos = Get-ChildItem -Path $downloadsDir -Filter *.iso | Where-Object { $_.Name -match "fedora" -and $_.Name -notmatch "CHECKSUM" } | Select-Object -First 1
    if ($fedoraIsos) {
        $suggestedIso = $fedoraIsos.FullName
    }
}

Write-Host ""
if ($suggestedIso) {
    $isoPath = Read-Host "Path to Fedora ISO file [$suggestedIso]"
    if ([string]::IsNullOrWhiteSpace($isoPath)) { $isoPath = $suggestedIso }
} else {
    $isoPath = Read-Host "Path to Fedora ISO file"
}

if ([string]::IsNullOrWhiteSpace($isoPath) -or -not (Test-Path $isoPath)) {
    Write-Host "  ERROR: Invalid ISO path." -ForegroundColor Red
    exit 1
}

Write-Host ""
$ramMB = Read-Host "RAM in MB [4096]"
if ([string]::IsNullOrWhiteSpace($ramMB)) { $ramMB = 4096 } else { $ramMB = [int]$ramMB }

Write-Host ""
$cpus = Read-Host "Number of CPUs [4]"
if ([string]::IsNullOrWhiteSpace($cpus)) { $cpus = 4 } else { $cpus = [int]$cpus }

Write-Host ""
$diskMB = Read-Host "Disk size in MB [40000]"
if ([string]::IsNullOrWhiteSpace($diskMB)) { $diskMB = 40000 } else { $diskMB = [int]$diskMB }

Write-Host ""
$diskType = Read-Host "Disk type [VDI*|VMDK|VHD]"
if ([string]::IsNullOrWhiteSpace($diskType)) { $diskType = "VDI" } else { $diskType = $diskType.ToUpper() }

Write-Host ""
$vramMB = Read-Host "Video RAM in MB [128]"
if ([string]::IsNullOrWhiteSpace($vramMB)) { $vramMB = 128 } else { $vramMB = [int]$vramMB }

Write-Host ""
$nicType = Read-Host "Network adapter type [NAT*|bridged|host-only|none]"
if ([string]::IsNullOrWhiteSpace($nicType)) { $nicType = "nat" } else { $nicType = $nicType.ToLower() }

Write-Host ""
Write-Host "Creating VM '$vmName'..." -ForegroundColor Green

try {
    if (-not (Test-Path $vmFolder)) {
        New-Item -ItemType Directory -Force -Path $vmFolder | Out-Null
    }

    Invoke-VBox "createvm", "--name", $vmName, "--ostype", "Fedora_64", "--register", "--basefolder", $vmFolder
    Invoke-VBox "modifyvm", $vmName, "--memory", $ramMB, "--cpus", $cpus, "--vram", $vramMB, "--graphicscontroller", "vmsvga"
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

    Invoke-VBox "createmedium", "disk", "--filename", $diskPath, "--size", $diskMB, "--format", $diskType, "--variant", "Standard"
    Invoke-VBox "storagectl", $vmName, "--name", "SATA Controller", "--add", "sata", "--controller", "IntelAhci"
    Invoke-VBox "storageattach", $vmName, "--storagectl", "SATA Controller", "--port", 0, "--device", 0, "--type", "hdd", "--medium", $diskPath
    Invoke-VBox "storagectl", $vmName, "--name", "IDE Controller", "--add", "ide"
    Invoke-VBox "storageattach", $vmName, "--storagectl", "IDE Controller", "--port", 0, "--device", 0, "--type", "dvddrive", "--medium", $isoPath
    Invoke-VBox "modifyvm", $vmName, "--boot1", "dvd", "--boot2", "disk", "--boot3", "none", "--boot4", "none"

    Write-Host "VM '$vmName' created successfully!" -ForegroundColor Green
    Write-Host "You can now start the VM to begin Fedora installation." -ForegroundColor Cyan

    $attachGA = Read-YesNo "Do you want to attach the VirtualBox Guest Additions ISO now so it is ready for later installation?"
    if ($attachGA) {
        $gaIso = Get-VBoxGuestAdditionsIso
        if ($gaIso) {
            Attach-VBoxGuestAdditionsIso -vmName $vmName -isoPath $gaIso
        } else {
            Write-Host "  Guest Additions ISO not found. Install VirtualBox on the host or download VBoxGuestAdditions.iso." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  You can attach Guest Additions later by rerunning create-vm.ps1 or using VBoxManage." -ForegroundColor Cyan
    }

    $startNow = Read-YesNo "Start the VM now?"
    if ($startNow) {
        Invoke-VBox "startvm", $vmName
        Write-Host "VM started." -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "  Next steps after Fedora installation completes:" -ForegroundColor Cyan
    Write-Host "    1. Complete the Fedora installer." -ForegroundColor White
    Write-Host "       Before rebooting, eject the Live ISO: Devices -> Optical Drives -> Remove disk from virtual drive." -ForegroundColor DarkGray
    Write-Host "       Then reboot. On first boot the GNOME wizard will ask you to create your user account." -ForegroundColor DarkGray
    Write-Host "    2. Install Guest Additions:" -ForegroundColor White
    Write-Host "         sudo mkdir -p /mnt/ga" -ForegroundColor DarkGray
    Write-Host "         sudo mount /dev/sr1 /mnt/ga" -ForegroundColor DarkGray
    Write-Host "         sudo /mnt/ga/VBoxLinuxAdditions.run" -ForegroundColor DarkGray
    Write-Host "    3. Reboot the VM." -ForegroundColor White
    Write-Host "    4. Run provision-vm.ps1 to install software." -ForegroundColor White
    Write-Host ""

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
