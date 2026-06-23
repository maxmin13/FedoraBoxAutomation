import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NavBar from '../components/NavBar'

describe('NavBar', () => {
  const onNavigate = vi.fn()

  beforeEach(() => {
    onNavigate.mockReset()
    window.electronAPI = { logUiAction: vi.fn() } as unknown as typeof window.electronAPI
  })

  it('shows all nav items: Requirements, My VMs, Create VM, Activity, Docs', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} />)
    expect(screen.getByRole('button', { name: 'Requirements' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My VMs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create VM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Docs' })).toBeInTheDocument()
  })

  it('calls onNavigate with the correct page name when a button is clicked', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Requirements' }))
    expect(onNavigate).toHaveBeenCalledWith('setup')
  })

  it('calls onNavigate with "logs" when Activity is clicked', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))
    expect(onNavigate).toHaveBeenCalledWith('logs')
  })

  it('calls onNavigate with "create-vm" when Create VM is clicked', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create VM' }))
    expect(onNavigate).toHaveBeenCalledWith('create-vm')
  })

  it('applies active styling to the current page button', () => {
    render(<NavBar currentPage="setup" onNavigate={onNavigate} />)
    const setupBtn = screen.getByRole('button', { name: 'Requirements' })
    expect(setupBtn.className).toMatch(/bg-zinc-600/)
  })

  it('does not apply active styling to inactive page buttons', () => {
    render(<NavBar currentPage="setup" onNavigate={onNavigate} />)
    const landingBtn = screen.getByRole('button', { name: 'My VMs' })
    expect(landingBtn.className).not.toMatch(/bg-zinc-600/)
  })
})
