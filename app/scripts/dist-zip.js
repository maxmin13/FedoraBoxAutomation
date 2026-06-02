/**
 * Builds and packages the app as a portable zip without requiring
 * Developer Mode or Administrator privileges.
 *
 * Steps:
 *   1. vite build  — compile the renderer
 *   2. electron-builder --dir  — package to dist-installer/win-unpacked (always
 *      succeeds; subsequent winCodeSign steps fail but are ignored)
 *   3. Compress-Archive  — zip win-unpacked into a distributable archive
 */

'use strict'

const { execSync } = require('child_process')
const fs   = require('fs')
const path = require('path')

const ROOT        = path.join(__dirname, '..')
const UNPACKED    = path.join(ROOT, 'dist-installer', 'win-unpacked')
const PKG         = require(path.join(ROOT, 'package.json'))
const VERSION     = PKG.version
const ZIP_NAME    = `FedoraBox-Automation-${VERSION}-win-x64.zip`
const ZIP_PATH    = path.join(ROOT, 'dist-installer', ZIP_NAME)

// Step 1 — Vite build
console.log('\n=== Step 1: Vite build ===')
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' })

// Step 2 — electron-builder --dir (packaging only; ignore winCodeSign failure)
console.log('\n=== Step 2: electron-builder --dir ===')
try {
  execSync('npx electron-builder --win --x64 --dir', {
    cwd: ROOT,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', WIN_CSC_LINK: '' },
    stdio: 'inherit',
  })
} catch (_) {
  // electron-builder fails at the winCodeSign extraction step but win-unpacked
  // is already created by then — the zip step handles the rest.
}

if (!fs.existsSync(UNPACKED)) {
  console.error(`\nERROR: ${UNPACKED} not found — packaging failed before win-unpacked was created.`)
  process.exit(1)
}

// Step 3 — zip win-unpacked using PowerShell Compress-Archive
console.log('\n=== Step 3: Creating zip ===')
if (fs.existsSync(ZIP_PATH)) fs.rmSync(ZIP_PATH)
execSync(
  `powershell -Command "Compress-Archive -Path '${UNPACKED}\\*' -DestinationPath '${ZIP_PATH}' -Force"`,
  { stdio: 'inherit' }
)
console.log(`\nDone: dist-installer\\${ZIP_NAME}`)
