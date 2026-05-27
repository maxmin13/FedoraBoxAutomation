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
