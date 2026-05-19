import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ShareLogsPage from '../pages/ShareLogsPage'

const VM       = { name: 'FedoraBox', uuid: 'uuid-1', running: true }
const HOST_PATH = 'C:\\VMs\\FedoraBox\\guest-logs'

beforeEach(() => {
  window.electronAPI = {
    getVmGuestLogsPath: vi.fn().mockResolvedValue({ ok: true, path: HOST_PATH }),
    loadVmCredentials:  vi.fn().mockResolvedValue({ ok: true, user: 'root', pass: 'secret', loginUser: 'fedora' }),
    checkVmReady:       vi.fn().mockResolvedValue({ ok: true, running: true, guestAdditions: true, version: '7.0.14' }),
    runShareLogs:       vi.fn().mockResolvedValue({ ok: true }),
    pickFolder:         vi.fn().mockResolvedValue({ folderPath: HOST_PATH }),
    onScriptLine:       vi.fn().mockReturnValue(() => {}),
    onScriptDone:       vi.fn().mockReturnValue(() => {}),
  } as unknown as typeof window.electronAPI
})

async function renderAndFlush() {
  render(<ShareLogsPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
  await act(async () => {})
}

// Wires onScriptDone to fire immediately with the given exitCode when runShareLogs resolves.
function wireRun(exitCode: number, errorDetail?: string) {
  let doneCb: ((code: number) => void) | null = null
  window.electronAPI.onScriptDone = vi.fn().mockImplementation((cb) => { doneCb = cb; return () => {} })
  window.electronAPI.runShareLogs = vi.fn().mockImplementation(async () => {
    doneCb!(exitCode)
    return exitCode === 0 ? { ok: true } : { ok: false, errorDetail: errorDetail ?? null }
  })
}

// ── Idle form ─────────────────────────────────────────────────────────────────

describe('idle form', () => {
  it('shows the VM name in the heading', async () => {
    await renderAndFlush()
    expect(screen.getByRole('heading', { name: /FedoraBox/i })).toBeInTheDocument()
  })

  it('pre-fills the host path from getVmGuestLogsPath', async () => {
    await renderAndFlush()
    await waitFor(() => {
      expect(screen.getByDisplayValue(HOST_PATH)).toBeInTheDocument()
    })
  })

  it('calls getVmGuestLogsPath with the VM name on mount', async () => {
    await renderAndFlush()
    expect(window.electronAPI.getVmGuestLogsPath).toHaveBeenCalledWith('FedoraBox')
  })

  it('enables the run button when a path is set and credentials exist', async () => {
    await renderAndFlush()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Set up log sync' })).not.toBeDisabled()
    })
  })

  it('disables the run button when credentials are missing', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({ ok: false })
    await renderAndFlush()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Set up log sync' })).toBeDisabled()
    })
  })

  it('shows a credentials warning when no credentials are saved', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({ ok: false })
    await renderAndFlush()
    await waitFor(() => {
      expect(screen.getByText(/no saved credentials/i)).toBeInTheDocument()
    })
  })

  it('shows the Back button', async () => {
    await renderAndFlush()
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
  })

  it('allows overriding the host path via the folder picker', async () => {
    const newPath = 'D:\\Logs'
    window.electronAPI.pickFolder = vi.fn().mockResolvedValue({ folderPath: newPath })
    await renderAndFlush()
    await waitFor(() => expect(screen.getByDisplayValue(HOST_PATH)).toBeInTheDocument())
    fireEvent.click(screen.getByDisplayValue(HOST_PATH))
    await act(async () => {})
    expect(screen.getByDisplayValue(newPath)).toBeInTheDocument()
  })
})

// ── VM ready banner ───────────────────────────────────────────────────────────

describe('VM ready banner', () => {
  it('shows a green banner when VM is running with Guest Additions', async () => {
    await renderAndFlush()
    await waitFor(() => {
      expect(screen.getByText(/VM running/i)).toBeInTheDocument()
    })
  })

  it('shows the Guest Additions version in the green banner', async () => {
    await renderAndFlush()
    await waitFor(() => {
      expect(screen.getByText(/7\.0\.14/)).toBeInTheDocument()
    })
  })

  it('shows an amber banner when the VM is not running', async () => {
    window.electronAPI.checkVmReady = vi.fn().mockResolvedValue({ ok: true, running: false, guestAdditions: false })
    await renderAndFlush()
    await waitFor(() => {
      expect(screen.getByText(/VM is not running/i)).toBeInTheDocument()
    })
  })

  it('shows a red banner when running without Guest Additions', async () => {
    window.electronAPI.checkVmReady = vi.fn().mockResolvedValue({ ok: true, running: true, guestAdditions: false })
    await renderAndFlush()
    await waitFor(() => {
      expect(screen.getByText(/Guest Additions not detected/i)).toBeInTheDocument()
    })
  })
})

// ── Running state ─────────────────────────────────────────────────────────────

describe('running state', () => {
  it('shows the progress indicator while the script is running', async () => {
    window.electronAPI.runShareLogs = vi.fn().mockReturnValue(new Promise(() => {}))
    await renderAndFlush()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set up log sync' })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Set up log sync' }))
    await waitFor(() => {
      expect(screen.getByText('Setting up log sync...')).toBeInTheDocument()
    })
  })

  it('hides the idle form while running', async () => {
    window.electronAPI.runShareLogs = vi.fn().mockReturnValue(new Promise(() => {}))
    await renderAndFlush()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set up log sync' })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Set up log sync' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Set up log sync' })).not.toBeInTheDocument()
    })
  })
})

// ── Success state ─────────────────────────────────────────────────────────────

describe('success state', () => {
  async function runToSuccess() {
    wireRun(0)
    await renderAndFlush()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set up log sync' })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Set up log sync' }))
    await waitFor(() => {
      expect(screen.getByText('Log sync active.')).toBeInTheDocument()
    })
  }

  it('shows the "Log sync active." banner', async () => {
    await runToSuccess()
    expect(screen.getByText('Log sync active.')).toBeInTheDocument()
  })

  it('shows the host path in the success message', async () => {
    await runToSuccess()
    expect(screen.getByText(new RegExp(HOST_PATH.replace(/\\/g, '\\\\')))).toBeInTheDocument()
  })

  it('shows the "Back to VM" button after success', async () => {
    await runToSuccess()
    expect(screen.getByRole('button', { name: /back to vm/i })).toBeInTheDocument()
  })
})

// ── Failure state ─────────────────────────────────────────────────────────────

describe('failure state', () => {
  async function runToFailure() {
    wireRun(1, 'VBoxManage: guest control error')
    await renderAndFlush()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Set up log sync' })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Set up log sync' }))
    await waitFor(() => {
      expect(screen.getByText('Setup failed.')).toBeInTheDocument()
    })
  }

  it('shows the "Setup failed." banner', async () => {
    await runToFailure()
    expect(screen.getByText('Setup failed.')).toBeInTheDocument()
  })

  it('shows the error detail line', async () => {
    await runToFailure()
    expect(screen.getByText('VBoxManage: guest control error')).toBeInTheDocument()
  })

  it('shows the "Try again" button', async () => {
    await runToFailure()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('returns to the idle form when "Try again" is clicked', async () => {
    await runToFailure()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(screen.getByRole('button', { name: 'Set up log sync' })).toBeInTheDocument()
  })
})
