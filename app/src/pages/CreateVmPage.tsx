// Create VM page — 3-step wizard (Name -> Hardware -> Options) + confirmation.

import { useState, useEffect, useRef } from 'react'
import type { CreateVmParams } from '../electron.d'
import type { Page } from '../App'
import LogPanel from '../components/LogPanel'
import ProgressBar from '../components/ProgressBar'

type PageState = 'idle' | 'running' | 'done' | 'next-steps'
type Step = 1 | 2 | 3 | 4

const DISK_TYPES = ['VDI', 'VMDK', 'VHD']
const NIC_TYPES  = ['nat', 'bridged', 'host-only', 'none']

const PARAVIRT_OPTIONS = [
  { value: 'kvm',     label: 'KVM (recommended for Linux)' },
  { value: 'default', label: 'Default (auto)' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'none',    label: 'None' },
]

const NIC_CHIPSET_OPTIONS = [
  { value: 'virtio',   label: 'virtio-net (fastest)' },
  { value: '82540EM',  label: 'Intel e1000 MT' },
]

const STORAGE_CTRL_OPTIONS = [
  { value: 'IntelAhci', label: 'SATA / AHCI' },
  { value: 'NVMe',      label: 'NVMe (fastest)' },
]

export default function CreateVmPage({ onScriptRunning, onNavigate, navKey, isActive = true }: { onScriptRunning: (running: boolean) => void; onNavigate: (page: Page) => void; navKey: number; isActive?: boolean }) {
  // Form fields
  const [vmName,   setVmName]   = useState('')
  const [vmFolder, setVmFolder] = useState('')
  const [isoPath,  setIsoPath]  = useState('')
  const [ramMB,    setRamMB]    = useState(4096)
  const [cpus,       setCpus]       = useState(4)
  const [diskMB,     setDiskMB]     = useState(40000)
  const [diskType,   setDiskType]   = useState('VDI')
  const [vramMB,     setVramMB]     = useState(128)
  const [nicType,          setNicType]          = useState('nat')
  const [paravirtProvider, setParavirtProvider] = useState('kvm')
  const [nicChipset,       setNicChipset]       = useState('virtio')
  const [storageCtrl,      setStorageCtrl]      = useState('IntelAhci')
  const [acceleration3d,   setAcceleration3d]   = useState(true)
  const [cpuExecCap,       setCpuExecCap]       = useState(100)
  const [startAfter,       setStartAfter]       = useState(false)

  // Wizard + execution state
  const [step,          setStep]          = useState<Step>(1)
  const [pageState,     setPageState]     = useState<PageState>('idle')
  const [logLines,      setLogLines]      = useState<{ text: string; source: 'stdout' | 'stderr' }[]>([])
  const [success,       setSuccess]       = useState<boolean | null>(null)
  const [existingNames, setExistingNames] = useState<string[]>([])
  const [showLog,       setShowLog]       = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)
  // True once the user has been on the page while pageState='done', meaning they've seen the result.
  // A navKey change only resets the form once the user has seen the result.
  const resultSeenRef = useRef(false)

  useEffect(() => {
    if (pageState === 'done') {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [pageState])

  // Mark the result as seen whenever the page is active and showing the done state.
  useEffect(() => {
    if (pageState === 'done' && isActive) {
      resultSeenRef.current = true
    }
  }, [pageState, isActive])

  useEffect(() => {
    onScriptRunning(pageState === 'running')
  }, [pageState, onScriptRunning])

  useEffect(() => {
    window.electronAPI.listVms().then((result) => {
      if (result.ok) setExistingNames(result.vms.map((v) => v.name))
    })
  }, [])

  useEffect(() => {
    // Skip reset while script is running. Also skip if the user hasn't seen the result yet
    // (they were away when the script completed and deserve to see the banner on next visit).
    if (navKey > 0 && pageState !== 'running' && (pageState !== 'done' || resultSeenRef.current)) {
      resultSeenRef.current = false
      setPageState('idle')
      setStep(1)
      setVmName('')
      setVmFolder('')
      setIsoPath('')
      setRamMB(4096)
      setCpus(4)
      setDiskMB(40000)
      setDiskType('VDI')
      setVramMB(128)
      setNicType('nat')
      setParavirtProvider('kvm')
      setNicChipset('virtio')
      setStorageCtrl('IntelAhci')
      setAcceleration3d(true)
      setCpuExecCap(100)
      setStartAfter(false)
      setLogLines([])
      setSuccess(null)
    }
  }, [navKey])

  const trimmedName  = vmName.trim()
  const nameConflict = trimmedName !== '' && existingNames.includes(trimmedName)
  const step1Valid   = trimmedName !== '' && isoPath.trim() !== ''

  const ramError  = ramMB  < 1024  ? 'Minimum 1024 MB'            : null
  const cpusError = cpus   < 1     ? 'Minimum 1'                   : cpus > 32   ? 'Maximum 32'   : null
  const diskError = diskMB < 10000 ? 'Minimum 10000 MB (10 GB)'    : null
  const vramError   = vramMB    < 16  ? 'Minimum 16 MB'    : vramMB > 256    ? 'Maximum 256 MB'   : null
  const cpuCapError = cpuExecCap < 1   ? 'Minimum 1%'      : cpuExecCap > 100 ? 'Maximum 100%'    : null
  const step2Valid = !ramError && !cpusError && !diskError && !vramError && !cpuCapError

  async function handleCreate() {
    window.electronAPI.logUiAction(`create-vm: Create VM "${trimmedName}"`)
    setPageState('running')
    setLogLines([])
    setSuccess(null)
    setShowLog(true)

    const unsub = window.electronAPI.onScriptLine((line) => {
      setLogLines((prev) => [...prev, line])
    })

    const params: CreateVmParams = {
      vmName: trimmedName,
      vmFolder: vmFolder.trim(),
      isoPath: isoPath.trim(),
      ramMB,
      cpus,
      diskMB,
      diskType,
      vramMB,
      nicType,
      paravirtProvider,
      nicChipset,
      storageController: storageCtrl,
      acceleration3d,
      cpuExecCap,
      attachGuestAdditions: true,
      startVm: startAfter,
      forceRecreate: nameConflict,
    }

    const result = await window.electronAPI.createVm(params)
    unsub()
    setSuccess(result.ok)
    setPageState('done')
    setShowLog(false)

  }

  const ic =
    'w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-zinc-100 text-sm ' +
    'placeholder-zinc-500 focus:outline-none focus:border-blue-500'

  // Running / done — replace wizard with execution UI
  if (pageState !== 'idle') {
    return (
      <div className="max-w-2xl mx-auto space-y-4" ref={resultRef}>
        {pageState === 'running' && (
          <>
            <div className="space-y-2">
              <p className="text-zinc-300 text-sm font-medium">Creating VM...</p>
              <ProgressBar />
            </div>
            <LogPanel
              title="Script output"
              showLog={showLog}
              lines={logLines}
              onToggle={() => setShowLog((v) => !v)}
            />
          </>
        )}

        {pageState === 'done' && success === true && (
          <>
            <div className="bg-green-900 border border-green-700 rounded-lg p-4">
              <p className="text-green-200 font-medium">VM created successfully.</p>
              <p className="text-green-300 text-sm mt-1">
                Start the VM and complete the Fedora installer inside it.
              </p>
            </div>
            <LogPanel
              title="Script output"
              showLog={showLog}
              lines={logLines}
              onToggle={() => setShowLog((v) => !v)}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { window.electronAPI.logUiAction('create-vm: view Next steps'); setPageState('next-steps') }}
                className="px-6 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-medium transition-colors"
              >
                Next: What to do &rarr;
              </button>
            </div>
          </>
        )}

        {pageState === 'done' && success === false && (
          <>
            <div className="bg-red-900 border border-red-700 rounded-lg p-4">
              <p className="text-red-200 font-medium">VM creation failed.</p>
              <p className="text-red-300 text-sm mt-1">Check the script output for details.</p>
            </div>
            <LogPanel
              title="Script output"
              showLog={showLog}
              lines={logLines}
              onToggle={() => setShowLog((v) => !v)}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { window.electronAPI.logUiAction('create-vm: Try again'); setPageState('idle') }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 rounded transition-colors"
              >
                &larr; Try again
              </button>
            </div>
          </>
        )}

        {pageState === 'next-steps' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-zinc-100">What to do next</h2>
              <p className="text-zinc-400 text-sm mt-0.5">
                Your VM is ready. Follow the post-install guide to finish setting up Fedora.
              </p>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-5 flex items-start gap-4">
              <span className="text-2xl mt-0.5">&#128214;</span>
              <div className="flex-1">
                <p className="text-zinc-100 font-medium">VM Post-Install Setup</p>
                <p className="text-zinc-400 text-sm mt-1">
                  The Docs menu has a step-by-step guide covering everything from completing the
                  Fedora installer to setting a root password and installing Guest Additions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { window.electronAPI.logUiAction('create-vm: Open Docs'); onNavigate('docs') }}
                className="shrink-0 px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-sm rounded font-medium transition-colors"
              >
                Open Docs &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Wizard — h-full flex-col keeps header + nav pinned; form area scrolls if needed
  return (
    <div className="max-w-2xl mx-auto h-full flex flex-col">

      {/* Pinned header */}
      <div className="shrink-0 mb-3">
        <h1 className="text-2xl font-semibold text-zinc-100">Create VM</h1>
        <p className="text-zinc-400 text-sm mt-0.5">
          Configure and create a new Fedora VirtualBox VM.
        </p>
      </div>

      <div className="shrink-0">
        <StepIndicator currentStep={step} />
      </div>

      {/* Form area */}
      <div className="flex-1 min-h-0">

        {/* Step 1 — Name */}
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                VM Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={vmName}
                onChange={(e) => setVmName(e.target.value)}
                placeholder="e.g. FedoraBox"
                className={ic}
              />
              {nameConflict && (
                <p className="text-yellow-400 text-xs mt-1">
                  A VM named "{trimmedName}" already exists — submitting will unregister and recreate
                  it (files kept).
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Fedora ISO Path <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={isoPath ? isoPath.split(/[\\/]/).pop()! : ''}
                readOnly
                onClick={async () => {
                  window.electronAPI.logUiAction('create-vm: browse ISO')
                  const result = await window.electronAPI.pickIso()
                  if (result.filePath) setIsoPath(result.filePath)
                }}
                placeholder="Click to browse for the Fedora ISO file"
                className={ic + ' cursor-pointer'}
              />
              {isoPath && (() => {
                const filename = isoPath.split(/[\\/]/).pop()!
                const isFedora = /fedora/i.test(filename)
                return isFedora
                  ? <p className="mt-1 text-xs text-green-400">&#10003; Fedora ISO detected</p>
                  : <p className="mt-1 text-xs text-amber-400">&#9888; Filename does not contain &ldquo;Fedora&rdquo; — make sure this is the right file</p>
              })()}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                VM Folder{' '}
                <span className="text-zinc-500 font-normal">
                  (optional — uses VirtualBox default)
                </span>
              </label>
              <input
                type="text"
                value={vmFolder}
                onChange={(e) => setVmFolder(e.target.value)}
                placeholder="Leave empty to use the default VirtualBox VMs folder"
                className={ic}
              />
            </div>

          </div>
        )}

        {/* Step 2 — Hardware */}
        {step === 2 && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">RAM (MB)</label>
              <input type="number" value={ramMB} onChange={(e) => setRamMB(Number(e.target.value))} min={1024} step={512} className={ic} />
              {ramError && <p className="text-red-400 text-xs mt-1">{ramError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">CPUs</label>
              <input type="number" value={cpus} onChange={(e) => setCpus(Number(e.target.value))} min={1} max={32} className={ic} />
              {cpusError && <p className="text-red-400 text-xs mt-1">{cpusError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Disk Size (MB)</label>
              <input type="number" value={diskMB} onChange={(e) => setDiskMB(Number(e.target.value))} min={10000} step={1000} className={ic} />
              {diskError && <p className="text-red-400 text-xs mt-1">{diskError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Video RAM (MB)</label>
              <input type="number" value={vramMB} onChange={(e) => setVramMB(Number(e.target.value))} min={16} max={256} className={ic} />
              {vramError && <p className="text-red-400 text-xs mt-1">{vramError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Disk Format</label>
              <select value={diskType} onChange={(e) => setDiskType(e.target.value)} className={ic}>
                {DISK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Storage Controller<InfoTip text="NVMe is faster under heavy I/O; SATA is more compatible with existing setups" /></label>
              <select value={storageCtrl} onChange={(e) => setStorageCtrl(e.target.value)} className={ic}>
                {STORAGE_CTRL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Paravirtualization<InfoTip text="KVM improves CPU and I/O performance for Linux guests" /></label>
              <select value={paravirtProvider} onChange={(e) => setParavirtProvider(e.target.value)} className={ic}>
                {PARAVIRT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">NIC Chipset<InfoTip text="A faster network adapter type is available for this VM" /></label>
              <select value={nicChipset} onChange={(e) => setNicChipset(e.target.value)} className={ic}>
                {NIC_CHIPSET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">3D Acceleration<InfoTip text="Requires Guest Additions to be installed inside the VM to take effect" /></label>
              <select value={acceleration3d ? 'on' : 'off'} onChange={(e) => setAcceleration3d(e.target.value === 'on')} className={ic}>
                <option value="on">Enabled</option>
                <option value="off">Disabled</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">CPU Execution Cap (%)<InfoTip text="Limits how much host CPU the VM can use — keep at 100% for full performance" /></label>
              <input type="number" value={cpuExecCap} onChange={(e) => setCpuExecCap(Number(e.target.value))} min={1} max={100} className={ic} />
              {cpuCapError && <p className="text-red-400 text-xs mt-1">{cpuCapError}</p>}
            </div>
          </div>
        )}

        {/* Step 3 — Options */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Network Adapter
              </label>
              <select
                value={nicType}
                onChange={(e) => setNicType(e.target.value)}
                className={ic}
              >
                {NIC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={startAfter}
                  onChange={(e) => setStartAfter(e.target.checked)}
                  className="accent-blue-500"
                />
                <span className="text-sm text-zinc-300">Start VM after creation</span>
              </label>
            </div>
          </div>
        )}

        {/* Step 4 — Confirm */}
        {step === 4 && (
          <div className="space-y-2">
            {nameConflict && (
              <div className="bg-yellow-900/40 border border-yellow-700 rounded-lg p-3">
                <p className="text-yellow-300 text-sm">
                  A VM named "{trimmedName}" already exists. Submitting will unregister and recreate
                  it (files are kept).
                </p>
              </div>
            )}

            <div className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden divide-y divide-zinc-700">
              <ConfirmSection title="Name">
                <ConfirmRow label="VM Name"   value={trimmedName} />
                <ConfirmRow label="ISO File"  value={isoPath.trim() ? isoPath.trim().split(/[\\/]/).pop()! : '—'} />
                <ConfirmRow label="VM Folder" value={vmFolder.trim() || '(VirtualBox default)'} />
              </ConfirmSection>
              <div className="grid grid-cols-2 divide-x divide-zinc-700">
                <ConfirmSection title="Hardware">
                  <ConfirmRow label="RAM"         value={`${ramMB} MB`} />
                  <ConfirmRow label="CPUs"        value={String(cpus)} />
                  <ConfirmRow label="Disk Size"   value={`${diskMB} MB`} />
                  <ConfirmRow label="Video RAM"   value={`${vramMB} MB`} />
                  <ConfirmRow label="Disk Format" value={diskType} />
                  <ConfirmRow label="Storage"     value={STORAGE_CTRL_OPTIONS.find((o) => o.value === storageCtrl)?.label ?? storageCtrl} />
                  <ConfirmRow label="Paravirt"    value={PARAVIRT_OPTIONS.find((o) => o.value === paravirtProvider)?.label ?? paravirtProvider} />
                  <ConfirmRow label="NIC Chipset" value={NIC_CHIPSET_OPTIONS.find((o) => o.value === nicChipset)?.label ?? nicChipset} />
                  <ConfirmRow label="3D Accel"    value={acceleration3d ? 'Enabled' : 'Disabled'} />
                  <ConfirmRow label="CPU Cap"     value={`${cpuExecCap}%`} />
                </ConfirmSection>
                <ConfirmSection title="Options">
                  <ConfirmRow label="Network"     value={nicType} />
                  <ConfirmRow label="Start after" value={startAfter ? 'Yes' : 'No'} />
                </ConfirmSection>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Pinned footer nav */}
      <div className="shrink-0 pt-3">
        {step === 1 && <StepNav onBack={null} onNext={() => { window.electronAPI.logUiAction('create-vm: step 1 next'); setStep(2) }} nextEnabled={step1Valid} />}
        {step === 2 && <StepNav onBack={() => { window.electronAPI.logUiAction('create-vm: step 2 back'); setStep(1) }} onNext={() => { window.electronAPI.logUiAction('create-vm: step 2 next'); setStep(3) }} nextEnabled={step2Valid} />}
        {step === 3 && <StepNav onBack={() => { window.electronAPI.logUiAction('create-vm: step 3 back'); setStep(2) }} onNext={() => { window.electronAPI.logUiAction('create-vm: step 3 next'); setStep(4) }} nextEnabled={true} nextLabel="Review" />}
        {step === 4 && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => { window.electronAPI.logUiAction('create-vm: step 4 back'); setStep(3) }}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 rounded transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="px-6 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-medium transition-colors"
            >
              {nameConflict ? 'Recreate VM' : 'Create VM'}
            </button>
          </div>
        )}
      </div>

    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

const STEP_LABELS = ['Name', 'Hardware', 'Options', 'Confirm']

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center mb-4">
      {STEP_LABELS.map((label, i) => {
        const n        = i + 1
        const isActive = n === currentStep
        const isDone   = n < currentStep
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ' +
                  (isDone
                    ? 'bg-blue-600 text-white'
                    : isActive
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 ring-offset-zinc-900'
                    : 'bg-zinc-700 text-zinc-400')
                }
              >
                {isDone ? '✓' : n}
              </div>
              <span
                className={
                  'text-xs mt-1.5 ' +
                  (isActive ? 'text-zinc-200' : isDone ? 'text-zinc-400' : 'text-zinc-500')
                }
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div
                className={
                  'flex-1 h-px mx-2 mb-4 ' +
                  (n < currentStep ? 'bg-blue-600' : 'bg-zinc-700')
                }
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

interface StepNavProps {
  onBack:      (() => void) | null
  onNext:      () => void
  nextEnabled: boolean
  nextLabel?:  string
}

function StepNav({ onBack, onNext, nextEnabled, nextLabel = 'Next' }: StepNavProps) {
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 rounded transition-colors"
        >
          Back
        </button>
      ) : (
        <div />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={!nextEnabled}
        className="px-6 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {nextLabel}
      </button>
    </div>
  )
}

function ConfirmSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex text-xs">
      <span className="w-28 text-zinc-400 shrink-0">{label}</span>
      <span className="text-zinc-200 break-all">{value}</span>
    </div>
  )
}

function InfoTip({ text }: { text: string }) {
  const [show, setShow]     = useState(false)
  const [style, setStyle]   = useState<React.CSSProperties>({})
  const ref                 = useRef<HTMLSpanElement>(null)

  function handleMouseEnter() {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      setStyle({
        position: 'fixed',
        top:  r.top - 6,
        left: r.left + r.width / 2,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999,
      })
    }
    setShow(true)
  }

  return (
    <span
      ref={ref}
      className="ml-1 text-zinc-500 hover:text-zinc-300 cursor-default text-xs align-middle"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      &#9432;
      {show && (
        <span
          style={style}
          className="w-56 bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs rounded px-2 py-1.5 whitespace-normal pointer-events-none shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  )
}


