"""Original CC0. Structural/load-all audit. Does not touch existing repository tests."""
import hashlib
import json
from pathlib import Path
import struct
import sys
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent


def verify(origin=None):
    manifest = json.loads((ROOT/'assets.json').read_text())
    assert len(manifest['assets']) == 12
    loaded, triangles, total = [], 0, 0
    for asset in manifest['assets']:
        raw = (ROOT/asset['file']).read_bytes()
        assert len(raw) == asset['bytes']
        assert hashlib.sha256(raw).hexdigest() == asset['sha256']
        assert struct.unpack_from('<III', raw) == (0x46546c67, 2, len(raw))
        length, kind = struct.unpack_from('<II', raw, 12)
        assert kind == 0x4e4f534a
        doc = json.loads(raw[20:20+length])
        blen, bkind = struct.unpack_from('<II', raw, 20+length)
        assert bkind == 0x004e4942 and blen == len(raw)-28-length
        assert not doc.get('extensionsRequired')
        assert doc['extensionsUsed'] == ['KHR_materials_unlit']
        assert not doc.get('images') and not doc.get('textures') and not doc.get('skins')
        assert len(doc['meshes']) == len(doc['meshes'][0]['primitives']) == 1
        primitive = doc['meshes'][0]['primitives'][0]
        a = doc['accessors'][primitive['indices']]
        assert a['count']//3 == asset['triangles'] <= 220
        assert doc['buffers'][0].get('uri') is None
        for view in doc['bufferViews']:
            assert view.get('byteOffset', 0)%4 == 0
            assert view.get('byteOffset', 0)+view['byteLength'] <= blen
        total += len(raw)
        triangles += asset['triangles']*50
        loaded.append(asset['file'])
    assert total == manifest['payloadBytes'] <= 400000
    assert triangles == manifest['crowd']['triangles'] <= 132000
    licenses = (ROOT/'LICENSES.md').read_text()
    all_files = sorted(p for p in ROOT.rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    for p in all_files:
        relative = p.relative_to(ROOT).as_posix()
        assert f'`{relative}`' in licenses, f'missing license: {relative}'
        data = p.read_bytes()  # Every deliverable is actually opened, not just globbed.
        if origin:
            url = origin.rstrip('/')+'/workout/island/design/tennis-crowd-3d-v1/'+relative
            with urlopen(url, timeout=15) as response:
                assert response.status == 200 and response.read() == data, relative
        if p.suffix in ['.md', '.py', '.mjs', '.css', '.html']: data.decode('utf-8')
        elif p.suffix == '.json': json.loads(data)
        elif p.suffix == '.webp': assert data[:4] == b'RIFF' and data[8:12] == b'WEBP'
        else: assert p.suffix == '.glb', relative
    package_bytes = sum(p.stat().st_size for p in all_files)
    assert package_bytes <= 400000, package_bytes
    result = {'glbs':len(loaded), 'payloadBytes':total, 'wholePackageBytes':package_bytes,
              'crowdTriangles':triangles, 'filesOpened':len(all_files), 'licenseCoverage':'complete'}
    if origin: result['httpFilesLoaded'] = len(all_files)
    print(json.dumps(result))
    return result


if __name__ == '__main__':
    verify(sys.argv[1] if len(sys.argv)>1 else None)
