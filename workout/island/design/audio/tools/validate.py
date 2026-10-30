"""Check delivered encoded assets, not just synthesis sources. CC0-1.0."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess

import numpy as np

from generate import loudness

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    'soccer': 'kick net whistle pass crowd-calm crowd-excited crowd-goal ambience-loop',
    'basketball': 'bounce swish rim shoes buzzer crowd-calm crowd-excited ambience-loop',
    'ski': 'scrape-slow scrape-medium scrape-fast wind jump landing fall slalom-gate ambience-loop',
    'scenes': 'opening victory defeat',
}


def db(x):
    return 20 * math.log10(max(float(x), 1e-12))


def rms(x):
    return float(np.sqrt(np.mean(x * x)))


def validate(ffmpeg):
    manifest = json.loads((ROOT / 'mix.json').read_text(encoding='utf-8'))
    assets = manifest['assets']
    expected = {group + '/' + name for group, names in EXPECTED.items() for name in names.split()}
    assert set(assets) == expected, 'Missing or unexpected asset IDs'
    assert {str(p.relative_to(ROOT)).replace('\\', '/') for p in ROOT.rglob('*.ogg')} == {x + '.ogg' for x in expected}
    measurements = {}
    for ident, asset in assets.items():
        path = ROOT / asset['file']
        encoded = path.read_bytes()
        assert encoded.startswith(b'OggS')
        head = encoded.index(b'OpusHead')
        assert encoded[head + 9] == 1, f'{ident}: not mono'
        assert struct.unpack_from('<I', encoded, head + 12)[0] == 48000
        assert asset['bytes'] == len(encoded)
        assert asset['sha256'] == hashlib.sha256(encoded).hexdigest()
        result = subprocess.run([ffmpeg, '-v', 'error', '-nostdin', '-i', str(path),
                                 '-f', 'f32le', '-c:a', 'pcm_f32le', '-ar', '48000', '-'],
                                check=True, capture_output=True)
        assert not result.stderr, f'{ident}: decode error'
        pcm = np.frombuffer(result.stdout, dtype='<f4').astype(np.float64)
        assert np.isfinite(pcm).all()
        assert len(pcm) == round(asset['duration_seconds'] * 48000), f'{ident}: padding/duration mismatch'
        assert np.max(np.abs(pcm)) < 1, f'{ident}: clipping'
        level = loudness(ffmpeg, path)
        integrated, truepeak = float(level['input_i']), float(level['input_tp'])
        assert abs(integrated + 23) <= .3, f'{ident}: {integrated} LUFS'
        assert truepeak <= -3, f'{ident}: {truepeak} dBTP'
        assert abs(integrated - asset['measured_lufs_i']) < .02
        assert abs(truepeak - asset['measured_true_peak_dbtp']) < .02
        assert 0 < asset['filters']['highpass_hz'] < asset['filters']['lowpass_hz'] < 24000
        assert abs(asset['recommended_gain_linear'] - 10 ** (asset['recommended_gain_db'] / 20)) < 1e-6
        row = {'duration_seconds': len(pcm) / 48000, 'bytes': len(encoded),
               'integrated_lufs': integrated, 'true_peak_dbtp': truepeak,
               'sample_peak_dbfs': round(db(np.max(np.abs(pcm))), 3),
               'dc_dbfs': round(db(abs(np.mean(pcm))), 3), 'clipped_samples': 0,
               'sha256': asset['sha256']}
        assert db(abs(np.mean(pcm))) < -50, f'{ident}: DC'
        if asset['loop']:
            assert 20 <= len(pcm) / 48000 <= 40
            assert asset['loop_start_seconds'] == 0
            assert asset['loop_end_seconds'] == asset['duration_seconds']
            jump = abs(pcm[0] - pcm[-1])
            slope_jump = abs((pcm[1] - pcm[0]) - (pcm[-1] - pcm[-2]))
            # Repeat decoded PCM 3 times; measure seam neighborhood and 4x true peak.
            tiled = np.tile(pcm, 3)
            seam = np.r_[pcm[-2400:], pcm[:2400]]
            nearby = np.r_[pcm[-7200:-2400], pcm[2400:7200]]
            delta = db(rms(seam) / rms(nearby))
            assert db(jump) <= -65, f'{ident}: seam discontinuity {db(jump)} dBFS'
            assert db(slope_jump) <= -60, f'{ident}: seam slope discontinuity'
            assert -4 <= delta <= 4, f'{ident}: seam energy dip/spike {delta} dB'
            repeat = subprocess.run([ffmpeg, '-v', 'info', '-nostdin', '-f', 'f32le',
                                    '-ar', '48000', '-ac', '1', '-i', '-', '-af',
                                    'loudnorm=I=-23:TP=-3:LRA=7:print_format=json', '-f', 'null', '-'],
                                   input=tiled.astype('<f4').tobytes(), capture_output=True, check=True)
            msg = repeat.stderr.decode()
            repeated_level = json.loads(msg[msg.rfind('{'):msg.rfind('}') + 1])
            assert float(repeated_level['input_tp']) <= -3
            row['loop_seam'] = {'jump_dbfs': round(db(jump), 3),
                                'slope_jump_dbfs': round(db(slope_jump), 3),
                                '100ms_energy_delta_db': round(delta, 3),
                                'three_repeats_true_peak_dbtp': float(repeated_level['input_tp'])}
        else:
            assert .4 <= len(pcm) / 48000 <= 3
            assert max(abs(pcm[0]), abs(pcm[-1])) < .003, f'{ident}: hard edge'
        measurements[ident] = row
    for group in manifest['exclusive_groups'].values():
        assert set(group) <= expected
    for layer in manifest['layers'].values():
        refs = layer.get('events', []) + layer.get('alternatives', []) + layer.get('exclude', [])
        refs += [e['asset'] for e in layer.get('timeline', [])]
        refs += [layer['bed']] if 'bed' in layer else []
        refs += [layer['resume_group_on']] if 'resume_group_on' in layer else []
        assert set(refs) <= expected
        assert 'mute_group' not in layer or layer['mute_group'] in manifest['exclusive_groups']
    # Conservative coherent sum: highest true peaks aligned, before optional EQ/ducking.
    events, beds = [], []
    for asset in assets.values():
        peak = 10 ** ((asset['measured_true_peak_dbtp'] + asset['recommended_gain_db']) / 20)
        if asset['loop']:
            beds.append(peak)
        else:
            events.extend([peak] * asset['max_voices'])
    bound = db(sum(sorted(events, reverse=True)[:3]) + max(beds)) + manifest['master']['recommended_gain_db']
    assert bound <= -1, f'Mix headroom bound: {bound} dBTP'
    audio_bytes = sum(x['bytes'] for x in measurements.values())
    package_bytes = sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file() and '__pycache__' not in p.parts)
    assert package_bytes <= 2_000_000, f'Package budget: {package_bytes}'
    return {'status': 'PASS', 'asset_count': len(assets), 'background_loops': 3,
            'audio_bytes': audio_bytes, 'package_bytes_at_validation': package_bytes,
            'package_budget_bytes': 2_000_000,
            'normalization_spread_lu': round(max(x['integrated_lufs'] for x in measurements.values()) - min(x['integrated_lufs'] for x in measurements.values()), 3),
            'worst_case_recommended_mix_bound_dbtp': round(bound, 3),
            'ffmpeg_version': subprocess.run([ffmpeg, '-version'], capture_output=True, check=True).stdout.decode().splitlines()[0],
            'assets': measurements}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    report = validate(args.ffmpeg)
    if args.report:
        args.report.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'assets'}, indent=2))


if __name__ == '__main__':
    main()
