import * as THREE from 'three'

/** Texels per meter of the dirt mask. Higher = crisper edges, more memory. */
export const TEXELS_PER_METER = 32
/** A texel counts as clean once its dirt drops below this. */
const CLEAN_THRESHOLD = 0.12

export interface SurfaceDef {
  id: string
  name: string
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
   * are covered by something solid (window trim, a door...). Their texels are
   * never dirty and don't count toward the total, since the spray can't reach them.
   */
  holes?: [number, number, number, number][]
}

/**
 * A rectangular washable surface. Dirt lives in a CPU-side Float32Array
 * (one value per texel, 1 = filthy, 0 = spotless); the visible color is
 * baked into an RGBA DataTexture so no custom shader is needed. Spraying
 * stamps a soft brush at a UV, which keeps the clean-texel count exact
 * without any GPU readback.
 */
export class WashSurface {
  readonly def: SurfaceDef
  readonly w: number
  readonly h: number
  readonly dirt: Float32Array
  readonly texture: THREE.DataTexture
  private readonly pixels: Uint8Array
  private readonly grime: Float32Array // per-texel noise for color variation
  private readonly cleanRGB: [number, number, number]
  private readonly dirtRGB: [number, number, number]
  /** 1 where a texel lies under a hole and is left out of the count. */
  private readonly excluded: Uint8Array | null
  private readonly excludedCount: number
  cleanCount = 0
  private dirty = false

  constructor(def: SurfaceDef) {
    this.def = def
    this.w = Math.max(4, Math.round(def.width * TEXELS_PER_METER))
    this.h = Math.max(4, Math.round(def.height * TEXELS_PER_METER))
    const n = this.w * this.h
    this.dirt = new Float32Array(n)
    this.grime = new Float32Array(n)
    this.pixels = new Uint8Array(n * 4)
    const c = new THREE.Color(def.clean)
    const d = new THREE.Color(def.dirt)
    this.cleanRGB = [c.r * 255, c.g * 255, c.b * 255]
    this.dirtRGB = [d.r * 255, d.g * 255, d.b * 255]

    let excludedCount = 0
    this.excluded = null
    if (def.holes?.length) {
      const ex = new Uint8Array(n)
      for (const [x0, y0, x1, y1] of def.holes) {
        const tx0 = Math.max(0, Math.ceil(x0 * TEXELS_PER_METER - 0.5))
        const tx1 = Math.min(this.w - 1, Math.floor(x1 * TEXELS_PER_METER - 0.5))
        const ty0 = Math.max(0, Math.ceil(y0 * TEXELS_PER_METER - 0.5))
        const ty1 = Math.min(this.h - 1, Math.floor(y1 * TEXELS_PER_METER - 0.5))
        for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) ex[y * this.w + x] = 1
      }
      for (let i = 0; i < n; i++) excludedCount += ex[i]
      this.excluded = ex
    }
    this.excludedCount = excludedCount

    this.texture = new THREE.DataTexture(this.pixels, this.w, this.h, THREE.RGBAFormat)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.magFilter = THREE.LinearFilter
    this.texture.minFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false

    // Grime pattern: a few octaves of value noise plus streaks running down.
    const rand = mulberry32(def.seed)
    const noise = makeValueNoise(rand)
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const mx = x / TEXELS_PER_METER
        const my = y / TEXELS_PER_METER
        let g = 0.5 * noise(mx * 0.8, my * 0.8) + 0.3 * noise(mx * 2.5, my * 2.5) + 0.2 * noise(mx * 7, my * 7)
        g += 0.25 * noise(mx * 6, my * 0.4) // vertical drips
        this.grime[y * this.w + x] = Math.min(1, Math.max(0, g))
      }
    }
    this.reset()
  }

  /** Texels that count toward progress (holes excluded). */
  get total() {
    return this.w * this.h - this.excludedCount
  }

  get cleanFraction() {
    return this.cleanCount / this.total
  }

  reset() {
    this.dirt.fill(1)
    const ex = this.excluded
    if (ex) for (let i = 0; i < ex.length; i++) if (ex[i]) this.dirt[i] = 0
    this.cleanCount = 0
    for (let i = 0; i < this.dirt.length; i++) this.paint(i)
    this.texture.needsUpdate = true
  }

  /** Instantly clean everything (debug helper). */
  cleanAll() {
    this.dirt.fill(0)
    this.cleanCount = this.total
    for (let i = 0; i < this.dirt.length; i++) this.paint(i)
    this.texture.needsUpdate = true
  }

  /**
   * Remove dirt around a UV hit.
   * @param radius brush radius in meters
   * @param amount dirt removed at the brush center
   */
  stamp(uv: THREE.Vector2, radius: number, amount: number) {
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
        const falloff = 1 - Math.sqrt(d2) / r
        const after = Math.max(0, before - amount * falloff * falloff)
        this.dirt[i] = after
        if (before >= CLEAN_THRESHOLD && after < CLEAN_THRESHOLD) this.cleanCount++
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
    const d = raw < CLEAN_THRESHOLD ? 0 : Math.pow(raw, 0.6)
    const g = this.grime[i]
    const dr = this.dirtRGB[0] * (0.6 + 0.55 * g)
    const dg = this.dirtRGB[1] * (0.6 + 0.55 * g)
    const db = this.dirtRGB[2] * (0.6 + 0.55 * g)
    const o = i * 4
    this.pixels[o] = clamp255(this.cleanRGB[0] + (dr - this.cleanRGB[0]) * d)
    this.pixels[o + 1] = clamp255(this.cleanRGB[1] + (dg - this.cleanRGB[1]) * d)
    this.pixels[o + 2] = clamp255(this.cleanRGB[2] + (db - this.cleanRGB[2]) * d)
    // Alpha = stain coverage, used by textured wash materials (washMaterial.ts).
    this.pixels[o + 3] = clamp255(d * 255)
  }
}

function clamp255(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeValueNoise(rand: () => number) {
  const size = 256
  const table = new Float32Array(size * size)
  for (let i = 0; i < table.length; i++) table[i] = rand()
  const at = (x: number, y: number) => table[(y & (size - 1)) * size + (x & (size - 1))]
  return (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    const a = at(xi, yi)
    const b = at(xi + 1, yi)
    const c = at(xi, yi + 1)
    const d = at(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
}
