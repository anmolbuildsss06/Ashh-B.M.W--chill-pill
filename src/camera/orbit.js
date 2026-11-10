// Drag-to-orbit / pinch-or-wheel-to-zoom state for the FREE LOOK camera and the showroom.
// Angles are relative to the car: yaw 0 = behind the car, π = in front.
export const orbit = {
  yaw: 0.6, pitch: 0.18, dist: 7,
  targetYaw: 0.6, targetPitch: 0.18, targetDist: 7,
  look: [0, 0.6, 0], targetLook: [0, 0.6, 0],
  interior: false, // showroom "interior" preset
  lastInput: 0,
}

export const PRESETS = {
  front34: { label: 'FRONT ¾', yaw: Math.PI - 0.65, pitch: 0.12, dist: 6.2, look: [0, 0.55, 0] },
  rear34: { label: 'REAR ¾', yaw: 0.7, pitch: 0.14, dist: 6.4, look: [0, 0.6, 0] },
  side: { label: 'SIDE', yaw: Math.PI / 2, pitch: 0.06, dist: 6.6, look: [0, 0.55, 0] },
  front: { label: 'FRONT', yaw: Math.PI, pitch: 0.08, dist: 6.0, look: [0, 0.6, 0] },
  rear: { label: 'REAR', yaw: 0, pitch: 0.1, dist: 6.0, look: [0, 0.6, 0] },
  top: { label: 'TOP', yaw: 0.3, pitch: 1.25, dist: 8.5, look: [0, 0.4, 0] },
  wheel: { label: 'WHEEL', yaw: Math.PI - 1.2, pitch: 0.02, dist: 2.6, look: [0.75, 0.32, -1.6] },
  interior: { label: 'INTERIOR', interior: true },
}

export function applyPreset(id) {
  const p = PRESETS[id]
  if (!p) return
  orbit.interior = !!p.interior
  if (p.interior) return
  // take the short way round
  let y = p.yaw
  while (y - orbit.targetYaw > Math.PI) y -= Math.PI * 2
  while (orbit.targetYaw - y > Math.PI) y += Math.PI * 2
  orbit.targetYaw = y
  orbit.targetPitch = p.pitch
  orbit.targetDist = p.dist
  orbit.targetLook = [...p.look]
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

/** Attach pointer/wheel handlers to the canvas. Returns a detach function. */
export function attachOrbitControls(el, isEnabled) {
  const pts = new Map()
  let pinch0 = null
  const onDown = (e) => {
    if (!isEnabled()) return
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    el.setPointerCapture?.(e.pointerId)
    if (pts.size === 2) {
      const [a, b] = [...pts.values()]
      pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: orbit.targetDist }
    }
  }
  const onMove = (e) => {
    const p = pts.get(e.pointerId)
    if (!p || !isEnabled()) return
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    p.x = e.clientX; p.y = e.clientY
    if (pts.size === 1) {
      orbit.targetYaw -= dx * 0.008
      orbit.targetPitch = clamp(orbit.targetPitch + dy * 0.006, -0.05, 1.35)
      if (orbit.interior) orbit.interior = false
    } else if (pts.size === 2 && pinch0) {
      const [a, b] = [...pts.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      orbit.targetDist = clamp(pinch0.dist * (pinch0.d / Math.max(d, 1)), 2.2, 16)
    }
    orbit.lastInput = performance.now()
  }
  const onUp = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null }
  const onWheel = (e) => {
    if (!isEnabled()) return
    e.preventDefault()
    orbit.targetDist = clamp(orbit.targetDist * (1 + Math.sign(e.deltaY) * 0.1), 2.2, 16)
    orbit.lastInput = performance.now()
  }
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  el.addEventListener('wheel', onWheel, { passive: false })
  return () => {
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    el.removeEventListener('wheel', onWheel)
  }
}

if (typeof window !== 'undefined') window.__m4 = Object.assign(window.__m4 || {}, { orbit, applyPreset })
