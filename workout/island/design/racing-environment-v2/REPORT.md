# Racing environment v2 — delivery report

Original modular environment assets, measured 2026-11-07, isolated under this directory. Base `main`:
`bd4d3600692b14be8881d2ba50a2b96485f3119e`. Branch: `codex/racing-environment-v2`.
No existing application code, releases, version queries, ops or existing tests are changed.

## Measured budgets

All budgets use decimal bytes (1 KB = 1,000 bytes; 1 MB = 1,000,000 bytes).
The entire directory is **1,728,489 bytes / 4,000,000 bytes** across 46 files.
Seven runtime GLBs total **674,652 bytes**;
the largest is **146,128 bytes / 300,000 bytes**.
All fifteen textures total **304,302 bytes**.
No Draco, meshopt, KTX2, decoder, worker or WebAssembly dependency is used.
`runtime/` contains the actual plain glTF 2.0 files to load; no alternative compressed
source needs to be selected. Runtime GLBs are self-contained with embedded PNG images.

| Runtime file | Triangles | Bytes | Dimensions X × Y × Z, metres |
| --- | ---: | ---: | --- |
| `runtime/grandstand.glb` | 1,166 | 111,692 | 20 × 5.62 × 7.6 |
| `runtime/pit-building.glb` | 1,776 | 133,172 | 20.6 × 6.5625 × 7.6 |
| `runtime/start-gantry.glb` | 1,274 | 109,904 | 15.75 × 7.0764 × 1.9 |
| `runtime/control-tower.glb` | 1,252 | 97,500 | 6.4 × 9.02 × 6.4 |
| `runtime/tire-barrier.glb` | 2,040 | 146,128 | 5.8 × 0.8525 × 1 |
| `runtime/chainlink-fence.glb` | 804 | 61,888 | 6.32 × 2.7 × 0.48 |
| `runtime/sponsor-board.glb` | 110 | 14,368 | 5.12 × 2.47 × 1.2 |

Counts come from the delivered GLB index accessors (not generator estimates).
Every mesh has exactly one primitive and material. All nodes use English names.
Root transforms are identity, Y is up, each world AABB rests at Y=0 and is centered
on X/Z. The front is +Z: stand spectators, pit garage doors, gantry signal lenses,
tower windows and sponsor artwork face +Z. Fence and tire modules are symmetric.
The stand is exactly 20 metres along X. UV charts are packed uniquely per mesh;
shared triangle edges are allowed, positive-area overlaps are rejected. Independent
parts have separate UV spaces. There are no mirrored or stacked charts within a mesh.
Five separate gantry mesh nodes `Light1`–`Light5` use a red emissive material.

## Textures

All surface tiles are lossless RGB WebP at 256 × 256, below the 1024 limit.
The original crowd and RACE atlases are 512 × 256. Base colors use sRGB; the
OpenGL-style tangent-space kerb normal uses linear data, +Y green. Use repeat
wrapping and matching repeats on kerb color and normal; do not flip the green channel.
Recommended repeats in metres are in `textures-info.json` / `manifest.json`.

| Texture | Type / color space | Dimensions | Bytes | Decoded opposite-edge max delta |
| --- | --- | --- | ---: | ---: |
| `textures/asphalt-clean.webp` | baseColor / sRGB | 256 × 256 | 18,134 | 0 |
| `textures/asphalt-skid.webp` | baseColor / sRGB | 256 × 256 | 23,770 | 0 |
| `textures/asphalt-pits.webp` | baseColor / sRGB | 256 × 256 | 25,244 | 0 |
| `textures/kerb-red-white.webp` | baseColor / sRGB | 256 × 256 | 22,010 | 0 |
| `textures/kerb-normal.webp` | normal / linear | 256 × 256 | 26,880 | 0 |
| `textures/gravel-runoff.webp` | baseColor / sRGB | 256 × 256 | 21,912 | 0 |
| `textures/grass-01.webp` | baseColor / sRGB | 256 × 256 | 26,742 | 0 |
| `textures/grass-02.webp` | baseColor / sRGB | 256 × 256 | 26,542 | 0 |
| `textures/grass-03.webp` | baseColor / sRGB | 256 × 256 | 26,598 | 0 |
| `textures/concrete-barrier.webp` | baseColor / sRGB | 256 × 256 | 16,318 | 0 |
| `textures/tire-barrier.webp` | baseColor / sRGB | 256 × 256 | 14,166 | 0 |
| `textures/paint-white.webp` | baseColor / sRGB | 256 × 256 | 22,946 | 0 |
| `textures/paint-yellow.webp` | baseColor / sRGB | 256 × 256 | 22,946 | 0 |
| `textures/crowd-atlas.webp` | baseColor / sRGB | 512 × 256 | 8,676 | not a repeat tile |
| `textures/sponsor-race.webp` | baseColor / sRGB | 512 × 256 | 1,418 | not a repeat tile |

Periodic noise, wrapped features and periodic kerb rib derivatives avoid discontinuities;
decoded first/last rows and columns match exactly. Preview includes a 3 × 3 seam
inspector and lit kerb normal shading. White/yellow paint maps are opaque surface
swatches intended for thin line meshes or material masks, not transparent decals.

## Verification and review

From this directory:

```sh
PYTHONDONTWRITEBYTECODE=1 python validate_assets.py
PYTHONDONTWRITEBYTECODE=1 python smoke_preview.py
```

The Python validator reads **every file**; parses all GLBs/JSON/Python/HTML,
syntax-checks JavaScript, and fully decodes every standalone and embedded image.
It checks binary ranges, indices, finite values, nondegenerate triangles, unit normals,
UV bounds/overlaps, world origins, node names, triangle/byte budgets, emissive signal
nodes, normal-map lengths, tile seams and complete per-file license coverage.
The browser smoke uses the real repository GLTFLoader, strict CSP and an unavailable
`WebAssembly` global. It renders each model in focus mode, day/dusk, a 3 × 3 seam
view and mobile layout; captures and measured results are in `evidence/`.
Blender 4.3.2 independently imports all seven GLBs and confirms the same triangle
counts (`evidence/blender.json`). To repeat with Blender installed:

```sh
blender -b --factory-startup --python-exit-code 1 --python verify_blender.py
```

Browser result: **PASS**. 7/7 models loaded and rendered; 15 textures loaded. Console/page/request errors: 0.

Open `preview.html` through HTTP from the repository root (not file://):

```sh
python -m http.server 8765 --bind 127.0.0.1
```

Visit `http://127.0.0.1:8765/workout/island/design/racing-environment-v2/preview.html`.
Drag to orbit; wheel to zoom; model buttons isolate each asset. This is an asset
review scene; integration into the game and physical-phone performance are not measured.
The local preview uses existing repository Three.js files and requires no network/CDN.
Rebuild textures first, then models, then refresh measurements with `build_catalog.py`.
See generator docstrings for requirements. All sources are included for reproduction.

## Complete file/type/size inventory

| File | Type | Bytes |
| --- | --- | ---: |
| `LICENSES.md` | Documentation | 6,181 |
| `REPORT.md` | Documentation | 8,980 |
| `build_catalog.py` | Python source / verification | 11,118 |
| `build_models.py` | Python source / verification | 16,098 |
| `build_textures.py` | Python source / verification | 13,318 |
| `evidence/blender.json` | Metadata / measured evidence | 936 |
| `evidence/browser.json` | Metadata / measured evidence | 2,726 |
| `evidence/gantry-dusk.jpg` | Browser capture | 89,124 |
| `evidence/grandstand.jpg` | Browser capture | 123,133 |
| `evidence/mobile.jpg` | Browser capture | 40,934 |
| `evidence/overview.jpg` | Browser capture | 88,657 |
| `evidence/pit-building.jpg` | Browser capture | 93,843 |
| `evidence/seams.jpg` | Browser capture | 54,624 |
| `evidence/start-gantry.jpg` | Browser capture | 96,642 |
| `manifest.json` | Metadata / measured evidence | 23,481 |
| `model_architecture.py` | Python source / verification | 8,160 |
| `models-info.json` | Metadata / measured evidence | 7,450 |
| `preview.css` | Preview stylesheet | 7,932 |
| `preview.html` | Preview entry point | 4,353 |
| `preview.mjs` | Preview JavaScript | 19,497 |
| `runtime/chainlink-fence.glb` | glTF 2.0 runtime model | 61,888 |
| `runtime/control-tower.glb` | glTF 2.0 runtime model | 97,500 |
| `runtime/grandstand.glb` | glTF 2.0 runtime model | 111,692 |
| `runtime/pit-building.glb` | glTF 2.0 runtime model | 133,172 |
| `runtime/sponsor-board.glb` | glTF 2.0 runtime model | 14,368 |
| `runtime/start-gantry.glb` | glTF 2.0 runtime model | 109,904 |
| `runtime/tire-barrier.glb` | glTF 2.0 runtime model | 146,128 |
| `smoke_preview.py` | Python source / verification | 8,323 |
| `textures/asphalt-clean.webp` | WebP texture | 18,134 |
| `textures/asphalt-pits.webp` | WebP texture | 25,244 |
| `textures/asphalt-skid.webp` | WebP texture | 23,770 |
| `textures/concrete-barrier.webp` | WebP texture | 16,318 |
| `textures/crowd-atlas.webp` | WebP texture | 8,676 |
| `textures/grass-01.webp` | WebP texture | 26,742 |
| `textures/grass-02.webp` | WebP texture | 26,542 |
| `textures/grass-03.webp` | WebP texture | 26,598 |
| `textures/gravel-runoff.webp` | WebP texture | 21,912 |
| `textures/kerb-normal.webp` | WebP texture | 26,880 |
| `textures/kerb-red-white.webp` | WebP texture | 22,010 |
| `textures/paint-white.webp` | WebP texture | 22,946 |
| `textures/paint-yellow.webp` | WebP texture | 22,946 |
| `textures/sponsor-race.webp` | WebP texture | 1,418 |
| `textures/tire-barrier.webp` | WebP texture | 14,166 |
| `textures-info.json` | Metadata / measured evidence | 9,618 |
| `validate_assets.py` | Python source / verification | 13,158 |
| `verify_blender.py` | Python source / verification | 1,249 |

Per-file licensing/provenance: [LICENSES.md](LICENSES.md). Binary hashes: [manifest.json](manifest.json).
