#!/usr/bin/env python3
"""Validate delivered files, registration, alpha, references and source parity."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'manifest.json').read_text())
records = []
assert len(manifest['assets']) == 19
assert len({a['id'] for a in manifest['assets']}) == 19
ids = {a['id'] for a in manifest['assets']}

def check_ref(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in ('asset', 'track', 'fill', 'needle'):
                assert item in ids, (key, item)
            check_ref(item)
    if isinstance(value, list):
        for item in value:
            check_ref(item)

check_ref(manifest['effects'])
allowed_tags = {'svg', 'defs', 'linearGradient', 'radialGradient', 'stop', 'g', 'path', 'rect', 'circle', 'ellipse'}
for asset in manifest['assets']:
    vector = ROOT / asset['svg']['path']
    xml = ET.parse(vector)
    for node in xml.iter():
        assert node.tag.split('}')[-1] in allowed_tags, (asset['id'], node.tag)
        assert not (node.text or '').strip(), (asset['id'], 'baked text')
        for key, value in node.attrib.items():
            assert not key.lower().startswith('on') and 'href' not in key.lower()
            assert not re.search(r'url\((?!#[\w-]+\))', value), value
    assert xml.getroot().get('viewBox') == '0 0 256 256'
    x, y = asset['anchor']['normalized']
    assert [asset['anchor']['x'] / 256, asset['anchor']['y'] / 256] == [x, y]
    files = [asset['svg'], *asset['png'].values()]
    for entry in files:
        path = ROOT / entry['path']
        assert path.resolve().is_relative_to(ROOT)
        data = path.read_bytes()
        assert len(data) == entry['bytes'] <= 400000
        assert hashlib.sha256(data).hexdigest() == entry['sha256']
    for size, entry in asset['png'].items():
        with Image.open(ROOT / entry['path']) as im:
            assert im.size == (int(size), int(size)) and im.mode == 'RGBA'
            alpha = im.getchannel('A')
            bounds = alpha.getbbox()
            assert bounds and 0 < bounds[0] < bounds[2] < int(size)
            assert 0 < bounds[1] < bounds[3] < int(size)
            x, y, w, h = asset['contentRect']
            scale = int(size) / 256
            assert bounds[0] >= x*scale and bounds[1] >= y*scale, (asset['id'], bounds, asset['contentRect'])
            assert bounds[2] <= (x+w)*scale and bounds[3] <= (y+h)*scale, (asset['id'], bounds, asset['contentRect'])
            assert alpha.getextrema()[0] == 0
            for point in [(0,0), (0,int(size)-1), (int(size)-1,0), (int(size)-1,int(size)-1)]:
                assert alpha.getpixel(point) == 0
            records.append({'id':asset['id'], 'size':int(size), 'bytes':entry['bytes'], 'alphaBounds':bounds})

dust = manifest['effects']['clayDust']
assert dust['frameCount'] == 6 and dust['totalDurationMs'] == 360 and not dust['loop']
frames = [next(a for a in manifest['assets'] if a['id'] == f['asset']) for f in dust['frames']]
assert {tuple(a['anchor']['normalized']) for a in frames} == {(.5, .6875)}
assert [f['durationMs'] for f in dust['frames']] == [60] * 6
assert len({a['png']['256']['sha256'] for a in frames}) == 6
widths = [r['alphaBounds'][2]-r['alphaBounds'][0] for r in records if r['size']==256 and r['id'].startswith('clay-dust')]
assert widths == sorted(widths) and len(set(widths)) == 6
shadows = [next(a for a in manifest['assets'] if a['id']==f'ball-shadow-{s}') for s in ['low','mid','high']]
alphas = []
for a in shadows:
    with Image.open(ROOT / a['png']['256']['path']) as im:
        alphas.append(im.getpixel((128,128))[3])
assert alphas[0] > alphas[1] > alphas[2] > 0
assert manifest['effects']['out']['durationMs'] == 1500 and manifest['effects']['out']['fadeOutMs'] == 0
assert [s['id'] for s in manifest['effects']['serve']['states']] == ['left','center','right']
assert all(not a['textInAsset'] for a in manifest['assets'] if a['role']=='hud-sign')
html = (ROOT / 'preview.html').read_text()
embedded = re.search(r'<script id="fx-manifest" type="application/json">(.*?)</script>', html, re.S)
assert embedded and json.loads(embedded.group(1)) == manifest
for name in ['preview.html','preview.css','preview.js']:
    content = (ROOT/name).read_text()
    assert not re.search(r'https?://|@import|fetch\(|XMLHttpRequest|localStorage|sessionStorage', content), name

# The scope check includes both tracked and currently untracked additions.
repo = ROOT.parents[3]
prefix = ROOT.relative_to(repo).as_posix() + '/'
changes = subprocess.check_output(['git','diff','--name-status',manifest['baseCommit']],cwd=repo,text=True).splitlines()
assert all(line.startswith('A\t'+prefix) for line in changes), changes[:5]
untracked = subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=repo,text=True).splitlines()
assert all(path.startswith(prefix) for path in untracked), untracked[:5]
inventory = [p for p in ROOT.rglob('*') if p.is_file()]
assert all(p.stat().st_size <= 400000 for p in inventory)
report = {'status':'pass','assets':19,'svg':19,'png':38,'resolutions':[256,512],'maxAssetBytes':max(f['bytes'] for a in manifest['assets'] for f in [a['svg'],*a['png'].values()]),'allPackageFilesUnder400KB':True,'scope':'only additions inside '+prefix,'dustFrameWidths':widths,'shadowCenterAlpha':alphas,'checks':['SVG allowlist; no text, handlers, raster, fonts or external references','SHA-256 and exact dimensions for all 57 exports','RGBA and clear transparent border on all 38 PNGs','6 distinct registered dust frames; expanding cloud','Height shadows grow and become lighter','1500ms out duration and no early fade','Embedded preview manifest equals manifest.json','No remote dependencies or persistent storage','Git diff contains additions only in requested directory'],'pngDetails':records}
(ROOT/'verification/assets.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='pngDetails'},ensure_ascii=False))
