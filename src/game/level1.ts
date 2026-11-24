import type { SurfaceDef } from './washSurface'
import type { BlockMaterialId } from '../components/yard/yardMaterials'

const H = Math.PI / 2

/** Gray-box blockers: solid boxes with colliders. Not washable. */
export interface BlockDef {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  /** Textured yard material; boxes without one stay flat `color`. */
  material?: BlockMaterialId
}

/** Half-size of the yard inside the perimeter walls' outer faces. */
export const YARD_HALF = 15.2

export const SPAWN: [number, number, number] = [0, 1, 7]

export const blocks: BlockDef[] = [
  // The house is built by components/House.tsx from HOUSE below.
  // Garden fence (west)
  { position: [-7, 0.6, 2], size: [0.2, 1.2, 8], color: '#a9a9a9', material: 'wood' },
  // Fence posts on the back (west) side
  { position: [-7.16, 0.67, -2.04], size: [0.12, 1.34, 0.12], color: '#8a6a48', material: 'wood' },
  { position: [-7.16, 0.67, 2], size: [0.12, 1.34, 0.12], color: '#8a6a48', material: 'wood' },
  { position: [-7.16, 0.67, 6.04], size: [0.12, 1.34, 0.12], color: '#8a6a48', material: 'wood' },
  { position: [-7.15, 0.95, 2], size: [0.1, 0.09, 8], color: '#8a6a48', material: 'wood' },
  { position: [-7.15, 0.25, 2], size: [0.1, 0.09, 8], color: '#8a6a48', material: 'wood' },
  // Crates for cover / scale reference
  { position: [-3, 0.5, 3], size: [1, 1, 1], color: '#9c9c9c', material: 'crate' },
  { position: [-2.2, 0.4, 3.6], size: [0.8, 0.8, 0.8], color: '#a4a4a4', material: 'crate' },
  // Yard boundary: painted block walls with a concrete cap
  { position: [0, 0.75, -15], size: [30, 1.5, 0.4], color: '#7d7d7d', material: 'wall' },
  { position: [0, 0.75, 15], size: [30, 1.5, 0.4], color: '#7d7d7d', material: 'wall' },
  { position: [-15, 0.75, 0], size: [0.4, 1.5, 30], color: '#7d7d7d', material: 'wall' },
  { position: [15, 0.75, 0], size: [0.4, 1.5, 30], color: '#7d7d7d', material: 'wall' },
  { position: [0, 1.54, -15], size: [30.5, 0.08, 0.5], color: '#9a9a9a', material: 'concrete' },
  { position: [0, 1.54, 15], size: [30.5, 0.08, 0.5], color: '#9a9a9a', material: 'concrete' },
  { position: [-15, 1.54, 0], size: [0.5, 0.08, 29.5], color: '#9a9a9a', material: 'concrete' },
  { position: [15, 1.54, 0], size: [0.5, 0.08, 29.5], color: '#9a9a9a', material: 'concrete' },
]

// ---------------------------------------------------------------------------
// House

export type Wall = 'front' | 'east' | 'back' | 'west'

/** Footprint x -4..4, z -9..-3, single storey with a gable roof (ridge runs east-west). */
export const HOUSE = {
  center: [0, -6] as [number, number],
  width: 8, // along x
  depth: 6, // along z
  wallHeight: 3,
  roofRise: 1.8, // wall top to ridge
  eaveOverhang: 0.45, // front/back, horizontal
  rakeOverhang: 0.35, // east/west gable ends
  cornerPost: 0.16,
}

export const WINDOW_TRIM = { casing: 0.09, shutterGap: 0.02, shutterWidth: 0.42, sillDrop: 0.06, sillOverhang: 0.05 }
export const DOOR_TRIM = { casing: 0.12, stepWidth: 1.6, stepDepth: 0.8, stepHeight: 0.14 }

/**
 * Windows and doors, placed on a wall. `u` is the opening's center measured
 * along the wall from its middle, to the right when you face the wall from
 * outside; `y` is the bottom of the opening.
 */
export interface Opening {
  kind: 'window' | 'door'
  wall: Wall
  u: number
  y: number
  w: number
  h: number
}

const win = (wall: Wall, u: number): Opening => ({ kind: 'window', wall, u, y: 0.95, w: 1.1, h: 1.3 })

export const openings: Opening[] = [
  win('front', -2.45),
  { kind: 'door', wall: 'front', u: 0, y: 0, w: 1.0, h: 2.1 },
  win('front', 2.45),
  win('east', -1.4),
  win('east', 1.4),
  win('back', -2),
  win('back', 2),
  win('west', 0),
]

/** Porch lantern beside the front door: center u, bottom y, size. */
export const LANTERN = { wall: 'front' as Wall, u: 0.9, y: 1.72, w: 0.18, h: 0.4 }

/** Wall length (along u) of each wall. */
export function wallLength(wall: Wall) {
  return wall === 'front' || wall === 'back' ? HOUSE.width : HOUSE.depth
}

/** Wall-space rectangles [u0, y0, u1, y1] covered by trim (casings, shutters, posts, step...). */
export function trimFootprints(wall: Wall): [number, number, number, number][] {
  const t = WINDOW_TRIM
  const out: [number, number, number, number][] = []
  for (const o of openings) {
    if (o.wall !== wall) continue
    if (o.kind === 'window') {
      const half = o.w / 2 + t.casing + t.shutterGap + t.shutterWidth
      out.push([o.u - half, o.y - t.casing - t.sillDrop, o.u + half, o.y + o.h + t.casing])
    } else {
      const half = o.w / 2 + DOOR_TRIM.casing
      out.push([o.u - half, 0, o.u + half, o.y + o.h + DOOR_TRIM.casing])
      out.push([o.u - DOOR_TRIM.stepWidth / 2, 0, o.u + DOOR_TRIM.stepWidth / 2, DOOR_TRIM.stepHeight])
    }
  }
  if (LANTERN.wall === wall) {
    out.push([LANTERN.u - LANTERN.w / 2, LANTERN.y, LANTERN.u + LANTERN.w / 2, LANTERN.y + LANTERN.h])
  }
  const half = wallLength(wall) / 2
  const post = HOUSE.cornerPost / 2
  out.push([-half, 0, -half + post, HOUSE.wallHeight], [half - post, 0, half, HOUSE.wallHeight])
  return out
}

/** Holes for a washable surface covering a whole wall, in surface meters from its bottom-left. */
function wallHoles(wall: Wall): [number, number, number, number][] {
  const half = wallLength(wall) / 2
  return trimFootprints(wall).map(([u0, y0, u1, y1]) => [u0 + half, y0, u1 + half, y1])
}

/**
 * A washable face. `look` picks a textured wash material (see
 * src/components/Level.tsx); without one the surface is the flat `clean`
 * color. Textured surfaces use `clean: '#ffffff'`.
 */
export interface LevelSurfaceDef extends SurfaceDef {
  look?: 'concrete' | 'wood' | 'siding'
}

/**
 * Washable faces. Each is a plane sitting 1cm in front of a blocker face
 * (or just above the ground). PlaneGeometry faces +Z before rotation.
 */
export const surfaces: LevelSurfaceDef[] = [
  {
    id: 'house-front',
    name: 'House front',
    width: 8,
    height: 3,
    position: [0, 1.5, -2.99],
    rotation: [0, 0, 0],
    clean: '#ffffff',
    dirt: '#9a8560',
    seed: 11,
    holes: wallHoles('front'),
    look: 'siding',
  },
  {
    id: 'house-east',
    name: 'House side',
    width: 6,
    height: 3,
    position: [4.01, 1.5, -6],
    rotation: [0, H, 0],
    clean: '#ffffff',
    dirt: '#8a9862',
    seed: 23,
    holes: wallHoles('east'),
    look: 'siding',
  },
  {
    id: 'driveway',
    name: 'Driveway',
    width: 3,
    height: 7,
    position: [7, 0.02, 1],
    rotation: [-H, 0, 0],
    clean: '#ffffff',
    look: 'concrete',
    dirt: '#7d766a',
    seed: 37,
  },
  {
    id: 'fence',
    name: 'Fence',
    width: 8,
    height: 1.2,
    position: [-6.89, 0.6, 2],
    rotation: [0, H, 0],
    clean: '#ffffff',
    look: 'wood',
    dirt: '#8c835e',
    seed: 41,
  },
]
