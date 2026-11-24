import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { MAX_PARTICLES, particles, particleState } from '../../game/sprayParticles'

const WATER = new THREE.Color('#cfeeff')
const dummy = new THREE.Object3D()

/**
 * Draws and moves the droplet pool from game/sprayParticles.ts. Runs at the
 * default priority, after everything that emits this frame.
 */
export function SprayParticles() {
  const drops = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mesh = drops.current
    if (!mesh) return
    // Water by default; emitters set their own color per droplet.
    for (let i = 0; i < MAX_PARTICLES; i++) mesh.setColorAt(i, WATER)
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    particleState.mesh = mesh
    return () => {
      particleState.mesh = null
    }
  }, [])

  useFrame((_, rawDt) => {
    const mesh = drops.current
    if (!mesh) return
    const dt = Math.min(rawDt, 0.1)
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
    if (particleState.colorsDirty && mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
      particleState.colorsDirty = false
    }
  })

  return (
    <instancedMesh ref={drops} args={[undefined, undefined, MAX_PARTICLES]} frustumCulled={false}>
      <sphereGeometry args={[0.025, 6, 4]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.75} depthWrite={false} />
    </instancedMesh>
  )
}
