// Procedural PBR-ish textures for houses (albedo + normal), generated once on a canvas.
// Albedo is near-neutral so each house tints it with its own colour (vertex colours).
import * as THREE from 'three'

function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
}

function canvas(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return [c, c.getContext('2d')]
}

/** height map → tangent-space normal map */
function normalFromHeight(hctx, size, strength = 2.5) {
  const h = hctx.getImageData(0, 0, size, size).data
  const [c, g] = canvas(size)
  const out = g.createImageData(size, size)
  const H = (x, y) => h[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      out.data[i] = (-dx / len * 0.5 + 0.5) * 255
      out.data[i + 1] = (dy / len * 0.5 + 0.5) * 255
      out.data[i + 2] = (1 / len * 0.5 + 0.5) * 255
      out.data[i + 3] = 255
    }
  }
  g.putImageData(out, 0, 0)
  return c
}

function noise(g, size, rnd, alpha, count, maxR) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rnd() * 255)
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`
    const r = rnd() * maxR + 0.5
    g.fillRect(rnd() * size, rnd() * size, r, r)
  }
}

function tex(c, srgb) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  return t
}

// Brick: 1 texture tile = 1.2 m × 1.2 m (16 courses of 75 mm)
function brick(size = 512) {
  const rnd = rng(11)
  const [c, g] = canvas(size)
  const [hc, h] = canvas(size)
  const rows = 16, cols = 5
  const bh = size / rows, bw = size / cols
  g.fillStyle = '#b9b3a8'; g.fillRect(0, 0, size, size) // mortar
  h.fillStyle = '#202020'; h.fillRect(0, 0, size, size)
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0
    for (let k = -1; k <= cols; k++) {
      const x = k * bw + off, y = r * bh
      const t = 0.82 + rnd() * 0.3
      const red = rnd() < 0.12
      g.fillStyle = red ? `rgb(${150 * t},${78 * t},${60 * t})` : `rgb(${175 * t},${110 * t},${88 * t})`
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4)
      h.fillStyle = `rgb(${200 + rnd() * 40},${200},${200})`
      h.fillRect(x + 2, y + 2, bw - 4, bh - 4)
    }
  }
  noise(g, size, rnd, 0.08, 9000, 2)
  noise(h, size, rnd, 0.15, 6000, 2)
  return { map: tex(c, true), normalMap: tex(normalFromHeight(h, size, 3), false), metresPerTile: 1.2 }
}

// Render / stucco: soft mottled noise, near-white so it can be tinted
function render(size = 512) {
  const rnd = rng(23)
  const [c, g] = canvas(size)
  const [hc, h] = canvas(size)
  g.fillStyle = '#efebe4'; g.fillRect(0, 0, size, size)
  h.fillStyle = '#808080'; h.fillRect(0, 0, size, size)
  for (let i = 0; i < 260; i++) {
    const v = 225 + rnd() * 30
    g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.25)`
    g.beginPath(); g.arc(rnd() * size, rnd() * size, 10 + rnd() * 50, 0, Math.PI * 2); g.fill()
  }
  noise(g, size, rnd, 0.06, 20000, 1.5)
  noise(h, size, rnd, 0.5, 30000, 1.5)
  // faint rain streaks
  g.fillStyle = 'rgba(120,115,105,0.05)'
  for (let i = 0; i < 40; i++) g.fillRect(rnd() * size, 0, 1 + rnd() * 3, size)
  return { map: tex(c, true), normalMap: tex(normalFromHeight(h, size, 1.2), false), metresPerTile: 2.5 }
}

// Horizontal wooden siding / weatherboard, 18 cm boards
function siding(size = 512) {
  const rnd = rng(31)
  const [c, g] = canvas(size)
  const [hc, h] = canvas(size)
  const boards = 14, bh = size / boards
  for (let b = 0; b < boards; b++) {
    const t = 0.9 + rnd() * 0.1
    g.fillStyle = `rgb(${240 * t},${238 * t},${232 * t})`
    g.fillRect(0, b * bh, size, bh)
    // shadow line under each board lap
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, b * bh + bh - 3, size, 3)
    const grad = h.createLinearGradient(0, b * bh, 0, b * bh + bh)
    grad.addColorStop(0, '#606060'); grad.addColorStop(1, '#d0d0d0')
    h.fillStyle = grad; h.fillRect(0, b * bh, size, bh)
  }
  // wood grain
  for (let i = 0; i < 400; i++) {
    g.strokeStyle = `rgba(90,80,70,${0.03 + rnd() * 0.04})`
    const y = rnd() * size
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(size / 3, y + rnd() * 4 - 2, (2 * size) / 3, y + rnd() * 4 - 2, size, y); g.stroke()
  }
  return { map: tex(c, true), normalMap: tex(normalFromHeight(h, size, 4), false), metresPerTile: 2.5 }
}

// Roof tiles: rows of rounded clay/slate tiles, 1 tile = 2 m
function roofTiles(size = 512) {
  const rnd = rng(47)
  const [c, g] = canvas(size)
  const [hc, h] = canvas(size)
  const rows = 12, cols = 10
  const th = size / rows, tw = size / cols
  g.fillStyle = '#5a5552'; g.fillRect(0, 0, size, size)
  h.fillStyle = '#000'; h.fillRect(0, 0, size, size)
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? tw / 2 : 0
    for (let k = -1; k <= cols; k++) {
      const x = k * tw + off, y = r * th
      const t = 0.8 + rnd() * 0.35
      g.fillStyle = `rgb(${215 * t},${210 * t},${205 * t})`
      g.beginPath(); g.roundRect(x + 1, y, tw - 2, th + 6, [0, 0, tw / 2.2, tw / 2.2]); g.fill()
      const grad = h.createLinearGradient(0, y, 0, y + th)
      grad.addColorStop(0, '#303030'); grad.addColorStop(1, '#f0f0f0')
      h.fillStyle = grad
      h.beginPath(); h.roundRect(x + 1, y, tw - 2, th + 6, [0, 0, tw / 2.2, tw / 2.2]); h.fill()
      // shadow at the lower edge of the tile above
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, y, tw, 3)
    }
  }
  noise(g, size, rnd, 0.1, 12000, 2)
  // moss and lichen spots
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(${90 + rnd() * 30},${110 + rnd() * 30},${60},${0.15 + rnd() * 0.2})`
    g.beginPath(); g.arc(rnd() * size, rnd() * size, 1 + rnd() * 5, 0, Math.PI * 2); g.fill()
  }
  return { map: tex(c, true), normalMap: tex(normalFromHeight(h, size, 3.5), false), metresPerTile: 2 }
}

// Paving for driveways / paths
function paving(size = 256) {
  const rnd = rng(59)
  const [c, g] = canvas(size)
  const [hc, h] = canvas(size)
  g.fillStyle = '#8f8a83'; g.fillRect(0, 0, size, size)
  h.fillStyle = '#202020'; h.fillRect(0, 0, size, size)
  const n = 8, s = size / n
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const t = 0.85 + rnd() * 0.25
    g.fillStyle = `rgb(${165 * t},${158 * t},${150 * t})`; g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2)
    h.fillStyle = '#c0c0c0'; h.fillRect(x * s + 1, y * s + 1, s - 2, s - 2)
  }
  noise(g, size, rnd, 0.1, 4000, 1.5)
  return { map: tex(c, true), normalMap: tex(normalFromHeight(h, size, 2), false), metresPerTile: 2 }
}

let cache = null
export function houseTextures() {
  if (!cache) cache = { brick: brick(), render: render(), siding: siding(), roof: roofTiles(), paving: paving() }
  return cache
}
