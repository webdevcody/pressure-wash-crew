import { useEffect } from 'react'
import type * as THREE from 'three'
import { NOZZLES } from '../../game/nozzles'
import { runtime } from '../../game/runtime'
import { useGame } from '../../game/store'

/** Q / E cycle nozzles, 1-5 pick one, R turns fan tips; the gun's tip takes the nozzle's color. */
export function NozzleControls() {
  const nozzleIndex = useGame((s) => s.nozzle)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const g = useGame.getState()
      if (g.phase !== 'playing' || g.paused || e.repeat) return
      if (e.code === 'KeyQ') g.cycleNozzle(-1)
      else if (e.code === 'KeyE') g.cycleNozzle(1)
      else if (e.code === 'KeyR') g.toggleFan()
      else if (/^Digit[1-9]$/.test(e.code)) {
        const i = Number(e.code.slice(5)) - 1
        if (i < NOZZLES.length) g.setNozzle(i)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // Mounted after WasherGun, so runtime.nozzleTip is already set.
  useEffect(() => {
    const mat = runtime.nozzleTip?.material as THREE.MeshStandardMaterial | undefined
    mat?.color.set(NOZZLES[nozzleIndex].color)
  }, [nozzleIndex])

  return null
}
