import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { NOZZLES, pressureFalloff, type NozzleDef } from '../../game/nozzles'
import { runtime } from '../../game/runtime'
import { emitParticle } from '../../game/sprayParticles'
import { castSprayRay } from '../../game/sprayRay'
import { useGame } from '../../game/store'
import type { WashSurface } from '../../game/washSurface'

/** After the gun (-5) publishes its tip, before particles and mask uploads (0). */
export const SPRAY_PRIORITY = -2

const RAYS_PER_FRAME = 8
const STREAM_PER_FRAME = 10
const WATER = new THREE.Color('#cfeeff')
const FOAM = new THREE.Color('#ffffff')

const tmpDir = new THREE.Vector3()
const tmpRight = new THREE.Vector3()
const tmpUp = new THREE.Vector3()
const fanAxis = new THREE.Vector3()
const fanCross = new THREE.Vector3()
const rayDir = new THREE.Vector3()
const tmpN = new THREE.Vector3()
const tmpV = new THREE.Vector3()
const tmpTarget = new THREE.Vector3()

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

/**
 * The spray itself: raycasts in the nozzle's pattern, stamps the dirt masks,
 * and emits splash and stream droplets. Allocation-free per frame.
 */
export function Spray() {
  const camera = useThree((s) => s.camera)

  useFrame((_, rawDt) => {
    const g = useGame.getState()
    if (!g.spraying || g.phase !== 'playing' || g.paused) return
    const dt = Math.min(rawDt, 0.1)
    const n = NOZZLES[g.nozzle]

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

    const color = n.soap ? FOAM : WATER
    let aimDist = n.reach
    for (let r = 0; r < RAYS_PER_FRAME; r++) {
      // First ray goes dead center so the crosshair is honest.
      sampleDir(rayDir, n, r === 0)
      const hit = castSprayRay(camera.position, rayDir, n.reach)
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
        emitParticle(hit.point, tmpV, 0.25 + Math.random() * 0.3, n.soap ? 1.2 : 0.7, color)
      }
    }

    // Stream from the nozzle (published by WasherGun), spread in the same shape as the spray.
    const nozzle = runtime.nozzleWorld
    const speed = n.soap ? 16 : n.shape === 'point' ? 34 : 28
    for (let i = 0; i < STREAM_PER_FRAME; i++) {
      sampleDir(rayDir, n, false)
      tmpTarget.copy(camera.position).addScaledVector(rayDir, aimDist)
      tmpV.copy(tmpTarget).sub(nozzle)
      const dist = tmpV.length()
      tmpV.multiplyScalar((speed * (0.92 + Math.random() * 0.16)) / dist)
      tmpN.copy(nozzle).addScaledVector(tmpV, Math.random() * dt)
      emitParticle(tmpN, tmpV, dist / speed, n.shape === 'point' ? 0.7 : n.soap ? 1.4 : 1, color)
    }
  }, SPRAY_PRIORITY)

  return null
}
