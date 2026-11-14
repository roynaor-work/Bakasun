#!/usr/bin/env python3
"""Check deliverable PNG data, honest budgets, seam pixels and repository scope."""
from pathlib import Path
import hashlib
import json
import subprocess
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parent
manifest=json.loads((ROOT/'manifest.json').read_text())
index=json.loads((ROOT/'assets.json').read_text())
assert index['assets']==manifest['assets']
files={a['file']:a for a in manifest['assets']}
assert len(files)==19
assert set(files)=={str(p.relative_to(ROOT)) for p in (ROOT/'runtime').rglob('*.png')}
checks=[]
for name,entry in files.items():
    path=ROOT/name
    assert path.is_relative_to(ROOT)
    raw=path.read_bytes()
    assert raw[:8]==b'\x89PNG\r\n\x1a\n'
    assert len(raw)==entry['bytes']
    assert hashlib.sha256(raw).hexdigest()==entry['sha256']
    with Image.open(path) as im:
        im.load(); assert list(im.size)==[entry['width'],entry['height']]
        a=np.array(im.convert('RGBA'))
    if entry.get('transparency'):
        assert a[:,:,3].min()==0, name
        assert a[:,:,3].max()>0, name
    else: assert a[:,:,3].min()==255, name
    if entry.get('seamless'):
        assert np.array_equal(a[0],a[-1]) and np.array_equal(a[:,0],a[:,-1]), name
    if entry.get('seamlessX'): assert np.array_equal(a[:,0],a[:,-1]), name
    if entry['role'] in ['clay-dust','grass-spray']:
        assert entry['frames']==6 and im.size==(768,128)
        assert a[1:127,1:127,3].max()>0
        assert a[:,-128:,3].max()==0 # Fully faded last frame, no hard end pop.
        # Both outer rows and every cell border must be transparent for linear filtering.
        assert not a[[0,-1],:,3].any()
        for x in range(0,768,128): assert not a[:,[x,x+127],3].any()
    assert entry['license']=='CC0-1.0'
    checks.append({'file':name,'bytes':len(raw),'valid':True})

shared={n for n in files if '/shared/' in n}
sets=[]
for entry in manifest['sets']:
    names=set(entry['files']);assert len(names)==len(entry['files'])
    assert shared<=names
    assert {a['surface'] for n,a in files.items() if n in names and 'surface' in a}=={entry['id']}
    total=sum(files[n]['bytes'] for n in names)
    # Also count the entire adapter and both metadata indexes against each set.
    delivered=total+sum((ROOT/n).stat().st_size for n in ['runtime/court.mjs','manifest.json','assets.json'])
    assert total==entry['payloadBytes'] and delivered<=800000
    sets.append({'surface':entry['id'],'pngBytes':total,'withAdapterAndIndexesBytes':delivered,'budgetBytes':800000})
assert sum(a['bytes'] for a in files.values())==manifest['payloadBytes']
assert manifest['units']=='meters' and manifest['up']=='+Y' and manifest['forward']=='+Z'
assert manifest['compatibility']['seats']==600

scope='workout/island/design/tennis-courts-v1/'
repo=ROOT.parents[3]
base='11fef2fb98eec4173381346caee94f2930f9cffa'
diff=subprocess.check_output(['git','diff','--name-status',base],cwd=repo,text=True)
for line in diff.splitlines():
    status,name=line.split('\t')
    assert status=='A' and name.startswith(scope), line
untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=repo,text=True).splitlines()
assert all(n.startswith(scope) for n in untracked),untracked
result={'passed':True,'images':checks,'sets':sets,'sharedImagesCountedInEverySet':True,
    'pngBytes':manifest['payloadBytes'],'scopeBase':base,'changedExistingFiles':0}
(ROOT/'verification/assets.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':True,'images':len(checks),'sets':sets,'changedExistingFiles':0}))
