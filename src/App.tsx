import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Sky, Stats } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Level } from './components/Level'
import { Player } from './components/Player'
import { Washer } from './components/Washer'
import { Hud } from './components/Hud'
import { Celebrations } from './effects/Celebrations'
import { CleanToast } from './effects/CleanToast'
import { MenuScreen, PauseScreen, ScoreScreen } from './components/Screens'
import { useGame } from './game/store'
import { installDebugApi, statsOverlay } from './dev/debug'

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
      <Canvas shadows camera={{ fov: 75, near: 0.05, far: 200 }}>
        <Sky sunPosition={[10, 16, 18]} />
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
        <Washer />
        <Celebrations />
        {statsOverlay && <Stats />}
      </Canvas>

      {phase === 'playing' && <Hud />}
      {phase === 'playing' && <CleanToast />}
      {phase === 'playing' && paused && <PauseScreen />}
      {phase === 'menu' && <MenuScreen />}
      {phase === 'finished' && <ScoreScreen />}
    </>
  )
}
