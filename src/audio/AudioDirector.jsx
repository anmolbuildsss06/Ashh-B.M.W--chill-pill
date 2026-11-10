// Bridges game state → audio engine. Lives inside the Canvas so it ticks with the render loop.
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { audio } from './audio.js'
import { carState } from '../vehicle/carState.js'
import { useGame } from '../store/useGame.js'

export default function AudioDirector() {
  const started = useRef(false)
  const phase = useGame((s) => s.phase)
  const settings = useGame((s) => s.audio)

  // browsers only allow sound after a user gesture
  useEffect(() => {
    const unlock = () => {
      audio.unlock()
      audio.set(useGame.getState().audio)
    }
    const evs = ['pointerdown', 'keydown', 'touchend']
    evs.forEach((e) => window.addEventListener(e, unlock, { passive: true }))
    return () => evs.forEach((e) => window.removeEventListener(e, unlock))
  }, [])

  useEffect(() => { if (audio.ready) audio.set(settings) }, [settings])

  useEffect(() => {
    if (!audio.ready) return
    if (phase === 'playing') {
      audio.duck(1)
      if (!started.current) { started.current = true; audio.starter() }
    } else if (phase === 'paused') audio.duck(0.45)
    else audio.duck(0.8)
  }, [phase])

  useFrame(() => {
    const sim = carState.sim
    if (!sim || !audio.ready) return
    const p = useGame.getState().phase
    // menus/showroom: the car idles quietly; pause: engine off
    const mode = p === 'playing' ? 'drive' : p === 'paused' ? 'off' : started.current ? 'idle' : 'off'
    audio.update(sim.telemetry, carState.input, mode)
  })
  return null
}
