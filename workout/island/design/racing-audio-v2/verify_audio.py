#!/usr/bin/env python3
"""Decode every delivered file and verify the actual compressed audio. CC0-1.0."""
import hashlib
import ast
import json
from pathlib import Path
import subprocess
import sys

import numpy as np

ROOT = Path(__file__).resolve().parent


def command(args):
    return subprocess.run(args, capture_output=True, check=True)


def inspect(path, asset):
    info = json.loads(command(['ffprobe', '-v', 'error', '-show_streams',
                              '-of', 'json', str(path)]).stdout)['streams']
    assert len(info) == 1 and info[0]['codec_type'] == 'audio', path
    assert int(info[0]['sample_rate']) == 44100 and info[0]['channels'] == 1, path
    x = np.frombuffer(command(['ffmpeg', '-v', 'error', '-i', str(path),
                              '-f', 'f32le', '-acodec', 'pcm_f32le', '-']).stdout, dtype='<f4')
    assert len(x) > 0 and np.isfinite(x).all(), path
    assert abs(len(x) / 44100 - asset['durationSeconds']) < .01, path
    log = command(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path),
                   '-af', 'loudnorm=I=-16:TP=-3:LRA=7:print_format=json',
                   '-f', 'null', '-']).stderr.decode()
    m = json.loads(log[log.rfind('{'):log.rfind('}') + 1])
    lufs, peak = float(m['input_i']), float(m['input_tp'])
    assert -16.6 <= lufs <= -15.4, (path.name, 'LUFS', lufs)
    assert peak <= -3, (path.name, 'true peak', peak)
    assert np.max(np.abs(x)) < 1, (path.name, 'clipping')
    result = {'path': path.name, 'bytes': path.stat().st_size, 'samples': len(x),
              'lufs': lufs, 'truePeakDbfs': peak,
              'samplePeakDbfs': round(float(20 * np.log10(np.max(np.abs(x)))), 3)}
    if asset['loop']:
        lo, hi = asset['loop']['startSample'], asset['loop']['endSample']
        y = x[lo:hi]
        assert len(y) == 132300
        jump = abs(float(y[0] - y[-1]))
        # A seam is also checked against ordinary adjacent steps and its slope.
        ordinary = np.diff(y)
        p99 = float(np.quantile(np.abs(ordinary), .99))
        slope_error = abs(float((y[0] - y[-1]) - .5 * ((y[1] - y[0]) + (y[-1] - y[-2]))))
        rms = lambda a: np.sqrt(np.mean(a.astype(float) ** 2))
        edge_db = abs(float(20 * np.log10(rms(y[:441]) / rms(y[-441:]))))
        # Guard consistency catches codec startup/tail errors at loop points.
        guard_error = float(rms(x[hi:hi + 441] - x[lo:lo + 441]))
        assert jump <= .04 and jump <= max(.012, 1.5 * p99), (path.name, 'seam jump', jump)
        assert slope_error <= .04, (path.name, 'slope', slope_error)
        assert edge_db <= 2, (path.name, 'edge energy dB', edge_db)
        assert guard_error <= .025, (path.name, 'guard mismatch', guard_error)
        result.update(seamJump=round(jump, 6), seamSlopeError=round(slope_error, 6),
                      edgeRmsDeltaDb=round(edge_db, 3), guardRmsError=round(guard_error, 6))
    return result


def main():
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    assert len(manifest['assets']) == 16
    assert len({a['id'] for a in manifest['assets']}) == 16
    assert [a['rpm'] for a in manifest['assets'] if a['kind'] == 'engine'] == [4000, 6000, 9000, 12000, 15000]
    assert manifest['sampleRate'] == 44100 and manifest['channels'] == 1
    assert manifest['license'] == 'CC0-1.0' and manifest['loopEndExclusive']
    rows = []
    for asset in manifest['assets']:
        assert set(asset['files']) == {'ogg', 'mp3'}
        for file in asset['files'].values():
            path = ROOT / file['path']
            assert path.parent == ROOT and path.is_file(), path
            assert path.stat().st_size == file['bytes'] <= 150000, path
            assert hashlib.sha256(path.read_bytes()).hexdigest() == file['sha256'], path
            row = inspect(path, asset)
            rows.append(row)
            print(json.dumps(row), flush=True)
    assert {p.name for p in ROOT.glob('*.ogg')} | {p.name for p in ROOT.glob('*.mp3')} == {r['path'] for r in rows}
    total = 0
    licenses = (ROOT / 'LICENSES.md').read_text()
    for path in ROOT.rglob('*'):
        if not path.is_file() or '__pycache__' in path.parts:
            continue
        contents = path.read_bytes()
        assert len(contents) <= 150000, path
        assert f'`{path.name}`' in licenses, (path.name, 'missing license/source row')
        total += len(contents)
        if path.suffix == '.json':
            json.loads(contents)
        elif path.suffix == '.py':
            ast.parse(contents.decode())
        elif path.suffix in ('.html', '.mjs', '.md'):
            contents.decode('utf-8')
    assert total <= 2000000, total
    assert max(r['lufs'] for r in rows) - min(r['lufs'] for r in rows) <= 1.2
    result = {'files': rows, 'audioBytes': sum(r['bytes'] for r in rows),
              'folderBytesAtVerification': total, 'status': 'PASS'}
    if '--write' in sys.argv:
        (ROOT / 'measurements.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f'PASS: {len(rows)} decoded files; audio {result["audioBytes"]:,} B; folder {total:,} B')


if __name__ == '__main__':
    main()
