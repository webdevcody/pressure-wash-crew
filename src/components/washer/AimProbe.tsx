import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { NOZZLES } from '../../game/nozzles'
import { castSprayRay } from '../../game/sprayRay'
import { useGame } from '../../game/store'
import { CLEAN_THRESHOLD, type WashSurface } from '../../game/washSurface'

/** Furthest the crosshair looks for a stain to label. */
const AIM_RANGE = 14
const dir = new THREE.Vector3()

/** What stain is under the crosshair, for the HUD hint. Probes ~10x/sec. */
export function AimProbe() {
  const camera = useThree((s) => s.camera)
  const acc = useRef(0)

  useFrame((_, rawDt) => {
    const g = useGame.getState()
    if (g.phase !== 'playing' || g.paused) return
    acc.current += Math.min(rawDt, 0.1)
    if (acc.current < 0.1) return
    acc.current = 0
    camera.getWorldDirection(dir)
    const hit = castSprayRay(camera.position, dir, AIM_RANGE)
    const surface = hit?.object.userData.surface as WashSurface | undefined
    const i = surface && hit?.uv ? surface.texelAt(hit.uv) : -1
    if (surface && i >= 0 && surface.dirt[i] >= CLEAN_THRESHOLD) {
      g.setAim(surface.stain[i], Math.round(surface.soap[i] * 10) / 10, hit!.distance > NOZZLES[g.nozzle].reach)
    } else {
      g.setAim(-1, 0, false)
    }
  })

  return null
}
