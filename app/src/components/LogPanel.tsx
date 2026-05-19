import { useLayoutEffect, useRef } from 'react'
import type { ScriptLine } from '../electron.d'

interface LogPanelProps {
  lines:    ScriptLine[]
  showLog:  boolean
  onToggle: () => void
  title?:   string
}

export default function LogPanel({ lines, showLog, onToggle, title = 'Script output' }: LogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (showLog && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, showLog])

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">{title}</span>
        <span className="text-zinc-500 text-xs">{showLog ? 'Hide' : 'Show'}</span>
      </button>
      {showLog && (
        <div ref={scrollRef} className="px-4 pb-4 font-mono text-xs max-h-64 overflow-y-auto space-y-0.5">
          {lines.map((line, i) => (
            <div key={i} className={line.source === 'stderr' ? 'text-red-400' : 'text-zinc-400'}>
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
