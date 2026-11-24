import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Sky, Stats } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import type * as THREE from 'three'
import { Level } from './components/Level'
import { City, CITY_FOG, FOG_FAR, FOG_NEAR } from './components/City'
import { Player } from './components/Player'
import { Washer } from './components/Washer'
import { Hud } from './components/Hud'
import { MenuScreen, PauseScreen, ScoreScreen } from './components/Screens'
import { useGame } from './game/store'
import { installDebugApi, statsOverlay } from './dev/debug'

/** Draw the sky after the opaque scene so the depth test skips its pixels behind buildings. */
const drawSkyLast = (sky: THREE.Object3D | null) => {
  if (sky) sky.renderOrder = 2
}

export function App() {
  const phase = useGame((s) => s.phase)
  const paused = useGame((s) => s.paused)

  // Losing pointer lock mid-run (Esc) pauses; regaining it resumes.
  useEffect(() => {
    const onChange = () => {
      const g = useGame.getState()
      if (g.phase !== 'playing') return
      g.setPaused(document.pointerLockElement == null)
    }
    document.addEventListener('pointerlockchange', onChange)
    return () => document.removeEventListener('pointerlockchange', onChange)
  }, [])

  // Debug hooks for automated checks (dev builds, or any build with ?perf).
  useEffect(installDebugApi, [])

  return (
    <>
      <Canvas shadows camera={{ fov: 75, near: 0.05, far: 700 }}>
        <Sky ref={drawSkyLast} sunPosition={[10, 16, 18]} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.85} />
        <fog attach="fog" args={[CITY_FOG, FOG_NEAR, FOG_FAR]} />
        <hemisphereLight args={['#dfefff', '#8a9378', 1.1]} />
        <ambientLight intensity={0.25} />
        <directionalLight
          position={[10, 16, 18]}
          intensity={1.6}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
          shadow-bias={-0.0005}
          shadow-normalBias={0.03}
        />
        <Suspense fallback={null}>
          <Physics gravity={[0, -20, 0]}>
            <Level />
            <Player />
          </Physics>
        </Suspense>
        <City />
        <Washer />
        {statsOverlay && <Stats />}
      </Canvas>

      {phase === 'playing' && <Hud />}
      {phase === 'playing' && paused && <PauseScreen />}
      {phase === 'menu' && <MenuScreen />}
      {phase === 'finished' && <ScoreScreen />}
    </>
  )
}
