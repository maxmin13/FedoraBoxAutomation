import { useState, useEffect } from 'react'
import type { Vm, VmInfo, ScriptLine } from '../electron.d'
import ProgressBar from '../components/ProgressBar'
import { useAuthGate } from '../hooks/useAuthGate'
import VmLoginPage from './VmLoginPage'
import WarnIcon from '../components/WarnIcon'


interface PerformancePageProps {
  vm: Vm
  onBack: () => void
  onScriptRunning?: (running: boolean) => void
}

export default function PerformancePage({ vm, onBack, onScriptRunning }: PerformancePageProps) {
  const [info,      setInfo]      = useState<VmInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [infoKey,   setInfoKey]   = useState(0)
  const [fixing,    setFixing]    = useState<string | null>(null)
  const [fixError,  setFixError]  = useState<string | null>(null)

  const [vmUser,    setVmUser]    = useState('')
  const [vmPass,    setVmPass]    = useState('')
  const [loginUser, setLoginUser] = useState('')

  const [diagState,   setDiagState]   = useState<'idle' | 'running' | 'done'>('idle')
  const [diagLines,   setDiagLines]   = useState<ScriptLine[]>([])
  const [diagError,   setDiagError]   = useState<string | null>(null)
  const [credKey,     setCredKey]     = useState(0)

  const { withAuth, loginRequired, onLoginSuccess, onLoginBack } = useAuthGate(vm.name)

  function handleLoginSuccess() {
    setCredKey(k => k + 1)
    onLoginSuccess()
  }

  useEffect(() => {
    setInfo(null)
    setLoadError(null)
    window.electronAPI.getVmInfo(vm.name).then((result) => {
      if (result.ok) setInfo(result.info)
      else setLoadError(result.error ?? 'Could not load VM info')
    })
  }, [vm.name, infoKey])

  // On mount: load credentials then immediately run diagnostics.
  // infoKey drives re-runs on Refresh so diagnostics mirrors it.
  useEffect(() => {
    window.electronAPI.loadVmCredentials(vm.name).then((saved) => {
      const user  = saved.ok && saved.user      ? saved.user      : ''
      const pass  = saved.ok && saved.pass      ? saved.pass      : ''
      const login = saved.ok && saved.loginUser ? saved.loginUser : ''
      setVmUser(user)
      setVmPass(pass)
      setLoginUser(login)
      runDiagnostics(user, pass, login)
    })
  }, [vm.name, credKey])

  function handleRefresh() {
    window.electronAPI.logUiAction(`performance "${vm.name}": Refresh`)
    setInfoKey((k) => k + 1)
    runDiagnostics(vmUser, vmPass, loginUser)
  }

  async function runDiagnostics(user: string, pass: string, login: string) {
    if (!user || !pass) return
    setDiagLines([])
    setDiagError(null)
    setDiagState('running')
    onScriptRunning?.(true)

    const unsubLine = window.electronAPI.onScriptLine((line) => {
      setDiagLines((prev) => [...prev, line])
    })
    const unsubDone = window.electronAPI.onScriptDone(() => {
      setDiagState('done')
      onScriptRunning?.(false)
      unsubLine()
      unsubDone()
    })

    try {
      const result = await window.electronAPI.runProvisionScript({
        vmName: vm.name,
        vmUser: user,
        vmPass: pass,
        loginUser: login,
        scriptRelPath: 'tools/diagnostics/performance-check.sh',
        scriptArgs: '',
      })
      if (!result.ok) setDiagError('Performance check failed — see output below')
    } catch (e) {
      setDiagError(e instanceof Error ? e.message : 'Failed to run diagnostics')
      setDiagState('done')
      onScriptRunning?.(false)
      unsubLine()
      unsubDone()
    }
  }

  async function handleFix(setting: 'paravirt' | 'nicType' | 'acceleration3d' | 'cpuExecCap') {
    window.electronAPI.logUiAction(`performance "${vm.name}": Fix ${setting}`)
    setFixing(setting)
    setFixError(null)
    try {
      const result = await window.electronAPI.fixVmPerfSetting(vm.name, setting)
      if (result.ok) {
        setInfoKey((k) => k + 1)
      } else {
        setFixError(friendlyFixError(result.error ?? ''))
      }
    } catch (e: unknown) {
      setFixError(friendlyFixError(e instanceof Error ? e.message : ''))
    } finally {
      setFixing(null)
    }
  }

  if (loginRequired) {
    return (
      <div className="h-full overflow-y-auto">
        <VmLoginPage initialVmName={vm.name} onBack={onLoginBack} onNext={handleLoginSuccess} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <button
          onClick={() => { window.electronAPI.logUiAction(`performance "${vm.name}": Back`); onBack() }}
          className="px-3 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors shrink-0"
        >
          &larr; Back
        </button>
        <h1 className="text-xl font-semibold text-zinc-100 truncate">{vm.name}</h1>
        <button
          onClick={() => withAuth(handleRefresh)}
          disabled={diagState === 'running'}
          className="ml-auto px-3 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          Refresh
        </button>
      </div>

      {loadError && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-3 text-red-200 text-sm shrink-0">
          {loadError}
        </div>
      )}

      {!info && !loadError && (
        <p className="text-zinc-500 text-sm shrink-0">Loading...</p>
      )}

      {info && (
        <div className="flex gap-4 flex-1 min-h-0">

          {/* Left: Performance card */}
          <div className="w-64 shrink-0 bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3 self-start">
            <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Performance</h2>

            {fixError && (
              <p className="text-red-400 text-xs">{fixError}</p>
            )}

            <div className="space-y-2">
              {(() => {
                const fix = (setting: 'paravirt' | 'nicType' | 'acceleration3d' | 'cpuExecCap', isWarn: boolean) =>
                  isWarn ? () => handleFix(setting) : undefined
                return (
                  <>
                    <PerfRow
                      label="Paravirt"
                      value={formatParavirt(info.paravirtProvider)}
                      status={paravirtStatus(info.paravirtProvider)}
                      hint={paravirtHint(info.paravirtProvider)}
                      onFix={fix('paravirt', paravirtStatus(info.paravirtProvider) === 'warn')}
                      fixing={fixing === 'paravirt'}
                    />
                    <PerfRow
                      label="NIC type"
                      value={formatNicType(info.nicType)}
                      status={nicTypeStatus(info.nicType)}
                      hint={nicTypeHint(info.nicType)}
                      onFix={fix('nicType', nicTypeStatus(info.nicType) === 'warn')}
                      fixing={fixing === 'nicType'}
                    />
                    <PerfRow
                      label="Storage"
                      value={formatStorageCtrl(info.storageControllerType)}
                      status={storageStatus(info.storageControllerType)}
                      hint={storageHint(info.storageControllerType)}
                    />
                    <PerfRow
                      label="3D accel"
                      value={info.acceleration3d ? 'Enabled' : 'Disabled'}
                      status={info.acceleration3d ? 'good' : 'warn'}
                      hint={!info.acceleration3d ? 'Enable 3D acceleration for better graphics — requires Guest Additions to be installed' : undefined}
                      onFix={fix('acceleration3d', !info.acceleration3d)}
                      fixing={fixing === 'acceleration3d'}
                    />
                    <PerfRow
                      label="CPU cap"
                      value={`${info.cpuExecCap}%`}
                      status={info.cpuExecCap >= 100 ? 'good' : 'warn'}
                      hint={info.cpuExecCap < 100 ? 'CPU cap limits how much host CPU the VM can use — set to 100% for full performance' : undefined}
                      onFix={fix('cpuExecCap', info.cpuExecCap < 100)}
                      fixing={fixing === 'cpuExecCap'}
                    />
                  </>
                )
              })()}
            </div>
          </div>

          {/* Right: Diagnostics card */}
          <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg p-4 flex flex-col gap-3 min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Diagnostics</h2>
            </div>

            {diagState === 'idle' && !vmUser && (
              <p className="text-amber-400 text-xs shrink-0">No credentials saved — open Detail to set them.</p>
            )}

            {diagState === 'running' && (
              <div className="space-y-2 shrink-0">
                <p className="text-zinc-300 text-sm font-medium">Running Performance Check...</p>
                <ProgressBar />
              </div>
            )}

            {diagError && vmNotRunning(diagLines) && (
              <p className="text-amber-400 text-sm shrink-0">
                The VM is not running — start it from My VMs, then Refresh.
              </p>
            )}

            {diagError && !vmNotRunning(diagLines) && (
              <p className="text-red-400 text-xs shrink-0">{diagError}</p>
            )}

            {diagState === 'done' && diagLines.length > 0 && !vmNotRunning(diagLines) && (
              <DiagReport sections={parseDiagReport(diagLines)} />
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Error mapping ──────────────────────────────────────────────────────────────

function vmNotRunning(lines: ScriptLine[]): boolean {
  return lines.some((l) => l.text.includes('not responding') || l.text.includes('VM is not running'))
}

function friendlyFixError(raw: string): string {
  if (raw.includes('locked for a session') || raw.includes('VBOX_E_INVALID_OBJECT_STATE'))
    return 'Stop the VM before applying fixes'
  return raw || 'Fix failed'
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatParavirt(p: string): string {
  const labels: Record<string, string> = {
    kvm: 'KVM', hyperv: 'Hyper-V', minimal: 'Minimal', none: 'None', default: 'Default', legacy: 'Legacy',
  }
  return labels[p.toLowerCase()] ?? p
}

function paravirtStatus(p: string): 'good' | 'warn' | undefined {
  const lc = p.toLowerCase()
  if (lc === 'kvm' || lc === 'default') return 'good'
  if (lc === 'none' || lc === 'legacy' || lc === 'minimal') return 'warn'
  return undefined
}

function paravirtHint(p: string): string | undefined {
  const lc = p.toLowerCase()
  if (lc === 'none' || lc === 'legacy' || lc === 'minimal')
    return 'KVM improves CPU and I/O performance for Linux guests'
  return undefined
}

function formatNicType(t: string): string {
  const labels: Record<string, string> = {
    virtio: 'virtio-net', '82540em': 'Intel e1000 MT', '82543gc': 'Intel e1000 T Server',
    '82545em': 'Intel e1000 GBE', 'am79c973': 'PCNet FAST III', 'am79c970a': 'PCNet PCI II',
  }
  return labels[t.toLowerCase()] ?? (t || '—')
}

function nicTypeStatus(t: string): 'good' | 'warn' | undefined {
  if (!t) return undefined
  return t.toLowerCase() === 'virtio' ? 'good' : 'warn'
}

function nicTypeHint(t: string): string | undefined {
  if (t && t.toLowerCase() !== 'virtio')
    return `${formatNicType(t)} is slower than the paravirtual adapter`
  return undefined
}

function formatStorageCtrl(t: string | null): string {
  if (!t) return '—'
  const labels: Record<string, string> = {
    intelahci: 'SATA (AHCI)', piix3: 'IDE (PIIX3)', piix4: 'IDE (PIIX4)',
    nvme: 'NVMe', lsilogic: 'LSI Logic SCSI', buslogic: 'BusLogic SCSI', lsilogicsas: 'LSI Logic SAS',
  }
  return labels[t.toLowerCase()] ?? t
}

function storageStatus(t: string | null): 'good' | 'warn' | undefined {
  if (!t) return undefined
  const lc = t.toLowerCase()
  if (lc === 'intelahci' || lc === 'nvme') return 'good'
  if (lc === 'piix3' || lc === 'piix4') return 'warn'
  return undefined
}

function storageHint(t: string | null): string | undefined {
  if (!t) return undefined
  const lc = t.toLowerCase()
  if (lc === 'piix3' || lc === 'piix4')
    return 'IDE is slow under heavy I/O — switch to SATA in VM Settings > Storage'
  return undefined
}

// ── PerfRow ────────────────────────────────────────────────────────────────────

function PerfRow({
  label, value, status, hint, onFix, fixing,
}: {
  label: string
  value: string
  status?: 'good' | 'warn'
  hint?: string
  onFix?: () => void
  fixing?: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-500 w-24 shrink-0">{label}</span>
      <span className="text-zinc-300">{value}</span>
      {status === 'good' && <span className="text-green-400 text-xs">&#10003;</span>}
      {status === 'warn' && hint && <WarnIcon hint={hint} />}
      {onFix && (
        <button
          onClick={onFix}
          disabled={!!fixing}
          className="ml-auto shrink-0 px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {fixing ? 'Fixing...' : 'Fix'}
        </button>
      )}
    </div>
  )
}

// ── Diagnostics report ─────────────────────────────────────────────────────────

interface DiagSection {
  title: string
  items: { level: 'info' | 'warn'; text: string; action?: string }[]
}

function parseDiagReport(lines: ScriptLine[]): DiagSection[] {
  const sections: DiagSection[] = []
  let current: DiagSection | null = null
  for (const line of lines) {
    const t = line.text
    const stepM = t.match(/\[STEP\s*\].*===\[\s*(.*?)\s*\]===/)
    const infoM = t.match(/\[INFO\s*\]\s+\S+\s+(.+)/)
    const warnM = t.match(/\[WARN\s*\]\s+\S+\s+(.+)/)
    if (stepM) {
      current = { title: stepM[1], items: [] }
      sections.push(current)
    } else if (infoM && current) {
      current.items.push({ level: 'info', text: infoM[1] })
    } else if (warnM && current) {
      current.items.push({ level: 'warn', text: warnM[1], action: diagAction(warnM[1]) })
    }
  }
  return sections
}

function diagAction(warn: string): string | undefined {
  if (warn.includes('vboxsf module not loaded'))        return 'Reinstall Guest Additions: sudo dnf reinstall virtualbox-guest-additions'
  if (warn.includes('vboxadd-service is not active'))   return 'sudo systemctl enable --now vboxadd-service'
  if (warn.includes('vboxguest module not loaded'))     return 'Reinstall Guest Additions: sudo dnf reinstall virtualbox-guest-additions'
  if (warn.includes('exceeds vCPU count'))              return 'Increase vCPU count in VM Settings > System > Processor'
  if (warn.includes('Swap is in use'))                  return 'Increase RAM allocation in VM Settings > System > Motherboard'
  if (warn.includes('virtio_net is faster'))            return 'Change NIC type to virtio in VM Settings > Network > Adapter Type'
  if (warn.includes('consider virtio-blk'))             return 'Switch storage to VirtIO or NVMe in VM Settings > Storage'
  if (warn.includes('No network interface'))            return 'Check network adapter in VM Settings > Network'
  if (warn.includes('No block devices'))                return 'Check storage configuration in VM Settings > Storage'
  return undefined
}

function DiagReport({ sections }: { sections: DiagSection[] }) {
  if (sections.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-1">
      {sections.map((sec) => (
        <div key={sec.title}>
          <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1.5">{sec.title}</p>
          <div className="space-y-1 pl-1">
            {sec.items.map((item, i) => (
              <div key={i}>
                <div className="flex items-start gap-1.5 text-xs">
                  <span className={item.level === 'warn' ? 'text-amber-400 shrink-0' : 'text-green-400 shrink-0'}>
                    {item.level === 'warn' ? '⚠' : '✓'}
                  </span>
                  <span className={item.level === 'warn' ? 'text-amber-300' : 'text-zinc-300'}>{item.text}</span>
                </div>
                {item.action && (
                  <p className="text-zinc-500 text-xs pl-4 mt-0.5">→ {item.action}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
