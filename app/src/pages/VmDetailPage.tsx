import { useState } from 'react'
import type { Vm } from '../electron.d'
import ShareFolderPage from './ShareFolderPage'
import VmRunningBadge from '../components/VmRunningBadge'

interface VmDetailPageProps {
  vm: Vm
  onBack: () => void
  onScriptRunning: (running: boolean) => void
}

type View = 'detail' | 'share-folder'

export default function VmDetailPage({ vm, onBack, onScriptRunning }: VmDetailPageProps) {
  const [view, setView] = useState<View>('detail')

  if (view === 'share-folder') {
    return <ShareFolderPage vm={vm} onBack={() => setView('detail')} onScriptRunning={onScriptRunning} />
  }

  return (
    <div className="max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100 truncate">{vm.name}</h1>

        <VmRunningBadge running={vm.running} />
      </div>

      <div className="space-y-4">

        {/* Log sync */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-5">
          <h2 className="text-zinc-100 font-medium mb-1">Log sync</h2>
          <p className="text-zinc-400 text-sm mb-4">
            Sync <code className="text-zinc-300">/var/log</code> from the VM to a host
            folder every 30 seconds via a VirtualBox shared folder and rsync.
          </p>
          <button className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm">
            Set up log sync
          </button>
        </div>

        {/* Shared folder */}
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-5">
          <h2 className="text-zinc-100 font-medium mb-1">Shared folder</h2>
          <p className="text-zinc-400 text-sm mb-4">
            Mount a host directory inside the VM via VirtualBox shared folders.
          </p>
          <button
            onClick={() => setView('share-folder')}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm"
          >
            Set up shared folder
          </button>
        </div>

      </div>

      <div className="mt-6">
        <button
          onClick={onBack}
          className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white rounded text-sm"
        >
          &larr; Back
        </button>
      </div>
    </div>
  )
}
