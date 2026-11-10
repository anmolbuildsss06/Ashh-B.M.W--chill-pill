// On-screen controls for phones/tablets. Multi-touch via Pointer Events (each control tracks its
// own pointerId, so gas + steer + handbrake can be held at once). Writes into input/controls.js `touch`.
import { useEffect, useRef, useState } from 'react'
import { touch, touchAction } from '../input/controls.js'
import { useGame } from '../store/useGame.js'

const buzz = (ms = 8) => { try { navigator.vibrate?.(ms) } catch { /* unsupported */ } }

/** A press-and-hold button that sets touch[key] while held */
function HoldButton({ field, value = 1, className = '', children, testId, label }) {
  const [active, setActive] = useState(false)
  const pid = useRef(null)
  const press = (e) => {
    e.preventDefault()
    pid.current = e.pointerId
    e.currentTarget.setPointerCapture?.(e.pointerId)
    touch[field] = value
    setActive(true)
    buzz()
  }
  const release = (e) => {
    if (pid.current !== null && e.pointerId !== pid.current) return
    pid.current = null
    touch[field] = typeof value === 'boolean' ? false : 0
    setActive(false)
  }
  return (
    <button
      data-testid={testId}
      aria-label={label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      className={`pointer-events-auto select-none touch-none flex flex-col items-center justify-center font-display italic font-extrabold tracking-wider
        border-2 transition-[transform,background-color] duration-75 ${active ? 'scale-95 brightness-125' : ''} ${className}`}
      style={{ WebkitUserSelect: 'none' }}
    >
      {children}
    </button>
  )
}

/** One-shot button (camera, reset, pause, gear shifts) */
function TapButton({ action, children, testId, label, onTap }) {
  return (
    <button
      data-testid={testId}
      aria-label={label}
      onPointerDown={(e) => { e.preventDefault(); buzz(6); onTap ? onTap() : touchAction(action) }}
      className="pointer-events-auto touch-none w-11 h-11 rounded-full bg-black/45 backdrop-blur border border-white/25 flex items-center justify-center text-white/90 active:bg-white active:text-hz-ink"
    >
      {children}
    </button>
  )
}

/** Left-thumb analog steering: touch anywhere in the zone, slide left/right from where you landed */
function DragSteer() {
  const zone = useRef(null)
  const [st, setSt] = useState(null) // { ox, oy, dx }
  const pid = useRef(null)
  const RANGE = 72 // px of travel for full lock

  const update = (dx) => {
    const n = Math.max(-1, Math.min(1, dx / RANGE))
    touch.steer = Math.sign(n) * Math.pow(Math.abs(n), 1.25)
  }
  const down = (e) => {
    if (pid.current !== null) return
    e.preventDefault()
    pid.current = e.pointerId
    zone.current.setPointerCapture?.(e.pointerId)
    const r = zone.current.getBoundingClientRect()
    setSt({ ox: e.clientX - r.left, oy: e.clientY - r.top, dx: 0 })
    update(0)
  }
  const move = (e) => {
    if (e.pointerId !== pid.current || !st) return
    const r = zone.current.getBoundingClientRect()
    const dx = Math.max(-RANGE, Math.min(RANGE, e.clientX - r.left - st.ox))
    setSt((s) => s && { ...s, dx })
    update(dx)
  }
  const up = (e) => {
    if (e.pointerId !== pid.current) return
    pid.current = null
    setSt(null)
    touch.steer = 0
  }
  return (
    <div
      ref={zone}
      data-testid="steer-zone"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      className="pointer-events-auto touch-none absolute left-0 bottom-0 w-[44vw] h-[62vh]"
    >
      {!st && (
        <div className="absolute left-[calc(env(safe-area-inset-left)+28px)] bottom-[calc(env(safe-area-inset-bottom)+28px)] w-[176px] h-16 rounded-full border-2 border-white/25 bg-black/25 backdrop-blur-sm flex items-center justify-between px-4 text-white/60 font-display italic font-bold text-sm tracking-widest">
          <span>◂</span><span>SLIDE TO STEER</span><span>▸</span>
        </div>
      )}
      {st && (
        <div className="absolute pointer-events-none" style={{ left: st.ox - RANGE - 26, top: st.oy - 26 }}>
          <div className="h-[52px] rounded-full border-2 border-white/30 bg-black/30" style={{ width: RANGE * 2 + 52 }} />
          <div className="absolute top-0 w-[52px] h-[52px] rounded-full bg-hz-pink shadow-[0_0_20px_rgba(255,46,136,.6)] border-2 border-white/80"
            style={{ left: RANGE + st.dx }} />
        </div>
      )}
    </div>
  )
}

function ButtonSteer() {
  const cls = 'w-[84px] h-[84px] rounded-full bg-black/35 backdrop-blur border-white/40 text-4xl'
  return (
    <div className="absolute left-[calc(env(safe-area-inset-left)+18px)] bottom-[calc(env(safe-area-inset-bottom)+22px)] flex gap-4">
      <HoldButton field="steer" value={-1} className={cls} testId="steer-left" label="Steer left">◂</HoldButton>
      <HoldButton field="steer" value={1} className={cls} testId="steer-right" label="Steer right">▸</HoldButton>
    </div>
  )
}

/** Hold the phone like a steering wheel (landscape). Calibrates to how you hold it when enabled. */
function TiltSteer() {
  const [status, setStatus] = useState('idle') // idle | on | denied | unsupported
  const center = useRef(null)
  const latest = useRef(0)
  const [steerVis, setSteerVis] = useState(0)

  useEffect(() => {
    if (status !== 'on') return
    const angle = () => (screen.orientation?.angle ?? window.orientation ?? 0)
    const onOrient = (e) => {
      const a = angle()
      // landscape: rolling the phone changes beta; portrait: gamma
      let raw = a === 90 ? e.beta : a === 270 || a === -90 ? -e.beta : e.gamma
      if (raw == null) return
      latest.current = raw
      if (center.current === null) center.current = raw
      const deg = raw - center.current
      const dz = 2.5, full = 28
      const n = Math.abs(deg) < dz ? 0 : Math.sign(deg) * Math.min(1, (Math.abs(deg) - dz) / (full - dz))
      touch.steer = n
    }
    window.addEventListener('deviceorientation', onOrient)
    const vis = setInterval(() => setSteerVis(touch.steer), 60)
    return () => { window.removeEventListener('deviceorientation', onOrient); clearInterval(vis); touch.steer = 0 }
  }, [status])

  const enable = async () => {
    if (typeof DeviceOrientationEvent === 'undefined') return setStatus('unsupported')
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission() // iOS needs a user gesture
        if (r !== 'granted') return setStatus('denied')
      }
      center.current = null
      setStatus('on')
    } catch { setStatus('denied') }
  }

  return (
    <div className="pointer-events-auto absolute left-[calc(env(safe-area-inset-left)+18px)] bottom-[calc(env(safe-area-inset-bottom)+24px)] font-display italic font-bold tracking-widest">
      {status === 'on' ? (
        <div className="flex flex-col gap-2">
          <div className="relative w-48 h-3 rounded-full bg-black/40 border border-white/25">
            <div className="absolute top-[-4px] w-5 h-5 rounded-full bg-hz-pink border-2 border-white" style={{ left: `calc(${(steerVis + 1) * 50}% - 10px)` }} />
          </div>
          <button onPointerDown={() => { center.current = latest.current; buzz() }} className="touch-none self-start px-3 py-1.5 bg-black/45 border border-white/30 text-xs">RE-CENTRE TILT</button>
        </div>
      ) : (
        <button onClick={enable} data-testid="tilt-enable" className="touch-none px-4 py-3 bg-hz-pink text-sm shadow-[0_6px_24px_rgba(255,46,136,.4)]">
          {status === 'denied' ? 'MOTION BLOCKED — TAP TO RETRY' : status === 'unsupported' ? 'TILT NOT SUPPORTED' : 'TAP TO ENABLE TILT STEERING'}
        </button>
      )}
    </div>
  )
}

function toggleFullscreen() {
  const d = document
  const el = d.documentElement
  if (!d.fullscreenElement && !d.webkitFullscreenElement) {
    const req = el.requestFullscreen || el.webkitRequestFullscreen
    Promise.resolve(req?.call(el, { navigationUI: 'hide' }))
      .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
      .catch(() => {})
  } else (d.exitFullscreen || d.webkitExitFullscreen)?.call(d)
}

export default function TouchControls() {
  const touchSteer = useGame((s) => s.touchSteer)
  const manual = useGame((s) => s.assists.manual)
  const [portrait, setPortrait] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth)
    check()
    window.addEventListener('resize', check)
    return () => {
      window.removeEventListener('resize', check)
      Object.assign(touch, { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false })
    }
  }, [])

  const pedal = 'rounded-2xl backdrop-blur'
  return (
    <div className="absolute inset-0 pointer-events-none select-none" data-testid="touch-controls">
      {/* top-left system buttons */}
      <div className="absolute left-[calc(env(safe-area-inset-left)+12px)] top-[calc(env(safe-area-inset-top)+10px)] flex gap-2">
        <TapButton action="pause" testId="touch-pause" label="Pause">
          <svg width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" fill="currentColor" /><rect x="9.5" y="2" width="3.5" height="12" fill="currentColor" /></svg>
        </TapButton>
        <TapButton action="camera" testId="touch-camera" label="Change camera">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.5" /></svg>
        </TapButton>
        <TapButton action="reset" testId="touch-reset" label="Reset car">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 3v5h5" /></svg>
        </TapButton>
        <TapButton testId="touch-fullscreen" label="Fullscreen" onTap={toggleFullscreen}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </TapButton>
      </div>

      {/* steering */}
      {touchSteer === 'drag' && <DragSteer />}
      {touchSteer === 'buttons' && <ButtonSteer />}
      {touchSteer === 'tilt' && <TiltSteer />}

      {/* pedals cluster, right thumb */}
      <div className="absolute right-[calc(env(safe-area-inset-right)+14px)] bottom-[calc(env(safe-area-inset-bottom)+14px)] flex items-end gap-3">
        <div className="flex flex-col gap-3 items-end">
          {manual && (
            <div className="flex gap-2">
              <TapButton action="shiftDown" testId="touch-shift-down" label="Shift down"><span className="font-display font-extrabold">−</span></TapButton>
              <TapButton action="shiftUp" testId="touch-shift-up" label="Shift up"><span className="font-display font-extrabold">+</span></TapButton>
            </div>
          )}
          <HoldButton field="handbrake" value={true} testId="touch-handbrake" label="Handbrake"
            className={`${pedal} w-[84px] h-[62px] bg-amber-500/25 border-amber-300/70 text-amber-100 text-base`}>
            <span className="text-[11px] not-italic tracking-[0.2em] opacity-80">E-BRAKE</span>
            <span className="text-xl leading-none">(P)</span>
          </HoldButton>
          <HoldButton field="brake" testId="touch-brake" label="Brake / reverse"
            className={`${pedal} w-[84px] h-[100px] bg-rose-500/25 border-rose-300/70 text-rose-100 text-lg`}>
            BRAKE
            <span className="text-[9px] not-italic font-body tracking-widest opacity-70">HOLD = REV</span>
          </HoldButton>
        </div>
        <div className="flex flex-col gap-3 items-end">
          <HoldButton field="nitro" value={true} testId="touch-nitro" label="Nitro"
            className={`${pedal} w-[96px] h-[62px] bg-hz-cyan/25 border-hz-cyan text-cyan-50 text-lg`}>
            NITRO
          </HoldButton>
          <HoldButton field="throttle" testId="touch-gas" label="Accelerate"
            className={`${pedal} w-[96px] h-[150px] bg-emerald-500/30 border-emerald-300/80 text-emerald-50 text-2xl`}>
            GAS
            <span className="text-3xl leading-none mt-1">▲</span>
          </HoldButton>
        </div>
      </div>

      {portrait && !dismissed && (
        <div className="pointer-events-auto absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center px-8 gap-4">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="animate-pulse"><rect x="7" y="2" width="10" height="20" rx="2" transform="rotate(90 12 12)" /><path d="M4 4l3 3M4 4v3M4 4h3" /></svg>
          <div className="font-display italic font-extrabold text-3xl">ROTATE YOUR PHONE</div>
          <div className="font-body text-sm text-white/70">M4 Horizon plays best in landscape. Tap fullscreen for the most room.</div>
          <div className="flex gap-3">
            <button onClick={toggleFullscreen} className="px-4 py-2 bg-hz-pink font-display italic font-bold tracking-wider">FULLSCREEN</button>
            <button onClick={() => setDismissed(true)} className="px-4 py-2 bg-white/15 font-display italic font-bold tracking-wider">PLAY ANYWAY</button>
          </div>
        </div>
      )}
    </div>
  )
}
