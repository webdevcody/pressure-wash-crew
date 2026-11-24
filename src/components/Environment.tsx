import { Sky } from '@react-three/drei'
import type * as THREE from 'three'
import { FOG_FAR, FOG_NEAR, HAZE } from '../game/atmosphere'

/** Draw the sky after the opaque scene so the depth test skips its pixels behind buildings. */
const drawSkyLast = (sky: THREE.Object3D | null) => {
  if (sky) sky.renderOrder = 2
}

/** Sky, fog and lights: how the world is lit, in one place instead of in App. */
export function Environment() {
  return (
    <>
      <Sky ref={drawSkyLast} sunPosition={[10, 16, 18]} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <fog attach="fog" args={[HAZE, FOG_NEAR, FOG_FAR]} />
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
    </>
  )
}
