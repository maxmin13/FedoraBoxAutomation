// ============================================================
//  preload.js — contextBridge between main and renderer
//
//  This file runs in a privileged context before the renderer loads.
//  It uses contextBridge to expose a safe, explicit API to the React app.
//
//  The renderer can call window.electronAPI.someMethod(...)
//  but cannot access Node.js or Electron APIs directly.
// ============================================================

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {

  // ── VM list ───────────────────────────────────────────────
  // Returns a list of all registered VMs with their running state
  listVms: () => ipcRenderer.invoke('list-vms'),

  // ── Sanity checks ─────────────────────────────────────────
  // Runs the sanity check script and returns structured JSON results
  runSanityChecks: () => ipcRenderer.invoke('run-sanity-checks'),

  // ── VirtualBox install ────────────────────────────────────
  // Runs the VirtualBox installer script
  installVirtualBox: () => ipcRenderer.invoke('install-virtualbox'),

  // ── Docs ──────────────────────────────────────────────────
  // Reads a markdown file from the docs/ folder and returns its content as a string
  readDoc: (filename) => ipcRenderer.invoke('read-doc', filename),

  // ── Environment ───────────────────────────────────────────
  // True when running via `npm run dev`, false in a packaged build
  isDev: () => ipcRenderer.invoke('is-dev'),

  // ── Streaming output ──────────────────────────────────────
  // The renderer registers a listener for live script output lines.
  // Returns an unsubscribe function so the component can clean up.
  onScriptLine: (callback) => {
    const handler = (_event, line) => callback(line)
    ipcRenderer.on('script-line', handler)

    // Return a cleanup function the React component calls on unmount
    return () => ipcRenderer.removeListener('script-line', handler)
  },

  // ── Script done ───────────────────────────────────────────
  // Fires once when the current script exits, with its exit code
  onScriptDone: (callback) => {
    const handler = (_event, exitCode) => callback(exitCode)
    ipcRenderer.on('script-done', handler)

    return () => ipcRenderer.removeListener('script-done', handler)
  },
})
