#!/usr/bin/env python3
"""Verify delivery constraints and manifest integrity without writing assets."""
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent


def verify():
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    assets = {a['id']: a for a in manifest['assets']}
    assert len(assets) == 39, 'Missing or duplicate asset IDs'
    required = {'star-empty', 'star-half', 'star-full', 'medal-bronze', 'medal-silver', 'medal-gold', 'medal-diamond', 'trophy', 'badge-new-record', 'progress-track', 'progress-fill', 'panel-background', 'panel-border', 'coin', 'coins', 'gift-closed', 'gift-open'}
    required |= {f'button-{kind}-{state}' for kind in ['primary', 'secondary'] for state in ['default', 'pressed', 'disabled']}
    assert required <= assets.keys()
    expected = set()
    for asset in assets.values():
        assert asset['textEmbedded'] is False
        assert (asset['width'], asset['height']) == (256, 256)
        assert asset['license'] == 'CC0-1.0'
        for fmt, relative in asset['files'].items():
            path = ROOT / relative
            assert path.resolve().is_relative_to(ROOT)
            expected.add(path)
            data = path.read_bytes()
            export = asset['exports'][fmt]
            assert export['bytes'] == len(data)
            assert export['sha256'] == hashlib.sha256(data).hexdigest(), relative
            if fmt == 'svg':
                svg = ET.fromstring(data)
                assert svg.attrib['viewBox'] == '0 0 256 256'
                assert svg.attrib['width'] == svg.attrib['height'] == '256'
                for element in svg.iter():
                    name = element.tag.split('}')[-1]
                    assert name not in {'text', 'script', 'foreignObject', 'image', 'animate', 'set'}
                    for key, value in element.attrib.items():
                        assert not key.lower().startswith('on')
                        if key.endswith('href'):
                            assert value.startswith('#')
                        assert 'http:' not in value and 'https:' not in value
            else:
                with Image.open(path) as im:
                    assert im.size == (256, 256)
                    assert im.mode == 'RGBA', (relative, im.mode)
                    assert im.getpixel((0, 0))[3] == 0
                    assert im.getchannel('A').getextrema() == (0, 255)
                    if 'nineSlice' not in asset:
                        left, top, right, bottom = im.getbbox()
                        assert min(left, top, 256-right, 256-bottom) >= 4, f'Clipped icon or animation: {relative}'
        if asset['role'] == 'button-surface':
            assert asset['minTouchPx'] >= 56
        if 'nineSlice' in asset:
            top, right, bottom, left = asset['nineSlice']['insets']
            assert top + bottom < 256 and left + right < 256
    actual = set((ROOT / 'svg').glob('*.svg')) | set((ROOT / 'png').glob('*.png'))
    assert expected == actual, 'Unlisted or missing export'
    for name, animation in manifest['animations'].items():
        assert len(animation['frames']) == 8
        assert len(set(animation['frames'])) == 8
        assert animation['iterations'] == 1
        assert animation['frameDurationMs'] * 8 == animation['durationMs']
        assert animation['reducedMotionAsset'] in assets
        assert len({assets[id_]['exports']['png']['sha256'] for id_ in animation['frames']}) == 8
    for a, b in [('star-light-00', 'star-empty'), ('star-light-07', 'star-full'), ('gift-open-00', 'gift-closed'), ('gift-open-07', 'gift-open')]:
        assert assets[a]['exports'] == assets[b]['exports'], f'Endpoint mismatch: {a}'
    empty = Image.open(ROOT / assets['star-empty']['files']['png'])
    half = Image.open(ROOT / assets['star-half']['files']['png'])
    assert ImageChops.difference(empty.convert('RGB').crop((40, 40, 120, 215)), half.convert('RGB').crop((40, 40, 120, 215))).getbbox() is None
    # Compare RGB explicitly: RGBA getbbox checks alpha as well and can miss RGB changes.
    assert ImageChops.difference(empty.convert('RGB').crop((140, 40, 215, 215)), half.convert('RGB').crop((140, 40, 215, 215))).getbbox() is not None
    files = [p for p in ROOT.rglob('*') if p.is_file()]
    for file in files:
        assert file.stat().st_size <= 300000, f'Oversize delivery file: {file}'
    report = {'passed': True, 'assetPairs': len(assets), 'exports': len(expected), 'pngDimensions': [256, 256], 'frameCounts': {k: len(v['frames']) for k, v in manifest['animations'].items()}, 'maxAllowedFileBytes': 300000, 'largestAssetBytes': manifest['totals']['largestAssetBytes'], 'checks': ['required inventory', 'SVG XML safety and no embedded text', 'PNG RGBA dimensions and transparency', 'unclipped icons and animation with 4px minimum canvas margin', 'SHA-256 and byte counts', 'eight distinct animation frames', 'identical animation endpoints', 'right-to-left half star', 'nine-slice insets', 'all delivery files <= 300000 bytes']}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return report


if __name__ == '__main__':
    verify()
