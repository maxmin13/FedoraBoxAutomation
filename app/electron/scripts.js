// Single source of truth for all PowerShell script paths.
// Import this file anywhere you need to reference a script — never hardcode paths.

const path = require('path')

// __dirname is electron-gui/electron/ so host/ is two levels up
const HOST_DIR = path.join(__dirname, '..', '..', 'host')

const SCRIPTS = {
  sanityChecks: path.join(HOST_DIR, 'virtualbox-sanity-checks.ps1'),
  installVirtualBox: path.join(HOST_DIR, 'virtualbox-install.ps1'),
  createVm: path.join(HOST_DIR, 'create-vm.ps1'),
  provisionVm: path.join(HOST_DIR, 'provision-vm.ps1'),
  cleanup: path.join(HOST_DIR, 'cleanup.ps1'),
  shareFolder: path.join(HOST_DIR, 'share-folder.ps1'),
}

module.exports = SCRIPTS
