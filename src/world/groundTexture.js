// Paints the proving-ground surface map into a canvas, sampling the same surfaceAt() the physics uses.
import * as THREE from 'three'
import { surfaceAt, trackDistance, GROUND_SIZE, HALF, TRACK, PAD, SKIDPAD, VILLAGE } from './surfaces.js'

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const s = (t) => t * t * (3 - 2 * t)
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1)
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf)
}

const COLORS = {
  asphalt: [52, 54, 58],
  grass: [74, 112, 46],
  dirt: [128, 98, 66],
}

export function buildGroundTexture(size = 2048) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(size, size)
  const data = img.data
  const mpp = GROUND_SIZE / size // metres per pixel

  for (let py = 0; py < size; py++) {
    const z = -HALF + (py + 0.5) * mpp
    for (let px = 0; px < size; px++) {
      const x = -HALF + (px + 0.5) * mpp
      const s = surfaceAt(x, z)
      const n1 = valueNoise(x * 0.08, z * 0.08)
      const n2 = valueNoise(x * 0.6, z * 0.6)
      const grain = hash(px, py)
      let r, g, b
      if (s.id === 'kerb') {
        // red/white stripes, 2 m long
        const cz = Math.max(-TRACK.L, Math.min(TRACK.L, z))
        const arc = Math.abs(z) <= TRACK.L ? z : Math.atan2(x, z - cz) * TRACK.R + (z > 0 ? 1000 : 0)
        const red = Math.floor(arc / 2) % 2 === 0
        ;[r, g, b] = red ? [196, 30, 36] : [232, 232, 228]
      } else if (s.id === 'asphalt') {
        const k = 0.85 + n1 * 0.18 + (grain - 0.5) * 0.12
        ;[r, g, b] = COLORS.asphalt.map((c) => c * k)
        // rubbered-in racing line darkening on the circuit
        if (trackDistance(x, z) < 3) { r *= 0.88; g *= 0.88; b *= 0.88 }
      } else if (s.id === 'dirt') {
        const k = 0.8 + n1 * 0.3 + n2 * 0.12 + (grain - 0.5) * 0.15
        ;[r, g, b] = COLORS.dirt.map((c) => c * k)
      } else {
        const k = 0.75 + n1 * 0.35 + n2 * 0.15 + (grain - 0.5) * 0.12
        const dry = valueNoise(x * 0.02 + 40, z * 0.02)
        r = (COLORS.grass[0] + dry * 30) * k
        g = (COLORS.grass[1] + dry * 8) * k
        b = (COLORS.grass[2] - dry * 6) * k
      }
      const i = (py * size + px) * 4
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  // ---- Painted markings ----
  const toPx = (x, z) => [(x + HALF) / mpp, (z + HALF) / mpp]
  const m = (v) => v / mpp
  ctx.lineCap = 'butt'

  // Circuit edge lines + dashed centre line
  const strokeStadium = (radius, width, color, dash) => {
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(1, m(width))
    ctx.setLineDash(dash ? dash.map(m) : [])
    ctx.beginPath()
    const [cx1, cy1] = toPx(0, -TRACK.L)
    const [cx2, cy2] = toPx(0, TRACK.L)
    ctx.arc(cx1, cy1, m(radius), Math.PI, 0) // north semicircle
    ctx.lineTo(...toPx(radius, TRACK.L))
    ctx.arc(cx2, cy2, m(radius), 0, Math.PI)
    ctx.closePath()
    ctx.stroke()
  }
  strokeStadium(TRACK.R - TRACK.halfWidth + 0.4, 0.25, 'rgba(240,240,235,0.9)')
  strokeStadium(TRACK.R + TRACK.halfWidth - 0.4, 0.25, 'rgba(240,240,235,0.9)')
  strokeStadium(TRACK.R, 0.18, 'rgba(240,240,235,0.55)', [3, 6])
  ctx.setLineDash([])

  // Start / finish chequer on the east straight at z = 60
  const sq = 0.8
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'
      const [px, py] = toPx(TRACK.R - TRACK.halfWidth + i * sq, 60 + j * sq)
      ctx.fillRect(px, py, m(sq) + 0.5, m(sq) + 0.5)
    }
  }

  // Pad parking bays
  ctx.strokeStyle = 'rgba(235,235,230,0.8)'
  ctx.lineWidth = Math.max(1, m(0.15))
  for (let i = 0; i <= 12; i++) {
    const x = PAD.x0 + 6 + i * 3
    if (x > -8 && x < 8) continue
    ctx.beginPath(); ctx.moveTo(...toPx(x, PAD.z0 + 1)); ctx.lineTo(...toPx(x, PAD.z0 + 6)); ctx.stroke()
  }
  // "M" stripe tri-colour line across pad
  const stripe = [['#4fb4e8', 0], ['#1c2a5b', 1], ['#e4002b', 2]]
  for (const [c, k] of stripe) {
    ctx.fillStyle = c
    const [px, py] = toPx(PAD.x0 + 2, PAD.z1 - 3 + k * 0.5)
    ctx.fillRect(px, py, m(PAD.x1 - PAD.x0 - 4), m(0.5))
  }

  // Village street centre line + pavements
  ctx.strokeStyle = 'rgba(240,240,235,0.75)'
  ctx.lineWidth = Math.max(1, m(0.15))
  ctx.setLineDash([m(3), m(4)])
  ctx.beginPath(); ctx.moveTo(...toPx(VILLAGE.x0, VILLAGE.streetZ)); ctx.lineTo(...toPx(VILLAGE.x1, VILLAGE.streetZ)); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#9c978e'
  for (const sgn of [-1, 1]) {
    const [px, py] = toPx(VILLAGE.x1, VILLAGE.streetZ + sgn * VILLAGE.halfWidth + (sgn > 0 ? 0 : -1.6))
    ctx.fillRect(px, py, m(VILLAGE.x0 - VILLAGE.x1), m(1.6))
  }

  // Skidpad rings
  ctx.strokeStyle = 'rgba(255,210,40,0.85)'
  ctx.lineWidth = Math.max(1, m(0.25))
  for (const r of [18, 32, 44]) {
    ctx.beginPath(); ctx.arc(...toPx(SKIDPAD.x, SKIDPAD.z), m(r), 0, Math.PI * 2); ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  return tex
}
