import { create } from 'zustand'
import { DEFAULT_NOZZLE, NOZZLES } from './nozzles'

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

/**
 * Seed for the stain layout. `?seed=N` pins it; `?perf` (PR captures) pins
 * it to 1 so before/after shots are comparable; otherwise random per run.
 */
function nextSeed(): number {
  try {
    const p = new URLSearchParams(window.location.search)
    const s = Number(p.get('seed'))
    if (p.has('seed') && Number.isFinite(s)) return s
    if (p.has('perf')) return 1
  } catch {
    /* no window: fall through */
  }
  return Math.floor(Math.random() * 2 ** 31)
}

/** What's under the crosshair, refreshed ~10x/sec for the HUD. */
export interface AimInfo {
  /** Stain type index, or -1 when aiming at nothing dirty. */
  stain: number
  /** Soap on that texel, 0..1 rounded to 0.1. */
  soap: number
  /** Further than the current nozzle reaches. */
  outOfRange: boolean
}

const NO_AIM: AimInfo = { stain: -1, soap: 0, outOfRange: false }

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
  /** Seed of the current stain layout. */
  seed: number
  /** Index into NOZZLES. */
  nozzle: number
  /** Fan tips spray a vertical line instead of a horizontal one. */
  fanVertical: boolean
  aim: AimInfo

  startRun: () => void
  finishRun: () => void
  backToMenu: () => void
  setPaused: (p: boolean) => void
  addTime: (dt: number) => void
  setProgress: (remaining: number, surfaces: SurfaceProgress[]) => void
  setSpraying: (s: boolean) => void
  setNozzle: (i: number) => void
  cycleNozzle: (step: number) => void
  toggleFan: () => void
  setAim: (stain: number, soap: number, outOfRange: boolean) => void
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
  seed: nextSeed(),
  nozzle: DEFAULT_NOZZLE,
  fanVertical: false,
  aim: NO_AIM,

  startRun: () =>
    set((s) => ({
      phase: 'playing',
      runId: s.runId + 1,
      seed: nextSeed(),
      nozzle: DEFAULT_NOZZLE,
      fanVertical: false,
      aim: NO_AIM,
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
  setNozzle: (i) => set({ nozzle: ((i % NOZZLES.length) + NOZZLES.length) % NOZZLES.length }),
  cycleNozzle: (step) => get().setNozzle(get().nozzle + step),
  toggleFan: () => set((s) => ({ fanVertical: !s.fanVertical })),
  setAim: (stain, soap, outOfRange) => {
    const a = get().aim
    if (a.stain === stain && a.soap === soap && a.outOfRange === outOfRange) return
    set({ aim: { stain, soap, outOfRange } })
  },
}))

/** Run is complete once this fraction (or less) of the dirt remains. */
export const FINISH_THRESHOLD = 0.01

export function formatTime(t: number): string {
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}
