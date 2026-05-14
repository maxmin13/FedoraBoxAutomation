// Create VM page — form to configure and create a new Fedora VirtualBox VM.
// Streams script output while the PS1 runs; shows success/failure when done.

import { useState, useEffect, useRef } from 'react'
import type { CreateVmParams } from '../electron.d'

type PageState = 'idle' | 'running' | 'done'

const DISK_TYPES = ['VDI', 'VMDK', 'VHD']
const NIC_TYPES = ['nat', 'bridged', 'host-only', 'none']

export default function CreateVmPage() {
  const [vmName, setVmName] = useState('')
  const [vmFolder, setVmFolder] = useState('')
  const [isoPath, setIsoPath] = useState('')
  const [ramMB, setRamMB] = useState(4096)
  const [cpus, setCpus] = useState(4)
  const [diskMB, setDiskMB] = useState(40000)
  const [diskType, setDiskType] = useState('VDI')
  const [vramMB, setVramMB] = useState(128)
  const [nicType, setNicType] = useState('nat')
  const [attachGA, setAttachGA] = useState(true)
  const [startAfter, setStartAfter] = useState(false)

  const [pageState, setPageState] = useState<PageState>('idle')
  const [logLines, setLogLines] = useState<string[]>([])
  const [success, setSuccess] = useState<boolean | null>(null)
  const [existingNames, setExistingNames] = useState<string[]>([])
  const [showLog, setShowLog] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pageState === 'running') {
      setShowLog(true)
    }
    if (pageState === 'done') {
      setShowLog(false)
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [pageState])

  useEffect(() => {
    window.electronAPI.listVms().then((result) => {
      if (result.ok) {
        setExistingNames(result.vms.map((v) => v.name))
      }
    })
  }, [])

  const trimmedName = vmName.trim()
  const nameConflict = trimmedName !== '' && existingNames.includes(trimmedName)
  const isRunning = pageState === 'running'
  const canSubmit = trimmedName !== '' && isoPath.trim() !== '' && !isRunning

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setPageState('running')
    setLogLines([])
    setSuccess(null)

    // Subscribe to live output while the script runs.
    // onScriptLine returns a cleanup function — call it after the script finishes.
    const unsub = window.electronAPI.onScriptLine((line) => {
      setLogLines((prev) => [...prev, line.text])
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
      attachGuestAdditions: attachGA,
      startVm: startAfter,
      forceRecreate: nameConflict,
    }

    const result = await window.electronAPI.createVm(params)

    unsub()
    setSuccess(result.ok)
    setPageState('done')
  }

  const inputClass =
    'w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded text-zinc-100 text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-50'

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100">Create VM</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Configure and create a new Fedora VirtualBox VM.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* VM Name */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            VM Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={vmName}
            onChange={(e) => setVmName(e.target.value)}
            disabled={isRunning}
            placeholder="e.g. FedoraBox"
            className={inputClass}
          />
          {nameConflict && (
            <p className="text-yellow-400 text-xs mt-1">
              A VM named "{trimmedName}" already exists — submitting will unregister and recreate it (files kept).
            </p>
          )}
        </div>

        {/* ISO Path */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Fedora ISO Path <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={isoPath}
            onChange={(e) => setIsoPath(e.target.value)}
            disabled={isRunning}
            placeholder="C:\Users\you\Downloads\Fedora-Workstation-Live-x86_64-40-1.14.iso"
            className={inputClass}
          />
        </div>

        {/* VM Folder */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            VM Folder{' '}
            <span className="text-zinc-500 font-normal">(optional — uses VirtualBox default)</span>
          </label>
          <input
            type="text"
            value={vmFolder}
            onChange={(e) => setVmFolder(e.target.value)}
            disabled={isRunning}
            placeholder="Leave empty to use the default VirtualBox VMs folder"
            className={inputClass}
          />
        </div>

        {/* Numeric fields — two columns */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">RAM (MB)</label>
            <input
              type="number"
              value={ramMB}
              onChange={(e) => setRamMB(Number(e.target.value))}
              disabled={isRunning}
              min={1024}
              step={512}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">CPUs</label>
            <input
              type="number"
              value={cpus}
              onChange={(e) => setCpus(Number(e.target.value))}
              disabled={isRunning}
              min={1}
              max={32}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Disk Size (MB)</label>
            <input
              type="number"
              value={diskMB}
              onChange={(e) => setDiskMB(Number(e.target.value))}
              disabled={isRunning}
              min={10000}
              step={1000}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Video RAM (MB)</label>
            <input
              type="number"
              value={vramMB}
              onChange={(e) => setVramMB(Number(e.target.value))}
              disabled={isRunning}
              min={16}
              max={256}
              className={inputClass}
            />
          </div>
        </div>

        {/* Select fields — two columns */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Disk Type</label>
            <select
              value={diskType}
              onChange={(e) => setDiskType(e.target.value)}
              disabled={isRunning}
              className={inputClass}
            >
              {DISK_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Network</label>
            <select
              value={nicType}
              onChange={(e) => setNicType(e.target.value)}
              disabled={isRunning}
              className={inputClass}
            >
              {NIC_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Checkboxes */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={attachGA}
              onChange={(e) => setAttachGA(e.target.checked)}
              disabled={isRunning}
              className="accent-blue-500"
            />
            <span className="text-sm text-zinc-300">Attach Guest Additions ISO</span>
            <span className="text-xs text-zinc-500">
              (recommended — needed for clipboard, drag-and-drop, and provisioning)
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={startAfter}
              onChange={(e) => setStartAfter(e.target.checked)}
              disabled={isRunning}
              className="accent-blue-500"
            />
            <span className="text-sm text-zinc-300">Start VM after creation</span>
          </label>
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-6 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? 'Creating...' : nameConflict ? 'Recreate VM' : 'Create VM'}
          </button>
        </div>
      </form>

      {/* Log panel — shown while running; moves inside result section when done */}
      {isRunning && (
        <div className="mt-6 bg-zinc-800 border border-zinc-700 rounded-lg">
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
              {isRunning ? 'Script output...' : 'Script output'}
            </span>
            <span className="text-zinc-500 text-xs">
              {showLog ? 'Hide' : 'Show'}
            </span>
          </button>

          {showLog && (
            <div className="px-4 pb-4 font-mono text-xs text-zinc-400 max-h-64 overflow-y-auto space-y-0.5">
              {logLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Result banners */}
      {pageState === 'done' && success === true && (
        <div ref={resultRef} className="mt-4 space-y-4">
          <div className="bg-green-900 border border-green-700 rounded-lg p-4">
            <p className="text-green-200 font-medium">VM created successfully.</p>
            <p className="text-green-300 text-sm mt-1">
              Go to My VMs to start the VM, then follow the steps below.
            </p>
          </div>

          {logLines.length > 0 && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg">
              <button
                type="button"
                onClick={() => setShowLog((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
                  Script output
                </span>
                <span className="text-zinc-500 text-xs">{showLog ? 'Hide' : 'Show'}</span>
              </button>
              {showLog && (
                <div className="px-4 pb-4 font-mono text-xs text-zinc-400 max-h-64 overflow-y-auto space-y-0.5">
                  {logLines.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-5 space-y-4">
            <p className="text-zinc-200 font-medium">What to do next</p>

            <NextStep number={1} title="Complete the Fedora installer">
              <p className="text-zinc-400 text-sm">
                Before rebooting, eject the Live ISO: <span className="text-zinc-300">Devices &rarr; Optical Drives &rarr; Remove disk from virtual drive.</span>
              </p>
              <p className="text-zinc-400 text-sm mt-1">
                Then reboot. On first boot the GNOME wizard will ask you to create your user account.
              </p>
            </NextStep>

            <NextStep number={2} title="Install Guest Additions and disable SELinux">
              <p className="text-zinc-400 text-sm mb-2">Open a terminal inside the VM and run:</p>
              <CodeBlock lines={[
                'sudo dnf update -y',
                'sudo dnf install -y dkms kernel-devel-$(uname -r) kernel-headers gcc make perl bzip2',
                "sudo sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config",
                'sudo mkdir -p /mnt/ga',
                'sudo mount /dev/sr1 /mnt/ga   # if it fails, try /dev/sr0 (run lsblk to check)',
                'sudo /mnt/ga/VBoxLinuxAdditions.run',
              ]} />
            </NextStep>

            <NextStep number={3} title="Set root password and reboot">
              <CodeBlock lines={['sudo passwd root', 'sudo reboot']} />
            </NextStep>

            <NextStep number={4} title="Provision the VM">
              <p className="text-zinc-400 text-sm">
                Once rebooted with Guest Additions active, use <span className="text-zinc-300">provision-vm.ps1</span> (or the Provision page, when available) to install dev tools.
              </p>
            </NextStep>
          </div>
        </div>
      )}

      {pageState === 'done' && success === false && (
        <div ref={resultRef} className="mt-4 space-y-4">
          <div className="bg-red-900 border border-red-700 rounded-lg p-4">
            <p className="text-red-200 font-medium">VM creation failed.</p>
            <p className="text-red-300 text-sm mt-1">
              Check the script output for details.
            </p>
          </div>

          {logLines.length > 0 && (
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg">
              <button
                type="button"
                onClick={() => setShowLog((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">
                  Script output
                </span>
                <span className="text-zinc-500 text-xs">{showLog ? 'Hide' : 'Show'}</span>
              </button>
              {showLog && (
                <div className="px-4 pb-4 font-mono text-xs text-zinc-400 max-h-64 overflow-y-auto space-y-0.5">
                  {logLines.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface NextStepProps {
  number: number
  title: string
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

function CodeBlock({ lines }: { lines: string[] }) {
  return (
    <pre className="bg-zinc-900 border border-zinc-700 rounded p-3 text-xs text-zinc-300 font-mono overflow-x-auto">
      {lines.join('\n')}
    </pre>
  )
}
