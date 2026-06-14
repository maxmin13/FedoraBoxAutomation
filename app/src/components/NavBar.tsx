// Navigation bar shown at the top of every page.
// Highlights the active page and lets the user switch between pages.

import type { Page } from '../App'

interface NavBarProps {
  currentPage: Page
  onNavigate: (page: Page) => void
  scriptRunning?: boolean
  scriptPage?: Page | null
}

const NAV_ITEMS: { page: Page; label: string }[] = [
  { page: 'setup', label: 'Requirements' },
  { page: 'landing', label: 'My VMs' },
  { page: 'create-vm', label: 'Create VM' },
  { page: 'logs', label: 'Console' },
  { page: 'docs', label: 'Docs' },
]

export default function NavBar({ currentPage, onNavigate, scriptRunning = false, scriptPage = null }: NavBarProps) {
  return (
    <nav className="bg-zinc-800 border-b border-zinc-700 px-6 py-3 flex items-center gap-6">
      {/* App title */}
      <span className="text-zinc-100 font-semibold tracking-wide mr-4">
        FedoraBox Automation
      </span>

      {/* Nav links */}
      {NAV_ITEMS.map((item) => {
        const isActive = item.page === currentPage

        // Active item gets a filled background; inactive items are muted
        const locked = scriptRunning && scriptPage !== 'landing' && item.page !== 'logs' && item.page !== 'docs' && item.page !== scriptPage

        const buttonClass = isActive
          ? 'px-3 py-1 rounded text-sm font-medium bg-zinc-600 text-white'
          : locked
          ? 'px-3 py-1 rounded text-sm font-medium text-zinc-600 cursor-not-allowed'
          : 'px-3 py-1 rounded text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors'

        return (
          <button
            key={item.page}
            onClick={() => !locked && onNavigate(item.page)}
            className={buttonClass}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
