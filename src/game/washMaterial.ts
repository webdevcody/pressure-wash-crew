import * as THREE from 'three'
import type { WashSurface } from './washSurface'

export interface WashMaterialOptions {
  /** Clean albedo, tiled across the surface at full resolution. */
  map: THREE.Texture
  normalMap?: THREE.Texture
  roughnessMap?: THREE.Texture
  /** Size of one texture tile in meters: one number, or [across, up]. */
  tileMeters: number | [number, number]
  roughness?: number
  normalScale?: number
}

/**
 * Material for a washable surface that shows a real texture underneath the
 * dirt. The clean look (`map`, `normalMap`, `roughnessMap`) tiles at full
 * resolution; the surface's dirt DataTexture is laid over it in the shader
 * using the mesh's raw 0..1 UV (the same UV the washer stamps at).
 *
 * Contract with `WashSurface.paint()`: RGB is the stain blended over the
 * def's `clean` color (set `clean: '#ffffff'` for textured surfaces) and
 * alpha is stain coverage. The shader recovers the stain color and mixes it
 * over the texture, so stains lighter than the base (paint, foam) work too.
 *
 * The textures passed in are cloned (sharing the GPU upload) so each surface
 * can have its own repeat.
 */
export function createWashMaterial(surface: WashSurface, opts: WashMaterialOptions): THREE.MeshStandardMaterial {
  const [tx, ty] = typeof opts.tileMeters === 'number' ? [opts.tileMeters, opts.tileMeters] : opts.tileMeters
  const rx = surface.def.width / tx
  const ry = surface.def.height / ty
  const tile = (t: THREE.Texture | undefined) => {
    if (!t) return null
    const c = t.clone()
    c.wrapS = c.wrapT = THREE.RepeatWrapping
    c.repeat.set(rx, ry)
    c.needsUpdate = true
    return c
  }

  const mat = new THREE.MeshStandardMaterial({
    map: tile(opts.map),
    normalMap: tile(opts.normalMap),
    roughnessMap: tile(opts.roughnessMap),
    roughness: opts.roughness ?? 0.9,
  })
  if (opts.normalScale !== undefined) mat.normalScale.setScalar(opts.normalScale)

  const dirtMap = { value: surface.texture }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.dirtMap = dirtMap
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vDirtUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvDirtUv = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D dirtMap;\nvarying vec2 vDirtUv;')
      .replace(
        '#include <map_fragment>',
        /* glsl */ `#include <map_fragment>
        {
          vec4 dirt = texture2D(dirtMap, vDirtUv);
          float a = dirt.a;
          if (a > 0.003) {
            // paint() blends in sRGB: undo that to get the stain color.
            vec3 blended = pow(dirt.rgb, vec3(1.0 / 2.2));
            vec3 stain = pow(clamp((blended - (1.0 - a)) / a, 0.0, 1.0), vec3(2.2));
            // Let the texture's relief (joints, grain) show through the grime.
            vec3 mean = textureLod(map, vMapUv, 12.0).rgb;
            float detail = dot(diffuseColor.rgb, vec3(0.333)) / max(dot(mean, vec3(0.333)), 0.02);
            stain *= mix(1.0, clamp(detail, 0.4, 1.6), 0.55);
            diffuseColor.rgb = mix(diffuseColor.rgb, stain, a);
          }
        }`,
      )
  }
  // Every wash material shares one program.
  mat.customProgramCacheKey = () => 'wash-material-v1'
  return mat
}
