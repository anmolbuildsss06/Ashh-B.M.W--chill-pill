import { useGame, CAMERA_MODES } from '../store/useGame.js'
import { CARS } from '../config/cars.js'

const R = 92
const ARC_START = 135 // degrees
const ARC_SWEEP = 270

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}
function arcPath(cx, cy, r, from, to) {
  const [x1, y1] = polar(cx, cy, r, from)
  const [x2, y2] = polar(cx, cy, r, to)
  const large = to - from > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

function Tachometer({ rpm, redline, max }) {
  const frac = Math.min(rpm / max, 1)
  const redFrac = redline / max
  const ticks = []
  for (let k = 0; k <= max / 1000; k++) {
    const deg = ARC_START + (k * 1000 / max) * ARC_SWEEP
    const [x1, y1] = polar(110, 110, R - 4, deg)
    const [x2, y2] = polar(110, 110, R - 14, deg)
    const [tx, ty] = polar(110, 110, R - 26, deg)
    ticks.push(
      <g key={k}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={k * 1000 >= redline ? '#ff2e4d' : 'rgba(255,255,255,.75)'} strokeWidth="2.5" />
        <text x={tx} y={ty + 4} textAnchor="middle" fontSize="12" fill="rgba(255,255,255,.6)" fontFamily="Barlow Condensed" fontWeight="700">{k}</text>
      </g>,
    )
  }
  const hot = rpm > redline - 300
  return (
    <svg viewBox="0 0 220 220" className="w-full h-full drop-shadow-[0_4px_20px_rgba(0,0,0,.6)]">
      <circle cx="110" cy="110" r="104" fill="rgba(8,10,14,.62)" />
      <path d={arcPath(110, 110, R, ARC_START, ARC_START + ARC_SWEEP)} stroke="rgba(255,255,255,.12)" strokeWidth="8" fill="none" />
      <path d={arcPath(110, 110, R, ARC_START + redFrac * ARC_SWEEP, ARC_START + ARC_SWEEP)} stroke="rgba(255,46,77,.5)" strokeWidth="8" fill="none" />
      <path d={arcPath(110, 110, R, ARC_START, ARC_START + Math.max(frac, 0.002) * ARC_SWEEP)} stroke={hot ? '#ff2e4d' : 'url(#rpmGrad)'} strokeWidth="8" fill="none" strokeLinecap="round" />
      <defs>
        <linearGradient id="rpmGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#2de2ff" />
          <stop offset="1" stopColor="#ff2e88" />
        </linearGradient>
      </defs>
      {ticks}
      <text x="110" y="196" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.45)" fontFamily="Barlow" letterSpacing="2">RPM ×1000</text>
    </svg>
  )
}

export default function HUD() {
  const t = useGame((s) => s.telemetry)
  const cameraMode = useGame((s) => s.cameraMode)
  const assists = useGame((s) => s.assists)
  const toast = useGame((s) => s.toast)
  const spec = CARS[useGame((s) => s.carId)]
  const compact = useGame((s) => s.touchControls) // phone layout: cluster top-right, no keyboard hints
  const speed = Math.round(t.speedKmh)

  return (
    <div className="pointer-events-none absolute inset-0 font-display">
      {/* top-left: car + camera */}
      <div className={`absolute left-6 top-5 rise ${compact ? 'hidden' : ''}`}>
        <div className="m-stripe h-1 w-24 mb-2" />
        <div className="text-2xl font-extrabold italic tracking-wide leading-none">{spec.name.toUpperCase()}</div>
        <div className="text-xs font-body text-white/55 tracking-[0.25em] mt-1">M PROVING GROUND · {CAMERA_MODES[cameraMode].label} CAM</div>
      </div>

      {/* top-right: controls hint */}
      <div className={`absolute right-6 top-5 text-right font-body text-[11px] leading-5 text-white/55 tracking-wider ${compact ? 'hidden' : ''}`}>
        <div><b className="text-white/85">W/S</b> throttle · brake/reverse &nbsp; <b className="text-white/85">A/D</b> steer</div>
        <div><b className="text-white/85">SPACE</b> handbrake &nbsp; <b className="text-white/85">SHIFT</b> nitro &nbsp; <b className="text-white/85">C</b> camera</div>
        <div><b className="text-white/85">R</b> reset &nbsp; <b className="text-white/85">B</b> music &nbsp; <b className="text-white/85">T</b> TCS &nbsp; <b className="text-white/85">M</b> manual (Q/E) &nbsp; <b className="text-white/85">ESC</b> pause</div>
      </div>

      {CAMERA_MODES[cameraMode].id === 'orbit' && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+8px)] font-body text-[11px] tracking-[0.25em] text-white/60">
          FREE LOOK · DRAG TO ORBIT · {compact ? 'PINCH' : 'SCROLL'} TO ZOOM
        </div>
      )}
      {!compact && (
        <div className="absolute left-6 top-[88px] flex gap-1 pointer-events-auto">
          {CAMERA_MODES.map((c, i) => (
            <button key={c.id} data-testid={`hud-cam-${c.id}`} onClick={() => { useGame.getState().setCameraMode(i); useGame.getState().showToast(c.label) }}
              className={`px-2 py-1 text-[10px] font-body font-semibold tracking-wider cursor-pointer ${i === cameraMode ? 'bg-hz-pink text-white' : 'bg-black/40 text-white/60 hover:bg-white/20'}`}>
              {i + 1} {c.label.split(' ')[0]}
            </button>
          ))}
        </div>
      )}
      {/* toast */}
      {toast && (
        <div key={toast.id} className="toast-in absolute left-1/2 top-16 -translate-x-1/2 skew-panel bg-hz-pink/90 px-6 py-1.5 shadow-[0_6px_30px_rgba(255,46,136,.45)]">
          <div className="text-lg font-extrabold italic tracking-widest">{toast.text}</div>
        </div>
      )}

      {/* drift indicator */}
      {t.drifting && (
        <div className={`absolute left-1/2 -translate-x-1/2 text-center ${compact ? 'top-[14%]' : 'top-[26%]'}`}>
          <div className="text-4xl font-extrabold italic tracking-wider text-hz-cyan drop-shadow-[0_0_18px_rgba(45,226,255,.7)]">DRIFT</div>
          <div className="text-sm font-body text-white/70 tracking-[0.3em]">{Math.round(Math.abs(t.slipAngle) * 57.3)}°</div>
        </div>
      )}

      {/* bottom-right: speedometer cluster */}
      <div className={`absolute w-[250px] h-[250px] ${compact ? 'right-[calc(env(safe-area-inset-right)+6px)] top-[calc(env(safe-area-inset-top)+4px)] origin-top-right scale-[0.56]' : 'right-6 bottom-5'}`} data-testid="speedo">
        <Tachometer rpm={t.rpm} redline={spec.engine.redlineRpm} max={8000} />
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          <div className="text-[64px] font-extrabold italic leading-none tabular-nums" data-testid="speed">{speed}</div>
          <div className="text-xs font-body tracking-[0.35em] text-white/60 -mt-0.5">KM/H</div>
          <div className={`mt-2 w-11 h-11 rounded-full border-2 flex items-center justify-center text-2xl font-extrabold italic ${t.shifting ? 'border-hz-cyan text-hz-cyan' : 'border-white/70'}`} data-testid="gear">
            {t.gearLabel}
          </div>
          <div className="text-[9px] font-body tracking-[0.3em] text-white/45 mt-1">{assists.manual ? 'MANUAL' : 'AUTO'}</div>
        </div>
      </div>

      {/* bottom-right, left of speedo: nitro + assists + surface */}
      <div className={`absolute w-48 font-body ${compact ? 'right-[calc(env(safe-area-inset-right)+152px)] top-[calc(env(safe-area-inset-top)+16px)] scale-90 origin-top-right' : 'right-[290px] bottom-9'}`}>
        <div className="flex justify-between text-[10px] tracking-[0.3em] text-white/60 mb-1">
          <span>NITRO</span><span>{Math.round(t.nitro * 100)}%</span>
        </div>
        <div className="h-2.5 bg-white/10 skew-panel overflow-hidden">
          <div className={`h-full ${t.nitroActive ? 'bg-hz-cyan shadow-[0_0_14px_#2de2ff]' : 'bg-gradient-to-r from-hz-cyan to-hz-pink'}`} style={{ width: `${t.nitro * 100}%` }} />
        </div>
        <div className="flex gap-1.5 mt-3 text-[10px] font-semibold tracking-widest">
          <span className={`px-1.5 py-0.5 border ${assists.tcs ? (t.tcsActive && t.throttle > 0 ? 'border-amber-400 text-amber-300 bg-amber-400/15' : 'border-white/30 text-white/60') : 'border-white/10 text-white/25 line-through'}`}>TCS</span>
          <span className={`px-1.5 py-0.5 border ${assists.abs ? (t.absActive ? 'border-amber-400 text-amber-300 bg-amber-400/15' : 'border-white/30 text-white/60') : 'border-white/10 text-white/25 line-through'}`}>ABS</span>
          <span className={`px-1.5 py-0.5 border ${assists.stability ? 'border-white/30 text-white/60' : 'border-white/10 text-white/25 line-through'}`}>STM</span>
          <span className="ml-auto px-1.5 py-0.5 text-white/70" data-testid="surface">{t.surface}</span>
        </div>
        {/* pedals */}
        <div className="flex gap-1 mt-2.5 h-1">
          <div className="flex-1 bg-white/10"><div className="h-full bg-emerald-400" style={{ width: `${t.throttle * 100}%` }} /></div>
          <div className="flex-1 bg-white/10"><div className="h-full bg-rose-500" style={{ width: `${t.brake * 100}%` }} /></div>
        </div>
      </div>
    </div>
  )
}
