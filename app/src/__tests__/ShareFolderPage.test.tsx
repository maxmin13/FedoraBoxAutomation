import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ShareFolderPage from '../pages/ShareFolderPage'

const VM = { name: 'FedoraBox', uuid: 'uuid-1', running: true }

beforeEach(() => {
  window.electronAPI = {
    loadVmCredentials: vi.fn().mockResolvedValue({ ok: false }),
    runShareFolder:    vi.fn().mockResolvedValue({ ok: true }),
    saveVmCredentials: vi.fn().mockResolvedValue({ ok: true }),
    pickFolder:        vi.fn().mockResolvedValue({ folderPath: 'C:\\Users\\test\\shared' }),
    onScriptLine:      vi.fn().mockReturnValue(() => {}),
    onScriptDone:      vi.fn().mockReturnValue(() => {}),
  } as unknown as typeof window.electronAPI
})

async function renderAndFlush() {
  render(<ShareFolderPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
  await act(async () => {})
}

async function fillAllFields() {
  fireEvent.click(screen.getByPlaceholderText(/C:\\Users\\you\\shared/i))
  await act(async () => {})
  fireEvent.change(screen.getByPlaceholderText('/mnt/shared'), { target: { value: '/mnt/shared' } })
  fireEvent.change(screen.getByPlaceholderText('root'),         { target: { value: 'root' } })
  fireEvent.change(screen.getByPlaceholderText('••••••••'),     { target: { value: 'password' } })
  fireEvent.change(screen.getByPlaceholderText('your desktop username'), { target: { value: 'fedora' } })
}

// Simulate a full run by wiring onScriptDone to fire immediately with the given exitCode.
function wireRun(exitCode: number, errorDetail?: string) {
  let doneCb: ((code: number) => void) | null = null
  window.electronAPI.onScriptDone = vi.fn().mockImplementation((cb) => { doneCb = cb; return () => {} })
  window.electronAPI.runShareFolder = vi.fn().mockImplementation(async () => {
    doneCb!(exitCode)
    return exitCode === 0 ? { ok: true } : { ok: false, errorDetail: errorDetail ?? null }
  })
}

// ── Idle form ────────────────────────────────────────────────────────────────

describe('idle form', () => {
  it('renders all five input fields', async () => {
    await renderAndFlush()
    expect(screen.getByPlaceholderText(/C:\\Users\\you\\shared/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('/mnt/shared')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('root')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('your desktop username')).toBeInTheDocument()
  })

  it('the run button is always enabled', async () => {
    await renderAndFlush()
    expect(screen.getByRole('button', { name: 'Set up shared folder' })).not.toBeDisabled()
  })

  it('opens the folder picker when the host path field is clicked', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByPlaceholderText(/C:\\Users\\you\\shared/i))
    await act(async () => {})
    expect(window.electronAPI.pickFolder).toHaveBeenCalled()
  })

  it('shows the VM name in the heading', async () => {
    await renderAndFlush()
    expect(screen.getByText(/FedoraBox/)).toBeInTheDocument()
  })
})

// ── Credential pre-fill ───────────────────────────────────────────────────────

describe('credential pre-fill', () => {
  it('calls loadVmCredentials with the VM name on mount', async () => {
    await renderAndFlush()
    expect(window.electronAPI.loadVmCredentials).toHaveBeenCalledWith('FedoraBox')
  })

  it('pre-fills fields when saved credentials exist', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true, user: 'root', pass: 'mypass', loginUser: 'alice',
    })
    await renderAndFlush()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('root')).toHaveValue('root')
    })
    expect(screen.getByPlaceholderText('your desktop username')).toHaveValue('alice')
  })

  it('leaves fields empty when no saved credentials exist', async () => {
    await renderAndFlush()
    await act(async () => {})
    expect(screen.getByPlaceholderText('root')).toHaveValue('')
    expect(screen.getByPlaceholderText('your desktop username')).toHaveValue('')
  })
})

// ── Running state ─────────────────────────────────────────────────────────────

describe('running state', () => {
  it('shows the progress indicator while the script is running', async () => {
    window.electronAPI.runShareFolder = vi.fn().mockReturnValue(new Promise(() => {}))
    await renderAndFlush()
    await fillAllFields()
    fireEvent.click(screen.getByRole('button', { name: 'Set up shared folder' }))
    await waitFor(() => {
      expect(screen.getByText('Setting up shared folder...')).toBeInTheDocument()
    })
  })

  it('hides the idle form while running', async () => {
    window.electronAPI.runShareFolder = vi.fn().mockReturnValue(new Promise(() => {}))
    await renderAndFlush()
    await fillAllFields()
    fireEvent.click(screen.getByRole('button', { name: 'Set up shared folder' }))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Set up shared folder' })).not.toBeInTheDocument()
    })
  })
})

// ── Success state ─────────────────────────────────────────────────────────────

describe('success state', () => {
  async function runToSuccess() {
    wireRun(0)
    await renderAndFlush()
    await fillAllFields()
    fireEvent.click(screen.getByRole('button', { name: 'Set up shared folder' }))
    await waitFor(() => {
      expect(screen.getByText('Shared folder set up successfully.')).toBeInTheDocument()
    })
  }

  it('shows the success banner', async () => {
    await runToSuccess()
    expect(screen.getByText('Shared folder set up successfully.')).toBeInTheDocument()
  })

  it('shows the "Back to VM" button', async () => {
    await runToSuccess()
    expect(screen.getByRole('button', { name: /back to vm/i })).toBeInTheDocument()
  })

  it('saves credentials when the share succeeds', async () => {
    await runToSuccess()
    expect(window.electronAPI.saveVmCredentials).toHaveBeenCalledWith('FedoraBox', 'root', 'password', 'fedora')
  })
})

// ── Failure state ─────────────────────────────────────────────────────────────

describe('failure state', () => {
  async function runToFailure() {
    wireRun(1, 'VBoxManage: guest control error')
    await renderAndFlush()
    await fillAllFields()
    fireEvent.click(screen.getByRole('button', { name: 'Set up shared folder' }))
    await waitFor(() => {
      expect(screen.getByText('Setup failed.')).toBeInTheDocument()
    })
  }

  it('shows the failure banner', async () => {
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

  it('does not save credentials when the share fails', async () => {
    await runToFailure()
    expect(window.electronAPI.saveVmCredentials).not.toHaveBeenCalled()
  })

  it('returns to the idle form when "Try again" is clicked', async () => {
    await runToFailure()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(screen.getByRole('button', { name: 'Set up shared folder' })).toBeInTheDocument()
  })
})

// ── /var/log mount point validation ───────────────────────────────────────────

describe('/var/log mount point validation', () => {
  it('shows an error message when /var/log is entered as mount point', async () => {
    await renderAndFlush()
    fireEvent.change(screen.getByPlaceholderText('/mnt/shared'), { target: { value: '/var/log' } })
    expect(screen.getByText(/\/var\/log is a system directory/i)).toBeInTheDocument()
  })

  it('also blocks /var/log/ with a trailing slash', async () => {
    await renderAndFlush()
    fireEvent.change(screen.getByPlaceholderText('/mnt/shared'), { target: { value: '/var/log/' } })
    expect(screen.getByText(/\/var\/log is a system directory/i)).toBeInTheDocument()
  })
})

// ── onScriptRunning callback ───────────────────────────────────────────────────

describe('onScriptRunning callback', () => {
  it('calls onScriptRunning(true) when the script starts running', async () => {
    const onScriptRunning = vi.fn()
    window.electronAPI.runShareFolder = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<ShareFolderPage vm={VM} onBack={vi.fn()} onScriptRunning={onScriptRunning} />)
    await act(async () => {})
    await fillAllFields()
    fireEvent.click(screen.getByRole('button', { name: 'Set up shared folder' }))
    await act(async () => {})
    expect(onScriptRunning).toHaveBeenCalledWith(true)
  })

  it('calls onScriptRunning(false) when the script finishes', async () => {
    const onScriptRunning = vi.fn()
    wireRun(0)
    render(<ShareFolderPage vm={VM} onBack={vi.fn()} onScriptRunning={onScriptRunning} />)
    await act(async () => {})
    await fillAllFields()
    fireEvent.click(screen.getByRole('button', { name: 'Set up shared folder' }))
    await waitFor(() => {
      expect(onScriptRunning).toHaveBeenCalledWith(false)
    })
  })
})
