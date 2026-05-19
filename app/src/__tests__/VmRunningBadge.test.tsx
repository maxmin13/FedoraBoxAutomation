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
})
