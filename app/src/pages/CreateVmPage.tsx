// Create VM page — 3-step wizard (Name -> Hardware -> Options) + confirmation.

import { useState, useEffect, useRef } from 'react'
import type { CreateVmParams } from '../electron.d'
import LogPanel from '../components/LogPanel'
import ProgressBar from '../components/ProgressBar'

type PageState = 'idle' | 'running' | 'done' | 'next-steps'
type Step = 1 | 2 | 3 | 4

const DISK_TYPES = ['VDI', 'VMDK', 'VHD']
const NIC_TYPES  = ['nat', 'bridged', 'host-only', 'none']

export default function CreateVmPage({ onScriptRunning }: { onScriptRunning: (running: boolean) => void }) {
  // Form fields
  const [vmName,   setVmName]   = useState('')
  const [vmFolder, setVmFolder] = useState('')
  const [isoPath,  setIsoPath]  = useState('')
  const [ramMB,    setRamMB]    = useState(4096)
  const [cpus,       setCpus]       = useState(4)
  const [diskMB,     setDiskMB]     = useState(40000)
  const [diskType,   setDiskType]   = useState('VDI')
  const [vramMB,     setVramMB]     = useState(128)
  const [nicType,    setNicType]    = useState('nat')
  const [startAfter, setStartAfter] = useState(false)

  // Wizard + execution state
  const [step,          setStep]          = useState<Step>(1)
  const [pageState,     setPageState]     = useState<PageState>('idle')
  const [logLines,      setLogLines]      = useState<{ text: string; source: 'stdout' | 'stderr' }[]>([])
  const [success,       setSuccess]       = useState<boolean | null>(null)
  const [existingNames, setExistingNames] = useState<string[]>([])
  const [showLog,       setShowLog]       = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pageState === 'done') {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [pageState])

  useEffect(() => {
    onScriptRunning(pageState === 'running')
  }, [pageState, onScriptRunning])

  useEffect(() => {
    window.electronAPI.listVms().then((result) => {
      if (result.ok) setExistingNames(result.vms.map((v) => v.name))
    })
  }, [])

  const trimmedName  = vmName.trim()
  const nameConflict = trimmedName !== '' && existingNames.includes(trimmedName)
  const step1Valid   = trimmedName !== '' && isoPath.trim() !== ''

  const ramError  = ramMB  < 1024  ? 'Minimum 1024 MB'            : null
  const cpusError = cpus   < 1     ? 'Minimum 1'                   : cpus > 32   ? 'Maximum 32'   : null
  const diskError = diskMB < 10000 ? 'Minimum 10000 MB (10 GB)'    : null
  const vramError = vramMB < 16    ? 'Minimum 16 MB'               : vramMB > 256 ? 'Maximum 256 MB' : null
  const step2Valid = !ramError && !cpusError && !diskError && !vramError

  async function handleCreate() {
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
                onClick={() => setPageState('next-steps')}
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
                onClick={() => setPageState('idle')}
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
                Follow these steps inside the VM to finish setting up Fedora.
              </p>
            </div>
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-5 space-y-4">
              <NextStep number={1} title="Complete the Fedora installer">
                <p className="text-zinc-400 text-sm">
                  Before rebooting, eject the Live ISO:{' '}
                  <span className="text-zinc-300">
                    Devices &rarr; Optical Drives &rarr; Remove disk from virtual drive.
                  </span>
                </p>
                <p className="text-zinc-400 text-sm mt-1">
                  Then reboot. On first boot the GNOME wizard will ask you to create your user
                  account.
                </p>
              </NextStep>
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

      {/* Scrollable form area */}
      <div className="flex-1 overflow-y-auto min-h-0">

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
                  const result = await window.electronAPI.pickIso()
                  if (result.filePath) setIsoPath(result.filePath)
                }}
                placeholder="Click to browse for the ISO file"
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
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">RAM (MB)</label>
                <input
                  type="number"
                  value={ramMB}
                  onChange={(e) => setRamMB(Number(e.target.value))}
                  min={1024}
                  step={512}
                  className={ic}
                />
                {ramError && <p className="text-red-400 text-xs mt-1">{ramError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">CPUs</label>
                <input
                  type="number"
                  value={cpus}
                  onChange={(e) => setCpus(Number(e.target.value))}
                  min={1}
                  max={32}
                  className={ic}
                />
                {cpusError && <p className="text-red-400 text-xs mt-1">{cpusError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Disk Size (MB)
                </label>
                <input
                  type="number"
                  value={diskMB}
                  onChange={(e) => setDiskMB(Number(e.target.value))}
                  min={10000}
                  step={1000}
                  className={ic}
                />
                {diskError && <p className="text-red-400 text-xs mt-1">{diskError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Video RAM (MB)
                </label>
                <input
                  type="number"
                  value={vramMB}
                  onChange={(e) => setVramMB(Number(e.target.value))}
                  min={16}
                  max={256}
                  className={ic}
                />
                {vramError && <p className="text-red-400 text-xs mt-1">{vramError}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Disk Type</label>
              <select
                value={diskType}
                onChange={(e) => setDiskType(e.target.value)}
                className={ic}
              >
                {DISK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
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
          <div className="space-y-3">
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
                  <ConfirmRow label="RAM"       value={`${ramMB} MB`} />
                  <ConfirmRow label="CPUs"      value={String(cpus)} />
                  <ConfirmRow label="Disk Size" value={`${diskMB} MB`} />
                  <ConfirmRow label="Video RAM" value={`${vramMB} MB`} />
                  <ConfirmRow label="Disk Type" value={diskType} />
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
        {step === 1 && <StepNav onBack={null} onNext={() => setStep(2)} nextEnabled={step1Valid} />}
        {step === 2 && <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextEnabled={step2Valid} />}
        {step === 3 && <StepNav onBack={() => setStep(2)} onNext={() => setStep(4)} nextEnabled={true} nextLabel="Review" />}
        {step === 4 && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(3)}
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
    <div className="px-4 py-2.5">
      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex text-sm">
      <span className="w-32 text-zinc-400 shrink-0">{label}</span>
      <span className="text-zinc-200 break-all">{value}</span>
    </div>
  )
}


interface NextStepProps {
  number:   number
  title:    string
  children: React.ReactNode
}

function NextStep({ number, title, children }: NextStepProps) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-zinc-700 text-zinc-300 text-xs font-bold flex items-center justify-center mt-0.5">
        {number}
      </span>
      <div className="flex-1">
        <p className="text-zinc-200 text-sm font-medium mb-1">{title}</p>
        {children}
      </div>
    </div>
  )
}
