// Village of realistic houses: brick / render / weatherboard walls with normal-mapped textures, tiled
// roofs with overhangs, fascias and gutters, framed sash windows with sills and glass, panelled front
// doors under porch canopies, chimneys, attached garages with driveways, front paths and hedges.
// All parts are merged per material (≈10 draw calls for the whole village) and tinted per house.
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { VILLAGE } from './surfaces.js'
import { houseTextures } from './houseTextures.js'

function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)]

const STYLES = {
  brick: { tints: ['#ffffff', '#f3e3d6', '#e9d8cc', '#fff0e6'] },
  render: { tints: ['#f4efe6', '#efe3c8', '#e6eef2', '#f2dccf', '#e3ead6', '#f7f3ea', '#ead9b8'] },
  siding: { tints: ['#f7f7f4', '#d8e3ea', '#cfdccb', '#e9e4d8', '#c9cfd6', '#f1e6cf'] },
}
const ROOFS = ['#b0583f', '#9a4a36', '#5a5f66', '#4a4e55', '#7d5443', '#8c3f30']
const DOORS = ['#1d2f4f', '#7a1e22', '#2c4a35', '#1b1b1d', '#6b4a2f', '#30566e', '#e8e3d6']
const FLOOR_H = 2.9

export function buildHouses() {
  const rnd = rng(4242)
  const houses = []
  const { x0, x1, streetZ } = VILLAGE
  for (const side of [-1, 1]) {
    for (const row of [0, 1]) {
      for (let x = x1 + 12 + (row ? 10 : 0); x < x0 - 24; x += 24 + rnd() * 6) {
        if (rnd() < 0.1) continue
        const style = rnd() < 0.36 ? 'brick' : rnd() < 0.62 ? 'render' : 'siding'
        const w = 8.5 + rnd() * 3.5
        const d = 7.5 + rnd() * 2.5
        const floors = rnd() < 0.55 ? 2 : 1
        const z = side * (streetZ + 15 + d / 2 + row * 30 + rnd() * 2)
        const garage = rnd() < 0.5 ? (rnd() < 0.5 ? -1 : 1) : 0
        const wing = !garage && rnd() < 0.45 ? (rnd() < 0.5 ? -1 : 1) : 0
        const h = {
          x, z, w, d, floors, side, style, row,
          wall: pick(rnd, STYLES[style].tints), roof: pick(rnd, ROOFS), door: pick(rnd, DOORS),
          pitch: 0.6 + rnd() * 0.18, chimney: rnd() < 0.7, garage, wing, hedge: rnd() < 0.6, seed: Math.floor(rnd() * 1e6),
        }
        // footprint boxes in world space (for colliders / keeping trees out)
        const rot = side > 0 ? Math.PI : 0
        const toWorld = (lx, lz) => {
          const c = Math.cos(rot), s = Math.sin(rot)
          return [x + lx * c + lz * s, z - lx * s + lz * c]
        }
        h.boxes = [{ cx: x, cz: z, hx: w / 2, hz: d / 2, hy: (floors * FLOOR_H) / 2 + 1 }]
        if (garage) { const [gx, gz] = toWorld(garage * (w / 2 + 2), 0.3); h.boxes.push({ cx: gx, cz: gz, hx: 2, hz: 3.2, hy: 1.6 }) }
        if (wing) { const [wx, wz] = toWorld(wing * (w / 2 - 1.8), -d / 2 - 2.2); h.boxes.push({ cx: wx, cz: wz, hx: 2, hz: 2.3, hy: 1.6 }) }
        h.toWorld = toWorld
        // door position + paved areas (paths/driveways) so grass and bushes stay off them
        h.doorX = (rnd() < 0.5 ? -1 : 1) * w * (0.12 + rnd() * 0.18)
        h.paved = []
        const pathLen = Math.abs(z) - d / 2 - VILLAGE.halfWidth - 1.6
        if (row === 0) { const [px, pz] = toWorld(h.doorX, d / 2 + pathLen / 2); h.paved.push({ cx: px, cz: pz, hx: 0.9, hz: pathLen / 2 + 0.3 }) }
        if (garage) {
          const len = row === 0 ? Math.abs(z) - VILLAGE.halfWidth - 1.6 - 3.6 : 5
          const [dx, dz] = toWorld(garage * (w / 2 + 2), 3.6 + len / 2)
          h.paved.push({ cx: dx, cz: dz, hx: 2.0, hz: len / 2 + 0.3 })
        }
        houses.push(h)
      }
    }
  }
  return houses
}

// ---------- geometry helpers ----------
/** Box with UVs in metres (u,v = face size) so tiled textures keep their real-world scale */
function slab(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]] // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k
    uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1])
  }
  return g
}
function gable(w, rise, depth) {
  // triangle (x: -w/2..w/2, y: 0..rise) extruded `depth` along z; UVs in metres
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, rise); s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false })
  g.translate(0, 0, -depth / 2)
  return g
}

class Builder {
  constructor() { this.parts = {} }
  add(mat, geo, matrix, color = '#ffffff') {
    const g = geo.index ? geo.toNonIndexed() : geo
    g.applyMatrix4(matrix)
    const c = new THREE.Color(color)
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k)
    ;(this.parts[mat] ||= []).push(g)
  }
  build() {
    const out = {}
    for (const [k, list] of Object.entries(this.parts)) {
      const g = mergeGeometries(list, false)
      g.computeBoundingSphere()
      out[k] = g
      list.forEach((p) => p.dispose())
    }
    return out
  }
}

const ONE = new THREE.Vector3(1, 1, 1)
/** base × T(x,y,z) × Ry(ry) × Rx(rx) */
const at = (base, x, y, z, ry = 0, rx = 0) =>
  base.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')), ONE))

/** A sash window on a wall plane facing +z (local), centred at (x, y), wall surface at z */
function windowOn(b, base, x, y, z, w = 1.2, h = 1.4, mullions = true) {
  const t = 0.08
  b.add('trim', slab(w + 0.16, t, 0.12), at(base, x, y + h / 2 + t / 2, z + 0.04))
  b.add('trim', slab(w + 0.16, t, 0.12), at(base, x, y - h / 2 - t / 2, z + 0.04))
  b.add('trim', slab(t, h, 0.12), at(base, x - w / 2 - t / 2, y, z + 0.04))
  b.add('trim', slab(t, h, 0.12), at(base, x + w / 2 + t / 2, y, z + 0.04))
  b.add('trim', slab(w + 0.36, 0.07, 0.24), at(base, x, y - h / 2 - 0.1, z + 0.1)) // sill
  b.add('glass', slab(w, h, 0.02), at(base, x, y, z - 0.02))
  if (mullions) {
    b.add('trim', slab(w, 0.05, 0.05), at(base, x, y + 0.05, z + 0.01))
    b.add('trim', slab(0.05, h, 0.05), at(base, x, y, z + 0.01))
  }
}

function buildHouse(b, h) {
  const rnd = rng(h.seed)
  const base = new THREE.Matrix4().makeRotationY(h.side > 0 ? Math.PI : 0).setPosition(h.x, 0, h.z)
  const H = h.floors * FLOOR_H
  const wallMat = 'wall_' + h.style
  const { w, d } = h
  const front = d / 2

  // body + plinth
  b.add(wallMat, slab(w, H, d), at(base, 0, H / 2 + 0.35, 0), h.wall)
  b.add('plinth', slab(w + 0.12, 0.45, d + 0.12), at(base, 0, 0.22, 0), '#8a857d')
  // string course between floors on brick / render houses
  if (h.floors === 2 && h.style !== 'siding') b.add('trim', slab(w + 0.06, 0.12, d + 0.06), at(base, 0, FLOOR_H + 0.35, 0), '#e8e4dc')
  // corner boards on weatherboard houses
  if (h.style === 'siding') for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('trim', slab(0.14, H, 0.14), at(base, sx * w / 2, H / 2 + 0.35, sz * d / 2))

  // roof: two pitched slabs, ridge along x
  const top = H + 0.35
  const over = 0.45
  const halfSpan = d / 2 + over
  const rise = (d / 2) * Math.tan(h.pitch)
  const slope = Math.hypot(halfSpan, halfSpan * Math.tan(h.pitch))
  const tanP = Math.tan(h.pitch)
  for (const s of [-1, 1]) {
    // slab centred halfway down the slope, lifted half its thickness off the rafters
    const m = at(base, 0, top + rise - (halfSpan / 2) * tanP + 0.07, s * halfSpan / 2, 0, s * h.pitch)
    b.add('roof', slab(w + over * 2, 0.14, slope), m, h.roof)
    // fascia + gutter along the eave
    const ez = s * halfSpan, ey = top - over * Math.tan(h.pitch) + 0.02
    b.add('trim', slab(w + over * 2, 0.22, 0.05), at(base, 0, ey, ez), '#f4f2ee')
    b.add('gutter', slab(w + over * 2, 0.1, 0.12), at(base, 0, ey - 0.12, ez + s * 0.07), '#3a3d42')
  }
  b.add('roof', slab(w + over * 2, 0.12, 0.3), at(base, 0, top + rise + 0.02, 0), h.roof) // ridge cap
  // gable end walls
  for (const sx of [-1, 1]) {
    const g = gable(d, rise, 0.25).rotateY(Math.PI / 2)
    b.add(wallMat, g, at(base, sx * (w / 2 - 0.125), top, 0), h.wall)
    // barge boards
    for (const s of [-1, 1]) b.add('trim', slab(0.06, 0.24, slope), at(base, sx * (w / 2 + over), top + rise - (halfSpan / 2) * tanP + 0.02, s * halfSpan / 2, 0, s * h.pitch), '#f4f2ee')
  }
  // chimney
  if (h.chimney) {
    const cx = (rnd() < 0.5 ? -1 : 1) * (w / 2 - 1.2)
    b.add('wall_brick', slab(0.9, rise + 1.6, 0.7), at(base, cx, top + (rise + 1.6) / 2 - 0.2, -d * 0.12), '#f0e2d8')
    b.add('trim', slab(1.05, 0.12, 0.85), at(base, cx, top + rise + 1.45, -d * 0.12), '#7b766f')
    for (const k of [-0.2, 0.2]) b.add('gutter', slab(0.18, 0.4, 0.18), at(base, cx + k, top + rise + 1.7, -d * 0.12), '#a3542f')
  }

  // front door, frame, canopy, steps, lamp
  const doorX = h.doorX
  b.add('door', slab(1.0, 2.15, 0.08), at(base, doorX, 0.35 + 1.08, front - 0.02), h.door)
  for (const py of [0.6, 1.3]) for (const px of [-0.22, 0.22]) b.add('door', slab(0.32, 0.5, 0.03), at(base, doorX + px, 0.35 + py, front + 0.03), new THREE.Color(h.door).multiplyScalar(0.8).getStyle())
  b.add('glass', slab(0.7, 0.28, 0.02), at(base, doorX, 0.35 + 1.95, front + 0.03))
  b.add('trim', slab(1.3, 0.12, 0.14), at(base, doorX, 0.35 + 2.24, front + 0.04))
  for (const s of [-1, 1]) b.add('trim', slab(0.12, 2.2, 0.14), at(base, doorX + s * 0.6, 0.35 + 1.1, front + 0.04))
  b.add('chrome', slab(0.05, 0.05, 0.08), at(base, doorX + 0.36, 0.35 + 1.05, front + 0.08))
  b.add('plinth', slab(1.8, 0.18, 0.9), at(base, doorX, 0.09, front + 0.45), '#9b958c')
  b.add('plinth', slab(1.6, 0.18, 0.5), at(base, doorX, 0.27, front + 0.3), '#a39d94')
  // porch canopy on brackets
  b.add('roof', slab(1.9, 0.1, 1.1), at(base, doorX, 0.35 + 2.55, front + 0.5, 0, -0.18), h.roof)
  for (const s of [-1, 1]) b.add('trim', slab(0.08, 0.5, 0.08), at(base, doorX + s * 0.8, 0.35 + 2.3, front + 0.5))
  b.add('lamp', slab(0.14, 0.24, 0.14), at(base, doorX + 0.95, 0.35 + 1.9, front + 0.1))

  // windows: front, back, sides
  for (let f = 0; f < h.floors; f++) {
    const wy = 0.35 + f * FLOOR_H + 1.55
    const n = w > 10.5 ? 3 : 2
    for (let i = 0; i < n; i++) {
      const wx = -w / 2 + (w / (n + 1)) * (i + 1)
      if (f === 0 && Math.abs(wx - doorX) < 1.4) continue
      const big = f === 0 && i === 0 && rnd() < 0.5
      windowOn(b, base, wx, wy, front, big ? 2.0 : 1.2, big ? 1.5 : 1.4, true)
    }
    for (let i = 0; i < n; i++) windowOn(b, at(base, 0, 0, 0, Math.PI), -w / 2 + (w / (n + 1)) * (i + 1), wy, front, 1.2, 1.3)
    for (const sx of [-1, 1]) windowOn(b, at(base, 0, 0, 0, sx * Math.PI / 2), 0, wy, w / 2, 1.0, 1.2)
  }

  // garage: single storey, sectional door, flat roof with parapet
  if (h.garage) {
    const gx = h.garage * (w / 2 + 2)
    b.add(wallMat, slab(4, 2.9, 6.4), at(base, gx, 1.45 + 0.1, 0.3), h.wall)
    b.add('trim', slab(4.3, 0.2, 6.7), at(base, gx, 3.05, 0.3), '#e9e5de')
    b.add('gutter', slab(4.3, 0.12, 0.14), at(base, gx, 2.9, 3.6), '#3a3d42')
    b.add('door', slab(3.0, 2.3, 0.06), at(base, gx, 1.25, 3.5), '#e9e6df')
    for (let k = 0; k < 4; k++) b.add('trim', slab(3.0, 0.03, 0.04), at(base, gx, 0.45 + k * 0.55, 3.54), '#c9c5be')
    // driveway to the street
    // to the pavement edge for front-row houses; a short apron for houses in the back row
    const len = h.row === 0 ? Math.abs(h.z) - VILLAGE.halfWidth - 1.6 - 3.6 : 5
    b.add('paving', slab(3.4, 0.04, len), at(base, gx, 0.02, 3.6 + len / 2), '#ffffff')
  }
  // single-storey rear wing
  if (h.wing) {
    const wx = h.wing * (w / 2 - 1.8)
    b.add(wallMat, slab(4, 2.9, 4.6), at(base, wx, 1.45 + 0.35, -d / 2 - 2.2), h.wall)
    const r2 = 1.6
    for (const s of [-1, 1]) b.add('roof', slab(4.6, 0.12, Math.hypot(2.4, r2)), at(base, wx + s * 1.05, 3.25 + r2 / 2, -d / 2 - 2.2, Math.PI / 2, s * Math.atan2(r2, 2.3)), h.roof)
    windowOn(b, at(base, 0, 0, 0, Math.PI), -wx, 1.9, d / 2 + 4.5, 1.2, 1.2)
  }

  // front path to the pavement, and garden boundary
  // distance from the front wall to the back of the pavement
  const pathLen = Math.abs(h.z) - h.d / 2 - VILLAGE.halfWidth - 1.6
  if (h.row === 0) {
    b.add('paving', slab(1.2, 0.04, pathLen), at(base, doorX, 0.02, front + pathLen / 2), '#ffffff')
    const bz = front + pathLen - 0.6
    const gaps = [doorX, h.garage ? h.garage * (w / 2 + 2) : null].filter((v) => v !== null)
    const x0 = -w / 2 - 3, x1 = w / 2 + 3
    // boundary in segments, leaving gaps for path & drive
    let cur = x0
    const cuts = gaps.map((gx) => [gx - (gx === doorX ? 0.9 : 2.0), gx + (gx === doorX ? 0.9 : 2.0)]).sort((a, c) => a[0] - c[0])
    for (const [a, c] of [...cuts, [x1, x1]]) {
      if (a > cur) {
        const len = a - cur
        if (h.hedge) b.add('hedge', slab(len, 1.0, 0.8), at(base, cur + len / 2, 0.5, bz), '#ffffff')
        else {
          b.add('trim', slab(len, 0.08, 0.06), at(base, cur + len / 2, 0.75, bz), '#f2f0eb')
          b.add('trim', slab(len, 0.08, 0.06), at(base, cur + len / 2, 0.35, bz), '#f2f0eb')
          for (let px = cur + 0.1; px < a; px += 0.14) b.add('trim', slab(0.09, 1.0, 0.03), at(base, px, 0.5, bz + 0.04), '#f7f5f0')
        }
      }
      cur = Math.max(cur, c)
    }
  }
}

function material(kind, T) {
  const tiled = (t, color, rough = 0.9, nScale = 1) => {
    const map = t.map.clone(), normal = t.normalMap.clone()
    for (const x of [map, normal]) { x.repeat.set(1 / t.metresPerTile, 1 / t.metresPerTile); x.needsUpdate = true }
    return new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(nScale, nScale), roughness: rough, vertexColors: true, color })
  }
  switch (kind) {
    case 'wall_brick': return tiled(T.brick, '#ffffff', 0.92, 1.2)
    case 'wall_render': return tiled(T.render, '#ffffff', 0.95, 0.6)
    case 'wall_siding': return tiled(T.siding, '#ffffff', 0.8, 1.0)
    case 'roof': return tiled(T.roof, '#ffffff', 0.85, 1.4)
    case 'paving': return tiled(T.paving, '#ffffff', 0.95, 1)
    case 'plinth': return tiled(T.render, '#ffffff', 0.95, 1.2)
    case 'hedge': {
      const m = tiled(T.render, '#3f6b2a', 1, 3)
      m.vertexColors = false
      return m
    }
    case 'trim': return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 })
    case 'door': return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 })
    case 'gutter': return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })
    case 'chrome': return new THREE.MeshStandardMaterial({ color: '#d9c48a', metalness: 1, roughness: 0.25 })
    case 'lamp': return new THREE.MeshStandardMaterial({ color: '#2a2a2a', emissive: '#ffd9a0', emissiveIntensity: 0.6 })
    case 'glass': return new THREE.MeshPhysicalMaterial({ color: '#1b2833', metalness: 0.4, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.8 })
    default: return new THREE.MeshStandardMaterial({ vertexColors: true })
  }
}

export default function Village() {
  const houses = useMemo(() => buildHouses(), [])
  const meshes = useMemo(() => {
    const T = houseTextures()
    const b = new Builder()
    houses.forEach((h) => buildHouse(b, h))
    return Object.entries(b.build()).map(([kind, geo]) => ({ kind, geo, mat: material(kind, T) }))
  }, [houses])

  return (
    <>
      {meshes.map(({ kind, geo, mat }) => (
        <mesh key={kind} geometry={geo} material={mat} castShadow={kind !== 'glass' && kind !== 'paving'} receiveShadow />
      ))}
      <RigidBody type="fixed" colliders={false} name="village">
        {houses.flatMap((h, i) => h.boxes.map((bx, k) => (
          <CuboidCollider key={`${i}-${k}`} args={[bx.hx, bx.hy, bx.hz]} position={[bx.cx, bx.hy, bx.cz]} rotation={[0, 0, 0]} />
        )))}
      </RigidBody>
    </>
  )
}
