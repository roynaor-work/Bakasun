"""Review images are rasterized from the actual PDFs, not browser screenshots."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw
import sys, json
root=Path(__file__).resolve().parents[1]
out=root/'iterations'/sys.argv[1]
docs=json.loads((root/'templates.json').read_text())
files=[]
for d in docs:
    pages=sorted(out.glob(d['id']+'-*.png'))
    files.extend(pages)
    image=Image.open(pages[0]).convert('RGB')
    image.thumbnail((420,594))
    image.save(root/'previews'/f"{d['id']}.webp",quality=88)
w,h=420,620
sheet=Image.new('RGB',(w*4,h*((len(files)+3)//4)),'#e4e5df')
draw=ImageDraw.Draw(sheet)
for i,file in enumerate(files):
    im=Image.open(file).convert('RGB')
    im.thumbnail((396,566))
    x,y=(i%4)*w+12,(i//4)*h+32
    sheet.paste(im,(x,y))
    draw.text((x,y-22),file.stem,fill='#2c302e')
sheet.save(out/'contact-sheet.webp',quality=92)
print('PDF contact sheet:',out/'contact-sheet.webp')
