#!/usr/bin/env python3
"""Inspect delivered pixels, atlas crops, checksums and decoded audio, offline."""
from pathlib import Path
from collections import Counter
import hashlib
import json
import subprocess

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent


def main():
    m = json.loads((ROOT / 'manifest.json').read_text())
    checks = 0
    def require(condition, message):
        nonlocal checks
        if not condition:
            raise AssertionError(message)
        checks += 1
    def inspect(entry, limit):
        path = (ROOT / entry['path']).resolve()
        require(path.is_relative_to(ROOT), f'Unsafe path: {path}')
        require(path.is_file(), f'Missing: {path}')
        require(path.stat().st_size == entry['bytes'] <= limit, f'Budget/size: {path.name}')
        require(hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256'], f'Hash: {path.name}')
        return path
    atlas_images = {}
    for atlas in m['atlases']:
        im = Image.open(inspect(atlas, 600000)).convert('RGBA')
        require(im.size == (1024, 1024), 'Atlas dimensions')
        atlas_images[atlas['id']] = im
    unique = set()
    for fid, frame in m['frames'].items():
        im = Image.open(inspect(frame, 600000)).convert('RGBA')
        require(im.size == (256, 256), f'Sprite dimensions: {fid}')
        a = np.array(im.getchannel('A'))
        require(np.any(a > 32), f'Empty sprite: {fid}')
        require(np.mean(a == 0) > .20, f'Missing transparency: {fid}')
        require(not (a[:4].any() or a[-4:].any() or a[:, :4].any() or a[:, -4:].any()), f'Clipped sprite: {fid}')
        r = frame['rect']
        require(r['w'] == r['h'] == 256 and r['x'] % 256 == r['y'] % 256 == 0, f'Cell: {fid}')
        require(0 <= r['x'] <= 768 and 0 <= r['y'] <= 768, f'Out of atlas: {fid}')
        crop = atlas_images[frame['atlas']].crop((r['x'], r['y'], r['x']+256, r['y']+256))
        require(crop.tobytes() == im.tobytes(), f'Atlas differs from standalone: {fid}')
        require(all(0 <= p <= 1 for p in frame['pivot']), f'Pivot: {fid}')
        unique.add(hashlib.sha256(im.tobytes()).hexdigest())
    require(len(unique) >= len(m['frames']) - 1, 'Duplicate artwork')
    expected = {'muzzle': 6, 'boar-fall': 4, 'boar-side-hit': 3, 'boar-idle': 1}
    for key, animation in m['animations'].items():
        require(len(animation['frames']) == len(animation['frameDurationsMs']), f'Timing count: {key}')
        require(sum(animation['frameDurationsMs']) == animation['durationMs'], f'Duration: {key}')
        require(all(t > 0 for t in animation['frameDurationsMs']), f'Positive timing: {key}')
        require(all(f in m['frames'] for f in animation['frames']), f'Frame reference: {key}')
        require(animation['sound'] is None or animation['sound'] in m['audio']['sounds'], f'Sound reference: {key}')
        if key in expected:
            require(len(animation['frames']) == expected[key], f'Required count: {key}')
    for prefix, count in [('hit-', 4), ('projectile-', 3), ('miss-', 3)]:
        require(sum(key.startswith(prefix) for key in m['animations']) == count, f'Variant count: {prefix}')
    sounds = m['audio']['sounds']
    require(Counter(s['group'] for s in sounds.values()) == {'shot':3,'hit':4,'miss':1,'fall':1,'voice':5}, 'Required audio inventory')
    audio_results = []
    for cue in sounds.values():
        require(set(cue['formats']) == {'ogg', 'mp3'}, 'Required audio formats')
        require(sum(f['bytes'] for f in cue['formats'].values()) <= 60000, f'Cue pair budget: {cue["id"]}')
        for fmt, entry in cue['formats'].items():
            path = inspect(entry, 60000)
            probe = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',str(path)]))['streams'][0]
            require(probe['codec_name'] == {'ogg':'vorbis','mp3':'mp3'}[fmt], f'Codec: {path.name}')
            require(probe['channels'] == 1 and int(probe['sample_rate']) == 22050, f'Audio format: {path.name}')
            pcm = np.frombuffer(subprocess.check_output(['ffmpeg','-nostdin','-v','error','-i',str(path),'-f','f32le','-acodec','pcm_f32le','-']), dtype='<f4')
            require(np.isfinite(pcm).all() and .03 < np.max(np.abs(pcm)) < .65, f'Decoded peak: {path.name}')
            duration = len(pcm) / 22050
            require(abs(duration - cue['durationMs'] / 1000) < .10, f'Decoded duration: {path.name}')
            require(abs(pcm.mean()) < .005, f'DC offset: {path.name}')
            require(np.sqrt(np.mean(pcm[-110:] ** 2)) < .02, f'End click: {path.name}')
            audio_results.append({'path':entry['path'],'bytes':entry['bytes'],'decodedDurationMs':round(duration*1000),
                                  'peakDbFS':round(float(20*np.log10(np.max(np.abs(pcm)))),2)})
    source=m['provenance']['boar']['source']
    inspect(source, 3000000)
    report={'passed':True,'checks':checks,'sprites':len(m['frames']),'atlases':len(m['atlases']),
            'atlasBytes':sum(a['bytes'] for a in m['atlases']), 'atlasMaxBytes':max(a['bytes'] for a in m['atlases']),
            'spriteMaxBytes':max(f['bytes'] for f in m['frames'].values()),
            'sounds':len(sounds),'audioFiles':len(audio_results),
            'audioMaxBytes':max(a['bytes'] for a in audio_results),
            'cuePairMaxBytes':max(sum(f['bytes'] for f in s['formats'].values()) for s in sounds.values()),
            'audioTotalBytes':sum(a['bytes'] for a in audio_results),'audio':audio_results}
    (ROOT/'verification/assets.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k!='audio'},indent=2))


if __name__=='__main__':
    main()
