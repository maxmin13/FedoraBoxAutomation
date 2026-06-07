import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NavBar from '../components/NavBar'

describe('NavBar', () => {
  const onNavigate = vi.fn()

  beforeEach(() => {
    onNavigate.mockReset()
  })

  it('shows all nav items: Requirements, My VMs, Create VM, Console, Docs', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} />)
    expect(screen.getByRole('button', { name: 'Requirements' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My VMs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create VM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Console' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Docs' })).toBeInTheDocument()
  })

  it('calls onNavigate with the correct page name when a button is clicked', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Requirements' }))
    expect(onNavigate).toHaveBeenCalledWith('setup')
  })

  it('disables non-Console, non-Docs nav buttons when scriptRunning is true', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} scriptRunning={true} />)
    fireEvent.click(screen.getByRole('button', { name: 'My VMs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Requirements' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create VM' }))
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('keeps Console accessible when scriptRunning is true', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} scriptRunning={true} />)
    expect(screen.getByRole('button', { name: 'Console' })).not.toBeDisabled()
  })

  it('keeps Docs accessible when scriptRunning is true', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} scriptRunning={true} />)
    fireEvent.click(screen.getByRole('button', { name: 'Docs' }))
    expect(onNavigate).toHaveBeenCalledWith('docs')
  })

  it('keeps the script-running page button accessible during a script run', () => {
    render(<NavBar currentPage="create-vm" onNavigate={onNavigate} scriptRunning={true} scriptPage="create-vm" />)
    fireEvent.click(screen.getByRole('button', { name: 'Create VM' }))
    expect(onNavigate).toHaveBeenCalledWith('create-vm')
    onNavigate.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Requirements' }))
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('does not disable nav buttons when scriptRunning is false', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} scriptRunning={false} />)
    expect(screen.getByRole('button', { name: 'My VMs' })).not.toBeDisabled()
  })

  it('calls onNavigate with "logs" when Console is clicked', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Console' }))
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
