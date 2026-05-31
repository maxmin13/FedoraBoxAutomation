import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import LogsPage from '../pages/LogsPage'

const SAMPLE_CONTENT = '2026-05-16 10:00:00 [info] [ipc] recv list-vms\n2026-05-16 10:00:01 [info] [ipc] reply list-vms'

beforeEach(() => {
  window.electronAPI = {
    readLog:    vi.fn().mockResolvedValue({ ok: true, content: SAMPLE_CONTENT }),
    openLogDir: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as typeof window.electronAPI
})

describe('LogsPage', () => {

  describe('sidebar', () => {
    it('shows both log file buttons', async () => {
      render(<LogsPage isActive={true} />)
      await act(async () => {})
      expect(screen.getByText('GUI log')).toBeInTheDocument()
      expect(screen.getByText('Host log')).toBeInTheDocument()
    })

    it('shows a Refresh button once loading completes', async () => {
      render(<LogsPage isActive={true} />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
      })
    })

    it('selects host.log by default', async () => {
      render(<LogsPage isActive={true} />)
      await act(async () => {})
      expect(window.electronAPI.readLog).toHaveBeenCalledWith('host.log')
    })
  })

  describe('log content', () => {
    it('renders log content after loading', async () => {
      render(<LogsPage isActive={true} />)
      // Use regex — getByText normalizes whitespace and won't match multi-line pre content exactly
      await waitFor(() => {
        expect(screen.getByText(/recv list-vms/)).toBeInTheDocument()
      })
    })

    it('shows "Log file is empty." when content is an empty string', async () => {
      window.electronAPI.readLog = vi.fn().mockResolvedValue({ ok: true, content: '' })
      render(<LogsPage isActive={true} />)
      await waitFor(() => {
        expect(screen.getByText('Log file is empty.')).toBeInTheDocument()
      })
    })

    it('shows an error message when readLog returns ok: false', async () => {
      window.electronAPI.readLog = vi.fn().mockResolvedValue({ ok: false, error: 'Permission denied' })
      render(<LogsPage isActive={true} />)
      await waitFor(() => {
        expect(screen.getByText('Permission denied')).toBeInTheDocument()
      })
    })
  })

  describe('log switching', () => {
    it('calls readLog with "gui.log" when GUI log is clicked', async () => {
      render(<LogsPage isActive={true} />)
      await waitFor(() => expect(window.electronAPI.readLog).toHaveBeenCalledWith('host.log'))

      fireEvent.click(screen.getByText('GUI log'))
      await act(async () => {})

      expect(window.electronAPI.readLog).toHaveBeenCalledWith('gui.log')
    })

    it('reloads the current log when Refresh is clicked', async () => {
      render(<LogsPage isActive={true} />)
      await waitFor(() => expect(window.electronAPI.readLog).toHaveBeenCalledTimes(1))

      // Sync is on by default which disables the Refresh button; turn it off first
      fireEvent.click(screen.getByRole('checkbox'))

      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

      await waitFor(() => expect(window.electronAPI.readLog).toHaveBeenCalledTimes(2))
      expect(window.electronAPI.readLog).toHaveBeenLastCalledWith('host.log')
    })

    it('resets to host.log when navigated back after switching to GUI log', async () => {
      const { rerender } = render(<LogsPage isActive={true} />)
      await waitFor(() => expect(window.electronAPI.readLog).toHaveBeenCalledWith('host.log'))
      vi.clearAllMocks()

      fireEvent.click(screen.getByText('GUI log'))
      await waitFor(() => expect(window.electronAPI.readLog).toHaveBeenCalledWith('gui.log'))
      vi.clearAllMocks()

      // Simulate navigating away and back
      rerender(<LogsPage isActive={false} />)
      rerender(<LogsPage isActive={true} />)

      await waitFor(() => expect(window.electronAPI.readLog).toHaveBeenCalledWith('host.log'))
    })
  })

  describe('open folder buttons', () => {
    it('shows the App logs and VirtualBox VMs folder buttons', async () => {
      render(<LogsPage isActive={true} />)
      await act(async () => {})
      expect(screen.getByRole('button', { name: /app logs/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /virtualbox vms/i })).toBeInTheDocument()
    })

    it('calls openLogDir("app") when App logs is clicked', async () => {
      render(<LogsPage isActive={true} />)
      await act(async () => {})
      fireEvent.click(screen.getByRole('button', { name: /app logs/i }))
      expect(window.electronAPI.openLogDir).toHaveBeenCalledWith('app')
    })

    it('calls openLogDir("vbox") when VirtualBox VMs is clicked', async () => {
      render(<LogsPage isActive={true} />)
      await act(async () => {})
      fireEvent.click(screen.getByRole('button', { name: /virtualbox vms/i }))
      expect(window.electronAPI.openLogDir).toHaveBeenCalledWith('vbox')
    })
  })

  describe('loading state', () => {
    it('disables the Refresh button while loading', async () => {
      window.electronAPI.readLog = vi.fn().mockReturnValue(new Promise(() => {}))
      render(<LogsPage isActive={true} />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled()
      })
    })
  })
})
