import { useState, useEffect, useRef } from 'react'
import type { Vm, ScriptLine } from '../electron.d'
import LogPanel from '../components/LogPanel'
import ProgressBar from '../components/ProgressBar'
import { useAuthGate } from '../hooks/useAuthGate'
import VmLoginPage from './VmLoginPage'
// â"€â"€ Types â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type ArgType = 'none' | 'user' | 'custom' | 'user+custom' | 'user+custom2' | 'custom2'

interface ArgOption {
  value: string
  label: string
}

interface ForceConfirmDef {
  title: string        // heading shown in the amber panel
  details?: string[]  // bullet points below the heading
  actionLabel: string // label on the confirm button ("Install anyway", "Update", ...)
}

interface ScriptDef {
  name: string
  label: string
  relPath: string
  scriptPath?: string           // overrides tools/<dir>/<relPath> when the script lives elsewhere
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

// â"€â"€ Script Catalog â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const CATEGORIES: CategoryDef[] = [
  {
    name: 'Languages', dir: 'languages',
    scripts: [
      { name: 'java.sh', label: 'Java JDK', relPath: 'java.sh',
        description: 'Oracle JDK for v21+ (free download), Eclipse Temurin for older LTS — sets JAVA_HOME in ~/.bash_profile',
        argType: 'user+custom', argPrompts: ['JDK version'], argDefaults: [''],
        argOptions: [[
          { value: '',   label: 'Latest GA (auto-detect)' },
          { value: '21', label: '21 — LTS · Oracle · supported until 2031' },
          { value: '17', label: '17 — LTS · Temurin · supported until 2029' },
          { value: '11', label: '11 — LTS · Temurin · supported until 2026' },
        ]] },
      { name: 'php.sh', label: 'PHP', relPath: 'php.sh',
        description: 'PHP + php-common + php-cli, APC cache disabled. Specific versions use the Remi repository.',
        argType: 'user+custom', argPrompts: ['PHP version'], argDefaults: [''],
        argOptions: [[
          { value: '',    label: 'Latest (auto-detect)' },
          { value: '8.4', label: '8.4 - supported until 2028' },
          { value: '8.3', label: '8.3 - supported until 2027' },
          { value: '8.2', label: '8.2 - supported until 2026' },
        ]] },
      { name: 'python.sh', label: 'Python', relPath: 'python.sh',
        description: 'Python from source + venv + pyenv. Specific versions are downloaded from python.org.',
        argType: 'user+custom', argPrompts: ['Python version'], argDefaults: [''],
        argOptions: [[
          { value: '',       label: 'Latest stable (auto-detect)' },
          { value: '3.13.3', label: '3.13.3 - until Oct 2029' },
          { value: '3.12.7', label: '3.12.7 - security fixes until Oct 2028' },
          { value: '3.11.9', label: '3.11.9 - security fixes until Oct 2027' },
        ]] },
      { name: 'node.sh',   label: 'Node.js',      relPath: 'node.sh',   description: 'Node.js LTS via NodeSource - includes npm',
        argType: 'user+custom',
        argPrompts:  ['Node.js version'],
        argDefaults: ['latest'],
        argOptions: [[
          { value: 'latest', label: 'Latest LTS (auto-detect)' },
          { value: '24', label: '24 - ships natively in Fedora 44' },
          { value: '22', label: '22 - LTS Active (until Apr 2027)' },
          { value: '20', label: '20 - LTS Maintenance (until Apr 2026)' },
        ]] },
    ],
  },
  {
    name: 'Build Tools', dir: 'build-tools',
    scripts: [
      { name: 'maven.sh', label: 'Apache Maven', relPath: 'maven.sh',
        description: 'Apache Maven - installs to /opt/maven-<version>, multiple versions can coexist. Sets M2_HOME and PATH.',
        argType: 'custom', argPrompts: ['Maven version'], argDefaults: ['latest'],
        argOptions: [[
          { value: 'latest',  label: 'Latest 3.x (auto-detect)' },
          { value: '3.9.9',   label: '3.9.9' },
          { value: '3.9.6',   label: '3.9.6' },
          { value: '3.9.5',   label: '3.9.5' },
          { value: '3.8.8',   label: '3.8.8 - last 3.8.x release' },
        ]] },
    ],
  },
  {
    name: 'Web Servers', dir: 'web-servers',
    scripts: [
      { name: 'httpd.sh', label: 'Apache HTTP Server', relPath: 'httpd.sh',
        description: 'Apache HTTP Server built from source to /opt/httpd-<version>. Configures a versioned systemd service; /opt/httpd symlinks to the latest installed.',
        argType: 'user+custom', argPrompts: ['Apache version'], argDefaults: [''],
        argOptions: [[
          { value: '',       label: 'Latest (auto-detect)' },
          { value: '2.4.63', label: '2.4.63' },
          { value: '2.4.62', label: '2.4.62' },
          { value: '2.4.58', label: '2.4.58' },
        ]] },
      { name: 'tomcat.sh',        label: 'Apache Tomcat',       relPath: 'tomcat/tomcat.sh',        description: 'Apache Tomcat - multi-instance by port, requires Java',
        argType: 'user+custom2',
        argPrompts:  ['Tomcat version', 'HTTP port'],
        argDefaults: ['latest-10', '8080'],
        argOptions: [[
          { value: 'latest-11', label: '11.x - Latest (auto-detect) - Java 21+' },
          { value: 'latest-10', label: '10.x - Latest (auto-detect) - Java 11+' },
          { value: 'latest-9',  label: '9.x  - Latest (auto-detect) - Java  8+' },
          { value: '11.0.7',    label: '11.0.7  - pinned - Java 21+' },
          { value: '10.1.36',   label: '10.1.36 - pinned - Java 11+' },
          { value: '9.0.102',   label: '9.0.102 - pinned - Java  8+' },
        ]] },
    ],
  },
  {
    name: 'Databases', dir: 'databases',
    scripts: [
      { name: 'mariadb.sh',    label: 'MariaDB',     relPath: 'mariadb.sh',    description: 'MariaDB - MySQL-compatible relational database',     argType: 'none' },
      { name: 'postgresql.sh', label: 'PostgreSQL',  relPath: 'postgresql.sh', description: 'PostgreSQL + pgAdmin 4, remote connections enabled',
        argType: 'custom', argPrompts: ['Version'], argDefaults: [''],
        argOptions: [[
          { value: '',   label: 'Latest (Fedora repo)' },
          { value: '17', label: '17 - PGDG' },
          { value: '16', label: '16 - PGDG' },
          { value: '15', label: '15 - PGDG' },
          { value: '14', label: '14 - PGDG' },
        ]] },
    ],
  },
  {
    name: 'IDEs', dir: 'ides',
    scripts: [
      { name: 'eclipse.sh',          label: 'Eclipse IDE',          relPath: 'eclipse.sh',          description: 'Eclipse IDE for Java EE',
        argType: 'custom', argPrompts: ['Eclipse release'], argDefaults: ['latest'],
        argOptions: [[
          { value: 'latest',  label: 'Latest (auto-detect)' },
          { value: '2026-03', label: '2026-03 - 4.35 (Mar 2026)' },
          { value: '2025-12', label: '2025-12 - 4.34 (Dec 2025)' },
          { value: '2025-09', label: '2025-09 - 4.33 (Sep 2025)' },
          { value: '2025-06', label: '2025-06 - 4.32 (Jun 2025)' },
        ]] },
      { name: 'eclipse-ee.sh',       label: 'Eclipse Installer',      relPath: 'eclipse-ee.sh',    description: 'Downloads the Eclipse Installer (Oomph) - run it manually to choose your Eclipse flavour',
        argType: 'custom', argPrompts: ['Eclipse release'], argDefaults: ['latest'],
        argOptions: [[
          { value: 'latest',  label: 'Latest (auto-detect)' },
          { value: '2026-03', label: '2026-03 - 4.35 (Mar 2026)' },
          { value: '2025-12', label: '2025-12 - 4.34 (Dec 2025)' },
          { value: '2025-09', label: '2025-09 - 4.33 (Sep 2025)' },
          { value: '2025-06', label: '2025-06 - 4.32 (Jun 2025)' },
        ]] },
      { name: 'intellij.sh', label: 'IntelliJ IDEA CE', relPath: 'intellij.sh',
        description: 'IntelliJ IDEA Community Edition - installs to /opt/idea-IC-<version>',
        argType: 'custom', argPrompts: ['IntelliJ version'], argDefaults: ['latest'],
        argOptions: [[
          { value: 'latest',   label: 'Latest (auto-detect)' },
          { value: '2025.1.2', label: '2025.1.2' },
          { value: '2024.3.5', label: '2024.3.5' },
          { value: '2024.2.5', label: '2024.2.5' },
          { value: '2024.1.7', label: '2024.1.7' },
        ]] },
      { name: 'visualstudiocode.sh', label: 'VS Code', relPath: 'visualstudiocode.sh',
        description: 'Visual Studio Code - installs to /opt/vscode-<version>, multiple versions can coexist',
        argType: 'custom', argPrompts: ['VS Code version'], argDefaults: ['latest'],
        argOptions: [[
          { value: 'latest',  label: 'Latest stable (auto-detect)' },
          { value: '1.100.0', label: '1.100.0 - May 2025' },
          { value: '1.99.0',  label: '1.99.0  - Apr 2025' },
          { value: '1.98.0',  label: '1.98.0  - Mar 2025' },
          { value: '1.97.0',  label: '1.97.0  - Feb 2025' },
        ]] },
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
            'dnf update will not patch /usr/local/ssl - you must rebuild manually when CVEs drop',
            'The system OpenSSL still wins in the terminal unless PATH is manually adjusted',
          ],
          actionLabel: 'Install anyway',
        },
      },
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
    name: 'Desktop', dir: 'desktop',
    scripts: [
      { name: 'flameshot.sh', label: 'Flameshot',     relPath: 'flameshot.sh',  description: 'Flameshot screenshot tool - binds Print Screen to flameshot gui', argType: 'user' },
      { name: 'dbeaver.sh',  label: 'DBeaver CE',    relPath: 'dbeaver.sh',   scriptPath: 'tools/databases/dbeaver.sh',   description: 'DBeaver CE - GUI client for MariaDB, PostgreSQL',  argType: 'none' },
      { name: 'chrome.sh',   label: 'Google Chrome', relPath: 'chrome.sh',    scriptPath: 'tools/browsers/chrome.sh',     description: 'Google Chrome stable',                             argType: 'none' },
      { name: 'wireshark.sh',label: 'Wireshark',     relPath: 'wireshark.sh', scriptPath: 'tools/network/wireshark.sh',   description: 'Wireshark - network packet analyser',              argType: 'user' },
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

// â"€â"€ Script result map â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
// Persists across React mount/unmount so the user sees the outcome when they
// navigate back and explicitly open the script form they submitted from.

interface ScriptResult {
  state: 'success' | 'error'
  lines: ScriptLine[]
  error?: string
}
const _scriptResults = new Map<string, ScriptResult>()

export function clearScriptResultsCache() { _scriptResults.clear() }

function srKey(vmName: string, scriptName: string | null): string {
  return `${vmName}::${scriptName ?? '__base-setup__'}`
}

function saveResult(key: string, exitCode: number | null, lines: ScriptLine[]): void {
  const errMsg = [...lines].reverse().find(l => l.text.startsWith('ERROR: '))?.text.replace(/^ERROR:\s*/, '')
  _scriptResults.set(key, exitCode === 0
    ? { state: 'success', lines }
    : { state: 'error', lines, error: errMsg ?? `Script failed (exit ${exitCode ?? '?'})` }
  )
}

// â"€â"€ Helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

// â"€â"€ RestartModal â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

interface RestartModalProps {
  vmName: string
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}

function RestartModal({ vmName, busy, onConfirm, onCancel }: RestartModalProps) {
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
        <p className="text-zinc-400 text-sm text-center mb-2">Restart this VM?</p>
        <p className="text-zinc-100 text-2xl font-bold text-center break-all mb-2">{vmName}</p>
        <p className="text-zinc-500 text-xs text-center mb-8">
          The VM will be shut down and restarted. Unsaved work inside may be lost.
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
            className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Restart VM
          </button>
        </div>
      </div>
    </div>
  )
}

// â"€â"€ Component â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

  const [restarting,        setRestarting]        = useState(false)
  const [restarted,         setRestarted]         = useState(false)
  const [showRestartModal,  setShowRestartModal]  = useState(false)
  const [forceConfirm,      setForceConfirm]      = useState(false)
  const [alreadyInstalled,  setAlreadyInstalled]  = useState(false)
  const [isReconnect, setIsReconnect] = useState(false)
  const forceConfirmNeededRef  = useRef(false)
  const alreadyInstalledRef    = useRef(false)
  const reconnectUnsubRef      = useRef<{ line: () => void; done: () => void } | null>(null)
  const mountedRef             = useRef(true)

  useEffect(() => { return () => { mountedRef.current = false } }, [])

  // On mount: flush any done state from the backend into _scriptResults so the
  // banner reappears when the user clicks that script's form. Do NOT set pageState
  // to 'done' here — the user should land on the mode selector, not the banner.
  useEffect(() => {
    window.electronAPI.getScriptState().then(async (state) => {
      if (!state.ok || !state.context) return
      if (state.context.vmName !== vm.name || state.context.type !== 'provision') return
      if (state.running) return

      const scriptName = state.context.scriptName ?? null
      const key = srKey(vm.name, scriptName)

      if (state.done) {
        saveResult(key, state.exitCode, state.lines)
        await window.electronAPI.clearScriptState()
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [selectedCategory, setSelectedCategory] = useState<CategoryDef | null>(null)
  const [selectedScript,   setSelectedScript]   = useState<ScriptDef   | null>(null)
  const [argValues,        setArgValues]        = useState(['', ''])
  const [changeHostname,   setChangeHostname]   = useState(false)
  const [hostname,         setHostname]         = useState('')
  const [credKey,          setCredKey]          = useState(0)


  const { withAuth, loginRequired, onLoginSuccess, onLoginBack } = useAuthGate(vm.name)

  function handleLoginSuccess() {
    setCredKey(k => k + 1)
    onLoginSuccess()
  }

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
  }, [vm.name, credKey])

  useEffect(() => {
    onScriptRunning(pageState === 'running' || restarting)
  }, [pageState, restarting, onScriptRunning])

  useEffect(() => {
    window.electronAPI.logUiAction(
      `provision "${vm.name}": [dbg] pageState=${pageState} idleView=${idleView} reconnect=${reconnectUnsubRef.current !== null}`
    )
  }, [pageState, idleView])

  useEffect(() => {
    if (pageState !== 'done') return
    if (selectedScript)
      window.electronAPI.logUiAction(`provision "${vm.name}": [dbg] banner shown for "${selectedScript.name}"`)
    else if (runningLabel === 'Base Setup')
      window.electronAPI.logUiAction(`provision "${vm.name}": [dbg] banner shown for Base Setup`)
  }, [pageState, selectedScript?.name, runningLabel])


  function handleSelectCategory(cat: typeof CATEGORIES[number]) {
    window.electronAPI.logUiAction(`provision "${vm.name}": select category "${cat.name}"`)
    setSelectedCategory(cat)
    setIdleView('scripts')
  }

  async function handleSelectScript(script: ScriptDef) {
    window.electronAPI.logUiAction(`provision "${vm.name}": select script "${script.label}"`)
    const key = srKey(vm.name, script.name)
    const state = await window.electronAPI.getScriptState()
    const matchesThisScript =
      state.ok &&
      (state.running || state.done) &&
      state.context?.vmName === vm.name &&
      state.context?.type === 'provision' &&
      state.context?.scriptName === script.name

    window.electronAPI.logUiAction(
      `provision "${vm.name}": [dbg] script=${script.name} running=${state.running} done=${state.done} ` +
      `matches=${matchesThisScript} mapEntry=${_scriptResults.get(key)?.state ?? 'none'}`
    )

    if (matchesThisScript && state.running) {
      window.electronAPI.logUiAction(`provision "${vm.name}": [dbg] â†' reconnect (running)`)
      setSelectedScript(script)
      setRunningLabel(script.label)
      setLines(state.lines)
      setPageState('running')
      setShowLog(true)
      const liveLines = [...state.lines]
      const unsubLine = window.electronAPI.onScriptLine((line) => {
        liveLines.push(line)
        setLines((prev) => [...prev, line])
      })
      const unsubDone = window.electronAPI.onScriptDone((exitCode) => {
        saveResult(key, exitCode, liveLines)
        setSuccess(exitCode === 0)
        window.electronAPI.clearScriptState()
        setPageState('done')
        setShowLog(false)
        unsubLine()
        unsubDone()
      })
      return
    }

    // Script finished between mount and now (state still held by main process)
    if (matchesThisScript && state.done) {
      saveResult(key, state.exitCode, state.lines)
      window.electronAPI.clearScriptState()
    }

    const result = _scriptResults.get(key)
    _scriptResults.delete(key)

    if (result) {
      window.electronAPI.logUiAction(`provision "${vm.name}": [dbg] â†' restore banner (${result.state})`)
      setSelectedScript(script)
      setRunningLabel(script.label)
      setLines(result.lines)
      setAlreadyInstalled(result.lines.some(l => /\[INFO\s*\].*already installed/i.test(l.text)))
      setSuccess(result.state === 'success')
      setPageState('done')
      setShowLog(false)
      return
    }

    window.electronAPI.logUiAction(`provision "${vm.name}": [dbg] â†' form`)
    setSelectedScript(script)
    setArgValues(['', ''])
    setIdleView('script-args')
  }

  function handleNavBack() {
    window.electronAPI.logUiAction(`provision "${vm.name}": Back (from ${idleView})`)
    switch (idleView) {
      case 'mode':        onBack();                   break
      case 'full-form':   setIdleView('mode');        break
      case 'categories':  setIdleView('mode');        break
      case 'scripts':     setIdleView('categories');  break
      case 'script-args':
        setIdleView('scripts')
        break
    }
  }

  async function startRun(
    runFn: () => Promise<{ ok: boolean; error?: string; errorDetail?: string }>,
    trackAlreadyInstalled = true,
    runScriptName: string | null = selectedScript?.name ?? null
  ) {
    const runKey = srKey(vm.name, runScriptName)
    _scriptResults.delete(runKey)
    setPageState('running')
    setLines([])
    setSuccess(null)
    setError(null)
    setShowLog(true)
    forceConfirmNeededRef.current = false
    alreadyInstalledRef.current   = false

    const capturedLines: ScriptLine[] = []
    const unsubLine = window.electronAPI.onScriptLine((line) => {
      capturedLines.push(line)
      setLines((prev) => [...prev, line])
      if (/Use 'Install anyway'/i.test(line.text)) {
        forceConfirmNeededRef.current = true
      }
      if (trackAlreadyInstalled && /\[INFO\s*\].*already installed/i.test(line.text)) {
        alreadyInstalledRef.current = true
      }
    })
    const unsubDone = window.electronAPI.onScriptDone(async (exitCode) => {
      if (exitCode === 0 && loginUser) {
        await window.electronAPI.saveVmCredentials(vm.name, vmUser, vmPass, loginUser)
      }
      // Always persist result so navigate-away + return can show it.
      saveResult(runKey, exitCode, [...capturedLines])
      if (mountedRef.current) window.electronAPI.clearScriptState()
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
      const errMsg = err instanceof Error ? err.message : String(err)
      setError(errMsg)
      _scriptResults.set(runKey, { state: 'error', lines: [...capturedLines], error: errMsg })
      setSuccess(false)
      setPageState('done')
      setShowLog(false)
      unsubLine()
      unsubDone()
    }
  }

  async function handleRunScript(force = false) {
    if (!selectedScript || !selectedCategory) return
    window.electronAPI.logUiAction(`provision "${vm.name}": run "${selectedScript.label}"${force ? ' (force)' : ''}`)
    if (force) setForceConfirm(false)
    setRunningLabel(selectedScript.label)
    const scriptArgs = buildScriptArgs(selectedScript, argValues, loginUser) + (force ? ' --force' : '')
    await startRun(() =>
      window.electronAPI.runProvisionScript({
        vmName:        vm.name,
        vmUser,
        vmPass,
        loginUser,
        scriptRelPath: selectedScript.scriptPath ?? `tools/${selectedCategory.dir}/${selectedScript.relPath}`,
        scriptArgs,
        categoryDir: selectedCategory.dir,
        scriptName:  selectedScript.name,
      })
    )
  }

  async function handleRestart() {
    window.electronAPI.logUiAction(`provision "${vm.name}": Restart VM confirmed`)
    setShowRestartModal(false)
    setLines([])
    setShowLog(true)
    setRestarting(true)

    const unsubLine = window.electronAPI.onScriptLine((line) => {
      setLines((prev) => [...prev, line])
    })
    const unsubDone = window.electronAPI.onScriptDone((exitCode) => {
      setRestarting(false)
      if (exitCode === 0) setRestarted(true)
      unsubLine()
      unsubDone()
    })

    await window.electronAPI.restartVm(vm.name)
  }

  async function handleSelectBaseSetup() {
    window.electronAPI.logUiAction(`provision "${vm.name}": select Base Setup`)
    const key = srKey(vm.name, null)
    const state = await window.electronAPI.getScriptState()
    const isBaseSetup =
      state.ok &&
      (state.running || state.done) &&
      state.context?.vmName === vm.name &&
      state.context?.type === 'provision' &&
      !state.context?.scriptName

    if (isBaseSetup && state.running) {
      window.electronAPI.logUiAction(`provision "${vm.name}": [dbg] â†' reconnect Base Setup (running)`)
      setRunningLabel('Base Setup')
      setLines(state.lines)
      setIsReconnect(true)
      setPageState('running')
      setShowLog(true)
      const liveLines = [...state.lines]
      const unsubLine = window.electronAPI.onScriptLine((line) => {
        liveLines.push(line)
        setLines((prev) => [...prev, line])
      })
      const unsubDone = window.electronAPI.onScriptDone((exitCode) => {
        saveResult(key, exitCode, liveLines)
        setSelectedScript(null)
        setSuccess(exitCode === 0)
        setIsReconnect(false)
        window.electronAPI.clearScriptState()
        setPageState('done')
        setShowLog(false)
        reconnectUnsubRef.current = null
        unsubLine()
        unsubDone()
      })
      reconnectUnsubRef.current = { line: unsubLine, done: unsubDone }
      return
    }

    // Script finished between mount and now
    if (isBaseSetup && state.done) {
      saveResult(key, state.exitCode, state.lines)
      window.electronAPI.clearScriptState()
    }

    const result = _scriptResults.get(key)
    if (result) {
      _scriptResults.delete(key)
      window.electronAPI.logUiAction(`provision "${vm.name}": [dbg] â†' restore Base Setup banner (${result.state})`)
      setSelectedScript(null)
      setRunningLabel('Base Setup')
      setLines(result.lines)
      setSuccess(result.state === 'success')
      setPageState('done')
      return
    }

    setIdleView('full-form')
  }

  async function handleRunFull() {
    window.electronAPI.logUiAction(`provision "${vm.name}": run Base Setup`)
    setSelectedScript(null)
    setRunningLabel('Base Setup')
    await startRun(() =>
      window.electronAPI.runProvisionSetup({
        vmName: vm.name,
        vmUser,
        vmPass,
        loginUser,
        hostname: changeHostname ? hostname.trim() : '',
      }), false, null
    )
  }

  const ic = (val: string) =>
    'w-full px-2.5 py-1.5 bg-zinc-700 border rounded text-zinc-100 text-sm ' +
    'focus:outline-none focus:border-blue-500 ' +
    (val ? 'border-zinc-400' : 'border-zinc-600')


  // â"€â"€ Login gate â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (loginRequired) {
    return (
      <div className="h-full overflow-y-auto">
        <VmLoginPage initialVmName={vm.name} onBack={onLoginBack} onNext={handleLoginSuccess} />
      </div>
    )
  }

  // â"€â"€ Running â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (pageState === 'running') {
    return (
      <div className="h-full max-w-2xl w-full mx-auto flex flex-col gap-4">
        <div className="shrink-0 space-y-2">
          {isReconnect && (
            <button
              onClick={() => {
                window.electronAPI.logUiAction(`provision "${vm.name}": disconnect from running Base Setup`)
                reconnectUnsubRef.current?.line()
                reconnectUnsubRef.current?.done()
                reconnectUnsubRef.current = null
                setIsReconnect(false)
                setPageState('idle')
                setIdleView('mode')
              }}
              className="px-3 py-1 text-sm border border-zinc-600 hover:border-zinc-400 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
            >
              &larr; Back
            </button>
          )}
          <p className="text-zinc-300 text-sm font-medium">Running {runningLabel}...</p>
          <ProgressBar />
        </div>
        <LogPanel lines={lines} showLog={pageState === 'running' || showLog} onToggle={() => setShowLog((v) => !v)} />
      </div>
    )
  }

  // â"€â"€ Done â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (pageState === 'done') {
    return (
      <div className="h-full max-w-2xl w-full mx-auto flex flex-col gap-4">
        {showRestartModal && (
          <RestartModal
            vmName={vm.name}
            busy={restarting}
            onConfirm={handleRestart}
            onCancel={() => setShowRestartModal(false)}
          />
        )}

        {success === true && !alreadyInstalled && (
          <div className="bg-green-900 border border-green-700 rounded-lg p-4 shrink-0">
            <p className="text-green-200 font-medium">{runningLabel} completed successfully.</p>
            {runningLabel === 'Guest Additions' && (
              <p className="text-green-300 text-sm mt-1">Reboot the VM to activate, then return here to provision.</p>
            )}
            {runningLabel === 'Base Setup' && (
              <div className="mt-3">
                <p className="text-green-300 text-sm mb-2">Reboot the VM to apply desktop changes.</p>
                <button
                  onClick={() => { window.electronAPI.logUiAction(`provision "${vm.name}": Restart VM`); setShowRestartModal(true) }}
                  disabled={restarting || restarted}
                  className="px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded transition-colors"
                >
                  {restarting ? 'Rebooting...' : restarted ? 'VM Restarted' : 'Restart VM'}
                </button>
              </div>
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
                onClick={() => { window.electronAPI.logUiAction(`provision "${vm.name}": force confirm "${selectedScript.forceConfirmDef?.actionLabel}"`); withAuth(() => handleRunScript(true)) }}
                className="px-4 py-2 text-sm bg-amber-700 hover:bg-amber-600 text-white font-medium rounded transition-colors"
              >
                {selectedScript.forceConfirmDef.actionLabel}
              </button>
              <button
                onClick={() => { window.electronAPI.logUiAction(`provision "${vm.name}": force confirm cancelled`); setForceConfirm(false) }}
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
          <div className="flex gap-2">
          {success === false && (
          <button
            onClick={() => { window.electronAPI.logUiAction(`provision "${vm.name}": Try again`); withAuth(() => runningLabel === 'Base Setup' ? handleRunFull() : handleRunScript()) }}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 rounded transition-colors"
          >
            Try again
          </button>
          )}
          <button
            onClick={async () => {
              window.electronAPI.logUiAction(`provision "${vm.name}": Run another`)
              _scriptResults.delete(srKey(vm.name, runningLabel === 'Base Setup' ? null : selectedScript?.name ?? null))
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
          </div>
          <button
            onClick={() => { window.electronAPI.logUiAction(`provision "${vm.name}": Back to My VMs`); _scriptResults.delete(srKey(vm.name, runningLabel === 'Base Setup' ? null : selectedScript?.name ?? null)); onBack() }}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-600 hover:border-zinc-400 rounded transition-colors"
          >
            &larr; My VMs
          </button>
        </div>

      </div>
    )
  }

  // â"€â"€ Idle â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

      {/* â"€â"€ Mode (main landing) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      {idleView === 'mode' && (
        <div className="flex flex-col gap-3">

          {/* Mode buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleSelectBaseSetup}
              className="bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded-lg p-5 text-left transition-colors"
            >
              <p className="text-zinc-100 font-semibold text-sm mb-1">Base Setup</p>
              <p className="text-zinc-400 text-xs leading-relaxed">
                Foundation setup: system prep, hostname, SELinux, desktop config, and utilities.
              </p>
            </button>
            <button
              onClick={() => { window.electronAPI.logUiAction(`provision "${vm.name}": select By Category`); setIdleView('categories') }}
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

      {/* â"€â"€ Sub-views (full width, back button navigates) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}

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
                      <span className="text-zinc-500"> - {step.desc}</span>
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
                <p className="text-zinc-500 text-xs mt-1">The hostname set inside Fedora - not the VirtualBox VM name.</p>
              </div>
            )}
            <button
              onClick={() => withAuth(handleRunFull)}
              className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors"
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
                  onClick={() => handleSelectCategory(cat)}
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
                  onClick={() => handleSelectScript(script)}
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

      {idleView === 'script-args' && selectedScript && (() => {
        return (
          <div className="flex-1 overflow-y-auto">
            <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-5 space-y-4">

              <div>
                <p className="text-zinc-100 font-semibold text-sm">{selectedScript.label}</p>
                <p className="text-zinc-400 text-xs mt-0.5">{selectedScript.description}</p>
              </div>

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
                onClick={() => withAuth(() => handleRunScript())}
                className="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 text-white font-medium rounded transition-colors"
              >
                Run {selectedScript.label}
              </button>

            </div>
          </div>
        )
      })()}

    </div>
  )
}
