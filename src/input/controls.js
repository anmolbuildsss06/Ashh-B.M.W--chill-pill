// Keyboard + gamepad input, polled once per physics step (no React re-renders).
import { createInput } from '../vehicle/VehicleSim.js'

const down = new Set()
const pressed = new Set() // edge-triggered, consumed by poll()

const KEYMAP = {
  KeyW: 'throttle', ArrowUp: 'throttle',
  KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'handbrake',
  ShiftLeft: 'nitro', ShiftRight: 'nitro',
  KeyE: 'shiftUp', KeyQ: 'shiftDown',
  KeyC: 'camera', KeyR: 'reset', Escape: 'pause', KeyP: 'pause',
  KeyT: 'tcs', KeyM: 'manual', KeyF: 'fps', KeyB: 'music',
  Digit1: 'cam0', Digit2: 'cam1', Digit3: 'cam2', Digit4: 'cam3', Digit5: 'cam4', Digit6: 'cam5',
}

const isTyping = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    const a = KEYMAP[e.code]
    if (!a || isTyping(e)) return
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault()
    if (!down.has(a)) pressed.add(a)
    down.add(a)
  })
  window.addEventListener('keyup', (e) => {
    const a = KEYMAP[e.code]
    if (a) down.delete(a)
  })
  window.addEventListener('blur', () => down.clear())
}

// Gamepad (standard mapping): RT throttle, LT brake, left stick steer, A handbrake, X nitro,
// RB/LB shift, Y camera, Back reset, Start pause
const padPrev = {}
function pollPad(out) {
  const pads = navigator.getGamepads?.() || []
  const gp = [...pads].find(Boolean)
  if (!gp) return
  const b = (i) => gp.buttons[i]?.value ?? 0
  const edge = (i, name) => {
    const p = b(i) > 0.5
    if (p && !padPrev[i]) pressed.add(name)
    padPrev[i] = p
  }
  out.throttle = Math.max(out.throttle, b(7))
  out.brake = Math.max(out.brake, b(6))
  const sx = gp.axes[0] ?? 0
  if (Math.abs(sx) > 0.12) out.steer = Math.sign(sx) * ((Math.abs(sx) - 0.12) / 0.88) ** 1.4
  if (b(0) > 0.5) out.handbrake = true
  if (b(2) > 0.5) out.nitro = true
  edge(5, 'shiftUp'); edge(4, 'shiftDown'); edge(3, 'camera'); edge(8, 'reset'); edge(9, 'pause')
}

// ---- Touch (phone/tablet) — written by ui/TouchControls.jsx ----
export const touch = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false }
/** Fire a one-shot action from an on-screen button (camera, reset, pause, shiftUp...) */
export function touchAction(name) { pressed.add(name) }

const input = createInput()

/** Continuous driving input */
export function pollDriving() {
  input.throttle = down.has('throttle') ? 1 : 0
  input.brake = down.has('brake') ? 1 : 0
  input.steer = (down.has('right') ? 1 : 0) - (down.has('left') ? 1 : 0)
  input.handbrake = down.has('handbrake')
  input.nitro = down.has('nitro')
  pollPad(input)
  input.throttle = Math.max(input.throttle, touch.throttle)
  input.brake = Math.max(input.brake, touch.brake)
  if (Math.abs(touch.steer) > Math.abs(input.steer)) input.steer = touch.steer
  input.handbrake = input.handbrake || touch.handbrake
  input.nitro = input.nitro || touch.nitro
  input.shiftUp = pressed.has('shiftUp')
  input.shiftDown = pressed.has('shiftDown')
  pressed.delete('shiftUp')
  pressed.delete('shiftDown')
  return input
}

/** One-shot actions (camera, reset, pause...) — returns and clears */
export function consumeActions() {
  const out = [...pressed].filter((a) => a !== 'shiftUp' && a !== 'shiftDown')
  for (const a of out) pressed.delete(a)
  return out
}

/** For automated tests */
export const testInput = {
  press(action) { pressed.add(action); down.add(action) },
  release(action) { down.delete(action) },
  releaseAll() { down.clear() },
}
if (typeof window !== 'undefined') window.__m4 = Object.assign(window.__m4 || {}, { input: testInput, touch })
