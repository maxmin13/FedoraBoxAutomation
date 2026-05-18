interface VmRunningBadgeProps {
  running: boolean
}

export default function VmRunningBadge({ running }: VmRunningBadgeProps) {
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
