import type { WashSurface } from './washSurface'
import { runtime } from './runtime'
import { FINISH_THRESHOLD, useGame } from './store'

/**
 * A surface counts as finished at the same threshold the HUD checklist uses
 * to tick it off (at most FINISH_THRESHOLD of its dirt left).
 */
export function isSurfaceDone(s: WashSurface): boolean {
  return 1 - s.cleanFraction <= FINISH_THRESHOLD
}

type Listener = (surface: WashSurface) => void
const listeners = new Set<Listener>()

/** Subscribe to "this surface just got fully cleaned". Returns an unsubscribe. */
export function onSurfaceCleaned(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// A surface is "armed" once it has been seen dirty in the current run, and
// fires when an armed surface becomes done. Arming (instead of a plain
// "already fired" set) means a new run can't fire for surfaces that are still
// clean from the last run in the frames before Level resets their dirt.
const armed = new Set<WashSurface>()
let armedRunId = -1

/**
 * Fire onSurfaceCleaned once per surface per run. Cheap enough to call every
 * frame (one comparison per surface, no allocation).
 */
export function checkSurfaceCompletion() {
  const { runId, phase } = useGame.getState()
  if (runId !== armedRunId) {
    armed.clear()
    armedRunId = runId
  }
  if (phase !== 'playing') return
  const surfaces = runtime.surfaces
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i]
    if (!isSurfaceDone(s)) {
      armed.add(s)
    } else if (armed.delete(s)) {
      for (const fn of listeners) fn(s)
    }
  }
}

/** Re-fire the event for a surface without touching its dirt (debug/capture). */
export function emitSurfaceCleaned(s: WashSurface) {
  for (const fn of listeners) fn(s)
}
