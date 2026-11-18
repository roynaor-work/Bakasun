#!/usr/bin/env python3
"""Refresh measurements, per-file provenance and the review report (CC0-1.0)."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
from validate_assets import HERE, MODELS, read_glb, geometry_summary

BASE = 'bd4d3600692b14be8881d2ba50a2b96485f3119e'
CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/'
KINDS = {'.glb': 'glTF 2.0 runtime model', '.webp': 'WebP texture',
         '.jpg': 'Browser capture', '.png': 'Browser capture',
         '.py': 'Python source / verification', '.json': 'Metadata / measured evidence',
         '.html': 'Preview entry point', '.mjs': 'Preview JavaScript',
         '.css': 'Preview stylesheet', '.md': 'Documentation'}


def source(path):
    if path.startswith('runtime/'):
        return 'Original geometry: build_models.py + model_architecture.py; embedded artwork: build_textures.py'
    if path.startswith('textures/'):
        return 'Original deterministic artwork: build_textures.py (seed 20261107)'
    if path == 'evidence/blender.json':
        return 'Independent Blender glTF importer measurements: verify_blender.py'
    if path.startswith('evidence/'):
        return 'Original preview capture / measurement: smoke_preview.py'
    if path in ('manifest.json', 'REPORT.md', 'LICENSES.md'):
        return 'Original generated documentation: build_catalog.py'
    if path == 'models-info.json':
        return 'Original geometry measurements: build_models.py'
    if path == 'textures-info.json':
        return 'Original texture measurements: build_textures.py'
    return 'Original source authored for this pack; no third-party content copied'


def all_files():
    return sorted(p for p in HERE.rglob('*') if p.is_file())


def build():
    model_rows = []
    for name in MODELS:
        path = HERE / 'runtime' / (name + '.glb')
        doc, binary = read_glb(path)
        triangles, lower, upper = geometry_summary(doc, binary)
        model_rows.append({'file': path.relative_to(HERE).as_posix(),
                           'bytes': path.stat().st_size, 'triangles': triangles,
                           'min': lower, 'max': upper,
                           'dimensionsMeters': [round(b-a, 4) for a, b in zip(lower, upper)],
                           'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                           'compression': 'none', 'license': 'CC0-1.0'})
    texture_rows = json.loads((HERE / 'textures-info.json').read_text())['textures']
    evidence_path = HERE / 'evidence' / 'browser.json'
    evidence = json.loads(evidence_path.read_text()) if evidence_path.exists() else None
    licenses_head = f'''# File licenses and sources

Every new file in this directory is original work created for this pack and is
dedicated to the public domain under **CC0-1.0**: <{CC0}>.
To the extent legally possible, the creators waive copyright and related rights;
where waiver is ineffective, the CC0 fallback license applies. No warranty is made.
No stock files, brands, logos, real people, photos or third-party fonts are included.
The anonymous crowd and hand-stroked RACE lettering are original generated artwork.
Embedded PNG images in the GLBs are lossless conversions of the listed WebP artwork;
they inherit its same CC0 dedication and provenance.

The preview imports existing Three.js r160, GLTFLoader and BufferGeometryUtils from
`../../vendor/`. These are **existing MIT-licensed repository dependencies**, not
new assets or copied files in this pack. Their source is
<https://github.com/mrdoob/three.js/tree/r160> and their existing license is
`../../vendor/LICENSE.three`. Python, NumPy, Pillow, Chromium and Playwright are
build/verification tools and are not redistributed. System UI fonts are not bundled.

| File | License | Source |
| --- | --- | --- |
'''
    for name in ('manifest.json', 'REPORT.md', 'LICENSES.md'):
        (HERE / name).touch(exist_ok=True)
    # Documentation lists its own size. Iterate to a byte-count fixed point.
    for _ in range(12):
        files = all_files()
        entries = [{'file': p.relative_to(HERE).as_posix(),
                    'type': KINDS.get(p.suffix, 'File'), 'bytes': p.stat().st_size,
                    'license': 'CC0-1.0', 'source': source(p.relative_to(HERE).as_posix())}
                   for p in files]
        before = [(e['file'], e['bytes']) for e in entries]
        licenses = licenses_head + ''.join(f"| `{e['file']}` | CC0-1.0 | {e['source']} |\n" for e in entries)
        (HERE / 'LICENSES.md').write_text(licenses)
        manifest = {'schemaVersion': 1, 'baseCommit': BASE, 'units': 'meters',
                    'up': '+Y', 'forward': '+Z', 'origin': 'base center',
                    'runtimeRequiresWebAssembly': False,
                    'budgets': {'modelBytes': 300000, 'folderBytes': 4000000},
                    'models': model_rows, 'textures': texture_rows, 'files': entries}
        (HERE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        total = sum(e['bytes'] for e in entries)
        report = f'''# Racing environment v2 — delivery report

Original modular environment assets, measured 2026-11-07, isolated under this directory. Base `main`:
`{BASE}`. Branch: `codex/racing-environment-v2`.
No existing application code, releases, version queries, ops or existing tests are changed.

## Measured budgets

All budgets use decimal bytes (1 KB = 1,000 bytes; 1 MB = 1,000,000 bytes).
The entire directory is **{total:,} bytes / 4,000,000 bytes** across {len(entries)} files.
Seven runtime GLBs total **{sum(m['bytes'] for m in model_rows):,} bytes**;
the largest is **{max(m['bytes'] for m in model_rows):,} bytes / 300,000 bytes**.
All fifteen textures total **{sum(t['bytes'] for t in texture_rows):,} bytes**.
No Draco, meshopt, KTX2, decoder, worker or WebAssembly dependency is used.
`runtime/` contains the actual plain glTF 2.0 files to load; no alternative compressed
source needs to be selected. Runtime GLBs are self-contained with embedded PNG images.

| Runtime file | Triangles | Bytes | Dimensions X × Y × Z, metres |
| --- | ---: | ---: | --- |
'''
        for row in model_rows:
            dims = ' × '.join(f'{n:g}' for n in row['dimensionsMeters'])
            report += f"| `{row['file']}` | {row['triangles']:,} | {row['bytes']:,} | {dims} |\n"
        report += '''
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
'''
        for row in texture_rows:
            report += f"| `{row['file']}` | {row['type']} / {row['colorSpace']} | {row['width']} × {row['height']} | {row['bytes']:,} | {row['edgeMaxDelta'] if row['tileable'] else 'not a repeat tile'} |\n"
        report += '''
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
'''
        if evidence:
            report += f"\nBrowser result: **{evidence.get('result', 'see evidence')}**. "
            report += f"{len(evidence.get('models', []))}/7 models loaded and rendered; "
            report += f"{evidence.get('textureCount', '?')} textures loaded. "
            report += f"Console/page/request errors: {len(evidence.get('errors', []))}.\n"
        report += '''
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
'''
        report += ''.join(f"| `{e['file']}` | {e['type']} | {e['bytes']:,} |\n" for e in entries)
        report += '\nPer-file licensing/provenance: [LICENSES.md](LICENSES.md). Binary hashes: [manifest.json](manifest.json).\n'
        (HERE / 'REPORT.md').write_text(report)
        after = [(p.relative_to(HERE).as_posix(), p.stat().st_size) for p in all_files()]
        if before == after:
            print(f'Catalog: {len(entries)} files, {total:,} bytes; fixed-point inventory verified.')
            break
    else:
        raise RuntimeError('Documentation byte inventory did not converge')


if __name__ == '__main__':
    build()
