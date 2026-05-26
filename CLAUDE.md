# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A PowerShell automation toolkit for creating and provisioning Fedora Linux VMs in VirtualBox on Windows 11 Home, with an Electron + React GUI to orchestrate the pipeline.

**Test frameworks in use:**
- PowerShell scripts — Pester v5 (`host/virtualbox-sanity-checks.Tests.ps1`)
- Bash scripts — bats-core (`vm/tests/*.bats`; run on Linux / WSL)
- React components — Vitest + React Testing Library (`app/src/__tests__/*.test.tsx`; run via `npm test` in `app/`)
- Electron main process — Vitest (`app/electron/__tests__/*.test.js`; run via `npm test` in `app/`)

## Running Scripts

```powershell
powershell -ExecutionPolicy Bypass -File ".\host\<script-name>.ps1"
```

Scripts run in order, or use the Electron GUI (`cd app && npm run dev`):

1. `host\virtualbox-sanity-checks.ps1` — validates prerequisites (RAM, disk, CPU virtualisation, Hyper-V)
2. `host\virtualbox-install.ps1` — downloads and silently installs VirtualBox
3. `host\create-vm.ps1` — creates a Fedora VM from ISO with user-specified parameters; prompts to attach Guest Additions ISO

## Architecture

**Host side (PowerShell):** Scripts orchestrate VirtualBox via `VBoxManage.exe`. All PowerShell scripts share common helper patterns:
- `Write-Header` / `Read-YesNo` — styled I/O helpers
- `Find-VBoxManage` — locates `VBoxManage.exe` on the host
- `Invoke-VBox` — wraps `VBoxManage` calls with error handling and direct execution (no `Start-Process`)
- `param()` blocks with `Read-Host` fallback — scripts accept parameters but always fall back to interactive prompts when parameters are empty, so they work both standalone and when called from the Electron GUI
- Guest Additions helpers in `create-vm.ps1`: `Get-VBoxGuestAdditionsIso`, `Get-VBoxIDEControllerName`, `Attach-VBoxGuestAdditionsIso`

**Guest side (Bash):** Shell scripts under `vm/` run inside the Fedora VM via `VBoxManage guestcontrol`. They use colour-coded output helpers (`log`, `warn`, `error`) from `vm/lib/common.sh` and structured exit codes. All scripts must use LF line endings — CRLF causes exit 126 on Linux.

**Electron GUI (`app/`):** Electron + React + TypeScript, bundled by Vite, styled with Tailwind CSS.
- `electron/main.js` — window creation, close-during-script warning dialog
- `electron/ipc-handlers.js` — all `ipcMain.handle()` registrations; wrapped in `handleIpc()` which logs every call to `gui.log`
- `electron/script-runner.js` — spawns PowerShell scripts, streams stdout/stderr line-by-line over IPC
- `electron/scripts.js` — single source of truth for all `.ps1` paths; register new scripts here first
- `electron/preload.js` — `contextBridge` exposes `window.electronAPI` to React; add new IPC calls here and in `electron.d.ts`
- `src/pages/` — one component per page: LandingPage, SetupPage, CreateVmPage, LogsPage, DocsPage
- `src/components/` — NavBar, CheckCard

**SetupPage layout:** Master/detail split — left panel is a compact check list (badge + label), right panel shows detail + fix instructions for the selected check. First failing check is auto-selected on completion. Uses `h-full flex flex-col` with `overflow-hidden` panels to fit the fixed 1100×750 window without scrollbars.

**State persistence:** SetupPage and CreateVmPage are kept always-mounted with `display: none` in App.tsx so their state survives navigation.

## Key Constraints

- Targets **Windows 11 Home** — Hyper-V must be disabled (VirtualBox incompatibility)
- Minimum host requirements: 8 GB RAM, 30 GB free disk, CPU virtualisation enabled in BIOS
- Guest OS: Fedora Linux (uses `dnf` package manager and `systemctl`)
- VBoxManage must be on PATH or discoverable; `Find-VBoxManage` searches common install locations
- All PowerShell scripts use `try/catch` and `$ErrorActionPreference = 'Stop'`
- Use plain ASCII in `.ps1` files — PowerShell 5.1 garbles Unicode punctuation (use `-` not `—`, `->` not `→`)

## Critical Coding Rules

**PowerShell scripts:**
- Always include `param()` blocks but fall back to `Read-Host` when parameters are empty
- Use `Invoke-VBox` for all VBoxManage calls — never call VBoxManage directly with `Start-Process`
- `showvminfo` output has trailing `\r` on each line — use `-match` not `-eq` or `-contains` for string comparisons

**Bash scripts:**
- All `dnf` calls must include `-y` — scripts run non-interactively via guestcontrol and will hang on any prompt
- Set LF line endings — CRLF causes "file not found" / exit 126 on Linux
- Docker group commands: use `sg docker -c "cmd"` to activate group membership without logout
- Never use `--enable-optimizations` in Python `./configure`; use `make altinstall` not `make install`
- Name Python venvs `~/python_venv_X.Y` to allow multiple versions to coexist

**Guest control:**
- Always authenticate as `root`, not a regular user — `sudo` requires a TTY which Guest Control does not provide
- Set a root password inside the VM (`sudo passwd root`) before provisioning via the GUI

**Electron / React:**
- New `handleIpc()` calls in `ipc-handlers.js` require a full app restart — main process loads the file once at startup
- `ConvertTo-Json` emits a bare object (not array) for single-item collections — always wrap with `@(...)` and add `Array.isArray` guard in JS
- DISM progress text contaminates JSON parsing — set `$ProgressPreference = 'SilentlyContinue'` and keep stdout/stderr in separate Node.js buffers
- Extract pure logic from IPC handlers into named exported functions before testing (allows unit testing without a running Electron process)

## Sanity Check Thresholds

| Check | Pass | Warn | Fail |
|-------|------|------|------|
| OS architecture | 64-bit | — | 32-bit |
| Total RAM | >= 8 GB | 4–8 GB | < 4 GB |
| Free RAM | >= 5120 MB | 3072–5119 MB | < 3072 MB |
| Disk free (C:) | >= 30 GB | 10–29 GB | < 10 GB |
| CPU virtualisation | Enabled | Disabled (check unreliable, may be false negative) | — |
| Hyper-V | Not enabled | Enabled | — |
| Windows Hypervisor Platform | Not enabled | Enabled | — |
| Virtual Machine Platform | Not enabled | Enabled | — |
| Secure Boot | Disabled | Enabled | — |
| VirtualBox | >= 7.x | Older version | Not installed |

## Troubleshooting

**VBoxManage not found:** Run `virtualbox-install.ps1` or add `C:\Program Files\Oracle\VirtualBox` to system PATH.

**Guest Additions ISO not found:** The script searches standard VirtualBox install locations. Specify the path manually or install VirtualBox with default options.

**Guest control fails:** Verify Guest Additions are installed and the VM is running. Authenticate as `root`. If Guest Additions were installed before a kernel update, reinstall them with `sudo dnf install -y kernel-devel-$(uname -r)` then re-run `VBoxLinuxAdditions.run`.
