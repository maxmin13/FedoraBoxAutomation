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

### Downloads

- Use `wget --progress=dot` for large file downloads so progress is visible in the log.
- Use `curl -#` (or `curl -sL` for small text-only fetches like version strings).
- Always validate version strings fetched via curl before using them in URLs:

```bash
VERSION=$(curl -sL https://example.com/stable.txt)
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
- Guest script output printed to the console must be color-coded:
  - **Red** — lines matching `error`, `failed`, `fatal`, `command not found`, `permission denied`
  - **Yellow** — lines matching `warning`
  - Default — everything else

## Guest Control (provision-vm.ps1)

- `VBoxManage guestcontrol` has no TTY — `sudo` password prompts will fail silently. Always authenticate as `root`.
- The VM must have a root password set (`sudo passwd root`) before provisioning.
- `desktop-config.sh` requires `dbus-x11` to be installed (`sudo dnf install -y dbus-x11`) for `dbus-launch` to work.
- Always use `-y` on every `dnf` command (`install`, `update`, `remove`, `autoremove`, `groupinstall`). Scripts run non-interactively via guestcontrol — any confirmation prompt will hang the session indefinitely.
- Never use `read` prompts inside scripts — they will hang for the same reason.
