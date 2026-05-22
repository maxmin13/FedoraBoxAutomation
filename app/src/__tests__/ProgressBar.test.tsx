import { describe, it, expect } from 'vitest'
import { render, container } from '@testing-library/react'
import ProgressBar from '../components/ProgressBar'

describe('ProgressBar', () => {
  it('renders without crashing', () => {
    const { container } = render(<ProgressBar />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('contains an animated inner bar element', () => {
    const { container } = render(<ProgressBar />)
    const inner = container.querySelector('.animate-slide')
    expect(inner).toBeInTheDocument()
  })

  it('renders the outer track element', () => {
    const { container } = render(<ProgressBar />)
    const outer = container.firstChild as HTMLElement
    expect(outer.tagName).toBe('DIV')
    expect(outer.classList.contains('bg-zinc-700')).toBe(true)
  })
})
