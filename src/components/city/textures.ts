import * as THREE from 'three'
import { BLOCK_PITCH, LOT_HALF, SIDEWALK_HALF } from './layout'

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

/** Adds per-pixel brightness noise to a region (cheap grain so flat colors read as materials). */
function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount: number, seed: number) {
  const img = ctx.getImageData(x, y, w, h)
  const d = img.data
  const r = rng(seed)
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, x, y)
}

/**
 * One city block tile, centered on the block, edges at street centerlines:
 * lawn lot, sidewalk with joints and curb, asphalt, dashed center lines and
 * crosswalks. Tiled across the whole city ground plane.
 */
export function makeGroundTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const S = 1024
  const m = S / BLOCK_PITCH // px per meter
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  const mid = S / 2
  const px = (meters: number) => meters * m

  // Asphalt everywhere, then the block on top.
  ctx.fillStyle = '#45474a'
  ctx.fillRect(0, 0, S, S)
  // Darker tire tracks / patches
  const r = rng(7)
  ctx.globalAlpha = 0.08
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = r() < 0.5 ? '#2c2d2f' : '#5a5c5e'
    const w = 4 + r() * 30
    ctx.fillRect(r() * S, r() * S, w, w * (0.3 + r()))
  }
  ctx.globalAlpha = 1
  grain(ctx, 0, 0, S, S, 22, 1)

  // Sidewalk + curb
  const sw = px(SIDEWALK_HALF)
  ctx.fillStyle = '#c9c5bb'
  ctx.fillRect(mid - sw, mid - sw, sw * 2, sw * 2)
  // Curb edge
  ctx.strokeStyle = '#e2ded5'
  ctx.lineWidth = px(0.25)
  ctx.strokeRect(mid - sw + px(0.12), mid - sw + px(0.12), sw * 2 - px(0.24), sw * 2 - px(0.24))
  // Lawn
  const lot = px(LOT_HALF)
  ctx.fillStyle = '#66843f'
  ctx.fillRect(mid - lot, mid - lot, lot * 2, lot * 2)
  ctx.globalAlpha = 0.18
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = r() < 0.5 ? '#557335' : '#7c9a52'
    const w = 2 + r() * 10
    ctx.beginPath()
    ctx.arc(mid - lot + r() * lot * 2, mid - lot + r() * lot * 2, w, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  grain(ctx, Math.floor(mid - sw), Math.floor(mid - sw), Math.ceil(sw * 2), Math.ceil(sw * 2), 16, 2)

  // Sidewalk expansion joints every 1.5 m
  ctx.strokeStyle = 'rgba(90,86,78,0.45)'
  ctx.lineWidth = 1.2
  for (let t = -SIDEWALK_HALF; t <= SIDEWALK_HALF; t += 1.5) {
    const p = mid + px(t)
    for (const [a, b] of [
      [mid - sw, mid - lot],
      [mid + lot, mid + sw],
    ]) {
      ctx.beginPath()
      ctx.moveTo(p, a)
      ctx.lineTo(p, b)
      ctx.moveTo(a, p)
      ctx.lineTo(b, p)
      ctx.stroke()
    }
  }

  // Dashed yellow center lines on the tile edges (street centers), stopping
  // short of the intersections. Each tile draws half the line width.
  const roadHalf = BLOCK_PITCH / 2 - SIDEWALK_HALF
  ctx.fillStyle = '#d8b440'
  const lw = px(0.08)
  const dash = px(3)
  const gap = px(3)
  for (let p = px(roadHalf + 4); p + dash < S - px(roadHalf + 4); p += dash + gap) {
    ctx.fillRect(p, 0, dash, lw)
    ctx.fillRect(p, S - lw, dash, lw)
    ctx.fillRect(0, p, lw, dash)
    ctx.fillRect(S - lw, p, lw, dash)
  }

  // Crosswalks where each street enters the intersection, in line with the
  // sidewalks, plus a stop line behind each.
  ctx.fillStyle = '#e8e6df'
  const cwDepth = px(3)
  const stripe = px(0.5)
  const cwOff = mid + sw - cwDepth // ends at the cross street's curb line
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      // Crosswalk across the vertical street, at the block corner
      const cornerX = sx > 0 ? S - px(roadHalf) : 0
      const y0 = sy > 0 ? cwOff : S - cwOff - cwDepth
      for (let x = cornerX + stripe * 0.5; x < cornerX + px(roadHalf) - stripe * 0.5; x += stripe * 2) {
        ctx.fillRect(x, y0, stripe, cwDepth)
      }
      ctx.fillRect(cornerX, sy > 0 ? y0 - px(1) : y0 + cwDepth + px(0.6), px(roadHalf), px(0.4))
      // and across the horizontal street
      const cornerY = sy > 0 ? S - px(roadHalf) : 0
      const x0 = sx > 0 ? cwOff : S - cwOff - cwDepth
      for (let y = cornerY + stripe * 0.5; y < cornerY + px(roadHalf) - stripe * 0.5; y += stripe * 2) {
        ctx.fillRect(x0, y, cwDepth, stripe)
      }
      ctx.fillRect(sx > 0 ? x0 - px(1) : x0 + cwDepth + px(0.6), cornerY, px(0.4), px(roadHalf))
    }
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = Math.min(8, maxAnisotropy)
  return tex
}

/**
 * A 360° strip of distant building silhouettes for the horizon ring, already
 * blended toward the fog color so it reads as far away. Transparent above the
 * rooftops (alpha-tested).
 */
export function makeSkylineTexture(fogColor: string): THREE.CanvasTexture {
  const W = 2048
  const H = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  const r = rng(99)
  const fog = new THREE.Color(fogColor)
  const tone = (hex: string, t: number) => '#' + new THREE.Color(hex).lerp(fog, t).getHexString()

  // Two layers: a paler far layer, then a slightly darker nearer one.
  const layers = [
    { haze: 0.72, minH: 0.15, maxH: 0.75, cols: ['#7d8c9b', '#8a97a3', '#728395'] },
    { haze: 0.58, minH: 0.08, maxH: 0.5, cols: ['#6f7f8f', '#7b8794', '#667789'] },
  ]
  for (const L of layers) {
    let x = 0
    while (x < W) {
      const w = 10 + r() * 46
      // Taller clusters in a few places around the ring
      const cluster = 0.5 + 0.5 * Math.sin((x / W) * Math.PI * 6 + 1.3) * Math.sin((x / W) * Math.PI * 2 + 0.4)
      const h = H * (L.minH + (L.maxH - L.minH) * Math.pow(r(), 1.6) * (0.35 + 0.65 * cluster))
      ctx.fillStyle = tone(L.cols[Math.floor(r() * L.cols.length)], L.haze)
      ctx.fillRect(Math.floor(x), H - h, Math.ceil(w), h)
      if (r() < 0.12) ctx.fillRect(Math.floor(x + w / 2 - 1), H - h - 14 - r() * 18, 2, 30) // antenna
      if (r() < 0.25) ctx.fillRect(Math.floor(x + w * 0.2), H - h - 6, Math.ceil(w * 0.6), 6) // setback
      x += w + (r() < 0.2 ? r() * 12 : 0)
    }
  }
  // Fade the base into the fog so the ring meets the ground haze.
  const [fr, fg, fb] = [1, 3, 5].map((i) => parseInt(fogColor.slice(i, i + 2), 16))
  const g = ctx.createLinearGradient(0, H * 0.55, 0, H)
  g.addColorStop(0, `rgba(${fr},${fg},${fb},0)`)
  g.addColorStop(1, `rgba(${fr},${fg},${fb},0.9)`)
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'source-over'

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  return tex
}
