import { modelUrl } from '../lib/modelUrl.js'
// Car catalogue. Every car is pure data so new cars can be added without touching the sim.
// Units: SI (kg, m, N·m, s). Local frame: forward = -Z, up = +Y, right = +X.

export const BMW_M4_COMPETITION = {
  id: 'bmw-m4-competition',
  name: 'BMW M4 Competition',
  year: 2025,
  // 3D model: "BMW M4" (F82) from Blend Swap #81957, CC-BY 3.0, fan art / non-commercial.
  // Converted from .blend → glTF (see scripts/README-model.md). Scaled 1.05× to the real F82 footprint.
  model: {
    body: modelUrl('models/m4-f82-body.glb'),
    wheel: modelUrl('models/m4-f82-wheel.glb'),
    scale: 1.05,
    credit: 'BMW M4 3D model — Blend Swap #81957 (CC-BY 3.0, fan art, non-commercial)',
  },

  body: { length: 4.671, width: 1.870, height: 1.383, wheelbase: 2.812 },

  mass: 1725,
  centerOfMassY: 0.32, // above rigid-body origin (origin = underbody, ~0.13 m above ground)
  // Chassis collider half-extents
  collider: { hx: 0.88, hy: 0.36, hz: 2.38, y: 0.4 },

  wheels: {
    radius: 0.308, // model tyre 0.293 m × 1.05
    frontX: 0.748,
    rearX: 0.748,
    frontZ: -1.604,
    rearZ: 1.345,
    connectionY: 0.47,
    restLength: 0.3,
    maxTravel: 0.16,
    stiffness: 34,
    compression: 3.4,
    relaxation: 3.9,
    maxSuspensionForce: 100000,
    frictionSlip: 1.25, // ~tyre μ (arcade-leaning)
    sideFrictionStiffness: 1.0,
  },

  engine: {
    idleRpm: 900,
    redlineRpm: 7200,
    limiterRpm: 7300,
    // [rpm, N·m] — S58 3.0L twin turbo: 650 N·m plateau, ~510 hp peak
    torqueCurve: [
      [900, 300], [1800, 480], [2750, 650], [5500, 650], [6250, 590], [7200, 520], [7400, 300],
    ],
    drivetrainEfficiency: 0.88,
    engineBrakeTorque: 90,
  },

  gearbox: {
    ratios: [5.0, 3.2, 2.143, 1.72, 1.314, 1.0, 0.822, 0.64],
    reverse: 3.456,
    finalDrive: 3.15,
    shiftTime: 0.12,
    upshiftRpm: 6900,
    downshiftRpm: 3100,
  },

  // Rear-wheel drive
  drive: 'RWD',
  topSpeedKmh: 290, // electronic limiter (M Driver's Package)

  steering: {
    maxAngleLow: 0.58, // rad at parking speed
    maxAngleHigh: 0.11, // rad at 200+ km/h
    rate: 3.2, // how fast the wheel turns (keyboard)
    returnRate: 5.0,
  },

  brakes: {
    force: 150, // impulse cap per wheel per step (Rapier units)
    frontBias: 0.62,
    handbrake: 160,
  },

  aero: {
    dragArea: 0.37, // ½·ρ·Cd·A, so drag = k·v²
    downforce: 0.55, // N per (m/s)²
    rollingResistance: 14, // N per (m/s)
  },

  nitro: {
    force: 7200,
    capacity: 1,
    burnRate: 0.22, // per second
    regenRate: 0.035,
  },

  paints: [
    { id: 'isle-of-man', name: 'Isle of Man Green', color: '#0f5e3c', metalness: 0.65, roughness: 0.28 },
    { id: 'sao-paulo', name: 'São Paulo Yellow', color: '#f2c30f', metalness: 0.15, roughness: 0.3 },
    { id: 'toronto-red', name: 'Toronto Red', color: '#a5111b', metalness: 0.6, roughness: 0.3 },
    { id: 'portimao', name: 'Portimao Blue', color: '#1d4fa6', metalness: 0.65, roughness: 0.28 },
    { id: 'brooklyn-grey', name: 'Brooklyn Grey', color: '#8c9196', metalness: 0.2, roughness: 0.35 },
    { id: 'sapphire', name: 'Black Sapphire', color: '#0c0d10', metalness: 0.7, roughness: 0.25 },
    { id: 'alpine-white', name: 'Alpine White', color: '#eceff1', metalness: 0.05, roughness: 0.3 },
  ],
}

export const CARS = { [BMW_M4_COMPETITION.id]: BMW_M4_COMPETITION }
export const DEFAULT_CAR_ID = BMW_M4_COMPETITION.id
