// Ponies roaming the map — "MirceaKitsune's Gmod ponies" (MirceaKitsune, Blend Swap #62439, CC-BY 3.0, fan art).
// The rigs ship without animations, so walking, trotting, grazing, take-off, flapping and gliding are
// procedural: on load each pony calibrates which local axis of each limb/wing bone swings the hoof forward
// (or lifts the wing), then the gait is driven from that. Pegasi fly loops over the map and land to graze;
// everyone else wanders in their home area and scatters when the car comes close.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useGame } from '../store/useGame.js'
import { surfaceAt } from './surfaces.js'
import { carState } from '../vehicle/carState.js'

const url = (n) => `/models/ponies/pony-${n}.glb`
const SCALE = 0.55 // model is ~2.2 units tall → ~1.2 m

// name, can fly, home (centre x, z, radius), walk speed
const CAST = [
  { name: 'rainbow', fly: true, home: [60, -150, 120], speed: 15 },
  { name: 'fluttershy', fly: true, home: [-150, 40, 60], speed: 6.5 },
  { name: 'derpy', fly: true, home: [-40, 120, 110], speed: 9 },
  { name: 'twilight', home: [-165, -22, 28] },
  { name: 'pinkie', home: [55, 30, 30] },
  { name: 'applejack', home: [-60, -60, 40] },
  { name: 'rarity', home: [-200, 22, 30] },
  { name: 'lyra', home: [10, -75, 30] },
  { name: 'bonbon', home: [-10, -80, 30] },
  { name: 'trixie', home: [150, 130, 40] },
]
export const PONY_COUNT = { low: 5, medium: 8, high: 10 }

const UP = new THREE.Vector3(0, 1, 0)
const FWD = new THREE.Vector3(0, 0, 1)
const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
const rand = (a, b) => a + Math.random() * (b - a)
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt))
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))

/** Find the local axis (and sign) of `bone` whose rotation moves `tip` most along `dir` (root space). */
function calibrate(root, bone, tip, dir, avoid) {
  const rest = bone.quaternion.clone()
  root.updateMatrixWorld(true)
  const p0 = tip.getWorldPosition(new THREE.Vector3())
  let best = { axis: AXES[0], sign: 1, score: -1 }
  for (const axis of AXES) {
    bone.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromAxisAngle(axis, 0.35))
    root.updateMatrixWorld(true)
    const d = tip.getWorldPosition(new THREE.Vector3()).sub(p0)
    const along = d.dot(dir)
    const off = avoid ? Math.abs(d.dot(avoid)) : 0
    const score = Math.abs(along) - off * 0.6
    if (score > best.score) best = { axis, sign: Math.sign(along) || 1, score }
  }
  bone.quaternion.copy(rest)
  root.updateMatrixWorld(true)
  return { bone, rest, axis: best.axis, sign: best.sign }
}

function buildRig(scene) {
  const root = cloneSkinned(scene)
  const bones = {}
  root.traverse((o) => {
    if (o.isBone) bones[o.name] = o
    if (o.isMesh) {
      o.castShadow = true
      o.frustumCulled = false
      if (o.material?.map) o.material.map.anisotropy = 4
    }
  })
  const wingsSpread = [], wingsFolded = []
  root.traverse((o) => {
    if (!o.isMesh) return
    if (/wings_spread/.test(o.name)) { wingsSpread.push(o); o.visible = false }
    if (/wings_folded/.test(o.name)) wingsFolded.push(o)
  })
  const X = new THREE.Vector3(1, 0, 0)
  const legs = {}
  for (const side of ['left', 'right']) {
    const b = (n) => bones[`${n}_${side}`]
    if (b('Hip')) {
      legs[`hind_${side}`] = {
        hip: calibrate(root, b('Hip'), b('Foot'), FWD, X),
        knee: calibrate(root, b('Leg'), b('Foot'), FWD.clone().negate(), X), // positive = hoof tucks back
      }
    }
    if (b('Shoulder')) {
      legs[`fore_${side}`] = {
        hip: calibrate(root, b('Shoulder'), b('Hand'), FWD, X),
        knee: calibrate(root, b('Forearm'), b('Hand'), FWD.clone().negate(), X),
      }
    }
  }
  const wings = []
  for (const side of ['left', 'right']) {
    const base = bones[`Wing_base_${side}`], lower = bones[`Wing_lower_${side}`], upper = bones[`Wing_upper_${side}`]
    if (base && lower && upper && wingsSpread.length) {
      wings.push({
        base: calibrate(root, base, upper, UP),
        lower: calibrate(root, lower, upper, UP),
      })
    }
  }
  const neck = bones.Neck && bones.Head ? calibrate(root, bones.Neck, bones.Head, UP.clone().negate(), X) : null // + = head down
  const tail = bones.Tail ? { ...calibrate(root, bones.Tail, bones.Tail.children[0] || bones.Tail, X), lift: null } : null
  return { root, bones, legs, wings, neck, tail, wingsSpread, wingsFolded }
}

const tmpQ = new THREE.Quaternion()
function pose(j, angle) {
  if (!j) return
  j.bone.quaternion.copy(j.rest).multiply(tmpQ.setFromAxisAngle(j.axis, angle * j.sign))
}

function Pony({ cast }) {
  const { scene } = useGLTF(url(cast.name))
  const rig = useMemo(() => buildRig(scene), [scene])
  const group = useRef()
  const s = useMemo(() => {
    const [hx, hz] = cast.home
    return {
      pos: new THREE.Vector3(hx + rand(-6, 6), 0, hz + rand(-6, 6)),
      yaw: rand(-Math.PI, Math.PI),
      speed: 0, phase: rand(0, 6), flap: rand(0, 6),
      mode: cast.fly ? 'fly' : 'idle', // idle | walk | graze | flee | fly | land | takeoff
      timer: cast.fly ? rand(25, 70) : rand(1, 4),
      target: new THREE.Vector3(hx, 0, hz),
      altitude: cast.fly ? rand(14, 30) : 0,
      orbit: rand(0, Math.PI * 2), orbitR: rand(35, 70),
      headDown: 0, bank: 0, pitch: 0, flyBlend: cast.fly ? 1 : 0,
    }
  }, [cast])
  useEffect(() => {
    if (cast.fly) s.pos.y = s.altitude
    // test/debug hook: window.__m4.ponies[name] = live state
    const reg = (window.__m4 = window.__m4 || {}).ponies = window.__m4.ponies || {}
    reg[cast.name] = s
    return () => { delete reg[cast.name] }
  }, [cast, s])

  const pickGroundTarget = (r) => {
    const [hx, hz, hr] = cast.home
    for (let k = 0; k < 20; k++) {
      const a = rand(0, Math.PI * 2), d = rand(0, r ?? hr)
      const x = hx + Math.cos(a) * d, z = hz + Math.sin(a) * d
      if (surfaceAt(x, z).id === 'grass') return s.target.set(x, 0, z)
    }
    return s.target.set(hx, 0, hz)
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    if (useGame.getState().phase === 'paused') return
    const g = group.current
    if (!g) return
    s.timer -= dt

    // ---- car awareness ----
    let carDist = 1e9, away = null
    const body = carState.body
    if (body) {
      const c = body.translation(), v = body.linvel()
      carDist = Math.hypot(c.x - s.pos.x, c.z - s.pos.z)
      const carSpeed = Math.hypot(v.x, v.z)
      if (carDist < 14 && carSpeed > 2 && s.pos.y < 1.5 && s.mode !== 'fly' && s.mode !== 'takeoff') {
        away = Math.atan2(s.pos.x - c.x, s.pos.z - c.z)
        if (cast.fly && carDist < 9) { s.mode = 'takeoff'; s.timer = 2.5; s.altitude = rand(14, 28) }
        else if (s.mode !== 'flee') { s.mode = 'flee'; s.timer = rand(2.5, 4) }
      }
    }

    // ---- behaviour ----
    let targetSpeed = 0, desiredYaw = s.yaw, graze = 0
    const toTarget = () => Math.atan2(s.target.x - s.pos.x, s.target.z - s.pos.z)
    switch (s.mode) {
      case 'idle':
        if (s.timer < 0) {
          if (cast.fly && Math.random() < 0.8) { s.mode = 'takeoff'; s.timer = 2.5; s.altitude = rand(14, 30) }
          else { s.mode = Math.random() < 0.6 ? 'walk' : 'graze'; s.timer = rand(4, 9); pickGroundTarget() }
        }
        break
      case 'graze':
        graze = 1
        if (s.timer < 0) { s.mode = 'idle'; s.timer = rand(1, 3) }
        break
      case 'walk': {
        desiredYaw = toTarget()
        const d = Math.hypot(s.target.x - s.pos.x, s.target.z - s.pos.z)
        targetSpeed = d > 1 ? 1.5 : 0
        if (d < 1 || s.timer < 0) { s.mode = Math.random() < 0.5 ? 'graze' : 'idle'; s.timer = rand(2, 6) }
        break
      }
      case 'flee':
        if (away !== null) desiredYaw = away + rand(-0.3, 0.3) * 0
        targetSpeed = 6.5
        if (s.timer < 0) { s.mode = 'idle'; s.timer = rand(1, 3) }
        break
      case 'takeoff':
        targetSpeed = cast.speed * 0.5
        s.pos.y = damp(s.pos.y, s.altitude, 0.9, dt)
        if (s.pos.y > s.altitude - 2) { s.mode = 'fly'; s.timer = rand(35, 80) }
        break
      case 'fly': {
        // circle over the home area with a wandering radius; ponies bank into turns
        const [hx, hz, hr] = cast.home
        s.orbit += (cast.speed / s.orbitR) * dt
        s.orbitR = damp(s.orbitR, hr * (0.45 + 0.35 * Math.sin(s.orbit * 0.37)), 0.3, dt)
        s.target.set(hx + Math.cos(s.orbit) * s.orbitR, 0, hz + Math.sin(s.orbit) * s.orbitR)
        desiredYaw = toTarget()
        targetSpeed = cast.speed
        const alt = s.altitude + Math.sin(s.orbit * 2.3) * 4 + (cast.name === 'derpy' ? Math.sin(s.flap * 0.21) * 3 : 0)
        s.pos.y = damp(s.pos.y, alt, 0.8, dt)
        if (s.timer < 0) { s.mode = 'land'; pickGroundTarget(cast.home[2] * 0.6) }
        break
      }
      case 'land': {
        desiredYaw = toTarget()
        const d = Math.hypot(s.target.x - s.pos.x, s.target.z - s.pos.z)
        targetSpeed = Math.min(cast.speed, 1.5 + d * 0.35)
        s.pos.y = damp(s.pos.y, Math.min(s.pos.y, d * 0.5), 1.2, dt)
        if (s.pos.y < 0.15 && d < 3) { s.pos.y = 0; s.mode = 'graze'; s.timer = rand(4, 8) }
        break
      }
    }

    // ---- integrate ----
    const flying = s.mode === 'fly' || s.mode === 'takeoff' || s.mode === 'land'
    const turnRate = flying ? 1.4 : 3.2
    const dy = wrapAngle(desiredYaw - s.yaw)
    s.yaw += THREE.MathUtils.clamp(dy, -turnRate * dt, turnRate * dt)
    s.speed = damp(s.speed, targetSpeed, flying ? 1.2 : 4, dt)
    s.pos.x += Math.sin(s.yaw) * s.speed * dt
    s.pos.z += Math.cos(s.yaw) * s.speed * dt
    if (!flying) s.pos.y = 0
    // keep walkers on grass (step back if they wandered onto tarmac)
    if (!flying && surfaceAt(s.pos.x, s.pos.z).id === 'asphalt' && s.mode !== 'flee') {
      s.pos.x -= Math.sin(s.yaw) * s.speed * dt * 2
      s.pos.z -= Math.cos(s.yaw) * s.speed * dt * 2
      s.yaw += Math.PI * 0.5
      pickGroundTarget()
    }
    s.flyBlend = damp(s.flyBlend, flying && s.pos.y > 0.3 ? 1 : 0, 4, dt)
    s.bank = damp(s.bank, flying ? THREE.MathUtils.clamp(-dy * 1.6, -0.6, 0.6) : 0, 3, dt)
    s.pitch = damp(s.pitch, s.mode === 'takeoff' ? -0.35 : s.mode === 'land' ? 0.15 : 0, 2, dt)
    s.headDown = damp(s.headDown, graze, 2.5, dt)

    g.position.copy(s.pos)
    g.rotation.set(s.pitch, s.yaw, s.bank, 'YXZ')

    // ---- animate ----
    const gaitSpeed = flying ? 0 : s.speed
    s.phase += dt * (gaitSpeed < 3 ? 2.2 + gaitSpeed * 1.6 : 4 + gaitSpeed * 0.75)
    const amp = Math.min(1, gaitSpeed / 1.5) * (gaitSpeed > 3 ? 0.55 : 0.38)
    const L = rig.legs
    const step = (leg, off) => {
      if (!leg) return
      const ph = s.phase + off
      const fb = s.flyBlend
      const hip = Math.sin(ph) * amp
      const knee = Math.max(0, Math.sin(ph + Math.PI / 2)) * amp * 1.4
      // flying: tuck legs back
      pose(leg.hip, hip * (1 - fb) - 0.55 * fb)
      pose(leg.knee, knee * (1 - fb) + 0.9 * fb)
    }
    // trot: diagonal pairs move together
    step(L.fore_left, 0); step(L.hind_right, 0.15)
    step(L.fore_right, Math.PI); step(L.hind_left, Math.PI + 0.15)
    if (rig.neck) pose(rig.neck, s.headDown * 0.9 + Math.sin(s.phase * 2) * 0.04 * amp - s.flyBlend * 0.2)
    if (rig.tail) pose(rig.tail, Math.sin(s.phase * 0.7 + 1) * (0.15 + amp * 0.3) + Math.sin(_.clock.elapsedTime * 1.3) * 0.08)
    // body bob while walking
    g.position.y += Math.abs(Math.sin(s.phase)) * amp * 0.06

    // wings
    const spread = s.flyBlend > 0.05
    for (const w of rig.wingsSpread) w.visible = spread
    for (const w of rig.wingsFolded) w.visible = !spread
    if (spread) {
      const climbing = s.mode === 'takeoff' ? 1.6 : 1
      s.flap += dt * (cast.name === 'rainbow' ? 9 : 6.5) * climbing
      // flap hard when slow/climbing, glide (small flutter) when cruising fast
      const glide = s.mode === 'fly' && Math.sin(s.flap * 0.11) > 0.35 ? 0.25 : 1
      const f = Math.sin(s.flap)
      for (const w of rig.wings) {
        pose(w.base, f * 0.55 * glide)
        pose(w.lower, Math.sin(s.flap - 0.6) * 0.35 * glide)
      }
    }
  })

  return (
    <group ref={group} scale={SCALE}>
      <primitive object={rig.root} />
    </group>
  )
}

export default function Ponies() {
  const quality = useGame((s) => s.quality)
  const cast = useMemo(() => {
    const n = PONY_COUNT[quality]
    // always keep the three flyers
    return [...CAST.filter((c) => c.fly), ...CAST.filter((c) => !c.fly)].slice(0, n)
  }, [quality])
  return cast.map((c) => <Pony key={c.name} cast={c} />)
}

CAST.forEach((c) => useGLTF.preload(url(c.name)))
if (typeof window !== 'undefined') window.__m4 = Object.assign(window.__m4 || {}, { ponyCast: CAST })
