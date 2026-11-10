r// Big roadside banner: "Ashh loves / B Means B.M.W!" with an original racing-heart emblem.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RigidBody, CylinderCollider, CuboidCollider } from '@react-three/rapier'

function drawEmblem(g, cx, cy, r) {
  // outer ring
  const ring = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r)
  ring.addColorStop(0, '#ffd36b'); ring.addColorStop(0.5, '#fff1c4'); ring.addColorStop(1, '#c98a1c')
  g.fillStyle = ring
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#0b1230'
  g.beginPath(); g.arc(cx, cy, r * 0.86, 0, Math.PI * 2); g.fill()
  // heart
  const s = r * 0.62
  g.save()
  g.translate(cx, cy + s * 0.12)
  const hg = g.createLinearGradient(0, -s, 0, s)
  hg.addColorStop(0, '#ff5aa5'); hg.addColorStop(1, '#e4002b')
  g.fillStyle = hg
  g.beginPath()
  g.moveTo(0, s * 0.75)
  g.bezierCurveTo(-s * 1.25, -s * 0.05, -s * 0.6, -s * 0.95, 0, -s * 0.4)
  g.bezierCurveTo(s * 0.6, -s * 0.95, s * 1.25, -s * 0.05, 0, s * 0.75)
  g.fill()
  // racing stripes through the heart
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = 'rgba(255,255,255,0.9)'
  g.fillRect(-s * 0.16, -s, s * 0.1, s * 2)
  g.fillRect(s * 0.04, -s, s * 0.1, s * 2)
  g.restore()
  // speed lines
  g.strokeStyle = '#ffd36b'
  g.lineWidth = r * 0.05
  g.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    const y = cy - r * 0.2 + i * r * 0.2
    g.beginPath(); g.moveTo(cx - r * 1.55, y); g.lineTo(cx - r * (1.15 + i * 0.05), y); g.stroke()
  }
}

function bannerTexture() {
  const W = 2048, H = 512
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0b1230'); bg.addColorStop(0.55, '#14205a'); bg.addColorStop(1, '#2a0b3d')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  // diagonal light streaks
  g.globalAlpha = 0.12
  g.fillStyle = '#2de2ff'
  for (let i = 0; i < 9; i++) {
    g.beginPath(); g.moveTo(600 + i * 170, 0); g.lineTo(700 + i * 170, 0); g.lineTo(560 + i * 170, H); g.lineTo(460 + i * 170, H); g.fill()
  }
  g.globalAlpha = 1
  // top & bottom accent bars
  const bar = g.createLinearGradient(0, 0, W, 0)
  bar.addColorStop(0, '#2de2ff'); bar.addColorStop(1, '#ff2e88')
  g.fillStyle = bar
  g.fillRect(0, 0, W, 18); g.fillRect(0, H - 18, W, 18)

  drawEmblem(g, 300, H / 2, 175)

  g.textBaseline = 'alphabetic'
  g.fillStyle = '#ffffff'
  g.font = 'italic 700 120px "Barlow Condensed", "Arial Narrow", Arial, sans-serif'
  g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 18; g.shadowOffsetY = 6
  g.fillText('Ashh loves', 560, 205)
  const tg = g.createLinearGradient(560, 0, 1990, 0)
  tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.55, '#bfefff'); tg.addColorStop(1, '#ff9ccd')
  g.fillStyle = tg
  g.font = 'italic 800 190px "Barlow Condensed", "Arial Narrow", Arial Black, sans-serif'
  // fit to width
  let size = 190
  while (size > 90) {
    g.font = `italic 800 ${size}px "Barlow Condensed", "Arial Narrow", Arial Black, sans-serif`
    if (g.measureText('B Means B.M.W!').width < 1440) break
    size -= 6
  }
  g.fillText('B Means B.M.W!', 552, 410)
  g.shadowColor = 'transparent'

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** width × height in metres; board bottom sits at `lift` metres above the ground */
export default function Billboard({ position, rotationY = 0, width = 16, height = 4, lift = 2.6 }) {
  const tex = useMemo(() => bannerTexture(), [])
  useEffect(() => {
    // redraw once the web font is ready so the lettering uses it
    document.fonts?.ready.then(() => {
      const fresh = bannerTexture()
      tex.image = fresh.image
      tex.needsUpdate = true
    })
    return () => tex.dispose()
  }, [tex])
  const cy = lift + height / 2
  const postX = width / 2 - 1.2
  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={[0, rotationY, 0]} name="banner">
      {[-postX, postX].map((x) => (
        <group key={x}>
          <CylinderCollider args={[cy / 2, 0.22]} position={[x, cy / 2, -0.25]} />
          <mesh position={[x, cy / 2, -0.25]} castShadow>
            <cylinderGeometry args={[0.18, 0.22, cy, 12]} />
            <meshStandardMaterial color="#3b3f46" metalness={0.7} roughness={0.35} />
          </mesh>
        </group>
      ))}
      <CuboidCollider args={[width / 2, height / 2, 0.1]} position={[0, cy, -0.1]} />
      {/* frame + back */}
      <mesh position={[0, cy, -0.12]} castShadow>
        <boxGeometry args={[width + 0.3, height + 0.3, 0.2]} />
        <meshStandardMaterial color="#1b1e24" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* printed face */}
      <mesh position={[0, cy, 0.0]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={tex} roughness={0.55} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.18} />
      </mesh>
      {/* lamps over the board */}
      {[-width / 3, 0, width / 3].map((x) => (
        <mesh key={x} position={[x, lift + height + 0.35, 0.45]} rotation={[0.6, 0, 0]}>
          <boxGeometry args={[0.9, 0.12, 0.3]} />
          <meshStandardMaterial color="#2a2d33" emissive="#fff6d8" emissiveIntensity={0.5} />
        </mesh>
      ))}
    </RigidBody>
  )
}
