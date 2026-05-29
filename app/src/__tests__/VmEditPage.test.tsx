import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import VmEditPage from '../pages/VmEditPage'
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
  gaVersion:      null,
  logSyncPath:    null,
}

const RUNNING_INFO = { ...BASE_INFO, state: 'running', gaVersion: '7.0.14' }

const ALL_FALSE = Object.fromEntries([
  'baseSetup','java','php','python','node','maven','httpd','tomcat',
  'mariadb','postgresql','dbeaver','eclipse','visualStudioCode','docker',
  'minikube','k3s','awsCli','ecsCli','openssl','wireshark','git','vim',
  'chrome','ansible','claudeCode',
].map(k => [k, false]))

beforeEach(() => {
  window.electronAPI = {
    getVmInfo:        vi.fn().mockResolvedValue({ ok: true, info: BASE_INFO }),
    queryVmInstalled: vi.fn().mockResolvedValue({ ok: false, vmStopped: true }),
  } as unknown as typeof window.electronAPI
})

/** Render and wait for the loading state to clear (info loaded or error shown). */
async function renderAndWait() {
  render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
  await waitFor(() => expect(screen.queryByText('Loading VM info...')).not.toBeInTheDocument())
}

// ── Header ────────────────────────────────────────────────────────────────────

describe('VmEditPage — header', () => {
  it('shows the VM name as a heading', async () => {
    render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'FedoraBox' })).toBeInTheDocument())
  })

  it('calls onBack when the Back button is clicked', async () => {
    const onBack = vi.fn()
    render(<VmEditPage vm={VM} onBack={onBack} onScriptRunning={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledOnce()
    await act(async () => {})  // flush pending getVmInfo promise
  })
})

// ── Loading and error states ──────────────────────────────────────────────────

describe('VmEditPage — loading and error states', () => {
  it('shows "Loading VM info..." while getVmInfo is pending', () => {
    window.electronAPI.getVmInfo = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
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

describe('VmEditPage — General section', () => {
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

describe('VmEditPage — Hardware section', () => {
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

  it('shows "—" for disk when diskCapacityMB is null', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true, info: { ...BASE_INFO, diskCapacityMB: null },
    })
    await renderAndWait()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

// ── Network section ───────────────────────────────────────────────────────────

describe('VmEditPage — Network section', () => {
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

  it('shows "—" for MAC when mac is an empty string', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true, info: { ...BASE_INFO, mac: '' },
    })
    await renderAndWait()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

// ── Guest Additions section ───────────────────────────────────────────────────

describe('VmEditPage — Guest Additions section', () => {
  it('shows the GA version when VM is running and GA is installed', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    await renderAndWait()
    expect(screen.getByText('7.0.14')).toBeInTheDocument()
  })

  it('shows "Not installed" when VM is running but GA version is null', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true, info: { ...RUNNING_INFO, gaVersion: null },
    })
    await renderAndWait()
    expect(screen.getByText('Not installed')).toBeInTheDocument()
  })

  it('shows "Start VM to check" when VM is stopped', async () => {
    await renderAndWait()
    expect(screen.getByText('Start VM to check')).toBeInTheDocument()
  })
})

// ── Log sync section ──────────────────────────────────────────────────────────

describe('VmEditPage — Log sync section', () => {
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

  it('shows a Sync button when logSyncPath is null', async () => {
    await renderAndWait()
    expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument()
  })

  it('hides the Sync button when logSyncPath is already configured', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true, info: { ...BASE_INFO, logSyncPath: 'C:\\VMs\\FedoraBox\\guest-logs' },
    })
    await renderAndWait()
    expect(screen.queryByRole('button', { name: 'Sync' })).not.toBeInTheDocument()
  })
})

// ── Shared folders section ────────────────────────────────────────────────────

describe('VmEditPage — Shared folders section', () => {
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

  it('shows "—" for mount point when it is empty', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true,
      info: {
        ...BASE_INFO,
        sharedFolders: [{ name: 'work', hostPath: 'C:\\Work\\shared', mountPoint: '', existsOnHost: true }],
      },
    })
    await renderAndWait()
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

// ── Installed tools — Refresh button ─────────────────────────────────────────

describe('VmEditPage — Installed tools Refresh button', () => {
  it('shows "Checking..." (disabled) while queryVmInstalled is in flight', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Checking...' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Checking...' })).toBeDisabled()
  })

  it('shows "Refresh" (enabled) after queryVmInstalled resolves', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({ ok: true, installed: ALL_FALSE })
    render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Refresh' })).not.toBeDisabled()
  })

  it('does not show a Refresh button when the VM is stopped', async () => {
    await renderAndWait()
    await waitFor(() => expect(screen.getByText(/VM is stopped/i)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /refresh|checking/i })).not.toBeInTheDocument()
  })
})

// ── Navigation ────────────────────────────────────────────────────────────────

describe('VmEditPage — navigation', () => {
  function addSubPageMocks() {
    Object.assign(window.electronAPI, {
      loadVmCredentials:  vi.fn().mockResolvedValue({ ok: false }),
      checkVmReady:       vi.fn().mockResolvedValue({ ok: true, running: false, guestAdditions: false }),
      getVmGuestLogsPath: vi.fn().mockResolvedValue({ ok: true, path: 'C:\\VMs\\FedoraBox\\guest-logs' }),
      onScriptLine:       vi.fn().mockReturnValue(() => {}),
      onScriptDone:       vi.fn().mockReturnValue(() => {}),
    })
  }

  it('navigates to ShareFolderPage when the Share button is clicked', async () => {
    addSubPageMocks()
    await renderAndWait()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Share' })) })
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Shared folder — FedoraBox' })).toBeInTheDocument()
    )
  })

  it('navigates to ShareLogsPage when the Sync button is clicked', async () => {
    addSubPageMocks()
    await renderAndWait()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sync' })) })
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Log sync — FedoraBox' })).toBeInTheDocument()
    )
  })
})

// ── Installed tools section ───────────────────────────────────────────────────

describe('VmEditPage — Installed tools section', () => {
  it('shows "VM is stopped" message when the VM is powered off', async () => {
    render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/INSTALLED TOOLS/i)).toBeInTheDocument())
    expect(screen.getByText(/VM is stopped/i)).toBeInTheDocument()
  })

  it('shows "Save credentials" hint when VM is running but no credentials are saved', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({ ok: false, noCredentials: true })
    render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByText(/Save credentials in Provision/i)).toBeInTheDocument()
    )
  })

  it('renders detected tool labels from queryVmInstalled', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({
      ok: true,
      installed: { ...ALL_FALSE, baseSetup: true, java: true, docker: true },
    })
    render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Base Setup')).toBeInTheDocument())
    expect(screen.getByText('Oracle JDK')).toBeInTheDocument()
    expect(screen.getByText('Docker CE')).toBeInTheDocument()
    expect(screen.queryByText('PHP')).not.toBeInTheDocument()
  })

  it('shows "Nothing installed yet" when the VM is running but all tools return false', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({ ok: true, installed: ALL_FALSE })
    render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Nothing installed yet')).toBeInTheDocument())
  })

  it('shows error message when guestcontrol fails', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: true, info: RUNNING_INFO })
    window.electronAPI.queryVmInstalled = vi.fn().mockResolvedValue({ ok: false, error: 'VERR_AUTHENTICATION_FAILURE' })
    render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByText(/Could not connect to VM/i)).toBeInTheDocument()
    )
  })
})
