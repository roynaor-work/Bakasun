#!/usr/bin/env python3
"""SPDX-License-Identifier: CC0-1.0
Original deterministic water VFX, drawn from curves and translucent shapes.
Requires Pillow only for authoring. Runtime consumes transparent PNGs.
"""
import hashlib
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / 'sprites'
ROOT.mkdir(exist_ok=True)
W, H, AA = 256, 128, 3


def canvas():
    image = Image.new('RGBA', (W * AA, H * AA))
    return image, ImageDraw.Draw(image)


def line(draw, points, color, width):
    draw.line([(round(x * AA), round(y * AA)) for x, y in points], fill=color, width=max(1, round(width * AA)), joint='curve')


def ellipse(draw, center, radii, color):
    x, y = center
    rx, ry = radii
    draw.ellipse(((x - rx) * AA, (y - ry) * AA, (x + rx) * AA, (y + ry) * AA), fill=color)


def jet(frame):
    image, draw = canvas()
    p = frame / 8
    points = [(16 + 222 * u, 96 - 262 * u * (1 - u)) for u in [i / 128 for i in range(129)]]
    for width, color in [(13, (106, 215, 247, 30)), (8, (97, 205, 248, 105)), (4.5, (175, 242, 255, 210)), (1.7, (248, 255, 255, 245))]:
        line(draw, points, color, width)
    for i in range(14):
        u = (i / 14 + p * 2 / 14) % 1
        x, y = 16 + 222 * u, 96 - 262 * u * (1 - u)
        ellipse(draw, (x, y - 2), (2.8, 1.4), (250, 255, 255, 240))
        if i % 2 == 0:
            ellipse(draw, (x + 1, y + 8 + 5 * math.sin(u * 8 * math.pi)), (1.3, 2.7), (170, 234, 255, 190))
    return image.resize((W, H), Image.Resampling.LANCZOS)


def droplets(frame):
    image, draw = canvas()
    for i in range(19):
        u = (i * .137 + frame / 8) % 1
        x = 20 + ((i * 37 + 17 * math.sin(i)) % 215)
        y = 16 + 94 * u
        alpha = round(210 * math.sin(math.pi * u) ** .5)
        line(draw, [(x - 1, y - 6), (x, y + 1)], (157, 229, 255, alpha), 2.1)
        ellipse(draw, (x, y), (1.9, 3), (219, 249, 255, alpha))
    return image.resize((W, H), Image.Resampling.LANCZOS)


def splash(frame):
    image, draw = canvas()
    u = (frame + .5) / 8
    fade = (1 - u) ** .6
    ellipse(draw, (128, 99), (15 + u * 49, 3 + u * 7), (169, 233, 250, round(100 * fade)))
    for i in range(13):
        theta = math.pi * (.10 + .80 * i / 12)
        radius = 10 + 55 * u
        x, y = 128 + math.cos(theta) * radius, 96 - math.sin(theta) * radius * .95 + 26 * u * u
        line(draw, [(128 + (x - 128) * .42, 96 + (y - 96) * .42), (x, y)], (120, 222, 252, round(190 * fade)), 3 * (1 - u) + .6)
        ellipse(draw, (x, y), (2.5, 3.6), (224, 251, 255, round(235 * fade)))
    ellipse(draw, (128, 94), (8 + 8 * (1 - u), 9 * (1 - u)), (242, 255, 255, round(185 * fade)))
    return image.resize((W, H), Image.Resampling.LANCZOS)


def steam(frame):
    image, draw = canvas()
    u = frame / 5
    for i in range(13):
        x = 128 + math.sin(i * 2.4) * (15 + 34 * u)
        y = 101 - i * 3.4 - 30 * u
        radius = 10 + 8 * u + (i % 3) * 2
        ellipse(draw, (x, y), (radius * 1.25, radius), (215, 242, 246, round((65 - i * 2) * (1 - .65 * u))))
    return image.resize((W, H), Image.Resampling.LANCZOS)


atlas = Image.new('RGBA', (W * 8, H * 4))
contact = Image.new('RGB', (W * 8, (H + 28) * 4), '#102838')
caption = ImageDraw.Draw(contact)
effects = {}
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
for row, (name, count, fps, render, loop) in enumerate([
    ('water_arc', 8, 16, jet, True), ('droplets', 8, 16, droplets, True),
    ('object_splash', 8, 20, splash, False), ('steam', 6, 10, steam, False)
]):
    frames = []
    strip = Image.new('RGBA', (W * count, H))
    for index in range(count):
        frame = render(index)
        atlas.alpha_composite(frame, (index * W, row * H))
        strip.alpha_composite(frame, (index * W, 0))
        contact.paste(frame, (index * W, row * (H + 28) + 28), frame)
        caption.text((index * W + 12, row * (H + 28) + 5), f'{name}  {index + 1:02d}/{count}', fill='#d8edf1', font=font)
        frames.append({'index': index, 'rect': [index * W, row * H, W, H],
                       'uvTopLeft': [index / 8, row / 4, 1 / 8, 1 / 4]})
    strip.save(ROOT / f'{name}-sheet.png', optimize=True)
    render(0).save(ROOT / f'{name}.png', optimize=True)
    effects[name] = {'frames': frames, 'frameCount': count, 'fps': fps, 'loop': loop,
                     'sheet': f'{name}-sheet.png', 'sprite': f'{name}.png',
                     'anchorPx': [16, 96] if name == 'water_arc' else [128, 96]}
atlas.save(ROOT / 'water-atlas.png', optimize=True)
jet(0).save(ROOT / 'water-arc.png', optimize=True)
contact.save(ROOT / 'water-contact-sheet.png', optimize=True)
metadata = {'schemaVersion': 1, 'license': 'CC0-1.0', 'image': 'water-atlas.png',
            'width': atlas.width, 'height': atlas.height, 'cellWidth': W, 'cellHeight': H,
            'alpha': 'straight RGBA; transparent background; 2px minimum safe border',
            'origin': 'top-left; Three texture flipY=true, offsetY=1-(row+1)/4',
            'effects': effects, 'source': '../source/sprites.py',
            'sha256': hashlib.sha256((ROOT / 'water-atlas.png').read_bytes()).hexdigest()}
(ROOT / 'atlas.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(json.dumps({'atlas': [atlas.width, atlas.height], 'frames': {k: v['frameCount'] for k, v in effects.items()}}))
