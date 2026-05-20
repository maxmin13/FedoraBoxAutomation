import { useEffect, useState } from 'react'
import type { Vm, ScriptLine } from '../electron.d'
import LogPanel from '../components/LogPanel'
import ProgressBar from '../components/ProgressBar'

interface ShareLogsPageProps {
  vm: Vm
  onBack: () => void
  onScriptRunning: (running: boolean) => void
}

type PageState = 'idle' | 'running' | 'done'

export default function ShareLogsPage({ vm, onBack, onScriptRunning }: ShareLogsPageProps) {
  const [hostPath,        setHostPath]        = useState('')
  const [pageState,       setPageState]       = useState<PageState>('idle')
  const [lines,           setLines]           = useState<ScriptLine[]>([])
  const [success,         setSuccess]         = useState<boolean | null>(null)
  const [error,           setError]           = useState<string | null>(null)
  const [showLog,         setShowLog]         = useState(false)
  const [hasCredentials,  setHasCredentials]  = useState<boolean | null>(null)

  type VmReadyState = { running: boolean; guestAdditions: boolean; version?: string }
  const [vmReady, setVmReady] = useState<VmReadyState | null>(null)

  useEffect(() => {
    onScriptRunning(pageState === 'running')
  }, [pageState])

  useEffect(() => {
    window.electronAPI.getVmGuestLogsPath(vm.name).then((result) => {
      if (result.ok && result.path) setHostPath(result.path)
    })
    window.electronAPI.loadVmCredentials(vm.name).then((saved) => {
      setHasCredentials(saved.ok)
    })
    window.electronAPI.checkVmReady(vm.name).then((result) => {
      if (result.ok) {
        setVmReady({ running: result.running, guestAdditions: result.guestAdditions, version: result.version })
      }
    })
  }, [vm.name])

  async function handleRun() {
    setPageState('running')
    setLines([])
    setSuccess(null)
    setError(null)
    setShowLog(true)

    const unsubLine = window.electronAPI.onScriptLine((line) =>
      setLines((prev) => [...prev, line])
    )
    const unsubDone = window.electronAPI.onScriptDone((exitCode) => {
      setSuccess(exitCode === 0)
      setPageState('done')
      setShowLog(false)
      unsubLine()
      unsubDone()
    })

    try {
      const result = await window.electronAPI.runShareLogs({ vmName: vm.name, hostPath })
      if (!result.ok && result.errorDetail) {
        setError(result.errorDetail)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSuccess(false)
      setPageState('done')
      setShowLog(false)
      unsubLine()
      unsubDone()
    }
  }

  const canRun = pageState === 'idle' && !!hostPath && hasCredentials === true

  // ── Running / done ──────────────────────────────────────────────────────────
  if (pageState !== 'idle') {
    return (
      <div className="max-w-2xl mx-auto space-y-4">

        {pageState === 'running' && (
          <div className="space-y-2">
            <p className="text-zinc-300 text-sm font-medium">Setting up log sync...</p>
            <ProgressBar />
          </div>
        )}

        {pageState === 'done' && success === true && (
          <div className="bg-green-900 border border-green-700 rounded-lg p-4">
            <p className="text-green-200 font-medium">Log sync active.</p>
            <p className="text-green-300 text-sm mt-1">
              <code className="text-green-200">/var/log</code> is being synced to{' '}
              <code className="text-green-200 break-all">{hostPath}</code> every 30 seconds.
            </p>
          </div>
        )}

        {pageState === 'done' && success === false && (
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 space-y-1">
            <p className="text-red-200 font-medium">Setup failed.</p>
            {error
              ? <p className="text-red-300 text-sm font-mono break-words">{error}</p>
              : <p className="text-red-400 text-sm">No error details captured — expand the script output below.</p>
            }
          </div>
        )}

        <LogPanel
          lines={lines}
          showLog={showLog}
          onToggle={() => setShowLog((v) => !v)}
        />

        {pageState === 'done' && (
          <div className="flex justify-end">
            {success ? (
              <button
                onClick={onBack}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 rounded transition-colors"
              >
                &larr; Back to VM
              </button>
            ) : (
              <button
                onClick={() => setPageState('idle')}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 rounded transition-colors"
              >
                &larr; Try again
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Idle: form ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="px-3 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors shrink-0"
        >
          &larr; Back
        </button>
        <h1 className="text-xl font-semibold text-zinc-100 truncate">
          Log sync — {vm.name}
        </h1>
      </div>

      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-5">
        <p className="text-zinc-400 text-sm mb-4">
          Sync <code className="text-zinc-300">/var/log</code> from the VM to a host folder
          every 30 seconds via a VirtualBox shared folder and rsync.
        </p>

        <VmReadyBanner vmReady={vmReady} />

        {hasCredentials === false && (
          <div className="flex items-start gap-2 mb-4 px-3 py-2 bg-amber-950 border border-amber-700 rounded text-xs text-amber-300">
            <span className="mt-0.5">&#9888;</span>
            <span>
              No saved credentials found for this VM. Run the shared folder setup first to save them.
            </span>
          </div>
        )}

        <div className="flex items-start gap-2 mb-4 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-400">
          <span className="mt-0.5">&#9432;</span>
          <span>
            If the VM is currently running, it will be briefly shut down and restarted
            to register the shared folder. This may take a few minutes.
          </span>
        </div>

        <div className="mb-4">
          <label className="block text-zinc-400 text-xs mb-1">Log destination (host folder)</label>
          <input
            type="text"
            value={hostPath}
            readOnly
            placeholder="Loading..."
            className={
              'w-full px-2.5 py-1.5 bg-zinc-700 border rounded text-zinc-100 text-sm ' +
              'focus:outline-none focus:border-blue-500 cursor-pointer ' +
              (hostPath ? 'border-zinc-400' : 'border-zinc-600')
            }
            onClick={async () => {
              const result = await window.electronAPI.pickFolder()
              if (result.folderPath) setHostPath(result.folderPath)
            }}
          />
        </div>

        <button
          onClick={handleRun}
          disabled={!canRun}
          className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Set up log sync
        </button>

        {!canRun && hasCredentials === false && (
          <p className="text-zinc-500 text-xs mt-2">
            Credentials required — set up a shared folder for this VM first.
          </p>
        )}
        {!canRun && hasCredentials !== false && !hostPath && (
          <p className="text-zinc-500 text-xs mt-2">Select a destination folder to continue.</p>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface VmReadyBannerProps {
  vmReady: { running: boolean; guestAdditions: boolean; version?: string } | null
}

function VmReadyBanner({ vmReady }: VmReadyBannerProps) {
  if (!vmReady) return null

  if (!vmReady.running) {
    return (
      <div className="flex items-start gap-2 mb-4 px-3 py-2 bg-amber-950 border border-amber-700 rounded text-xs text-amber-300">
        <span className="mt-0.5">&#9888;</span>
        <span>
          VM is not running — Guest Additions status cannot be verified.
          Start the VM first to confirm they are installed.
        </span>
      </div>
    )
  }

  if (!vmReady.guestAdditions) {
    return (
      <div className="flex items-start gap-2 mb-4 px-3 py-2 bg-red-950 border border-red-700 rounded text-xs text-red-300">
        <span className="mt-0.5">&#10007;</span>
        <span>
          Guest Additions not detected. Install them inside the VM before setting up log sync.
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-green-950 border border-green-800 rounded text-xs text-green-300">
      <span>&#10003;</span>
      <span>VM running · Guest Additions {vmReady.version}</span>
    </div>
  )
}
