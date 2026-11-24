import { useGame } from '../game/store'
import * as THREE from 'three'
import { runtime } from '../game/runtime'
import type { WashSurface } from '../game/washSurface'

/**
 * Debug/automation hooks, used by `scripts/pr/` to put the camera in fixed
 * poses for screenshots and perf sampling.
 *
 * On in dev builds always, and in production builds only when the URL has
 * `?perf` (so before/after perf runs can measure the real production bundle).
 * `?stats` additionally shows an on-screen FPS panel.
 */
const params = new URLSearchParams(window.location.search)

export const debugEnabled = import.meta.env.DEV || params.has('perf')
export const statsOverlay = params.has('stats')

export function installDebugApi() {
  if (!debugEnabled) return
  ;(window as unknown as Record<string, unknown>).__pwc = {
    game: useGame,
    runtime,
    cleanAll: () => runtime.surfaces.forEach((s) => s.cleanAll()),
    /** Move the player to a fixed spot and look direction (radians). */
    pose: (x: number, y: number, z: number, yaw = 0, pitch = 0) => {
      const b = runtime.player
      if (!b) return false
      b.setTranslation({ x, y, z }, true)
      b.setLinvel({ x: 0, y: 0, z: 0 }, true)
      runtime.look.yaw = yaw
      runtime.look.pitch = pitch
      return true
    },
    /**
     * World position of a good example of stain `type` (see stains.ts) on a
     * surface: the still-dirty texel with the most same-type neighbors,
     * away from the edges. Null if there is none.
     */
    findStain: (surfaceId: string, type: number): [number, number, number] | null => {
      const mesh = runtime.raycastTargets.find((o) => (o.userData.surface as WashSurface | undefined)?.def.id === surfaceId)
      const s = mesh?.userData.surface as WashSurface | undefined
      if (!mesh || !s) return null
      let best = -1
      let bestCount = 0
      for (let y = Math.floor(s.h * 0.2); y < Math.ceil(s.h * 0.85); y++) {
        for (let x = 3; x < s.w - 3; x++) {
          const i = y * s.w + x
          if (s.stain[i] !== type || s.dirt[i] < 0.12) continue
          let c = 0
          for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (s.stain[i + dy * s.w + dx] === type) c++
          if (c > bestCount) {
            bestCount = c
            best = i
          }
        }
      }
      if (best < 0) return null
      const u = ((best % s.w) + 0.5) / s.w
      const v = (Math.floor(best / s.w) + 0.5) / s.h
      const p = mesh.localToWorld(new THREE.Vector3((u - 0.5) * s.def.width, (v - 0.5) * s.def.height, 0))
      return [p.x, p.y, p.z]
    },
  }
}
