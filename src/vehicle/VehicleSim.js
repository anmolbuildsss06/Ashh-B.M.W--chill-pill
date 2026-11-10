// Framework-free vehicle simulation built on Rapier's raycast vehicle controller.
// Used by the React component in the browser and by the Node test harness (scripts/physics-test.mjs).
import { SURFACES } from '../world/surfaces.js'

const TAU = Math.PI * 2
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t
const approach = (v, target, rate) => (v < target ? Math.min(v + rate, target) : Math.max(v - rate, target))

export const WHEEL = { FL: 0, FR: 1, RL: 2, RR: 3 }

function sampleCurve(curve, x) {
  if (x <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    if (x <= curve[i][0]) {
      const [x0, y0] = curve[i - 1]
      const [x1, y1] = curve[i]
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
    }
  }
  return curve[curve.length - 1][1]
}

// Rotate vector v by unit quaternion q (both plain objects); writes to out
function rotate(q, v, out) {
  const { x, y, z } = v
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w
  const ix = qw * x + qy * z - qz * y
  const iy = qw * y + qz * x - qx * z
  const iz = qw * z + qx * y - qy * x
  const iw = -qx * x - qy * y - qz * z
  out.x = ix * qw + iw * -qx + iy * -qz - iz * -qy
  out.y = iy * qw + iw * -qy + iz * -qx - ix * -qz
  out.z = iz * qw + iw * -qz + ix * -qy - iy * -qx
  return out
}

// Mass properties for the chassis: real mass, low centre of mass, box inertia
export function chassisMassProps(spec) {
  const m = spec.mass
  const w = spec.collider.hx * 2, h = spec.collider.hy * 2 + 0.3, l = spec.collider.hz * 2
  return {
    mass: m,
    centerOfMass: { x: 0, y: spec.centerOfMassY, z: 0 },
    principalAngularInertia: {
      x: (m / 12) * (h * h + l * l),
      y: (m / 12) * (w * w + l * l),
      z: (m / 12) * (w * w + h * h),
    },
    angularInertiaLocalFrame: { x: 0, y: 0, z: 0, w: 1 },
  }
}

export function createInput() {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, shiftUp: false, shiftDown: false }
}

export class VehicleSim {
  /**
   * @param world Rapier World
   * @param body  chassis RigidBody
   * @param spec  car spec from config/cars.js
   * @param surfaceAt (x, z) => surface
   */
  constructor(world, body, spec, surfaceAt) {
    this.world = world
    this.body = body
    this.spec = spec
    this.surfaceAt = surfaceAt
    this.settings = { tcs: true, abs: true, stability: true, manual: false }

    const w = spec.wheels
    const c = world.createVehicleController(body)
    c.indexUpAxis = 1
    c.setIndexForwardAxis = 2
    const positions = [
      { x: -w.frontX, y: w.connectionY, z: w.frontZ },
      { x: w.frontX, y: w.connectionY, z: w.frontZ },
      { x: -w.rearX, y: w.connectionY, z: w.rearZ },
      { x: w.rearX, y: w.connectionY, z: w.rearZ },
    ]
    for (let i = 0; i < 4; i++) {
      c.addWheel(positions[i], { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, w.restLength, w.radius)
      c.setWheelSuspensionStiffness(i, w.stiffness)
      c.setWheelSuspensionCompression(i, w.compression)
      c.setWheelSuspensionRelaxation(i, w.relaxation)
      c.setWheelMaxSuspensionTravel(i, w.maxTravel)
      c.setWheelMaxSuspensionForce(i, w.maxSuspensionForce)
      c.setWheelFrictionSlip(i, w.frictionSlip)
      c.setWheelSideFrictionStiffness(i, w.sideFrictionStiffness)
    }
    this.controller = c
    this.wheelPositions = positions

    // Visual state per wheel
    this.wheels = positions.map(() => ({ suspension: w.restLength, spin: 0, steer: 0, contact: false, surface: SURFACES.asphalt, slip: 0 }))

    this.steer = 0
    this.gear = 1 // -1 = R, 0 = N, 1..n
    this.rpm = spec.engine.idleRpm
    this.shiftTimer = 0
    this.reverseHold = 0
    this.nitro = spec.nitro.capacity
    this.nitroActive = false
    this.time = 0
    this.lastShift = 0
    this.tmpA = { x: 0, y: 0, z: 0 }
    this.tmpB = { x: 0, y: 0, z: 0 }
    this.fwd = { x: 0, y: 0, z: -1 }
    this.right = { x: 1, y: 0, z: 0 }
    this.up = { x: 0, y: 1, z: 0 }
    this.telemetry = {
      speed: 0, speedKmh: 0, forwardSpeed: 0, lateralSpeed: 0, rpm: this.rpm, gear: 1, gearLabel: '1',
      throttle: 0, brake: 0, steer: 0, nitro: 1, nitroActive: false, surface: 'ASPHALT', slipAngle: 0,
      drifting: false, wheelsOnGround: 4, shifting: false, tcsActive: false, absActive: false,
    }
  }

  get gearCount() { return this.spec.gearbox.ratios.length }

  gearRatio(g = this.gear) {
    const gb = this.spec.gearbox
    if (g === -1) return -gb.reverse
    if (g === 0) return 0
    return gb.ratios[g - 1]
  }

  wheelRpmFor(speed, g) {
    const r = this.spec.wheels.radius
    return Math.abs(speed / r * this.gearRatio(g) * this.spec.gearbox.finalDrive * 60 / TAU)
  }

  shift(to) {
    if (to === this.gear) return
    this.gear = to
    this.shiftTimer = this.spec.gearbox.shiftTime
    this.lastShift = this.time
  }

  reset(position, yaw = 0) {
    const b = this.body
    b.setTranslation({ x: position[0], y: position[1], z: position[2] }, true)
    b.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
    b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    b.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.gear = 1
    this.rpm = this.spec.engine.idleRpm
    this.steer = 0
  }

  update(dt, input) {
    const { spec, body, controller: c, settings } = this
    const eng = spec.engine
    const gb = spec.gearbox
    const W = spec.wheels
    this.time += dt

    // ---- Frame vectors ----
    const q = body.rotation()
    const lv = body.linvel()
    rotate(q, { x: 0, y: 0, z: -1 }, this.fwd)
    rotate(q, { x: 1, y: 0, z: 0 }, this.right)
    rotate(q, { x: 0, y: 1, z: 0 }, this.up)
    const fwdSpeed = lv.x * this.fwd.x + lv.y * this.fwd.y + lv.z * this.fwd.z
    const latSpeed = lv.x * this.right.x + lv.y * this.right.y + lv.z * this.right.z
    const speed = Math.hypot(lv.x, lv.y, lv.z)
    const absFwd = Math.abs(fwdSpeed)

    // ---- Wheels on ground / surfaces ----
    let grounded = 0
    let rearLoad = 0
    let surfDrag = 0
    let mainSurface = SURFACES.asphalt
    for (let i = 0; i < 4; i++) {
      const wh = this.wheels[i]
      wh.contact = c.wheelIsInContact(i)
      if (wh.contact) {
        grounded++
        const p = c.wheelContactPoint(i)
        if (p) wh.surface = this.surfaceAt(p.x, p.z)
        surfDrag += wh.surface.drag * 0.25
        if (i >= 2) rearLoad += c.wheelSuspensionForce(i) || 0
      }
    }
    // surface shown in HUD = majority under rear wheels
    mainSurface = this.wheels[2].surface === this.wheels[3].surface ? this.wheels[2].surface : this.wheels[0].surface

    // ---- Slip angle / drift ----
    const slipAngle = speed > 3 ? Math.atan2(latSpeed, Math.max(absFwd, 0.5)) : 0
    const drifting = speed > 9 && Math.abs(slipAngle) > 0.2 && grounded >= 3

    // ---- Steering (speed sensitive, with counter-steer freedom while sliding) ----
    const st = spec.steering
    const speedT = clamp(absFwd / 55, 0, 1)
    let maxSteer = lerp(st.maxAngleLow, st.maxAngleHigh, Math.pow(speedT, 0.7))
    if (drifting) maxSteer = Math.max(maxSteer, 0.42)
    const target = clamp(input.steer, -1, 1)
    const rate = (Math.sign(target) !== Math.sign(this.steer) || target === 0 ? st.returnRate : st.rate) * dt
    this.steer = approach(this.steer, target, rate)
    let steerAngle = -this.steer * maxSteer
    if (settings.stability && drifting && Math.abs(input.steer) < 0.1) {
      // gentle auto counter-steer when the driver lets go mid-slide
      steerAngle += clamp(slipAngle * 0.45, -0.25, 0.25)
    }
    c.setWheelSteering(WHEEL.FL, steerAngle)
    c.setWheelSteering(WHEEL.FR, steerAngle)

    // ---- Direction intent: forward / reverse ----
    let throttle = clamp(input.throttle, 0, 1)
    let brake = clamp(input.brake, 0, 1)
    if (!settings.manual) {
      if (this.gear > 0 && fwdSpeed < 0.8 && brake > 0.1 && throttle < 0.1) {
        this.reverseHold += dt
        if (this.reverseHold > 0.2) this.shift(-1)
      } else if (this.gear === -1 && fwdSpeed > -0.8 && throttle > 0.1 && brake < 0.1) {
        this.reverseHold += dt
        if (this.reverseHold > 0.15) this.shift(1)
      } else this.reverseHold = 0
    }
    if (this.gear === -1) {
      // in reverse the brake pedal drives backwards, throttle brakes
      const t = throttle
      throttle = brake
      brake = t
    }

    // ---- Gearbox ----
    if (this.shiftTimer > 0) this.shiftTimer -= dt
    const wheelRpm = this.wheelRpmFor(fwdSpeed, this.gear)
    if (settings.manual) {
      if (input.shiftUp && this.gear < this.gearCount) this.shift(this.gear === -1 ? 0 : this.gear + 1)
      if (input.shiftDown && this.gear > -1) {
        const lower = this.gear - 1
        if (lower <= 0 || this.wheelRpmFor(fwdSpeed, lower) < eng.limiterRpm) this.shift(lower)
      }
    } else if (this.gear > 0 && this.shiftTimer <= 0 && this.time - this.lastShift > 0.35) {
      if (wheelRpm > gb.upshiftRpm && this.gear < this.gearCount && grounded >= 2) this.shift(this.gear + 1)
      else if (this.gear > 1) {
        const downAt = gb.downshiftRpm * 0.7 + 2600 * throttle
        if (wheelRpm < downAt && this.wheelRpmFor(fwdSpeed, this.gear - 1) < gb.upshiftRpm - 600) this.shift(this.gear - 1)
      }
    }

    // ---- Engine RPM (with launch "clutch slip" in low gears) ----
    let targetRpm = Math.max(eng.idleRpm, wheelRpm)
    if (this.gear === 0) targetRpm = eng.idleRpm + throttle * (eng.redlineRpm - eng.idleRpm)
    else if ((this.gear === 1 || this.gear === -1) && wheelRpm < 3000) targetRpm = Math.max(targetRpm, eng.idleRpm + throttle * 2600)
    if (grounded === 0) targetRpm = eng.idleRpm + throttle * (eng.redlineRpm - eng.idleRpm)
    this.rpm = lerp(this.rpm, Math.min(targetRpm, eng.limiterRpm + 100), 1 - Math.exp(-dt * (this.shiftTimer > 0 ? 25 : 14)))

    // ---- Drive force ----
    const ratio = this.gearRatio()
    let driveForce = 0
    if (this.gear !== 0 && this.shiftTimer <= 0) {
      const limiterCut = this.rpm >= eng.limiterRpm ? 0 : 1
      const torque = sampleCurve(eng.torqueCurve, this.rpm) * throttle * limiterCut
      driveForce = torque * ratio * gb.finalDrive * eng.drivetrainEfficiency / W.radius
    }
    if (driveForce > 0) driveForce *= clamp((spec.topSpeedKmh - fwdSpeed * 3.6) / 6, 0, 1) // soft limiter
    if (this.gear === -1 && -fwdSpeed > 9) driveForce = 0 // reverse speed limit ~32 km/h

    // Traction control: cap rear force at available grip
    const rearGrip = (this.wheels[2].surface.grip + this.wheels[3].surface.grip) * 0.5
    const gripLimit = Math.max(rearLoad, spec.mass * 9.81 * 0.45) * W.frictionSlip * rearGrip
    let tcsActive = false
    // (Rapier weights longitudinal impulse at 0.5 in the friction circle, hence the 2x headroom)
    const cap = gripLimit * (settings.tcs ? 0.95 : 1.8)
    if (Math.abs(driveForce) > cap) { driveForce = Math.sign(driveForce) * cap; tcsActive = settings.tcs }

    // Rapier engine force sign: positive = towards -Z (local forward) — verified in tests
    // Rapier ignores brakes on a wheel with non-zero engine force, so never mix them
    if (brake > 0.05) driveForce = 0
    const engineSign = this.engineSign ?? -1
    c.setWheelEngineForce(WHEEL.FL, 0)
    c.setWheelEngineForce(WHEEL.FR, 0)
    c.setWheelEngineForce(WHEEL.RL, engineSign * driveForce * 0.5)
    c.setWheelEngineForce(WHEEL.RR, engineSign * driveForce * 0.5)

    // ---- Brakes (+ simple ABS) ----
    const br = spec.brakes
    let brakeF = brake * br.force * (this.gear === -1 ? 0.6 : 1)
    let absActive = false
    if (settings.abs && brake > 0 && absFwd > 3) {
      // pulse slightly to keep steering authority
      const pulse = 0.82 + 0.18 * Math.sin(this.time * 60)
      brakeF *= pulse
      absActive = true
    }
    if (absFwd < 0.4 && brake > 0 && this.gear !== -1) brakeF = br.force // hold at standstill
    const fb = br.frontBias
    c.setWheelBrake(WHEEL.FL, brakeF * fb)
    c.setWheelBrake(WHEEL.FR, brakeF * fb)
    const hb = input.handbrake ? br.handbrake : 0
    c.setWheelBrake(WHEEL.RL, brakeF * (1 - fb) + hb)
    c.setWheelBrake(WHEEL.RR, brakeF * (1 - fb) + hb)

    // ---- Grip per wheel (surface, handbrake, drift helper) ----
    const holdDrift = drifting && throttle > 0.4
    for (let i = 0; i < 4; i++) {
      const s = this.wheels[i].surface
      let slip = W.frictionSlip * s.grip
      let side = W.sideFrictionStiffness * s.sideGrip
      if (i >= 2) {
        if (input.handbrake) { slip *= 0.45; side *= 0.45 }
        else if (holdDrift) { side *= 0.72 }
      }
      c.setWheelFrictionSlip(i, slip)
      c.setWheelSideFrictionStiffness(i, side)
    }

    // ---- Nitro ----
    const nc = spec.nitro
    this.nitroActive = input.nitro && this.nitro > 0.01 && this.gear > 0 && grounded >= 2
    if (this.nitroActive) this.nitro = Math.max(0, this.nitro - nc.burnRate * dt)
    else this.nitro = Math.min(nc.capacity, this.nitro + nc.regenRate * dt * (drifting ? 3 : 1))

    // ---- External forces as impulses (drag, downforce, rolling, nitro) ----
    const imp = this.tmpA
    const hs = Math.hypot(lv.x, lv.z)
    const dragMag = spec.aero.dragArea * speed * speed + surfDrag * clamp(hs / 3, 0, 1)
    let rr = spec.aero.rollingResistance * hs
    for (let i = 0; i < 4; i++) if (this.wheels[i].contact) rr += 0.25 * spec.aero.rollingResistance * (this.wheels[i].surface.rolling - 1) * hs
    // engine braking (applied to the chassis so it never blocks the brake path)
    let engineBrake = 0
    if (throttle < 0.05 && this.gear !== 0 && absFwd > 1 && grounded > 0) {
      engineBrake = eng.engineBrakeTorque * Math.abs(ratio) * gb.finalDrive / W.radius * 0.5 * Math.sign(fwdSpeed)
    }
    const resist = speed > 0.05 ? (dragMag + rr) / speed : 0
    imp.x = -lv.x * resist * dt
    imp.y = -lv.y * spec.aero.dragArea * speed * dt
    imp.z = -lv.z * resist * dt
    if (grounded > 0) {
      const dfm = spec.aero.downforce * fwdSpeed * fwdSpeed * dt
      imp.x -= this.up.x * dfm
      imp.y -= this.up.y * dfm
      imp.z -= this.up.z * dfm
    }
    imp.x -= this.fwd.x * engineBrake * dt
    imp.z -= this.fwd.z * engineBrake * dt
    if (this.nitroActive) {
      const n = nc.force * dt
      imp.x += this.fwd.x * n
      imp.y += this.fwd.y * n
      imp.z += this.fwd.z * n
    }
    body.applyImpulse(imp, true)

    // ---- Stability: yaw damping when gripping, light air control, anti-roll ----
    const av = body.angvel()
    if (settings.stability && !drifting && !input.handbrake && grounded >= 3) {
      // damp excess yaw rate relative to what the steering asks for
      const desiredYaw = (fwdSpeed / spec.body.wheelbase) * Math.tan(steerAngle)
      const yawErr = av.y - desiredYaw
      const k = 0.5 * spec.mass * dt * clamp(speed / 20, 0, 1)
      body.applyTorqueImpulse({ x: 0, y: -yawErr * k, z: 0 }, true)
    }
    if (grounded === 0) {
      // in the air: level the car gently so jumps land on wheels
      const levelK = 1200 * dt
      body.applyTorqueImpulse({ x: this.up.z * levelK, y: 0, z: -this.up.x * levelK }, true)
    }

    c.updateVehicle(dt)

    // ---- Wheel visuals ----
    for (let i = 0; i < 4; i++) {
      const wh = this.wheels[i]
      wh.suspension = c.wheelSuspensionLength(i) ?? W.restLength
      wh.spin = c.wheelRotation(i) ?? 0
      wh.steer = c.wheelSteering(i) ?? 0
      wh.slip = i >= 2 ? (drifting || input.handbrake && speed > 4 ? 1 : 0) : 0
    }

    // ---- Telemetry ----
    const t = this.telemetry
    t.speed = speed
    t.speedKmh = Math.abs(fwdSpeed) * 3.6
    t.forwardSpeed = fwdSpeed
    t.lateralSpeed = latSpeed
    t.rpm = this.rpm
    t.gear = this.gear
    t.gearLabel = this.gear === -1 ? 'R' : this.gear === 0 ? 'N' : String(this.gear)
    t.throttle = input.throttle
    t.brake = input.brake
    t.steer = this.steer
    t.nitro = this.nitro
    t.nitroActive = this.nitroActive
    t.surface = mainSurface.label
    t.slipAngle = slipAngle
    t.drifting = drifting
    t.wheelsOnGround = grounded
    t.shifting = this.shiftTimer > 0
    t.tcsActive = tcsActive
    t.absActive = absActive
    return t
  }

  dispose() {
    try { this.world.removeVehicleController(this.controller) } catch { /* world already freed */ }
  }
}
