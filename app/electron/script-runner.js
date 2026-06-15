// ============================================================
//  script-runner.js — spawns PowerShell scripts
//
//  All script execution goes through this file.
//  It tracks the active child process so main.js can kill it
//  if the user tries to close the app mid-run.
// ============================================================

const { spawn } = require('child_process')
const log = require('./logger')

// The currently running child process, or null if nothing is running.
// Only one script runs at a time.
let activeChild = null

// Buffer for the current (or most recent) run so the renderer can reconnect
// after navigating away.  Cleared when a new script starts.
let _runLines   = []
let _runDone    = false
let _runExitCode = null
let _runContext  = null  // { vmName, type } set by callers that want reconnect support

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
  if (!activeChild) {
    return
  }

  const pid = activeChild.pid.toString()
  log.warn(`[script] killing process tree PID ${pid}`)
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
  const text = chunk.toString()
  const lines = text.split(/\r?\n/)
  const nonEmpty = lines.filter((line) => line.trim() !== '')
  return nonEmpty.map((line) => ({ text: line, source }))
}

/**
 * Runs a PowerShell script and streams its output line by line.
 *
 * @param {string}   scriptPath - Absolute path to the .ps1 file
 * @param {string[]} args - Arguments to pass after the script path
 * @param {function} onLine - Called with each output line as it arrives
 * @param {function} onDone - Called with the exit code when the script finishes
 */
function runScript(scriptPath, args, onLine, onDone) {
  // Reset run buffer for this new script.
  _runLines    = []
  _runDone     = false
  _runExitCode = null
  // _runContext is set by setRunContext() before runScript is called.

  const psArgs = [
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    ...args,
  ]

  log.info('[script] spawning:', 'powershell', psArgs.join(' '))

  activeChild = spawn('powershell', psArgs)

  activeChild.stdout.on('data', (chunk) => {
    for (const line of splitChunk(chunk, 'stdout')) {
      _runLines.push(line)
      onLine(line)
    }
  })

  activeChild.stderr.on('data', (chunk) => {
    for (const line of splitChunk(chunk, 'stderr')) {
      _runLines.push(line)
      onLine(line)
    }
  })

  activeChild.on('close', (exitCode) => {
    const code = exitCode ?? 1
    log.info(`[script] exited with code ${code}`)
    _runDone     = true
    _runExitCode = code
    activeChild  = null
    onDone(code)
  })

  activeChild.on('error', (err) => {
    log.error('[script] failed to start process:', err.message)
    const errLine = { text: `ERROR: Could not start PowerShell: ${err.message}`, source: 'stderr' }
    _runLines.push(errLine)
    _runDone     = true
    _runExitCode = 1
    activeChild  = null
    onLine(errLine)
    onDone(1)
  })
}

/** Called by ipc-handlers before starting a script so the renderer can match the run. */
function setRunContext(context) {
  _runContext = context
}

/** Returns the state of the current or most recently completed run. */
function getScriptState() {
  return {
    running:  activeChild !== null,
    done:     _runDone,
    exitCode: _runExitCode,
    lines:    [..._runLines],
    context:  _runContext,
  }
}

module.exports = { runScript, killActiveScript, hasActiveScript, splitChunk, setRunContext, getScriptState }
