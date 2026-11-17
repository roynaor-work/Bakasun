"""Compose actual browser-rendered frames; run browser-check.mjs first."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,math
ROOT=Path(__file__).resolve().parents[1]
FRAMES=Path('/tmp/coach-rendered-frames')
summary=json.loads((ROOT/'source/build-summary.json').read_text())
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
def sheet(names,prefix,cols,out):
    w,h=320,226
    image=Image.new('RGB',(w*cols,h*math.ceil(len(names)/cols)), '#fff8ec')
    d=ImageDraw.Draw(image)
    for i,name in enumerate(names):
        p=Image.open(FRAMES/f'{prefix}-{name}.png').convert('RGB');p.thumbnail((w-10,h-27))
        x=(i%cols)*w+(w-p.width)//2;y=(i//cols)*h
        image.paste(p,(x,y));d.text(((i%cols)*w+10,y+h-22),name,font=font,fill='#244d4b')
    image.save(ROOT/'verification'/out,quality=86,method=6)
sheet(summary['expressions'],'expression',4,'expressions.webp')
sheet([c['name'] for c in summary['clips']],'clip',6,'gestures.webp')
