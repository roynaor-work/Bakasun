"""Pack the existing snow-fir art into a full-tree + isolated bough atlas.
No new image generation: aspect-preserving full-tree resize, polygon crops from
the original boughs, alpha feathering and indexed PNG export. The near LOD uses
the short bough crops on individual radial branches rather than full-tree cards.
"""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parents[1] / 'assets' / 'alpine-rush' / 'snow-fir.webp'
TARGET = ROOT / 'world' / 'textures' / 'pine-atlas.png'
TARGET.parent.mkdir(parents=True, exist_ok=True)
im = Image.open(SOURCE).convert('RGBA')
original_size = im.size
full_tree = im.resize((683, 1024), Image.Resampling.LANCZOS)
atlas = Image.new('RGBA', (1024, 1024))
atlas.paste(full_tree, (0, 0))
# Each polygon follows one outward, drooping bough and excludes the axial trunk.
# Left boughs are mirrored so every crop has its woody root at the left edge.
branches = [
    {'name': 'low_left_snow_bough', 'box': (40, 500, 320, 660), 'mirror': True,
     'polygon': [(318,500),(280,510),(235,525),(180,540),(125,550),(76,568),(42,589),(44,618),(82,641),(137,654),(197,641),(236,607),(273,555),(317,532)]},
    {'name': 'low_right_snow_bough', 'box': (362, 510, 663, 727), 'mirror': False,
     'polygon': [(364,510),(405,525),(445,548),(492,568),(545,595),(600,631),(655,666),(661,700),(620,726),(570,710),(520,682),(470,640),(420,603),(385,554)]},
    {'name': 'upper_left_needle_bough', 'box': (110, 340, 320, 483), 'mirror': True,
     'polygon': [(318,340),(280,350),(240,366),(198,383),(160,401),(125,430),(111,450),(145,479),(210,474),(248,434),(280,398),(315,380)]},
]
branch_records = []
for index, branch in enumerate(branches):
    mask = Image.new('L', full_tree.size)
    ImageDraw.Draw(mask).polygon(branch['polygon'], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(.85))
    crop = full_tree.copy()
    crop.putalpha(ImageChops.multiply(crop.getchannel('A'), mask))
    crop = crop.crop(branch['box'])
    source_size = crop.size
    if branch['mirror']:
        crop = crop.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    # Two-pixel gutters keep lower mip levels inside their branch slot.
    crop = crop.resize((337, 337), Image.Resampling.LANCZOS)
    px, py = 683, index * 341
    atlas.paste(crop, (px + 2, py + 2))
    branch_records.append({
        'name': branch['name'], 'sourceBoxOn683x1024': list(branch['box']),
        'sourcePolygonOn683x1024': branch['polygon'], 'mirrored': branch['mirror'],
        'sourceAspect': source_size[0] / source_size[1],
        'atlasRectPixels': [px + 2, py + 2, 337, 337],
        'uv': [(px + 2.5) / 1024, (py + 2.5) / 1024, (px + 338.5) / 1024, (py + 338.5) / 1024],
    })
atlas.quantize(colors=256, method=Image.Quantize.FASTOCTREE).save(TARGET, optimize=True)
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
record = {
    'source': '../../../assets/alpine-rush/snow-fir.webp',
    'tool': '../tools/world-pine.py',
    'toolSha256': digest(Path(__file__)),
    'sourceSha256': digest(SOURCE),
    'sourceDimensions': list(original_size),
    'sourceDocumentation': '../../../ASSETS.md:189',
    'sourceMethod': 'Existing repository ImageGen artwork; no new generation',
    'license': 'Existing repository AI-assisted artwork under repository terms; no CC0 claim',
    'derivation': 'Full-tree Lanczos resize to 683x1024 at atlas left; three trunk-free polygon bough crops in right 341px column; indexed RGBA PNG with 256 colors',
    'file': 'textures/pine-atlas.png',
    'sha256': digest(TARGET),
    'bytes': TARGET.stat().st_size,
    'width': atlas.width,
    'height': atlas.height,
    'colorSpace': 'sRGB',
    'alpha': 'Original cutout alpha, MASK cutoff 0.58 at runtime',
    'fullTreeRectPixels': [0, 0, 683, 1024],
    'branches': branch_records,
    'lods': {'near': '12 tiers with 7 irregular drooping radial boughs each; 168 crossed short bough cards, 8 inner-crown foliage triads, woody branch cores and full-height tapered trunk; 1920 triangles', 'mid': '2 crossed full-tree cards with explicit reverse faces', 'far': '1 camera-facing full-tree card with explicit reverse face'},
}
(ROOT / 'world' / 'manifest-pine-source.json').write_text(json.dumps(record, indent=2) + '\n')
print(f'Pine atlas: {TARGET.stat().st_size} bytes, {atlas.width}x{atlas.height}')
