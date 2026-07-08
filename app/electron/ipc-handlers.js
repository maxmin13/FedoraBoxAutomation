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
const { execSync, exec, execFile } = require('child_process')
const { inspect, promisify } = require('util')
const execAsync     = promisify(exec)
const execFileAsync = promisify(execFile)
const path = require('path')
const fs = require('fs')
const os = require('os')
const { runScript, setRunContext, getScriptState, clearScriptState } = require('./script-runner')
const SCRIPTS = require('./scripts')
const log = require('./logger')

// When packaged, extraResources land in process.resourcesPath alongside the ASAR.
// In dev, the project root is two levels above app/electron/.
const ROOT = app?.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..', '..')

const DOCS_DIR = path.join(ROOT, 'docs')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// VM state store — keyed by VM name; stored in userData so it survives reinstalls
// and is writable when the app is installed in Program Files.
const CREDS_DIR  = app?.isPackaged
  ? path.join(app.getPath('userData'), '.vm-data')
  : path.join(ROOT, '.vm-data')
const CREDS_FILE = path.join(CREDS_DIR, 'vm-state.json')

async function readCredsStore() {
  try {
    const raw = await fs.promises.readFile(CREDS_FILE, 'utf8')
    try {
      return JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8'))
    } catch {
      // Migrate legacy plaintext JSON written by older versions
      const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw
      return JSON.parse(text)
    }
  } catch {
    return {}
  }
}

async function writeCredsStore(store) {
  await fs.promises.mkdir(CREDS_DIR, { recursive: true })
  const encoded = Buffer.from(JSON.stringify(store, null, 2), 'utf8').toString('base64')
  await fs.promises.writeFile(CREDS_FILE, encoded, 'utf8')
}

// Tracks in-flight VBoxManage child processes for query-vm-installed, keyed by VM name.
// Populated by query-vm-installed, drained by cancel-query-vm-installed.
const activeQueryProcs = new Map()

function killProc(proc) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' })
    } else {
      proc.kill('SIGTERM')
    }
  } catch {}
}

// Like execAsync but also pushes the ChildProcess into a tracking array so it can be killed.
function execTracked(cmd, options, procs) {
  return new Promise((resolve, reject) => {
    const cp = exec(cmd, options, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout)
    })
    procs.push(cp)
  })
}

// Channels excluded from IPC logging.
// 'read-log' returns full file content — logging it back would create a feedback loop.
// Credential channels are excluded to keep passwords out of gui.log.
const SILENT_CHANNELS = new Set([
  'read-log',               // reply is full file content — would create a feedback loop
  'log-ui-action',          // high-frequency, no useful debug value in the log
  // All channels below receive or return passwords — kept out of gui.log
  'check-vm-credentials',
  'check-vm-ready',
  'check-vm-user',
  'get-vm-hostname',
  'save-vm-credentials',
  'load-vm-credentials',
  'load-all-vm-credentials',
  'run-provision-script',
  'run-provision-setup',
  'run-share-folder',
  'run-share-logs',
  'query-vm-installed',
  'query-vm-performance',
  'kill-vm-process',
])

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
      log.info(`[ipc] recv ${channel}`, args.length ? inspect(args, { depth: 3, breakLength: Infinity }) : '')
    }

    const result = await handler(event, ...args)

    if (!SILENT_CHANNELS.has(channel)) {
      log.info(`[ipc] reply ${channel}`, inspect(result, { depth: 3, breakLength: Infinity }))
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
async function isVmRunning(name) {
  try {
    const { stdout } = await execAsync(
      `VBoxManage showvminfo "${name}" --machinereadable`,
      { encoding: 'utf8' }
    )
    return /^VMState="running"/m.test(stdout)
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
function streamScript(win, scriptPath, args, context = null) {
  return new Promise((resolve) => {
    const scriptName = path.basename(scriptPath)
    log.hostMark(`START ${scriptName}`)
    setRunContext(context)
    const lines = []
    runScript(
      scriptPath,
      args,
      (line) => {
        win.webContents.send('script-line', line)
        log.hostLine(line.text, line.source)
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

// Finds the JSON line in guestcontrol stdout, ignoring any VBoxManage status lines
// that may appear before or after the script output.
function extractPerfJson(stdout) {
  const line = stdout.split('\n').find(l => l.trim().startsWith('{'))
  if (!line) throw new Error('No JSON line found in output')
  return JSON.parse(line.trim())
}

/**
 * Registers all IPC handlers. Called once from main.js after the window is created.
 * @param {Electron.BrowserWindow} win - The main window, used to push streaming events
 */
function registerIpcHandlers(win) {

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
  // "running" means Guest Additions are loaded (run level >= 1), not just that the
  // VirtualBox process is up. This lets the UI badge transition from "Starting..."
  // to "Running" only once the guest is actually reachable via guestcontrol.
  handleIpc('list-vms', async () => {
    try {
      // 'vboxmanage list vms' outputs lines like: "MyVM" {uuid}
      const allOutput = execSync('VBoxManage list vms', { encoding: 'utf8' })

      // 'vboxmanage list runningvms' outputs the same format but only running VMs
      const runningOutput = execSync('VBoxManage list runningvms', { encoding: 'utf8' })

      const allVms = parseVmList(allOutput)
      const runningNames = new Set(parseVmList(runningOutput).map((vm) => vm.name))

      // For each VM that VBox reports as running, check GA run level in parallel.
      // Run level >= 1 means the GA kernel driver is loaded.
      const gaLevels = await Promise.all(
        allVms.map(async (vm) => {
          if (!runningNames.has(vm.name)) return 0
          try {
            const { stdout } = await execAsync(
              `VBoxManage showvminfo "${vm.name}" --machinereadable`,
              { encoding: 'utf8' }
            )
            const m = stdout.match(/^GuestAdditionsRunLevel=(\d+)/m)
            return m ? parseInt(m[1], 10) : 0
          } catch {
            return 0
          }
        })
      )

      const vms = allVms.map((vm, i) => ({
        name: vm.name,
        uuid: vm.uuid,
        processRunning: runningNames.has(vm.name),
        running: gaLevels[i] >= 1,
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
      if (await isVmRunning(name)) {
        log.info(`[ipc][start-vm] "${name}" already running — skipping`)
        return { ok: true }
      }
      log.info(`[ipc][start-vm] starting "${name}"`)
      await execAsync(`VBoxManage startvm "${name}" --type gui`, { encoding: 'utf8' })
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
      if (!await isVmRunning(name)) {
        log.info(`[ipc][stop-vm] "${name}" already stopped — skipping`)
        return { ok: true }
      }

      log.info(`[ipc][stop-vm] sending ACPI shutdown to "${name}"`)
      await execAsync(`VBoxManage controlvm "${name}" acpipowerbutton`, { encoding: 'utf8' })

      const deadline = Date.now() + 60_000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1000))
        if (!await isVmRunning(name)) {
          log.info(`[ipc][stop-vm] "${name}" stopped (ACPI)`)
          return { ok: true }
        }
      }

      log.warn(`[ipc][stop-vm] ACPI timeout — forcing poweroff for "${name}"`)
      await execAsync(`VBoxManage controlvm "${name}" poweroff`, { encoding: 'utf8' })
      log.info(`[ipc][stop-vm] "${name}" stopped (forced)`)
      return { ok: true }
    } catch (error) {
      log.error(`[ipc][stop-vm] "${name}":`, error.message)
      return { ok: false, error: error.message }
    }
  })

  // ── restart-vm ────────────────────────────────────────────
  // Gracefully stops the VM (ACPI, with forced poweroff fallback) then starts it again.
  // Streams progress via script-line/script-done so the renderer can show logs.
  handleIpc('restart-vm', async (event, name) => {
    const emit = (text, source = 'stdout') => event.sender.send('script-line', { text, source })
    try {
      if (await isVmRunning(name)) {
        emit(`Stopping ${name}...`)
        log.info(`[ipc][restart-vm] stopping "${name}"`)
        await execAsync(`VBoxManage controlvm "${name}" acpipowerbutton`, { encoding: 'utf8' })
        const deadline = Date.now() + 60_000
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 1000))
          if (!await isVmRunning(name)) break
        }
        if (await isVmRunning(name)) {
          emit(`ACPI timeout — forcing poweroff...`, 'stderr')
          log.warn(`[ipc][restart-vm] ACPI timeout — forcing poweroff for "${name}"`)
          await execAsync(`VBoxManage controlvm "${name}" poweroff`, { encoding: 'utf8' })
        }
        emit(`${name} stopped.`)
        await new Promise(r => setTimeout(r, 2000))
      }
      emit(`Starting ${name}...`)
      log.info(`[ipc][restart-vm] starting "${name}"`)
      await execAsync(`VBoxManage startvm "${name}" --type gui`, { encoding: 'utf8' })
      emit(`${name} started.`)
      log.info(`[ipc][restart-vm] "${name}" restarted`)
      event.sender.send('script-done', 0)
      return { ok: true }
    } catch (error) {
      emit(error.message, 'stderr')
      log.error(`[ipc][restart-vm] "${name}":`, error.message)
      event.sender.send('script-done', 1)
      return { ok: false, error: error.message }
    }
  })

  // ── delete-vm ─────────────────────────────────────────────
  // Unregisters the VM and deletes all associated files (VDI, snapshots, etc.).
  // Only safe to call when the VM is stopped. Also removes saved credentials.
  handleIpc('delete-vm', async (_event, name) => {
    try {
      log.info(`[ipc][delete-vm] deleting "${name}"`)

      // Read the machine folder path before the VM is unregistered so we can
      // clean up the directory afterwards. VBoxManage --delete removes .vbox and
      // registered disk images but leaves the folder itself on disk.
      let machineFolder = null
      try {
        const info = execSync(`VBoxManage showvminfo "${name}" --machinereadable`, { encoding: 'utf8' })
        const m = info.match(/^CfgFile="(.+)"/m)
        if (m) machineFolder = path.dirname(m[1])
      } catch (_) { /* best-effort */ }

      execSync(`VBoxManage unregistervm "${name}" --delete`, { encoding: 'utf8' })

      // Remove the machine folder (empty dir, leftover logs, or any disk images
      // that --delete could not remove because they were locked or outside the
      // media registry).
      if (machineFolder) {
        try {
          await fs.promises.rm(machineFolder, { recursive: true, force: true })
          log.info(`[ipc][delete-vm] removed machine folder "${machineFolder}"`)
        } catch (rmErr) {
          log.warn(`[ipc][delete-vm] could not remove machine folder:`, rmErr.message)
        }
      }

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
  // Returns whether the VM is running and, if credentials are supplied, whether
  // Guest Additions are responding via guestcontrol. guestReady is null when no
  // credentials are available to test with.
  // Excluded from IPC logging (SILENT_CHANNELS) because credentials are passed.
  handleIpc('check-vm-ready', async (_event, vmName, vmUser, vmPass) => {
    try {
      const info = execSync(
        `VBoxManage showvminfo "${vmName}" --machinereadable`,
        { encoding: 'utf8' }
      )
      const running = /^VMState="running"/m.test(info)
      if (!running) return { ok: true, running: false, guestReady: false }

      if (!vmUser || !vmPass) return { ok: true, running: true, guestReady: null }

      // Ping guestcontrol — the only reliable way to confirm GA are installed
      // and running inside the guest.
      try {
        execSync(
          `VBoxManage guestcontrol "${vmName}" run --exe /bin/echo --username "${vmUser}" --password "${vmPass}" --wait-stdout -- ok`,
          { encoding: 'utf8', timeout: 10000 }
        )
        return { ok: true, running: true, guestReady: true }
      } catch {
        return { ok: true, running: true, guestReady: false }
      }
    } catch (error) {
      log.error(`[ipc][check-vm-ready] "${vmName}":`, error.message)
      return { ok: false, running: false, guestReady: false, error: error.message }
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
      const raw = (error.stderr ?? '').toString().trim()
      const msg = raw.split('\n').map(l => l.replace(/\r$/, '').trim()).filter(l => l)[0] ?? 'Could not get hostname'
      return { ok: false, error: msg }
    }
  })

  // ── check-vm-credentials ─────────────────────────────────
  // Tests guestcontrol credentials by running a no-op echo inside the guest.
  // Requires the VM to be running with Guest Additions installed.
  // Also detects whether the VM is booting from a live ISO (isLive: true)
  // by checking for /run/initramfs/live, which only exists in live environments.
  handleIpc('check-vm-credentials', async (_event, { vmName, vmUser, vmPass }) => {
    log.info(`[ipc] recv check-vm-credentials vm="${vmName}" user="${vmUser}"`)
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
      log.info(`[ipc] reply check-vm-credentials ok=true isLive=${isLive}`)
      return { ok: true, isLive }
    } catch (error) {
      const raw = (error.stderr ?? error.message ?? '').toString().trim()
      const msg = raw.split('\n').map(l => l.replace(/\r$/, '').trim()).filter(l => l)[0] ?? 'Connection failed'
      log.error(`[ipc] reply check-vm-credentials ok=false error="${msg}"`)
      return { ok: false, error: msg }
    }
  })

  // ── check-vm-user ────────────────────────────────────────
  // Verifies that a login username exists inside the guest by running `id <user>` as root.
  handleIpc('check-vm-user', async (_event, { vmName, rootUser, rootPass, vmUser }) => {
    log.info(`[ipc] recv check-vm-user vm="${vmName}" rootUser="${rootUser}" vmUser="${vmUser}"`)
    try {
      execSync(
        `VBoxManage guestcontrol "${vmName}" run --exe /usr/bin/id --username "${rootUser}" --password "${rootPass}" --wait-stdout -- "${vmUser}"`,
        { encoding: 'utf8', stdio: 'pipe', timeout: 10000 }
      )
      log.info(`[ipc] reply check-vm-user ok=true`)
      return { ok: true }
    } catch (error) {
      const raw = (error.stderr ?? error.message ?? '').toString().trim()
      const msg = raw.split('\n').map(l => l.replace(/\r$/, '').trim()).filter(l => l)[0] ?? 'User not found'
      log.error(`[ipc] reply check-vm-user ok=false error="${msg}"`)
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
      '-paravirtProvider', params.paravirtProvider,
      '-nicChipset', params.nicChipset,
      '-storageController', params.storageController,
      '-acceleration3d', params.acceleration3d ? 'on' : 'off',
      '-cpuExecCap', String(params.cpuExecCap),
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
  // Reads vm-state.json keyed by VM name.
  // Returns { ok, user, pass, loginUser } or { ok: false } if not found.
  handleIpc('load-vm-credentials', async (_event, vmName) => {
    log.info(`[ipc] recv load-vm-credentials vm="${vmName}"`)
    const store = await readCredsStore()
    const entry = store[vmName]
    if (!entry) return { ok: false, reason: `no entry for VM "${vmName}" in vm-state.json` }
    const missing = ['user', 'pass', 'loginUser'].filter((k) => !entry[k])
    return {
      ok: true,
      user:      entry.user      ?? '',
      pass:      entry.pass      ?? '',
      loginUser: entry.loginUser ?? '',
      ...(missing.length ? { warning: `missing fields: ${missing.join(', ')}` } : {}),
    }
  })

  // ── load-all-vm-credentials ───────────────────────────────
  // Returns every entry in vm-state.json so the renderer can populate VM lists
  // and pre-fill credential forms without calling load-vm-credentials per VM.
  handleIpc('load-all-vm-credentials', async () => {
    const store = await readCredsStore()
    const entries = {}
    for (const [vmName, entry] of Object.entries(store)) {
      entries[vmName] = {
        user:      entry.user      ?? '',
        pass:      entry.pass      ?? '',
        loginUser: entry.loginUser ?? '',
      }
    }
    return { ok: true, entries }
  })

  // ── save-vm-credentials ──────────────────────────────────
  handleIpc('save-vm-credentials', async (_event, { vmName, user, pass, loginUser }) => {
    log.info(`[ipc] recv save-vm-credentials vm="${vmName}" user="${user}"`)
    const store = await readCredsStore()
    const existing = store[vmName] ?? {}
    store[vmName] = { ...existing, user, pass, loginUser: loginUser || existing.loginUser || '' }
    await writeCredsStore(store)
    return { ok: true }
  })

  // ── query-vm-installed ────────────────────────────────────
  // Copies detect-installed.sh into the guest and runs it via guestcontrol.
  // Returns { ok: true, installed: Record<string,boolean> } on success.
  // Returns { ok: false, vmStopped: true } if the VM is not running.
  // Returns { ok: false, noCredentials: true } if no credentials are saved.
  // Returns { ok: false, error: string } if guestcontrol fails.
  handleIpc('query-vm-installed', async (_event, { vmName }) => {
    if (!await isVmRunning(vmName)) return { ok: false, vmStopped: true }
    const store = await readCredsStore()
    const entry = store[vmName]
    if (!entry?.user || !entry?.pass) return { ok: false, noCredentials: true }
    const { user, pass } = entry
    const scriptSrc = path.join(ROOT, 'vm', 'detect-installed.sh')
    const procs = []
    activeQueryProcs.set(vmName, procs)
    try {
      log.hostMark(`query-vm-installed "${vmName}" — copyto detect-installed.sh (user=${user})`)
      await execTracked(
        `VBoxManage guestcontrol "${vmName}" copyto "${scriptSrc}" /tmp/detect-installed.sh --username "${user}" --password "${pass}"`,
        { encoding: 'utf8', timeout: 15000 },
        procs
      )
      log.hostMark(`query-vm-installed "${vmName}" — running /tmp/detect-installed.sh`)
      const stdout = await execTracked(
        `VBoxManage guestcontrol "${vmName}" run --exe /bin/bash --username "${user}" --password "${pass}" --wait-stdout -- /tmp/detect-installed.sh`,
        { encoding: 'utf8', timeout: 30000 },
        procs
      )
      stdout.trim().split('\n').forEach((line) => log.hostLine(line, 'SH'))
      return { ok: true, installed: JSON.parse(stdout.trim()) }
    } catch (error) {
      const raw = (error.stderr ?? '').toString().trim()
      const msg = raw.split('\n').map(l => l.replace(/\r$/, '').trim()).filter(l => l)[0] ?? 'guestcontrol failed'
      log.error(`[ipc][query-vm-installed] "${vmName}":`, msg)
      return { ok: false, error: msg }
    } finally {
      activeQueryProcs.delete(vmName)
    }
  })

  handleIpc('cancel-query-vm-installed', (_event, { vmName }) => {
    const procs = activeQueryProcs.get(vmName)
    if (procs?.length) {
      procs.forEach(killProc)
      activeQueryProcs.delete(vmName)
      log.info(`[ipc][cancel-query-vm-installed] killed ${procs.length} proc(s) for "${vmName}"`)
    }
    return { ok: true }
  })

  // ── query-vm-performance ─────────────────────────────────
  // Copies performance.sh into the guest and runs it via guestcontrol.
  // Returns { ok: true, cpuPct, ramTotalMB, ramUsedMB, ramFreeMB, processes }
  // Returns { ok: false, vmStopped: true } if the VM is not running.
  // Returns { ok: false, noCredentials: true } if no credentials are saved.
  // Returns { ok: false, error: string } if guestcontrol fails.
  handleIpc('query-vm-performance', async (_event, { vmName }) => {
    if (!await isVmRunning(vmName)) return { ok: false, vmStopped: true }
    const store = await readCredsStore()
    const entry = store[vmName]
    if (!entry?.user || !entry?.pass) return { ok: false, noCredentials: true }
    const { user, pass } = entry
    const scriptSrc = path.join(ROOT, 'vm', 'tools', 'performance.sh')
    try {
      // Encode the script as base64 and pipe it through bash — avoids copyto entirely.
      // base64 alphabet (A-Za-z0-9+/=) is safe inside bash single quotes.
      const encoded = Buffer.from(fs.readFileSync(scriptSrc, 'utf8').replace(/\r\n/g, '\n')).toString('base64')
      log.vm(`[perf] "${vmName}"  running via inline base64`)
      const { stdout } = await execFileAsync('VBoxManage', [
        'guestcontrol', vmName,
        'run', '--exe', '/bin/bash',
        '--username', user, '--password', pass,
        '--wait-stdout',
        '--', '-c', `echo '${encoded}' | base64 -d | bash 2>&1`,
      ], { encoding: 'utf8', timeout: 30000 })
      const data = extractPerfJson(stdout)
      const ramPct = data.ramTotalMB > 0 ? Math.round((data.ramUsedMB / data.ramTotalMB) * 100) : 0
      log.vm(`[perf] "${vmName}"  CPU: ${data.cpuPct}%  RAM: ${data.ramUsedMB} / ${data.ramTotalMB} MB (${ramPct}%)  Free: ${data.ramFreeMB} MB`)
      if (Array.isArray(data.processes) && data.processes.length > 0) {
        log.vm(`[perf] "${vmName}"  Top processes:`)
        data.processes.forEach((p, i) => {
          const rank = String(i + 1).padStart(2)
          const name = p.name.padEnd(22)
          const cpu  = String(p.cpu.toFixed(1)).padStart(5)
          log.vm(`[perf] "${vmName}"    ${rank}. ${name}  CPU: ${cpu}%  RSS: ${p.rssMB} MB`)
        })
      }
      return { ok: true, ...data }
    } catch (error) {
      // VBoxManage sometimes exits non-zero even when the guest command succeeded —
      // try to recover JSON from stdout before treating it as a real failure.
      const rawOut = error.stdout || ''
      if (rawOut) {
        try {
          const data = extractPerfJson(rawOut)
          log.vm(`[perf] "${vmName}"  exit-code false-failure — JSON recovered from stdout`)
          return { ok: true, ...data }
        } catch {}
      }
      const detail = [rawOut.trim(), (error.stderr || '').trim()].filter(Boolean).join(' | ') || error.message
      log.vm(`[perf] "${vmName}" failed (exit ${error.code ?? '?'}): ${detail}`)
      if (error.killed) return { ok: false, error: 'The VM is not responding — it may be busy. Try again in a moment.' }
      return { ok: false, error: 'Could not read performance data from the VM.' }
    }
  })

  // ── kill-vm-process ──────────────────────────────────────
  // Stops a process inside the VM by PID. If the PID is owned by a systemd unit,
  // stops the unit so systemd does not restart the process. Falls back to kill -9
  // for processes not managed by systemd.
  // Returns { ok: true } on success.
  // Returns { ok: false, error: string } on failure.
  handleIpc('kill-vm-process', async (_event, { vmName, pid, procName }) => {
    if (!await isVmRunning(vmName)) return { ok: false, error: 'VM is not running' }
    const store = await readCredsStore()
    const entry = store[vmName]
    if (!entry?.user || !entry?.pass) return { ok: false, error: 'No credentials saved' }
    const { user, pass } = entry
    const label = procName ? `"${procName}" (PID ${pid})` : `PID ${pid}`
    // Base64-encode the script so no special characters ($, |, ;, [, \) get
    // mangled by Windows argument quoting on the way to VBoxManage.
    // Use pgrep to find the CURRENT PID by name — the UI's snapshot PID may be stale
    // if the process restarted between the table refresh and the kill click.
    const safeProc = (procName || '').replace(/[^a-zA-Z0-9_\-.:]/g, '')
    const script = [
      `PROC=${safeProc}`,
      `SNAP_PID=${pid}`,
      // Find freshest PID by name; fall back to snapshot PID if pgrep finds nothing
      `CUR_PID=$(pgrep -x "$PROC" 2>/dev/null | head -1)`,
      `LOOKUP_PID=${pid}`,
      `if [ -n "$CUR_PID" ]; then LOOKUP_PID=$CUR_PID; fi`,
      // Detect owning systemd unit from cgroup
      `UNIT=$(cat /proc/$LOOKUP_PID/cgroup 2>/dev/null | grep -Eo '[^/]+\\.(service|socket|timer)' | head -1)`,
      `if [ -n "$UNIT" ]; then`,
      `  if systemctl stop --no-block "$UNIT" 2>&1; then`,
      `    # Give the unit 2 s to begin shutdown, then SIGKILL any cgroup members still alive`,
      `    # (e.g. containerd-shim processes that outlive the k3s main process)`,
      `    sleep 2`,
      `    systemctl kill --kill-who=all --signal=SIGKILL "$UNIT" 2>/dev/null || true`,
      `    echo "ok:systemctl:$UNIT"`,
      `  else echo "err:systemctl:$UNIT"; fi`,
      `elif [ -n "$CUR_PID" ]; then`,
      `  if kill -9 "$CUR_PID" 2>&1; then echo "ok:kill9:$CUR_PID"`,
      `  else echo "err:kill9:$CUR_PID"; fi`,
      `else`,
      `  # pgrep found nothing — process is likely already gone; try snapshot PID as last resort`,
      `  if kill -9 "$SNAP_PID" 2>&1; then echo "ok:kill9:$SNAP_PID"`,
      `  else echo "ok:gone"; fi`,
      `fi`,
    ].join('\n')
    const encoded = Buffer.from(script).toString('base64')
    const runCmd = `echo '${encoded}' | base64 -d | bash 2>&1`
    try {
      const { stdout } = await execFileAsync('VBoxManage', [
        'guestcontrol', vmName,
        'run', '--exe', '/bin/bash',
        '--username', user, '--password', pass,
        '--wait-stdout',
        '--', '-c', runCmd,
      ], { encoding: 'utf8', timeout: 60000 })
      const out = (stdout || '').split('\n').map(l => l.trim()).find(l => l === 'ok:gone' || l.startsWith('ok:') || l.startsWith('err:')) || ''
      if (out.startsWith('ok:systemctl:')) {
        log.vm(`[kill] "${vmName}"  ${label} — stopped systemd unit "${out.slice(13)}"`)
        return { ok: true }
      } else if (out.startsWith('ok:kill9:')) {
        log.vm(`[kill] "${vmName}"  ${label} — not systemd-managed, sent SIGKILL`)
        return { ok: true }
      } else if (out === 'ok:gone') {
        log.vm(`[kill] "${vmName}"  ${label} — process was already gone`)
        return { ok: true }
      } else if (out.startsWith('err:systemctl:')) {
        const unit = out.slice(14)
        log.vm(`[kill] "${vmName}"  ${label} — systemctl stop "${unit}" failed`)
        return { ok: false, error: `systemctl stop ${unit} failed` }
      } else if (out.startsWith('err:kill9:')) {
        log.vm(`[kill] "${vmName}"  ${label} — kill -9 failed (PID may have already exited)`)
        return { ok: false, error: 'kill -9 failed — process may have already exited' }
      } else {
        log.vm(`[kill] "${vmName}"  ${label} — unexpected output: ${stdout.trim().slice(0, 200)}`)
        return { ok: false, error: 'Unexpected response from guest' }
      }
    } catch (error) {
      // VBoxManage false-failure: check stdout for a valid result before giving up.
      const rawOut = (error.stdout || '').split('\n').map(l => l.trim()).find(l => l === 'ok:gone' || l.startsWith('ok:') || l.startsWith('err:')) || ''
      if (rawOut.startsWith('ok:systemctl:')) {
        log.vm(`[kill] "${vmName}"  ${label} — stopped systemd unit "${rawOut.slice(13)}" (exit-code false-failure)`)
        return { ok: true }
      } else if (rawOut.startsWith('ok:kill9:')) {
        log.vm(`[kill] "${vmName}"  ${label} — not systemd-managed, sent SIGKILL (exit-code false-failure)`)
        return { ok: true }
      } else if (rawOut === 'ok:gone') {
        log.vm(`[kill] "${vmName}"  ${label} — process was already gone (exit-code false-failure)`)
        return { ok: true }
      }
      if (error.killed && safeProc) {
        // guestcontrol's --wait-stdout can hang past the timeout waiting for the
        // stdout pipe to close — an orphaned child (e.g. a containerd-shim left
        // behind by a killed k3s unit) can inherit the FD and keep it open even
        // though the target process is already dead. A heavy unit's teardown
        // (tearing down CNI namespaces, iptables rules per pod, etc.) can also
        // still be in progress at the moment of the first check, so retry a
        // few times with a short backoff before reporting a false failure.
        for (let attempt = 0; attempt < 4; attempt++) {
          if (attempt > 0) await sleep(3000)
          try {
            const { stdout: verifyOut } = await execFileAsync('VBoxManage', [
              'guestcontrol', vmName,
              'run', '--exe', '/bin/bash',
              '--username', user, '--password', pass,
              '--wait-stdout',
              '--', '-c', `pgrep -x "${safeProc}" >/dev/null 2>&1 && echo running || echo gone`,
            ], { encoding: 'utf8', timeout: 15000 })
            if (verifyOut.includes('gone')) {
              log.vm(`[kill] "${vmName}"  ${label} — guestcontrol timed out, but verified the process is gone (attempt ${attempt + 1})`)
              return { ok: true }
            }
          } catch { /* verification call itself failed/timed out too — retry */ }
        }
      }
      // Log raw VBoxManage output to diagnose failures (session conflict, timeout, auth, etc.)
      log.vm(`[kill] "${vmName}"  ${label} — VBoxManage exit=${error.code ?? '?'} killed=${!!error.killed}`)
      if (error.stdout) log.vm(`[kill] "${vmName}"  stdout: ${error.stdout.trim().slice(0, 400)}`)
      if (error.stderr) log.vm(`[kill] "${vmName}"  stderr: ${error.stderr.trim().slice(0, 400)}`)
      const detail = [(error.stdout || '').trim(), (error.stderr || '').trim()].filter(Boolean).join(' | ') || error.message
      log.vm(`[kill] "${vmName}"  failed to stop ${label}: ${detail}`)
      const friendly = error.killed
        ? `Could not stop ${procName || `PID ${pid}`} — the operation timed out`
        : `Could not stop ${procName || `PID ${pid}`} — the VM may be busy (diagnostics still running?)`
      return { ok: false, error: friendly }
    }
  })

  // ── get-script-state ─────────────────────────────────────
  // Returns the buffered output of the current or most recent script run so
  // the renderer can reconnect to an in-progress or just-completed run after
  // navigating away and back.
  handleIpc('get-script-state', async () => {
    return { ok: true, ...getScriptState() }
  })

  // ── clear-script-state ───────────────────────────────────
  // Called by the renderer after it has consumed a done result via reconnect,
  // so the next navigation back shows the idle form instead of the result again.
  handleIpc('clear-script-state', async () => {
    clearScriptState()
    return { ok: true }
  })

  // ── run-provision-script ─────────────────────────────────
  // Uploads and runs a single guest script via guestcontrol. Streams output to the renderer.
  handleIpc('run-provision-script', async (_event, params) => {
    log.info(`[ipc] recv run-provision-script vm="${params.vmName}" script="${params.scriptRelPath}"`)
    const psArgs = [
      '-VmName',        params.vmName,
      '-VmUser',        params.vmUser,
      '-VmPass',        params.vmPass,
      '-LoginUser',     params.loginUser,
      '-ScriptRelPath', params.scriptRelPath,
      '-NonInteractive',
    ]
    if (params.scriptArgs) psArgs.push('-ScriptArgs', params.scriptArgs)
    const { exitCode, lines } = await streamScript(win, SCRIPTS.runProvisionScript, psArgs, { vmName: params.vmName, type: 'provision', categoryDir: params.categoryDir ?? null, scriptName: params.scriptName ?? null })
    if (exitCode === 0) return { ok: true }
    return { ok: false, errorDetail: extractError(lines) }
  })

  // ── run-provision-setup ──────────────────────────────────
  // Runs all base setup scripts (system-prep, network, selinux, desktop, utilities). Streams output.
  handleIpc('run-provision-setup', async (_event, params) => {
    log.info(`[ipc] recv run-provision-setup vm="${params.vmName}"`)
    const psArgs = [
      '-VmName',    params.vmName,
      '-VmUser',    params.vmUser,
      '-VmPass',    params.vmPass,
      '-LoginUser', params.loginUser,
      '-Hostname',  params.hostname,
      '-NonInteractive',
    ]
    const { exitCode, lines } = await streamScript(win, SCRIPTS.runProvisionSetup, psArgs, { vmName: params.vmName, type: 'provision' })
    if (exitCode === 0) return { ok: true }
    return { ok: false, errorDetail: extractError(lines) }
  })

  // ── run-share-folder ─────────────────────────────────────
  // Runs share-folder.ps1 non-interactively with the supplied parameters.
  // Streams output to the renderer; returns ok when the script exits 0.
  // On failure, errorDetail contains the last ERROR:-prefixed line from the script.
  handleIpc('run-share-folder', async (_event, params) => {
    log.info(`[ipc] recv run-share-folder vm="${params.vmName}"`)
    const psArgs = [
      '-VmName',    params.vmName,
      '-HostPath',  params.hostPath,
      '-MountPoint', params.mountPoint,
      '-VmUser',    params.vmUser,
      '-VmPass',    params.vmPass,
      '-LoginUser', params.loginUser,
      '-NonInteractive',
    ]
    if (params.forceRestart) psArgs.push('-ForceRestart')
    const { exitCode, lines } = await streamScript(win, SCRIPTS.shareFolder, psArgs, { vmName: params.vmName, type: 'share-folder' })
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

      // Log sync destination: <VM folder>\guest-logs — only set when the share
      // has actually been registered in VirtualBox (i.e. share-logs.ps1 has run).
      let logSyncPath = null
      if (kv['CfgFile']) {
        const candidate = path.join(path.dirname(kv['CfgFile']), 'guest-logs')
        const hasShare = sharedFolders.some(
          sf => sf.hostPath.toLowerCase() === candidate.toLowerCase()
        )
        if (hasShare) logSyncPath = candidate
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
          logSyncPath,
          paravirtProvider:      kv['paravirtprovider']      ?? 'default',
          acceleration3d:        kv['accelerate3d']          === 'on',
          nicType:               kv['nictype1']              ?? '',
          cpuExecCap:            parseInt(kv['cpuexecutioncap'] ?? '100', 10),
          storageControllerType: kv['storagecontrollertype0'] ?? null,
        },
      }
    } catch (error) {
      log.error(`[ipc][get-vm-info] "${vmName}":`, error.message)
      return { ok: false, error: error.message }
    }
  })

  // ── fix-vm-perf-setting ───────────────────────────────────
  // Applies a single VBoxManage modifyvm fix for a known suboptimal setting.
  // The VM must be powered off; VBoxManage will return an error otherwise.
  handleIpc('fix-vm-perf-setting', async (_event, { vmName, setting }) => {
    const cmds = {
      paravirt:       `VBoxManage modifyvm "${vmName}" --paravirtprovider kvm`,
      nicType:        `VBoxManage modifyvm "${vmName}" --nictype1 virtio`,
      acceleration3d: `VBoxManage modifyvm "${vmName}" --accelerate3d on`,
      cpuExecCap:     `VBoxManage modifyvm "${vmName}" --cpuexecutioncap 100`,
    }
    const cmd = cmds[setting]
    if (!cmd) return { ok: false, error: `Unknown setting: ${setting}` }
    try {
      log.info(`[ipc][fix-vm-perf-setting] running: ${cmd}`)
      await execAsync(cmd, { encoding: 'utf8' })
      log.info(`[ipc][fix-vm-perf-setting] "${vmName}" ${setting} fixed`)
      return { ok: true }
    } catch (error) {
      log.error(`[ipc][fix-vm-perf-setting] "${vmName}" ${setting}:`, error.message)
      return { ok: false, error: error.message }
    }
  })

  // ── run-share-logs ────────────────────────────────────────
  // Runs share-logs.ps1 non-interactively. Streams output to the renderer.
  // On failure, errorDetail contains the last ERROR:-prefixed line from the script.
  handleIpc('run-share-logs', async (_event, params) => {
    log.info(`[ipc] recv run-share-logs vm="${params.vmName}"`)
    const psArgs = ['-VmName', params.vmName, '-HostPath', params.hostPath, '-VmUser', params.vmUser, '-VmPass', params.vmPass, '-LoginUser', params.loginUser, '-NonInteractive']
    if (params.forceRestart) psArgs.push('-ForceRestart')
    const { exitCode, lines } = await streamScript(win, SCRIPTS.shareLogs, psArgs, { vmName: params.vmName, type: 'share-logs' })
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

  // ── log-ui-action ─────────────────────────────────────────
  // Writes a [ui] trace line to gui.log for every user click.
  handleIpc('log-ui-action', async (_event, action) => {
    log.info(`[ui] ${action}`)
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
