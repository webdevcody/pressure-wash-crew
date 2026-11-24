import { useEffect } from 'react'
import { useGame } from '../../game/store'

/** Hold left mouse to spray. */
export function SprayInput() {
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const g = useGame.getState()
      if (e.button === 0 && g.phase === 'playing' && !g.paused) g.setSpraying(true)
    }
    const up = (e: MouseEvent) => {
      if (e.button === 0) useGame.getState().setSpraying(false)
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('mouseup', up)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('mouseup', up)
    }
  }, [])
  return null
}
