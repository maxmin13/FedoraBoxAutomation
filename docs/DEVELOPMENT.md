# Development Guide

## Running the App

```powershell
cd app
npm install   # downloads all dependencies into app/node_modules/
npm run dev   # starts Vite + Electron
```

A desktop window opens. No browser needed — Electron has Chromium built in.

### When to re-run npm install

You must run `npm install` again whenever:

- You pull changes from git that updated `package.json`
- You get an error like `Cannot find module '...'` — it means a package is listed in `package.json` but not yet downloaded
- A new dependency was added to the project (you will usually see a note about this in the PR or commit message)

You do **not** need to re-run it just to restart the app — once installed, packages stay in `node_modules/` until you delete them.

---

## Tests

See [docs/TESTING.md](TESTING.md) for install instructions, run commands, and guidance on adding new tests for all three suites (Pester, bats-core, Vitest).

---

## Debugging in VS Code

Debugging this app means debugging two separate processes at the same time.
Each needs its own debugger.

### The two processes

| Process | What runs there | How to debug |
|---------|----------------|--------------|
| **Main process** | `app/electron/*.js` — Node.js code that spawns PowerShell, handles IPC, creates the window | VS Code Node.js debugger |
| **Renderer process** | `app/src/**/*.tsx` — React code that draws the UI | VS Code Chrome debugger |

They are completely separate. A `console.log` in `main.js` appears in the VS Code
Debug Console, while a `console.log` in a React component appears in the Electron
DevTools window inside the app.

---

### How breakpoints work

Click the red dot to the left of a line number in VS Code. When the code hits
that line, execution pauses and you can inspect every variable at that moment.

**Main process breakpoints** — set them in `main.js`, `ipc-handlers.js`, `script-runner.js`. Useful for:
- Seeing what data arrives from the renderer via IPC
- Checking why a PowerShell script is not launching
- Inspecting the exit code when a script finishes

**Renderer breakpoints** — set them in `.tsx` files. Useful for:
- Checking what state a React component holds
- Seeing what data came back from an IPC call
- Tracing why a button click is not doing what you expect

---

### The data flow — where to put breakpoints

```
User clicks "Run Analysis"
        |
React (SetupPage.tsx)
  -> window.electronAPI.runSanityChecks()   <- breakpoint here to check the call
        |
preload.js
  -> ipcRenderer.invoke('run-sanity-checks')
        |
ipc-handlers.js                             <- breakpoint here to check it arrived
  -> runScript(SCRIPTS.sanityChecks, ...)
        |
script-runner.js                            <- breakpoint here to check spawn args
  -> spawn('powershell', [...])
        |
PowerShell script runs
        |
ipc-handlers.js onDone()                    <- breakpoint here to check the result
  -> resolve({ ok, checks })
        |
React (SetupPage.tsx)                       <- breakpoint here to check what React received
  -> setChecks(result.checks)
```

Place a breakpoint at any step in that chain to see exactly where something goes wrong.

---

### VS Code configurations

Three debug configurations are available in `.vscode/launch.json`.

| Configuration | What it debugs | Breakpoints in |
|--------------|---------------|----------------|
| **Electron: Main Process** | Node.js code | `app/electron/*.js` |
| **Electron: Renderer (React)** | React code | `app/src/**/*.tsx` |
| **Electron: Full Debug** | Both at once | All of the above |

### Steps

1. Start Vite in a terminal:
   ```powershell
   cd app
   npx vite
   ```
2. Press `F5` in VS Code
3. Select **Electron: Full Debug** from the dropdown
4. Set breakpoints in any `.js` or `.tsx` file — they will be hit when the code runs

### Tips

- **Main process logs** appear in the VS Code Debug Console
- **Renderer logs** (`console.log` in React) appear in the Electron DevTools — press `Ctrl+Shift+I` inside the app window to open them
- The `[IPC]` log lines in the Debug Console show every message passing between the main process and React — useful for tracing data flow

---

## Project Structure

```
app/
  electron/           <- Node.js main process (runs on the OS)
    main.js           <- window creation, close warning dialog
    preload.js        <- contextBridge API exposed to React
    ipc-handlers.js   <- handles requests from the renderer
    script-runner.js  <- spawns and kills PowerShell scripts
    scripts.js        <- central registry of .ps1 paths
  src/                <- React renderer (runs in Chromium)
    __tests__/        <- Vitest + React Testing Library tests
      setup.ts        <- loads @testing-library/jest-dom matchers
      CheckCard.test.tsx
      SetupPage.test.tsx
    pages/            <- one component per page
    components/       <- reusable UI components
  package.json
  vite.config.ts
  vitest.config.ts    <- Vitest configuration (jsdom, globals, setupFiles)

vm/
  lib/common.sh       <- shared helpers sourced by all provisioning scripts
  tests/              <- bats-core tests for Bash scripts
    common.bats       <- tests for vm/lib/common.sh
    selinux-config.bats <- tests for vm/setup/selinux-config.sh
  setup/              <- Bash setup scripts
  tools/              <- Bash tool installation scripts
```

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
