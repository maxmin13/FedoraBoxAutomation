import { useLayoutEffect, useEffect, useRef } from 'react'
import type { ScriptLine } from '../electron.d'

interface LogPanelProps {
  lines:    ScriptLine[]
  showLog:  boolean
  onToggle: () => void
  title?:   string
}

export default function LogPanel({ lines, showLog, onToggle, title = 'Script output' }: LogPanelProps) {
  const endRef      = useRef<HTMLDivElement>(null)
  const panelRef    = useRef<HTMLDivElement>(null)
  const onToggleRef = useRef(onToggle)
  onToggleRef.current = onToggle

  useLayoutEffect(() => {
    if (showLog) endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [lines, showLog])

  useEffect(() => {
    if (!showLog) return
    function handleMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onToggleRef.current()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [showLog])

  return (
    <div ref={panelRef} className="relative shrink-0">
      <button
        type="button"
        onClick={onToggle}
        className={
          'w-full flex items-center justify-between px-4 py-3 text-left ' +
          'bg-zinc-800 border border-zinc-700 ' +
          (showLog ? 'rounded-t-lg' : 'rounded-lg')
        }
      >
        <span className="text-zinc-400 text-xs font-medium uppercase tracking-wide">{title}</span>
        <span className="text-zinc-500 text-xs">{showLog ? 'Hide' : 'Show'}</span>
      </button>
      {showLog && (
        <div className="absolute top-full left-0 right-0 z-10 bg-zinc-800 border-x border-b border-zinc-700 rounded-b-lg px-4 pt-2 pb-4 font-mono text-xs max-h-64 overflow-y-auto space-y-0.5">
          {lines.map((line, i) => (
            <div key={i} className={line.source === 'stderr' ? 'text-red-400' : 'text-zinc-400'}>
              {line.text}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  )
}
