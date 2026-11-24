/**
 * Stain types and the random layout of stains on a washable surface.
 *
 * Every texel of a surface has one stain type. Each type has a hardness
 * (0..1+) that a nozzle's pressure must beat to clean it at full speed, so
 * different stains reward different tips:
 *
 * | stain        | hardness | best tip                         |
 * | ------------ | -------- | -------------------------------- |
 * | grime        | 0.15     | 40° wide fan (most area)         |
 * | mildew       | 0.25     | 40° wide fan / 25° cone          |
 * | streak       | 0.55     | 15° line, turned along the streak |
 * | stuck-on     | 0.9      | 0° pinpoint                      |
 * | oil          | 1.2      | soap first, then any tip         |
 */

export const STAIN_GRIME = 0
export const STAIN_MILDEW = 1
export const STAIN_STREAK = 2
export const STAIN_TOUGH = 3
export const STAIN_OIL = 4

export type SurfaceKind = 'wall' | 'ground' | 'fence'

export interface StainDef {
  name: string
  hardness: number
  /** Hardness once fully soaped. Same as `hardness` when soap doesn't help. */
  soapedHardness: number
}

export const STAINS: StainDef[] = [
  { name: 'Grime', hardness: 0.15, soapedHardness: 0.1 },
  { name: 'Mildew', hardness: 0.25, soapedHardness: 0.1 },
  { name: 'Streak', hardness: 0.55, soapedHardness: 0.55 },
  { name: 'Stuck-on spot', hardness: 0.9, soapedHardness: 0.9 },
  { name: 'Oil stain', hardness: 1.2, soapedHardness: 0.15 },
]

export const HARDNESS = Float32Array.from(STAINS.map((s) => s.hardness))
export const SOAPED_HARDNESS = Float32Array.from(STAINS.map((s) => s.soapedHardness))

/**
 * How well a spray of `pressure` cleans a stain of `hardness` (0..1).
 * Full speed at or above the hardness, then drops off fast: 0.1 short is
 * about a sixth of the speed, 0.17 short does nothing.
 */
export function cleaningPower(pressure: number, hardness: number): number {
  if (pressure >= hardness) return 1
  const m = 1 - (hardness - pressure) * 6
  return m <= 0 ? 0 : m * m
}

/** What the layout writes into. Coordinates are texels; `tpm` is texels per meter. */
export interface StainCanvas {
  w: number
  h: number
  tpm: number
  stain: Uint8Array
  /** Stain color per texel, RGB 0..255. */
  rgb: Uint8Array
  /** Smooth value noise in 0..1. */
  noise: (x: number, y: number) => number
}

const MILDEW = hex('#4f6a2c')
const RUST = hex('#8a4b1f')
const TIRE = hex('#2a2826')
const WATER_STREAK = hex('#5a4a32')
const OIL = hex('#1f1b17')
const TAR = hex('#151515')
const GUM = hex('#c97a9a')
const PAINT = ['#c0392b', '#2e86c1', '#8e44ad', '#e67e22', '#16a085'].map(hex)

/**
 * Fill the whole canvas with base grime (tinted by `dirt`), then scatter
 * stains appropriate to the surface kind. Deterministic for a given `rand`.
 */
export function layoutStains(c: StainCanvas, kind: SurfaceKind, dirt: [number, number, number], rand: () => number) {
  const { w, h, tpm, noise } = c
  const ox = rand() * 200
  const oy = rand() * 200
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mx = x / tpm + ox
      const my = y / tpm + oy
      let g = 0.5 * noise(mx * 0.8, my * 0.8) + 0.3 * noise(mx * 2.5, my * 2.5) + 0.2 * noise(mx * 7, my * 7)
      g += 0.25 * noise(mx * 6, my * 0.4) // vertical drips
      g = g < 0 ? 0 : g > 1 ? 1 : g
      const s = 0.6 + 0.55 * g
      set(c, y * w + x, STAIN_GRIME, dirt, s)
    }
  }

  const W = w / tpm
  const H = h / tpm
  const between = (a: number, b: number) => a + rand() * (b - a)
  const count = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
  const paint = () => PAINT[Math.floor(rand() * PAINT.length)]

  if (kind === 'wall') {
    for (let i = count(1, 3); i > 0; i--) blob(c, rand, between(0, W), between(0, H * 0.35), between(0.4, 1), STAIN_MILDEW, MILDEW, 0.6)
    for (let i = count(3, 5); i > 0; i--) {
      const top = between(H * 0.55, H * 0.95)
      streak(c, rand, between(0.3, W - 0.3), top, 0, -1, Math.min(top - 0.1, between(0.9, 2.2)), between(0.07, 0.12), true, STAIN_STREAK, RUST)
    }
    for (let i = count(2, 4); i > 0; i--) splatter(c, rand, between(0.4, W - 0.4), between(0.4, H - 0.3), between(0.1, 0.18), STAIN_TOUGH, paint())
  } else if (kind === 'ground') {
    // A pair of tire marks running the length, sometimes two.
    for (let p = count(1, 2); p > 0; p--) {
      const cx = W / 2 + between(-0.25, 0.25)
      const gauge = between(0.7, 0.8)
      const y0 = between(0.2, 1.2)
      const len = between(3, H - y0 - 0.2)
      const curve = between(-0.15, 0.15)
      const width = between(0.12, 0.16)
      streak(c, rand, cx - gauge, y0, curve, 1, len, width, false, STAIN_STREAK, TIRE)
      streak(c, rand, cx + gauge, y0, curve, 1, len, width, false, STAIN_STREAK, TIRE)
    }
    for (let i = count(2, 3); i > 0; i--) blob(c, rand, between(0.6, W - 0.6), between(1, H - 1), between(0.3, 0.5), STAIN_OIL, OIL, 0.5)
    for (let i = count(3, 5); i > 0; i--) splatter(c, rand, between(0.3, W - 0.3), between(0.3, H - 0.3), between(0.08, 0.14), STAIN_TOUGH, rand() < 0.5 ? TAR : GUM)
    blob(c, rand, rand() < 0.5 ? 0.15 : W - 0.15, between(0.5, H - 0.5), between(0.4, 0.7), STAIN_MILDEW, MILDEW, 0.6)
  } else {
    for (let i = count(1, 3); i > 0; i--) blob(c, rand, between(0, W), between(0, H * 0.3), between(0.3, 0.6), STAIN_MILDEW, MILDEW, 0.6)
    for (let i = count(3, 6); i > 0; i--) {
      const top = between(H * 0.7, H)
      streak(c, rand, between(0.2, W - 0.2), top, 0, -1, Math.min(top - 0.05, between(0.5, 1)), between(0.06, 0.1), true, STAIN_STREAK, WATER_STREAK)
    }
    for (let i = count(1, 2); i > 0; i--) splatter(c, rand, between(0.4, W - 0.4), between(0.3, H - 0.3), between(0.1, 0.16), STAIN_TOUGH, paint())
  }
}

/** Irregular round patch (mildew, oil). Darker toward the middle. */
function blob(c: StainCanvas, rand: () => number, cxm: number, cym: number, radiusM: number, type: number, rgb: RGB, warp: number) {
  const { w, h, tpm, noise } = c
  const cx = cxm * tpm
  const cy = cym * tpm
  const r = radiusM * tpm
  const nx = rand() * 200
  const ny = rand() * 200
  const ext = r * (1 + warp)
  const x0 = Math.max(0, Math.floor(cx - ext))
  const x1 = Math.min(w - 1, Math.ceil(cx + ext))
  const y0 = Math.max(0, Math.floor(cy - ext))
  const y1 = Math.min(h - 1, Math.ceil(cy + ext))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const n = noise(x / tpm * 3 + nx, y / tpm * 3 + ny)
      const d = Math.sqrt(dx * dx + dy * dy) / r + warp * (n - 0.5)
      if (d >= 1) continue
      set(c, y * w + x, type, rgb, 0.7 + 0.35 * d + 0.2 * (noise(x / tpm * 9 + nx, y / tpm * 9 + ny) - 0.5))
    }
  }
}

/**
 * A line of stain from (xm, ym) heading (dirX, dirY) for `lengthM` meters.
 * `bend` curves it sideways (meters at the end); `taper` thins it out toward
 * the end like a drip.
 */
function streak(
  c: StainCanvas,
  rand: () => number,
  xm: number,
  ym: number,
  bend: number,
  dirY: number,
  lengthM: number,
  widthM: number,
  taper: boolean,
  type: number,
  rgb: RGB,
) {
  const { tpm } = c
  const steps = Math.max(2, Math.ceil(lengthM * tpm * 2))
  const phase = rand() * 6.28
  const freq = 2 + rand() * 3
  const wobble = 0.015 + rand() * 0.02
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const along = t * lengthM
    const side = bend * t * t + Math.sin(phase + along * freq) * wobble
    const half = (widthM / 2) * (taper ? 1 - 0.6 * t : 1)
    disc(c, (xm + side) * tpm, (ym + along * dirY) * tpm, half * tpm, type, rgb, 0.85 + 0.25 * t)
  }
}

/** A main spot with smaller drops flung around it (paint, tar, gum). */
function splatter(c: StainCanvas, rand: () => number, cxm: number, cym: number, radiusM: number, type: number, rgb: RGB) {
  const { tpm } = c
  disc(c, cxm * tpm, cym * tpm, radiusM * tpm, type, rgb, 1)
  for (let i = 5 + Math.floor(rand() * 5); i > 0; i--) {
    const a = rand() * Math.PI * 2
    const d = radiusM + rand() * 0.35
    disc(c, (cxm + Math.cos(a) * d) * tpm, (cym + Math.sin(a) * d) * tpm, (0.025 + rand() * 0.05) * tpm, type, rgb, 1)
  }
}

function disc(c: StainCanvas, cx: number, cy: number, r: number, type: number, rgb: RGB, shade: number) {
  const { w, h } = c
  const rr = Math.max(0.7, r)
  const x0 = Math.max(0, Math.floor(cx - rr))
  const x1 = Math.min(w - 1, Math.ceil(cx + rr))
  const y0 = Math.max(0, Math.floor(cy - rr))
  const y1 = Math.min(h - 1, Math.ceil(cy + rr))
  const r2 = rr * rr
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      if (dx * dx + dy * dy > r2) continue
      set(c, y * w + x, type, rgb, shade)
    }
  }
}

type RGB = [number, number, number]

function set(c: StainCanvas, i: number, type: number, rgb: RGB, shade: number) {
  c.stain[i] = type
  const o = i * 3
  c.rgb[o] = clamp255(rgb[0] * shade)
  c.rgb[o + 1] = clamp255(rgb[1] * shade)
  c.rgb[o + 2] = clamp255(rgb[2] * shade)
}

function hex(s: string): RGB {
  const n = parseInt(s.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function clamp255(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v
}
