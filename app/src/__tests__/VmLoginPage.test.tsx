import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import VmLoginPage from '../pages/VmLoginPage'
import type { Vm } from '../electron.d'

const VMS: Vm[] = [
  { name: 'FedoraBox', uuid: 'uuid-1', running: true },
  { name: 'DevBox',    uuid: 'uuid-2', running: false },
]

const STATE_ENTRIES = {
  FedoraBox: { user: 'root', pass: 'secret', loginUser: 'fedora' },
}

beforeEach(() => {
  window.electronAPI = {
    listVms:              vi.fn().mockResolvedValue({ ok: true, vms: VMS }),
    loadAllVmCredentials:  vi.fn().mockResolvedValue({ ok: true, entries: STATE_ENTRIES }),
    loadVmCredentials:     vi.fn().mockResolvedValue({ ok: false }),
    checkVmCredentials:    vi.fn().mockResolvedValue({ ok: true }),
    checkVmUser:           vi.fn().mockResolvedValue({ ok: true }),
    saveVmCredentials:     vi.fn().mockResolvedValue({ ok: true }),
    logUiAction:           vi.fn(),
  } as unknown as typeof window.electronAPI
})

// ── Standalone mode (nav-bar usage, VM picked from a dropdown) ────────────────

describe('VmLoginPage — standalone mode', () => {
  it('shows a loading state before the VM list resolves', () => {
    window.electronAPI.listVms = vi.fn().mockReturnValue(new Promise(() => {}))
    render(<VmLoginPage onNavigate={vi.fn()} />)
    expect(screen.getByText('Loading VMs...')).toBeInTheDocument()
  })

  it('shows both VirtualBox VMs and state-only VMs in the dropdown once loaded', async () => {
    window.electronAPI.loadAllVmCredentials = vi.fn().mockResolvedValue({
      ok: true,
      entries: { ...STATE_ENTRIES, RemoteBox: { user: 'root', pass: 'x', loginUser: 'y' } },
    })
    render(<VmLoginPage onNavigate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    expect(screen.getByRole('option', { name: 'FedoraBox' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'DevBox' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'RemoteBox' })).toBeInTheDocument()
  })

  it('shows a message when no VMs are found', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [] })
    window.electronAPI.loadAllVmCredentials = vi.fn().mockResolvedValue({ ok: true, entries: {} })
    render(<VmLoginPage onNavigate={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('No VMs found. Create one first.')).toBeInTheDocument())
  })

  it('auto-selects the VM when exactly one is found', async () => {
    window.electronAPI.listVms = vi.fn().mockResolvedValue({ ok: true, vms: [VMS[0]] })
    render(<VmLoginPage onNavigate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue('FedoraBox'))
  })

  it('fills in saved credentials when a VM with saved state is selected', async () => {
    render(<VmLoginPage onNavigate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'FedoraBox' } })
    expect(screen.getByPlaceholderText('root')).toHaveValue('root')
    expect(screen.getByPlaceholderText('••••••••')).toHaveValue('secret')
    expect(screen.getByPlaceholderText('your desktop username')).toHaveValue('fedora')
  })

  it('resets fields to defaults when a VM without saved state is selected', async () => {
    render(<VmLoginPage onNavigate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'FedoraBox' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'DevBox' } })
    expect(screen.getByPlaceholderText('root')).toHaveValue('root')
    expect(screen.getByPlaceholderText('••••••••')).toHaveValue('')
    expect(screen.getByPlaceholderText('your desktop username')).toHaveValue('')
  })

  it('disables Next until VM, root user, root password and VM user are all filled', async () => {
    render(<VmLoginPage onNavigate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'FedoraBox' } })
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
  })

  it('checks credentials, checks the VM user, saves, and navigates back to landing on success', async () => {
    const onNavigate = vi.fn()
    render(<VmLoginPage onNavigate={onNavigate} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'FedoraBox' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('landing'))
    expect(window.electronAPI.checkVmCredentials).toHaveBeenCalledWith('FedoraBox', 'root', 'secret')
    expect(window.electronAPI.checkVmUser).toHaveBeenCalledWith('FedoraBox', 'root', 'secret', 'fedora')
    expect(window.electronAPI.saveVmCredentials).toHaveBeenCalledWith('FedoraBox', 'root', 'secret', 'fedora')
  })

  it('shows an error and does not save when the root credentials are invalid', async () => {
    window.electronAPI.checkVmCredentials = vi.fn().mockResolvedValue({ ok: false })
    const onNavigate = vi.fn()
    render(<VmLoginPage onNavigate={onNavigate} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'FedoraBox' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(screen.getByText(/Invalid credentials or the VM is not reachable/)).toBeInTheDocument())
    expect(window.electronAPI.saveVmCredentials).not.toHaveBeenCalled()
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('shows an error naming the VM user when it does not exist on the guest', async () => {
    window.electronAPI.checkVmUser = vi.fn().mockResolvedValue({ ok: false })
    render(<VmLoginPage onNavigate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'FedoraBox' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(screen.getByText('VM username "fedora" does not exist on this VM.')).toBeInTheDocument())
    expect(window.electronAPI.saveVmCredentials).not.toHaveBeenCalled()
  })

  it('toggles the password field between hidden and visible', async () => {
    render(<VmLoginPage onNavigate={vi.fn()} />)
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument())
    const passInput = screen.getByPlaceholderText('••••••••')
    expect(passInput).toHaveAttribute('type', 'password')
    fireEvent.click(passInput.parentElement!.querySelector('button')!)
    expect(passInput).toHaveAttribute('type', 'text')
  })

  it('renders a Back button and calls onBack when clicked', async () => {
    const onBack = vi.fn()
    render(<VmLoginPage onNavigate={vi.fn()} onBack={onBack} />)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(onBack).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument()) // flush the pending VM-list load
  })
})

// ── Inline mode (embedded before Provision/Detail with a fixed VM) ────────────

describe('VmLoginPage — inline mode', () => {
  it('shows the VM name as static text instead of a dropdown', () => {
    render(<VmLoginPage initialVmName="FedoraBox" onNext={vi.fn()} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('FedoraBox')).toBeInTheDocument()
  })

  it('pre-fills fields from loadVmCredentials for the fixed VM', async () => {
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({ ok: true, user: 'root', pass: 'secret', loginUser: 'fedora' })
    render(<VmLoginPage initialVmName="FedoraBox" onNext={vi.fn()} />)
    await waitFor(() => expect(screen.getByPlaceholderText('••••••••')).toHaveValue('secret'))
    expect(window.electronAPI.loadVmCredentials).toHaveBeenCalledWith('FedoraBox')
  })

  it('calls onNext instead of onNavigate on success', async () => {
    const onNext = vi.fn()
    window.electronAPI.loadVmCredentials = vi.fn().mockResolvedValue({ ok: true, user: 'root', pass: 'secret', loginUser: 'fedora' })
    render(<VmLoginPage initialVmName="FedoraBox" onNext={onNext} />)
    await waitFor(() => expect(screen.getByPlaceholderText('••••••••')).toHaveValue('secret'))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(onNext).toHaveBeenCalledOnce())
  })
})
