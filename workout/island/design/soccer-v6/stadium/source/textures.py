"""Original, seeded material maps. Pillow/NumPy are authoring tools only."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'textures'
OUT.mkdir(exist_ok=True)
rng = np.random.default_rng(20261104)
N = 1024

def noise(scale):
    f = np.fft.fftfreq(N)
    kernel = np.exp(-2*np.pi*np.pi*scale*scale*(f[:, None]**2 + f[None, :]**2))
    a = np.fft.ifft2(np.fft.fft2(rng.normal(size=(N, N))) * kernel).real
    return a / max(a.std(), 1e-6)

fine, clumps, macro = noise(.65), noise(3.3), noise(23)
height = .13*fine + .12*clumps
blades = np.zeros((N, N))
for _ in range(87000):
    x, y = rng.integers(0, N, 2)
    length = int(rng.integers(3, 13))
    slope, strength = rng.uniform(-.55, .55), rng.uniform(.12, .8)
    for k in range(length):
        blades[(y+k) % N, (x+round(k*slope)) % N] += strength*np.sin(np.pi*(k+1)/(length+1))
height += .22*blades
grain = .026*fine + .022*clumps + .015*macro + .033*blades
rgb = np.clip(np.array([.31, .43, .16]) + grain[:, :, None]*np.array([.65, .85, .36]), 0, 1)
Image.fromarray((rgb*255).astype('uint8')).save(OUT/'turf-albedo.jpg', quality=91, subsampling=0)
dx = (np.roll(height, -1, 1)-np.roll(height, 1, 1))*.7
dy = (np.roll(height, -1, 0)-np.roll(height, 1, 0))*.7
normal = np.stack((-dx, dy, np.ones_like(dx)), -1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
Image.fromarray(((normal*.5+.5)*255).astype('uint8')).resize((512,512)).save(OUT/'turf-normal.webp', lossless=True)
rough = np.clip(.88+.055*clumps-.032*blades, .61, .99)
Image.fromarray((rough*255).astype('uint8')).convert('RGB').resize((512,512)).save(OUT/'turf-roughness.webp', quality=92)

# Four 512px architectural surfaces in one repeatable atlas.
atlas = np.zeros((N, N, 3))
for row, col, color, amount in [(0,0,[.32,.35,.36],.025), (0,1,[.12,.17,.19],.014),
                                (1,0,[.64,.66,.63],.018), (1,1,[.055,.12,.14],.012)]:
    grain = fine[:512,:512]*amount + clumps[:512,:512]*amount*.7
    atlas[row*512:(row+1)*512,col*512:(col+1)*512] = np.clip(np.array(color)+grain[:,:,None],0,1)
Image.fromarray((atlas*255).astype('uint8')).save(OUT/'architecture-atlas.webp',quality=90)

# Brand-free LED panels, one 1024x256 sheet. Neutral phrases, no club graphics.
led = Image.new('RGB',(1024,256),'#07212b'); draw=ImageDraw.Draw(led)
font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font=ImageFont.truetype(font_path,35)
for i, text in enumerate(['THE BEAUTIFUL GAME','EVERY MOMENT','UNDER THE LIGHTS','PLAY TOGETHER']):
    y=i*64
    draw.rectangle((0,y,1024,y+63),fill=['#0d303a','#bdd6d1','#234450','#b7ab7e'][i])
    draw.text((512,y+30),text,font=font,fill=['#e3eee4','#0b2935','#cce8e6','#102b33'][i],anchor='mm')
    for x in range(0,1024,6): draw.line((x,y,x,y+63),fill=(20,39,42),width=1)
led.save(OUT/'led-panels.webp',quality=92)

# RGBA 2x2 atlas: dust, water droplet, lamp halo, grass blade. 2px cell gutters.
n=256; yy,xx=np.mgrid[:n,:n]; uvx=(xx%128-63.5)/61; uvy=(yy%128-63.5)/61
data=np.zeros((n,n,4),dtype=np.uint8)
for cy,cx,col,kind in [(0,0,[184,160,113],'dust'),(0,1,[178,224,245],'water'),(1,0,[204,225,255],'halo'),(1,1,[88,127,39],'blade')]:
    x=uvx[cy*128:(cy+1)*128,cx*128:(cx+1)*128]; y=uvy[cy*128:(cy+1)*128,cx*128:(cx+1)*128]
    r=np.sqrt(x*x+y*y)
    if kind=='dust': alpha=np.clip(1-r,0,1)**2*(.73+.27*np.sin(x*17)*np.cos(y*23))
    elif kind=='water': alpha=np.exp(-((x/.14)**2+(y/.58)**2)*3)*.95
    elif kind=='halo': alpha=np.clip(1-r,0,1)**3*.72+np.exp(-r*r*160)*.28
    else: alpha=np.clip(1-np.abs(x+y*.13)*12,0,1)*np.clip(1-np.abs(y),0,1)**.4
    alpha[(np.abs(x)>.97)|(np.abs(y)>.97)]=0
    data[cy*128:(cy+1)*128,cx*128:(cx+1)*128,:3]=col
    data[cy*128:(cy+1)*128,cx*128:(cx+1)*128,3]=(alpha*255).astype('uint8')
Image.fromarray(data).save(OUT/'particles-atlas.png',optimize=True)
print('Original maps:', [(p.name,p.stat().st_size) for p in OUT.iterdir()])
