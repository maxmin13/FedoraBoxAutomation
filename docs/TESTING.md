# Testing Guide

## Test suites

There are three independent test suites in the project:

| Suite | Framework | Where to run |
|-------|-----------|--------------|
| PowerShell sanity checks | Pester v5 | Windows (PowerShell) |
| Bash provisioning helpers | bats-core | Linux or WSL |
| React components | Vitest + RTL | Windows or Linux (Node.js) |

---

## PowerShell Tests (Pester)

The PowerShell sanity checks have a Pester v5 test suite at
`host/virtualbox-sanity-checks.Tests.ps1`.

### Install Pester

Pester is not included in Windows by default. It must be installed once as Administrator.

1. Press the `Windows` key
2. Type `powershell`
3. Right-click **Windows PowerShell** and select **Run as administrator**
4. Run:

```powershell
Install-Module -Name Pester -Force -SkipPublisherCheck
```

Verify the installation:

```powershell
Import-Module Pester
Pester -Version   # should print 5.x
```

### Run the tests

Open a PowerShell terminal and navigate to the project root first:

```powershell
cd C:\Projects\Pipelines\FedoraBoxAutomation
```

Then run the tests:

```powershell
Invoke-Pester -Path ".\host\virtualbox-sanity-checks.Tests.ps1" -Output Detailed
```

Each test mocks the WMI/CIM calls so the suite runs without a real VirtualBox
installation or specific hardware. A passing run looks like:

```
Tests completed in 1.2s
Passed: 28, Failed: 0, Skipped: 0
```

### Run a single test block

```powershell
Invoke-Pester -Path ".\host\virtualbox-sanity-checks.Tests.ps1" -TagFilter RamCheck
```

---

## Bash Tests (bats-core)

The Bash provisioning scripts under `vm/` are tested with
[bats-core](https://github.com/bats-core/bats-core).

### What is WSL and why do you need it?

`bats` is a Linux testing tool. It does not exist on Windows. To run it on a
Windows machine you need **WSL (Windows Subsystem for Linux)** — a feature
built into Windows 11 that lets you run a real Linux environment alongside
Windows, without a separate VM.

Think of WSL as a Linux terminal window that lives inside your Windows PC.
Commands you type there (`dnf`, `sudo`, `bats`) are Linux commands, completely
separate from PowerShell.

You can tell which environment you are in by looking at the prompt:

| Prompt looks like | You are in |
|---|---|
| `PS C:\...>` | Windows PowerShell — Linux commands will not work here |
| `[user@machine ~]$` | WSL (Linux) — this is where you need to be |

### Running on Windows (WSL)

Follow these steps in order. Each step only needs to be done once.

**Step 1 — Install WSL and Fedora**

Open PowerShell **as Administrator**:

1. Press the **Windows** key
2. Type `powershell`
3. Right-click **Windows PowerShell** and choose **Run as administrator**

Then run:

```powershell
wsl --install -d FedoraLinux-44
```

This downloads Fedora Linux — it may take a few minutes depending on your
connection. When it finishes, a terminal will open asking you to create a
username and password (Step 2 below). Reboot if prompted.

**Step 2 — Complete the Fedora first-time setup**

After reboot, Fedora may or may not open automatically. If it does not, open it
manually:

1. Press the **Windows** key
2. Type `FedoraLinux` and click the app that appears

A black terminal window will open and ask you to create a Linux username and
password. These are separate from your Windows login — pick anything you like.
Complete this before continuing.

**Step 3 — Open a WSL terminal**

You now have a Linux terminal available. To open it any time:

- In PowerShell, type `wsl` and press Enter
- Or open **Windows Terminal**, click the dropdown arrow next to the `+` tab,
  and choose **FedoraLinux-44**

Your prompt will change from `PS C:\...>` to something like `[you@machine ~]$`.
You are now inside Linux.

**Step 4 — Install bats**

In the WSL terminal (the `$` prompt), run:

```bash
sudo dnf install -y bats
```

`sudo` runs the command as administrator (it will ask for the password you set
in Step 2). `dnf` is the Fedora package manager — the Linux equivalent of
`winget` on Windows.

Verify the installation:

```bash
bats --version   # should print 1.x or higher
```

**Step 5 — Run the tests**

Still in the WSL terminal, navigate to the project folder. WSL can access your
Windows files under `/mnt/c/`:

```bash
cd /mnt/c/Projects/Pipelines/FedoraBoxAutomation
bats vm/tests/
```

### Run all Bash tests

Navigate to the project root first, then run:

```bash
bats vm/tests/
```

A passing run looks like:

```
common.bats
 ok exits 1 with an error when not run as root
 ok log_info line contains INFO and the message
 ok log_info timestamp matches YYYY-MM-DD HH:MM:SS
 ok log_warn line contains WARN and the message
 ok log_error line contains ERROR and the message
 ok STEP line contains STEP level and wraps the message with ===[ ]===
 ok log output is teed to the log file

selinux-config.bats
 ok exits 0 when audit tools are already installed
 ...

14 tests, 0 failures
```

### Run a single test file

```bash
bats vm/tests/common.bats
bats vm/tests/selinux-config.bats
```

### How the Bash tests work

Each test file:
1. Stubs external commands (`rpm`, `dnf`, `systemctl`, etc.) via a temporary `bin/`
   directory that is prepended to `PATH`.
2. Replaces `/tmp/common.sh` with a minimal stand-in that provides the log
   functions without the root check or `exec` redirect — the real script does
   `source /tmp/common.sh` at startup.
3. Sets `FEDORA_BOX_LOG` to a writable temp file so the `tee` inside
   `common.sh` has somewhere to write (the real default `/var/log/` path requires root).

Everything is cleaned up in `teardown()` so tests are safe to run repeatedly.

### Adding a new Bash test

Create a new file in `vm/tests/` named after the script you are testing
(`vm/tests/my-script.bats`). Use `selinux-config.bats` as a template —
copy the `_stub` helper and the `setup`/`teardown` blocks, then write
`@test` blocks for each behaviour you want to cover.

---

## React Tests (Vitest)

The React components and pages are tested with
[Vitest](https://vitest.dev/) and
[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).
These tests run on Windows (or any OS with Node.js).

### Run the tests

```powershell
cd app
npm test          # run once and exit (good for CI)
npm run test:watch   # re-run on file change (good during development)
```

A passing run looks like:

```
RUN  v2.x

 checkmark  src/__tests__/CheckCard.test.tsx   (13 tests)
 checkmark  src/__tests__/SetupPage.test.tsx   (10 tests)

Test Files  2 passed (2)
     Tests  23 passed (23)
```

### What is tested

| Test file | What it covers |
|-----------|---------------|
| `CheckCard.test.tsx` | Status badges (OK/!!/XX), label and detail text, "How to fix" toggle open/close behaviour |
| `SetupPage.test.tsx` | Idle state, button disable during run, check cards rendered, summary counts, error message display |

### How the React tests work

`window.electronAPI` is mocked with `vi.fn()` in `beforeEach` so the tests
never talk to a real Electron process. Each test can override a specific method:

```tsx
window.electronAPI.runSanityChecks = vi.fn().mockResolvedValue({
  ok: false,
  error: 'VBoxManage not found',
  checks: [],
})
```

The `@testing-library/jest-dom` matchers (`toBeInTheDocument`, `toBeDisabled`,
etc.) are loaded via `src/__tests__/setup.ts` which Vitest runs before every
test file.

### Adding a new React test

Create a file in `app/src/__tests__/` with the `.test.tsx` extension.
Import the component, mock `window.electronAPI` in `beforeEach`, then use
`render`, `screen`, `fireEvent`, and `waitFor` from `@testing-library/react`.
