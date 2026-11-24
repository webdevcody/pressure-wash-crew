import { useEffect, useRef, useState } from 'react'
import { onSurfaceCleaned } from '../game/surfaceEvents'

const SHOW_MS = 1800

/** Short "House front spotless!" banner when a surface is finished. */
export function CleanToast() {
  const [names, setNames] = useState<string[]>([])
  const el = useRef<HTMLDivElement>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const off = onSurfaceCleaned((s) => {
      // Walls finished together (or in quick succession) share one banner.
      setNames((prev) => (timer.current !== undefined && !prev.includes(s.def.name) ? [...prev, s.def.name] : [s.def.name]))
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        timer.current = undefined
        setNames([])
      }, SHOW_MS)
    })
    return () => {
      off()
      window.clearTimeout(timer.current)
    }
  }, [])

  useEffect(() => {
    if (names.length === 0) return
    el.current?.animate(
      [
        { transform: 'translateX(-50%) scale(0.6)', opacity: 0 },
        { transform: 'translateX(-50%) scale(1.12)', opacity: 1, offset: 0.6 },
        { transform: 'translateX(-50%) scale(1)', opacity: 1 },
      ],
      { duration: 260, easing: 'ease-out' },
    )
  }, [names])

  if (names.length === 0) return null
  return (
    <div
      ref={el}
      role="status"
      style={{
        position: 'fixed',
        top: 110,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '10px 22px',
        borderRadius: 999,
        background: 'rgba(22, 163, 74, 0.92)',
        color: '#fff',
        fontWeight: 800,
        fontSize: 22,
        letterSpacing: '.02em',
        boxShadow: '0 6px 24px rgba(0,0,0,.35), 0 0 0 3px rgba(255,255,255,.25)',
        textShadow: '0 1px 2px rgba(0,0,0,.35)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      ✓ {names.join(' + ')} spotless!
    </div>
  )
}
