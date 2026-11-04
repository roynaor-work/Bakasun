"""Deterministic material maps. Run with Python + Pillow + numpy, from any cwd.

The crowd is a technical resize of the existing MakeHuman render atlas, not a
new drawing of people. All other maps are original surface/material patterns.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'textures'
OUT.mkdir(exist_ok=True)
rng = np.random.default_rng(504)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def save(name, a, quality=90):
    im = a if isinstance(a, Image.Image) else Image.fromarray(np.uint8(np.clip(a, 0, 255)))
    opts = {'quality': quality, 'subsampling': 0} if name.endswith('.jpg') else {'optimize': True}
    im.save(OUT / name, **opts)

def normal(name, height, strength):
    dy, dx = np.gradient(height)
    n = np.stack((-dx*strength, dy*strength, np.ones_like(dx)), axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    save(name, (n*.5+.5)*255)

# Four metres square, 19 cm-wide maple strips. Board joints are staggered.
n = 1024
y, x = np.mgrid[:n, :n]
grain = np.zeros((n, n), dtype=float)
tone = np.zeros_like(grain)
seam = np.zeros_like(grain, dtype=bool)
for row in range(21):
    band = y//49 == row
    offset = int(rng.integers(0, 310))
    board = (x+offset)//310
    for k in range(5):
        tone[band & (board == k)] = rng.uniform(-13, 13)
    phase = rng.uniform(0, 6.28)
    grain += band*(np.sin(y*.9+np.sin(x*.013+phase)*1.8)*1.6
                   + np.sin(y*2.7+x*.009)*.8 + np.sin(y*.27+np.sin(x*.02)*.7)*1.4)
    seam |= band & ((x+offset) % 310 < 1)
seam |= y % 49 == 0
noise = rng.normal(0, .65, (n, n))
wood = np.array([198, 151, 95])[None, None, :] + (tone+grain+noise)[:, :, None]
wood[seam] *= .73
save('maple-color.jpg', wood, 91)
height = grain*.003 - seam*.12
normal('maple-normal.png', np.array(Image.fromarray(height.astype('float32')).resize((512,512))), .8)
rough = np.clip(109 + tone*.5 + grain*1.3 + noise, 80, 135)
save('maple-roughness.png', Image.fromarray(rough.astype('uint8')).resize((512, 512)).convert('RGB'))

# Leather pebbling in equirectangular UVs, dark recessed panel seams.
v, u = np.mgrid[:512, :1024]
phi = u/1024*np.pi*2
theta = v/511*np.pi
sx, sy, sz = np.sin(theta)*np.cos(phi), np.cos(theta), np.sin(theta)*np.sin(phi)
joint = np.minimum.reduce([np.abs(sx), np.abs(sy), np.abs(sz*sz-.48)*.7])
cx = (u+(v//7 % 2)*3.5) % 7 - 3.5
cy = v % 7 - 3.5
pebble = np.maximum(0, 1-(cx*cx+cy*cy)/10)**.5
base = np.array([181, 76, 26])[None,None,:]
leather = base + (pebble*15 + rng.normal(0, 2, u.shape))[:,:,None]
mask = np.clip((joint-.007)/.007, 0, 1)[:,:,None]
leather = leather*mask + np.array([29, 19, 14])*(1-mask)
save('leather-color.jpg', leather, 92)
normal('leather-normal.png', pebble*.22 - (joint < .014)*.3, 1.15)

# The original garment maps use front U=[0,.5], back U=[.5,1].
for team, color, trim, number in [
    ('deep-teal', (17,65,75), (234,213,166), '07'),
    ('warm-ivory', (219,200,157), (13,43,52), '23'),
]:
    yy, xx = np.mgrid[:1024, :1024]
    knit = ((xx%5 == 0) & (yy%5 == 0))*-17 + ((xx+yy)%3 == 0)*3
    im = Image.fromarray(np.uint8(np.clip(np.array(color)[None,None,:]+knit[:,:,None],0,255)))
    d = ImageDraw.Draw(im)
    for start in [0,512]:
        d.rectangle((start+30,0,start+47,1023), fill=trim)
        d.rectangle((start+465,0,start+482,1023), fill=trim)
        d.line((start+85,312,start+427,312), fill=trim, width=3)
        d.text((start+256,565), number, font=ImageFont.truetype(FONT,214), anchor='mm',
               fill=trim, stroke_width=4, stroke_fill=tuple(int(c*.72) for c in trim))
        for dy in [950,958]: d.line((start,dy,start+512,dy),fill=trim,width=3)
    save('jersey-'+team+'.jpg',im,92)

# Square source maximum remains 1024; preserve all 48 tile cells exactly.
crowd = Image.open(ROOT.parents[1]/'assets/textures/hoops-crowd.webp')
crowd.resize((1024,1024), Image.Resampling.LANCZOS).save(OUT/'crowd-atlas.png', optimize=True)

board = Image.new('RGB',(1024,512),'#080f19')
d = ImageDraw.Draw(board)
d.rectangle((0,0,1023,8),fill='#d4b26c')
d.rectangle((0,497,1023,511),fill='#d4b26c')
for cx, label, score, color in [(221,'HOME','08','#e0c081'),(803,'AWAY','11','#8fcbd3')]:
    d.text((cx,76),label,font=ImageFont.truetype(FONT,44),anchor='mm',fill='#a0afb9')
    d.text((cx,227),score,font=ImageFont.truetype(FONT,180),anchor='mm',fill=color)
d.text((512,383),'08:24',font=ImageFont.truetype(FONT,86),anchor='mm',fill='#edf3f2')
d.text((512,462),'Q2  •  24',font=ImageFont.truetype(FONT,33),anchor='mm',fill='#b4c5cd')
save('scoreboard.png',board)

shot = Image.new('RGB',(256,128),'#080d12')
d = ImageDraw.Draw(shot)
d.text((128,67),'24',font=ImageFont.truetype(FONT,106),anchor='mm',fill='#f2ac4c')
save('shot-clock.png',shot)

led = Image.new('RGB',(1024,128),'#0a202b')
d = ImageDraw.Draw(led)
for i in range(4):
    d.text((i*256+128,65),'ISLAND',font=ImageFont.truetype(FONT,39),anchor='mm',fill='#d9c18c')
    d.rectangle((i*256+240,35,i*256+243,93),fill='#5897a1')
save('ribbon.png',led)

records = []
for p in sorted(OUT.iterdir()):
    im = Image.open(p)
    assert max(im.size) <= 1024 and p.stat().st_size <= 1_500_000, p
    records.append({'file':'textures/'+p.name,'bytes':p.stat().st_size,'width':im.width,'height':im.height})
(ROOT/'verification/texture-inventory.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps(records,indent=2))
