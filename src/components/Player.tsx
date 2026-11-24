import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { runtime } from '../game/runtime'
import { SPAWN } from '../game/level1'
import { useGame } from '../game/store'

const WALK_SPEED = 4.5
const RUN_SPEED = 7
const JUMP_SPEED = 5
const EYE_HEIGHT = 0.65 // above capsule center
const MOUSE_SENS = 0.0022

const euler = new THREE.Euler(0, 0, 0, 'YXZ')
const eye = new THREE.Vector3()

/**
 * Frame order (lower runs first):
 *   -100 player input sets the body's velocity
 *    -50 physics step (Physics updatePriority in App.tsx), which also writes
 *        the interpolated body transform into the RigidBody's object3D
 *    -10 camera follows that interpolated transform
 *     -5 gun viewmodel follows the camera (WasherGun)
 *      0 everything else (spray raycasts read the final camera)
 * Reading b.translation() for the camera instead would step at the 60 Hz
 * physics rate and stutter on faster displays.
 */
export const INPUT_PRIORITY = -100
export const PHYSICS_PRIORITY = -50
export const CAMERA_PRIORITY = -10

export function Player() {
  const body = useRef<RapierRigidBody>(null)
  const anchor = useRef<THREE.Object3D>(null)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const runId = useGame((s) => s.runId)

  // Keyboard + mouse look.
  useEffect(() => {
    const down = (e: KeyboardEvent) => runtime.keys.add(e.code)
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
  }, [runId])

  useFrame(() => {
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
    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_SPEED : WALK_SPEED
    const yaw = runtime.look.yaw
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    // forward = (-sin, -cos), right = (cos, -sin)
    const vx = ((-sin * fz + cos * fx) / len) * speed
    const vz = ((-cos * fz - sin * fx) / len) * speed

    const vel = b.linvel()
    let vy = vel.y
    if (active && k.has('Space') && Math.abs(vy) < 0.05) vy = JUMP_SPEED
    b.setLinvel({ x: vx, y: vy, z: vz }, true)
  }, INPUT_PRIORITY)

  // Camera follows the interpolated body, after the physics step.
  useFrame(() => {
    const a = anchor.current
    if (!a) return
    a.getWorldPosition(eye)
    camera.position.set(eye.x, eye.y + EYE_HEIGHT, eye.z)
    euler.set(runtime.look.pitch, runtime.look.yaw, 0)
    camera.quaternion.setFromEuler(euler)
    camera.updateMatrixWorld()
  }, CAMERA_PRIORITY)

  return (
    <RigidBody
      ref={body}
      colliders={false}
      position={SPAWN}
      enabledRotations={[false, false, false]}
      canSleep={false}
      ccd
    >
      <CapsuleCollider args={[0.5, 0.35]} friction={0} />
      <object3D ref={anchor} />
    </RigidBody>
  )
}
