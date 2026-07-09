import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import VmDetailPage from '../pages/VmDetailPage'
import type { Vm } from '../electron.d'

const VM: Vm = { name: 'FedoraBox', uuid: 'uuid-1', running: true }

const BASE_INFO = {
  osType:         'Fedora_64',
  state:          'poweroff',
  ramMB:          4096,
  cpus:           2,
  vramMB:         128,
  nic:            'nat',
  mac:            '080027AABBCC',
  diskCapacityMB: 51200,
  diskType:       'dynamic',
  sharedFolders:  [],
  logSyncPath:    null,
}

const RUNNING_INFO = { ...BASE_INFO, state: 'running' }

const ALL_FALSE = Object.fromEntries([
  'baseSetup','java','php','python','node','maven','httpd','tomcat',
  'mariadb','postgresql','dbeaver','eclipse','visualStudioCode','docker',
  'minikube','k3s','awsCli','ecsCli','openssl','wireshark','git','vim',
  'chrome','ansible','claudeCode',
].map(k => [k, false]))

beforeEach(() => {
  window.electronAPI = {
    getVmInfo:              vi.fn().mockResolvedValue({ ok: true, info: BASE_INFO }),
    queryVmInstalled:       vi.fn().mockResolvedValue({ ok: false, vmStopped: true }),
    cancelQueryVmInstalled: vi.fn(),
    getScriptState:         vi.fn().mockResolvedValue({ ok: true, running: false, done: false, exitCode: null, lines: [], context: null }),
    clearScriptState:       vi.fn().mockResolvedValue({ ok: true }),
    onScriptLine:           vi.fn().mockReturnValue(() => {}),
    onScriptDone:           vi.fn().mockReturnValue(() => {}),
    getVmGuestLogsPath:     vi.fn().mockResolvedValue({ ok: true, path: 'C:\\VMs\\FedoraBox\\guest-logs' }),
    loadVmCredentials:      vi.fn().mockResolvedValue({ ok: false }),
    checkVmCredentials:     vi.fn().mockResolvedValue({ ok: true }),
    runShareLogs:           vi.fn().mockResolvedValue({ ok: true }),
    runShareFolder:         vi.fn().mockResolvedValue({ ok: true }),
    pickFolder:             vi.fn().mockResolvedValue({ folderPath: null }),
    saveVmCredentials:      vi.fn().mockResolvedValue({ ok: true }),
    toggleVmService:        vi.fn().mockResolvedValue({ ok: true }),
    logUiAction:            vi.fn(),
  } as unknown as typeof window.electronAPI
})

/** Render and wait for the loading state to clear (info loaded or error shown). */
async function renderAndWait() {
  render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
  await waitFor(() => expect(screen.queryByText('Loading VM info...')).not.toBeInTheDocument())
}

// ── Header ────────────────────────────────────────────────────────────────────

describe('VmDetailPage — header', () => {
  it('shows the VM name as a heading', async () => {
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'FedoraBox' })).toBeInTheDocument())
  })

  it('calls onBack when the Back button is clicked', async () => {
    const onBack = vi.fn()
    render(<VmDetailPage vm={VM} onBack={onBack} onScriptRunning={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledOnce()
    await act(async () => {})  // flush pending getVmInfo promise
  })
})

// ── Loading and error states ──────────────────────────────────────────────────

describe('VmDetailPage — loading and error states', () => {
  it('shows "Loading VM info..." while getVmInfo is pending', () => {
    window.electronAPI.getVmInfo = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    expect(screen.getByText('Loading VM info...')).toBeInTheDocument()
  })

  it('shows a red error banner when getVmInfo returns ok: false with an error', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: false, error: 'VM not found' })
    await renderAndWait()
    expect(screen.getByText('VM not found')).toBeInTheDocument()
  })

  it('shows "Could not load VM info" when error field is absent', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: false })
    await renderAndWait()
    expect(screen.getByText('Could not load VM info')).toBeInTheDocument()
  })
})

// ── General section ───────────────────────────────────────────────────────────

describe('VmDetailPage — General section', () => {
  it('shows the OS type', async () => {
    await renderAndWait()
    expect(screen.getByText('Fedora_64')).toBeInTheDocument()
  })

  it('shows the VM state with the first letter capitalised', async () => {
    await renderAndWait()
    expect(screen.getByText('Poweroff')).toBeInTheDocument()
  })

  it('shows "Running" state correctly', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    await renderAndWait()
    // Both the State row value and the VmRunningBadge show "Running" — confirm at least one is present
    expect(screen.getAllByText('Running').length).toBeGreaterThan(0)
  })
})

// ── Hardware section ──────────────────────────────────────────────────────────

describe('VmDetailPage — Hardware section', () => {
  it('shows RAM in MB with thousands separator', async () => {
    await renderAndWait()
    expect(screen.getByText('4,096 MB')).toBeInTheDocument()
  })

  it('shows the CPU count', async () => {
    await renderAndWait()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows VRAM in MB', async () => {
    await renderAndWait()
    expect(screen.getByText('128 MB')).toBeInTheDocument()
  })

  it('shows disk capacity and type', async () => {
    await renderAndWait()
    expect(screen.getByText('50 GB (dynamic)')).toBeInTheDocument()
  })

  it('shows "fixed" disk type when reported', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true, info: { ...BASE_INFO, diskCapacityMB: 20480, diskType: 'fixed' },
    })
    await renderAndWait()
    expect(screen.getByText('20 GB (fixed)')).toBeInTheDocument()
  })

  it('shows "-" for disk when diskCapacityMB is null', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true, info: { ...BASE_INFO, diskCapacityMB: null },
    })
    await renderAndWait()
    expect(screen.getAllByText('-').length).toBeGreaterThan(0)
  })
})

// ── Network section ───────────────────────────────────────────────────────────

describe('VmDetailPage — Network section', () => {
  it('formats "nat" as "NAT"', async () => {
    await renderAndWait()
    expect(screen.getByText('NAT')).toBeInTheDocument()
  })

  it('formats "bridged" as "Bridged"', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true, info: { ...BASE_INFO, nic: 'bridged' },
    })
    await renderAndWait()
    expect(screen.getByText('Bridged')).toBeInTheDocument()
  })

  it('formats the MAC address with colon separators and upper-case hex', async () => {
    await renderAndWait()
    expect(screen.getByText('08:00:27:AA:BB:CC')).toBeInTheDocument()
  })

  it('shows "-" for MAC when mac is an empty string', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true, info: { ...BASE_INFO, mac: '' },
    })
    await renderAndWait()
    expect(screen.getAllByText('-').length).toBeGreaterThan(0)
  })
})

// ── Log sync section ──────────────────────────────────────────────────────────

describe('VmDetailPage — Log sync section', () => {
  it('shows "Not configured" when logSyncPath is null', async () => {
    await renderAndWait()
    expect(screen.getByText('Not configured')).toBeInTheDocument()
  })

  it('shows the sync path when logSyncPath is set', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true, info: { ...BASE_INFO, logSyncPath: 'C:\\VMs\\FedoraBox\\guest-logs' },
    })
    await renderAndWait()
    expect(screen.getByText('C:\\VMs\\FedoraBox\\guest-logs')).toBeInTheDocument()
  })

  it('always shows a Sync button', async () => {
    await renderAndWait()
    expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument()
  })

  it('shows a Sync button even when logSyncPath is already configured', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true, info: { ...BASE_INFO, logSyncPath: 'C:\\VMs\\FedoraBox\\guest-logs' },
    })
    await renderAndWait()
    expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument()
  })
})

// ── Shared folders section ────────────────────────────────────────────────────

describe('VmDetailPage — Shared folders section', () => {
  it('shows "None configured" when sharedFolders is empty', async () => {
    await renderAndWait()
    expect(screen.getByText('None configured')).toBeInTheDocument()
  })

  it('always shows a Share button', async () => {
    await renderAndWait()
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
  })

  it('shows the host path of a configured shared folder', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true,
      info: {
        ...BASE_INFO,
        sharedFolders: [{ name: 'work', hostPath: 'C:\\Work\\shared', mountPoint: '/mnt/shared', existsOnHost: true }],
      },
    })
    await renderAndWait()
    expect(screen.getByText('C:\\Work\\shared')).toBeInTheDocument()
  })

  it('shows the VM mount point of a configured shared folder', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true,
      info: {
        ...BASE_INFO,
        sharedFolders: [{ name: 'work', hostPath: 'C:\\Work\\shared', mountPoint: '/mnt/shared', existsOnHost: true }],
      },
    })
    await renderAndWait()
    expect(screen.getByText('/mnt/shared')).toBeInTheDocument()
  })

  it('shows "-" for mount point when it is empty', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true,
      info: {
        ...BASE_INFO,
        sharedFolders: [{ name: 'work', hostPath: 'C:\\Work\\shared', mountPoint: '', existsOnHost: true }],
      },
    })
    await renderAndWait()
    expect(screen.getByText('-')).toBeInTheDocument()
  })
})

// ── Installed tools — Refresh button ─────────────────────────────────────────

describe('VmDetailPage — Installed tools Refresh button', () => {
  async function openToolsTab() {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Provisioned' })).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Provisioned' })) })
  }

  it('shows "Checking..." (disabled) while queryVmInstalled is in flight', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await openToolsTab()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Checking...' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Checking...' })).toBeDisabled()
  })

  it('shows "Refresh" (enabled) after queryVmInstalled resolves', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({ ok: true, installed: ALL_FALSE })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await openToolsTab()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeDisabled()
  })

  it('shows a Refresh button (enabled) when the VM is stopped', async () => {
    await renderAndWait()
    await openToolsTab()
    await waitFor(() => expect(screen.getByText(/VM is stopped/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeDisabled()
  })
})

// ── Systemd service toggle ──────────────────────────────────────────────────────

describe('VmDetailPage — systemd service toggle', () => {
  async function openToolsTab() {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Provisioned' })).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Provisioned' })) })
  }

  beforeEach(() => {
    Object.assign(window.electronAPI, {
      loadVmCredentials:  vi.fn().mockResolvedValue({ ok: true, user: 'root', pass: 'secret', loginUser: 'fedora' }),
      checkVmCredentials: vi.fn().mockResolvedValue({ ok: true }),
    })
  })

  it('renders an "(enabled)" badge as a clickable button', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({
      ok: true,
      installed: { ...ALL_FALSE, httpd: '2.4.58 (enabled)' },
    })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await openToolsTab()
    await waitFor(() => expect(screen.getByText('2.4.58')).toBeInTheDocument())
    expect(screen.getByText('2.4.58').closest('button')).not.toBeNull()
  })

  it('does not render an "(active)" badge (non-systemd) as a button', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({
      ok: true,
      installed: { ...ALL_FALSE, java: '21 (active)' },
    })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await openToolsTab()
    await waitFor(() => expect(screen.getByText('21')).toBeInTheDocument())
    expect(screen.getByText('21').closest('button')).toBeNull()
  })

  it('clicking an "(enabled)" badge opens a confirmation to disable it', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({
      ok: true,
      installed: { ...ALL_FALSE, httpd: '2.4.58 (enabled)' },
    })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await openToolsTab()
    await waitFor(() => expect(screen.getByText('2.4.58')).toBeInTheDocument())
    fireEvent.click(screen.getByText('2.4.58').closest('button')!)

    await waitFor(() => expect(screen.getByText('Disable this service at startup?')).toBeInTheDocument())
    expect(screen.getByText('Apache HTTP Server 2.4.58')).toBeInTheDocument()
  })

  it('confirming the toggle calls toggleVmService and re-queries installed tools', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({
      ok: true,
      installed: { ...ALL_FALSE, httpd: '2.4.58 (enabled)' },
    })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await openToolsTab()
    await waitFor(() => expect(screen.getByText('2.4.58')).toBeInTheDocument())
    fireEvent.click(screen.getByText('2.4.58').closest('button')!)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument())

    const queryCallsBefore = (window.electronAPI.queryVmInstalled as ReturnType<typeof vi.fn>).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))

    await waitFor(() => expect(window.electronAPI.toggleVmService).toHaveBeenCalledWith('FedoraBox', 'httpd', '2.4.58', 'disable'))
    await waitFor(() => expect((window.electronAPI.queryVmInstalled as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(queryCallsBefore))
  })

  it('shows an error banner when toggling fails', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({
      ok: true,
      installed: { ...ALL_FALSE, httpd: '2.4.58 (enabled)' },
    })
    window.electronAPI.toggleVmService = vi.fn().mockResolvedValue({ ok: false, error: 'Could not disable the service — the VM may be busy' })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await openToolsTab()
    await waitFor(() => expect(screen.getByText('2.4.58')).toBeInTheDocument())
    fireEvent.click(screen.getByText('2.4.58').closest('button')!)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))

    await waitFor(() => expect(screen.getByText('Could not disable the service — the VM may be busy')).toBeInTheDocument())
  })

  it('cancelling the confirmation does not call toggleVmService', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({
      ok: true,
      installed: { ...ALL_FALSE, httpd: '2.4.58 (enabled)' },
    })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await openToolsTab()
    await waitFor(() => expect(screen.getByText('2.4.58')).toBeInTheDocument())
    fireEvent.click(screen.getByText('2.4.58').closest('button')!)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByText('Disable this service at startup?')).not.toBeInTheDocument()
    expect(window.electronAPI.toggleVmService).not.toHaveBeenCalled()
  })

  it('renders a "(disabled)" badge as a clickable button, distinct from a plain version', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({
      ok: true,
      installed: { ...ALL_FALSE, httpd: '2.4.58 (disabled)', php: '8.2.1' },
    })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await openToolsTab()
    await waitFor(() => expect(screen.getByText('2.4.58')).toBeInTheDocument())
    expect(screen.getByText('2.4.58').closest('button')).not.toBeNull()
    // A plain version with no suffix (e.g. PHP, which has no systemd unit at all) stays non-clickable.
    expect(screen.getByText('8.2.1').closest('button')).toBeNull()
  })

  it('clicking a "(disabled)" badge opens a confirmation to enable it', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({
      ok: true,
      installed: { ...ALL_FALSE, k3s: '1.30.2 (disabled)' },
    })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await openToolsTab()
    await waitFor(() => expect(screen.getByText('1.30.2')).toBeInTheDocument())
    fireEvent.click(screen.getByText('1.30.2').closest('button')!)

    await waitFor(() => expect(screen.getByText('Enable this service at startup?')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }))
    await waitFor(() => expect(window.electronAPI.toggleVmService).toHaveBeenCalledWith('FedoraBox', 'k3s', '1.30.2', 'enable'))
  })
})

// ── Navigation ────────────────────────────────────────────────────────────────

describe('VmDetailPage — navigation', () => {
  function addSubPageMocks() {
    Object.assign(window.electronAPI, {
      loadVmCredentials:  vi.fn().mockResolvedValue({ ok: false }),
      checkVmReady:       vi.fn().mockResolvedValue({ ok: true, running: false, guestReady: false }),
      getVmGuestLogsPath: vi.fn().mockResolvedValue({ ok: true, path: 'C:\\VMs\\FedoraBox\\guest-logs' }),
      onScriptLine:       vi.fn().mockReturnValue(() => {}),
      onScriptDone:       vi.fn().mockReturnValue(() => {}),
    })
  }

  it('navigates to ShareFolderPage when the Share button is clicked', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    addSubPageMocks()
    await renderAndWait()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Share' })) })
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Shared folder — FedoraBox' })).toBeInTheDocument()
    )
  })

  it('navigates to ShareLogsPage when the Sync button is clicked', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    addSubPageMocks()
    await renderAndWait()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sync' })) })
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Log sync — FedoraBox' })).toBeInTheDocument()
    )
  })
})

// ── VM not-running banner and disabled buttons ────────────────────────────────

describe('VmDetailPage — VM not running', () => {
  it('enables the Sync button when VM is running', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({ ok: true, installed: ALL_FALSE })
    await renderAndWait()
    expect(screen.getByRole('button', { name: 'Sync' })).not.toBeDisabled()
  })

  it('enables the Share button when VM is running', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({ ok: true, installed: ALL_FALSE })
    await renderAndWait()
    expect(screen.getByRole('button', { name: 'Share' })).not.toBeDisabled()
  })
})

// ── Installed tools section ───────────────────────────────────────────────────

describe('VmDetailPage — Installed tools section', () => {
  async function switchToToolsTab() {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Provisioned' })).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Provisioned' })) })
  }

  it('shows "VM is stopped" message when the VM is powered off', async () => {
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await switchToToolsTab()
    await waitFor(() => expect(screen.getByText(/PROVISIONED TOOLS/i)).toBeInTheDocument())
    expect(screen.getByText(/VM is stopped/i)).toBeInTheDocument()
  })

  it('shows "Save credentials" hint when VM is running but no credentials are saved', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({ ok: false, noCredentials: true })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await switchToToolsTab()
    await waitFor(() =>
      expect(screen.getByText(/Save credentials in Provision/i)).toBeInTheDocument()
    )
  })

  it('renders detected tool labels from queryVmInstalled', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({
      ok: true,
      installed: { ...ALL_FALSE, baseSetup: true, java: '21.0.3', docker: true },
    })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await switchToToolsTab()
    await waitFor(() => expect(screen.getByText('Base Setup')).toBeInTheDocument())
    expect(screen.getByText('Java')).toBeInTheDocument()
    expect(screen.getByText('21.0.3')).toBeInTheDocument()
    expect(screen.getByText('Docker CE')).toBeInTheDocument()
    expect(screen.queryByText('PHP')).not.toBeInTheDocument()
  })

  it('shows "Nothing installed yet" when the VM is running but all tools return false', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({ ok: true, installed: ALL_FALSE })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await switchToToolsTab()
    await waitFor(() => expect(screen.getByText('Nothing installed yet')).toBeInTheDocument())
  })

  it('shows error message when guestcontrol fails', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({ ok: false, error: 'VERR_AUTHENTICATION_FAILURE' })
    render(<VmDetailPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await switchToToolsTab()
    await waitFor(() =>
      expect(screen.getByText(/Could not connect to VM/i)).toBeInTheDocument()
    )
  })
})
