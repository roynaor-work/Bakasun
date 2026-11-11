#!/usr/bin/env python3
"""CC0. Rebuild exact inventory, including its own size; no timestamp drift."""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
target=ROOT/'inventory.json'
if not target.exists():
    target.write_text('{}\n')
for _ in range(20):
    files=[{'path':p.relative_to(ROOT).as_posix(),'bytes':p.stat().st_size}
           for p in sorted(ROOT.rglob('*')) if p.is_file() and '__pycache__' not in p.parts]
    data=json.dumps({'files':files,'totalBytes':sum(p['bytes'] for p in files)},indent=2)+'\n'
    if data==target.read_text():
        break
    target.write_text(data)
else:
    raise RuntimeError('Inventory did not converge')
print(f'{len(files)} files; {sum(p["bytes"] for p in files):,} bytes')
