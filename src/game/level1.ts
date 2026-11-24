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
  // House
  { position: [0, 2, -6], size: [8, 4, 6], color: '#b9b9b9' },
  // Roof slab
  { position: [0, 4.15, -6], size: [8.6, 0.3, 6.6], color: '#8a8a8a' },
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

/**
 * A washable face. `look` picks a textured wash material (see
 * src/components/Level.tsx); without one the surface is the flat `clean`
 * color. Textured surfaces use `clean: '#ffffff'`.
 */
export interface LevelSurfaceDef extends SurfaceDef {
  look?: 'concrete' | 'wood'
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
    clean: '#e8e4da',
    dirt: '#9a8560',
    seed: 11,
  },
  {
    id: 'house-east',
    name: 'House side',
    width: 6,
    height: 3,
    position: [4.01, 1.5, -6],
    rotation: [0, H, 0],
    clean: '#e8e4da',
    dirt: '#8a9862',
    seed: 23,
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
