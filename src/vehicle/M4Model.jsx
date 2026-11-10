// Procedural BMW M4 Competition (G82) built from extruded profiles.
// Frame: forward = -Z, up = +Y, ground at y = 0. Real dimensions: 4.79 × 1.89 × 1.39 m, 2.857 m wheelbase.
// To use a licensed GLB instead, set `modelUrl` in config/cars.js and load it in Car.jsx.
import { forwardRef, useMemo } from 'react'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const AX_F = 1.43
const AX_R = -1.427
const ARCH_R = 0.4
const HUB = 0.345

// Side-profile helper: shape in (u = forward, v = up), extruded across the car width (X)
function profileGeometry(points, width, bevel = 0.06, shaper = null) {
  const s = new THREE.Shape()
  s.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    if (p === 'archR' || p === 'archF') {
      const cu = p === 'archR' ? AX_R : AX_F
      for (let k = 0; k <= 14; k++) {
        const a = Math.PI - (k / 14) * Math.PI
        s.lineTo(cu + Math.cos(a) * ARCH_R, HUB + Math.sin(a) * ARCH_R)
      }
    } else s.lineTo(p[0], p[1])
  }
  s.closePath()
  const depth = width - bevel * 2
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 4, curveSegments: 12, steps: 14,
  })
  g.translate(0, 0, -depth / 2)
  g.rotateY(Math.PI / 2) // u → -Z, depth → X
  if (shaper) {
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = shaper(pos.getX(i), pos.getY(i), pos.getZ(i))
      pos.setXYZ(i, x, y, z)
    }
  }
  // weld so normals are smooth across the subdivided panels (otherwise big flat facets)
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  g.clearGroups()
  const welded = mergeVertices(g, 1e-4)
  welded.computeVertexNormals()
  g.dispose()
  return welded
}

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// Plan-view taper (nose + tail corners pulled in) and tumblehome (sides lean in above the shoulder)
function bodyShaper(x, y, z) {
  const nose = sstep(-1.75, -2.5, z) // front is -Z
  const tail = sstep(1.9, 2.5, z)
  const shoulder = sstep(0.82, 1.05, y)
  const low = sstep(0.4, 0.2, y)
  let k = 1 - nose * (0.1 + 0.08 * Math.abs(x) / 0.95) - tail * 0.07 - shoulder * 0.07 - low * 0.03
  // flared wheel arches (M4 wide-body hips)
  const archF = Math.exp(-((z + 1.43) ** 2) / 0.35), archR = Math.exp(-((z - 1.427) ** 2) / 0.4)
  const hip = (archF * 0.02 + archR * 0.035) * sstep(0.35, 0.6, y) * (1 - shoulder)
  k += hip
  // hood slopes down toward the nose a little at the edges
  const yy = y - nose * Math.max(0, y - 0.6) * 0.12 * (Math.abs(x) / 0.95)
  return [x * k, yy, z]
}
function cabinShaper(x, y, z) {
  const h = sstep(0.9, 1.38, y)
  const k = 1 - h * 0.2 - sstep(-0.6, -1.0, z) * h * 0.05
  return [x * k, y, z]
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape()
  const x = -w / 2, y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

export function useCarMaterials(paint) {
  return useMemo(() => {
    const m = {
      paint: new THREE.MeshPhysicalMaterial({ color: paint.color, metalness: paint.metalness, roughness: Math.max(0.18, paint.roughness - 0.08), clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.5, specularIntensity: 1 }),
      gloss: new THREE.MeshPhysicalMaterial({ color: '#08090b', metalness: 0.3, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 }),
      carbon: new THREE.MeshStandardMaterial({ color: '#15171b', metalness: 0.4, roughness: 0.38 }),
      plastic: new THREE.MeshStandardMaterial({ color: '#0d0e10', metalness: 0, roughness: 0.75 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#05080c', metalness: 0.45, roughness: 0.02, transparent: true, opacity: 0.9, clearcoat: 1, envMapIntensity: 2.2 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 1, roughness: 0.12 }),
      grilleFrame: new THREE.MeshStandardMaterial({ color: '#1a1b1e', metalness: 0.8, roughness: 0.25 }),
      led: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#eaf4ff', emissiveIntensity: 3.2, toneMapped: false }),
      laser: new THREE.MeshStandardMaterial({ color: '#2b7bff', emissive: '#2b7bff', emissiveIntensity: 1.6, toneMapped: false }),
      headHousing: new THREE.MeshPhysicalMaterial({ color: '#111419', metalness: 0.6, roughness: 0.15, clearcoat: 1 }),
      tail: new THREE.MeshStandardMaterial({ color: '#4a0006', emissive: '#ff1020', emissiveIntensity: 0.9, toneMapped: false }),
      tailLens: new THREE.MeshPhysicalMaterial({ color: '#2a0205', metalness: 0.1, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.9 }),
      interior: new THREE.MeshStandardMaterial({ color: '#1b1c1f', roughness: 0.85 }),
      seat: new THREE.MeshStandardMaterial({ color: '#c35a1f', roughness: 0.7 }), // Kyalami orange merino
      exhaust: new THREE.MeshStandardMaterial({ color: '#2a2a2c', metalness: 0.9, roughness: 0.35 }),
      exhaustInner: new THREE.MeshBasicMaterial({ color: '#050505' }),
      roundelBlue: new THREE.MeshStandardMaterial({ color: '#1c69d4', roughness: 0.3 }),
      roundelWhite: new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.3 }),
      underbody: new THREE.MeshStandardMaterial({ color: '#070708', roughness: 1 }),
    }
    return m
  }, [paint.color, paint.metalness, paint.roughness])
}

function Roundel({ mats, position, rotation, r = 0.045 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh material={mats.gloss}><circleGeometry args={[r, 24]} /></mesh>
      <mesh position={[0, 0, 0.001]} material={mats.roundelWhite}><circleGeometry args={[r * 0.72, 24]} /></mesh>
      <mesh position={[0, 0, 0.002]} material={mats.roundelBlue}><circleGeometry args={[r * 0.72, 24, 0, Math.PI / 2]} /></mesh>
      <mesh position={[0, 0, 0.002]} material={mats.roundelBlue}><circleGeometry args={[r * 0.72, 24, Math.PI, Math.PI / 2]} /></mesh>
    </group>
  )
}

function KidneyGrille({ mats, side }) {
  const geo = useMemo(() => {
    const frame = new THREE.ExtrudeGeometry(roundedRect(0.33, 0.46, 0.08), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.014, bevelSegments: 2 })
    frame.translate(0, 0, -0.06)
    const inner = new THREE.ShapeGeometry(roundedRect(0.29, 0.42, 0.06))
    return { frame, inner }
  }, [])
  return (
    <group position={[side * 0.19, 0.5, -2.47]} rotation={[-0.16, Math.PI, 0]}>
      <mesh geometry={geo.frame} material={mats.grilleFrame} />
      <mesh geometry={geo.inner} material={mats.plastic} position={[0, 0, 0.016]} />
      {/* horizontal slats */}
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} position={[0, -0.19 + i * 0.042, 0.03]} material={mats.gloss}>
          <boxGeometry args={[0.27, 0.01, 0.025]} />
        </mesh>
      ))}
    </group>
  )
}

function Headlight({ mats, side }) {
  return (
    <group position={[side * 0.6, 0.665, -2.36]} rotation={[0.05, side * -0.42, 0]}>
      <mesh material={mats.headHousing}><boxGeometry args={[0.44, 0.1, 0.2]} /></mesh>
      {/* twin L-shaped LED daytime running lights */}
      <mesh position={[side * -0.02, 0.022, -0.101]} material={mats.led}><boxGeometry args={[0.32, 0.014, 0.01]} /></mesh>
      <mesh position={[side * -0.02, -0.022, -0.101]} material={mats.led}><boxGeometry args={[0.32, 0.014, 0.01]} /></mesh>
      <mesh position={[side * 0.15, 0, -0.101]} material={mats.led}><boxGeometry args={[0.014, 0.058, 0.01]} /></mesh>
      <mesh position={[side * -0.17, -0.004, -0.102]} material={mats.laser}><boxGeometry args={[0.06, 0.012, 0.01]} /></mesh>
    </group>
  )
}

function Taillight({ mats, brakeRef, side }) {
  return (
    <group position={[side * 0.56, 0.87, 2.43]} rotation={[0, side * 0.28, 0]}>
      <mesh material={mats.tailLens}><boxGeometry args={[0.56, 0.15, 0.12]} /></mesh>
      <mesh ref={brakeRef} position={[side * 0.02, 0.035, 0.061]} material={mats.tail}><boxGeometry args={[0.48, 0.022, 0.01]} /></mesh>
      <mesh position={[side * 0.25, -0.005, 0.061]} material={mats.tail}><boxGeometry args={[0.022, 0.1, 0.01]} /></mesh>
      <mesh position={[side * 0.06, -0.035, 0.061]} material={mats.tail}><boxGeometry args={[0.36, 0.016, 0.01]} /></mesh>
    </group>
  )
}

export const M4Body = forwardRef(function M4Body({ mats }, ref) {
  const geo = useMemo(() => {
    const body = profileGeometry([
      [-2.3, 0.3], [-1.85, 0.3], 'archR', [-1.03, 0.3], [1.03, 0.3], 'archF', [1.85, 0.3],
      [2.26, 0.27], [2.38, 0.36], [2.42, 0.52], [2.37, 0.66], [2.16, 0.75], [1.4, 0.85], [0.92, 0.92],
      [-0.4, 0.96], [-1.3, 0.985], [-1.8, 1.0], [-2.22, 1.01], [-2.33, 1.04], [-2.4, 0.95], [-2.43, 0.66], [-2.38, 0.42],
    ], 1.86, 0.075, bodyShaper)
    const cabin = profileGeometry([
      [0.98, 0.9], [0.62, 1.07], [0.08, 1.35], [-0.82, 1.37], [-1.32, 1.23], [-1.84, 1.0], [-1.84, 0.95],
    ], 1.5, 0.07, cabinShaper)
    const roof = profileGeometry([[0.12, 1.36], [-0.8, 1.38], [-0.82, 1.37], [0.08, 1.35]], 1.22, 0.03)
    const fender = new THREE.BoxGeometry(0.5, 0.42, 0.85)
    return { body, cabin, roof, fender }
  }, [])

  return (
    <group ref={ref}>
      <mesh geometry={geo.body} material={mats.paint} castShadow receiveShadow />
      <mesh geometry={geo.cabin} material={mats.glass} castShadow />
      <mesh geometry={geo.roof} material={mats.carbon} position={[0, 0.02, 0]} />
      {/* inner wheel wells */}
      {[[-1, AX_F], [1, AX_F], [-1, AX_R], [1, AX_R]].map(([s, u], i) => (
        <mesh key={i} geometry={geo.fender} material={mats.underbody} position={[s * 0.58, 0.55, -u]} />
      ))}
      {/* underbody */}
      <mesh material={mats.underbody} position={[0, 0.2, 0]}><boxGeometry args={[1.7, 0.12, 4.5]} /></mesh>

      {/* front */}
      <KidneyGrille mats={mats} side={-1} />
      <KidneyGrille mats={mats} side={1} />
      <Headlight mats={mats} side={-1} />
      <Headlight mats={mats} side={1} />
      {/* bumper intakes + splitter */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh material={mats.plastic} position={[s * 0.66, 0.38, -2.44]} rotation={[0, s * 0.3, 0]}><boxGeometry args={[0.32, 0.18, 0.06]} /></mesh>
          <mesh material={mats.carbon} position={[s * 0.85, 0.52, -2.36]} rotation={[0, s * 0.5, 0.5 * s]}><boxGeometry args={[0.16, 0.03, 0.05]} /></mesh>
        </group>
      ))}
      <mesh material={mats.plastic} position={[0, 0.315, -2.49]}><boxGeometry args={[0.62, 0.07, 0.05]} /></mesh>
      <mesh material={mats.carbon} position={[0, 0.22, -2.36]}><boxGeometry args={[1.78, 0.025, 0.22]} /></mesh>

      {/* side: mirrors, skirts, gills */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh material={mats.carbon} position={[s * 1.0, 1.0, -0.82]}><boxGeometry args={[0.16, 0.1, 0.17]} /></mesh>
          <mesh material={mats.carbon} position={[s * 0.92, 0.98, -0.8]}><boxGeometry args={[0.08, 0.03, 0.06]} /></mesh>
          <mesh material={mats.carbon} position={[s * 0.94, 0.27, 0]}><boxGeometry args={[0.06, 0.07, 2.05]} /></mesh>
          <mesh material={mats.gloss} position={[s * 0.945, 0.62, -1.9]}><boxGeometry args={[0.01, 0.06, 0.2]} /></mesh>
          <mesh material={mats.chrome} position={[s * 0.945, 0.82, 0.25]}><boxGeometry args={[0.012, 0.025, 0.18]} /></mesh>
        </group>
      ))}

      {/* rear */}
      <Taillight mats={mats} side={-1} />
      <Taillight mats={mats} side={1} />
      <mesh material={mats.carbon} position={[0, 1.055, 2.28]} rotation={[-0.2, 0, 0]}><boxGeometry args={[1.5, 0.02, 0.1]} /></mesh>
      <mesh material={mats.carbon} position={[0, 0.3, 2.38]}><boxGeometry args={[1.5, 0.16, 0.12]} /></mesh>
      {[-0.15, 0.15].map((x) => (
        <mesh key={x} material={mats.carbon} position={[x, 0.3, 2.45]}><boxGeometry args={[0.02, 0.14, 0.12]} /></mesh>
      ))}
      {/* quad exhaust */}
      {[-0.58, -0.42, 0.42, 0.58].map((x) => (
        <group key={x} position={[x, 0.31, 2.43]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh material={mats.exhaust}><cylinderGeometry args={[0.048, 0.048, 0.14, 20, 1, true]} /></mesh>
          <mesh material={mats.exhaustInner} position={[0, -0.05, 0]}><cylinderGeometry args={[0.04, 0.04, 0.01, 16]} /></mesh>
        </group>
      ))}

      {/* interior (visible from cockpit cam): the extruded body is solid to the beltline,
          so lay an interior "tub" over it and raise the dash above it */}
      <mesh material={mats.interior} position={[0, 1.04, 0.3]}><boxGeometry args={[1.32, 0.02, 2.3]} /></mesh>
      <mesh material={mats.interior} position={[0, 1.05, -0.42]}><boxGeometry args={[1.3, 0.08, 0.36]} /></mesh>
      <mesh material={mats.carbon} position={[0, 1.095, -0.46]} rotation={[0.2, 0, 0]}><boxGeometry args={[1.24, 0.02, 0.22]} /></mesh>
      <mesh material={mats.carbon} position={[-0.37, 1.12, -0.36]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.34, 0.07, 0.05]} /></mesh>
      <mesh material={mats.led} position={[-0.37, 1.12, -0.334]} rotation={[-0.2, 0, 0]}><boxGeometry args={[0.28, 0.004, 0.002]} /></mesh>
      <mesh material={mats.gloss} position={[0.1, 1.12, -0.38]} rotation={[-0.25, 0, 0]}><boxGeometry args={[0.42, 0.09, 0.012]} /></mesh>
      {[-1, 1].map((s2) => (
        <mesh key={s2} material={mats.interior} position={[s2 * 0.63, 1.08, 0.1]}><boxGeometry args={[0.06, 0.1, 1.8]} /></mesh>
      ))}
      {[-0.37, 0.37].map((x) => (
        <group key={x} position={[x, 0.12, 0.42]}>
          <mesh material={mats.seat} position={[0, 0.58, 0]}><boxGeometry args={[0.48, 0.1, 0.46]} /></mesh>
          <mesh material={mats.seat} position={[0, 1.0, 0.24]} rotation={[-0.15, 0, 0]}><boxGeometry args={[0.48, 0.5, 0.1]} /></mesh>
          <mesh material={mats.interior} position={[0, 1.2, 0.28]} rotation={[-0.15, 0, 0]}><boxGeometry args={[0.16, 0.1, 0.09]} /></mesh>
        </group>
      ))}
      <mesh material={mats.carbon} position={[0, 1.07, -0.15]}><boxGeometry args={[0.24, 0.06, 0.9]} /></mesh>
    </group>
  )
})

/** Steering wheel lives separately so it can rotate with input */
export function SteeringWheel({ mats, wheelRef }) {
  return (
    <group position={[-0.37, 1.05, -0.2]} rotation={[-0.3, 0, 0]}>
      <group ref={wheelRef}>
        <mesh material={mats.interior}><torusGeometry args={[0.18, 0.022, 10, 32]} /></mesh>
        <mesh material={mats.interior}><boxGeometry args={[0.34, 0.03, 0.02]} /></mesh>
        <mesh material={mats.interior} position={[0, -0.08, 0]}><boxGeometry args={[0.03, 0.16, 0.02]} /></mesh>
        <mesh material={mats.carbon} position={[0, 0, 0.012]}><circleGeometry args={[0.06, 20]} /></mesh>
        <mesh material={mats.seat} position={[0, 0.18, 0.01]}><boxGeometry args={[0.02, 0.03, 0.03]} /></mesh>
      </group>
    </group>
  )
}

// ---------------- Wheels ----------------
export function useWheelGeometry(radius) {
  return useMemo(() => {
    const tireW = 0.275
    const tire = new THREE.CylinderGeometry(radius, radius, tireW, 36, 1, true)
    tire.rotateZ(Math.PI / 2)
    const shoulder = new THREE.TorusGeometry(radius - 0.035, 0.035, 8, 36)
    shoulder.rotateY(Math.PI / 2)
    const sidewall = new THREE.RingGeometry(0.245, radius - 0.02, 36)
    sidewall.rotateY(Math.PI / 2)
    const barrel = new THREE.CylinderGeometry(0.245, 0.245, tireW - 0.02, 28, 1, true)
    barrel.rotateZ(Math.PI / 2)
    const lip = new THREE.TorusGeometry(0.245, 0.012, 6, 36)
    lip.rotateY(Math.PI / 2)
    const spoke = new THREE.BoxGeometry(0.03, 0.2, 0.034)
    spoke.translate(0, 0.13, 0)
    spoke.rotateY(Math.PI / 2)
    const hub = new THREE.CylinderGeometry(0.06, 0.07, 0.05, 20)
    hub.rotateZ(Math.PI / 2)
    const disc = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 32)
    disc.rotateZ(Math.PI / 2)
    const caliper = new THREE.BoxGeometry(0.07, 0.17, 0.11)
    return { tire, shoulder, sidewall, barrel, lip, spoke, hub, disc, caliper, tireW }
  }, [radius])
}

export function useWheelMaterials(rimColor, caliperColor) {
  return useMemo(() => ({
    tire: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92 }),
    rim: new THREE.MeshStandardMaterial({ color: rimColor, metalness: 0.85, roughness: 0.28 }),
    disc: new THREE.MeshStandardMaterial({ color: '#6a6c70', metalness: 0.8, roughness: 0.45 }),
    caliper: new THREE.MeshStandardMaterial({ color: caliperColor, metalness: 0.3, roughness: 0.35 }),
    cap: new THREE.MeshStandardMaterial({ color: '#1c69d4', roughness: 0.3 }),
  }), [rimColor, caliperColor])
}

/** One wheel; `side` = -1 left, +1 right. Spin group rotates around X; outer group steers. */
export const Wheel = forwardRef(function Wheel({ geo, mats, side, children }, ref) {
  const o = side * (geo.tireW / 2) // outer face offset
  return (
    <group ref={ref}>
      {/* caliper: steers but doesn't spin */}
      <mesh geometry={geo.caliper} material={mats.caliper} position={[o * 0.55, 0.12, 0.1]} rotation={[0.6, 0, 0]} />
      <group name="spin">
        {children ? (
          <>
            <mesh geometry={geo.disc} material={mats.disc} position={[o * 0.05, 0, 0]} />
            {children}
          </>
        ) : (
          <>
        <mesh geometry={geo.tire} material={mats.tire} castShadow />
        <mesh geometry={geo.shoulder} material={mats.tire} position={[o, 0, 0]} />
        <mesh geometry={geo.shoulder} material={mats.tire} position={[-o, 0, 0]} />
        <mesh geometry={geo.sidewall} material={mats.tire} position={[o, 0, 0]} rotation={[0, side > 0 ? 0 : Math.PI, 0]} />
        <mesh geometry={geo.barrel} material={mats.rim} />
        <mesh geometry={geo.lip} material={mats.rim} position={[o * 0.92, 0, 0]} />
        <mesh geometry={geo.disc} material={mats.disc} position={[o * 0.2, 0, 0]} />
        <group position={[o * 0.82, 0, 0]}>
          {/* double-spoke M star design: 10 spokes in 5 pairs */}
          {Array.from({ length: 10 }, (_, i) => (
            <mesh key={i} geometry={geo.spoke} material={mats.rim} rotation={[(i * Math.PI) / 5 + (i % 2 ? 0.12 : -0.12), 0, 0]} />
          ))}
          <mesh geometry={geo.hub} material={mats.rim} />
          <mesh material={mats.cap} position={[side * 0.026, 0, 0]} rotation={[0, side * Math.PI / 2, 0]}><circleGeometry args={[0.03, 16]} /></mesh>
        </group>
          </>
        )}
      </group>
    </group>
  )
})
