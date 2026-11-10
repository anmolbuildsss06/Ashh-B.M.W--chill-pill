// Headless driving tests: runs the real VehicleSim against Rapier in Node.
// Usage: node scripts/physics-test.mjs
import RAPIER from '@dimforge/rapier3d-compat'
import { VehicleSim, createInput, chassisMassProps } from '../src/vehicle/VehicleSim.js'
import { BMW_M4_COMPETITION as spec } from '../src/config/cars.js'
import { SURFACES } from '../src/world/surfaces.js'

await RAPIER.init()
const DT = 1 / 60

function makeWorld(surfaceFn = () => SURFACES.asphalt) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = DT
  world.createCollider(RAPIER.ColliderDesc.cuboid(5000, 0.5, 5000).setTranslation(0, -0.5, 0).setFriction(1))
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.8, 0).setCanSleep(false))
  const mp = chassisMassProps(spec)
  const c = spec.collider
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setTranslation(0, c.y, 0)
      .setMassProperties(mp.mass, mp.centerOfMass, mp.principalAngularInertia, mp.angularInertiaLocalFrame)
      .setFriction(0.3),
    body,
  )
  const sim = new VehicleSim(world, body, spec, (x, z) => surfaceFn(x, z))
  return { world, body, sim }
}

function run(ctx, seconds, inputFn, onStep) {
  const steps = Math.round(seconds / DT)
  for (let i = 0; i < steps; i++) {
    const input = inputFn(i * DT, ctx.sim.telemetry)
    const t = ctx.sim.update(DT, input)
    ctx.world.step()
    if (onStep && onStep(i * DT, t, ctx) === true) return i * DT
  }
  return seconds
}

const inp = (o = {}) => ({ ...createInput(), ...o })
const settle = (ctx) => run(ctx, 2.0, () => inp())
const results = []
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  — ${detail}`) }

// 1. Rest height & stability
{
  const ctx = makeWorld()
  settle(ctx)
  const p = ctx.body.translation()
  const v = ctx.body.linvel()
  check('Settles on suspension', p.y > 0.05 && p.y < 0.3 && Math.hypot(v.x, v.y, v.z) < 0.1, `y=${p.y.toFixed(3)} |v|=${Math.hypot(v.x, v.y, v.z).toFixed(3)}`)
}

// 2. Throttle direction + 0-100 km/h
let sign = 1
{
  const ctx = makeWorld()
  settle(ctx)
  run(ctx, 0.5, () => inp({ throttle: 1 }))
  if (ctx.sim.telemetry.forwardSpeed < 0) sign = -1
  console.log(`  engine sign: ${sign}`)
}
{
  const ctx = makeWorld(); 
  settle(ctx)
  let t100 = null, t200 = null, maxGear = 1
  globalThis.asphalt100 = () => t100
  const z0 = ctx.body.translation().z
  run(ctx, 40, () => inp({ throttle: 1 }), (t, tel) => {
    maxGear = Math.max(maxGear, tel.gear)
    if (t100 === null && tel.speedKmh >= 100) t100 = t
    if (t200 === null && tel.speedKmh >= 200) t200 = t
  })
  const vmax = ctx.sim.telemetry.speedKmh
  const dz = ctx.body.translation().z - z0
  check('Throttle drives forward (-Z)', dz < -50, `dz=${dz.toFixed(0)} m`)
  check('0-100 km/h in 3.4–4.6 s', t100 !== null && t100 > 3.4 && t100 < 4.6, `${t100?.toFixed(2)} s`)
  check('0-200 km/h under 15 s', t200 !== null && t200 < 15, `${t200?.toFixed(2)} s`)
  check('Top speed 270–292 km/h', vmax > 270 && vmax < 292, `${vmax.toFixed(1)} km/h, top gear ${maxGear}`)
  const p = ctx.body.translation()
  check('Stays straight at full throttle', Math.abs(p.x) < 3, `x drift ${p.x.toFixed(2)} m`)
}

// 3. Braking 100-0
{
  const ctx = makeWorld(); 
  settle(ctx)
  run(ctx, 20, () => inp({ throttle: 1 }), (t, tel) => tel.speedKmh >= 100)
  const z0 = ctx.body.translation().z
  run(ctx, 10, () => inp({ brake: 1 }), (t, tel) => tel.speedKmh < 0.5)
  const dist = Math.abs(ctx.body.translation().z - z0)
  check('Braking 100-0 in 30–45 m', dist > 30 && dist < 45, `${dist.toFixed(1)} m`)
  const yaw = 2 * Math.asin(ctx.body.rotation().y)
  check('Straight-line braking stable', Math.abs(yaw) < 0.05, `yaw ${yaw.toFixed(3)} rad`)
}

// 4. Steering + steady-state cornering at 80 km/h
{
  const ctx = makeWorld(); 
  settle(ctx)
  run(ctx, 20, () => inp({ throttle: 1 }), (t, tel) => tel.speedKmh >= 80)
  let maxLatG = 0, rolled = false, yawSign = 0
  run(ctx, 6, (t, tel) => inp({ throttle: tel.speedKmh < 80 ? 0.6 : 0.2, steer: 1 }), (t, tel, c) => {
    const av = c.body.angvel()
    yawSign = Math.sign(av.y)
    const latG = Math.abs(av.y * tel.speed) / 9.81
    if (t > 2) maxLatG = Math.max(maxLatG, latG)
    if (c.sim.up.y < 0.5) rolled = true
  })
  check('Steer right turns right (yaw rate < 0)', yawSign < 0, `yaw sign ${yawSign}`)
  check('Cornering grip 0.8–1.4 g', maxLatG > 0.8 && maxLatG < 1.4, `${maxLatG.toFixed(2)} g`)
  check('No rollover in hard cornering', !rolled, rolled ? 'rolled' : 'upright')
}

// 5. Handbrake drift initiation at 70 km/h
{
  const ctx = makeWorld(); 
  settle(ctx)
  run(ctx, 20, () => inp({ throttle: 1 }), (t, tel) => tel.speedKmh >= 70)
  let maxSlip = 0, rolled = false, drifted = 0
  run(ctx, 3, (t) => inp({ steer: 1, handbrake: t < 0.6, throttle: t > 0.6 ? 0.8 : 0 }), (t, tel, c) => {
    maxSlip = Math.max(maxSlip, Math.abs(tel.slipAngle))
    if (tel.drifting) drifted += DT
    if (c.sim.up.y < 0.5) rolled = true
  })
  check('Handbrake breaks rear traction', maxSlip > 0.35, `max slip ${(maxSlip * 57.3).toFixed(0)}°, drifting ${drifted.toFixed(2)} s`)
  check('No rollover during drift', !rolled, rolled ? 'rolled' : 'upright')
}

// 6. Reverse
{
  const ctx = makeWorld(); 
  settle(ctx)
  run(ctx, 4, () => inp({ brake: 1 }))
  check('Holding brake at standstill selects R and reverses', ctx.sim.gear === -1 && ctx.sim.telemetry.forwardSpeed < -2, `gear ${ctx.sim.telemetry.gearLabel}, v ${ctx.sim.telemetry.forwardSpeed.toFixed(2)} m/s`)
  run(ctx, 4, () => inp({ throttle: 1 }))
  check('Throttle returns to drive', ctx.sim.gear >= 1 && ctx.sim.telemetry.forwardSpeed > 2, `gear ${ctx.sim.telemetry.gearLabel}`)
}

// 7. Surfaces: grass and dirt are slower and slidier
for (const name of ['grass', 'dirt']) {
  const ctx = makeWorld(() => SURFACES[name]); 
  settle(ctx)
  let t100 = null
  run(ctx, 20, () => inp({ throttle: 1 }), (t, tel) => { if (tel.speedKmh >= 100) { t100 = t; return true } })
  check(`${name}: slower 0-100 than asphalt`, t100 === null || t100 > globalThis.asphalt100() * 1.15, t100 ? `${t100.toFixed(2)} s` : 'never reached 100')
}

// 8. Nitro
{
  const a = makeWorld(); settle(a)
  const b = makeWorld(); settle(b)
  run(a, 8, () => inp({ throttle: 1 }))
  run(b, 8, () => inp({ throttle: 1, nitro: true }))
  check('Nitro increases acceleration', b.sim.telemetry.speedKmh > a.sim.telemetry.speedKmh + 8, `${a.sim.telemetry.speedKmh.toFixed(0)} → ${b.sim.telemetry.speedKmh.toFixed(0)} km/h after 8 s`)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
