import { WasherGun } from './WasherGun'
import { SprayInput } from './washer/SprayInput'
import { NozzleControls } from './washer/NozzleControls'
import { AimProbe } from './washer/AimProbe'
import { Spray } from './washer/Spray'
import { SprayParticles } from './washer/SprayParticles'

/**
 * The pressure washer, one job per component so features don't collide in
 * one file. Per-frame order is set by useFrame priorities: camera (-10) →
 * gun publishes its tip (-5) → spray stamps and emits (-2) → particles and
 * mask uploads (0). Droplets go through game/sprayParticles.ts.
 */
export function Washer() {
  return (
    <>
      <WasherGun />
      <SprayInput />
      <NozzleControls />
      <AimProbe />
      <Spray />
      <SprayParticles />
    </>
  )
}
