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
    [string]$VmName          = '',
    [string]$HostPath        = '',
    [string]$MountPoint      = '',
    [string]$VmUser          = '',
    [string]$VmPass          = '',
    [string]$LoginUser       = '',
    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common.ps1"

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
    if ($NonInteractive) {
        Write-Host "  Non-interactive mode: shutting down '$vmName' automatically." -ForegroundColor Cyan
    } elseif (-not (Read-YesNo "Shut down '$vmName' now and continue?" $false)) {
        Write-Host "  Aborted." -ForegroundColor Red; exit 1
    }
    Write-Host "  Sending ACPI shutdown..." -ForegroundColor Cyan
    Invoke-VBox @('controlvm', $vmName, 'acpipowerbutton')
    Write-Host "  Waiting for VM to stop..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds(120)
    $vmStopped = $false
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 3
        $ErrorActionPreference = 'SilentlyContinue'
        $info = & $script:vbox showvminfo $vmName --machinereadable
        $ErrorActionPreference = 'Stop'
        $vmState = ($info | Where-Object { $_ -match '^VMState=' }) -replace '.*="(.+)".*','$1'
        Write-Host "  ...VMState=$vmState" -ForegroundColor DarkGray
        if ($vmState -in 'poweroff','saved','aborted') {
            $vmStopped = $true
            break
        }
    }
    if (-not $vmStopped) { Write-Host "  ERROR: VM did not stop in time. Shut it down manually and re-run." -ForegroundColor Red; exit 1 }
    Write-Host "  VM stopped." -ForegroundColor Green
}

try {
    $existing = & $script:vbox showvminfo $vmName --machinereadable 2>$null |
        Select-String "SharedFolderNameMachineMapping\d+=""$([regex]::Escape($shareName))"""
    if ($existing) {
        Write-Host "  Removing existing share '$shareName'..." -ForegroundColor Yellow
        $rmDeadline = (Get-Date).AddSeconds(30)
        $removed    = $false
        while ((Get-Date) -lt $rmDeadline) {
            $ErrorActionPreference = 'SilentlyContinue'
            & $script:vbox sharedfolder remove $vmName --name $shareName
            $exitCode = $LASTEXITCODE
            $ErrorActionPreference = 'Stop'
            if ($exitCode -eq 0) { $removed = $true; break }
            Write-Host "  ...waiting for lock to release" -ForegroundColor DarkGray
            Start-Sleep -Seconds 2
        }
        if (-not $removed) {
            Write-Host ""
            Write-Host "  The VirtualBox GUI window for '$vmName' is holding the session lock." -ForegroundColor Yellow
            if ($NonInteractive) {
                throw "sharedfolder remove failed: session lock still held"
            }
            Write-Host "  Close the VirtualBox window for '$vmName', then press Enter to retry." -ForegroundColor Yellow
            Read-Host | Out-Null
            $ErrorActionPreference = 'SilentlyContinue'
            & $script:vbox sharedfolder remove $vmName --name $shareName
            $exitCode = $LASTEXITCODE
            $ErrorActionPreference = 'Stop'
            if ($exitCode -ne 0) { throw "sharedfolder remove failed: session lock still held" }
        }
    }

    $addArgs    = @('sharedfolder', 'add', $vmName, '--name', $shareName, '--hostpath', $hostPath, '--automount', "--auto-mount-point=$mountPoint")
    $addDeadline = (Get-Date).AddSeconds(30)
    $added       = $false
    while ((Get-Date) -lt $addDeadline) {
        $ErrorActionPreference = 'SilentlyContinue'
        & $script:vbox @addArgs
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($exitCode -eq 0) { $added = $true; break }
        Write-Host "  ...waiting for lock to release" -ForegroundColor DarkGray
        Start-Sleep -Seconds 2
    }
    if (-not $added) {
        Write-Host ""
        Write-Host "  The VirtualBox GUI window for '$vmName' is holding the session lock." -ForegroundColor Yellow
        if ($NonInteractive) {
            throw "sharedfolder add failed: session lock still held"
        }
        Write-Host "  Close the VirtualBox window for '$vmName', then press Enter to retry." -ForegroundColor Yellow
        Read-Host | Out-Null
        $ErrorActionPreference = 'SilentlyContinue'
        & $script:vbox @addArgs
        $exitCode = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($exitCode -ne 0) { throw "sharedfolder add failed: session lock still held" }
        $added = $true
    }

    Write-Host ""
    Write-Host "  Shared folder registered." -ForegroundColor Green
    Write-Host "  Host path  : $hostPath" -ForegroundColor Cyan
    Write-Host "  Mount point: $mountPoint (available after VM starts)" -ForegroundColor Cyan

    if (-not [string]::IsNullOrWhiteSpace($VmUser)) {
        $vmUser    = $VmUser.Trim()
        $vmPass    = $VmPass
        $loginUser = $LoginUser.Trim()
        Write-Host "  Using supplied credentials (user: $vmUser, desktop: $loginUser)." -ForegroundColor DarkGray
    } else {
        $saved = Get-VmCredentials -VmName $vmName
        if ($saved) {
            $desc = "user: $($saved.User)$(if ($saved.LoginUser) { ", desktop: $($saved.LoginUser)" })"
            Write-Host "  Saved credentials found ($desc)." -ForegroundColor DarkGray
            if (-not $NonInteractive -and (Read-YesNo "Use saved credentials?")) {
                $vmUser = $saved.User; $vmPass = $saved.Pass; $loginUser = $saved.LoginUser
            } elseif ($NonInteractive) {
                $vmUser = $saved.User; $vmPass = $saved.Pass; $loginUser = $saved.LoginUser
            }
        }

        if (-not $vmUser) {
            if ($NonInteractive) { throw "No credentials supplied or saved for '$vmName'." }
            $vmUser = (Read-Host "VM root username").Trim()
            $vmPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
                [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host "VM root password" -AsSecureString)))
        }

        while ([string]::IsNullOrWhiteSpace($loginUser)) {
            if ($NonInteractive) { throw "No desktop username supplied for '$vmName'." }
            $loginUser = (Read-Host "Desktop username to add to vboxsf").Trim()
            if ([string]::IsNullOrWhiteSpace($loginUser)) { Write-Host "  Username cannot be empty." -ForegroundColor Yellow }
        }
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
    & $script:vbox guestcontrol $vmName run --exe /bin/bash --username $vmUser --password $vmPass --wait-stdout --wait-stderr -- -c "usermod -aG vboxsf $loginUser" 2>&1 | Out-Null
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'

    if ($exitCode -ne 0) {
        Write-Host "  ERROR: Could not add '$loginUser' to vboxsf group. VM setup may be incomplete - make sure Guest Additions are fully installed inside the VM." -ForegroundColor Red
        exit 1
    }

    Write-Host "  '$loginUser' added to vboxsf group." -ForegroundColor Green

    Write-Host "  Creating mount point '$mountPoint'..." -ForegroundColor Cyan
    $ErrorActionPreference = 'SilentlyContinue'
    & $script:vbox guestcontrol $vmName run --exe /bin/bash --username $vmUser --password $vmPass --wait-stdout --wait-stderr -- -c "mkdir -p $mountPoint" 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'

    Write-Host "  Mounting '$shareName' at '$mountPoint'..." -ForegroundColor Cyan
    $ErrorActionPreference = 'SilentlyContinue'
    $mountOut  = & $script:vbox guestcontrol $vmName run --exe /bin/bash --username $vmUser --password $vmPass --wait-stdout --wait-stderr -- -c "mount -t vboxsf $shareName $mountPoint" 2>&1
    $mountCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'

    if ($mountCode -eq 0) {
        Write-Host "  Share mounted at $mountPoint" -ForegroundColor Green
        Write-Host "  Reboot the VM to apply the vboxsf group change for '$loginUser'." -ForegroundColor Cyan
    } else {
        Write-Host "  WARNING: mount failed (exit $mountCode): $mountOut" -ForegroundColor Yellow
        Write-Host "  Run manually inside the VM: sudo mount -t vboxsf $shareName $mountPoint" -ForegroundColor Cyan
    }

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
