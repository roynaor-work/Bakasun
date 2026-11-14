"""CC0-1.0. Write documentation and an exact, self-inclusive file inventory.

Run after generation and verification; rerun whenever any package file changes.
"""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]

INTRO='''# Alien v16 asset pack

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
'''

TAIL='''
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
'''


def main():
    result=json.loads((ROOT/'verification/asset-results.json').read_text())
    descriptions=['Arrow interceptor','Layered armored hull','Swept crescent',
                  'Split forward booms','Twin hangar carrier','Crowned Elite carrier']
    models=''
    for i,m in enumerate(result['models']):
        name=Path(m['file']).name
        models+=f"| {min(i+1,5)}{' alternate' if i==5 else ''} | `models/{name}` | {descriptions[i]} | {m['triangles']:,} | {m['bytes']:,} |\n"
    readme=ROOT/'README.md'
    if not readme.exists():readme.write_text('')
    files=sorted(p for p in ROOT.rglob('*') if p.is_file())
    size=0
    for _ in range(10):
        rows=''
        for p in files:
            rel=p.relative_to(ROOT).as_posix()
            n=size if p==readme else p.stat().st_size
            rows+=f'| [{rel}]({rel}) | {n:,} | CC0-1.0 |\n'
        out=INTRO+models+TAIL+rows
        actual=len(out.encode())
        if actual==size:break
        size=actual
    else:raise RuntimeError('README inventory size did not converge')
    readme.write_text(out)
    assert readme.stat().st_size==size
    print(f'Wrote README with {len(files)} individually listed files; {size:,} bytes.')


if __name__=='__main__':main()
