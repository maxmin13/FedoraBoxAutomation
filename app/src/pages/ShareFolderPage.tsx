import { useEffect, useState } from 'react'
import type { Vm, ScriptLine } from '../electron.d'
import LogPanel from '../components/LogPanel'
import ProgressBar from '../components/ProgressBar'

interface ShareFolderPageProps {
  vm: Vm
  onBack: () => void
  onScriptRunning: (running: boolean) => void
}

type PageState = 'idle' | 'running' | 'done'

export default function ShareFolderPage({ vm, onBack, onScriptRunning }: ShareFolderPageProps) {
  const [hostPath,   setHostPath]   = useState('')
  const [mountPoint, setMountPoint] = useState('')
  const [vmUser,     setVmUser]     = useState('')
  const [vmPass,     setVmPass]     = useState('')
  const [loginUser,  setLoginUser]  = useState('')

  const [pageState, setPageState] = useState<PageState>('idle')
  const [lines,     setLines]     = useState<ScriptLine[]>([])
  const [success,   setSuccess]   = useState<boolean | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [showLog,   setShowLog]   = useState(false)

  type VmReadyState = { running: boolean; guestAdditions: boolean; version?: string }
  const [vmReady, setVmReady] = useState<VmReadyState | null>(null)

  useEffect(() => {
    onScriptRunning(pageState === 'running')
  }, [pageState, onScriptRunning])

  useEffect(() => {
    window.electronAPI.loadVmCredentials(vm.name).then((saved) => {
      if (saved.ok) {
        if (saved.user)      setVmUser(saved.user)
        if (saved.pass)      setVmPass(saved.pass)
        if (saved.loginUser) setLoginUser(saved.loginUser)
      }
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
      const result = await window.electronAPI.runShareFolder({
        vmName: vm.name,
        hostPath,
        mountPoint,
        vmUser,
        vmPass,
        loginUser,
      })
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

  const invalidMountPoint = !!mountPoint && !/^\/[^\\ ]*$/.test(mountPoint.trim())
  const reservedMountPoint = mountPoint.trimEnd().replace(/\/+$/, '') === '/var/log'
  const canRun = pageState === 'idle' && !!hostPath && !!mountPoint && !invalidMountPoint && !reservedMountPoint && !!vmUser && !!vmPass && !!loginUser

  // ── Running / done ──────────────────────────────────────────────────────────
  if (pageState !== 'idle') {
    return (
      <div className="max-w-2xl mx-auto space-y-4">

        {pageState === 'running' && (
          <div className="space-y-2">
            <p className="text-zinc-300 text-sm font-medium">Setting up shared folder...</p>
            <ProgressBar />
          </div>
        )}

        {pageState === 'done' && success === true && (
          <div className="bg-green-900 border border-green-700 rounded-lg p-4">
            <p className="text-green-200 font-medium">Shared folder set up successfully.</p>
            <p className="text-green-300 text-sm mt-1">
              The folder is mounted. Reboot the VM for the vboxsf group change to take effect.
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
          Shared folder — {vm.name}
        </h1>
      </div>

      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-5">
        <p className="text-zinc-400 text-sm mb-4">
          Mount a host directory inside the VM via VirtualBox shared folders.
        </p>

        <VmReadyBanner vmReady={vmReady} />

        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-zinc-400 text-xs mb-1">Host path</label>
            <input
              type="text"
              value={hostPath}
              readOnly
              placeholder={String.raw`C:\Users\you\shared`}
              className={inputClass(hostPath) + ' cursor-pointer'}
              onClick={async () => {
                const result = await window.electronAPI.pickFolder()
                if (result.folderPath) setHostPath(result.folderPath)
              }}
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-xs mb-1">Mount point</label>
            <input
              type="text"
              value={mountPoint}
              onChange={(e) => setMountPoint(e.target.value)}
              placeholder="/mnt/shared"
              className={inputClass(mountPoint) + (invalidMountPoint || reservedMountPoint ? ' border-red-500' : '')}
            />
            {invalidMountPoint && (
              <p className="text-red-400 text-xs mt-1">Must be an absolute Linux path starting with / and containing no spaces.</p>
            )}
            {!invalidMountPoint && reservedMountPoint && (
              <p className="text-red-400 text-xs mt-1">/var/log is a system directory and cannot be used as a mount point.</p>
            )}
          </div>
          <div>
            <label className="block text-zinc-400 text-xs mb-1">VM root username</label>
            <input
              type="text"
              value={vmUser}
              onChange={(e) => setVmUser(e.target.value)}
              placeholder="root"
              className={inputClass(vmUser)}
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-xs mb-1">VM root password</label>
            <input
              type="password"
              value={vmPass}
              onChange={(e) => setVmPass(e.target.value)}
              placeholder="••••••••"
              className={inputClass(vmPass)}
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-xs mb-1">Desktop username (added to vboxsf)</label>
            <input
              type="text"
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              placeholder="fedora"
              className={inputClass(loginUser)}
            />
          </div>
        </div>

        <button
          onClick={handleRun}
          disabled={!canRun}
          className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Set up shared folder
        </button>

        {!canRun && !(invalidMountPoint || reservedMountPoint) && (
          <p className="text-zinc-500 text-xs mt-2">Fill in all fields above to continue.</p>
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
          Guest Additions not detected. Install them inside the VM before setting up a shared folder.
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

