/**
 * "Wall finished" chime, synthesized with WebAudio so there's no asset to
 * load: a quick rising major arpeggio of soft bell tones, then a brighter
 * high note that rings out, plus a short airy pop for the confetti.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let lastDing = -1

function getContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    return null
  }
  master = ctx.createGain()
  master.gain.value = 0.5
  master.connect(ctx.destination)
  return ctx
}

/**
 * Browsers only let audio start after a user gesture. Call this from the
 * first click/keypress so the context is running by the time a wall is done.
 */
export function installAudioUnlock() {
  const unlock = () => {
    const c = getContext()
    if (c && c.state === 'suspended') c.resume().catch(() => {})
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
  return () => {
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
  }
}

/** Play the chime now. Safe to call before audio is unlocked (it's skipped). */
export function playDing() {
  const c = getContext()
  if (!c || !master) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  // Several walls finishing in the same instant get one chime, not a pile-up.
  if (lastDing >= 0 && c.currentTime - lastDing < 0.2) return
  lastDing = c.currentTime
  scheduleDing(c, master, c.currentTime + 0.01)
}

// C6 E6 G6, then C7 rings out.
const ARPEGGIO = [1046.5, 1318.5, 1568.0]
const FINAL = 2093.0

/** Schedule the chime on any context (also used to render it offline). */
export function scheduleDing(c: BaseAudioContext, out: AudioNode, t0: number) {
  ARPEGGIO.forEach((f, i) => bell(c, out, f, t0 + i * 0.07, 0.5, 0.18))
  bell(c, out, FINAL, t0 + ARPEGGIO.length * 0.07, 1.4, 0.3)
  pop(c, out, t0)
}

/** One bell-ish tone: a sine with a couple of quieter overtones, fast attack, exponential ring. */
function bell(c: BaseAudioContext, out: AudioNode, freq: number, t: number, decay: number, level: number) {
  const env = c.createGain()
  env.gain.setValueAtTime(0.0001, t)
  env.gain.exponentialRampToValueAtTime(level, t + 0.006)
  env.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  env.connect(out)
  const partials: [number, number][] = [
    [1, 1],
    [2, 0.35],
    [3.01, 0.12],
  ]
  for (const [mult, amp] of partials) {
    const osc = c.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq * mult
    const g = c.createGain()
    g.gain.value = amp
    osc.connect(g).connect(env)
    osc.start(t)
    osc.stop(t + decay + 0.05)
  }
}

/** Short band-passed noise burst, like a party popper. */
function pop(c: BaseAudioContext, out: AudioNode, t: number) {
  const len = Math.floor(c.sampleRate * 0.12)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
  const src = c.createBufferSource()
  src.buffer = buf
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2400
  bp.Q.value = 0.8
  const g = c.createGain()
  g.gain.value = 0.35
  src.connect(bp).connect(g).connect(out)
  src.start(t)
}

/** Render the chime to mono PCM samples (debug/capture: lets a PR ship the sound). */
export async function renderDing(sampleRate = 44100): Promise<Float32Array> {
  const off = new OfflineAudioContext(1, Math.ceil(sampleRate * 1.8), sampleRate)
  const g = off.createGain()
  g.gain.value = 0.5
  g.connect(off.destination)
  scheduleDing(off, g, 0.01)
  const buf = await off.startRendering()
  return buf.getChannelData(0)
}
