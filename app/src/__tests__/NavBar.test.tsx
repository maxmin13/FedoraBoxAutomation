import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import NavBar from '../components/NavBar'

describe('NavBar', () => {
  const onNavigate = vi.fn()

  beforeEach(() => {
    onNavigate.mockReset()
  })

  it('shows all core nav items: My VMs, Setup, Create VM, Console', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} isDev={false} />)
    expect(screen.getByRole('button', { name: 'My VMs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Setup' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create VM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Console' })).toBeInTheDocument()
  })

  it('hides the Docs link in production (isDev: false)', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} isDev={false} />)
    expect(screen.queryByRole('button', { name: 'Docs' })).not.toBeInTheDocument()
  })

  it('shows the Docs link in development mode (isDev: true)', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} isDev={true} />)
    expect(screen.getByRole('button', { name: 'Docs' })).toBeInTheDocument()
  })

  it('calls onNavigate with the correct page name when a button is clicked', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} isDev={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }))
    expect(onNavigate).toHaveBeenCalledWith('setup')
  })

  it('disables non-Console nav buttons when scriptRunning is true', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} isDev={false} scriptRunning={true} />)
    expect(screen.getByRole('button', { name: 'My VMs' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Setup' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Create VM' })).toBeDisabled()
  })

  it('keeps Console accessible when scriptRunning is true', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} isDev={false} scriptRunning={true} />)
    expect(screen.getByRole('button', { name: 'Console' })).not.toBeDisabled()
  })

  it('keeps the script-running page button accessible during a script run', () => {
    render(<NavBar currentPage="create-vm" onNavigate={onNavigate} isDev={false} scriptRunning={true} scriptPage="create-vm" />)
    expect(screen.getByRole('button', { name: 'Create VM' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Setup' })).toBeDisabled()
  })

  it('does not disable nav buttons when scriptRunning is false', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} isDev={false} scriptRunning={false} />)
    expect(screen.getByRole('button', { name: 'My VMs' })).not.toBeDisabled()
  })

  it('calls onNavigate with "logs" when Console is clicked', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} isDev={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Console' }))
    expect(onNavigate).toHaveBeenCalledWith('logs')
  })

  it('calls onNavigate with "create-vm" when Create VM is clicked', () => {
    render(<NavBar currentPage="landing" onNavigate={onNavigate} isDev={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create VM' }))
    expect(onNavigate).toHaveBeenCalledWith('create-vm')
  })

  it('applies active styling to the current page button', () => {
    render(<NavBar currentPage="setup" onNavigate={onNavigate} isDev={false} />)
    const setupBtn = screen.getByRole('button', { name: 'Setup' })
    expect(setupBtn.className).toMatch(/bg-zinc-600/)
  })

  it('does not apply active styling to inactive page buttons', () => {
    render(<NavBar currentPage="setup" onNavigate={onNavigate} isDev={false} />)
    const landingBtn = screen.getByRole('button', { name: 'My VMs' })
    expect(landingBtn.className).not.toMatch(/bg-zinc-600/)
  })
})
