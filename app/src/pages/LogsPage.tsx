// Logs page — lets the user view the two app log files.
// gui.log: Electron main process IPC calls and errors.
// host.log: Full PowerShell transcript from every .ps1 run.

import { useEffect, useRef, useState } from 'react'

type LogName = 'gui.log' | 'host.log'

const LOGS: { name: LogName; label: string; description: string }[] = [
  { name: 'gui.log',  label: 'GUI log',  description: 'Electron main process — IPC calls, replies, errors' },
  { name: 'host.log', label: 'Host log', description: 'PowerShell transcript — full output of every .ps1 run' },
]

export default function LogsPage() {
  const [selectedLog, setSelectedLog] = useState<LogName>('gui.log')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const contentRef = useRef<HTMLElement>(null)

  useEffect(() => {
    loadLog(selectedLog)
  }, [selectedLog])

  // Scroll to the bottom whenever content loads so the newest entries are visible
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [content])

  async function loadLog(name: LogName) {
    setLoading(true)
    setError(null)
    setContent('')

    try {
      const result = await window.electronAPI.readLog(name)

      if (result.ok) {
        setContent(result.content ?? '')
      } else {
        setError(result.error ?? 'Could not read log file')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error reading log')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex gap-6 h-full">

      {/* Sidebar */}
      <aside className="w-52 shrink-0">
        <p className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Log files</p>
        <nav className="space-y-1">
          {LOGS.map((log) => {
            const isActive = log.name === selectedLog

            return (
              <button
                key={log.name}
                onClick={() => setSelectedLog(log.name)}
                className={[
                  'w-full text-left px-3 py-2 rounded text-sm',
                  isActive
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800',
                ].join(' ')}
              >
                <span className="block font-medium">{log.label}</span>
                <span className="block text-xs text-zinc-500 mt-0.5">{log.description}</span>
              </button>
            )
          })}
        </nav>

        <button
          onClick={() => loadLog(selectedLog)}
          disabled={loading}
          className="mt-4 w-full px-3 py-2 rounded text-sm bg-zinc-700 text-zinc-100 hover:bg-zinc-600 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>

        <p className="text-zinc-500 text-xs uppercase tracking-wider mt-6 mb-3">Open folder</p>
        <button
          onClick={() => window.electronAPI.openLogDir('app')}
          className="w-full text-left px-3 py-2 rounded text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          App logs
          <span className="block text-xs text-zinc-600 mt-0.5">gui.log &amp; host.log</span>
        </button>
        <button
          onClick={() => window.electronAPI.openLogDir('vbox')}
          className="mt-1 w-full text-left px-3 py-2 rounded text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          VirtualBox VMs
          <span className="block text-xs text-zinc-600 mt-0.5">per-VM Logs\ subfolders</span>
        </button>
      </aside>

      {/* Log content */}
      <main ref={contentRef} className="flex-1 min-w-0 overflow-y-auto">
        {loading && (
          <p className="text-zinc-500 text-sm">Loading...</p>
        )}

        {error && (
          <div className="bg-red-900 border border-red-700 rounded p-4 text-red-300 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && content === '' && (
          <p className="text-zinc-500 text-sm">Log file is empty.</p>
        )}

        {!loading && !error && content !== '' && (
          <pre className="text-zinc-300 text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
            {content}
          </pre>
        )}
      </main>
    </div>
  )
}
