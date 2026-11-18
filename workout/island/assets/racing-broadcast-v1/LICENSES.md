# Sources and licenses

All paths below are relative to this directory. All newly added files are original work made for this task on 2026-11-12. No external asset downloads or real brands were used.

## CC0 dedication

SPDX-License-Identifier: **CC0-1.0**.

To the extent copyright or related rights exist in the original material in this package, those rights are dedicated to the public domain under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). You may copy, modify, distribute, and use the material, including commercially, without asking permission. No warranty is provided. This dedication does not assert exclusive copyright over AI-generated imagery or grant rights in any unrelated third-party work.

## File-by-file provenance

| File | Source / method | License |
|---|---|---|
| `assets/start-gantry.glb` | Original model from `source/build-gantry.py`; authored truss, panel, housings, and five emissive lenses. Blender glTF export; no imported mesh or texture. | CC0-1.0 |
| `assets/leaderboard-strip.svg` | Original hand-authored vector surface, repeated diagonal detail and edge separators. SVG is its own editable source. | CC0-1.0 |
| `assets/card-frame.svg` | Original hand-authored 48×48 vector frame, designed for 12px 9-slicing. SVG is its own editable source. | CC0-1.0 |
| `assets/podium.webp` | Original AI-generated image, OpenAI image_gen; no reference input. Exact prompt and conversion recorded in `source/art-direction.md`. | Original generated artwork; CC0-1.0 to the extent rights exist |
| `teams/flame.svg` | Original shield and flame paths; requested team name להבה. | CC0-1.0 |
| `teams/wave.svg` | Original shield and curling wave paths; requested team name גל. | CC0-1.0 |
| `teams/sun.svg` | Original shield, sun disc and rays; requested team name שמש. | CC0-1.0 |
| `teams/sea.svg` | Original shield, sailboat and sea paths; requested team name ים. | CC0-1.0 |
| `teams/silver.svg` | Original shield and faceted diamond paths; requested team name כסף. | CC0-1.0 |
| `teams/sunset.svg` | Original shield, setting sun and horizon paths; requested team name שקיעה. | CC0-1.0 |
| `teams/forest.svg` | Original shield and pine silhouette; requested team name יער. | CC0-1.0 |
| `teams/purple.svg` | Original shield and four-point star paths; requested team name סגול. | CC0-1.0 |
| `teams/sand.svg` | Original shield, dunes and sun paths; requested team name חול. | CC0-1.0 |
| `teams/rock.svg` | Original shield and faceted rock paths; requested team name סלע. | CC0-1.0 |
| `teams/night.svg` | Original shield, crescent and stars; requested team name לילה. | CC0-1.0 |
| `teams/cloud.svg` | Original shield and cloud paths; requested team name ענן. | CC0-1.0 |
| `source/build-gantry.py` | Original Blender construction and export code, authored for this package. | CC0-1.0 |
| `source/art-direction.md` | Original art direction, generation prompt and conversion notes. | CC0-1.0 |
| `index.html` | Original standalone asset preview and explanatory HTML. | CC0-1.0 |
| `preview.css` | Original layout and demonstration styles. | CC0-1.0 |
| `preview.mjs` | Original model loader, lamp controls, asset preview and inspection handle. Uses the existing engine listed below. | CC0-1.0 |
| `manifest.json` | Original asset inventory, placement contract and approved name-based team palette. Source of palette entries documented in `README.md`. | CC0-1.0 |
| `preview-844x390.png` | Chromium screenshot of the original preview and artwork in this directory. Text is live HTML captured for review, not text baked into runtime image assets. | CC0-1.0 to the extent rights exist |
| `README.md` | Original usage, mapping and integration documentation. | CC0-1.0 |
| `REPORT.md` | Original measured file inventory, geometry counts and verification report. | CC0-1.0 |
| `LICENSES.md` | This original provenance record and dedication. | CC0-1.0 |

## Existing dependencies, reused without copying or modifying

The preview imports `../../vendor/three.module.js` and `../../vendor/GLTFLoader.js`; the loader imports the existing `../../vendor/BufferGeometryUtils.js`. They are Three.js r160 by the Three.js authors, under the [MIT license](https://github.com/mrdoob/three.js/blob/r160/LICENSE). Their notices remain in the existing repository files. These libraries are not part of the new CC0 artwork and their MIT license remains applicable. No new third-party library is bundled with this package.

Blender, Pillow, Playwright, Chromium, and Khronos glTF Validator were used as production or verification tools; their executable code is not redistributed here.
