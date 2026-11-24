import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import { CLEAN_THRESHOLD, type WashSurface } from '../game/washSurface'
import { NOZZLES, pressureFalloff, type NozzleDef } from '../game/nozzles'

const RAYS_PER_FRAME = 8
/** Furthest the crosshair looks for a stain to label. */
const AIM_RANGE = 14
const NOZZLE_OFFSET = new THREE.Vector3(0.22, -0.2, -0.75)
const MAX_PARTICLES = 700
const STREAM_PER_FRAME = 10
const WATER = new THREE.Color('#cfeeff')
const FOAM = new THREE.Color('#ffffff')

const raycaster = new THREE.Raycaster()
const hits: THREE.Intersection[] = []
const tmpDir = new THREE.Vector3()
const tmpRight = new THREE.Vector3()
const tmpUp = new THREE.Vector3()
const fanAxis = new THREE.Vector3()
const fanCross = new THREE.Vector3()
const rayDir = new THREE.Vector3()
const nozzleWorld = new THREE.Vector3()
const tmpN = new THREE.Vector3()
const tmpV = new THREE.Vector3()
const tmpTarget = new THREE.Vector3()
const dummy = new THREE.Object3D()

interface Particle {
  life: number
  pos: THREE.Vector3
  vel: THREE.Vector3
  size: number
}

/** Closest hit along a ray (reuses one array, so no per-ray allocation of results). */
function castRay(origin: THREE.Vector3, dir: THREE.Vector3, far: number): THREE.Intersection | undefined {
  hits.length = 0
  raycaster.set(origin, dir)
  raycaster.far = far
  raycaster.intersectObjects(runtime.raycastTargets, false, hits)
  return hits[0]
}

/**
 * Write a random spray direction for nozzle `n` into `out`. The cone/point
 * shapes sample a disc; fans sample a line along `fanAxis` with a little
 * thickness along `fanCross`. Pass center=true for the dead-center ray.
 */
function sampleDir(out: THREE.Vector3, n: NozzleDef, center: boolean) {
  out.copy(tmpDir)
  if (center) return out
  if (n.shape === 'fan') {
    out.addScaledVector(fanAxis, (Math.random() * 2 - 1) * n.spread)
    out.addScaledVector(fanCross, (Math.random() * 2 - 1) * n.spread * 0.04)
  } else {
    const a = Math.random() * Math.PI * 2
    const m = Math.sqrt(Math.random()) * n.spread
    out.addScaledVector(tmpRight, Math.cos(a) * m).addScaledVector(tmpUp, Math.sin(a) * m)
  }
  return out.normalize()
}

/** Area (m²) the spray pattern covers at distance d, with brush radius r. */
function footprint(n: NozzleDef, d: number, r: number) {
  const s = d * n.spread
  return n.shape === 'fan' ? (2 * s + 2 * r) * 2 * r : Math.PI * (s + r) * (s + r)
}

export function Washer() {
  const camera = useThree((s) => s.camera)
  const nozzleIndex = useGame((s) => s.nozzle)
  const gun = useRef<THREE.Group>(null)
  const drops = useRef<THREE.InstancedMesh>(null)
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: MAX_PARTICLES }, () => ({
        life: 0,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        size: 1,
      })),
    [],
  )
  const nextParticle = useRef(0)
  const aimAcc = useRef(0)

  // Hold left mouse to spray.
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const g = useGame.getState()
      if (e.button === 0 && g.phase === 'playing' && !g.paused) g.setSpraying(true)
    }
    const up = (e: MouseEvent) => {
      if (e.button === 0) useGame.getState().setSpraying(false)
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('mouseup', up)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('mouseup', up)
    }
  }, [])

  // Q / E cycle nozzles, 1-5 pick one, R turns fan tips.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const g = useGame.getState()
      if (g.phase !== 'playing' || g.paused || e.repeat) return
      if (e.code === 'KeyQ') g.cycleNozzle(-1)
      else if (e.code === 'KeyE') g.cycleNozzle(1)
      else if (e.code === 'KeyR') g.toggleFan()
      else if (/^Digit[1-9]$/.test(e.code)) {
        const i = Number(e.code.slice(5)) - 1
        if (i < NOZZLES.length) g.setNozzle(i)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // Water by default; soap particles are white foam.
  useEffect(() => {
    const mesh = drops.current
    if (!mesh) return
    for (let i = 0; i < MAX_PARTICLES; i++) mesh.setColorAt(i, WATER)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [])

  const spawn = (pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, color: THREE.Color) => {
    const i = nextParticle.current
    const p = particles[i]
    nextParticle.current = (i + 1) % MAX_PARTICLES
    p.pos.copy(pos)
    p.vel.copy(vel)
    p.life = life
    p.size = size
    drops.current?.setColorAt(i, color)
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const g = useGame.getState()
    const playing = g.phase === 'playing' && !g.paused
    const spraying = g.spraying && playing
    const n = NOZZLES[g.nozzle]

    // Gun follows the camera.
    if (gun.current) {
      gun.current.position.copy(camera.position)
      gun.current.quaternion.copy(camera.quaternion)
      const kickAmt = n.shape === 'point' ? 0.009 : 0.006
      const kick = spraying ? (Math.random() - 0.5) * kickAmt : 0
      gun.current.children[0].position.set(kick, kick, spraying ? 0.015 : 0)
    }
    nozzleWorld.copy(NOZZLE_OFFSET).applyMatrix4(camera.matrixWorld)

    camera.getWorldDirection(tmpDir)
    tmpRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
    tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
    if (g.fanVertical) {
      fanAxis.copy(tmpUp)
      fanCross.copy(tmpRight)
    } else {
      fanAxis.copy(tmpRight)
      fanCross.copy(tmpUp)
    }

    // Crosshair: what stain is under it (for the HUD), ~10x/sec.
    if (playing) {
      aimAcc.current += dt
      if (aimAcc.current >= 0.1) {
        aimAcc.current = 0
        const hit = castRay(camera.position, tmpDir, AIM_RANGE)
        const surface = hit?.object.userData.surface as WashSurface | undefined
        const i = surface && hit?.uv ? surface.texelAt(hit.uv) : -1
        if (surface && i >= 0 && surface.dirt[i] >= CLEAN_THRESHOLD) {
          g.setAim(surface.stain[i], Math.round(surface.soap[i] * 10) / 10, hit!.distance > n.reach)
        } else {
          g.setAim(-1, 0, false)
        }
      }
    }

    let aimDist = n.reach
    let spawned = false
    if (spraying) {
      const color = n.soap ? FOAM : WATER
      for (let r = 0; r < RAYS_PER_FRAME; r++) {
        // First ray goes dead center so the crosshair is honest.
        sampleDir(rayDir, n, r === 0)
        const hit = castRay(camera.position, rayDir, n.reach)
        if (!hit) continue
        const d = hit.distance
        if (r === 0) aimDist = d
        const surface = hit.object.userData.surface as WashSurface | undefined
        if (surface && hit.uv) {
          // Spread each ray's share so a texel inside the footprint loses
          // about `rate` dirt per second, whatever the pattern's size.
          const f = pressureFalloff(n, d)
          const radius = n.brush + n.brushGrow * d
          const coverage = (footprint(n, d, radius) * 6) / (RAYS_PER_FRAME * Math.PI * radius * radius)
          if (n.soap) surface.soapStamp(hit.uv, radius, n.rate * dt * coverage)
          else surface.stamp(hit.uv, radius, n.rate * f * dt * coverage, n.pressure * f)
        }
        // Splash
        if (Math.random() < (n.soap ? 0.35 : 0.7)) {
          if (hit.face) tmpN.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
          else tmpN.set(0, 1, 0)
          tmpV
            .copy(tmpN)
            .multiplyScalar(1.5 + Math.random() * 2)
            .add(tmpTarget.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3))
          spawn(hit.point, tmpV, 0.25 + Math.random() * 0.3, n.soap ? 1.2 : 0.7, color)
          spawned = true
        }
      }

      // Stream from the nozzle, spread in the same shape as the spray.
      const speed = n.soap ? 16 : n.shape === 'point' ? 34 : 28
      for (let i = 0; i < STREAM_PER_FRAME; i++) {
        sampleDir(rayDir, n, false)
        tmpTarget.copy(camera.position).addScaledVector(rayDir, aimDist)
        tmpV.copy(tmpTarget).sub(nozzleWorld)
        const dist = tmpV.length()
        tmpV.multiplyScalar((speed * (0.92 + Math.random() * 0.16)) / dist)
        tmpN.copy(nozzleWorld).addScaledVector(tmpV, Math.random() * dt)
        spawn(tmpN, tmpV, dist / speed, n.shape === 'point' ? 0.7 : n.soap ? 1.4 : 1, color)
      }
      spawned = true
    }

    // Integrate particles.
    const mesh = drops.current
    if (!mesh) return
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i]
      if (p.life > 0) {
        p.life -= dt
        p.vel.y -= 9.8 * dt * 0.6
        p.pos.addScaledVector(p.vel, dt)
        dummy.position.copy(p.pos)
        dummy.scale.setScalar(p.life > 0 ? p.size : 0)
      } else {
        dummy.scale.setScalar(0)
      }
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (spawned && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <>
      <group ref={gun}>
        <group>
          {/* Wand + trigger body, positioned bottom-right of view */}
          <mesh position={[0.22, -0.2, -0.45]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.018, 0.018, 0.6, 8]} />
            <meshStandardMaterial color="#4a4f55" metalness={0.2} roughness={0.5} />
          </mesh>
          <mesh position={[0.22, -0.2, -0.75]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.012, 0.028, 0.08, 8]} />
            <meshStandardMaterial color={NOZZLES[nozzleIndex].color} metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[0.22, -0.24, -0.17]}>
            <boxGeometry args={[0.06, 0.16, 0.12]} />
            <meshStandardMaterial color="#c0392b" />
          </mesh>
          <mesh position={[0.22, -0.33, -0.14]} rotation-x={-0.3}>
            <boxGeometry args={[0.05, 0.16, 0.06]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        </group>
      </group>
      <instancedMesh ref={drops} args={[undefined, undefined, MAX_PARTICLES]} frustumCulled={false}>
        <sphereGeometry args={[0.025, 6, 4]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.75} depthWrite={false} />
      </instancedMesh>
    </>
  )
}
