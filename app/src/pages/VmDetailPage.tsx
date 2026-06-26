import { useState, useEffect } from 'react'
import type { Vm, VmInfo } from '../electron.d'
import ShareFolderPage from './ShareFolderPage'
import ShareLogsPage from './ShareLogsPage'
import ProvisionPage from './ProvisionPage'
import { useAuthGate } from '../hooks/useAuthGate'
import VmLoginPage from './VmLoginPage'
import WarnIcon from '../components/WarnIcon'

// Maps detect-installed.sh JSON keys to user-facing labels, grouped by category.
const TOOL_GROUPS: { category: string; tools: { key: string; label: string }[] }[] = [
  {
    category: 'System',
    tools: [
      { key: 'baseSetup', label: 'Base Setup' },
    ],
  },
  {
    category: 'Languages',
    tools: [
      { key: 'java',   label: 'Java' },
      { key: 'php',    label: 'PHP' },
      { key: 'python', label: 'Python' },
      { key: 'node',   label: 'Node.js' },
    ],
  },
  {
    category: 'Build Tools',
    tools: [
      { key: 'maven', label: 'Maven' },
    ],
  },
  {
    category: 'Web Servers',
    tools: [
      { key: 'httpd',  label: 'Apache HTTP Server' },
      { key: 'tomcat', label: 'Tomcat' },
    ],
  },
  {
    category: 'Databases',
    tools: [
      { key: 'mariadb',    label: 'MariaDB' },
      { key: 'postgresql', label: 'PostgreSQL' },
    ],
  },
  {
    category: 'IDEs',
    tools: [
      { key: 'eclipse',          label: 'Eclipse IDE' },
      { key: 'intellij',         label: 'IntelliJ IDEA CE' },
      { key: 'visualStudioCode', label: 'VS Code' },
    ],
  },
  {
    category: 'Containers',
    tools: [
      { key: 'docker',   label: 'Docker CE' },
      { key: 'minikube', label: 'Minikube' },
      { key: 'k3s',      label: 'k3s' },
    ],
  },
  {
    category: 'Cloud',
    tools: [
      { key: 'awsCli', label: 'AWS CLI' },
      { key: 'ecsCli', label: 'Amazon ECS CLI' },
    ],
  },
  {
    category: 'Security',
    tools: [
      { key: 'openssl', label: 'OpenSSL' },
    ],
  },
  {
    category: 'VCS',
    tools: [
      { key: 'git', label: 'Git' },
    ],
  },
  {
    category: 'Editors',
    tools: [
      { key: 'vim', label: 'Vim' },
    ],
  },
  {
    category: 'Desktop',
    tools: [
      { key: 'flameshot', label: 'Flameshot' },
      { key: 'dbeaver',   label: 'DBeaver CE' },
      { key: 'chrome',    label: 'Google Chrome' },
      { key: 'wireshark', label: 'Wireshark' },
    ],
  },
  {
    category: 'Automation',
    tools: [
      { key: 'ansible', label: 'Ansible' },
    ],
  },
  {
    category: 'AI Tools',
    tools: [
      { key: 'claudeCode', label: 'Claude Code' },
    ],
  },
]

interface VmDetailPageProps {
  vm: Vm
  onBack: () => void
  onScriptRunning: (running: boolean) => void
  refreshKey?: number
  initialView?: View
  isActive?: boolean
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


export default function VmDetailPage({ vm, onBack, onScriptRunning, refreshKey, initialView, isActive = true }: VmDetailPageProps) {
  type ToolsStatus = 'idle' | 'loading' | 'ok' | 'stopped' | 'no-credentials' | 'error'

  const [view, setView]               = useState<View>(initialView ?? 'detail')
  const [info, setInfo]               = useState<VmInfo | null>(null)
  const [loadError, setLoadError]     = useState<string | null>(null)
  const [infoKey, setInfoKey]         = useState(0)
  const [toolsKey, setToolsKey]       = useState(0)
  const [toolsStatus,    setToolsStatus]    = useState<ToolsStatus>('idle')
  const [installedTools, setInstalledTools] = useState<Record<string, string | boolean>>({})
  const [missingOpen,    setMissingOpen]    = useState(false)
  const [rightTab,       setRightTab]       = useState<'overview' | 'tools'>('overview')

  const { withAuth, loginRequired, onLoginSuccess, onLoginBack } = useAuthGate(vm.name)

  function backToDetail() {
    setView('detail')
    setInfoKey((k) => k + 1)
  }

  useEffect(() => {
    if (view === 'provision') return
    setInfo(null)
    setLoadError(null)
    window.electronAPI.getVmInfo(vm.name).then((result) => {
      if (result.ok) {
        setInfo(result.info)
      } else {
        setLoadError(result.error ?? 'Could not load VM info')
      }
    })
  }, [vm.name, refreshKey, infoKey, view])

  // Query installed tools whenever VM state or VM name changes.
  // Cancels the in-flight guestcontrol process when the user navigates away.
  useEffect(() => {
    if (!isActive) {
      window.electronAPI.cancelQueryVmInstalled(vm.name)
      return
    }
    if (view === 'provision') return
    if (!info) return
    if (info.state !== 'running') {
      setToolsStatus('stopped')
      setInstalledTools({})
      return
    }
    setToolsStatus('loading')
    let stale = false
    window.electronAPI.queryVmInstalled(vm.name).then((result) => {
      if (stale) return
      if (result.ok) {
        const knownKeys = new Set(TOOL_GROUPS.flatMap((g) => g.tools).map((t) => t.key))
        const filtered: Record<string, string | boolean> = {}
        for (const [key, val] of Object.entries(result.installed)) {
          if (knownKeys.has(key) && val) filtered[key] = val
        }
        setInstalledTools(filtered)
        setToolsStatus('ok')
      } else if (result.vmStopped) {
        setToolsStatus('stopped')
      } else if (result.noCredentials) {
        setToolsStatus('no-credentials')
      } else {
        setToolsStatus('error')
      }
    })
    return () => {
      stale = true
      window.electronAPI.cancelQueryVmInstalled(vm.name)
    }
  }, [isActive, info?.state, vm.name, toolsKey, view])

  if (view === 'share-folder') {
    return <ShareFolderPage vm={vm} onBack={backToDetail} onScriptRunning={onScriptRunning} />
  }

  if (view === 'provision') {
    return (
      <div className="h-full">
        <ProvisionPage vm={vm} onBack={onBack} onScriptRunning={onScriptRunning} />
      </div>
    )
  }

  if (loginRequired && view !== 'share-logs') {
    return (
      <div className="h-full overflow-y-auto">
        <VmLoginPage initialVmName={vm.name} onBack={onLoginBack} onNext={onLoginSuccess} />
      </div>
    )
  }

  const diskValue = info?.diskCapacityMB != null
    ? `${Math.round(info.diskCapacityMB / 1024)} GB (${info.diskType ?? 'dynamic'})`
    : '-'

  return (
    <>
    <div style={{ display: view === 'share-logs' ? '' : 'none' }} className="h-full">
      <ShareLogsPage vm={vm} onBack={backToDetail} onScriptRunning={onScriptRunning} />
    </div>
    <div style={{ display: view === 'share-logs' ? 'none' : '' }} className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 mb-3 shrink-0">
        <button
          onClick={() => { window.electronAPI.logUiAction(`detail "${vm.name}": Back`); onBack() }}
          className="px-3 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors shrink-0"
        >
          &larr; Back
        </button>
        <h1 className="text-xl font-semibold text-zinc-100 truncate">{vm.name}</h1>
      </div>

      {loadError && (
        <div className="shrink-0 bg-red-900 border border-red-700 rounded-lg p-3 text-red-200 text-sm">
          {/E_ACCESSDENIED/i.test(loadError) || /LockMachine|VBOX_E_VM_ERROR/i.test(loadError)
            ? 'VM is starting up - info will be available shortly.'
            : loadError}
        </div>
      )}

      {!info && !loadError && (
        <p className="shrink-0 text-zinc-500 text-sm">Loading VM info...</p>
      )}

      {info && (
        <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">

          {/* Left column â€" read-only info */}
          <div className="flex-1 flex flex-col gap-2 overflow-hidden">

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
              <Row label="MAC"       value={info.mac ? formatMac(info.mac) : '-'} />
            </Section>

          </div>

          {/* Right column - tabs */}
          <div className="flex-1 min-w-0 flex flex-col gap-2 overflow-hidden">

            {/* Tab bar */}
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => setRightTab('overview')}
                className={`px-3 py-1 text-xs rounded transition-colors ${rightTab === 'overview' ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
              >
                Overview
              </button>
              <button
                onClick={() => setRightTab('tools')}
                className={`px-3 py-1 text-xs rounded transition-colors ${rightTab === 'tools' ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'}`}
              >
                Tools
              </button>
            </div>

            {rightTab === 'overview' && (
              <>
              <Section
                title="Log sync"
                action={
                  <button
                    onClick={() => { window.electronAPI.logUiAction(`detail "${vm.name}": Sync Logs`); setView('share-logs') }}
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
              <Section
                title="Shared folders"
                action={
                  <button
                    onClick={() => { window.electronAPI.logUiAction(`detail "${vm.name}": Share Folder`); setView('share-folder') }}
                    className="px-3 py-1 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors"
                  >
                    Share
                  </button>
                }
              >
                {(() => {
                  const valid   = info.sharedFolders.filter((sf) =>  sf.existsOnHost)
                  const missing = info.sharedFolders.filter((sf) => !sf.existsOnHost)
                  if (info.sharedFolders.length === 0)
                    return <p className="text-zinc-500 text-sm">None configured</p>
                  return (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-3">
                        <span className="text-zinc-500 text-xs">Host folder</span>
                        <span className="text-zinc-500 text-xs">VM folder</span>
                      </div>
                      <div className="space-y-0">
                        {valid.map((sf) => (
                          <div key={sf.name} className="grid grid-cols-2 gap-3">
                            <CopyCell value={sf.hostPath} />
                            <CopyCell value={sf.mountPoint || '-'} copyable={!!sf.mountPoint} />
                          </div>
                        ))}
                      </div>
                      {missing.length > 0 && (
                        <div className="relative">
                          <button
                            onClick={() => setMissingOpen((o) => !o)}
                            className="flex items-center gap-1 text-amber-400 text-xs hover:text-amber-300 transition-colors"
                          >
                            <span>{missingOpen ? '▾' : '▸'}</span>
                            <span>&#9888; {missing.length} host {missing.length === 1 ? 'folder' : 'folders'} not found</span>
                          </button>
                          {missingOpen && (
                            <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-zinc-800 border border-zinc-700 rounded-lg p-3 space-y-2">
                              <div className="grid grid-cols-2 gap-3">
                                <span className="text-zinc-500 text-xs">Host folder</span>
                                <span className="text-zinc-500 text-xs">VM folder</span>
                              </div>
                              {missing.map((sf) => (
                                <div key={sf.name} className="grid grid-cols-2 gap-3">
                                  <CopyCell value={sf.hostPath} missing />
                                  <CopyCell value={sf.mountPoint || '-'} copyable={!!sf.mountPoint} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </Section>
              </>
            )}

            {rightTab === 'tools' && (
              <div className="flex-1 min-h-0 bg-zinc-800 border border-zinc-700 rounded-lg flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-2 pt-2 pb-1.5 shrink-0">
                  <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Installed tools</h2>
                  {info.state === 'running' && (
                    <button
                      onClick={() => { window.electronAPI.logUiAction(`detail "${vm.name}": refresh Installed Tools`); withAuth(() => setToolsKey((k) => k + 1)) }}
                      disabled={toolsStatus === 'loading'}
                      className="px-2 py-0.5 text-xs border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {toolsStatus === 'loading' ? 'Checking...' : 'Refresh'}
                    </button>
                  )}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 pb-2">
                  {toolsStatus === 'idle' || toolsStatus === 'loading' ? (
                    <p className="text-zinc-500 text-sm">Checking...</p>
                  ) : toolsStatus === 'stopped' ? (
                    <p className="text-zinc-500 text-sm">VM is stopped - data not available</p>
                  ) : toolsStatus === 'no-credentials' ? (
                    <p className="text-zinc-500 text-sm">Save credentials in Provision to enable this check</p>
                  ) : toolsStatus === 'error' ? (
                    <p className="text-zinc-500 text-sm">Could not connect to VM</p>
                  ) : Object.keys(installedTools).length > 0 ? (() => {
                    const groups = TOOL_GROUPS
                      .map((group) => ({
                        category: group.category,
                        installed: group.tools.filter((t) => installedTools[t.key]),
                      }))
                      .filter((group) => group.installed.length > 0)
                    return (
                      <div className="flex gap-4 pt-0.5">
                        {[0, 1].map((col) => (
                          <div key={col} className="flex-1 min-w-0 space-y-2">
                            {groups.filter((_, i) => i % 2 === col).map((group) => (
                              <div key={group.category}>
                                <div className="text-zinc-500 text-[10px] font-semibold uppercase tracking-wider border-b border-zinc-700 pb-0.5 mb-1">
                                  {group.category}
                                </div>
                                <div className="space-y-1">
                                  {group.installed.map((tool) => {
                                    const val = installedTools[tool.key]
                                    const rawVersions = typeof val === 'string' ? val.split(', ') : []
                                    const versions = tool.key === 'java'
                                      ? (() => {
                                          const active = rawVersions.find(v => v.endsWith(' (active)'))
                                          return active ? [active.replace(' (active)', '')] : rawVersions.slice(0, 1)
                                        })()
                                      : rawVersions
                                    return (
                                      <div key={tool.key} className="min-w-0">
                                        <div className="text-zinc-300 text-xs leading-tight">{tool.label}</div>
                                        {versions.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mt-0.5">
                                            {versions.map((v) => {
                                              const isActive = v.endsWith(' (active)')
                                              const ver = isActive ? v.replace(' (active)', '') : v
                                              return (
                                                <span
                                                  key={ver}
                                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] leading-none ${
                                                    isActive
                                                      ? 'bg-zinc-700 text-zinc-200 ring-1 ring-green-500/40'
                                                      : 'bg-zinc-900 text-zinc-500'
                                                  }`}
                                                >
                                                  {ver}
                                                  {isActive && <span className="text-green-500 text-[9px]">active</span>}
                                                </span>
                                              )
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )
                  })() : (
                    <p className="text-zinc-500 text-sm">Nothing installed yet</p>
                  )}
                </div>
              </div>
            )}

          </div>

        </div>
      )}
    </div>
    </>
  )
}

// â"€â"€ Sub-components â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-2">
      <div className="flex items-center justify-between mb-1.5">
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
          <WarnIcon hint="Host folder not found" />
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
      <span className="text-zinc-500 w-20 shrink-0">{label}</span>
      <span className={mono ? 'text-zinc-300 font-mono text-xs truncate min-w-0' : 'text-zinc-300'}>
        {value}
      </span>
      {mono && (
        <button
          onClick={handleCopy}
          className="ml-auto shrink-0 flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white text-xs invisible group-hover:visible"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      )}
    </div>
  )
}
