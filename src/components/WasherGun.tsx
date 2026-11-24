import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { runtime } from '../game/runtime'
import { useGame } from '../game/store'

/** Runs after the camera (-10) and before the spray (0); see Player.tsx. */
export const GUN_PRIORITY = -5

/**
 * The whole viewmodel is modelled at real size, then scaled toward the eye.
 * Scaling about the camera origin doesn't change how it looks on screen, but
 * keeps every part closer than the player's capsule radius (0.35 m), so the
 * gun never pokes through a wall you're standing against.
 */
const VIEW_SCALE = 0.3
/** Where the gun body sits in camera space (real size), and its resting aim. */
const REST_POS = new THREE.Vector3(0.2, -0.2, -0.4)
const REST_ROT = new THREE.Euler(0.06, 0.04, 0, 'YXZ')
/** Nozzle exit point in gun-local space (front of the tip). */
const TIP_EXIT = new THREE.Vector3(0, 0.005, -0.69)

const WALK_SPEED = 4.5

// ---------- geometry (built once) ----------

const C = {
  body: '#f2b705',
  rubber: '#1c1d20',
  shroud: '#2c2f33',
  red: '#d23a1c',
  steel: '#c3c9cf',
  darkSteel: '#6d747b',
  brass: '#c9a24c',
  tip: '#f2c230',
}

const tmpColor = new THREE.Color()

function paint(g: THREE.BufferGeometry, hex: string) {
  tmpColor.set(hex)
  const n = g.attributes.position.count
  const c = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    c[i * 3] = tmpColor.r
    c[i * 3 + 1] = tmpColor.g
    c[i * 3 + 2] = tmpColor.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return g
}

const m4 = new THREE.Matrix4()
const q = new THREE.Quaternion()
const e = new THREE.Euler()
const v = new THREE.Vector3()
const sc = new THREE.Vector3()

/** Bake a transform into a geometry: position, euler rotation (XYZ), scale. */
function place(
  g: THREE.BufferGeometry,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
) {
  q.setFromEuler(e.set(rot[0], rot[1], rot[2]))
  m4.compose(v.set(...pos), q, sc.set(...scale))
  return g.applyMatrix4(m4)
}

/** Geometry that runs along Z (three's capsule/cylinder run along Y). */
const alongZ = Math.PI / 2
const GRIP_TILT = -0.35

function buildGun() {
  const plastic: THREE.BufferGeometry[] = []
  const metal: THREE.BufferGeometry[] = []

  // Trigger housing: a flattened capsule.
  plastic.push(paint(place(new THREE.CapsuleGeometry(0.03, 0.12, 4, 12), [0, 0, 0], [alongZ, 0, 0], [0.72, 1, 1.15]), C.body))
  // Rubber bumper on the back and a dark band near the front.
  plastic.push(paint(place(new THREE.CylinderGeometry(0.0235, 0.0235, 0.014, 12), [0, 0, 0.094], [alongZ, 0, 0], [1, 1, 1.5]), C.rubber))
  plastic.push(paint(place(new THREE.CylinderGeometry(0.0225, 0.0225, 0.012, 12, 1, true), [0, 0, -0.06], [alongZ, 0, 0], [1, 1, 1.5]), C.shroud))
  // Dark shroud along the top.
  plastic.push(paint(place(new THREE.BoxGeometry(0.022, 0.012, 0.13), [0, 0.033, -0.005]), C.shroud))
  // Pistol grip, raked back.
  plastic.push(paint(place(new THREE.CapsuleGeometry(0.022, 0.1, 3, 10), [0, -0.075, 0.045], [GRIP_TILT, 0, 0], [0.85, 1, 1]), C.rubber))
  // Grip ridges on the front of the grip.
  for (let i = 0; i < 3; i++) {
    const t = -0.03 + i * 0.03
    plastic.push(
      paint(
        place(new THREE.BoxGeometry(0.03, 0.008, 0.01), [0, -0.075 + t * 0.94, 0.045 - t * 0.343 - 0.019], [GRIP_TILT, 0, 0]),
        C.rubber,
      ),
    )
  }
  // Trigger guard: half a torus hanging under the housing.
  plastic.push(
    paint(place(new THREE.TorusGeometry(0.03, 0.005, 5, 10, Math.PI), [0, -0.03, -0.022], [0, Math.PI / 2, Math.PI]), C.body),
  )
  // Trigger and safety lever.
  plastic.push(paint(place(new THREE.BoxGeometry(0.012, 0.045, 0.014), [0, -0.042, -0.012], [0.25, 0, 0]), C.red))
  plastic.push(paint(place(new THREE.BoxGeometry(0.006, 0.012, 0.026), [0.028, -0.01, 0.022]), C.red))
  // Hose leaving the bottom of the grip, curling down out of view.
  const hosePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.165, 0.078),
    new THREE.Vector3(0, -0.23, 0.105),
    new THREE.Vector3(-0.02, -0.32, 0.1),
    new THREE.Vector3(-0.05, -0.46, 0.06),
  ])
  plastic.push(paint(new THREE.TubeGeometry(hosePath, 10, 0.011, 7, false), C.rubber))
  // Foam grip on the lance.
  plastic.push(paint(place(new THREE.CapsuleGeometry(0.019, 0.09, 3, 10), [0, 0.005, -0.3], [alongZ, 0, 0]), C.rubber))

  // Brass swivel where the hose meets the grip.
  metal.push(paint(place(new THREE.CylinderGeometry(0.013, 0.013, 0.03, 10), [0, -0.152, 0.072], [GRIP_TILT, 0, 0]), C.brass))
  // Hex nut joining lance to housing.
  metal.push(paint(place(new THREE.CylinderGeometry(0.018, 0.018, 0.022, 6), [0, 0.005, -0.11], [alongZ, 0, 0]), C.brass))
  // Steel lance.
  metal.push(paint(place(new THREE.CylinderGeometry(0.0105, 0.0105, 0.5, 10), [0, 0.005, -0.37], [alongZ, 0, 0]), C.steel))
  // Collar and quick-connect coupler at the business end.
  metal.push(paint(place(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 10), [0, 0.005, -0.6], [alongZ, 0, 0]), C.darkSteel))
  metal.push(paint(place(new THREE.CylinderGeometry(0.017, 0.017, 0.04, 12), [0, 0.005, -0.64], [alongZ, 0, 0]), C.brass))
  metal.push(paint(place(new THREE.CylinderGeometry(0.0185, 0.0185, 0.006, 12), [0, 0.005, -0.628], [alongZ, 0, 0]), C.darkSteel))

  // Nozzle tip: its own mesh so its color can follow the selected nozzle.
  const tip = place(new THREE.CylinderGeometry(0.009, 0.014, 0.026, 12), [0, 0.005, -0.673], [-alongZ, 0, 0])

  const merged = {
    plastic: mergeGeometries(plastic)!,
    metal: mergeGeometries(metal)!,
    tip,
  }
  plastic.forEach((g) => g.dispose())
  metal.forEach((g) => g.dispose())
  return merged
}

// ---------- per-frame state (allocation-free) ----------

const lastCam = new THREE.Vector3()
const damp = THREE.MathUtils.damp
const clamp = THREE.MathUtils.clamp

export function WasherGun() {
  const camera = useThree((s) => s.camera)
  const rig = useRef<THREE.Group>(null)
  const gun = useRef<THREE.Group>(null)
  const tipMesh = useRef<THREE.Mesh>(null)
  const exit = useRef<THREE.Object3D>(null)
  const geo = useMemo(buildGun, [])
  const s = useRef({
    init: false,
    t: 0,
    speed: 0,
    bobW: 0,
    phase: 0,
    sprint: 0,
    swayYaw: 0,
    swayPitch: 0,
    kick: 0,
    lastYaw: 0,
    lastPitch: 0,
  })

  useEffect(() => {
    runtime.nozzleTip = tipMesh.current
    return () => {
      runtime.nozzleTip = null
      geo.plastic.dispose()
      geo.metal.dispose()
      geo.tip.dispose()
    }
  }, [geo])

  useFrame((_, rawDt) => {
    const r = rig.current
    const g = gun.current
    const x = exit.current
    if (!r || !g || !x) return
    const st = s.current
    const dt = Math.min(Math.max(rawDt, 1e-4), 0.05)
    const game = useGame.getState()
    const active = game.phase === 'playing' && !game.paused
    const spraying = game.spraying && active

    // Rigidly attached to the camera, which Player has already placed this frame.
    r.position.copy(camera.position)
    r.quaternion.copy(camera.quaternion)

    const yaw = runtime.look.yaw
    const pitch = runtime.look.pitch
    if (!st.init) {
      lastCam.copy(camera.position)
      st.lastYaw = yaw
      st.lastPitch = pitch
      st.init = true
    }

    // Movement from the smoothed camera path (no physics reads, no allocation).
    const dx = camera.position.x - lastCam.x
    const dy = camera.position.y - lastCam.y
    const dz = camera.position.z - lastCam.z
    lastCam.copy(camera.position)
    let hSpeed = Math.hypot(dx, dz) / dt
    if (hSpeed > 20) hSpeed = 0 // teleport / respawn
    const airborne = Math.abs(dy / dt) > 1.5
    st.speed = damp(st.speed, active ? hSpeed : 0, 10, dt)
    st.bobW = damp(st.bobW, airborne ? 0 : clamp(st.speed / WALK_SPEED, 0, 1.5), 8, dt)
    st.phase += dt * st.speed * 1.4
    st.t += dt

    // Walk bob: a soft figure-eight that dips on every footstep.
    const w = st.bobW
    const bobX = Math.sin(st.phase) * 0.011 * w
    const bobY = -Math.abs(Math.cos(st.phase)) * 0.013 * w + Math.sin(st.t * 1.7) * 0.0015
    const bobRoll = Math.sin(st.phase) * 0.018 * w

    // Look sway: the gun lags a little behind fast mouse turns.
    const yawVel = (yaw - st.lastYaw) / dt
    const pitchVel = (pitch - st.lastPitch) / dt
    st.lastYaw = yaw
    st.lastPitch = pitch
    st.swayYaw = damp(st.swayYaw, clamp(-yawVel * 0.02, -0.08, 0.08), 9, dt)
    st.swayPitch = damp(st.swayPitch, clamp(-pitchVel * 0.02, -0.06, 0.06), 9, dt)

    // Sprinting (and not spraying) carries the gun lower and angled in.
    st.sprint = damp(st.sprint, !spraying && st.speed > 5.8 ? 1 : 0, 6, dt)

    // Spraying: push back, slight muzzle rise and a fine pump buzz.
    st.kick = damp(st.kick, spraying ? 1 : 0, 14, dt)
    const k = st.kick
    const buzzX = k * Math.sin(st.t * 113) * 0.0011
    const buzzY = k * (Math.sin(st.t * 91) * 0.0016 + Math.sin(st.t * 137) * 0.0009)

    g.position.set(
      REST_POS.x + bobX + buzzX - st.swayYaw * 0.08,
      REST_POS.y + bobY + buzzY - st.sprint * 0.03 + st.swayPitch * 0.06,
      REST_POS.z + k * 0.016,
    )
    g.rotation.set(
      REST_ROT.x + st.swayPitch + k * 0.018 - st.sprint * 0.12,
      REST_ROT.y + st.swayYaw + st.sprint * 0.2,
      bobRoll + st.sprint * 0.1,
    )

    r.updateMatrixWorld()
    runtime.nozzleWorld.setFromMatrixPosition(x.matrixWorld)
  }, GUN_PRIORITY)

  return (
    <group ref={rig}>
      <group scale={VIEW_SCALE}>
        <group ref={gun} rotation={REST_ROT} position={REST_POS}>
          <mesh geometry={geo.plastic}>
            <meshStandardMaterial vertexColors roughness={0.55} metalness={0} />
          </mesh>
          <mesh geometry={geo.metal}>
            <meshStandardMaterial vertexColors roughness={0.32} metalness={0.45} />
          </mesh>
          <mesh ref={tipMesh} geometry={geo.tip}>
            <meshStandardMaterial color={C.tip} roughness={0.4} metalness={0.1} />
          </mesh>
          <object3D ref={exit} position={TIP_EXIT} />
        </group>
      </group>
    </group>
  )
}
