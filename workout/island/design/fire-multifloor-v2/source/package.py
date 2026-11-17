#!/usr/bin/env python3
"""Assemble the manifest from authored metadata and final file bytes (stdlib only)."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
read = lambda name: json.loads((ROOT / 'source' / name).read_text())
truck, building, tools = read('truck.json'), read('building.json'), read('equipment.json')

def record(asset_id, path, kind, **extra):
    data = (ROOT / path).read_bytes()
    return dict(id=asset_id, path=path, kind=kind, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), **extra)

assets = [record('fire-truck', truck['file'], 'vehicle', triangles=truck['triangles'], clips=truck['clips'], attachments=truck['attachments'])]
for floor in building['floors']:
    assets.append(record(floor['id'], floor['file'], 'interior-floor', triangles=floor['totalTriangles'], visibleTriangles=floor['visibleTriangles']))
shell_path = 'models/building-shell.glb'
assets.append(record('building-shell', shell_path, 'architecture', triangles=building['shell']['totalTriangles'], visibleTriangles=building['shell']['visibleTriangles']))
for tool in tools['assets']:
    assets.append(record(tool['id'], tool['path'], 'equipment', triangles=tool['triangles'], clips=tool['animations'], attachments=tool['attachments'], dimensionsMeters=tool['dimensionsMeters']))
    assets.append(record(tool['id'] + '-icon', f"icons/{tool['id']}.svg", 'icon'))
for name in ['powder', 'foam', 'water', 'blanket']:
    effect = json.loads((ROOT / f'effects/{name}.json').read_text())
    assets.append(record(name + '-fx', f'effects/{name}.png', 'sprite-sheet', frameCount=8, frameSize=[effect['frameWidth'], effect['frameHeight']], columns=8, rows=1, fps=effect['fps'], metadata=f'effects/{name}.json'))
for name, fps in [('fire', 12), ('smoke', 8)]:
    assets.append(record(name + '-fx', f'effects/{name}.png', 'sprite-sheet', frameCount=8, frameSize=[128, 128], columns=8, rows=1, fps=fps, metadata='effects/atmosphere.json'))

manifest = dict(
    schemaVersion=2, id='fire-multifloor-v2', license='CC0-1.0', units='metres', up='+Y', front='+Z',
    preview=dict(file='preview.html', viewport=[844, 390], dependencies=['../../vendor/three.module.js', '../../vendor/GLTFLoader.js', '../../vendor/BufferGeometryUtils.js'], network='same-origin only'),
    limits=dict(packageBytes=8_000_000, buildingBytes=3_000_000, truckTriangles=[2500,3500]),
    assets=assets,
    truck=truck,
    building=building,
    equipment=dict(assets=tools['assets'], effectByTool={'extinguisher-powder':'powder-fx','extinguisher-foam':'foam-fx','wall-hose':'water-fx','hydrant':'water-fx','fire-blanket':'blanket-fx'}),
    stateContract=dict(parent='burn_<id>', intact='intact_<id>', burnt='burnt_<id>', fire='fire_<id>', default='intact', burntStoredScale=[0,0,0], activeScale=[1,1,1], states={'intact':'intact visible; burnt hidden; fire FX disabled', 'burning':'intact visible; burnt hidden; fire FX at fire_<id>; smoke fills ceiling', 'burnt':'intact hidden; burnt visible; fire FX disabled; smoke may linger'}, adapter='runtime.mjs'),
    runtimeNotes=['No model fallback or second truck. Load fire-truck.glb before showing it.', 'GLBs embed all data and use no required extensions or decoder.', 'Run named clips via the host animation mixer; one-shot clips clamp at the endpoint.', 'Building-floor-N is local to floor; position at y=(N-1)*3.2.', 'Hide cutaway_front_* and cutaway_ceiling_* only in inspection view. Keep for a closed gameplay interior.', 'Smoke/particles and animation orchestration live in preview.mjs and runtime.mjs; GLB contains stable anchors, not a game simulation.'],
    totals=dict(assetBytes=sum(a['bytes'] for a in assets), buildingGLBBytes=sum(a['bytes'] for a in assets if a['kind'] in ['interior-floor','architecture']))
)
(ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(manifest['totals']))
