import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody, CuboidCollider, useRapier, useBeforePhysicsStep } from '@react-three/rapier'
import * as THREE from 'three'
import { CARS } from '../config/cars.js'
import { VehicleSim, chassisMassProps } from './VehicleSim.js'
import { M4Body, SteeringWheel, Wheel, useCarMaterials, useWheelGeometry, useWheelMaterials } from './M4Model.jsx'
import { M4BodyGLB, GLBWheelVisual, useWheelModel, preloadModel } from './M4ModelGLB.jsx'
import { carState } from './carState.js'
import { pollDriving } from '../input/controls.js'
import { useGame } from '../store/useGame.js'
import { surfaceAt, SPAWN } from '../world/surfaces.js'
import TireEffects from './TireEffects.jsx'

// body origin above ground at rest (measured by scripts/physics-test.mjs)
const RIDE_HEIGHT = 0.071

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

for (const c of Object.values(CARS)) preloadModel(c)

function ModelWheel({ url, side, scale }) {
  const wheelScene = useWheelModel(url)
  return <GLBWheelVisual wheelScene={wheelScene} side={side} scale={scale} />
}

export default function Car({ driveEnabled = true }) {
  const spec = CARS[useGame((s) => s.carId)]
  const paintId = useGame((s) => s.paintId)
  const assists = useGame((s) => s.assists)
  const resetToken = useGame((s) => s.resetToken)
  const paint = spec.paints.find((p) => p.id === paintId) ?? spec.paints[0]

  const { world } = useRapier()
  const bodyRef = useRef()
  const simRef = useRef()
  const wheelRefs = [useRef(), useRef(), useRef(), useRef()]
  const steeringRef = useRef()
  const brakeLights = useRef([])
  const lastTelemetry = useRef(0)

  const mats = useCarMaterials(paint)
  const wheelGeo = useWheelGeometry(spec.wheels.radius)
  const wheelMats = useWheelMaterials('#5d6168', '#0a56c2') // M Orbit Grey rims, M Compound blue calipers
  const massProps = useMemo(() => chassisMassProps(spec), [spec])
  const blobMat = useMemo(() => new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.6 }), [])

  const spawn = carState.lastSafe ?? { position: SPAWN.position, yaw: SPAWN.yaw }

  // Create the sim once the body exists
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const sim = new VehicleSim(world, body, spec, surfaceAt)
    simRef.current = sim
    carState.body = body
    carState.sim = sim
    return () => {
      sim.dispose()
      if (carState.sim === sim) { carState.sim = null; carState.body = null }
    }
  }, [world, spec])

  useEffect(() => { if (simRef.current) Object.assign(simRef.current.settings, assists) }, [assists])

  // Reset (R key / menu)
  useEffect(() => {
    if (!resetToken || !simRef.current || !bodyRef.current) return
    const b = bodyRef.current
    const p = b.translation()
    const q = b.rotation()
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x))
    simRef.current.reset([p.x, Math.max(p.y, 0) + 1.2, p.z], yaw)
  }, [resetToken])

  const idle = useMemo(() => ({ throttle: 0, brake: 0, steer: 0, handbrake: true, nitro: false, shiftUp: false, shiftDown: false }), [])

  useBeforePhysicsStep(() => {
    const sim = simRef.current
    if (!sim) return
    const input = driveEnabled ? pollDriving() : idle
    carState.input = input
    sim.update(1 / 60, input)
    // fell out of the world → respawn
    const p = sim.body.translation()
    if (p.y < -20) sim.reset(SPAWN.position, SPAWN.yaw)
  })

  const tmpEuler = useMemo(() => new THREE.Euler(), [])
  useFrame((_, dt) => {
    const sim = simRef.current
    if (!sim) return
    const W = spec.wheels
    for (let i = 0; i < 4; i++) {
      const g = wheelRefs[i].current
      if (!g) continue
      const wh = sim.wheels[i]
      const pos = sim.wheelPositions[i]
      g.position.set(pos.x, pos.y - wh.suspension, pos.z)
      g.rotation.set(0, wh.steer, 0)
      const spin = g.children[1]
      if (spin) spin.rotation.x = wh.spin
    }
    if (steeringRef.current) steeringRef.current.rotation.z = -sim.steer * 2.4
    const braking = (carState.input?.brake ?? 0) > 0.1 && sim.gear !== -1
    mats.tail.emissiveIntensity = THREE.MathUtils.lerp(mats.tail.emissiveIntensity, braking ? 4.5 : 0.9, 1 - Math.exp(-dt * 20))

    // Remember a safe spot for respawn after remounts (quality changes)
    const b = sim.body
    const p = b.translation()
    const q = b.rotation()
    if (sim.telemetry.wheelsOnGround >= 3 && sim.up.y > 0.9) {
      tmpEuler.setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w), 'YXZ')
      carState.lastSafe = { position: [p.x, p.y + 0.6, p.z], yaw: tmpEuler.y }
    }

    // HUD telemetry at ~15 Hz
    lastTelemetry.current += dt
    if (lastTelemetry.current > 0.066) {
      lastTelemetry.current = 0
      const t = sim.telemetry
      useGame.getState().setTelemetry({
        speedKmh: t.speedKmh, rpm: t.rpm, gearLabel: t.gearLabel, nitro: t.nitro, nitroActive: t.nitroActive,
        surface: t.surface, drifting: t.drifting, tcsActive: t.tcsActive, absActive: t.absActive && t.brake > 0,
        throttle: t.throttle, brake: t.brake, shifting: t.shifting, slipAngle: t.slipAngle,
      })
    }
  })

  return (
    <>
      <RigidBody
        ref={bodyRef}
        colliders={false}
        position={spawn.position}
        rotation={[0, spawn.yaw, 0]}
        canSleep={false}
        angularDamping={0.35}
        linearDamping={0}
        ccd
        name="player-car"
      >
        {/* marker at the body origin: follows the interpolated pose that is rendered */}
        <object3D ref={(o) => { carState.visual = o }} />
        <CuboidCollider args={[spec.collider.hx, spec.collider.hy, spec.collider.hz]} position={[0, spec.collider.y, 0]} massProperties={massProps} friction={0.25} restitution={0.1} />
        {/* cabin collider so roof hits register */}
        <CuboidCollider args={[0.7, 0.2, 1.2]} position={[0, 0.98, 0.35]} mass={0.01} friction={0.2} />
        <group position={[0, -RIDE_HEIGHT, 0]}>
          {/* soft contact shadow so the car always sits on the road (even with shadows off) */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} scale={[2.3, 5.2, 1]} material={blobMat} renderOrder={1}>
            <planeGeometry />
          </mesh>
          {spec.model ? (
            <Suspense fallback={<M4Body mats={mats} />}>
              <M4BodyGLB url={spec.model.body} scale={spec.model.scale} mats={mats} />
            </Suspense>
          ) : <M4Body mats={mats} />}
          {spec.model
            ? <group position={[-0.057, 0.119, -0.056]} scale={0.82}><SteeringWheel mats={mats} wheelRef={steeringRef} /></group>
            : <SteeringWheel mats={mats} wheelRef={steeringRef} />}
        </group>
        {wheelRefs.map((r, i) => (
          <Wheel key={i} ref={r} geo={wheelGeo} mats={wheelMats} side={i % 2 === 0 ? -1 : 1}>
            {spec.model && (
              <Suspense fallback={null}>
                <ModelWheel url={spec.model.wheel} side={i % 2 === 0 ? -1 : 1} scale={spec.model.scale} />
              </Suspense>
            )}
          </Wheel>
        ))}
      </RigidBody>
      <TireEffects />
    </>
  )
}
