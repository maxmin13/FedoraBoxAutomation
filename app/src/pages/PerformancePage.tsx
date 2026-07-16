import { useState, useEffect, useRef } from 'react'
import type { Vm, VmInfo, VmProcess, ScriptLine } from '../electron.d'
import ProgressBar from '../components/ProgressBar'
import { useAuthGate } from '../hooks/useAuthGate'
import VmLoginPage from './VmLoginPage'
import WarnIcon from '../components/WarnIcon'
import Tooltip from '../components/Tooltip'

const CPU_WARN = 20   // CPU% per process — highlight above this
const RSS_WARN = 500  // MB RSS — highlight above this

interface ProcSnapshot {
  cpuPct: number
  ramTotalMB: number
  ramUsedMB: number
  ramFreeMB: number
  processes: VmProcess[]
}


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

  const [procState,   setProcState]   = useState<'idle' | 'loading' | 'ok' | 'stopped' | 'no-credentials' | 'error'>('idle')
  const [procSnapshot, setProcSnapshot] = useState<ProcSnapshot | null>(null)
  const [procError,   setProcError]   = useState<string | null>(null)
  const [killing,     setKilling]     = useState<number | null>(null)
  const [killError,   setKillError]   = useState<string | null>(null)
  const [killTarget,  setKillTarget]  = useState<{ pid: number; name: string } | null>(null)

  const procLoadingRef   = useRef(false)
  const procStateRef     = useRef(procState)
  useEffect(() => { procStateRef.current = procState }, [procState])
  const diagStateRef     = useRef(diagState)
  useEffect(() => { diagStateRef.current = diagState }, [diagState])
  const diagUnsubLineRef = useRef<(() => void) | null>(null)
  const diagUnsubDoneRef = useRef<(() => void) | null>(null)
  const diagBufferRef    = useRef<ScriptLine[]>([])

  const { withAuth, loginRequired, onLoginSuccess, onLoginBack } = useAuthGate(vm.name)

  function handleLoginSuccess() {
    setCredKey(k => k + 1)
    onLoginSuccess()
  }

  useEffect(() => {
    setInfo(null)
    setLoadError(null)
    window.electronAPI.logUiAction(`performance "${vm.name}": Load VM info`)
    window.electronAPI.getVmInfo(vm.name).then((result) => {
      if (result.ok) setInfo(result.info)
      else setLoadError(result.error ?? 'Could not load VM info')
    })
  }, [vm.name, infoKey])

  // On mount: load credentials, run processes first (fast, ~1.5 s), then diagnostics.
  // Sequential order avoids concurrent guestcontrol sessions that cause session conflicts.
  useEffect(() => {
    window.electronAPI.logUiAction(`performance "${vm.name}": Load credentials`)
    window.electronAPI.loadVmCredentials(vm.name).then(async (saved) => {
      const user  = saved.ok && saved.user      ? saved.user      : ''
      const pass  = saved.ok && saved.pass      ? saved.pass      : ''
      const login = saved.ok && saved.loginUser ? saved.loginUser : ''
      setVmUser(user)
      setVmPass(pass)
      setLoginUser(login)
      await loadProcesses()
      runDiagnostics(user, pass, login)
    })
    return () => {
      diagUnsubLineRef.current?.(); diagUnsubLineRef.current = null
      diagUnsubDoneRef.current?.(); diagUnsubDoneRef.current = null
    }
  }, [vm.name, credKey])

  async function handleRefresh() {
    window.electronAPI.logUiAction(`performance "${vm.name}": Refresh`)
    setKillError(null)
    setFixError(null)
    setInfoKey((k) => k + 1)
    // Sequential order avoids concurrent guestcontrol sessions that cause
    // session conflicts (same reasoning as the mount effect above).
    await loadProcesses()
    runDiagnostics(vmUser, vmPass, loginUser)
  }

  async function runDiagnostics(user: string, pass: string, login: string) {
    if (!user || !pass) return

    window.electronAPI.logUiAction(`performance "${vm.name}": Run diagnostics`)
    diagUnsubLineRef.current?.(); diagUnsubLineRef.current = null
    diagUnsubDoneRef.current?.(); diagUnsubDoneRef.current = null

    // Keep showing the last completed report while this run is in flight —
    // only swap it out once the new one finishes, so refreshing doesn't blank
    // the card back to a bare loading state (same pattern as the process list).
    diagBufferRef.current = []
    setDiagError(null)
    setDiagState('running')
    onScriptRunning?.(true)

    const unsubLine = window.electronAPI.onScriptLine((line) => {
      diagBufferRef.current = [...diagBufferRef.current, line]
    })
    const unsubDone = window.electronAPI.onScriptDone(() => {
      diagUnsubLineRef.current = null
      diagUnsubDoneRef.current = null
      setDiagLines(diagBufferRef.current)
      setDiagState('done')
      onScriptRunning?.(false)
      unsubLine()
      unsubDone()
    })
    diagUnsubLineRef.current = unsubLine
    diagUnsubDoneRef.current = unsubDone

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
      diagUnsubLineRef.current = null
      diagUnsubDoneRef.current = null
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

  async function confirmKill() {
    if (!killTarget) return
    const { pid, name } = killTarget
    setKillTarget(null)
    window.electronAPI.logUiAction(`performance "${vm.name}": Kill "${name}" PID ${pid}`)
    setKilling(pid)
    setKillError(null)
    const result = await window.electronAPI.killVmProcess(vm.name, pid, name)
    setKilling(null)
    if (!result.ok) {
      setKillError(result.error ?? 'Kill failed')
      return
    }
    setTimeout(() => loadProcesses(), 3000)
  }

  async function loadProcesses(silent = false) {
    if (procLoadingRef.current) return
    procLoadingRef.current = true
    window.electronAPI.logUiAction(`performance "${vm.name}": Load processes`)
    // Only show the full loading placeholder on the very first load — once we
    // have a good snapshot, keep showing it while a refresh runs in the
    // background (same pattern as the Diagnostics card).
    if (!silent && procStateRef.current !== 'ok') setProcState('loading')
    setProcError(null)
    const result = await window.electronAPI.queryVmPerformance(vm.name)
    procLoadingRef.current = false
    if (!result.ok) {
      // Background/refresh polls race with the diagnostics script and kill
      // calls, which also use guestcontrol — an occasional session-conflict
      // blip is expected. Don't blank an already-good process list over a
      // transient failure; only surface it once it stops recovering.
      if (procStateRef.current === 'ok') return
      if (result.vmStopped)     { setProcState('stopped');        return }
      if (result.noCredentials) { setProcState('no-credentials'); return }
      setProcError(result.error ?? 'Unknown error')
      setProcState('error')
      return
    }
    setProcSnapshot(result)
    setProcState('ok')
  }

  useEffect(() => {
    // Skip polls while diagnostics are in flight — both use guestcontrol on
    // the same VM and running them concurrently causes session conflicts.
    const id = setInterval(() => {
      if (diagStateRef.current === 'running') {
        window.electronAPI.logUiAction(`performance "${vm.name}": Skipped poll - diagnostics in flight`)
        return
      }
      loadProcesses(true)
    }, 5000)
    return () => clearInterval(id)
  }, [vm.name, credKey])

  if (loginRequired) {
    return (
      <div className="h-full overflow-y-auto">
        <VmLoginPage initialVmName={vm.name} onBack={onLoginBack} onNext={handleLoginSuccess} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">

      {killTarget && (
        <KillModal
          processName={killTarget.name}
          pid={killTarget.pid}
          busy={killing !== null}
          onConfirm={confirmKill}
          onCancel={() => setKillTarget(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <Tooltip tip="Go back to the VM list">
          <button
            onClick={() => { window.electronAPI.logUiAction(`performance "${vm.name}": Back`); onBack() }}
            className="px-3 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors shrink-0"
          >
            &larr; Back
          </button>
        </Tooltip>
        <h1 className="text-xl font-semibold text-zinc-100 truncate">{vm.name}</h1>
        <Tooltip tip="Re-run all checks and reload the process list">
          <button
            onClick={() => withAuth(handleRefresh)}
            disabled={diagState === 'running'}
            className="ml-auto px-3 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            Refresh
          </button>
        </Tooltip>
      </div>

      {(loadError || killError) && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-3 text-red-200 text-sm shrink-0">
          {loadError || killError}
        </div>
      )}

      {!info && !loadError && (
        <p className="text-zinc-500 text-sm shrink-0">Loading...</p>
      )}

      {info && (
        <div className="flex-1 min-h-0 flex gap-4">

          {/* Left column: Performance settings + Diagnostics */}
          <div className="w-[30rem] shrink-0 flex flex-col gap-4">

            {/* Performance card */}
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 space-y-3 shrink-0">
              <Tooltip tip="VirtualBox settings that affect how fast the VM runs — fix any warnings before heavy workloads">
                <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider cursor-default">Performance</h2>
              </Tooltip>

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
                        labelTip="Paravirtualisation provider — KVM gives Linux guests near-native CPU and timer performance"
                        value={formatParavirt(info.paravirtProvider)}
                        status={paravirtStatus(info.paravirtProvider)}
                        hint={paravirtHint(info.paravirtProvider)}
                        onFix={fix('paravirt', paravirtStatus(info.paravirtProvider) === 'warn')}
                        fixing={fixing === 'paravirt'}
                      />
                      <PerfRow
                        label="NIC type"
                        labelTip="Network adapter type — virtio-net is a paravirtual driver that is much faster than emulated cards"
                        value={formatNicType(info.nicType)}
                        status={nicTypeStatus(info.nicType)}
                        hint={nicTypeHint(info.nicType)}
                        onFix={fix('nicType', nicTypeStatus(info.nicType) === 'warn')}
                        fixing={fixing === 'nicType'}
                      />
                      <PerfRow
                        label="Storage"
                        labelTip="Storage controller type — SATA (AHCI) is recommended; IDE is significantly slower under heavy I/O"
                        value={formatStorageCtrl(info.storageControllerType)}
                        status={storageStatus(info.storageControllerType)}
                        hint={storageHint(info.storageControllerType)}
                      />
                      <PerfRow
                        label="3D accel"
                        labelTip="3D acceleration offloads rendering to the host GPU — improves desktop and graphical application performance"
                        value={info.acceleration3d ? 'Enabled' : 'Disabled'}
                        status={info.acceleration3d ? 'good' : 'warn'}
                        hint={!info.acceleration3d ? 'Enable 3D acceleration for better graphics — requires Guest Additions to be installed' : undefined}
                        onFix={fix('acceleration3d', !info.acceleration3d)}
                        fixing={fixing === 'acceleration3d'}
                      />
                      <PerfRow
                        label="CPU cap"
                        labelTip="CPU execution cap — limits what percentage of a host CPU core the VM may use; 100% means no limit"
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

            {/* Diagnostics card */}
            <div className="flex-1 min-h-0 bg-zinc-800 border border-zinc-700 rounded-lg p-4 flex flex-col gap-3 overflow-hidden">
              <Tooltip tip="Runs a guest-side check for common performance problems: Guest Additions modules, swap pressure, NIC and storage driver recommendations">
                <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider cursor-default shrink-0">Diagnostics</h2>
              </Tooltip>

              {diagState === 'idle' && !vmUser && (
                <p className="text-amber-400 text-xs shrink-0">No credentials saved — open Detail to set them.</p>
              )}

              {diagState === 'running' && diagLines.length === 0 && (
                <div className="space-y-2 shrink-0">
                  <p className="text-zinc-300 text-sm font-medium">Running Performance Check...</p>
                  <ProgressBar />
                </div>
              )}

              {diagState === 'running' && diagLines.length > 0 && (
                <p className="text-zinc-500 text-xs shrink-0">Refreshing...</p>
              )}

              {diagError && vmNotRunning(diagLines) && (
                <p className="text-amber-400 text-sm shrink-0">
                  The VM is not running — start it from My VMs, then Refresh.
                </p>
              )}

              {diagError && !vmNotRunning(diagLines) && (
                <p className="text-red-400 text-xs shrink-0">{diagError}</p>
              )}

              {diagLines.length > 0 && !vmNotRunning(diagLines) && (
                <DiagReport sections={parseDiagReport(diagLines)} />
              )}
            </div>
          </div>

          {/* Right column: Running Processes (full height) */}
          <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg p-4 flex flex-col gap-2 min-h-0 overflow-hidden">
            <div className="flex items-center shrink-0">
              <Tooltip tip="Top 14 processes inside the VM by CPU usage, sampled via guestcontrol — updates every 5 seconds">
                <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider cursor-default">Running Processes</h2>
              </Tooltip>
            </div>

            {procState === 'idle' && (
              <p className="text-zinc-500 text-xs">Loading...</p>
            )}
            {procState === 'loading' && (
              <p className="text-zinc-400 text-xs">Sampling CPU usage...</p>
            )}
            {procState === 'stopped' && (
              <p className="text-zinc-500 text-xs">VM is not running.</p>
            )}
            {procState === 'no-credentials' && (
              <p className="text-zinc-500 text-xs">No credentials saved — run a provisioning script first.</p>
            )}
            {procState === 'error' && (
              <p className="text-red-400 text-xs font-mono break-words">{procError}</p>
            )}

            {procState === 'ok' && procSnapshot && (
              <div className="space-y-2">
                <UsageBar label="CPU" used={Math.round(procSnapshot.cpuPct)} total={100} unit="%" tip="Overall CPU usage across all cores, sampled over 500 ms from /proc/stat" />
                <UsageBar label="RAM" used={procSnapshot.ramUsedMB} total={procSnapshot.ramTotalMB} unit="MB" tip="Physical memory usage reported by free -m inside the VM" />
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-700">
                      <th className="text-left pb-2 pr-2 font-medium"><Tooltip tip="Process name (comm field from ps)">Name</Tooltip></th>
                      <th className="text-right pb-2 pr-2 font-medium"><Tooltip tip="CPU usage averaged over the process lifetime">CPU %</Tooltip></th>
                      <th className="text-right pb-2 pr-2 font-medium"><Tooltip tip="Resident Set Size — physical RAM currently held by this process, in MB">RSS MB</Tooltip></th>
                      <th className="pb-2 font-medium"><Tooltip tip="Force-stop a runaway or stuck process — disabled while diagnostics are running">Kill</Tooltip></th>
                    </tr>
                  </thead>
                  <tbody>
                    {procSnapshot.processes.map((p) => {
                      const heavy = p.cpu > CPU_WARN || p.rssMB > RSS_WARN
                      return (
                        <tr key={p.pid} className={`border-b border-zinc-700/50 ${heavy ? 'text-amber-300' : 'text-zinc-300'}`}>
                          <td className="py-1 pr-2 font-medium truncate max-w-[7rem]">
                            {PROC_DESC[p.name] ? (
                              <Tooltip tip={PROC_DESC[p.name]}>
                                <span>{p.name}</span>
                              </Tooltip>
                            ) : (
                              <span>{p.name}</span>
                            )}
                          </td>
                          <td className="py-1 pr-2 text-right font-mono">{p.cpu.toFixed(1)}</td>
                          <td className="py-1 pr-2 text-right font-mono">{p.rssMB}</td>
                          <td className="py-1 text-right">
                            {!CRITICAL_PROCS.has(p.name) && (
                              <Tooltip tip={diagState === 'running' ? 'Wait for diagnostics to finish before killing a process' : killTip(p.name)}>
                                <button
                                  onClick={() => withAuth(() => setKillTarget({ pid: p.pid, name: p.name }))}
                                  disabled={killing !== null || diagState === 'running'}
                                  className="px-1.5 py-0.5 text-xs bg-red-900 hover:bg-red-700 text-red-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {killing === p.pid ? '...' : 'Kill'}
                                </button>
                              </Tooltip>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ── UsageBar ───────────────────────────────────────────────────────────────────

function UsageBar({ label, used, total, unit, tip }: { label: string; used: number; total: number; unit: string; tip: string }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0
  const color = pct >= 85 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-blue-500'
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-400 mb-1">
        <Tooltip tip={tip}><span className="cursor-default">{label}</span></Tooltip>
        <span>{used} / {total} {unit} ({pct}%)</span>
      </div>
      <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
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
  label, labelTip, value, status, hint, onFix, fixing,
}: {
  label: string
  labelTip?: string
  value: string
  status?: 'good' | 'warn'
  hint?: string
  onFix?: () => void
  fixing?: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-zinc-500 w-24 shrink-0 cursor-default">
        {labelTip ? <Tooltip tip={labelTip}>{label}</Tooltip> : label}
      </span>
      <span className="text-zinc-300">{value}</span>
      {status === 'good' && <span className="text-green-400 text-xs">&#10003;</span>}
      {status === 'warn' && hint && <WarnIcon hint={hint} />}
      {onFix && (
        <Tooltip tip="Apply the recommended setting — the VM must be stopped first">
          <button
            onClick={onFix}
            disabled={!!fixing}
            className="ml-auto shrink-0 px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fixing ? 'Fixing...' : 'Fix'}
          </button>
        </Tooltip>
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

// ── killTip ───────────────────────────────────────────────────────────────────

const PROC_DESC: Record<string, string> = {
  'VBoxService':       'VirtualBox Guest Additions service for shared folders, clipboard sync and display resize',
  'VBoxClient':        'VirtualBox client helper for clipboard and seamless window integration',
  'k3s-server':        'Lightweight Kubernetes control plane and API server',
  'k3s-agent':         'Kubernetes node agent that manages workloads assigned by the k3s server',
  'containerd':        'Container runtime that manages container lifecycle on behalf of Kubernetes',
  'containerd-shim':   'Container shim that keeps a container running independently of the containerd daemon',
  'dockerd':           'Docker daemon that manages containers, images and networks',
  'docker-proxy':      'Docker port-forwarding proxy that maps host ports into containers',
  'systemd':           'System and service manager (PID 1)',
  'systemd-journal':   'System log collector and storage daemon',
  'systemd-hostnam':   'Daemon that manages the system hostname and machine identity',
  'systemd-logind':    'Daemon that handles user login sessions and seat management',
  'systemd-network':   'Daemon that configures network interfaces from systemd-networkd units',
  'systemd-resolve':   'DNS cache and hostname resolver',
  'systemd-udevd':     'Daemon that handles kernel device events and udev rules',
  'NetworkManager':    'Daemon that manages wired and wireless network connections',
  'gnome-software':    'GNOME desktop app store — checks for and installs package/flatpak updates in the background',
  'gnome-shell':       'GNOME desktop shell — renders the desktop, top bar, windows and app launcher',
  'dnf5daemon-serv':   'DNF5 background service — handles package install/update/remove requests over D-Bus (used by gnome-software)',
  'wireplumber':       'Audio/video session manager for PipeWire — routes and connects audio streams',
  'unix_chkpwd':       'PAM helper that verifies a Unix password against /etc/shadow — spawned briefly during login/sudo',
  'xdg-desktop-por':   'Desktop portal — lets sandboxed/Flatpak apps request file access, screen sharing and other permissions',
  'ibus-engine-tb':    'IBus input method engine — provides input method support for typing in a specific language/script',
  'sshd':              'SSH server that accepts incoming secure shell connections',
  'firewalld':         'Firewall daemon that manages iptables and nftables rules',
  'tuned':             'Performance tuning daemon that adjusts kernel parameters to match a workload profile',
  'chronyd':           'NTP daemon that keeps the system clock synchronised with time servers',
  'dbus-daemon':       'Inter-process message bus used by most desktop and system services',
  'polkitd':           'PolicyKit daemon that handles privilege escalation requests',
  'avahi-daemon':      'Multicast DNS daemon that enables zero-configuration service discovery on the local network',
  'rsyslogd':          'System log daemon that collects and routes log messages',
  'crond':             'Cron scheduler that runs periodic background tasks',
  'atd':               'Job scheduler that runs one-off scheduled commands',
  'fprintd':           'Fingerprint authentication daemon',
  'bash':              'Bash shell session',
  'sh':                'POSIX shell session',
  'awk':               'Text-processing tool — here it\'s the sampling script itself parsing /proc/stat, free and ps output',
  'python3':           'Python 3 interpreter',
  'python':            'Python interpreter',
  'node':              'Node.js runtime',
  'java':              'Java virtual machine',
  'nginx':             'Nginx web and proxy server',
  'httpd':             'Apache HTTP server',
  'mysqld':            'MySQL database server',
  'postgres':          'PostgreSQL database server',
  'mongod':            'MongoDB database server',
  'redis-server':      'Redis in-memory data store',

  // ── Desktop session (GDM, Mutter/Shell helpers, accessibility, GVfs, IBus) ──
  'gdm':               'GNOME Display Manager — shows the login screen and starts the user session',
  'gdm-session-wor':   'GDM session worker — authenticates the login attempt and launches the session',
  'gdm-wayland-ses':   'GDM Wayland session launcher',
  'mutter-x11-fram':   'Mutter (GNOME\'s window manager/compositor) helper process for X11 app frames',
  'nautilus':          'GNOME Files — the desktop file manager',
  'org.gnome.Nauti':   'Background Nautilus (GNOME Files) instance, D-Bus-activated for thumbnailing/desktop icons without a window open',
  'gjs':               'GNOME JavaScript runtime — runs GNOME Shell extensions and some GJS-based apps',
  'glycin-image-rs':   'Glycin sandboxed image-decoding helper, used by GNOME apps to safely load images',
  'glycin-svg':        'Glycin sandboxed SVG-decoding helper',
  'localsearch-3':     'Desktop file indexing service (Tracker/localsearch) that powers GNOME Files/Shell search',
  'switcheroo-cont':   'Switcheroo Control — manages switching between integrated and discrete GPUs',
  'dconf-service':     'dconf — the backing key/value database for GNOME and GTK app settings',
  'goa-daemon':        'GNOME Online Accounts daemon — manages signed-in cloud/online accounts',
  'goa-identity-se':   'GNOME Online Accounts identity helper, used during account sign-in',
  'gnome-keyring-d':   'GNOME Keyring — stores passwords and secrets for apps',
  'gnome-session-c':   'GNOME Session component that checks the session is starting up correctly',
  'gnome-session-i':   'GNOME Session component that runs session initialisation',
  'gnome-session-s':   'GNOME Session service — coordinates desktop session startup and shutdown',
  'gnome-shell-cal':   'GNOME Shell calendar server — feeds calendar events to the top-bar clock',
  'gnome-control-c':   'GNOME Settings (Control Center)',
  'gnome-calculato':   'GNOME Calculator',
  'gnome-calendar':    'GNOME Calendar',
  'gnome-character':   'GNOME Characters — special character/emoji picker',
  'gnome-clocks':      'GNOME Clocks',
  'gnome-contacts-':   'GNOME Contacts',
  'epiphany-webapp':   'GNOME Web (Epiphany) running a site installed as a standalone web app',
  'evolution-addre':   'Evolution address book backend',
  'evolution-alarm':   'Evolution calendar alarm/reminder notifier',
  'evolution-calen':   'Evolution calendar backend',
  'evolution-sourc':   'Evolution Data Server — manages configured mail/calendar/contacts account sources',
  'ptyxis':            'Ptyxis — Fedora Workstation\'s default terminal app',
  'ptyxis-agent':      'Ptyxis background agent that manages terminal sessions',
  'at-spi2-registr':   'Assistive Technology registry — routes accessibility events between apps and screen readers',
  'at-spi-bus-laun':   'Assistive Technology D-Bus launcher for the accessibility bus',
  'ibus-daemon':       'IBus input method framework daemon',
  'ibus-dconf':        'IBus component that watches dconf for input-method setting changes',
  'ibus-engine-sim':   'IBus "simple" input method engine (dead-key/compose-key accented character input)',
  'ibus-extension-':   'IBus extension helper, e.g. the emoji/unicode picker',
  'ibus-portal':       'IBus portal — provides input method access to sandboxed/Flatpak apps',
  'ibus-x11':          'IBus X11 integration helper',
  'gvfsd':             'GVfs — the GNOME virtual filesystem daemon (network shares, trash, archives, etc.)',
  'gvfsd-fuse':        'GVfs FUSE bridge, exposes gvfs mounts as a regular filesystem path',
  'gvfsd-metadata':    'GVfs metadata store, e.g. file manager tags and notes',
  'gvfs-afc-volume':   'GVfs volume monitor for iOS devices (AFC)',
  'gvfs-goa-volume':   'GVfs volume monitor for GNOME Online Accounts (cloud storage)',
  'gvfs-gphoto2-vo':   'GVfs volume monitor for digital cameras (gphoto2)',
  'gvfs-mtp-volume':   'GVfs volume monitor for MTP devices (phones/media players)',
  'gvfs-udisks2-vo':   'GVfs volume monitor for removable storage (udisks2)',

  // ── GNOME Settings Daemon plugins (each owns one settings area) ─────────────
  'gsd-a11y-settin':   'GNOME Settings Daemon — accessibility settings',
  'gsd-color':         'GNOME Settings Daemon — display colour profile management',
  'gsd-datetime':      'GNOME Settings Daemon — date and time settings',
  'gsd-disk-utilit':   'GNOME Settings Daemon — disk utility notifications (e.g. failing disk warnings)',
  'gsd-housekeepin':   'GNOME Settings Daemon — disk space housekeeping (cleans caches/thumbnails when low on space)',
  'gsd-keyboard':      'GNOME Settings Daemon — keyboard layout and settings',
  'gsd-media-keys':    'GNOME Settings Daemon — media/volume/brightness key bindings',
  'gsd-power':         'GNOME Settings Daemon — power and battery management',
  'gsd-printer':       'GNOME Settings Daemon — printer management',
  'gsd-print-notif':   'GNOME Settings Daemon — print job notifications',
  'gsd-rfkill':        'GNOME Settings Daemon — Wi-Fi/Bluetooth/airplane-mode radio switch',
  'gsd-screensaver':   'GNOME Settings Daemon — screen lock and screensaver',
  'gsd-sharing':       'GNOME Settings Daemon — file/media/screen sharing settings',
  'gsd-smartcard':     'GNOME Settings Daemon — smartcard login support',
  'gsd-sound':         'GNOME Settings Daemon — sound theme and volume settings',
  'gsd-usb-protect':   'GNOME Settings Daemon — USB peripheral protection (blocks new USB devices when locked)',
  'gsd-wwan':          'GNOME Settings Daemon — mobile broadband (WWAN) settings',
  'gsd-xsettings':     'GNOME Settings Daemon — X11/GTK theme and font settings',

  // ── System/hardware daemons ──────────────────────────────────────────────────
  'abrtd':             'Automatic Bug Reporting Tool daemon — collects crash reports',
  'abrt-dump-journ':   'ABRT helper that scans the systemd journal for crashes to report',
  'accounts-daemon':   'AccountsService — provides user account info to the login screen and settings app',
  'alsactl':           'ALSA sound settings restore/store daemon',
  'auditd':            'Linux audit daemon — records security-relevant kernel events',
  'colord':            'Color management daemon for displays, scanners and printers',
  'cupsd':             'CUPS print server daemon',
  'dbus-broker':       'D-Bus message bus broker (Fedora\'s default D-Bus implementation)',
  'dbus-broker-lau':   'D-Bus broker launch helper',
  'fusermount3':       'FUSE filesystem mount helper',
  'fwupd':             'Firmware update daemon (used by fwupdmgr/GNOME Software for device firmware updates)',
  'gssproxy':          'GSS-Proxy — proxies Kerberos/GSSAPI credentials for services such as NFS',
  'irqbalance':        'Distributes hardware interrupt load across CPU cores',
  'mcelog':            'Machine Check Exception logger — records hardware error events',
  'ModemManager':      'Manages mobile broadband (3G/4G/5G) modem hardware',
  'obexd':             'Bluetooth OBEX daemon — handles file transfer over Bluetooth',
  'pcscd':             'PC/SC smart card daemon',
  'rtkit-daemon':      'RealtimeKit — grants real-time scheduling priority to audio apps like PipeWire',
  'sssd_kcm':          'SSSD Kerberos Credential Manager cache',
  'udisksd':           'UDisks2 — manages disks and removable storage devices',
  'upowerd':           'UPower — tracks battery and power status',
  'uresourced':        'Manages resource limits (CPU/memory) for background apps to keep the desktop responsive',
  'systemd-homed':     'systemd service that manages portable/encrypted home directories',
  'systemd-oomd':      'systemd out-of-memory daemon — proactively kills processes under memory pressure',
  'systemd-timedat':   'systemd time and date settings service (NTP enable/disable, timezone)',
  'systemd-userdbd':   'systemd user/group record lookup service',
  'systemd-userwor':   'systemd worker process for user record lookups',
  'pipewire':          'PipeWire multimedia server — handles audio and video stream routing',
  'pipewire-pulse':    'PipeWire\'s PulseAudio-compatibility daemon',
  'tuned-ppd':         'tuned\'s Power Profiles Daemon compatibility shim',
  'bwrap':             'Bubblewrap — sandboxing tool used by Flatpak to isolate apps',
  'catatonit':         'Minimal init process used as PID 1 inside a container',
  '(sd-pam)':          'Placeholder process systemd-logind keeps for a login session\'s PAM stack',
  'entry':             'Generic process name, often a container or script entrypoint — exact purpose depends on what started it',

  // ── Kubernetes / k3s ecosystem ───────────────────────────────────────────────
  'coredns':           'CoreDNS — provides cluster-internal DNS for Kubernetes/k3s',
  'traefik':           'Traefik — k3s\'s default ingress/reverse-proxy controller',
  'local-path-prov':   'Rancher local-path-provisioner — k3s\'s default storage provisioner',
  'metrics-server':    'Kubernetes Metrics Server — powers "kubectl top" and autoscaling',
  'pause':             'Kubernetes "pause" container — holds a pod\'s shared network namespace',

  // ── Fixed-name kernel threads ────────────────────────────────────────────────
  'kthreadd':          'Kernel thread daemon — parent of all kernel worker threads',
  'kswapd0':           'Kernel thread that reclaims memory by writing pages out to swap',
  'ksmd':              'Kernel Samepage Merging daemon — deduplicates identical memory pages',
  'khugepaged':        'Kernel thread that assembles transparent huge pages to reduce memory overhead',
  'kcompactd0':        'Kernel thread that compacts memory to reduce fragmentation',
  'kdevtmpfs':         'Kernel thread that maintains the /dev virtual filesystem',
  'oom_reaper':        'Kernel thread that reclaims memory from processes just killed by the OOM killer',
  'kauditd':           'Kernel thread that delivers audit events to auditd',
  'kprobe-optimizer':  'Kernel thread that optimises installed kprobes (kernel debugging/tracing hooks)',
  'pool_workqueue_release': 'Kernel thread that cleans up unused workqueue pools',
  'psimon':            'Kernel thread that monitors Pressure Stall Information (CPU/memory/IO contention)',
  'rcu_preempt':       'Kernel RCU (Read-Copy-Update) grace-period thread for the preemptible RCU flavour',
  'rcu_tasks_kthread': 'Kernel RCU-tasks grace-period housekeeping thread',
  'rcu_tasks_rude_kthread': 'Kernel RCU-tasks-rude grace-period housekeeping thread',
  'rcu_exp_gp_kthr':   'Kernel thread that drives expedited RCU grace periods',
  'btrfs-cleaner':     'Btrfs kernel thread that cleans up deleted subvolumes and unused extents',
  'btrfs-transaction': 'Btrfs kernel thread that commits filesystem transactions',

  // ── More VirtualBox / display / network ─────────────────────────────────────
  'VBoxDRMClient':     'VirtualBox Guest Additions helper that resizes the display via the kernel DRM driver',
  'VBoxService <defunct>': 'A VBoxService process that has exited but not yet been reaped by its parent — usually harmless',
  'watchdogd':         'Hardware watchdog daemon — pings the watchdog timer to prevent an automatic reboot on a system hang',
  'wpa_supplicant':    'Wi-Fi/WPA authentication daemon used by NetworkManager for wireless connections',
  'xdg-document-po':   'XDG document portal — grants sandboxed/Flatpak apps access to specific user-selected files',
  'xdg-permission-':   'XDG permission store — records which sandboxed/Flatpak apps have been granted which permissions',
  'Xwayland':          'Compatibility layer that lets X11-only apps run under the Wayland display server',
}

const CRITICAL_PROCS = new Set([
  'systemd', 'systemd-journal', 'systemd-hostnam', 'systemd-logind',
  'systemd-network', 'systemd-resolve', 'systemd-udevd',
  'VBoxService', 'VBoxClient',
  'NetworkManager', 'dbus-daemon', 'polkitd', 'firewalld', 'sshd',
  'gnome-shell',
])

function killTip(name: string): string {
  return PROC_DESC[name] ?? 'Use for stuck or resource-heavy processes'
}

// ── KillModal ─────────────────────────────────────────────────────────────────

function KillModal({
  processName, pid, busy, onConfirm, onCancel,
}: {
  processName: string
  pid: number
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
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
        <p className="text-zinc-400 text-sm text-center mb-2">Kill this process?</p>
        <p className="text-zinc-100 text-2xl font-bold text-center break-all mb-1">{processName}</p>
        <p className="text-zinc-500 text-xs text-center mb-8">
          PID {pid} — if managed by systemd the service will be stopped; otherwise the process will be force-killed.
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
            Kill Process
          </button>
        </div>
      </div>
    </div>
  )
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

function diagTip(text: string): string | undefined {
  if (/^Version:/i.test(text))             return 'VirtualBox Guest Additions version installed in the VM'
  if (/^vboxadd-service:/i.test(text))     return 'Guest Additions service — manages shared folders, clipboard sync, and display auto-resize'
  if (/vboxguest module/i.test(text))      return 'Kernel module for Guest Additions — required for all guest integration features'
  if (/^vCPUs online:/i.test(text))        return 'Number of virtual CPU cores allocated to this VM'
  if (/^Load average:/i.test(text))        return '1, 5, and 15-minute averages of runnable processes — values above the vCPU count mean the CPU is saturated'
  if (/^Total RAM:/i.test(text))           return 'Total physical memory allocated to this VM'
  if (/^Available:/i.test(text))           return 'Physical memory available for new processes, including reclaimable page cache'
  if (/^Interface:/i.test(text))           return 'Primary network interface name and its kernel driver'
  if (/Paravirtual NIC/i.test(text))       return 'virtio_net bypasses hardware emulation — significantly faster than emulated NICs'
  if (/virtio\/NVMe.*optimal/i.test(text)) return 'virtio-blk or NVMe driver — paravirtual I/O with near-native disk performance'
  if (/SATA\/AHCI/i.test(text))           return 'SATA storage via AHCI controller — good performance for most workloads'
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
            {sec.items.map((item, i) => {
              const tip = diagTip(item.text)
              return (
                <div key={i}>
                  <div className="flex items-start gap-1.5 text-xs">
                    <span className={item.level === 'warn' ? 'text-amber-400 shrink-0' : 'text-green-400 shrink-0'}>
                      {item.level === 'warn' ? '⚠' : '✓'}
                    </span>
                    <span className={item.level === 'warn' ? 'text-amber-300' : 'text-zinc-300'}>
                      {tip ? <Tooltip tip={tip}><span className="cursor-default">{item.text}</span></Tooltip> : item.text}
                    </span>
                  </div>
                  {item.action && (
                    <p className="text-zinc-500 text-xs pl-4 mt-0.5">→ {item.action}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
