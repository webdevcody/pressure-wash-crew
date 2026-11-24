import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { runtime } from '../game/runtime'
import { SPAWN } from '../game/level1'
import { useGame } from '../game/store'

const WALK_SPEED = 4.5
const RUN_SPEED = 8
const JUMP_SPEED = 5
const EYE_HEIGHT = 0.65 // above capsule center
const MOUSE_SENS = 0.0022

// Capsule: half-height of the cylinder part and radius.
const CAPSULE_HALF = 0.5
const CAPSULE_RADIUS = 0.35

// Ground probe: a ball a bit narrower than the capsule, sunk slightly below its
// bottom sphere. It overlaps the floor (or a crate top) only when the player is
// standing on it, and is too narrow to touch walls the capsule is pressed into.
const PROBE_RADIUS = 0.3
const PROBE_DEPTH = 0.12 // how far the probe center sits below the bottom sphere

// Jump feel, in ms.
const JUMP_COOLDOWN = 250 // no re-ground (and no jump) right after jumping
const COYOTE_TIME = 100 // can still jump this long after walking off an edge
const JUMP_BUFFER = 120 // a press this long before landing still jumps

// Sprint widens the view a little so running reads as running.
const BASE_FOV = 75
const SPRINT_FOV = 83

const euler = new THREE.Euler(0, 0, 0, 'YXZ')
const probePos = { x: 0, y: 0, z: 0 }
const probeRot = { x: 0, y: 0, z: 0, w: 1 }
let probeHit = false
const onProbeHit = () => {
  probeHit = true
  return false // one hit is enough
}

export function Player() {
  const body = useRef<RapierRigidBody>(null)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const runId = useGame((s) => s.runId)
  const { world, rapier } = useRapier()
  const probe = useMemo(() => new rapier.Ball(PROBE_RADIUS), [rapier])
  // Jump timing state (ms, performance.now()).
  const jump = useRef({ pressedAt: -Infinity, groundedAt: -Infinity, jumpedAt: -Infinity, lastFrameAt: 0 })

  // Keyboard + mouse look.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      runtime.keys.add(e.code)
      // One jump per press: only the initial keydown counts, not auto-repeat.
      if (e.code === 'Space' && !e.repeat) jump.current.pressedAt = performance.now()
    }
    const up = (e: KeyboardEvent) => runtime.keys.delete(e.code)
    const blur = () => runtime.keys.clear()
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return
      runtime.look.yaw -= e.movementX * MOUSE_SENS
      runtime.look.pitch -= e.movementY * MOUSE_SENS
      runtime.look.pitch = Math.max(-1.5, Math.min(1.5, runtime.look.pitch))
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    document.addEventListener('mousemove', move)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      document.removeEventListener('mousemove', move)
    }
  }, [gl])

  // Publish the body so debug tools can teleport the player.
  useEffect(() => {
    runtime.player = body.current
    return () => {
      runtime.player = null
    }
  }, [])

  // Respawn at the start of every run.
  useEffect(() => {
    const b = body.current
    if (!b) return
    b.setTranslation({ x: SPAWN[0], y: SPAWN[1], z: SPAWN[2] }, true)
    b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    runtime.look.yaw = 0
    runtime.look.pitch = 0
    jump.current.pressedAt = -Infinity
    jump.current.groundedAt = -Infinity
    jump.current.jumpedAt = -Infinity
  }, [runId])

  useFrame((_, delta) => {
    const b = body.current
    if (!b) return
    const { phase, paused } = useGame.getState()
    const active = phase === 'playing' && !paused
    const k = runtime.keys

    let fx = 0
    let fz = 0
    if (active) {
      if (k.has('KeyW') || k.has('ArrowUp')) fz += 1
      if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1
      if (k.has('KeyD') || k.has('ArrowRight')) fx += 1
      if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1
    }
    const len = Math.hypot(fx, fz) || 1
    const moving = fx !== 0 || fz !== 0
    const sprinting = moving && (k.has('ShiftLeft') || k.has('ShiftRight'))
    const speed = sprinting ? RUN_SPEED : WALK_SPEED
    const yaw = runtime.look.yaw
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    // forward = (-sin, -cos), right = (cos, -sin)
    const vx = ((-sin * fz + cos * fx) / len) * speed
    const vz = ((-cos * fz - sin * fx) / len) * speed

    const vel = b.linvel()
    const p = b.translation()
    const now = performance.now()
    const j = jump.current

    // Grounded = the probe under the capsule overlaps something solid. Skipped
    // right after a jump, and while moving up fast, so the take-off frames
    // don't count as standing.
    probeHit = false
    if (now - j.jumpedAt > JUMP_COOLDOWN && vel.y < 1) {
      probePos.x = p.x
      probePos.y = p.y - CAPSULE_HALF - PROBE_DEPTH
      probePos.z = p.z
      world.intersectionsWithShape(
        probePos,
        probeRot,
        probe,
        onProbeHit,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        b,
      )
      if (probeHit) j.groundedAt = now
    }
    runtime.grounded = probeHit

    let vy = vel.y
    // A press since the last frame always counts, so slow frames can't eat it.
    const wantsJump = j.pressedAt > j.lastFrameAt || now - j.pressedAt <= JUMP_BUFFER
    j.lastFrameAt = now
    const canJump = now - j.groundedAt <= COYOTE_TIME
    if (active && wantsJump && canJump) {
      vy = JUMP_SPEED
      j.jumpedAt = now
      j.pressedAt = -Infinity // consume the press
      j.groundedAt = -Infinity // consume coyote time
      runtime.grounded = false
      runtime.jumpCount++
    }
    b.setLinvel({ x: vx, y: vy, z: vz }, true)

    // Ease the FOV toward the sprint/walk value.
    const cam = camera as THREE.PerspectiveCamera
    const targetFov = active && sprinting ? SPRINT_FOV : BASE_FOV
    if (Math.abs(cam.fov - targetFov) > 0.01) {
      cam.fov += (targetFov - cam.fov) * Math.min(1, delta * 10)
      cam.updateProjectionMatrix()
    }

    camera.position.set(p.x, p.y + EYE_HEIGHT, p.z)
    euler.set(runtime.look.pitch, yaw, 0)
    camera.quaternion.setFromEuler(euler)
  })

  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={SPAWN}
      enabledRotations={[false, false, false]}
      canSleep={false}
      ccd
    >
      <CapsuleCollider args={[CAPSULE_HALF, CAPSULE_RADIUS]} friction={0} />
    </RigidBody>
  )
}
