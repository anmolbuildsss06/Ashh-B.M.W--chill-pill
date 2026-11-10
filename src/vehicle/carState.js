// Shared, mutable handle to the player's car. Camera, HUD and effects read from here every frame
// so we never route 60 Hz data through React state.
export const carState = {
  body: null, // Rapier RigidBody (raw physics state — advances in fixed 1/60 s steps)
  visual: null, // Object3D inside the RigidBody: the smoothed pose that is actually drawn
  sim: null, // VehicleSim
  input: null,
  lastSafe: null, // { position, yaw } for respawn after remount
}
if (typeof window !== 'undefined') window.__m4 = Object.assign(window.__m4 || {}, { car: carState })
