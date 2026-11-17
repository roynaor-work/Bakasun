#!/usr/bin/env python3
"""Reproducible local ZIP and SHA-256 inventory; no third-party dependencies."""
import hashlib
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
archive = root / 'soccer-celebrations-v1.zip'
manifest = root / 'MANIFEST.sha256'
files = sorted(p for p in root.rglob('*') if p.is_file()
               and p not in (archive, manifest)
               and '__pycache__' not in p.parts)
manifest.write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(root).as_posix()}\n'
                            for p in files), encoding='utf-8')
files = sorted(files + [manifest])
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
    for path in files:
        entry = zipfile.ZipInfo((Path(root.name) / path.relative_to(root)).as_posix(),
                                date_time=(2026, 11, 17, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        output.writestr(entry, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
print(f'{len(files)} files; {archive.stat().st_size} bytes; SHA-256 {hashlib.sha256(archive.read_bytes()).hexdigest()}')
