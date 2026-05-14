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

### Why this app is different to debug

This app has **two separate programs** running at the same time. You cannot debug them with a single debugger.

| Program | What it is | Files | Where logs appear |
|---------|-----------|-------|-------------------|
| **Main process** | Node.js — the backend. Spawns PowerShell, talks to VirtualBox, handles button requests. | `app/electron/*.js` | VS Code **Debug Console** tab |
| **Renderer process** | React — the frontend. Draws the window. | `app/src/**/*.tsx` | Electron **DevTools** (`Ctrl+Shift+I` inside the app) |

Think of them like a restaurant: the renderer is the dining room (what you see), the main process is the kitchen (where the work happens). They talk through a hatch called IPC. A `console.log` in the kitchen **only appears in the kitchen** — looking in the dining room won't show it.

---

### What a breakpoint does

A breakpoint is a marker you place on a line of code that tells the debugger: "pause here and let me look around."

To set one: click in the **gutter** — the narrow strip to the left of the line numbers. A red dot appears. When the program reaches that line it freezes, and VS Code shows you the value of every variable at that exact moment. Click the red dot again to remove it.

---

### Starting the debugger (step by step)

You must do this in order. Vite must be running before Electron starts.

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

At the top of that panel there is a dropdown. Click it and choose **Electron: Full Debug**.

> **Important:** do not press F5 before doing this. If a `.js` or `.ps1` file is open in the editor, VS Code will launch the wrong debugger.

**Step 4 — Press F5**

Press **F5** or click the green ▶ button. The app window opens. Any breakpoints you have set will now pause execution when reached.

**Step 5 — Stop when done**

Press **Shift+F5** (or the red ■ stop button in the floating toolbar) to end the debug session. Then press `Ctrl+C` in the Vite terminal to stop Vite.

---

### Where to look for logs

| You want to see... | Look here |
|--------------------|-----------|
| Logs from `ipc-handlers.js`, `main.js`, `script-runner.js` | VS Code **Debug Console** tab (bottom panel — switch from Terminal to Debug Console) |
| Logs from React components (`.tsx` files) | Electron **DevTools** — press `Ctrl+Shift+I` inside the app window, then open the **Console** tab |
| The `[IPC]` lines that trace data flowing between processes | VS Code **Debug Console** tab |

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

**Tip:** start at the bottom. Put a breakpoint on `setChecks(result.checks)` and check whether `result` looks right. If it does not, work backwards up the chain until you find where the data went wrong.

---

### Which VS Code configuration to use

Three configurations are available in `.vscode/launch.json`.

| Configuration | Use it when... |
|--------------|----------------|
| **Electron: Full Debug** | Default choice — debugs both processes at once |
| **Electron: Main Process** | You only want breakpoints in `app/electron/*.js` |
| **Electron: Renderer (React)** | You only want breakpoints in `app/src/**/*.tsx` |

---

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
    script-runner.js  <- spawns and kills PowerShell scripts
    scripts.js        <- central registry of .ps1 paths
  src/                <- React renderer (runs in Chromium)
    __tests__/        <- Vitest + React Testing Library tests (jsdom environment)
      setup.ts        <- loads @testing-library/jest-dom matchers
      CheckCard.test.tsx
      SetupPage.test.tsx
    pages/            <- one component per page
      LandingPage.tsx <- lists all registered VMs with start/stop controls
      SetupPage.tsx   <- environment analysis and fix actions
      DocsPage.tsx    <- renders markdown docs from docs/ inside the app
    components/       <- reusable UI components
  package.json
  vite.config.ts
  vitest.config.ts    <- Vitest base config (jsdom, globals, setupFiles)
  vitest.workspace.ts <- workspace: react project (jsdom) + electron project (node)

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
