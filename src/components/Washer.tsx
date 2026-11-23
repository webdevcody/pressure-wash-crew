import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'
import type { WashSurface } from '../game/washSurface'

const RAYS_PER_FRAME = 8
const CONE_ANGLE = 0.035 // radians, half-angle of the spray cone
const MAX_RANGE = 9
const CLEAN_RATE = 9 // dirt units/sec removed at brush center when close
const NOZZLE_OFFSET = new THREE.Vector3(0.22, -0.2, -0.75)
const MAX_PARTICLES = 700

const raycaster = new THREE.Raycaster()
raycaster.far = MAX_RANGE
const tmpDir = new THREE.Vector3()
const tmpRight = new THREE.Vector3()
const tmpUp = new THREE.Vector3()
const nozzleWorld = new THREE.Vector3()
const aimPoint = new THREE.Vector3()
const dummy = new THREE.Object3D()

interface Particle {
  life: number
  pos: THREE.Vector3
  vel: THREE.Vector3
  size: number
}

export function Washer() {
  const camera = useThree((s) => s.camera)
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

  const spawn = (pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number) => {
    const p = particles[nextParticle.current]
    nextParticle.current = (nextParticle.current + 1) % MAX_PARTICLES
    p.pos.copy(pos)
    p.vel.copy(vel)
    p.life = life
    p.size = size
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const g = useGame.getState()
    const spraying = g.spraying && g.phase === 'playing' && !g.paused

    // Gun follows the camera.
    if (gun.current) {
      gun.current.position.copy(camera.position)
      gun.current.quaternion.copy(camera.quaternion)
      const kick = spraying ? (Math.random() - 0.5) * 0.006 : 0
      gun.current.children[0].position.set(kick, kick, spraying ? 0.015 : 0)
    }
    nozzleWorld.copy(NOZZLE_OFFSET).applyMatrix4(camera.matrixWorld)

    if (spraying) {
      camera.getWorldDirection(tmpDir)
      tmpRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
      tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
      let centerHit: THREE.Vector3 | null = null

      for (let r = 0; r < RAYS_PER_FRAME; r++) {
        // First ray goes dead center so the crosshair is honest.
        const a = r === 0 ? 0 : Math.random() * Math.PI * 2
        const m = r === 0 ? 0 : Math.sqrt(Math.random()) * CONE_ANGLE
        const dir = tmpDir
          .clone()
          .addScaledVector(tmpRight, Math.cos(a) * m)
          .addScaledVector(tmpUp, Math.sin(a) * m)
          .normalize()
        raycaster.set(camera.position, dir)
        const hit = raycaster.intersectObjects(runtime.raycastTargets, false)[0]
        if (!hit) continue
        if (r === 0) centerHit = hit.point.clone()
        const surface = hit.object.userData.surface as WashSurface | undefined
        if (surface && hit.uv) {
          // Close = tight & strong, far = wide & weak.
          const d = hit.distance
          const strength = d < 2 ? 1 : Math.max(0.15, 1 - (d - 2) / (MAX_RANGE - 2))
          const radius = 0.2 + d * 0.03
          surface.stamp(hit.uv, radius, (CLEAN_RATE * strength * dt * 2.2) / RAYS_PER_FRAME)
        }
        // Splash
        if (Math.random() < 0.7) {
          const n = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld) ?? new THREE.Vector3(0, 1, 0)
          const v = n
            .multiplyScalar(1.5 + Math.random() * 2)
            .add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3))
          spawn(hit.point, v, 0.25 + Math.random() * 0.3, 0.7)
        }
      }

      // Stream from nozzle toward the aim point.
      aimPoint.copy(centerHit ?? camera.position.clone().addScaledVector(tmpDir, MAX_RANGE))
      const dist = nozzleWorld.distanceTo(aimPoint)
      const speed = 28
      for (let i = 0; i < 10; i++) {
        const v = aimPoint
          .clone()
          .sub(nozzleWorld)
          .normalize()
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05))
          .multiplyScalar(speed * (0.9 + Math.random() * 0.2))
        const start = nozzleWorld.clone().addScaledVector(v, Math.random() * dt)
        spawn(start, v, dist / speed, 1)
      }
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
            <meshStandardMaterial color="#d4a017" metalness={0.5} roughness={0.3} />
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
        <meshBasicMaterial color="#cfeeff" transparent opacity={0.75} depthWrite={false} />
      </instancedMesh>
    </>
  )
}
