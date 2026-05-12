// Setup page — lets the user analyse their Windows host and fix any issues
// before creating a VM.
//
// Flow:
//   1. User clicks "Run Analysis"
//   2. Sanity check script runs; results appear as CheckCards
//   3. Failing/warning cards show inline fix actions

import React, { useState } from 'react'
import CheckCard from '../components/CheckCard'
import type { CheckResult } from '../electron.d'

// State the page can be in
type PageState = 'idle' | 'running' | 'done'

export default function SetupPage() {
  const [pageState, setPageState] = useState<PageState>('idle')
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Live log lines streamed from the script while it runs
  const [logLines, setLogLines] = useState<string[]>([])

  /**
   * Starts the sanity check script.
   * Results come back as a structured array from ipc-handlers.js.
   */
  async function runAnalysis() {
    setPageState('running')
    setChecks([])
    setLogLines([])
    setErrorMessage(null)

    // Subscribe to live log lines while the script runs.
    // onScriptLine returns a cleanup function — we call it after the script finishes.
    const unsubscribeLine = window.electronAPI.onScriptLine((line) => {
      setLogLines((prev) => [...prev, line.text])
    })

    const result = await window.electronAPI.runSanityChecks()

    // Unsubscribe from the live log stream now that the script is done
    unsubscribeLine()

    if (result.ok) {
      setChecks(result.checks)
    } else {
      setErrorMessage(result.error ?? 'Analysis failed')
    }

    setPageState('done')
  }

  // Count results by status for the summary bar
  const passCount = checks.filter((c) => c.status === 'pass').length
  const warnCount = checks.filter((c) => c.status === 'warn').length
  const failCount = checks.filter((c) => c.status === 'fail').length
  const allPassing = failCount === 0

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Environment Setup</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Analyse your Windows host before creating a Fedora VM.
          </p>
        </div>

        <button
          onClick={runAnalysis}
          disabled={pageState === 'running'}
          className="px-5 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pageState === 'running' ? 'Running...' : 'Run Analysis'}
        </button>
      </div>

      {/* Running indicator */}
      {pageState === 'running' && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 mb-4">
          <p className="text-zinc-300 text-sm font-medium mb-2">Analysing host...</p>
          {/* Live log output */}
          <div className="font-mono text-xs text-zinc-400 max-h-32 overflow-y-auto space-y-0.5">
            {logLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Error — script failed to run entirely */}
      {pageState === 'done' && errorMessage && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-red-200 font-medium">Analysis failed</p>
          <p className="text-red-300 text-sm mt-1">{errorMessage}</p>
        </div>
      )}

      {/* Summary bar */}
      {pageState === 'done' && checks.length > 0 && (
        <div className="flex items-center gap-4 mb-5 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3">
          <span className="text-green-400 text-sm font-medium">{passCount} passed</span>
          <span className="text-yellow-400 text-sm font-medium">{warnCount} warnings</span>
          <span className="text-red-400 text-sm font-medium">{failCount} failed</span>

          <div className="ml-auto">
            {allPassing ? (
              <span className="text-green-400 text-sm font-semibold">
                Ready to create a VM
              </span>
            ) : (
              <span className="text-red-400 text-sm font-semibold">
                Fix the failed items before continuing
              </span>
            )}
          </div>
        </div>
      )}

      {/* Check result cards */}
      {checks.length > 0 && (
        <div className="space-y-3">
          {checks.map((check) => (
            <CheckCard
              key={check.id}
              check={check}
              action={getActionForCheck(check)}
            />
          ))}
        </div>
      )}

      {/* Idle state — nothing run yet */}
      {pageState === 'idle' && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-8 text-center text-zinc-500 text-sm">
          Click "Run Analysis" to check your system.
        </div>
      )}
    </div>
  )
}

// ── Fix actions ─────────────────────────────────────────────────────────────
// Each failing or warning check gets a specific fix action rendered inside
// the CheckCard. Keep these as simple JSX — a button or a code block.

/**
 * Returns the fix action node for a given check, or undefined if none needed.
 * @param {CheckResult} check
 */
function getActionForCheck(check: CheckResult): React.ReactNode | undefined {
  if (check.status === 'pass') return undefined

  switch (check.id) {

    case 'vboxinst':
      return <InstallVirtualBoxAction />

    case 'hyperv':
      return (
        <FixInstructions
          title="Disable Hyper-V"
          description="Run this command in PowerShell as Administrator, then reboot:"
          command="Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All"
        />
      )

    case 'whp':
      return (
        <FixInstructions
          title="Disable Windows Hypervisor Platform"
          description="Run this command in PowerShell as Administrator, then reboot:"
          command="Disable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform"
        />
      )

    case 'vmp':
      return (
        <FixInstructions
          title="Disable Virtual Machine Platform"
          description="Run this command in PowerShell as Administrator, then reboot:"
          command="Disable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform"
        />
      )

    case 'cpu':
      return (
        <FixInstructions
          title="Enable CPU Virtualisation in BIOS"
          description="Restart your PC and enter the BIOS/UEFI settings. Look for Intel VT-x or AMD-V and enable it. The exact steps depend on your motherboard."
        />
      )

    case 'secboot':
      return (
        <FixInstructions
          title="Secure Boot"
          description="VirtualBox 7+ supports Secure Boot — no action needed if you are on VirtualBox 7 or later."
        />
      )

    case 'ram':
      return (
        <FixInstructions
          title="Free up RAM"
          description="Close other applications to free up memory before starting a VM."
        />
      )

    case 'disk':
      return (
        <FixInstructions
          title="Free up disk space"
          description="Delete unused files on your C: drive or move them to another drive. A Fedora VM needs at least 30 GB free."
        />
      )

    default:
      return undefined
  }
}

// ── InstallVirtualBoxAction ──────────────────────────────────────────────────

function InstallVirtualBoxAction() {
  const [installing, setInstalling] = useState(false)
  const [done, setDone] = useState(false)

  async function handleInstall() {
    setInstalling(true)

    const result = await window.electronAPI.installVirtualBox()

    setInstalling(false)
    setDone(result.ok)
  }

  if (done) {
    return (
      <p className="text-green-300 text-sm">
        VirtualBox installed. Run the analysis again to confirm.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleInstall}
        disabled={installing}
        className="px-4 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm disabled:opacity-50"
      >
        {installing ? 'Installing...' : 'Install VirtualBox'}
      </button>
      {installing && (
        <span className="text-zinc-400 text-xs">
          Check the log panel above for progress.
        </span>
      )}
    </div>
  )
}

// ── FixInstructions ──────────────────────────────────────────────────────────
// Renders a fix description and an optional copyable command.

interface FixInstructionsProps {
  title: string
  description: string
  command?: string
}

function FixInstructions({ title, description, command }: FixInstructionsProps) {
  const [copied, setCopied] = useState(false)

  function copyCommand() {
    if (!command) return
    navigator.clipboard.writeText(command)
    setCopied(true)

    // Reset the "Copied!" label after 2 seconds
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2">
      <p className="text-zinc-200 text-sm font-medium">{title}</p>
      <p className="text-zinc-400 text-sm">{description}</p>

      {command && (
        <div className="flex items-center gap-2 mt-1">
          <code className="bg-zinc-900 text-zinc-200 text-xs px-3 py-1.5 rounded font-mono flex-1 overflow-x-auto">
            {command}
          </code>
          <button
            onClick={copyCommand}
            className="text-xs text-zinc-400 hover:text-zinc-100 px-2 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded shrink-0"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  )
}
