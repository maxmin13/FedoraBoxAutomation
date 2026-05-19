import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import VmEditPage from '../pages/VmEditPage'

const STOPPED_VM = { name: 'FedoraBox', uuid: 'uuid-1', running: false }
const RUNNING_VM = { name: 'FedoraBox', uuid: 'uuid-1', running: true }

beforeEach(() => {
  window.electronAPI = {
    loadVmCredentials: vi.fn().mockResolvedValue({ ok: false }),
    checkVmReady:      vi.fn().mockResolvedValue({ ok: true, running: false, guestAdditions: false }),
    onScriptLine:      vi.fn().mockReturnValue(() => {}),
    onScriptDone:      vi.fn().mockReturnValue(() => {}),
    pickFolder:        vi.fn().mockResolvedValue({ folderPath: null }),
    runShareFolder:    vi.fn().mockResolvedValue({ ok: true }),
    saveVmCredentials: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as typeof window.electronAPI
})

describe('VmEditPage', () => {
  it('shows the VM name as a heading', () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'FedoraBox', level: 1 })).toBeInTheDocument()
  })

  it('shows the Stopped badge for a stopped VM', () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    expect(screen.getByText('Stopped')).toBeInTheDocument()
  })

  it('shows the Running badge for a running VM', () => {
    render(<VmEditPage vm={RUNNING_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('shows the "Shared folder" section with its button', () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    expect(screen.getByText('Shared folder')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set up shared folder' })).toBeInTheDocument()
  })

  it('shows the "Log sync" section', () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    expect(screen.getByText('Log sync')).toBeInTheDocument()
  })

  it('navigates to ShareFolderPage when "Set up shared folder" is clicked', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Set up shared folder' }))
    await act(async () => {})
    // ShareFolderPage renders a field that only exists there
    expect(screen.getByPlaceholderText('/mnt/shared')).toBeInTheDocument()
  })

  it('returns to the edit view when Back is clicked in ShareFolderPage', async () => {
    render(<VmEditPage vm={STOPPED_VM} onBack={vi.fn()} onScriptRunning={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Set up shared folder' }))
    await act(async () => {})
    // Click the Back button that ShareFolderPage renders in the header
    const backButtons = screen.getAllByRole('button', { name: /back/i })
    fireEvent.click(backButtons[0])
    await act(async () => {})
    expect(screen.getByText('Shared folder')).toBeInTheDocument()
    expect(screen.getByText('Log sync')).toBeInTheDocument()
  })

  it('calls onBack when the Back button on the edit page is clicked', () => {
    const onBack = vi.fn()
    render(<VmEditPage vm={STOPPED_VM} onBack={onBack} onScriptRunning={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalled()
  })
})
