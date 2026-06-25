import { useState, useRef } from 'react'

const TIP_W  = 224  // w-56 = 14rem
const MARGIN = 8    // min gap from window edge

export default function Tooltip({ tip, children }: { tip: string; children: React.ReactNode }) {
  const [show, setShow]   = useState(false)
  const [style, setStyle] = useState<React.CSSProperties>({})
  const ref = useRef<HTMLSpanElement>(null)

  function handleMouseEnter() {
    if (ref.current) {
      const r   = ref.current.getBoundingClientRect()
      const vw  = window.innerWidth
      const vh  = window.innerHeight

      // Horizontal: center on element, then clamp so tooltip stays inside viewport
      const idealLeft = r.left + r.width / 2
      const left = Math.max(MARGIN + TIP_W / 2, Math.min(idealLeft, vw - MARGIN - TIP_W / 2))

      // Vertical: open below when near the top, above otherwise
      const openBelow = r.top < 80 || r.bottom > vh - 80 && r.top < 80
      setStyle(openBelow
        ? { position: 'fixed', top: r.bottom + 6, left, transform: 'translate(-50%, 0)',    zIndex: 9999 }
        : { position: 'fixed', top: r.top   - 6,  left, transform: 'translate(-50%, -100%)', zIndex: 9999 }
      )
    }
    setShow(true)
  }

  return (
    <span
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          style={style}
          className="w-56 bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs rounded px-2 py-1.5 whitespace-normal pointer-events-none shadow-lg leading-snug"
        >
          {tip}
        </span>
      )}
    </span>
  )
}
