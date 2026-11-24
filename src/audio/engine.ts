import { create } from 'zustand'

/**
 * The one shared audio engine: a single AudioContext, a master volume and
 * three buses. Browsers only allow audio after a user gesture, so the context
 * is created on the first pointerdown/keydown/touchstart; until then
 * `audio.ctx` is null and every sound call is a no-op.
 *
 *   master ─┬─ sfx       one-shots (footsteps, jump, ding) and the spray loop
 *           └─ ambience  birds, traffic, horns (quieter, under the action)
 *
 * Other modules connect their sounds to `audio.sfx` or `audio.ambience` and
 * register start-up work with `onAudioReady`.
 */

const VOLUME_KEY = 'pwc.volume'
const MUTED_KEY = 'pwc.muted'
const AMBIENCE_LEVEL = 0.55

interface AudioSettings {
  /** 0..1, shown as the Sound slider. */
  volume: number
  muted: boolean
  setVolume: (v: number) => void
  toggleMute: () => void
}

function load<T>(key: string, parse: (raw: string) => T | undefined, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return parse(raw) ?? fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: setting just won't persist */
  }
}

export const useAudioSettings = create<AudioSettings>((set, get) => ({
  volume: load(VOLUME_KEY, (r) => {
    const n = Number(r)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined
  }, 0.7),
  muted: load(MUTED_KEY, (r) => r === '1', false),
  setVolume: (volume) => {
    volume = Math.min(1, Math.max(0, volume))
    save(VOLUME_KEY, String(volume))
    // Dragging the slider up un-mutes, like most volume controls.
    const muted = volume > 0 ? false : get().muted
    save(MUTED_KEY, muted ? '1' : '0')
    set({ volume, muted })
  },
  toggleMute: () => {
    const muted = !get().muted
    save(MUTED_KEY, muted ? '1' : '0')
    set({ muted })
  },
}))

interface Engine {
  ctx: AudioContext | null
  master: GainNode | null
  sfx: GainNode | null
  ambience: GainNode | null
}

export const audio: Engine = { ctx: null, master: null, sfx: null, ambience: null }

/** True once the context exists (after the first user gesture). */
export function audioReady(): boolean {
  return audio.ctx != null
}

const readyCallbacks: ((ctx: AudioContext) => void)[] = []

/** Run `fn` once audio is unlocked (immediately if it already is). */
export function onAudioReady(fn: (ctx: AudioContext) => void) {
  if (audio.ctx) fn(audio.ctx)
  else readyCallbacks.push(fn)
}

function masterLevel(): number {
  const { volume, muted } = useAudioSettings.getState()
  // Squared so the slider feels even to the ear.
  return muted ? 0 : volume * volume
}

function applyVolume() {
  const { ctx, master } = audio
  if (!ctx || !master) return
  master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.03)
}

function unlock() {
  if (audio.ctx) {
    if (audio.ctx.state === 'suspended' && !document.hidden) void audio.ctx.resume()
    return
  }
  let ctx: AudioContext
  try {
    ctx = new AudioContext({ latencyHint: 'interactive' })
  } catch {
    return // no Web Audio: the game just stays silent
  }
  const master = ctx.createGain()
  master.gain.value = masterLevel()
  // A gentle limiter so overlapping sounds never clip harshly.
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -6
  limiter.knee.value = 6
  limiter.ratio.value = 8
  limiter.attack.value = 0.003
  limiter.release.value = 0.2
  master.connect(limiter).connect(ctx.destination)

  const sfx = ctx.createGain()
  sfx.connect(master)
  const ambience = ctx.createGain()
  ambience.gain.value = AMBIENCE_LEVEL
  ambience.connect(master)

  Object.assign(audio, { ctx, master, sfx, ambience })
  if (ctx.state === 'suspended') void ctx.resume()
  for (const fn of readyCallbacks.splice(0)) fn(ctx)
}

let installed = false

/** Wire up gesture unlock, the M mute key and tab-hidden suspend. Idempotent. */
export function installAudio() {
  if (installed) return
  installed = true
  const opts = { capture: true, passive: true } as const
  window.addEventListener('pointerdown', unlock, opts)
  window.addEventListener('keydown', unlock, opts)
  window.addEventListener('touchstart', unlock, opts)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat && !(e.target instanceof HTMLInputElement)) {
      useAudioSettings.getState().toggleMute()
    }
  })
  // Nothing to hear in a background tab: stop the audio thread entirely.
  document.addEventListener('visibilitychange', () => {
    const ctx = audio.ctx
    if (!ctx) return
    if (document.hidden) void ctx.suspend()
    else void ctx.resume()
  })
  useAudioSettings.subscribe(applyVolume)
}
