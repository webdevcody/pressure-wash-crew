import * as THREE from 'three'
import { runtime } from './runtime'

const raycaster = new THREE.Raycaster()
const hits: THREE.Intersection[] = []

/**
 * Closest hit along a ray against everything the spray can hit. Reuses one
 * result array, so it allocates nothing per call. The returned object is
 * only valid until the next call.
 */
export function castSprayRay(origin: THREE.Vector3, dir: THREE.Vector3, far: number): THREE.Intersection | undefined {
  hits.length = 0
  raycaster.set(origin, dir)
  raycaster.far = far
  raycaster.intersectObjects(runtime.raycastTargets, false, hits)
  return hits[0]
}
