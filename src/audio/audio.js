// All game audio, synthesised live with the Web Audio API (no copyrighted samples).
//  • Engine: BMW S58-style 3.0 L straight-six. An inline-6 fires 3 times per crank revolution, so the
//    fundamental is rpm/60·3 (45 Hz at idle → 360 Hz at the 7,200 rpm redline). A custom harmonic
//    table gives the smooth-but-raspy six-cylinder tone; a half-order layer adds exhaust burble.
//  • Twin-turbo whistle + blow-off, overrun crackles & pops, gear-shift clunk, nitro, tyre squeal,
//    gravel rumble, road and wind noise, starter motor.
//  • Music: original generative synthwave (Am–F–C–G) — or drop your own file at /public/audio/bgm.mp3.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

function noiseBuffer(ctx, seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}

function softClip(amount = 2.2, n = 2048) {
  const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    c[i] = Math.tanh(x * amount) / Math.tanh(amount)
  }
  return c
}

function reverbIR(ctx, seconds = 2.4, decay = 3) {
  const len = ctx.sampleRate * seconds
  const b = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
  }
  return b
}

class Audio {
  constructor() {
    this.ctx = null
    this.ready = false
    this.settings = { master: 0.8, sfx: 0.85, music: 0.5, musicOn: true }
    this.state = { lastThrottle: 0, lastGear: 1, boost: 0, crackleUntil: 0, starting: 0, rpmVis: 900 }
  }

  /** Must be called from a user gesture (click / key / touch). Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) this.build()
    if (this.ctx.state !== 'running') this.ctx.resume()
  }

  build() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }))
    this.noise = noiseBuffer(ctx)
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4
    this.master = ctx.createGain()
    this.master.connect(comp).connect(ctx.destination)
    this.sfx = ctx.createGain(); this.sfx.connect(this.master)
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master)
    this.reverb = ctx.createConvolver(); this.reverb.buffer = reverbIR(ctx)
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.35
    this.reverbSend.connect(this.reverb).connect(this.master)
    this.buildEngine()
    this.buildLoops()
    this.music = new Music(this)
    this.applySettings()
    this.ready = true
  }

  loopNoise() {
    const s = this.ctx.createBufferSource()
    s.buffer = this.noise; s.loop = true
    s.loopStart = Math.random(); s.start(0, Math.random() * 1.5)
    return s
  }

  buildEngine() {
    const ctx = this.ctx
    // inline-6 harmonic signature (relative to firing frequency); strong 1st/2nd, airy upper rasp
    const amps = [0, 1, 0.62, 0.38, 0.3, 0.2, 0.17, 0.11, 0.09, 0.07, 0.06, 0.045, 0.035, 0.03, 0.022, 0.018, 0.012]
    const real = new Float32Array(amps.length), imag = new Float32Array(amps.length)
    amps.forEach((a, i) => { const ph = i * 1.7; real[i] = a * Math.cos(ph); imag[i] = a * Math.sin(ph) })
    const wave = ctx.createPeriodicWave(real, imag)

    const e = (this.engine = {})
    e.o1 = ctx.createOscillator(); e.o1.setPeriodicWave(wave)
    e.o2 = ctx.createOscillator(); e.o2.setPeriodicWave(wave); e.o2.detune.value = 9
    e.sub = ctx.createOscillator(); e.sub.type = 'sawtooth' // half-order exhaust burble
    e.rasp = ctx.createOscillator(); e.rasp.type = 'sawtooth' // M exhaust rasp at high load
    const g1 = ctx.createGain(); g1.gain.value = 0.5
    const g2 = ctx.createGain(); g2.gain.value = 0.35
    e.subGain = ctx.createGain(); e.subGain.gain.value = 0.25
    e.raspGain = ctx.createGain(); e.raspGain.gain.value = 0
    e.raspBP = ctx.createBiquadFilter(); e.raspBP.type = 'bandpass'; e.raspBP.Q.value = 1.4

    e.pre = ctx.createGain(); e.pre.gain.value = 1.2
    e.shaper = ctx.createWaveShaper(); e.shaper.curve = softClip(2.4); e.shaper.oversample = '2x'
    e.lp = ctx.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.Q.value = 0.8
    e.body = ctx.createBiquadFilter(); e.body.type = 'peaking'; e.body.frequency.value = 160; e.body.gain.value = 5; e.body.Q.value = 0.9
    e.out = ctx.createGain(); e.out.gain.value = 0

    e.o1.connect(g1).connect(e.pre)
    e.o2.connect(g2).connect(e.pre)
    e.sub.connect(e.subGain).connect(e.pre)
    e.rasp.connect(e.raspBP).connect(e.raspGain).connect(e.pre)
    e.pre.connect(e.shaper).connect(e.lp).connect(e.body).connect(e.out).connect(this.sfx)
    e.out.connect(this.reverbSend)

    // combustion roughness: slow random wobble on the output level
    const rough = this.loopNoise()
    const roughLP = ctx.createBiquadFilter(); roughLP.type = 'lowpass'; roughLP.frequency.value = 40
    e.roughGain = ctx.createGain(); e.roughGain.gain.value = 0.05
    rough.connect(roughLP).connect(e.roughGain).connect(e.out.gain)

    // intake / induction roar
    const intake = this.loopNoise()
    e.intakeBP = ctx.createBiquadFilter(); e.intakeBP.type = 'bandpass'; e.intakeBP.Q.value = 1.2
    e.intakeGain = ctx.createGain(); e.intakeGain.gain.value = 0
    intake.connect(e.intakeBP).connect(e.intakeGain).connect(this.sfx)

    // twin-turbo whistle + spool hiss
    e.turbo = ctx.createOscillator(); e.turbo.type = 'sine'
    e.turboGain = ctx.createGain(); e.turboGain.gain.value = 0
    e.turbo.connect(e.turboGain).connect(this.sfx)
    const hiss = this.loopNoise()
    e.hissBP = ctx.createBiquadFilter(); e.hissBP.type = 'bandpass'; e.hissBP.frequency.value = 3200; e.hissBP.Q.value = 2
    e.hissGain = ctx.createGain(); e.hissGain.gain.value = 0
    hiss.connect(e.hissBP).connect(e.hissGain).connect(this.sfx)

    for (const o of [e.o1, e.o2, e.sub, e.rasp, e.turbo]) o.start()
  }

  buildLoops() {
    const ctx = this.ctx
    const mk = (type, freq, q) => {
      const src = this.loopNoise()
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q
      const g = ctx.createGain(); g.gain.value = 0
      src.connect(f).connect(g).connect(this.sfx)
      return { f, g }
    }
    this.wind = mk('lowpass', 800, 0.5)
    this.road = mk('lowpass', 220, 0.7)
    this.gravel = mk('bandpass', 380, 0.8)
    this.nitro = mk('highpass', 2200, 0.7)
    // tyre squeal: narrow band noise with vibrato
    this.squeal = mk('bandpass', 1150, 9)
    const vib = ctx.createOscillator(); vib.frequency.value = 7.5
    const vibG = ctx.createGain(); vibG.gain.value = 70
    vib.connect(vibG).connect(this.squeal.f.frequency); vib.start()
    this.squeal2 = mk('bandpass', 1750, 12)
  }

  // ---------- one-shots ----------
  burst({ type = 'bandpass', freq = 800, q = 1, dur = 0.05, gain = 0.3, at = 0, sweepTo = null, dest = null }) {
    const ctx = this.ctx, t = ctx.currentTime + at
    const s = ctx.createBufferSource(); s.buffer = this.noise
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + dur)
    s.connect(f).connect(g).connect(dest || this.sfx)
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05)
  }
  thump(freq = 90, dur = 0.08, gain = 0.4, at = 0) {
    const ctx = this.ctx, t = ctx.currentTime + at
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur)
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur + 0.02)
  }
  crackles(intensity = 1) {
    const n = Math.floor(4 + Math.random() * 7 * intensity)
    let at = 0.04
    for (let i = 0; i < n; i++) {
      at += 0.03 + Math.random() * 0.12
      const big = Math.random() < 0.18
      this.burst({ type: big ? 'lowpass' : 'bandpass', freq: big ? 420 : 500 + Math.random() * 1400, q: big ? 0.7 : 1.5, dur: big ? 0.09 : 0.025 + Math.random() * 0.03, gain: (big ? 0.55 : 0.28) * intensity, at })
      if (big) this.thump(70, 0.07, 0.25 * intensity, at)
    }
  }
  blowOff(amount) {
    this.burst({ type: 'bandpass', freq: 4200, sweepTo: 900, q: 1.6, dur: 0.45, gain: 0.16 * amount })
    this.burst({ type: 'highpass', freq: 2500, q: 0.5, dur: 0.3, gain: 0.07 * amount, at: 0.02 })
  }
  shiftClunk(up) {
    this.thump(up ? 95 : 80, 0.06, 0.3)
    this.burst({ type: 'bandpass', freq: 2200, q: 3, dur: 0.03, gain: 0.08 })
    if (up) this.burst({ type: 'lowpass', freq: 500, q: 0.7, dur: 0.08, gain: 0.35, at: 0.04 }) // upshift "bark"
  }
  starter() {
    this.state.starting = performance.now()
    for (let i = 0; i < 9; i++) this.burst({ type: 'bandpass', freq: 260, q: 2, dur: 0.06, gain: 0.25, at: i * 0.075 })
  }
  ui(kind = 'click') {
    if (!this.ready) return
    const ctx = this.ctx, t = ctx.currentTime
    const o = ctx.createOscillator(); o.type = 'triangle'
    o.frequency.setValueAtTime(kind === 'back' ? 520 : 880, t); o.frequency.exponentialRampToValueAtTime(kind === 'back' ? 360 : 1320, t + 0.06)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09)
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.1)
  }

  // ---------- per-frame ----------
  /** t = telemetry, input = driver input, mode = 'drive' | 'idle' | 'off' */
  update(t, input, mode) {
    if (!this.ready || this.ctx.state !== 'running') return
    const ctx = this.ctx, now = ctx.currentTime, e = this.engine, st = this.state
    const set = (p, v, tc = 0.04) => p.setTargetAtTime(v, now, tc)
    const on = mode !== 'off'
    const throttle = mode === 'drive' ? clamp(t.throttle || 0, 0, 1) : 0

    // starter: crank, catch, flare to ~2,600 rpm, settle to idle
    let rpm = t.rpm
    const since = (performance.now() - st.starting) / 1000
    if (since < 0.7) rpm = 0
    else if (since < 1.6) rpm = Math.max(rpm, 900 + Math.sin(((since - 0.7) / 0.9) * Math.PI) * 1700)
    st.rpmVis += (rpm - st.rpmVis) * 0.5
    rpm = st.rpmVis
    const running = on && rpm > 300
    const r = clamp((rpm - 900) / 6300, 0, 1)
    const f = Math.max(20, (rpm / 60) * 3)

    set(e.o1.frequency, f, 0.015); set(e.o2.frequency, f, 0.015)
    set(e.sub.frequency, f / 2, 0.015); set(e.rasp.frequency, f * 2, 0.015)
    set(e.raspBP.frequency, 900 + r * 2200)
    set(e.raspGain.gain, throttle * (0.15 + r * 0.35))
    set(e.subGain.gain, 0.32 - r * 0.15 + (1 - throttle) * 0.1)
    set(e.pre.gain, 0.9 + throttle * 1.4 + r * 0.4)
    set(e.lp.frequency, 380 + r * 1600 + throttle * (1400 + r * 3500))
    set(e.out.gain, running ? (t.shifting ? 0.06 : 0.11 + r * 0.12 + throttle * 0.16) : 0, 0.05)
    set(e.roughGain.gain, running ? 0.03 + (1 - r) * 0.04 : 0)

    set(e.intakeBP.frequency, 500 + r * 1800)
    set(e.intakeGain.gain, running ? throttle * (0.03 + r * 0.1) : 0)

    // turbo: boost builds with load and revs, lags a little
    const targetBoost = running ? throttle * clamp((rpm - 1800) / 3200, 0, 1) : 0
    st.boost += (targetBoost - st.boost) * (targetBoost > st.boost ? 0.05 : 0.25)
    set(e.turbo.frequency, 2600 + st.boost * 4200)
    set(e.turboGain.gain, st.boost * 0.018)
    set(e.hissGain.gain, st.boost * 0.05)

    // events
    if (running && mode === 'drive') {
      if (st.lastThrottle > 0.6 && throttle < 0.15) {
        if (st.boost > 0.35) this.blowOff(st.boost)
        if (rpm > 3600) this.crackles(clamp((rpm - 3000) / 4000, 0.4, 1))
      }
      if (t.gear !== st.lastGear && st.lastGear !== undefined && t.gear > 0 && st.lastGear > 0) this.shiftClunk(t.gear > st.lastGear)
      // overrun burble while coasting from high revs
      if (throttle < 0.1 && rpm > 3200 && Math.random() < 0.06) this.burst({ type: 'bandpass', freq: 300 + Math.random() * 600, q: 1.2, dur: 0.03, gain: 0.12 })
      // limiter bounce
      if (rpm > 7150 && throttle > 0.8 && Math.random() < 0.25) this.burst({ type: 'lowpass', freq: 600, q: 0.8, dur: 0.04, gain: 0.2 })
    }
    st.lastThrottle = throttle
    st.lastGear = t.gear

    // environment
    const v = t.speed || 0
    const onGround = (t.wheelsOnGround ?? 4) >= 2
    const surf = t.surface
    set(this.wind.g.gain, on ? clamp((v / 70) ** 2 * 0.22, 0, 0.22) : 0, 0.2)
    set(this.wind.f.frequency, 500 + v * 14)
    set(this.road.g.gain, on && onGround ? clamp(v / 50, 0, 1) * (surf === 'ASPHALT' || surf === 'KERB' ? 0.07 : 0.03) : 0, 0.1)
    set(this.gravel.g.gain, on && onGround && (surf === 'DIRT' || surf === 'GRASS') ? clamp(v / 25, 0, 1) * 0.16 : 0, 0.1)
    const slip = on && onGround && (surf === 'ASPHALT' || surf === 'KERB')
      ? clamp((Math.abs(t.slipAngle || 0) - 0.12) * 2.2, 0, 1) * clamp(v / 8, 0, 1) + (input?.handbrake && v > 4 ? 0.5 : 0) +
        ((input?.throttle > 0.5 && input?.brake > 0.5 && v < 3) ? 0.8 : 0) + (t.absActive ? 0.15 : 0)
      : 0
    set(this.squeal.g.gain, clamp(slip, 0, 1) * 0.12, 0.05)
    set(this.squeal2.g.gain, clamp(slip, 0, 1) * 0.05, 0.05)
    set(this.nitro.g.gain, on && t.nitroActive ? 0.09 : 0, 0.08)
  }

  applySettings() {
    if (!this.ctx) return
    const s = this.settings, now = this.ctx.currentTime
    this.master.gain.setTargetAtTime(s.master, now, 0.05)
    this.sfx.gain.setTargetAtTime(s.sfx, now, 0.05)
    this.musicBus.gain.setTargetAtTime(s.musicOn ? s.music : 0, now, 0.3)
    if (s.musicOn) this.music.start(); else this.music.stop()
  }
  set(partial) { Object.assign(this.settings, partial); this.applySettings() }
  /** quieter music while paused / in menus */
  duck(amount) {
    if (!this.ctx) return
    this.musicBus.gain.setTargetAtTime(this.settings.musicOn ? this.settings.music * amount : 0, this.ctx.currentTime, 0.4)
  }
}

// ---------------- generative music ----------------
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12)
// Am – F – C – G   (MIDI roots) with chord tones
const CHORDS = [
  { root: 45, tones: [57, 60, 64, 69] },
  { root: 41, tones: [53, 57, 60, 65] },
  { root: 48, tones: [55, 60, 64, 67] },
  { root: 43, tones: [55, 59, 62, 67] },
]
const BPM = 100

class Music {
  constructor(a) {
    this.a = a
    this.ctx = a.ctx
    this.out = a.musicBus
    this.step = 0
    this.timer = null
    this.file = null
    const delay = this.ctx.createDelay(1)
    delay.delayTime.value = (60 / BPM) * 0.75
    const fb = this.ctx.createGain(); fb.gain.value = 0.32
    const dl = this.ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2500
    delay.connect(dl).connect(fb).connect(delay)
    this.delay = this.ctx.createGain(); this.delay.gain.value = 0.35
    this.delay.connect(delay); dl.connect(this.out)
    this.verb = a.ctx.createGain(); this.verb.gain.value = 0.5
    this.verb.connect(a.reverb)
    // user-supplied track overrides the generator (Vite serves index.html for missing files → check type)
    fetch(import.meta.env.BASE_URL + 'audio/bgm.mp3', { method: 'HEAD' }).then((r) => {
      if (r.ok && (r.headers.get('content-type') || '').startsWith('audio')) {
        const el = new window.Audio(import.meta.env.BASE_URL + 'audio/bgm.mp3'); el.loop = true; el.crossOrigin = 'anonymous'
        this.a.ctx.createMediaElementSource(el).connect(this.out)
        this.file = el
        if (this.timer) { this.stop(); this.start() }
      }
    }).catch(() => {})
  }
  start() {
    if (this.file) { this.file.play().catch(() => {}); return }
    if (this.timer) return
    this.next = this.ctx.currentTime + 0.1
    this.timer = setInterval(() => this.schedule(), 25)
  }
  stop() {
    if (this.file) this.file.pause()
    clearInterval(this.timer); this.timer = null
  }
  schedule() {
    const sixteenth = 60 / BPM / 4
    while (this.next < this.ctx.currentTime + 0.15) {
      this.play(this.step, this.next)
      this.next += sixteenth
      this.step = (this.step + 1) % (16 * 32)
    }
  }
  play(step, t) {
    const bar = Math.floor(step / 16), s = step % 16
    const chord = CHORDS[bar % 4]
    const section = bar % 32 // 0-3 intro, 4-15 groove, 16-27 groove+arp, 28-31 breakdown
    const drums = section >= 4 && section < 28
    const arp = section >= 16 && section < 28
    if (s === 0) this.pad(chord, t, (60 / BPM) * 4)
    if (s % 2 === 0) this.bass(chord.root + (s % 4 === 2 ? 12 : 0), t, section < 4 ? 0.5 : 1)
    if (drums) {
      if (s % 4 === 0) this.kick(t)
      if (s === 4 || s === 12) this.snare(t)
      if (s % 2 === 1 || bar % 2) this.hat(t, s % 4 === 2 ? 0.05 : 0.025)
    } else if (section >= 28 && s % 4 === 0) this.hat(t, 0.02)
    if (arp) {
      const seq = [0, 1, 2, 3, 2, 1, 3, 2]
      this.lead(chord.tones[seq[s % 8]] + 12, t)
    }
  }
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0005, t + a + d) }
  kick(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain()
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14)
    this.env(g, t, 0.002, 0.55, 0.28); o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.35)
  }
  snare(t) {
    const s = this.ctx.createBufferSource(); s.buffer = this.a.noise
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400
    const g = this.ctx.createGain(); this.env(g, t, 0.002, 0.22, 0.18)
    s.connect(f).connect(g); g.connect(this.out); g.connect(this.verb); s.start(t, Math.random()); s.stop(t + 0.25)
    const o = this.ctx.createOscillator(), og = this.ctx.createGain(); o.frequency.value = 190
    this.env(og, t, 0.002, 0.12, 0.08); o.connect(og).connect(this.out); o.start(t); o.stop(t + 0.12)
  }
  hat(t, v) {
    const s = this.ctx.createBufferSource(); s.buffer = this.a.noise
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500
    const g = this.ctx.createGain(); this.env(g, t, 0.001, v, 0.04)
    s.connect(f).connect(g).connect(this.out); s.start(t, Math.random()); s.stop(t + 0.07)
  }
  bass(n, t, v) {
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n)
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6
    f.frequency.setValueAtTime(1600, t); f.frequency.exponentialRampToValueAtTime(220, t + 0.2)
    const g = this.ctx.createGain(); this.env(g, t, 0.004, 0.14 * v, 0.22)
    o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + 0.3)
  }
  pad(chord, t, dur) {
    for (const n of chord.tones) for (const det of [-8, 7]) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.022, t + 0.6); g.gain.setValueAtTime(0.022, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur + 0.2)
      o.connect(f).connect(g); g.connect(this.out); g.connect(this.verb)
      o.start(t); o.stop(t + dur + 0.3)
    }
  }
  lead(n, t) {
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = NOTE(n)
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400
    const g = this.ctx.createGain(); this.env(g, t, 0.003, 0.035, 0.12)
    o.connect(f).connect(g); g.connect(this.out); g.connect(this.delay); o.start(t); o.stop(t + 0.18)
  }
}

export const audio = new Audio()
if (typeof window !== 'undefined') window.__m4 = Object.assign(window.__m4 || {}, { audio })
