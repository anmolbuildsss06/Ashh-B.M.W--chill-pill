# M4 Horizon — Stage 1

A browser open-world driving game (React · Vite · Three.js · React Three Fiber · Drei · Rapier · Zustand · Tailwind).
Stage 1 delivers a fully drivable BMW M4 Competition on the **M Proving Ground**, a test world with an oval circuit, handling pad, skidpad, dirt bowl, ramps, cones, buildings and trees.

## Run it

```bash
npm install
npm run dev          # open http://localhost:5173
npm run build        # production build in dist/
npm run test:physics # headless driving tests (Node + Rapier)
```

The browser end-to-end test needs Python Playwright and a running dev server: `python3 scripts/browser_test.py`.

## Play on your phone

Run `npm run dev` on your computer. Then, on your phone (on the same Wi-Fi), open the **Network** address Vite prints, e.g. `http://192.168.1.20:5173`.
Turn the phone sideways and tap the fullscreen button.

- **Left thumb:** slide left/right anywhere on the left side to steer (analog).
- **Right thumb:** GAS, BRAKE (hold at a stop to reverse), E-BRAKE (drift) and NITRO. You can hold several at once.
- **Top left:** pause, camera, reset and fullscreen.
- **Settings → Touch / Phone:** switch steering between *slide pad*, *◂ ▸ buttons* and *tilt* (hold the phone like a steering wheel), or turn the touch controls on or off.

Phones start on Low graphics at 80% resolution.

## Camera angles and View Car

- **While driving:** `C` cycles the cameras, or press `1`–`6` for chase, close, hood, cockpit, cinematic and free look. On desktop you can also click the chips under the car name. In **free look**, drag to orbit and scroll or pinch to zoom.
- **VIEW CAR** (main menu or pause): a showroom with Front ¾, Rear ¾, Side, Front, Rear, Top, Wheel and Interior presets. Drag to orbit, pinch or scroll to zoom, and change the paint live.

## Controls

| Key | Action |
|---|---|
| W / ↑ | Throttle |
| S / ↓ | Brake; hold at a standstill to engage reverse |
| A D / ← → | Steer |
| Space | Handbrake (drift) |
| Shift | Nitro |
| C | Cycle camera: chase, close, hood, cockpit, cinematic, free look |
| 1 – 6 | Pick a camera directly |
| R | Reset the car upright |
| T | Traction control on/off |
| M | Manual gearbox (Q / E to shift) |
| F | FPS counter |
| B | Music on/off |
| Esc | Pause menu |

Gamepad (standard mapping): RT/LT pedals, left stick to steer, A handbrake, X nitro, RB/LB shift, Y camera.

## What's in Stage 1

- **Driving physics** (`src/vehicle/VehicleSim.js`): Rapier raycast-vehicle suspension, plus an S58 torque curve, 8-speed auto/manual gearbox, RWD, traction control, ABS, speed-sensitive steering, stability assist, handbrake drifts, aero drag, downforce, nitro, and per-wheel surface grip (asphalt, kerb, grass, dirt).
- **Measured** (`npm run test:physics`): 0–100 km/h in 3.65 s, limited top speed of about 290 km/h, 100–0 km/h braking in 41 m, 1.15 g cornering, stable handbrake slides.
- **Procedural M4 G82**: real dimensions, kidney grille, LED DRLs, brake lights that respond to braking, quad exhaust, carbon roof, M wheels with blue calipers, steering-linked front wheels, a rotating steering wheel, and a cockpit interior.
- **Cameras**: blended transitions, speed-based FOV, subtle high-speed and off-road shake.
- **Effects**: tyre smoke, dust off-road, skid marks.
- **UI**: cinematic intro, main menu, garage (7 paints), settings (Low/Medium/High quality, render resolution, assists, camera, FPS), controls page, pause menu, and a HUD with tachometer, speed, gear, nitro, assist lights and surface.
- **Performance**: quality presets, adaptive resolution (drops when FPS falls), instanced trees, and a car-following shadow frustum.

## Architecture

```
src/config/cars.js        Car data (add new cars here; modelUrl hook for a licensed GLB)
src/vehicle/VehicleSim.js Framework-free sim, shared by the game and the Node tests
src/vehicle/Car.jsx       Rapier body, sim wiring, wheel visuals, telemetry
src/vehicle/M4Model.jsx   Procedural body, wheels, interior
src/camera/CameraRig.jsx  All camera modes and the menu showcase
src/world/surfaces.js     World layout and surfaceAt(x, z), used by both physics and the ground texture
src/world/Ponies.jsx      Pony rigs, procedural gaits, wander/fly/flee AI
src/world/Village.jsx     Procedural realistic houses (houseTextures.js = brick/render/siding/roof/paving)
src/world/*.jsx           Ground, props, atmosphere
src/store/useGame.js      Zustand: phase, settings, telemetry
src/input/controls.js     Keyboard and gamepad
```

## Credits

| Asset | Author / source | Licence |
|---|---|---|
| BMW M4 (F82) | Blend Swap #81957 | CC-BY 3.0, fan art (non-commercial) |
| MirceaKitsune's Gmod ponies | **MirceaKitsune**, Blend Swap #62439 | CC-BY 3.0, fan art (non-commercial) |

The licence files are in `public/models/*/`. Credits are also shown in game under **Main menu → Credits**.
My Little Pony characters belong to Hasbro, and BMW and M4 are trademarks of BMW AG. This is a non-commercial fan project.

## Car model credit

The BMW M4 (F82) 3D model is **Blend Swap #81957, "BMW M4"**. It is licensed under [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) and marked as **fan art (non-commercial use only)**. The full license is in `public/models/`.
It was converted from `.blend` to glTF with Blender's Python module. In the process the hidden lattice and ground were removed, subdivision was reduced to level 1, and the geometry was welded and quantized with gltf-transform. Materials are re-created in game by part name.
BMW and M4 are trademarks of BMW AG. This is a non-commercial fan project, not affiliated with BMW.

## Sound and music

All the audio is synthesised live in the browser (Web Audio), so there are no copyrighted recordings:
- **Engine:** modelled on the M4's S58 3.0 L twin-turbo straight-six. An inline-6 fires three times per revolution, so the pitch is rpm ÷ 60 × 3 (45 Hz at idle up to 360 Hz at the redline). A six-cylinder harmonic profile is layered with exhaust burble and an M-style rasp under load.
- **Effects:** starter crank, turbo whistle and spool, blow-off valve on lift, exhaust crackles and pops on overrun, upshift bark, gear clunk, rev-limiter bounce, nitro, tyre squeal (drift, burnout, ABS), gravel rumble off-road, road noise and wind.
- **Music:** an original synthwave track generated in code. Press **B** or use Settings → Audio to turn it on or off; the volume sliders cover master, engine and effects, and music. To use your own track, put it at `public/audio/bgm.mp3` and it will loop instead.

## Living world

- **Ponies** come from *MirceaKitsune's Gmod ponies*. The walking, trotting, galloping, grazing, take-off, wing-flapping and gliding are all procedural, because the rigs ship without animations. On load, each rig works out by itself which bone axes move its legs and wings. Rainbow Dash, Fluttershy and Derpy fly loops over the map and land to graze. The others wander their home areas and scatter when you drive at them. Low shows 5 ponies, Medium 8 and High 10.
- **Houses** have brick, render and weatherboard walls with normal maps, tiled roofs with overhangs, fascias and gutters, framed sash windows, panelled doors under porch canopies, chimneys, garages with driveways, paths, and hedges or picket fences. All the textures are generated in code, and the whole village takes about 12 draw calls.

The car and pony `.blend` files were converted with the scripts in `scripts/asset-pipeline/` (Blender's Python module plus gltf-transform).

## World additions

- **Roadside banners:** three banners reading "Ashh loves / B Means B.M.W!", by the spawn pad, on the circuit's main straight and at the village entrance.
- **Village:** houses with gabled roofs, chimneys, doors, windows and garden fences along a street west of the circuit. They are drawn as a single merged mesh, and each house is solid.

## Next: Stage 2

Replace the proving ground with streamed open-world terrain (heightfield chunks) and a connected spline road network, keeping `surfaceAt()` as the single source of truth for grip.
#   A s h h B m w M 4  
 