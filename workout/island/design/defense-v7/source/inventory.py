"""Inventory every delivered file without introducing recursive self hashes."""
from pathlib import Path
from datetime import datetime, timezone
import csv, hashlib, json

ROOT=Path(__file__).resolve().parents[1]
EXCLUDE={'FILE-SIZES.csv','verification/package-summary.json'}
rows=[]
for path in sorted(ROOT.rglob('*')):
    if not path.is_file():continue
    relative=path.relative_to(ROOT).as_posix()
    if relative in EXCLUDE:continue
    blob=path.read_bytes()
    rows.append({'file':relative,'bytes':len(blob),'MB':f'{len(blob)/1e6:.6f}',
                 'sha256':hashlib.sha256(blob).hexdigest()})
with (ROOT/'FILE-SIZES.csv').open('w',newline='') as f:
    writer=csv.DictWriter(f,fieldnames=['file','bytes','MB','sha256'])
    writer.writeheader();writer.writerows(rows)
groups={}
for row in rows:
    category=row['file'].split('/')[0] if '/' in row['file'] else 'root'
    group=groups.setdefault(category,{'files':0,'bytes':0})
    group['files']+=1;group['bytes']+=row['bytes']
summary={'generatedUTC':datetime.now(timezone.utc).isoformat(),
 'units':'Decimal MB = 1,000,000 bytes',
 'excludedSelfReferences':sorted(EXCLUDE),
 'files':len(rows),'bytes':sum(r['bytes'] for r in rows),
 'groups':groups,'largest':sorted(rows,key=lambda r:r['bytes'],reverse=True)[:15]}
(ROOT/'verification/package-summary.json').write_text(json.dumps(summary,indent=2))
print(json.dumps({'files':summary['files'],'MB':summary['bytes']/1e6,
                  'largest':summary['largest'][:5]}))
