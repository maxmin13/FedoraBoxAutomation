# ============================================================
#  common.ps1 - Shared helpers for all host scripts.
#  Dot-source this file near the top of each script:
#    . "$PSScriptRoot\common.ps1"
# ============================================================

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

function Start-Log {
    # host.log is now written with timestamps by the Electron main process
}

function Invoke-VBox {
    param([string[]]$VBoxArgs)
    Write-Host "Running: $($script:vbox) $($VBoxArgs -join ' ')" -ForegroundColor DarkGray
    $result   = & $script:vbox @VBoxArgs
    $exitCode = $LASTEXITCODE
    $output   = if ($result -is [array]) { $result -join "`n" } else { [string]$result }
    if ($exitCode -ne 0) {
        throw "VBoxManage error (exit code $exitCode): $output"
    }
    return $output
}

# Credentials are stored in .credentials/credentials.json at the repo root, keyed by VM name.
# This matches the format used by the Electron GUI (ipc-handlers.js).

function Get-VmCredentials {
    param([string]$VmName)
    $path = Join-Path (Split-Path $PSScriptRoot -Parent) ".credentials\credentials.json"
    if (-not (Test-Path $path)) { return $null }
    $store = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
    $prop  = $store.PSObject.Properties[$VmName]
    if (-not $prop) { return $null }
    $v = $prop.Value
    return @{ User = $v.user; Pass = $v.pass; LoginUser = $v.loginUser }
}

function Save-VmCredentials {
    param([string]$VmName, [string]$User, [string]$Pass, [string]$LoginUser = '')
    $dir   = Join-Path (Split-Path $PSScriptRoot -Parent) ".credentials"
    $path  = Join-Path $dir "credentials.json"
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    $store = if (Test-Path $path) { Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json } else { [PSCustomObject]@{} }
    $entry = [PSCustomObject]@{ user = $User; pass = $Pass; loginUser = $LoginUser }
    if ($store.PSObject.Properties[$VmName]) {
        $store.PSObject.Properties[$VmName].Value = $entry
    } else {
        $store | Add-Member -NotePropertyName $VmName -NotePropertyValue $entry
    }
    $store | ConvertTo-Json -Depth 3 | Set-Content -Path $path -Encoding UTF8
    Write-Host "  Credentials saved." -ForegroundColor DarkGray
}

function Remove-VmCredentials {
    param([string]$VmName)
    $path = Join-Path (Split-Path $PSScriptRoot -Parent) ".credentials\credentials.json"
    if (-not (Test-Path $path)) { return }
    $store = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
    $store.PSObject.Properties.Remove($VmName)
    $store | ConvertTo-Json -Depth 3 | Set-Content -Path $path -Encoding UTF8
    Write-Host "  Saved credentials deleted." -ForegroundColor DarkGray
}

# ── Guest-control helpers ─────────────────────────────────────────────────────
#
#  All three functions below rely on four script-level variables that the
#  calling script must set before dot-sourcing common.ps1 or before the first
#  call — whichever comes later:
#
#    $script:vbox    – full path to VBoxManage.exe (from Find-VBoxManage)
#    $script:vmName  – registered VM name
#    $script:vmUser  – guestcontrol username (typically root)
#    $script:vmPass  – guestcontrol password
#
# ─────────────────────────────────────────────────────────────────────────────

# Converts raw 2>&1 output (a mix of strings and ErrorRecord objects) into a
# plain string and maps common VBoxManage errors to human-readable sentences.
function Get-VBoxErrMsg {
    param([object[]]$Output)
    $text = ($Output | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.Exception.Message }
        else { [string]$_ }
    }) -join ' '

    # VM-state errors: "current status is: <state>"
    if ($text -match 'current status is: (\w+)') {
        $state = $Matches[1]
        $stateMsg = @{
            starting = 'Guest Additions are not yet ready - start the VM, wait 30 seconds, then try again'
            paused   = 'VM is paused - resume it before running guest scripts'
            saved    = 'VM is in saved state - start it before running guest scripts'
            poweroff = 'VM is powered off - start it before running guest scripts'
            aborted  = 'VM was force-stopped - start it before running guest scripts'
        }
        if ($stateMsg.ContainsKey($state)) { return $stateMsg[$state] }
        return "VM is not ready (state: $state) - start it before running guest scripts"
    }
    if ($text -match 'not currently running|is not running') {
        return 'VM is not running - start it before running guest scripts'
    }
    if ($text -match 'execution service is not ready|not installed or not ready') {
        return 'Guest Additions are not ready - start the VM, wait 30 seconds, then try again'
    }
    if ($text -match 'VERR_DUPLICATE') {
        return 'A previous guest session is still active - wait a few seconds and try again'
    }
    if ($text -match 'VERR_AUTHENTICATION_FAILURE|authentication failure') {
        return 'Wrong username or password'
    }
    if ([string]::IsNullOrWhiteSpace($text)) {
        return 'VM is not responding - check that it is running and Guest Additions are active'
    }
    return $text
}

# Uploads vm/lib/common.sh to /tmp/common.sh inside the guest (best-effort).
# Warns on failure but never aborts the calling script.
function Copy-GuestCommonSh {
    param([string]$ProjectRoot)
    $src = Join-Path $ProjectRoot "vm\lib\common.sh"
    if (-not (Test-Path $src)) { return }
    $ua = @('guestcontrol', $script:vmName, 'copyto', $src, '/tmp/common.sh',
            '--username', $script:vmUser, '--password', $script:vmPass)
    $ErrorActionPreference = 'SilentlyContinue'
    $r    = & $script:vbox @ua 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -ne 0) { Write-Host "  Uploading common.sh WARNING: $(Get-VBoxErrMsg $r)" }
    else             { Write-Host "  Uploading common.sh OK" }
}

# Uploads a local script to /tmp/<filename> inside the guest, strips CRLF,
# makes it executable, and runs it via /bin/bash.
# Returns 0 on success; non-zero on failure.  Always emits the definitive
# ERROR: line itself — callers only need to check the return value and exit.
#   - Upload/connection failure: emits the mapped VBox error, returns 2.
#   - Script execution failure:  emits "ERROR: <Label> failed …" when Label is
#     supplied; otherwise leaves the guest's own ERROR: line as the last one.
function Invoke-GuestScript {
    param([string]$LocalPath, [string]$ScriptArgs = '', [string]$Label = '')

    $fileName  = [System.IO.Path]::GetFileName($LocalPath)
    $guestPath = "/tmp/$fileName"

    # Upload
    Write-Host "  Uploading $fileName ..."
    $uploadArgs = @('guestcontrol', $script:vmName, 'copyto', $LocalPath, $guestPath,
                    '--username', $script:vmUser, '--password', $script:vmPass)
    $ErrorActionPreference = 'SilentlyContinue'
    $r          = & $script:vbox @uploadArgs 2>&1
    $uploadCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($uploadCode -ne 0) {
        Write-Host "  Uploading $fileName FAILED"
        Write-Host "ERROR: $(Get-VBoxErrMsg $r)"
        return 2
    }
    Write-Host "  Uploading $fileName OK"

    # Strip CRLF and chmod +x (best-effort; failure is non-fatal)
    $ErrorActionPreference = 'SilentlyContinue'
    & $script:vbox guestcontrol $script:vmName run --exe /bin/bash `
        --username $script:vmUser --password $script:vmPass `
        --wait-stdout --wait-stderr `
        -- -c "sed -i 's/\r//' $guestPath && chmod +x $guestPath" 2>&1 | Out-Null
    $ErrorActionPreference = 'Stop'

    # Root executes directly; any other user prefixes with sudo
    $cmd = if ($script:vmUser -eq 'root') {
        if ($ScriptArgs) { "$guestPath $ScriptArgs" } else { $guestPath }
    } else {
        if ($ScriptArgs) { "sudo $guestPath $ScriptArgs" } else { "sudo $guestPath" }
    }

    Write-Host "  Running: $cmd"

    $runArgs = @(
        'guestcontrol', $script:vmName,
        'run', '--exe', '/bin/bash',
        '--username', $script:vmUser, '--password', $script:vmPass,
        '--wait-stdout', '--wait-stderr',
        '--timeout', '3600000',
        '--', '-c', $cmd
    )

    $ErrorActionPreference = 'SilentlyContinue'
    & $script:vbox @runArgs 2>&1 | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) { Write-Host $_.Exception.Message }
        else { Write-Host ([string]$_) }
    }
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'

    if ($exitCode -ne 0 -and $Label) {
        Write-Host ""
        Write-Host "ERROR: $Label failed - expand script output for details"
    }

    return $exitCode
}
