import { Suspense, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Stats } from '@react-three/drei'
import * as THREE from 'three'
import Car from './vehicle/Car.jsx'
import CameraRig from './camera/CameraRig.jsx'
import Atmosphere from './world/Atmosphere.jsx'
import ProvingGround from './world/ProvingGround.jsx'
import AudioDirector from './audio/AudioDirector.jsx'
import { useGame, QUALITY, CAMERA_MODES } from './store/useGame.js'
import { consumeActions } from './input/controls.js'

function ActionHandler() {
  useFrame(() => {
    const actions = consumeActions()
    if (!actions.length) return
    const g = useGame.getState()
    for (const a of actions) {
      if (a === 'pause') {
        if (g.phase === 'playing') g.setPhase('paused')
        else if (g.phase === 'paused') g.setPhase('playing')
        continue
      }
      if (g.phase !== 'playing') continue
      if (a === 'camera') g.cycleCamera()
      else if (a.startsWith('cam')) { const n = Number(a.slice(3)); g.setCameraMode(n); g.showToast(CAMERA_MODES[n].label) }
      else if (a === 'reset') { g.requestReset(); g.showToast('CAR RESET') }
      else if (a === 'tcs') g.toggleAssist('tcs')
      else if (a === 'manual') g.toggleAssist('manual')
      else if (a === 'fps') g.setShowFps(!g.showFps)
      else if (a === 'music') { g.setAudio({ musicOn: !g.audio.musicOn }); g.showToast(`MUSIC: ${g.audio.musicOn ? 'OFF' : 'ON'}`) }
    }
  })
  return null
}

export default function Game() {
  const quality = useGame((s) => s.quality)
  const renderScale = useGame((s) => s.renderScale)
  const phase = useGame((s) => s.phase)
  const showFps = useGame((s) => s.showFps)
  const q = QUALITY[quality]
  const maxDpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1
  const dpr = Math.max(0.5, Math.min(q.dpr, maxDpr) * renderScale) // fixed: no automatic downscaling
  const showcase = phase === 'intro' || phase === 'menu'

  return (
    <Canvas
      key={quality /* antialias can only change on context creation */}
      dpr={dpr}
      shadows={q.shadows ? 'soft' : false}
      gl={{ antialias: q.antialias, reversedDepthBuffer: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      camera={{ fov: 60, near: 0.1, far: 5000, position: [8, 3, 20] }}
      onCreated={({ gl, scene, camera }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
        window.__m4 = Object.assign(window.__m4 || {}, { scene, camera, gl })
      }}
    >
      <Suspense fallback={null}>
        <Atmosphere />
        <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} paused={phase === 'paused'} interpolate>
          <ProvingGround />
          <Car driveEnabled={phase === 'playing'} />
        </Physics>
        <CameraRig showcase={showcase} showroom={phase === 'showroom'} />
        <ActionHandler />
        <AudioDirector />
      </Suspense>
      {showFps && <Stats className="!left-auto !right-0 !top-auto !bottom-0" />}
    </Canvas>
  )
}
