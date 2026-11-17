"""Read-only asset contract checks; evidence writes only inside this package.
python3 source/verify-assets.py
Requires Pillow (authoring only). PNG checks are independent of the exporter.
"""
from pathlib import Path
from PIL import Image
import hashlib
import json
import subprocess

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[3]
PREFIX='workout/island/design/racing-themes-v1/'
manifest=json.loads((ROOT/'manifest.json').read_text())
checks=[]
def check(label, condition):
    if not condition: raise AssertionError(label)
    checks.append(label)

check('Exactly four requested themes',[t['id'] for t in manifest['themes']]==['city-night','desert','snow','coast'])
check('Decimal 600KB budget',manifest['budget']['maxBytesPerTheme']==600000)
check('Preview contract 844x390',[manifest['preview']['width'],manifest['preview']['height']]==[844,390])
script=(ROOT/'manifest.js').read_text().split('window.RACING_THEMES_MANIFEST=',1)[1].strip().removesuffix(';')
check('Offline manifest mirror equals JSON',json.loads(script)==manifest)
inventory=[]
for t in manifest['themes']:
    assets=[t['sky'],*t['layers'],*t['road'].values(),t['barrier'],t['propAtlas']]
    check(f"{t['id']}: three independent parallax layers",len(t['layers'])==3 and len({a['file'] for a in t['layers']})==3)
    check(f"{t['id']}: increasing parallax speeds",[a['parallax'] for a in t['layers']]==[.12,.34,.66])
    check(f"{t['id']}: six distinct props",len(t['props'])==len({p['id'] for p in t['props']})==6)
    check(f"{t['id']}: ten separate runtime PNGs",len(assets)==len({a['file'] for a in assets})==10)
    measured=0
    for a in assets:
        full=ROOT/a['file'];data=full.read_bytes();im=Image.open(full);im.load();rgba=im.convert('RGBA')
        label=a['file'];measured+=len(data)
        check(f'{label}: PNG',im.format=='PNG')
        check(f'{label}: dimensions',im.size==(a['width'],a['height']))
        check(f'{label}: byte count',len(data)==a['bytes'])
        check(f'{label}: SHA-256',hashlib.sha256(data).hexdigest()==a['sha256'])
        check(f'{label}: at most 1024px',max(im.size)<=1024)
        if a['role'] in ['parallax-layer','barrier-tile','six-prop-atlas','lane-line-tile','edge-line-tile']:
            alpha=rgba.getchannel('A')
            check(f'{label}: transparent and opaque pixels',alpha.getextrema()[0]==0 and alpha.getextrema()[1]>=250)
        else:
            check(f'{label}: opaque color tile',rgba.getchannel('A').getextrema()==(255,255))
        if a['role']=='parallax-layer':
            check(f'{label}: transparent sky above scenery',rgba.getchannel('A').crop((0,0,im.width,1)).getextrema()==(0,0))
        if a.get('repeat') in ('x','xy'):
            check(f'{label}: equal horizontal tile borders',rgba.crop((0,0,1,im.height)).tobytes()==rgba.crop((im.width-1,0,im.width,im.height)).tobytes())
        if a.get('repeat') in ('y','xy'):
            check(f'{label}: equal vertical tile borders',rgba.crop((0,0,im.width,1)).tobytes()==rgba.crop((0,im.height-1,im.width,im.height)).tobytes())
        inventory.append({'file':a['file'],'bytes':len(data),'mode':im.mode,'dimensions':im.size,'sha256':a['sha256']})
    check(f"{t['id']}: total matches actual files",measured==t['totalBytes'])
    check(f"{t['id']}: within full theme budget",0<measured<=600000)
    atlas=Image.open(ROOT/t['propAtlas']['file']).convert('RGBA')
    frames=[]
    for i,p in enumerate(t['props']):
        x,y,w,h=p['frame']
        check(f"{t['id']}/{p['id']}: valid nonoverlapping frame",[x,y,w,h]==[128*i,0,128,160])
        cell=atlas.crop((x,y,x+w,y+h));bbox=cell.getchannel('A').getbbox()
        check(f"{t['id']}/{p['id']}: visible isolated sprite",bbox is not None and bbox[0]>=7 and bbox[2]<=121 and bbox[3]<=152)
        check(f"{t['id']}/{p['id']}: clear gutters",all(cell.getpixel(point)[3]==0 for point in [(0,j) for j in range(h)]+[(w-1,j) for j in range(h)]+[(j,0) for j in range(w)]+[(j,h-1) for j in range(w)]))
        check(f"{t['id']}/{p['id']}: ground anchor and clearance",p['anchor']==[.5,.9375] and p['roadClearanceMetres']>=2.5)
        frames.append(hashlib.sha256(cell.tobytes()).hexdigest())
    check(f"{t['id']}: six different sprite images",len(set(frames))==6)
    actual={str(p.relative_to(ROOT)) for p in (ROOT/t['id']).rglob('*') if p.is_file()}
    check(f"{t['id']}: no unlisted files or hidden budget",actual=={a['file'] for a in assets})

# This package is the only permitted change, including authoring and evidence.
changes=subprocess.check_output(['git','diff','--name-status','origin/main','--'],cwd=REPO,text=True).splitlines()
untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=REPO,text=True).splitlines()
check('Every tracked change is a new file in the requested folder',all(row.startswith('A\t'+PREFIX) for row in changes))
check('Every untracked file is in the requested folder',all(p.startswith(PREFIX) for p in untracked))
report={'passed':True,'checks':checks,'assetCount':len(inventory),'themes':[{'id':t['id'],'bytes':t['totalBytes'],'budget':600000} for t in manifest['themes']],'assets':inventory}
(ROOT/'verification'/'assets.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(f'{len(checks)} asset checks passed; {len(inventory)} PNGs, 24 props, four complete budgets, only the new folder.')
