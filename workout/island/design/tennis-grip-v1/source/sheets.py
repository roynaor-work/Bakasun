"""CC0-1.0. Assemble only actual browser renders; eight phases for every clip."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

root=Path(__file__).resolve().parents[1]
catalog=json.loads((root/'runtime/catalog.json').read_text())
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',12)
width,height=256,294
sheet=Image.new('RGB',(8*width,9*(height+42)+74),'#f4f1e8')
d=ImageDraw.Draw(sheet)
d.text((18,14),'TENNIS / GRIP STUDY 01',fill='#244a3c',font=font)
d.text((18,42),'Native 30 Hz | eight equally spaced phases per clip | fixed right-hand grip | CC0',fill='#758272',font=small)
for row,c in enumerate(catalog['clips']):
 y=74+row*(height+42)
 d.rectangle((0,y,sheet.width,y+28),fill='#e3e6d9')
 d.text((12,y+4),c['id'].upper()+'  /  '+str(c['duration'])+' s',fill='#244a3c',font=font)
 for i in range(8):
  image=Image.open(root/'frames'/f"{c['id']}-{i}.webp").convert('RGB').resize((width,height),Image.Resampling.LANCZOS)
  sheet.paste(image,(i*width,y+28))
  d.text((i*width+10,y+height+28),f'{i+1:02}    {c["duration"]*i/7:.2f} s',fill='#64765f',font=small)
sheet.save(root/'contact-sheet.webp',quality=90,method=6)
print('Wrote 9 x 8 actual rendered frames:',sheet.size)
