import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { runtime } from '../game/runtime'
import { checkSurfaceCompletion, onSurfaceCleaned } from '../game/surfaceEvents'
import type { WashSurface } from '../game/washSurface'
import { installAudioUnlock, playDing } from './ding'

/*
 * "Wall finished" celebration: when a surface hits fully clean it flashes
 * green for about a second, a burst of confetti pops out of it, and a chime
 * plays. Everything is pooled and allocated up front; when nothing is
 * celebrating the meshes are hidden, so idle cost is zero draw calls and one
 * cheap completion check per frame.
 */

const FLASH_POOL = 4
const FLASH_SECONDS = 1.0
const FLASH_PEAK = 0.8
const FLASH_COLOR = '#1fd65f'

const MAX_CONFETTI = 1000
const CONFETTI_PER_M2 = 12
const CONFETTI_MIN = 120
const CONFETTI_MAX = 280
const CONFETTI_LIFE = 2.6 // seconds, +/- some jitter
const GRAVITY = 5.5 // confetti floats, so less than real gravity
const DRAG = 1.6
const GROUND_Y = 0.015
const PALETTE = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#9b5de5', '#f15bb5', '#ffffff', '#ff9f1c']

const tmpQuat = new THREE.Quaternion()
const tmpAxis = new THREE.Vector3()
const tmpPos = new THREE.Vector3()
const tmpScale = new THREE.Vector3()
const tmpMat = new THREE.Matrix4()
const tmpNormal = new THREE.Vector3()
const tmpTanX = new THREE.Vector3()
const tmpTanY = new THREE.Vector3()
const tmpColor = new THREE.Color()
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

interface Flash {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  t: number // seconds since start; >= FLASH_SECONDS means idle
}

function findSurfaceMesh(s: WashSurface): THREE.Mesh | null {
  for (const o of runtime.raycastTargets) if (o.userData.surface === s) return o as THREE.Mesh
  return null
}

export function Celebrations() {
  const confettiRef = useRef<THREE.InstancedMesh>(null)

  const flashes = useMemo<Flash[]>(
    () =>
      Array.from({ length: FLASH_POOL }, () => {
        const mat = new THREE.MeshBasicMaterial({
          color: FLASH_COLOR,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
          // Front side only: a transparent DoubleSide material costs two draw calls.
          // Sit just in front of the wall it covers without z-fighting.
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -4,
        })
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat)
        mesh.matrixAutoUpdate = false
        mesh.visible = false
        mesh.renderOrder = 10
        mesh.frustumCulled = false
        return { mesh, t: FLASH_SECONDS }
      }),
    [],
  )

  // Confetti state lives in flat typed arrays (no per-particle objects).
  const c = useMemo(
    () => ({
      pos: new Float32Array(MAX_CONFETTI * 3),
      vel: new Float32Array(MAX_CONFETTI * 3),
      axis: new Float32Array(MAX_CONFETTI * 3),
      angle: new Float32Array(MAX_CONFETTI),
      spin: new Float32Array(MAX_CONFETTI),
      life: new Float32Array(MAX_CONFETTI),
      phase: new Float32Array(MAX_CONFETTI),
      next: 0,
      alive: 0,
    }),
    [],
  )

  useEffect(() => installAudioUnlock(), [])

  // Hide every confetti instance until it's spawned.
  useEffect(() => {
    const mesh = confettiRef.current
    if (!mesh) return
    for (let i = 0; i < MAX_CONFETTI; i++) {
      mesh.setMatrixAt(i, HIDDEN)
      mesh.setColorAt(i, tmpColor.set(PALETTE[i % PALETTE.length]))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.visible = false
  }, [])

  useEffect(
    () =>
      onSurfaceCleaned((surface) => {
        const target = findSurfaceMesh(surface)
        playDing()
        if (!target) return
        target.updateWorldMatrix(true, false)

        // Green flash: reuse the idle (or oldest) overlay, matched to the wall's geometry.
        let f = flashes[0]
        for (const x of flashes) if (x.t > f.t) f = x
        f.t = 0
        f.mesh.geometry = target.geometry
        f.mesh.matrix.copy(target.matrixWorld)
        f.mesh.matrixWorldNeedsUpdate = true
        f.mesh.material.opacity = 0
        f.mesh.visible = true

        // Confetti: spawn across the face, popping out along its normal.
        const { width, height } = surface.def
        const m = target.matrixWorld
        tmpNormal.set(0, 0, 1).transformDirection(m)
        tmpTanX.set(1, 0, 0).transformDirection(m)
        tmpTanY.set(0, 1, 0).transformDirection(m)
        const count = Math.round(Math.min(CONFETTI_MAX, Math.max(CONFETTI_MIN, width * height * CONFETTI_PER_M2)))
        for (let n = 0; n < count; n++) {
          const i = c.next
          c.next = (c.next + 1) % MAX_CONFETTI
          if (c.life[i] <= 0) c.alive++
          // Two-thirds spread over the whole face, the rest clustered at the center.
          const spread = n % 3 === 2 ? 0.25 : 1
          tmpPos
            .set((Math.random() - 0.5) * width * spread, (Math.random() - 0.5) * height * spread, 0.05)
            .applyMatrix4(m)
          c.pos[i * 3] = tmpPos.x
          c.pos[i * 3 + 1] = tmpPos.y
          c.pos[i * 3 + 2] = tmpPos.z
          const out = 2.5 + Math.random() * 3.5
          const sx = (Math.random() - 0.5) * 3
          const sy = (Math.random() - 0.5) * 3
          const up = 1.5 + Math.random() * 2.5
          c.vel[i * 3] = tmpNormal.x * out + tmpTanX.x * sx + tmpTanY.x * sy
          c.vel[i * 3 + 1] = tmpNormal.y * out + tmpTanX.y * sx + tmpTanY.y * sy + up
          c.vel[i * 3 + 2] = tmpNormal.z * out + tmpTanX.z * sx + tmpTanY.z * sy
          tmpAxis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
          c.axis[i * 3] = tmpAxis.x
          c.axis[i * 3 + 1] = tmpAxis.y
          c.axis[i * 3 + 2] = tmpAxis.z
          c.angle[i] = Math.random() * Math.PI * 2
          c.spin[i] = 6 + Math.random() * 10
          c.phase[i] = Math.random() * Math.PI * 2
          c.life[i] = CONFETTI_LIFE * (0.8 + Math.random() * 0.4)
        }
        const mesh = confettiRef.current
        if (mesh) mesh.visible = true
      }),
    [flashes, c],
  )

  useFrame((_, rawDt) => {
    checkSurfaceCompletion()
    const dt = Math.min(rawDt, 0.1)

    for (let k = 0; k < flashes.length; k++) {
      const f = flashes[k]
      if (f.t >= FLASH_SECONDS) continue
      f.t += dt
      if (f.t >= FLASH_SECONDS) {
        f.mesh.visible = false
        continue
      }
      // Snap on, then two soft pulses that fade out over the second.
      const p = f.t / FLASH_SECONDS
      const attack = Math.min(1, f.t / 0.05)
      const pulse = 0.7 + 0.3 * Math.cos(p * Math.PI * 4)
      f.mesh.material.opacity = FLASH_PEAK * attack * pulse * Math.pow(1 - p, 1.3)
    }

    const mesh = confettiRef.current
    if (!mesh || c.alive === 0) return
    const { pos, vel, axis, angle, spin, life, phase } = c
    const drag = Math.max(0, 1 - DRAG * dt)
    for (let i = 0; i < MAX_CONFETTI; i++) {
      if (life[i] <= 0) continue
      life[i] -= dt
      if (life[i] <= 0) {
        c.alive--
        mesh.setMatrixAt(i, HIDDEN)
        continue
      }
      const i3 = i * 3
      let y = pos[i3 + 1]
      if (y > GROUND_Y) {
        vel[i3 + 1] -= GRAVITY * dt
        vel[i3] *= drag
        vel[i3 + 1] *= drag
        vel[i3 + 2] *= drag
        // Side-to-side flutter once it's falling.
        const wobble = Math.sin(life[i] * 7 + phase[i]) * 0.9 * dt
        pos[i3] += vel[i3] * dt + wobble
        pos[i3 + 1] += vel[i3 + 1] * dt
        pos[i3 + 2] += vel[i3 + 2] * dt + wobble * 0.6
        angle[i] += spin[i] * dt
        y = pos[i3 + 1]
        if (y <= GROUND_Y) {
          pos[i3 + 1] = GROUND_Y
          vel[i3] = vel[i3 + 1] = vel[i3 + 2] = 0
        }
      }
      const s = Math.min(1, life[i] / 0.4) // shrink away at the end
      tmpAxis.set(axis[i3], axis[i3 + 1], axis[i3 + 2])
      tmpQuat.setFromAxisAngle(tmpAxis, angle[i])
      tmpPos.set(pos[i3], pos[i3 + 1], pos[i3 + 2])
      tmpScale.set(s, s, s)
      tmpMat.compose(tmpPos, tmpQuat, tmpScale)
      mesh.setMatrixAt(i, tmpMat)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (c.alive === 0) mesh.visible = false
  })

  return (
    <>
      {flashes.map((f, i) => (
        <primitive key={i} object={f.mesh} />
      ))}
      <instancedMesh ref={confettiRef} args={[undefined, undefined, MAX_CONFETTI]} frustumCulled={false}>
        <planeGeometry args={[0.09, 0.055]} />
        <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
    </>
  )
}
