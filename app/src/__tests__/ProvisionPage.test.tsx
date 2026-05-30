import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ProvisionPage from '../pages/ProvisionPage'

const VM = { name: 'FedoraBox', uuid: 'uuid-1', running: true }

beforeEach(() => {
  window.electronAPI = {
    loadVmCredentials:  vi.fn().mockResolvedValue({ ok: false }),
    saveVmCredentials:  vi.fn().mockResolvedValue({ ok: true }),
    runProvisionScript: vi.fn().mockResolvedValue({ ok: true }),
    runProvisionSetup:  vi.fn().mockResolvedValue({ ok: true }),
    getVmHostname:      vi.fn().mockResolvedValue({ ok: true, hostname: 'fedorabox' }),
    onScriptLine:       vi.fn().mockReturnValue(() => {}),
    onScriptDone:       vi.fn().mockReturnValue(() => {}),
  } as unknown as typeof window.electronAPI
})

async function renderAndFlush() {
  render(<ProvisionPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
  await act(async () => {})
}

/** Wire onScriptDone to fire immediately with the given exitCode when runProvisionScript resolves. */
function wireRun(exitCode: number, errorDetail?: string) {
  let doneCb: ((code: number) => void) | null = null
  window.electronAPI.onScriptDone = vi.fn().mockImplementation((cb) => { doneCb = cb; return () => {} })
  window.electronAPI.runProvisionScript = vi.fn().mockImplementation(async () => {
    doneCb!(exitCode)
    return exitCode === 0 ? { ok: true } : { ok: false, errorDetail: errorDetail ?? null }
  })
}

/** Wire onScriptDone to fire immediately with the given exitCode when runProvisionSetup resolves. */
function wireSetupRun(exitCode: number) {
  let doneCb: ((code: number) => void) | null = null
  window.electronAPI.onScriptDone = vi.fn().mockImplementation((cb) => { doneCb = cb; return () => {} })
  window.electronAPI.runProvisionSetup = vi.fn().mockImplementation(async () => {
    doneCb!(exitCode)
    return exitCode === 0 ? { ok: true } : { ok: false, errorDetail: null }
  })
}

/**
 * Wire onScriptLine + onScriptDone + runProvisionScript so that the given
 * text lines are emitted through the line callback before onScriptDone fires.
 * This lets tests trigger the forceConfirm and alreadyInstalled code paths
 * that depend on scanning live script output.
 */
function wireRunWithLines(exitCode: number, emitLines: string[], errorDetail?: string) {
  let doneCb: ((code: number) => void) | null = null
  let lineCb: ((line: { text: string; source: 'stdout' | 'stderr' }) => void) | null = null
  window.electronAPI.onScriptLine = vi.fn().mockImplementation((cb) => { lineCb = cb; return () => {} })
  window.electronAPI.onScriptDone = vi.fn().mockImplementation((cb) => { doneCb = cb; return () => {} })
  window.electronAPI.runProvisionScript = vi.fn().mockImplementation(async () => {
    for (const text of emitLines) {
      lineCb?.({ text, source: 'stdout' })
    }
    doneCb!(exitCode)
    return exitCode === 0 ? { ok: true } : { ok: false, errorDetail: errorDetail ?? null }
  })
}

/** Render with saved credentials and navigate to Java JDK script-args. */
async function navigateToJavaReady() {
  window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
    ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
  })
  await renderAndFlush()
  fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
  await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Languages'))
  await waitFor(() => expect(screen.getByText('Java JDK')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Java JDK'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run Java JDK' })).toBeInTheDocument())
}

/** Render with saved credentials and navigate to Base Setup form. */
async function navigateToBaseSetup() {
  window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
    ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
  })
  await renderAndFlush()
  fireEvent.click(screen.getByRole('button', { name: /Base Setup/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run Base Setup' })).toBeInTheDocument())
}

/** Render with saved credentials and navigate to the OpenSSL script-args. */
async function navigateToOpenSSL() {
  window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
    ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
  })
  await renderAndFlush()
  fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
  await waitFor(() => expect(screen.getByText('Security')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Security'))
  await waitFor(() => expect(screen.getByText('OpenSSL 3.3.2')).toBeInTheDocument())
  fireEvent.click(screen.getByText('OpenSSL 3.3.2'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run OpenSSL 3.3.2' })).toBeInTheDocument())
}

/** Render with saved credentials and navigate to Claude Code script-args. */
async function navigateToClaudeCode() {
  window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
    ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
  })
  await renderAndFlush()
  fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
  await waitFor(() => expect(screen.getByText('AI Tools')).toBeInTheDocument())
  fireEvent.click(screen.getByText('AI Tools'))
  await waitFor(() => expect(screen.getByText('Claude Code')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Claude Code'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run Claude Code' })).toBeInTheDocument())
}

// ── auto-load credentials ─────────────────────────────────────────────────────
// Credentials (vmUser, vmPass, loginUser) are loaded silently from saved state.
// The mode view is always shown immediately — no credential action required.

describe('auto-load credentials', () => {
  it('mode buttons are shown immediately without any credential action', async () => {
    await renderAndFlush()
    expect(screen.getByRole('button', { name: /Base Setup/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /By Category/ })).toBeInTheDocument()
  })

  it('loginUser from saved credentials pre-fills the Desktop username input', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
    })
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Java JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Java JDK'))
    await waitFor(() => expect(screen.getByPlaceholderText('your desktop username')).toBeInTheDocument())
    expect(screen.getByPlaceholderText('your desktop username')).toHaveValue('fedora')
  })
})

// ── mode buttons ──────────────────────────────────────────────────────────────

describe('mode buttons', () => {
  it('both mode buttons are enabled on mount', async () => {
    await renderAndFlush()
    expect(screen.getByRole('button', { name: /Base Setup/ })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /By Category/ })).not.toBeDisabled()
  })

  it('clicking "Base Setup" navigates to the Base Setup form', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /Base Setup/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Base Setup' })).toBeInTheDocument()
    })
  })

  it('clicking "By Category" shows the category grid', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => {
      expect(screen.getByText('Languages')).toBeInTheDocument()
    })
  })
})

// ── Run Base Setup ────────────────────────────────────────────────────────────

describe('Run Base Setup', () => {
  it('"Run Base Setup" button is disabled when loginUser is empty', async () => {
    // loadVmCredentials returns no loginUser → loginUser stays ''
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({ ok: false })
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /Base Setup/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Base Setup' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Run Base Setup' })).toBeDisabled()
  })

  it('"Run Base Setup" button is enabled when loginUser is pre-filled from saved credentials', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
    })
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /Base Setup/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Base Setup' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Run Base Setup' })).not.toBeDisabled()
  })
})

// ── script-args form ──────────────────────────────────────────────────────────

describe('script-args form', () => {
  it('shows "Desktop username" input for a user-type script', async () => {
    await navigateToJavaReady()
    expect(screen.getByPlaceholderText('your desktop username')).toBeInTheDocument()
  })

  it('"Run Java JDK" button is disabled when loginUser is empty', async () => {
    // No saved credentials → loginUser stays ''
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Java JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Java JDK'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Java JDK' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Run Java JDK' })).toBeDisabled()
  })

  it('"Run Java JDK" button is enabled when loginUser is filled', async () => {
    await navigateToJavaReady()
    expect(screen.getByRole('button', { name: 'Run Java JDK' })).not.toBeDisabled()
  })
})

// ── save credentials on script run ───────────────────────────────────────────

describe('save credentials on script run', () => {
  async function setupForScriptRun(exitCode: number) {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
    })
    wireRun(exitCode)
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Java JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Java JDK'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Java JDK' })).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Run Java JDK' })) })
  }

  it('calls saveVmCredentials when script exits 0 and loginUser is set', async () => {
    await setupForScriptRun(0)
    await waitFor(() => {
      expect(window.electronAPI.saveVmCredentials).toHaveBeenCalledWith('FedoraBox', 'root', 'secret', 'fedora')
    })
  })

  it('does NOT call saveVmCredentials when exitCode is non-zero', async () => {
    await setupForScriptRun(1)
    await waitFor(() => expect(screen.queryByText('Running Java JDK...')).not.toBeInTheDocument())
    expect(window.electronAPI.saveVmCredentials).not.toHaveBeenCalled()
  })
})

// ── "Run another" behaviour ───────────────────────────────────────────────────

describe('"Run another" behaviour', () => {
  /** Run Java JDK to the done state (success or failure). */
  async function runToDone(exitCode: number) {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
    })
    wireRun(exitCode)
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Java JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Java JDK'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Java JDK' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Run Java JDK' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run another' })).toBeInTheDocument())
  }

  it('after a failed run, clicking "Run another" clears the Desktop username when no credentials are saved', async () => {
    await runToDone(1)
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({ ok: false })
    fireEvent.click(screen.getByRole('button', { name: 'Run another' }))
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Java JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Java JDK'))
    await waitFor(() => expect(screen.getByPlaceholderText('your desktop username')).toBeInTheDocument())
    expect(screen.getByPlaceholderText('your desktop username')).toHaveValue('')
  })

  it('after a successful run, "Run another" keeps the loginUser value', async () => {
    await runToDone(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run another' }))
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Java JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Java JDK'))
    await waitFor(() => expect(screen.getByPlaceholderText('your desktop username')).toBeInTheDocument())
    expect(screen.getByPlaceholderText('your desktop username')).toHaveValue('fedora')
  })

  it('clicking "Run another" then Back returns to the mode view', async () => {
    await runToDone(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run another' }))
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Base Setup/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /By Category/ })).toBeInTheDocument()
  })
})

// ── "Run another" after Base Setup ───────────────────────────────────────────

describe('"Run another" after Base Setup', () => {
  async function runBaseSetupToDone(exitCode: number) {
    wireSetupRun(exitCode)
    await navigateToBaseSetup()
    fireEvent.click(screen.getByRole('button', { name: 'Run Base Setup' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run another' })).toBeInTheDocument())
  }

  it('shows the mode view after clicking "Run another"', async () => {
    await runBaseSetupToDone(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run another' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Base Setup/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /By Category/ })).toBeInTheDocument()
  })

  it('does NOT show the category grid after "Run another" following Base Setup', async () => {
    await runBaseSetupToDone(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run another' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Base Setup/ })).toBeInTheDocument())
    expect(screen.queryByText('Languages')).not.toBeInTheDocument()
  })

  it('shows mode view after a failed Base Setup run too', async () => {
    await runBaseSetupToDone(1)
    fireEvent.click(screen.getByRole('button', { name: 'Run another' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Base Setup/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /By Category/ })).toBeInTheDocument()
  })
})

// ── running state ─────────────────────────────────────────────────────────────

describe('running state', () => {
  it('shows "Running Java JDK..." while the script is in flight', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
    })
    window.electronAPI.runProvisionScript = vi.fn().mockReturnValue(new Promise(() => {}))
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Java JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Java JDK'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Java JDK' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Run Java JDK' }))
    await waitFor(() => expect(screen.getByText('Running Java JDK...')).toBeInTheDocument())
  })

  it('shows "Running Base Setup..." while the setup script is in flight', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
    })
    window.electronAPI.runProvisionSetup = vi.fn().mockReturnValue(new Promise(() => {}))
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /Base Setup/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Base Setup' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Run Base Setup' }))
    await waitFor(() => expect(screen.getByText('Running Base Setup...')).toBeInTheDocument())
  })
})

// ── done state banners ────────────────────────────────────────────────────────

describe('done state banners', () => {
  it('shows green success banner after a script completes', async () => {
    await navigateToJavaReady()
    wireRun(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run Java JDK' }))
    await waitFor(() => expect(screen.getByText('Java JDK completed successfully.')).toBeInTheDocument())
  })

  it('shows red failure banner after a script fails', async () => {
    await navigateToJavaReady()
    wireRun(1)
    fireEvent.click(screen.getByRole('button', { name: 'Run Java JDK' }))
    await waitFor(() => expect(screen.getByText('Java JDK failed.')).toBeInTheDocument())
  })

  it('shows errorDetail text below the failure banner when provided', async () => {
    await navigateToJavaReady()
    wireRun(1, 'ERROR: dnf install failed with code 1')
    fireEvent.click(screen.getByRole('button', { name: 'Run Java JDK' }))
    await waitFor(() => expect(screen.getByText('ERROR: dnf install failed with code 1')).toBeInTheDocument())
  })

  it('shows blue "already installed" banner when the script exits 0 with an already-installed info line', async () => {
    await navigateToJavaReady()
    wireRunWithLines(0, ['[INFO  ] java.sh already installed'])
    fireEvent.click(screen.getByRole('button', { name: 'Run Java JDK' }))
    await waitFor(() => expect(screen.getByText('Java JDK is already installed.')).toBeInTheDocument())
  })

  it('does not show the green success banner when alreadyInstalled is true', async () => {
    await navigateToJavaReady()
    wireRunWithLines(0, ['[INFO  ] java.sh already installed'])
    fireEvent.click(screen.getByRole('button', { name: 'Run Java JDK' }))
    await waitFor(() => expect(screen.getByText('Java JDK is already installed.')).toBeInTheDocument())
    expect(screen.queryByText('Java JDK completed successfully.')).not.toBeInTheDocument()
  })

  it('shows "Run another" and "My VMs" buttons in done state', async () => {
    await navigateToJavaReady()
    wireRun(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run Java JDK' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run another' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /My VMs/i })).toBeInTheDocument()
  })
})

// ── forceConfirm (OpenSSL already installed) ──────────────────────────────────

describe('forceConfirm (OpenSSL already installed)', () => {
  it('shows the amber "OpenSSL is already installed" panel when output signals a force-install', async () => {
    await navigateToOpenSSL()
    wireRunWithLines(1, ["Use 'Install anyway' to overwrite the existing build"])
    fireEvent.click(screen.getByRole('button', { name: 'Run OpenSSL 3.3.2' }))
    await waitFor(() => expect(screen.getByText(/OpenSSL is already installed on this system/)).toBeInTheDocument())
  })

  it('does not show the red failure banner when forceConfirm is active', async () => {
    await navigateToOpenSSL()
    wireRunWithLines(1, ["Use 'Install anyway' to overwrite the existing build"])
    fireEvent.click(screen.getByRole('button', { name: 'Run OpenSSL 3.3.2' }))
    await waitFor(() => expect(screen.getByText(/OpenSSL is already installed on this system/)).toBeInTheDocument())
    expect(screen.queryByText(/OpenSSL 3\.3\.2 failed\./)).not.toBeInTheDocument()
  })

  it('clicking "Cancel" dismisses the panel without running the script again', async () => {
    await navigateToOpenSSL()
    wireRunWithLines(1, ["Use 'Install anyway' to overwrite the existing build"])
    fireEvent.click(screen.getByRole('button', { name: 'Run OpenSSL 3.3.2' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Install anyway' })).toBeInTheDocument())
    const callsBefore = vi.mocked(window.electronAPI.runProvisionScript).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/OpenSSL is already installed on this system/)).not.toBeInTheDocument()
    expect(vi.mocked(window.electronAPI.runProvisionScript).mock.calls.length).toBe(callsBefore)
  })

  it('clicking "Install anyway" calls runProvisionScript with --force in scriptArgs', async () => {
    await navigateToOpenSSL()
    wireRunWithLines(1, ["Use 'Install anyway' to overwrite the existing build"])
    fireEvent.click(screen.getByRole('button', { name: 'Run OpenSSL 3.3.2' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Install anyway' })).toBeInTheDocument())
    wireRun(0)
    fireEvent.click(screen.getByRole('button', { name: 'Install anyway' }))
    await waitFor(() =>
      expect(window.electronAPI.runProvisionScript).toHaveBeenCalledWith(
        expect.objectContaining({ scriptArgs: expect.stringContaining('--force') })
      )
    )
  })
})

// ── AWS CLI update confirmation ───────────────────────────────────────────────

/** Render with saved credentials and navigate to AWS CLI script-args. */
async function navigateToAwsCli() {
  window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
    ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
  })
  await renderAndFlush()
  fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
  await waitFor(() => expect(screen.getByText('Cloud')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Cloud'))
  await waitFor(() => expect(screen.getByText('AWS CLI')).toBeInTheDocument())
  fireEvent.click(screen.getByText('AWS CLI'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run AWS CLI' })).toBeInTheDocument())
}

describe('AWS CLI update confirmation', () => {
  it('shows the amber "AWS CLI is already installed" panel when the script signals an update', async () => {
    await navigateToAwsCli()
    wireRunWithLines(1, ["Use 'Install anyway' to update it"])
    fireEvent.click(screen.getByRole('button', { name: 'Run AWS CLI' }))
    await waitFor(() => expect(screen.getByText(/AWS CLI is already installed/)).toBeInTheDocument())
  })

  it('does not show the red failure banner when the update confirmation panel is active', async () => {
    await navigateToAwsCli()
    wireRunWithLines(1, ["Use 'Install anyway' to update it"])
    fireEvent.click(screen.getByRole('button', { name: 'Run AWS CLI' }))
    await waitFor(() => expect(screen.getByText(/AWS CLI is already installed/)).toBeInTheDocument())
    expect(screen.queryByText(/AWS CLI failed\./)).not.toBeInTheDocument()
  })

  it('shows "Update" as the action button label', async () => {
    await navigateToAwsCli()
    wireRunWithLines(1, ["Use 'Install anyway' to update it"])
    fireEvent.click(screen.getByRole('button', { name: 'Run AWS CLI' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument())
  })

  it('clicking "Update" calls runProvisionScript with --force in scriptArgs', async () => {
    await navigateToAwsCli()
    wireRunWithLines(1, ["Use 'Install anyway' to update it"])
    fireEvent.click(screen.getByRole('button', { name: 'Run AWS CLI' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument())
    wireRun(0)
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() =>
      expect(window.electronAPI.runProvisionScript).toHaveBeenCalledWith(
        expect.objectContaining({ scriptArgs: expect.stringContaining('--force') })
      )
    )
  })

  it('clicking "Cancel" dismisses the panel without running the script again', async () => {
    await navigateToAwsCli()
    wireRunWithLines(1, ["Use 'Install anyway' to update it"])
    fireEvent.click(screen.getByRole('button', { name: 'Run AWS CLI' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument())
    const callsBefore = vi.mocked(window.electronAPI.runProvisionScript).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText(/AWS CLI is already installed/)).not.toBeInTheDocument()
    expect(vi.mocked(window.electronAPI.runProvisionScript).mock.calls.length).toBe(callsBefore)
  })
})

// ── AI Tools category — Claude Code ──────────────────────────────────────────

describe('AI Tools category — Claude Code', () => {
  it('"AI Tools" category appears in the category grid', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('AI Tools')).toBeInTheDocument())
  })

  it('clicking "AI Tools" shows the Claude Code script in the script list', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('AI Tools')).toBeInTheDocument())
    fireEvent.click(screen.getByText('AI Tools'))
    await waitFor(() => expect(screen.getByText('Claude Code')).toBeInTheDocument())
  })

  it('clicking "Claude Code" shows the script-args form with a "Desktop username" input', async () => {
    await navigateToClaudeCode()
    expect(screen.getByPlaceholderText('your desktop username')).toBeInTheDocument()
  })

  it('"Run Claude Code" button is disabled when loginUser is empty', async () => {
    // No saved credentials → loginUser stays ''
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('AI Tools')).toBeInTheDocument())
    fireEvent.click(screen.getByText('AI Tools'))
    await waitFor(() => expect(screen.getByText('Claude Code')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Claude Code'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Claude Code' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Run Claude Code' })).toBeDisabled()
  })

  it('"Run Claude Code" button is enabled when loginUser is filled', async () => {
    await navigateToClaudeCode()
    expect(screen.getByRole('button', { name: 'Run Claude Code' })).not.toBeDisabled()
  })

  it('calls runProvisionScript with the correct relPath and loginUser as scriptArgs', async () => {
    await navigateToClaudeCode()
    wireRun(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run Claude Code' }))
    await waitFor(() =>
      expect(window.electronAPI.runProvisionScript).toHaveBeenCalledWith(
        expect.objectContaining({
          vmName:     'FedoraBox',
          scriptArgs: 'fedora',
        })
      )
    )
    expect(window.electronAPI.runProvisionScript).toHaveBeenCalledWith(
      expect.objectContaining({ scriptRelPath: expect.stringContaining('claude-code.sh') })
    )
  })

  it('shows green success banner after Claude Code completes', async () => {
    await navigateToClaudeCode()
    wireRun(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run Claude Code' }))
    await waitFor(() => expect(screen.getByText('Claude Code completed successfully.')).toBeInTheDocument())
  })

  it('shows red failure banner after Claude Code fails', async () => {
    await navigateToClaudeCode()
    wireRun(1)
    fireEvent.click(screen.getByRole('button', { name: 'Run Claude Code' }))
    await waitFor(() => expect(screen.getByText('Claude Code failed.')).toBeInTheDocument())
  })

  it('shows blue "already installed" banner when the script reports claude is already installed', async () => {
    await navigateToClaudeCode()
    wireRunWithLines(0, ['[INFO  ] claude-code.sh Claude Code already installed: 1.0.0'])
    fireEvent.click(screen.getByRole('button', { name: 'Run Claude Code' }))
    await waitFor(() => expect(screen.getByText('Claude Code is already installed.')).toBeInTheDocument())
  })

  it('does not show green success banner when already-installed is detected', async () => {
    await navigateToClaudeCode()
    wireRunWithLines(0, ['[INFO  ] claude-code.sh Claude Code already installed: 1.0.0'])
    fireEvent.click(screen.getByRole('button', { name: 'Run Claude Code' }))
    await waitFor(() => expect(screen.getByText('Claude Code is already installed.')).toBeInTheDocument())
    expect(screen.queryByText('Claude Code completed successfully.')).not.toBeInTheDocument()
  })
})

// ── changeHostname toggle ─────────────────────────────────────────────────────

describe('changeHostname toggle', () => {
  it('hostname input is hidden by default in the Base Setup form', async () => {
    await navigateToBaseSetup()
    expect(screen.queryByPlaceholderText('e.g. fedorabox')).not.toBeInTheDocument()
  })

  it('hostname input appears when the "Set hostname" checkbox is checked', async () => {
    await navigateToBaseSetup()
    await act(async () => { fireEvent.click(screen.getByRole('checkbox')) })
    expect(screen.getByPlaceholderText('e.g. fedorabox')).toBeInTheDocument()
  })

  it('calls getVmHostname with the VM name and credentials when the checkbox is first checked', async () => {
    await navigateToBaseSetup()
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() =>
      expect(window.electronAPI.getVmHostname).toHaveBeenCalledWith('FedoraBox', 'root', 'secret')
    )
  })

  it('pre-fills the hostname input with the value returned by getVmHostname', async () => {
    await navigateToBaseSetup()
    fireEvent.click(screen.getByRole('checkbox'))
    await waitFor(() => expect(screen.getByPlaceholderText('e.g. fedorabox')).toHaveValue('fedorabox'))
  })

  it('hostname input disappears when the checkbox is unchecked again', async () => {
    await navigateToBaseSetup()
    await act(async () => { fireEvent.click(screen.getByRole('checkbox')) })
    expect(screen.getByPlaceholderText('e.g. fedorabox')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByPlaceholderText('e.g. fedorabox')).not.toBeInTheDocument()
  })
})
