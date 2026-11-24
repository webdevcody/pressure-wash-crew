import * as THREE from 'three'

/**
 * Lambert material for the merged city geometry (cheaper than standard, and
 * at these distances the difference doesn't show). Vertex colors tint each
 * building; side faces with `aWin.x > 0` get procedural windows (no texture):
 * a glass rectangle per cell with per-window variation, anti-aliased with
 * fwidth and faded to the average facade color at distance to avoid moiré.
 * Everything also gets a cheap ground-contact darkening.
 */
export function makeCityMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aWin;
varying vec3 vWin;
varying vec2 vCell;
varying float vWorldY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vWin = aWin;
vCell = uv;
vWorldY = position.y;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWin;
varying vec2 vCell;
varying float vWorldY;
float cityHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (vWin.x > 0.0) {
  vec2 f = fract(vCell);
  vec2 id = floor(vCell);
  vec2 aa = fwidth(vCell);
  vec2 dd = abs(f - vec2(0.5, 0.55)) - vWin.xy * 0.5;
  float inside = (1.0 - smoothstep(-aa.x, aa.x, dd.x)) * (1.0 - smoothstep(-aa.y, aa.y, dd.y));
  float near = 1.0 - smoothstep(0.1, 0.3, max(aa.x, aa.y));
  float h = cityHash(id + floor(vWin.z + 0.5) * 17.0);
  vec3 glass = mix(vec3(0.05, 0.075, 0.11), vec3(0.28, 0.36, 0.46), h * h);
  glass += vec3(0.05, 0.06, 0.07) * f.y;              // sky gradient reflection
  glass = mix(glass, vec3(0.55, 0.5, 0.42), step(0.93, h) * 0.6); // a few blinds drawn
  vec3 avgGlass = vec3(0.14, 0.18, 0.24);
  float glassMix = mix(vWin.x * vWin.y, inside, near);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(avgGlass, glass, near), glassMix);
  // Thin sill line under each window row
  float sill = (1.0 - smoothstep(0.0, aa.y * 1.5, abs(f.y - (0.55 - vWin.y * 0.5 - 0.03)))) * near;
  diffuseColor.rgb *= 1.0 - 0.25 * sill * step(abs(f.x - 0.5), vWin.x * 0.5 + 0.04);
}
diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 2.2, vWorldY));`,
      )
  }
  // Distinct cache key so three never shares this program with plain standard materials.
  mat.customProgramCacheKey = () => 'city-windows-v1'
  return mat
}
