import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import grassAlbedo from '../../assets/textures/yard/grass_albedo.jpg'
import grassNormal from '../../assets/textures/yard/grass_normal.jpg'
import grassMacro from '../../assets/textures/yard/grass_macro.png'
import concreteAlbedo from '../../assets/textures/yard/concrete_albedo.jpg'
import concreteNormal from '../../assets/textures/yard/concrete_normal.jpg'
import wallAlbedo from '../../assets/textures/yard/wall_albedo.jpg'
import wallNormal from '../../assets/textures/yard/wall_normal.jpg'
import woodAlbedo from '../../assets/textures/yard/wood_albedo.jpg'
import woodNormal from '../../assets/textures/yard/wood_normal.jpg'
import crateAlbedo from '../../assets/textures/yard/crate_albedo.jpg'
import crateNormal from '../../assets/textures/yard/crate_normal.jpg'

/**
 * Yard textures, baked by scripts/textures/gen_yard_textures.py. Real-world
 * size of one tile, in meters [across, up], so geometry with metric UVs
 * (see metricBoxGeometry) and wash materials can tile them correctly.
 */
export const YARD_TILE = {
  grass: [2.5, 2.5],
  concrete: [1.5, 1.75],
  wall: [1.6, 1.6],
  wood: [1.12, 1.2],
} as const satisfies Record<string, [number, number]>

const URLS = {
  grassAlbedo,
  grassNormal,
  grassMacro,
  concreteAlbedo,
  concreteNormal,
  wallAlbedo,
  wallNormal,
  woodAlbedo,
  woodNormal,
  crateAlbedo,
  crateNormal,
}

export type YardTextures = Record<keyof typeof URLS, THREE.Texture>

/** Loads (suspends) and configures every yard texture once. */
export function useYardTextures(): YardTextures {
  const tex = useTexture(URLS) as YardTextures
  useMemo(() => {
    for (const [key, t] of Object.entries(tex)) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = 4
      t.colorSpace = key.endsWith('Albedo') ? THREE.SRGBColorSpace : THREE.NoColorSpace
      t.needsUpdate = true
    }
  }, [tex])
  return tex
}

export type BlockMaterialId = 'wall' | 'concrete' | 'wood' | 'crate'

/** Materials for solid yard blocks. Wall/concrete/wood expect metric UVs. */
export function useBlockMaterials(tex: YardTextures): Record<BlockMaterialId, THREE.MeshStandardMaterial> {
  return useMemo(() => {
    const metric = (t: THREE.Texture, [x, y]: readonly [number, number]) => {
      const c = t.clone()
      c.repeat.set(1 / x, 1 / y)
      c.needsUpdate = true
      return c
    }
    return {
      wall: new THREE.MeshStandardMaterial({
        map: metric(tex.wallAlbedo, YARD_TILE.wall),
        normalMap: metric(tex.wallNormal, YARD_TILE.wall),
        roughness: 0.92,
      }),
      concrete: new THREE.MeshStandardMaterial({
        map: metric(tex.concreteAlbedo, YARD_TILE.concrete),
        normalMap: metric(tex.concreteNormal, YARD_TILE.concrete),
        color: '#c9c5bd',
        roughness: 0.88,
      }),
      wood: new THREE.MeshStandardMaterial({
        map: metric(tex.woodAlbedo, YARD_TILE.wood),
        normalMap: metric(tex.woodNormal, YARD_TILE.wood),
        roughness: 0.8,
      }),
      crate: new THREE.MeshStandardMaterial({
        map: tex.crateAlbedo,
        normalMap: tex.crateNormal,
        roughness: 0.8,
      }),
    }
  }, [tex])
}

/**
 * Lawn material: tiled grass plus a world-space macro tint, a second grass
 * sample at another scale and faint mowing stripes, so the 2.5 m tile doesn't
 * read as a repeating grid across a 30 m yard. Costs two extra texture reads.
 */
export function useGrassMaterial(tex: YardTextures, size: number): THREE.MeshStandardMaterial {
  return useMemo(() => {
    const [tx, ty] = YARD_TILE.grass
    const map = tex.grassAlbedo.clone()
    map.repeat.set(size / tx, size / ty)
    map.needsUpdate = true
    const normalMap = tex.grassNormal.clone()
    normalMap.repeat.copy(map.repeat)
    normalMap.needsUpdate = true
    const mat = new THREE.MeshStandardMaterial({ map, normalMap, roughness: 0.95 })
    mat.normalScale.setScalar(0.8)
    const macro = { value: tex.grassMacro }
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.grassMacro = macro
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;',
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D grassMacro;\nvarying vec2 vWorldXZ;')
        .replace(
          '#include <map_fragment>',
          /* glsl */ `#include <map_fragment>
          {
            float m1 = texture2D(grassMacro, vWorldXZ / 23.0).r;
            float m2 = texture2D(grassMacro, vWorldXZ / 9.0 + vec2(0.37, 0.71)).r;
            vec3 alt = texture2D(map, vMapUv * 0.41 + vec2(0.29, 0.53)).rgb;
            diffuseColor.rgb = mix(diffuseColor.rgb, alt, smoothstep(0.35, 0.65, m2) * 0.6);
            diffuseColor.rgb *= mix(0.8, 1.15, m1);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.06, 0.82), smoothstep(0.6, 0.9, m1) * 0.5);
            float stripe = smoothstep(0.3, 0.7, abs(fract(vWorldXZ.x / 6.0) * 2.0 - 1.0));
            diffuseColor.rgb *= mix(0.95, 1.05, stripe);
          }`,
        )
    }
    mat.customProgramCacheKey = () => 'yard-grass-v1'
    return mat
  }, [tex, size])
}

/**
 * BoxGeometry whose UVs are in meters, so a texture with repeat = 1/tile
 * tiles at the same physical size on every face of every box.
 */
export function metricBoxGeometry([w, h, d]: readonly [number, number, number]): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv as THREE.BufferAttribute
  // Face order: +x, -x, +y, -y, +z, -z; 4 vertices each.
  const scale: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ]
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v
      uv.setXY(i, uv.getX(i) * scale[f][0], uv.getY(i) * scale[f][1])
    }
  }
  uv.needsUpdate = true
  return g
}

/**
 * One merged geometry per yard material for all textured blocks, so the four
 * walls, four caps, fence parts and crates cost one draw call per material
 * (per pass) instead of one each. Colliders stay per block.
 */
export function mergedBlockGeometries(
  defs: readonly { position: readonly [number, number, number]; size: readonly [number, number, number]; material?: BlockMaterialId }[],
): { id: BlockMaterialId; geometry: THREE.BufferGeometry }[] {
  const byId = new Map<BlockMaterialId, THREE.BufferGeometry[]>()
  for (const b of defs) {
    if (!b.material) continue
    const g = b.material === 'crate' ? new THREE.BoxGeometry(...b.size) : metricBoxGeometry(b.size)
    g.translate(...b.position)
    const list = byId.get(b.material) ?? []
    list.push(g)
    byId.set(b.material, list)
  }
  return [...byId].map(([id, parts]) => {
    const geometry = mergeGeometries(parts)
    parts.forEach((p) => p.dispose())
    geometry.computeBoundingSphere()
    return { id, geometry }
  })
}
