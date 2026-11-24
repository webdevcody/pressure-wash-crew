/**
 * "Wall finished" chime, synthesized with WebAudio so there's no asset to
 * load: a quick rising major arpeggio of soft bell tones, then a brighter
 * high note that rings out, plus a short airy pop for the confetti.
 */

import { audio } from '../audio/engine'

let lastDing = -1

/** Play the chime now, on the shared sfx bus. Skipped until audio is unlocked. */
export function playDing() {
  const { ctx, sfx } = audio
  if (!ctx || !sfx) return
  // Several walls finishing in the same instant get one chime, not a pile-up.
  if (lastDing >= 0 && ctx.currentTime - lastDing < 0.2) return
  lastDing = ctx.currentTime
  scheduleDing(ctx, sfx, ctx.currentTime + 0.01)
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
