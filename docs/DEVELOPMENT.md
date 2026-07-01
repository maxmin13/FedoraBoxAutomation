# Development Guide

## Project Structure

```
app/
  __mocks__/
    electron.js       <- stubs ipcMain so Electron files can be required in tests
  electron/           <- Node.js main process (runs on the OS)
    __tests__/        <- Vitest pure-logic tests (node environment)
      ipc-handlers.test.js
      script-runner.test.js
    main.js           <- window creation, close warning dialog
    preload.js        <- contextBridge API exposed to React
    ipc-handlers.js   <- handles requests from the renderer
    logger.js         <- file logger; writes to %APPDATA%\FedoraBoxAutomation\logs\gui.log
    script-runner.js  <- spawns and kills PowerShell scripts
    scripts.js        <- central registry of .ps1 paths
  src/                <- React renderer (runs in Chromium)
    __tests__/        <- Vitest + React Testing Library tests (jsdom environment)
      setup.ts           <- loads @testing-library/jest-dom matchers
      CheckCard.test.tsx
      NavBar.test.tsx
      VmRunningBadge.test.tsx
      LogPanel.test.tsx
      ProgressBar.test.tsx
      SetupPage.test.tsx
      LandingPage.test.tsx
      CreateVmPage.test.tsx
      LogsPage.test.tsx
      DocsPage.test.tsx
      VmDetailPage.test.tsx
      ProvisionPage.test.tsx
      ShareFolderPage.test.tsx
      ShareLogsPage.test.tsx
    pages/            <- one component per page
      LandingPage.tsx     <- lists all registered VMs with start/stop controls
      SetupPage.tsx       <- environment analysis and fix actions
      CreateVmPage.tsx    <- form to configure and create a new Fedora VM
      LogsPage.tsx        <- viewer for gui.log and host.log (last 500 lines each)
      DocsPage.tsx        <- renders markdown docs from docs/ inside the app
      VmDetailPage.tsx    <- sub-page for a selected VM: overview, tools tab, share folder, share logs
      PerformancePage.tsx <- CPU/RAM/disk usage and diagnostics for a running VM
      ProvisionPage.tsx   <- tool-by-tool provisioning: script list, run controls, banners
      ShareFolderPage.tsx <- shared folder management for a selected VM
      ShareLogsPage.tsx   <- guest-log sync setup for a selected VM
    components/       <- reusable UI components
  package.json
  vite.config.ts
  vitest.config.ts    <- Vitest base config (jsdom, globals, setupFiles)
  vitest.workspace.ts <- workspace: react project (jsdom) + electron project (node)

vm/
  lib/common.sh       <- shared helpers sourced by all provisioning scripts
  tests/              <- bats-core tests for Bash scripts (31 files, one per script)
    common.bats       <- tests for vm/lib/common.sh
    selinux-config.bats <- tests for vm/setup/selinux-config.sh
    java.bats         <- tests for vm/tools/languages/java.sh
    node.bats         <- tests for vm/tools/languages/node.sh
    ...               <- one .bats file per tool/setup script
  setup/              <- Bash setup scripts
  tools/              <- Bash tool installation scripts
```

---

## Running the App

```powershell
cd app
npm install   # downloads all dependencies into app/node_modules/
npm run dev   # starts Vite + Electron (development mode)
```

A desktop window opens. No browser needed — Electron has Chromium built in.

---

## Building the Executable

Two commands produce distributable builds from `app/`:

| Command | Output | When to use |
|---------|--------|-------------|
| `npm run dist:zip` | `dist-installer/FedoraBox-Automation-<v>-win-x64.zip` | Any machine — no special privileges needed |
| `npm run dist` | `dist-installer/FedoraBox-Automation-Setup-<v>.exe` (NSIS installer) | Requires Developer Mode or Administrator |

### `npm run dist:zip` — portable zip (recommended for most releases)

```powershell
cd app
npm run dist:zip
```

What it does:
1. Runs `vite build` to compile the React renderer into `dist/`
2. Runs `electron-builder --dir` to package the app into `dist-installer/win-unpacked/` (the full self-contained app)
3. Zips `win-unpacked/` into `dist-installer/FedoraBox-Automation-<version>-win-x64.zip` using PowerShell

The zip requires no installation — users extract it and run `FedoraBox Automation.exe` directly.

> **Note:** electron-builder downloads a `winCodeSign` archive during step 2 and fails to extract it (it contains macOS symlinks that Windows blocks without Developer Mode). The script ignores this failure because `win-unpacked/` is already created before the error occurs.

### `npm run dist` — NSIS installer

```powershell
cd app
npm run dist
```

Produces a proper Windows installer (`FedoraBox-Automation-Setup-<version>.exe`) with Start Menu shortcuts and uninstall support.

**Prerequisite:** enable Developer Mode once before running this command:

> Windows Settings → System → For developers → Developer Mode → On

Without it, the build fails when electron-builder tries to extract the `winCodeSign` archive (which contains macOS symlinks). Developer Mode grants the symlink creation privilege to non-Administrator processes.

### When to build

- Build before every release tag
- Do **not** commit `dist-installer/` — it is gitignored
- Bump `"version"` in `app/package.json` before building so the filename includes the correct version number

### When to re-run npm install

You must run `npm install` again whenever:

- You pull changes from git that updated `package.json`
- You get an error like `Cannot find module '...'` — it means a package is listed in `package.json` but not yet downloaded
- A new dependency was added to the project (you will usually see a note about this in the PR or commit message)

You do **not** need to re-run it just to restart the app — once installed, packages stay in `node_modules/` until you delete them.

---

## Adding a New IPC Call

When you need the React app to call something in Node.js:

1. **`ipc-handlers.js`** — add a new `handleIpc('channel-name', async () => { ... })` call inside `registerIpcHandlers()`
2. **`preload.js`** — expose the call via `contextBridge`: `myMethod: () => ipcRenderer.invoke('channel-name')`
3. **`electron.d.ts`** — add the TypeScript type for the new method so VS Code autocompletes it in React
4. **React component** — call it with `window.electronAPI.myMethod()`

---

## Adding a New PowerShell Script

1. Add the script path to `app/electron/scripts.js`
2. Add an IPC handler in `app/electron/ipc-handlers.js` that calls `runScript(SCRIPTS.myScript, ...)`
3. Expose it in `preload.js` and `electron.d.ts`
4. Call it from the relevant React page

---

## Adding a New Bash Script

Bash scripts live under `vm/` and run inside the Fedora VM via `VBoxManage guestcontrol`.

1. **Create the file** under the appropriate subfolder:
   - `vm/setup/` — one-time OS configuration (SELinux, locale, users)
   - `vm/tools/` — tool installations (git, Java, Docker, etc.)

2. **Start with the standard header** — every script must source the shared helpers:

   ```bash
   #!/bin/bash
   set -euo pipefail
   source "$(dirname "$0")/../lib/common.sh"
   ```

   `common.sh` provides structured logging functions used across all scripts.

3. **Use `log_info`, `log_warn`, `log_error`, and `STEP`** instead of plain `echo`:

   ```bash
   STEP "curl"                              # section header — marks a major phase
   log_info "Installing curl..."            # normal progress
   log_warn "curl already installed, skipping"  # unexpected but non-fatal
   log_error "curl installation failed"     # failure — script will exit via trap
   ```

   Each call writes a timestamped line to stdout and to `/var/log/fedora-box-automation.log` inside the VM:

   ```
   2026-05-30 16:08:19 [STEP ] eclipse.sh  ===[ Eclipse ]===
   2026-05-30 16:08:19 [INFO ] eclipse.sh  Downloading Eclipse 2026-03 ...
   2026-05-30 16:08:52 [WARN ] eclipse.sh  Partial download detected, retrying
   2026-05-30 16:08:55 [ERROR] eclipse.sh  Command failed (exit 2, line 39): tar -xf ...
   ```

   | Level | Function | When to use |
   |-------|----------|-------------|
   | `STEP` | `STEP "label"` | Start of a major section — one per logical phase of the script |
   | `INFO` | `log_info "msg"` | Normal progress — something completed or is in progress |
   | `WARN` | `log_warn "msg"` | Something unexpected but non-fatal — script continues |
   | `ERROR` | `log_error "msg"` | A failure — the ERR trap will call this automatically for any unhandled non-zero exit |

   `log_error` also emits a plain `ERROR: message` line (without timestamp) so the GUI output scanner can extract the error detail for the failure banner.

4. **Make it idempotent** — the script may be run more than once. Check before acting:

   ```bash
   if command -v curl &>/dev/null; then
     log "curl already installed, skipping"
   else
     dnf install -y curl
   fi
   ```

5. **Never prompt for input** — scripts run non-interactively via guestcontrol. All `dnf` calls must include `-y`.

6. **Set the file to LF line endings** — CRLF causes a "file not found" / exit 126 error on Linux. In VS Code, click the `CRLF` indicator in the bottom-right status bar and switch it to `LF` before saving.

7. **Call it from a PowerShell script** if it needs to be triggered from the Electron GUI — Bash scripts are never wired into `ipc-handlers.js` directly. The flow is: IPC handler → `.ps1` → `VBoxManage guestcontrol` → `.sh` inside the VM. Add the call inside the relevant script under `host/`, typically `provision-script.ps1`.

8. **Add a bats test** in `vm/tests/` — see [docs/TESTING.md](TESTING.md) for how to write and run bats tests.

---

## Tests

See [docs/TESTING.md](TESTING.md) for install instructions, run commands, and guidance on adding new tests for all three suites (Pester, bats-core, Vitest).

---

## General Development Tips

These apply whether you started the app with `npm run dev` or via the VS Code debugger.

### After editing files — what needs a restart?

| File type | Restart needed? | Why |
|-----------|----------------|-----|
| `app/electron/*.js` (`ipc-handlers.js`, `main.js`, `preload.js`, …) | **Yes** — stop and restart the app or debugger | Main process is loaded once at startup; changes are not picked up until the next launch |
| `app/src/**/*.tsx` / `.ts` (React components, hooks) | **No** | Vite hot-reloads the renderer automatically |
| `host/*.ps1` / `vm/*.sh` (PowerShell / Bash scripts) | **No** | Scripts are spawned fresh from disk on every button press |

### Where to look for logs

| You want to see... | Look here |
|--------------------|-----------|
| IPC calls, replies, and Electron main process errors | **`gui.log`** |
| Logs from React components (`.tsx` files) | Electron **DevTools** — press `Ctrl+Shift+I` inside the app window, then open the **Console** tab |
| PowerShell script output, shell script output, script markers | **`host.log`** |
| Renderer crashes caught by the error boundary | **`gui.log`** (forwarded via `log-error` IPC) |

Both files live in `%APPDATA%\FedoraBoxAutomation\logs\`. To open the folder: paste that path into the Windows File Explorer address bar, or use the **App logs** button on the Console page.

#### host.log line tags

Every line in `host.log` carries a `[TAG]` prefix so you can tell at a glance which tier produced it:

| Tag | Source | Example |
|-----|--------|---------|
| `[APP]` | Electron (`ipc-handlers.js`) — script lifecycle markers | `[APP] --- START provision-script.ps1 ---` |
| `[PS ]` | PowerShell stdout — `Write-Host` calls in `host/*.ps1` | `[PS ]   Uploading eclipse.sh... OK` |
| `[SH ]` | Bash guest script stdout — `log_info`/`log_warn`/`log_error` lines from `common.sh` (detected by their `YYYY-MM-DD HH:MM:SS [LEVEL]` timestamp prefix) | `[SH ] 2026-05-30 16:08:20 [INFO ] eclipse.sh  Downloading Eclipse 2026-03 ...` |
| `[ERR]` | PowerShell/script stderr | `[ERR] VBoxManage: error: Could not authenticate` |

Note: because VBoxManage buffers guest stdout until the script exits, `[SH ]` lines appear in a batch after the guest script finishes, not in real time.

---

## Debugging in VS Code

### Why this app is different to debug

This app has **four separate moving parts** and each one is debugged differently.

| Part | What it is | Files | Where logs appear |
|------|-----------|-------|-------------------|
| **Electron main process** | Node.js — the backend. Handles IPC requests, spawns PowerShell, talks to VirtualBox. | `app/electron/*.js` | VS Code **Debug Console** tab |
| **React renderer** | The UI — draws the window, buttons, and pages. | `app/src/**/*.tsx` | Electron **DevTools** (`Ctrl+Shift+I` inside the app) |
| **PowerShell scripts** | Run on the Windows host — control VirtualBox via `VBoxManage`. | `host/*.ps1` | VS Code terminal (when run directly) or Debug Console (when spawned by the app) |
| **Bash scripts** | Run inside the Fedora VM — install tools, configure the OS. | `vm/**/*.sh` | VM terminal output, or the IPC log stream in the Debug Console |

Think of them like a restaurant: the renderer is the dining room (what you see), the main process is the kitchen (where the work happens), the PowerShell scripts are the delivery drivers (fetching things from outside), and the Bash scripts are the prep cooks working in a separate building (the VM). A `console.log` in the kitchen **only appears in the kitchen** — looking in the dining room won't show it.

---

### What a breakpoint does

A breakpoint is a marker you place on a line of code that tells the debugger: "pause here and let me look around."

To set one: click in the **gutter** — the narrow strip to the left of the line numbers. A red dot appears. When the program reaches that line it freezes, and VS Code shows you the value of every variable at that exact moment. Click the red dot again to remove it.

---

### Debugging each part of the project

The project has four types of files and each one is debugged differently.

---

#### 1. Electron main process — `app/electron/*.js`

This is where IPC handlers, script launching, and VirtualBox calls live.

**Starting the debugger — do this in order:**

**Step 1 — Start Vite**

Open a terminal and run:

```powershell
cd app
npx vite
```

Leave this terminal open. Wait until you see `Local: http://localhost:5173` before moving on.

**Step 2 — Open the Run and Debug panel**

Press `Ctrl+Shift+D` in VS Code. A panel appears on the left side of the window.

**Step 3 — Select the debug configuration**

At the top of that panel there is a dropdown. Click it and choose one of the three configurations:

| Configuration | Use it when... |
|--------------|----------------|
| **Electron: Full Debug** | Default choice — debugs both processes at once |
| **Electron: Main Process** | You only want breakpoints in `app/electron/*.js` |
| **Electron: Renderer (React)** | You only want breakpoints in `app/src/**/*.tsx` |

For most cases, choose **Electron: Full Debug**.

> **Important:** do not press F5 before doing this. If a `.js` or `.ps1` file is open in the editor, VS Code will launch the wrong debugger.

**Step 4 — Press F5**

Press **F5** or click the green ▶ button. The app window opens. Any breakpoints you have set will now pause execution when reached.

**Step 5 — Stop when done**

Press **Shift+F5** (or the red ■ stop button in the floating toolbar) to end the debug session. Then press `Ctrl+C` in the Vite terminal to stop Vite.

**Setting breakpoints:**

- Click in the gutter next to any line number in `ipc-handlers.js`, `main.js`, etc. to set a red-dot breakpoint.
- When the app hits that line it freezes and VS Code shows you every variable's value.
- Logs appear in the **Debug Console** tab at the bottom of VS Code.

---

#### 2. React renderer — `app/src/**/*.tsx`

This is the UI — buttons, status badges, pages.

There are two ways to debug React code. Pick whichever feels more comfortable.

##### Option A — Electron DevTools (built-in, no setup)

DevTools is a panel built into Electron, identical to the Chrome DevTools you may have used in a browser.

**Step 1 — Start the app**

Follow the same steps as section 1 (start Vite, then press F5 in VS Code).

**Step 2 — Open DevTools**

While the app window is open, press **Ctrl+Shift+I**. A panel appears — either docked to the side of the window or in a separate window.

**Step 3 — Find your file**

Click the **Sources** tab at the top of DevTools. On the left you will see a file tree. Navigate to:

```
top > localhost:5173 > src > pages > YourPage.tsx
```

Click the file to open it.

**Step 4 — Set a breakpoint**

Click on a line number in the left margin of the file. A blue marker appears. When the app reaches that line it will freeze and DevTools will show you the value of every variable.

**Step 5 — Read logs**

Click the **Console** tab. Any `console.log(...)` calls inside React components appear here.

##### Option B — VS Code breakpoints (if you prefer staying in the editor)

This uses the same **Electron: Full Debug** launch config as section 1, so both processes are debugged at the same time.

**Step 1 — Start Vite and the debugger**

Same as section 1: start Vite in a terminal, select **Electron: Full Debug** in the Run and Debug panel, then press **F5**.

**Step 2 — Open a `.tsx` file and set a breakpoint**

Open any file under `app/src/` in VS Code and click in the gutter to place a red-dot breakpoint, exactly like you would for a `.js` file.

**Step 3 — Trigger the code**

Click the relevant button or navigate to the relevant page in the app window. VS Code will pause at your breakpoint and show variable values in the left panel under **Variables**.

> **Note:** VS Code maps breakpoints back to the original TypeScript source via source maps. If a breakpoint appears as a hollow grey circle instead of a solid red dot, it means the source map has not loaded yet — wait a second and try again, or reload the app window with **Ctrl+R**.

---

#### 3. PowerShell scripts — `host/*.ps1`

These run on the Windows host and control VirtualBox.

**Step 1 — Install the PowerShell extension**

Open the Extensions panel in VS Code (`Ctrl+Shift+X`). Search for **PowerShell** and install the one published by Microsoft. You only need to do this once.

**Step 2 — Open the script and set a breakpoint**

Open the `.ps1` file you want to debug and click in the gutter to the left of a line number. A red dot appears. Breakpoints also work inside dot-sourced files like `host/common.ps1`.

**Step 3 — Select the right launch config**

Press `Ctrl+Shift+D` to open the Run and Debug panel. Click the dropdown at the top and choose the appropriate config:

| Configuration | Use it when... |
|--------------|----------------|
| **PowerShell: Launch Current File** | The script needs no parameters (e.g. `virtualbox-sanity-checks.ps1`) |
| **PowerShell: provision-script (debug)** | Debugging `provision-script.ps1` — parameters are pre-filled in `.vscode/launch.json` |

> **Important:** do not rely on just pressing F5 with a `.ps1` file open. VS Code will use whichever config is currently selected in the dropdown. If "PowerShell: Launch Current File" is selected and the script requires parameters, it will start running without them and immediately prompt for input at the terminal instead of hitting your breakpoint.

**Step 4 — Edit parameters if needed (provision-script only)**

Before pressing F5 for the `provision-script` config, open `.vscode/launch.json` and update the `-VmName`, `-VmPass`, `-LoginUser`, and `-ScriptRelPath` values to match your VM and the script you want to test.

**Step 5 — Press F5**

VS Code opens a PowerShell Debug Terminal and runs the script. When it reaches your breakpoint it freezes and the **Variables** panel on the left shows every variable's current value.

Use the toolbar buttons to step through the code:
- **F10** — run the current line and move to the next one
- **F11** — step into a function call to see what happens inside it
- **Shift+F11** — step out of the current function back to the caller
- **F5** — continue running until the next breakpoint

**Step 6 — Stop when done**

Press **Shift+F5** or close the terminal.

> **Note:** this approach runs the script directly in VS Code, independently of the Electron app. The Electron app spawns `.ps1` scripts as child processes and VS Code cannot attach to those automatically. Use the dedicated launch configs above to reproduce the same execution path with a live debugger attached.

---

#### 4. Bash scripts — `vm/*.sh`

These run inside the Fedora VM. There is no interactive debugger — you debug by making the shell print what it is doing.

**Step 1 — Open the script**

Open the `.sh` file you want to debug, for example `vm/provision.sh`.

**Step 2 — Add `set -x` near the top**

On the line immediately after `#!/bin/bash`, add:

```bash
set -x
```

Your file should now start like this:

```bash
#!/bin/bash
set -x
```

`set -x` tells the shell to print every command before it runs it, prefixed with `+`. This lets you see exactly which line is executing and what values variables have at that moment.

**Step 3 — Run the script**

Run the script as you normally would — either directly inside the VM or via the Electron app. The output will now include a trace like this:

```
+ dnf install -y git
+ echo "Installing Java..."
```

If the script crashes, the last `+` line in the output is where it failed.

**Step 4 — Remove `set -x` when done**

Delete the `set -x` line before committing. It produces a large amount of noise and makes normal output hard to read.

> **Tip:** if you only want to trace a specific section rather than the whole script, wrap just that section:
> ```bash
> set -x
> # commands to trace
> set +x
> ```
> `set +x` turns tracing back off.

---

### Where to put breakpoints

```
User clicks "Run Analysis"
        |
React (SetupPage.tsx)
  -> window.electronAPI.runSanityChecks()   <- (renderer) is the call being made?
        |
preload.js                                  <- bridge; rarely needs a breakpoint
        |
ipc-handlers.js                             <- (main) did it arrive? what are the args?
  -> runScript(SCRIPTS.sanityChecks, ...)
        |
script-runner.js                            <- (main) what command is being spawned?
  -> spawn('powershell', [...])
        |
PowerShell script runs
        |
ipc-handlers.js onDone()                    <- (main) what exit code and parsed result?
  -> resolve({ ok, checks })
        |
React (SetupPage.tsx)                       <- (renderer) what did React receive?
  -> setChecks(result.checks)
```

---

## Known Pitfalls

### VirtualBox session lock after `controlvm poweroff`

When a script uses `controlvm poweroff` and then needs to call `startvm`, the `VirtualBoxVM.exe` window process continues to hold the VirtualBox session lock for several seconds after the VM state reaches `poweroff`. During that window, `startvm` blocks for ~40 seconds per attempt before returning an error, and a short retry loop will time out before the lock is released.

**Fix:** After confirming `VMState=poweroff`, kill the `VirtualBoxVM.exe` process for that VM before attempting `startvm`:

```powershell
Get-CimInstance Win32_Process -Filter "Name='VirtualBoxVM.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match [regex]::Escape($vmName) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
```

Match by VM name in the command line so only the correct window is killed. Never kill `VBoxSVC.exe` (the background service) or `VirtualBox.exe` (the manager window) — neither holds the per-VM session lock.

**Tip:** start at the bottom. Put a breakpoint on `setChecks(result.checks)` and check whether `result` looks right. If it does not, work backwards up the chain until you find where the data went wrong.
