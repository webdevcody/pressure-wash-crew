import { runtime } from '../game/runtime'
import { audio, onAudioReady } from './engine'
import { scheduleBird, scheduleCarPass, scheduleHorn, startTrafficBed } from './synth'

/**
 * The neighborhood: a constant distant-traffic bed, birds every few seconds,
 * a car passing now and then, and the odd far-off horn. Events are scheduled
 * with timers (never per frame) and panned by where they are relative to the
 * way the player is facing when they start.
 */

const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** Stereo pan for a sound coming from world azimuth `angle` (radians). */
function panFor(angle: number): number {
  // Camera right = (cos yaw, -sin yaw); source direction = (sin a, cos a).
  const yaw = runtime.look.yaw
  return Math.sin(angle) * Math.cos(yaw) - Math.cos(angle) * Math.sin(yaw)
}

function every(out: AudioNode, minS: number, maxS: number, fn: (ctx: AudioContext, out: AudioNode) => void, firstMin = minS) {
  const loop = () => {
    const ctx = audio.ctx
    // Don't pile up events while the tab is hidden and the context suspended.
    if (ctx && ctx.state === 'running') fn(ctx, out)
    setTimeout(loop, rand(minS, maxS) * 1000)
  }
  setTimeout(loop, rand(firstMin, maxS) * 1000)
}

let started = false

export function startAmbience() {
  if (started) return
  started = true
  onAudioReady((ctx) => {
    const out = audio.ambience
    if (!out) return
    // Fade the whole scene in so the first click doesn't start with a wall of sound.
    const fadeIn = ctx.createGain()
    fadeIn.gain.setValueAtTime(0.0001, ctx.currentTime)
    fadeIn.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2.5)
    fadeIn.connect(out)

    startTrafficBed(ctx, fadeIn)

    every(fadeIn, 2.5, 7, (c, o) => {
      // Birds: from any direction, sometimes answered by a second bird.
      const a = rand(0, Math.PI * 2)
      const t = c.currentTime + 0.05
      scheduleBird(c, o, t, panFor(a) * 0.8, rand(0.06, 0.1))
      if (Math.random() < 0.35) scheduleBird(c, o, t + rand(0.6, 1.4), panFor(a + rand(1, 3)) * 0.8, rand(0.045, 0.075))
    }, 0.8)

    every(fadeIn, 7, 16, (c, o) => {
      const dur = rand(3.5, 6)
      const from = rand(-1, 1)
      scheduleCarPass(c, o, c.currentTime + 0.05, dur, from * 0.7, -from * 0.7, rand(0.35, 0.6))
    }, 3)

    every(fadeIn, 14, 38, (c, o) => {
      scheduleHorn(c, o, c.currentTime + 0.05, panFor(rand(0, Math.PI * 2)) * 0.7, rand(0.045, 0.08))
    }, 8)
  })
}
