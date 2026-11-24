import * as THREE from 'three'
import { CityBuilder, type WindowStyle } from './builder'

/**
 * The city is a grid of square blocks centered on the yard. Our yard is the
 * block at (0, 0): its lot is bounded by the perimeter walls (outer face at
 * ±15.2 m), then a sidewalk, then half a street. Neighbors are suburban houses,
 * then mid-rise apartments, then towers that cluster into a downtown skyline
 * behind the house (-z) and a smaller one to the south-east.
 */
export const BLOCK_PITCH = 44
export const LOT_HALF = 15.2
export const SIDEWALK_HALF = 17.5
/** Blocks in each direction from the yard. */
export const CITY_RINGS = 5

const HOUSE: WindowStyle = { bay: 3, floor: 3, w: 0.36, h: 0.42 }
const APARTMENT: WindowStyle = { bay: 2.6, floor: 3.1, w: 0.5, h: 0.48 }
const OFFICE: WindowStyle = { bay: 1.8, floor: 3.6, w: 0.86, h: 0.7 }

const SIDING = ['#e9e2d0', '#cfd8dc', '#d7c4a3', '#b7c9b0', '#e3d3c3', '#c9b8a6', '#f1ede4', '#a9bfcf', '#d9c9a8']
const ROOF = ['#4a4e55', '#5b3f35', '#6b6f73', '#3f4a52', '#7a4b3a', '#565656']
const MIDRISE = ['#9c5b45', '#a8705a', '#b79b7f', '#c8c0b2', '#8f8a84', '#d6cdbd', '#7d8a94', '#b5a48d', '#a3624e']
const TOWER = ['#8fa3b5', '#6f8799', '#a7b4bd', '#5d7184', '#9aa9a2', '#c2c8cc', '#7c8e9e', '#b3bec6']
const CAR = ['#c9ccd0', '#2b2d31', '#8b1e22', '#1f3d6b', '#e8e8e6', '#5c6b73', '#304a36', '#b8a07a', '#7a7f85']
const LEAF = ['#4f7a3a', '#5d8a44', '#3f6b35', '#6a9150', '#557f3c']

/** Downtown centers: (x, z, radius, height scale). */
const DOWNTOWNS: [number, number, number, number][] = [
  [-60, -240, 85, 1],
  [200, 170, 70, 0.6],
]

export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)]

function towerFactor(x: number, z: number) {
  let f = 0
  for (const [dx, dz, rad, s] of DOWNTOWNS) f = Math.max(f, s * Math.exp(-Math.hypot(x - dx, z - dz) / rad))
  return f
}

/** Chunk bin along one axis: the 3x3 blocks around the yard, then 4-block bands. */
const chunkBin = (i: number) => (i < -1 ? -1 : i > 1 ? 1 : 0)

/**
 * Builds the static backdrop as 9 merged geometries (3x3 chunks of blocks) so
 * three's frustum culling can skip the chunks behind the camera.
 */
export function buildCity(): { geometry: THREE.BufferGeometry; center: THREE.Vector3 }[] {
  const chunks = new Map<number, CityBuilder>()
  let b!: CityBuilder
  const r = rng(1234)

  const canopy = new THREE.IcosahedronGeometry(1, 1)
  const canopyMid = new THREE.DodecahedronGeometry(1, 0)
  const canopyLow = new THREE.IcosahedronGeometry(1, 0)
  const trunk = new THREE.CylinderGeometry(0.14, 0.2, 1, 5, 1, true)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()

  const tree = (x: number, z: number, scale = 1, detail: 0 | 1 | 2 = 2) => {
    const h = (2.6 + r() * 1.2) * scale
    m.compose(p.set(x, h / 2, z), q.identity(), s.set(scale, h, scale))
    b.mesh(trunk, m, '#5a4332')
    const rad = (1.4 + r() * 0.7) * scale
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r() * Math.PI)
    m.compose(p.set(x, h + rad * 0.75, z), q, s.set(rad, rad * (1.05 + r() * 0.3), rad))
    b.mesh(detail === 2 ? canopy : detail === 1 ? canopyMid : canopyLow, m, pick(r, LEAF))
  }

  const car = (x: number, z: number, rotY: number) => {
    const color = pick(r, CAR)
    const cos = Math.cos(rotY)
    const sin = Math.sin(rotY)
    const at = (lx: number, lz: number): [number, number] => [x + lx * cos + lz * sin, z - lx * sin + lz * cos]
    for (const [wx, wz] of [
      [-1.35, 0.78],
      [1.35, 0.78],
      [-1.35, -0.78],
      [1.35, -0.78],
    ]) {
      const [ax, az] = at(wx, wz)
      b.box(ax, 0, az, 0.66, 0.62, 0.24, '#1c1c1c', rotY)
    }
    b.box(x, 0.28, z, 4.3, 0.72, 1.78, color, rotY)
    const [cx, cz] = at(-0.2, 0)
    b.box(cx, 1.0, cz, 2.3, 0.55, 1.6, '#262c33', rotY)
    b.box(cx, 1.55, cz, 2.1, 0.06, 1.5, color, rotY)
  }

  const lamp = (x: number, z: number, rotY: number) => {
    b.box(x, 0, z, 0.16, 6.2, 0.16, '#4d5257', rotY)
    const cos = Math.cos(rotY)
    const sin = Math.sin(rotY)
    b.box(x + 0.75 * cos, 6.0, z - 0.75 * sin, 1.5, 0.12, 0.12, '#4d5257', rotY)
    b.box(x + 1.4 * cos, 5.85, z - 1.4 * sin, 0.6, 0.18, 0.3, '#d9d6c8', rotY)
  }

  for (let i = -CITY_RINGS; i <= CITY_RINGS; i++) {
    for (let j = -CITY_RINGS; j <= CITY_RINGS; j++) {
      const ring = Math.max(Math.abs(i), Math.abs(j))
      const key = chunkBin(i) * 3 + chunkBin(j)
      if (!chunks.has(key)) chunks.set(key, new CityBuilder())
      b = chunks.get(key)!
      const cx = i * BLOCK_PITCH
      const cz = j * BLOCK_PITCH

      // ---- street trees, lamps and parked cars on the nearest blocks ----
      if (ring <= 2) {
        for (const [nx, nz] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ]) {
          const rot = Math.atan2(nx, nz) // local +z points at the street
          const along = (t: number, off: number): [number, number] => [
            cx + nx * off + (nz !== 0 ? t : 0),
            cz + nz * off + (nx !== 0 ? t : 0),
          ]
          for (let t = -12; t <= 12; t += 8) {
            if (r() < (ring === 2 ? 0.5 : 0.8)) {
              const [x, z] = along(t + (r() - 0.5) * 2, 16.7)
              tree(x, z, ring === 0 ? 0.85 : 0.85 + r() * 0.3, ring === 0 ? 2 : ring === 1 ? 1 : 0)
            }
          }
          if (ring <= 1) {
            const [lx, lz] = along(0, 17.1)
            lamp(lx, lz, rot - Math.PI / 2)
            for (let t = -12; t <= 12; t += 6) {
              if (r() < 0.55) {
                const [x, z] = along(t + (r() - 0.5) * 1.2, 18.6)
                car(x, z, rot + (r() < 0.5 ? 0 : Math.PI))
              }
            }
          }
        }
      }

      if (ring === 0) continue // our yard

      if (ring === 1) {
        // ---- suburban block: four houses facing their nearest street ----
        for (const [qx, qz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ]) {
          const hx = cx + qx * 7.4
          const hz = cz + qz * 7.6
          // Face the street on the z side unless this block sits beside us in x.
          const faceZ = j !== 0
          const rot = faceZ ? (qz > 0 ? 0 : Math.PI) : qx > 0 ? Math.PI / 2 : -Math.PI / 2
          const w = 9 + r() * 3
          const d = 7.5 + r() * 2
          const floors = r() < 0.7 ? 2 : 1
          const wall = pick(r, SIDING)
          const bh = floors * 3
          const ox = (r() - 0.5) * 1.5
          b.box(hx + (faceZ ? ox : 0), 0, hz + (faceZ ? 0 : ox), w, bh, d, wall, rot, HOUSE, Math.floor(r() * 100))
          b.gable(hx + (faceZ ? ox : 0), bh, hz + (faceZ ? 0 : ox), w + 0.8, d + 0.8, 2 + r() * 1.2, pick(r, ROOF), wall, rot)
          if (r() < 0.6) {
            // Chimney
            const lx = w * 0.3 * (r() < 0.5 ? 1 : -1)
            b.box(hx + lx * Math.cos(rot), bh, hz - lx * Math.sin(rot), 0.7, 2.6, 0.7, '#8a5a48', rot)
          }
          // Backyard tree, between the house and the block's center fence
          if (r() < 0.8) {
            const t = (r() - 0.5) * 6
            if (faceZ) tree(hx + t, cz + qz * 1.6, 0.75 + r() * 0.3, 1)
            else tree(cx + qx * 1.6, hz + t, 0.75 + r() * 0.3, 1)
          }
        }
        // Low fences on the lot lines
        b.box(cx, 0, cz, 0.08, 1.3, 2 * LOT_HALF - 0.4, '#bfa884')
        b.box(cx, 0, cz, 2 * LOT_HALF - 0.4, 1.3, 0.08, '#bfa884')
        continue
      }

      // ---- paved block for anything denser than houses ----
      b.box(cx, 0, cz, 2 * LOT_HALF, 0.04, 2 * LOT_HALF, '#a8a49b')

      const tf = towerFactor(cx, cz)
      if (ring >= 3 && tf > 0.22 + r() * 0.2) {
        // ---- towers ----
        const count = r() < 0.5 ? 1 : 2
        for (let k = 0; k < count; k++) {
          const w = count === 1 ? 14 + r() * 10 : 11 + r() * 3
          const d = 12 + r() * 10
          const ox = count === 1 ? (r() - 0.5) * 6 : (k === 0 ? -1 : 1) * 7.5
          const oz = (r() - 0.5) * (count === 1 ? 6 : 12)
          const floors = Math.round(10 + tf * (22 + r() * 26))
          const h = floors * OFFICE.floor
          const color = pick(r, TOWER)
          const seed = Math.floor(r() * 100)
          b.box(cx + ox, 0, cz + oz, w, h, d, color, 0, OFFICE, seed)
          if (r() < 0.6) {
            // Setback crown
            const h2 = (4 + Math.floor(r() * 10)) * OFFICE.floor
            b.box(cx + ox, h, cz + oz, w * 0.7, h2, d * 0.7, color, 0, OFFICE, seed + 1)
            if (r() < 0.5) b.box(cx + ox, h + h2, cz + oz, 0.4, 8 + r() * 10, 0.4, '#9aa0a6')
          } else {
            b.box(cx + ox, h, cz + oz, w * 0.5, 2.5, d * 0.4, '#8d9196')
          }
        }
        continue
      }

      // ---- mid-rise apartments ----
      const maxFloors = ring === 2 ? 6 : 10
      const layout = r()
      const lots: [number, number, number, number][] =
        layout < 0.35
          ? [[0, 0, 26 + r() * 3, 26 + r() * 3]]
          : layout < 0.7
            ? [
                [0, -7.5, 28, 12],
                [0, 7.5, 28, 12],
              ]
            : [
                [-7.5, -7.5, 12, 12],
                [7.5, -7.5, 12, 12],
                [-7.5, 7.5, 12, 12],
                [7.5, 7.5, 12, 12],
              ]
      const swap = r() < 0.5
      for (const [lx, lz, w, d] of lots) {
        const floors = 3 + Math.floor(r() * (maxFloors - 2) * (0.6 + tf))
        const h = floors * APARTMENT.floor
        const color = pick(r, MIDRISE)
        const [x, z, bw, bd] = swap ? [lz, lx, d, w] : [lx, lz, w, d]
        b.box(cx + x, 0, cz + z, bw, h, bd, color, 0, APARTMENT, Math.floor(r() * 100))
        // Parapet + rooftop unit
        b.box(cx + x, h, cz + z, bw + 0.3, 0.6, bd + 0.3, color)
        b.box(cx + x + (r() - 0.5) * bw * 0.4, h, cz + z + (r() - 0.5) * bd * 0.4, 3, 2.2, 3, '#8b8f93')
      }
    }
  }

  canopy.dispose()
  canopyMid.dispose()
  canopyLow.dispose()
  trunk.dispose()
  return [...chunks.values()].map((c) => {
    // Re-center each chunk on its (x, z) middle so three's front-to-back sort
    // draws near chunks first and far ones get rejected by the depth test.
    const g = c.build()
    const center = g.boundingSphere!.center.clone().setY(0)
    g.translate(-center.x, 0, -center.z)
    return { geometry: g, center }
  })
}

/**
 * City ground: a big square with a hole where the yard is, so the yard's own
 * ground never has the city ground drawn underneath it (no overdraw). UVs are
 * in block units, centered so each texture tile is one block.
 */
export function buildGround(half: number, hole: number): THREE.BufferGeometry {
  const pos: number[] = []
  const rect = (x0: number, z0: number, x1: number, z1: number) => {
    // two triangles facing +y
    pos.push(x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0)
  }
  rect(-half, -half, half, -hole) // north (−z)
  rect(-half, hole, half, half) // south (+z)
  rect(-half, -hole, -hole, hole) // west
  rect(hole, -hole, half, hole) // east
  const uv: number[] = []
  const nrm: number[] = []
  for (let i = 0; i < pos.length; i += 3) {
    uv.push(pos[i] / BLOCK_PITCH + 0.5, -pos[i + 2] / BLOCK_PITCH + 0.5)
    nrm.push(0, 1, 0)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeBoundingSphere()
  return g
}
