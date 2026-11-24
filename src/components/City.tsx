import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { buildCity, buildGround, BLOCK_PITCH, LOT_HALF } from './city/layout'
import { makeCityMaterial } from './city/material'
import { makeGroundTexture, makeSkylineTexture } from './city/textures'
import { HAZE } from '../game/atmosphere'


/** Ground tiles across the city (odd, so the yard's block sits in the middle tile). */
const GROUND_TILES = 25
const SKYLINE_RADIUS = 520
const SKYLINE_HEIGHT = 120

/**
 * Everything outside the yard walls: streets, sidewalks, neighbor houses,
 * apartments, a downtown skyline and a distant silhouette ring. It is all
 * static and built once on mount: one ground mesh, nine merged building
 * chunks (so frustum culling drops the ones behind you) and one horizon ring,
 * with no shadows, colliders or per-frame work.
 */
export function City() {
  const gl = useThree((s) => s.gl)

  const assets = useMemo(() => {
    const ground = makeGroundTexture(gl.capabilities.getMaxAnisotropy())
    const skyline = makeSkylineTexture(HAZE)
    skyline.repeat.set(3, 1)
    return {
      groundTex: ground,
      skylineTex: skyline,
      groundGeo: buildGround((GROUND_TILES * BLOCK_PITCH) / 2, LOT_HALF - 0.2),
      cityGeos: buildCity(),
      cityMat: makeCityMaterial(),
    }
  }, [gl])

  useEffect(
    () => () => {
      assets.groundTex.dispose()
      assets.skylineTex.dispose()
      assets.groundGeo.dispose()
      assets.cityGeos.forEach((c) => c.geometry.dispose())
      assets.cityMat.dispose()
    },
    [assets],
  )

  return (
    <group name="city">
      {/* Has a hole under the yard (the walls cover the seam) and sits a hair
          lower than the yard ground in case that ground extends past the walls. */}
      <mesh geometry={assets.groundGeo} position-y={-0.03} matrixAutoUpdate={false} onUpdate={(m) => m.updateMatrix()}>
        <meshLambertMaterial map={assets.groundTex} />
      </mesh>

      {assets.cityGeos.map((c, i) => (
        <mesh key={i} geometry={c.geometry} material={assets.cityMat} position={c.center} />
      ))}

      <mesh position-y={SKYLINE_HEIGHT / 2 - 2} renderOrder={1} matrixAutoUpdate={false} onUpdate={(m) => m.updateMatrix()}>
        <cylinderGeometry args={[SKYLINE_RADIUS, SKYLINE_RADIUS, SKYLINE_HEIGHT, 64, 1, true]} />
        <meshBasicMaterial map={assets.skylineTex} side={THREE.BackSide} alphaTest={0.5} fog={false} />
      </mesh>
    </group>
  )
}
