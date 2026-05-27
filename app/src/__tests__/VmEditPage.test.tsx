import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import VmEditPage from '../pages/VmEditPage'
import type { Vm } from '../electron.d'

const VM: Vm = { name: 'FedoraBox', uuid: 'uuid-1', running: false }

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

beforeEach(() => {
  window.electronAPI = {
    getVmInfo:         vi.fn().mockResolvedValue({ ok: true, info: BASE_INFO }),
    loadVmCredentials: vi.fn().mockResolvedValue({ ok: false }),
  } as unknown as typeof window.electronAPI
})

// ── Installed tools section ───────────────────────────────────────────────────

describe('VmEditPage — Installed tools section', () => {
  it('shows "Nothing installed yet" when provisioned list is empty', async () => {
    render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/INSTALLED TOOLS/i)).toBeInTheDocument())
    expect(screen.getByText('Nothing installed yet')).toBeInTheDocument()
  })

  it('renders tool labels from the provisioned list', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true,
      user: 'root', pass: 'secret', loginUser: 'fedora',
      provisioned: [
        { scriptRelPath: '__baseSetup__',                 label: 'Base Setup', at: '2026-05-26T14:00:00.000Z' },
        { scriptRelPath: 'tools/databases/postgresql.sh', label: 'PostgreSQL', at: '2026-05-26T15:10:00.000Z' },
      ],
    })
    render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Base Setup')).toBeInTheDocument())
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument()
  })

  it('sorts provisioned tools newest-first', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({
      ok: true,
      provisioned: [
        { scriptRelPath: '__baseSetup__',           label: 'Base Setup',  at: '2026-05-26T14:00:00.000Z' },
        { scriptRelPath: 'tools/ai/claude-code.sh', label: 'Claude Code', at: '2026-05-27T10:30:00.000Z' },
      ],
    })
    render(<VmEditPage vm={VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    // Claude Code (2026-05-27) must appear before Base Setup (2026-05-26)
    await waitFor(() => expect(screen.getByText('Claude Code')).toBeInTheDocument())
    const items = screen.getAllByText(/Base Setup|Claude Code/)
    expect(items[0].textContent).toBe('Claude Code')
    expect(items[1].textContent).toBe('Base Setup')
  })
})
