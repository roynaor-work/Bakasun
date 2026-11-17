"""Visual proof sheet assembled exclusively from the shipped sprite rectangles."""
from pathlib import Path
from PIL import Image,ImageDraw
import json
ROOT=Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'manifest.json').read_text())
assets={a['id']:a for a in manifest['assets']}
rows=[('wake-8',list(range(8))),
      *[('impact-4x8',list(range(v*8,(v+1)*8))) for v in range(4)],
      ('near-miss-column-12',list(range(12)))]
sheet=Image.new('RGB',(1440,910),'#18333f');draw=ImageDraw.Draw(sheet)
for row,(id,indices) in enumerate(rows):
    a=assets[id];im=Image.open(ROOT/a['path']).convert('RGBA')
    draw.text((14,row*150+8),id+(' / variant '+str(row) if 1<=row<=4 else ''),fill='#f1dfc0')
    cell=1440//len(indices)
    for col,index in enumerate(indices):
        x,y,w,h=a['frames'][index]['rect'];frame=im.crop((x,y,x+w,y+h));frame.thumbnail((cell-12,112))
        sheet.paste(frame,(col*cell+(cell-frame.width)//2,row*150+28),frame)
        draw.text((col*cell+8,row*150+135),str(index),fill='#9ab6bf')
sheet.save(ROOT/'verification/sprites.png',optimize=True)
