import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { audio, installAudio } from './engine'
import { startAmbience } from './ambience'
import { playFootstep, playJump, playLand, setSpraying } from './sfx'

/** Horizontal speed (m/s) above which steps use the running sound and cadence. */
const RUN_THRESHOLD = 6
const WALK_STEP = 0.42 // seconds between steps
const RUN_STEP = 0.3
const MIN_MOVE = 1

/**
 * Turns game state into sound without touching the movement or spray code:
 * footsteps, jump grunts and landings come from the player body's velocity
 * and Player's `runtime.grounded` / `runtime.jumpCount`,
 * and the spray loop follows the store's `spraying` flag. Mount inside the
 * Canvas. Per-frame work is a few comparisons and no allocations of our own.
 */
export function AudioDriver() {
  const s = useRef({
    airborne: false,
    fallSpeed: 0,
    stepTimer: 0,
    settle: 0, // seconds since the run started / player was placed
    jumpCount: -1,
  }).current

  useEffect(() => {
    installAudio()
    startAmbience()
    // Spray loop follows the store, so the washer code needs no audio calls.
    const sync = (g: ReturnType<typeof useGame.getState>) => setSpraying(g.spraying && g.phase === 'playing' && !g.paused)
    sync(useGame.getState())
    return useGame.subscribe(sync)
  }, [])

  // New run: the player is dropped at spawn, so ignore the first landing.
  const runId = useGame((g) => g.runId)
  useEffect(() => {
    s.settle = 0
    s.airborne = false
  }, [runId, s])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const b = runtime.player
    if (!b || !audio.ctx) return
    const g = useGame.getState()
    const active = g.phase === 'playing' && !g.paused

    const v = b.linvel()
    const vy = v.y
    const speed = Math.hypot(v.x, v.z)
    s.settle += dt
    const quiet = !active || s.settle < 0.6

    // ---- jumps
    const jumped = s.jumpCount >= 0 && runtime.jumpCount !== s.jumpCount
    s.jumpCount = runtime.jumpCount
    if (jumped) {
      if (!quiet) playJump()
      s.airborne = true
      s.fallSpeed = 0
    }

    // ---- airborne / landing (walking off a ledge counts as airborne too)
    const grounded = runtime.grounded
    if (!grounded && vy < -1.5) s.airborne = true
    if (s.airborne) s.fallSpeed = Math.max(s.fallSpeed, -vy)

    if (s.airborne && !jumped && grounded) {
      if (!quiet && s.fallSpeed > 2) playLand(Math.min(1, (s.fallSpeed - 2) / 8))
      s.airborne = false
      s.fallSpeed = 0
      s.stepTimer = 0.18
    }

    // ---- footsteps
    if (!quiet && !s.airborne && grounded && speed > MIN_MOVE) {
      s.stepTimer -= dt
      if (s.stepTimer <= 0) {
        const running = speed > RUN_THRESHOLD
        playFootstep(running)
        s.stepTimer = running ? RUN_STEP : WALK_STEP
      }
    } else if (!s.airborne) {
      // First step lands quickly when the player starts moving.
      s.stepTimer = Math.min(s.stepTimer, 0.08)
    }
  })

  return null
}
