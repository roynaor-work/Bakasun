"""Validate decoded images, source hashes, previews and the entire folder budget."""
import json,hashlib,re
from pathlib import Path
from PIL import Image
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'manifest.json').read_text())
rows=[]
for name,digest in manifest['context_sources_sha256'].items():
    assert hashlib.sha256((ROOT.parent/name).read_bytes()).hexdigest()==digest
for asset in manifest['assets']:
    original=ROOT.parent/'models'/(asset['id']+'.glb')
    assert hashlib.sha256(original.read_bytes()).hexdigest()==asset['source_sha256']
    for kind,data in asset['maps'].items():
        p=ROOT/data['file'];im=Image.open(p);im.load();rgb=np.array(im.convert('RGB'))
        assert im.format=='WEBP' and 'A' not in im.mode and max(im.size)<=512
        assert im.size==((512,512) if kind=='ao' else (256,256))
        assert np.array_equal(rgb[:,:,0],rgb[:,:,1]) and np.array_equal(rgb[:,:,1],rgb[:,:,2])
        assert hashlib.sha256(p.read_bytes()).hexdigest()==data['sha256']
    for orientation,size in [('portrait',(390,844)),('landscape',(844,390))]:
        ims=[]
        for state in ('before','ao','light'):
            p=ROOT/'previews'/f"{asset['id']}-{orientation}-{state}.webp"
            im=Image.open(p);im.load();assert im.size==size;ims.append(np.array(im).astype(float))
        changed=float(np.mean(np.abs(ims[0]-ims[1])));light=float(np.mean(np.abs(ims[1]-ims[2])))
        assert changed>.1 and light>.1
        rows.append({'asset':asset['id'],'orientation':orientation,'size':list(size),'mean_rgb_change_ao':round(changed,3),
                     'mean_rgb_change_light':round(light,3)})
assert len(list((ROOT/'previews').glob('*.webp')))==18
html=(ROOT/'preview.html').read_text(encoding='utf8')
assert not re.search(r'(?:src|href)=["\']https?://',html)
assert '?v=' not in html
geometry=json.loads((ROOT/'geometry-validation.json').read_text());assert geometry['status']=='PASS'
browser=json.loads((ROOT/'browser-validation.json').read_text());assert browser['status']=='PASS'
files=[p for p in ROOT.rglob('*') if p.is_file()]
assert not any(p.suffix in ('.png','.npy','.blend','.pyc') for p in files)
report={'status':'PASS','limit_bytes':1200000,'whole_folder_bytes':0,'file_count':0,
        'maps_count':6,'maps_bytes':sum(m['bytes'] for a in manifest['assets'] for m in a['maps'].values()),
        'previews_count':18,'source_hashes_unchanged':True,'grayscale_linear_webp':True,
        'preview_differences':rows,'geometry_status':'PASS','browser_status':'PASS',
        'gpu_rgba8_per_scene_bytes':1310720,'gpu_rgba8_all_scenes_bytes':3932160,
        'gpu_uv1_stadium_bytes':geometry['extra_uv_bytes_float32']}
dest=ROOT/'validation.json'
for _ in range(8):
    dest.write_text(json.dumps(report,indent=2)+'\n',encoding='utf8',newline='\n')
    files=[p for p in ROOT.rglob('*') if p.is_file()]
    report['file_count']=len(files);report['whole_folder_bytes']=sum(p.stat().st_size for p in files)
assert report['whole_folder_bytes']<=1200000
assert json.loads(dest.read_text())['whole_folder_bytes']==sum(p.stat().st_size for p in files)
print(json.dumps({'status':'PASS','bytes':report['whole_folder_bytes'],'files':report['file_count']}))
