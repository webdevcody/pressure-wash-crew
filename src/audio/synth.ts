/**
 * Every sound in the game is synthesized here with Web Audio: no audio files
 * to download and no licenses to track. Each `schedule*` function builds a
 * short-lived node graph on any BaseAudioContext, so the same code plays live
 * and renders offline (see preview.ts).
 *
 * Sound design rule for this game: nothing sharp or shrill. Noise is pink or
 * brown and low-passed, envelopes have soft attacks, and loops drift slowly
 * so they never become a fixed drone.
 */

type Ctx = BaseAudioContext

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]

// ---------------------------------------------------------------- noise

const noiseCache = new WeakMap<Ctx, Record<string, AudioBuffer>>()

/**
 * A seamless looping noise buffer. 'pink' is soft hiss, 'brown' is a low
 * rumble. Cached per context, so every sound shares the same few buffers.
 */
export function noiseBuffer(ctx: Ctx, color: 'pink' | 'brown', seconds = 3): AudioBuffer {
  let cache = noiseCache.get(ctx)
  if (!cache) noiseCache.set(ctx, (cache = {}))
  const key = `${color}:${seconds}`
  const hit = cache[key]
  if (hit) return hit

  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const fade = Math.floor(rate * 0.25)
  const raw = new Float32Array(len + fade)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  let last = 0
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1
    if (color === 'pink') {
      // Paul Kellet's pink noise filter.
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    } else {
      last = (last + 0.02 * w) / 1.02
      raw[i] = last * 3.5
    }
  }
  // Crossfade the tail into the head so the loop point is inaudible.
  const buf = ctx.createBuffer(1, len, rate)
  const data = buf.getChannelData(0)
  data.set(raw.subarray(0, len))
  for (let i = 0; i < fade; i++) {
    const k = i / fade
    data[i] = raw[i] * Math.sqrt(k) + raw[len + i] * Math.sqrt(1 - k)
  }
  cache[key] = buf
  return buf
}

function noiseSource(ctx: Ctx, color: 'pink' | 'brown', loop = false): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, color)
  src.loop = loop
  return src
}

function filter(ctx: Ctx, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}

function gain(ctx: Ctx, value = 1): GainNode {
  const g = ctx.createGain()
  g.gain.value = value
  return g
}

function panner(ctx: Ctx, pan: number): AudioNode {
  // StereoPannerNode is everywhere that matters; fall back to a plain gain.
  if (typeof ctx.createStereoPanner !== 'function') return gain(ctx)
  const p = ctx.createStereoPanner()
  p.pan.value = Math.max(-1, Math.min(1, pan))
  return p
}

/** Attack/decay envelope on a gain param, starting from silence. */
function envelope(p: AudioParam, t: number, peak: number, attack: number, hold: number, release: number) {
  p.setValueAtTime(0.0001, t)
  p.exponentialRampToValueAtTime(peak, t + attack)
  p.setValueAtTime(peak, t + attack + hold)
  p.exponentialRampToValueAtTime(0.0001, t + attack + hold + release)
}

// ---------------------------------------------------------------- footsteps

/**
 * One footstep on grass/dirt: a soft heel thump, a filtered scuff, and a
 * quieter toe scuff a few ms later. Running is a bit louder, brighter and
 * snappier. Every step is randomized so a walk never sounds like a loop.
 */
export function scheduleFootstep(ctx: Ctx, out: AudioNode, t: number, running: boolean) {
  const level = running ? 0.55 : 0.4
  const bright = running ? 1.25 : 1

  // Heel thump.
  const thump = ctx.createOscillator()
  thump.type = 'sine'
  const f0 = rand(85, 110)
  thump.frequency.setValueAtTime(f0, t)
  thump.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.07)
  const thumpGain = gain(ctx, 0)
  envelope(thumpGain.gain, t, level * 0.9, 0.003, 0.01, 0.07)
  thump.connect(thumpGain).connect(out)
  thump.start(t)
  thump.stop(t + 0.12)

  // Heel scuff + toe scuff from one noise source.
  const scuff = noiseSource(ctx, 'pink')
  const bp = filter(ctx, 'bandpass', rand(650, 1000) * bright, 0.7)
  const lp = filter(ctx, 'lowpass', rand(2200, 3000) * bright, 0.5)
  const g = gain(ctx, 0)
  const p = g.gain
  const toe = rand(0.035, 0.055) * (running ? 0.8 : 1)
  p.setValueAtTime(0.0001, t)
  p.exponentialRampToValueAtTime(level * 1.6, t + 0.004)
  p.exponentialRampToValueAtTime(level * 0.25, t + toe)
  p.exponentialRampToValueAtTime(level * 0.8, t + toe + 0.006)
  p.exponentialRampToValueAtTime(0.0001, t + toe + rand(0.06, 0.09))
  scuff.connect(bp).connect(lp).connect(g).connect(out)
  const offset = rand(0, 2.5)
  scuff.start(t, offset)
  scuff.stop(t + 0.2)
}

/** A soft body thump when landing; `impact` 0..1 scales it. */
export function scheduleLand(ctx: Ctx, out: AudioNode, t: number, impact: number) {
  const level = 0.2 + 0.3 * impact
  const thump = ctx.createOscillator()
  thump.frequency.setValueAtTime(75, t)
  thump.frequency.exponentialRampToValueAtTime(42, t + 0.14)
  const tg = gain(ctx, 0)
  envelope(tg.gain, t, level, 0.004, 0.02, 0.14)
  thump.connect(tg).connect(out)
  thump.start(t)
  thump.stop(t + 0.22)

  const n = noiseSource(ctx, 'brown')
  const lp = filter(ctx, 'lowpass', 600, 0.6)
  const ng = gain(ctx, 0)
  envelope(ng.gain, t, level * 1.2, 0.004, 0.02, 0.12)
  n.connect(lp).connect(ng).connect(out)
  n.start(t, rand(0, 2.5))
  n.stop(t + 0.2)

  // Two quick scuffs as the feet settle.
  scheduleFootstep(ctx, out, t + 0.01, impact > 0.6)
}

// ---------------------------------------------------------------- jump grunt

/** Formants (Hz) and relative levels for a few short vowels. */
const VOWELS = [
  { f: [640, 1190, 2390], g: [1, 0.5, 0.18] }, // "uh"
  { f: [730, 1090, 2440], g: [1, 0.45, 0.15] }, // "ah"
  { f: [570, 840, 2410], g: [1, 0.4, 0.12] }, // "oh"
] as const

/**
 * A short effort grunt ("hup" / "hnh"): a breathy onset into a voiced vowel
 * whose pitch drops as the effort ends. Built from a sawtooth "voice" and
 * noise "breath" pushed through three formant band-passes.
 */
export function scheduleGrunt(ctx: Ctx, out: AudioNode, t: number) {
  const vowel = pick(VOWELS)
  const f0 = rand(105, 135)
  const dur = rand(0.16, 0.24)

  const voice = ctx.createOscillator()
  voice.type = 'sawtooth'
  voice.frequency.setValueAtTime(f0 * 0.92, t)
  voice.frequency.linearRampToValueAtTime(f0 * 1.12, t + 0.035)
  voice.frequency.exponentialRampToValueAtTime(f0 * 0.78, t + dur)
  // A little irregularity so it sounds like a throat, not a synth.
  const wobble = ctx.createOscillator()
  wobble.frequency.value = rand(14, 22)
  const wobbleDepth = gain(ctx, f0 * 0.025)
  wobble.connect(wobbleDepth).connect(voice.frequency)

  const voiceGain = gain(ctx, 0)
  const vg = voiceGain.gain
  vg.setValueAtTime(0.0001, t)
  vg.exponentialRampToValueAtTime(0.5, t + 0.03)
  vg.setValueAtTime(0.5, t + dur * 0.45)
  vg.exponentialRampToValueAtTime(0.0001, t + dur)

  const breath = noiseSource(ctx, 'pink')
  const breathGain = gain(ctx, 0)
  const bg = breathGain.gain
  bg.setValueAtTime(0.0001, t)
  bg.exponentialRampToValueAtTime(0.9, t + 0.012)
  bg.exponentialRampToValueAtTime(0.12, t + 0.06)
  bg.exponentialRampToValueAtTime(0.0001, t + dur + 0.04)

  const mix = gain(ctx, 1)
  voice.connect(voiceGain).connect(mix)
  breath.connect(breathGain).connect(mix)

  const sum = gain(ctx, 1)
  for (let i = 0; i < 3; i++) {
    const bp = filter(ctx, 'bandpass', vowel.f[i] * rand(0.95, 1.05), 6 + i * 2)
    const g = gain(ctx, vowel.g[i] * 2.2)
    mix.connect(bp).connect(g).connect(sum)
  }
  // Chest resonance.
  const body = filter(ctx, 'lowpass', 280, 0.8)
  const bodyGain = gain(ctx, 0.35)
  mix.connect(body).connect(bodyGain).connect(sum)

  const tone = filter(ctx, 'lowpass', 3200, 0.5)
  const level = gain(ctx, 1.8)
  sum.connect(tone).connect(level).connect(out)

  const end = t + dur + 0.08
  voice.start(t)
  voice.stop(end)
  wobble.start(t)
  wobble.stop(end)
  breath.start(t, rand(0, 2.5))
  breath.stop(end)
}

// ---------------------------------------------------------------- spray loop

export interface SprayLoop {
  /** Fade the spray in or out. */
  set(on: boolean): void
  /** 0 = soft, wide fan; 1 = tight, brighter jet. */
  setTone(tone: number): void
}

/**
 * The washer: a soft, steady water rush rather than a harsh hiss. Pink noise
 * is band-limited to roughly 250 Hz to 2.5 kHz with a gentle slope, a brown
 * noise layer gives it weight, and the brightness drifts very slowly so the
 * ear never locks onto a fixed tone. Fades in over ~0.2 s and out over ~0.4 s.
 */
export function createSprayLoop(ctx: Ctx, out: AudioNode): SprayLoop {
  const level = gain(ctx, 0)
  level.connect(out)

  const hiss = noiseSource(ctx, 'pink', true)
  const hp = filter(ctx, 'highpass', 240, 0.5)
  const lp = filter(ctx, 'lowpass', 2000, 0.35)
  // Second pole so the top end rolls off smoothly instead of fizzing.
  const lp2 = filter(ctx, 'lowpass', 4200, 0.5)
  const hissGain = gain(ctx, 0.9)
  hiss.connect(hp).connect(lp).connect(lp2).connect(hissGain).connect(level)

  const rush = noiseSource(ctx, 'brown', true)
  const rushLp = filter(ctx, 'lowpass', 420, 0.5)
  const rushGain = gain(ctx, 0.55)
  rush.connect(rushLp).connect(rushGain).connect(level)

  // Splash texture around 1 kHz that breathes in and out slowly.
  const splash = noiseSource(ctx, 'pink', true)
  const splashBp = filter(ctx, 'bandpass', 1100, 1.1)
  const splashGain = gain(ctx, 0.25)
  splash.connect(splashBp).connect(splashGain).connect(level)

  // Two slow, unrelated LFOs nudge the brightness so it never sits still.
  for (const [rate, depth] of [
    [0.13, 160],
    [0.31, 90],
  ] as const) {
    const lfo = ctx.createOscillator()
    lfo.frequency.value = rate
    const d = gain(ctx, depth)
    lfo.connect(d).connect(lp.frequency)
    lfo.start()
  }
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.47
  const ld = gain(ctx, 0.08)
  lfo.connect(ld).connect(splashGain.gain)
  lfo.start()

  const t0 = ctx.currentTime
  hiss.start(t0, 0)
  rush.start(t0, 1.3)
  splash.start(t0, 2.1)

  let tone = 0.5
  const applyTone = () => {
    const now = ctx.currentTime
    lp.frequency.setTargetAtTime(1500 + tone * 1300, now, 0.08)
    hp.frequency.setTargetAtTime(200 + tone * 120, now, 0.08)
    rushGain.gain.setTargetAtTime(0.65 - tone * 0.25, now, 0.08)
  }
  applyTone()

  return {
    set(on) {
      const now = ctx.currentTime
      level.gain.cancelScheduledValues(now)
      level.gain.setTargetAtTime(on ? 0.55 : 0, now, on ? 0.06 : 0.13)
    },
    setTone(t) {
      tone = Math.max(0, Math.min(1, t))
      applyTone()
    },
  }
}

// ---------------------------------------------------------------- ambience

/**
 * Distant traffic: a low brown-noise rumble plus a faint tire-hiss band whose
 * level swells slowly, like traffic a block or two away. Runs forever.
 */
export function startTrafficBed(ctx: Ctx, out: AudioNode, t = ctx.currentTime) {
  const rumble = noiseSource(ctx, 'brown', true)
  // Nothing under ~45 Hz: it only makes laptop speakers flap.
  const rhp = filter(ctx, 'highpass', 45, 0.7)
  const rlp = filter(ctx, 'lowpass', 300, 0.5)
  const rg = gain(ctx, 0.28)
  rumble.connect(rhp).connect(rlp).connect(rg).connect(out)

  const hiss = noiseSource(ctx, 'pink', true)
  const hbp = filter(ctx, 'bandpass', 650, 0.6)
  const hlp = filter(ctx, 'lowpass', 1200, 0.5)
  const hg = gain(ctx, 0.09)
  hiss.connect(hbp).connect(hlp).connect(hg).connect(out)

  const swell = ctx.createOscillator()
  swell.frequency.value = 0.045
  const sd = gain(ctx, 0.035)
  swell.connect(sd).connect(hg.gain)

  rumble.start(t, 0.4)
  hiss.start(t, 1.7)
  swell.start(t)
}

/** One car driving past somewhere out of sight, `dur` seconds, panning across. */
export function scheduleCarPass(ctx: Ctx, out: AudioNode, t: number, dur: number, panFrom: number, panTo: number, level = 0.5) {
  const n = noiseSource(ctx, 'pink', true)
  const bp = filter(ctx, 'bandpass', 520, 0.8)
  bp.frequency.setValueAtTime(560, t)
  bp.frequency.linearRampToValueAtTime(600, t + dur * 0.45)
  bp.frequency.linearRampToValueAtTime(400, t + dur)
  const lp = filter(ctx, 'lowpass', 900, 0.5)
  const g = gain(ctx, 0)
  const p = g.gain
  p.setValueAtTime(0.0001, t)
  p.exponentialRampToValueAtTime(level, t + dur * 0.5)
  p.exponentialRampToValueAtTime(0.0001, t + dur)
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
  if (pan) {
    pan.pan.setValueAtTime(panFrom, t)
    pan.pan.linearRampToValueAtTime(panTo, t + dur)
    n.connect(bp).connect(lp).connect(g).connect(pan).connect(out)
  } else {
    n.connect(bp).connect(lp).connect(g).connect(out)
  }
  n.start(t, rand(0, 2.5))
  n.stop(t + dur + 0.05)
}

/**
 * A distant car horn: one or two honks, two detuned reeds a third apart,
 * muffled by distance with a short echo off the buildings.
 */
export function scheduleHorn(ctx: Ctx, out: AudioNode, t: number, pan: number, level = 0.07) {
  const pitch = rand(0.88, 1.12)
  const honks = Math.random() < 0.45 ? [[0, rand(0.12, 0.2)], [rand(0.22, 0.3), rand(0.12, 0.22)]] : [[0, rand(0.25, 0.6)]]

  const sum = gain(ctx, 0)
  for (const [start, len] of honks) {
    const s = t + start
    sum.gain.setValueAtTime(0.0001, s)
    sum.gain.exponentialRampToValueAtTime(level, s + 0.02)
    sum.gain.setValueAtTime(level, s + len)
    sum.gain.exponentialRampToValueAtTime(0.0001, s + len + 0.06)
  }
  const end = t + honks[honks.length - 1][0] + honks[honks.length - 1][1] + 0.1
  for (const f of [392, 494]) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.value = f * pitch
    o.detune.value = rand(-8, 8)
    o.connect(sum)
    o.start(t)
    o.stop(end)
  }
  const lp = filter(ctx, 'lowpass', 1100, 0.9)
  const hp = filter(ctx, 'highpass', 250, 0.7)
  const pn = panner(ctx, pan)
  sum.connect(lp).connect(hp).connect(pn).connect(out)

  // Echo off the street canyon.
  const delay = ctx.createDelay(1)
  delay.delayTime.value = rand(0.17, 0.26)
  const fb = gain(ctx, 0.3)
  const echoLp = filter(ctx, 'lowpass', 800, 0.5)
  const wet = gain(ctx, 0.45)
  pn.connect(delay)
  delay.connect(echoLp).connect(fb).connect(delay)
  echoLp.connect(wet).connect(out)
  // Let the echo die, then cut the loop so the nodes can be collected.
  const tail = (end - ctx.currentTime + 1.5) * 1000
  if (ctx instanceof AudioContext) setTimeout(() => fb.disconnect(), tail)
}

type BirdKind = 'tweet' | 'whistle' | 'trill'

/** One short bird phrase: chirps, a two-note whistle or a quick trill. */
export function scheduleBird(ctx: Ctx, out: AudioNode, t: number, pan: number, level = 0.09, kind?: BirdKind) {
  kind ??= pick(['tweet', 'tweet', 'whistle', 'trill'] as const)
  const pn = panner(ctx, pan)
  // Birds are far-ish and up in trees: take the edge off the very top.
  const lp = filter(ctx, 'lowpass', 6500, 0.5)
  pn.connect(lp).connect(out)

  const note = (start: number, f1: number, f2: number, len: number, peak: number) => {
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(f1, start)
    o.frequency.exponentialRampToValueAtTime(f2, start + len)
    const g = gain(ctx, 0)
    envelope(g.gain, start, peak, Math.min(0.015, len * 0.25), len * 0.35, len * 0.5)
    o.connect(g).connect(pn)
    o.start(start)
    o.stop(start + len + 0.05)
    return o
  }

  const base = rand(0.85, 1.2)
  if (kind === 'tweet') {
    const n = 2 + Math.floor(Math.random() * 3)
    const gap = rand(0.1, 0.16)
    for (let i = 0; i < n; i++) {
      note(t + i * gap, 2900 * base, 4300 * base, rand(0.05, 0.08), level * rand(0.7, 1))
    }
  } else if (kind === 'whistle') {
    note(t, 4000 * base, 3800 * base, 0.24, level)
    note(t + 0.32, 3350 * base, 3250 * base, 0.3, level * 0.85)
  } else {
    const o = note(t, 3500 * base, 3300 * base, 0.55, level * 0.8)
    const fm = ctx.createOscillator()
    fm.frequency.value = rand(22, 30)
    const depth = gain(ctx, 380 * base)
    fm.connect(depth).connect(o.frequency)
    fm.start(t)
    fm.stop(t + 0.62)
  }
}
