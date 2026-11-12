# Licenses and provenance

SPDX-License-Identifier: CC0-1.0

All files in this directory, including subdirectories, are original work created
for this repository at the user's request. To the extent copyright and related
rights apply, this work is dedicated to the public domain under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
The [full legal text](https://creativecommons.org/publicdomain/zero/1.0/legalcode)
controls. Copying, modification, redistribution and commercial use are permitted
without attribution. The work is supplied without warranty.

| Files | Original source | License |
| --- | --- | --- |
| `sprites/**/*.png`, `icons/**/*.png`, `animations.json` | Supersampled original drawing, glow compositing and animation in `source/generate_2d_audio.py` | CC0-1.0 |
| `textures/*.png` | Original panel and material atlas drawing in `source/generate_2d_audio.py` | CC0-1.0 |
| `models/*.glb` | Original modeled hulls, armor, reactors and turrets in `source/generate_bosses.py`; texture embedded from this package | CC0-1.0 |
| `audio/*.ogg` | Original mathematical synthesis in `source/generate_2d_audio.py`, encoded as Ogg Opus | CC0-1.0 |
| `verification/boss-*.png` | Original renders of the delivered models, using `source/generate_bosses.py` | CC0-1.0 |
| `verification/desktop.png`, `verification/mobile.png` | Original screenshots of this package's preview and assets | CC0-1.0 |
| `verification/*.json` | Measurements from the original validation wrappers in `source/` | CC0-1.0 |
| `source/*`, `preview.html`, `preview.mjs`, `README.md`, `LICENSES.md` | Original generation, validation, review code and documentation | CC0-1.0 |

No stock assets, downloaded models, recorded voices, fonts, logos, faces or
third-party artwork are included. The existing
`workout/island/assets/alien-v13/player-ship.glb` was inspected only to measure its
units, axes, bounding envelope and origin; no geometry or texture was copied.

The preview imports the repository's existing Three.js and GLTFLoader modules
from `../../vendor/`, licensed under MIT; their existing notice is at
[`../../vendor/LICENSE.three`](../../vendor/LICENSE.three). These libraries are
referenced, not copied into this directory. The browser uses installed system
fonts. Blender, Python, Pillow, NumPy, FFmpeg, Chromium, Playwright and the Khronos
glTF Validator are external creation or validation tools, not redistributed
assets; the CC0 dedication does not replace their software licenses.

The README contains the complete per-file inventory, byte sizes and licenses.
