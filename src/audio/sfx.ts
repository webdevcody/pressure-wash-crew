import { audio, onAudioReady } from './engine'
import { createSprayLoop, scheduleFootstep, scheduleGrunt, scheduleLand, type SprayLoop } from './synth'

/**
 * Game-facing sound calls. All are safe to call before audio is unlocked
 * (they do nothing) and cheap enough to call from event handlers; none of
 * them should be called every frame.
 */

let lastJump = -1

export function playJump() {
  const { ctx, sfx } = audio
  if (!ctx || !sfx) return
  // Never stack grunts, even if jump fires twice in quick succession.
  if (ctx.currentTime - lastJump < 0.25) return
  lastJump = ctx.currentTime
  scheduleGrunt(ctx, sfx, ctx.currentTime + 0.005)
}

export function playFootstep(running: boolean) {
  const { ctx, sfx } = audio
  if (!ctx || !sfx) return
  scheduleFootstep(ctx, sfx, ctx.currentTime + 0.005, running)
}

/** `impact` 0..1: how hard the player hit the ground. */
export function playLand(impact: number) {
  const { ctx, sfx } = audio
  if (!ctx || !sfx) return
  scheduleLand(ctx, sfx, ctx.currentTime + 0.005, Math.max(0, Math.min(1, impact)))
}

let spray: SprayLoop | null = null
let sprayOn = false
let sprayTone = 0.5

/** Fade the washer loop in or out. Repeated calls with the same value are free. */
export function setSpraying(on: boolean) {
  if (on === sprayOn) return
  sprayOn = on
  spray?.set(on)
}

/**
 * Nozzle character for the spray loop: 0 = soft, wide fan; 1 = tight, brighter
 * jet. Call once when the nozzle changes.
 */
export function setSprayTone(tone: number) {
  sprayTone = tone
  spray?.setTone(tone)
}

onAudioReady((ctx) => {
  if (!audio.sfx) return
  spray = createSprayLoop(ctx, audio.sfx)
  spray.setTone(sprayTone)
  spray.set(sprayOn)
})
