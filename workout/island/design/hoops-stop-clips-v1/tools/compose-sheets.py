# SPDX-License-Identifier: CC0-1.0
"""GLB renders per sheet: 8 frames (columns) x 4 camera angles (rows); no external imagery or fonts."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

source, destination = map(Path, sys.argv[1:3])
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 17)
small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 12)
names = {'three': '3/4', 'side': 'side', 'front': 'front', 'back': 'rear 3/4'}
for capture in json.loads((source / 'captures.json').read_text()):
    width, height, gap, header = 232, 207, 6, 34
    views = capture['views']
    sheet = Image.new('RGB', (8 * width + 9 * gap, len(views) * (height + 16 + gap) + header + gap), '#eef0f2')
    draw = ImageDraw.Draw(sheet)
    draw.text((gap, 8), capture['id'] + '  |  30 Hz  |  canonical 18  |  CC0', font=font, fill='#15242f')
    for row, view in enumerate(views):
        for index, time in enumerate(capture['times']):
            picture = Image.open(source / f"{capture['id']}-{view}-{index}.png").convert('RGB')
            picture = picture.resize((width, height), Image.Resampling.LANCZOS)
            x, y = gap + index * (width + gap), header + gap + row * (height + 16 + gap)
            sheet.paste(picture, (x, y))
            draw.text((x + 4, y + height + 1), f"{names[view]}  {time:.3f}s  f{round(time * 30)}", font=small, fill='#15242f')
    sheet = sheet.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    sheet.save(destination / f"{capture['id']}.png", optimize=True)
