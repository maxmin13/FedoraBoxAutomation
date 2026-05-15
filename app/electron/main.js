// ============================================================
//  main.js — Electron main process
//  This is the entry point for the app. It creates the window
//  and wires up all the IPC handlers.
// ============================================================

const { app, BrowserWindow, dialog } = require('electron')
const path = require('path')
const { registerIpcHandlers } = require('./ipc-handlers')
const { killActiveScript, hasActiveScript } = require('./script-runner')
const log = require('./logger')

// isDev is true when running via `npm run dev` (Vite dev server).
// We check NODE_ENV first so `npm start` (build + electron .) works too.
const isDev = process.env.NODE_ENV !== 'production' && !app.isPackaged

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

  if (isDev) {
    // In development, Vite serves the renderer on localhost
    win.loadURL('http://localhost:5173')
  } else {
    // In production, load the built HTML file from the dist folder
    // __dirname is electron-gui/electron/ so we go up one level to find dist/
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Intercept the close event to warn the user if a script is running
  win.on('close', async (event) => {
    if (!hasActiveScript()) {
      // No script running — allow the window to close normally
      return
    }

    // Prevent the window from closing immediately
    event.preventDefault()

    const response = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Keep waiting', 'Force quit'],
      defaultId: 0, // 'Keep waiting' is the default — safer choice
      title: 'Script still running',
      message: 'A script is still running.',
      detail: 'Force quitting now may leave your VM in an incomplete state.',
    })

    // response.response is the index of the button the user clicked:
    // 0 = 'Keep waiting', 1 = 'Force quit'
    if (response.response === 1) {
      log.warn('[main] force quit while script was running')
      killActiveScript()
      app.exit(0)
    } else {
      log.info('[main] user chose to keep waiting')
    }
  })

  return win
}

// 'ready' fires when Electron has finished initialising.
// You must not create windows before this event.
app.whenReady().then(() => {
  log.info(`[main] app ready — mode: ${isDev ? 'development' : 'production'}`)
  const win = createWindow()

  // Register all ipcMain.handle() calls so the renderer can talk to main
  registerIpcHandlers(win)
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
