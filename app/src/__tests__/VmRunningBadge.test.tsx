import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VmRunningBadge from '../components/VmRunningBadge'

describe('VmRunningBadge', () => {
  it('shows "Running" when running is true', () => {
    render(<VmRunningBadge running={true} />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('shows "Stopped" when running is false', () => {
    render(<VmRunningBadge running={false} />)
    expect(screen.getByText('Stopped')).toBeInTheDocument()
  })

  it('applies green styling for the running badge', () => {
    render(<VmRunningBadge running={true} />)
    expect(screen.getByText('Running').className).toMatch(/green/)
  })

  it('applies muted styling for the stopped badge', () => {
    render(<VmRunningBadge running={false} />)
    expect(screen.getByText('Stopped').className).toMatch(/zinc/)
  })

  it('shows "Starting..." when starting is true', () => {
    render(<VmRunningBadge running={false} starting={true} />)
    expect(screen.getByText('Starting...')).toBeInTheDocument()
  })

  it('applies blue styling for the starting badge', () => {
    render(<VmRunningBadge running={false} starting={true} />)
    expect(screen.getByText('Starting...').className).toMatch(/blue/)
  })

  it('starting takes priority over stopping when both are true', () => {
    render(<VmRunningBadge running={false} starting={true} stopping={true} />)
    expect(screen.getByText('Starting...')).toBeInTheDocument()
  })

  it('shows "Stopping..." when stopping is true', () => {
    render(<VmRunningBadge running={true} stopping={true} />)
    expect(screen.getByText('Stopping...')).toBeInTheDocument()
  })

  it('applies amber styling for the stopping badge', () => {
    render(<VmRunningBadge running={true} stopping={true} />)
    expect(screen.getByText('Stopping...').className).toMatch(/amber/)
  })

  it('shows "Stopping..." even when running is false (stop already completing)', () => {
    render(<VmRunningBadge running={false} stopping={true} />)
    expect(screen.getByText('Stopping...')).toBeInTheDocument()
  })
})
