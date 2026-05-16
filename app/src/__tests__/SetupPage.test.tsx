import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import SetupPage from '../pages/SetupPage'
import type { CheckResult } from '../electron.d'

const SAMPLE_CHECKS: CheckResult[] = [
  { id: 'os',       label: 'Operating System', status: 'pass', detail: 'Windows 11 (64-bit)' },
  { id: 'ram',      label: 'RAM',              status: 'pass', detail: '16 GB total' },
  { id: 'vboxinst', label: 'VirtualBox',       status: 'fail', detail: 'Not installed.' },
]

beforeEach(() => {
  window.electronAPI = {
    runSanityChecks:   vi.fn().mockResolvedValue({ ok: true, checks: SAMPLE_CHECKS }),
    installVirtualBox: vi.fn().mockResolvedValue({ ok: true }),
    listVms:           vi.fn().mockResolvedValue({ ok: true, vms: [] }),
    createVm:          vi.fn().mockResolvedValue({ ok: true }),
    startVm:           vi.fn().mockResolvedValue({ ok: true }),
    stopVm:            vi.fn().mockResolvedValue({ ok: true }),
    readDoc:           vi.fn().mockResolvedValue({ ok: true, content: '' }),
    onScriptLine:      vi.fn().mockReturnValue(() => {}),
    onScriptDone:      vi.fn().mockReturnValue(() => {}),
    isDev:             vi.fn().mockResolvedValue(false),
  } as unknown as typeof window.electronAPI
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
        // VirtualBox is auto-selected so it appears in both the left list and right panel
        expect(screen.getAllByText('VirtualBox').length).toBeGreaterThan(0)
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

    it('shows "1 warning" (singular) in the summary bar', async () => {
      const withWarn = [
        ...SAMPLE_CHECKS,
        { id: 'cpu', label: 'CPU Virtualization', status: 'warn' as const, detail: 'Enabled (check BIOS)' },
      ]
      window.electronAPI.runSanityChecks = vi.fn().mockResolvedValue({ ok: true, checks: withWarn })

      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      await waitFor(() => {
        expect(screen.getByText('1 warning')).toBeInTheDocument()
      })
    })

    it('shows "0 warnings" (plural) when no checks produce a warning', async () => {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      await waitFor(() => {
        expect(screen.getByText('0 warnings')).toBeInTheDocument()
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

    it('re-enables the Run Analysis button after completion', async () => {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))
      await waitFor(() => expect(screen.getByText('Operating System')).toBeInTheDocument())

      expect(screen.getByRole('button', { name: 'Run Analysis' })).not.toBeDisabled()
    })

    it('allows running analysis again after results are shown', async () => {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))
      await waitFor(() => expect(screen.getByText('Operating System')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))
      await waitFor(() => expect(screen.getByText('Operating System')).toBeInTheDocument())

      expect(window.electronAPI.runSanityChecks).toHaveBeenCalledTimes(2)
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

    it('shows "Analysis failed" when result.ok is false with no error field', async () => {
      window.electronAPI.runSanityChecks = vi.fn().mockResolvedValue({ ok: false, checks: [] })

      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      await waitFor(() => {
        // The banner title and detail both render "Analysis failed" when no error string is provided
        expect(screen.getAllByText('Analysis failed')).toHaveLength(2)
      })
    })
  })

  describe('detail panel', () => {
    it('auto-selects the first failing check and shows its detail after analysis', async () => {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))

      await waitFor(() => {
        // vboxinst is the only fail check — its detail appears in the right panel
        expect(screen.getByText('Not installed.')).toBeInTheDocument()
      })
    })

    it('shows the detail text for the selected check in the right panel', async () => {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))
      await waitFor(() => expect(screen.getByText('Operating System')).toBeInTheDocument())

      // Click the "Operating System" row to switch selection
      fireEvent.click(screen.getByRole('button', { name: /operating system/i }))

      expect(screen.getByText('Windows 11 (64-bit)')).toBeInTheDocument()
    })

    it('shows "No action needed" when a passing check is selected', async () => {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))
      await waitFor(() => expect(screen.getByText('Operating System')).toBeInTheDocument())

      fireEvent.click(screen.getByRole('button', { name: /operating system/i }))

      expect(screen.getByText('No action needed.')).toBeInTheDocument()
    })

    it('switches the right panel when a different check row is clicked', async () => {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))
      await waitFor(() => expect(screen.getByText('Operating System')).toBeInTheDocument())

      // Start with vboxinst auto-selected
      expect(screen.getByText('Not installed.')).toBeInTheDocument()

      // Switch to RAM (button accessible name includes the badge text: "OK RAM")
      fireEvent.click(screen.getByRole('button', { name: /OK RAM/i }))
      expect(screen.getByText('16 GB total')).toBeInTheDocument()
      expect(screen.queryByText('Not installed.')).not.toBeInTheDocument()
    })
  })

  describe('InstallVirtualBox action', () => {
    // vboxinst is the only failing check in SAMPLE_CHECKS, so it is auto-selected
    // and the fix panel opens without any extra click.
    async function openVboxFixPanel() {
      render(<SetupPage />)
      fireEvent.click(screen.getByRole('button', { name: 'Run Analysis' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Install VirtualBox' })).toBeInTheDocument())
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

    it('re-enables the install button when install fails', async () => {
      window.electronAPI.installVirtualBox = vi.fn().mockResolvedValue({ ok: false })
      await openVboxFixPanel()

      fireEvent.click(screen.getByRole('button', { name: 'Install VirtualBox' }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Install VirtualBox' })).not.toBeDisabled()
      })
      expect(screen.queryByText(/VirtualBox installed/i)).not.toBeInTheDocument()
    })
  })
})
