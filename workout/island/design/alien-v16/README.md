# Alien v16 asset pack

Original game assets for ages 7+, supplied as a review package. All files are
CC0-1.0; see [LICENSES.md](LICENSES.md). No faces, text in artwork, logos, brands
or external artwork. This package contains only new files under
`workout/island/design/alien-v16/` and does not connect assets to the game.

## Sprite layout

PNG files use RGBA with a transparent background and straight (unassociated)
alpha. Frame order is left to right, starting at zero, with no gutters. The
outermost pixel of every frame is transparent. `animations.json` specifies
dimensions, paths, anchors, playback speed, loop behavior and colors.

| Asset | Individual frame | Sheet | Frames | Playback |
| --- | --- | --- | --- | --- |
| `sprites/player-laser.png` | 128 × 64 | **512 × 64** | 4 | 24 fps, flicker loop, points right (+image X) |
| `sprites/muzzle-flash.png` | **128 × 128** | 512 × 128 | 4 | 30 fps, one shot |
| `sprites/impact-spark.png` | **128 × 128** | 768 × 128 | 6 | 30 fps, one shot |
| `sprites/plasma-{type}.png` | **64 × 128** | 256 × 128 | 4 per type | 20 fps, loop, head down (+image Y), tail up |
| `icons/bonus-{type}.png` | **96 × 96** | Single icon | 1 per type | Static |
| `icons/timer-ring.png` | **96 × 96** | 1152 × 96 | 12 | Select by remaining duration; do not cycle automatically |

Exact-size individual animation frames are in `sprites/frames/` and
`icons/frames/`, so a consumer can use the requested frame dimensions directly
or crop the packed sheets. Muzzle flash and impact anchor at the center. The
laser has a white core and cyan halo. Plasma heads sit near `(32, 89)`; the
manifest's center anchor `(0.5, 0.5)` describes the entire sprite, including its
tail. Rotate sprites as needed for the caller's travel direction.

| Alien type | Plasma color |
| --- | --- |
| Scout | `#a1e5f5` |
| Heavy | `#edb865` |
| Weaver | `#c985ed` |
| Splitter | `#a5e68a` |
| Carrier | `#f58da5` |

| Bonus | Symbol | Color family |
| --- | --- | --- |
| Spread | Three diverging arrows | Orange `#f8b45a` |
| Laser | Beam and sparkle | Cyan `#67dcff` |
| Rapid | Double lightning bolt | Yellow `#f4db66` |
| Shield | Shield outline and cross | Blue `#79aaff` |
| Wing | Paired angular wings | Green `#a3e58c` |
| Nova | Eight-point energy star | Violet `#d59bff` |

Timer step 0 is full; step 11 is empty. The twelve distinct states represent
`1 - step / 11` remaining, as recorded in the manifest. Composite the ring
around a bonus icon at the same center.

## Boss models

The request specifies six variants for five stages. This pack supplies one
boss for each stage and a sixth Elite alternate for stage 5.

All models are standalone glTF 2.0 GLB files, each strictly below **150,000
bytes**, including its embedded 1024 × 1024 base-color texture. They require no
Draco, meshopt, external image, network request or glTF extension. An identical
decoded 1024 × 1024 PNG is also supplied separately in `textures/` for editing.
UVs are authored against the material atlas; PBR metal/roughness factors and
reactor emission are included in the GLB.

Coordinates match the reference `assets/alien-v13/player-ship.glb`: meters,
**+Y up, +Z forward, +X right**, identity scene-root transform and ground-plane
origin `(0, 0, 0)`. Reference envelope: 7.4 × 1.96 × 5.55 m (X/Y/Z). Bosses use
the same 7.4 m width and 5.55 m length, with different heights up to 1.96 m.
Their fore/aft envelope is centered on Z = 0 (−2.775 to +2.775); the reference's
asymmetric envelope is −2.45 to +3.1. The origin and unit scale are preserved.
Increase the instance scale in the eventual integration if a larger boss is
desired. No integration changes are included here.

Every root is `Boss_Ship`. Each model contains unique named pivots **Core**,
**Turret_L**, **Turret_R**, and additional **Muzzle_L**, **Muzzle_R** attachment
points. Core and turrets own visible geometry and rotate around local +Y.
Muzzles face local +Z. Static meshes are batched by pivot. There are no embedded
animations; consumers can animate these nodes without moving the whole hull.

| Stage | Model | Silhouette | Triangles | GLB bytes |
| --- | --- | --- | ---: | ---: |
| 1 | `models/boss-01-scout.glb` | Arrow interceptor | 1,484 | 123,124 |
| 2 | `models/boss-02-heavy.glb` | Layered armored hull | 1,688 | 137,660 |
| 3 | `models/boss-03-weaver.glb` | Swept crescent | 1,644 | 133,952 |
| 4 | `models/boss-04-splitter.glb` | Split forward booms | 1,748 | 140,696 |
| 5 | `models/boss-05-carrier.glb` | Twin hangar carrier | 1,804 | 145,808 |
| 5 alternate | `models/boss-06-carrier-elite.glb` | Crowned Elite carrier | 1,712 | 139,344 |

## Audio

All four sounds are original synthesized **Ogg Opus**, mono, 48 kHz, nominal
48 kbit/s, each strictly below **20,000 bytes**. No voice, recorded sample or
music is used. One-shot sounds have short fades and mixing headroom.

| File | Decoded duration | Decoded samples at 48 kHz |
| --- | ---: | ---: |
| `audio/laser-zap.ogg` | 0.15 s | 7,200 |
| `audio/laser-hum-loop.ogg` | 1.00 s | 48,000 |
| `audio/plasma-shot.ogg` | 0.20 s | 9,600 |
| `audio/boss-alarm.ogg` | 1.00 s | 48,000 |

The hum uses periodic oscillators and modulation with integer cycles per
second. Its compressed, decoded join is checked in FFmpeg and Chrome against
adjacent sample changes and start/end energy; there is no silent pad at the
join. For precise game playback, decode the whole buffer with Web Audio and
set `AudioBufferSourceNode.loop = true`, `loopStart = 0`, `loopEnd = 1`.
The preview also offers an ordinary audio element with looping enabled. Ogg
container timestamps include the Opus encoder pre-skip (6.5 ms); the decoded
sample lengths above are authoritative. Consumer platforms need Ogg Opus
support, which is verified here in Chromium.

## Review and reproduce

From the repository root, serve the repository and open the local preview:

```sh
python -m http.server 8765 --bind 127.0.0.1
```

[Open local preview](http://127.0.0.1:8765/workout/island/design/alien-v16/preview.html).
It uses the repository's existing local Three.js/GLTFLoader modules; it does not
modify or launch the game. Space pauses animations. Each boss has a rotate
control, the timer has a slider, and sounds have individual playback controls.

Dependencies: Python 3 with Pillow/NumPy, FFmpeg with libopus, Blender 4.3+,
Node.js, Chromium, and externally installed `playwright` and `gltf-validator`.
The scripts write only within this package. Install validation dependencies
outside the repository to avoid changing existing package files:

```sh
npm install --prefix /tmp/alien-v16-tools --cache /tmp/alien-v16-npm-cache --no-package-lock --ignore-scripts gltf-validator playwright
python workout/island/design/alien-v16/source/generate_2d_audio.py
blender --background --threads 4 --python workout/island/design/alien-v16/source/generate_bosses.py
python workout/island/design/alien-v16/source/validate_assets.py
node workout/island/design/alien-v16/source/validate_gltf.mjs
node workout/island/design/alien-v16/source/check_browser.mjs
python workout/island/design/alien-v16/source/write_readme.py
```

`check_browser.mjs` expects the local server to be running. Override
`ALIEN_V16_PREVIEW_URL`, `ALIEN_V16_CHROMIUM`,
`ALIEN_V16_PLAYWRIGHT_PACKAGE` or `ALIEN_V16_VALIDATOR_PACKAGE` for other
installations. The last two variables point to an external `package.json`.
Rebuilding preserves artwork and synthesis parameters; encoder serial numbers
and export metadata may make binary hashes differ.

## Verification evidence

- `verification/asset-results.json`: dimensions, alpha, distinct frames, exact
  sheet/frame correspondence, node hierarchy, unit scale and root origin,
  triangle counts, byte budgets, embedded/sidecar texture equality, decoded
  sound lengths, headroom and the hum join.
- `verification/gltf-results.json`: all six GLBs pass the Khronos glTF
  Validator with zero errors and zero warnings.
- `verification/browser-results.json`: all six delivered GLBs render in
  Chromium with the named nodes present; all sprites and four sounds load;
  decoded audio durations and the hum join pass; rotate and timer controls
  work; 390 px mobile layout has no horizontal overflow.
- `verification/desktop.png`, `verification/mobile.png`: preview screenshots.
- `verification/boss-*.png`: six original model detail renders.

Visual review covers the supplied artwork and preview. Physical phone testing
and game integration are outside this asset-only delivery.

## Complete file inventory

Sizes below are exact on-disk bytes, including this README. Every listed file
uses **CC0-1.0**. Rerun `source/write_readme.py` after changing any package file.

| File | Bytes | License |
| --- | ---: | --- |
| [LICENSES.md](LICENSES.md) | 2,580 | CC0-1.0 |
| [README.md](README.md) | 17,261 | CC0-1.0 |
| [animations.json](animations.json) | 5,426 | CC0-1.0 |
| [audio/boss-alarm.ogg](audio/boss-alarm.ogg) | 7,010 | CC0-1.0 |
| [audio/laser-hum-loop.ogg](audio/laser-hum-loop.ogg) | 6,311 | CC0-1.0 |
| [audio/laser-zap.ogg](audio/laser-zap.ogg) | 1,606 | CC0-1.0 |
| [audio/plasma-shot.ogg](audio/plasma-shot.ogg) | 1,593 | CC0-1.0 |
| [icons/bonus-laser.png](icons/bonus-laser.png) | 15,031 | CC0-1.0 |
| [icons/bonus-nova.png](icons/bonus-nova.png) | 16,140 | CC0-1.0 |
| [icons/bonus-rapid.png](icons/bonus-rapid.png) | 14,243 | CC0-1.0 |
| [icons/bonus-shield.png](icons/bonus-shield.png) | 15,648 | CC0-1.0 |
| [icons/bonus-spread.png](icons/bonus-spread.png) | 14,164 | CC0-1.0 |
| [icons/bonus-wing.png](icons/bonus-wing.png) | 14,593 | CC0-1.0 |
| [icons/frames/timer-ring-00.png](icons/frames/timer-ring-00.png) | 9,065 | CC0-1.0 |
| [icons/frames/timer-ring-01.png](icons/frames/timer-ring-01.png) | 8,978 | CC0-1.0 |
| [icons/frames/timer-ring-02.png](icons/frames/timer-ring-02.png) | 8,773 | CC0-1.0 |
| [icons/frames/timer-ring-03.png](icons/frames/timer-ring-03.png) | 8,642 | CC0-1.0 |
| [icons/frames/timer-ring-04.png](icons/frames/timer-ring-04.png) | 8,352 | CC0-1.0 |
| [icons/frames/timer-ring-05.png](icons/frames/timer-ring-05.png) | 8,154 | CC0-1.0 |
| [icons/frames/timer-ring-06.png](icons/frames/timer-ring-06.png) | 8,000 | CC0-1.0 |
| [icons/frames/timer-ring-07.png](icons/frames/timer-ring-07.png) | 7,715 | CC0-1.0 |
| [icons/frames/timer-ring-08.png](icons/frames/timer-ring-08.png) | 7,504 | CC0-1.0 |
| [icons/frames/timer-ring-09.png](icons/frames/timer-ring-09.png) | 7,303 | CC0-1.0 |
| [icons/frames/timer-ring-10.png](icons/frames/timer-ring-10.png) | 7,025 | CC0-1.0 |
| [icons/frames/timer-ring-11.png](icons/frames/timer-ring-11.png) | 3,946 | CC0-1.0 |
| [icons/timer-ring.png](icons/timer-ring.png) | 58,990 | CC0-1.0 |
| [models/boss-01-scout.glb](models/boss-01-scout.glb) | 123,124 | CC0-1.0 |
| [models/boss-02-heavy.glb](models/boss-02-heavy.glb) | 137,660 | CC0-1.0 |
| [models/boss-03-weaver.glb](models/boss-03-weaver.glb) | 133,952 | CC0-1.0 |
| [models/boss-04-splitter.glb](models/boss-04-splitter.glb) | 140,696 | CC0-1.0 |
| [models/boss-05-carrier.glb](models/boss-05-carrier.glb) | 145,808 | CC0-1.0 |
| [models/boss-06-carrier-elite.glb](models/boss-06-carrier-elite.glb) | 139,344 | CC0-1.0 |
| [preview.html](preview.html) | 2,555 | CC0-1.0 |
| [preview.mjs](preview.mjs) | 4,137 | CC0-1.0 |
| [source/check_browser.mjs](source/check_browser.mjs) | 3,669 | CC0-1.0 |
| [source/generate_2d_audio.py](source/generate_2d_audio.py) | 12,414 | CC0-1.0 |
| [source/generate_bosses.py](source/generate_bosses.py) | 13,319 | CC0-1.0 |
| [source/validate_assets.py](source/validate_assets.py) | 7,939 | CC0-1.0 |
| [source/validate_gltf.mjs](source/validate_gltf.mjs) | 1,122 | CC0-1.0 |
| [source/write_readme.py](source/write_readme.py) | 9,785 | CC0-1.0 |
| [sprites/frames/impact-spark-00.png](sprites/frames/impact-spark-00.png) | 5,015 | CC0-1.0 |
| [sprites/frames/impact-spark-01.png](sprites/frames/impact-spark-01.png) | 7,486 | CC0-1.0 |
| [sprites/frames/impact-spark-02.png](sprites/frames/impact-spark-02.png) | 9,740 | CC0-1.0 |
| [sprites/frames/impact-spark-03.png](sprites/frames/impact-spark-03.png) | 12,591 | CC0-1.0 |
| [sprites/frames/impact-spark-04.png](sprites/frames/impact-spark-04.png) | 14,847 | CC0-1.0 |
| [sprites/frames/impact-spark-05.png](sprites/frames/impact-spark-05.png) | 12,632 | CC0-1.0 |
| [sprites/frames/muzzle-flash-00.png](sprites/frames/muzzle-flash-00.png) | 4,373 | CC0-1.0 |
| [sprites/frames/muzzle-flash-01.png](sprites/frames/muzzle-flash-01.png) | 8,929 | CC0-1.0 |
| [sprites/frames/muzzle-flash-02.png](sprites/frames/muzzle-flash-02.png) | 6,174 | CC0-1.0 |
| [sprites/frames/muzzle-flash-03.png](sprites/frames/muzzle-flash-03.png) | 2,538 | CC0-1.0 |
| [sprites/frames/plasma-carrier-00.png](sprites/frames/plasma-carrier-00.png) | 4,994 | CC0-1.0 |
| [sprites/frames/plasma-carrier-01.png](sprites/frames/plasma-carrier-01.png) | 5,079 | CC0-1.0 |
| [sprites/frames/plasma-carrier-02.png](sprites/frames/plasma-carrier-02.png) | 5,022 | CC0-1.0 |
| [sprites/frames/plasma-carrier-03.png](sprites/frames/plasma-carrier-03.png) | 5,116 | CC0-1.0 |
| [sprites/frames/plasma-heavy-00.png](sprites/frames/plasma-heavy-00.png) | 5,000 | CC0-1.0 |
| [sprites/frames/plasma-heavy-01.png](sprites/frames/plasma-heavy-01.png) | 5,083 | CC0-1.0 |
| [sprites/frames/plasma-heavy-02.png](sprites/frames/plasma-heavy-02.png) | 5,015 | CC0-1.0 |
| [sprites/frames/plasma-heavy-03.png](sprites/frames/plasma-heavy-03.png) | 5,095 | CC0-1.0 |
| [sprites/frames/plasma-scout-00.png](sprites/frames/plasma-scout-00.png) | 5,078 | CC0-1.0 |
| [sprites/frames/plasma-scout-01.png](sprites/frames/plasma-scout-01.png) | 5,116 | CC0-1.0 |
| [sprites/frames/plasma-scout-02.png](sprites/frames/plasma-scout-02.png) | 5,041 | CC0-1.0 |
| [sprites/frames/plasma-scout-03.png](sprites/frames/plasma-scout-03.png) | 5,115 | CC0-1.0 |
| [sprites/frames/plasma-splitter-00.png](sprites/frames/plasma-splitter-00.png) | 5,012 | CC0-1.0 |
| [sprites/frames/plasma-splitter-01.png](sprites/frames/plasma-splitter-01.png) | 5,085 | CC0-1.0 |
| [sprites/frames/plasma-splitter-02.png](sprites/frames/plasma-splitter-02.png) | 5,010 | CC0-1.0 |
| [sprites/frames/plasma-splitter-03.png](sprites/frames/plasma-splitter-03.png) | 5,097 | CC0-1.0 |
| [sprites/frames/plasma-weaver-00.png](sprites/frames/plasma-weaver-00.png) | 5,057 | CC0-1.0 |
| [sprites/frames/plasma-weaver-01.png](sprites/frames/plasma-weaver-01.png) | 5,071 | CC0-1.0 |
| [sprites/frames/plasma-weaver-02.png](sprites/frames/plasma-weaver-02.png) | 5,033 | CC0-1.0 |
| [sprites/frames/plasma-weaver-03.png](sprites/frames/plasma-weaver-03.png) | 5,110 | CC0-1.0 |
| [sprites/frames/player-laser-00.png](sprites/frames/player-laser-00.png) | 3,304 | CC0-1.0 |
| [sprites/frames/player-laser-01.png](sprites/frames/player-laser-01.png) | 3,466 | CC0-1.0 |
| [sprites/frames/player-laser-02.png](sprites/frames/player-laser-02.png) | 3,183 | CC0-1.0 |
| [sprites/frames/player-laser-03.png](sprites/frames/player-laser-03.png) | 3,516 | CC0-1.0 |
| [sprites/impact-spark.png](sprites/impact-spark.png) | 62,421 | CC0-1.0 |
| [sprites/muzzle-flash.png](sprites/muzzle-flash.png) | 21,768 | CC0-1.0 |
| [sprites/plasma-carrier.png](sprites/plasma-carrier.png) | 16,214 | CC0-1.0 |
| [sprites/plasma-heavy.png](sprites/plasma-heavy.png) | 16,102 | CC0-1.0 |
| [sprites/plasma-scout.png](sprites/plasma-scout.png) | 16,378 | CC0-1.0 |
| [sprites/plasma-splitter.png](sprites/plasma-splitter.png) | 16,127 | CC0-1.0 |
| [sprites/plasma-weaver.png](sprites/plasma-weaver.png) | 16,229 | CC0-1.0 |
| [sprites/player-laser.png](sprites/player-laser.png) | 12,090 | CC0-1.0 |
| [textures/boss-01-scout-basecolor.png](textures/boss-01-scout-basecolor.png) | 9,857 | CC0-1.0 |
| [textures/boss-02-heavy-basecolor.png](textures/boss-02-heavy-basecolor.png) | 9,809 | CC0-1.0 |
| [textures/boss-03-weaver-basecolor.png](textures/boss-03-weaver-basecolor.png) | 9,838 | CC0-1.0 |
| [textures/boss-04-splitter-basecolor.png](textures/boss-04-splitter-basecolor.png) | 9,679 | CC0-1.0 |
| [textures/boss-05-carrier-basecolor.png](textures/boss-05-carrier-basecolor.png) | 9,824 | CC0-1.0 |
| [textures/boss-06-carrier-elite-basecolor.png](textures/boss-06-carrier-elite-basecolor.png) | 9,793 | CC0-1.0 |
| [verification/asset-results.json](verification/asset-results.json) | 5,146 | CC0-1.0 |
| [verification/boss-01-scout.png](verification/boss-01-scout.png) | 312,055 | CC0-1.0 |
| [verification/boss-02-heavy.png](verification/boss-02-heavy.png) | 369,407 | CC0-1.0 |
| [verification/boss-03-weaver.png](verification/boss-03-weaver.png) | 337,117 | CC0-1.0 |
| [verification/boss-04-splitter.png](verification/boss-04-splitter.png) | 345,286 | CC0-1.0 |
| [verification/boss-05-carrier.png](verification/boss-05-carrier.png) | 359,017 | CC0-1.0 |
| [verification/boss-06-carrier-elite.png](verification/boss-06-carrier-elite.png) | 368,602 | CC0-1.0 |
| [verification/browser-results.json](verification/browser-results.json) | 1,860 | CC0-1.0 |
| [verification/desktop.png](verification/desktop.png) | 260,497 | CC0-1.0 |
| [verification/gltf-results.json](verification/gltf-results.json) | 3,694 | CC0-1.0 |
| [verification/mobile.png](verification/mobile.png) | 317,790 | CC0-1.0 |
