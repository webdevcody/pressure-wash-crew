import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Stats } from '@react-three/drei'
import { Physics } from '@react-three/rapier'
import { Level } from './components/Level'
import { Environment } from './components/Environment'
import { Player, PHYSICS_PRIORITY } from './components/Player'
import { Washer } from './components/Washer'
import { Hud } from './components/Hud'
import { CleanToast } from './effects/CleanToast'
import { MenuScreen, PauseScreen, ScoreScreen } from './components/Screens'
import { useGame } from './game/store'
import { installDebugApi, statsOverlay } from './dev/debug'
import { VIEW_FAR } from './game/atmosphere'
import { SceneFeatures } from './scene/SceneFeatures'

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
      <Canvas shadows camera={{ fov: 75, near: 0.05, far: VIEW_FAR }}>
        <Environment />
        <Suspense fallback={null}>
          <Physics gravity={[0, -20, 0]} updatePriority={PHYSICS_PRIORITY}>
            <Level />
            <Player />
          </Physics>
        </Suspense>
        <Washer />
        <SceneFeatures />
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
