/**
 * Holes in a washable surface: rectangles covered by something solid
 * (window trim, a door) that the spray can't reach. Their texels are never
 * dirty and don't count toward the surface's total.
 */
export type HoleRect = [x0: number, y0: number, x1: number, y1: number]

export interface HoleMask {
  /** 1 where a texel lies under a hole; null when the surface has none. */
  mask: Uint8Array | null
  count: number
}

/** Rasterize hole rectangles (meters from the bottom-left) onto a w×h texel grid. */
export function buildHoleMask(holes: HoleRect[] | undefined, w: number, h: number, tpm: number): HoleMask {
  if (!holes?.length) return { mask: null, count: 0 }
  const mask = new Uint8Array(w * h)
  for (const [x0, y0, x1, y1] of holes) {
    const tx0 = Math.max(0, Math.ceil(x0 * tpm - 0.5))
    const tx1 = Math.min(w - 1, Math.floor(x1 * tpm - 0.5))
    const ty0 = Math.max(0, Math.ceil(y0 * tpm - 0.5))
    const ty1 = Math.min(h - 1, Math.floor(y1 * tpm - 0.5))
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) mask[y * w + x] = 1
  }
  let count = 0
  for (let i = 0; i < mask.length; i++) count += mask[i]
  return { mask, count }
}

/** Zero the dirt under every hole. */
export function clearHoles(holes: HoleMask, dirt: Float32Array) {
  const m = holes.mask
  if (m) for (let i = 0; i < m.length; i++) if (m[i]) dirt[i] = 0
}
