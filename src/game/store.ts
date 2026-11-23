import { create } from 'zustand'

export type Phase = 'menu' | 'playing' | 'finished'

const BEST_KEY = 'pwc.bestTime.level1'

function loadBest(): number | null {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    const n = raw == null ? NaN : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

function saveBest(t: number) {
  try {
    localStorage.setItem(BEST_KEY, String(t))
  } catch {
    /* storage unavailable: best time just won't persist */
  }
}

export interface SurfaceProgress {
  id: string
  name: string
  cleanFraction: number
}

interface GameState {
  phase: Phase
  /** Incremented on every new run so the level can reset its dirt. */
  runId: number
  /** Seconds elapsed in the current run (only counts while unpaused). */
  elapsed: number
  paused: boolean
  /** 0..1 of the total washable area that is still dirty. */
  remaining: number
  surfaces: SurfaceProgress[]
  bestTime: number | null
  lastTime: number | null
  newRecord: boolean
  spraying: boolean

  startRun: () => void
  finishRun: () => void
  backToMenu: () => void
  setPaused: (p: boolean) => void
  addTime: (dt: number) => void
  setProgress: (remaining: number, surfaces: SurfaceProgress[]) => void
  setSpraying: (s: boolean) => void
}

export const useGame = create<GameState>((set, get) => ({
  phase: 'menu',
  runId: 0,
  elapsed: 0,
  paused: false,
  remaining: 1,
  surfaces: [],
  bestTime: loadBest(),
  lastTime: null,
  newRecord: false,
  spraying: false,

  startRun: () =>
    set((s) => ({
      phase: 'playing',
      runId: s.runId + 1,
      elapsed: 0,
      paused: false,
      remaining: 1,
      newRecord: false,
      spraying: false,
    })),

  finishRun: () => {
    const { elapsed, bestTime, phase } = get()
    if (phase !== 'playing') return
    const newRecord = bestTime == null || elapsed < bestTime
    if (newRecord) saveBest(elapsed)
    set({
      phase: 'finished',
      lastTime: elapsed,
      bestTime: newRecord ? elapsed : bestTime,
      newRecord,
      spraying: false,
      paused: false,
    })
  },

  backToMenu: () => set({ phase: 'menu', paused: false, spraying: false }),
  setPaused: (paused) => set({ paused, spraying: paused ? false : get().spraying }),
  addTime: (dt) => set((s) => ({ elapsed: s.elapsed + dt })),
  setProgress: (remaining, surfaces) => set({ remaining, surfaces }),
  setSpraying: (spraying) => set({ spraying }),
}))

/** Run is complete once this fraction (or less) of the dirt remains. */
export const FINISH_THRESHOLD = 0.01

export function formatTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}
