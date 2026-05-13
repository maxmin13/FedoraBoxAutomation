import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import SetupPage from '../pages/SetupPage'
import type { CheckResult } from '../electron.d'

const SAMPLE_CHECKS: CheckResult[] = [
  { id: 'os',       label: 'Operating System', status: 'pass', detail: 'Windows 11 (64-bit)' },
  { id: 'ram',      label: 'RAM',              status: 'pass', detail: '16 GB total' },
  { id: 'vboxinst', label: 'VirtualBox',       status: 'fail', detail: 'Not installed.' },
]

// Provide a full window.electronAPI mock before each test.
// Individual tests can override specific methods via vi.fn().mockResolvedValue(...)
beforeEach(() => {
  window.electronAPI = {
    runSanityChecks:  vi.fn().mockResolvedValue({ ok: true, checks: SAMPLE_CHECKS }),
    installVirtualBox: vi.fn().mockResolvedValue({ ok: true }),
    listVms:          vi.fn().mockResolvedValue({ ok: true, vms: [] }),
    readDoc:          vi.fn().mockResolvedValue({ ok: true, content: '' }),
    onScriptLine:     vi.fn().mockReturnValue(() => {}),
    onScriptDone:     vi.fn().mockReturnValue(() => {}),
  }
})

describe('SetupPage', () => {

  describe('idle state', () => {
    it('shows the Run Analysis button', () => {
      render(<SetupPage />)
      expect(screen.getByRole('button', { name: 'Run Analysis' })).toBeInTheDocument()
    })

    it('Run Analysis button is enabled initially', () => {
      render(<SetupPage />)
      expect(screen.getByRole('button', { name: 'Run Analysis' })).not.toBeDisabled()
    })

    it('shows the idle prompt before any analysis has run', () => {
      render(<SetupPage />)
      expect(screen.getByText(/click "run analysis"/i)).toBeInTheDocument()
    })
  })

  describe('running state', () => {
    it('disables the button and changes its label while the script is running', async () => {
      // Analysis never resolves — keeps the page in the running state
      window.electronAPI.runSanityChecks = vi.fn().mockReturnValue(new Promise(() => {}))
      render(<SetupPage />)

      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Running...' })).toBeDisabled()
      })
    })
  })

  describe('results state', () => {
    it('renders a card for each check result', async () => {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      await waitFor(() => {
        expect(screen.getByText('Operating System')).toBeInTheDocument()
        expect(screen.getByText('RAM')).toBeInTheDocument()
        expect(screen.getByText('VirtualBox')).toBeInTheDocument()
      })
    })

    it('shows the correct pass count in the summary bar', async () => {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      await waitFor(() => {
        expect(screen.getByText('2 passed')).toBeInTheDocument()
      })
    })

    it('shows the correct fail count in the summary bar', async () => {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      await waitFor(() => {
        expect(screen.getByText('1 failed')).toBeInTheDocument()
      })
    })

    it('shows "Fix the failed items" when any check is failing', async () => {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      await waitFor(() => {
        expect(screen.getByText(/fix the failed items/i)).toBeInTheDocument()
      })
    })

    it('shows "Ready to create a VM" when every check passes', async () => {
      const allPassing = SAMPLE_CHECKS.map((c) => ({ ...c, status: 'pass' as const }))
      window.electronAPI.runSanityChecks = vi.fn().mockResolvedValue({ ok: true, checks: allPassing })

      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      await waitFor(() => {
        expect(screen.getByText(/ready to create a vm/i)).toBeInTheDocument()
      })
    })
  })

  describe('live log stream', () => {
    it('renders emitted log lines in the running panel', async () => {
      let capturedCallback: ((line: { text: string; source: 'stdout' | 'stderr' }) => void) | null = null
      window.electronAPI.onScriptLine = vi.fn().mockImplementation((cb) => {
        capturedCallback = cb
        return () => {}
      })
      window.electronAPI.runSanityChecks = vi.fn().mockReturnValue(new Promise(() => {}))

      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      await waitFor(() => expect(screen.getByText('Analysing host...')).toBeInTheDocument())

      act(() => { capturedCallback!({ text: 'Checking RAM...', source: 'stdout' }) })

      expect(screen.getByText('Checking RAM...')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows the error message when the script fails to run', async () => {
      window.electronAPI.runSanityChecks = vi.fn().mockResolvedValue({
        ok: false,
        error: 'VBoxManage not found',
        checks: [],
      })

      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      await waitFor(() => {
        expect(screen.getByText('VBoxManage not found')).toBeInTheDocument()
      })
    })

    it('shows fallback message when result.ok is false with no error field', async () => {
      window.electronAPI.runSanityChecks = vi.fn().mockResolvedValue({ ok: false, checks: [] })

      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      // Both the section heading and the detail <p> render "Analysis failed"
      // when error is undefined — two matches confirms the fallback propagated correctly
      await waitFor(() => {
        expect(screen.getAllByText('Analysis failed')).toHaveLength(2)
      })
    })
  })

  describe('InstallVirtualBox action', () => {
    // Runs analysis (returns the default SAMPLE_CHECKS with vboxinst failing)
    // and opens the "How to fix" panel on the VirtualBox card.
    async function openVboxFixPanel() {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))
      await waitFor(() => expect(screen.getByText('VirtualBox')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: 'How to fix' }))
    }

    it('shows the Install VirtualBox button inside the fix panel', async () => {
      await openVboxFixPanel()
      expect(screen.getByRole('button', { name: 'Install VirtualBox' })).toBeInTheDocument()
    })

    it('disables the button and shows Installing... while install is in progress', async () => {
      window.electronAPI.installVirtualBox = vi.fn().mockReturnValue(new Promise(() => {}))
      await openVboxFixPanel()

      fireEvent.click(screen.getByRole('button', { name: 'Install VirtualBox' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Installing...' })).toBeDisabled()
      })
    })

    it('shows the success message after install completes', async () => {
      window.electronAPI.installVirtualBox = vi.fn().mockResolvedValue({ ok: true })
      await openVboxFixPanel()

      fireEvent.click(screen.getByRole('button', { name: 'Install VirtualBox' }))

      await waitFor(() => {
        expect(screen.getByText(/VirtualBox installed/i)).toBeInTheDocument()
      })
    })
  })
})
