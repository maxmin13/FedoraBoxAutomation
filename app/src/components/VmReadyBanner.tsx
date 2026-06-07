export type VmReadyState = { running: boolean; guestReady: boolean | null }

interface VmReadyBannerProps {
  vmReady: VmReadyState | null
}

export default function VmReadyBanner({ vmReady }: VmReadyBannerProps) {
  if (!vmReady) return null

  if (!vmReady.running) {
    return (
      <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-950 border border-amber-700 rounded text-xs text-amber-300 shrink-0">
        <span>&#9888;</span>
        <span>VM is not running. Start the VM first.</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-green-950 border border-green-800 rounded text-xs text-green-300 shrink-0">
      <span>&#10003;</span>
      <span>{vmReady.guestReady ? 'VM is ready' : 'VM is running'}</span>
    </div>
  )
}
