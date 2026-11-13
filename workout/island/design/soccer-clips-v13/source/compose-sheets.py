# SPDX-License-Identifier: CC0-1.0
"""Eight original GLB renders per sheet; no external imagery or fonts."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

source, destination = map(Path, sys.argv[1:3])
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
for capture in json.loads((source / 'captures.json').read_text()):
    width, height, gap, header = 400, 237, 12, 54
    sheet = Image.new('RGB', (4 * width + 5 * gap, 2 * (height + 32) + 3 * gap + header), '#f4f3ec')
    draw = ImageDraw.Draw(sheet)
    draw.text((gap, 16), capture['id'] + '  |  30 Hz  |  canonical 18  |  CC0', font=font, fill='#15342f')
    for index, time in enumerate(capture['times']):
        picture = Image.open(source / f"{capture['id']}-{index}.png").convert('RGB')
        picture = picture.resize((width, height), Image.Resampling.LANCZOS)
        x, y = gap + index % 4 * (width + gap), header + gap + index // 4 * (height + 32 + gap)
        sheet.paste(picture, (x, y))
        draw.text((x + 8, y + height + 6), f'{index + 1:02d}    {time:.3f}s    frame {round(time * 30)}', font=small, fill='#15342f')
    sheet.save(destination / f"{capture['id']}.png", optimize=True)
