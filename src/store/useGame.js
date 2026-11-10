import { create } from 'zustand'
import { DEFAULT_CAR_ID, CARS } from '../config/cars.js'

export const CAMERA_MODES = [
  { id: 'chase', label: 'CHASE' },
  { id: 'close', label: 'CLOSE CHASE' },
  { id: 'hood', label: 'HOOD' },
  { id: 'cockpit', label: 'COCKPIT' },
  { id: 'cinematic', label: 'CINEMATIC' },
  { id: 'orbit', label: 'FREE LOOK' },
]

export const QUALITY = {
  low: { label: 'Low', dpr: 0.75, shadows: false, shadowMap: 0, groundTex: 1024, trees: 350, antialias: false, envRes: 64 },
  medium: { label: 'Medium', dpr: 1, shadows: true, shadowMap: 2048, groundTex: 2048, trees: 900, antialias: true, envRes: 256 },
  high: { label: 'High', dpr: 1.5, shadows: true, shadowMap: 4096, groundTex: 4096, trees: 1600, antialias: true, envRes: 512 },
}

// Phones/tablets: coarse pointer + touch support
export const IS_TOUCH = typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) &&
  !window.matchMedia?.('(pointer: fine)').matches

// v2: every device starts on High at 100% resolution. Older saved quality/resolution choices are reset once.
const SETTINGS_VERSION = 2
const saved = (() => {
  try {
    const s = JSON.parse(localStorage.getItem('m4h-settings') || '{}')
    if ((s.v ?? 1) < SETTINGS_VERSION) { delete s.quality; delete s.renderScale }
    return s
  } catch { return {} }
})()

const persist = (s) => {
  try {
    localStorage.setItem('m4h-settings', JSON.stringify({
      v: SETTINGS_VERSION,
      quality: s.quality, renderScale: s.renderScale, touchSteer: s.touchSteer, touchControls: s.touchControls, audio: s.audio, assists: s.assists, paintId: s.paintId, cameraMode: s.cameraMode, showFps: s.showFps,
    }))
  } catch { /* storage unavailable */ }
}

export const useGame = create((set, get) => ({
  // 'intro' → 'menu' → 'playing' ⇄ 'paused'; 'garage' from menu/pause
  phase: 'intro',
  carId: DEFAULT_CAR_ID,
  paintId: saved.paintId ?? CARS[DEFAULT_CAR_ID].paints[0].id,
  quality: saved.quality ?? 'high',
  isTouch: IS_TOUCH,
  // on-screen controls: shown by default on touch devices, can be forced on/off in settings
  touchControls: saved.touchControls ?? IS_TOUCH,
  touchSteer: saved.touchSteer ?? 'drag', // 'drag' | 'buttons' | 'tilt'
  renderScale: saved.renderScale ?? 1,
  showFps: saved.showFps ?? false,
  audio: { master: 0.8, sfx: 0.85, music: 0.5, musicOn: true, ...(saved.audio || {}) },
  cameraMode: Math.min(saved.cameraMode ?? 0, CAMERA_MODES.length - 1),
  assists: { tcs: true, abs: true, stability: true, manual: false, ...(saved.assists || {}) },
  telemetry: { speedKmh: 0, rpm: 900, gearLabel: '1', nitro: 1, nitroActive: false, surface: 'ASPHALT', drifting: false, tcsActive: false, absActive: false, throttle: 0, brake: 0 },
  toast: null,
  resetToken: 0,

  setPhase: (phase) => set({ phase }),
  // showroom ("View car"): remembers where to go back to
  showroomReturn: 'menu',
  openShowroom: () => set((s) => ({ showroomReturn: s.phase === 'paused' || s.phase === 'playing' ? 'paused' : 'menu', phase: 'showroom' })),
  closeShowroom: () => set((s) => ({ phase: s.showroomReturn })),
  setCameraIndexById: (id) => {
    const i = CAMERA_MODES.findIndex((c) => c.id === id)
    if (i >= 0) { set({ cameraMode: i }); get().showToast(CAMERA_MODES[i].label); persist(get()) }
  },
  setQuality: (quality) => { set({ quality }); persist(get()) },
  setRenderScale: (renderScale) => { set({ renderScale }); persist(get()) },
  setShowFps: (showFps) => { set({ showFps }); persist(get()) },
  setAudio: (partial) => { set({ audio: { ...get().audio, ...partial } }); persist(get()) },
  setTouchControls: (touchControls) => { set({ touchControls }); persist(get()) },
  setTouchSteer: (touchSteer) => { set({ touchSteer }); persist(get()) },
  setPaint: (paintId) => { set({ paintId }); persist(get()) },
  cycleCamera: () => {
    const cameraMode = (get().cameraMode + 1) % CAMERA_MODES.length
    set({ cameraMode })
    get().showToast(CAMERA_MODES[cameraMode].label)
    persist(get())
  },
  setCameraMode: (cameraMode) => { set({ cameraMode }); persist(get()) },
  toggleAssist: (key) => {
    const assists = { ...get().assists, [key]: !get().assists[key] }
    set({ assists })
    const names = { tcs: 'TRACTION CONTROL', abs: 'ABS', stability: 'STABILITY ASSIST', manual: 'TRANSMISSION' }
    const val = key === 'manual' ? (assists.manual ? 'MANUAL' : 'AUTOMATIC') : assists[key] ? 'ON' : 'OFF'
    get().showToast(`${names[key]}: ${val}`)
    persist(get())
  },
  requestReset: () => set((s) => ({ resetToken: s.resetToken + 1 })),
  setTelemetry: (telemetry) => set({ telemetry }),
  showToast: (text) => {
    const id = Math.random()
    set({ toast: { text, id } })
    setTimeout(() => { if (get().toast?.id === id) set({ toast: null }) }, 1600)
  },
}))

if (typeof window !== 'undefined') window.__m4 = Object.assign(window.__m4 || {}, { store: useGame })
