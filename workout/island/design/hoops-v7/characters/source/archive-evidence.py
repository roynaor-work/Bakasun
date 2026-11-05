"""Retain exact authoring/viewer text inputs for each frozen visual iteration.

GLBs and textures are identified by hashes in capture.json, and can be regenerated
from the archived tools plus the read-only repository sources. No private input.
"""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SUFFIXES = {'.mjs', '.js', '.py', '.html', '.css', '.json', '.md', '.txt'}
for capture_file in sorted((ROOT / 'iterations').glob('*/capture.json')):
    record = json.loads(capture_file.read_text())
    frozen = record.get('frozenSourceDirectory')
    if not frozen or not Path(frozen).is_dir():
        continue  # The exploratory first iteration explicitly has no frozen copy.
    target = capture_file.parent / 'SOURCE-SNAPSHOT.zip'
    if target.exists():
        continue
    members = []
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source in sorted(Path(frozen).rglob('*')):
            if source.is_file() and (source.suffix in SUFFIXES or source.name.startswith('LICENSE')):
                name = source.relative_to(frozen).as_posix()
                if name.startswith(('models/', 'textures/', 'iterations/', 'verification/')):
                    continue
                archive.write(source, name)
                members.append(name)
        archive.writestr('SNAPSHOT-NOTE.txt',
            'Exact text inputs from the frozen directory used by this iteration.\n'
            'GLB/image bytes are identified in capture.json. Read-only source human '
            'GLBs and vendor libraries remain in the repository.\n')
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    (capture_file.parent / 'SOURCE-SNAPSHOT.sha256').write_text(digest + '  SOURCE-SNAPSHOT.zip\n')
    print(json.dumps({'iteration': capture_file.parent.name, 'files': len(members),
                      'bytes': target.stat().st_size, 'sha256': digest}))
