"""Quantize linear bake data to lossless grayscale WebP; package actual-map renders.
Python 3.12 + numpy + Pillow. No source assets are modified.
"""
import argparse, json, hashlib
from pathlib import Path
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
IDS=['soccer-stadium','basketball-arena','ski-slope']

def main():
    p=argparse.ArgumentParser();p.add_argument('--scratch',required=True);p.add_argument('--renders',action='store_true')
    a=p.parse_args();scratch=Path(a.scratch)
    if not a.renders:
        for asset in IDS:
            for kind in ('ao','light'):
                raw=np.load(scratch/f'{asset}-{kind}.npy')
                # Blender float buffers are bottom-to-top. WebP stores top-to-bottom.
                gray=np.rint(np.clip(raw[::-1,:,:3].mean(axis=2),0,1)*255).astype('uint8')
                im=Image.fromarray(gray).convert('RGB')
                im.save(ROOT/f'{asset}-{kind}.webp',format='WEBP',lossless=True,method=6,exact=True)
    else:
        dest=ROOT/'previews';dest.mkdir(exist_ok=True)
        for f in sorted(scratch.glob('*.png')):
            Image.open(f).convert('RGB').save(dest/(f.stem+'.webp'),format='WEBP',quality=80,method=6)
        report={'source_main':'039419a2182d40f12d9acbfe0451e18118394d41','generator':'Blender 5.2.2 LTS / Cycles CPU',
                'linear_data':True,'ao_size':[512,512],'light_size':[256,256],
                'light_clamp':[.35,1],'preview':'Emission-only; no runtime shadows or AO. Same camera, surface textures, exposure in all states.',
                'assets':[json.loads((scratch/f'{asset}.json').read_text()) for asset in IDS]}
        context=['models/soccer-goal.glb','models/slalom-gate.glb','models/basketball-hoop.glb',
                 'environment/textures/grass-mown.webp','environment/textures/parquet.webp','environment/textures/snow.webp']
        report['context_sources_sha256']={p:hashlib.sha256((ROOT.parent/p).read_bytes()).hexdigest() for p in context}
        for asset in report['assets']:
            asset['maps']={}
            for kind in ('ao','light'):
                f=ROOT/(asset['id']+'-'+kind+'.webp');im=np.array(Image.open(f))
                assert np.array_equal(im[:,:,0],im[:,:,1]) and np.array_equal(im[:,:,1],im[:,:,2])
                asset['maps'][kind]={'file':f.name,'bytes':f.stat().st_size,'size':[im.shape[1],im.shape[0]],
                    'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'min':int(im.min()),'max':int(im.max()),
                    'mean':round(float(im.mean()),3),'grayscale':True}
        (ROOT/'manifest.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8',newline='\n')

if __name__=='__main__':main()
