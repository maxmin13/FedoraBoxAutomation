#Requires -Version 5.1
<#
.SYNOPSIS
    Creates a permanent VirtualBox shared folder and adds the desktop user to the vboxsf group.
.PARAMETER VmName
    Name of the registered VirtualBox VM. When supplied the interactive prompt is skipped.
.PARAMETER HostPath
    Windows path of the host folder to share (e.g. C:\Temp\shared). When supplied the interactive prompt is skipped.
.PARAMETER MountPoint
    Absolute Linux path where the share will be mounted inside the VM (e.g. /home/maxmin/shared). When supplied the interactive prompt is skipped.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\share-folder.ps1"
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\share-folder.ps1" -VmName "FedoraVM" -HostPath "C:\Shared" -MountPoint "/home/maxmin/shared"
#>
param(
    [string]$VmName     = '',
    [string]$HostPath   = '',
    [string]$MountPoint = ''
)

$ErrorActionPreference = 'Stop'

function Write-Header {
    param([string]$Text)
    $line = "-" * 60
    Write-Host ""; Write-Host $line -ForegroundColor Cyan
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host $line -ForegroundColor Cyan
}

function Read-YesNo {
    param([string]$Prompt, [bool]$Default = $true)
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
    foreach ($c in @("C:\Program Files\Oracle\VirtualBox\VBoxManage.exe","C:\Program Files (x86)\Oracle\VirtualBox\VBoxManage.exe")) {
        if (Test-Path $c) { return $c }
    }
    $found = Get-Command "VBoxManage.exe" -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
    return $null
}

function Invoke-VBox {
    param([string[]]$VBoxArgs)
    Write-Host "Running: $($script:vbox) $($VBoxArgs -join ' ')" -ForegroundColor DarkGray
    $result = & $script:vbox @VBoxArgs
    $output = if ($result -is [array]) { $result -join "`n" } else { [string]$result }
    if ($LASTEXITCODE -ne 0) { throw "VBoxManage error (exit $LASTEXITCODE): $output" }
    return $output
}

function Get-CredentialFile { return Join-Path (Join-Path (Split-Path $PSScriptRoot -Parent) ".credentials") "$($args[0]).cred" }

function Save-VmCredentials {
    param([string]$VmName, [string]$User, [string]$Pass, [string]$LoginUser = '')
    $path = Get-CredentialFile $VmName
    $dir  = Split-Path $path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    "$User`n$Pass`n$LoginUser" | Set-Content -Path $path -Encoding UTF8
    Write-Host "  Credentials saved." -ForegroundColor DarkGray
}

function Get-VmCredentials {
    param([string]$VmName)
    $path = Get-CredentialFile $VmName
    if (-not (Test-Path $path)) { return $null }
    $lines = Get-Content $path -Encoding UTF8
    if ($lines.Count -lt 2) { return $null }
    return @{ User = $lines[0]; Pass = $lines[1]; LoginUser = if ($lines.Count -ge 3) { $lines[2] } else { '' } }
}

function Test-GuestReady {
    param([string]$VmName, [string]$User, [string]$Pass)
    $ErrorActionPreference = 'SilentlyContinue'
    & $script:vbox guestcontrol $VmName run --exe /bin/bash --username $User --password $Pass --wait-stdout --wait-stderr -- -c 'echo ok' 2>&1 | Out-Null
    $ok = $LASTEXITCODE -eq 0
    $ErrorActionPreference = 'Stop'
    return $ok
}

# ---------------------------------------------------------------------------

Write-Header "VirtualBox Shared Folder Setup"

$script:vbox = Find-VBoxManage
if (-not $script:vbox) { Write-Host "  ERROR: VBoxManage.exe not found." -ForegroundColor Red; exit 1 }
Write-Host "  VBoxManage: $script:vbox" -ForegroundColor DarkGray

$registeredVms = & $script:vbox list vms 2>$null | ForEach-Object { if ($_ -match '"(.+)"') { $Matches[1] } }
if ($registeredVms) {
    Write-Host ""
    Write-Host "  Registered VMs:" -ForegroundColor DarkGray
    $registeredVms | ForEach-Object { Write-Host "    - $_" -ForegroundColor DarkGray }
}

if ([string]::IsNullOrWhiteSpace($VmName)) {
    $vmName = ''
    while ($true) {
        Write-Host ""
        $vmName = (Read-Host "VM name").Trim()
        if ([string]::IsNullOrWhiteSpace($vmName))  { Write-Host "  VM name cannot be empty." -ForegroundColor Yellow; continue }
        if ($registeredVms -notcontains $vmName)     { Write-Host "  No VM named '$vmName' found." -ForegroundColor Yellow; continue }
        break
    }
} else {
    $vmName = $VmName.Trim()
    if ($registeredVms -notcontains $vmName) { Write-Host "  ERROR: No VM named '$vmName' found." -ForegroundColor Red; exit 1 }
    Write-Host "  VM name: $vmName" -ForegroundColor DarkGray
}

if ([string]::IsNullOrWhiteSpace($HostPath)) {
    $hostPath = ''
    while ($true) {
        Write-Host ""
        $hostPath = (Read-Host "Host folder path to share").Trim()
        if ([string]::IsNullOrWhiteSpace($hostPath)) { Write-Host "  Host path cannot be empty." -ForegroundColor Yellow; continue }
        if ($hostPath -notmatch '^[A-Za-z]:\\') {
            Write-Host "  Enter a Windows path starting with a drive letter (e.g. C:\Temp\shared)." -ForegroundColor Yellow
            continue
        }
        if (-not (Test-Path $hostPath -PathType Container)) {
            Write-Host "  Folder does not exist. Creating it..." -ForegroundColor Yellow
            New-Item -ItemType Directory -Force -Path $hostPath | Out-Null
            Write-Host "  Created: $hostPath" -ForegroundColor Green
        }
        break
    }
} else {
    $hostPath = $HostPath.Trim()
    if ($hostPath -notmatch '^[A-Za-z]:\\') { Write-Host "  ERROR: -HostPath must be a Windows path starting with a drive letter." -ForegroundColor Red; exit 1 }
    if (-not (Test-Path $hostPath -PathType Container)) {
        Write-Host "  Host folder does not exist. Creating it..." -ForegroundColor Yellow
        New-Item -ItemType Directory -Force -Path $hostPath | Out-Null
        Write-Host "  Created: $hostPath" -ForegroundColor Green
    }
    Write-Host "  Host path : $hostPath" -ForegroundColor DarkGray
}

$shareName = (Split-Path $hostPath -Leaf) -replace '\s+', '_'

if ([string]::IsNullOrWhiteSpace($MountPoint)) {
    $mountPoint = ''
    while ($true) {
        Write-Host ""
        $mountPoint = (Read-Host "Mount point inside VM").Trim()
        if ([string]::IsNullOrWhiteSpace($mountPoint)) { Write-Host "  Mount point cannot be empty." -ForegroundColor Yellow; continue }
        if ($mountPoint -notmatch '^/[^\\ ]*$') {
            Write-Host "  Enter an absolute Linux path starting with / (e.g. /home/maxmin/shared)." -ForegroundColor Yellow
            $mountPoint = ''
            continue
        }
        break
    }
} else {
    $mountPoint = $MountPoint.Trim()
    if ($mountPoint -notmatch '^/[^\\ ]*$') { Write-Host "  ERROR: -MountPoint must be an absolute Linux path starting with /." -ForegroundColor Red; exit 1 }
    Write-Host "  Mount point: $mountPoint" -ForegroundColor DarkGray
}

# Skip everything if the share is already configured correctly.
$vmInfo = & $script:vbox showvminfo $vmName --machinereadable 2>$null
$shareAlreadyCorrect = $false
foreach ($line in $vmInfo) {
    if ($line -match "^SharedFolderNameMachineMapping(\d+)=""$([regex]::Escape($shareName))""$") {
        $idx     = $Matches[1]
        $pathOk  = $vmInfo -contains "SharedFolderPathMachineMapping${idx}=""$hostPath"""
        $mountOk = $vmInfo -contains "SharedFolderAutoMountPointMachineMapping${idx}=""$mountPoint"""
        $shareAlreadyCorrect = $pathOk -and $mountOk
        break
    }
}
if ($shareAlreadyCorrect) {
    Write-Host ""
    Write-Host "  Share '$shareName' is already configured correctly. Nothing to do." -ForegroundColor Green
    Write-Host "  Host path  : $hostPath" -ForegroundColor Cyan
    Write-Host "  Mount point: $mountPoint" -ForegroundColor Cyan
    exit 0
}

# Permanent shares require a write lock — block if VM is running.
$runningVms = & $script:vbox list runningvms 2>$null | ForEach-Object { if ($_ -match '"(.+)"') { $Matches[1] } }
if ($runningVms -contains $vmName) {
    Write-Host ""
    Write-Host "  '$vmName' is currently running. Permanent shares cannot be modified while the VM is on." -ForegroundColor Yellow
    if (-not (Read-YesNo "Shut down '$vmName' now and continue?" $false)) { Write-Host "  Aborted." -ForegroundColor Red; exit 1 }
    Write-Host "  Sending ACPI shutdown..." -ForegroundColor Cyan
    Invoke-VBox @('controlvm', $vmName, 'acpipowerbutton')
    Write-Host "  Waiting for VM to stop..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds(60)
    $vmStopped = $false
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        $state = & $script:vbox showvminfo $vmName --machinereadable 2>$null | Where-Object { $_ -match '^VMState=' }
        if ($state -match '"(poweroff|saved|aborted)"') { $vmStopped = $true; break }
    }
    if (-not $vmStopped) { Write-Host "  ERROR: VM did not stop in time. Shut it down manually and re-run." -ForegroundColor Red; exit 1 }
    Write-Host "  VM stopped." -ForegroundColor Green
}

try {
    $existing = & $script:vbox showvminfo $vmName --machinereadable 2>$null |
        Select-String "SharedFolderNameMachineMapping\d+=""$([regex]::Escape($shareName))"""
    if ($existing) {
        Write-Host "  Removing existing share '$shareName'..." -ForegroundColor Yellow
        Invoke-VBox @('sharedfolder', 'remove', $vmName, '--name', $shareName)
    }

    $addArgs = @('sharedfolder', 'add', $vmName, '--name', $shareName, '--hostpath', $hostPath, '--automount', "--auto-mount-point=$mountPoint")
    Invoke-VBox $addArgs

    Write-Host ""
    Write-Host "  Shared folder registered." -ForegroundColor Green
    Write-Host "  Host path  : $hostPath" -ForegroundColor Cyan
    Write-Host "  Mount point: $mountPoint (available after VM starts)" -ForegroundColor Cyan

    $saved     = Get-VmCredentials -VmName $vmName
    $vmUser    = $null
    $vmPass    = $null
    $loginUser = ''

    if ($saved) {
        $desc = "user: $($saved.User)$(if ($saved.LoginUser) { ", desktop: $($saved.LoginUser)" })"
        Write-Host "  Saved credentials found ($desc)." -ForegroundColor DarkGray
        if (Read-YesNo "Use saved credentials?") {
            $vmUser = $saved.User; $vmPass = $saved.Pass; $loginUser = $saved.LoginUser
        }
    }

    if (-not $vmUser) {
        $vmUser = (Read-Host "VM root username").Trim()
        $vmPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host "VM root password" -AsSecureString)))
    }

    while ([string]::IsNullOrWhiteSpace($loginUser)) {
        $loginUser = (Read-Host "Desktop username to add to vboxsf").Trim()
        if ([string]::IsNullOrWhiteSpace($loginUser)) { Write-Host "  Username cannot be empty." -ForegroundColor Yellow }
    }

    Write-Host "  Starting VM '$vmName'..." -ForegroundColor Cyan
    Invoke-VBox @('startvm', $vmName, '--type', 'gui')

    Write-Host "  Waiting for Guest Additions..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds(180)
    $gaReady  = $false
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 5
        if (Test-GuestReady -VmName $vmName -User $vmUser -Pass $vmPass) { $gaReady = $true; break }
        Write-Host "  ...still waiting" -ForegroundColor DarkGray
    }
    if (-not $gaReady) {
        Write-Host "  ERROR: Guest Additions did not respond. Run manually: sudo usermod -aG vboxsf $loginUser" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Guest Additions ready." -ForegroundColor Green

    $ErrorActionPreference = 'SilentlyContinue'
    & $script:vbox guestcontrol $vmName closesession --all 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'

    Write-Host "  Adding '$loginUser' to vboxsf group..." -ForegroundColor Cyan
    $ErrorActionPreference = 'SilentlyContinue'
    $result   = & $script:vbox guestcontrol $vmName run --exe /bin/bash --username $vmUser --password $vmPass --wait-stdout --wait-stderr -- -c "usermod -aG vboxsf $loginUser" 2>&1
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'

    if ($exitCode -ne 0) {
        Write-Host "  ERROR: usermod failed (exit $exitCode): $result" -ForegroundColor Red
        Write-Host "  Run manually: sudo usermod -aG vboxsf $loginUser" -ForegroundColor Cyan
        exit 1
    }

    Save-VmCredentials -VmName $vmName -User $vmUser -Pass $vmPass -LoginUser $loginUser

    Write-Host "  '$loginUser' added to vboxsf group." -ForegroundColor Green
    Write-Host "  Reboot the VM for the change to take effect. Share will be at $mountPoint" -ForegroundColor Cyan

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
