#!/usr/bin/env python3
"""CC0-1.0. Reproduce the compact, lossless-float32 preview motion fixture.

Downloads only public, pinned CC0 keyframes. No imported model or game file is
written. The pack retains every rotation and hips sample, without quantization.
"""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import struct
import urllib.request

HERE = Path(__file__).resolve().parents[1]
COMMIT = '20b8740bfc28779815eb5171246ab76816748a46'
REPO = 'https://raw.githubusercontent.com/roynaor-work/Bakasun/'
PREFIX = 'workout/island/design/hoops-motion-v11/runtime/'
TREE = 'd7e716d0f9762e88950d780087f34ae913f9b13d'


def get(url):
    with urllib.request.urlopen(url, timeout=45) as response:
        return response.read()


def pack(entry):
    raw = get(REPO+COMMIT+'/'+PREFIX+entry['path'])
    blob_sha = hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()
    assert blob_sha == entry['sha'], entry['path']
    doc = json.loads(raw)
    assert doc['license'] == 'CC0-1.0'
    bones = [b['name'] for b in doc['skeleton']['bones']]
    frames = doc['keyframes']
    values = []
    for frame in frames:
        values.extend([frame['time'], *frame.get('hipsOffsetMeters', [0, 0, 0])])
        for name in bones:
            values.extend(frame['rotations'].get(name, [0, 0, 0, 1]))
    return {'id': doc['profileId']+'/'+doc['id'], 'profile': doc['profileId'],
            'duration': doc['durationSeconds'], 'loop': doc['loop'], 'frames': len(frames),
            'sourcePath': PREFIX+entry['path'], 'sourceSha256': hashlib.sha256(raw).hexdigest(),
            'legRatio': .78 / sum(-b['restTranslationMeters'][1] for b in doc['skeleton']['bones'] if b['name'] in ['LeftLeg', 'LeftFoot']),
            'samples': base64.b64encode(struct.pack('<'+'f'*len(values), *values)).decode()}


def main():
    tree = json.loads(get('https://api.github.com/repos/roynaor-work/Bakasun/git/trees/'+TREE+'?recursive=1'))
    entries = [e for e in tree['tree'] if e['path'].startswith('keyframes/') and e['path'].endswith('.json')]
    with ThreadPoolExecutor(max_workers=6) as pool:
        clips = sorted(pool.map(pack, entries), key=lambda c: c['id'])
    assert len(clips) == 90
    data = {'license': 'CC0-1.0', 'sourceCommit': COMMIT, 'sourceTree': TREE,
            'encoding': 'base64 little-endian float32; each frame = time(normalized), hipsOffsetMeters(3), canonical quaternion xyzw(18x4)',
            'clips': clips}
    path = HERE / 'runtime/hoops-v11.json'
    path.write_text(json.dumps(data, separators=(',', ':'))+'\n')
    print(f'{len(clips)} clips, {path.stat().st_size} bytes')


if __name__ == '__main__':
    main()
