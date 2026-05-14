# FedoraBox Automation

A PowerShell automation toolkit for creating and provisioning Fedora Linux VMs in VirtualBox on Windows 11 Home, with an Electron GUI to orchestrate the full pipeline.

---

## Reading the docs

The markdown files in `docs/` can be read in two ways:

**In the app** — run `cd app && npm run dev` and click **Docs** in the nav bar.

**In a browser** — install the [Markdown Viewer](https://chromewebstore.google.com/detail/markdown-viewer/ckkdlimhmcjmikdlpkmbgfkaikojcbjk) extension in Chrome or Edge, enable "Allow access to file URLs" in its settings, then open any `.md` file with `Ctrl+O`.

---

## What it does

1. Checks your Windows host meets VirtualBox requirements
2. Installs VirtualBox silently
3. Creates a Fedora 64-bit VM with your chosen specs
4. Provisions the VM with dev tools (Java, Docker, Python, Tomcat, PostgreSQL, and more) via VirtualBox Guest Control
5. Manages shared folders and log exports between host and guest

---

## Requirements

| Requirement | Minimum |
|-------------|---------|
| OS | Windows 11 Home (64-bit) |
| RAM | 8 GB (4 GB minimum) |
| Free disk | 30 GB on C: |
| CPU | Intel VT-x or AMD-V enabled in BIOS |
| Hyper-V | Must be **disabled** |
| PowerShell | 5.1+ |
| Node.js | 18+ (for the Electron GUI only) |
| WSL | Any distro (for running Bash tests on Windows only) |

---

## Installing Prerequisites

### Node.js (required for the GUI)

Node.js is the runtime that Electron is built on. Without it `npm install` will not work.

1. Go to [nodejs.org](https://nodejs.org) and download the **LTS** version
2. Run the installer — accept all defaults
3. Verify the installation:
   ```powershell
   node --version   # should print v18.x or higher
   npm --version    # should print 10.x or higher
   ```

### Git (optional, for cloning the repo)

If you downloaded the project as a ZIP you can skip this. Otherwise:

1. Go to [git-scm.com](https://git-scm.com) and download the Windows installer
2. Run the installer — accept all defaults
3. Clone the repo:
   ```powershell
   git clone https://github.com/your-username/FedoraBoxAutomation.git
   cd FedoraBoxAutomation
   ```

### PowerShell 5.1

Already included in Windows 11. No action needed.

---

## Quick Start

### Option A — Electron GUI

```powershell
cd app
npm install   # downloads all dependencies — run this once, and again after any git pull
npm run dev   # starts the app
```

> If you see a `Cannot find module` error, run `npm install` again — a new package was added since you last installed.

Opens the desktop app. Click **Setup** to run the environment analysis, then follow the pipeline steps.

### Option B — PowerShell scripts directly

Run each script in order:

```powershell
# 1. Check prerequisites
powershell -ExecutionPolicy Bypass -File ".\host\virtualbox-sanity-checks.ps1"

# 2. Install VirtualBox
powershell -ExecutionPolicy Bypass -File ".\host\virtualbox-install.ps1"

# 3. Create a Fedora VM
powershell -ExecutionPolicy Bypass -File ".\host\create-vm.ps1"

# 4. Provision the VM with dev tools
powershell -ExecutionPolicy Bypass -File ".\host\provision-vm.ps1"

# 5. Clean up a failed VM (keeps ISO files)
powershell -ExecutionPolicy Bypass -File ".\host\cleanup.ps1"
```

---

## Project Structure

```
FedoraBoxAutomation/
  host/                          <- PowerShell scripts (run on Windows)
    virtualbox-sanity-checks.ps1 <- checks RAM, disk, CPU virt, Hyper-V, etc.
    virtualbox-install.ps1       <- downloads and silently installs VirtualBox
    create-vm.ps1                <- creates a Fedora VM from ISO
    provision-vm.ps1             <- installs dev tools into a running VM
    cleanup.ps1                  <- removes failed VMs (preserves ISOs)
    share-folder.ps1             <- manages VirtualBox shared folders
    share-logs.ps1               <- exports VM logs to the host

  vm/                            <- Bash scripts (run inside the Fedora VM)
    lib/
      common.sh                  <- shared helpers: logging, error handling
    setup/
      system-prep.sh             <- base packages, hostname, updates
      network-config.sh          <- hostname and DNS setup
      selinux-config.sh          <- disables SELinux (required for Guest Control)
      desktop-config.sh          <- GNOME settings, wallpaper
      utilities.sh               <- Ansible, gedit, dconf-editor, expect
    tools/
      languages/                 <- Java, Python, PHP
      build-tools/               <- Maven
      web-servers/               <- Apache HTTPD, Tomcat
      databases/                 <- MariaDB, PostgreSQL, DBeaver
      containers/                <- Docker, Kubernetes (minikube + kubectl)
      cloud/                     <- AWS CLI, ECS CLI
      ides/                      <- Eclipse, VS Code
      editors/                   <- Vim + Syntastic
      browsers/                  <- Google Chrome
      version-control/           <- Git
      network/                   <- Wireshark
      security/                  <- OpenSSL (compiled from source)

  app/                  <- Electron + React desktop GUI
    electron/
      main.js                    <- Electron main process
      preload.js                 <- contextBridge API
      scripts.js                 <- central registry of .ps1 paths
      script-runner.js           <- spawn, stream, kill PowerShell processes
      ipc-handlers.js            <- IPC request handlers
    src/
      App.tsx                    <- top-level router and nav bar
      pages/
        LandingPage.tsx          <- lists all registered VMs with start/stop controls
        SetupPage.tsx            <- environment analysis and fix actions
        DocsPage.tsx             <- renders markdown docs from docs/ inside the app
      components/
        NavBar.tsx
        CheckCard.tsx            <- pass/warn/fail result card

  docs/
    ELECTRON-GUI-DESIGN.md       <- architecture and design decisions
  CONTRIBUTING.md                <- coding standards for .ps1 and .sh scripts
```

---

## Electron GUI

The GUI replaces the manual script pipeline with a point-and-click interface.

**Technology stack:**

| Layer | Technology |
|-------|-----------|
| Desktop shell + IPC | Electron |
| Main process | Node.js (via Electron) |
| Renderer | React + TypeScript |
| Bundler | Vite |
| Styling | Tailwind CSS + @tailwindcss/typography (dark theme) |
| Markdown renderer | react-markdown |
| Script runner | `child_process.spawn` |
| Unit tests (PS1) | Pester v5 |
| Unit tests (Bash) | bats-core |
| Unit tests (React) | Vitest + React Testing Library |

**Pages:**

- **My VMs** — lists all VirtualBox VMs with running/stopped state
- **Setup** — runs the environment analysis and shows fix actions for any failing checks
- **Docs** — renders the project markdown docs inside the app using react-markdown

---

## Guest Additions

Guest Additions must be installed inside the Fedora VM before `provision-vm.ps1` can run. `create-vm.ps1` offers to attach the ISO automatically.

After the Fedora OS installation completes, open a terminal inside the VM and run:

```bash
sudo dnf update -y
sudo dnf install -y dkms kernel-devel-$(uname -r) kernel-headers gcc make perl bzip2
sudo sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config
sudo reboot
```

After reboot:

```bash
sudo mkdir -p /mnt/ga
sudo mount /dev/sr1 /mnt/ga   # if it fails, run lsblk and try /dev/sr0
sudo /mnt/ga/VBoxLinuxAdditions.run
sudo passwd root               # set a root password for provision-vm.ps1
sudo reboot
```

---

## Provisioning

`provision-vm.ps1` connects to the running VM via VirtualBox Guest Control and uploads/executes the Bash scripts in `vm/tools/`. It requires:

- Guest Additions installed and running
- A root password set inside the VM (`sudo passwd root`)
- The Fedora desktop session active (VBoxService needs the desktop)

**Important:** always authenticate as `root`, not a regular user. `sudo` requires a TTY which Guest Control does not provide.

---

## Shared Folders

```powershell
# Add or update a shared folder
powershell -ExecutionPolicy Bypass -File ".\host\share-folder.ps1"

# Export VM logs to the host
powershell -ExecutionPolicy Bypass -File ".\host\share-logs.ps1"
```

The VM must be powered off to add or modify shared folders.

---

## Running the Tests

There are three independent test suites. Full instructions are in [docs/TESTING.md](docs/TESTING.md).

| Suite | Command | Runs on |
|-------|---------|---------|
| PowerShell sanity checks (Pester v5) | `Invoke-Pester -Path ".\host\virtualbox-sanity-checks.Tests.ps1" -Output Detailed` | Windows PowerShell |
| Bash provisioning scripts (bats-core) | `bats vm/tests/` | Linux / WSL |
| React components (Vitest) | `cd app && npm test` | Windows or Linux (Node.js) |

---

## Troubleshooting

**VBoxManage not found**
VirtualBox is not installed or not on PATH. Run `virtualbox-install.ps1` or add `C:\Program Files\Oracle\VirtualBox` to your system PATH.

**Guest control fails / credentials rejected**
- Verify Guest Additions are installed: check `GuestAdditionsVersion` in VM info
- Use `root` as the username — regular users cannot authenticate via Guest Control
- If Guest Additions were installed before a kernel update, reinstall them:
  ```bash
  sudo dnf install -y kernel-devel-$(uname -r)
  sudo /mnt/ga/VBoxLinuxAdditions.run
  sudo reboot
  ```

**Script hangs during provisioning**
All `dnf` commands must include `-y`. Any interactive prompt will hang indefinitely because Guest Control has no TTY.

**VM display looks wrong / low resolution**
Set Video RAM to at least 128 MB and install Guest Additions. 3D acceleration requires Guest Additions to be active.

**Hyper-V conflict**
Disable Hyper-V and reboot before using VirtualBox:
```powershell
Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for coding standards covering PowerShell scripts, Bash scripts, credential handling, and guest control patterns.
