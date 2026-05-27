import { useState, useEffect } from 'react'
import type { Vm, VmInfo, ProvisionedEntry } from '../electron.d'
import ShareFolderPage from './ShareFolderPage'
import ShareLogsPage from './ShareLogsPage'
import ProvisionPage from './ProvisionPage'
import VmRunningBadge from '../components/VmRunningBadge'

interface VmEditPageProps {
  vm: Vm
  onBack: () => void
  onScriptRunning: (running: boolean) => void
  refreshKey?: number
  initialView?: View
}

type View = 'detail' | 'share-folder' | 'share-logs' | 'provision'

function formatMac(raw: string): string {
  return raw.replace(/(..)(?!$)/g, '$1:').toUpperCase()
}

function formatNic(raw: string): string {
  const labels: Record<string, string> = {
    nat:        'NAT',
    natnetwork: 'NAT Network',
    bridged:    'Bridged',
    intnet:     'Internal Network',
    hostonly:   'Host-Only',
    null:       'Not attached',
  }
  return labels[raw.toLowerCase()] ?? raw
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatProvisionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function VmEditPage({ vm, onBack, onScriptRunning, refreshKey, initialView }: VmEditPageProps) {
  const [view, setView]               = useState<View>(initialView ?? 'detail')
  const [info, setInfo]               = useState<VmInfo | null>(null)
  const [loadError, setLoadError]     = useState<string | null>(null)
  const [infoKey, setInfoKey]         = useState(0)
  const [provisioned, setProvisioned] = useState<ProvisionedEntry[]>([])

  function backToDetail() {
    setView('detail')
    setInfoKey((k) => k + 1)
  }

  useEffect(() => {
    setInfo(null)
    setLoadError(null)
    window.electronAPI.getVmInfo(vm.name).then((result) => {
      if (result.ok) {
        setInfo(result.info)
      } else {
        setLoadError(result.error ?? 'Could not load VM info')
      }
    })
  }, [vm.name, refreshKey, infoKey])

  useEffect(() => {
    window.electronAPI.loadVmCredentials(vm.name).then((saved) => {
      setProvisioned(saved.provisioned ?? [])
    })
  }, [vm.name, infoKey])

  if (view === 'share-folder') {
    return <ShareFolderPage vm={vm} onBack={backToDetail} onScriptRunning={onScriptRunning} />
  }

  if (view === 'share-logs') {
    return <ShareLogsPage vm={vm} onBack={backToDetail} onScriptRunning={onScriptRunning} />
  }

  if (view === 'provision') {
    return (
      <div className="h-full">
        <ProvisionPage vm={vm} onBack={onBack} onScriptRunning={onScriptRunning} />
      </div>
    )
  }

  const diskValue = info?.diskCapacityMB != null
    ? `${Math.round(info.diskCapacityMB / 1024)} GB (${info.diskType ?? 'dynamic'})`
    : '—'

  const gaValue = info
    ? info.gaVersion ?? (info.state === 'running' ? 'Not installed' : 'Start VM to check')
    : ''

  return (
    <div className="w-full">

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="px-3 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors shrink-0"
        >
          &larr; Back
        </button>
        <h1 className="text-xl font-semibold text-zinc-100 truncate">{vm.name}</h1>
        <VmRunningBadge running={vm.running} />
      </div>

      {loadError && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-3 text-red-200 text-sm">
          {loadError}
        </div>
      )}

      {!info && !loadError && (
        <p className="text-zinc-500 text-sm">Loading VM info...</p>
      )}

      {info && (
        <div className="flex gap-4">

          {/* Left column — read-only info */}
          <div className="flex-1 space-y-2">

            <Section title="General">
              <Row label="OS type" value={info.osType} />
              <Row label="State"   value={capitalize(info.state)} />
            </Section>

            <Section title="Hardware">
              <Row label="RAM"   value={`${info.ramMB.toLocaleString()} MB`} />
              <Row label="CPUs"  value={String(info.cpus)} />
              <Row label="VRAM"  value={`${info.vramMB} MB`} />
              <Row label="Disk"  value={diskValue} />
            </Section>

            <Section title="Network">
              <Row label="Adapter 1" value={formatNic(info.nic)} />
              <Row label="MAC"       value={info.mac ? formatMac(info.mac) : '—'} />
            </Section>

            <Section title="Guest Additions">
              <Row label="Version" value={gaValue} />
            </Section>

          </div>

          {/* Right column — action sections */}
          <div className="flex-1 min-w-0 space-y-2">

            <Section
              title="Shared folders"
              action={
                <button
                  onClick={() => setView('share-folder')}
                  className="px-3 py-1 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors"
                >
                  Share
                </button>
              }
            >
              {info.sharedFolders.length > 0 ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <span className="text-zinc-500 text-xs">Host folder</span>
                    <span className="text-zinc-500 text-xs">VM folder</span>
                  </div>
                  {info.sharedFolders.map((sf) => (
                    <div key={sf.name} className="grid grid-cols-2 gap-3">
                      <CopyCell value={sf.hostPath} missing={!sf.existsOnHost} />
                      <CopyCell value={sf.mountPoint || '—'} copyable={!!sf.mountPoint} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-500 text-sm">None configured</p>
              )}
            </Section>

            <Section
              title="Log sync"
              action={
                <button
                  onClick={() => setView('share-logs')}
                  className="px-3 py-1 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors"
                >
                  Sync
                </button>
              }
            >
              <Row
                label="Destination"
                value={info.logSyncPath ?? 'Not configured'}
                mono={!!info.logSyncPath}
              />
            </Section>

            <Section title="Installed tools">
              {provisioned.length > 0 ? (
                <div className="space-y-1.5">
                  {[...provisioned]
                    .sort((a, b) => b.at.localeCompare(a.at))
                    .map((entry) => (
                      <div key={entry.scriptRelPath} className="flex items-center gap-2 text-sm">
                        <span className="text-green-400 text-xs shrink-0">&#10003;</span>
                        <span className="text-zinc-300 flex-1 min-w-0 truncate">{entry.label}</span>
                        <span className="text-zinc-500 text-xs shrink-0">{formatProvisionDate(entry.at)}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-zinc-500 text-sm">Nothing installed yet</p>
              )}
            </Section>

          </div>

        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">{title}</h2>
        {action}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function CopyCell({ label, value, copyable = true, missing = false }: { label?: string; value: string; copyable?: boolean; missing?: boolean }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="min-w-0 group">
      {label && <p className="text-zinc-500 text-xs mb-0.5">{label}</p>}
      <div className="flex items-center gap-1 min-w-0">
        {missing && (
          <span className="shrink-0 text-amber-400 text-xs" title="Host folder not found">&#9888;</span>
        )}
        <span className={`font-mono text-xs truncate min-w-0 ${missing ? 'text-amber-400' : 'text-zinc-300'}`}>{value}</span>
        {copyable && (
          <button
            onClick={handleCopy}
            className="shrink-0 invisible group-hover:visible px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white text-xs"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative flex items-center gap-2 text-sm min-w-0 group">
      <span className="text-zinc-500 w-24 shrink-0">{label}</span>
      <span className={mono ? 'text-zinc-300 font-mono text-xs truncate min-w-0' : 'text-zinc-300'}>
        {value}
      </span>
      {mono && (
        <button
          onClick={handleCopy}
          className="ml-auto shrink-0 hidden group-hover:flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white text-xs"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      )}
    </div>
  )
}
