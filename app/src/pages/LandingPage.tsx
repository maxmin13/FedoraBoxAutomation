// Landing page — shows all registered VirtualBox VMs.
// Loads the VM list on mount and refreshes on demand.

import { useEffect, useState } from 'react'
import type { Vm } from '../electron.d'
import type { Page } from '../App'
import VmEditPage from './VmEditPage'
import VmRunningBadge from '../components/VmRunningBadge'

interface LandingPageProps {
  onNavigate: (page: Page) => void
  onScriptRunning: (running: boolean) => void
}

export default function LandingPage({ onNavigate, onScriptRunning }: LandingPageProps) {
  // The list of VMs returned by VBoxManage
  const [vms, setVms] = useState<Vm[]>([])

  // Whether the VM list is currently loading
  const [loading, setLoading] = useState(true)

  // Error message to show if VBoxManage is not available
  const [error, setError] = useState<string | null>(null)

  // VM currently open in the detail view (null = show grid)
  const [selectedVm, setSelectedVm] = useState<Vm | null>(null)

  // Load VMs when the component first mounts
  useEffect(() => {
    loadVms()
  }, [])

  /**
   * Calls the main process to get the list of registered VMs.
   * Updates state with the result.
   */
  async function loadVms() {
    setLoading(true)
    setError(null)

    const result = await window.electronAPI.listVms()

    if (result.ok) {
      setVms(result.vms)
    } else {
      setError(result.error ?? 'Could not load VMs')
      setVms([])
    }

    setLoading(false)
  }

  if (selectedVm) {
    return <VmEditPage vm={selectedVm} onBack={() => setSelectedVm(null)} onScriptRunning={onScriptRunning} />
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100">My VMs</h1>

        <button
          onClick={loadVms}
          disabled={loading}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded text-sm disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* VirtualBox not found */}
      {error && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-5 mb-6">
          <p className="text-red-200 font-medium">Could not connect to VirtualBox</p>
          <p className="text-red-300 text-sm mt-1">{error}</p>
          <p className="text-zinc-400 text-sm mt-3">
            VirtualBox may not be installed. Go to{' '}
            <button
              onClick={() => onNavigate('setup')}
              className="underline text-zinc-200 hover:text-white"
            >
              Setup
            </button>{' '}
            to run the environment analysis.
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-zinc-400 text-sm">Loading VMs...</div>
      )}

      {/* Empty state — VirtualBox works but no VMs exist yet */}
      {!loading && !error && vms.length === 0 && (
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-8 text-center">
          <p className="text-zinc-300 text-lg font-medium">No VMs found</p>
          <p className="text-zinc-500 text-sm mt-2">
            Go to{' '}
            <button
              onClick={() => onNavigate('setup')}
              className="underline text-zinc-300 hover:text-white"
            >
              Setup
            </button>{' '}
            to create your first Fedora VM.
          </p>
        </div>
      )}

      {/* VM grid */}
      {!loading && vms.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {vms.map((vm) => (
            <VmCard key={vm.uuid} vm={vm} onRefresh={loadVms} onEdit={() => setSelectedVm(vm)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── VmCard ─────────────────────────────────────────────────────────────────
// Displays a single VM with its name, state, and action buttons.

interface VmCardProps {
  vm: Vm
  onRefresh: () => void
  onEdit: () => void
}

function VmCard({ vm, onRefresh, onEdit }: VmCardProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function handleStart() {
    setBusy(true)
    setError(null)
    try {
      const result = await window.electronAPI.startVm(vm.name)
      if (!result.ok) {
        setError(result.error ?? 'Failed to start VM')
      }
    } finally {
      setBusy(false)
      onRefresh()
    }
  }

  async function handleStop() {
    setBusy(true)
    setError(null)
    try {
      const result = await window.electronAPI.stopVm(vm.name)
      if (!result.ok) {
        setError(result.error ?? 'Failed to stop VM')
      }
    } finally {
      setBusy(false)
      onRefresh()
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    setConfirming(false)
    try {
      const result = await window.electronAPI.deleteVm(vm.name)
      if (!result.ok) {
        setError(result.error ?? 'Failed to delete VM')
      }
    } finally {
      setBusy(false)
      onRefresh()
    }
  }

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 flex flex-col gap-3">
      {/* VM name and running badge */}
      <div className="flex items-center justify-between">
        <span className="text-zinc-100 font-medium truncate">{vm.name}</span>

        <VmRunningBadge running={vm.running} />
      </div>

      {/* UUID in small muted text */}
      <p className="text-zinc-500 text-xs font-mono truncate">{vm.uuid}</p>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto flex-wrap">
        {vm.running ? (
          <button
            onClick={handleStop}
            disabled={busy}
            className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-sm disabled:opacity-50"
          >
            {busy ? 'Stopping...' : 'Stop'}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={busy}
            className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm disabled:opacity-50"
          >
            {busy ? 'Starting...' : 'Start'}
          </button>
        )}

        {confirming ? (
          <>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-sm disabled:opacity-50"
            >
              {busy ? 'Deleting...' : 'Confirm Delete'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="px-3 py-1 bg-zinc-600 hover:bg-zinc-500 text-white rounded text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={vm.running || busy}
            className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white rounded text-sm disabled:opacity-50"
          >
            Delete
          </button>
        )}

        <button
          onClick={onEdit}
          disabled={busy}
          className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white rounded text-sm disabled:opacity-50 ml-auto"
        >
          Detail
        </button>
      </div>
    </div>
  )
}
