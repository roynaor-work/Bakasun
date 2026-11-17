#!/usr/bin/env python3
"""CC0-1.0. Final byte inventory, excluding only this inventory's own hash."""
import hashlib
import json
from pathlib import Path
import sys

root=Path(__file__).resolve().parents[1]
target=root/'verification/inventory.json'
files=[]
for path in sorted(root.rglob('*')):
    if not path.is_file() or path==target:
        continue
    relative=path.relative_to(root).as_posix()
    library=relative.startswith('vendor/') or relative=='preview.bundle.js'
    data=path.read_bytes()
    files.append(dict(path=relative,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),
                      license='MIT' if relative.startswith('vendor/') else 'CC0-1.0 AND MIT' if library else 'CC0-1.0'))
inventory=dict(schemaVersion=1,files=files,totalBytesExcludingInventory=sum(f['bytes'] for f in files),
               inventoryHashExclusion='This file excludes its own bytes/hash to avoid a circular hash.',
               sourceBodies='Four byte-identical references to assets/athlete-body-v22; provenance in manifest.json and LICENSES.md')
output=json.dumps(inventory,ensure_ascii=False,indent=2)+'\n'
if '--check' in sys.argv:
    assert target.read_text()==output,'Inventory is stale; run tools/inventory.py'
else:
    target.write_text(output)
total=inventory['totalBytesExcludingInventory']+len(output.encode())
assert total<=6_000_000,('Package exceeds 6 MB',total)
print(json.dumps({'files':len(files)+1,'packageBytes':total,'maxPackageBytes':6_000_000,'pass':True}))
