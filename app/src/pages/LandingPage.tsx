// Landing page — shows all registered VirtualBox VMs.
// Loads the VM list on mount and refreshes on demand.

import { useEffect, useRef, useState } from 'react'
import type { Vm } from '../electron.d'
import type { Page } from '../App'
import VmDetailPage from './VmDetailPage'
import PerformancePage from './PerformancePage'
import VmLoginPage from './VmLoginPage'
import VmRunningBadge from '../components/VmRunningBadge'

interface LandingPageProps {
  onNavigate: (page: Page) => void
  onScriptRunning: (running: boolean) => void
  isActive: boolean
  createVmRunning: boolean
}

export default function LandingPage({ onNavigate, onScriptRunning, isActive, createVmRunning }: LandingPageProps) {
  // The list of VMs returned by VBoxManage
  const [vms, setVms] = useState<Vm[]>([])

  // Whether the VM list is currently loading
  const [loading, setLoading] = useState(true)

  // Error message to show if VBoxManage is not available
  const [error, setError] = useState<string | null>(null)

  // VM currently open in the detail view (null = show grid)
  const [selectedVm,     setSelectedVm]     = useState<Vm | null>(null)
  const [selectedVmView, setSelectedVmView] = useState<'detail' | 'provision'>('detail')
  const [perfVm,         setPerfVm]         = useState<Vm | null>(null)
  const [pendingPerfVm,  setPendingPerfVm]  = useState<Vm | null>(null)

  // Incremented each time we want VmDetailPage to re-fetch its info
  const [vmRefreshKey, setVmRefreshKey] = useState(0)

  // Load VMs on mount and whenever this page becomes active, but not while
  // create-vm is running — the VM appears in VBoxManage before it's fully set up.
  // When createVmRunning flips to false the effect re-fires and loads the finished VM.
  useEffect(() => {
    if (!isActive) return
    if (createVmRunning) return
    loadVms()
    setVmRefreshKey((k) => k + 1)
  }, [isActive, createVmRunning])

  // Poll every 5 s while the page is active to keep VM running states current.
  // Silent — no loading spinner, no error banner — so the UI doesn't flicker.
  // "running" now means Guest Additions are ready (checked in list-vms on the main process).
  useEffect(() => {
    if (!isActive || createVmRunning) return
    const id = setInterval(async () => {
      window.electronAPI.logUiAction('vm-list: poll')
      const result = await window.electronAPI.listVms()
      if (!result.ok) return
      setVms(result.vms)
      setSelectedVm((prev) => {
        if (!prev) return null
        return result.vms.find((v) => v.name === prev.name) ?? null
      })
    }, 5000)
    return () => clearInterval(id)
  }, [isActive, createVmRunning])

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
      // Keep selectedVm in sync with fresh data (e.g. updated running state)
      setSelectedVm((prev) => {
        if (!prev) return null
        return result.vms.find((v) => v.name === prev.name) ?? null
      })
    } else {
      setError(result.error ?? 'Could not load VMs')
      setVms([])
    }

    setLoading(false)
  }

  async function handleOpenPerf(vm: Vm) {
    const creds = await window.electronAPI.loadVmCredentials(vm.name)
    if (!creds.ok || !creds.user || !creds.pass) {
      setPendingPerfVm(vm)
      return
    }
    const check = await window.electronAPI.checkVmCredentials(vm.name, creds.user, creds.pass)
    if (!check.ok) {
      setPendingPerfVm(vm)
      return
    }
    setPerfVm(vm)
  }

  if (pendingPerfVm) {
    return (
      <div className="h-full overflow-y-auto">
        <VmLoginPage
          initialVmName={pendingPerfVm.name}
          onBack={() => setPendingPerfVm(null)}
          onNext={() => { setPerfVm(pendingPerfVm); setPendingPerfVm(null) }}
        />
      </div>
    )
  }

  if (perfVm) {
    return (
      <div className="h-full overflow-hidden">
        <PerformancePage vm={perfVm} onBack={() => { setPerfVm(null); loadVms() }} onScriptRunning={onScriptRunning} />
      </div>
    )
  }

  if (selectedVm) {
    return (
      <div className="h-full overflow-y-auto">
        <VmDetailPage vm={selectedVm} onBack={() => { setSelectedVm(null); loadVms() }} onScriptRunning={onScriptRunning} refreshKey={vmRefreshKey} initialView={selectedVmView} isActive={isActive} />
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-4xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100">My VMs</h1>
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

      {/* Loading state — only shown on first load (no VMs yet) */}
      {loading && vms.length === 0 && (
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

      {/* VM grid — stays mounted during refresh so card-level error state is preserved */}
      {vms.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {vms.map((vm) => (
            <VmCard
              key={vm.uuid}
              vm={vm}
              onRefresh={loadVms}
              onEdit={() => { setSelectedVmView('detail'); setSelectedVm(vm) }}
              onProvision={() => { setSelectedVmView('provision'); setSelectedVm(vm) }}
              onPerformance={() => handleOpenPerf(vm)}
            />
          ))}
        </div>
      )}
    </div>
    </div>
  )
}

// ── StopModal ──────────────────────────────────────────────────────────────

interface StopModalProps {
  vmName: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

function StopModal({ vmName, busy, onConfirm, onCancel }: StopModalProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="bg-zinc-800 border border-zinc-700 rounded-xl p-8 max-w-sm w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-zinc-400 text-sm text-center mb-2">Stop this VM?</p>
        <p className="text-zinc-100 text-2xl font-bold text-center break-all mb-2">{vmName}</p>
        <p className="text-zinc-500 text-xs text-center mb-8">
          An ACPI shutdown signal will be sent. Unsaved work inside the VM may be lost.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Stop VM
          </button>
        </div>
      </div>
    </div>
  )
}

// ── DeleteModal ────────────────────────────────────────────────────────────

interface DeleteModalProps {
  vmName: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

function DeleteModal({ vmName, busy, onConfirm, onCancel }: DeleteModalProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="bg-zinc-800 border border-zinc-700 rounded-xl p-8 max-w-sm w-full mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-zinc-400 text-sm text-center mb-2">
          Permanently delete this VM?
        </p>
        <p className="text-zinc-100 text-2xl font-bold text-center break-all mb-2">
          {vmName}
        </p>
        <p className="text-zinc-500 text-xs text-center mb-8">
          All VM files will be removed from disk. This cannot be undone.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Deleting...' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── VmCard ─────────────────────────────────────────────────────────────────
// Displays a single VM with its name, state, and action buttons.

interface VmCardProps {
  vm: Vm
  onRefresh: () => void
  onEdit: () => void
  onProvision: () => void
  onPerformance: () => void
}

function VmCard({ vm, onRefresh, onEdit, onProvision, onPerformance }: VmCardProps) {
  const [busy,     setBusy]     = useState(false)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showStopModal,   setShowStopModal]   = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Clear transient badges when the poll confirms the new state:
  // - starting → cleared when GA becomes ready (running) or VM process dies (window closed mid-boot)
  // - stopping → cleared when VM process fully stops
  // Intermediate state (processRunning && !running) means the VM is booting or shutting down — keep badge.
  const prevRunningRef = useRef(vm.running)
  const prevProcessRunningRef = useRef(vm.processRunning)
  useEffect(() => {
    const runningChanged = prevRunningRef.current !== vm.running
    const processChanged = prevProcessRunningRef.current !== vm.processRunning
    prevRunningRef.current = vm.running
    prevProcessRunningRef.current = vm.processRunning
    if (!runningChanged && !processChanged) return
    if (vm.running) {
      setStarting(false)
    } else if (!vm.processRunning) {
      setStarting(false)
      setStopping(false)
    }
  }, [vm.running, vm.processRunning])

  async function handleStart() {
    window.electronAPI.logUiAction(`vm "${vm.name}": Start`)
    setBusy(true)
    setStarting(true)
    setError(null)
    try {
      const result = await window.electronAPI.startVm(vm.name)
      if (!result.ok) {
        setStarting(false)
        setError('Could not start the VM — check the logs for details')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleStop() {
    window.electronAPI.logUiAction(`vm "${vm.name}": Stop`)
    setShowStopModal(false)
    setBusy(true)
    setStopping(true)
    setError(null)
    try {
      const result = await window.electronAPI.stopVm(vm.name)
      if (!result.ok) {
        setStopping(false)
        setError('Could not stop the VM — check the logs for details')
      }
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    window.electronAPI.logUiAction(`vm "${vm.name}": Delete`)
    setBusy(true)
    setError(null)
    setShowDeleteModal(false)
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
    <>
      {showStopModal && (
        <StopModal
          vmName={vm.name}
          busy={busy}
          onConfirm={handleStop}
          onCancel={() => setShowStopModal(false)}
        />
      )}

      {showDeleteModal && (
        <DeleteModal
          vmName={vm.name}
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 flex flex-col gap-3">
        {/* VM name and running badge */}
        <div className="flex items-center justify-between">
          <span className="text-zinc-100 font-medium truncate">{vm.name}</span>
          <VmRunningBadge running={vm.running} starting={starting} stopping={stopping} />
        </div>

        {/* UUID in small muted text */}
        <p className="text-zinc-500 text-xs font-mono truncate">{vm.uuid}</p>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        {/* Action buttons */}
        <div className="flex gap-1.5 mt-auto">
          {vm.running ? (
            <button
              onClick={() => setShowStopModal(true)}
              disabled={busy}
              className="px-2 py-1 text-sm bg-red-700 hover:bg-red-600 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={busy}
              className="px-2 py-1 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start
            </button>
          )}

          <button
            onClick={() => setShowDeleteModal(true)}
            disabled={vm.running || busy}
            className="px-2 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete
          </button>

          <button
            onClick={() => { window.electronAPI.logUiAction(`vm "${vm.name}": Provision`); onProvision() }}
            disabled={busy}
            className="px-2 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Provision
          </button>

          <button
            onClick={() => { window.electronAPI.logUiAction(`vm "${vm.name}": Detail`); onEdit() }}
            disabled={busy}
            className="px-2 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Detail
          </button>

          <button
            onClick={() => { window.electronAPI.logUiAction(`vm "${vm.name}": Performance`); onPerformance() }}
            disabled={busy}
            className="px-2 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Performance
          </button>
        </div>
      </div>
    </>
  )
}
