"""Phone test: landscape phone emulation, real multi-touch via CDP (gas + steer held together).
Usage: python3 scripts/mobile_test.py [outdir]   (dev server on :5173)
"""
import os, sys, time, json
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else 'test-shots-mobile'
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

def center(page, testid):
    b = page.locator(f'[data-testid={testid}]').bounding_box()
    return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2

class Touch:
    """Multi-touch through the Chrome DevTools Protocol."""
    def __init__(self, cdp): self.cdp, self.points = cdp, {}
    def _send(self, kind):
        pts = [{'x': x, 'y': y, 'id': i, 'radiusX': 8, 'radiusY': 8, 'force': 1} for i, (x, y) in self.points.items()]
        self.cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': pts})
    def down(self, i, x, y): self.points[i] = (x, y); self._send('touchStart')
    def move(self, i, x, y): self.points[i] = (x, y); self._send('touchMove')
    def up(self, i):
        # lift exactly one finger: touchEnd listing only that finger (others stay down)
        x, y = self.points.pop(i)
        self.cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': [{'x': x, 'y': y, 'id': i}]})
    def tap(self, x, y, i=9): self.down(i, x, y); time.sleep(0.08); self.up(i)

def tel(page):
    return page.evaluate("""() => { const s = window.__m4.car.sim; const p = s.body.translation(); const q = s.body.rotation(); const t = s.telemetry;
      return { x: p.x, z: p.z, yaw: Math.atan2(2*(q.w*q.y + q.x*q.z), 1 - 2*(q.y*q.y + q.x*q.x)), kmh: t.speedKmh, fwd: t.forwardSpeed,
               gear: t.gearLabel, slip: t.slipAngle, nitro: t.nitro, steer: window.__m4.touch.steer } }""")

phase = lambda page: page.evaluate("() => window.__m4.store.getState().phase")

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True,
        args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = browser.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, is_mobile=True, has_touch=True,
        user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)
    page.add_init_script("localStorage.removeItem('m4h-settings')")
    page.goto(URL)
    page.wait_for_function("() => window.__m4?.car?.sim", timeout=90000)
    t = Touch(ctx.new_cdp_session(page))

    st = page.evaluate("() => { const s = window.__m4.store.getState(); return { isTouch: s.isTouch, touchControls: s.touchControls, quality: s.quality } }")
    check('Phone detected → touch controls on, starts on High', st['isTouch'] and st['touchControls'] and st['quality'] == 'high', json.dumps(st))

    time.sleep(1.0)
    t.tap(420, 200)  # tap skips intro
    time.sleep(1.2)
    check('Tap skips intro', phase(page) == 'menu', phase(page))
    page.screenshot(path=f'{OUT}/m01-menu.png')

    x, y = center(page, 'start-game'); t.tap(x, y); time.sleep(1.5)
    check('Tap START GAME', phase(page) == 'playing', phase(page))
    check('Touch controls visible', page.locator('[data-testid=touch-controls]').is_visible())
    page.screenshot(path=f'{OUT}/m02-driving-ui.png')

    # Hold GAS (finger 1) — on the open skidpad so the full-lock turn can't run into scenery
    page.evaluate("() => window.__m4.car.sim.reset([-38, 1, -125], -Math.PI / 2)"); time.sleep(1.0)
    t0 = tel(page)
    gx, gy = center(page, 'touch-gas')
    t.down(1, gx, gy); time.sleep(3.5)
    t1 = tel(page)
    check('Hold GAS accelerates', t1['kmh'] > 35, f"{t1['kmh']:.0f} km/h, gear {t1['gear']}")

    # While still holding GAS, slide the steering pad right (finger 2) — true multi-touch
    yaw0 = t1['yaw']
    t.down(2, 150, 260); time.sleep(0.1)
    for k in range(1, 8): t.move(2, 150 + k * 10, 260); time.sleep(0.03)
    time.sleep(0.4)
    steer_val = tel(page)['steer']
    page.screenshot(path=f'{OUT}/m03-gas-and-steer.png')
    time.sleep(0.9)
    t2 = tel(page)
    check('Slide pad gives analog steer while gas held', steer_val > 0.6 and t2['kmh'] > 30, f"steer {steer_val:.2f}, {t2['kmh']:.0f} km/h")
    check('Steering right turns the car right', dyaw(yaw0, t2['yaw']) < -0.15, f"yaw {yaw0:.2f} → {t2['yaw']:.2f}")
    t.up(2); time.sleep(0.2)
    check('Releasing steer pad centres steering', abs(tel(page)['steer']) < 1e-6)

    # Handbrake with third finger while steering → slide
    hx, hy = center(page, 'touch-handbrake')
    t.down(2, 150, 260); t.move(2, 90, 260)
    t.down(3, hx, hy); time.sleep(0.6); t.up(3)
    ms = 0
    for _ in range(6): time.sleep(0.1); ms = max(ms, abs(tel(page)['slip']))
    page.screenshot(path=f'{OUT}/m04-handbrake.png')
    t.up(2)
    check('E-BRAKE + steer slides the car', ms > 0.2, f"max slip {ms*57.3:.0f}°")

    # Nitro (gas still held on finger 1) — from a clean start on open road
    t.up(1)
    page.evaluate("() => window.__m4.car.sim.reset([-40, 1, 0], -Math.PI / 2)"); time.sleep(1.0)
    t.down(1, gx, gy); time.sleep(1.0)
    nx, ny = center(page, 'touch-nitro')
    n0 = tel(page)['nitro']; t.down(4, nx, ny); time.sleep(1.2); t.up(4)
    check('NITRO burns boost', tel(page)['nitro'] < n0 - 0.1, f"{n0:.2f} → {tel(page)['nitro']:.2f}")
    t.up(1)

    # Brake then reverse
    page.evaluate("() => window.__m4.car.sim.reset([-40, 1, 0], -Math.PI / 2)"); time.sleep(1.0)
    bx, by = center(page, 'touch-brake')
    t.down(5, bx, by); time.sleep(5.5)
    r = tel(page); t.up(5)
    check('Hold BRAKE stops then reverses', r['gear'] == 'R' and r['fwd'] < -0.5, f"gear {r['gear']} v {r['fwd']:.1f} m/s")

    # System buttons
    cam0 = page.evaluate("() => window.__m4.store.getState().cameraMode")
    t.tap(*center(page, 'touch-camera')); time.sleep(0.6)
    check('Camera button', page.evaluate("() => window.__m4.store.getState().cameraMode") == (cam0 + 1) % 5)
    t.tap(*center(page, 'touch-reset')); time.sleep(0.6)
    check('Reset button', page.evaluate("() => window.__m4.store.getState().resetToken") > 0)
    t.tap(*center(page, 'touch-pause')); time.sleep(0.6)
    check('Pause button', phase(page) == 'paused', phase(page))
    page.screenshot(path=f'{OUT}/m05-pause.png')
    t.tap(*center(page, 'pause-settings')); time.sleep(0.6)
    page.locator('[data-testid=touch-steer-buttons]').scroll_into_view_if_needed()
    t.tap(*center(page, 'touch-steer-buttons')); time.sleep(0.3)
    page.screenshot(path=f'{OUT}/m06-settings.png')
    check('Switch to button steering in settings', page.evaluate("() => window.__m4.store.getState().touchSteer") == 'buttons')
    page.locator('[data-testid=back]').scroll_into_view_if_needed(); time.sleep(0.2)
    t.tap(*center(page, 'back')); time.sleep(0.3)
    t.tap(*center(page, 'resume')); time.sleep(0.8)
    check('Resume via tap', phase(page) == 'playing')

    # Button steering: hold ◂ with gas (start from open road so earlier steps can't leave us parked against a tree)
    page.evaluate("() => window.__m4.car.sim.reset([-40, 1, 0], -Math.PI / 2)"); time.sleep(1.0)
    t.down(1, *center(page, 'touch-gas')); time.sleep(2.0)
    yaw0 = tel(page)['yaw']
    t.down(2, *center(page, 'steer-left')); time.sleep(1.0)
    t3 = tel(page); t.up(2); t.up(1)
    check('◂ button steers left', dyaw(yaw0, t3['yaw']) > 0.1, f"yaw {yaw0:.2f} → {t3['yaw']:.2f}")
    page.screenshot(path=f'{OUT}/m07-buttons.png')

    # Portrait warning
    page.set_viewport_size({'width': 390, 'height': 844}); time.sleep(0.8)
    check('Portrait shows rotate prompt', page.get_by_text('ROTATE YOUR PHONE').is_visible())
    page.screenshot(path=f'{OUT}/m08-portrait.png')
    page.set_viewport_size({'width': 844, 'height': 390}); time.sleep(0.5)

    check('No page errors', not errors, '\n    '.join(errors[:6]))
    browser.close()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
