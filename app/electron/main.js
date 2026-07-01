// ============================================================
//  main.js — Electron main process
//  This is the entry point for the app. It creates the window
//  and wires up all the IPC handlers.
// ============================================================

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { registerIpcHandlers } = require('./ipc-handlers')
const { killActiveScript, hasActiveScript } = require('./script-runner')
const log = require('./logger')

// Suppress "Gpu Cache Creation failed: -2" — Chromium tries to create a GPU
// shader disk cache in the user-data dir; disabling it silences the warning
// with no visible effect on this app (no WebGL / heavy canvas usage).
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

// Prevent a second instance from opening — focus the existing window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

/**
 * Creates the main browser window and loads the renderer.
 */
function createWindow() {
  log.info('[main] creating window')

  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    resizable: false,
    backgroundColor: '#18181b', // zinc-900 — prevents white flash on load
    webPreferences: {
      // preload.js runs before the renderer and safely exposes Node APIs
      preload: path.join(__dirname, 'preload.js'),

      // Never enable nodeIntegration in the renderer.
      // It would let any web code access the filesystem and OS — a security risk.
      nodeIntegration: false,

      // contextIsolation keeps the renderer sandboxed.
      // The only bridge to Node is what we explicitly expose in preload.js.
      contextIsolation: true,
    },
  })

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  } else {
    win.loadURL('http://localhost:5173')
  }

  // Intercept the close event to warn the user if a script is running
  win.on('close', (event) => {
    if (!hasActiveScript()) return
    event.preventDefault()
    win.webContents.send('show-close-warning')
  })

  return win
}

// A second launch attempt arrives here — bring the existing window to front.
app.on('second-instance', () => {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) {
    const win = wins[0]
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

// 'ready' fires when Electron has finished initialising.
// You must not create windows before this event.
app.whenReady().then(() => {
  log.info('[main] app ready')
  const win = createWindow()

  // Register all ipcMain.handle() calls so the renderer can talk to main
  registerIpcHandlers(win)

  ipcMain.handle('close-warning-response', (_event, forceQuit) => {
    if (forceQuit) {
      log.warn('[main] force quit while script was running')
      killActiveScript()
      app.exit(0)
    } else {
      log.info('[main] user chose to keep waiting')
    }
  })
})

// On Windows and Linux, closing all windows quits the app
app.on('window-all-closed', () => {
  log.info('[main] all windows closed — quitting')
  app.quit()
})

app.on('will-quit', () => {
  log.info('[main] will-quit')
})

// Renderer crash or kill
app.on('render-process-gone', (_event, _webContents, details) => {
  log.error('[main] render-process-gone', JSON.stringify(details))
})

// GPU or utility process crash
app.on('child-process-gone', (_event, details) => {
  log.error('[main] child-process-gone', JSON.stringify(details))
})

// Uncaught exceptions in the main process
process.on('uncaughtException', (err) => {
  log.error('[main] uncaughtException:', err.stack || err.message)
})

process.on('unhandledRejection', (reason) => {
  log.error('[main] unhandledRejection:', reason instanceof Error ? reason.stack : String(reason))
})
