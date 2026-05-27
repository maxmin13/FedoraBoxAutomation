// ============================================================
//  ipc-handlers.js — registers all ipcMain.handle() calls
//
//  Each handler responds to a message sent from the renderer
//  via window.electronAPI (defined in preload.js).
//
//  ipcMain.handle() is for request/response: the renderer
//  calls invoke() and awaits a return value.
//
//  For streaming output, we use win.webContents.send() to push
//  events to the renderer as the script produces lines.
// ============================================================

const { ipcMain, app, dialog, shell } = require('electron')
const { execSync } = require('child_process')
const { inspect } = require('util')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { runScript } = require('./script-runner')
const SCRIPTS = require('./scripts')
const log = require('./logger')

// The docs/ folder sits two levels above app/electron/
const DOCS_DIR = path.join(__dirname, '..', '..', 'docs')

// VM state store — JSON file inside .vm-data/ at repo root, keyed by VM name.
// Stores guestcontrol credentials, login user, and setup flags (e.g. gaScriptDone).
const CREDS_DIR  = path.join(__dirname, '..', '..', '.vm-data')
const CREDS_FILE = path.join(CREDS_DIR, 'vm-state.json')

async function readCredsStore() {
  try {
    const text = await fs.promises.readFile(CREDS_FILE, 'utf8')
    // PowerShell 5.1 writes UTF-8 with BOM (U+FEFF); strip it before parsing
    return JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
  } catch {
    return {}
  }
}

async function writeCredsStore(store) {
  await fs.promises.mkdir(CREDS_DIR, { recursive: true })
  await fs.promises.writeFile(CREDS_FILE, JSON.stringify(store, null, 2), 'utf8')
}

// Channels excluded from IPC logging.
// 'is-dev' is polled on every page load; 'read-log' returns the full file
// content — logging it back to the log file would create a feedback loop.
const SILENT_CHANNELS = new Set(['is-dev', 'read-log', 'check-vm-credentials', 'get-vm-hostname'])

function truncate(str, max = 120) {
  return str.length <= max ? str : str.slice(0, max) + ` …[+${str.length - max} chars]`
}

/**
 * Wraps ipcMain.handle with logging to gui.log (all environments)
 * and console (development only, via logger).
 *
 * @param {string}   channel - The IPC channel name
 * @param {function} handler - Async function that handles the request
 */
function handleIpc(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!SILENT_CHANNELS.has(channel)) {
      log.info(`[ipc] recv ${channel}`, args.length ? truncate(inspect(args, { depth: 3, breakLength: Infinity })) : '')
    }

    const result = await handler(event, ...args)

    if (!SILENT_CHANNELS.has(channel)) {
      log.info(`[ipc] reply ${channel}`, truncate(inspect(result, { depth: 3, breakLength: Infinity })))
    }

    return result
  })
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Returns true if the named VM is currently in the running state.
 * Returns false if the VM is stopped or VBoxManage throws (e.g. VM not found).
 *
 * @param {string} name
 * @returns {boolean}
 */
function isVmRunning(name) {
  try {
    const info = execSync(
      `VBoxManage showvminfo "${name}" --machinereadable`,
      { encoding: 'utf8' }
    )
    return /^VMState="running"/m.test(info)
  } catch {
    return false
  }
}

/**
 * Runs a PowerShell script, streams each line to the renderer via IPC,
 * and resolves with the exit code and all collected lines once the script exits.
 *
 * @param {Electron.BrowserWindow} win
 * @param {string}   scriptPath
 * @param {string[]} args
 * @returns {Promise<{ exitCode: number, lines: { text: string, source: string }[] }>}
 */
function streamScript(win, scriptPath, args) {
  return new Promise((resolve) => {
    const scriptName = path.basename(scriptPath)
    log.hostMark(`START ${scriptName}`)
    const lines = []
    runScript(
      scriptPath,
      args,
      (line) => {
        win.webContents.send('script-line', line)
        log.hostLine(line.text)
        lines.push(line)
      },
      (exitCode) => {
        log.hostMark(`END ${scriptName} exit=${exitCode}`)
        win.webContents.send('script-done', exitCode)
        resolve({ exitCode, lines })
      }
    )
  })
}

function extractError(lines) {
  const specific = lines.filter(
    l => /^\s*ERROR:/i.test(l.text) && !/script exited with code/i.test(l.text)
  )
  if (specific.length > 0) {
    return specific.at(-1).text.trim().replace(/^ERROR:\s*/i, '')
  }
  return lines.filter(l => l.text.trim()).at(-1)?.text.trim() ?? null
}

/**
 * Registers all IPC handlers. Called once from main.js after the window is created.
 * @param {Electron.BrowserWindow} win - The main window, used to push streaming events
 */
function registerIpcHandlers(win) {

  // ── is-dev ────────────────────────────────────────────────
  handleIpc('is-dev', async () => process.env.NODE_ENV !== 'production')

  // ── get-downloads-path ────────────────────────────────────
  handleIpc('get-downloads-path', async () => ({ path: app.getPath('downloads') }))

  // ── read-doc ──────────────────────────────────────────────
  // Reads a markdown file from the docs/ folder and returns its contents.
  // The filename is just the base name (e.g. 'DEVELOPMENT.md') — the path
  // to docs/ is resolved here in the main process, not in the renderer.
  // This keeps the renderer sandboxed: it cannot request arbitrary file paths.
  handleIpc('read-doc', async (_event, filename) => {
    try {
      const filePath = path.join(DOCS_DIR, filename)
      const content = await fs.promises.readFile(filePath, 'utf8')
      return { ok: true, content }
    } catch (error) {
      log.error(`[ipc][read-doc] ${filename}:`, error.message)
      return { ok: false, error: `Could not read ${filename}: ${error.message}` }
    }
  })

  // ── list-vms ──────────────────────────────────────────────
  // Returns all registered VMs with their running state.
  // The renderer calls this on the landing page to populate the VM list.
  handleIpc('list-vms', async () => {
    try {
      // 'vboxmanage list vms' outputs lines like: "MyVM" {uuid}
      const allOutput = execSync('VBoxManage list vms', { encoding: 'utf8' })

      // 'vboxmanage list runningvms' outputs the same format but only running VMs
      const runningOutput = execSync('VBoxManage list runningvms', { encoding: 'utf8' })

      const allVms = parseVmList(allOutput)
      const runningNames = parseVmList(runningOutput).map((vm) => vm.name)

      // Mark each VM as running or stopped
      const vms = allVms.map((vm) => ({
        name: vm.name,
        uuid: vm.uuid,
        running: runningNames.includes(vm.name),
      }))

      return { ok: true, vms }
    } catch (error) {
      // VBoxManage not found or not installed
      log.error('[ipc][list-vms]', error.message)
      return { ok: false, error: error.message, vms: [] }
    }
  })

  // ── start-vm ──────────────────────────────────────────────
  // Starts a stopped VM with a GUI window. Idempotent: returns ok if already running.
  handleIpc('start-vm', async (_event, name) => {
    try {
      if (isVmRunning(name)) {
        log.info(`[ipc][start-vm] "${name}" already running — skipping`)
        return { ok: true }
      }
      log.info(`[ipc][start-vm] starting "${name}"`)
      execSync(`VBoxManage startvm "${name}" --type gui`, { encoding: 'utf8' })
      return { ok: true }
    } catch (error) {
      log.error(`[ipc][start-vm] "${name}":`, error.message)
      return { ok: false, error: error.message }
    }
  })

  // ── stop-vm ───────────────────────────────────────────────
  // Tries graceful ACPI shutdown first; falls back to hard poweroff if VM is still
  // running after 60 s.
  handleIpc('stop-vm', async (_event, name) => {
    try {
      if (!isVmRunning(name)) {
        log.info(`[ipc][stop-vm] "${name}" already stopped — skipping`)
        return { ok: true }
      }

      log.info(`[ipc][stop-vm] sending ACPI shutdown to "${name}"`)
      execSync(`VBoxManage controlvm "${name}" acpipowerbutton`, { encoding: 'utf8' })

      const deadline = Date.now() + 60_000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1000))
        if (!isVmRunning(name)) {
          log.info(`[ipc][stop-vm] "${name}" stopped (ACPI)`)
          return { ok: true }
        }
      }

      log.warn(`[ipc][stop-vm] ACPI timeout — forcing poweroff for "${name}"`)
      execSync(`VBoxManage controlvm "${name}" poweroff`, { encoding: 'utf8' })
      log.info(`[ipc][stop-vm] "${name}" stopped (forced)`)
      return { ok: true }
    } catch (error) {
      log.error(`[ipc][stop-vm] "${name}":`, error.message)
      return { ok: false, error: error.message }
    }
  })

  // ── delete-vm ─────────────────────────────────────────────
  // Unregisters the VM and deletes all associated files (VDI, snapshots, etc.).
  // Only safe to call when the VM is stopped. Also removes saved credentials.
  handleIpc('delete-vm', async (_event, name) => {
    try {
      log.info(`[ipc][delete-vm] deleting "${name}"`)
      execSync(`VBoxManage unregistervm "${name}" --delete`, { encoding: 'utf8' })

      const store = await readCredsStore()
      if (name in store) {
        delete store[name]
        await writeCredsStore(store)
        log.info(`[ipc][delete-vm] removed credentials for "${name}"`)
      }

      return { ok: true }
    } catch (error) {
      log.error(`[ipc][delete-vm] "${name}":`, error.message)
      return { ok: false, error: error.message }
    }
  })

  // ── check-vm-ready ───────────────────────────────────────
  // Returns running state and Guest Additions status for a VM.
  // Used by ShareFolderPage to show a readiness banner before running share-folder.ps1.
  handleIpc('check-vm-ready', async (_event, vmName) => {
    try {
      const info = execSync(
        `VBoxManage showvminfo "${vmName}" --machinereadable`,
        { encoding: 'utf8' }
      )
      const running = /^VMState="running"/m.test(info)
      if (!running) {
        return { ok: true, running: false, guestAdditions: false }
      }
      try {
        const gaOutput = execSync(
          `VBoxManage guestproperty get "${vmName}" /VirtualBox/GuestAdd/Version`,
          { encoding: 'utf8' }
        )
        const match = gaOutput.match(/Value:\s*(.+)/i)
        if (match) {
          return { ok: true, running: true, guestAdditions: true, version: match[1].trim() }
        }
      } catch {
        // guestproperty throws when Guest Additions are not installed
      }
      return { ok: true, running: true, guestAdditions: false }
    } catch (error) {
      log.error(`[ipc][check-vm-ready] "${vmName}":`, error.message)
      return { ok: false, running: false, guestAdditions: false, error: error.message }
    }
  })

  // ── get-vm-hostname ──────────────────────────────────────
  // Runs /bin/hostname inside the guest and returns the current hostname.
  // Password is excluded from logs via SILENT_CHANNELS.
  handleIpc('get-vm-hostname', async (_event, { vmName, vmUser, vmPass }) => {
    try {
      const output = execSync(
        `VBoxManage guestcontrol "${vmName}" run --exe /bin/hostname --username "${vmUser}" --password "${vmPass}" --wait-stdout`,
        { encoding: 'utf8', stdio: 'pipe', timeout: 10000 }
      )
      return { ok: true, hostname: output.trim() }
    } catch (error) {
      return { ok: false, error: error.message }
    }
  })

  // ── check-vm-credentials ─────────────────────────────────
  // Tests guestcontrol credentials by running a no-op echo inside the guest.
  // Requires the VM to be running with Guest Additions installed.
  // Also detects whether the VM is booting from a live ISO (isLive: true)
  // by checking for /run/initramfs/live, which only exists in live environments.
  handleIpc('check-vm-credentials', async (_event, { vmName, vmUser, vmPass }) => {
    try {
      // --password is unavoidable: VBoxManage guestcontrol has no stdin/env-var alternative
      execSync(
        `VBoxManage guestcontrol "${vmName}" run --exe /bin/echo --username "${vmUser}" --password "${vmPass}" --wait-stdout -- -c "echo ok"`,
        { encoding: 'utf8', stdio: 'pipe', timeout: 15000 }
      )
      let isLive = false
      try {
        execSync(
          `VBoxManage guestcontrol "${vmName}" run --exe /bin/test --username "${vmUser}" --password "${vmPass}" -- -d /run/initramfs/live`,
          { encoding: 'utf8', stdio: 'pipe', timeout: 15000 }
        )
        isLive = true
      } catch {
        // exit code 1 means directory absent — installed OS
      }
      return { ok: true, isLive }
    } catch (error) {
      log.error(`[ipc][check-vm-credentials] "${vmName}":`, error.message)
      const raw = (error.stderr ?? error.message ?? '').toString().trim()
      const msg = raw.split('\n').map(l => l.replace(/\r$/, '').trim()).filter(l => l)[0] ?? 'Connection failed'
      return { ok: false, error: msg }
    }
  })

  // ── run-sanity-checks ─────────────────────────────────────
  // Runs the sanity check script with -Json flag and returns structured results.
  handleIpc('run-sanity-checks', async () => {
    const { lines } = await streamScript(win, SCRIPTS.sanityChecks, ['-Json'])
    const stdoutLines = lines.filter(l => l.source === 'stdout').map(l => l.text)
    const stderrLines = lines.filter(l => l.source === 'stderr').map(l => l.text)
    try {
      const checks = parseChecksOutput(stdoutLines, stderrLines)
      return { ok: true, checks }
    } catch (parseError) {
      log.error('[ipc][run-sanity-checks] parse failed:', parseError.message)
      return { ok: false, error: 'Could not parse check results: ' + parseError.message, checks: [] }
    }
  })

  // ── create-vm ─────────────────────────────────────────────
  // Creates a new Fedora VM from the supplied parameters.
  // Streams output to the renderer; returns ok when the script exits 0.
  handleIpc('create-vm', async (_event, params) => {
    const psArgs = [
      '-vmName', params.vmName,
      '-isoPath', params.isoPath,
      '-ramMB', String(params.ramMB),
      '-cpus', String(params.cpus),
      '-diskMB', String(params.diskMB),
      '-diskType', params.diskType,
      '-vramMB', String(params.vramMB),
      '-nicType', params.nicType,
      '-attachGuestAdditions', params.attachGuestAdditions ? 'yes' : 'no',
      '-startVm', params.startVm ? 'yes' : 'no',
      '-forceRecreate', params.forceRecreate ? 'yes' : 'no',
      '-NonInteractive',
    ]
    if (params.vmFolder) psArgs.push('-vmFolder', params.vmFolder)
    const { exitCode } = await streamScript(win, SCRIPTS.createVm, psArgs)
    return { ok: exitCode === 0 }
  })

  // ── load-vm-credentials ──────────────────────────────────
  // Reads .credentials.json keyed by VM name.
  // Returns { ok, user, pass, loginUser } or { ok: false } if not found.
  handleIpc('load-vm-credentials', async (_event, vmName) => {
    const store = await readCredsStore()
    const entry = store[vmName]
    if (!entry) return { ok: false }
    return { ok: true, user: entry.user ?? '', pass: entry.pass ?? '', loginUser: entry.loginUser ?? '' }
  })

  // ── save-vm-credentials ──────────────────────────────────
  handleIpc('save-vm-credentials', async (_event, { vmName, user, pass, loginUser }) => {
    const store = await readCredsStore()
    const existing = store[vmName] ?? {}
    store[vmName] = { user, pass, loginUser: loginUser || existing.loginUser || '' }
    await writeCredsStore(store)
    return { ok: true }
  })

  // ── run-provision-script ─────────────────────────────────
  // Uploads and runs a single guest script via guestcontrol. Streams output to the renderer.
  handleIpc('run-provision-script', async (_event, params) => {
    const psArgs = [
      '-VmName',        params.vmName,
      '-VmUser',        params.vmUser,
      '-VmPass',        params.vmPass,
      '-LoginUser',     params.loginUser,
      '-ScriptRelPath', params.scriptRelPath,
      '-NonInteractive',
    ]
    if (params.scriptArgs) psArgs.push('-ScriptArgs', params.scriptArgs)
    const { exitCode, lines } = await streamScript(win, SCRIPTS.runProvisionScript, psArgs)
    if (exitCode === 0) return { ok: true }
    return { ok: false, errorDetail: extractError(lines) }
  })

  // ── run-provision-setup ──────────────────────────────────
  // Runs all base setup scripts (system-prep, network, selinux, desktop, utilities). Streams output.
  handleIpc('run-provision-setup', async (_event, params) => {
    const psArgs = [
      '-VmName',    params.vmName,
      '-VmUser',    params.vmUser,
      '-VmPass',    params.vmPass,
      '-LoginUser', params.loginUser,
      '-Hostname',  params.hostname,
      '-NonInteractive',
    ]
    const { exitCode, lines } = await streamScript(win, SCRIPTS.runProvisionSetup, psArgs)
    if (exitCode === 0) return { ok: true }
    return { ok: false, errorDetail: extractError(lines) }
  })

  // ── run-share-folder ─────────────────────────────────────
  // Runs share-folder.ps1 non-interactively with the supplied parameters.
  // Streams output to the renderer; returns ok when the script exits 0.
  // On failure, errorDetail contains the last ERROR:-prefixed line from the script.
  handleIpc('run-share-folder', async (_event, params) => {
    const psArgs = [
      '-VmName',    params.vmName,
      '-HostPath',  params.hostPath,
      '-MountPoint', params.mountPoint,
      '-VmUser',    params.vmUser,
      '-VmPass',    params.vmPass,
      '-LoginUser', params.loginUser,
      '-NonInteractive',
    ]
    const { exitCode, lines } = await streamScript(win, SCRIPTS.shareFolder, psArgs)
    if (exitCode === 0) return { ok: true }
    return { ok: false, errorDetail: extractError(lines) }
  })

  // ── get-vm-guest-logs-path ────────────────────────────────
  // Resolves the default guest-logs folder for a VM: <VM folder>\guest-logs.
  // The VM folder is read from VBoxManage showvminfo CfgFile line.
  handleIpc('get-vm-guest-logs-path', async (_event, vmName) => {
    try {
      const info = execSync(
        `VBoxManage showvminfo "${vmName}" --machinereadable`,
        { encoding: 'utf8' }
      )
      const match = info.match(/^CfgFile="(.+)"/m)
      if (!match) return { ok: false, error: 'Could not find VM config file path' }
      const vmDir = path.dirname(match[1])
      return { ok: true, path: path.join(vmDir, 'guest-logs') }
    } catch (error) {
      log.error(`[ipc][get-vm-guest-logs-path] "${vmName}":`, error.message)
      return { ok: false, error: error.message }
    }
  })

  // ── get-vm-info ───────────────────────────────────────────
  // Returns all displayable VM parameters parsed from showvminfo --machinereadable,
  // plus disk capacity from showmediuminfo and GA version from guestproperty.
  handleIpc('get-vm-info', async (_event, vmName) => {
    try {
      const raw = execSync(
        `VBoxManage showvminfo "${vmName}" --machinereadable`,
        { encoding: 'utf8' }
      )

      // Parse key="value" lines; strip trailing \r per CLAUDE.md warning.
      // VirtualBox machinereadable format escapes backslashes as \\, so unescape them.
      const kv = {}
      for (const line of raw.split('\n')) {
        const m = line.replace(/\r$/, '').match(/^([^=]+)="(.*)"$/)
        if (m) kv[m[1]] = m[2].replace(/\\\\/g, '\\')
      }

      // Shared folders: name + hostPath from machinereadable; mount-point from plain showvminfo
      // (VBoxManage does not emit SharedFolderAutoMountPointMachineMapping in --machinereadable output)
      const mountPointMap = {}
      try {
        const rawPlain = execSync(`VBoxManage showvminfo "${vmName}"`, { encoding: 'utf8' })
        for (const line of rawPlain.split('\n')) {
          const m = line.match(/Name:\s*'([^']+)'.*mount-point:\s*'([^']*)'/)
          if (m) mountPointMap[m[1]] = m[2]
        }
      } catch (_) { /* best-effort */ }

      const sharedFolders = []
      let i = 1
      while (kv[`SharedFolderNameMachineMapping${i}`]) {
        const name = kv[`SharedFolderNameMachineMapping${i}`]
        const hostPath = kv[`SharedFolderPathMachineMapping${i}`] ?? ''
        sharedFolders.push({
          name,
          hostPath,
          mountPoint: mountPointMap[name] ?? '',
          existsOnHost: hostPath ? fs.existsSync(hostPath) : false,
        })
        i++
      }

      // Disk info — find the first *-ImageUUID-* key to get the medium UUID
      let diskCapacityMB = null
      let diskType = null
      const diskUuidKey = Object.keys(kv).find(k => k.includes('ImageUUID'))
      if (diskUuidKey) {
        try {
          const medInfo = execSync(
            `VBoxManage showmediuminfo disk "${kv[diskUuidKey]}"`,
            { encoding: 'utf8' }
          )
          const capMatch = medInfo.match(/^Capacity:\s*([\d,]+)\s*MBytes/im)
          if (capMatch) diskCapacityMB = parseInt(capMatch[1].replace(/,/g, ''), 10)
          const varMatch = medInfo.match(/^Format variant:\s*(.+)/im)
          if (varMatch) diskType = /fixed/i.test(varMatch[1]) ? 'fixed' : 'dynamic'
        } catch { /* no disk attached or showmediuminfo unavailable */ }
      }

      // Log sync destination: <VM folder>\guest-logs
      let logSyncPath = null
      if (kv['CfgFile']) {
        logSyncPath = path.join(path.dirname(kv['CfgFile']), 'guest-logs')
      }

      // Hide the log-sync share from the user-facing shared-folders list.
      // share-logs.ps1 registers the guest-logs folder as a VirtualBox shared
      // folder internally (so the VM can mount /mnt/log), but it is already
      // shown under "Log sync" — displaying it again in "Shared folders" is
      // confusing.  Filter by hostPath so the comparison is case-insensitive
      // on Windows (paths may differ only in case).
      const userSharedFolders = logSyncPath
        ? sharedFolders.filter(
            sf => sf.hostPath.toLowerCase() !== logSyncPath.toLowerCase()
          )
        : sharedFolders

      // Guest Additions version — only queryable when the VM is running
      let gaVersion = null
      const running = /^running$/i.test(kv['VMState'] ?? '')
      if (running) {
        try {
          const gaOut = execSync(
            `VBoxManage guestproperty get "${vmName}" /VirtualBox/GuestAdd/Version`,
            { encoding: 'utf8' }
          )
          const m = gaOut.match(/Value:\s*(.+)/i)
          if (m) gaVersion = m[1].trim()
        } catch { /* Guest Additions not installed */ }
      }

      return {
        ok: true,
        info: {
          osType:        kv['ostype']        ?? 'Unknown',
          state:         kv['VMState']       ?? 'unknown',
          ramMB:         parseInt(kv['memory'] ?? '0', 10),
          cpus:          parseInt(kv['cpus']   ?? '1', 10),
          vramMB:        parseInt(kv['vram']   ?? '0', 10),
          nic:           kv['nic1']          ?? 'null',
          mac:           kv['macaddress1']   ?? '',
          diskCapacityMB,
          diskType,
          sharedFolders: userSharedFolders,
          gaVersion,
          logSyncPath,
        },
      }
    } catch (error) {
      log.error(`[ipc][get-vm-info] "${vmName}":`, error.message)
      return { ok: false, error: error.message }
    }
  })

  // ── run-share-logs ────────────────────────────────────────
  // Runs share-logs.ps1 non-interactively. Streams output to the renderer.
  // On failure, errorDetail contains the last ERROR:-prefixed line from the script.
  handleIpc('run-share-logs', async (_event, params) => {
    const psArgs = ['-VmName', params.vmName, '-HostPath', params.hostPath, '-VmUser', params.vmUser, '-VmPass', params.vmPass, '-LoginUser', params.loginUser, '-NonInteractive']
    const { exitCode, lines } = await streamScript(win, SCRIPTS.shareLogs, psArgs)
    if (exitCode === 0) return { ok: true }
    return { ok: false, errorDetail: extractError(lines) }
  })

  // ── install-virtualbox ────────────────────────────────────
  // Runs the VirtualBox installer script and streams output to the renderer.
  handleIpc('install-virtualbox', async () => {
    const { exitCode } = await streamScript(win, SCRIPTS.installVirtualBox, [])
    return { ok: exitCode === 0 }
  })

  // ── pick-folder ───────────────────────────────────────────
  // Opens a native folder picker. Returns { folderPath: string | null }.
  handleIpc('pick-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    return { folderPath: result.canceled ? null : result.filePaths[0] }
  })

  // ── pick-iso ──────────────────────────────────────────────
  // Opens a native file picker filtered to .iso files.
  // Returns { filePath: string } or { filePath: null } if the user cancelled.
  handleIpc('pick-iso', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Fedora ISO',
      defaultPath: app.getPath('downloads'),
      filters: [
        { name: 'ISO images', extensions: ['iso'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    return { filePath: result.canceled ? null : result.filePaths[0] }
  })

  // ── read-log ──────────────────────────────────────────────
  // Reads the last 500 lines of one of the two app log files.
  // Only 'gui.log' and 'host.log' are accepted — no arbitrary path traversal.
  // Uses async fs.promises.readFile so it never blocks the main process event loop.
  handleIpc('read-log', async (_event, name) => {
    const allowed = new Set(['gui.log', 'host.log'])
    if (!allowed.has(name)) {
      return { ok: false, error: `Unknown log file: ${name}` }
    }
    const logPath = path.join(log.LOG_DIR, name)
    try {
      const raw = await fs.promises.readFile(logPath, 'utf8')
      const lines = raw.split('\n')
      const tail = lines.slice(-500).join('\n')
      return { ok: true, content: tail }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { ok: true, content: '' }
      }
      log.error(`[ipc][read-log] ${name}:`, error.message)
      return { ok: false, error: error.message }
    }
  })

  // ── open-log-dir ──────────────────────────────────────────
  // Opens a log folder in the native file explorer.
  // 'app'  -> %APPDATA%\FedoraBoxAutomation\logs  (gui.log + host.log)
  // 'vbox' -> %USERPROFILE%\VirtualBox VMs         (per-VM Logs\ subfolders)
  handleIpc('open-log-dir', async (_event, which) => {
    const dirs = {
      app: log.LOG_DIR,
      vbox: path.join(os.homedir(), 'VirtualBox VMs'),
    }
    const dir = dirs[which]
    if (!dir) return { ok: false, error: `Unknown log dir: ${which}` }
    const err = await shell.openPath(dir)
    return err ? { ok: false, error: err } : { ok: true }
  })

  // ── log-error ─────────────────────────────────────────────
  // Receives uncaught renderer errors from the React error boundary.
  handleIpc('log-error', async (_event, message, stack) => {
    log.error('[renderer] uncaught error:', message)
    if (stack) log.error('[renderer] stack:', stack)
  })
}

/**
 * Finds and parses the JSON array written by the sanity-check script.
 * Handles noise lines before the array (e.g. DISM progress output) and the
 * PowerShell ConvertTo-Json quirk where a single result is emitted as an
 * object rather than a one-element array.
 *
 * @param {string[]} stdoutLines - Collected stdout lines from the script
 * @param {string[]} stderrLines - Collected stderr lines (used in error messages only)
 * @returns {object[]} parsed checks array
 * @throws {Error} if no JSON array is found or the JSON is invalid
 */
function parseChecksOutput(stdoutLines, stderrLines = []) {
  const fullOutput = stdoutLines.join('\n')
  const jsonStart = fullOutput.indexOf('[')
  const jsonEnd = fullOutput.lastIndexOf(']')

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    const stdoutSnippet = fullOutput.slice(0, 300) || '(empty)'
    const stderrSnippet = stderrLines.slice(0, 10).join('\n') || '(empty)'
    throw new Error(
      `No JSON array found in script output.\nstdout: ${stdoutSnippet}\nstderr: ${stderrSnippet}`
    )
  }

  const jsonString = fullOutput.slice(jsonStart, jsonEnd + 1)
  const parsed = JSON.parse(jsonString)
  // ConvertTo-Json returns an object (not array) when there is exactly 1 result
  return Array.isArray(parsed) ? parsed : [parsed]
}

/**
 * Parses the output of 'VBoxManage list vms' into an array of objects.
 * Each line looks like: "My VM Name" {550e8400-e29b-41d4-a716-446655440000}
 *
 * @param {string} output - Raw stdout from VBoxManage list vms
 * @returns {{ name: string, uuid: string }[]}
 */
function parseVmList(output) {
  const vms = []

  for (const line of output.split('\n')) {
    // Each line looks like: "My VM Name" {550e8400-e29b-41d4-a716-446655440000}
    // The regex captures:  (.+) = name between quotes,  ([^}]+) = uuid inside braces
    const match = line.match(/^"(.+)"\s+\{([^}]+)\}/)

    if (match) {
      vms.push({ name: match[1], uuid: match[2] })
    }
  }

  return vms
}

module.exports = { registerIpcHandlers, parseVmList, parseChecksOutput }
