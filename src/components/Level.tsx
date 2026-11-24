import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { blocks, surfaces as surfaceDefs } from '../game/level1'
import { WashSurface } from '../game/washSurface'
import { runtime, totalRemaining } from '../game/runtime'
import { FINISH_THRESHOLD, useGame } from '../game/store'
import { createWashMaterial } from '../game/washMaterial'
import { House, sidingLook } from './House'

export function Level() {
  const runId = useGame((s) => s.runId)
  const group = useRef<THREE.Group>(null)

  const washSurfaces = useMemo(() => surfaceDefs.map((d) => new WashSurface(d)), [])
  const washMaterials = useMemo(
    () => washSurfaces.map((s) => (s.def.look === 'siding' ? createWashMaterial(s, sidingLook()) : null)),
    [washSurfaces],
  )

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

  // Fresh dirt every run.
  useEffect(() => {
    washSurfaces.forEach((s) => s.reset())
  }, [runId, washSurfaces])

  return (
    <group ref={group}>
      {/* Ground */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[20, 0.5, 20]} position={[0, -0.5, 0]} />
      </RigidBody>
      <mesh rotation-x={-Math.PI / 2} receiveShadow userData={{ raycastable: true }}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#6f7a64" />
      </mesh>
      <Grid
        position={[0, 0.005, 0]}
        args={[40, 40]}
        cellSize={1}
        cellColor="#5c6654"
        sectionSize={5}
        sectionColor="#4a5244"
        fadeDistance={45}
        infiniteGrid={false}
      />

      {blocks.map((b, i) => (
        <RigidBody key={i} type="fixed" colliders="cuboid" position={b.position}>
          <mesh castShadow receiveShadow userData={{ raycastable: true }}>
            <boxGeometry args={b.size} />
            <meshStandardMaterial color={b.color} />
          </mesh>
        </RigidBody>
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
