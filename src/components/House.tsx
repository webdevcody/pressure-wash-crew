import { useEffect, useMemo } from 'react'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { DOOR_TRIM, HOUSE, LANTERN, WINDOW_TRIM, openings, type Wall } from '../game/level1'
import {
  brickTexture,
  doorTexture,
  glassTexture,
  shingleTexture,
  shutterTexture,
  sidingNormal,
  sidingTexture,
} from '../game/houseTextures'

/**
 * The house: siding walls, gable roof with shingles, fascia, gutters,
 * downspouts, windows with shutters, a front door with step and lantern,
 * and a brick chimney. The two washable walls are separate planes from
 * level1.ts drawn by Level.tsx; this component draws everything else.
 *
 * All parts are merged by material (about 8 draw calls for the whole house)
 * and built once. Solid-color trim is a single vertex-colored mesh.
 */
export function House() {
  const parts = useMemo(buildHouse, [])
  useEffect(() => () => parts.dispose(), [parts])

  const [cx, cz] = HOUSE.center
  const ray = { raycastable: true }
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[HOUSE.width / 2, HOUSE.wallHeight / 2, HOUSE.depth / 2]} position={[cx, HOUSE.wallHeight / 2, cz]} />
        <CuboidCollider
          args={[DOOR_TRIM.stepWidth / 2, DOOR_TRIM.stepHeight / 2, DOOR_TRIM.stepDepth / 2]}
          position={[cx, DOOR_TRIM.stepHeight / 2, cz + HOUSE.depth / 2 + DOOR_TRIM.stepDepth / 2]}
        />
      </RigidBody>
      <mesh geometry={parts.siding} material={parts.mats.siding} castShadow receiveShadow userData={ray} />
      <mesh geometry={parts.shingles} material={parts.mats.shingles} castShadow receiveShadow userData={ray} />
      <mesh geometry={parts.brick} material={parts.mats.brick} castShadow receiveShadow userData={ray} />
      <mesh geometry={parts.trim} material={parts.mats.trim} castShadow receiveShadow />
      <mesh geometry={parts.shutters} material={parts.mats.shutters} castShadow receiveShadow />
      <mesh geometry={parts.door} material={parts.mats.door} receiveShadow userData={ray} />
      <mesh geometry={parts.glass} material={parts.mats.glass} receiveShadow userData={ray} />
    </group>
  )
}

/** Material + texture set for a washable siding wall (used by Level.tsx). */
export function sidingLook() {
  const s = sidingTexture()
  return { map: s.map, normalMap: sidingNormal(), tileMeters: s.tile }
}

// ---------------------------------------------------------------------------
// Geometry

const COLORS = {
  trim: '#f1eee6',
  soffit: '#e4e0d6',
  gutter: '#e9e8e3',
  ridge: '#2f2d2b',
  concrete: '#a7a39b',
  brass: '#b8913a',
  black: '#1c1c1e',
  lamp: '#ffe7a3',
  cap: '#8d8a85',
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** Wall-local frame: x = u (to the right, seen from outside), y = up, z = out of the wall. */
function wallMatrix(wall: Wall) {
  const [cx, cz] = HOUSE.center
  const hw = HOUSE.width / 2
  const hd = HOUSE.depth / 2
  const m = new THREE.Matrix4()
  switch (wall) {
    case 'front':
      return m.makeTranslation(cx, 0, cz + hd)
    case 'back':
      return m.makeRotationY(Math.PI).setPosition(cx, 0, cz - hd)
    case 'east':
      return m.makeRotationY(Math.PI / 2).setPosition(cx + hw, 0, cz)
    case 'west':
      return m.makeRotationY(-Math.PI / 2).setPosition(cx - hw, 0, cz)
  }
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, frame?: THREE.Matrix4) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed()
  g.translate(x, y, z)
  if (frame) g.applyMatrix4(frame)
  return g
}

/** A box spanning from a to b (its length axis), with the given cross-section. */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number) {
  const len = a.distanceTo(b)
  const g = new THREE.BoxGeometry(w, h, len).toNonIndexed()
  const m = new THREE.Matrix4().lookAt(b, a, new THREE.Vector3(0, 1, 0))
  m.setPosition(a.clone().add(b).multiplyScalar(0.5))
  g.applyMatrix4(m)
  return g
}

/** A flat quad a→b→c→d (counter-clockwise seen from the front) with explicit UVs. */
function quad(pts: THREE.Vector3[], uvs: [number, number][]) {
  const order = [0, 1, 2, 0, 2, 3]
  const pos: number[] = []
  const uv: number[] = []
  for (const i of order) {
    pos.push(pts[i].x, pts[i].y, pts[i].z)
    uv.push(uvs[i][0], uvs[i][1])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

function tri(pts: THREE.Vector3[], uvs: [number, number][]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => [p.x, p.y, p.z]), 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2))
  g.computeVertexNormals()
  return g
}

/** Lay out UVs in world meters / tile size, picking the plane by face normal. */
function worldUV(g: THREE.BufferGeometry, tile: [number, number]) {
  const p = g.getAttribute('position')
  const n = g.getAttribute('normal')
  const uv = g.getAttribute('uv')
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const az = Math.abs(n.getZ(i))
    let u: number
    let v: number
    if (ay > ax && ay > az) {
      u = p.getX(i)
      v = p.getZ(i)
    } else if (ax > az) {
      u = -p.getZ(i) * Math.sign(n.getX(i))
      v = p.getY(i)
    } else {
      u = p.getX(i) * Math.sign(n.getZ(i))
      v = p.getY(i)
    }
    uv.setXY(i, u / tile[0], v / tile[1])
  }
  return g
}

function paint(g: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color)
  const arr = new Float32Array(g.getAttribute('position').count * 3)
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] = c.r
    arr[i + 1] = c.g
    arr[i + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

function merge(list: THREE.BufferGeometry[]) {
  const g = mergeGeometries(list, false)
  if (!g) throw new Error('House: geometry merge failed')
  list.forEach((x) => x.dispose())
  g.computeBoundingSphere()
  return g
}

function buildHouse() {
  const { width: W, depth: Dp, wallHeight: H, roofRise: R, eaveOverhang, rakeOverhang } = HOUSE
  const [cx, cz] = HOUSE.center
  const siding = sidingTexture()
  const shingle = shingleTexture()
  const brick = brickTexture()

  const sidingParts: THREE.BufferGeometry[] = []
  const shingleParts: THREE.BufferGeometry[] = []
  const brickParts: THREE.BufferGeometry[] = []
  const trim: THREE.BufferGeometry[] = []
  const shutters: THREE.BufferGeometry[] = []
  const doors: THREE.BufferGeometry[] = []
  const glass: THREE.BufferGeometry[] = []
  const T = (g: THREE.BufferGeometry, color: string = COLORS.trim) => trim.push(paint(g, color))

  // --- Walls (the washable front/east planes sit 1 cm in front of these) and gables.
  sidingParts.push(worldUV(box(W, H, Dp, cx, H / 2, cz), siding.tile))
  for (const side of [1, -1]) {
    const x = cx + (side * W) / 2
    const near = v3(x, H, cz + (side * Dp) / 2)
    const far = v3(x, H, cz - (side * Dp) / 2)
    const peak = v3(x, H + R, cz)
    sidingParts.push(worldUV(tri([near, far, peak], [[0, 0], [0, 0], [0, 0]]), siding.tile))
    // Louvered gable vent.
    const wall: Wall = side === 1 ? 'east' : 'west'
    shutters.push(box(0.55, 0.42, 0.04, 0, H + R * 0.45, 0.02, wallMatrix(wall)))
    T(box(0.67, 0.54, 0.03, 0, H + R * 0.45, 0.012, wallMatrix(wall)))
  }

  // Corner boards.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      T(box(HOUSE.cornerPost, H, HOUSE.cornerPost, cx + (sx * W) / 2, H / 2, cz + (sz * Dp) / 2))
    }
  }

  // --- Roof: two sloped slabs (soffit + fascia in trim), shingle quads on top.
  const D = Dp / 2
  const theta = Math.atan2(R, D)
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const t = 0.12
  const L = Math.hypot(D, R) + eaveOverhang / cos
  const halfX = W / 2 + rakeOverhang
  const ridge = v3(cx, H + R, cz)
  const eaveBottom: Record<number, THREE.Vector3> = {}
  for (const s of [1, -1]) {
    const down = v3(0, -sin, s * cos)
    const out = v3(0, cos, s * sin)
    const slab = new THREE.BoxGeometry(halfX * 2, t, L).toNonIndexed()
    slab.applyMatrix4(new THREE.Matrix4().makeRotationX(s * theta))
    const c = ridge.clone().addScaledVector(down, L / 2).addScaledVector(out, t / 2)
    slab.translate(c.x, c.y, c.z)
    T(slab, COLORS.soffit)

    const lift = t + 0.004
    const top = ridge.clone().addScaledVector(out, lift)
    const eave = ridge.clone().addScaledVector(down, L).addScaledVector(out, lift)
    const [tu, tv] = shingle.tile
    const l = -halfX
    const r = halfX
    // Counter-clockwise seen from above the slope: for the front slope left = -x.
    const xa = s === 1 ? l : r
    const xb = s === 1 ? r : l
    shingleParts.push(
      quad(
        [v3(cx + xa, eave.y, eave.z), v3(cx + xb, eave.y, eave.z), v3(cx + xb, top.y, top.z), v3(cx + xa, top.y, top.z)],
        [
          [xa / tu, 0],
          [xb / tu, 0],
          [xb / tu, L / tv],
          [xa / tu, L / tv],
        ],
      ),
    )

    // Rake boards along both gable edges of this slope.
    for (const sx of [-1, 1]) {
      const rb = new THREE.BoxGeometry(0.04, 0.24, L + 0.04).toNonIndexed()
      rb.applyMatrix4(new THREE.Matrix4().makeRotationX(s * theta))
      const rc = ridge.clone().addScaledVector(down, L / 2).addScaledVector(out, t / 2 - 0.02)
      rb.translate(cx + sx * (halfX + 0.02), rc.y, rc.z)
      T(rb)
    }

    // Fascia board + gutter along the eave.
    const eb = ridge.clone().addScaledVector(down, L)
    eaveBottom[s] = eb
    const fz = eb.z + s * (sin * t + 0.018)
    T(box(halfX * 2 + 0.08, 0.22, 0.036, cx, eb.y + 0.05, fz))
    T(box(halfX * 2 + 0.08, 0.1, 0.12, cx, eb.y - 0.01, fz + s * 0.078), COLORS.gutter)
  }
  // Ridge cap.
  T(box(halfX * 2 + 0.04, 0.07, 0.34, cx, ridge.y + t / cos + 0.01, cz), COLORS.ridge)

  // Downspouts: front-west corner (on the west wall) and back-east (on the back wall),
  // so they never cover a washable wall.
  {
    const gutterY = eaveBottom[1].y - 0.05
    const frontGutterZ = eaveBottom[1].z + sin * t + 0.018 + 0.078
    const x = cx - W / 2 - 0.06
    const z = cz + D - 0.14
    const elbow = v3(x, gutterY - 0.45, z)
    T(beam(v3(x, gutterY, frontGutterZ), elbow, 0.08, 0.08), COLORS.gutter)
    T(box(0.08, elbow.y + 0.04, 0.08, x, (elbow.y + 0.04) / 2, z), COLORS.gutter)
    T(beam(v3(x, 0.18, z), v3(x - 0.22, 0.04, z), 0.08, 0.06), COLORS.gutter)

    const bx = cx + W / 2 - 0.16
    const bz = cz - D - 0.06
    const backGutterZ = eaveBottom[-1].z - sin * t - 0.018 - 0.078
    const belbow = v3(bx, gutterY - 0.45, bz)
    T(beam(v3(bx, gutterY, backGutterZ), belbow, 0.08, 0.08), COLORS.gutter)
    T(box(0.08, belbow.y + 0.04, 0.08, bx, (belbow.y + 0.04) / 2, bz), COLORS.gutter)
  }

  // --- Chimney through the back slope.
  {
    const x = cx - W * 0.3
    const z = cz - D * 0.45
    const top = ridge.y + 0.75
    const bottom = H + 0.3
    brickParts.push(worldUV(box(0.75, top - bottom, 0.62, x, (top + bottom) / 2, z), brick.tile))
    T(box(0.86, 0.08, 0.73, x, top + 0.04, z), COLORS.cap)
    T(box(0.22, 0.16, 0.22, x - 0.12, top + 0.16, z), COLORS.black)
  }

  // --- Windows and door.
  const wt = WINDOW_TRIM
  for (const o of openings) {
    const f = wallMatrix(o.wall)
    const { u, y, w, h } = o
    if (o.kind === 'window') {
      const c = wt.casing
      glass.push(new THREE.PlaneGeometry(w, h).translate(u, y + h / 2, 0.015).applyMatrix4(f))
      T(box(c, h + 2 * c, 0.05, u - w / 2 - c / 2, y + h / 2, 0.025, f))
      T(box(c, h + 2 * c, 0.05, u + w / 2 + c / 2, y + h / 2, 0.025, f))
      T(box(w + 2 * c, c, 0.05, u, y + h + c / 2, 0.025, f))
      T(box(w + 2 * c, c * 0.7, 0.05, u, y - c * 0.35, 0.025, f))
      // Sill and head.
      T(box(w + 2 * c + 2 * wt.sillOverhang, wt.sillDrop, 0.1, u, y - c * 0.7 - wt.sillDrop / 2, 0.05, f))
      T(box(w + 2 * c + 0.08, 0.05, 0.08, u, y + h + c + 0.025, 0.04, f))
      // Muntins.
      T(box(0.035, h, 0.025, u, y + h / 2, 0.025, f))
      T(box(w, 0.035, 0.025, u, y + h * 0.55, 0.025, f))
      // Shutters, full casing height down to the sill.
      const sy0 = y - c - wt.sillDrop
      const sy1 = y + h + c
      for (const side of [-1, 1]) {
        const sx = u + side * (w / 2 + c + wt.shutterGap + wt.shutterWidth / 2)
        shutters.push(box(wt.shutterWidth, sy1 - sy0, 0.035, sx, (sy0 + sy1) / 2, 0.02, f))
      }
    } else {
      const c = DOOR_TRIM.casing
      doors.push(box(w, h, 0.04, u, y + h / 2, 0.02, f))
      T(box(c, h + c, 0.06, u - w / 2 - c / 2, (h + c) / 2, 0.03, f))
      T(box(c, h + c, 0.06, u + w / 2 + c / 2, (h + c) / 2, 0.03, f))
      T(box(w + 2 * c, c, 0.06, u, h + c / 2, 0.03, f))
      T(box(w + 2 * c + 0.14, 0.07, 0.1, u, h + c + 0.035, 0.05, f)) // crown
      // Knob, deadbolt and kick plate.
      T(box(0.06, 0.06, 0.07, u + w / 2 - 0.1, 1.0, 0.075, f), COLORS.brass)
      T(box(0.05, 0.05, 0.05, u + w / 2 - 0.1, 1.18, 0.065, f), COLORS.brass)
      T(box(w - 0.12, 0.18, 0.008, u, 0.12, 0.044, f), COLORS.brass)
      // Concrete step.
      const st = DOOR_TRIM
      T(box(st.stepWidth, st.stepHeight, st.stepDepth, u, st.stepHeight / 2, st.stepDepth / 2, f), COLORS.concrete)
    }
  }

  // Porch lantern.
  {
    const f = wallMatrix(LANTERN.wall)
    const { u, y, w, h } = LANTERN
    T(box(w, h, 0.02, u, y + h / 2, 0.01, f), COLORS.black)
    T(box(0.15, 0.22, 0.15, u, y + 0.16, 0.12, f), COLORS.black)
    T(box(0.11, 0.17, 0.155, u, y + 0.16, 0.12, f), COLORS.lamp)
    T(box(0.2, 0.04, 0.2, u, y + 0.29, 0.12, f), COLORS.black)
    T(box(0.03, 0.05, 0.1, u, y + 0.33, 0.06, f), COLORS.black)
  }

  // Exterior wall faces get the shared siding look via world UVs; all
  // textured materials use world-space UVs, so maps repeat at 1:1.
  const mats = {
    siding: new THREE.MeshStandardMaterial({ map: siding.map, normalMap: sidingNormal(), roughness: 0.85 }),
    shingles: new THREE.MeshStandardMaterial({ map: shingle.map, bumpMap: shingle.map, bumpScale: 2, roughness: 0.95 }),
    brick: new THREE.MeshStandardMaterial({ map: brick.map, bumpMap: brick.map, bumpScale: 2, roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
    shutters: new THREE.MeshStandardMaterial({ map: shutterTexture(), roughness: 0.7 }),
    door: new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: 0.45 }),
    glass: new THREE.MeshStandardMaterial({ map: glassTexture(), roughness: 0.08, metalness: 0.2 }),
  }

  const parts = {
    siding: merge(sidingParts),
    shingles: merge(shingleParts),
    brick: merge(brickParts),
    trim: merge(trim),
    shutters: merge(shutters),
    door: merge(doors),
    glass: merge(glass.map((g) => g.toNonIndexed())),
    mats,
    dispose() {
      for (const k of ['siding', 'shingles', 'brick', 'trim', 'shutters', 'door', 'glass'] as const) parts[k].dispose()
      Object.values(mats).forEach((m) => m.dispose())
    },
  }
  return parts
}
