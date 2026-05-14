// Displays the result of a single sanity check as a coloured card.
// Pass = green, Warn = yellow, Fail = red.
// An optional action (button or instructions) is shown when the check
// is not passing and the user needs to do something to fix it.

import { useState } from 'react'
import type { CheckResult } from '../electron.d'

interface CheckCardProps {
  check: CheckResult

  // Optional action to show when the check is warn or fail.
  // If provided, an "How to fix" toggle appears on the card.
  action?: React.ReactNode
}

// Tailwind classes for each status — background, border, and text
const STATUS_STYLES: Record<CheckResult['status'], { card: string; badge: string; icon: string }> = {
  pass: {
    card: 'bg-green-900 border-green-700',
    badge: 'bg-green-700 text-green-100',
    icon: 'OK',
  },
  warn: {
    card: 'bg-yellow-900 border-yellow-700',
    badge: 'bg-yellow-700 text-yellow-100',
    icon: '!!',
  },
  fail: {
    card: 'bg-red-900 border-red-700',
    badge: 'bg-red-700 text-red-100',
    icon: 'XX',
  },
}

export default function CheckCard({ check, action }: CheckCardProps) {
  // Controls whether the fix instructions panel is open
  const [showFix, setShowFix] = useState(false)

  const styles = STATUS_STYLES[check.status]
  const hasAction = action !== undefined && check.status !== 'pass'

  return (
    <div className={`border rounded-lg p-4 ${styles.card}`}>
      <div className="flex items-start gap-3">
        {/* Status badge */}
        <span className={`text-xs font-mono font-bold px-2 py-1 rounded shrink-0 ${styles.badge}`}>
          {styles.icon}
        </span>

        {/* Check label and detail */}
        <div className="flex-1 min-w-0">
          <p className="text-zinc-100 font-medium">{check.label}</p>
          <p className="text-zinc-300 text-sm mt-0.5">{check.detail}</p>
        </div>

        {/* "How to fix" toggle button — only shown when there is an action */}
        {hasAction && (
          <button
            onClick={() => setShowFix(!showFix)}
            className="text-xs text-zinc-300 hover:text-white underline shrink-0"
          >
            {showFix ? 'Hide fix' : 'How to fix'}
          </button>
        )}
      </div>

      {/* Fix instructions — shown when the user clicks "How to fix" */}
      {hasAction && showFix && (
        <div className="mt-3 pt-3 border-t border-zinc-600">
          {action}
        </div>
      )}
    </div>
  )
}
