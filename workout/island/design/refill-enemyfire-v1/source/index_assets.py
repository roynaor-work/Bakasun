#!/usr/bin/env python3
"""Record exact deliverable bytes and SHA-256 hashes after both build scripts.
SPDX-License-Identifier: CC0-1.0
"""
from pathlib import Path
import hashlib
import json

ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'manifest.json').read_text())
files=[]
for directory in ['icons','vfx','models','audio']:
    for p in sorted((ROOT/directory).rglob('*')):
        if p.is_file():
            files.append(dict(file=p.relative_to(ROOT).as_posix(),bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),license='CC0-1.0',origin='original'))
manifest['assetFiles']=files
manifest['assetFileCount']=len(files)
manifest['assetTotalBytes']=sum(f['bytes'] for f in files)
manifest['source']=['source/build_assets.py','source/build_audio.py','source/index_assets.py']
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(dict(files=len(files),bytes=manifest['assetTotalBytes'])))
