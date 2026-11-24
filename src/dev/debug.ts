import { useGame } from '../game/store'
import { runtime } from '../game/runtime'

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
  }
}
