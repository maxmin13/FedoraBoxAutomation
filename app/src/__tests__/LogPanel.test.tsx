import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LogPanel from '../components/LogPanel'
import type { ScriptLine } from '../electron.d'

const LINES: ScriptLine[] = [
  { text: 'stdout message', source: 'stdout' },
  { text: 'stderr message', source: 'stderr' },
]

describe('LogPanel', () => {
  it('shows "Show" when collapsed', () => {
    render(<LogPanel lines={[]} showLog={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Show')).toBeInTheDocument()
  })

  it('shows "Hide" when expanded', () => {
    render(<LogPanel lines={[]} showLog={true} onToggle={vi.fn()} />)
    expect(screen.getByText('Hide')).toBeInTheDocument()
  })

  it('does not render log lines when collapsed', () => {
    render(<LogPanel lines={LINES} showLog={false} onToggle={vi.fn()} />)
    expect(screen.queryByText('stdout message')).not.toBeInTheDocument()
    expect(screen.queryByText('stderr message')).not.toBeInTheDocument()
  })

  it('renders all log lines when expanded', () => {
    render(<LogPanel lines={LINES} showLog={true} onToggle={vi.fn()} />)
    expect(screen.getByText('stdout message')).toBeInTheDocument()
    expect(screen.getByText('stderr message')).toBeInTheDocument()
  })

  it('uses "Script output" as the default title', () => {
    render(<LogPanel lines={[]} showLog={false} onToggle={vi.fn()} />)
    expect(screen.getByText(/script output/i)).toBeInTheDocument()
  })

  it('uses a custom title when the title prop is provided', () => {
    render(<LogPanel lines={[]} showLog={false} onToggle={vi.fn()} title="Build log" />)
    expect(screen.getByText('Build log')).toBeInTheDocument()
  })

  it('calls onToggle when the button is clicked', () => {
    const onToggle = vi.fn()
    render(<LogPanel lines={[]} showLog={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('renders stderr lines with a different colour class than stdout', () => {
    const { container } = render(<LogPanel lines={LINES} showLog={true} onToggle={vi.fn()} />)
    const stdoutEl = screen.getByText('stdout message')
    const stderrEl = screen.getByText('stderr message')
    expect(stdoutEl.className).not.toEqual(stderrEl.className)
    expect(stderrEl.className).toMatch(/red/)
  })
})
