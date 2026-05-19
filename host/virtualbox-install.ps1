# ============================================================
#  VirtualBox Auto-Installer for Windows 11 Home
#  Run in PowerShell as Administrator
# ============================================================

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\common.ps1"
Start-Log

$sep = "=" * 55

try {
    Write-Host ""
    Write-Host $sep
    Write-Host "   VirtualBox Auto-Installer"
    Write-Host $sep

    # ── CHECK ADMIN ──────────────────────────────────────────────
    $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
        Write-Host "`n[FAIL] Please run this script as Administrator." -ForegroundColor Red
        exit 1
    }

    # ── CHECK IF ALREADY INSTALLED ───────────────────────────────
    Write-Host "`n[1] Checking for existing VirtualBox installation..."
    $vbox = Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* `
            -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -like "*VirtualBox*" }

    if ($vbox) {
        Write-Host "    [PASS] VirtualBox is already installed: $($vbox.DisplayName) $($vbox.DisplayVersion)"
        Write-Host "    Nothing to do. Exiting."
        exit 0
    } else {
        Write-Host "    VirtualBox not found. Proceeding with installation..."
    }

    # ── GET LATEST VERSION FROM VIRTUALBOX.ORG ───────────────────
    Write-Host "`n[2] Fetching latest VirtualBox version..."
    try {
        $latestVersion = (Invoke-WebRequest -Uri "https://download.virtualbox.org/virtualbox/LATEST-STABLE.TXT" `
            -UseBasicParsing).Content.Trim()
        Write-Host "    Latest version: $latestVersion"
    } catch {
        Write-Host "    [FAIL] Could not fetch latest version. Check your internet connection." -ForegroundColor Red
        exit 1
    }

    # ── BUILD DOWNLOAD URL ────────────────────────────────────────
    Write-Host "`n[3] Building download URL..."
    try {
        $baseUrl     = "https://download.virtualbox.org/virtualbox/$latestVersion"
        $indexPage   = (Invoke-WebRequest -Uri $baseUrl -UseBasicParsing).Content
        $fileName    = [regex]::Match($indexPage, 'VirtualBox-[\d.]+-\d+-Win\.exe').Value
        $downloadUrl = "$baseUrl/$fileName"
        Write-Host "    File: $fileName"
    } catch {
        Write-Host "    [FAIL] Could not determine installer filename." -ForegroundColor Red
        exit 1
    }

    # ── DOWNLOAD INSTALLER ────────────────────────────────────────
    $installerPath = "$env:TEMP\$fileName"
    Write-Host "`n[4] Downloading VirtualBox installer..."
    Write-Host "    Destination: $installerPath"
    try {
        Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing
        Write-Host "    [PASS] Download complete."
    } catch {
        Write-Host "    [FAIL] Download failed: $_" -ForegroundColor Red
        exit 1
    }

    # ── INSTALL ───────────────────────────────────────────────────
    Write-Host "`n[5] Installing VirtualBox (silent install)..."
    try {
        $process = Start-Process -FilePath $installerPath `
            -ArgumentList "--silent", "--ignore-reboot" `
            -Wait -PassThru
        if ($process.ExitCode -eq 0) {
            Write-Host "    [PASS] VirtualBox installed successfully!" -ForegroundColor Green
        } else {
            Write-Host "    [WARN] Installer exited with code $($process.ExitCode). Check if installation completed." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "    [FAIL] Installation failed: $_" -ForegroundColor Red
        exit 1
    }

    # ── CLEANUP ───────────────────────────────────────────────────
    Write-Host "`n[6] Cleaning up installer..."
    Remove-Item $installerPath -ErrorAction SilentlyContinue
    Write-Host "    Done."

    Write-Host ""
    Write-Host $sep
    Write-Host "   VirtualBox installation complete!"
    Write-Host "   Launch it from the Start Menu."
    Write-Host $sep
    Write-Host ""
} catch {
    Write-Host "`n[FAIL] VirtualBox installation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
