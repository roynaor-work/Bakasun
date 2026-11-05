"""Pack independent review renders as WebP; retain raw PNG hashes in the record."""
from pathlib import Path
from PIL import Image
import json,hashlib,time,shutil
ROOT=Path(__file__).resolve().parents[1]
folder=ROOT/'verification/studio';archive=Path('/tmp/defense-v7-studio-raw');archive.mkdir(exist_ok=True)
meta=folder/'conversions.json';records=json.loads(meta.read_text()) if meta.exists() else {}
for path in sorted(folder.glob('*.png')):
    if time.time()-path.stat().st_mtime<3:continue
    try:
        image=Image.open(path);image.load()
    except Exception:continue
    digest=hashlib.sha256(path.read_bytes()).hexdigest();destination=path.with_suffix('.webp');image.save(destination,'WEBP',quality=92,method=6)
    check=Image.open(destination);check.load();assert check.size==image.size
    records[destination.name]={'rawPNG':path.name,'rawSHA256':digest,'rawBytes':path.stat().st_size,'bytes':destination.stat().st_size,'size':list(image.size),'quality':92,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()}
    shutil.move(str(path),str(archive/path.name))
meta.write_text(json.dumps(records,indent=2))
renders=folder/'renders.json'
if renders.exists():
    data=json.loads(renders.read_text())
    for row in data:
        p=Path(row['file']);webp=p.with_suffix('.webp').name
        if (folder/webp).exists():row['file']=webp;row['rawSHA256']=records[webp]['rawSHA256']
    renders.write_text(json.dumps(data,indent=2))
print(json.dumps({'packed':len(records),'bytes':sum(r['bytes'] for r in records.values())}))
