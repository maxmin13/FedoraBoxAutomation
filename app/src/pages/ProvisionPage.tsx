import { useState, useEffect, useRef } from 'react'
import type { Vm, ScriptLine } from '../electron.d'
import LogPanel from '../components/LogPanel'
import ProgressBar from '../components/ProgressBar'

// ── Types ──────────────────────────────────────────────────────────────────────

type ArgType = 'none' | 'user' | 'custom' | 'user+custom' | 'user+custom2' | 'custom2'

interface ArgOption {
  value: string
  label: string
}

interface ForceConfirmDef {
  title: string        // heading shown in the amber panel
  details?: string[]  // bullet points below the heading
  actionLabel: string // label on the confirm button ("Install anyway", "Update", …)
}

interface ScriptDef {
  name: string
  label: string
  relPath: string
  description: string
  argType: ArgType
  argPrompts?: string[]
  argDefaults?: string[]
  argOptions?: ArgOption[][]   // per-position; if set, renders a <select> instead of <input>
  forceConfirmDef?: ForceConfirmDef  // if set, script can emit "Use 'Install anyway'" to trigger confirmation
}

interface CategoryDef {
  name: string
  dir: string
  scripts: ScriptDef[]
}

type PageState = 'idle' | 'running' | 'done'
type IdleView  = 'mode' | 'full-form' | 'categories' | 'scripts' | 'script-args'

// ── Script Catalog ─────────────────────────────────────────────────────────────

const CATEGORIES: CategoryDef[] = [
  {
    name: 'Languages', dir: 'languages',
    scripts: [
      { name: 'java.sh',   label: 'Oracle JDK',  relPath: 'java.sh',   description: 'Oracle JDK latest LTS - sets JAVA_HOME in ~/.bash_profile', argType: 'user' },
      { name: 'php.sh',    label: 'PHP',          relPath: 'php.sh',    description: 'PHP + php-common + php-cli, APC cache disabled',            argType: 'user' },
      { name: 'python.sh', label: 'Python',       relPath: 'python.sh', description: 'Python from source + venv + pyenv (blank = latest stable)',
        argType: 'user+custom', argPrompts: ['Python version'], argDefaults: ['3.13.3'] },
      { name: 'node.sh',   label: 'Node.js',      relPath: 'node.sh',   description: 'Node.js LTS via NodeSource — includes npm',
        argType: 'user+custom',
        argPrompts:  ['Node.js version'],
        argDefaults: ['22'],
        argOptions: [[
          { value: '24', label: '24 — Current stable · ships natively in Fedora 44' },
          { value: '22', label: '22 — LTS Active (until Apr 2027)' },
          { value: '20', label: '20 — LTS Maintenance (until Apr 2026)' },
        ]] },
    ],
  },
  {
    name: 'Build Tools', dir: 'build-tools',
    scripts: [
      { name: 'maven.sh', label: 'Apache Maven', relPath: 'maven.sh', description: 'Apache Maven - sets M2_HOME and PATH',
        argType: 'custom', argPrompts: ['Maven version'], argDefaults: ['3.9.5'] },
    ],
  },
  {
    name: 'Web Servers', dir: 'web-servers',
    scripts: [
      { name: 'httpd.sh',         label: 'Apache HTTP Server',  relPath: 'httpd.sh',               description: 'Apache HTTP Server',                              argType: 'user' },
      { name: 'tomcat.sh',        label: 'Apache Tomcat',       relPath: 'tomcat/tomcat.sh',        description: 'Apache Tomcat - multi-instance by port, requires Java',
        argType: 'user+custom2',
        argPrompts:  ['Tomcat version', 'HTTP port'],
        argDefaults: ['10.1.36', '8080'],
        argOptions: [[
          { value: '11.0.7',  label: '11.0.7  — latest 11.0 · Java 21+' },
          { value: '10.1.36', label: '10.1.36 — latest 10.1 · Java 11+' },
          { value: '9.0.102', label: '9.0.102 — latest  9.0 · Java  8+' },
        ]] },
    ],
  },
  {
    name: 'Databases', dir: 'databases',
    scripts: [
      { name: 'mariadb.sh',    label: 'MariaDB',     relPath: 'mariadb.sh',    description: 'MariaDB - MySQL-compatible relational database',     argType: 'none' },
      { name: 'postgresql.sh', label: 'PostgreSQL',  relPath: 'postgresql.sh', description: 'PostgreSQL + pgAdmin 4, remote connections enabled', argType: 'none' },
      { name: 'dbeaver.sh',    label: 'DBeaver CE',  relPath: 'dbeaver.sh',    description: 'DBeaver CE - GUI client for MariaDB, PostgreSQL',    argType: 'none' },
    ],
  },
  {
    name: 'IDEs', dir: 'ides',
    scripts: [
      { name: 'eclipse.sh',          label: 'Eclipse IDE',          relPath: 'eclipse.sh',          description: 'Eclipse IDE for Java EE',
        argType: 'custom', argPrompts: ['Eclipse release'], argDefaults: ['2026-03'],
        argOptions: [[
          { value: '2026-03', label: '2026-03 — 4.35 (Mar 2026)' },
          { value: '2025-12', label: '2025-12 — 4.34 (Dec 2025)' },
          { value: '2025-09', label: '2025-09 — 4.33 (Sep 2025)' },
          { value: '2025-06', label: '2025-06 — 4.32 (Jun 2025)' },
          { value: '2024-12', label: '2024-12 — 4.34 (Dec 2024)' },
        ]] },
      { name: 'eclipse-ee.sh',       label: 'Eclipse IDE (installer)', relPath: 'eclipse-ee.sh',    description: 'Eclipse IDE for Java EE via installer',
        argType: 'custom', argPrompts: ['Eclipse release'], argDefaults: ['2026-03'],
        argOptions: [[
          { value: '2026-03', label: '2026-03 — 4.35 (Mar 2026)' },
          { value: '2025-12', label: '2025-12 — 4.34 (Dec 2025)' },
          { value: '2025-09', label: '2025-09 — 4.33 (Sep 2025)' },
          { value: '2025-06', label: '2025-06 — 4.32 (Jun 2025)' },
          { value: '2024-12', label: '2024-12 — 4.34 (Dec 2024)' },
        ]] },
      { name: 'visualstudiocode.sh', label: 'Visual Studio Code',   relPath: 'visualstudiocode.sh', description: 'Visual Studio Code via Microsoft repo', argType: 'none' },
    ],
  },
  {
    name: 'Containers', dir: 'containers',
    scripts: [
      { name: 'docker.sh',   label: 'Docker CE',  relPath: 'docker.sh',   description: 'Docker CE - adds login user to docker group', argType: 'user' },
      { name: 'minikube.sh', label: 'Minikube',   relPath: 'minikube.sh', description: 'minikube + kubectl + metrics-server addon',   argType: 'user' },
      { name: 'k3s.sh',      label: 'k3s',        relPath: 'k3s.sh',      description: 'k3s - lightweight real Kubernetes cluster',   argType: 'user' },
    ],
  },
  {
    name: 'Cloud', dir: 'cloud',
    scripts: [
      { name: 'aws-cli.sh', label: 'AWS CLI', relPath: 'aws-cli.sh', description: 'AWS CLI v2 - creates ~/.aws config directory', argType: 'user',
        forceConfirmDef: {
          title: 'AWS CLI is already installed',
          details: ['The existing installation will be updated to the latest version.'],
          actionLabel: 'Update',
        },
      },
      { name: 'ecs-cli.sh', label: 'Amazon ECS CLI',   relPath: 'ecs-cli.sh', description: 'Amazon ECS CLI for managing ECS clusters',    argType: 'none' },
    ],
  },
  {
    name: 'Security', dir: 'security',
    scripts: [
      { name: 'openssl.sh', label: 'OpenSSL 3.3.2', relPath: 'openssl.sh', description: 'OpenSSL 3.3.2 built from source to /usr/local/ssl; adds /usr/local/ssl/bin to PATH in ~/.bash_profile', argType: 'user',
        forceConfirmDef: {
          title: 'OpenSSL is already installed on this system',
          details: [
            'System tools (curl, wget, sshd) may silently link against the new libraries',
            'dnf update will not patch /usr/local/ssl — you must rebuild manually when CVEs drop',
            'The system OpenSSL still wins in the terminal unless PATH is manually adjusted',
          ],
          actionLabel: 'Install anyway',
        },
      },
    ],
  },
  {
    name: 'Network', dir: 'network',
    scripts: [
      { name: 'wireshark.sh', label: 'Wireshark', relPath: 'wireshark.sh', description: 'Wireshark - network packet analyser', argType: 'user' },
    ],
  },
  {
    name: 'Version Control', dir: 'version-control',
    scripts: [
      { name: 'git.sh', label: 'Git', relPath: 'git.sh', description: 'Git version control', argType: 'none' },
    ],
  },
  {
    name: 'Editors', dir: 'editors',
    scripts: [
      { name: 'vim.sh', label: 'Vim', relPath: 'vim.sh', description: 'Vim + Pathogen + Syntastic linting (ShellCheck, pylint, jshint)', argType: 'user' },
    ],
  },
  {
    name: 'Browsers', dir: 'browsers',
    scripts: [
      { name: 'chrome.sh', label: 'Google Chrome', relPath: 'chrome.sh', description: 'Google Chrome stable', argType: 'none' },
    ],
  },
  {
    name: 'Automation', dir: 'automation',
    scripts: [
      { name: 'ansible.sh', label: 'Ansible', relPath: 'ansible.sh', description: 'Ansible automation and configuration management', argType: 'none' },
    ],
  },
  {
    name: 'AI Tools', dir: 'ai',
    scripts: [
      { name: 'claude-code.sh', label: 'Claude Code', relPath: 'claude-code.sh',
        description: 'Anthropic Claude Code CLI - AI coding assistant (requires Node.js 18+)', argType: 'user' },
    ],
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildScriptArgs(script: ScriptDef, argValues: string[], loginUser: string): string {
  switch (script.argType) {
    case 'none': return ''
    case 'user': return loginUser
    case 'custom': {
      const v = argValues[0]?.trim()
      return v || script.argDefaults?.[0] || ''
    }
    case 'user+custom': {
      const v = argValues[0]?.trim() || script.argDefaults?.[0] || ''
      return v ? `${loginUser} ${v}` : loginUser
    }
    case 'user+custom2': {
      const v1 = argValues[0]?.trim() || script.argDefaults?.[0] || ''
      const v2 = argValues[1]?.trim() || script.argDefaults?.[1] || ''
      return `${loginUser} ${v1} ${v2}`
    }
    case 'custom2': {
      const v1 = argValues[0]?.trim() || script.argDefaults?.[0] || ''
      const v2 = argValues[1]?.trim() || script.argDefaults?.[1] || ''
      return `${v1} ${v2}`
    }
    default: return ''
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

interface ProvisionPageProps {
  vm: Vm
  onBack: () => void
  onScriptRunning: (running: boolean) => void
}

export default function ProvisionPage({ vm, onBack, onScriptRunning }: ProvisionPageProps) {
  const [vmUser,    setVmUser]    = useState('')
  const [vmPass,    setVmPass]    = useState('')
  const [loginUser, setLoginUser] = useState('')

  const [pageState,    setPageState]    = useState<PageState>('idle')
  const [idleView,     setIdleView]     = useState<IdleView>('mode')
  const [lines,        setLines]        = useState<ScriptLine[]>([])
  const [success,      setSuccess]      = useState<boolean | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [showLog,      setShowLog]      = useState(false)
  const [runningLabel, setRunningLabel] = useState('')

  const [forceConfirm,      setForceConfirm]      = useState(false)
  const [alreadyInstalled,  setAlreadyInstalled]  = useState(false)
  const forceConfirmNeededRef  = useRef(false)
  const alreadyInstalledRef    = useRef(false)

  const [selectedCategory, setSelectedCategory] = useState<CategoryDef | null>(null)
  const [selectedScript,   setSelectedScript]   = useState<ScriptDef   | null>(null)
  const [argValues,        setArgValues]        = useState(['', ''])
  const [changeHostname,   setChangeHostname]   = useState(false)
  const [hostname,         setHostname]         = useState('')

  useEffect(() => {
    if (!changeHostname || !vmUser || !vmPass || hostname) return
    window.electronAPI.getVmHostname(vm.name, vmUser, vmPass).then((result) => {
      if (result.ok && result.hostname) setHostname(result.hostname)
    })
  }, [changeHostname])

  useEffect(() => {
    window.electronAPI.loadVmCredentials(vm.name).then((saved) => {
      if (saved.ok) {
        if (saved.user)       setVmUser(saved.user)
        if (saved.pass)       setVmPass(saved.pass)
        if (saved.loginUser)  setLoginUser(saved.loginUser)
      }
    })
  }, [vm.name])

  useEffect(() => {
    onScriptRunning(pageState === 'running')
  }, [pageState, onScriptRunning])

  function handleNavBack() {
    switch (idleView) {
      case 'mode':        onBack();                   break
      case 'full-form':   setIdleView('mode');        break
      case 'categories':  setIdleView('mode');        break
      case 'scripts':     setIdleView('categories');  break
      case 'script-args': setIdleView('scripts');     break
    }
  }

  async function startRun(
    runFn: () => Promise<{ ok: boolean; error?: string; errorDetail?: string }>
  ) {
    setPageState('running')
    setLines([])
    setSuccess(null)
    setError(null)
    setShowLog(true)
    forceConfirmNeededRef.current = false
    alreadyInstalledRef.current   = false

    const unsubLine = window.electronAPI.onScriptLine((line) => {
      setLines((prev) => [...prev, line])
      if (/Use 'Install anyway'/i.test(line.text)) {
        forceConfirmNeededRef.current = true
      }
      if (/\[INFO\s*\].*already installed/i.test(line.text)) {
        alreadyInstalledRef.current = true
      }
    })
    const unsubDone = window.electronAPI.onScriptDone(async (exitCode) => {
      if (exitCode === 0 && loginUser) {
        await window.electronAPI.saveVmCredentials(vm.name, vmUser, vmPass, loginUser)
      }
      if (forceConfirmNeededRef.current && selectedScript?.forceConfirmDef) {
        setForceConfirm(true)
        setSuccess(false)
        setAlreadyInstalled(false)
        setPageState('done')
        setShowLog(false)
        unsubLine()
        unsubDone()
        return
      }
      setAlreadyInstalled(alreadyInstalledRef.current)
      setSuccess(exitCode === 0)
      setPageState('done')
      setShowLog(false)
      unsubLine()
      unsubDone()
    })

    try {
      const result = await runFn()
      if (!result.ok && result.errorDetail) setError(result.errorDetail)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSuccess(false)
      setPageState('done')
      setShowLog(false)
      unsubLine()
      unsubDone()
    }
  }

  async function handleRunScript(force = false) {
    if (!selectedScript || !selectedCategory) return
    if (force) setForceConfirm(false)
    setRunningLabel(selectedScript.label)
    const scriptArgs = buildScriptArgs(selectedScript, argValues, loginUser) + (force ? ' --force' : '')
    await startRun(() =>
      window.electronAPI.runProvisionScript({
        vmName:        vm.name,
        vmUser,
        vmPass,
        loginUser,
        scriptRelPath: `tools/${selectedCategory.dir}/${selectedScript.relPath}`,
        scriptArgs,
      })
    )
  }

  async function handleRunFull() {
    setRunningLabel('Base Setup')
    await startRun(() =>
      window.electronAPI.runProvisionSetup({
        vmName: vm.name,
        vmUser,
        vmPass,
        loginUser,
        hostname: changeHostname ? hostname.trim() : '',
      })
    )
  }

  const ic = (val: string) =>
    'w-full px-2.5 py-1.5 bg-zinc-700 border rounded text-zinc-100 text-sm ' +
    'focus:outline-none focus:border-blue-500 ' +
    (val ? 'border-zinc-400' : 'border-zinc-600')


  // ── Running ──────────────────────────────────────────────────────────────────
  if (pageState === 'running') {
    return (
      <div className="h-full max-w-2xl w-full mx-auto flex flex-col gap-4">
        <div className="shrink-0 space-y-2">
          <p className="text-zinc-300 text-sm font-medium">Running {runningLabel}...</p>
          <ProgressBar />
        </div>
        <LogPanel lines={lines} showLog={showLog} onToggle={() => setShowLog((v) => !v)} />
      </div>
    )
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  if (pageState === 'done') {
    return (
      <div className="h-full max-w-2xl w-full mx-auto flex flex-col gap-4">

        {success === true && !alreadyInstalled && (
          <div className="bg-green-900 border border-green-700 rounded-lg p-4 shrink-0">
            <p className="text-green-200 font-medium">{runningLabel} completed successfully.</p>
            {runningLabel === 'Guest Additions' && (
              <p className="text-green-300 text-sm mt-1">Reboot the VM to activate, then return here to provision.</p>
            )}
          </div>
        )}

        {success === true && alreadyInstalled && (
          <div className="bg-blue-950 border border-blue-700 rounded-lg p-4 shrink-0">
            <p className="text-blue-200 font-medium">{runningLabel} is already installed.</p>
            <p className="text-blue-400 text-sm mt-1">No changes were made.</p>
          </div>
        )}

        {forceConfirm && selectedScript?.forceConfirmDef && (
          <div className="bg-amber-950 border border-amber-700 rounded-lg p-4 space-y-3 shrink-0">
            <p className="text-amber-200 font-medium">{selectedScript.forceConfirmDef.title}</p>
            {error && <p className="text-amber-300 text-sm">{error}</p>}
            {selectedScript.forceConfirmDef.details && (
              <ul className="text-amber-400 text-xs space-y-1 list-disc list-inside">
                {selectedScript.forceConfirmDef.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => handleRunScript(true)}
                className="px-4 py-2 text-sm bg-amber-700 hover:bg-amber-600 text-white font-medium rounded transition-colors"
              >
                {selectedScript.forceConfirmDef.actionLabel}
              </button>
              <button
                onClick={() => setForceConfirm(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!forceConfirm && success === false && (
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 space-y-1 shrink-0">
            <p className="text-red-200 font-medium">{runningLabel} failed.</p>
            {error
              ? <p className="text-red-300 text-sm font-mono break-words">{error}</p>
              : <p className="text-red-400 text-sm">Expand script output below for details.</p>
            }
          </div>
        )}

        <LogPanel lines={lines} showLog={showLog} onToggle={() => setShowLog((v) => !v)} />

        <div className="mt-auto flex justify-between shrink-0">
          <button
            onClick={async () => {
              if (!success) {
                const saved = await window.electronAPI.loadVmCredentials(vm.name)
                if (saved.ok) {
                  if (saved.user)  setVmUser(saved.user)
                  if (saved.pass)  setVmPass(saved.pass)
                  setLoginUser(saved.loginUser ?? '')
                } else {
                  setLoginUser('')
                }
              }
              setAlreadyInstalled(false)
              setPageState('idle')
              setIdleView(runningLabel === 'Base Setup' ? 'mode' : 'categories')
            }}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 rounded transition-colors"
          >
            Run another
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 rounded transition-colors"
          >
            &larr; My VMs
          </button>
        </div>

      </div>
    )
  }

  // ── Idle ─────────────────────────────────────────────────────────────────────
  return (
    <div className="h-full max-w-2xl w-full mx-auto flex flex-col">

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <button
          onClick={handleNavBack}
          className="px-3 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors shrink-0"
        >
          &larr; Back
        </button>
        <h1 className="text-xl font-semibold text-zinc-100 truncate">
          Provision &mdash; {vm.name}
        </h1>
      </div>

      {/* ── Mode (main landing) ─────────────────────────────────────────────── */}
      {idleView === 'mode' && (
        <div className="flex flex-col gap-3">

          {/* Mode buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setIdleView('full-form')}
              className="bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded-lg p-5 text-left transition-colors"
            >
              <p className="text-zinc-100 font-semibold text-sm mb-1">Base Setup</p>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Foundation setup: system prep, hostname, SELinux, desktop config, and utilities.
              </p>
            </button>
            <button
              onClick={() => setIdleView('categories')}
              className="bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded-lg p-5 text-left transition-colors"
            >
              <p className="text-zinc-100 font-semibold text-sm mb-1">By Category</p>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Browse {CATEGORIES.length} categories and install individual tools: languages, databases, IDEs, containers, and more.
              </p>
            </button>
          </div>
        </div>
      )}

      {/* ── Sub-views (full width, back button navigates) ───────────────────── */}

      {idleView === 'full-form' && (
        <div className="flex-1 overflow-y-auto">
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-5 space-y-4">
            <div>
              <p className="text-zinc-100 text-sm font-semibold mb-1">Base Setup</p>
              <p className="text-zinc-400 text-xs mb-3">Runs these steps in order:</p>
              <ol className="space-y-1.5">
                {[
                  { label: 'System preparation',    desc: 'Update packages and install base dependencies' },
                  { label: 'Network configuration', desc: 'Set hostname; log connections, IPs and routes' },
                  { label: 'SELinux',               desc: 'Disable SELinux for development use' },
                  { label: 'Desktop configuration', desc: 'GNOME settings and desktop background' },
                  { label: 'Utilities',             desc: 'Install desktop utilities and helper tools' },
                ].map((step, i) => (
                  <li key={i} className="flex gap-2 text-xs whitespace-nowrap overflow-hidden">
                    <span className="shrink-0 w-4 text-zinc-600 text-right">{i + 1}.</span>
                    <span>
                      <span className="text-zinc-300">{step.label}</span>
                      <span className="text-zinc-500"> — {step.desc}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={changeHostname}
                onChange={(e) => setChangeHostname(e.target.checked)}
                className="accent-indigo-500"
              />
              Set hostname
            </label>
            {changeHostname && (
              <div>
                <input
                  type="text"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="e.g. fedorabox"
                  className={ic(hostname)}
                />
                <p className="text-zinc-500 text-xs mt-1">The hostname set inside Fedora — not the VirtualBox VM name.</p>
              </div>
            )}
            <button
              onClick={handleRunFull}
              disabled={!loginUser}
              className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Run Base Setup
            </button>
          </div>
        </div>
      )}

      {idleView === 'categories' && (
        <div className="flex-1 overflow-y-auto">
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
            <h2 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">Select category</h2>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.dir}
                  onClick={() => { setSelectedCategory(cat); setIdleView('scripts') }}
                  className="px-3 py-3 text-left bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 hover:border-zinc-500 rounded transition-colors"
                >
                  <p className="text-zinc-200 text-sm font-medium">{cat.name}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    {cat.scripts.length} {cat.scripts.length === 1 ? 'script' : 'scripts'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {idleView === 'scripts' && selectedCategory && (
        <div className="flex-1 overflow-y-auto">
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-700">
              <p className="text-zinc-100 text-sm font-semibold">{selectedCategory.name}</p>
            </div>
            <div className="divide-y divide-zinc-700">
              {selectedCategory.scripts.map((script) => (
                <button
                  key={script.name}
                  onClick={() => { setSelectedScript(script); setArgValues(['', '']); setIdleView('script-args') }}
                  className="w-full text-left px-4 py-3 hover:bg-zinc-700 transition-colors"
                >
                  <p className="text-zinc-200 text-sm font-medium">{script.label}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">{script.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {idleView === 'script-args' && selectedScript && (
        <div className="flex-1 overflow-y-auto">
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-5 space-y-4">

            <div>
              <p className="text-zinc-100 font-semibold text-sm">{selectedScript.label}</p>
              <p className="text-zinc-400 text-xs mt-0.5">{selectedScript.description}</p>
            </div>

            {(selectedScript.argType === 'user' || selectedScript.argType === 'user+custom' || selectedScript.argType === 'user+custom2') && (
              <div>
                <label className="block text-zinc-400 text-xs mb-1">Desktop username</label>
                <input
                  type="text"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  placeholder="your desktop username"
                  autoComplete="off"
                  className={ic(loginUser)}
                />
              </div>
            )}

            {(selectedScript.argType === 'custom' || selectedScript.argType === 'user+custom') && (() => {
              const opts   = selectedScript.argOptions?.[0]
              const curVal = argValues[0]
              const defVal = selectedScript.argDefaults?.[0] ?? ''
              return (
                <div>
                  <label className="block text-zinc-400 text-xs mb-1">
                    {selectedScript.argPrompts?.[0] ?? 'Argument'}
                  </label>
                  {opts?.length ? (
                    <select
                      value={curVal || defVal}
                      onChange={(e) => setArgValues([e.target.value, argValues[1]])}
                      className={ic(curVal || defVal) + ' cursor-pointer'}
                    >
                      {opts.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={curVal}
                      onChange={(e) => setArgValues([e.target.value, argValues[1]])}
                      placeholder={defVal}
                      autoComplete="off"
                      className={ic(curVal)}
                    />
                  )}
                </div>
              )
            })()}

            {(selectedScript.argType === 'user+custom2' || selectedScript.argType === 'custom2') && (
              <div className="space-y-3">
                {([0, 1] as const).map((i) => {
                  const opts      = selectedScript.argOptions?.[i]
                  const curVal    = argValues[i]
                  const defVal    = selectedScript.argDefaults?.[i] ?? ''
                  const label     = selectedScript.argPrompts?.[i] ?? `Argument ${i + 1}`
                  const handleChange = (val: string) =>
                    setArgValues(i === 0 ? [val, argValues[1]] : [argValues[0], val])
                  return (
                    <div key={i}>
                      <label className="block text-zinc-400 text-xs mb-1">{label}</label>
                      {opts?.length ? (
                        <select
                          value={curVal || defVal}
                          onChange={(e) => handleChange(e.target.value)}
                          className={ic(curVal || defVal) + ' cursor-pointer'}
                        >
                          {opts.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={curVal}
                          onChange={(e) => handleChange(e.target.value)}
                          placeholder={defVal}
                          autoComplete="off"
                          className={ic(curVal)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <button
              onClick={() => handleRunScript()}
              disabled={
                (selectedScript.argType === 'user' ||
                 selectedScript.argType === 'user+custom' ||
                 selectedScript.argType === 'user+custom2') && !loginUser
              }
              className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Run {selectedScript.label}
            </button>

          </div>
        </div>
      )}

    </div>
  )
}
