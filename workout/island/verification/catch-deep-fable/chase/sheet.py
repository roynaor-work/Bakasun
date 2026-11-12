# Composes 8 frames into one contact sheet (4x2) with the frame number and the chase numbers under each.
#   python3 sheet.py <dir> <prefix> <out.png>   (reads <prefix>-1.png .. -8.png and <prefix>.json)
import json, sys
from PIL import Image, ImageDraw
d, prefix, out = sys.argv[1:4]
rows = json.load(open(f'{d}/{prefix}.json'))['rows']
W, H = 422, 195
sheet = Image.new('RGB', (W * 4, (H + 22) * 2), '#101418'); dr = ImageDraw.Draw(sheet)
for i in range(8):
    im = Image.open(f'{d}/{prefix}-{i+1}.png').resize((W, H)); x, y = (i % 4) * W, (i // 4) * (H + 22)
    sheet.paste(im, (x, y)); r = rows[i]
    dr.text((x + 6, y + H + 4), f"{i+1}  s={r['s']}  d={r['d']}  v={r['v']}  k={r['k']}/km  gap={r['gap']}  cam={r['carAngle']}deg", fill='#e8eef5')
sheet.save(out); print('wrote', out)
