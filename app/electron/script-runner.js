// ============================================================
//  script-runner.js — spawns PowerShell scripts
//
//  All script execution goes through this file.
//  It tracks the active child process so main.js can kill it
//  if the user tries to close the app mid-run.
// ============================================================

const { spawn } = require('child_process')

// The currently running child process, or null if nothing is running.
// Only one script runs at a time.
let activeChild = null

/**
 * Returns true if a script is currently running.
 * Used by main.js to decide whether to show the close warning.
 * @returns {boolean}
 */
function hasActiveScript() {
  return activeChild !== null
}

/**
 * Kills the active script and its entire process tree.
 *
 * On Windows, child.kill() only kills powershell.exe itself.
 * Any processes it spawned (VBoxManage, installers) keep running.
 * taskkill /T kills the whole tree, /F forces it if it does not exit cleanly.
 */
function killActiveScript() {
  if (!activeChild) return

  const pid = activeChild.pid.toString()
  spawn('taskkill', ['/PID', pid, '/T', '/F'])
  activeChild = null
}

/**
 * Converts a raw stdout/stderr Buffer chunk into an array of non-empty ScriptLine objects.
 * Handles both CRLF and LF line endings and skips whitespace-only lines.
 *
 * @param {Buffer|string} chunk
 * @param {'stdout'|'stderr'} source
 * @returns {{ text: string, source: 'stdout'|'stderr' }[]}
 */
function splitChunk(chunk, source) {
  const text = chunk.toString()                              // Buffer or string → plain string
  const lines = text.split(/\r?\n/)                         // split on LF or CRLF line endings
  const nonEmpty = lines.filter((line) => line.trim() !== '') // drop blank/whitespace-only lines
  return nonEmpty.map((text) => ({ text, source }))         // tag each line with its source
}

/**
 * Runs a PowerShell script and streams its output line by line.
 *
 * @param {string}   scriptPath - Absolute path to the .ps1 file
 * @param {string[]} args       - Arguments to pass after the script path
 * @param {function} onLine     - Called with each output line as it arrives
 * @param {function} onDone     - Called with the exit code when the script finishes
 */
function runScript(scriptPath, args, onLine, onDone) {
  // Build the full argument list for PowerShell.
  // -ExecutionPolicy Bypass lets us run unsigned scripts without changing system policy.
  // -File tells PowerShell to run a script file rather than a command string.
  const psArgs = [
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    ...args,
  ]

  if (process.env.NODE_ENV !== 'production') {
    console.log('[script-runner] spawning:', 'powershell', psArgs.join(' '))
  }

  // spawn() starts the process and returns immediately.
  // stdout and stderr are streams — data arrives as the script produces it.
  activeChild = spawn('powershell', psArgs)

  // stdout: normal output lines from the script (Write-Host, Write-Output)
  activeChild.stdout.on('data', (chunk) => {
    for (const line of splitChunk(chunk, 'stdout')) onLine(line)
  })

  // stderr: error output — PowerShell writes some warnings here too
  activeChild.stderr.on('data', (chunk) => {
    for (const line of splitChunk(chunk, 'stderr')) onLine(line)
  })

  // 'close' fires when the process has exited and all streams are flushed.
  // exitCode is 0 for success, non-zero for failure.
  activeChild.on('close', (exitCode) => {
    activeChild = null
    onDone(exitCode ?? 1)
  })

  // 'error' fires if the process could not be started at all
  // (e.g. powershell.exe not found on PATH)
  activeChild.on('error', (err) => {
    console.error('[script-runner] failed to start process:', err.message)
    activeChild = null
    onLine({ text: `ERROR: Could not start PowerShell: ${err.message}`, source: 'stderr' })
    onDone(1)
  })
}

module.exports = { runScript, killActiveScript, hasActiveScript, splitChunk }
