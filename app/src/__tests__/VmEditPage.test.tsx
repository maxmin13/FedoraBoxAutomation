import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
