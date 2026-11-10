// Loads the user-supplied BMW M4 (F82) glTF and gives it game materials by part name.
// The .blend's Cycles materials don't survive export, so each named material is mapped to a
// physically based material here (paint follows the Garage colour).
import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

function materialFor(name, m) {
  const n = name.toLowerCase()
  if (n.startsWith('car_paint')) return m.paint
  if (n === 'miror') return m.mirror
  if (n === 'piano_black') return m.gloss
  if (n === 'black_mat' || n === 'rubber') return m.plastic
  if (n === 'solid_black') return m.underbody
  if (n === 'glass') return m.glass
  if (n === 'chrome' || n === 'chrome_headlight') return m.chrome
  if (n === 'light') return m.led
  if (n === 'rearlight_red' || n === 'tailights') return m.tail
  if (n === 'chrome_red') return m.tailLens
  if (n === 'reflectors') return m.reflector
  if (n === 'interior') return m.interior
  if (n === 'rim.001') return m.chrome
  if (n === 'bmwblack') return m.badgeBlack
  if (n === 'bmwblue') return m.badgeBlue
  if (n === 'bmwsilver') return m.badgeChrome
  if (n === 'bmwwhite') return m.badgeWhite
  return m.plastic
}

const badge = (color) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
})

export function useModelMaterials(mats) {
  return useMemo(() => ({
    ...mats,
    mirror: new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 1, roughness: 0.04 }),
    reflector: new THREE.MeshStandardMaterial({ color: '#ff7a00', emissive: '#5a2400', roughness: 0.3 }),
    lens: new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.18, clearcoat: 1, envMapIntensity: 2.2, depthWrite: false }),
    badgeBlack: badge('#0c0c0c'),
    badgeBlue: badge('#1c69d4'),
    badgeWhite: badge('#f4f4f4'),
    badgeChrome: Object.assign(badge('#d8dce0'), { metalness: 1, roughness: 0.18 }),
  }), [mats])
}

/** Car body. Ground contact at y = 0, front of the car toward -Z. */
/** Average outward normal and centre of a set of meshes, in the root's space */
function surfaceFrame(root, meshes, carCentre) {
  const c = new THREE.Vector3(), n = new THREE.Vector3(), v = new THREE.Vector3(), nn = new THREE.Vector3()
  let count = 0
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  for (const mesh of meshes) {
    const toRoot = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)
    const nm = new THREE.Matrix3().getNormalMatrix(toRoot)
    const pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal
    for (let i = 0; i < pos.count; i++) {
      c.add(v.fromBufferAttribute(pos, i).applyMatrix4(toRoot)); count++
      if (nor) n.add(nn.fromBufferAttribute(nor, i).applyMatrix3(nm))
    }
  }
  c.divideScalar(count)
  // the badge is a thin disc: its normals cancel front/back, so orient by "away from the car centre"
  const out = c.clone().sub(carCentre)
  if (n.lengthSq() < 1e-6 || n.dot(out) < 0) n.negate()
  if (n.lengthSq() < 1e-6) n.copy(out)
  n.normalize()
  const box = new THREE.Box3()
  for (const mesh of meshes) box.union(new THREE.Box3().setFromObject(mesh).applyMatrix4(inv))
  const size = box.getSize(new THREE.Vector3())
  return { centre: c, normal: n, size: Math.max(size.x, size.y, size.z) }
}

export function M4BodyGLB({ url, scale, mats }) {
  const { scene } = useGLTF(url)
  const m = useModelMaterials(mats)
  const body = useMemo(() => {
    const root = scene.clone(true)
    // --- badges: the model only has the rear roundel; the nose has an empty chrome disc for the front one
    const badgeParts = [], noseDisc = []
    root.traverse((o) => {
      if (!o.isMesh) return
      const n = (o.material?.name || '').toLowerCase()
      if (/^bmw(black|blue|silver|white)/.test(n)) badgeParts.push(o)
      if (n === 'rim.001') noseDisc.push(o)
    })
    const carBox = new THREE.Box3().setFromObject(root)
    const carCentre = carBox.getCenter(new THREE.Vector3())
    if (badgeParts.length && noseDisc.length) {
      const rear = surfaceFrame(root, badgeParts, carCentre)
      const front = surfaceFrame(root, noseDisc, carCentre)
      // turn the rear badge around (π about up), then tilt it onto the nose's surface
      const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
      const flipped = rear.normal.clone().applyQuaternion(flip)
      const tilt = new THREE.Quaternion().setFromUnitVectors(flipped, front.normal)
      const q = tilt.multiply(flip)
      const k = Math.max(1, (front.size * 1.08) / rear.size) // cover the chrome disc fully
      const holder = new THREE.Group()
      holder.position.copy(front.centre).addScaledVector(front.normal, 0.006)
      holder.quaternion.copy(q)
      holder.scale.setScalar(k)
      const inner = new THREE.Group()
      inner.position.copy(rear.centre).negate()
      holder.add(inner)
      const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
      for (const part of badgeParts) {
        const c = part.clone()
        c.matrixAutoUpdate = false
        c.matrix.multiplyMatrices(inv, part.matrixWorld)
        inner.add(c)
      }
      root.add(holder)
      // lift the rear badge a hair off the bootlid as well
      for (const part of badgeParts) part.position.addScaledVector(rear.normal, 0.004)
    }
    // The model merges all glass into one mesh. Split off the low triangles (head/tail-light lenses)
    // so they get a clear lens instead of the dark window tint.
    const lensMeshes = []
    root.traverse((o) => {
      if (!o.isMesh || (o.material?.name || '').toLowerCase() !== 'glass') return
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry
      const pos = g.attributes.position, nor = g.attributes.normal
      const keep = [[], []] // [window, lens]
      const v = new THREE.Vector3()
      const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(o.matrixWorld)
      for (let i = 0; i < pos.count; i += 3) {
        let y = 0
        for (let k = 0; k < 3; k++) y += v.fromBufferAttribute(pos, i + k).applyMatrix4(toRoot).y
        keep[y / 3 < 0.78 ? 1 : 0].push(i)
      }
      const build = (list) => {
        const ng = new THREE.BufferGeometry()
        for (const [name, attr] of Object.entries(g.attributes)) {
          const a = new Float32Array(list.length * 3 * attr.itemSize)
          list.forEach((i, j) => { for (let k = 0; k < 3; k++) for (let c = 0; c < attr.itemSize; c++) a[(j * 3 + k) * attr.itemSize + c] = attr.getComponent(i + k, c) })
          ng.setAttribute(name, new THREE.BufferAttribute(a, attr.itemSize))
        }
        return ng
      }
      if (!keep[1].length) return
      o.geometry = build(keep[0])
      const lens = new THREE.Mesh(build(keep[1]), m.lens)
      lens.matrixAutoUpdate = false
      lens.matrix.copy(o.matrix)
      lens.renderOrder = 3
      o.parent.add(lens)
      lensMeshes.push(lens)
      void nor
    })
    root.traverse((o) => {
      if (!o.isMesh) return
      if (lensMeshes.includes(o)) return
      const matName = (o.material?.name || '').toLowerCase()
      o.material = materialFor(matName, m)
      // only big opaque parts cast shadows — skipping interior, glass, badges and fine details halves the shadow pass
      o.castShadow = o.material === m.paint || matName === 'black_mat' || matName === 'solid_black'
      o.receiveShadow = o.material === m.paint
      // glass is drawn after opaque parts
      if (o.material === m.glass) o.renderOrder = 2
    })
    return root
  }, [scene, m])
  // The exported model faces +Z; rotate to the game's forward (-Z)
  return <primitive object={body} rotation={[0, Math.PI, 0]} scale={scale} />
}

/** One road wheel from the model, centred on its hub, outer face toward +X. */
export function useWheelModel(url) {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const tyre = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.82 })
    const rim = new THREE.MeshStandardMaterial({ color: '#80868e', metalness: 0.92, roughness: 0.2, envMapIntensity: 1.4 })
    const chrome = new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 1, roughness: 0.15 })
    const cap = new THREE.MeshStandardMaterial({ color: '#1c69d4', roughness: 0.3 })
    scene.traverse((o) => {
      if (!o.isMesh) return
      const n = (o.material?.name || '').toLowerCase()
      o.material = n.startsWith('tire') ? tyre : n.startsWith('rim_screw') ? chrome : n === 'rim.001' ? cap : rim
      o.castShadow = true
    })
    return scene
  }, [scene])
}

export function GLBWheelVisual({ wheelScene, side, scale }) {
  const obj = useMemo(() => wheelScene.clone(true), [wheelScene])
  useEffect(() => () => obj.clear(), [obj])
  // left-side wheels are mirrored so the rim face points outward
  return <primitive object={obj} scale={[scale * (side > 0 ? 1 : -1), scale, scale]} />
}

export const preloadModel = (spec) => {
  if (spec.model) { useGLTF.preload(spec.model.body); useGLTF.preload(spec.model.wheel) }
}
