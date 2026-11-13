#!/usr/bin/env python3
"""Original CC0 palettes and font-free number plates; Python standard library only."""
import hashlib
import json
from pathlib import Path
import re
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
ISLAND = ROOT.parents[1]
MODEL = ISLAND / 'assets/racing-formula/formula.glb'
CORE = ISLAND / 'minigames/racing-league-core.mjs'
SECONDARY = {
    'flame': '#501d25', 'ocean': '#064850', 'gold': '#594014',
    'silver': '#304452', 'forest': '#234a36', 'night': '#35224f',
}
STRIPE = {'gold': '#182532', 'silver': '#182532', 'forest': '#182532'}
# Original seven-segment polygons, not glyphs from a font or a third-party asset.
SEGMENTS = [
    [(13, 4), (59, 4), (65, 10), (56, 18), (17, 18), (8, 10)],
    [(61, 16), (68, 10), (68, 57), (61, 64), (54, 57), (54, 23)],
    [(61, 69), (68, 76), (68, 123), (61, 129), (54, 122), (54, 77)],
    [(17, 124), (56, 124), (65, 132), (59, 138), (13, 138), (8, 132)],
    [(4, 76), (11, 69), (18, 77), (18, 122), (11, 129), (4, 123)],
    [(4, 10), (11, 16), (18, 23), (18, 57), (11, 64), (4, 57)],
    [(14, 64), (58, 64), (65, 71), (58, 78), (14, 78), (7, 71)],
]
DIGITS = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc',
          'afgcd', 'afgecd', 'abc', 'abcdefg', 'abfgcd']


def rgb(value):
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


def plate(number, primary, secondary):
    """Rasterise original polygons at 2x, then average down to 512px RGBA."""
    side = 1024
    pixels = bytearray(side * side * 4)

    def polygon(points, color):
        points = [(x * 2, y * 2) for x, y in points]
        for y in range(max(0, int(min(p[1] for p in points))),
                       min(side, int(max(p[1] for p in points)) + 1)):
            line = y + .5
            cross = []
            for a, b in zip(points, points[1:] + points[:1]):
                if (a[1] <= line < b[1]) or (b[1] <= line < a[1]):
                    cross.append(a[0] + (line - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
            cross.sort()
            for left, right in zip(cross[::2], cross[1::2]):
                lo, hi = max(0, int(left + .5)), min(side, int(right + .5))
                pixels[(y * side + lo) * 4:(y * side + hi) * 4] = bytes(color) * (hi - lo)

    polygon([(36, 122), (476, 122), (492, 138), (492, 374),
             (476, 390), (36, 390), (20, 374), (20, 138)], rgb('#f7f2e8'))
    polygon([(20, 349), (492, 349), (492, 374), (476, 390),
             (36, 390), (20, 374)], rgb(secondary))
    polygon([(40, 355), (124, 355), (124, 382), (40, 382)], rgb(primary))
    text = str(number)
    scale = 1.32
    total = len(text) * 72 * scale + (len(text) - 1) * 15
    start = (512 - total) / 2
    for index, digit in enumerate(text):
        for segment in DIGITS[int(digit)]:
            pts = SEGMENTS[ord(segment) - ord('a')]
            polygon([(start + index * (72 * scale + 15) + x * scale,
                      151 + y * scale) for x, y in pts], rgb('#14202c'))
    raw = bytearray()
    for y in range(512):
        raw.append(0)
        for x in range(512):
            offsets = [((y * 2 + dy) * side + x * 2 + dx) * 4
                       for dy in (0, 1) for dx in (0, 1)]
            # Straight-alpha RGB avoids dark fringes at transparent edges.
            alpha = sum(pixels[o + 3] for o in offsets)
            for channel in range(3):
                raw.append(round(sum(pixels[o + channel] * pixels[o + 3]
                                     for o in offsets) / alpha) if alpha else 0)
            raw.append(round(alpha / 4))

    def chunk(kind, content):
        return struct.pack('>I', len(content)) + kind + content + struct.pack('>I', zlib.crc32(kind + content))

    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 512, 512, 8, 6, 0, 0, 0))
            + chunk(b'sRGB', b'\0') + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def main():
    core = CORE.read_text()
    team_block = core.split('export const TEAMS = Object.freeze([')[1].split('].map')[0]
    driver_block = core.split('export const GRID_DRIVERS = Object.freeze([')[1].split('].map')[0]
    drivers = dict(re.findall(r"id: '([^']+)', name: '[^']+', number: (\d+)", driver_block))
    teams = re.findall(r"id: '([^']+)', name: '([^']+)', color: '(#[a-f0-9]+)', drivers: \['([^']+)', '([^']+)'\]", team_block)
    if len(teams) != 6:
        raise ValueError('Expected the six league teams')
    manifest = {
        'version': 1, 'license': 'CC0-1.0',
        'source': 'Original palettes and polygon number art authored for this package',
        'model': '../../assets/racing-formula/formula.glb',
        'modelSha256': hashlib.sha256(MODEL.read_bytes()).hexdigest(),
        'leagueSource': '../../minigames/racing-league-core.mjs',
        'coordinates': {'up': '+Y', 'forward': '+Z', 'unit': 'metre'},
        'mapping': {
            'material': 'Paint 1', 'primaryNodes': ['Body'],
            'secondaryNodes': ['FrontWing', 'RearWing', 'EngineFin'],
            'bodySecondary': {'maxY': .24, 'minAbsX': .28, 'feather': .04},
            'stripeNodes': ['Body', 'FrontWing', 'RearWing'],
            'stripeAxis': 'X', 'stripeCenter': 0,
            'numberProjections': [
                {'part': 'Body', 'face': 'top', 'center': [0, 1.35], 'size': [.24, .52]},
                {'part': 'Body', 'face': 'both-sides', 'center': [-.40, .38], 'size': [.64, .50]},
                {'part': 'RearWing', 'face': 'endplates', 'center': [-2.055, .91], 'size': [.46, .54]},
            ],
            'note': 'Object-space paint, no UV atlas. Only cloned materials change; geometry, nodes, pivots and GLB bytes stay intact.',
        },
        'teams': [],
    }
    for team_id, name, primary, first, second in teams:
        secondary = SECONDARY[team_id]
        palette = {
            'id': team_id, 'name': name, 'license': 'CC0-1.0',
            'primary': primary, 'secondary': secondary,
            'stripe': STRIPE.get(team_id, '#f7f2e8'),
            'pinstripe': '#f7f2e8' if team_id in STRIPE else secondary,
            'finish': {'metalness': .36, 'roughness': .29, 'clearcoat': .8, 'clearcoatRoughness': .16},
            'cars': [],
        }
        for index, driver in enumerate((first, second)):
            number = int(drivers[driver])
            filename = f'numbers/{team_id}-{number}.png'
            (ROOT / filename).write_bytes(plate(number, primary, secondary))
            palette['cars'].append({
                'driverId': driver, 'number': number, 'variant': 'A' if index == 0 else 'B',
                'stripeWidth': .070 if index == 0 else .100,
                'pinstripeWidth': .008 if index == 0 else .012,
                'numberPlate': filename,
            })
        path = f'palettes/{team_id}.json'
        write_json(ROOT / path, palette)
        manifest['teams'].append({'id': team_id, 'palette': path})
    write_json(ROOT / 'manifest.json', manifest)
    print('Generated six team palettes and twelve original 512x512 number plates.')


if __name__ == '__main__':
    main()
