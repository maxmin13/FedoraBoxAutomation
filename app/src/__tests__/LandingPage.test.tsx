import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import LandingPage from '../pages/LandingPage'

const STOPPED_VM = { name: 'FedoraBox', uuid: 'uuid-1', running: false }
const RUNNING_VM = { name: 'RunningVM', uuid: 'uuid-2', running: true }

beforeEach(() => {
  window.electronAPI = {
    listVms:                vi.fn().mockResolvedValue({ ok: true, vms: [] }),
    startVm:                vi.fn().mockResolvedValue({ ok: true }),
    stopVm:                 vi.fn().mockResolvedValue({ ok: true }),
    deleteVm:               vi.fn().mockResolvedValue({ ok: true }),
    loadVmCredentials:      vi.fn().mockResolvedValue({ ok: false }),
    checkVmReady:           vi.fn().mockResolvedValue({ ok: true, running: false, guestReady: false }),
    checkVmCredentials:     vi.fn().mockResolvedValue({ ok: true }),
    checkVmUser:            vi.fn().mockResolvedValue({ ok: true }),
    saveVmCredentials:      vi.fn().mockResolvedValue({ ok: true }),
    getVmInfo:              vi.fn().mockResolvedValue({ ok: false, error: 'not needed' }),
    onScriptLine:           vi.fn().mockReturnValue(() => {}),
    onScriptDone:           vi.fn().mockReturnValue(() => {}),
    logUiAction:            vi.fn(),
    getScriptState:         vi.fn().mockResolvedValue({ ok: true, running: false, done: false, exitCode: null, lines: [], context: null }),
    clearScriptState:       vi.fn().mockResolvedValue({ ok: true }),
    saveProvisionResult:    vi.fn().mockResolvedValue({ ok: true }),
    loadProvisionResult:    vi.fn().mockResolvedValue({ ok: false }),
    clearProvisionResult:   vi.fn().mockResolvedValue({ ok: true }),
    getVmGuestLogsPath:     vi.fn().mockResolvedValue({ ok: true, path: 'C:\\VMs\\FedoraBox\\guest-logs' }),
    cancelQueryVmInstalled: vi.fn(),
    queryVmInstalled:       vi.fn().mockResolvedValue({ ok: false, vmStopped: true }),
    runShareLogs:           vi.fn().mockResolvedValue({ ok: true }),
    runShareFolder:         vi.fn().mockResolvedValue({ ok: true }),
    pickFolder:             vi.fn().mockResolvedValue({ folderPath: null }),
  } as unknown as typeof window.electronAPI
})

async function renderAndFlush() {
  render(<LandingPage onNavigate={vi.fn()} onScriptRunning={vi.fn()} isActive={true} />)
  await act(async () => {})
}

// ── Loading state ─────────────────────────────────────────────────────────────

describe('loading state', () => {
  it('shows "Loading VMs..." while listVms is pending', () => {
    window.electronAPI.listVms = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<LandingPage onNavigate={vi.fn()} onScriptRunning={vi.fn()} isActive={true} />)
    expect(screen.getByText('Loading VMs...')).toBeInTheDocument()
  })

})

// ── Empty state ───────────────────────────────────────────────────────────────

describe('empty state', () => {
  it('shows "No VMs found" when the list is empty', async () => {
    await renderAndFlush()
    expect(screen.getByText('No VMs found')).toBeInTheDocument()
  })

})

// ── Error state ───────────────────────────────────────────────────────────────

describe('error state', () => {
  it('shows a VirtualBox error banner when listVms fails', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({
      ok: false, error: 'VBoxManage not found', vms: [],
    })
    await renderAndFlush()
    expect(screen.getByText('Could not connect to VirtualBox')).toBeInTheDocument()
    expect(screen.getByText('VBoxManage not found')).toBeInTheDocument()
  })

  it('shows "Could not load VMs" when error field is absent', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: false, vms: [] })
    await renderAndFlush()
    expect(screen.getByText('Could not load VMs')).toBeInTheDocument()
  })
})

// ── VM list ───────────────────────────────────────────────────────────────────

describe('VM list', () => {
  beforeEach(() => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({
      ok: true, vms: [STOPPED_VM, RUNNING_VM],
    })
  })

  it('shows a card for each VM', async () => {
    await renderAndFlush()
    expect(screen.getByText('FedoraBox')).toBeInTheDocument()
    expect(screen.getByText('RunningVM')).toBeInTheDocument()
  })

  it('shows the UUID of each VM', async () => {
    await renderAndFlush()
    expect(screen.getByText('uuid-1')).toBeInTheDocument()
    expect(screen.getByText('uuid-2')).toBeInTheDocument()
  })

  it('shows a "Stop" button for a running VM', async () => {
    await renderAndFlush()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
  })

  it('shows a "Start" button for a stopped VM', async () => {
    await renderAndFlush()
    expect(screen.getAllByRole('button', { name: 'Start' }).length).toBeGreaterThan(0)
  })

  it('shows the Running badge for a running VM and Stopped for a stopped one', async () => {
    await renderAndFlush()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('Stopped')).toBeInTheDocument()
  })

  it('calls startVm when the Start button is clicked', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [STOPPED_VM] })
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await act(async () => {})
    expect(window.electronAPI.startVm).toHaveBeenCalledWith('FedoraBox')
  })

  it('calls stopVm and refreshes when the Stop button is clicked', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [RUNNING_VM] })
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Stop VM' }))
    await act(async () => {})
    expect(window.electronAPI.stopVm).toHaveBeenCalledWith('RunningVM')
  })

  it('shows "Starting..." badge while startVm is in flight', async () => {
    let resolveStart: (v: { ok: boolean }) => void
    window.electronAPI.startVm = vi.fn().mockReturnValue(
      new Promise<{ ok: boolean }>((r) => { resolveStart = r })
    )
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [STOPPED_VM] })
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await act(async () => {})
    expect(screen.getByText('Starting...')).toBeInTheDocument()
    await act(async () => { resolveStart({ ok: true }) })
  })

  it('shows "Stopping..." badge while stopVm is in flight', async () => {
    let resolveStop: (v: { ok: boolean }) => void
    window.electronAPI.stopVm = vi.fn().mockReturnValue(
      new Promise<{ ok: boolean }>((r) => { resolveStop = r })
    )
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [RUNNING_VM] })
    await renderAndFlush()
    // Open the stop confirmation modal
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await act(async () => {})
    // Confirm stop — stopVm is now pending (never resolves until we call resolveStop)
    fireEvent.click(screen.getByRole('button', { name: 'Stop VM' }))
    await act(async () => {})
    // Badge should immediately switch to "Stopping..."
    expect(screen.getByText('Stopping...')).toBeInTheDocument()
    // Resolve to avoid dangling async work
    await act(async () => { resolveStop({ ok: true }) })
  })

  it('calls startVm with the VM name when Start is clicked', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [STOPPED_VM] })
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await act(async () => {})
    expect(window.electronAPI.startVm).toHaveBeenCalledWith('FedoraBox')
  })
})


// ── Delete confirmation ───────────────────────────────────────────────────────

describe('delete confirmation', () => {
  beforeEach(() => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [STOPPED_VM] })
  })

  it('shows a Delete button for a stopped VM', async () => {
    await renderAndFlush()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('shows a delete confirmation modal after clicking Delete', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('closes the modal and keeps the Delete button when Cancel is clicked', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete permanently' })).not.toBeInTheDocument()
  })

  it('calls deleteVm with the VM name when Delete permanently is clicked', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await act(async () => {})
    expect(window.electronAPI.deleteVm).toHaveBeenCalledWith('FedoraBox')
  })

  it('disables the Delete button for a running VM', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [RUNNING_VM] })
    await renderAndFlush()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })
})

// ── VM detail navigation ──────────────────────────────────────────────────────

describe('VM detail navigation', () => {
  beforeEach(() => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [STOPPED_VM] })
    // handleOpenDetail checks credentials before showing VmDetailPage
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({ ok: true, user: 'root', pass: 'password' })
  })

  async function clickDetail() {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Detail' }))
    await act(async () => {})
  }

  it('opens VmDetailPage when the Detail button is clicked', async () => {
    await clickDetail()
    expect(screen.getByRole('heading', { name: 'FedoraBox', level: 1 })).toBeInTheDocument()
  })

  it('returns to the VM grid when Back is clicked in the detail view', async () => {
    await clickDetail()
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    await act(async () => {})
    expect(screen.getByRole('heading', { name: 'My VMs', level: 1 })).toBeInTheDocument()
  })

  it('opens ProvisionPage when the Provision button is clicked', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Provision' }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: /Base Setup/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /By Category/ })).toBeInTheDocument()
  })
})
