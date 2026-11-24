import * as THREE from 'three'

/**
 * Shared pool of spray droplets. Anything can emit (the spray, splashes, a
 * future effect) without touching the component that draws them
 * (components/washer/SprayParticles.tsx). Allocation-free: a fixed ring of
 * particles, oldest overwritten first.
 */
export const MAX_PARTICLES = 700

export interface Particle {
  life: number
  pos: THREE.Vector3
  vel: THREE.Vector3
  size: number
}

export const particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
  life: 0,
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  size: 1,
}))

export const particleState = {
  /** The instanced mesh that draws the pool, once mounted. */
  mesh: null as THREE.InstancedMesh | null,
  next: 0,
  /** A color was written since the last upload. */
  colorsDirty: false,
}

/** Spawn one droplet. Copies `pos` and `vel`, so callers can reuse temps. */
export function emitParticle(pos: THREE.Vector3, vel: THREE.Vector3, life: number, size: number, color: THREE.Color) {
  const i = particleState.next
  const p = particles[i]
  particleState.next = (i + 1) % MAX_PARTICLES
  p.pos.copy(pos)
  p.vel.copy(vel)
  p.life = life
  p.size = size
  if (particleState.mesh) {
    particleState.mesh.setColorAt(i, color)
    particleState.colorsDirty = true
  }
}
