import * as THREE from 'three'
import type { WashSurface } from './washSurface'

// TEMPORARY local copy so the house can be previewed. The yard thread owns
// this file (createWashMaterial); replace with theirs when merging.

export interface WashLook {
  map: THREE.Texture
  normalMap?: THREE.Texture
  roughnessMap?: THREE.Texture
  tileMeters: number | [number, number]
}

export function createWashMaterial(surface: WashSurface, look: WashLook) {
  const [tx, ty] = typeof look.tileMeters === 'number' ? [look.tileMeters, look.tileMeters] : look.tileMeters
  const repeat = new THREE.Vector2(surface.def.width / tx, surface.def.height / ty)
  const tile = (t: THREE.Texture | undefined) => {
    if (!t) return undefined
    const c = t.clone()
    c.repeat.copy(repeat)
    c.needsUpdate = true
    return c
  }
  const mat = new THREE.MeshStandardMaterial({
    map: tile(look.map),
    normalMap: tile(look.normalMap),
    roughnessMap: tile(look.roughnessMap),
    roughness: 0.85,
  })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.dirtMap = { value: surface.texture }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDirtUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvDirtUv = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D dirtMap;\nvarying vec2 vDirtUv;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= texture2D(dirtMap, vDirtUv).rgb;')
  }
  return mat
}
