#!/usr/bin/env python3
"""Static inspection sheets, derived only from the shipped media."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'manifest.json').read_text())
sheet=Image.new('RGB',(1184,610),'#0b1423');draw=ImageDraw.Draw(sheet)
for role_i,role in enumerate(['PROJECTILE','FIRE','IMPACT','TRAIL']):
    draw.text((154+role_i*256,12),role+' / 0 - 3',fill='#9eb2ca')
for row,w in enumerate(manifest['weapons']):
    atlas=Image.open(root/w['atlas'])
    y=42+row*94
    draw.text((12,y+19),w['callsign'],fill=w['color'])
    draw.text((12,y+37),w['id'][:20],fill='#92a3b9')
    for col,frame in enumerate(w['frames'].values()):
        x=144+col*64
        for by in range(0,64,8):
            for bx in range(0,64,8):
                draw.rectangle((x+bx,y+by,x+bx+7,y+by+7),fill='#1c2b42' if (bx+by)//8%2 else '#142136')
        sx,sy,width,height=frame['rect']
        tile=atlas.crop((sx,sy,sx+width,sy+height));tile.thumbnail((60,60),Image.Resampling.LANCZOS)
        sheet.paste(tile,(x+(64-tile.width)//2,y+(64-tile.height)//2),tile)
sheet.save(root/'verification/frames.webp',quality=92)

preview=Image.new('RGB',(844,585),'#0a111f')
for i,w in enumerate(manifest['weapons']):
    tile=Image.open(root/'verification'/f'{w["id"]}-844x390.webp')
    tile=tile.resize((422,195),Image.Resampling.LANCZOS)
    preview.paste(tile,((i%2)*422,(i//2)*195))
preview.save(root/'verification/overview.webp',quality=92)

icons=Image.new('RGB',(840,380),'#0b1423');draw=ImageDraw.Draw(icons)
for i,w in enumerate(manifest['weapons']):
    x=i*140
    draw.text((x+12,10),w['callsign'],fill=w['color'])
    for j,item in enumerate([*w['button'].values(),w['refill']]):
        image=Image.open(root/item['png']).resize((72,72),Image.Resampling.LANCZOS)
        icons.paste(image,(x+30,30+j*85),image)
icons.save(root/'verification/icons.webp',quality=92)
print('Wrote frame, icon and 6-weapon inspection sheets')
