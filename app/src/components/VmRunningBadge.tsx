interface VmRunningBadgeProps {
  running: boolean
  /** Set to true while a start operation is in flight to show a blue badge. */
  starting?: boolean
  /** Set to true while a stop operation is in flight to show an amber badge. */
  stopping?: boolean
}

export default function VmRunningBadge({ running, starting, stopping }: VmRunningBadgeProps) {
  if (starting) {
    return (
      <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded-full shrink-0">
        Starting...
      </span>
    )
  }
  if (stopping) {
    return (
      <span className="text-xs bg-amber-800 text-amber-200 px-2 py-0.5 rounded-full shrink-0">
        Stopping...
      </span>
    )
  }
  return running ? (
    <span className="text-xs bg-green-800 text-green-200 px-2 py-0.5 rounded-full shrink-0">
      Running
    </span>
  ) : (
    <span className="text-xs bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full shrink-0">
      Stopped
    </span>
  )
}
