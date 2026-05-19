import { useState, useEffect } from 'react'
import type { Vm, VmInfo } from '../electron.d'
import ShareFolderPage from './ShareFolderPage'
import ShareLogsPage from './ShareLogsPage'
import VmRunningBadge from '../components/VmRunningBadge'

interface VmEditPageProps {
  vm: Vm
  onBack: () => void
  onScriptRunning: (running: boolean) => void
}

type View = 'detail' | 'share-folder' | 'share-logs'

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

export default function VmEditPage({ vm, onBack, onScriptRunning }: VmEditPageProps) {
  const [view, setView]           = useState<View>('detail')
  const [info, setInfo]           = useState<VmInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.getVmInfo(vm.name).then((result) => {
      if (result.ok) {
        const { ok: _ok, ...rest } = result as { ok: true } & VmInfo
        setInfo(rest as VmInfo)
      } else {
        setLoadError((result as { ok: false; error?: string }).error ?? 'Could not load VM info')
      }
    })
  }, [vm.name])

  if (view === 'share-folder') {
    return <ShareFolderPage vm={vm} onBack={() => setView('detail')} onScriptRunning={onScriptRunning} />
  }

  if (view === 'share-logs') {
    return <ShareLogsPage vm={vm} onBack={() => setView('detail')} onScriptRunning={onScriptRunning} />
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
          className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white rounded text-sm shrink-0"
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
          <div className="w-72 space-y-2">

            <Section
              title="Shared folders"
              action={
                <button
                  onClick={() => setView('share-folder')}
                  className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm"
                >
                  Share
                </button>
              }
            >
              {info.sharedFolders.length > 0 ? (
                info.sharedFolders.map((sf) => (
                  <Row key={sf.name} label={sf.name} value={sf.hostPath} mono />
                ))
              ) : (
                <p className="text-zinc-500 text-sm">None configured</p>
              )}
            </Section>

            <Section
              title="Log sync"
              action={
                <button
                  onClick={() => setView('share-logs')}
                  className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm"
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

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-zinc-500 w-24 shrink-0">{label}</span>
      <span className={mono ? 'text-zinc-300 font-mono text-xs break-all' : 'text-zinc-300'}>
        {value}
      </span>
    </div>
  )
}
