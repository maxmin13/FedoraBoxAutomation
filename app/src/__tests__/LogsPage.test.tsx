import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
    it('shows both log file buttons', () => {
      render(<LogsPage />)
      expect(screen.getByText('GUI log')).toBeInTheDocument()
      expect(screen.getByText('Host log')).toBeInTheDocument()
    })

    it('shows a Refresh button once loading completes', async () => {
      render(<LogsPage />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
      })
    })

    it('selects gui.log by default', () => {
      render(<LogsPage />)
      // readLog should be called with 'gui.log' on mount
      expect(window.electronAPI.readLog).toHaveBeenCalledWith('gui.log')
    })
  })

  describe('log content', () => {
    it('renders log content after loading', async () => {
      render(<LogsPage />)
      // Use regex — getByText normalizes whitespace and won't match multi-line pre content exactly
      await waitFor(() => {
        expect(screen.getByText(/recv list-vms/)).toBeInTheDocument()
      })
    })

    it('shows "Log file is empty." when content is an empty string', async () => {
      window.electronAPI.readLog = vi.fn().mockResolvedValue({ ok: true, content: '' })
      render(<LogsPage />)
      await waitFor(() => {
        expect(screen.getByText('Log file is empty.')).toBeInTheDocument()
      })
    })

    it('shows an error message when readLog returns ok: false', async () => {
      window.electronAPI.readLog = vi.fn().mockResolvedValue({ ok: false, error: 'Permission denied' })
      render(<LogsPage />)
      await waitFor(() => {
        expect(screen.getByText('Permission denied')).toBeInTheDocument()
      })
    })
  })

  describe('log switching', () => {
    it('calls readLog with "host.log" when Host log is clicked', async () => {
      render(<LogsPage />)
      await waitFor(() => expect(window.electronAPI.readLog).toHaveBeenCalledWith('gui.log'))

      fireEvent.click(screen.getByText('Host log'))

      expect(window.electronAPI.readLog).toHaveBeenCalledWith('host.log')
    })

    it('reloads the current log when Refresh is clicked', async () => {
      render(<LogsPage />)
      await waitFor(() => expect(window.electronAPI.readLog).toHaveBeenCalledTimes(1))

      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

      await waitFor(() => expect(window.electronAPI.readLog).toHaveBeenCalledTimes(2))
      expect(window.electronAPI.readLog).toHaveBeenLastCalledWith('gui.log')
    })
  })

  describe('open folder buttons', () => {
    it('shows the App logs and VirtualBox VMs folder buttons', () => {
      render(<LogsPage />)
      expect(screen.getByRole('button', { name: /app logs/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /virtualbox vms/i })).toBeInTheDocument()
    })

    it('calls openLogDir("app") when App logs is clicked', () => {
      render(<LogsPage />)
      fireEvent.click(screen.getByRole('button', { name: /app logs/i }))
      expect(window.electronAPI.openLogDir).toHaveBeenCalledWith('app')
    })

    it('calls openLogDir("vbox") when VirtualBox VMs is clicked', () => {
      render(<LogsPage />)
      fireEvent.click(screen.getByRole('button', { name: /virtualbox vms/i }))
      expect(window.electronAPI.openLogDir).toHaveBeenCalledWith('vbox')
    })
  })

  describe('loading state', () => {
    it('disables the Refresh button while loading', async () => {
      window.electronAPI.readLog = vi.fn().mockReturnValue(new Promise(() => {}))
      render(<LogsPage />)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled()
      })
    })
  })
})
