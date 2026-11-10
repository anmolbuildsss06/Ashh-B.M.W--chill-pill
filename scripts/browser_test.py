"""End-to-end browser test: menus, driving controls, cameras, pause. Run with the dev server on :5173.
Usage: python3 scripts/browser_test.py [outdir]
"""
import json, sys, time, os
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else 'test-shots'
os.makedirs(OUT, exist_ok=True)
URL = os.environ.get('URL', 'http://localhost:5173')
results = []

import math
def dyaw(a, b):
    '''signed heading change a→b, wrapped to (-π, π]'''
    return math.atan2(math.sin(b - a), math.cos(b - a))

def check(name, ok, detail=''):
    results.append((name, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  — {detail}", flush=True)

def tel(page):
    return page.evaluate("""() => { const s = window.__m4?.car?.sim; if (!s) return null;
      const p = s.body.translation(); const q = s.body.rotation(); const t = s.telemetry;
      return { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(2*(q.w*q.y + q.x*q.z), 1 - 2*(q.y*q.y + q.x*q.x)), upY: s.up.y,
               kmh: t.speedKmh, fwd: t.forwardSpeed, gear: t.gearLabel, rpm: t.rpm, slip: t.slipAngle, drifting: t.drifting,
               nitro: t.nitro, surface: t.surface } }""")

def phase(page):
    return page.evaluate("() => window.__m4.store.getState().phase")

def fps(page, secs=2.0):
    return page.evaluate(f"""() => new Promise(r => {{ let n = 0; const t0 = performance.now();
      const f = () => {{ n++; if (performance.now() - t0 < {secs*1000}) requestAnimationFrame(f); else r(n / ((performance.now()-t0)/1000)); }};
      requestAnimationFrame(f); }})""")

def hold(page, keys, secs):
    for k in keys: page.keyboard.down(k)
    time.sleep(secs)
    for k in keys: page.keyboard.up(k)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True,
        args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'])
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    errors = []
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    page.add_init_script("localStorage.setItem('m4h-settings', JSON.stringify({quality: 'low', renderScale: 0.6}))")
    page.goto(URL)
    page.wait_for_function("() => window.__m4?.car?.sim", timeout=60000)
    time.sleep(2.5)
    page.screenshot(path=f'{OUT}/01-intro.png')
    check('Intro plays then advances to menu', phase(page) in ('intro', 'menu'), phase(page))

    page.keyboard.press('Enter')
    time.sleep(1.5)
    page.screenshot(path=f'{OUT}/02-menu.png')
    check('Any key → main menu', phase(page) == 'menu', phase(page))

    page.click('[data-testid=menu-garage]'); time.sleep(0.5)
    page.click('[data-testid=paint-sao-paulo]'); time.sleep(1.0)
    page.screenshot(path=f'{OUT}/03-garage.png')
    check('Garage paint selection', page.evaluate("() => window.__m4.store.getState().paintId") == 'sao-paulo')
    page.click('[data-testid=back]')
    page.click('[data-testid=menu-credits]'); time.sleep(0.4)
    check('Credits panel lists asset authors', page.get_by_text('MirceaKitsune', exact=False).count() > 0)
    page.click('[data-testid=back]')
    page.click('[data-testid=menu-settings]'); time.sleep(0.4)
    page.locator('[data-testid=music-toggle]').scroll_into_view_if_needed(); page.click('[data-testid=music-toggle]'); time.sleep(0.2)
    m_off = page.evaluate("() => window.__m4.store.getState().audio.musicOn") is False
    page.click('[data-testid=music-toggle]')
    check('Music toggle in settings', m_off)
    page.click('[data-testid=assist-abs]'); time.sleep(0.2)
    abs_off = page.evaluate("() => window.__m4.store.getState().assists.abs") is False
    page.click('[data-testid=assist-abs]')
    check('Settings toggles work', abs_off)
    page.screenshot(path=f'{OUT}/04-settings.png')
    page.click('[data-testid=back]')

    page.click('[data-testid=start-game]')
    time.sleep(1.5)
    check('START GAME → playing', phase(page) == 'playing', phase(page))
    time.sleep(1.5)
    au = page.evaluate("() => { const a = window.__m4.audio; return { ready: a.ready, state: a.ctx && a.ctx.state, music: !!(a.music && (a.music.timer || a.music.file)) } }")
    check('Audio unlocked by first input; music playing', au['ready'] and au['state'] == 'running' and au['music'], json.dumps(au))
    t0 = tel(page)
    check('Car resting upright on spawn', t0 and t0['upY'] > 0.98 and t0['kmh'] < 2, json.dumps({k: round(v, 3) if isinstance(v, float) else v for k, v in t0.items()}))
    print('  fps (swiftshader, low):', round(fps(page), 1))
    page.screenshot(path=f'{OUT}/05-spawn.png')

    # Throttle
    hold(page, ['KeyW'], 4.0)
    t1 = tel(page)
    page.screenshot(path=f'{OUT}/06-accelerating.png')
    dist = ((t1['x'] - t0['x'])**2 + (t1['z'] - t0['z'])**2) ** 0.5
    fwd_dir = (-__import__('math').sin(t0['yaw']), -__import__('math').cos(t0['yaw']))
    along = (t1['x'] - t0['x']) * fwd_dir[0] + (t1['z'] - t0['z']) * fwd_dir[1]
    # engine pitch = rpm/60 × 3 (inline-6); compare with the rpm the audio last received (it updates once per frame)
    eng = page.evaluate("() => [window.__m4.audio.engine.o1.frequency.value, window.__m4.audio.state.rpmVis, window.__m4.car.sim.telemetry.rpm]")
    check('Engine sound follows RPM (inline-6: 3 pulses/rev)', abs(eng[0] - eng[1] / 20) < eng[1] / 20 * 0.15 and eng[0] > 120, f"{eng[0]:.0f} Hz at {eng[1]:.0f} rpm (live {eng[2]:.0f})")
    check('W accelerates forward', t1['kmh'] > 40 and along > 10, f"{t1['kmh']:.0f} km/h, gear {t1['gear']}, moved {dist:.0f} m, along heading {along:.0f} m")
    hud_speed = int(page.inner_text('[data-testid=speed]'))
    check('HUD speedometer matches sim', abs(hud_speed - t1['kmh']) < max(15, t1['kmh'] * 0.2), f"HUD {hud_speed} vs sim {t1['kmh']:.0f}")

    # Steer right while coasting
    yaw0 = tel(page)['yaw']
    page.keyboard.down('KeyW'); hold(page, ['KeyD'], 1.2); page.keyboard.up('KeyW')
    t2 = tel(page)
    check('D steers right (yaw decreases)', dyaw(yaw0, t2['yaw']) < -0.15, f"yaw {yaw0:.2f} → {t2['yaw']:.2f}")
    page.screenshot(path=f'{OUT}/07-turning.png')

    # Handbrake drift — start from a known clear spot on the pad heading east down the cross road
    page.evaluate("() => window.__m4.car.sim.reset([-40, 1.0, 0], -Math.PI / 2)")
    time.sleep(1.0)
    page.keyboard.down('KeyW'); time.sleep(3.0)
    max_slip = 0
    page.keyboard.down('KeyA'); page.keyboard.down('Space')
    for _ in range(6):
        time.sleep(0.12); max_slip = max(max_slip, abs(tel(page)['slip']))
    page.keyboard.up('Space')
    for _ in range(8):
        time.sleep(0.12); max_slip = max(max_slip, abs(tel(page)['slip']))
    page.screenshot(path=f'{OUT}/08-drift.png')
    page.keyboard.up('KeyA'); page.keyboard.up('KeyW')
    check('Handbrake + steer produces a slide', max_slip > 0.25, f"max slip {max_slip*57.3:.0f}°")
    t3 = tel(page)
    check('Car stays upright through drift', t3['upY'] > 0.8, f"upY {t3['upY']:.2f}")

    # Brake to stop then reverse
    page.evaluate("() => window.__m4.car.sim.reset([-40, 1, 0], -Math.PI / 2)"); time.sleep(1.0)
    hold(page, ['KeyS'], 3.5)
    t4 = tel(page)
    hold(page, ['KeyS'], 2.0)
    t5 = tel(page)
    check('S brakes then engages reverse', t5['gear'] == 'R' and t5['fwd'] < -1, f"after brake {t4['kmh']:.0f} km/h; then gear {t5['gear']}, v {t5['fwd']:.1f} m/s")

    # Nitro (on open road)
    page.evaluate("() => window.__m4.car.sim.reset([-40, 1, 0], -Math.PI / 2)"); time.sleep(1.0)
    hold(page, ['KeyW'], 1.0)
    n0 = tel(page)['nitro']
    hold(page, ['KeyW', 'ShiftLeft'], 1.5)
    n1 = tel(page)['nitro']
    check('SHIFT burns nitro', n1 < n0 - 0.15, f"{n0:.2f} → {n1:.2f}")

    # Cameras
    for i in range(6):
        page.keyboard.press('KeyC'); time.sleep(0.9)
        mode = page.evaluate("() => window.__m4.store.getState().cameraMode")
        page.screenshot(path=f'{OUT}/09-camera-{mode}.png')
    check('C cycles all 6 cameras', page.evaluate("() => window.__m4.store.getState().cameraMode") == 0)

    # Number keys pick a camera directly
    page.keyboard.press('Digit4'); time.sleep(0.4)
    check('Key 4 selects cockpit', page.evaluate("() => window.__m4.store.getState().cameraMode") == 3)
    page.keyboard.press('Digit1'); time.sleep(0.4)

    # Reset
    page.keyboard.press('KeyR'); time.sleep(1.5)
    t6 = tel(page)
    check('R resets car upright', t6['upY'] > 0.95, f"upY {t6['upY']:.2f}")

    # Pause
    page.keyboard.press('Escape'); time.sleep(0.6)
    check('ESC pauses', phase(page) == 'paused')
    tp0 = tel(page); time.sleep(0.6); tp1 = tel(page)
    check('Physics frozen while paused', abs(tp0['z'] - tp1['z']) < 1e-4 and abs(tp0['x'] - tp1['x']) < 1e-4)
    page.screenshot(path=f'{OUT}/10-pause.png')
    page.click('[data-testid=resume]'); time.sleep(0.4)
    check('Resume works', phase(page) == 'playing')

    # View Car showroom from the pause menu
    page.keyboard.press('Escape'); time.sleep(0.5)
    page.click('[data-testid=pause-showroom]'); time.sleep(0.8)
    check('Pause → VIEW CAR opens showroom', phase(page) == 'showroom', phase(page))
    page.click('[data-testid=angle-side]'); time.sleep(1.5)
    page.screenshot(path=f'{OUT}/10b-showroom-side.png')
    page.click('[data-testid=showroom-back]'); time.sleep(0.5)
    check('Showroom BACK returns to pause', phase(page) == 'paused', phase(page))
    page.click('[data-testid=resume]'); time.sleep(0.4)

    # Off-road surface detection: teleport onto grass, check HUD
    page.evaluate("() => { const s = window.__m4.car.sim; s.reset([200, 1.2, -60], 0) }")
    time.sleep(1.5)
    surf = tel(page)['surface']
    check('Grass surface detected', surf == 'GRASS', surf)
    page.evaluate("() => { const s = window.__m4.car.sim; s.reset([0, 1.2, 170], Math.PI) }")
    time.sleep(1.5)
    surf = tel(page)['surface']
    check('Dirt surface detected', surf == 'DIRT', surf)
    page.screenshot(path=f'{OUT}/11-dirt.png')

    # Living world: realistic flora, grass, houses, ponies (park on a meadow first)
    page.evaluate("() => window.__m4.car.sim.reset([-60, 1, -200], 0)")
    time.sleep(2.5)
    world = page.evaluate("""() => {
      const sc = window.__m4.scene; let flora = 0, grass = 0, houses = 0
      sc.traverse((o) => { const key = o.material?.customProgramCacheKey?.() || ''
        if (o.isInstancedMesh && key.includes('wind')) flora += o.count
        if (o.isInstancedMesh && key.startsWith('grass')) grass += o.count
        if (o.isMesh && !o.isInstancedMesh && o.material?.normalMap && o.material.vertexColors) houses++ })
      const p = window.__m4.ponies || {}
      return { flora, grass, houses, ponies: Object.keys(p).length, flyers: Object.values(p).filter((s) => s.pos.y > 3).length }
    }""")
    check('Trees & bushes pack removed', world['flora'] == 0 and world['grass'] == 0, json.dumps(world))
    check('Textured houses built', world['houses'] >= 4)
    check('Ponies in the world', world['ponies'] >= 5, f"{world['ponies']} ponies, {world['flyers']} airborne now")
    page.evaluate("() => { const s = window.__m4.ponies.rainbow; s.pos.y = 0; s.mode = 'takeoff'; s.altitude = 20; s.timer = 5 }")
    time.sleep(4)
    fly = page.evaluate("() => { const s = window.__m4.ponies.rainbow; return [s.mode, s.pos.y] }")
    check('Pegasus takes off and flies', fly[1] > 3 and fly[0] in ('takeoff', 'fly'), f"{fly[0]} at {fly[1]:.1f} m")
    p0 = page.evaluate("() => Object.fromEntries(Object.entries(window.__m4.ponies).map(([k, s]) => [k, [s.pos.x, s.pos.z]]))")
    time.sleep(4)
    p1 = page.evaluate("() => Object.fromEntries(Object.entries(window.__m4.ponies).map(([k, s]) => [k, [s.pos.x, s.pos.z]]))")
    moved = [k for k in p0 if ((p0[k][0] - p1[k][0])**2 + (p0[k][1] - p1[k][1])**2) ** 0.5 > 0.3]
    check('Ponies move on their own', len(moved) >= 2, ', '.join(moved))
    # Drive at a grazing pony: it should run away
    page.evaluate("""() => { const s = window.__m4.ponies.pinkie; s.pos.set(-60, 0, -45); s.mode = 'graze'; s.timer = 99;
      window.__m4.car.sim.reset([-60, 1, -33], 0) }""")
    time.sleep(1.0)
    page.keyboard.down('KeyW')
    fled = False
    for _ in range(12):
        time.sleep(0.25)
        if page.evaluate("() => window.__m4.ponies.pinkie.mode") == 'flee': fled = True; break
    page.keyboard.up('KeyW')
    check('Pony runs from an approaching car', fled)

    # Quality switch remounts cleanly
    page.evaluate("() => window.__m4.store.getState().setQuality('medium')")
    time.sleep(4)
    check('Quality change keeps the game running', tel(page) is not None and phase(page) == 'playing')
    page.screenshot(path=f'{OUT}/12-medium.png')

    # fonts.googleapis.com is unreachable from the test sandbox; the UI falls back to system fonts
    real_errors = [e for e in errors if 'GPU stall' not in e and 'ERR_TUNNEL_CONNECTION_FAILED' not in e and 'ERR_NAME_NOT_RESOLVED' not in e]
    check('No console/page errors', not real_errors, '\n    '.join(real_errors[:8]))
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
