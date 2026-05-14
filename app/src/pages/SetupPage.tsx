// Setup page — lets the user analyse their Windows host and fix any issues
// before creating a VM.
//
// Flow:
//   1. User clicks "Run Analysis"
//   2. Sanity check script runs; results appear as CheckCards
//   3. Failing/warning cards show inline fix actions

import { useState } from 'react'
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
      // We pass a function to setLogLines so React gives us the latest list (prev).
      // Using logLines directly here would capture a stale snapshot from when
      // runAnalysis started, causing earlier lines to be lost.
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
  if (check.status === 'pass') {
    return undefined
  }

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
          </>}
          command="Disable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All"
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
          </>}
          command="Disable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform"
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
              VirtualBox 7+ tolerates it, but if you are on an older version or seeing VM startup issues,
              disabling it is the safest option. Note: disabling this will also disable WSL2.
            </p>
          </>}
          command="Disable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform"
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
              run virtual machines — isolated environments where a separate operating system like Fedora
              Linux runs safely inside Windows without affecting your main system. VirtualBox requires it.
            </p>
            <p className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-zinc-300">
              <strong>Note:</strong> Windows does not always detect this setting correctly — it may report
              it as disabled even when it is on. Try starting a VM first. If it works, no action is needed.
            </p>
            <p>
              <strong className="text-zinc-300">How to enable it:</strong>
            </p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Restart your PC.</li>
              <li>Press <kbd className="bg-zinc-700 text-zinc-200 px-1 rounded text-xs">F2</kbd>, <kbd className="bg-zinc-700 text-zinc-200 px-1 rounded text-xs">F10</kbd>, <kbd className="bg-zinc-700 text-zinc-200 px-1 rounded text-xs">F12</kbd>, or <kbd className="bg-zinc-700 text-zinc-200 px-1 rounded text-xs">Delete</kbd> during startup to enter BIOS/UEFI.</li>
              <li>Look for a setting named <em>Intel VT-x</em>, <em>AMD-V</em>, <em>SVM</em>, or <em>Virtualisation Technology</em>.</li>
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
              loading during startup. It is designed to protect against rootkits and bootkits.
            </p>
            <p>
              VirtualBox 7+ is signed and fully supports Secure Boot — no action is needed if you are on
              VirtualBox 7 or later. If you are on an older version and experiencing driver signing errors
              on startup, you may need to disable Secure Boot in your BIOS/UEFI settings.
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
              your PC. VirtualBox needs at least 4 GB to run a VM, and 8 GB or more is recommended so
              both Windows and the VM have enough to work with.
            </p>
            <p>
              <strong className="text-zinc-300">Free RAM</strong> is how much memory is available right
              now. Even if your PC has plenty of RAM installed, running too many applications at once can
              leave too little free for a VM. At least 3 GB free is required to start one.
            </p>
            <p>
              Close unused applications (browsers, games, editors) before starting your VM to free up
              memory. If your total RAM is less than 4 GB, consider upgrading your hardware.
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
  description: React.ReactNode
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
      <p className="text-zinc-200 text-sm font-bold">{title}</p>

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

      <div className="text-zinc-400 text-sm space-y-2">{description}</div>
    </div>
  )
}
