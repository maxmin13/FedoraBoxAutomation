# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a PowerShell automation project for VirtualBox. A PowerShell automation toolkit for creating and provisioning Fedora Linux VMs in VirtualBox on Windows 11 Home. Scripts are run directly — there is no build step, test framework, or linting toolchain.

Always use error handling in scripts.

## Running Scripts

```powershell
powershell -ExecutionPolicy Bypass -File ".\<script-name>.ps1"
```

Scripts can be run interactively in order, or use `run.ps1` for a guided GUI:

1. `virtualbox-sanity-checks.ps1` — validates prerequisites (RAM, disk, CPU virtualization, Hyper-V)
2. `virtualbox-install.ps1` — downloads and silently installs VirtualBox
3. `create-vm.ps1` — creates a Fedora VM from ISO with user-specified parameters; prompts to attach Guest Additions ISO
4. `provision-vm.ps1` — installs dev tools (Claude Code, VS Code, Java, MariaDB) into a running VM (requires Guest Additions)
5. `cleanup.ps1` — removes failed VMs
6. `run.ps1` — GUI orchestrator that runs the full pipeline with optional cleanup and sanity checks

## Architecture

**Host side (PowerShell):** Scripts orchestrate VirtualBox via `VBoxManage.exe`. All PowerShell scripts share common helper patterns:
- `Write-Header` / `Read-YesNo` — styled I/O helpers
- `Find-VBoxManage` — locates `VBoxManage.exe` on the host
- `Invoke-VBox` — wraps `VBoxManage` calls with error handling and direct execution (no `Start-Process`)
- Guest Additions helpers in `create-vm.ps1`:
  - `Get-VBoxGuestAdditionsIso` — locates the local `VBoxGuestAdditions.iso`
  - `Get-VBoxIDEControllerName` — creates IDE controller if needed
  - `Attach-VBoxGuestAdditionsIso` — mounts Guest Additions ISO to the VM for later installation

**Guest side (Bash):** `scripts/install-java.sh` runs inside the Fedora VM via `VBoxManage guestcontrol`. It uses color-coded output helpers and structured exit codes.

**Guest control requirement:** `provision-vm.ps1` and guest script execution require VirtualBox Guest Additions to be installed in the VM. Guest Additions can be installed during the Fedora OS installation or manually after. All guest commands authenticate with the VM user credentials passed interactively.

**Guest Additions attachment:** `create-vm.ps1` now prompts to attach the Guest Additions ISO before VM startup, allowing manual installation during or after Fedora setup.

## Key Constraints

- Targets **Windows 11 Home** specifically — Hyper-V must be disabled (VirtualBox incompatibility)
- Minimum host requirements: 8 GB RAM, 30 GB free disk, CPU virtualization enabled in BIOS
- Guest OS: Fedora Linux (uses `dnf` package manager and `systemctl`)
- VBoxManage must be on the system PATH or discoverable; `Find-VBoxManage` searches common install locations
- PowerShell 5.1+ required; scripts use `try/catch` and `$ErrorActionPreference = 'Stop'` patterns
- ISO files are preserved by cleanup; only failed VMs are removed

## Workflow Notes

**Expected prompts during `create-vm.ps1`:**
- VM name — if a VM with that name already exists, the script offers to unregister it (files are kept)
- Folder location, ISO path
- RAM (MB) — default 4096, CPU count — default 4, disk size (MB) — default 40000
- Disk format — `[VDI*|VMDK|VHD]` where `*` marks the default; VDI is VirtualBox native, VMDK is VMware-compatible, VHD is Microsoft/Hyper-V
- Video RAM (MB) — default 128; 16 MB is too low for Fedora Workstation graphics
- Network adapter type — `[NAT*|bridged|host-only|none]`; NAT gives internet access without host network config
- Planned guest username and password (for reference during Fedora setup)
- Option to attach Guest Additions ISO
- Option to start the VM immediately

**Guest Additions installation:**
1. If ISO is attached, it appears as a second DVD drive (`/dev/sr1`) inside the VM
2. After OS installation, open a terminal and run:
   ```bash
   sudo mkdir -p /mnt/ga
   sudo mount /dev/sr1 /mnt/ga
   sudo /mnt/ga/VBoxLinuxAdditions.run
   ```
3. Reboot the VM; Guest Additions will then be active (shared clipboard, better resolution, guest control)
4. Without Guest Additions, remote script execution via `provision-vm.ps1` will not work

## Troubleshooting

**VBoxManage not found:** Ensure VirtualBox is installed. Run `virtualbox-install.ps1` or manually add `C:\Program Files\Oracle\VirtualBox` to system PATH.

**Guest Additions ISO not found:** The script searches standard VirtualBox install locations. If not found, manually specify the path or install VirtualBox with default options.

**Guest control fails in provision-vm.ps1:** Verify Guest Additions are installed in the VM. Check that the VM is running and credentials are correct.
