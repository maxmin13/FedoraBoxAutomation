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

  // Returns all displayable parameters for a single VM (hardware, network, shared folders, etc.)
  getVmInfo: (vmName) => ipcRenderer.invoke('get-vm-info', vmName),

  // ── VM control ───────────────────────────────────────────
  // Starts a stopped VM (headless mode)
  startVm: (name) => ipcRenderer.invoke('start-vm', name),

  // Sends an ACPI shutdown signal to a running VM
  stopVm: (name) => ipcRenderer.invoke('stop-vm', name),

  // Gracefully stops then starts the VM (mirrors the stop/start buttons in the VM list)
  restartVm: (name) => ipcRenderer.invoke('restart-vm', name),

  // Unregisters and permanently deletes a stopped VM and all its files
  deleteVm: (name) => ipcRenderer.invoke('delete-vm', name),

  // ── Create VM ─────────────────────────────────────────────
  // Runs create-vm.ps1 with the supplied parameters; streams output to the renderer
  createVm: (params) => ipcRenderer.invoke('create-vm', params),

  // ── Shared folder ─────────────────────────────────────────
  // Checks whether a VM is running; if credentials are supplied, also pings guestcontrol
  checkVmReady: (vmName, vmUser, vmPass) => ipcRenderer.invoke('check-vm-ready', vmName, vmUser, vmPass),

  // Runs share-folder.ps1 and streams output to the renderer
  runShareFolder: (params) => ipcRenderer.invoke('run-share-folder', params),

  // Returns the default guest-logs path for a VM: <VM folder>\guest-logs
  getVmGuestLogsPath: (vmName) => ipcRenderer.invoke('get-vm-guest-logs-path', vmName),

  // Runs share-logs.ps1 and streams output to the renderer
  runShareLogs: (params) => ipcRenderer.invoke('run-share-logs', params),

  // Reads saved credentials for a VM
  loadVmCredentials: (vmName) => ipcRenderer.invoke('load-vm-credentials', vmName),

  // Reads all saved VM credentials from vm-state.json in one call
  loadAllVmCredentials: () => ipcRenderer.invoke('load-all-vm-credentials'),

  saveVmCredentials: (vmName, user, pass, loginUser) =>
    ipcRenderer.invoke('save-vm-credentials', { vmName, user, pass, loginUser }),

  // Tests whether guestcontrol credentials are valid for a running VM with Guest Additions
  checkVmCredentials: (vmName, vmUser, vmPass) =>
    ipcRenderer.invoke('check-vm-credentials', { vmName, vmUser, vmPass }),

  // Verifies that a login username exists inside the guest (runs `id <vmUser>` as root)
  checkVmUser: (vmName, rootUser, rootPass, vmUser) =>
    ipcRenderer.invoke('check-vm-user', { vmName, rootUser, rootPass, vmUser }),

  // Reads the current hostname from inside the guest via guestcontrol
  getVmHostname: (vmName, vmUser, vmPass) =>
    ipcRenderer.invoke('get-vm-hostname', { vmName, vmUser, vmPass }),

  // Runs a single guest script via guestcontrol and streams output to the renderer
  runProvisionScript: (params) => ipcRenderer.invoke('run-provision-script', params),

  // Runs the full base setup (system-prep, network, selinux, desktop, utilities) and streams output
  runProvisionSetup: (params) => ipcRenderer.invoke('run-provision-setup', params),

  // Queries the VM for installed tools by running detect-installed.sh via guestcontrol
  queryVmInstalled: (vmName) => ipcRenderer.invoke('query-vm-installed', { vmName }),

  // Queries the VM for a live performance snapshot (CPU%, RAM, top processes)
  queryVmPerformance: (vmName) => ipcRenderer.invoke('query-vm-performance', { vmName }),

  // Sends SIGTERM to a process inside the VM by PID via guestcontrol
  killVmProcess: (vmName, pid, procName) => ipcRenderer.invoke('kill-vm-process', { vmName, pid, procName }),
  // Kills any in-flight query-vm-installed process for the given VM
  cancelQueryVmInstalled: (vmName) => ipcRenderer.invoke('cancel-query-vm-installed', { vmName }),

  // Applies a single VBoxManage performance fix (VM must be stopped)
  fixVmPerfSetting: (vmName, setting) => ipcRenderer.invoke('fix-vm-perf-setting', { vmName, setting }),

  // ── Sanity checks ─────────────────────────────────────────
  // Runs the sanity check script and returns structured JSON results
  runSanityChecks: () => ipcRenderer.invoke('run-sanity-checks'),

  // ── VirtualBox install ────────────────────────────────────
  // Runs the VirtualBox installer script
  installVirtualBox: () => ipcRenderer.invoke('install-virtualbox'),

  // ── Docs ──────────────────────────────────────────────────
  // Reads a markdown file from the docs/ folder and returns its content as a string
  readDoc: (filename) => ipcRenderer.invoke('read-doc', filename),

  // ── File / folder pickers ─────────────────────────────────
  // Opens a native OS folder picker; returns the chosen path or null
  pickFolder: () => ipcRenderer.invoke('pick-folder'),

  // Opens a native OS file picker filtered to .iso files; returns the chosen path or null
  pickIso: () => ipcRenderer.invoke('pick-iso'),

  // ── Log viewer ────────────────────────────────────────────
  // Reads one of the app log files ('gui.log' or 'host.log') and returns its content
  readLog: (name) => ipcRenderer.invoke('read-log', name),

  // Opens a log folder in the native file explorer.
  // 'app' -> %APPDATA%\FedoraBoxAutomation\logs; 'vbox' -> %USERPROFILE%\VirtualBox VMs
  openLogDir: (which) => ipcRenderer.invoke('open-log-dir', which),

  // ── Error logging ─────────────────────────────────────────
  // Forwards uncaught renderer errors (from the React error boundary) to the main process log
  logError: (message, stack) => ipcRenderer.invoke('log-error', message, stack),

  // ── UI action logging ─────────────────────────────────────
  // Writes a [ui] trace line to gui.log for every significant user click
  logUiAction: (action) => ipcRenderer.invoke('log-ui-action', action),

  // Returns the OS downloads folder path (e.g. C:\Users\you\Downloads)
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),

  // ── Streaming output ──────────────────────────────────────
  // The renderer registers a listener for live script output lines.
  // Returns an unsubscribe function so the component can clean up.
  getScriptState: () => ipcRenderer.invoke('get-script-state'),
  clearScriptState: () => ipcRenderer.invoke('clear-script-state'),

  onCloseWarning: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('show-close-warning', handler)
    return () => ipcRenderer.removeListener('show-close-warning', handler)
  },

  respondToCloseWarning: (forceQuit) => ipcRenderer.invoke('close-warning-response', forceQuit),

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
