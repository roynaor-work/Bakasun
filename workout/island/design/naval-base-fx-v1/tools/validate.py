#!/usr/bin/env python3
"""Validate delivered media, transparent guards, loop seam and decoded audio."""
import hashlib
import json
import numpy as np
from PIL import Image
from generate import ROOT, measure, command, smoke_frame


def main():
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    report = {'atlases': {}, 'audio': {}, 'sha256': {}}
    for name, spec in manifest['sprites'].items():
        pixels = np.array(Image.open(ROOT / spec['image']))
        assert pixels.shape == (spec['height'], spec['width'], 4), (name, pixels.shape)
        assert spec['columns'] * spec['rows'] == spec['frames']
        assert abs(spec['frames'] / spec['fps'] - spec['durationSeconds']) < 1e-8
        frames = []
        for i in range(spec['frames']):
            x, y = i % spec['columns'] * 128, i // spec['columns'] * 128
            frame = pixels[y:y+128, x:x+128]
            alpha = frame[:, :, 3]
            assert not np.any(alpha[:8]) and not np.any(alpha[-8:]), (name, i, 'vertical guard')
            assert not np.any(alpha[:, :8]) and not np.any(alpha[:, -8:]), (name, i, 'horizontal guard')
            assert not np.any(frame[alpha == 0, :3]), (name, i, 'hidden RGB')
            frames.append(frame)
        if name == 'smoke':
            assert all(np.any(f[:, :, 3]) for f in frames), 'every smoke phase must contain a puff'
        else:
            assert np.any(frames[0][:, :, 3]), 'one-shot must start with a visible ignition'
        assert np.any((pixels[:, :, 3] > 0) & (pixels[:, :, 3] < 255))
        if not spec['loop']:
            assert not np.any(frames[-1][:, :, 3]), (name, 'one-shot must end transparent')
        result = {'dimensions': [spec['width'], spec['height']], 'frames': len(frames),
                  'nonemptyFrames': sum(bool(np.any(f[:, :, 3])) for f in frames), 'transparentGuardPixels': 8,
                  'bytes': (ROOT / spec['image']).stat().st_size}
        if name == 'smoke':
            def premultiply(f):
                a = f[:, :, 3:4].astype(float) / 255
                return np.concatenate((f[:, :, :3] * a, f[:, :, 3:4]), axis=2)
            changes = [float(np.mean(np.abs(premultiply(frames[(i + 1) % 16]) - premultiply(frames[i])))) for i in range(16)]
            assert np.array_equal(np.array(smoke_frame(0)), np.array(smoke_frame(1))), 'analytic phase must be periodic'
            assert changes[-1] <= max(changes[:-1]) * 1.5, changes
            assert len({f.tobytes() for f in frames}) == 16, 'all smoke frames must be distinct'
            result.update({'phase0EqualsPhase1': True, 'premultipliedFrameDeltaMean': changes,
                           'seamToMeanDeltaRatio': changes[-1] / np.mean(changes[:-1])})
        report['atlases'][name] = result
    for source in manifest['audio']['sources']:
        path = ROOT / source['file']
        stats = measure(path)
        metadata = json.loads(command(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]).stdout)
        stream = metadata['streams'][0]
        assert int(stream['sample_rate']) == 44100 and stream['channels'] == 1
        assert abs(float(stats['input_i']) + 16) <= .1, stats
        assert float(stats['input_tp']) <= -1, stats
        report['audio'][path.name] = {'sampleRate': 44100, 'channels': 1, 'codec': stream['codec_name'],
                                     'integratedLufs': float(stats['input_i']), 'truePeakDbtp': float(stats['input_tp']),
                                     'bytes': path.stat().st_size}
    for path in sorted(ROOT.rglob('*')):
        if path.is_file() and path.suffix in ('.png', '.mp3', '.ogg'):
            report['sha256'][path.relative_to(ROOT).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    assert sum(spec['width'] * spec['height'] * 4 for spec in manifest['sprites'].values()) == manifest['budget']['residentRgba8Bytes']
    (ROOT / 'verification/asset-checks.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
