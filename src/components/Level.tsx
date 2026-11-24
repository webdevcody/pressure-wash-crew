import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { blocks, surfaces as surfaceDefs, YARD_HALF, type LevelSurfaceDef } from '../game/level1'
import { WashSurface } from '../game/washSurface'
import { createWashMaterial } from '../game/washMaterial'
import {
  mergedBlockGeometries,
  useBlockMaterials,
  useGrassMaterial,
  useYardTextures,
  YARD_TILE,
  type YardTextures,
} from './yard/yardMaterials'
import { runtime, totalRemaining } from '../game/runtime'
import { FINISH_THRESHOLD, useGame } from '../game/store'
import { House, sidingLook } from './House'

export function Level() {
  const runId = useGame((s) => s.runId)
  const seed = useGame((s) => s.seed)
  const group = useRef<THREE.Group>(null)

  const washSurfaces = useMemo(() => surfaceDefs.map((d) => new WashSurface(d)), [])
  const yardTex = useYardTextures()
  const blockMaterials = useBlockMaterials(yardTex)
  const grass = useGrassMaterial(yardTex, YARD_HALF * 2)
  const washMaterials = useMemo(() => washSurfaces.map((s) => washMaterialFor(s, yardTex)), [washSurfaces, yardTex])
  const yardBlocks = useMemo(() => mergedBlockGeometries(blocks), [])

  // Publish surfaces + raycast targets for the washer.
  useEffect(() => {
    runtime.surfaces = washSurfaces
    const targets: THREE.Object3D[] = []
    group.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.raycastable) targets.push(o)
    })
    runtime.raycastTargets = targets
    return () => {
      runtime.surfaces = []
      runtime.raycastTargets = []
      washSurfaces.forEach((s) => s.dispose())
    }
  }, [washSurfaces])

  // Fresh dirt and a new stain layout every run.
  useEffect(() => {
    washSurfaces.forEach((s) => s.reset(seed))
  }, [runId, seed, washSurfaces])

  return (
    <group ref={group}>
      {/* Ground */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[20, 0.5, 20]} position={[0, -0.5, 0]} />
      </RigidBody>
      {/* Lawn, stopping at the perimeter walls' outer faces (the city starts there). */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow material={grass} userData={{ raycastable: true }}>
        <planeGeometry args={[YARD_HALF * 2, YARD_HALF * 2]} />
      </mesh>

      {blocks.map((b, i) => (
        <RigidBody key={i} type="fixed" colliders={b.material ? false : 'cuboid'} position={b.position}>
          {b.material ? (
            // Drawn below as part of a merged mesh; only the collider lives here.
            <CuboidCollider args={[b.size[0] / 2, b.size[1] / 2, b.size[2] / 2]} />
          ) : (
            <mesh castShadow receiveShadow userData={{ raycastable: true }}>
              <boxGeometry args={b.size} />
              <meshStandardMaterial color={b.color} />
            </mesh>
          )}
        </RigidBody>
      ))}
      {yardBlocks.map(({ id, geometry }) => (
        <mesh
          key={id}
          geometry={geometry}
          material={blockMaterials[id]}
          castShadow
          receiveShadow
          userData={{ raycastable: true }}
        />
      ))}

      <House />

      {washSurfaces.map((s, i) => (
        <mesh
          key={s.def.id}
          position={s.def.position}
          rotation={s.def.rotation}
          receiveShadow
          userData={{ raycastable: true, surface: s }}
          material={washMaterials[i] ?? undefined}
        >
          <planeGeometry args={[s.def.width, s.def.height]} />
          {!washMaterials[i] && <meshStandardMaterial map={s.texture} roughness={0.9} />}
        </mesh>
      ))}

      <ProgressTracker />
    </group>
  )
}

/** Textured material for a washable surface, or null for the flat-color default. */
function washMaterialFor(surface: WashSurface, tex: YardTextures): THREE.Material | null {
  switch ((surface.def as LevelSurfaceDef).look) {
    case 'concrete':
      return createWashMaterial(surface, {
        map: tex.concreteAlbedo,
        normalMap: tex.concreteNormal,
        tileMeters: [...YARD_TILE.concrete],
        roughness: 0.88,
      })
    case 'wood':
      return createWashMaterial(surface, {
        map: tex.woodAlbedo,
        normalMap: tex.woodNormal,
        tileMeters: [...YARD_TILE.wood],
        roughness: 0.8,
      })
    case 'siding':
      return createWashMaterial(surface, { ...sidingLook(), roughness: 0.85 })
    default:
      return null
  }
}

/** Uploads painted textures each frame and reports progress ~10x/sec. */
function ProgressTracker() {
  const acc = useRef(0)
  useFrame((_, dt) => {
    for (const s of runtime.surfaces) s.flush()
    const game = useGame.getState()
    if (game.phase !== 'playing') return
    if (!game.paused) game.addTime(dt)
    acc.current += dt
    if (acc.current < 0.1) return
    acc.current = 0
    const remaining = totalRemaining()
    game.setProgress(
      remaining,
      runtime.surfaces.map((s) => ({ id: s.def.id, name: s.def.name, cleanFraction: s.cleanFraction })),
    )
    if (remaining <= FINISH_THRESHOLD) {
      document.exitPointerLock?.()
      game.finishRun()
    }
  })
  return null
}
