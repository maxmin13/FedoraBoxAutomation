import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import VmEditPage from '../pages/VmEditPage'

const STOPPED_VM = { name: 'FedoraBox', uuid: 'uuid-1', running: false }
const RUNNING_VM = { name: 'FedoraBox', uuid: 'uuid-1', running: true }

const SAMPLE_INFO = {
  ok: true,
  info: {
    osType: 'Fedora_64',
    state: 'poweroff',
    ramMB: 4096,
    cpus: 2,
    vramMB: 128,
    diskCapacityMB: 51200,
    diskType: 'dynamic',
    nic: 'nat',
    mac: '080027AABBCC',
    sharedFolders: [],
    gaVersion: null,
    logSyncPath: 'C:\\VMs\\FedoraBox\\guest-logs',
  },
}

beforeEach(() => {
  window.electronAPI = {
    getVmInfo:          vi.fn().mockResolvedValue(SAMPLE_INFO),
    loadVmCredentials:  vi.fn().mockResolvedValue({ ok: false }),
    checkVmReady:       vi.fn().mockResolvedValue({ ok: true, running: false, guestAdditions: false }),
    getVmGuestLogsPath: vi.fn().mockResolvedValue({ ok: true, path: 'C:\\VMs\\FedoraBox\\guest-logs' }),
    onScriptLine:       vi.fn().mockReturnValue(() => {}),
    onScriptDone:       vi.fn().mockReturnValue(() => {}),
    pickFolder:         vi.fn().mockResolvedValue({ folderPath: null }),
    runShareFolder:     vi.fn().mockResolvedValue({ ok: true }),
    runShareLogs:       vi.fn().mockResolvedValue({ ok: true }),
    saveVmCredentials:  vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as typeof window.electronAPI
})

describe('VmEditPage', () => {

  // ── Header (renders immediately, no async wait needed) ────────────────────

  it('shows the VM name as a heading', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'FedoraBox', level: 1 })).toBeInTheDocument()
    await act(async () => {})
  })

  it('shows the Stopped badge for a stopped VM', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    expect(screen.getByText('Stopped')).toBeInTheDocument()
    await act(async () => {})
  })

  it('shows the Running badge for a running VM', async () => {
    render(<VmEditPage vm={RUNNING_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    expect(screen.getByText('Running')).toBeInTheDocument()
    await act(async () => {})
  })

  it('calls onBack when the Back button is clicked', async () => {
    const onBack = vi.fn()
    render(<VmEditPage vm={STOPPED_VM} onBack={onBack} onScriptRunning={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
    await act(async () => {})
  })

  // ── Sections (rendered after getVmInfo resolves) ──────────────────────────

  it('shows the "Shared folders" section with the Share button', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Shared folders')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    })
  })

  it('shows the "Log sync" section with the Sync button', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Log sync')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument()
    })
  })

  // ── Navigation ────────────────────────────────────────────────────────────

  it('navigates to ShareFolderPage when "Share" is clicked', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await act(async () => {})

    expect(screen.getByPlaceholderText('/mnt/shared')).toBeInTheDocument()
  })

  it('returns to the detail view when Back is clicked in ShareFolderPage', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await act(async () => {})

    const backButtons = screen.getAllByRole('button', { name: /back/i })
    fireEvent.click(backButtons[0])
    await act(async () => {})

    expect(screen.getByText('Shared folders')).toBeInTheDocument()
    expect(screen.getByText('Log sync')).toBeInTheDocument()
  })

  it('navigates to ShareLogsPage when "Sync" is clicked', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Sync' }))
    await act(async () => {})

    expect(screen.getByRole('heading', { name: /log sync/i })).toBeInTheDocument()
  })

  it('returns to the detail view when Back is clicked in ShareLogsPage', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Sync' }))
    await act(async () => {})

    const backButtons = screen.getAllByRole('button', { name: /back/i })
    fireEvent.click(backButtons[0])
    await act(async () => {})

    expect(screen.getByText('Log sync')).toBeInTheDocument()
    expect(screen.getByText('Shared folders')).toBeInTheDocument()
  })

  // ── Detail info ───────────────────────────────────────────────────────────

  it('shows OS type from getVmInfo', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Fedora_64')).toBeInTheDocument())
  })

  it('shows RAM in MB from getVmInfo', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('4,096 MB')).toBeInTheDocument())
  })

  it('shows disk capacity rounded to GB with type', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('50 GB (dynamic)')).toBeInTheDocument())
  })

  it('shows "Start VM to check" for GA version when VM is stopped', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Start VM to check')).toBeInTheDocument())
  })

  it('shows "None configured" when no shared folders exist', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('None configured')).toBeInTheDocument())
  })

  it('shows the log sync destination path', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByText('C:\\VMs\\FedoraBox\\guest-logs')).toBeInTheDocument()
    )
  })

  it('shows host folder and VM mount point when folders are configured', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true,
      info: {
        ...SAMPLE_INFO.info,
        sharedFolders: [{ name: 'vbox-share', hostPath: 'C:\\Work\\shared', mountPoint: '/home/user/shared', existsOnHost: true }],
      },
    })
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('C:\\Work\\shared')).toBeInTheDocument()
      expect(screen.getByText('/home/user/shared')).toBeInTheDocument()
    })
  })

  it('shows an error banner when getVmInfo fails', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({ ok: false, error: 'VM not found' })
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('VM not found')).toBeInTheDocument())
  })

  it('shows VRAM in MB from getVmInfo', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('128 MB')).toBeInTheDocument())
  })

  it('shows the NIC type formatted for display (nat → NAT)', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('NAT')).toBeInTheDocument())
  })

  it('shows the MAC address formatted with colons', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('08:00:27:AA:BB:CC')).toBeInTheDocument())
  })

  it('shows the actual GA version when VM is running with Guest Additions', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true,
      info: {
        ...SAMPLE_INFO.info,
        state: 'running',
        gaVersion: '7.0.14',
      },
    })
    render(<VmEditPage vm={RUNNING_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('7.0.14')).toBeInTheDocument())
  })

  it('shows "Not installed" when VM is running but Guest Additions are absent', async () => {
    window.electronAPI.getVmInfo = vi.fn().mockResolvedValue({
      ok: true,
      info: {
        ...SAMPLE_INFO.info,
        state: 'running',
        gaVersion: null,
      },
    })
    render(<VmEditPage vm={RUNNING_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Not installed')).toBeInTheDocument())
  })
})
