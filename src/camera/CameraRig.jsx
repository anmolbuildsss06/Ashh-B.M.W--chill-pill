// Chase / close / hood / cockpit / cinematic cameras with smooth blended transitions,
// speed-based FOV and subtle high-speed shake. Also drives the menu showcase orbit.
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { carState } from '../vehicle/carState.js'
import { useGame, CAMERA_MODES } from '../store/useGame.js'
import { orbit, attachOrbitControls } from './orbit.js'

const WORLD_UP = new THREE.Vector3(0, 1, 0)
const damp = (a, b, k, dt) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-k * dt))

const MODES = {
  chase: { dist: 6.4, height: 2.05, look: 1.05, fov: 62, lag: 9 },
  close: { dist: 4.6, height: 1.5, look: 0.95, fov: 64, lag: 12 },
  hood: { local: [0, 0.98, -1.25], fov: 70 },
  cockpit: { local: [-0.36, 1.06, 0.18], fov: 74 },
}

export default function CameraRig({ showcase = false, showroom = false }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const modeIndex = useGame((s) => s.cameraMode)
  const st = useMemo(() => ({
    pos: new THREE.Vector3(0, 4, 20), look: new THREE.Vector3(), heading: new THREE.Vector3(0, 0, -1),
    blend: 1, fromPos: new THREE.Vector3(), fromQuat: new THREE.Quaternion(), lastMode: null,
    q: new THREE.Quaternion(), fwd: new THREE.Vector3(), up: new THREE.Vector3(), carPos: new THREE.Vector3(),
    desired: new THREE.Vector3(), desiredQuat: new THREE.Quaternion(), m: new THREE.Matrix4(), tmp: new THREE.Vector3(),
    orbit: 0.6, fov: 62, time: 0, shake: new THREE.Vector3(), initialized: false,
  }), [])

  // drag / pinch / wheel to orbit in FREE LOOK and the showroom
  useEffect(() => attachOrbitControls(gl.domElement, () => {
    const g = useGame.getState()
    return g.phase === 'showroom' || (g.phase === 'playing' && CAMERA_MODES[g.cameraMode].id === 'orbit')
  }), [gl])

  useFrame((_, rawDt) => {
    const sim = carState.sim
    if (!sim) return
    const dt = Math.min(rawDt, 0.05)
    st.time += dt
    const b = sim.body
    // Follow the *rendered* (interpolated) car. Reading the raw physics body here made the car
    // jitter on screen: physics steps at a fixed 60 Hz while frames are drawn in between.
    const vis = carState.visual
    if (vis) {
      vis.getWorldPosition(st.carPos)
      vis.getWorldQuaternion(st.q)
    } else {
      const p = b.translation(), r = b.rotation()
      st.carPos.set(p.x, p.y, p.z)
      st.q.set(r.x, r.y, r.z, r.w)
    }
    st.fwd.set(0, 0, -1).applyQuaternion(st.q)
    st.up.set(0, 1, 0).applyQuaternion(st.q)
    const v = b.linvel()
    const speed = Math.hypot(v.x, v.z)
    const kmh = sim.telemetry.speedKmh

    const mode = showroom ? 'showroom' : showcase ? 'showcase' : CAMERA_MODES[modeIndex].id
    if (mode !== st.lastMode) {
      if (st.initialized) {
        st.fromPos.copy(camera.position)
        st.fromQuat.copy(camera.quaternion)
        st.blend = 0
      }
      // re-seed chase state so we don't swoop from a stale position
      st.heading.copy(st.fwd).setY(0).normalize()
      if (mode === 'chase' || mode === 'close') {
        const m = MODES[mode]
        st.pos.copy(st.carPos).addScaledVector(st.heading, -m.dist).setY(st.carPos.y + m.height)
      }
      st.lastMode = mode
      st.initialized = true
    }

    let fovTarget = 62
    if ((mode === 'showroom' || mode === 'orbit') && !(mode === 'showroom' && orbit.interior)) {
      // orbit around the car, relative to its heading; idle in FREE LOOK slowly swings back behind
      const k = 1 - Math.exp(-dt * 6)
      if (mode === 'orbit' && performance.now() - orbit.lastInput > 2500 && speed > 3) {
        orbit.targetYaw += (Math.round(orbit.targetYaw / (Math.PI * 2)) * Math.PI * 2 - orbit.targetYaw) * (1 - Math.exp(-dt * 0.8))
      }
      if (mode === 'orbit') orbit.targetLook = [0, 0.6, 0]
      orbit.yaw += (orbit.targetYaw - orbit.yaw) * k
      orbit.pitch += (orbit.targetPitch - orbit.pitch) * k
      orbit.dist += (orbit.targetDist - orbit.dist) * k
      for (let i = 0; i < 3; i++) orbit.look[i] += (orbit.targetLook[i] - orbit.look[i]) * k
      const carYaw = Math.atan2(-st.fwd.x, -st.fwd.z)
      const a = carYaw + orbit.yaw
      const cp = Math.cos(orbit.pitch)
      st.look.set(...orbit.look).applyAxisAngle(WORLD_UP, carYaw).add(st.carPos)
      st.desired.set(Math.sin(a) * cp * orbit.dist, Math.sin(orbit.pitch) * orbit.dist, Math.cos(a) * cp * orbit.dist).add(st.look)
      st.desired.y = Math.max(st.desired.y, 0.25)
      st.m.lookAt(st.desired, st.look, WORLD_UP)
      st.desiredQuat.setFromRotationMatrix(st.m)
      fovTarget = mode === 'showroom' ? 42 : 55
    } else if (mode === 'showroom') {
      // interior preset: driver's seat, looking slightly across the dash
      st.desired.set(-0.36, 1.06, 0.18).applyQuaternion(st.q).add(st.carPos)
      st.look.set(0.15, 0.85, -3).applyQuaternion(st.q).add(st.carPos)
      st.m.lookAt(st.desired, st.look, st.up)
      st.desiredQuat.setFromRotationMatrix(st.m)
      fovTarget = 72
    } else if (mode === 'showcase' || mode === 'cinematic') {
      st.orbit += dt * (mode === 'showcase' ? 0.16 : 0.22)
      const rad = mode === 'showcase' ? 7.4 : 8.5 + Math.sin(st.time * 0.3) * 1.5
      const h = mode === 'showcase' ? 1.35 + Math.sin(st.time * 0.25) * 0.35 : 1.4 + Math.sin(st.time * 0.4) * 0.6
      st.desired.set(st.carPos.x + Math.cos(st.orbit) * rad, st.carPos.y + h, st.carPos.z + Math.sin(st.orbit) * rad)
      st.look.copy(st.carPos).add(st.tmp.set(0, 0.55, 0))
      // cinematic follows a moving car: lead along velocity
      if (mode === 'cinematic') st.desired.addScaledVector(st.tmp.set(v.x, 0, v.z), 0.25)
      st.m.lookAt(st.desired, st.look, WORLD_UP)
      st.desiredQuat.setFromRotationMatrix(st.m)
      fovTarget = mode === 'showcase' ? 34 : 40
    } else if (mode === 'chase' || mode === 'close') {
      const m = MODES[mode]
      // heading follows velocity at speed (so drifts show the car's angle), body forward when slow/reversing
      const flatFwd = st.tmp.copy(st.fwd).setY(0).normalize()
      let targetHeading = flatFwd
      if (speed > 5 && sim.telemetry.forwardSpeed > 0) {
        const vel = new THREE.Vector3(v.x, 0, v.z).normalize()
        targetHeading = vel.lerp(flatFwd, 0.45).normalize()
      }
      st.heading.lerp(targetHeading, 1 - Math.exp(-dt * (speed > 5 ? 4.5 : 3))).normalize()
      const distK = m.dist + Math.min(kmh, 300) / 300 * 1.1
      st.desired.copy(st.carPos).addScaledVector(st.heading, -distK)
      st.desired.y = st.carPos.y + m.height + Math.min(kmh, 200) / 200 * 0.15
      st.pos.x = damp(st.pos.x, st.desired.x, m.lag * 1.4, dt)
      st.pos.z = damp(st.pos.z, st.desired.z, m.lag * 1.4, dt)
      st.pos.y = damp(st.pos.y, st.desired.y, m.lag * 0.8, dt)
      st.pos.y = Math.max(st.pos.y, st.carPos.y + 0.6, 0.35)
      st.desired.copy(st.pos)
      st.look.copy(st.carPos).addScaledVector(st.heading, 2.2).add(st.tmp.set(0, m.look, 0))
      st.m.lookAt(st.desired, st.look, WORLD_UP)
      st.desiredQuat.setFromRotationMatrix(st.m)
      fovTarget = m.fov + Math.min(kmh, 280) / 280 * 14 + (sim.telemetry.nitroActive ? 6 : 0)
    } else {
      // hood / cockpit: rigidly attached to the chassis
      const m = MODES[mode]
      st.desired.set(...m.local).applyQuaternion(st.q).add(st.carPos)
      st.look.set(m.local[0], m.local[1] - 0.12, m.local[2] - 10).applyQuaternion(st.q).add(st.carPos)
      st.m.lookAt(st.desired, st.look, st.up)
      st.desiredQuat.setFromRotationMatrix(st.m)
      fovTarget = m.fov + Math.min(kmh, 280) / 280 * 8 + (sim.telemetry.nitroActive ? 4 : 0)
    }

    // High-speed shake (very subtle) — scaled by speed, stronger on rough surfaces
    let shakeAmp = 0
    if (!showcase && !showroom && mode !== 'cinematic' && mode !== 'orbit') {
      shakeAmp = Math.max(0, (kmh - 120) / 180) * 0.025
      if (sim.telemetry.surface !== 'ASPHALT' && kmh > 20) shakeAmp += 0.012
      if (sim.telemetry.nitroActive) shakeAmp += 0.01
    }
    st.shake.set(
      Math.sin(st.time * 37.1) * Math.sin(st.time * 13.3),
      Math.sin(st.time * 41.7) * Math.cos(st.time * 9.1),
      0,
    ).multiplyScalar(shakeAmp)

    // Debug / photo hook: window.__m4.debugCam = { offset: [x,y,z] (car-local), look: [x,y,z] }
    const dbg = typeof window !== 'undefined' && window.__m4?.debugCam
    if (dbg) {
      if (dbg.worldPos) {
        st.desired.set(...dbg.worldPos)
        st.look.set(...dbg.worldLook)
      } else {
        st.desired.set(...dbg.offset).applyQuaternion(st.q).add(st.carPos)
        st.look.set(...(dbg.look || [0, 0.6, 0])).applyQuaternion(st.q).add(st.carPos)
      }
      st.m.lookAt(st.desired, st.look, WORLD_UP)
      st.desiredQuat.setFromRotationMatrix(st.m)
      fovTarget = dbg.fov || 40
      st.blend = 1
      shakeAmp = 0
      st.shake.set(0, 0, 0)
    }

    // Blend from the previous camera pose on mode change
    if (st.blend < 1) {
      st.blend = Math.min(1, st.blend + dt / 0.55)
      const t = st.blend * st.blend * (3 - 2 * st.blend)
      camera.position.lerpVectors(st.fromPos, st.desired, t)
      camera.quaternion.slerpQuaternions(st.fromQuat, st.desiredQuat, t)
    } else {
      camera.position.copy(st.desired)
      camera.quaternion.copy(st.desiredQuat)
    }
    camera.position.add(st.shake)

    st.fov = damp(st.fov, fovTarget, 3, dt)
    if (Math.abs(camera.fov - st.fov) > 0.01) {
      camera.fov = st.fov
      camera.near = mode === 'cockpit' || mode === 'hood' || (mode === 'showroom' && orbit.interior) ? 0.05 : 0.1
      camera.updateProjectionMatrix()
    }
  })
  return null
}
