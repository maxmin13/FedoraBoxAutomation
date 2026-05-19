// Shared file logger for the Electron main process.
// Writes to %APPDATA%\FedoraBoxAutomation\logs\gui.log in all environments.
// In development it also mirrors output to the console.

const fs   = require('fs')
const path = require('path')
const os   = require('os')

const LOG_DIR  = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'FedoraBoxAutomation',
  'logs'
)
const LOG_FILE  = path.join(LOG_DIR, 'gui.log')
const HOST_FILE = path.join(LOG_DIR, 'host.log')

const MAX_GUI  = 2 * 1024 * 1024  // 2 MB — rotate gui.log
const MAX_HOST = 5 * 1024 * 1024  // 5 MB — rotate host.log

function rotate(file, maxBytes) {
  try {
    if (fs.statSync(file).size >= maxBytes) fs.renameSync(file, file + '.1')
  } catch {}
}

try {
  fs.mkdirSync(LOG_DIR, { recursive: true })
} catch {}

const isDev = process.env.NODE_ENV !== 'production'

function format(level, args) {
  const ts   = new Date().toISOString().replace('T', ' ').slice(0, 23)
  const text = args
    .map((a) => (a !== null && typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ')
  return `[${ts}] [${level.padEnd(5)}] ${text}\n`
}

function write(level, args) {
  const line = format(level, args)
  try {
    rotate(LOG_FILE, MAX_GUI)
    fs.appendFileSync(LOG_FILE, line, 'utf8')
  } catch {}

  if (isDev) {
    const plain = line.trim()
    if (level === 'error') console.error(plain)
    else if (level === 'warn')  console.warn(plain)
    else                        console.log(plain)
  }
}

function writeHost(text) {
  const ts   = new Date().toISOString().replace('T', ' ').slice(0, 23)
  const line = `[${ts}] ${text}\n`
  try {
    rotate(HOST_FILE, MAX_HOST)
    fs.appendFileSync(HOST_FILE, line, 'utf8')
  } catch {}
}

module.exports = {
  LOG_DIR,
  info:     (...args) => write('info',  args),
  warn:     (...args) => write('warn',  args),
  error:    (...args) => write('error', args),
  hostLine: (text) => writeHost(text),
  hostMark: (text) => writeHost(`--- ${text} ---`),
}
