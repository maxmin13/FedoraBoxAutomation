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

const { ipcMain } = require('electron')
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const { runScript } = require('./script-runner')
const SCRIPTS = require('./scripts')

// The docs/ folder sits two levels above app/electron/
const DOCS_DIR = path.join(__dirname, '..', '..', 'docs')

// In development, wrap ipcMain.handle to log every call and reply.
// This makes it easy to see what data is flowing between processes.
const isDev = process.env.NODE_ENV !== 'production'

/**
 * Wraps ipcMain.handle with development logging.
 * Use this instead of ipcMain.handle() everywhere in this file.
 *
 * @param {string}   channel - The IPC channel name
 * @param {function} handler - Async function that handles the request
 */
function handleIpc(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (isDev) {
      console.log(`[IPC] received: ${channel}`, args)
    }

    const result = await handler(event, ...args)

    if (isDev) {
      console.log(`[IPC] replied: ${channel}`, result)
    }

    return result
  })
}

/**
 * Registers all IPC handlers. Called once from main.js after the window is created.
 * @param {Electron.BrowserWindow} win - The main window, used to push streaming events
 */
function registerIpcHandlers(win) {

  // ── is-dev ────────────────────────────────────────────────
  handleIpc('is-dev', async () => isDev)

  // ── read-doc ──────────────────────────────────────────────
  // Reads a markdown file from the docs/ folder and returns its contents.
  // The filename is just the base name (e.g. 'DEVELOPMENT.md') — the path
  // to docs/ is resolved here in the main process, not in the renderer.
  // This keeps the renderer sandboxed: it cannot request arbitrary file paths.
  handleIpc('read-doc', async (_event, filename) => {
    try {
      const filePath = path.join(DOCS_DIR, filename)
      const content = fs.readFileSync(filePath, 'utf8')
      return { ok: true, content }
    } catch (error) {
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
      return { ok: false, error: error.message, vms: [] }
    }
  })

  // ── run-sanity-checks ─────────────────────────────────────
  // Runs the sanity check script with -Json flag and returns structured results.
  // The script writes a JSON array to stdout; we collect all lines then parse.
  handleIpc('run-sanity-checks', () => {
    return new Promise((resolve) => {
      const stdoutLines = []
      const stderrLines = []

      function onLine(line) {
        win.webContents.send('script-line', line)
        if (line.source === 'stdout') {
          stdoutLines.push(line.text)
        } else {
          stderrLines.push(line.text)
        }
      }

      function onDone(exitCode) {
        win.webContents.send('script-done', exitCode)

        if (isDev) {
          console.log('[run-sanity-checks] stdout lines:', stdoutLines.length)
          console.log('[run-sanity-checks] stderr lines:', stderrLines.length)
          if (stderrLines.length) console.log('[run-sanity-checks] stderr:\n' + stderrLines.join('\n'))
        }

        try {
          const checks = parseChecksOutput(stdoutLines, stderrLines)
          resolve({ ok: true, checks })
        } catch (parseError) {
          resolve({ ok: false, error: 'Could not parse check results: ' + parseError.message, checks: [] })
        }
      }

      runScript(SCRIPTS.sanityChecks, ['-Json'], onLine, onDone)
    })
  })

  // ── install-virtualbox ────────────────────────────────────
  // Runs the VirtualBox installer script and streams output to the renderer.
  handleIpc('install-virtualbox', () => {
    return new Promise((resolve) => {
      function onLine(line) {
        win.webContents.send('script-line', line)
      }

      function onDone(exitCode) {
        win.webContents.send('script-done', exitCode)
        resolve({ ok: exitCode === 0 })
      }

      runScript(SCRIPTS.installVirtualBox, [], onLine, onDone)
    })
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
