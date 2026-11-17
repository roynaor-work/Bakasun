#!/usr/bin/env python3
"""Deterministic naval sprites and original synthesized SFX. Python 3.12+.

Requirements: Pillow 12+, NumPy 2+, FFmpeg (libvorbis and libmp3lame).
  python synthesize.py                 # regenerate from delivered hulls.png
  python synthesize.py --render        # reread source GLBs (Playwright needed)
  python synthesize.py --renders DIR   # use a previously rendered GLB cache
  python synthesize.py --verify        # read-only asset/decode/budget checks

All delivered writes stay beside this script. Temporary WAVs/render caches are
outside the repository. Noise is seeded, no recordings or downloaded assets.
"""
import argparse
import hashlib
import json
import math
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
ISLAND = ROOT.parents[1]
SEED = 1172026
SHIP_SIZE = (320, 224)
FX_SIZE = (192, 192)
WATERLINE = 174
GUTTER = 2
PNG_LIMIT = 800_000  # decimal KB, stricter than KiB
AUDIO_LIMIT = 50_000
STATES = ('intact', 'damaged', 'burning', 'listing', 'sinking')
LABELS = {'corvette': 'קורבטה', 'destroyer': 'משחתת', 'cruiser': 'סיירת', 'carrier': 'נושאת מטוסים', 'patrol': 'סירת הסיור', 'gunboat': 'ספינת תותחים', 'legacy-enemy': 'ספינת האויב הישנה', 'legacy-boss': 'ספינת הבוס הישנה', 'submarine': 'צוללת'}


def blank(size=FX_SIZE):
    return Image.new('RGBA', size)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def noise(size, seed, scale=12):
    rng = np.random.default_rng(seed)
    result = np.zeros((size[1], size[0]), dtype=np.float32)
    for grid, weight in ((scale, .55), (scale * 2, .28), (scale * 4, .17)):
        src = Image.fromarray(rng.integers(0, 256, (grid, grid), dtype=np.uint8))
        result += np.asarray(src.resize(size, Image.Resampling.BICUBIC), dtype=np.float32) / 255 * weight
    return result


def cloud(im, xy, radii, opacity=150, tone=(43, 48, 52), seed=1):
    """A softly lit turbulent volume with transparent, irregular edges."""
    cx, cy = xy
    rx, ry = radii
    x0, y0 = max(0, int(cx - rx * 1.3)), max(0, int(cy - ry * 1.3))
    x1, y1 = min(im.width, int(cx + rx * 1.3) + 1), min(im.height, int(cy + ry * 1.3) + 1)
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(float)
    dx, dy = (xx - cx) / rx, (yy - cy) / ry
    angle = np.arctan2(dy, dx)
    edge = 1 + .11 * np.sin(angle * 5 + seed) + .07 * np.cos(angle * 9 - seed)
    n = noise((x1 - x0, y1 - y0), seed, 7)
    density = np.clip((edge - np.sqrt(dx * dx + dy * dy)) * 3, 0, 1)
    alpha = density * (.70 + .30 * n) * opacity
    light = np.clip(.88 - .17 * dx - .26 * dy + .18 * n, .35, 1.3)
    pixels = np.zeros((y1 - y0, x1 - x0, 4), dtype=np.uint8)
    for k, value in enumerate(tone):
        pixels[:, :, k] = np.clip(value * light, 0, 255).astype(np.uint8)
    pixels[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    im.alpha_composite(Image.fromarray(pixels), (x0, y0))


def smoke(frame, intensity=1):
    im = blank()
    phase = math.tau * frame / 12
    # Continuous circular advection closes the loop without a respawn pop.
    for i in reversed(range(13)):
        t = i / 12
        x = 87 + 44 * t ** 1.5 + math.sin(phase + i * .8) * (2 + 3 * t)
        y = 171 - t * (78 + 44 * intensity)
        r = (7 + t * (14 + intensity * 10)) * (.8 + intensity * .2)
        cloud(im, (x, y), (r * 1.12, r), int((50 + 135 * intensity) * (1 - t * .42)), (29 + int(t * 18), 32 + int(t * 18), 35 + int(t * 19)), SEED + i)
    return im


def fire(frame):
    yy, xx = np.mgrid[0:192, 0:192].astype(float)
    phase = math.tau * frame / 12
    n = noise(FX_SIZE, SEED + 220, 16)
    n = np.roll(n, int(phase / math.tau * 192), axis=0)
    field = np.zeros_like(xx)
    heat = np.zeros_like(xx)
    for offset, height, width in ((-16, 75, 16), (7, 117, 20), (24, 68, 13)):
        v = (174 - yy) / height
        valid = (v >= 0) & (v < 1)
        center = 94 + offset + np.sin(v * 10 + phase + offset) * (5 * v) + np.sin(v * 23 - phase) * 3
        spread = width * np.maximum(0, 1 - v) ** .65 + 1
        d = np.abs(xx - center) / spread
        f = np.exp(-d ** 2) * (1 - np.clip(v, 0, 1)) ** .30
        f *= (.45 + n * .9) * valid
        field = np.maximum(field, f)
        heat = np.maximum(heat, f * np.maximum(0, 1 - v) ** .5)
    alpha = np.clip((field - .18) * 430, 0, 245)
    rgb = np.zeros((192, 192, 4), dtype=np.uint8)
    rgb[:, :, 0] = 255
    rgb[:, :, 1] = np.clip(75 + heat * 250, 0, 246)
    rgb[:, :, 2] = np.clip(8 + (heat ** 2) * 235, 0, 205)
    rgb[:, :, 3] = alpha.astype(np.uint8)
    im = Image.fromarray(rgb)
    glow = im.filter(ImageFilter.GaussianBlur(6))
    glow.putalpha(glow.getchannel('A').point(lambda a: a * .30))
    glow.alpha_composite(im)
    d = ImageDraw.Draw(glow)
    for i in range(9):
        t = (frame / 12 + i / 9) % 1
        x = 86 + math.sin(i * 13 + t * 3) * 24 + t * 22
        y = 165 - t * 135
        a = int(220 * (1 - t))
        d.line((x, y, x + 1, y - 3), fill=(255, 194, 78, a), width=1)
    return glow


def bubbles(frame):
    im = blank()
    d = ImageDraw.Draw(im)
    for i in range(22):
        t = (frame / 12 + i * .381966) % 1
        x = 96 + math.sin(i * 9.7) * (13 + t * 42) + math.sin(t * 9 + i) * 5
        y = 176 - t * 142
        r = (1.4 + (i % 4) * .65) * (.65 + t)
        a = int(180 * math.sin(math.pi * t) ** .6)
        d.ellipse((x - r, y - r, x + r, y + r), outline=(162, 222, 231, a), width=1)
        if r > 1.2:
            d.arc((x - r + 1, y - r + 1, x + r - 1, y + r - 1), 200, 285, fill=(235, 253, 255, a), width=1)
    return im


def oil(frame):
    im = blank()
    d = ImageDraw.Draw(im)
    phase = frame / 8 * math.tau
    for j in range(7):
        points = []
        for i in range(100):
            a = i / 100 * math.tau
            wave = 1 + .10 * math.sin(3 * a + phase) + .07 * math.sin(7 * a - phase)
            r = (71 - j * 7) * wave
            points.append((96 + math.cos(a) * r, 145 + math.sin(a) * r * .30))
        colors = [(8, 17, 26, 135), (25, 40, 50, 110), (74, 65, 88, 80), (34, 91, 104, 80), (104, 92, 53, 65), (38, 61, 67, 85), (10, 22, 29, 90)]
        d.polygon(points, fill=colors[j])
        if j in (2, 3, 4):
            d.line(points[:52], fill=colors[j][:3] + (125,), width=1)
    return im.filter(ImageFilter.GaussianBlur(.65))


def water_column(frame):
    im = blank()
    t = frame / 7
    rise = math.sin(math.pi * min(t * .92, .96)) ** .65
    height = 134 * rise * (1 - .27 * t)
    # A turbulent white core and detached droplets replace a flat cone shape.
    yy, xx = np.mgrid[0:192, 0:192].astype(float)
    n = noise(FX_SIZE, SEED + 28, 19)
    v = (170 - yy) / max(height, 1)
    valid = (v >= 0) & (v <= 1)
    center = 96 + np.sin(v * 8 + t * 2) * (3 * v)
    width = 5 + 17 * np.maximum(0, 1 - v) ** 2 + np.sin(v * 23 + t) * 2
    density = np.clip((1 - np.abs(xx - center) / (width + 1)) * (1 + n), 0, 1)
    density *= valid * (.5 + n * .5) * (1 - t * .7)
    pixels = np.zeros((192, 192, 4), dtype=np.uint8)
    for k, (base, gain) in enumerate(((122, 112), (190, 57), (214, 36))):
        pixels[:, :, k] = np.clip(base + density * gain, 0, 255).astype(np.uint8)
    pixels[:, :, 3] = np.clip(density * 228, 0, 255).astype(np.uint8)
    im.alpha_composite(Image.fromarray(pixels))
    for j in range(16):
        u = j / 15
        x = 96 + math.sin(j * 7.1 + t) * (3 + (1 - u) * 12)
        y = 165 - u * height
        r = 3 + (1 - u) * 6
        cloud(im, (x, y), (r, r * 1.3), int(160 * (1 - t * .7)), (203, 238, 245), SEED + j + 200)
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(SEED + 50)
    # Ballistic jets with persistent particle identities, then gravity collapse.
    for i in range(30):
        angle = rng.uniform(-.8, .8)
        vel = rng.uniform(.5, 1)
        age = t * 1.35
        x = 96 + math.sin(angle) * vel * age * 88
        y = 163 - vel * age * 224 + age * age * 120
        r = (1.6 + 3 * age) * (1 - t * .5)
        if frame:
            d.line((96 + (x - 96) * .85, y + 10 * rise, x, y), fill=(172, 223, 237, int(210 * (1 - t * .7))), width=max(1, int(r)))
    for j in range(3):
        r = 15 + t * 65 + j * 3
        a = int(175 * (1 - t) + 15)
        d.arc((96 - r, 170 - r * .25, 96 + r, 170 + r * .25), 5 + j * 16, 320 - j * 24, fill=(205, 243, 247, a), width=2 if j == 0 else 1)
    return im.filter(ImageFilter.GaussianBlur(.45))


def explosion(frame):
    im = blank()
    t = frame / 9
    rng = np.random.default_rng(SEED + 9)
    radius = 12 + 63 * math.sin(min(t * 1.3, 1) * math.pi / 2)
    cy = 140 - t * 39
    if frame < 3:
        cloud(im, (96, 140), (radius * 1.5, radius * .75), 210 - frame * 45, (255, 218, 155), SEED + 17)
    for i in range(12):
        angle = i / 12 * math.tau
        size = (17 + rng.uniform(0, 12)) * (.30 + t * 1.6)
        x = 96 + math.cos(angle) * radius * .57
        y = cy + math.sin(angle) * radius * .42
        if t > .25:
            cloud(im, (x + t * 9, y - t * 8), (size, size * 1.03), int(165 * (1 - t * .65)), (45, 43, 42), SEED + i + 50)
        if t < .82:
            tone = (255, int(125 + 80 * (1 - t)), int(22 + 80 * (1 - t)))
            cloud(im, (x, y), (size * .79, size * .81), int(245 * (1 - t ** 1.5)), tone, SEED + i)
            cloud(im, (x - 2, y + 3), (size * .38, size * .45), int(230 * (1 - t)), (255, 244, 187), SEED + i + 12)
    if t < .75:
        cloud(im, (96, cy + radius * .10), (radius * .62, radius * .63), int(245 * (1 - t)), (255, 181, 65), SEED + 70)
        cloud(im, (95, cy + radius * .13), (radius * .32, radius * .39), int(240 * (1 - t)), (255, 246, 196), SEED + 71)
    d = ImageDraw.Draw(im)
    for i in range(32):
        a = rng.uniform(0, math.tau)
        speed = rng.uniform(35, 103)
        x = 96 + math.cos(a) * speed * t
        y = 137 + math.sin(a) * speed * t + 35 * t * t
        d.line((x, y, x - math.cos(a) * 5 * (1 - t), y - math.sin(a) * 5 * (1 - t)), fill=(255, 193, 81, int(255 * (1 - t))), width=1)
    if frame < 5:
        r = 18 + t * 160
        d.arc((96 - r, 158 - r * .32, 96 + r, 158 + r * .32), 5, 350, fill=(255, 219, 164, int(170 * (1 - t * 1.7))), width=2)
    return im


def incoming_shell(frame):
    im = blank()
    d = ImageDraw.Draw(im)
    t = frame / 7
    x, y = 28 + t * 95, 18 + t * 143
    d.line((x - 23, y - 35, x, y), fill=(241, 218, 170, 85), width=5)
    d.line((x - 16, y - 24, x + 2, y + 3), fill=(255, 238, 180, 200), width=2)
    d.ellipse((x - 3, y - 5, x + 3, y + 5), fill=(255, 245, 200, 255))
    return im


def rocket_salvo(frame):
    im = blank()
    d = ImageDraw.Draw(im)
    for i in range(5):
        t = (frame / 11 - i * .07) / .72
        if not 0 <= t <= 1:
            continue
        x = 18 + t * 153
        y = 171 - t * 135 + i * 6 - math.sin(t * math.pi) * 15
        for j in range(10, 0, -1):
            cloud(im, (x - j * 4.5, y + j * 3.8), (1 + j * .45, 1 + j * .48), int(90 * (1 - j / 12)), (172, 183, 182), SEED + i * 10 + j)
        d.line((x - 9, y + 8, x, y), fill=(255, 131, 34, 240), width=3)
        d.line((x - 3, y + 3, x + 5, y - 5), fill=(225, 237, 235, 255), width=3)
        d.line((x + 5, y - 5, x + 7, y - 7), fill=(116, 142, 156, 255), width=2)
    return im


def torpedo(frame):
    im = blank()
    d = ImageDraw.Draw(im)
    phase = math.tau * frame / 12
    for j in range(50):
        t = j / 49
        x = 140 - t * 129
        spread = 1 + t * 11
        y = 112 + math.sin(j * 8 + phase) * spread
        r = .7 + t * 1.3
        d.ellipse((x - r, y - r, x + r, y + r), fill=(186, 232, 230, int(165 * (1 - t) + 10)))
    d.polygon([(137, 109), (155, 109), (163, 112), (155, 115), (137, 115), (132, 119), (133, 105)], fill=(77, 106, 111, 245))
    d.line((139, 110, 156, 110), fill=(215, 234, 228, 255), width=1)
    return im


def paste_fx(dest, src, xy, size):
    layer = src.resize(size, Image.Resampling.LANCZOS)
    dest.alpha_composite(layer, tuple(map(round, xy)))


def normalize_hull(image):
    src = image.convert('RGBA')
    src = src.crop(src.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox())
    src = src.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    k = min(284 / src.width, 112 / src.height)
    src = src.resize((round(src.width * k), round(src.height * k)), Image.Resampling.LANCZOS)
    out = blank(SHIP_SIZE)
    out.alpha_composite(src, ((320 - src.width) // 2, 179 - src.height))
    return out


def scorch(hull):
    im = blank(SHIP_SIZE)
    mask = hull.getchannel('A')
    bbox = mask.getbbox()
    x0, y0, x1, y1 = bbox
    anchors = []
    for u in (.36, .68):
        x = int(x0 + (x1 - x0) * u)
        column = np.asarray(mask)[:, max(0, x - 2):x + 3].max(axis=1)
        rows = np.flatnonzero(column > 130)
        # Locate the substantial hull below masts and gun barrels.
        y = int(np.percentile(rows, 67)) if len(rows) else y1 - 15
        anchors.append((x, y))
    rng = np.random.default_rng(SEED)
    for j, (x, y) in enumerate(anchors):
        cloud(im, (x, y + 3), (25 + j * 3, 11), 195, (20, 23, 25), SEED + j)
        d = ImageDraw.Draw(im)
        d.ellipse((x - 8, y - 3, x + 9, y + 5), fill=(14, 18, 21, 230))
        for i in range(6):
            dx, dy = rng.uniform(-18, 18), rng.uniform(-11, 11)
            d.line((x, y, x + dx, y + dy), fill=(31, 28, 25, 210), width=2)
            d.line((x + dx, y + dy, x + dx + 4, y + dy - 1), fill=(157, 114, 67, 140), width=1)
    im.putalpha(ImageChops.multiply(im.getchannel('A'), mask))
    return im, anchors


def list_ship(im, degrees=11, drop=0):
    result = im.rotate(degrees, Image.Resampling.BICUBIC, center=(160, WATERLINE), translate=(0, drop))
    return result


def clip_waterline(im):
    alpha = np.asarray(im.getchannel('A')).copy()
    alpha[WATERLINE + 1:] = 0
    alpha[WATERLINE] //= 3
    im.putalpha(Image.fromarray(alpha))
    return im


def foam(t):
    im = blank(SHIP_SIZE)
    d = ImageDraw.Draw(im)
    a = int(205 * math.sin(math.pi * (.08 + t * .88)))
    for j in range(5):
        r = 80 + t * 32 + j * 4
        d.arc((160 - r, WATERLINE - 5 - j * 2, 160 + r, WATERLINE + 11 + j * 2), 8 + j * 9, 168 - j * 8, fill=(186, 230, 232, a // (1 + j // 2)), width=1 if j else 2)
        d.arc((160 - r, WATERLINE - 10 - j * 2, 160 + r, WATERLINE + 5 + j * 2), 191 + j * 4, 344 - j * 5, fill=(169, 221, 229, a // 2), width=1)
    for i in range(24):
        x = 62 + i * 8.2 + math.sin(i * 4.1) * 3
        y = WATERLINE - 1 - (1 - t) * abs(math.sin(i * 3.7)) * 9
        d.line((x, y, x + 3, y - 2), fill=(223, 249, 249, int(a * .7)), width=1)
    return im


def build_ship(hull):
    damage, anchors = scorch(hull)
    damaged = hull.copy()
    damaged.alpha_composite(damage)
    burning_layer = damage.copy()
    for i, (x, y) in enumerate(anchors):
        paste_fx(burning_layer, smoke(i * 4, .50 + i * .3), (x - 48, y - 86), (98, 98))
        paste_fx(burning_layer, fire(i * 3), (x - 30, y - 54), (60, 60))
    burning = hull.copy()
    burning.alpha_composite(burning_layer)
    listing = list_ship(burning)
    sink_frames = []
    sink_hulls = []
    for frame in range(16):
        t = frame / 15
        out = blank(SHIP_SIZE)
        if frame:
            paste_fx(out, oil(frame % 8), (59, 20), (202, 202))
        sink_hulls.append(clip_waterline(list_ship(damaged, 11 + t * 27, round(t ** 1.12 * 136))) if frame else list_ship(damaged))
        body = list_ship(burning, 11 + t * 27, round(t ** 1.12 * 136))
        clip_waterline(body)
        if frame == 0:
            # Exact continuity with listing. Subsequent frames cross waterline.
            body = listing.copy()
        out.alpha_composite(body)
        if frame:
            paste_fx(out, bubbles(frame % 12), (91, 58), (144, 144))
            out.alpha_composite(foam(t))
        sink_frames.append(out)
    # Overlay-only layers never contain an opaque sea or the intact hull.
    overlays = [blank(SHIP_SIZE), damage, burning_layer, list_ship(burning_layer), foam(8 / 15)]
    return [hull, damaged, burning, listing, sink_frames[8]] + overlays + sink_frames + sink_hulls, anchors


def pack(file, frames, cols, size, palette=False):
    width, height = size
    pitch_x, pitch_y = width + GUTTER * 2, height + GUTTER * 2
    rows = math.ceil(len(frames) / cols)
    atlas = blank((cols * pitch_x, rows * pitch_y))
    rects = []
    for i, frame in enumerate(frames):
        x, y = (i % cols) * pitch_x + GUTTER, (i // cols) * pitch_y + GUTTER
        atlas.alpha_composite(frame, (x, y))
        rects.append({'x': x, 'y': y, 'w': width, 'h': height})
    path = ROOT / file
    path.parent.mkdir(parents=True, exist_ok=True)
    if palette:
        atlas = atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    atlas.save(path, optimize=True, compress_level=9)
    if path.stat().st_size > PNG_LIMIT:
        # Use a shared alpha-aware palette only if lossless RGBA exceeds budget.
        atlas = atlas.convert('RGBA').quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        atlas.save(path, optimize=True, compress_level=9)
    if path.stat().st_size > PNG_LIMIT:
        raise ValueError(f'{file} exceeds {PNG_LIMIT} bytes')
    return {'file': file, 'width': atlas.width, 'height': atlas.height, 'bytes': path.stat().st_size, 'sha256': digest(path), 'alpha': 'straight', 'colorSpace': 'sRGB', 'gutterPx': GUTTER, 'mipmaps': False, 'frames': rects}


def sequence(atlas_id, rects, fps, loop=False, anchor=(96, 170), layer='over', **extra):
    return {'atlas': atlas_id, 'frames': rects, 'frameCount': len(rects), 'fps': fps, 'durationSeconds': len(rects) / fps, 'loop': loop, 'anchorPx': list(anchor), 'composite': 'source-over', 'layer': layer, **extra}


def synthesize_audio():
    rate = 22050
    records = {}
    rng = np.random.default_rng(SEED)
    for key, duration in [('hit', .68), ('sinking', 3.7), ('explosion', 1.60)]:
        t = np.arange(round(rate * duration), dtype=float) / rate
        white = rng.standard_normal(len(t))
        # Deterministic low-pass without SciPy: a finite windowed-sinc filter.
        def lowpass(signal, hz):
            k = np.arange(-80, 81, dtype=float)
            kernel = 2 * hz / rate * np.sinc(2 * hz / rate * k) * np.hanning(len(k))
            kernel /= kernel.sum()
            return np.convolve(signal, kernel, mode='same')
        low = lowpass(white, 720)
        if key == 'hit':
            x = .50 * white * np.exp(-t * 33)
            for hz, decay, amp in [(127, 11, .5), (281, 15, .25), (617, 22, .15), (1321, 29, .12)]:
                x += amp * np.sin(math.tau * hz * t) * np.exp(-t * decay)
            x += .38 * low * np.exp(-t * 8)
            desc = 'Original steel impact: short noise transient, inharmonic plate modes and low hull thump.'
        elif key == 'explosion':
            phase = math.tau * (76 * t - 12 * t * t)
            x = .85 * np.sin(phase) * np.exp(-t * 4.3) + 1.7 * low * np.exp(-t * 3.5)
            x += .42 * white * np.exp(-t * 15)
            for start, amp in [(.17, .36), (.29, .23), (.43, .14)]:
                u = np.maximum(t - start, 0)
                x += (t >= start) * amp * lowpass(np.roll(white, int(start * rate)), 1500) * np.exp(-u * 13)
            desc = 'Original magazine detonation: descending pressure thump, filtered blast, three secondary reports.'
        else:
            env = np.sin(np.pi * t / duration) ** .6
            x = .5 * low * env
            # Falling hull groans and independently chirping air bubbles.
            x += .18 * np.sin(math.tau * (89 * t - 4.7 * t * t)) * env
            x += .10 * np.sin(math.tau * (173 * t - 9 * t * t)) * env
            for _ in range(50):
                start = rng.uniform(.1, duration - .15)
                length = rng.uniform(.025, .12)
                u = t - start
                active = (u >= 0) & (u < length)
                hz = rng.uniform(380, 1500)
                x += active * rng.uniform(.025, .12) * np.sin(math.tau * hz * (u + u * u * 2)) * np.exp(-np.maximum(u, 0) / (length / 3))
            desc = 'Original sinking: filtered rushing water, descending metal groans and 50 synthesized bubble chirps.'
        x -= x.mean()
        x = np.tanh(x * 1.1)
        # Short boundary ramps prevent clicks; normalize with 1.5 dB headroom.
        nfade = round(rate * .008)
        x[:nfade] *= np.linspace(0, 1, nfade)
        x[-nfade:] *= np.linspace(1, 0, nfade)
        x *= .65 / max(np.max(np.abs(x)), 1e-9)
        pcm = np.round(x * 32767).astype('<i2')
        files = {}
        with tempfile.TemporaryDirectory(prefix='naval-sfx-') as work:
            wav = Path(work) / (key + '.wav')
            with wave.open(str(wav), 'wb') as f:
                f.setnchannels(1)
                f.setsampwidth(2)
                f.setframerate(rate)
                f.writeframes(pcm.tobytes())
            for ext, codec, quality in [('ogg', 'libvorbis', ['-q:a', '2']), ('mp3', 'libmp3lame', ['-b:a', '64k', '-write_xing', '0', '-id3v2_version', '0'])]:
                path = ROOT / 'audio' / (key + '.' + ext)
                path.parent.mkdir(exist_ok=True)
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(wav), '-map_metadata', '-1', '-ac', '1', '-ar', str(rate), '-c:a', codec, *quality, '-fflags', '+bitexact', '-flags:a', '+bitexact', str(path)], check=True)
                if path.stat().st_size > AUDIO_LIMIT:
                    raise ValueError(f'{path.name} exceeds {AUDIO_LIMIT} bytes')
                files[ext] = {'file': path.relative_to(ROOT).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest(path), 'mimeType': 'audio/ogg; codecs=vorbis' if ext == 'ogg' else 'audio/mpeg'}
        records[key] = {'durationSeconds': duration, 'sampleRate': rate, 'channels': 1, 'loop': False, 'source': 'original deterministic synthesis; no samples', 'description': desc, 'peakDbFSBeforeEncoding': round(20 * math.log10(float(np.max(np.abs(pcm))) / 32767), 3), 'formats': files}
    return records


def build(renders=None):
    previous = json.loads((ROOT / 'manifest.json').read_text()) if (ROOT / 'manifest.json').exists() else None
    if renders:
        sources = json.loads((renders / 'sources.json').read_text())
        hulls = [normalize_hull(Image.open(renders / (s['id'] + '.png'))) for s in sources]
        master = pack('hulls.png', hulls, 4, SHIP_SIZE)
    else:
        if previous is None:
            raise SystemExit('First build needs --render or --renders DIR. Later builds use delivered hulls.png.')
        sources = previous['sourceModels']
        master = previous['atlases']['hulls']
        image = Image.open(ROOT / master['file']).convert('RGBA')
        hulls = [image.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])) for r in master['frames']]
    manifest = {'schemaVersion': 1, 'id': 'naval-sinking-v1', 'version': '1.0.0', 'createdDate': '2026-11-17', 'baseCommit': '43b27dc235387e3cb737aee9558cdf9d5fd5a262', 'branch': 'codex/naval-sinking-v1', 'seed': SEED, 'preview': {'file': 'preview.html', 'width': 844, 'height': 390}, 'license': 'LICENSE.txt', 'report': 'REPORT.md', 'limitsBytes': {'pngAtlas': PNG_LIMIT, 'audioFile': AUDIO_LIMIT}, 'renderContract': {'projection': 'fixed orthographic three-quarter board sprite; bow to right', 'shipFramePx': list(SHIP_SIZE), 'waterlineY': WATERLINE, 'anchorPx': [160, WATERLINE], 'alpha': 'straight', 'blend': 'source-over', 'filter': 'linear', 'mipmaps': False, 'zOrder': ['oil', 'shipReplacement', 'damageOverlay', 'deckFire', 'smoke', 'waterColumn', 'bubbles'], 'integration': 'Choose either a replacement state OR the intact sprite plus one overlay. Never double the hull. Listing/sinking replacements hide the upright source. Fixed-view 2D sprites; not arbitrary-view 3D decals.'}, 'sourceModels': sources, 'atlases': {'hulls': master}, 'ships': {}, 'effects': {}}
    for i, (spec, hull) in enumerate(zip(sources, hulls)):
        key = spec['id']
        frames, anchors = build_ship(hull)
        atlas = pack('atlases/' + key + '.png', frames, 4, SHIP_SIZE)
        manifest['atlases'][key] = atlas
        rects = atlas['frames']
        model_key = key.rsplit('-', 1)[0] if spec['fleet'] else key
        manifest['ships'][key] = {'model': model_key, 'label': LABELS[model_key], 'fleet': spec['fleet'], 'source': spec['path'], 'sourceSha256': digest(ISLAND / spec['path']), 'deckAnchorsPx': [list(a) for a in anchors], 'states': {s: sequence(key, [rects[j]], 1, anchor=(160, WATERLINE), layer='replace') for j, s in enumerate(STATES)}, 'overlays': {s: sequence(key, [rects[5 + j]], 1, anchor=(160, WATERLINE), overlayOnly=True, requiresTransformedBase=s in ('listing', 'sinking')) for j, s in enumerate(STATES)}, 'sinking': sequence(key, rects[10:26], 16 / 3.7, anchor=(160, WATERLINE), layer='replace', terminal='hold-last; hull fully submerged; oil/bubbles remain', waterlineY=WATERLINE, events=[{'frame': 0, 'audio': 'sinking'}, {'frame': 4, 'effect': 'bubbles'}, {'frame': 8, 'effect': 'oil'}])}
        manifest['ships'][key]['sinkingHull'] = sequence(key, rects[26:42], 16 / 3.7, anchor=(160, WATERLINE), layer='replace', terminal='empty transparent frame; hull completely submerged', transforms=[{'rollDeg': round(11 + j / 15 * 27, 3), 'dropPx': round((j / 15) ** 1.12 * 136)} for j in range(16)])
        print(f'ATLAS {key}: {atlas["bytes"]:,} bytes', flush=True)
    groups = [
        ('combat', [('water-column', 8, 12, False, water_column, (96, 170)), ('magazine-explosion', 10, 12, False, explosion, (96, 160)), ('incoming-shell', 8, 16, False, incoming_shell, (96, 170)), ('rocket-salvo', 12, 16, False, rocket_salvo, (96, 170)), ('torpedo-wake', 12, 16, True, torpedo, (153, 112))]),
        ('ambient', [('bubbles', 12, 12, True, bubbles, (96, 170)), ('oil', 8, 8, True, oil, (96, 145)), ('smoke-light', 12, 12, True, lambda f: smoke(f, .24), (87, 171)), ('smoke-medium', 12, 12, True, lambda f: smoke(f, .60), (87, 171)), ('smoke-heavy', 12, 12, True, lambda f: smoke(f, 1), (87, 171)), ('deck-fire', 12, 16, True, fire, (96, 174))]),
    ]
    for group, specs in groups:
        frames = []
        ranges = {}
        for name, count, fps, loop, func, anchor in specs:
            first = len(frames)
            frames.extend(func(i) for i in range(count))
            ranges[name] = (first, count, fps, loop, anchor)
        atlas = pack('atlases/' + group + '.png', frames, 8, FX_SIZE)
        manifest['atlases'][group] = atlas
        for name, (first, count, fps, loop, anchor) in ranges.items():
            manifest['effects'][name] = sequence(group, atlas['frames'][first:first + count], fps, loop, anchor, layer='under' if name == 'oil' else 'over')
    manifest['effects']['smoke-heavy']['intensity'] = 1
    manifest['effects']['smoke-medium']['intensity'] = .60
    manifest['effects']['smoke-light']['intensity'] = .24
    manifest['recipes'] = {
        'incoming-shell-impact': {'steps': [{'atSeconds': 0, 'effect': 'incoming-shell'}, {'atSeconds': .5, 'effect': 'water-column', 'audio': 'hit'}]},
        'magazine-detonation': {'steps': [{'atSeconds': 0, 'effect': 'magazine-explosion', 'audio': 'explosion'}, {'atSeconds': .35, 'effect': 'deck-fire'}, {'atSeconds': .5, 'effect': 'smoke-heavy'}]},
        'damage-escalation': {'states': list(STATES), 'smoke': ['none', 'smoke-light', 'smoke-medium', 'smoke-heavy', 'smoke-heavy']},
    }
    manifest['audio'] = synthesize_audio()
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print('WROTE manifest.json', flush=True)


def verify(write=False):
    m = json.loads((ROOT / 'manifest.json').read_text())
    checks = []
    def check(name, ok, **details):
        checks.append({'check': name, 'pass': bool(ok), **details})
    rect_sets = [v for s in m['ships'].values() for v in [*s['states'].values(), *s['overlays'].values(), s['sinking'], s['sinkingHull']]] + list(m['effects'].values())
    images = {}
    for key, atlas in m['atlases'].items():
        path = ROOT / atlas['file']
        im = Image.open(path).convert('RGBA')
        images[key] = im
        a = np.asarray(im.getchannel('A'))
        check(key + ': size/hash/alpha', path.stat().st_size == atlas['bytes'] <= PNG_LIMIT and digest(path) == atlas['sha256'] and np.any(a == 0) and np.any(a > 0), bytes=path.stat().st_size, semiTransparentPixels=int(((a > 0) & (a < 255)).sum()))
        check(key + ': dimensions', im.size == (atlas['width'], atlas['height']))
        for i, r in enumerate(atlas['frames']):
            x, y, w, h = r['x'], r['y'], r['w'], r['h']
            gutter = np.asarray(im.getchannel('A'))[y - 2:y + h + 2, x - 2:x + w + 2].copy()
            gutter[2:-2, 2:-2] = 0
            check(key + f': frame {i} clear gutter', not gutter.any())
    for seq in rect_sets:
        atlas = m['atlases'][seq['atlas']]
        check(seq['atlas'] + ': sequence bounds/count', seq['frameCount'] == len(seq['frames']) and all(r['x'] >= 0 and r['y'] >= 0 and r['x'] + r['w'] <= atlas['width'] and r['y'] + r['h'] <= atlas['height'] for r in seq['frames']))
    for key, ship in m['ships'].items():
        seq = ship['sinking']
        im = images[key]
        contents = []
        for r in seq['frames']:
            contents.append(im.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])).tobytes())
        check(key + ': 16 distinct sinking frames', len(contents) == len(set(contents)) == 16)
        r = ship['sinkingHull']['frames'][-1]
        check(key + ': delivered terminal hull empty', im.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])).getchannel('A').getbbox() is None)
        check(key + ': five states/overlays', tuple(ship['states']) == STATES and tuple(ship['overlays']) == STATES)
        r = ship['overlays']['intact']['frames'][0]
        check(key + ': intact overlay is empty', im.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])).getchannel('A').getbbox() is None)
        # Check actual transformed hull, independently of foam/oil still visible.
        hull = images['hulls']
        r = m['atlases']['hulls']['frames'][list(m['ships']).index(key)]
        hull = hull.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
        check(key + ': terminal hull below waterline', clip_waterline(list_ship(hull, 38, 136)).getchannel('A').getbbox() is None)
    for key, entry in m['audio'].items():
        for ext, asset in entry['formats'].items():
            path = ROOT / asset['file']
            proc = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'f32le', '-ac', '1', '-ar', '22050', '-'], capture_output=True, check=True)
            samples = np.frombuffer(proc.stdout, dtype='<f4')
            check(key + '.' + ext + ': bytes/hash/decode/headroom', path.stat().st_size == asset['bytes'] <= AUDIO_LIMIT and digest(path) == asset['sha256'] and len(samples) > 0 and np.isfinite(samples).all() and np.max(np.abs(samples)) < 1, bytes=path.stat().st_size, decodedDurationSeconds=round(len(samples) / 22050, 4), peakDbFS=round(float(20 * np.log10(max(np.max(np.abs(samples)), 1e-9))), 3))
    check('required frame counts', m['effects']['magazine-explosion']['frameCount'] == 10 and m['effects']['water-column']['frameCount'] == 8)
    check('source GLBs unchanged', all(digest(ISLAND / s['source']) == s['sourceSha256'] for s in m['ships'].values()))
    result = {'pass': all(c['pass'] for c in checks), 'checkCount': len(checks), 'atlasCount': len(images), 'shipVariants': len(m['ships']), 'uniqueModels': len({s['model'] for s in m['ships'].values()}), 'checks': checks}
    if write:
        (ROOT / 'verification').mkdir(exist_ok=True)
        (ROOT / 'verification/assets.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'checks'}))
    failures = [c for c in checks if not c['pass']]
    if failures:
        print(json.dumps(failures, ensure_ascii=False, indent=2))
        raise SystemExit(1)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--renders', type=Path)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.verify:
        verify()
    else:
        if args.render:
            from render_ships import render_all
            with tempfile.TemporaryDirectory(prefix='naval-hulls-') as work:
                render_all(work)
                build(Path(work))
        else:
            build(args.renders)
        verify(write=True)
