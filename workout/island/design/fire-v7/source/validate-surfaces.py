"""Source-shell audit complementary to validation of the decoded Draco GLB."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib
from PIL import Image
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
report={'generatedAt':datetime.now(timezone.utc).isoformat(),'closedShells':0,'openPatches':0,'assets':[],'failures':[],'particles':[]}
for p in sorted(Path('/tmp/fire-v7-raw').glob('*.json')):
    raw=json.loads(p.read_text());audit=raw.get('surfaceAudit',[])
    closed=[a for a in audit if a['closed']];opened=[a for a in audit if not a['closed']]
    bad=[a for a in closed if a['signedVolume']<-1e-10]
    report['closedShells']+=len(closed);report['openPatches']+=len(opened)
    report['assets'].append({'id':raw['name'],'closedShells':len(closed),'openPatches':len(opened),'inwardShells':bad,
        'sourceGeometrySha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    if not audit:report['failures'].append({'id':raw['name'],'issue':'Missing source audit'})
    if bad:report['failures'].append({'id':raw['name'],'issue':'Inward closed shell','count':len(bad)})
for p in sorted((ROOT/'particles').glob('*.png')):
    im=Image.open(p).convert('RGBA');a=np.array(im)[:,:,3];cell=im.width//4
    max_edge=0
    for row in range(4):
        for col in range(4):
            tile=a[row*cell:(row+1)*cell,col*cell:(col+1)*cell]
            max_edge=max(max_edge,int(max(tile[0,:].max(),tile[-1,:].max(),tile[:,0].max(),tile[:,-1].max())))
    r={'file':str(p.relative_to(ROOT)),'dimensions':list(im.size),'frames':16,'maxEdgeAlpha':max_edge,'nonZeroAlphaPixels':int(np.count_nonzero(a))}
    report['particles'].append(r)
    if max_edge!=0 or max(im.size)>1024 or not np.count_nonzero(a):report['failures'].append({'file':r['file'],'issue':'Invalid alpha gutter or dimensions'})
report['passed']=not report['failures'];(ROOT/'verification/surface-winding.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k]for k in ['passed','closedShells','openPatches','failures']}))
raise SystemExit(0 if report['passed'] else 1)
