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
          <div className="w-56 shrink-0 flex flex-col gap-1 overflow-y-auto min-h-0">
            {checks.map((check) => (
              <div key={check.id}>
                {/* hyperv/whp/vmp all flag the same underlying symptom — a
                    Windows hypervisor claiming VT-x from VirtualBox — so
                    they're grouped under one label to signal they're related,
                    not three unrelated failures. */}
                {check.id === 'hyperv' && (
                  <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider px-3 pt-2 pb-1">
                    Hypervisor
                  </p>
                )}
                <button
                  onClick={() => { window.electronAPI.logUiAction(`setup: select check "${check.label}"`); setSelectedId(check.id) }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors border ${
                    selectedId === check.id
                      ? 'bg-zinc-600 border-zinc-500'
                      : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  <span
                    className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${STATUS_BADGE[check.status]}`}
                  >
                    {STATUS_ICON[check.status]}
                  </span>
                  <span className="text-zinc-100 text-sm font-medium truncate">{check.label}</span>
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
            <div>
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
              <strong className="text-zinc-300">What is Hyper-V?</strong><br />
              Hyper-V is Microsoft's built-in hypervisor — the same type of software as VirtualBox, but
              made by Windows. When active, it takes exclusive control of your CPU's virtualisation hardware,
              leaving VirtualBox unable to access it. This causes VMs to fail to start or run very slowly.
            </p>
            <p>
              You do not need Hyper-V to use VirtualBox. Disabling it frees the hardware for VirtualBox.
            </p>
            <p className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-300">
              <strong>On Windows Home:</strong> the command below will fail with "Feature name
              Microsoft-Hyper-V-All is unknown" — that's expected, not an error to fix. Home editions don't
              ship the Hyper-V feature package at all, so it was never the cause here. Check the Windows
              Hypervisor Platform and Virtual Machine Platform checks instead.
            </p>
          </>}
          commands={['Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All']}
        />
      )

    case 'whp':
      return (
        <FixInstructions
          title="Disable Windows Hypervisor Platform"
          description={<>
            <p>
              <strong className="text-zinc-300">What is Windows Hypervisor Platform?</strong><br />
              It is a Windows feature that exposes Hyper-V virtualisation APIs to third-party applications
              such as Android emulators or WSL2. Like Hyper-V itself, it competes with VirtualBox for
              control of the CPU's virtualisation hardware.
            </p>
            <p>
              VirtualBox 7+ can coexist with it, but older versions cannot. If you are on VirtualBox 6.x
              or experiencing VM startup failures, disabling it is the safest fix.
            </p>
            <p className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-300">
              <strong>Run in an elevated PowerShell</strong> (Run as Administrator), then reboot for the
              change to take effect.
            </p>
            <p className="text-zinc-500">
              This setting persists across reboots and normal Windows Updates — it won't silently revert on
              its own. It can, however, get re-enabled automatically the next time you install or update
              something that needs the hypervisor (Android Studio's emulator, WSL, Docker Desktop). If
              VirtualBox slows down again later, that's the first thing to check.
            </p>
            <p className="text-zinc-500">
              To re-enable later: <code className="bg-zinc-900 px-1 rounded">Enable-WindowsOptionalFeature
              -Online -FeatureName HypervisorPlatform -All</code>, then reboot.
            </p>
          </>}
          commands={['Disable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform']}
        />
      )

    case 'vmp':
      return (
        <FixInstructions
          title="Disable Virtual Machine Platform"
          description={<>
            <p>
              <strong className="text-zinc-300">What is Virtual Machine Platform?</strong><br />
              It is a Windows feature that provides the underlying infrastructure for WSL2 (Windows Subsystem
              for Linux) and other virtualisation-based tools. Like Hyper-V, it uses the CPU's virtualisation
              hardware and can interfere with VirtualBox on older versions.
            </p>
            <p>
              VirtualBox 7+ tolerates it, but if you are on an older version or seeing VM startup or
              performance issues (VMs starting very slowly is a common symptom), disabling it is the safest
              option. Note: disabling this will also disable WSL2 and Docker Desktop's WSL2 backend until
              you re-enable it.
            </p>
            <p className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-300">
              <strong>Run each command below in an elevated PowerShell</strong> (Run as Administrator), in
              order, then reboot for the change to take effect.
            </p>
            <p className="text-zinc-500">
              Both the feature toggle and the <code className="bg-zinc-900 px-1 rounded">bcdedit</code> setting
              persist across reboots and normal Windows Updates — they won't silently revert on their own.
              They can, however, get re-enabled automatically the next time you reinstall/update WSL, install
              Docker Desktop's WSL2 backend, or run <code className="bg-zinc-900 px-1 rounded">wsl --install</code> —
              those installers commonly turn Virtual Machine Platform (and the boot flag) back on for their
              own needs. If VirtualBox slows down again later, that's the first thing to check.
            </p>
            <p className="text-zinc-500">
              To re-enable WSL2 later: <code className="bg-zinc-900 px-1 rounded">Enable-WindowsOptionalFeature
              -Online -FeatureName VirtualMachinePlatform -All</code>, set{' '}
              <code className="bg-zinc-900 px-1 rounded">bcdedit /set hypervisorlaunchtype auto</code>, and
              reboot.
            </p>
          </>}
          commands={[
            'wsl --shutdown',
            'Disable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform',
            'bcdedit /set hypervisorlaunchtype off',
            'Restart-Computer',
          ]}
        />
      )

    case 'cpu':
      return (
        <FixInstructions
          title="Enable CPU Virtualisation in BIOS"
          description={<>
            <p>
              <strong className="text-zinc-300">What is CPU Virtualisation?</strong><br />
              It is a hardware feature (Intel VT-x or AMD-V) built into your processor that lets your PC
              run virtual machines. VirtualBox requires it.
            </p>
            <p className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-300">
              <strong>Note:</strong> Windows does not always detect this setting correctly — it may report
              it as disabled even when it is on. Try starting a VM first. If it works, no action is needed.
            </p>
            <p><strong className="text-zinc-300">How to enable it:</strong></p>
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
            <p className="text-zinc-500">The exact location depends on your motherboard manufacturer.</p>
          </>}
        />
      )

    case 'secboot':
      return (
        <FixInstructions
          title="Secure Boot"
          description={<>
            <p>
              <strong className="text-zinc-300">What is Secure Boot?</strong><br />
              Secure Boot is a UEFI security feature that prevents unsigned or untrusted software from
              loading during startup.
            </p>
            <p>
              VirtualBox 7+ is signed and fully supports Secure Boot — no action is needed if you are on
              VirtualBox 7 or later. If you are on an older version and experiencing driver signing errors,
              you may need to disable Secure Boot in your BIOS/UEFI settings.
            </p>
          </>}
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
}

function FixInstructions({ title, description, commands }: FixInstructionsProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  function copyCommand(cmd: string, index: number) {
    navigator.clipboard.writeText(cmd)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <div className="space-y-2">
      <p className="text-zinc-200 text-sm font-bold">{title}</p>

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

      <div className="text-zinc-400 text-sm space-y-2">{description}</div>
    </div>
  )
}
