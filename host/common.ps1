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
    $logDir = "$env:APPDATA\FedoraBoxAutomation\logs"
    New-Item -ItemType Directory -Force $logDir | Out-Null
    Start-Transcript -Path "$logDir\host.log" -Append -Force | Out-Null
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

# Credentials are stored in .credentials.json at the repo root, keyed by VM name.
# This matches the format used by the Electron GUI (ipc-handlers.js).

function Get-VmCredentials {
    param([string]$VmName)
    $path = Join-Path (Split-Path $PSScriptRoot -Parent) ".credentials.json"
    if (-not (Test-Path $path)) { return $null }
    $store = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
    $prop  = $store.PSObject.Properties[$VmName]
    if (-not $prop) { return $null }
    $v = $prop.Value
    return @{ User = $v.user; Pass = $v.pass; LoginUser = $v.loginUser }
}

function Save-VmCredentials {
    param([string]$VmName, [string]$User, [string]$Pass, [string]$LoginUser = '')
    $path  = Join-Path (Split-Path $PSScriptRoot -Parent) ".credentials.json"
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
    $path = Join-Path (Split-Path $PSScriptRoot -Parent) ".credentials.json"
    if (-not (Test-Path $path)) { return }
    $store = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
    $store.PSObject.Properties.Remove($VmName)
    $store | ConvertTo-Json -Depth 3 | Set-Content -Path $path -Encoding UTF8
    Write-Host "  Saved credentials deleted." -ForegroundColor DarkGray
}
