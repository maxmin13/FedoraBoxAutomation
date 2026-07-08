import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'
import PerformancePage from '../pages/PerformancePage'
import type { Vm, ScriptLine } from '../electron.d'

const VM: Vm = { name: 'FedoraBox', uuid: 'uuid-1', running: true }

const BASE_INFO = {
  osType:                'Fedora_64',
  state:                 'running',
  ramMB:                 4096,
  cpus:                  2,
  vramMB:                128,
  nic:                   'nat',
  mac:                   '080027AABBCC',
  diskCapacityMB:        51200,
  diskType:              'dynamic',
  sharedFolders:         [],
  logSyncPath:           null,
  paravirtProvider:      'kvm',
  acceleration3d:        true,
  nicType:               'virtio',
  cpuExecCap:            100,
  storageControllerType: 'AHCI',
}

const SNAPSHOT_1 = {
  ok: true, cpuPct: 42, ramTotalMB: 8192, ramUsedMB: 2048, ramFreeMB: 6144,
  processes: [
    { pid: 501, name: 'k3s-server',  cpu: 88.4, mem: 5,   rssMB: 408 },
    { pid: 10,  name: 'VBoxService', cpu: 1.2,  mem: 0.1, rssMB: 8 },
  ],
}

function makeScriptCallbacks() {
  let lineCb: ((line: ScriptLine) => void) | null = null
  let doneCb: (() => void) | null = null
  const onScriptLine = vi.fn((cb: (line: ScriptLine) => void) => { lineCb = cb; return () => { lineCb = null } })
  const onScriptDone = vi.fn((cb: () => void) => { doneCb = cb; return () => { doneCb = null } })
  return {
    onScriptLine, onScriptDone,
    emitLine: (line: ScriptLine) => act(() => { lineCb?.(line) }),
    emitDone: () => act(() => { doneCb?.() }),
  }
}

let scriptCbs: ReturnType<typeof makeScriptCallbacks>

beforeEach(() => {
  scriptCbs = makeScriptCallbacks()
  window.electronAPI = {
    getVmInfo:          vi.fn().mockResolvedValue({ ok: true, info: BASE_INFO }),
    loadVmCredentials:  vi.fn().mockResolvedValue({ ok: true, user: 'root', pass: 'secret', loginUser: 'fedora' }),
    checkVmCredentials: vi.fn().mockResolvedValue({ ok: true }),
    queryVmPerformance: vi.fn().mockResolvedValue(SNAPSHOT_1),
    killVmProcess:      vi.fn().mockResolvedValue({ ok: true }),
    fixVmPerfSetting:   vi.fn().mockResolvedValue({ ok: true }),
    runProvisionScript: vi.fn().mockResolvedValue({ ok: true }),
    onScriptLine:       scriptCbs.onScriptLine,
    onScriptDone:       scriptCbs.onScriptDone,
    logUiAction:        vi.fn(),
  } as unknown as typeof window.electronAPI
})

async function renderAndWaitForTable() {
  render(<PerformancePage vm={VM} onBack={vi.fn()} />)
  await waitFor(() => expect(screen.getByText('k3s-server')).toBeInTheDocument())
}

// ── Running Processes card ────────────────────────────────────────────────────

describe('PerformancePage — Running Processes card', () => {
  it('renders the process table once the snapshot loads', async () => {
    await renderAndWaitForTable()
    expect(screen.getByText('VBoxService')).toBeInTheDocument()
    expect(screen.getByText('88.4')).toBeInTheDocument()
    expect(screen.getByText('408')).toBeInTheDocument()
  })

  it('shows a description tooltip when hovering a process name', async () => {
    await renderAndWaitForTable()
    fireEvent.mouseEnter(screen.getByText('k3s-server'))
    expect(screen.getByText(/Kubernetes control plane/)).toBeInTheDocument()
  })

  it('shows no tooltip for a process with no known description', async () => {
    window.electronAPI.queryVmPerformance = vi.fn().mockResolvedValue({
      ...SNAPSHOT_1,
      processes: [{ pid: 999, name: 'mystery-proc', cpu: 1, mem: 1, rssMB: 10 }],
    })
    render(<PerformancePage vm={VM} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('mystery-proc')).toBeInTheDocument())
    fireEvent.mouseEnter(screen.getByText('mystery-proc'))
    expect(screen.queryByText('No description available for this process')).not.toBeInTheDocument()
  })

  it('keeps the table visible instead of blanking it when a later refresh fails transiently', async () => {
    let resolveSecondCall: (v: unknown) => void = () => {}
    const secondCall = new Promise((res) => { resolveSecondCall = res })
    window.electronAPI.queryVmPerformance = vi.fn()
      .mockResolvedValueOnce(SNAPSHOT_1)
      .mockReturnValueOnce(secondCall)

    await renderAndWaitForTable()

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    await act(async () => {}) // flush withAuth + the loadProcesses call up to the pending queryVmPerformance

    // Still showing the old snapshot while the refresh is in flight — no loading placeholder.
    expect(screen.getByText('k3s-server')).toBeInTheDocument()
    expect(screen.queryByText('Sampling CPU usage...')).not.toBeInTheDocument()

    await act(async () => { resolveSecondCall({ ok: false, error: 'guest session conflict' }) })

    // A single transient failure after good data must not blank the table or show an error.
    expect(screen.getByText('k3s-server')).toBeInTheDocument()
    expect(screen.queryByText('guest session conflict')).not.toBeInTheDocument()
  })

  it('shows the kill confirmation modal and calls killVmProcess with the right pid and name', async () => {
    await renderAndWaitForTable()
    scriptCbs.emitDone() // Kill buttons are disabled while diagnostics are still running
    const row = screen.getByText('k3s-server').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: /kill/i }))
    await waitFor(() => expect(screen.getByText('Kill this process?')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Kill Process' }))

    await waitFor(() => expect(window.electronAPI.killVmProcess).toHaveBeenCalledWith('FedoraBox', 501, 'k3s-server'))
  })

  it('shows a kill error banner when killVmProcess fails, and Refresh clears it', async () => {
    window.electronAPI.killVmProcess = vi.fn().mockResolvedValue({ ok: false, error: 'Could not stop k3s-server — the operation timed out' })
    await renderAndWaitForTable()
    scriptCbs.emitDone() // Kill buttons are disabled while diagnostics are still running

    const row = screen.getByText('k3s-server').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: /kill/i }))
    await waitFor(() => expect(screen.getByText('Kill this process?')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Kill Process' }))

    await waitFor(() => expect(screen.getByText(/operation timed out/)).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    await waitFor(() => expect(screen.queryByText(/operation timed out/)).not.toBeInTheDocument())
  })
})

// ── Diagnostics card ───────────────────────────────────────────────────────────

describe('PerformancePage — Diagnostics card', () => {
  it('shows the loading placeholder on the very first run, then the parsed report', async () => {
    render(<PerformancePage vm={VM} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Running Performance Check...')).toBeInTheDocument())

    scriptCbs.emitLine({ text: '[STEP ] ===[ Guest Additions ]===', source: 'stdout' })
    scriptCbs.emitLine({ text: '[INFO ] host  Version 7.0.14 loaded', source: 'stdout' })
    scriptCbs.emitDone()

    await waitFor(() => expect(screen.getByText('Version 7.0.14 loaded')).toBeInTheDocument())
    expect(screen.queryByText('Running Performance Check...')).not.toBeInTheDocument()
  })

  it('keeps the last report visible during a refresh instead of blanking to the loading placeholder', async () => {
    render(<PerformancePage vm={VM} onBack={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Running Performance Check...')).toBeInTheDocument())

    scriptCbs.emitLine({ text: '[STEP ] ===[ Guest Additions ]===', source: 'stdout' })
    scriptCbs.emitLine({ text: '[INFO ] host  Version 7.0.14 loaded', source: 'stdout' })
    scriptCbs.emitDone()
    await waitFor(() => expect(screen.getByText('Version 7.0.14 loaded')).toBeInTheDocument())

    // Trigger a second diagnostics run via Refresh — the report from the first
    // run should stay on screen instead of being blanked to the placeholder.
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    await act(async () => {})

    expect(screen.getByText('Version 7.0.14 loaded')).toBeInTheDocument()
    expect(screen.queryByText('Running Performance Check...')).not.toBeInTheDocument()
    expect(screen.getByText('Refreshing...')).toBeInTheDocument()

    scriptCbs.emitLine({ text: '[STEP ] ===[ Guest Additions ]===', source: 'stdout' })
    scriptCbs.emitLine({ text: '[INFO ] host  Version 7.0.16 loaded', source: 'stdout' })
    scriptCbs.emitDone()

    await waitFor(() => expect(screen.getByText('Version 7.0.16 loaded')).toBeInTheDocument())
    expect(screen.queryByText('Version 7.0.14 loaded')).not.toBeInTheDocument()
  })
})
