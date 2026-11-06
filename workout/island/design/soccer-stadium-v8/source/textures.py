"""Original, deterministic stadium textures. Authoring only: Python + Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math
import random

OUT = Path(__file__).resolve().parents[1] / 'runtime'
OUT.mkdir(exist_ok=True)
rng = random.Random(81724)


def save(im, name, quality=91):
    temporary = OUT / (name + '.tmp')
    im.save(temporary, 'WEBP', quality=quality, method=6)
    temporary.replace(OUT / name)
    print(name, im.size, (OUT / name).stat().st_size)


# The grain tiles; mowing direction and broad illumination are part of this
# 1024px field map. White markings stay in the GLB for crisp oblique views.
size = 1024
im = Image.new('RGB', (size, size))
px = im.load()
for y in range(size):
    for x in range(size):
        stripe = 1 if int(x / size * 18) % 2 else -1
        n = rng.gauss(0, 1.6)
        fiber = math.sin(y * 2.1 + math.sin(x * .8)) * .8
        nx, ny = x / size * 2 - 1, y / size * 2 - 1
        vignette = .87 + .15 * math.exp(-(nx * nx * .8 + ny * ny) / .7)
        for sx in [-1, 1]:
            for sy in [-1, 1]:
                vignette += .07 * math.exp(-((nx - sx * .65) ** 2 + (ny - sy * .6) ** 2) / .18)
        glint = 1.4 * math.sin(x * .017) * math.sin(y * .021)
        rgb = (43 + stripe * 2.5, 84 + stripe * 4.5, 43 + stripe * 2)
        px[x, y] = tuple(max(0, min(255, int(c * vignette + n + fiber + glint))) for c in rgb)
save(im, 'pitch.webp', 94)


# Four by four cells, three illustrated spectators per cell. No photographs,
# identities or meshes. Empty cell margins keep the mip chain free of bleed.
atlas = Image.new('RGBA', (1024, 1024))
d = ImageDraw.Draw(atlas)
shirts = ['#1e8e98', '#2dabb0', '#eacda0', '#cba176', '#35516a', '#dce7df', '#a45351', '#406780']
skins = ['#c69373', '#e1b994', '#8a5741', '#ba8766', '#68473d', '#d9aa84']
hair = ['#222a30', '#4d3b31', '#836146', '#bca182', '#313039']
for cell in range(16):
    cx, cy = cell % 4 * 256, cell // 4 * 256
    for j in range(3):
        x = cx + 47 + j * 78 + rng.randint(-4, 4)
        base = cy + 232
        head = cy + 71 + rng.randint(-11, 11)
        shirt, skin, h = rng.choice(shirts), rng.choice(skins), rng.choice(hair)
        # Seated thighs, dark trousers, asymmetric body and shoulders.
        d.rounded_rectangle((x - 24, base - 58, x + 25, base), radius=10, fill='#172633')
        d.polygon([(x - 22, head + 36), (x + 20, head + 36), (x + 29, base - 45),
                   (x + 9, base - 32), (x - 25, base - 43)], fill=shirt)
        d.polygon([(x - 18, head + 38), (x - 8, head + 43), (x - 11, base - 47),
                   (x - 24, base - 46)], fill='#233e4b')
        # Several poses, with a deliberate minority waving.
        for side in [-1, 1]:
            start = (x + side * 18, head + 46)
            up = (cell + j * 3 + (side > 0)) % 5 == 0
            elbow = (x + side * 31, head + (19 if up else 78))
            hand = (x + side * (32 if up else 18), head + (-12 if up else 103))
            d.line([start, elbow], fill=shirt, width=13)
            d.line([elbow, hand], fill=skin, width=9)
            d.ellipse((hand[0] - 5, hand[1] - 6, hand[0] + 5, hand[1] + 5), fill=skin)
        d.rectangle((x - 6, head + 20, x + 7, head + 40), fill=skin)
        d.ellipse((x - 16, head - 14, x + 16, head + 24), fill=skin)
        d.pieslice((x - 17, head - 19, x + 17, head + 20), 180, 353, fill=h)
        # Tiny shading reads as a head at game scale, without facial identities.
        d.arc((x - 16, head - 13, x + 15, head + 25), -40, 85, fill='#9a6e57', width=2)
        if (cell + j) % 4 == 0:
            d.line((x - 19, head + 38, x + 20, head + 44), fill='#e5d9b6', width=5)
save(atlas, 'crowd-atlas.webp', 94)

# Distant audience mass: bake the same original illustrations onto the existing
# tier surfaces. Four seated rows keep coarse LOD banks occupied without models
# or additional triangles. Foreground cards retain the silhouette/parallax.
mass = Image.new('RGB', (512, 256), '#193343')
for row in range(4):
    for col in range(16):
        cell = (col + row * 7) % 16
        x, y = cell % 4 * 256, cell // 4 * 256
        tile = atlas.crop((x, y, x + 256, y + 256)).resize((32, 64), Image.Resampling.LANCZOS)
        mass.paste(tile, (col * 32, row * 64), tile)
save(mass, 'crowd-distant.webp', 92)


# A seamless distant seat/crowd bed. It fills the same banks at all LODs while
# the front cards carry silhouette detail. The last LOD is not an empty arena.
bed = Image.new('RGB', (512, 64), '#152e3f')
d = ImageDraw.Draw(bed)
for row in range(1):
    for col in range(64):
        x, y = col * 8, row * 64
        d.rounded_rectangle((x, y + 8, x + 6, y + 58), radius=2, fill='#294c60')
        if rng.random() > .08:
            c = rng.choice(shirts)
            # Muted seated colour beneath the actual vertical impostors.
            rgb = tuple(int(c[i:i+2],16) for i in [1,3,5])
            c = tuple(int(v * .52) for v in rgb)
            d.rectangle((x, y + 13, x + 6, y + 47), fill=c)
        d.line((x, y + 62, x + 8, y + 62), fill='#10222f', width=2)
save(bed, 'crowd-bed.webp', 90)


net = Image.new('RGBA', (256, 256))
d = ImageDraw.Draw(net)
for v in range(0, 257, 32):
    d.line((v, 0, v, 256), fill=(216, 227, 222, 215), width=2)
    d.line((0, v, 256, v), fill=(216, 227, 222, 215), width=2)
save(net, 'goal-net.webp', 94)

shadow = Image.new('RGBA', (256, 256))
p = shadow.load()
for y in range(256):
    for x in range(256):
        r = ((x - 127.5) / 127.5) ** 2 + ((y - 127.5) / 127.5) ** 2
        p[x, y] = (5, 15, 19, round(max(0, 1 - r) ** 2 * 145))
save(shadow, 'goal-shadow.webp', 94)


led = Image.new('RGB', (1024, 128), '#122e43')
d = ImageDraw.Draw(led)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 29)
except OSError:
    font = ImageFont.load_default()
for i, text in enumerate(['EVENING FOOTBALL', 'PLAY TOGETHER', 'THE BEAUTIFUL GAME', 'UNDER THE LIGHTS']):
    x = i * 256
    d.rectangle((x, 0, x + 255, 6), fill='#a8d9d4')
    words = text.split()
    lines = [' '.join(words[:-1]), words[-1]] if len(text) > 14 else [text]
    for j, line in enumerate(lines):
        box = d.textbbox((0, 0), line, font=font)
        d.text((x + (256 - box[2]) / 2, 30 + j * 32), line, font=font, fill='#d6e7df')
for y in range(1, 128, 3):
    d.line((0, y, 1024, y), fill='#102837', width=1)
save(led, 'perimeter-led.webp', 92)


sky = Image.new('RGB', (1024, 512))
pixels = sky.load()
for y in range(512):
    v = y / 511
    for x in range(1024):
        glow = math.exp(-((x / 1024 - .72) / .23) ** 2) * v ** 5
        cloud = math.sin(x * .012 + y * .038) * math.sin(x * .025 - y * .014)
        cloud *= 4 * math.exp(-((v - .68) / .18) ** 2)
        base = [10 + 50 * v ** 2, 19 + 48 * v ** 2, 35 + 45 * v]
        pixels[x, y] = tuple(max(0, min(255, round(c + cloud + glow * [43, 15, 0][i]))) for i, c in enumerate(base))
save(sky, 'evening-sky.webp', 91)


glow = Image.new('RGBA', (128, 128))
p = glow.load()
for y in range(128):
    for x in range(128):
        r = math.hypot((x - 63.5) / 63.5, (y - 63.5) / 63.5)
        a = max(0, 1 - r) ** 3
        p[x, y] = (210, 233, 255, round(a * 200))
save(glow, 'lamp-glow.webp', 94)
