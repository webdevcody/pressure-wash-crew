import * as THREE from 'three'
import { HARDNESS, SOAPED_HARDNESS, cleaningPower, layoutStains, type SurfaceKind } from './stains'
import { buildHoleMask, clearHoles, type HoleMask, type HoleRect } from './surfaceHoles'
import { makeValueNoise, mulberry32 } from './noise'

/** Texels per meter of the dirt mask. Higher = crisper edges, more memory. */
export const TEXELS_PER_METER = 32
/** A texel counts as clean once its dirt drops below this. */
export const CLEAN_THRESHOLD = 0.12
/** Soap foam tint (blue so soaped dirt never reads as clean). */
const FOAM: [number, number, number] = [150, 205, 250]

export interface SurfaceDef {
  id: string
  name: string
  /** Decides which stains get scattered on it (see stains.ts). */
  kind: SurfaceKind
  width: number
  height: number
  position: [number, number, number]
  rotation: [number, number, number]
  /** Color of the surface once it's clean. */
  clean: string
  /** Base grime color. */
  dirt: string
  seed: number
  /**
   * Rectangles [x0, y0, x1, y1] in meters from the surface's bottom-left that
   * are covered by something solid (window trim, a door...); see surfaceHoles.ts.
   */
  holes?: HoleRect[]
}

/**
 * A rectangular washable surface. Dirt lives in a CPU-side Float32Array
 * (one value per texel, 1 = filthy, 0 = spotless); the visible color is
 * baked into an RGBA DataTexture so no custom shader is needed. Spraying
 * stamps a soft brush at a UV, which keeps the clean-texel count exact
 * without any GPU readback.
 *
 * Each texel also has a stain type (grime, mildew, streak, stuck-on, oil;
 * see stains.ts) with its own color and hardness, and a soap amount that
 * lowers the hardness of soap-sensitive stains. Stains are re-randomized
 * on every reset.
 *
 * Texture alpha holds dirt coverage (0 = clean, 255 = full stain) for
 * materials that mix the mask over their own texture.
 */
export class WashSurface {
  readonly def: SurfaceDef
  readonly w: number
  readonly h: number
  readonly dirt: Float32Array
  /** Stain type per texel (index into STAINS). */
  readonly stain: Uint8Array
  /** Soap per texel, 0..1. */
  readonly soap: Float32Array
  readonly texture: THREE.DataTexture
  private readonly pixels: Uint8Array
  /** Stain color per texel, RGB. */
  private readonly stainRGB: Uint8Array
  private readonly cleanRGB: [number, number, number]
  private readonly dirtRGB: [number, number, number]
  private readonly noise: (x: number, y: number) => number
  /** Texels under holes, left out of the count (surfaceHoles.ts). */
  private readonly holes: HoleMask
  cleanCount = 0
  private dirty = false

  constructor(def: SurfaceDef) {
    this.def = def
    this.w = Math.max(4, Math.round(def.width * TEXELS_PER_METER))
    this.h = Math.max(4, Math.round(def.height * TEXELS_PER_METER))
    const n = this.w * this.h
    this.dirt = new Float32Array(n)
    this.stain = new Uint8Array(n)
    this.soap = new Float32Array(n)
    this.stainRGB = new Uint8Array(n * 3)
    this.pixels = new Uint8Array(n * 4)
    const c = new THREE.Color(def.clean)
    const d = new THREE.Color(def.dirt)
    this.cleanRGB = [c.r * 255, c.g * 255, c.b * 255]
    this.dirtRGB = [d.r * 255, d.g * 255, d.b * 255]
    this.noise = makeValueNoise(mulberry32(def.seed))

    this.holes = buildHoleMask(def.holes, this.w, this.h, TEXELS_PER_METER)

    this.texture = new THREE.DataTexture(this.pixels, this.w, this.h, THREE.RGBAFormat)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.magFilter = THREE.LinearFilter
    this.texture.minFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false

    this.reset(0)
  }

  /** Texels that count toward progress (holes excluded). */
  get total() {
    return this.w * this.h - this.holes.count
  }

  get cleanFraction() {
    return this.cleanCount / this.total
  }

  /** Fresh dirt with a new random stain layout for `seed`. */
  reset(seed: number) {
    const rand = mulberry32((Math.imul(this.def.seed, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b)) >>> 0)
    layoutStains(
      { w: this.w, h: this.h, tpm: TEXELS_PER_METER, stain: this.stain, rgb: this.stainRGB, noise: this.noise },
      this.def.kind,
      this.dirtRGB,
      rand,
    )
    this.dirt.fill(1)
    this.soap.fill(0)
    clearHoles(this.holes, this.dirt)
    this.cleanCount = 0
    for (let i = 0; i < this.dirt.length; i++) this.paint(i)
    this.texture.needsUpdate = true
  }

  /** Instantly clean everything (debug helper). */
  cleanAll() {
    this.dirt.fill(0)
    this.soap.fill(0)
    this.cleanCount = this.total
    for (let i = 0; i < this.dirt.length; i++) this.paint(i)
    this.texture.needsUpdate = true
  }

  /** Texel index under a UV, or -1. */
  texelAt(uv: THREE.Vector2): number {
    const x = Math.floor(uv.x * this.w)
    const y = Math.floor(uv.y * this.h)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1
    return y * this.w + x
  }

  /** Hardness of texel `i`, after soap. */
  hardnessAt(i: number): number {
    const t = this.stain[i]
    return HARDNESS[t] + (SOAPED_HARDNESS[t] - HARDNESS[t]) * this.soap[i]
  }

  /**
   * Remove dirt around a UV hit.
   * @param radius brush radius in meters
   * @param amount dirt removed at the brush center (before hardness)
   * @param pressure spray pressure, checked against each texel's hardness
   */
  stamp(uv: THREE.Vector2, radius: number, amount: number, pressure: number) {
    const cx = uv.x * this.w
    const cy = uv.y * this.h
    const r = radius * TEXELS_PER_METER
    const x0 = Math.max(0, Math.floor(cx - r))
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r))
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r))
    const r2 = r * r
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx
        const d2 = dx * dx + dy * dy
        if (d2 > r2) continue
        const i = y * this.w + x
        const before = this.dirt[i]
        if (before <= 0) continue
        const power = cleaningPower(pressure, this.hardnessAt(i))
        if (power <= 0) continue
        const falloff = 1 - Math.sqrt(d2) / r
        const after = Math.max(0, before - amount * power * falloff * falloff)
        this.dirt[i] = after
        if (before >= CLEAN_THRESHOLD && after < CLEAN_THRESHOLD) this.cleanCount++
        this.paint(i)
        this.dirty = true
      }
    }
  }

  /** Lay down soap around a UV hit (only on texels that are still dirty). */
  soapStamp(uv: THREE.Vector2, radius: number, amount: number) {
    const cx = uv.x * this.w
    const cy = uv.y * this.h
    const r = radius * TEXELS_PER_METER
    const x0 = Math.max(0, Math.floor(cx - r))
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r))
    const y0 = Math.max(0, Math.floor(cy - r))
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r))
    const r2 = r * r
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx
        const d2 = dx * dx + dy * dy
        if (d2 > r2) continue
        const i = y * this.w + x
        const before = this.soap[i]
        if (before >= 1 || this.dirt[i] < CLEAN_THRESHOLD) continue
        const falloff = 1 - Math.sqrt(d2) / r
        this.soap[i] = Math.min(1, before + amount * falloff * falloff)
        this.paint(i)
        this.dirty = true
      }
    }
  }

  /** Push pending pixel changes to the GPU. Call once per frame. */
  flush() {
    if (this.dirty) {
      this.texture.needsUpdate = true
      this.dirty = false
    }
  }

  dispose() {
    this.texture.dispose()
  }

  private paint(i: number) {
    // Visible dirt: anything under the clean threshold renders fully clean so
    // "looks clean" and "counts as clean" agree.
    const raw = this.dirt[i]
    const o = i * 4
    if (raw < CLEAN_THRESHOLD) {
      this.pixels[o] = this.cleanRGB[0]
      this.pixels[o + 1] = this.cleanRGB[1]
      this.pixels[o + 2] = this.cleanRGB[2]
      this.pixels[o + 3] = 0
      return
    }
    const d = Math.pow(raw, 0.6)
    const s = i * 3
    let r = this.stainRGB[s]
    let g = this.stainRGB[s + 1]
    let b = this.stainRGB[s + 2]
    const foam = this.soap[i] * 0.65
    if (foam > 0) {
      r += (FOAM[0] - r) * foam
      g += (FOAM[1] - g) * foam
      b += (FOAM[2] - b) * foam
    }
    this.pixels[o] = clamp255(this.cleanRGB[0] + (r - this.cleanRGB[0]) * d)
    this.pixels[o + 1] = clamp255(this.cleanRGB[1] + (g - this.cleanRGB[1]) * d)
    this.pixels[o + 2] = clamp255(this.cleanRGB[2] + (b - this.cleanRGB[2]) * d)
    // Alpha = stain coverage, used by textured wash materials (washMaterial.ts).
    this.pixels[o + 3] = clamp255(d * 255)
  }
}

function clamp255(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v
}
