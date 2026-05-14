import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import CreateVmPage from '../pages/CreateVmPage'

const EXISTING_VMS = [
  { name: 'FedoraBox', uuid: 'uuid-1', running: false },
]

beforeEach(() => {
  window.electronAPI = {
    listVms:      vi.fn().mockResolvedValue({ ok: true, vms: [] }),
    createVm:     vi.fn().mockResolvedValue({ ok: true }),
    onScriptLine: vi.fn().mockReturnValue(() => {}),
    onScriptDone: vi.fn().mockReturnValue(() => {}),
  } as unknown as typeof window.electronAPI
})

// Helpers — fill required fields and optionally click submit.
function fillRequiredFields() {
  fireEvent.change(screen.getByPlaceholderText(/e\.g\. FedoraBox/i), {
    target: { value: 'MyVM' },
  })
  fireEvent.change(screen.getByPlaceholderText(/Fedora-Workstation-Live/i), {
    target: { value: 'C:\\iso\\fedora.iso' },
  })
}

async function submitForm() {
  fillRequiredFields()
  fireEvent.click(screen.getByRole('button', { name: 'Create VM' }))
}

// ── Submit button state ──────────────────────────────────────────────────────

describe('submit button', () => {
  it('is disabled when both VM name and ISO path are empty', () => {
    render(<CreateVmPage />)
    expect(screen.getByRole('button', { name: 'Create VM' })).toBeDisabled()
  })

  it('is disabled when VM name is filled but ISO path is empty', () => {
    render(<CreateVmPage />)
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. FedoraBox/i), {
      target: { value: 'MyVM' },
    })
    expect(screen.getByRole('button', { name: 'Create VM' })).toBeDisabled()
  })

  it('is disabled when ISO path is filled but VM name is empty', () => {
    render(<CreateVmPage />)
    fireEvent.change(screen.getByPlaceholderText(/Fedora-Workstation-Live/i), {
      target: { value: 'C:\\iso.iso' },
    })
    expect(screen.getByRole('button', { name: 'Create VM' })).toBeDisabled()
  })

  it('is enabled when both VM name and ISO path are filled', () => {
    render(<CreateVmPage />)
    fillRequiredFields()
    expect(screen.getByRole('button', { name: 'Create VM' })).not.toBeDisabled()
  })
})

// ── Name conflict ────────────────────────────────────────────────────────────

describe('name conflict', () => {
  beforeEach(() => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: EXISTING_VMS })
  })

  it('shows a warning when the VM name matches an existing VM', async () => {
    render(<CreateVmPage />)
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. FedoraBox/i), {
      target: { value: 'FedoraBox' },
    })
    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    })
  })

  it('changes button label to "Recreate VM" when name conflicts', async () => {
    render(<CreateVmPage />)
    fillRequiredFields()
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. FedoraBox/i), {
      target: { value: 'FedoraBox' },
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Recreate VM' })).toBeInTheDocument()
    })
  })

  it('shows no warning for a name that does not conflict', async () => {
    render(<CreateVmPage />)
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. FedoraBox/i), {
      target: { value: 'NewVM' },
    })
    await waitFor(() => expect(window.electronAPI.listVms).toHaveBeenCalled())
    // Flush the resolved promise so existingNames state has been applied before asserting
    await act(async () => {})
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument()
  })
})

// ── Running state ────────────────────────────────────────────────────────────

describe('running state', () => {
  it('disables the button and shows "Creating..." while the script runs', async () => {
    window.electronAPI.createVm = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<CreateVmPage />)
    await submitForm()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled()
    })
  })

  it('calls createVm with the expected VM name and ISO path', async () => {
    window.electronAPI.createVm = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<CreateVmPage />)
    await submitForm()
    await waitFor(() => {
      expect(window.electronAPI.createVm).toHaveBeenCalledWith(
        expect.objectContaining({ vmName: 'MyVM', isoPath: 'C:\\iso\\fedora.iso' })
      )
    })
  })

  it('renders emitted log lines in the log panel while running', async () => {
    let emitLine: ((line: { text: string; source: 'stdout' | 'stderr' }) => void) | null = null
    window.electronAPI.onScriptLine = vi.fn().mockImplementation((cb) => {
      emitLine = cb
      return () => {}
    })
    window.electronAPI.createVm = vi.fn().mockReturnValue(new Promise(() => {}))

    render(<CreateVmPage />)
    await submitForm()

    act(() => { emitLine!({ text: 'Creating virtual disk...', source: 'stdout' }) })

    expect(screen.getByText('Creating virtual disk...')).toBeInTheDocument()
  })
})

// ── Success state ────────────────────────────────────────────────────────────

describe('success state', () => {
  beforeEach(async () => {
    render(<CreateVmPage />)
    await submitForm()
    await waitFor(() => expect(screen.getByText('VM created successfully.')).toBeInTheDocument())
  })

  it('shows the "VM created successfully" banner', () => {
    expect(screen.getByText('VM created successfully.')).toBeInTheDocument()
  })

  it('shows the "What to do next" section', () => {
    expect(screen.getByText('What to do next')).toBeInTheDocument()
  })

})

// ── Failure state ────────────────────────────────────────────────────────────

describe('failure state', () => {
  it('shows the "VM creation failed" banner when createVm returns ok: false', async () => {
    window.electronAPI.createVm = vi.fn().mockResolvedValue({ ok: false })
    render(<CreateVmPage />)
    await submitForm()
    await waitFor(() => {
      expect(screen.getByText('VM creation failed.')).toBeInTheDocument()
    })
  })

  it('shows the "Script output" toggle on failure', async () => {
    let emitLine: ((line: { text: string; source: 'stdout' | 'stderr' }) => void) | null = null
    window.electronAPI.onScriptLine = vi.fn().mockImplementation((cb) => {
      emitLine = cb
      return () => {}
    })
    window.electronAPI.createVm = vi.fn().mockResolvedValue({ ok: false })

    render(<CreateVmPage />)
    await submitForm()

    act(() => { emitLine!({ text: 'ERROR: VBoxManage failed', source: 'stderr' }) })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /script output/i })).toBeInTheDocument()
    })
  })
})

// ── Log toggle ───────────────────────────────────────────────────────────────

describe('log toggle', () => {
  async function runToSuccessWithLogLine() {
    let emitLine: ((line: { text: string; source: 'stdout' | 'stderr' }) => void) | null = null
    window.electronAPI.onScriptLine = vi.fn().mockImplementation((cb) => {
      emitLine = cb
      return () => {}
    })

    render(<CreateVmPage />)
    await submitForm()

    act(() => { emitLine!({ text: 'Configuring VM...', source: 'stdout' }) })

    await waitFor(() => expect(screen.getByText('VM created successfully.')).toBeInTheDocument())
    // Flush any pending state updates (e.g. listVms resolving) to avoid act() warnings.
    await act(async () => {})
  }

  it('log lines are hidden by default after completion', async () => {
    await runToSuccessWithLogLine()
    expect(screen.queryByText('Configuring VM...')).not.toBeInTheDocument()
  })

  it('clicking Show reveals the log lines', async () => {
    await runToSuccessWithLogLine()
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    expect(screen.getByText('Configuring VM...')).toBeInTheDocument()
  })

  it('clicking Hide after Show collapses the log again', async () => {
    await runToSuccessWithLogLine()
    fireEvent.click(screen.getByRole('button', { name: /show/i }))
    fireEvent.click(screen.getByRole('button', { name: /hide/i }))
    expect(screen.queryByText('Configuring VM...')).not.toBeInTheDocument()
  })

  it('shows the "Script output" toggle when log lines were emitted', async () => {
    await runToSuccessWithLogLine()
    expect(screen.getByRole('button', { name: /script output/i })).toBeInTheDocument()
  })
})
