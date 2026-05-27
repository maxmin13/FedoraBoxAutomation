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
| Unit tests (Electron main) | Vitest (node environment) |
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
    __tests__/
      ipc-handlers.test.js       <- unit tests for parseVmList, parseChecksOutput, get-downloads-path
      script-runner.test.js      <- unit tests for splitChunk, hasActiveScript, killActiveScript
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
      LogsPage.tsx               <- viewer for gui.log and host.log (last 500 lines each)
      DocsPage.tsx               <- renders markdown docs from docs/ inside the app
      VmEditPage.tsx             <- sub-page for a selected VM: provision, share folder, logs
      ShareFolderPage.tsx        <- shared folder management for a selected VM
    components/
      NavBar.tsx                 <- My VMs / Setup / Create VM / Console / Docs navigation
      CheckCard.tsx              <- pass/warn/fail result card
    __tests__/
      CheckCard.test.tsx
      SetupPage.test.tsx
      CreateVmPage.test.tsx
      LogsPage.test.tsx
      setup.ts                   <- jest-dom matchers setup
  __mocks__/
    electron.js                  <- stub used by React tests (ipcMain.handle, app.getPath)
  package.json                   <- main: "electron/main.js"
  vite.config.ts                 <- Vite + jsdom config for React tests
  vitest.workspace.ts            <- splits tests: react (jsdom) vs electron (node)
  tailwind.config.js
  postcss.config.js
  tsconfig.json
```

- **Main process** (`main.js`): Node.js running inside Electron. Uses `child_process.spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', script])` to run each `.ps1`. Streams `stdout`/`stderr` line-by-line over IPC to the renderer.
- **Renderer**: React + TypeScript, bundled by Vite. Each pipeline step is a page component managed by React state.
- **Security boundary** (`preload.js`): Runs in a privileged context before the renderer loads. Uses Electron's `contextBridge` to expose a safe, explicit `window.electronAPI` object to React. The renderer can only call the methods listed in `preload.js` — it has no direct access to Node.js or Electron APIs.
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
  - `read-log` — reads the last 500 lines of `gui.log` or `host.log` from `%APPDATA%\FedoraBoxAutomation\logs\`; returns `{ ok, content }`; excluded from IPC logging to prevent a feedback loop
  - `open-log-dir` — opens a log folder in the native file explorer; `'app'` opens `%APPDATA%\FedoraBoxAutomation\logs\`; `'vbox'` opens `%USERPROFILE%\VirtualBox VMs`; uses `shell.openPath()`
  - `log-error` — receives a renderer crash message + stack from `ErrorBoundary` and writes it to `gui.log`
  - `check-vm-ready` — checks whether a named VM is running and whether Guest Additions are installed; returns `{ ok, running, guestAdditions, version? }`
  - `load-vm-credentials` — reads credentials for a named VM from `.credentials/credentials.json`; returns `{ ok, username?, password?, desktopUsername? }`
  - `save-vm-credentials` — writes credentials for a named VM to `.credentials/credentials.json`; returns `{ ok }`
  - `run-share-folder` — runs `share-folder.ps1` with the given VM name and folder path; streams output; returns `{ ok }`
  - `pick-folder` — opens a native folder picker; returns `{ folderPath }` or `{ folderPath: null }` if cancelled
- **Streaming channels** (push from main to renderer via `win.webContents.send`):
  - `script-line` — one output line as it arrives (source: `stdout` | `stderr`)
  - `script-done` — exit code when the script finishes

---

## How to Run

All commands run from the `app/` directory.

| Command | What it does |
|---------|-------------|
| `npm run dev` | Starts Vite dev server + Electron with hot reload. DevTools open automatically. |
| `npm start` | Production build (`vite build`) then launches Electron with `NODE_ENV=production`. |
| `npm test` | Runs all Vitest suites once (Electron node + React jsdom). |
| `npm run test:watch` | Same but re-runs on file change — useful during development. |

In dev mode (`npm run dev`), Vite serves the renderer at `http://localhost:5173`. Electron waits for that port to be ready (`wait-on`) before opening the window, so the React renderer gets full hot-module replacement.

---

## Screens / Pipeline Steps

| # | Screen | Script | Key inputs |
|---|--------|--------|------------|
| 1 | **My VMs** | none | Lists all registered VMs; Start/Stop/Delete buttons per VM |
| 2 | **Setup** | `host/virtualbox-sanity-checks.ps1` | Run Analysis button — master/detail split: left panel lists all checks as compact rows, right panel shows detail + fix instructions for the selected check; first failing check is auto-selected on completion; analysis results persist when navigating away and back |
| 3 | **Create VM** | `host/create-vm.ps1` | 4-step wizard (Identity → Hardware → Options → Confirm); ISO field opens a native file picker (shows filename only); streams live output; wizard state persists when navigating away and back |
| 4 | **Console** | none | Sidebar to switch between `gui.log` and `host.log`; shows last 500 lines; auto-scrolls to newest entry; Refresh button; "Open folder" buttons to open the app log folder and the VirtualBox VMs folder in Explorer |
| 5 | **Docs** | none | Sidebar of markdown files rendered with react-markdown (dev mode only) |

A top navigation bar shows which page is active. The Docs tab is hidden in production builds.

**State persistence:** `SetupPage` and `CreateVmPage` are kept always-mounted and hidden with `display: none` (via a wrapping `<div>` in `App.tsx`) so their React state — analysis results, wizard step, log lines — survives navigation. Other pages are unmounted when inactive.

---

## Sanity Checks — JSON Output for the GUI

`virtualbox-sanity-checks.ps1` accepts a `-Json` switch. When set, it writes a JSON array to stdout instead of coloured text. The `run-sanity-checks` IPC handler always passes this flag.

Each element has four fields: `id`, `label`, `status` (`"pass"` | `"warn"` | `"fail"`), and `detail`. The GUI renders a summary bar (pass/warn/fail counts) plus a master/detail split layout: the left panel lists all checks as compact badge + label rows; clicking a row loads that check's `detail` text and fix action into the right panel. The first failing check is auto-selected when analysis completes so the most urgent fix is immediately visible.

`parseChecksOutput` in `ipc-handlers.js` handles two edge cases: DISM progress noise lines that appear before the JSON, and the PowerShell `ConvertTo-Json` quirk that emits a bare object instead of a one-element array when there is only one result.

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
| CPU virtualisation | Enabled | Disabled (check unreliable, may be false negative) | — |
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

### Electron main process — `app/electron/__tests__/*.test.js`

Uses **Vitest** in the `node` environment (no DOM). `vitest.workspace.ts` splits the suite into two projects so each runs with the right environment:

```
vitest.workspace.ts
  react    -> src/__tests__/**   environment: jsdom   (inherits vitest.config.ts)
  electron -> electron/__tests__/**  environment: node
```

`__mocks__/electron.js` provides a minimal stub (`ipcMain.handle`, `app.getPath`) used by the React tests. The Electron tests cannot use `vi.mock('electron')` to reach transitive CJS `require()` calls, so the `get-downloads-path` handler test injects a stub directly into `require.cache` before reloading the module.

| Test file | Module under test | Key behaviours covered |
|-----------|------------------|----------------------|
| `ipc-handlers.test.js` | `ipc-handlers.js` | `parseVmList` — single/multiple VMs, spaces in names, empty output, malformed lines; `parseChecksOutput` — clean JSON, noise lines before/after, single-element array, bare-object guard, missing array error, stderr in error message; `get-downloads-path` handler returns OS downloads path; `open-log-dir` handler — success, correct paths for `'app'` and `'vbox'`, error string from `shell.openPath`, unknown key |
| `script-runner.test.js` | `script-runner.js` | `splitChunk` — LF and CRLF splitting, empty/whitespace filtering, trailing newline, stderr tagging, Buffer input; `hasActiveScript` — false when idle; `killActiveScript` — no-op when no script running |

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
| `SetupPage.test.tsx` | `SetupPage` | idle prompt, button disabled while running, left-panel rows rendered, summary counts, "Ready"/"Fix" banners, error message, auto-selection of first failing check, clicking a row loads detail in right panel, "No action needed" for pass checks, panel switching |
| `CreateVmPage.test.tsx` | `CreateVmPage` | submit button state, ISO picker fills via click (read-only input), name conflict warning + "Recreate VM" label, confirm page shows filename only, "Creating..." while running, live log lines, success/failure banners, Show/Hide log toggle |
| `LogsPage.test.tsx` | `LogsPage` | gui.log selected by default, log content rendered, empty/error states, switching between logs, Refresh button, Refresh button disabled while loading, "App logs" and "VirtualBox VMs" folder buttons visible, each calls `openLogDir` with the correct key |

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

- Fixed top navigation bar with 5 tabs (My VMs, Setup, Create VM, Console, Docs); Docs is hidden in production; active tab highlighted
- Main content area: SetupPage and CreateVmPage fill the viewport with `h-full` and manage their own internal layout (no outer scroll); other pages scroll through the main area as needed
- SetupPage uses a left/right split — left panel is a fixed-width check list, right panel fills remaining width with detail + fix content; both panels use `overflow-hidden` so no scrollbars appear at the fixed 1100×750 window size

---

## App Close Behaviour During Script Execution

Intercept the window close event and warn the user if a script is running.

### Strategy by script type

| Script | On close |
|--------|----------|
| `virtualbox-sanity-checks.ps1` | Kill silently — read-only, safe to abort |
| `virtualbox-install.ps1` | Block close, show warning dialog |
| `create-vm.ps1` | Block close, show warning dialog |
| `provision-script.ps1` / `provision-setup.ps1` | Block close, show warning dialog |

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
  runProvisionScript: path.join(HOST, 'provision-script.ps1'),
  runProvisionSetup:  path.join(HOST, 'provision-setup.ps1'),
}

module.exports = SCRIPTS
```

### Log every IPC message (always, not just dev)

A `handleIpc` wrapper logs every IPC call and reply to `gui.log` unconditionally,
and also mirrors to the VS Code Debug Console in dev mode. This makes the data
flow visible without needing a breakpoint:

```js
// Channels excluded from logging.
// 'is-dev' is polled on every page load; 'read-log' returns full file content —
// logging it back to gui.log would create a feedback loop.
const SILENT_CHANNELS = new Set(['is-dev', 'read-log'])

// Wraps ipcMain.handle to log every call and reply to gui.log.
// util.inspect is used instead of JSON.stringify so Windows paths with
// backslashes are not double-escaped in the log file.
function handleIpc(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!SILENT_CHANNELS.has(channel)) {
      log.info(`[ipc] recv ${channel}`, args.length ? inspect(args, { depth: 3, breakLength: Infinity }) : '')
    }
    const result = await handler(event, ...args)
    if (!SILENT_CHANNELS.has(channel)) {
      log.info(`[ipc] reply ${channel}`, inspect(result, { depth: 3, breakLength: Infinity }))
    }
    return result
  })
}
```

Two log files are written to `%APPDATA%\FedoraBoxAutomation\logs\`:

| File | Written by | Content |
|------|-----------|---------|
| `gui.log` | `logger.js` | Every IPC call and reply, plus any errors from the main process |
| `host.log` | PowerShell `Start-Transcript` | Full transcript of every `.ps1` script run |

In dev mode `gui.log` entries also appear in the VS Code Debug Console. `logger.js` handles both destinations.

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

