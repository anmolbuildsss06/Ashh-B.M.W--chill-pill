// Tyre smoke (drift/handbrake/burnout) and skid marks, pooled instanced meshes.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { carState } from './carState.js'

const SMOKE = 90
const MARKS = 600

function smokeTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31)
  grd.addColorStop(0, 'rgba(255,255,255,0.9)')
  grd.addColorStop(0.5, 'rgba(235,235,235,0.35)')
  grd.addColorStop(1, 'rgba(230,230,230,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export default function TireEffects() {
  const smokeRef = useRef()
  const marksRef = useRef()
  const st = useMemo(() => ({
    p: Array.from({ length: SMOKE }, () => ({ life: 1, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 1, color: 1 })),
    next: 0, markNext: 0, acc: 0,
    last: [null, null],
    m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), v: new THREE.Vector3(), cq: new THREE.Quaternion(),
    white: new THREE.Color(), dust: new THREE.Color(0.55, 0.45, 0.32), up: new THREE.Vector3(0, 1, 0), tmp: new THREE.Vector3(), dir: new THREE.Vector3(),
  }), [])
  const smokeMat = useMemo(() => new THREE.MeshBasicMaterial({ map: smokeTexture(), transparent: true, depthWrite: false, opacity: 0.55, color: '#e8e8e8' }), [])
  const markMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#0a0a0a', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), [])

  useFrame(({ camera }, dt) => {
    const sim = carState.sim
    const smoke = smokeRef.current
    const marks = marksRef.current
    if (!sim || !smoke || !marks) return
    dt = Math.min(dt, 0.05)
    const body = sim.body
    const vis = carState.visual
    const bp = vis ? vis.getWorldPosition(st.tmpBP || (st.tmpBP = new THREE.Vector3())) : body.translation()
    if (vis) vis.getWorldQuaternion(st.q)
    else { const bq = body.rotation(); st.q.set(bq.x, bq.y, bq.z, bq.w) }
    const speed = sim.telemetry.speed
    const burnout = (carState.input?.throttle ?? 0) > 0.5 && (carState.input?.brake ?? 0) > 0.5 && speed < 3 && sim.gear > 0

    st.acc += dt
    const emitStep = 1 / 40
    while (st.acc > emitStep) {
      st.acc -= emitStep
      for (let k = 0; k < 2; k++) {
        const i = 2 + k
        const wh = sim.wheels[i]
        const sliding = wh.contact && (wh.slip > 0 || burnout)
        const wp = sim.wheelPositions[i]
        st.tmp.set(wp.x, wp.y - wh.suspension - 0.3, wp.z).applyQuaternion(st.q).add(st.v.set(bp.x, bp.y, bp.z))
        const onAsphalt = wh.surface.id === 'asphalt' || wh.surface.id === 'kerb'
        if (sliding) {
          const p = st.p[st.next]
          st.next = (st.next + 1) % SMOKE
          p.life = 0
          p.max = 1.3 + Math.random() * 0.9
          p.pos.copy(st.tmp)
          p.pos.y = Math.max(p.pos.y, 0.15)
          p.vel.set((Math.random() - 0.5) * 1.5, 0.8 + Math.random() * 0.6, (Math.random() - 0.5) * 1.5)
          p.size = 0.7 + Math.random() * 0.5
          p.color = onAsphalt ? 1 : 0 // dirt/grass dust is brownish
        }
        // skid marks: quad segments between successive contact points
        if (sliding && onAsphalt) {
          const last = st.last[k]
          if (last && last.distanceTo(st.tmp) > 0.25 && last.distanceTo(st.tmp) < 3) {
            st.dir.subVectors(st.tmp, last)
            const len = st.dir.length()
            const yaw = Math.atan2(st.dir.x, st.dir.z)
            st.m.compose(
              st.v.copy(last).add(st.tmp).multiplyScalar(0.5).setY(0.025),
              st.cq.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw, 'YXZ')),
              st.s.set(0.26, len, 1),
            )
            marks.setMatrixAt(st.markNext, st.m)
            st.markNext = (st.markNext + 1) % MARKS
            marks.instanceMatrix.needsUpdate = true
            st.last[k] = st.tmp.clone()
          } else if (!last || last.distanceTo(st.tmp) >= 3) st.last[k] = st.tmp.clone()
        } else st.last[k] = null
      }
    }

    // Update smoke
    st.cq.copy(camera.quaternion)
    for (let i = 0; i < SMOKE; i++) {
      const p = st.p[i]
      if (p.life >= p.max) { st.m.makeScale(0, 0, 0); smoke.setMatrixAt(i, st.m); continue }
      p.life += dt
      p.pos.addScaledVector(p.vel, dt)
      p.vel.multiplyScalar(1 - dt * 1.2)
      const t = p.life / p.max
      const sz = p.size * (1 + t * 3.5) * (t < 0.1 ? t / 0.1 : 1) * (1 - t * 0.6)
      st.m.compose(p.pos, st.cq, st.s.set(sz, sz, sz))
      smoke.setMatrixAt(i, st.m)
      smoke.setColorAt(i, p.color ? st.white.setScalar(1 - t * 0.3) : st.dust)
    }
    smoke.instanceMatrix.needsUpdate = true
    if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={smokeRef} args={[null, smokeMat, SMOKE]} frustumCulled={false} renderOrder={2}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
      <instancedMesh
        ref={(m) => {
          marksRef.current = m
          if (m && !m.userData.init) {
            const z = new THREE.Matrix4().makeScale(0, 0, 0)
            for (let i = 0; i < MARKS; i++) m.setMatrixAt(i, z)
            m.userData.init = true
          }
        }}
        args={[null, markMat, MARKS]}
        frustumCulled={false}
        renderOrder={1}
      >
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
    </>
  )
}
