// Realistic trees & bushes from the "Trees & Bushes pack" (Painkiller5555, Blend Swap #78071, CC-BY 3.0).
// Every variant has two detail levels; instances are re-bucketed by distance to the camera a few times
// a second (near = full mesh with shadows, far = light LOD). Leaves sway in the wind (vertex shader).
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RigidBody, CylinderCollider } from '@react-three/rapier'
import { useGame } from '../store/useGame.js'

const TREES = ['tree-leaves-001', 'tree-tree-005', 'tree-tree-006', 'tree-tree-007', 'tree-tree-008', 'tree-tree-009']
const BUSHES = ['bush-leaves', 'bush-tree', 'bush-tree-001', 'bush-tree-002', 'bush-tree-003', 'bush-tree-004']
const ALL = [...TREES, ...BUSHES]
const url = (n, lod) => `/models/flora/${n}${lod ? '-lod1' : ''}.glb`

// Curated foliage palette per variant (the pack's own colours were tuned for Cycles' bounce light)
const LEAF = {
  'tree-leaves-001': '#7f9a52', 'tree-tree-005': '#a8862c', 'tree-tree-006': '#5f7f34', 'tree-tree-007': '#9c5a1e',
  'tree-tree-008': '#6f8a3a', 'tree-tree-009': '#4f7a32',
  'bush-leaves': '#56762e', 'bush-tree': '#5f7f30', 'bush-tree-001': '#6b8b3c', 'bush-tree-002': '#4c6c2c',
  'bush-tree-003': '#7a8a3a', 'bush-tree-004': '#587a34',
}
const BARK = '#4b3b2c'

export const FLORA_SETTINGS = {
  low: { trees: 200, bushes: 120, near: 50, shadows: false },
  medium: { trees: 650, bushes: 420, near: 85, shadows: true },
  high: { trees: 1100, bushes: 800, near: 130, shadows: true },
}

// one shared wind uniform for every flora material
const wind = { value: 0 }

function makeMaterial(color, leaf) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness: leaf ? 0.75 : 0.95, metalness: 0, side: leaf ? THREE.DoubleSide : THREE.FrontSide,
  })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
          float h = max(position.y, 0.0);
          float bend = h * h * ${leaf ? '0.0016' : '0.0009'};
          float ph = uWind * 1.3 + ip.x * 0.11 + ip.y * 0.07;
          transformed.x += sin(ph) * bend + sin(ph * 2.7 + position.z) * ${leaf ? '0.035' : '0.0'} * h * 0.1;
          transformed.z += cos(ph * 0.8) * bend * 0.6;
        #endif`)
  }
  m.customProgramCacheKey = () => (leaf ? 'leaf-wind' : 'bark-wind')
  return m
}

/** Pull bark + leaf geometry out of a loaded variant, in its own space (base at origin) */
function extract(scene) {
  const parts = { bark: [], leaf: [] }
  scene.updateMatrixWorld(true)
  scene.traverse((o) => {
    if (!o.isMesh) return
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld)
    const role = (o.material?.name || '').startsWith('leaf') ? 'leaf' : 'bark'
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
    parts[role].push(g)
  })
  const out = {}
  for (const role of ['bark', 'leaf']) {
    if (!parts[role].length) continue
    const g = mergeGeometries(parts[role], false)
    if (role === 'leaf') {
      // soft "canopy" normals: blend each leaf's normal with the direction from the canopy centre
      g.computeBoundingBox()
      const c = new THREE.Vector3()
      g.boundingBox.getCenter(c)
      const pos = g.attributes.position, nor = g.attributes.normal
      const v = new THREE.Vector3(), n = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).sub(c).normalize()
        n.fromBufferAttribute(nor, i)
        if (n.dot(v) < 0) n.negate()
        n.lerp(v, 0.75).normalize()
        nor.setXYZ(i, n.x, n.y, n.z)
      }
    }
    g.computeBoundingSphere()
    out[role] = g
  }
  return out
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * placeTrees(rnd) -> [{x, z}] candidate spots for trees; placeBushes likewise. Both supplied by the world
 * so layout rules (roads, buildings) stay in one place.
 */
export default function Flora({ treeSpot, bushSpot }) {
  const quality = useGame((s) => s.quality)
  const cfg = FLORA_SETTINGS[quality]
  const near = ALL.map((n) => useGLTF(url(n, 0)))
  const far = ALL.map((n) => useGLTF(url(n, 1)))

  // geometry + materials per variant
  const variants = useMemo(() => ALL.map((name, i) => {
    const hi = extract(near[i].scene)
    const lo = extract(far[i].scene)
    const isTree = name.startsWith('tree')
    return {
      name, isTree, hi, lo,
      mats: { bark: makeMaterial(BARK, false), leaf: makeMaterial(LEAF[name], true) },
      scale: isTree ? 0.62 : 0.32,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  // instance layout
  const layout = useMemo(() => {
    const rnd = mulberry32(1337)
    const items = []
    const add = (count, spot, isTree) => {
      let guard = 0, n = 0
      while (n < count && guard++ < count * 40) {
        const p = spot(rnd)
        if (!p) continue
        const pool = isTree ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11]
        // mostly green trees; the two autumn variants are rarer
        let v = pool[Math.floor(rnd() * pool.length)]
        if (isTree && (v === 1 || v === 3) && rnd() < 0.55) v = 5
        const s = variants[v].scale * (0.75 + rnd() * 0.5)
        items.push({ v, x: p.x, z: p.z, s, r: rnd() * Math.PI * 2, isTree })
        n++
      }
    }
    add(cfg.trees, treeSpot, true)
    add(cfg.bushes, bushSpot, false)
    return items
  }, [cfg.trees, cfg.bushes, treeSpot, bushSpot, variants])

  // instanced meshes: [variant][lod][role]
  const meshes = useMemo(() => {
    const out = []
    variants.forEach((vr, vi) => {
      const count = layout.filter((t) => t.v === vi).length
      out[vi] = [0, 1].map((lod) => {
        const geo = lod ? vr.lo : vr.hi
        return ['bark', 'leaf'].filter((r) => geo[r]).map((role) => {
          const m = new THREE.InstancedMesh(geo[role], vr.mats[role], Math.max(1, count))
          m.count = 0
          m.frustumCulled = false
          m.castShadow = lod === 0 && cfg.shadows && vr.isTree
          m.receiveShadow = false
          m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
          return m
        })
      })
    })
    return out
  }, [variants, layout, cfg.shadows])

  useEffect(() => () => meshes.flat(2).forEach((m) => m.dispose()), [meshes])

  const matrices = useMemo(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
    return layout.map((t) => m.compose(p.set(t.x, 0, t.z), q.setFromAxisAngle(up, t.r), s.setScalar(t.s)).clone())
  }, [layout])

  const timer = useRef(1)
  const camPos = useRef(new THREE.Vector3(1e9, 0, 0))
  useFrame(({ camera }, dt) => {
    wind.value += dt
    timer.current += dt
    // rebucket when the camera moved enough (or every 0.5 s)
    if (timer.current < 0.5 && camPos.current.distanceToSquared(camera.position) < 16) return
    timer.current = 0
    camPos.current.copy(camera.position)
    const counts = meshes.map((lods) => lods.map(() => 0))
    const r2 = cfg.near * cfg.near
    const cx = camera.position.x, cz = camera.position.z
    for (let i = 0; i < layout.length; i++) {
      const t = layout[i]
      const d2 = (t.x - cx) ** 2 + (t.z - cz) ** 2
      const lod = d2 < r2 * (t.isTree ? 1 : 0.45) ? 0 : 1
      if (!t.isTree && d2 > 260 * 260) continue // bushes vanish into the distance
      const k = counts[t.v][lod]++
      for (const mesh of meshes[t.v][lod]) mesh.setMatrixAt(k, matrices[i])
    }
    meshes.forEach((lods, vi) => lods.forEach((group, lod) => group.forEach((mesh) => {
      mesh.count = counts[vi][lod]
      mesh.instanceMatrix.needsUpdate = true
    })))
  })

  const trunkColliders = layout.filter((t) => t.isTree)
  return (
    <>
      {meshes.flat(2).map((m, i) => <primitive key={i} object={m} />)}
      <RigidBody key={'trunks-' + quality} type="fixed" colliders={false} name="trees">
        {trunkColliders.map((t, i) => <CylinderCollider key={i} args={[2, 0.32 * (t.s / 0.62)]} position={[t.x, 2, t.z]} />)}
      </RigidBody>
    </>
  )
}

ALL.forEach((n) => { useGLTF.preload(url(n, 0)); useGLTF.preload(url(n, 1)) })
