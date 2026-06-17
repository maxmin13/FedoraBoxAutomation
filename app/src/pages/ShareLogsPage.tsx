import { useEffect, useState } from 'react'
import type { Vm, ScriptLine } from '../electron.d'
import LogPanel from '../components/LogPanel'
import ProgressBar from '../components/ProgressBar'
import { useAuthGate } from '../hooks/useAuthGate'
import VmLoginPage from './VmLoginPage'

interface ShareLogsPageProps {
  vm: Vm
  onBack: () => void
  onScriptRunning: (running: boolean) => void
}

type PageState = 'idle' | 'running' | 'done'

export default function ShareLogsPage({ vm, onBack, onScriptRunning }: ShareLogsPageProps) {
  const [hostPath,   setHostPath]   = useState('')
  const [vmUser,     setVmUser]     = useState('')
  const [vmPass,     setVmPass]     = useState('')
  const [loginUser,  setLoginUser]  = useState('')
  const [pageState,  setPageState]  = useState<PageState>('idle')
  const [lines,      setLines]      = useState<ScriptLine[]>([])
  const [success,    setSuccess]    = useState<boolean | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [showLog,      setShowLog]      = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [credKey,      setCredKey]      = useState(0)

  const { withAuth, loginRequired, onLoginSuccess, onLoginBack } = useAuthGate(vm.name)

  function handleLoginSuccess() {
    setCredKey(k => k + 1)
    onLoginSuccess()
  }

  useEffect(() => {
    onScriptRunning(pageState === 'running')
  }, [pageState, onScriptRunning])

  useEffect(() => {
    window.electronAPI.getVmGuestLogsPath(vm.name).then((result) => {
      if (result.ok && result.path) setHostPath(result.path)
    })
    window.electronAPI.loadVmCredentials(vm.name).then((saved) => {
      if (saved.ok) {
        if (saved.user)      setVmUser(saved.user)
        if (saved.pass)      setVmPass(saved.pass)
        if (saved.loginUser) setLoginUser(saved.loginUser)
      }
    })
  }, [vm.name, credKey])

  async function handleRun(forceRestart = false) {
    window.electronAPI.logUiAction(`share-logs "${vm.name}": Set up log sync`)
    setPageState('running')
    setLines([])
    setSuccess(null)
    setError(null)
    setShowLog(true)

    const unsubLine = window.electronAPI.onScriptLine((line) =>
      setLines((prev) => [...prev, line])
    )
    const unsubDone = window.electronAPI.onScriptDone((exitCode) => {
      if (exitCode === 0) {
        window.electronAPI.saveVmCredentials(vm.name, vmUser, vmPass, loginUser)
      }
      setSuccess(exitCode === 0)
      setPageState('done')
      setShowLog(false)
      unsubLine()
      unsubDone()
    })

    try {
      const result = await window.electronAPI.runShareLogs({ vmName: vm.name, hostPath, vmUser, vmPass, loginUser, forceRestart })
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

  const inputClass = (value: string) =>
    'w-full px-2.5 py-1.5 bg-zinc-700 border rounded text-zinc-100 text-sm ' +
    'focus:outline-none focus:border-blue-500 ' +
    (value ? 'border-zinc-400' : 'border-zinc-600')


  // ── Login gate ──────────────────────────────────────────────────────────────
  if (loginRequired) {
    return (
      <div className="h-full overflow-y-auto">
        <VmLoginPage initialVmName={vm.name} onBack={onLoginBack} onNext={handleLoginSuccess} />
      </div>
    )
  }

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
                onClick={() => { window.electronAPI.logUiAction(`share-logs "${vm.name}": Back to VM`); onBack() }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 rounded transition-colors"
              >
                &larr; Back to VM
              </button>
            ) : (
              <button
                onClick={() => { window.electronAPI.logUiAction(`share-logs "${vm.name}": Try again`); setPageState('idle') }}
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
    <>
    <div className="max-w-2xl mx-auto">

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => { window.electronAPI.logUiAction(`share-logs "${vm.name}": Back`); onBack() }}
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

        <div className="flex items-start gap-2 mb-4 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-xs text-zinc-400">
          <span className="mt-0.5">&#9432;</span>
          <span>
            If the VM is currently running, it will be briefly shut down and restarted
            to register the shared folder. This may take a few minutes.
          </span>
        </div>

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-zinc-400 text-xs mb-1">Log destination (host folder)</label>
            <input
              type="text"
              value={hostPath}
              readOnly
              placeholder="Loading..."
              className={inputClass(hostPath) + ' cursor-pointer'}
              onClick={async () => {
                const result = await window.electronAPI.pickFolder()
                if (result.folderPath) setHostPath(result.folderPath)
              }}
            />
          </div>
        </div>

        <button
          onClick={() => withAuth(() => {
            if (vm.running) { setShowConfirm(true) } else { handleRun(false) }
          })}
          className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors"
        >
          Set up log sync
        </button>
      </div>
    </div>

    {showConfirm && (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-6 max-w-sm w-full mx-4 space-y-4">
          <h2 className="text-zinc-100 font-semibold">Force-stop VM?</h2>
          <p className="text-zinc-300 text-sm">
            <strong>{vm.name}</strong> is currently running. It will be force-stopped to register the log sync shared folder. Unsaved work in the VM will be lost.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setShowConfirm(false); handleRun(true) }}
              className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white font-medium rounded transition-colors"
            >
              Force restart
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

