"""Validate shipped pixels, not only the generation formulas. Fails closed."""
from pathlib import Path
import json,hashlib,sys,struct
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
sys.dont_write_bytecode=True
sys.path.insert(0,str(ROOT/'source'))
from importlib.machinery import SourceFileLoader
generator=SourceFileLoader('texture_generator',str(ROOT/'source/build-textures.py')).load_module()
m=json.loads((ROOT/'manifest.json').read_text());results=[]


def check(name,passed,**data):
    results.append(dict(check=name,passed=bool(passed),**data))


for a in m['assets']:
    p=ROOT/a['path'];raw=p.read_bytes()
    check(a['id']+' integrity',len(raw)==a['bytes'] and hashlib.sha256(raw).hexdigest()==a['sha256'])
    if a['kind']=='atlas':
        check(a['id']+' <= 800000 bytes',len(raw)<=m['atlasBudgetBytes'],bytes=len(raw))
        im=np.array(Image.open(p).convert('RGBA')).astype(float)
        frames=[]
        for f in a['frames']:
            x,y,w,h=f['rect'];frame=im[y:y+h,x:x+w];frames.append(frame)
            check(a['id']+' frame '+str(f['index'])+' bounds',frame.shape==(h,w,4))
            pad=a['padding']
            expected=np.pad(frame,((pad,pad),(pad,pad),(0,0)),mode='edge')
            check(a['id']+' frame '+str(f['index'])+' extrusion',np.array_equal(expected,im[y-pad:y+h+pad,x-pad:x+w+pad]))
            if a['id'].startswith('water-'):
                dx=float(np.abs(frame[:,0]-frame[:,-1]).max());dy=float(np.abs(frame[0]-frame[-1]).max())
                check(a['id']+' frame '+str(f['index'])+' spatial seams',max(dx,dy)<=1,maxRGBDelta=max(dx,dy))
            else:
                border=np.concatenate([frame[0,:,3],frame[-1,:,3],frame[:,0,3],frame[:,-1,3]])
                check(a['id']+' frame '+str(f['index'])+' clear boundary',float(border.max())==0)
        if a.get('loop'):
            diffs=[float(np.sqrt(np.mean((frames[(i+1)%len(frames)]-f)**2))) for i,f in enumerate(frames)]
            check(a['id']+' temporal wrap',diffs[-1]<=max(diffs[:-1])*1.15,wrapRMS=diffs[-1],otherMaxRMS=max(diffs[:-1]))
        if a['id'].endswith('-normal'):
            n=np.stack(frames)[:,:,:,:3]/255*2-1
            lengths=np.linalg.norm(n,axis=-1)
            check(a['id']+' normal lengths',lengths.min()>.92 and lengths.max()<1.08,minimum=float(lengths.min()),maximum=float(lengths.max()))
        if not a.get('loop'):
            clips=a.get('clips',[dict(startFrame=0,frameCount=len(frames))])
            for c in clips:
                first=frames[c['startFrame']][:,:,3];last=frames[c['startFrame']+c['frameCount']-1][:,:,3]
                middle=frames[c['startFrame']+c['frameCount']//2][:,:,3]
                check(a['id']+' clear event endpoints '+str(c['startFrame']),first.max()==0 and last.max()==0 and middle.max()>100)
    elif a['path'].endswith('.png'):
        im=np.array(Image.open(p).convert('RGBA')).astype(float)
        for axis in a.get('spatialRepeat',[]):
            d=np.abs(im[:,0]-im[:,-1]).max() if axis=='x' else np.abs(im[0]-im[-1]).max()
            check(a['id']+' tile '+axis,d<=1,maxRGBDelta=float(d))
    elif a['path'].endswith('.glb'):
        length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length])
        check(a['id']+' embedded glb',raw[:4]==b'glTF' and len(raw)==struct.unpack_from('<I',raw,8)[0] and all('uri' not in b for b in doc.get('buffers',[])) and all('uri' not in i for i in doc.get('images',[])))
        check(a['id']+' finite bounds',all(np.isfinite(v) for ac in doc.get('accessors',[]) for k in ['min','max'] for v in ac.get(k,[])))

for strength in [.38,.82,1.42]:
    c0,n0=generator.surface(256,0,strength);c1,n1=generator.surface(256,1,strength)
    max_delta=float(max(np.abs(c0-c1).max(),np.abs(n0-n1).max()))
    check('analytic four-second periodic surface '+str(strength),max_delta<1e-9,maxFloatDelta=max_delta)

check('four different impact clips',len({hashlib.sha256(np.array(Image.open(ROOT/'textures/impact-4x8.png'))[i*200:(i+1)*200].tobytes()).hexdigest() for i in range(4)})==4)
check('nine original models',len([a for a in m['assets'] if a['kind']=='model'])==9)
summary=dict(passed=all(r['passed'] for r in results),checks=len(results),failed=[r for r in results if not r['passed']],
    assets=len(m['assets']),runtimeBytes=sum(a['bytes'] for a in m['assets'] if a['kind']!='reference-model'),
    maxAtlasBytes=max(a['bytes'] for a in m['assets'] if a['kind']=='atlas'),results=results)
(ROOT/'verification/asset-report.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='results'},ensure_ascii=False,indent=2))
sys.exit(0 if summary['passed'] else 1)
