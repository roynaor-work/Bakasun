#!/usr/bin/env python3
"""Deterministic original racing sprites. Python 3.12, numpy, Pillow.

All shapes are authored here; no downloaded, generated-model, or existing images
are inputs. Work is restricted to this package, relative to this script.
"""
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SIZE, SUPER, ATLAS = 256, 2, 1024
Y, X = np.mgrid[0:SIZE * SUPER, 0:SIZE * SUPER].astype(float) / SUPER
TAU = math.tau


def field_image(alpha, color):
    alpha = np.clip(alpha, 0, 1)
    # Leave a guaranteed eight-pixel transparent gutter in every 256px cell.
    gutter = np.clip(np.minimum.reduce([X - 8, 247 - X, Y - 8, 247 - Y]) / 6, 0, 1)
    alpha *= gutter
    rgba = np.zeros((*alpha.shape, 4), dtype=np.uint8)
    rgba[..., :3] = np.clip(color, 0, 255).astype(np.uint8)
    rgba[..., 3] = np.rint(alpha * 255).astype(np.uint8)
    return finish(Image.fromarray(rgba))


def finish(image):
    image = image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    a = np.array(image)
    a[:8] = a[-8:] = 0
    a[:, :8] = a[:, -8:] = 0
    a[a[..., 3] == 0] = 0
    return Image.fromarray(a)


def flame(index, strength):
    phase = TAU * index / 8
    length = [111, 155, 197][strength] * (1 + .035 * math.sin(phase))
    u = (X - 34) / length
    mid = 128 + np.sin(u * 12 - phase) * (3 + 5 * np.clip(u, 0, 1))
    width = (15 + strength * 5) * np.maximum(0, 1 - u) ** .65
    width *= 1 + .17 * np.sin(18 * u - phase) + .1 * np.cos(31 * u + phase)
    distance = np.abs(Y - mid) / np.maximum(1, width)
    gate = np.clip((X - 27) / 9, 0, 1) * np.clip((1.03 - u) * 18, 0, 1)
    hot = np.exp(-distance ** 2.6 * 1.5)
    glow = np.exp(-distance ** 2 * .28) * .15
    tongues = np.clip(1 + .12 * np.sin(u * 35 + distance * 3 - phase), 0, 1)
    alpha = (hot * .94 + glow) * gate * tongues
    blue = np.clip((.36 - u) * 5, 0, 1)
    core = np.exp(-distance ** 2 * 7) * np.clip(1.5 - u, 0, 1)
    color = np.empty((*X.shape, 3))
    color[..., 0] = 255 - blue * 156 + core * 108
    color[..., 1] = 106 + blue * 96 + core * 135
    color[..., 2] = 22 + blue * 232 + core * 116
    return field_image(alpha, color)


def cloud(index, kind, count):
    t = index / (count - 1)
    rng = np.random.default_rng(713 if kind == 'dust' else 312)
    # Persistent lobe identities advect/expand coherently across the sequence.
    density = np.zeros_like(X)
    for j in range(17):
        px, py, radius, weight = rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(12, 24), rng.uniform(.23, .6)
        spread = 24 + 45 * t
        cx = 119 + px * spread + 18 * t
        cy = 185 - 68 * t + py * spread * .61
        if kind == 'brake':
            cx += px * 11
            cy += 11
        rx = radius * (.7 + 1.15 * t) * (1.25 if kind == 'brake' else 1)
        ry = radius * (.6 + 1.1 * t)
        density += np.exp(-((X-cx)/rx)**2 - ((Y-cy)/ry)**2) * weight
    detail = 1 + .12 * np.sin(X * .11 + np.sin(Y * .08) * 2 - t * 2) * np.cos(Y * .14 + t)
    alpha = (1 - np.exp(-density * .95)) * detail
    alpha *= [1, .91, .68, .42, .18, .025][index] if count == 6 else (1-t) ** .9 * .78 + .018
    if kind == 'dust':
        base = np.array([195, 158, 105])
        alpha *= .85
    elif kind == 'brake':
        base = np.array([211, 220, 225])
        alpha *= .71
    else:
        base = np.array([221, 231, 237])
        alpha *= .8
    light = 13 * np.cos(X * .022 + Y * .018) - density * 5
    color = base[None, None, :] + light[..., None]
    return field_image(alpha, color)


def canvas():
    return Image.new('RGBA', (SIZE * SUPER, SIZE * SUPER))


def line(draw, points, fill, width):
    draw.line([(round(x*SUPER), round(y*SUPER)) for x, y in points], fill=fill,
              width=max(1, round(width*SUPER)), joint='curve')


def sparks(variant):
    rng = np.random.default_rng(903 + variant * 23)
    sharp, halo = canvas(), canvas()
    d, g = ImageDraw.Draw(sharp), ImageDraw.Draw(halo)
    for j in range(20 + variant * 2):
        angle = rng.uniform(-1.05, .36) + (variant - 1.5) * .12
        distance = rng.uniform(20, 192)
        start = (40 + math.cos(angle)*distance*.36, 174 + math.sin(angle)*distance*.36)
        end = (40 + math.cos(angle)*distance, 174 + math.sin(angle)*distance)
        color = (255, int(rng.uniform(172, 229)), 82, int(rng.uniform(160, 250)))
        line(g, [start, end], (255, 122, 25, 110), 5)
        line(d, [start, end], color, rng.uniform(.6, 1.6))
        line(d, [end, (end[0]-2, end[1]+1)], (255, 252, 220, 245), 1.2)
    for radius, opacity in [(11, 55), (5, 165), (2, 255)]:
        box = [(40-radius)*SUPER, (174-radius)*SUPER, (40+radius)*SUPER, (174+radius)*SUPER]
        d.ellipse(box, fill=(255, 226, 139, opacity))
    return finish(Image.alpha_composite(halo.filter(ImageFilter.GaussianBlur(3*SUPER)), sharp))


def skid():
    rng = np.random.default_rng(849)
    alpha = np.zeros_like(X)
    # One pair of continuous grooves, with tapered ends and granular rubber.
    for center in [82, 174]:
        path = center + np.sin(Y * .032) * 1.8
        mask = np.exp(-((X - path) / 17) ** 8)
        tread = .72 + .17*np.sin(X * 2.7) + .08*np.sin(Y * .76 + X*.06)
        alpha += mask * tread
    end = np.clip((Y-22)/28, 0, 1) * np.clip((234-Y)/32, 0, 1)
    grain = rng.uniform(.75, 1, X.shape)
    alpha = np.clip(alpha * end * grain * .58, 0, .6)
    return field_image(alpha, np.broadcast_to([16, 21, 27], (*X.shape, 3)))


def gear(index):
    image, halo = canvas(), canvas()
    d, g = ImageDraw.Draw(image), ImageDraw.Draw(halo)
    # Symmetric peripheral streaks; a strict 96px central column remains empty.
    for sign in [-1, 1]:
        for j in range(9):
            y = 29 + j*24 + ((j % 3)-1)*5
            outward = index * 2
            x0 = 15 + (j*13 % 29) - outward
            x1 = x0 + 11 + (j*7 % 20)
            pts = [(x0, y), (min(77, x1), y+(128-y)*.06)]
            if sign == 1:
                pts = [(256-x, y) for x, y in pts]
            opacity = [100, 220, 154, 45][index]
            line(g, pts, (157, 222, 255, opacity//3), 4)
            line(d, pts, (215, 244, 255, opacity), 1.1 + (j % 3)*.25)
    return finish(Image.alpha_composite(halo.filter(ImageFilter.GaussianBlur(2*SUPER)), image))


def grass(index):
    t = index / 7
    rng = np.random.default_rng(633)
    image = canvas()
    d = ImageDraw.Draw(image)
    # Blades retain identities, spring back, and throw a few small cuttings.
    for j in range(26):
        x = rng.uniform(55, 202)
        height = rng.uniform(22, 61)
        lean = math.sin(t * TAU) * (22 + height*.19)
        base = 207 + rng.uniform(-10, 8)
        tip = (x + lean + rng.uniform(-9, 9), base-height)
        color = [(98, 142, 48, 220), (140, 176, 69, 225), (67, 109, 46, 230)][j % 3]
        points = [(x-2, base), (x+lean*.36-3, base-height*.62), tip, (x+lean*.36+1, base-height*.55), (x+3, base)]
        d.polygon([(round(a*SUPER), round(b*SUPER)) for a,b in points], fill=color)
        line(d, [(x, base-2), tip], (183, 200, 100, 115), .65)
    for j in range(9):
        a = rng.uniform(-2.8, -.3)
        speed = rng.uniform(40, 100)
        px = 128 + math.cos(a)*speed*t
        py = 177 + math.sin(a)*speed*t + 33*t*t
        line(d, [(px, py), (px+5+2*t, py-4)], (153, 176, 70, round(210*(1-t))), 1.7)
    return finish(image)


SPECS = [
    ('turbo-low', 'להבת טורבו · נמוכה', 8, 24, 'loop', 'additive', [34,128], lambda i: flame(i,0)),
    ('turbo-medium', 'להבת טורבו · בינונית', 8, 24, 'loop', 'additive', [34,128], lambda i: flame(i,1)),
    ('turbo-high', 'להבת טורבו · גבוהה', 8, 24, 'loop', 'additive', [34,128], lambda i: flame(i,2)),
    ('tire-drift', 'עשן צמיגים · פנייה', 6, 15, 'once', 'normal', [128,208], lambda i: cloud(i,'drift',6)),
    ('tire-brake', 'עשן צמיגים · בלימה', 6, 18, 'once', 'normal', [128,208], lambda i: cloud(i,'brake',6)),
    ('skid-marks', 'סימני גלגל על אספלט', 1, 0, 'static', 'normal', [128,128], lambda i: skid()),
    ('wall-sparks', 'ניצוצות חיכוך · 4 וריאציות', 4, 0, 'random-variant', 'additive', [40,174], sparks),
    ('road-dust', 'אבק בשולי המסלול', 8, 16, 'once', 'normal', [128,208], lambda i: cloud(i,'dust',8)),
    ('gear-shift', 'שינוי הילוך · קווי קצה', 4, 30, 'once', 'additive', [128,128], gear),
    ('grass-rustle', 'רשרוש עשב', 8, 20, 'once', 'normal', [128,208], grass),
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    effects = []
    for name, label, count, fps, mode, blend, pivot, render in SPECS:
        folder = ROOT / 'frames' / name
        folder.mkdir(parents=True, exist_ok=True)
        atlas = Image.new('RGBA', (ATLAS, ATLAS))
        frames = []
        for i in range(count):
            sprite = render(i)
            path = folder / f'{i:02d}.png'
            sprite.save(path, optimize=True, compress_level=9)
            x, y = i % 4 * SIZE, i // 4 * SIZE
            atlas.paste(sprite, (x, y))  # Preserve straight RGBA, no alpha squaring.
            frames.append({'index': i, 'file': path.relative_to(ROOT).as_posix(),
                           'rect': [x,y,SIZE,SIZE], 'bytes': path.stat().st_size, 'sha256': sha(path)})
        atlas_path = ROOT / 'atlases' / f'{name}.png'
        atlas_path.parent.mkdir(exist_ok=True)
        atlas.save(atlas_path, optimize=True, compress_level=9)
        effects.append({'id': name, 'label': label, 'atlas': atlas_path.relative_to(ROOT).as_posix(),
            'atlasBytes': atlas_path.stat().st_size, 'atlasSha256': sha(atlas_path),
            'frameCount': count, 'fps': fps, 'playback': mode,
            'durationMs': round(count/fps*1000) if fps else (180 if mode=='random-variant' else None),
            'blend': blend, 'pivotPx': pivot, 'direction': '+X' if name.startswith('turbo') or name=='wall-sparks' else 'up',
            'space': 'screen' if name=='gear-shift' else ('ground' if name=='skid-marks' else 'world-billboard'),
            'opacityEnvelope': [[0,1],[.65,1],[1,0]] if mode=='random-variant' else ([[0,0],[.12,1],[.82,1],[1,0]] if mode=='once' else [[0,1],[1,1]]),
            'frames': frames})
        print(f'{name:16} {count:2} frames  {atlas_path.stat().st_size:7,} bytes')
    manifest = {'schemaVersion': 1, 'package': 'racing-fx-v2', 'created': '2026-11-14',
        'baseCommit': 'f5f2b40814fc0e2186daed1ac100a8d806dd3a7d',
        'license': 'LICENSE.txt', 'provenance': 'Original deterministic procedural artwork; tools/build_assets.py; no external image inputs or brands.',
        'format': {'mimeType':'image/png', 'colorSpace':'sRGB', 'alpha':'straight', 'bitDepth':8,
                   'frameSize':[256,256], 'atlasSize':[1024,1024], 'grid':[4,4],
                   'order':'row-major, zero-based, top-left origin', 'gutterPx':8,
                   'filter':'linear', 'wrap':'clamp-to-edge', 'mipmaps':False, 'uvInsetPx':.5,
                   'maxAtlasBytes':600000, 'gpuBytesPerAtlasRGBA8':4194304},
        'render': {'normalBlend':['SRC_ALPHA','ONE_MINUS_SRC_ALPHA'], 'additiveBlend':['SRC_ALPHA','ONE'],
                   'depthWrite':False, 'worldDepthTest':True, 'screenDepthTest':False,
                   'turboLoopFadeMs':90, 'pauseFreezesClock':True,
                   'skidFadeMs':12000, 'skidMaxOpacity':.65, 'grassPlacement':'ground contact with billboard upright; not a replacement environment mesh',
                   'sparksSelection':'choose one of four variants per contact, then animate opacity/scale over 180ms; not a four-frame flipbook',
                   'gearSafeCenterUV':[.32,0,.68,1], 'gearMaxOpacity':.55},
        'qualityTiers': {
            'low': {'label':'נייד חלש', 'maxResidentAtlases':3, 'maxGpuBytesRGBA8':12582912, 'maxActiveInstances':12,
                    'maxDrawCallsUnbatched':12, 'maxWorldQuadScreenFraction':.20, 'maxScreenOverlayQuadScreenFraction':0,
                    'effects':['turbo-low','tire-brake','skid-marks'],
                    'instanceCaps':{'turbo-low':2,'tire-brake':2,'skid-marks':8}, 'gearShift':False, 'emitIntervalMs':160},
            'balanced': {'label':'נייד מאוזן', 'maxResidentAtlases':6, 'maxGpuBytesRGBA8':25165824, 'maxActiveInstances':20,
                         'maxDrawCallsUnbatched':20, 'maxWorldQuadScreenFraction':.32, 'maxScreenOverlayQuadScreenFraction':0,
                         'effects':['turbo-medium','tire-drift','tire-brake','skid-marks','wall-sparks','road-dust'],
                         'instanceCaps':{'turbo-medium':2,'tire-drift':3,'tire-brake':2,'skid-marks':9,'wall-sparks':2,'road-dust':2},
                         'gearShift':False, 'emitIntervalMs':100},
            'high': {'label':'נייד חזק', 'maxResidentAtlases':8, 'maxGpuBytesRGBA8':33554432, 'maxActiveInstances':28,
                     'maxDrawCallsUnbatched':28, 'maxWorldQuadScreenFraction':.45, 'maxScreenOverlayQuadScreenFraction':1,
                     'effects':['turbo-high','tire-drift','tire-brake','skid-marks','wall-sparks','road-dust','gear-shift','grass-rustle'],
                     'instanceCaps':{'turbo-high':2,'tire-drift':4,'tire-brake':2,'skid-marks':12,'wall-sparks':3,'road-dust':2,'gear-shift':1,'grass-rustle':2},
                     'gearShift':True, 'emitIntervalMs':70}},
        'reducedMotion': {'disable':['gear-shift','grass-rustle'], 'turboFrame':0, 'maxSmokeInstances':1, 'maxSparksInstances':1,
                          'disableCameraShake':True},
        'effects': effects}
    raw = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
    (ROOT/'manifest.json').write_text(raw, encoding='utf-8')
    (ROOT/'manifest.js').write_text('/* Generated by tools/build_assets.py; same data as manifest.json. */\nwindow.RACING_FX_MANIFEST = '+raw.rstrip()+';\n', encoding='utf-8')


if __name__ == '__main__':
    main()
