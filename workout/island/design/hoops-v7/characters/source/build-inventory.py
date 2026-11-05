#!/usr/bin/env python3
"""Record the exact delivery bytes; the manifest excludes itself."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent.parent
target = root / 'verification/inventory.json'
entries = []
for p in sorted(root.rglob('*')):
    if not p.is_file() or p == target:
        continue
    if p.is_symlink():
        raise SystemExit(f'Delivery files must be regular local files: {p}')
    data = p.read_bytes()
    entries.append({'file': str(p.relative_to(root)), 'bytes': len(data),
                    'MB': len(data) / 1_000_000,
                    'sha256': hashlib.sha256(data).hexdigest()})
manifest = {'schemaVersion': 1, 'generatedAtUtc': datetime.now(timezone.utc).isoformat(),
            'scope': 'All delivery files except this inventory itself; decimal MB.',
            'files': entries, 'fileCount': len(entries),
            'totalBytesExcludingInventory': sum(e['bytes'] for e in entries)}
target.write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'fileCount': len(entries), 'totalMB': manifest['totalBytesExcludingInventory'] / 1e6,
                  'largest': sorted(entries, key=lambda e: e['bytes'], reverse=True)[:5]}))
