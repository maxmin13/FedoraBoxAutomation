import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import DocsPage from '../pages/DocsPage'

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}))
vi.mock('remark-gfm', () => ({ default: {} }))

beforeEach(() => {
  window.electronAPI = {
    readDoc:     vi.fn().mockResolvedValue({ ok: true, content: '# Hello\nSome content.' }),
    logUiAction: vi.fn(),
  } as unknown as typeof window.electronAPI
})

describe('DocsPage', () => {

  describe('sidebar', () => {
    it('calls readDoc with POST-INSTALL.md on mount', async () => {
      render(<DocsPage />)
      await act(async () => {})
      expect(window.electronAPI.readDoc).toHaveBeenCalledWith('POST-INSTALL.md')
    })
  })

  describe('loading state', () => {
    it('shows "Loading..." while readDoc is pending', async () => {
      window.electronAPI.readDoc = vi.fn().mockReturnValue(new Promise(() => {}))
      render(<DocsPage />)
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })
  })

  describe('content state', () => {
    it('renders the markdown content after readDoc resolves', async () => {
      render(<DocsPage />)
      await waitFor(() => {
        expect(screen.getByTestId('markdown')).toBeInTheDocument()
      })
    })

    it('does not show "Loading..." after readDoc resolves', async () => {
      render(<DocsPage />)
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
    })
  })

  describe('error state', () => {
    it('shows an error message when readDoc returns ok: false', async () => {
      window.electronAPI.readDoc = vi.fn().mockResolvedValue({ ok: false, error: 'File not found' })
      render(<DocsPage />)
      await waitFor(() => {
        expect(screen.getByText('File not found')).toBeInTheDocument()
      })
    })

    it('shows a fallback message when error field is absent', async () => {
      window.electronAPI.readDoc = vi.fn().mockResolvedValue({ ok: false })
      render(<DocsPage />)
      await waitFor(() => {
        expect(screen.getByText('Could not load document')).toBeInTheDocument()
      })
    })
  })
})
