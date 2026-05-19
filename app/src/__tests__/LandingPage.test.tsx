import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import LandingPage from '../pages/LandingPage'

const STOPPED_VM = { name: 'FedoraBox', uuid: 'uuid-1', running: false }
const RUNNING_VM = { name: 'RunningVM', uuid: 'uuid-2', running: true }

beforeEach(() => {
  window.electronAPI = {
    listVms:           vi.fn().mockResolvedValue({ ok: true, vms: [] }),
    startVm:           vi.fn().mockResolvedValue({ ok: true }),
    stopVm:            vi.fn().mockResolvedValue({ ok: true }),
    deleteVm:          vi.fn().mockResolvedValue({ ok: true }),
    loadVmCredentials: vi.fn().mockResolvedValue({ ok: false }),
    checkVmReady:      vi.fn().mockResolvedValue({ ok: true, running: false, guestAdditions: false }),
    onScriptLine:      vi.fn().mockReturnValue(() => {}),
    onScriptDone:      vi.fn().mockReturnValue(() => {}),
  } as unknown as typeof window.electronAPI
})

async function renderAndFlush() {
  render(<LandingPage onNavigate={vi.fn()} onScriptRunning={vi.fn()} />)
  await act(async () => {})
}

// ── Loading state ─────────────────────────────────────────────────────────────

describe('loading state', () => {
  it('shows "Loading VMs..." while listVms is pending', () => {
    window.electronAPI.listVms = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<LandingPage onNavigate={vi.fn()} onScriptRunning={vi.fn()} />)
    expect(screen.getByText('Loading VMs...')).toBeInTheDocument()
  })

  it('shows a disabled loading button while loading', () => {
    window.electronAPI.listVms = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<LandingPage onNavigate={vi.fn()} onScriptRunning={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled()
  })
})

// ── Empty state ───────────────────────────────────────────────────────────────

describe('empty state', () => {
  it('shows "No VMs found" when the list is empty', async () => {
    await renderAndFlush()
    expect(screen.getByText('No VMs found')).toBeInTheDocument()
  })

  it('shows the Refresh button in the page header', async () => {
    await renderAndFlush()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
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

  it('calls startVm and refreshes when the Start button is clicked', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [STOPPED_VM] })
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await act(async () => {})
    expect(window.electronAPI.startVm).toHaveBeenCalledWith('FedoraBox')
    expect(window.electronAPI.listVms).toHaveBeenCalledTimes(2)
  })

  it('calls stopVm and refreshes when the Stop button is clicked', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [RUNNING_VM] })
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await act(async () => {})
    expect(window.electronAPI.stopVm).toHaveBeenCalledWith('RunningVM')
  })

  it('calls startVm with the VM name when Start is clicked', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [STOPPED_VM] })
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    await act(async () => {})
    expect(window.electronAPI.startVm).toHaveBeenCalledWith('FedoraBox')
  })
})

// ── Refresh ───────────────────────────────────────────────────────────────────

describe('Refresh', () => {
  it('reloads the VM list when the Refresh button is clicked', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await act(async () => {})
    expect(window.electronAPI.listVms).toHaveBeenCalledTimes(2)
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

  it('shows Confirm Delete and Cancel after clicking Delete', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button', { name: 'Confirm Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('returns to the Delete button state when Cancel is clicked', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm Delete' })).not.toBeInTheDocument()
  })

  it('calls deleteVm with the VM name when Confirm Delete is clicked', async () => {
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }))
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
  it('opens VmDetailPage when the Edit button is clicked', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [STOPPED_VM] })
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await act(async () => {})
    // VmDetailPage shows the VM name as a heading
    expect(screen.getByRole('heading', { name: 'FedoraBox', level: 1 })).toBeInTheDocument()
  })

  it('returns to the VM grid when Back is clicked in the detail view', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [STOPPED_VM] })
    await renderAndFlush()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    await act(async () => {})
    // Back to the grid — the heading is "My VMs"
    expect(screen.getByRole('heading', { name: 'My VMs', level: 1 })).toBeInTheDocument()
  })
})
