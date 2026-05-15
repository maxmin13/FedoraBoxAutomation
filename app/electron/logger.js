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
const LOG_FILE = path.join(LOG_DIR, 'gui.log')

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
    fs.appendFileSync(LOG_FILE, line, 'utf8')
  } catch {}

  if (isDev) {
    const plain = line.trim()
    if (level === 'error') console.error(plain)
    else if (level === 'warn')  console.warn(plain)
    else                        console.log(plain)
  }
}

module.exports = {
  info:  (...args) => write('info',  args),
  warn:  (...args) => write('warn',  args),
  error: (...args) => write('error', args),
}
