import type * as THREE from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import type { WashSurface } from './washSurface'

/**
 * Mutable, per-frame game data that should not trigger React renders.
 * Components write here; useFrame loops read from here.
 */
export const runtime = {
  surfaces: [] as WashSurface[],
  /** Everything the spray can hit (washables + blockers, so walls occlude). */
  raycastTargets: [] as THREE.Object3D[],
  look: { yaw: 0, pitch: 0 },
  keys: new Set<string>(),
  /** The player's physics body, once mounted. */
  player: null as RapierRigidBody | null,
}

export function totalRemaining(): number {
  let total = 0
  let clean = 0
  for (const s of runtime.surfaces) {
    total += s.total
    clean += s.cleanCount
  }
  return total === 0 ? 1 : 1 - clean / total
}
