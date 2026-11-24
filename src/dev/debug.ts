import { useGame } from '../game/store'
import { runtime } from '../game/runtime'
import { emitSurfaceCleaned } from '../game/surfaceEvents'
import { renderDing } from '../effects/ding'

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
    /** Fully clean one surface by id (fires the wall-finished celebration). */
    cleanSurface: (id: string) => runtime.surfaces.find((s) => s.def.id === id)?.cleanAll(),
    /** Replay the wall-finished celebration without touching dirt. */
    celebrate: (id: string) => {
      const s = runtime.surfaces.find((x) => x.def.id === id)
      if (s) emitSurfaceCleaned(s)
    },
    /** The wall-finished chime as mono 44.1 kHz samples. */
    renderDing: async () => Array.from(await renderDing()),
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
