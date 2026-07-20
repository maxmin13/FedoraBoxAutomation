import { useEffect, useState } from 'react'
import type { Vm } from '../electron.d'
import type { Page } from '../App'

interface VmLoginPageProps {
  // standalone nav-bar usage
  onNavigate?: (page: Page) => void
  // inline usage (inside LandingPage before Provision/Detail)
  initialVmName?: string
  onNext?: () => void
  onBack?: () => void
}

export default function VmLoginPage({ onNavigate, initialVmName, onNext, onBack }: VmLoginPageProps) {
  const inline = !!initialVmName

  const [vms,       setVms]       = useState<Vm[]>([])
  const [stateMap,  setStateMap]  = useState<Record<string, { user: string; pass: string; loginUser: string }>>({})
  const [loading,   setLoading]   = useState(!inline)
  const [vmName,    setVmName]    = useState(initialVmName ?? '')
  const [rootUser,  setRootUser]  = useState('root')
  const [rootPass,  setRootPass]  = useState('')
  const [vmUser,    setVmUser]    = useState('')
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [showPass,  setShowPass]  = useState(false)

  // Standalone: load VirtualBox VM list and vm-state.json in parallel,
  // then merge so the dropdown includes VMs from both sources.
  useEffect(() => {
    if (inline) return
    Promise.all([
      window.electronAPI.listVms(),
      window.electronAPI.loadAllVmCredentials(),
    ]).then(([vmsResult, stateResult]) => {
      const vboxVms: Vm[] = vmsResult.ok ? vmsResult.vms : []
      const saved = stateResult.entries

      // Build a merged VM list: VirtualBox entries first, then any extra names
      // that exist only in vm-state (e.g. VMs created on another machine).
      const stateNames = Object.keys(saved)
      const vboxNames  = new Set(vboxVms.map((v) => v.name))
      const extraVms: Vm[] = stateNames
        .filter((n) => !vboxNames.has(n))
        .map((n) => ({ name: n, uuid: '', running: false }))

      const merged = [...vboxVms, ...extraVms]
      setVms(merged)
      setStateMap(saved)
      if (merged.length === 1) setVmName(merged[0].name)
      setLoading(false)
    })
  }, [inline])

  // Inline: load saved credentials for the pre-set VM on mount
  useEffect(() => {
    if (!inline || !vmName) return
    window.electronAPI.loadVmCredentials(vmName).then((saved) => {
      if (saved.ok) {
        if (saved.user)      setRootUser(saved.user)
        if (saved.pass)      setRootPass(saved.pass)
        if (saved.loginUser) setVmUser(saved.loginUser)
      }
    })
  }, [inline, vmName])

  // Standalone: when the user picks a VM from the dropdown, fill from stateMap
  function handleVmChange(name: string) {
    setVmName(name)
    const saved = stateMap[name]
    if (saved) {
      setRootUser(saved.user || 'root')
      setRootPass(saved.pass)
      setVmUser(saved.loginUser)
    } else {
      setRootUser('root')
      setRootPass('')
      setVmUser('')
    }
  }

  async function handleNext() {
    if (!vmName || !rootUser || !rootPass || !vmUser) return
    window.electronAPI.logUiAction(`vm-login "${vmName}": Save credentials`)
    setSaving(true)
    setError(null)
    try {
      const check = await window.electronAPI.checkVmCredentials(vmName, rootUser, rootPass)
      if (!check.ok) {
        setError('Invalid credentials or the VM is not reachable. Make sure the root username and password are correct, the VM is running, and Guest Additions are installed.')
        return
      }

      const userCheck = await window.electronAPI.checkVmUser(vmName, rootUser, rootPass, vmUser)
      if (!userCheck.ok) {
        setError(`VM username "${vmUser}" does not exist on this VM.`)
        return
      }

      await window.electronAPI.saveVmCredentials(vmName, rootUser, rootPass, vmUser)
      onNext?.()
      if (!onNext) onNavigate?.('landing')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = !!vmName && !!rootUser && !!rootPass && !!vmUser && !saving

  const inputClass = (value: string) =>
    'w-full px-2.5 py-1.5 bg-zinc-700 border rounded text-zinc-100 text-sm ' +
    'focus:outline-none focus:border-blue-500 ' +
    (value ? 'border-zinc-400' : 'border-zinc-600')

  return (
    <div className="max-w-md mx-auto">

        <div className="flex items-center gap-3 mb-1">
          {onBack && (
            <button
              onClick={onBack}
              className="px-3 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors shrink-0"
            >
              &larr; Back
            </button>
          )}
          <h1 className="text-2xl font-semibold text-zinc-100">VM Login</h1>
        </div>
        <p className="text-zinc-400 text-sm mb-4">
          Enter the credentials for your VM to continue.
        </p>

        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-5 space-y-3">

        <div>
          <label className="block text-zinc-400 text-xs mb-1">VM name</label>
          {inline ? (
            <p className="text-zinc-100 text-sm font-medium">{vmName}</p>
          ) : loading ? (
            <p className="text-zinc-500 text-sm">Loading VMs...</p>
          ) : vms.length === 0 ? (
            <p className="text-zinc-500 text-sm">No VMs found. Create one first.</p>
          ) : (
            <select
              value={vmName}
              onChange={(e) => handleVmChange(e.target.value)}
              className={inputClass(vmName)}
            >
              <option value="">Select a VM...</option>
              {vms.map((vm) => (
                <option key={vm.uuid} value={vm.name}>{vm.name}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-zinc-400 text-xs mb-1">Root username</label>
          <input
            type="text"
            value={rootUser}
            onChange={(e) => setRootUser(e.target.value)}
            placeholder="root"
            className={inputClass(rootUser)}
          />
        </div>

        <div>
          <label className="block text-zinc-400 text-xs mb-1">Root password</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={rootPass}
              onChange={(e) => setRootPass(e.target.value)}
              placeholder="••••••••"
              className={inputClass(rootPass) + ' pr-9'}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              tabIndex={-1}
            >
              {showPass ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7s4-7 9-7a10.05 10.05 0 011.875.175M15 12a3 3 0 11-6 0 3 3 0 016 0zm6 0c0 3-4 7-9 7M3 3l18 18" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-zinc-400 text-xs mb-1">VM username</label>
          <input
            type="text"
            value={vmUser}
            onChange={(e) => setVmUser(e.target.value)}
            placeholder="your desktop username"
            className={inputClass(vmUser)}
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleNext}
          disabled={!canSubmit}
          className="w-full px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Connecting...' : 'Next'}
        </button>

        </div>
    </div>
  )
}
