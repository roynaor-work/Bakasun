#!/usr/bin/env python3
"""Validate the deliverable contract, decoded pixels, UV cells and mobile budgets."""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def main():
    m = json.loads((ROOT/'manifest.json').read_text())
    wrapped = (ROOT/'manifest.js').read_text().split('window.RACING_FX_MANIFEST = ', 1)[1].rstrip().removesuffix(';')
    assert json.loads(wrapped) == m, 'Browser manifest must match the JSON contract'
    expected = {'turbo-low':8,'turbo-medium':8,'turbo-high':8,'tire-drift':6,'tire-brake':6,
                'skid-marks':1,'wall-sparks':4,'road-dust':8,'gear-shift':4,'grass-rustle':8}
    assert {e['id']:e['frameCount'] for e in m['effects']} == expected
    checks, seen_files, alpha_masses = [], set(), {}
    for effect in m['effects']:
        path = ROOT/effect['atlas']
        assert path.stat().st_size == effect['atlasBytes'] <= 600000
        assert hashlib.sha256(path.read_bytes()).hexdigest() == effect['atlasSha256']
        with Image.open(path) as image:
            assert image.format == 'PNG' and image.mode == 'RGBA' and image.size == (1024,1024)
            atlas = np.array(image)
        occupied = np.zeros((1024,1024), dtype=bool)
        frame_hashes, masses, changes = [], [], []
        previous = None
        for i, frame in enumerate(effect['frames']):
            assert i == frame['index']
            path = ROOT/frame['file']
            assert path.is_relative_to(ROOT) and path.suffix == '.png'
            assert frame['file'] not in seen_files
            seen_files.add(frame['file'])
            assert path.stat().st_size == frame['bytes']
            assert hashlib.sha256(path.read_bytes()).hexdigest() == frame['sha256']
            with Image.open(path) as image:
                assert image.format == 'PNG' and image.mode == 'RGBA' and image.size == (256,256)
                pixels = np.array(image)
            x,y,w,h = frame['rect']
            assert [x,y,w,h] == [i%4*256,i//4*256,256,256]
            assert np.array_equal(pixels, atlas[y:y+h,x:x+w]), 'Atlas must preserve exact RGBA pixels'
            occupied[y:y+h,x:x+w] = True
            alpha = pixels[...,3]
            assert np.count_nonzero(alpha) > 100
            assert np.any((alpha>0)&(alpha<255)), 'Soft, genuine alpha required'
            assert not np.any(alpha[:8]) and not np.any(alpha[-8:])
            assert not np.any(alpha[:,:8]) and not np.any(alpha[:,-8:])
            assert not np.any(pixels[alpha==0]), 'Transparent pixels must not contain hidden imagery'
            if effect['id']=='gear-shift':
                assert not np.any(alpha[:,82:174]), 'Central 36% must remain clear'
            masses.append(int(alpha.astype(np.uint64).sum()))
            frame_hashes.append(hashlib.sha256(pixels.tobytes()).hexdigest())
            if previous is not None:
                changes.append(float(np.abs(pixels[...,3].astype(float)-previous).mean()))
            previous = pixels[...,3].astype(float)
        assert not np.any(atlas[~occupied]), 'Unused atlas cells must be transparent black'
        assert len(set(frame_hashes)) == effect['frameCount'], 'Frames/variants must be distinct'
        if effect['playback']=='loop':
            first=np.array(Image.open(ROOT/effect['frames'][0]['file']))[...,3].astype(float)
            seam=float(np.abs(previous-first).mean())
            assert seam <= max(changes)*1.25, 'Cyclic phase seam must be comparable to adjacent steps'
        else:
            seam=None
        if effect['id'] in ['tire-brake','tire-drift','road-dust']:
            assert masses[-1] < masses[0]*.45, 'Cloud must dissipate'
        alpha_masses[effect['id']]=sum(masses)/len(masses)
        checks.append({'id':effect['id'],'frames':effect['frameCount'],'atlasBytes':effect['atlasBytes'],
                       'budgetUsedPercent':round(effect['atlasBytes']/6000,2), 'alphaMassPerFrame':masses,
                       'loopSeamMeanAlphaDifference':seam,'adjacentMeanAlphaDifferences':changes})
    assert alpha_masses['turbo-low'] < alpha_masses['turbo-medium'] < alpha_masses['turbo-high']
    assert len(seen_files)==61
    actual_pngs={p.relative_to(ROOT).as_posix() for p in (ROOT/'frames').rglob('*.png')}
    assert actual_pngs == seen_files
    tiers={}
    for name,tier in m['qualityTiers'].items():
        assert set(tier['effects']) <= set(expected)
        assert len(tier['effects']) == tier['maxResidentAtlases']
        assert tier['maxResidentAtlases']*4194304 == tier['maxGpuBytesRGBA8']
        assert sum(tier['instanceCaps'].values()) == tier['maxActiveInstances']
        assert set(tier['instanceCaps']) == set(tier['effects'])
        tiers[name]={'downloadBytes':sum(e['atlasBytes'] for e in m['effects'] if e['id'] in tier['effects']),
                     'residentGpuMiB':tier['maxGpuBytesRGBA8']//1048576,'maxActiveInstances':tier['maxActiveInstances']}
    result={'status':'PASS','atlasCount':len(checks),'frameCount':len(seen_files),
            'totalAtlasBytes':sum(e['atlasBytes'] for e in m['effects']),
            'totalFrameBytes':sum(f['bytes'] for e in m['effects'] for f in e['frames']),
            'maxAtlasBytes':max(e['atlasBytes'] for e in m['effects']),
            'checks':['PNG format, RGBA8 and exact sizes','SHA-256 and byte counts','61 distinct authored frames',
                      'pixel-identical atlas extraction','8px transparent gutters','empty unused cells',
                      'clear gear-shift center','cloud dissipation','turbo intensity ordering and cyclic seam',
                      'matching browser manifest','mobile resident GPU/instance budgets'],
            'effects':checks,'qualityTiers':tiers}
    (ROOT/'verification'/'assets.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in ['effects','checks']},indent=2))


if __name__=='__main__':
    main()
