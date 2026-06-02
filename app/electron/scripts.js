// Single source of truth for all PowerShell script paths.
// Import this file anywhere you need to reference a script — never hardcode paths.

const path = require('path')
const { app } = require('electron')

// When packaged, extraResources land in process.resourcesPath alongside the ASAR.
// In dev, the project root is two levels above app/electron/.
const ROOT = app?.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '..', '..')

const HOST_DIR = path.join(ROOT, 'host')

const SCRIPTS = {
  sanityChecks:        path.join(HOST_DIR, 'virtualbox-sanity-checks.ps1'),
  installVirtualBox:   path.join(HOST_DIR, 'virtualbox-install.ps1'),
  createVm:            path.join(HOST_DIR, 'create-vm.ps1'),
  runProvisionScript:  path.join(HOST_DIR, 'provision-script.ps1'),
  runProvisionSetup:   path.join(HOST_DIR, 'provision-setup.ps1'),
  shareFolder:         path.join(HOST_DIR, 'share-folder.ps1'),
  shareLogs:           path.join(HOST_DIR, 'share-logs.ps1'),
}

module.exports = SCRIPTS
