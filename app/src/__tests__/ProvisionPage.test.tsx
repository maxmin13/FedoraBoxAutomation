import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ProvisionPage from '../pages/ProvisionPage'

const VM = { name: 'FedoraBox', uuid: 'uuid-1', running: true }

beforeEach(() => {
  window.electronAPI = {
    loadVmCredentials:  vi.fn().mockResolvedValue({ ok: false }),
    checkVmCredentials: vi.fn().mockResolvedValue({ ok: true, isLive: false }),
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

/** Fill vmUser and vmPass inputs and click Test Connection, then wait for "Connected". */
async function fillAndTestCreds(vmUser = 'root', vmPass = 'secret') {
  fireEvent.change(screen.getByPlaceholderText('root'), { target: { value: vmUser } })
  fireEvent.change(screen.getByPlaceholderText(/•+/), { target: { value: vmPass } })
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
  await waitFor(() => expect(screen.getByText(/Connected/)).toBeInTheDocument())
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

/** Render, pre-fill saved credentials, click Test Connection, navigate to Oracle JDK script-args. */
async function navigateToJavaReady() {
  window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
    ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
  })
  await renderAndFlush()
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
  await waitFor(() => expect(screen.getByText(/Connected/)).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
  await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Languages'))
  await waitFor(() => expect(screen.getByText('Oracle JDK')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Oracle JDK'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run Oracle JDK' })).toBeInTheDocument())
}

/** Render, pre-fill saved credentials, click Test Connection, navigate to Base Setup form. */
async function navigateToBaseSetup() {
  window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
    ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
  })
  await renderAndFlush()
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
  await waitFor(() => expect(screen.getByText(/Connected/)).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /Base Setup/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run Base Setup' })).toBeInTheDocument())
}

/** Render, pre-fill saved credentials, click Test Connection, navigate to the OpenSSL script-args. */
async function navigateToOpenSSL() {
  window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
    ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
  })
  await renderAndFlush()
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
  await waitFor(() => expect(screen.getByText(/Connected/)).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
  await waitFor(() => expect(screen.getByText('Security')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Security'))
  await waitFor(() => expect(screen.getByText('OpenSSL 3.3.2')).toBeInTheDocument())
  fireEvent.click(screen.getByText('OpenSSL 3.3.2'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run OpenSSL 3.3.2' })).toBeInTheDocument())
}

// ── credentials section ───────────────────────────────────────────────────────

describe('credentials section', () => {
  it('renders "VM root username" and "VM root password" inputs', async () => {
    await renderAndFlush()
    expect(screen.getByPlaceholderText('root')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/•+/)).toBeInTheDocument()
  })

  it('does NOT render a "Desktop username" input in the credentials section', async () => {
    await renderAndFlush()
    expect(screen.queryByPlaceholderText('your desktop username')).not.toBeInTheDocument()
  })

  it('Test Connection button is disabled when both fields are empty', async () => {
    await renderAndFlush()
    expect(screen.getByRole('button', { name: 'Test Connection' })).toBeDisabled()
  })

  it('Test Connection button is enabled when vmUser and vmPass are filled', async () => {
    await renderAndFlush()
    fireEvent.change(screen.getByPlaceholderText('root'), { target: { value: 'root' } })
    fireEvent.change(screen.getByPlaceholderText(/•+/), { target: { value: 'secret' } })
    expect(screen.getByRole('button', { name: 'Test Connection' })).not.toBeDisabled()
  })

  it('clicking Test Connection calls checkVmCredentials with VM name, vmUser, vmPass', async () => {
    await renderAndFlush()
    fireEvent.change(screen.getByPlaceholderText('root'), { target: { value: 'root' } })
    fireEvent.change(screen.getByPlaceholderText(/•+/), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
    await act(async () => {})
    expect(window.electronAPI.checkVmCredentials).toHaveBeenCalledWith('FedoraBox', 'root', 'secret')
  })

  it('shows "Connected" after Test Connection succeeds', async () => {
    await renderAndFlush()
    await fillAndTestCreds()
    expect(screen.getByText(/Connected/)).toBeInTheDocument()
  })

  it('saves credentials when Test Connection succeeds', async () => {
    await renderAndFlush()
    await fillAndTestCreds()
    expect(window.electronAPI.saveVmCredentials).toHaveBeenCalledWith('FedoraBox', 'root', 'secret', '')
  })

  it('pre-fills vmUser and vmPass from saved credentials on mount', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'mypass', loginUser: 'fedora',
    })
    await renderAndFlush()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('root')).toHaveValue('root')
    })
  })
})

// ── mode buttons ──────────────────────────────────────────────────────────────

describe('mode buttons', () => {
  it('both mode buttons are disabled before Test Connection', async () => {
    await renderAndFlush()
    expect(screen.getByRole('button', { name: /Base Setup/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /By Category/ })).toBeDisabled()
  })

  it('both mode buttons are enabled after Test Connection succeeds', async () => {
    await renderAndFlush()
    await fillAndTestCreds()
    expect(screen.getByRole('button', { name: /Base Setup/ })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /By Category/ })).not.toBeDisabled()
  })

  it('clicking "Base Setup" navigates to the Base Setup form', async () => {
    await renderAndFlush()
    await fillAndTestCreds()
    fireEvent.click(screen.getByRole('button', { name: /Base Setup/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run Base Setup' })).toBeInTheDocument()
    })
  })

  it('clicking "By Category" shows the category grid', async () => {
    await renderAndFlush()
    await fillAndTestCreds()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => {
      expect(screen.getByText('Languages')).toBeInTheDocument()
    })
  })
})

// ── Run Base Setup ────────────────────────────────────────────────────────────

describe('Run Base Setup', () => {
  it('"Run Base Setup" button is disabled when loginUser is empty', async () => {
    // loadVmCredentials returns no loginUser — so loginUser stays ''
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({ ok: false })
    await renderAndFlush()
    await fillAndTestCreds()
    fireEvent.click(screen.getByRole('button', { name: /Base Setup/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Base Setup' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Run Base Setup' })).toBeDisabled()
  })

  it('"Run Base Setup" button is enabled when loginUser is pre-filled from saved credentials', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
    })
    await renderAndFlush()
    // Credentials are pre-filled; test connection to verify them
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => expect(screen.getByText(/Connected/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Base Setup/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Base Setup' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Run Base Setup' })).not.toBeDisabled()
  })
})

// ── script run gate ───────────────────────────────────────────────────────────

describe('script run gate', () => {
  /** Navigate: creds verified → By Category → Languages → Oracle JDK (user-type script) */
  async function navigateToJava() {
    await renderAndFlush()
    await fillAndTestCreds()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Oracle JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Oracle JDK'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Oracle JDK' })).toBeInTheDocument())
  }

  it('shows "Desktop username" input in the script-args form for a user-type script', async () => {
    await navigateToJava()
    expect(screen.getByPlaceholderText('your desktop username')).toBeInTheDocument()
  })

  it('"Run Oracle JDK" button is disabled when loginUser is empty', async () => {
    await navigateToJava()
    expect(screen.getByRole('button', { name: 'Run Oracle JDK' })).toBeDisabled()
  })

  it('"Run Oracle JDK" button is enabled when loginUser is filled', async () => {
    await navigateToJava()
    fireEvent.change(screen.getByPlaceholderText('your desktop username'), { target: { value: 'fedora' } })
    expect(screen.getByRole('button', { name: 'Run Oracle JDK' })).not.toBeDisabled()
  })
})

// ── save credentials on script run ───────────────────────────────────────────

describe('save credentials on script run', () => {
  /** Navigate to Java script-args with loginUser pre-filled and creds verified. */
  async function setupForScriptRun(exitCode: number) {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
    })
    wireRun(exitCode)
    await renderAndFlush()
    // Pre-filled creds — just test connection
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => expect(screen.getByText(/Connected/)).toBeInTheDocument())
    // saveVmCredentials is called once here by handleTestCreds — reset before run
    vi.mocked(window.electronAPI.saveVmCredentials).mockClear()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Oracle JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Oracle JDK'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Oracle JDK' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Run Oracle JDK' }))
  }

  it('calls saveVmCredentials when script exits 0 and loginUser is set', async () => {
    await setupForScriptRun(0)
    await waitFor(() => {
      expect(window.electronAPI.saveVmCredentials).toHaveBeenCalledWith('FedoraBox', 'root', 'secret', 'fedora')
    })
  })

  it('does NOT call saveVmCredentials on onScriptDone when exitCode is non-zero', async () => {
    await setupForScriptRun(1)
    await waitFor(() => expect(screen.queryByText('Running Oracle JDK...')).not.toBeInTheDocument())
    // saveVmCredentials must NOT have been called (it was cleared before the run)
    expect(window.electronAPI.saveVmCredentials).not.toHaveBeenCalled()
  })
})

// ── "Run another" behaviour ───────────────────────────────────────────────────

describe('"Run another" behaviour', () => {
  /** Run Oracle JDK to the done state (success or failure). */
  async function runToDone(exitCode: number) {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
    })
    wireRun(exitCode)
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => expect(screen.getByText(/Connected/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Oracle JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Oracle JDK'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Oracle JDK' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Run Oracle JDK' }))
    // Wait for done state
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run another' })).toBeInTheDocument())
  }

  it('after a failed run, clicking "Run another" clears the Desktop username input when no credentials are saved', async () => {
    await runToDone(1)
    // No saved credentials → loginUser should be cleared
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({ ok: false })
    fireEvent.click(screen.getByRole('button', { name: 'Run another' }))
    // Navigate back to Languages → Oracle JDK to check loginUser was cleared
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Oracle JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Oracle JDK'))
    await waitFor(() => expect(screen.getByPlaceholderText('your desktop username')).toBeInTheDocument())
    expect(screen.getByPlaceholderText('your desktop username')).toHaveValue('')
  })

  it('after a successful run, "Run another" keeps the loginUser value', async () => {
    await runToDone(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run another' }))
    // Navigate to Languages → Oracle JDK to check loginUser was preserved
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Oracle JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Oracle JDK'))
    await waitFor(() => expect(screen.getByPlaceholderText('your desktop username')).toBeInTheDocument())
    expect(screen.getByPlaceholderText('your desktop username')).toHaveValue('fedora')
  })
})

// ── Test Connection error messages ────────────────────────────────────────────

describe('Test Connection error messages', () => {
  async function testCreds() {
    fireEvent.change(screen.getByPlaceholderText('root'), { target: { value: 'root' } })
    fireEvent.change(screen.getByPlaceholderText(/•+/), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
  }

  it('shows "VM is not running" when the error mentions "powered off"', async () => {
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'VM is powered off' })
    await renderAndFlush()
    await testCreds()
    await waitFor(() => expect(screen.getByText(/VM is not running/)).toBeInTheDocument())
  })

  it('shows "Wrong username or password" on VERR_AUTHENTICATION_FAILURE', async () => {
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'VERR_AUTHENTICATION_FAILURE' })
    await renderAndFlush()
    await testCreds()
    await waitFor(() => expect(screen.getByText(/Wrong username or password/)).toBeInTheDocument())
  })

  it('shows "Guest Additions not responding" when the error mentions "execution service is not ready"', async () => {
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'execution service is not ready' })
    await renderAndFlush()
    await testCreds()
    await waitFor(() => expect(screen.getByText(/Guest Additions not responding/)).toBeInTheDocument())
  })

  it('shows the "Live ISO" amber warning when isLive is true', async () => {
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: true, isLive: true })
    await renderAndFlush()
    await testCreds()
    await waitFor(() => expect(screen.getByText(/Live ISO/)).toBeInTheDocument())
  })

  it('keeps both mode buttons disabled after a Live ISO result', async () => {
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: true, isLive: true })
    await renderAndFlush()
    await testCreds()
    await waitFor(() => expect(screen.getByText(/Live ISO/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Base Setup/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /By Category/ })).toBeDisabled()
  })

  it('shows "Access denied — SELinux" on VERR_ACCESS_DENIED', async () => {
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'VERR_ACCESS_DENIED' })
    await renderAndFlush()
    await testCreds()
    await waitFor(() => expect(screen.getByText(/Access denied/)).toBeInTheDocument())
  })

  it('shows "VM not found" on VERR_NOT_FOUND', async () => {
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'VERR_NOT_FOUND' })
    await renderAndFlush()
    await testCreds()
    await waitFor(() => expect(screen.getByText(/VM not found/)).toBeInTheDocument())
  })

  it('shows "Guest control service is busy" on VERR_RESOURCE_BUSY', async () => {
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'VERR_RESOURCE_BUSY' })
    await renderAndFlush()
    await testCreds()
    await waitFor(() => expect(screen.getByText(/Guest control service is busy/)).toBeInTheDocument())
  })

  it('shows "Connection timed out" on ETIMEDOUT', async () => {
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'ETIMEDOUT' })
    await renderAndFlush()
    await testCreds()
    await waitFor(() => expect(screen.getByText(/Connection timed out/)).toBeInTheDocument())
  })

  it('shows "Connection failed" when no known pattern matches', async () => {
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'some unknown error' })
    await renderAndFlush()
    await testCreds()
    await waitFor(() => expect(screen.getByText(/Connection failed/)).toBeInTheDocument())
  })
})

// ── checkBeforeRun gate ───────────────────────────────────────────────────────

describe('checkBeforeRun gate', () => {
  it('does not call runProvisionScript when checkVmCredentials fails before a script run', async () => {
    await navigateToJavaReady()
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'VM is powered off' })
    fireEvent.click(screen.getByRole('button', { name: 'Run Oracle JDK' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test Connection' })).toBeInTheDocument())
    expect(window.electronAPI.runProvisionScript).not.toHaveBeenCalled()
  })

  it('redirects to mode view and shows the mapped error when checkVmCredentials fails before a script run', async () => {
    await navigateToJavaReady()
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'VM is powered off' })
    fireEvent.click(screen.getByRole('button', { name: 'Run Oracle JDK' }))
    await waitFor(() => expect(screen.getByText(/VM is not running/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Test Connection' })).toBeInTheDocument()
  })

  it('does not call runProvisionSetup when checkVmCredentials fails before Base Setup', async () => {
    await navigateToBaseSetup()
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'VERR_AUTHENTICATION_FAILURE' })
    fireEvent.click(screen.getByRole('button', { name: 'Run Base Setup' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test Connection' })).toBeInTheDocument())
    expect(window.electronAPI.runProvisionSetup).not.toHaveBeenCalled()
  })

  it('redirects to mode view and shows the mapped error when checkVmCredentials fails before Base Setup', async () => {
    await navigateToBaseSetup()
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false, error: 'VERR_AUTHENTICATION_FAILURE' })
    fireEvent.click(screen.getByRole('button', { name: 'Run Base Setup' }))
    await waitFor(() => expect(screen.getByText(/Wrong username or password/)).toBeInTheDocument())
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

  it('shows the mode view (Test Connection button) after clicking "Run another"', async () => {
    await runBaseSetupToDone(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run another' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test Connection' })).toBeInTheDocument())
  })

  it('does NOT show the category grid after "Run another" following Base Setup', async () => {
    await runBaseSetupToDone(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run another' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test Connection' })).toBeInTheDocument())
    expect(screen.queryByText('Languages')).not.toBeInTheDocument()
  })

  it('shows mode view after a failed Base Setup run too', async () => {
    await runBaseSetupToDone(1)
    fireEvent.click(screen.getByRole('button', { name: 'Run another' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test Connection' })).toBeInTheDocument())
  })
})

// ── running state ─────────────────────────────────────────────────────────────

describe('running state', () => {
  it('shows "Running Oracle JDK..." while the script is in flight', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
    })
    window.electronAPI.runProvisionScript = vi.fn().mockReturnValue(new Promise(() => {}))
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => expect(screen.getByText(/Connected/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('Languages')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Languages'))
    await waitFor(() => expect(screen.getByText('Oracle JDK')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Oracle JDK'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run Oracle JDK' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Run Oracle JDK' }))
    await waitFor(() => expect(screen.getByText('Running Oracle JDK...')).toBeInTheDocument())
  })

  it('shows "Running Base Setup..." while the setup script is in flight', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
    })
    window.electronAPI.runProvisionSetup = vi.fn().mockReturnValue(new Promise(() => {}))
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
    await waitFor(() => expect(screen.getByText(/Connected/)).toBeInTheDocument())
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
    fireEvent.click(screen.getByRole('button', { name: 'Run Oracle JDK' }))
    await waitFor(() => expect(screen.getByText('Oracle JDK completed successfully.')).toBeInTheDocument())
  })

  it('shows red failure banner after a script fails', async () => {
    await navigateToJavaReady()
    wireRun(1)
    fireEvent.click(screen.getByRole('button', { name: 'Run Oracle JDK' }))
    await waitFor(() => expect(screen.getByText('Oracle JDK failed.')).toBeInTheDocument())
  })

  it('shows errorDetail text below the failure banner when provided', async () => {
    await navigateToJavaReady()
    wireRun(1, 'ERROR: dnf install failed with code 1')
    fireEvent.click(screen.getByRole('button', { name: 'Run Oracle JDK' }))
    await waitFor(() => expect(screen.getByText('ERROR: dnf install failed with code 1')).toBeInTheDocument())
  })

  it('shows blue "already installed" banner when the script exits 0 with an already-installed info line', async () => {
    await navigateToJavaReady()
    wireRunWithLines(0, ['[INFO  ] java.sh already installed'])
    fireEvent.click(screen.getByRole('button', { name: 'Run Oracle JDK' }))
    await waitFor(() => expect(screen.getByText('Oracle JDK is already installed.')).toBeInTheDocument())
  })

  it('does not show the green success banner when alreadyInstalled is true', async () => {
    await navigateToJavaReady()
    wireRunWithLines(0, ['[INFO  ] java.sh already installed'])
    fireEvent.click(screen.getByRole('button', { name: 'Run Oracle JDK' }))
    await waitFor(() => expect(screen.getByText('Oracle JDK is already installed.')).toBeInTheDocument())
    expect(screen.queryByText('Oracle JDK completed successfully.')).not.toBeInTheDocument()
  })

  it('shows "Run another" and "My VMs" buttons in done state', async () => {
    await navigateToJavaReady()
    wireRun(0)
    fireEvent.click(screen.getByRole('button', { name: 'Run Oracle JDK' }))
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

// ── AI Tools category — Claude Code ──────────────────────────────────────────

/** Navigate: creds verified → By Category → AI Tools → Claude Code script-args. */
async function navigateToClaudeCode() {
  window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
    ok: true, user: 'root', pass: 'secret', loginUser: 'fedora',
  })
  await renderAndFlush()
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }))
  await waitFor(() => expect(screen.getByText(/Connected/)).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
  await waitFor(() => expect(screen.getByText('AI Tools')).toBeInTheDocument())
  fireEvent.click(screen.getByText('AI Tools'))
  await waitFor(() => expect(screen.getByText('Claude Code')).toBeInTheDocument())
  fireEvent.click(screen.getByText('Claude Code'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run Claude Code' })).toBeInTheDocument())
}

describe('AI Tools category — Claude Code', () => {
  it('"AI Tools" category appears in the category grid', async () => {
    await renderAndFlush()
    await fillAndTestCreds()
    fireEvent.click(screen.getByRole('button', { name: /By Category/ }))
    await waitFor(() => expect(screen.getByText('AI Tools')).toBeInTheDocument())
  })

  it('clicking "AI Tools" shows the Claude Code script in the script list', async () => {
    await renderAndFlush()
    await fillAndTestCreds()
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
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({ ok: false })
    await renderAndFlush()
    await fillAndTestCreds()
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
    fireEvent.click(screen.getByRole('checkbox'))
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
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByPlaceholderText('e.g. fedorabox')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByPlaceholderText('e.g. fedorabox')).not.toBeInTheDocument()
  })
})
