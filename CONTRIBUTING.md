# Contributing

## Shell Scripts (.sh)

- Always use **LF line endings** (not CRLF). Windows editors default to CRLF which causes "file not found" / exit code 126 on Linux because the shebang becomes `#!/bin/bash\r`.
- Convert before committing:
  ```powershell
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  Get-ChildItem -Filter "*.sh" -Recurse | ForEach-Object {
      $content = [System.IO.File]::ReadAllText($_.FullName)
      [System.IO.File]::WriteAllText($_.FullName, ($content -replace "`r`n", "`n"), $utf8NoBom)
  }
  ```
- All `.sh` scripts must log to `/var/log/fedora-box-automation.log` via:
  ```bash
  exec > >(tee -a /var/log/fedora-box-automation.log) 2>&1
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
