// Ground surface types and the layout of the Stage 1 proving ground.
// The same function drives physics (grip per wheel) and the ground texture, so they always match.

export const SURFACES = {
  asphalt: { id: 'asphalt', label: 'ASPHALT', grip: 1.0, sideGrip: 1.0, rolling: 1.0, drag: 0 },
  kerb: { id: 'kerb', label: 'KERB', grip: 0.92, sideGrip: 0.9, rolling: 1.1, drag: 0 },
  grass: { id: 'grass', label: 'GRASS', grip: 0.62, sideGrip: 0.55, rolling: 4.5, drag: 220 },
  dirt: { id: 'dirt', label: 'DIRT', grip: 0.72, sideGrip: 0.6, rolling: 3.0, drag: 120 },
}

export const GROUND_SIZE = 640
export const HALF = GROUND_SIZE / 2

// Oval circuit: straights along Z at x = ±R, semicircle ends centred on (0, ±L)
export const TRACK = { R: 110, L: 150, halfWidth: 8, kerb: 1.2 }
export const PAD = { x0: -45, x1: 45, z0: -28, z1: 28 }
export const CROSS_ROAD = { halfWidth: 6 } // pad ↔ circuit along z = 0
export const NORTH_ROAD = { halfWidth: 5 } // pad ↔ skidpad along x = 0
export const SKIDPAD = { x: 0, z: -150, r: 48 }
export const DIRT = { x: 0, z: 150, r: 62 }
// Village street: continues the cross road west of the circuit, houses on both sides
export const VILLAGE = { x0: -(TRACK.R + TRACK.halfWidth + 2), x1: -HALF + 8, streetZ: 0, halfWidth: 6 }

export function trackDistance(x, z) {
  const cz = Math.max(-TRACK.L, Math.min(TRACK.L, z))
  return Math.abs(Math.hypot(x, z - cz) - TRACK.R)
}

export function surfaceAt(x, z) {
  const d = trackDistance(x, z)
  if (d < TRACK.halfWidth) return SURFACES.asphalt
  if (d < TRACK.halfWidth + TRACK.kerb) return SURFACES.kerb
  if (x > PAD.x0 && x < PAD.x1 && z > PAD.z0 && z < PAD.z1) return SURFACES.asphalt
  if (Math.abs(z) < CROSS_ROAD.halfWidth && Math.abs(x) < TRACK.R) return SURFACES.asphalt
  if (Math.abs(x) < NORTH_ROAD.halfWidth && z < PAD.z0 && z > SKIDPAD.z) return SURFACES.asphalt
  if (Math.hypot(x - SKIDPAD.x, z - SKIDPAD.z) < SKIDPAD.r) return SURFACES.asphalt
  if (x < VILLAGE.x0 + 4 && x > VILLAGE.x1 && Math.abs(z - VILLAGE.streetZ) < VILLAGE.halfWidth) return SURFACES.asphalt
  if (Math.hypot(x - DIRT.x, z - DIRT.z) < DIRT.r) return SURFACES.dirt
  return SURFACES.grass
}

// Spawn on the pad, facing east (+X) down the cross road toward the circuit.
// (yaw rotates the car's -Z forward; -π/2 points it at +X)
export const SPAWN = { position: [-28, 1.0, 0], yaw: -Math.PI / 2 }
