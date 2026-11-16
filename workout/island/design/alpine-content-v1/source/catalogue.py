#!/usr/bin/env python3
"""CC0. Refresh PNG measurements, contact sheet and exact file inventory.

Run after build_assets.py, verify.mjs --capture and the written reports.
No downloaded media or image alteration: the contact sheet arranges GLB renders.
"""
from pathlib import Path
import json, hashlib
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
def dump(p,data):p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def sha(b):return hashlib.sha256(b).hexdigest()
def main():
    manifest=json.loads((ROOT/'manifest.json').read_text());sheet=Image.new('RGB',(1190,760),'#f4f1df');draw=ImageDraw.Draw(sheet)
    for i,a in enumerate(manifest['assets']):
        p=ROOT/a['png'];data=p.read_bytes();im=Image.open(p)
        assert im.size==(320,320) and im.mode=='RGBA'
        bbox=im.getchannel('A').getbbox();assert bbox and bbox[0]>0 and bbox[1]>0 and bbox[2]<320 and bbox[3]<320,(a['id'],bbox)
        a.update(pngBytes=len(data),pngSha256=sha(data),pngAlphaBounds=list(bbox))
        im.thumbnail((160,160));x=i%7*170;y=i//7*190;sheet.paste(im,(x+5,y),im);draw.text((x+7,y+160),a['id'],fill='#44616b');draw.text((x+7,y+176),f"{a['triangles']} triangles",fill='#667d77')
    sheet.save(ROOT/'verification/contact-sheet.png',optimize=True)
    dump(ROOT/'manifest.json',manifest)
    files=[]
    for p in sorted(ROOT.rglob('*')):
        if not p.is_file() or '__pycache__' in p.parts or p.name=='asset-inventory.json':continue
        name=p.relative_to(ROOT).as_posix();data=p.read_bytes()
        source=('source/build_assets.py' if name.startswith(('models/','effects/')) and name!='effects/runtime.mjs' else 'source/verify.mjs + delivered GLB' if name.startswith('png/') else 'source/catalogue.py + delivered PNG' if name=='verification/contact-sheet.png' else 'original source or verification output')
        if name=='models/rival-skier.glb':source='../alpine-themes-v1/shared/reference-skier.glb + source/build_assets.py (animation)'
        files.append({'path':name,'bytes':len(data),'sha256':sha(data),'source':source,'license':'CC0-1.0'})
    dump(ROOT/'asset-inventory.json',{'schemaVersion':1,'license':'CC0-1.0','note':'All files are listed except this inventory itself, to avoid a recursive digest. No external media or libraries are bundled.','files':files})
    total=sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file());assert total<=3000000,total
    print(json.dumps({'files':len(files)+1,'packageBytes':total,'glbBytes':sum(a['bytes'] for a in manifest['assets']),'pngBytes':sum(a['pngBytes'] for a in manifest['assets']),'maxGLBBytes':max(a['bytes'] for a in manifest['assets']),'minModelTriangles':min(a['triangles'] for a in manifest['assets'] if a['category']!='effect'),'maxModelTriangles':max(a['triangles'] for a in manifest['assets'] if a['category']!='effect')},indent=2))

if __name__=='__main__':main()
