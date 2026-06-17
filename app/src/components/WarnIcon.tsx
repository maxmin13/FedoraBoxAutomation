import { useState, useRef } from 'react'

export default function WarnIcon({ hint }: { hint: string }) {
  const [show, setShow]   = useState(false)
  const [style, setStyle] = useState<React.CSSProperties>({})
  const ref = useRef<HTMLSpanElement>(null)

  function handleMouseEnter() {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect()
      setStyle({
        position: 'fixed',
        top:  r.top - 6,
        left: r.left + r.width / 2,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999,
      })
    }
    setShow(true)
  }

  return (
    <span
      ref={ref}
      className="shrink-0 text-amber-400 text-xs cursor-default"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShow(false)}
    >
      &#9888;
      {show && (
        <span
          style={style}
          className="w-56 bg-zinc-700 border border-zinc-600 text-zinc-200 text-xs rounded px-2 py-1.5 whitespace-normal pointer-events-none shadow-lg"
        >
          {hint}
        </span>
      )}
    </span>
  )
}
