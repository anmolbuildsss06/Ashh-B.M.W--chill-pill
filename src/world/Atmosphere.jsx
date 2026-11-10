// Sky, sun, ambient light, reflections and fog. The sun's shadow camera follows the car so
// shadows stay crisp in a tight frustum (cheap on low-end GPUs).
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sky, Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { carState } from '../vehicle/carState.js'
import { useGame, QUALITY } from '../store/useGame.js'

// Late-afternoon "golden hour" sun
const SUN_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize()
const tmpV = new THREE.Vector3()

export default function Atmosphere() {
  const quality = QUALITY[useGame((s) => s.quality)]
  const light = useRef()
  const target = useMemo(() => new THREE.Object3D(), [])
  const sunPos = useMemo(() => SUN_DIR.clone().multiplyScalar(1000).toArray(), [])

  useFrame(() => {
    const l = light.current
    if (!l) return
    const p = carState.visual ? carState.visual.getWorldPosition(tmpV) : { x: 0, y: 0, z: 0 }
    // snap to the shadow map's texel grid so shadow edges don't crawl/flicker as the car moves
    const snap = (76 / (quality.shadowMap || 512)) * 2
    const x = Math.round(p.x / snap) * snap, z = Math.round(p.z / snap) * snap
    target.position.set(x, 0, z)
    l.position.set(x + SUN_DIR.x * 80, SUN_DIR.y * 80, z + SUN_DIR.z * 80)
    l.target = target
    target.updateMatrixWorld()
  })

  return (
    <>
      <Sky distance={4500} sunPosition={sunPos} turbidity={6} rayleigh={1.6} mieCoefficient={0.006} mieDirectionalG={0.86} />
      <fog attach="fog" args={['#c9d6e2', 180, 1900]} />
      <hemisphereLight args={['#cfe3ff', '#4c5a3a', 0.85]} />
      <directionalLight
        ref={light}
        color="#fff1dc"
        intensity={2.6}
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMap || 512, quality.shadowMap || 512]}
        shadow-camera-left={-38}
        shadow-camera-right={38}
        shadow-camera-top={38}
        shadow-camera-bottom={-38}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <primitive object={target} />
      {/* Procedural studio-style reflections (no network HDRI needed) */}
      <Environment resolution={quality.envRes} frames={1}>
        <color attach="background" args={['#9fb4c8']} />
        <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[0, 6, -2]} scale={[12, 2, 1]} rotation-x={Math.PI / 2} />
        <Lightformer form="rect" intensity={1.6} color="#dbe9ff" position={[-8, 2, 0]} scale={[10, 3, 1]} rotation-y={Math.PI / 2} />
        <Lightformer form="rect" intensity={1.6} color="#ffe6c8" position={[8, 2, 0]} scale={[10, 3, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="ring" intensity={3} color="#ffd9a8" position={[-6, 4, -8]} scale={3} />
        <mesh position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={40}>
          <planeGeometry />
          <meshBasicMaterial color="#3e4a34" />
        </mesh>
      </Environment>
    </>
  )
}
