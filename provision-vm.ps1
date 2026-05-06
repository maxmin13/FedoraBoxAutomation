#Requires -Version 5.1
<#
.SYNOPSIS
    Provisions a running VirtualBox Fedora VM by uploading and executing guest scripts.

.NOTES
    Guest user must have passwordless sudo, or authenticate as root.
    Fedora Live's liveuser has passwordless sudo by default.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File ".\provision-vm.ps1"
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

function Get-CredentialFile {
    param([string]$VmName)
    $dir = Join-Path $PSScriptRoot ".credentials"
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    return Join-Path $dir "$VmName.cred"
}

function Save-VmCredentials {
    param([string]$VmName, [string]$User, [string]$Pass)
    $path = Get-CredentialFile -VmName $VmName
    "$User`n$Pass" | Set-Content -Path $path -Encoding UTF8
    Write-Host "  Credentials saved for future runs." -ForegroundColor DarkGray
}

function Get-VmCredentials {
    param([string]$VmName)
    $path = Get-CredentialFile -VmName $VmName
    if (Test-Path $path) {
        $lines = Get-Content $path -Encoding UTF8
        if ($lines.Count -ge 2) { return @{ User = $lines[0]; Pass = $lines[1] } }
    }
    return $null
}

function Test-GuestCredentials {
    $testArgs = @(
        'guestcontrol', $script:vmName,
        'run', '--exe', '/bin/bash',
        '--username', $script:vmUser, '--password', $script:vmPass,
        '--wait-stdout', '--wait-stderr',
        '--', '-c', 'echo ok'
    )
    try {
        $ErrorActionPreference = 'SilentlyContinue'
        & $script:vbox @testArgs 2>&1 | Out-Null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = 'Stop'
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

function Send-ScriptToGuest {
    param([string]$LocalPath)
    $fileName  = [System.IO.Path]::GetFileName($LocalPath)
    $guestPath = "/tmp/$fileName"

    Write-Host "  Uploading $fileName..." -NoNewline

    $uploadArgs = @(
        'guestcontrol', $script:vmName,
        'copyto', $LocalPath, $guestPath,
        '--username', $script:vmUser,
        '--password', $script:vmPass
    )
    $result = & $script:vbox @uploadArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Upload failed: $result" }

    $stripCrlfArgs = @(
        'guestcontrol', $script:vmName,
        'run', '--exe', '/bin/bash',
        '--username', $script:vmUser,
        '--password', $script:vmPass,
        '--wait-stdout', '--wait-stderr',
        '--', '-c', "sed -i 's/\r//' $guestPath"
    )
    & $script:vbox @stripCrlfArgs 2>&1 | Out-Null

    $chmodArgs = @(
        'guestcontrol', $script:vmName,
        'run', '--exe', '/bin/bash',
        '--username', $script:vmUser,
        '--password', $script:vmPass,
        '--wait-stdout', '--wait-stderr',
        '--', '-c', "chmod +x $guestPath"
    )
    $chmodResult = & $script:vbox @chmodArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "chmod failed: $chmodResult" }

    Write-Host " OK" -ForegroundColor Green
    return $guestPath
}

function Invoke-GuestScript {
    param([string]$LocalPath, [string]$ScriptArgs = '')

    $guestPath = Send-ScriptToGuest -LocalPath $LocalPath

    $cmd = if ($script:vmUser -eq 'root') {
        "$guestPath $ScriptArgs 2>&1 | tee -a /var/log/fedora-box-automation.log".Trim()
    } else {
        "sudo $guestPath $ScriptArgs 2>&1 | tee -a /var/log/fedora-box-automation.log".Trim()
    }

    Write-Host "  Running: $cmd" -ForegroundColor DarkGray

    $runArgs = @(
        'guestcontrol', $script:vmName,
        'run', '--exe', '/bin/bash',
        '--username', $script:vmUser,
        '--password', $script:vmPass,
        '--wait-stdout', '--wait-stderr',
        '--', '-c', $cmd
    )
    $ErrorActionPreference = 'SilentlyContinue'
    $result = & $script:vbox @runArgs 2>&1
    $ErrorActionPreference = 'Stop'
    $resultText = ($result | ForEach-Object { $_.ToString() }) -join "`n"
    $resultText -split "`n" | ForEach-Object {
        if ($_ -match '(?i)(error|failed|fatal|command not found|permission denied|no such file)') {
            Write-Host "    $_" -ForegroundColor Red
        } elseif ($_ -match '(?i)(warning|warn)') {
            Write-Host "    $_" -ForegroundColor Yellow
        } else {
            Write-Host "    $_"
        }
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  FAILED (exit code $LASTEXITCODE)" -ForegroundColor Red
        if ($resultText -match 'terminal is required|askpass') {
            Write-Host ""
            Write-Host "  sudo requires a TTY and cannot prompt for a password via guestcontrol." -ForegroundColor Yellow
            Write-Host "  Fix: set a root password inside the VM and use root as the username:" -ForegroundColor Yellow
            Write-Host "       sudo passwd root" -ForegroundColor White
        }
        return $false
    }
    Write-Host "  Done." -ForegroundColor Green
    return $true
}

# --- Init ---------------------------------------------------------------------

try {

Write-Header "Fedora VM Provisioner"

$script:vbox = Find-VBoxManage
if (-not $script:vbox) {
    Write-Host "  ERROR: VBoxManage.exe not found. Is VirtualBox installed?" -ForegroundColor Red
    exit 1
}
Write-Host "  VBoxManage: $script:vbox" -ForegroundColor DarkGray

Write-Host ""
$runningVMs = & $script:vbox list runningvms 2>$null
if ($runningVMs) {
    Write-Host "  Running VMs:" -ForegroundColor DarkGray
    $runningVMs | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
} else {
    Write-Host "  WARNING: No running VMs found. Make sure the VM is started." -ForegroundColor Yellow
}

Write-Host ""
$script:vmName = (Read-Host "VM name").Trim()
if ([string]::IsNullOrWhiteSpace($script:vmName)) {
    Write-Host "  ERROR: VM name cannot be empty." -ForegroundColor Red
    exit 1
}

Write-Host "  Checking Guest Additions..." -NoNewline
$vmInfo    = & $script:vbox showvminfo $script:vmName --machinereadable 2>&1
$gaLine    = $vmInfo | Where-Object { $_ -match '^GuestAdditionsVersion=' }
$gaVersion = if ($gaLine) { $gaLine -replace '^GuestAdditionsVersion="?([^"]*)"?$', '$1' } else { "" }
if ([string]::IsNullOrWhiteSpace($gaVersion)) {
    Write-Host " NOT FOUND" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Guest Additions are not installed or not running." -ForegroundColor Red
    Write-Host "  Inside the VM run:" -ForegroundColor Yellow
    Write-Host "    sudo dnf update -y" -ForegroundColor White
    Write-Host "    sudo dnf install -y kernel-devel-`$(uname -r) kernel-headers gcc make perl bzip2" -ForegroundColor White
    Write-Host "    sudo mkdir -p /mnt/ga" -ForegroundColor White
    Write-Host "    sudo mount /dev/sr1 /mnt/ga  # if it fails, try /dev/sr0 (run lsblk to check)" -ForegroundColor White
    Write-Host "    sudo /mnt/ga/VBoxLinuxAdditions.run" -ForegroundColor White
    Write-Host "    sudo reboot" -ForegroundColor White
    exit 1
}
Write-Host " OK (v$gaVersion)" -ForegroundColor Green

Write-Host ""
Write-Host "  IMPORTANT: If you have not done so, complete these steps inside the VM before continuing:" -ForegroundColor Yellow
Write-Host "       sudo dnf update -y" -ForegroundColor White
Write-Host "       sudo dnf install -y kernel-devel-`$(uname -r) kernel-headers gcc make perl bzip2" -ForegroundColor White
Write-Host "       sudo sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config" -ForegroundColor White
Write-Host "       sudo mkdir -p /mnt/ga" -ForegroundColor White
Write-Host "       sudo mount /dev/sr1 /mnt/ga  # if it fails, try /dev/sr0 (run lsblk to check)" -ForegroundColor White
Write-Host "       sudo /mnt/ga/VBoxLinuxAdditions.run" -ForegroundColor White
Write-Host "  IMPORTANT: Scripts must run as root inside the VM." -ForegroundColor Yellow
Write-Host "       sudo passwd root" -ForegroundColor White
Write-Host "       sudo reboot" -ForegroundColor White
Write-Host "  Then enter 'root' as the username below." -ForegroundColor Yellow
Write-Host ""

$saved = Get-VmCredentials -VmName $script:vmName
if ($saved) {
    Write-Host "  Saved credentials found for '$($script:vmName)' (user: $($saved.User))." -ForegroundColor DarkGray
    $useSaved = Read-YesNo "Use saved credentials?"
    if ($useSaved) {
        $script:vmUser = $saved.User
        $script:vmPass = $saved.Pass
    } else {
        $script:vmUser = (Read-Host "Guest username").Trim()
        $script:vmPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR(
                (Read-Host "Guest password" -AsSecureString)))
        Save-VmCredentials -VmName $script:vmName -User $script:vmUser -Pass $script:vmPass
    }
} else {
    $script:vmUser = (Read-Host "Guest username").Trim()
    $script:vmPass = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR(
            (Read-Host "Guest password" -AsSecureString)))
    Save-VmCredentials -VmName $script:vmName -User $script:vmUser -Pass $script:vmPass
}

Write-Host "  Closing any open guest sessions..." -NoNewline
try {
    $ErrorActionPreference = 'SilentlyContinue'
    & $script:vbox guestcontrol $script:vmName closesession --all 2>&1 | Out-Null
} catch {} finally {
    $ErrorActionPreference = 'Stop'
}
Write-Host " Done" -ForegroundColor DarkGray

Write-Host "  Verifying credentials..." -NoNewline
if (-not (Test-GuestCredentials)) {
    Write-Host " FAILED" -ForegroundColor Red
    Write-Host "  Cannot authenticate as '$script:vmUser'. Possible causes:" -ForegroundColor Red
    Write-Host ""
    Write-Host "  1. Wrong username or password." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  2. Guest Additions not installed - open a terminal inside the VM and run:" -ForegroundColor Yellow
    Write-Host "       sudo dnf update -y" -ForegroundColor White
    Write-Host "       sudo dnf install -y kernel-devel-`$(uname -r) kernel-headers gcc make perl bzip2" -ForegroundColor White
    Write-Host "       sudo mkdir -p /mnt/ga" -ForegroundColor White
    Write-Host "       sudo mount /dev/sr1 /mnt/ga  # if it fails, try /dev/sr0 (run lsblk to check)" -ForegroundColor White
    Write-Host "       sudo /mnt/ga/VBoxLinuxAdditions.run" -ForegroundColor White
    Write-Host "       sudo reboot" -ForegroundColor White
    Write-Host ""
    Write-Host "  3. SELinux is blocking VBoxService - open a terminal inside the VM and run:" -ForegroundColor Yellow
    Write-Host "       sudo sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config" -ForegroundColor White
    Write-Host "       sudo reboot" -ForegroundColor White
    Write-Host "     Then retry this script." -ForegroundColor White
    Write-Host ""
    Write-Host "  4. sudo requires a TTY - use root instead. Set a root password inside the VM:" -ForegroundColor Yellow
    Write-Host "       sudo passwd root" -ForegroundColor White
    Write-Host "     Then re-run this script with username: root" -ForegroundColor White
    Write-Host ""
    Write-Host "  5. VBoxService session issue - restart it inside the VM:" -ForegroundColor Yellow
    Write-Host "       sudo systemctl restart vboxadd-service" -ForegroundColor White
    $credFile = Get-CredentialFile -VmName $script:vmName
    if (Test-Path $credFile) {
        Remove-Item $credFile -Force
        Write-Host "  Saved credentials deleted." -ForegroundColor DarkGray
    }
    exit 1
}
Write-Host " OK" -ForegroundColor Green

Write-Host ""
$script:loginUser = (Read-Host "Guest desktop username (non-root)").Trim()
if ([string]::IsNullOrWhiteSpace($script:loginUser)) {
    Write-Host "  ERROR: Desktop username cannot be empty." -ForegroundColor Red
    exit 1
}

$scriptsRoot = Join-Path $PSScriptRoot "scripts"

# Maps each script filename to its argument type:
#   'user'   — pass the desktop login username
#   'none'   — no arguments needed
#   'custom' — prompt the user for arguments
$scriptArgDefs = @{
    'java.sh'                = 'user'
    'vim.sh'                 = 'user'
    'php.sh'                 = 'user'
    'wireshark.sh'           = 'user'
    'docker.sh'              = 'user'
    'openssl.sh'             = 'user'
    'maven.sh'               = 'user'
    'python.sh'              = 'user'
    'httpd.sh'               = 'user'
    'tomcat.sh'              = 'user'
    'aws-cli.sh'             = 'user'
    'k8-install.sh'          = 'user'
    'chrome.sh'              = 'none'
    'mysql.sh'               = 'none'
    'ecs-cli.sh'             = 'none'
    'eclipse.sh'             = 'none'
    'eclipse-ee.sh'          = 'none'
    'visualstudiocode.sh'    = 'none'
    'dev-tools.sh'           = 'none'
    'postgresql.sh'          = 'none'
    'virtualbox-install.sh'  = 'none'
    'packettracer.sh'        = 'custom'
}

$commonScript = Join-Path $scriptsRoot "common.sh"
if (Test-Path $commonScript) {
    Write-Host "  Uploading common.sh..." -NoNewline
    $uploadArgs = @(
        'guestcontrol', $script:vmName,
        'copyto', $commonScript, '/tmp/common.sh',
        '--username', $script:vmUser,
        '--password', $script:vmPass
    )
    $result = & $script:vbox @uploadArgs 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Failed to upload common.sh: $result" }
    Write-Host " OK" -ForegroundColor Green
}

# --- Menu loop ----------------------------------------------------------------

$failures = [System.Collections.Generic.List[string]]::new()
$done = $false
while (-not $done) {
    Write-Header "Provisioning Menu"
    Write-Host "  [1] Run full setup  (setup scripts in recommended order)" -ForegroundColor White
    Write-Host "  [2] Run individual script" -ForegroundColor White
    Write-Host "  [Q] Quit" -ForegroundColor White
    Write-Host ""
    $choice = (Read-Host "Choice").Trim().ToUpper()

    switch ($choice) {

        '1' {
            Write-Header "Full Setup"
            Write-Host "  Order: system-prep → network-config → selinux-config → desktop-config → dev-tools" -ForegroundColor DarkGray
            Write-Host ""

            $hostname = (Read-Host "Hostname for the VM").Trim()

            # Upload background image to /usr/share/backgrounds/ before desktop-config runs
            $bgLocalPath = Join-Path $scriptsRoot "img\blue-background.png"
            $bgFileName  = "blue-background.png"
            $bgGuestDir  = "/usr/share/backgrounds"

            if (Test-Path $bgLocalPath) {
                Write-Host "  Installing background image..." -ForegroundColor Cyan
                $uploadArgs = @(
                    'guestcontrol', $script:vmName,
                    'copyto', $bgLocalPath, "$bgGuestDir/$bgFileName",
                    '--username', $script:vmUser, '--password', $script:vmPass
                )
                $result = & $script:vbox @uploadArgs 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  Background image installed." -ForegroundColor Green
                } else {
                    Write-Host "  WARNING: Could not upload background image: $result" -ForegroundColor Yellow
                    $bgFileName = ""
                }
            } else {
                Write-Host "  WARNING: Background image not found at $bgLocalPath" -ForegroundColor Yellow
                $bgFileName = ""
            }

            $setupSteps = @(
                @{ Path = "setup\system-prep.sh";    Args = $script:loginUser },
                @{ Path = "setup\network-config.sh"; Args = $hostname },
                @{ Path = "setup\selinux-config.sh"; Args = "" },
                @{ Path = "setup\desktop-config.sh"; Args = "$($script:loginUser) $bgFileName".Trim() },
                @{ Path = "setup\dev-tools.sh";      Args = "" }
            )

            foreach ($step in $setupSteps) {
                $fullPath = Join-Path $scriptsRoot $step.Path
                if (-not (Test-Path $fullPath)) {
                    Write-Host "  SKIPPED (not found): $($step.Path)" -ForegroundColor Yellow
                    continue
                }
                Write-Header $step.Path
                $ok = Invoke-GuestScript -LocalPath $fullPath -ScriptArgs $step.Args
                if (-not $ok) {
                    $failures.Add($step.Path)
                    if (-not (Read-YesNo "Script failed. Continue with remaining steps?" $false)) {
                        break
                    }
                }
            }

            Write-Host ""
            Write-Host "  Setup complete. Reboot the VM to apply all changes." -ForegroundColor Green
        }

        '2' {
            $allScripts = Get-ChildItem -Path $scriptsRoot -Filter "*.sh" -Recurse |
                Where-Object { $_.FullName -notmatch '\\setup\\' } |
                Sort-Object FullName

            if (-not $allScripts) {
                Write-Host "  No scripts found." -ForegroundColor Yellow
                continue
            }

            Write-Host ""
            for ($i = 0; $i -lt $allScripts.Count; $i++) {
                $rel = $allScripts[$i].FullName.Substring($scriptsRoot.Length + 1)
                Write-Host ("  [{0,2}] {1}" -f ($i + 1), $rel) -ForegroundColor White
            }
            Write-Host ""

            $sel = (Read-Host "Script number").Trim()
            if ($sel -notmatch '^\d+$' -or [int]$sel -lt 1 -or [int]$sel -gt $allScripts.Count) {
                Write-Host "  Invalid selection." -ForegroundColor Yellow
                continue
            }

            $chosen   = $allScripts[[int]$sel - 1]
            $argType  = $scriptArgDefs[$chosen.Name]
            $scriptArgs = switch ($argType) {
                'user'   { $script:loginUser }
                'none'   { '' }
                'custom' { (Read-Host "Arguments for $($chosen.Name)").Trim() }
                default  { (Read-Host "Arguments (leave blank if none)").Trim() }
            }
            if ($argType -eq 'user') {
                Write-Host "  Using login user: $scriptArgs" -ForegroundColor DarkGray
            }

            Write-Header $chosen.Name
            $ok = Invoke-GuestScript -LocalPath $chosen.FullName -ScriptArgs $scriptArgs
            if (-not $ok) { $failures.Add($chosen.Name) }
        }

        'Q' {
            $done = $true
            if ($failures.Count -gt 0) {
                Write-Host ""
                Write-Host "  Session summary - failed scripts:" -ForegroundColor Red
                $failures | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
                Write-Host "  Check /var/log/fedora-box-automation.log inside the VM for details." -ForegroundColor Yellow
            } else {
                Write-Host "  All scripts completed successfully." -ForegroundColor Green
            }
        }

        default { Write-Host "  Invalid choice. Enter 1, 2, or Q." -ForegroundColor Yellow }
    }
}

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
