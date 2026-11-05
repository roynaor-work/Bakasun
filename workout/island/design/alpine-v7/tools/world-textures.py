"""Deterministic, tileable alpine PBR textures and <=1024 v5 backdrop derivatives.

Original texture synthesis uses periodic Fourier noise, wrapped drawing masks,
and finite-difference tangent normals. No network or external photo sources.
Python 3, NumPy and Pillow; run from any working directory.
"""
from pathlib import Path
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
WORLD = ROOT / 'world'
TEXTURES = WORLD / 'textures'
BACKGROUNDS = WORLD / 'backgrounds'
SOURCE = ROOT.parent / 'alpine-v5'
SIZE = 512
SEED = 740511
rng = np.random.default_rng(SEED)
TEXTURES.mkdir(parents=True, exist_ok=True)
BACKGROUNDS.mkdir(parents=True, exist_ok=True)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def periodic_noise(cells):
    """Smooth periodic noise with a scale measured in features across the tile."""
    a = rng.normal(size=(SIZE, SIZE))
    f = np.fft.fftfreq(SIZE) * SIZE
    xx, yy = np.meshgrid(f, f)
    filt = np.exp(-(xx * xx + yy * yy) / (2 * cells * cells))
    out = np.fft.ifft2(np.fft.fft2(a) * filt).real
    return out / max(out.std(), 1e-9)


def wrapped_mask(lines, width, blur=0):
    im = Image.new('L', (SIZE, SIZE))
    d = ImageDraw.Draw(im)
    for pts in lines:
        for ox in (-SIZE, 0, SIZE):
            for oy in (-SIZE, 0, SIZE):
                p = [(round(x + ox), round(y + oy)) for x, y in pts]
                d.line(p, fill=255, width=width, joint='curve')
    if blur:
        # Nine-copy blur keeps the edge neighbourhood periodic.
        tiled = Image.new('L', (SIZE * 3, SIZE * 3))
        for x in range(3):
            for y in range(3):
                tiled.paste(im, (x * SIZE, y * SIZE))
        im = tiled.filter(ImageFilter.GaussianBlur(blur)).crop((SIZE, SIZE, 2 * SIZE, 2 * SIZE))
    return np.asarray(im, dtype=float) / 255


def seamless(a):
    """Duplicate identical outside edge texels as an explicit seam guarantee."""
    a = np.array(a, dtype=float)
    a[0, ...] = a[-1, ...] = (a[0, ...] + a[-1, ...]) * .5
    a[:, 0, ...] = a[:, -1, ...] = (a[:, 0, ...] + a[:, -1, ...]) * .5
    return a


def byte(a):
    return np.uint8(np.clip(np.rint(a), 0, 255))


def normal(height, strength):
    # Normal map is OpenGL (+Y), with Z pointing out of the material surface.
    u = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    v = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    n = np.stack((-u, v, np.ones_like(height)), axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return seamless((n * .5 + .5) * 255)


assets = []


def save_map(name, role, a):
    p = TEXTURES / f'{name}-{role}.webp'
    mode = 'RGB' if np.asarray(a).ndim == 3 else 'L'
    im = Image.fromarray(byte(seamless(a)), mode)
    if mode == 'L':
        # RGB roughness can be sampled consistently from Three.js G channel.
        im = im.convert('RGB')
    im.save(p, 'WEBP', lossless=True, method=6)
    arr = np.asarray(Image.open(p))
    assets.append({
        'id': f'{name}-{role}', 'file': f'textures/{p.name}',
        'bytes': p.stat().st_size, 'sha256': digest(p),
        'width': im.width, 'height': im.height,
        'colorSpace': 'sRGB' if role == 'albedo' else 'linear-data',
        'wrap': 'repeat', 'mipmaps': True,
        'normalConvention': 'OpenGL +Y' if role == 'normal' else None,
        'seamEdgeMaxDifference': int(max(np.abs(arr[0].astype(int)-arr[-1].astype(int)).max(), np.abs(arr[:,0].astype(int)-arr[:,-1].astype(int)).max())),
        'source': 'tools/world-textures.py; original procedural material',
        'license': 'Original contribution under repository terms',
    })


macro = periodic_noise(2.4)
meso = periodic_noise(13)
grain = periodic_noise(95)
fine = periodic_noise(185)
y, x = np.mgrid[0:SIZE, 0:SIZE] / SIZE

# Powder: broad wind-deposited waves, softly eroded grains and tiny crystal pits.
# Frequency modulation avoids a graphic repeating stripe pattern.
wind = np.sin(2 * np.pi * (y * 7 + .17 * np.sin(x * 2 * np.pi * 3)))
powder_h = .38 * macro + .13 * meso + .035 * grain + .014 * fine + .085 * wind
powder_shade = np.clip(.7 * macro + .35 * meso + .12 * grain, -3, 3)
powder_c = np.array([235, 241, 245])[None, None, :] + powder_shade[:, :, None] * np.array([2.9, 2.25, 1.8])
powder_c += np.maximum(grain - 1.5, 0)[:, :, None] * np.array([1.7, 1.7, 1.5])
save_map('powder', 'albedo', powder_c)
save_map('powder', 'normal', normal(powder_h, 4.6))
save_map('powder', 'roughness', 232 + 6 * meso + 4 * grain)

# Ice: tapered branching tension cracks are physically small, broken up by frost.
crack_lines = []
for k in range(4):
    start = rng.uniform(0, SIZE, 2)
    direction = rng.uniform(0, math.tau)
    pts = [tuple(start)]
    for j in range(int(rng.integers(8, 16))):
        direction += rng.normal(0, .39)
        start = start + np.array([math.cos(direction), math.sin(direction)]) * rng.uniform(8, 22)
        pts.append(tuple(start))
        if j in (3, 7):
            branch = [tuple(start)]
            v = start.copy()
            angle = direction + rng.choice((-1, 1)) * rng.uniform(.55, 1.1)
            for q in range(4):
                angle += rng.normal(0, .25)
                v += np.array([math.cos(angle), math.sin(angle)]) * rng.uniform(6, 14)
                branch.append(tuple(v))
            crack_lines.append(branch)
    crack_lines.append(pts)
crack = wrapped_mask(crack_lines, 1, .6)
crack_halo = wrapped_mask(crack_lines, 2, 2.4)
frost = np.clip((periodic_noise(5) + .3) * .55, 0, 1)
ice_h = .1 * meso + .012 * grain - .18 * crack + .05 * frost
ice_c = np.array([174, 205, 219])[None, None, :] + macro[:, :, None] * np.array([3.0, 2.6, 2.1])
ice_c += frost[:, :, None] * np.array([35, 26, 21])
ice_c += crack_halo[:, :, None] * np.array([6, 8, 8]) - crack[:, :, None] * np.array([16, 15, 13])
save_map('ice', 'albedo', ice_c)
save_map('ice', 'normal', normal(ice_h, 5.5))
save_map('ice', 'roughness', 86 + 72 * frost + 9 * meso + 15 * crack_halo)

# Churned snow: irregular, short compacted ski troughs and displaced snow chunks.
tracks = []
for k in range(21):
    sx, sy = rng.uniform(0, SIZE, 2)
    length = rng.uniform(20, 105)
    dx = rng.uniform(-.18, .18) * length
    tracks.append([(sx, sy), (sx + dx * .4, sy + length * .45), (sx + dx, sy + length)])
track = wrapped_mask(tracks, 4, 2)
track_ridge = wrapped_mask(tracks, 11, 3) - track
clumps = np.maximum(periodic_noise(25) - .4, 0)
churn_h = .28 * macro + .18 * meso + .105 * clumps + .04 * grain - .42 * track + .23 * track_ridge
churn_shade = .55 * macro + .55 * meso + .25 * grain - .8 * track + .3 * track_ridge
churn_c = np.array([225, 234, 240])[None, None, :] + churn_shade[:, :, None] * np.array([4.0, 3.0, 2.6])
churn_c -= track[:, :, None] * np.array([7, 5, 3])
save_map('churned', 'albedo', churn_c)
save_map('churned', 'normal', normal(churn_h, 5.3))
save_map('churned', 'roughness', 217 + 7 * meso + 6 * grain - 10 * track)

# Preserve v5 art; portrait derives from the WIDE master around the principal
# massif. The existing v5 portrait crops exclude that summit at the left edge.
for source in sorted((SOURCE / 'backgrounds').glob('*-landscape.webp')):
    master = Image.open(source).convert('RGB')
    original = list(master.size)
    for orientation in ('landscape', 'portrait'):
        im = master.copy()
        crop = None
        if orientation == 'portrait':
            crop_width = round(im.height * 9 / 16)
            center_x = .25
            left = max(0, min(im.width - crop_width, round(im.width * center_x - crop_width / 2)))
            crop = [left, 0, left + crop_width, im.height]
            im = im.crop(crop)
            derivation = '9:16 portrait crop centered on principal massif at x=25% of v5 wide master; no upsampling; WebP quality 91'
        else:
            derivation = 'Aspect-preserving Lanczos downsample to maximum edge 1024; WebP quality 91'
        im.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        name = source.name.replace('-landscape', '-' + orientation)
        out = BACKGROUNDS / name
        im.save(out, 'WEBP', quality=91, method=6)
        assets.append({
            'id': out.stem, 'file': f'backgrounds/{out.name}',
            'bytes': out.stat().st_size, 'sha256': digest(out),
            'width': im.width, 'height': im.height, 'colorSpace': 'sRGB',
            'source': '../../alpine-v5/backgrounds/' + source.name,
            'sourceSha256': digest(source), 'sourceDimensions': original,
            'sourceCropPixels': crop, 'derivation': derivation,
            'license': 'Existing repository AI-assisted artwork; retain alpine-v5/LICENSES.md terms',
        })

manifest = {
    'schemaVersion': 1, 'seed': SEED, 'maxTextureEdge': 1024,
    'maps': assets, 'sourceTool': 'tools/world-textures.py', 'sourceToolSha256': digest(Path(__file__)),
    'runtimeTextureBytes': sum(a['bytes'] for a in assets if a['file'].startswith('textures/')),
    'backdropStoredBytes': sum(a['bytes'] for a in assets if a['file'].startswith('backgrounds/')),
    'decodedMaterialTextureBytesWithMipmaps': 9 * SIZE * SIZE * 4 * 4 // 3,
    'materialRecommendations': {
        'powder': {'repeatMetres': 4, 'normalScale': .58, 'roughness': 1, 'metalness': 0},
        'ice': {'repeatMetres': 4, 'normalScale': .14, 'roughness': .24, 'metalness': .015, 'clearcoat': .48, 'clearcoatRoughness': .12, 'envMapIntensity': 1.25, 'ior': 1.31, 'frostEdgeRoughness': .92},
        'churned': {'repeatMetres': 3, 'normalScale': .7, 'roughness': 1, 'metalness': 0},
    },
    'notes': 'Albedo in sRGB. Normal and roughness are linear data. Roughness is duplicated in RGB for Three.js G sampling. Repeat textures have exactly identical opposite edge texels. One environment backdrop orientation at a time.',
}
(WORLD / 'manifest-textures.json').write_text(json.dumps(manifest, indent=2) + '\n')

# Compact inspection image, with physically interpretable surface maps side by side.
grid = Image.new('RGB', (3 * 256, 3 * 256), '#15202a')
for row, name in enumerate(('powder', 'ice', 'churned')):
    for col, role in enumerate(('albedo', 'normal', 'roughness')):
        im = Image.open(TEXTURES / f'{name}-{role}.webp').resize((256, 256), Image.Resampling.LANCZOS)
        grid.paste(im, (col * 256, row * 256))
grid.save(TEXTURES / 'materials-contact-sheet.webp', quality=92, method=6)
manifest['inspectionSheet'] = {
    'file': 'textures/materials-contact-sheet.webp', 'width': grid.width,
    'height': grid.height, 'bytes': (TEXTURES / 'materials-contact-sheet.webp').stat().st_size,
    'sha256': digest(TEXTURES / 'materials-contact-sheet.webp'), 'runtime': False,
    'layout': 'Rows powder/ice/churned; columns albedo/OpenGL normal/roughness',
}
(WORLD / 'manifest-textures.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'maps': len(assets), 'maxBytes': max(a['bytes'] for a in assets), 'maxEdge': max(max(a['width'], a['height']) for a in assets)}))
