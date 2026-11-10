// Stage 1 world: the M Proving Ground — oval circuit, handling pad, skidpad, dirt bowl,
// ramps, slalom cones, buildings, trees and walls. Stage 2 replaces this with the open-world terrain.
import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RigidBody, CuboidCollider, CylinderCollider } from '@react-three/rapier'
import { buildGroundTexture } from './groundTexture.js'
import Billboard from './Billboard.jsx'
import Village, { buildHouses } from './Village.jsx'
import Ponies from './Ponies.jsx'
import { surfaceAt, trackDistance, GROUND_SIZE, HALF, PAD, SKIDPAD } from './surfaces.js'
import { useGame, QUALITY } from '../store/useGame.js'

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Ground() {
  const q = QUALITY[useGame((s) => s.quality)]
  const tex = useMemo(() => buildGroundTexture(q.groundTex), [q.groundTex])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <>
      <RigidBody type="fixed" colliders={false} name="ground">
        <CuboidCollider args={[HALF + 400, 1, HALF + 400]} position={[0, -1, 0]} friction={1} />
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial map={tex} roughness={0.92} metalness={0} />
      </mesh>
      {/* outer meadow to the horizon */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <ringGeometry args={[HALF * 0.99, 4000, 64, 1]} />
        <meshStandardMaterial color="#4a6b33" roughness={1} />
      </mesh>
    </>
  )
}

function Walls() {
  const h = 1.2
  const segs = [
    [0, -HALF, HALF, 0.5], [0, HALF, HALF, 0.5], [-HALF, 0, 0.5, HALF], [HALF, 0, 0.5, HALF],
  ]
  return (
    <RigidBody type="fixed" colliders={false} name="walls">
      {segs.map(([x, z, hx, hz], i) => (
        <group key={i}>
          <CuboidCollider args={[hx, h, hz]} position={[x, h, z]} />
          <mesh position={[x, h / 2, z]} castShadow receiveShadow>
            <boxGeometry args={[hx * 2, h, hz * 2]} />
            <meshStandardMaterial color="#b9bcc0" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </RigidBody>
  )
}

function Ramp({ position, rotationY = 0, size = [8, 1.4, 10], color = '#e4002b' }) {
  const [w, h, l] = size
  const angle = Math.atan2(h, l)
  const len = Math.hypot(h, l)
  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={[0, rotationY, 0]} name="ramp">
      <group position={[0, h / 2 - 0.05, 0]} rotation={[angle, 0, 0]}>
        <CuboidCollider args={[w / 2, 0.1, len / 2]} friction={1} />
        <mesh castShadow receiveShadow>
          <boxGeometry args={[w, 0.2, len]} />
          <meshStandardMaterial color="#4d5157" roughness={0.8} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (w / 2 - 0.3), 0.11, 0]}>
            <boxGeometry args={[0.4, 0.02, len]} />
            <meshStandardMaterial color={color} roughness={0.6} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  )
}

function Cones() {
  const instances = useMemo(() => {
    const list = []
    // slalom across the pad
    for (let i = 0; i < 10; i++) list.push({ key: 's' + i, position: [-32 + i * 7, 0.4, -17], rotation: [0, 0, 0] })
    // gate box on skidpad
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      list.push({ key: 'k' + i, position: [SKIDPAD.x + Math.cos(a) * 8, 0.4, SKIDPAD.z + Math.sin(a) * 8], rotation: [0, 0, 0] })
    }
    return list
  }, [])
  const geo = useMemo(() => new THREE.ConeGeometry(0.22, 0.75, 14), [])
  const base = useMemo(() => new THREE.BoxGeometry(0.42, 0.04, 0.42).translate(0, -0.355, 0), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff5a12', roughness: 0.6 }), [])
  const baseMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 }), [])
  return (
    <>
      {instances.map((c) => (
        <RigidBody key={c.key} position={c.position} colliders={false} linearDamping={0.6} angularDamping={0.6} name="cone">
          <CylinderCollider args={[0.37, 0.2]} mass={3} friction={0.7} />
          <mesh geometry={geo} material={mat} castShadow />
          <mesh geometry={base} material={baseMat} />
        </RigidBody>
      ))}
    </>
  )
}

function Building({ position, size, color = '#d6d8db', glass = false, colliderOnly = false }) {
  const [w, h, d] = size
  return (
    <RigidBody type="fixed" colliders={false} position={position}>
      <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
      {!colliderOnly && (
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={size} />
          <meshStandardMaterial color={color} roughness={glass ? 0.15 : 0.8} metalness={glass ? 0.6 : 0.05} />
        </mesh>
      )}
    </RigidBody>
  )
}

function Facilities() {
  return (
    <>
      {/* Pit / garage building south of the pad, facade facing north */}
      <Building position={[0, 0, 46]} size={[46, 7, 24]} color="#e6e8ea" />
      <mesh position={[0, 5.2, 33.9]}>
        <boxGeometry args={[40, 1.6, 0.2]} />
        <meshStandardMaterial color="#0e1116" metalness={0.6} roughness={0.2} />
      </mesh>
      {[-15, -5, 5, 15].map((x) => (
        <mesh key={x} position={[x, 2.2, 33.9]}>
          <boxGeometry args={[8, 4, 0.2]} />
          <meshStandardMaterial color="#20252c" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 6.6, 33.85]}>
        <boxGeometry args={[40, 0.35, 0.1]} />
        <meshStandardMaterial color="#1c2a5b" emissive="#0066b1" emissiveIntensity={0.4} />
      </mesh>
      {/* Grandstand outside the east straight, facing the start line */}
      <RigidBody type="fixed" colliders={false} position={[140, 0, 60]}>
        <CuboidCollider args={[6, 4, 40]} position={[0, 4, 0]} />
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[-5 + i * 1.4, 0.6 + i * 1.0, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.4, 1.2 + i * 2, 80]} />
            <meshStandardMaterial color={i % 2 ? '#8b9097' : '#9aa0a7'} roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[1, 11, 0]} castShadow>
          <boxGeometry args={[14, 0.3, 82]} />
          <meshStandardMaterial color="#e4e6e9" />
        </mesh>
      </RigidBody>
      {/* Start gantry */}
      <group position={[110, 0, 60.8]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 10, 3.5, 0]} castShadow>
            <boxGeometry args={[0.5, 7, 0.5]} />
            <meshStandardMaterial color="#25282d" />
          </mesh>
        ))}
        <mesh position={[0, 7, 0]} castShadow>
          <boxGeometry args={[20.5, 1.2, 0.6]} />
          <meshStandardMaterial color="#1c2a5b" />
        </mesh>
        <mesh position={[0, 7, 0.31]}>
          <boxGeometry args={[19, 0.3, 0.02]} />
          <meshStandardMaterial color="#fff" emissive="#4fb4e8" emissiveIntensity={0.6} />
        </mesh>
      </group>
      {/* gantry posts collide */}
      <RigidBody type="fixed" colliders={false} position={[110, 0, 60.8]}>
        <CuboidCollider args={[0.25, 3.5, 0.25]} position={[-10, 3.5, 0]} />
        <CuboidCollider args={[0.25, 3.5, 0.25]} position={[10, 3.5, 0]} />
      </RigidBody>
    </>
  )
}

function LampPosts() {
  const positions = useMemo(() => {
    const p = []
    for (let x = PAD.x0; x <= PAD.x1; x += 15) {
      if (Math.abs(x) > 8) p.push([x, PAD.z0 - 1.5]) // keep the north road clear
      p.push([x, PAD.z1 + 1.5])
    }
    return p
  }, [])
  const pole = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.09, 0.12, 8, 8)
    g.translate(0, 4, 0)
    return g
  }, [])
  const head = useMemo(() => new THREE.BoxGeometry(0.5, 0.15, 1.2).translate(0, 8, 0), [])
  const m = useMemo(() => new THREE.Matrix4(), [])
  const ref = (mesh) => {
    if (!mesh) return
    positions.forEach(([x, z], i) => { m.makeTranslation(x, 0, z); mesh.setMatrixAt(i, m) })
    mesh.instanceMatrix.needsUpdate = true
  }
  return (
    <>
      <instancedMesh ref={ref} args={[pole, null, positions.length]} castShadow>
        <meshStandardMaterial color="#5c6168" metalness={0.6} roughness={0.4} />
      </instancedMesh>
      <instancedMesh ref={ref} args={[head, null, positions.length]}>
        <meshStandardMaterial color="#e9eef5" emissive="#ffffff" emissiveIntensity={0.3} />
      </instancedMesh>
      <RigidBody type="fixed" colliders={false}>
        {positions.map(([x, z], i) => <CylinderCollider key={i} args={[4, 0.15]} position={[x, 4, z]} />)}
      </RigidBody>
    </>
  )
}

// ---- Tree placement rules ----
const near = (x, z, r) => {
  for (let dx = -r; dx <= r; dx += r) for (let dz = -r; dz <= r; dz += r) if (surfaceAt(x + dx, z + dz).id !== 'grass') return true
  return false
}
function blocked(x, z) {
  if (Math.abs(x) < 32 && z > 26 && z < 66) return true // garage
  if (x > 125 && x < 160 && z > 15 && z < 105) return true // grandstand
  if (x > 20 && x < 50 && z > -26 && z < -8) return true // banner
  if (x > 122 && x < 140 && z > -40 && z < -2) return true // banner
  if (x > -136 && x < -118 && z > 6 && z < 26) return true // banner
  if (Math.hypot(x, z) < 60) return true // spawn pad surroundings
  return false
}
const houseFootprints = buildHouses()
const inBoxes = (list, x, z, pad) => list.some((b) => Math.abs(x - b.cx) < b.hx + pad && Math.abs(z - b.cz) < b.hz + pad)
const inHouse = (x, z, pad) => houseFootprints.some((h) => inBoxes(h.boxes, x, z, pad) || inBoxes(h.paved, x, z, Math.min(pad, 0.4)))

const treeSpot = (rnd) => {
  const x = (rnd() * 2 - 1) * (HALF - 8)
  const z = (rnd() * 2 - 1) * (HALF - 8)
  if (surfaceAt(x, z).id !== 'grass' || trackDistance(x, z) < 22 || blocked(x, z) || near(x, z, 7)) return null
  if (x < -118 && Math.abs(z) < 90 && rnd() > 0.15) return null // keep the village airy
  if (inHouse(x, z, 6)) return null
  const grove = Math.sin(x * 0.021) * Math.cos(z * 0.017) + Math.sin((x + z) * 0.011)
  if (grove < 0.1 && rnd() > 0.18) return null
  return { x, z }
}
function Trees() {
  const count = QUALITY[useGame((s) => s.quality)].trees
  const trees = useMemo(() => {
    const rnd = mulberry32(1337)
    const out = []
    let guard = 0
    while (out.length < count && guard++ < count * 40) {
      const p = treeSpot(rnd)
      if (!p) continue
      out.push({ x: p.x, z: p.z, s: 0.8 + rnd() * 0.7, r: rnd() * Math.PI * 2, kind: rnd() > 0.35 ? 0 : 1 })
    }
    return out
  }, [count])

  const geos = useMemo(() => ({
    trunk: new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6).translate(0, 1.2, 0),
    pine: new THREE.ConeGeometry(1.7, 5.5, 7).translate(0, 4.6, 0),
    leafy: new THREE.IcosahedronGeometry(2.1, 0).translate(0, 4.0, 0),
  }), [])

  const setup = (filter, tint) => (mesh) => {
    if (!mesh) return
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
    const color = new THREE.Color()
    let i = 0
    trees.forEach((t) => {
      if (!filter(t)) return
      m.compose(p.set(t.x, 0, t.z), q.setFromAxisAngle(up, t.r), sc.setScalar(t.s))
      mesh.setMatrixAt(i, m)
      if (tint) {
        color.setHSL(t.kind ? 0.27 + (t.r % 0.06) : 0.33 + (t.r % 0.04), 0.45, 0.22 + (t.s - 0.8) * 0.12)
        mesh.setColorAt(i, color)
      }
      i++
    })
    mesh.count = i
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }
  const pines = trees.filter((t) => t.kind === 0).length

  return (
    <>
      <instancedMesh key={'t' + count} ref={setup(() => true)} args={[geos.trunk, null, trees.length]} castShadow>
        <meshStandardMaterial color="#4a3426" roughness={1} />
      </instancedMesh>
      <instancedMesh key={'p' + count} ref={setup((t) => t.kind === 0, true)} args={[geos.pine, null, Math.max(1, pines)]} castShadow>
        <meshStandardMaterial roughness={0.95} flatShading />
      </instancedMesh>
      <instancedMesh key={'l' + count} ref={setup((t) => t.kind === 1, true)} args={[geos.leafy, null, Math.max(1, trees.length - pines)]} castShadow>
        <meshStandardMaterial roughness={0.95} flatShading />
      </instancedMesh>
      <RigidBody key={'c' + count} type="fixed" colliders={false} name="trees">
        {trees.map((t, i) => <CylinderCollider key={i} args={[1.5, 0.3 * t.s]} position={[t.x, 1.5, t.z]} />)}
      </RigidBody>
    </>
  )
}

function DistantHills() {
  const geo = useMemo(() => {
    const rnd = mulberry32(99)
    const parts = []
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rnd() * 0.1
      const d = 900 + rnd() * 700
      const h = 90 + rnd() * 260
      const r = 220 + rnd() * 260
      const g = new THREE.ConeGeometry(r, h, 7, 1)
      g.translate(Math.cos(a) * d, h / 2 - 10, Math.sin(a) * d)
      parts.push(g)
    }
    // merge manually
    let total = 0
    parts.forEach((g) => { total += g.toNonIndexed().attributes.position.count })
    const pos = new Float32Array(total * 3)
    let o = 0
    parts.forEach((g) => { const a = g.toNonIndexed().attributes.position.array; pos.set(a, o); o += a.length })
    const merged = new THREE.BufferGeometry()
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    merged.computeVertexNormals()
    return merged
  }, [])
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#5d7a5a" roughness={1} flatShading />
    </mesh>
  )
}

export default function ProvingGround() {
  return (
    <group>
      <Ground />
      <Walls />
      <Facilities />
      <LampPosts />
      <Trees />
      <Suspense fallback={null}>
        <Ponies />
      </Suspense>
      <DistantHills />
      <Cones />
      <Village />
      {/* "Ashh loves B Means B.M.W!" banners: by the cross road (seen from the spawn), on the main straight, at the village entrance */}
      <Billboard position={[34, 0, -15]} rotationY={-0.55} width={16} height={4} />
      <Billboard position={[131, 0, -20]} rotationY={-Math.PI / 2} width={20} height={5} lift={3} />
      <Billboard position={[-128, 0, 15]} rotationY={Math.PI - 0.6} width={13} height={3.4} />
      {/* jumps */}
      <Ramp position={[-80, 0, 0]} rotationY={Math.PI / 2} size={[9, 1.2, 9]} />
      <Ramp position={[62, 0, 0]} rotationY={-Math.PI / 2} size={[9, 0.9, 8]} color="#4fb4e8" />
      <Ramp position={[0, 0, 150]} rotationY={Math.PI} size={[10, 1.6, 10]} color="#ffb300" />
    </group>
  )
}
