/** Small seeded PRNG (mulberry32): returns floats in [0, 1). */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth 2D value noise in 0..1, tiling every 256 units. */
export function makeValueNoise(rand: () => number) {
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
