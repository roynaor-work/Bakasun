# Composes the 8 frames of one shot (sheet-f*.png from bow-shots.mjs) into one 4x2 sheet with labels.
#   python3 -I make-sheet.py [dir]
import sys, os
from PIL import Image, ImageDraw
d = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
names = ['sheet-f0-drawn', 'sheet-f1-release', 'sheet-f2-flight', 'sheet-f3-flight', 'sheet-f4-flight', 'sheet-f5-flight', 'sheet-f6-slowmo', 'sheet-f7-impact']
labels = ['1 drawn', '2 release', '3 flight 15%', '4 flight 35%', '5 flight 55%', '6 flight 72%', '7 slow motion', '8 impact']
W, H, S = 422, 195, 6
sheet = Image.new('RGB', (4 * W + 5 * S, 2 * H + 3 * S + 2 * 18), '#0c1830')
dr = ImageDraw.Draw(sheet)
for i, n in enumerate(names):
    p = os.path.join(d, n + '.png')
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGB').resize((W, H))
    x = S + (i % 4) * (W + S); y = S + (i // 4) * (H + S + 18)
    sheet.paste(im, (x, y + 18)); dr.text((x + 4, y + 2), labels[i], fill='#ffe08a')
sheet.save(os.path.join(d, 'sheet-one-shot.png'))
print('sheet-one-shot.png', sheet.size)
