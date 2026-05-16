# Electron GUI Design — FedoraBoxAutomation

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell + IPC | Electron |
| Main process | Node.js (via Electron) |
| Renderer | React + TypeScript |
| Bundler | Vite |
| Script runner | Node.js `child_process.spawn` |
| Automation scripts | PowerShell 5.1 |
| VM control | VBoxManage.exe |
| Unit tests (PS1) | Pester v5 |
| Unit tests (Bash) | bats-core |
| Unit tests (React) | Vitest + React Testing Library |
| Guest scripts | Bash |

---

## Architecture

```
app/
  electron/                      <- Node.js main process files
    main.js                      <- window creation, close warning dialog
    preload.js                   <- contextBridge: exposes safe IPC API to renderer
    ipc-handlers.js              <- all ipcMain.handle() registrations
    logger.js                    <- file logger; writes gui.log to %APPDATA%\FedoraBoxAutomation\logs\
    script-runner.js             <- spawn, stream, and kill logic
    scripts.js                   <- single source of truth for all .ps1 paths
  src/                           <- React renderer files
    index.html
    index.tsx                    <- React entry point
    styles.css                   <- Tailwind imports
    electron.d.ts                <- TypeScript types for window.electronAPI
    App.tsx                      <- top-level router and nav bar
    pages/
      LandingPage.tsx            <- lists all registered VMs
      SetupPage.tsx              <- environment analysis and fix actions
      CreateVmPage.tsx           <- form to configure and create a new Fedora VM
      DocsPage.tsx               <- renders markdown docs from docs/ inside the app
    components/
      NavBar.tsx                 <- My VMs / Setup / Create VM / Docs navigation
      CheckCard.tsx              <- pass/warn/fail result card
  package.json                   <- main: "electron/main.js"
  vite.config.ts                 <- Vite bundles the React renderer
  tailwind.config.js
  postcss.config.js
  tsconfig.json
```

- **Main process** (`main.js`): Node.js running inside Electron. Uses `child_process.spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', script])` to run each `.ps1`. Streams `stdout`/`stderr` line-by-line over IPC to the renderer.
- **Renderer**: React + TypeScript, bundled by Vite. Each pipeline step is a page component managed by React state.
- **IPC channels** (request/response via `ipcMain.handle` / `ipcRenderer.invoke`):
  - `is-dev` — returns true when running via `npm run dev`
  - `read-doc` — reads a markdown file from `docs/` and returns its content
  - `list-vms` — returns all registered VMs with running/stopped state
  - `start-vm` — starts a stopped VM (GUI window); idempotent if already running
  - `stop-vm` — sends ACPI shutdown to a running VM; polls every 1 s for 60 s; falls back to hard poweroff if the VM does not respond; idempotent if already stopped
  - `run-sanity-checks` — runs `virtualbox-sanity-checks.ps1 -Json` and returns structured results
  - `install-virtualbox` — runs `virtualbox-install.ps1` and streams output
  - `create-vm` — runs `create-vm.ps1` with all VM parameters; streams output; returns `{ ok: boolean }`
  - `delete-vm` — unregisters the VM and deletes all associated files (VDI, snapshots); VM must be stopped first
  - `get-downloads-path` — returns the OS downloads folder path (used to pre-fill the ISO picker)
  - `pick-iso` — opens a native file picker filtered to `.iso` files; returns `{ filePath }` or `{ filePath: null }` if cancelled
  - `log-error` — receives a renderer crash message + stack from `ErrorBoundary` and writes it to `gui.log`
- **Streaming channels** (push from main to renderer via `win.webContents.send`):
  - `script-line` — one output line as it arrives (source: `stdout` | `stderr`)
  - `script-done` — exit code when the script finishes

---

## Screens / Pipeline Steps

| # | Screen | Script | Key inputs |
|---|--------|--------|------------|
| 1 | **My VMs** | none | Lists all registered VMs; Start/Stop buttons per VM |
| 2 | **Setup** | `host/virtualbox-sanity-checks.ps1` | Run Analysis button — shows pass/warn/fail cards with fix actions |
| 3 | **Create VM** | `host/create-vm.ps1` | VM name, ISO path, RAM/CPU/disk/network options; streams live output; shows "What to do next" on success |
| 4 | **Docs** | none | Sidebar of markdown files rendered with react-markdown |

A top navigation bar shows which page is active.

---

## Sanity Checks — JSON Output for the GUI

Add a `-Json` switch to `virtualbox-sanity-checks.ps1` so the GUI receives
structured data instead of plain text.

```powershell
param([switch]$Json)
```

Each check emits one result object:

```json
{
  "id":     "ram",
  "label":  "RAM (Memory)",
  "status": "pass",
  "detail": "16 GB total, 8200 MB free"
}
```

Status values: `"pass"` | `"warn"` | `"fail"`

The full output is a JSON array written to stdout when `-Json` is passed:

```json
[
  { "id": "os",       "label": "Operating System",         "status": "pass", "detail": "Windows 11 64-bit build 26200" },
  { "id": "ram",      "label": "RAM (Memory)",             "status": "pass", "detail": "16 GB total, 8200 MB free" },
  { "id": "disk",     "label": "Disk Space (C:)",          "status": "pass", "detail": "120 GB free of 500 GB" },
  { "id": "cpu",      "label": "CPU Virtualisation",       "status": "pass", "detail": "Intel Core i7, VT-x enabled" },
  { "id": "hyperv",   "label": "Hyper-V",                  "status": "pass", "detail": "Not enabled" },
  { "id": "whp",      "label": "Windows Hypervisor Platform", "status": "pass", "detail": "Not enabled" },
  { "id": "vmp",      "label": "Virtual Machine Platform", "status": "pass", "detail": "Not enabled" },
  { "id": "secboot",  "label": "Secure Boot",              "status": "warn", "detail": "Enabled — OK for VirtualBox 7+" },
  { "id": "vboxinst", "label": "Existing VirtualBox",      "status": "warn", "detail": "VirtualBox 7.1.4 already installed" }
]
```

The GUI renders each result as a card with a green/yellow/red status icon.
A summary bar at the bottom counts pass/warn/fail and shows a
"Proceed anyway" button when only warnings are present.

---

## Unit Tests

### PowerShell — `host/virtualbox-sanity-checks.Tests.ps1`

Uses **Pester v5**. All WMI/CIM calls are mocked so the suite runs without
VirtualBox or specific hardware.

```powershell
Invoke-Pester -Path ".\host\virtualbox-sanity-checks.Tests.ps1" -Output Detailed
```

#### Check thresholds tested

| Check | Pass | Warn | Fail |
|-------|------|------|------|
| OS architecture | 64-bit | — | 32-bit |
| Total RAM | >= 8 GB | 4 to 8 GB | < 4 GB |
| Free RAM | >= 5120 MB | 3072 to 5119 MB | < 3072 MB |
| Disk free (C:) | >= 30 GB | 10 to 29 GB | < 10 GB |
| CPU virtualisation | Enabled | — | Disabled |
| Hyper-V | Not enabled | Enabled | — |
| Windows Hypervisor Platform | Not enabled | Enabled | — |
| Virtual Machine Platform (WSL2) | Not enabled | Enabled | — |
| Secure Boot | Disabled | Enabled | — |
| VirtualBox version | >= 7.x installed | older version installed | not installed |

### Test file structure

```
Describe 'Get-OsCheck' {
    It 'returns pass for 64-bit OS' { ... }
    It 'returns fail for 32-bit OS' { ... }
}

Describe 'Get-RamCheck' {
    It 'returns pass when RAM >= 8 GB and free >= 5120 MB' { ... }
    It 'returns warn when RAM is between 4 and 8 GB' { ... }
    It 'returns fail when RAM < 4 GB' { ... }
    It 'returns fail when free RAM < 3072 MB' { ... }
    It 'returns warn when free RAM is between 3072 and 5120 MB' { ... }
}

Describe 'Get-DiskCheck' {
    It 'returns pass when free disk >= 30 GB' { ... }
    It 'returns warn when free disk is between 10 and 30 GB' { ... }
    It 'returns fail when free disk < 10 GB' { ... }
}

Describe 'Get-CpuVirtCheck' {
    It 'returns pass when WMI reports virtualisation enabled' { ... }
    It 'returns pass when systeminfo reports virtualisation enabled' { ... }
    It 'returns fail when both methods report disabled' { ... }
}

Describe 'Get-HyperVCheck' {
    It 'returns pass when Hyper-V is not enabled' { ... }
    It 'returns warn when Hyper-V is enabled' { ... }
}

Describe 'Get-SecureBootCheck' {
    It 'returns pass when Secure Boot is disabled' { ... }
    It 'returns warn when Secure Boot is enabled' { ... }
    It 'returns warn when status cannot be detected' { ... }
}
```

---

### Bash — `vm/tests/*.bats`

Uses **bats-core**. Tests run on Linux (WSL on the developer machine, or a CI
Linux runner). External commands (`rpm`, `dnf`, `systemctl`, etc.) are stubbed
via a temporary `bin/` directory prepended to `PATH`.

```bash
bats vm/tests/
```

| Test file | Script under test | Key behaviours covered |
|-----------|------------------|-----------------------|
| `common.bats` | `vm/lib/common.sh` | root check, log-level labels, timestamp format, tee to log file |
| `selinux-config.bats` | `vm/setup/selinux-config.sh` | skips dnf when already installed, calls dnf when not, always starts auditd, propagates failures |

`FEDORA_BOX_LOG` — an environment variable added to `common.sh` — lets tests
redirect the tee output to a writable temp path instead of `/var/log/`.

---

### React — `app/src/__tests__/*.test.tsx`

Uses **Vitest + React Testing Library**. Runs on Windows or Linux via Node.js.
`window.electronAPI` is mocked with `vi.fn()` so tests never need a real
Electron process.

```powershell
cd app
npm test
```

| Test file | Component | Key behaviours covered |
|-----------|-----------|----------------------|
| `CheckCard.test.tsx` | `CheckCard` | badge text (OK/!!/XX), label and detail, "How to fix" toggle open/close/label |
| `SetupPage.test.tsx` | `SetupPage` | idle prompt, button disabled while running, cards rendered, summary counts, "Ready"/"Fix" banners, error message |
| `CreateVmPage.test.tsx` | `CreateVmPage` | submit button state, name conflict warning + "Recreate VM" label, "Creating..." while running, live log lines, success/failure banners, Show/Hide log toggle |

---

## Look and Feel

### Theme

Dark theme throughout — this is a developer tool running alongside a VM,
a dark background reduces eye strain and fits the terminal-style output panels.

### Styling

**Tailwind CSS** — utility classes written directly in JSX. No hidden abstractions,
easy to read and learn, no separate CSS files to maintain.

```tsx
// Example: a passing check card
<div className="bg-green-900 border border-green-500 rounded p-4 flex items-center gap-3">
  <span className="text-green-400 text-xl">OK</span>
  <div>
    <p className="text-white font-medium">RAM (Memory)</p>
    <p className="text-green-300 text-sm">16 GB total, 8200 MB free</p>
  </div>
</div>
```

### Colour palette

| State | Background | Border | Text |
|-------|-----------|--------|------|
| Pass | `green-900` | `green-500` | `green-300` |
| Warn | `yellow-900` | `yellow-500` | `yellow-300` |
| Fail | `red-900` | `red-500` | `red-300` |
| Neutral | `zinc-800` | `zinc-600` | `zinc-100` |
| App background | `zinc-900` | — | — |

### Layout

- Fixed top navigation bar with 4 tabs (My VMs, Setup, Create VM, Docs); active tab highlighted
- Main content area scrollable
- Streaming log panel on the Setup page, auto-scrolls as lines arrive

---

## App Close Behaviour During Script Execution

Intercept the window close event and warn the user if a script is running.

### Strategy by script type

| Script | On close |
|--------|----------|
| `virtualbox-sanity-checks.ps1` | Kill silently — read-only, safe to abort |
| `virtualbox-install.ps1` | Block close, show warning dialog |
| `create-vm.ps1` | Block close, show warning dialog |
| `provision-vm.ps1` | Block close, show warning dialog |
| `cleanup.ps1` | Block close, show warning dialog |

### Close interception (main.js)

`hasActiveScript()` (from `script-runner.js`) returns true if a child process is running.
The close handler is `async` so it can `await` the dialog without a `.then()` chain.

```js
win.on('close', async (event) => {
  if (!hasActiveScript()) {
    return
  }

  event.preventDefault()

  const response = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Keep waiting', 'Force quit'],
    defaultId: 0,
    title: 'Script still running',
    message: 'A script is still running.',
    detail: 'Force quitting now may leave your VM in an incomplete state.',
  })

  if (response.response === 1) {
    killActiveScript()
    app.exit(0)
  }
})
```

### Killing the process tree on Windows

`child.kill()` only kills `powershell.exe` — child processes (VBoxManage, installers)
keep running. Use `taskkill /T` to kill the full tree:

```js
function killActiveScript() {
  if (!activeChild) {
    return
  }
  const pid = activeChild.pid.toString()
  spawn('taskkill', ['/PID', pid, '/T', '/F'])
  activeChild = null
}
```

---

## Code Style Conventions

The codebase is written to be readable by someone learning Node.js.

### Comments explain the "why", not the "what"

```js
// child_process.spawn runs PowerShell as a separate OS process.
// We use spawn (not exec) because spawn delivers output line-by-line
// as the script runs, instead of waiting for it to finish first.
const child = spawn('powershell', args)
```

### One operation per line — no clever one-liners

```js
// Good
const pid = activeChild.pid.toString()
spawn('taskkill', ['/PID', pid, '/T', '/F'])

// Avoid
spawn('taskkill', ['/PID', activeChild.pid.toString(), '/T', '/F'])
```

### async/await instead of .then() chains

```js
// Good — reads like synchronous code
async function showCloseWarning() {
  const result = await dialog.showMessageBox(win, options)
  if (result.response === 1) {
    killActiveScript()
    app.exit(0)
  }
}

// Avoid
dialog.showMessageBox(win, options).then(({ response }) => {
  if (response === 1) { killActiveScript(); app.exit(0) }
})
```

### Named functions instead of arrow functions

```js
// Good — shows up clearly in stack traces and is easier to find
function killActiveScript() { ... }

// Avoid for top-level logic
const killActiveScript = () => { ... }
```

### Always explicit return values

```js
// Good
function buildPowerShellArgs(scriptPath) {
  const args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath]
  return args
}

// Avoid implicit or hidden returns
```

### Use JSDoc on exported functions

Documents what each exported function does, what it expects, and what it returns.
VS Code uses this to provide autocomplete and inline hints.
Internal helpers that are only called within the same file do not need JSDoc.

```js
/**
 * Spawns a PowerShell script and streams its output line by line.
 * @param {string} scriptPath - Absolute path to the .ps1 file
 * @param {string[]} args - Arguments to pass to the script
 * @param {function} onLine - Called with each output line as it arrives
 * @param {function} onDone - Called with the exit code when the script finishes
 */
function runScript(scriptPath, args, onLine, onDone) { ... }
```

### Never swallow errors silently

```js
// Bad — hides bugs completely
try { doSomething() } catch (e) {}

// Good — always log what went wrong and where
try {
  doSomething()
} catch (error) {
  console.error('runScript failed:', error.message)
  onDone(1) // treat as failure
}
```

### Keep a single source of truth for script paths

Instead of hardcoding paths in multiple places, one file defines them all:

```js
// scripts.js
const path = require('path')
const HOST = path.join(__dirname, '..', 'host')

const SCRIPTS = {
  sanityChecks:      path.join(HOST, 'virtualbox-sanity-checks.ps1'),
  installVirtualBox: path.join(HOST, 'virtualbox-install.ps1'),
  createVm:          path.join(HOST, 'create-vm.ps1'),
  provisionVm:       path.join(HOST, 'provision-vm.ps1'),
  cleanup:           path.join(HOST, 'cleanup.ps1'),
}

module.exports = SCRIPTS
```

### Log every IPC message (always, not just dev)

A `handleIpc` wrapper logs every IPC call and reply to `gui.log` unconditionally,
and also mirrors to the VS Code Debug Console in dev mode. This makes the data
flow visible without needing a breakpoint:

```js
// Channels too trivial to log (polled on every page load)
const SILENT_CHANNELS = new Set(['is-dev'])

// Wraps ipcMain.handle to log every call and reply to gui.log.
// Replace ipcMain.handle(...) with handleIpc(...) everywhere.
function handleIpc(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!SILENT_CHANNELS.has(channel)) {
      log.info(`[ipc] recv ${channel}`, args.length ? JSON.stringify(args) : '')
    }
    const result = await handler(event, ...args)
    if (!SILENT_CHANNELS.has(channel)) {
      log.info(`[ipc] reply ${channel}`, JSON.stringify(result))
    }
    return result
  })
}
```

Logs go to `%APPDATA%\FedoraBoxAutomation\logs\gui.log`. In dev mode they also
appear in the VS Code Debug Console. `logger.js` handles both destinations.

### Separate dev and prod behaviour with an isDev flag

Things that help during development (logs, DevTools) should never appear
in a packaged release. One flag at the top of main.js controls everything:

```js
// isDev is true in `npm run dev` and false in `npm start` (NODE_ENV=production).
// All development-only behaviour is gated behind this flag.
const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged

if (isDev) {
  // Opens the browser DevTools panel so you can inspect the React renderer
  win.webContents.openDevTools()
}
```

### Split into small focused files

Each file does one thing and can be read top to bottom without jumping around.

