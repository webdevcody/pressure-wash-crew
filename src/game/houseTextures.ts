import * as THREE from 'three'

/**
 * Procedural house textures, drawn once into small canvases at startup.
 * Nothing is downloaded and every texture is cached, so all house parts
 * share the same GPU uploads. Sizes are kept small (≤512²) for the
 * 120 FPS budget.
 *
 * Each tileable texture comes with its real-world size (`tile`, meters) so
 * geometry UVs can be laid out in meters / tile and the pattern keeps the
 * same scale on every face.
 */

export interface TileTexture {
  map: THREE.Texture
  /** World size of one repeat, in meters [u, v]. */
  tile: [number, number]
}

const cache = new Map<string, unknown>()
function cached<T>(key: string, make: () => T): T {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key) as T
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  return { c, ctx }
}

function toTexture(c: HTMLCanvasElement, color = true, repeat = true) {
  const t = new THREE.CanvasTexture(c)
  if (color) t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

/** Per-pixel brightness jitter: grit, granules, wood fibre. Seamless by construction. */
function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number) {
  const r = rng(seed)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const k = 1 + (r() - 0.5) * amount
    d[i] = Math.min(255, d[i] * k)
    d[i + 1] = Math.min(255, d[i + 1] * k)
    d[i + 2] = Math.min(255, d[i + 2] * k)
  }
  ctx.putImageData(img, 0, 0)
}

function hsl(h: number, s: number, l: number) {
  return `hsl(${h}, ${s}%, ${l}%)`
}

// ---------------------------------------------------------------------------
// Lap siding: horizontal painted boards, 20 cm exposure, 1.6 m tile.

const SIDING_PX = 512
const SIDING_BOARDS = 8
const SIDING_TILE = 1.6

export function sidingTexture(): TileTexture {
  return cached('siding', () => {
    const S = SIDING_PX
    const bh = S / SIDING_BOARDS
    const { c, ctx } = canvas(S, S)
    const r = rng(7)
    for (let b = 0; b < SIDING_BOARDS; b++) {
      const y0 = b * bh
      const l = 80 + r() * 3
      ctx.fillStyle = hsl(200, 20, l)
      ctx.fillRect(0, y0, S, bh)
      // Faint brushed grain along the board.
      for (let g = 0; g < 14; g++) {
        ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '40,50,60'}, ${0.03 + r() * 0.04})`
        ctx.fillRect(0, y0 + r() * bh, S, 1 + r() * 2)
      }
      // Top of the board sits in the shadow of the board above.
      const grad = ctx.createLinearGradient(0, y0, 0, y0 + bh * 0.35)
      grad.addColorStop(0, 'rgba(20,30,40,0.35)')
      grad.addColorStop(1, 'rgba(20,30,40,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, y0, S, bh * 0.35)
      // Bottom lip catches the light...
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(0, y0 + bh - 5, S, 2)
      // ...and casts a hard shadow line onto the next board.
      ctx.fillStyle = 'rgba(15,22,30,0.55)'
      ctx.fillRect(0, y0 + bh - 3, S, 3)
      // Butt joints between board lengths (wrap horizontally).
      const joints = 1 + Math.floor(r() * 2)
      for (let j = 0; j < joints; j++) {
        const x = Math.floor(r() * S)
        for (const xx of [x, x - S]) {
          ctx.fillStyle = 'rgba(15,22,30,0.45)'
          ctx.fillRect(xx, y0, 2, bh - 3)
          ctx.fillStyle = 'rgba(255,255,255,0.25)'
          ctx.fillRect(xx + 2, y0, 1, bh - 3)
        }
      }
    }
    speckle(ctx, S, S, 0.06, 3)
    return { map: toTexture(c), tile: [SIDING_TILE, SIDING_TILE] }
  })
}

/**
 * Siding relief as a tiny normal map: the profile only varies with height,
 * so a 4 px wide strip repeats across the whole wall for free.
 */
export function sidingNormal(): THREE.Texture {
  return cached('siding-normal', () => {
    const H = SIDING_PX
    const W = 4
    const bh = H / SIDING_BOARDS
    const { c, ctx } = canvas(W, H)
    const img = ctx.createImageData(W, H)
    for (let y = 0; y < H; y++) {
      const t = (y % bh) / bh // 0 at board top, 1 at its bottom lip
      // Board face tilts up (thicker at the bottom); the lip underside faces down.
      let ny = t > 0.95 ? -0.75 : 0.22
      if (t < 0.04) ny = 0.5
      const nz = Math.sqrt(1 - ny * ny)
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4
        img.data[o] = 128
        img.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255)
        img.data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255)
        img.data[o + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const t = toTexture(c, false)
    t.colorSpace = THREE.NoColorSpace
    t.minFilter = THREE.LinearMipmapLinearFilter
    return t
  })
}

// ---------------------------------------------------------------------------
// Asphalt 3-tab shingles: 14 rows over a 2 m tile.

export function shingleTexture(): TileTexture {
  return cached('shingles', () => {
    const S = 512
    const rows = 14
    const tabs = 6
    const rh = S / rows
    const tw = S / tabs
    const { c, ctx } = canvas(S, S)
    const r = rng(19)
    ctx.fillStyle = '#2b2a2a'
    ctx.fillRect(0, 0, S, S)
    for (let row = 0; row < rows; row++) {
      const y0 = row * rh
      const offset = (row % 2) * tw * 0.5 + (row % 3) * 9
      for (let t = -1; t <= tabs; t++) {
        const x0 = t * tw + offset
        const l = 22 + r() * 12
        const hue = 15 + r() * 20
        ctx.fillStyle = hsl(hue, 8 + r() * 8, l)
        for (const xx of [x0, x0 - S, x0 + S]) ctx.fillRect(xx + 1.5, y0, tw - 3, rh)
      }
      // Shadow under the course above, highlight on the exposed bottom edge.
      const g = ctx.createLinearGradient(0, y0, 0, y0 + rh * 0.4)
      g.addColorStop(0, 'rgba(0,0,0,0.45)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, y0, S, rh * 0.4)
      ctx.fillStyle = 'rgba(255,240,220,0.10)'
      ctx.fillRect(0, y0 + rh - 3, S, 1.5)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, y0 + rh - 1.5, S, 1.5)
    }
    // Sparse moss / weathering blotches.
    for (let i = 0; i < 40; i++) {
      const x = r() * S
      const y = r() * S
      const rad = 4 + r() * 14
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
      g.addColorStop(0, `rgba(${r() < 0.5 ? '70,80,50' : '15,15,15'},0.22)`)
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
    }
    speckle(ctx, S, S, 0.45, 5)
    return { map: toTexture(c), tile: [2, 2] }
  })
}

// ---------------------------------------------------------------------------
// Running-bond brick for the chimney: 4 bricks × 12 courses.

export function brickTexture(): TileTexture {
  return cached('brick', () => {
    const W = 256
    const H = 256
    const cols = 4
    const courses = 12
    const bw = W / cols
    const ch = H / courses
    const { c, ctx } = canvas(W, H)
    const r = rng(29)
    ctx.fillStyle = '#b9b1a3' // mortar
    ctx.fillRect(0, 0, W, H)
    for (let row = 0; row < courses; row++) {
      const off = (row % 2) * bw * 0.5
      for (let col = -1; col <= cols; col++) {
        const x = col * bw + off
        ctx.fillStyle = hsl(8 + r() * 14, 40 + r() * 15, 28 + r() * 12)
        for (const xx of [x, x - W, x + W]) ctx.fillRect(xx + 1.5, row * ch + 1.5, bw - 3, ch - 3)
      }
    }
    speckle(ctx, W, H, 0.3, 9)
    return { map: toTexture(c), tile: [0.86, 0.9] }
  })
}

// ---------------------------------------------------------------------------
// Single-image (non-repeating) textures.

/** Six-panel front door. */
export function doorTexture(): THREE.Texture {
  return cached('door', () => {
    const W = 256
    const H = 512
    const { c, ctx } = canvas(W, H)
    ctx.fillStyle = '#7d2323'
    ctx.fillRect(0, 0, W, H)
    const r = rng(41)
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '255,200,190' : '30,0,0'},${0.03 + r() * 0.04})`
      ctx.fillRect(r() * W, 0, 1 + r() * 2, H)
    }
    const m = 26
    const pw = (W - m * 3) / 2
    const heights = [0.3, 0.17, 0.33]
    let y = m
    for (const fh of heights) {
      const ph = fh * (H - m * 4)
      for (let col = 0; col < 2; col++) {
        const x = m + col * (pw + m)
        // Raised panel: bright top/left bevel, dark bottom/right.
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(x, y, pw, ph)
        ctx.fillStyle = 'rgba(255,220,210,0.18)'
        ctx.fillRect(x, y, pw, 5)
        ctx.fillRect(x, y, 5, ph)
        ctx.fillStyle = '#862828'
        ctx.fillRect(x + 9, y + 9, pw - 18, ph - 18)
        ctx.fillStyle = 'rgba(0,0,0,0.25)'
        ctx.fillRect(x + 9, y + ph - 13, pw - 18, 4)
        ctx.fillRect(x + pw - 13, y + 9, 4, ph - 18)
      }
      y += ph + m
    }
    speckle(ctx, W, H, 0.05, 2)
    return toTexture(c, true, false)
  })
}

/** Window glass: sky reflection, a couple of glints, curtains behind. */
export function glassTexture(): THREE.Texture {
  return cached('glass', () => {
    const W = 128
    const H = 128
    const { c, ctx } = canvas(W, H)
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#9fc0d8')
    g.addColorStop(0.45, '#4d6a82')
    g.addColorStop(1, '#1d2a36')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    // Curtains on both sides, with folds.
    for (const side of [0, 1]) {
      const cw = 26
      const x0 = side === 0 ? 0 : W - cw
      ctx.fillStyle = 'rgba(232,222,200,0.55)'
      ctx.fillRect(x0, 0, cw, H)
      for (let f = 0; f < 5; f++) {
        ctx.fillStyle = 'rgba(120,100,80,0.22)'
        ctx.fillRect(x0 + 3 + f * 5, 0, 2, H)
      }
    }
    // Diagonal glints.
    ctx.save()
    ctx.translate(W / 2, H / 2)
    ctx.rotate(-0.6)
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(-W, -30, W * 2, 14)
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(-W, -8, W * 2, 6)
    ctx.restore()
    return toTexture(c, true, false)
  })
}

/** Louvered shutter, painted navy. */
export function shutterTexture(): THREE.Texture {
  return cached('shutter', () => {
    const W = 64
    const H = 256
    const { c, ctx } = canvas(W, H)
    ctx.fillStyle = '#26354d'
    ctx.fillRect(0, 0, W, H)
    const m = 6
    const slats = 22
    const sh = (H - m * 2) / slats
    for (let i = 0; i < slats; i++) {
      const y = m + i * sh
      const g = ctx.createLinearGradient(0, y, 0, y + sh)
      g.addColorStop(0, 'rgba(255,255,255,0.18)')
      g.addColorStop(0.75, 'rgba(0,0,0,0.05)')
      g.addColorStop(1, 'rgba(0,0,0,0.5)')
      ctx.fillStyle = g
      ctx.fillRect(m, y, W - m * 2, sh)
    }
    // Stiles and middle rail.
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(0, 0, m, H)
    ctx.fillRect(0, 0, W, m)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(W - m, 0, m, H)
    ctx.fillRect(0, H - m, W, m)
    speckle(ctx, W, H, 0.06, 4)
    return toTexture(c, true, false)
  })
}
