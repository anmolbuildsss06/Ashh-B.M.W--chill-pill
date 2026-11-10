// Realistic 3D grass from "Simple Realistic Grass" (.blend): one thinned clump, instanced on a world
// grid around the camera (only on grass surfaces). Blades bend in the wind and shade root→tip.
// Instances fade (shrink) toward the edge of the ring so nothing pops.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGame } from '../store/useGame.js'
import { surfaceAt } from './surfaces.js'

const URL = '/models/grass/grass-clump.glb'
const URL_LITE = '/models/grass/grass-clump-lite.glb'
export const GRASS_SETTINGS = {
  // inner ring: full clumps; outer ring: light clumps, thinning toward the edge
  low: { radius: 22, inner: 9, cell: 1.2, scale: 0.6, outerKeep: 0.5 },
  medium: { radius: 32, inner: 13, cell: 1.0, scale: 0.55, outerKeep: 0.6 },
  high: { radius: 46, inner: 18, cell: 0.85, scale: 0.5, outerKeep: 0.75 },
}

const hash = (x, z, k) => {
  let h = (x * 374761393 + z * 668265263 + k * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

const uTime = { value: 0 }
const uCar = { value: new THREE.Vector3(1e6, 0, 0) }

function grassMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide, vertexColors: true })
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime
    s.uniforms.uCar = uCar
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uCar;
        varying float vH; varying float vTint;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), 0.65));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float h = color.r; vH = h;
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        vTint = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453);
        float gust = sin(uTime * 0.7 + ip.x * 0.05 + ip.z * 0.03) * 0.5 + 0.5;
        float ph = uTime * 2.2 + ip.x * 0.37 + ip.z * 0.23;
        float bend = h * h * (0.10 + gust * 0.22);
        transformed.x += sin(ph) * bend;
        transformed.z += cos(ph * 0.83) * bend * 0.6;
        // flatten under / beside the car
        vec3 wp = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        float d = distance(wp.xz, uCar.xz);
        transformed.y *= mix(0.25, 1.0, smoothstep(1.2, 2.6, d));
        transformed.y *= 0.8;`)
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vH; varying float vTint;`)
      .replace('#include <color_fragment>', `
        vec3 root = vec3(0.025, 0.05, 0.012);
        vec3 tip = mix(vec3(0.15, 0.30, 0.055), vec3(0.26, 0.36, 0.08), vTint * vTint);
        diffuseColor.rgb = mix(root, tip, smoothstep(0.0, 1.0, vH));`)
  }
  m.customProgramCacheKey = () => 'grass-v1'
  return m
}

export default function Grass({ exclude }) {
  const quality = useGame((s) => s.quality)
  const cfg = GRASS_SETTINGS[quality]
  const full = useGLTF(URL).scene
  const lite = useGLTF(URL_LITE).scene
  const firstGeo = (sc) => { let g = null; sc.traverse((o) => { if (o.isMesh && !g) g = o.geometry }); return g }
  const mat = useMemo(() => grassMaterial(), [])

  const capacity = useMemo(() => Math.ceil(Math.PI * (cfg.radius / cfg.cell) ** 2 * 1.05), [cfg])
  const [mesh, meshLite] = useMemo(() => [firstGeo(full), firstGeo(lite)].map((geo) => {
    const m = new THREE.InstancedMesh(geo, mat, capacity)
    m.count = 0
    m.frustumCulled = false
    m.receiveShadow = true
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    return m
  }), [full, lite, mat, capacity])
  useEffect(() => () => { mesh.dispose(); meshLite.dispose() }, [mesh, meshLite])

  // per-cell cache of whether the cell is grass (surface lookup is not free)
  const cellOk = useMemo(() => new Map(), [])
  const last = useRef({ x: 1e9, z: 1e9 })
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), [])

  useFrame(({ camera }, dt) => {
    uTime.value += dt
    const body = window.__m4?.car?.body
    if (body) { const t = body.translation(); uCar.value.set(t.x, t.y, t.z) }
    // centre the field slightly ahead of the camera, where the eye looks
    const dir = camera.getWorldDirection(tmp.p).setY(0).normalize()
    const cx = camera.position.x + dir.x * cfg.radius * 0.35
    const cz = camera.position.z + dir.z * cfg.radius * 0.35
    if ((cx - last.current.x) ** 2 + (cz - last.current.z) ** 2 < cfg.cell * cfg.cell) return
    last.current = { x: cx, z: cz }
    const R = cfg.radius, c = cfg.cell
    const i0 = Math.floor((cx - R) / c), i1 = Math.ceil((cx + R) / c)
    const j0 = Math.floor((cz - R) / c), j1 = Math.ceil((cz + R) / c)
    let n = 0, nl = 0
    for (let i = i0; i <= i1 && n < capacity; i++) {
      for (let j = j0; j <= j1 && n < capacity && nl < capacity; j++) {
        const x = (i + hash(i, j, 1)) * c
        const z = (j + hash(i, j, 2)) * c
        const d = Math.hypot(x - cx, z - cz)
        if (d > R) continue
        const key = i * 100003 + j
        let ok = cellOk.get(key)
        if (ok === undefined) {
          ok = surfaceAt(x, z).id === 'grass' && surfaceAt(x + 1.1, z).id === 'grass' && surfaceAt(x - 1.1, z).id === 'grass' &&
            surfaceAt(x, z + 1.1).id === 'grass' && surfaceAt(x, z - 1.1).id === 'grass' && !(exclude && exclude(x, z))
          if (cellOk.size > 400000) cellOk.clear()
          cellOk.set(key, ok)
        }
        if (!ok) continue
        const outer = d > cfg.inner
        if (outer && hash(i, j, 6) > cfg.outerKeep * (1 - 0.5 * (d - cfg.inner) / (R - cfg.inner))) continue
        const fade = Math.min(1, (R - d) / (R * 0.22))
        const sc = cfg.scale * (0.7 + hash(i, j, 3) * 0.6) * fade
        tmp.q.setFromAxisAngle(tmp.up, hash(i, j, 4) * Math.PI * 2)
        tmp.m.compose(tmp.p.set(x, 0, z), tmp.q, tmp.s.set(sc, sc * (0.8 + hash(i, j, 5) * 0.5), sc))
        if (outer) meshLite.setMatrixAt(nl++, tmp.m)
        else mesh.setMatrixAt(n++, tmp.m)
      }
    }
    mesh.count = n
    meshLite.count = nl
    mesh.instanceMatrix.needsUpdate = true
    meshLite.instanceMatrix.needsUpdate = true
  })

  return <><primitive object={mesh} /><primitive object={meshLite} /></>
}

useGLTF.preload(URL)
useGLTF.preload(URL_LITE)
