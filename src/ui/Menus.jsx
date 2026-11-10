import { useEffect, useState } from 'react'
import { useGame, QUALITY, CAMERA_MODES } from '../store/useGame.js'
import { CARS } from '../config/cars.js'
import { PRESETS, applyPreset } from '../camera/orbit.js'
import { audio } from '../audio/audio.js'

function MenuButton({ children, onClick, primary, sub, testId, delay = 0 }) {
  return (
    <button
      data-testid={testId}
      onClick={(e) => { audio.ui('click'); onClick?.(e) }}
      style={{ animationDelay: `${delay}ms` }}
      className={`rise group pointer-events-auto block w-full text-left skew-panel px-6 py-2 [@media(min-height:560px)]:py-3 transition-all duration-150 cursor-pointer
        ${primary ? 'bg-hz-pink hover:bg-white hover:text-hz-ink shadow-[0_8px_30px_rgba(255,46,136,.35)]' : 'bg-black/45 backdrop-blur hover:bg-white hover:text-hz-ink border-l-4 border-white/20 hover:border-hz-pink'}`}
    >
      <div>
        <div className={`font-display italic font-extrabold tracking-wider ${primary ? 'text-2xl [@media(min-height:560px)]:text-3xl' : 'text-xl [@media(min-height:560px)]:text-2xl'}`}>{children}</div>
        {sub && <div className="font-body text-[11px] tracking-[0.25em] opacity-60 -mt-0.5 hidden [@media(min-height:560px)]:block">{sub}</div>}
      </div>
    </button>
  )
}

function Panel({ title, children, onBack }) {
  return (
    <div className="pointer-events-auto rise scroll-y w-[440px] max-w-[92vw] max-h-[86vh] bg-black/55 backdrop-blur-md border-l-4 border-hz-pink p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="font-display italic font-extrabold text-3xl tracking-wider">{title}</div>
        <button data-testid="back" onClick={onBack} className="font-display italic font-bold tracking-widest text-white/70 hover:text-hz-pink cursor-pointer">◂ BACK</button>
      </div>
      {children}
    </div>
  )
}

function Toggle({ label, on, onClick, testId }) {
  return (
    <button data-testid={testId} onClick={onClick} className="flex w-full items-center justify-between py-2 border-b border-white/10 cursor-pointer group">
      <span className="font-body text-sm tracking-wider text-white/85 group-hover:text-white">{label}</span>
      <span className={`w-11 h-6 rounded-full relative transition-colors ${on ? 'bg-hz-pink' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-5.5' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

export function SettingsPanel({ onBack }) {
  const s = useGame()
  return (
    <Panel title="SETTINGS" onBack={onBack}>
      <div className="font-body text-[11px] tracking-[0.3em] text-white/50 mb-2">GRAPHICS QUALITY</div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {Object.entries(QUALITY).map(([k, v]) => (
          <button key={k} data-testid={`quality-${k}`} onClick={() => s.setQuality(k)}
            className={`skew-panel py-2 font-display italic font-bold tracking-wider cursor-pointer ${s.quality === k ? 'bg-hz-pink' : 'bg-white/10 hover:bg-white/20'}`}>
            <span>{v.label.toUpperCase()}</span>
          </button>
        ))}
      </div>
      <div className="font-body text-[11px] tracking-[0.3em] text-white/50 mb-1 flex justify-between">
        <span>RENDER RESOLUTION</span><span className="text-white/80">{Math.round(s.renderScale * 100)}%</span>
      </div>
      <input data-testid="render-scale" type="range" min="0.5" max="1" step="0.05" value={s.renderScale}
        onChange={(e) => s.setRenderScale(parseFloat(e.target.value))} className="w-full accent-[#ff2e88] mb-4" />
      <div className="font-body text-[11px] tracking-[0.3em] text-white/50 mb-1">DRIVING ASSISTS</div>
      <Toggle testId="assist-tcs" label="Traction control" on={s.assists.tcs} onClick={() => s.toggleAssist('tcs')} />
      <Toggle testId="assist-abs" label="ABS" on={s.assists.abs} onClick={() => s.toggleAssist('abs')} />
      <Toggle testId="assist-stability" label="Stability assist" on={s.assists.stability} onClick={() => s.toggleAssist('stability')} />
      <Toggle testId="assist-manual" label="Manual transmission (Q / E)" on={s.assists.manual} onClick={() => s.toggleAssist('manual')} />
      <div className="font-body text-[11px] tracking-[0.3em] text-white/50 mt-4 mb-2">DEFAULT CAMERA</div>
      <div className="grid grid-cols-5 gap-1 mb-3">
        {CAMERA_MODES.map((c, i) => (
          <button key={c.id} onClick={() => s.setCameraMode(i)}
            className={`py-1.5 text-[10px] font-body font-semibold tracking-wider cursor-pointer ${s.cameraMode === i ? 'bg-hz-pink' : 'bg-white/10 hover:bg-white/20'}`}>
            {c.label.split(' ')[0]}
          </button>
        ))}
      </div>
      <Toggle testId="show-fps" label="Show FPS counter (F)" on={s.showFps} onClick={() => s.setShowFps(!s.showFps)} />
      <div className="font-body text-[11px] tracking-[0.3em] text-white/50 mt-4 mb-1">AUDIO</div>
      {[['master', 'Master volume'], ['sfx', 'Engine & effects'], ['music', 'Music']].map(([k, label]) => (
        <div key={k} className="flex items-center gap-3 py-1">
          <span className="font-body text-sm text-white/85 w-36">{label}</span>
          <input data-testid={`vol-${k}`} type="range" min="0" max="1" step="0.05" value={s.audio[k]}
            onChange={(e) => s.setAudio({ [k]: parseFloat(e.target.value) })} className="flex-1 accent-[#ff2e88]" />
          <span className="font-body text-xs text-white/60 w-8 text-right">{Math.round(s.audio[k] * 100)}</span>
        </div>
      ))}
      <Toggle testId="music-toggle" label="Background music (B)" on={s.audio.musicOn} onClick={() => s.setAudio({ musicOn: !s.audio.musicOn })} />
      <div className="font-body text-[11px] tracking-[0.3em] text-white/50 mt-4 mb-1">TOUCH / PHONE</div>
      <Toggle testId="touch-toggle" label="On-screen touch controls" on={s.touchControls} onClick={() => s.setTouchControls(!s.touchControls)} />
      <div className="grid grid-cols-3 gap-2 mt-2">
        {[['drag', 'SLIDE PAD'], ['buttons', 'BUTTONS'], ['tilt', 'TILT']].map(([k, label]) => (
          <button key={k} data-testid={`touch-steer-${k}`} onClick={() => s.setTouchSteer(k)}
            className={`py-2 text-[11px] font-body font-semibold tracking-wider cursor-pointer ${s.touchSteer === k ? 'bg-hz-pink' : 'bg-white/10 hover:bg-white/20'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="font-body text-[11px] text-white/40 mt-1.5">Steering style for touch controls. Tilt = hold the phone like a wheel.</div>
    </Panel>
  )
}

export function ControlsPanel({ onBack }) {
  const rows = [
    ['W / ↑', 'Throttle'], ['S / ↓', 'Brake · hold at stop to reverse'], ['A D / ← →', 'Steer'],
    ['SPACE', 'Handbrake (drift)'], ['SHIFT', 'Nitro boost'], ['C', 'Cycle camera'], ['1 – 6', 'Chase · Close · Hood · Cockpit · Cinematic · Free look (drag to orbit)'], ['R', 'Reset car upright'],
    ['T', 'Traction control on/off'], ['M', 'Manual gearbox · Q / E shift'], ['F', 'FPS counter'], ['B', 'Music on/off'], ['ESC', 'Pause menu'],
    ['Gamepad', 'RT/LT pedals · stick steer · A handbrake · X nitro · Y camera'],
    ['Phone', 'Left thumb: slide to steer (or tilt) · Right thumb: GAS / BRAKE / E-BRAKE / NITRO · top-left: pause, camera, reset, fullscreen'],
  ]
  return (
    <Panel title="CONTROLS" onBack={onBack}>
      <div className="font-body text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between py-1.5 border-b border-white/10">
            <span className="font-display font-bold italic tracking-wider text-hz-cyan">{k}</span>
            <span className="text-white/80 text-right ml-4">{v}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function CreditsPanel({ onBack }) {
  const rows = [
    ['BMW M4 (F82) 3D model', 'Blend Swap #81957 · CC-BY 3.0 · fan art, non-commercial'],
    ["MirceaKitsune's Gmod ponies", 'MirceaKitsune · Blend Swap #62439 · CC-BY 3.0 · fan art, non-commercial'],
    ['Engine sound, effects & music', 'Synthesised live in the browser (Web Audio) — original'],
    ['Game code, world, houses, UI', 'M4 Horizon'],
  ]
  return (
    <Panel title="CREDITS" onBack={onBack}>
      <div className="font-body text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="py-2 border-b border-white/10">
            <div className="font-display font-bold italic tracking-wider text-hz-cyan">{k}</div>
            <div className="text-white/75 text-xs mt-0.5">{v}</div>
          </div>
        ))}
        <div className="text-[10px] text-white/40 mt-3">BMW and M4 are trademarks of BMW AG. My Little Pony characters belong to Hasbro. Non-commercial fan project, not affiliated with either.</div>
      </div>
    </Panel>
  )
}

export function GaragePanel({ onBack }) {
  const carId = useGame((s) => s.carId)
  const paintId = useGame((s) => s.paintId)
  const setPaint = useGame((s) => s.setPaint)
  const spec = CARS[carId]
  const paint = spec.paints.find((p) => p.id === paintId)
  return (
    <Panel title="GARAGE" onBack={onBack}>
      <div className="font-display italic font-extrabold text-xl tracking-wide">{spec.name.toUpperCase()}</div>
      <div className="font-body text-xs text-white/55 tracking-wider mb-4">3.0L S58 TWIN-TURBO I6 · 510 HP · 650 N·m · RWD · 8-SPEED M STEPTRONIC</div>
      <div className="font-body text-[11px] tracking-[0.3em] text-white/50 mb-2">PAINT</div>
      <div className="grid grid-cols-7 gap-2 mb-2">
        {spec.paints.map((p) => (
          <button key={p.id} data-testid={`paint-${p.id}`} title={p.name} onClick={() => setPaint(p.id)}
            className={`aspect-square rounded-full cursor-pointer border-2 transition-transform hover:scale-110 ${p.id === paintId ? 'border-hz-pink scale-110' : 'border-white/20'}`}
            style={{ background: `radial-gradient(circle at 35% 30%, #ffffff55, ${p.color} 55%)` }} />
        ))}
      </div>
      <div className="font-body text-sm text-white/85">{paint?.name}</div>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center font-body">
        {[['0–100', '3.7 s'], ['TOP SPEED', '290 km/h'], ['WEIGHT', '1,725 kg']].map(([k, v]) => (
          <div key={k} className="bg-white/5 py-2">
            <div className="text-[10px] tracking-[0.25em] text-white/50">{k}</div>
            <div className="font-display italic font-extrabold text-xl">{v}</div>
          </div>
        ))}
      </div>
      {spec.model?.credit && <div className="font-body text-[10px] text-white/40 mt-4">{spec.model.credit}</div>}
    </Panel>
  )
}

export function Intro() {
  const setPhase = useGame((s) => s.setPhase)
  const [step, setStep] = useState(0)
  useEffect(() => {
    const timers = [setTimeout(() => setStep(1), 600), setTimeout(() => setStep(2), 2200), setTimeout(() => setPhase('menu'), 5200)]
    const skip = () => setPhase('menu')
    window.addEventListener('keydown', skip)
    window.addEventListener('pointerdown', skip)
    return () => { timers.forEach(clearTimeout); window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip) }
  }, [setPhase])
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute inset-x-0 top-0 h-[11vh] bg-black" />
      <div className="absolute inset-x-0 bottom-0 h-[11vh] bg-black" />
      <div className={`absolute left-[7vw] bottom-[17vh] transition-all duration-1000 ${step >= 1 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-6'}`}>
        <div className="m-stripe h-1.5 w-32 mb-3" />
        <div className="font-display italic font-extrabold text-6xl tracking-wide leading-none">BMW M4</div>
        <div className="font-display italic font-bold text-3xl tracking-[0.2em] text-white/80">COMPETITION</div>
      </div>
      <div className={`absolute right-[7vw] bottom-[17vh] text-right font-body tracking-[0.3em] text-xs text-white/70 transition-opacity duration-1000 ${step >= 2 ? 'opacity-100' : 'opacity-0'}`}>
        <div>S58 · 510 HP · 650 N·m</div>
        <div className="mt-1 text-white/45">{useGame.getState().isTouch ? 'TAP TO CONTINUE' : 'PRESS ANY KEY'}</div>
      </div>
    </div>
  )
}

export function MainMenu() {
  const setPhase = useGame((s) => s.setPhase)
  const [panel, setPanel] = useState(null)
  return (
    <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/70 via-black/20 to-transparent">
      <div className="absolute left-[6vw] top-[7vh] sm:top-[10vh] rise hidden [@media(min-height:560px)]:block">
        <div className="m-stripe h-1.5 w-40 mb-3" />
        <div className="font-display italic font-extrabold text-5xl [@media(min-height:560px)]:text-7xl leading-[0.85] tracking-tight">
          M4<br /><span className="text-hz-pink">HORIZON</span>
        </div>
        <div className="font-body text-xs tracking-[0.4em] text-white/60 mt-3">OPEN WORLD · STAGE 1 — M PROVING GROUND</div>
      </div>
      <div className="absolute right-[5vw] top-[5vh] text-right rise [@media(min-height:560px)]:hidden">
        <div className="m-stripe h-1 w-24 ml-auto mb-1.5" />
        <div className="font-display italic font-extrabold text-4xl leading-none">M4 <span className="text-hz-pink">HORIZON</span></div>
      </div>
      <div className="absolute left-[6vw] bottom-[6vh] [@media(min-height:560px)]:bottom-[10vh] w-[300px] [@media(min-height:560px)]:w-[340px] space-y-2 [@media(min-height:560px)]:space-y-2.5">
        {!panel && (
          <>
            <MenuButton testId="start-game" primary sub="ENTER THE PROVING GROUND" onClick={() => setPhase('playing')} delay={0}>START GAME</MenuButton>
            <MenuButton testId="menu-showroom" sub="ORBIT · CAMERA ANGLES · PAINT" onClick={() => useGame.getState().openShowroom()} delay={40}>VIEW CAR</MenuButton>
            <MenuButton testId="menu-garage" sub="PAINT · SPECS" onClick={() => setPanel('garage')} delay={60}>GARAGE</MenuButton>
            <MenuButton testId="menu-settings" sub="GRAPHICS · ASSISTS · CAMERA" onClick={() => setPanel('settings')} delay={120}>SETTINGS</MenuButton>
            <MenuButton testId="menu-controls" sub="KEYBOARD · GAMEPAD" onClick={() => setPanel('controls')} delay={180}>CONTROLS</MenuButton>
            <MenuButton testId="menu-credits" sub="3D MODELS · LICENCES" onClick={() => setPanel('credits')} delay={240}>CREDITS</MenuButton>
          </>
        )}
      </div>
      {panel && (
        <div className="absolute left-[6vw] bottom-[4vh] [@media(min-height:560px)]:bottom-[8vh]">
          {panel === 'settings' && <SettingsPanel onBack={() => setPanel(null)} />}
          {panel === 'controls' && <ControlsPanel onBack={() => setPanel(null)} />}
          {panel === 'garage' && <GaragePanel onBack={() => setPanel(null)} />}
          {panel === 'credits' && <CreditsPanel onBack={() => setPanel(null)} />}
        </div>
      )}
    </div>
  )
}

export function PauseMenu() {
  const setPhase = useGame((s) => s.setPhase)
  const requestReset = useGame((s) => s.requestReset)
  const [panel, setPanel] = useState(null)
  return (
    <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] pointer-events-none flex items-center justify-center">
      {!panel ? (
        <div className="w-[340px] max-h-[94vh] scroll-y pointer-events-auto space-y-2 py-2 px-1">
          <div className="font-display italic font-extrabold text-4xl [@media(min-height:560px)]:text-5xl tracking-wide mb-2 rise">PAUSED</div>
          <MenuButton testId="resume" primary onClick={() => setPhase('playing')}>RESUME</MenuButton>
          <MenuButton testId="pause-reset" sub="PUT THE CAR BACK ON ITS WHEELS" onClick={() => { requestReset(); setPhase('playing') }}>RESET CAR</MenuButton>
          <MenuButton testId="pause-showroom" onClick={() => useGame.getState().openShowroom()}>VIEW CAR</MenuButton>
          <MenuButton testId="pause-garage" onClick={() => setPanel('garage')}>GARAGE</MenuButton>
          <MenuButton testId="pause-settings" onClick={() => setPanel('settings')}>SETTINGS</MenuButton>
          <MenuButton testId="pause-controls" onClick={() => setPanel('controls')}>CONTROLS</MenuButton>
          <MenuButton testId="pause-menu" onClick={() => setPhase('menu')}>MAIN MENU</MenuButton>
        </div>
      ) : (
        <>
          {panel === 'settings' && <SettingsPanel onBack={() => setPanel(null)} />}
          {panel === 'controls' && <ControlsPanel onBack={() => setPanel(null)} />}
          {panel === 'garage' && <GaragePanel onBack={() => setPanel(null)} />}
        </>
      )}
    </div>
  )
}

export function Showroom() {
  const close = useGame((s) => s.closeShowroom)
  const carId = useGame((s) => s.carId)
  const paintId = useGame((s) => s.paintId)
  const setPaint = useGame((s) => s.setPaint)
  const isTouch = useGame((s) => s.isTouch)
  const spec = CARS[carId]
  const [preset, setPreset] = useState('front34')
  useEffect(() => { applyPreset('front34') }, [])
  const pick = (id) => { setPreset(id); applyPreset(id) }
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute left-[calc(env(safe-area-inset-left)+20px)] top-[calc(env(safe-area-inset-top)+14px)] rise">
        <div className="m-stripe h-1 w-24 mb-2" />
        <div className="font-display italic font-extrabold text-3xl [@media(min-height:560px)]:text-4xl tracking-wide leading-none">{spec.name.toUpperCase()}</div>
        <div className="font-body text-[11px] tracking-[0.3em] text-white/60 mt-1">SHOWROOM · {isTouch ? 'DRAG TO ORBIT · PINCH TO ZOOM' : 'DRAG TO ORBIT · SCROLL TO ZOOM'}</div>
      </div>
      <button data-testid="showroom-back" onClick={close}
        className="pointer-events-auto absolute right-[calc(env(safe-area-inset-right)+16px)] top-[calc(env(safe-area-inset-top)+14px)] skew-panel bg-hz-pink px-5 py-2 font-display italic font-extrabold tracking-widest cursor-pointer hover:bg-white hover:text-hz-ink">
        <span>◂ BACK</span>
      </button>
      {/* camera angles */}
      <div className="absolute left-[calc(env(safe-area-inset-left)+20px)] top-[38%] [@media(min-height:560px)]:top-1/2 [@media(min-height:560px)]:-translate-y-[40%] grid grid-cols-2 [@media(min-height:560px)]:grid-cols-1 gap-1.5">
        {Object.entries(PRESETS).map(([id, p]) => (
          <button key={id} data-testid={`angle-${id}`} onClick={() => pick(id)}
            className={`pointer-events-auto w-28 [@media(min-height:560px)]:w-32 text-left px-3 py-1.5 [@media(min-height:560px)]:py-2 font-display italic font-bold tracking-wider text-sm border-l-4 cursor-pointer transition-colors
              ${preset === id ? 'bg-white text-hz-ink border-hz-pink' : 'bg-black/45 backdrop-blur border-white/20 hover:bg-white/20'}`}>
            {p.label}
          </button>
        ))}
      </div>
      {/* paint */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+14px)] pointer-events-auto bg-black/45 backdrop-blur px-4 py-2.5 flex items-center gap-2.5">
        <span className="font-body text-[10px] tracking-[0.3em] text-white/55 mr-1 hidden sm:inline">PAINT</span>
        {spec.paints.map((p) => (
          <button key={p.id} data-testid={`showroom-paint-${p.id}`} title={p.name} onClick={() => setPaint(p.id)}
            className={`w-8 h-8 rounded-full border-2 cursor-pointer transition-transform ${p.id === paintId ? 'border-hz-pink scale-115' : 'border-white/25'}`}
            style={{ background: `radial-gradient(circle at 35% 30%, #ffffff55, ${p.color} 55%)` }} />
        ))}
        <span className="font-body text-xs text-white/85 ml-2 hidden sm:inline">{spec.paints.find((p) => p.id === paintId)?.name}</span>
      </div>
      {spec.model?.credit && (
        <div className="absolute right-[calc(env(safe-area-inset-right)+14px)] bottom-[calc(env(safe-area-inset-bottom)+10px)] font-body text-[9px] text-white/40 max-w-[200px] text-right">{spec.model.credit}</div>
      )}
    </div>
  )
}
