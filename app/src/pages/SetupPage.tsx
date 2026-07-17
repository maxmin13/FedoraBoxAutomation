// Setup page — lets the user analyse their Windows host and fix any issues
// before creating a VM.
//
// Layout: header + summary bar (fixed), then a left/right split.
// Left: compact check list. Right: detail + fix instructions for selected check.

import { useState, useEffect } from 'react'
import type { CheckResult } from '../electron.d'
import ProgressBar from '../components/ProgressBar'

type PageState = 'idle' | 'running' | 'done'

const STATUS_BADGE: Record<CheckResult['status'], string> = {
  pass: 'bg-green-700 text-green-100',
  warn: 'bg-yellow-700 text-yellow-100',
  fail: 'bg-red-700 text-red-100',
}

const STATUS_ICON: Record<CheckResult['status'], string> = {
  pass: 'OK',
  warn: '!!',
  fail: 'XX',
}

export default function SetupPage({ onScriptRunning }: { onScriptRunning: (running: boolean) => void }) {
  const [pageState, setPageState] = useState<PageState>('idle')
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [logLines, setLogLines] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    onScriptRunning(pageState === 'running')
  }, [pageState])

  async function runAnalysis() {
    window.electronAPI.logUiAction('setup: Run Analysis')
    setPageState('running')
    setChecks([])
    setLogLines([])
    setErrorMessage(null)
    setSelectedId(null)

    const unsubscribeLine = window.electronAPI.onScriptLine((line) => {
      setLogLines((prev) => [...prev, line.text])
    })

    const result = await window.electronAPI.runSanityChecks()
    unsubscribeLine()

    if (result.ok) {
      setChecks(result.checks)
      // Auto-select first failing check, or first warning, or first check
      const first =
        result.checks.find((c) => c.status === 'fail') ??
        result.checks.find((c) => c.status === 'warn') ??
        result.checks[0]
      if (first) setSelectedId(first.id)
    } else {
      setErrorMessage(result.error ?? 'Analysis failed')
    }

    setPageState('done')
  }

  const passCount = checks.filter((c) => c.status === 'pass').length
  const warnCount = checks.filter((c) => c.status === 'warn').length
  const failCount = checks.filter((c) => c.status === 'fail').length
  const allPassing = failCount === 0

  const selectedCheck = checks.find((c) => c.id === selectedId) ?? null
  const selectedAction = selectedCheck ? getActionForCheck(selectedCheck) : undefined

  return (
    <div className="h-full flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
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

      {/* Progress bar — shown while analysis is running */}
      {pageState === 'running' && (
        <div className="mb-4 shrink-0">
          <ProgressBar />
        </div>
      )}

      {/* Summary bar */}
      {pageState === 'done' && checks.length > 0 && (
        <div className="flex items-center gap-4 mb-4 shrink-0 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3">
          <span className="text-green-400 text-sm font-medium">{passCount} passed</span>
          <span className="text-yellow-400 text-sm font-medium">
            {warnCount} {warnCount === 1 ? 'warning' : 'warnings'}
          </span>
          <span className="text-red-400 text-sm font-medium">{failCount} failed</span>
          <div className="ml-auto">
            {allPassing ? (
              <span className="text-green-400 text-sm font-semibold">Ready to create a VM</span>
            ) : (
              <span className="text-red-400 text-sm font-semibold">
                Fix the failed items before continuing
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error — script failed entirely */}
      {pageState === 'done' && errorMessage && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-4 shrink-0">
          <p className="text-red-200 font-medium">Analysis failed</p>
          <p className="text-red-300 text-sm mt-1">{errorMessage}</p>
        </div>
      )}

      {/* Split area */}
      <div className="flex flex-1 gap-4 min-h-0">

        {/* Left: check list — only shown once results exist */}
        {checks.length > 0 && (
          <div className="w-72 shrink-0 flex flex-col gap-1">
            {checks.map((check) => (
              <div key={check.id}>
                {/* hyperv/whp/vmp all flag the same underlying symptom — a
                    Windows hypervisor claiming VT-x from VirtualBox — so
                    they're grouped under one label to signal they're related,
                    not three unrelated failures. */}
                {check.id === 'hyperv' && (
                  <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider px-3 pt-1.5 pb-0.5">
                    Hypervisor
                  </p>
                )}
                <button
                  onClick={() => { window.electronAPI.logUiAction(`setup: select check "${check.label}"`); setSelectedId(check.id) }}
                  className={`w-full flex items-start gap-3 px-3 py-1.5 rounded-lg text-left transition-colors border ${
                    selectedId === check.id
                      ? 'bg-zinc-600 border-zinc-500'
                      : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  <span
                    className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${STATUS_BADGE[check.status]}`}
                  >
                    {STATUS_ICON[check.status]}
                  </span>
                  <span className="text-zinc-100 text-sm font-medium leading-tight">{check.label}</span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Right: detail panel */}
        <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg p-5 overflow-hidden">

          {/* Idle */}
          {pageState === 'idle' && (
            <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
              Click "Run Analysis" to check your system.
            </div>
          )}

          {/* Running — live log */}
          {pageState === 'running' && (
            <div>
              <p className="text-zinc-300 text-sm font-medium mb-2">Analysing host...</p>
              <div className="font-mono text-xs text-zinc-400 space-y-0.5">
                {logLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          )}

          {/* Done, nothing selected yet */}
          {pageState === 'done' && !selectedCheck && checks.length > 0 && (
            <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
              Select a check on the left to see details.
            </div>
          )}

          {/* Selected check detail */}
          {selectedCheck && (
            <div className="pb-8">
              <div className="flex items-center gap-3 mb-3">
                <span
                  className={`text-xs font-mono font-bold px-2 py-1 rounded ${STATUS_BADGE[selectedCheck.status]}`}
                >
                  {STATUS_ICON[selectedCheck.status]}
                </span>
                <h2 className="text-zinc-100 font-semibold text-lg">{selectedCheck.label}</h2>
              </div>

              <p className="text-zinc-300 text-sm mb-4">{selectedCheck.detail}</p>

              {selectedAction && (
                <div className="border-t border-zinc-700 pt-4">
                  {selectedAction}
                </div>
              )}

              {!selectedAction && selectedCheck.status === 'pass' && (
                <p className="text-green-400 text-sm">No action needed.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Fix actions ──────────────────────────────────────────────────────────────

function getActionForCheck(check: CheckResult): React.ReactNode | undefined {
  if (check.status === 'pass') return undefined

  switch (check.id) {

    case 'vboxinst':
      return <InstallVirtualBoxAction />

    case 'hyperv':
      return (
        <FixInstructions
          title="Disable Hyper-V"
          description={<>
            <p>
              Hyper-V is Microsoft's hypervisor. When active it claims the CPU's virtualisation hardware,
              so VirtualBox can't use it — VMs fail to start or run very slowly. VirtualBox doesn't need
              Hyper-V, so disabling it is safe.
            </p>
            <p className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-300">
              <strong>On Windows Home:</strong> the command below fails with "Feature name
              Microsoft-Hyper-V-All is unknown" — expected, not an error. Home doesn't ship Hyper-V, so
              check Windows Hypervisor Platform / Virtual Machine Platform instead.
            </p>
          </>}
          commands={['Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All']}
          elevated
        />
      )

    case 'whp':
      return (
        <FixInstructions
          title="Disable Windows Hypervisor Platform"
          description={<>
            <p>
              Exposes Hyper-V's virtualisation APIs to apps like Android emulators or WSL2, competing with
              VirtualBox for the CPU's virtualisation hardware. VirtualBox 7+ tolerates it, but disabling
              it is the safest fix for VM startup failures or slowness.
            </p>
            <p className="text-zinc-500">
              Persists until reversed, but gets re-enabled automatically by things like WSL or Android
              Studio's emulator. Re-enable: <code className="bg-zinc-900 px-1 rounded">Enable-WindowsOptionalFeature
              -Online -FeatureName HypervisorPlatform -All</code>.
            </p>
          </>}
          commands={['Disable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform']}
          elevated
        />
      )

    case 'vmp':
      return (
        <FixInstructions
          title="Disable Virtual Machine Platform"
          description={<>
            <p>
              Underlies WSL2 and other virtualisation tools; like Hyper-V it claims the CPU's virtualisation
              hardware. VirtualBox 7+ tolerates it, but disabling it fixes VM startup/slowness issues. This
              also disables WSL2 until re-enabled.
            </p>
            <p className="text-zinc-500">
              Persists until reversed, but reinstalling WSL, Docker Desktop, or <code className="bg-zinc-900 px-1 rounded">wsl --install</code> will
              typically re-enable it.
            </p>
          </>}
          commands={[
            'wsl --shutdown',
            'Disable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform',
            'bcdedit /set hypervisorlaunchtype off',
            'Restart-Computer',
          ]}
          elevated
        />
      )

    case 'cpu':
      return (
        <FixInstructions
          title="Enable CPU Virtualisation in BIOS"
          description={<>
            <p className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-300">
              <strong>Note:</strong> Windows doesn't always detect this correctly — try starting a VM
              first; if it works, no action is needed.
            </p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Restart your PC.</li>
              <li>
                Press{' '}
                <kbd className="bg-zinc-700 text-zinc-200 px-1 rounded text-xs">F2</kbd>,{' '}
                <kbd className="bg-zinc-700 text-zinc-200 px-1 rounded text-xs">F10</kbd>,{' '}
                <kbd className="bg-zinc-700 text-zinc-200 px-1 rounded text-xs">F12</kbd>, or{' '}
                <kbd className="bg-zinc-700 text-zinc-200 px-1 rounded text-xs">Delete</kbd>{' '}
                during startup to enter BIOS/UEFI.
              </li>
              <li>Look for <em>Intel VT-x</em>, <em>AMD-V</em>, <em>SVM</em>, or <em>Virtualisation Technology</em>.</li>
              <li>Set it to <strong>Enabled</strong>, save and reboot.</li>
            </ol>
          </>}
        />
      )

    case 'secboot':
      return (
        <FixInstructions
          title="Secure Boot"
          description="VirtualBox 7+ is signed and fully supports Secure Boot — no action needed on VirtualBox 7+. On an older version with driver signing errors, disable Secure Boot in BIOS/UEFI."
        />
      )

    case 'ram':
      return (
        <FixInstructions
          title="RAM (Memory)"
          description={<>
            <p>
              <strong className="text-zinc-300">Total RAM</strong> is the physical memory installed in
              your PC. VirtualBox needs at least 4 GB to run a VM, and 8 GB or more is recommended.
            </p>
            <p>
              <strong className="text-zinc-300">Free RAM</strong> is how much memory is available right
              now. At least 3 GB free is required to start a VM.
            </p>
            <p>
              Close unused applications before starting your VM to free up memory.
            </p>
          </>}
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
    window.electronAPI.logUiAction('setup: Install VirtualBox')
    setInstalling(true)
    try {
      const result = await window.electronAPI.installVirtualBox()
      setDone(result.ok)
    } finally {
      setInstalling(false)
    }
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
        <span className="text-zinc-400 text-xs">This may take a few minutes...</span>
      )}
    </div>
  )
}

// ── FixInstructions ──────────────────────────────────────────────────────────

interface FixInstructionsProps {
  title: string
  description: React.ReactNode
  commands?: string[]
  elevated?: boolean
}

function FixInstructions({ title, description, commands, elevated }: FixInstructionsProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  function copyCommand(cmd: string, index: number) {
    navigator.clipboard.writeText(cmd)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <div className="space-y-2">
      <p className="text-zinc-200 text-sm font-bold">{title}</p>

      <div className="text-zinc-400 text-sm space-y-2 break-words">{description}</div>

      {commands && commands.length > 0 && (
        <div className="space-y-1.5 mt-1">
          {commands.map((cmd, i) => (
            <div key={i} className="flex items-center gap-2">
              <code className="bg-zinc-900 text-zinc-200 text-xs px-3 py-1.5 rounded font-mono flex-1 overflow-x-auto">
                {cmd}
              </code>
              <button
                onClick={() => copyCommand(cmd, i)}
                className="text-xs text-zinc-400 hover:text-zinc-100 px-2 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded shrink-0"
              >
                {copiedIndex === i ? 'Copied!' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
      )}

      {elevated && (
        <p className="text-zinc-500 text-xs">Run as Administrator, then reboot to apply.</p>
      )}
    </div>
  )
}
