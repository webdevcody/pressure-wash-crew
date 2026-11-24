import {
  createSprayLoop,
  scheduleBird,
  scheduleCarPass,
  scheduleFootstep,
  scheduleGrunt,
  scheduleHorn,
  scheduleLand,
  startTrafficBed,
} from '../audio/synth'

/**
 * Renders a 30 s demo of every game sound offline, for listening without
 * playing (scripts/audio-preview.mjs turns it into a WAV/MP3). Not imported
 * by the game, so it never ships in the bundle.
 *
 *   0-3 s walk · 3-5 s run · 5.4 s jump + land · 6.8 s jump + land
 *   8-14 s spray (fade in/out, tone change) · 15-30 s ambience only
 */
export async function renderAudioPreview(seconds = 30) {
  const rate = 44100
  const ctx = new OfflineAudioContext(2, rate * seconds, rate)
  const master = ctx.createGain()
  master.gain.value = 0.49 // the game's default volume (0.7 squared)
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -6
  limiter.knee.value = 6
  limiter.ratio.value = 8
  limiter.attack.value = 0.003
  limiter.release.value = 0.2
  master.connect(limiter).connect(ctx.destination)
  const sfx = ctx.createGain()
  sfx.connect(master)
  const amb = ctx.createGain()
  amb.gain.value = 0.55
  amb.connect(master)

  // Ambience under everything.
  startTrafficBed(ctx, amb, 0)
  for (const [t, pan, kind] of [
    [1.2, -0.5, 'tweet'], [4.5, 0.6, 'whistle'], [9, -0.2, 'trill'], [15.5, 0.4, 'tweet'],
    [17.2, -0.7, 'whistle'], [19.8, 0.1, 'tweet'], [21, 0.6, 'tweet'], [24.5, -0.4, 'trill'], [27, 0.3, 'whistle'],
  ] as const) scheduleBird(ctx, amb, t, pan, 0.08, kind)
  scheduleCarPass(ctx, amb, 2, 5, -0.6, 0.6, 0.5)
  scheduleCarPass(ctx, amb, 16, 4.5, 0.6, -0.6, 0.45)
  scheduleCarPass(ctx, amb, 24, 5.5, -0.5, 0.5, 0.4)
  scheduleHorn(ctx, amb, 18.5, -0.4, 0.07)
  scheduleHorn(ctx, amb, 26.2, 0.5, 0.06)

  // Walk, then run.
  for (let t = 0.3; t < 3; t += 0.42) scheduleFootstep(ctx, sfx, t, false)
  for (let t = 3; t < 5; t += 0.3) scheduleFootstep(ctx, sfx, t, true)
  // Jumps.
  scheduleGrunt(ctx, sfx, 5.4)
  scheduleLand(ctx, sfx, 5.4 + 0.5, 0.35)
  scheduleGrunt(ctx, sfx, 6.8)
  scheduleLand(ctx, sfx, 6.8 + 0.5, 0.35)

  // Spray: OfflineAudioContext can't take live set() calls mid-render, so
  // drive the loop with suspend/resume at fixed times.
  const spray = createSprayLoop(ctx, sfx)
  const at = (t: number, fn: () => void) => ctx.suspend(t).then(() => { fn(); return ctx.resume() })
  void at(8, () => spray.set(true))
  void at(10.5, () => spray.setTone(1))
  void at(12, () => spray.setTone(0))
  void at(13.5, () => spray.set(false))

  const buf = await ctx.startRendering()
  return { sampleRate: rate, left: Array.from(buf.getChannelData(0)), right: Array.from(buf.getChannelData(1)) }
}
