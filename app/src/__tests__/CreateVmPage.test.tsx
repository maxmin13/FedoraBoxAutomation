import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import CreateVmPage from '../pages/CreateVmPage'

const EXISTING_VMS = [
  { name: 'FedoraBox', uuid: 'uuid-1', running: false },
]

const ISO_PATH     = 'C:\\Users\\test\\Downloads\\fedora.iso'
const ISO_FILENAME = 'fedora.iso'

let onScriptRunning: ReturnType<typeof vi.fn>

beforeEach(() => {
  onScriptRunning = vi.fn()
  window.electronAPI = {
    listVms:            vi.fn().mockResolvedValue({ ok: true, vms: [] }),
    createVm:           vi.fn().mockResolvedValue({ ok: true }),
    saveVmCredentials:  vi.fn().mockResolvedValue({ ok: true }),
    onScriptLine:       vi.fn().mockReturnValue(() => {}),
    onScriptDone:       vi.fn().mockReturnValue(() => {}),
    // Default: clicking the ISO input fills in ISO_PATH
    pickIso:            vi.fn().mockResolvedValue({ filePath: ISO_PATH }),
  } as unknown as typeof window.electronAPI
})

// ── Wizard navigation helpers ────────────────────────────────────────────────

// Renders the page and flushes all initial async calls (listVms).
async function renderAndFlush() {
  render(<CreateVmPage onScriptRunning={onScriptRunning} />)
  await act(async () => {})
}

// Fills step 1. The ISO input is read-only and opens a file picker on click,
// so we fire a click event and await the async pickIso resolution.
async function fillStep1(vmName = 'MyVM') {
  fireEvent.change(screen.getByPlaceholderText(/e\.g\. FedoraBox/i), {
    target: { value: vmName },
  })
  fireEvent.click(screen.getByPlaceholderText(/Click to browse/i))
  await act(async () => {})
}

function navigateToConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))   // step 1 -> 2
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))   // step 2 -> 3
  fireEvent.click(screen.getByRole('button', { name: 'Review' })) // step 3 -> 4
}

async function submitForm(vmName = 'MyVM') {
  await renderAndFlush()
  await fillStep1(vmName)
  navigateToConfirm()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /create vm|recreate vm/i }))
  })
}

// ── Step 1 — Next button state ───────────────────────────────────────────────

describe('step 1 next button', () => {
  it('is disabled when both VM name and ISO path are empty', async () => {
    render(<CreateVmPage onScriptRunning={onScriptRunning} />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('is disabled when VM name is filled but ISO path is empty', async () => {
    window.electronAPI.pickIso = vi.fn().mockResolvedValue({ filePath: null })
    render(<CreateVmPage onScriptRunning={onScriptRunning} />)
    await act(async () => {})
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. FedoraBox/i), {
      target: { value: 'MyVM' },
    })
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('is disabled when ISO path is filled but VM name is empty', async () => {
    render(<CreateVmPage onScriptRunning={onScriptRunning} />)
    fireEvent.click(screen.getByPlaceholderText(/Click to browse/i))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('is enabled when both VM name and ISO path are filled', async () => {
    render(<CreateVmPage onScriptRunning={onScriptRunning} />)
    await fillStep1()
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
  })
})

// ── Step indicator ───────────────────────────────────────────────────────────

describe('step indicator', () => {
  it('shows all four step labels', async () => {
    render(<CreateVmPage onScriptRunning={onScriptRunning} />)
    await act(async () => {})
    expect(screen.getByText('Identity')).toBeInTheDocument()
    expect(screen.getByText('Hardware')).toBeInTheDocument()
    expect(screen.getByText('Options')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
  })

  it('advances to step 2 after clicking Next on a valid step 1', async () => {
    render(<CreateVmPage onScriptRunning={onScriptRunning} />)
    await fillStep1()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.queryByPlaceholderText(/e\.g\. FedoraBox/i)).not.toBeInTheDocument()
    expect(screen.getByText('RAM (MB)')).toBeInTheDocument()
  })

  it('can navigate back from step 2 to step 1', async () => {
    render(<CreateVmPage onScriptRunning={onScriptRunning} />)
    await fillStep1()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByPlaceholderText(/e\.g\. FedoraBox/i)).toBeInTheDocument()
  })

  it('shows "Review" as the next-button label on step 3', async () => {
    render(<CreateVmPage onScriptRunning={onScriptRunning} />)
    await fillStep1()
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // -> step 2
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // -> step 3
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
  })

  it('shows the confirm summary on step 4', async () => {
    await renderAndFlush()
    await fillStep1()
    navigateToConfirm()
    expect(screen.getByText('MyVM')).toBeInTheDocument()
    // Confirm page displays only the filename, not the full path
    expect(screen.getByText(ISO_FILENAME)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create VM' })).toBeInTheDocument()
  })

  it('preserves field values when navigating back from step 2', async () => {
    render(<CreateVmPage onScriptRunning={onScriptRunning} />)
    await fillStep1('TestVM')
    fireEvent.click(screen.getByRole('button', { name: 'Next' })) // -> step 2
    fireEvent.click(screen.getByRole('button', { name: 'Back' })) // -> step 1
    expect(screen.getByPlaceholderText(/e\.g\. FedoraBox/i)).toHaveValue('TestVM')
  })
})

// ── Name conflict ────────────────────────────────────────────────────────────

describe('name conflict', () => {
  beforeEach(() => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: EXISTING_VMS })
  })

  it('shows a warning on step 1 when the VM name matches an existing VM', async () => {
    render(<CreateVmPage onScriptRunning={onScriptRunning} />)
    await act(async () => {})
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. FedoraBox/i), {
      target: { value: 'FedoraBox' },
    })
    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    })
  })

  it('shows no warning for a name that does not conflict', async () => {
    render(<CreateVmPage onScriptRunning={onScriptRunning} />)
    await act(async () => {})
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. FedoraBox/i), {
      target: { value: 'NewVM' },
    })
    await act(async () => {})
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument()
  })

  it('shows "Recreate VM" button on confirm page when name conflicts', async () => {
    render(<CreateVmPage onScriptRunning={onScriptRunning} />)
    await fillStep1('FedoraBox')
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument())
    navigateToConfirm()
    expect(screen.getByRole('button', { name: 'Recreate VM' })).toBeInTheDocument()
  })
})

// ── Running state ────────────────────────────────────────────────────────────

describe('running state', () => {
  it('replaces the wizard with the progress bar when the script starts', async () => {
    window.electronAPI.createVm = vi.fn().mockReturnValue(new Promise(() => {}))
    await submitForm()
    await waitFor(() => {
      expect(screen.getByText('Creating VM...')).toBeInTheDocument()
    })
  })

  it('calls createVm with the expected VM name and ISO path', async () => {
    window.electronAPI.createVm = vi.fn().mockReturnValue(new Promise(() => {}))
    await submitForm()
    await waitFor(() => {
      expect(window.electronAPI.createVm).toHaveBeenCalledWith(
        expect.objectContaining({ vmName: 'MyVM', isoPath: ISO_PATH })
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

    await submitForm()

    act(() => { emitLine!({ text: 'Creating virtual disk...', source: 'stdout' }) })

    expect(screen.getByText('Creating virtual disk...')).toBeInTheDocument()
  })
})

// ── Success state ────────────────────────────────────────────────────────────

describe('success state', () => {
  beforeEach(async () => {
    await submitForm()
    await waitFor(() => expect(screen.getByText('VM created successfully.')).toBeInTheDocument())
  })

  it('shows the "VM created successfully" banner', () => {
    expect(screen.getByText('VM created successfully.')).toBeInTheDocument()
  })

  it('shows the "Next: What to do" navigation button', () => {
    expect(screen.getByRole('button', { name: /next.*what to do/i })).toBeInTheDocument()
  })

  it('shows the "What to do next" section after clicking the navigation button', () => {
    fireEvent.click(screen.getByRole('button', { name: /next.*what to do/i }))
    expect(screen.getByText('What to do next')).toBeInTheDocument()
  })
})

// ── Failure state ────────────────────────────────────────────────────────────

describe('failure state', () => {
  it('shows the "VM creation failed" banner when createVm returns ok: false', async () => {
    window.electronAPI.createVm = vi.fn().mockResolvedValue({ ok: false })
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

    await submitForm()

    act(() => { emitLine!({ text: 'Configuring VM...', source: 'stdout' }) })

    await waitFor(() => expect(screen.getByText('VM created successfully.')).toBeInTheDocument())
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
