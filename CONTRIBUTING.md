# Contributing

## Shell Scripts (.sh)

### Structure

Every script must start with:

```bash
#!/bin/bash

##
## Description: One or two lines describing what the script does.
## Usage:       sudo ./script-name.sh [args]
## Parameters:  $1  <login-user>   Non-root desktop username (e.g. maxmin)
##              $2  [version]      Version to install (default: x.y.z)
##

source /tmp/common.sh
```

Scripts with no parameters must still include `## Parameters:  none`.

### Error handling

Source `common.sh` at the top of every script. It enables strict error handling and enforces root automatically:

```bash
set -o errexit   # exit on error
set -o pipefail  # exit on pipe failure
set -o nounset   # exit on undefined variable

if [[ "$(id -u)" -ne 0 ]]; then
    echo 'ERROR: This script must be run as root.' >&2
    exit 1
fi
```

### Logging

Use structured logging functions from `common.sh` — never raw `echo` for status messages:

```bash
log_info  "message"   # informational
log_warn  "message"   # non-fatal warning
log_error "message"   # error (follow with exit 1)
STEP      "name"      # major section heading
```

All output is automatically tee'd to `/var/log/fedora-box-automation.log` by `common.sh`.

### Idempotency

Scripts must be safe to run more than once without errors or side effects:

- **Package installs:** `dnf install -y` is idempotent by default.
- **Service commands:** `systemctl enable/start` are idempotent.
- **File creation:** check before writing — use `[[ ! -f path ]]` or `grep -q` guards.
- **File appends:** always check before appending to avoid duplicates.
- **Downloads/installs:** guard with a version or existence check before downloading.
- **`mv` commands:** guard with `[[ -f source ]]` — the file won't exist on re-run.
- **Repo config files:** use `>` not `>>` / `tee -a` to avoid duplicate entries.

Example pattern:

```bash
if ! command -v mytool > /dev/null 2>&1
then
    # install
    log_info 'mytool installed.'
else
    log_info 'mytool already installed.'
fi
```

### Home directory

Never hardcode `/home/${LOGIN_USER}` — root's home is `/root`, not `/home/root`:

```bash
HOME_DIR=$(eval echo "~${LOGIN_USER}")
cd "${HOME_DIR}"
```

### Parameters

All parameters are mandatory — never use default values (e.g. `"${1:-root}"`). Validate at the top:

```bash
if [[ 0 -eq $# ]]
then
    log_error 'login user not found.'
    exit 1
fi

LOGIN_USER="${1}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")
```

**Optional version argument for testability:** Scripts that fetch a version string via `curl` should accept an optional `$2` so tests can inject a fixed version without network access:

```bash
VERSION="${2:-}"
if [[ -z "${VERSION}" ]]; then
    VERSION=$(curl -sL https://endoflife.date/api/<product>/latest.json | python3 -c "import sys,json; print(json.load(sys.stdin)['latest'])")
fi
```

### Downloads

- Use plain `wget` for large file downloads (`--progress=dot` is not implemented in Fedora's wget and produces a warning).
- Use `curl -#` (or `curl -sL` for small text-only fetches like version strings).
- Fetch latest stable versions dynamically from the endoflife.date API rather than hardcoding:

```bash
VERSION=$(curl -sL https://endoflife.date/api/<product>/latest.json \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['latest'])")
```

- Always validate version strings fetched via curl before using them in URLs:

```bash
if [[ -z "${VERSION}" ]]; then
    log_error 'Could not determine latest version.'
    exit 1
fi
```

### Prerequisite checks

If a script depends on another tool being installed, check for it explicitly at the top and exit with a clear message:

```bash
if ! docker --version > /dev/null 2>&1; then
    log_error 'Docker is not installed. Run docker.sh first.'
    exit 1
fi
```

### Docker group activation

After adding a user to the `docker` group, activate group membership in the same session with `sg` — never require a logout:

```bash
sg docker -c "docker run --rm hello-world"
```

This applies to any command that needs the `docker` group to be active.

### Python builds

- Never use `--enable-optimizations` in `./configure` — it causes test failures inside VMs.
- Always use `make altinstall` not `make install` to avoid overwriting the system Python.
- Name virtual environments `~/python_venv_X.Y` to allow multiple Python versions to coexist:

```bash
python3.12 -m venv ~/python_venv_3.12
```

### Temporary files

Always use `mktemp` and clean up with a trap:

```bash
WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT
```

### Line endings

- Always use **LF line endings** (not CRLF). Windows editors default to CRLF which causes "file not found" / exit code 126 on Linux because the shebang becomes `#!/bin/bash\r`.
- Convert before committing:
  ```powershell
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  Get-ChildItem -Filter "*.sh" -Recurse | ForEach-Object {
      $content = [System.IO.File]::ReadAllText($_.FullName)
      [System.IO.File]::WriteAllText($_.FullName, ($content -replace "`r`n", "`n"), $utf8NoBom)
  }
  ```

## PowerShell Scripts (.ps1)

- Always use `$ErrorActionPreference = 'Stop'` and `try/catch` for error handling.
- Never use Unicode punctuation in string literals — PowerShell 5.1 renders em dashes (`—`), curly quotes (`""`), and similar characters as garbled text. Use plain ASCII equivalents (`-`, `"`, `'`) instead.

### Parameters with Read-Host fallback

Every `.ps1` that accepts input must have a `param()` block, but always fall back to `Read-Host` when the parameter is empty. This makes scripts work both standalone (interactive) and when called from the Electron GUI (parameters passed programmatically):

```powershell
param(
    [string]$VmName = ''
)

if (-not $VmName) {
    $VmName = Read-Host 'Enter VM name'
}
```

Never use `Read-Host` without this guard — it will block Electron's script runner indefinitely.

### VBoxManage calls

Always use the `Invoke-VBox` helper for every VBoxManage call — never call `VBoxManage` directly via `Start-Process`:

```powershell
# Correct
Invoke-VBox 'createvm', '--name', $VmName, '--register'

# Wrong
Start-Process -FilePath 'VBoxManage' -ArgumentList 'createvm', ...
```

`Invoke-VBox` handles error checking and direct execution in the same process.

### Parsing showvminfo output

`VBoxManage showvminfo` output has a trailing `\r` on each line (Windows CRLF behaviour). Use `-match` for string comparisons — never `-eq` or `-contains`:

```powershell
# Correct
if ($line -match 'State:\s+running') { ... }

# Wrong — trailing \r means this never matches
if ($line -eq 'State:         running') { ... }
```

### Per-section try/catch in diagnostic scripts

Diagnostic scripts like `virtualbox-sanity-checks.ps1` must wrap each check in its own `try/catch`. A single outer wrapper kills all JSON output the moment any one check fails:

```powershell
# Correct — each check is independent
try { $ramCheck = Check-Ram } catch { $ramCheck = @{ status = 'fail'; detail = $_.Exception.Message } }
try { $diskCheck = Check-Disk } catch { $diskCheck = @{ status = 'fail'; detail = $_.Exception.Message } }

# Wrong — one failure silences all remaining checks
try {
    $ramCheck  = Check-Ram
    $diskCheck = Check-Disk
} catch { ... }
```

### ConvertTo-Json with single-item collections

`ConvertTo-Json` emits a bare object (not an array) when the input collection has exactly one item. Always wrap with `@(...)` before piping:

```powershell
# Correct
@($checks) | ConvertTo-Json -Depth 5

# Wrong — outputs {} instead of [{}] for a single check
$checks | ConvertTo-Json -Depth 5
```

Add a matching `Array.isArray` guard in the JavaScript consumer:

```js
const checks = Array.isArray(parsed) ? parsed : [parsed]
```

### DISM / progress output contamination

DISM and some Windows cmdlets write progress text to stdout, which corrupts JSON parsing. Suppress it at the top of any script that emits structured output:

```powershell
$ProgressPreference = 'SilentlyContinue'
```

In the Electron script runner, keep stdout and stderr in **separate** Node.js buffers — never mix them before parsing JSON.

### Logging

Every `.ps1` script must write to `%APPDATA%\FedoraBoxAutomation\logs\host.log` using PowerShell's built-in transcript mechanism. Add these three lines immediately after `$ErrorActionPreference = 'Stop'` (or after the `param()` block if one exists):

```powershell
$logDir = "$env:APPDATA\FedoraBoxAutomation\logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
Start-Transcript -Path "$logDir\host.log" -Append -Force | Out-Null
```

Then add a `finally` block to the outermost `try/catch` to guarantee the transcript is stopped even if the script calls `exit 1`:

```powershell
try {
    # ... script body ...
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    Stop-Transcript | Out-Null
}
```

Rules:
- Always pipe `Start-Transcript` and `Stop-Transcript` with `| Out-Null` — they print their own status lines which contaminate stdout (critical for scripts like `virtualbox-sanity-checks.ps1` that emit JSON to stdout).
- Always use `-Append -Force` on `Start-Transcript` so multiple runs append rather than overwrite.
- If a script has no wrapping `try/catch` (rare), place `Stop-Transcript | Out-Null` at the very end of the file.

### Guest script output coloring

- Guest script output printed to the console must be color-coded:
  - **Red** — lines matching `error`, `failed`, `fatal`, `command not found`, `permission denied`
  - **Yellow** — lines matching `warning`
  - Default — everything else

## Electron / React (`app/`)

### Adding a new PowerShell script

1. Register the `.ps1` path in `electron/scripts.js` — this is the single source of truth for all script paths.
2. Add an `ipcMain.handle()` call (via `handleIpc()`) in `electron/ipc-handlers.js`.
3. Expose the new call through `contextBridge` in `electron/preload.js`.
4. Add the TypeScript signature in `src/electron.d.ts` so React components get autocomplete.
5. **Restart the Electron app** — `ipc-handlers.js` is loaded once at startup; new handlers are not picked up by hot reload.

### Adding a new IPC handler

New `handleIpc()` calls require a full app restart (`npm run dev` again) — the main process loads `ipc-handlers.js` once at startup and hot-reload does not re-execute it.

Document every new channel in the IPC channel list in `docs/ELECTRON-GUI-DESIGN.md`.

### Testing IPC handlers

Extract pure logic out of handler callbacks into named exported functions before writing tests. The test environment cannot load Electron, so handlers must be unit-tested without a running process:

```js
// ipc-handlers.js
export function parseVmList(raw) { ... }   // pure, testable

ipcMain.handle('list-vms', () => {
    const raw = execSync('VBoxManage list vms').toString()
    return parseVmList(raw)
})
```

Use a `__mocks__/electron.js` stub and `vitest.workspace.ts` to run Electron tests in the `node` environment and React tests in `jsdom`.

### TypeScript types

Add a matching entry in `src/electron.d.ts` for every new `ipcMain.handle()` channel. React components depend on `window.electronAPI` being fully typed for autocomplete and compile-time checks.

## Credentials (.credentials/credentials.json)

- Credentials are stored in `.credentials/credentials.json` at the project root.
- The file is a JSON object keyed by VM name: `{ "<vm-name>": { "username": "root", "password": "...", "desktopUsername": "..." } }`.
- `ipc-handlers.js` reads and writes this file via the `load-vm-credentials` and `save-vm-credentials` IPC channels.
- The entire `.credentials/` folder is gitignored.

## Guest Control

- `VBoxManage guestcontrol` has no TTY — `sudo` password prompts will fail silently. Always authenticate as `root`.
- The VM must have a root password set (`sudo passwd root`) before provisioning.
- `desktop-config.sh` requires `dbus-x11` to be installed (`sudo dnf install -y dbus-x11`) for `dbus-launch` to work.
- Always use `-y` on every `dnf` command (`install`, `update`, `remove`, `autoremove`, `groupinstall`). Scripts run non-interactively via guestcontrol — any confirmation prompt will hang the session indefinitely.
- Never use `read` prompts inside scripts — they will hang for the same reason.
