"""Deterministic original atlases. Authoring only; Pillow and numpy required."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import json, hashlib

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/textures'
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7007)
SIZE, TILE = 1024, 256
PALETTE = [
    '#426c76', '#82999c', '#555e62', '#28363b',
    '#d2d0b9', '#4e626a', '#162b33', '#438693',
    '#87462e', '#c9a751', '#45525a', '#bec1ae',
    '#c56435', '#ffe5af', '#3d8992', '#222b2f'
]

def rgb(s):
    return tuple(bytes.fromhex(s.removeprefix('#')))

def tile_for(i, fleet):
    col = PALETTE[i]
    if fleet == 'ember':
        col = {0:'#994b3f',1:'#b18f7b',14:'#b04c38'}.get(i,col)
    base = np.array(rgb(col), dtype=float)
    coarse = rng.normal(0, 2.7, (32, 32))
    coarse_img = Image.fromarray(np.uint8(np.clip(coarse+128,0,255))).resize((TILE,TILE), Image.Resampling.BICUBIC)
    noise = np.array(coarse_img).astype(float)-128+rng.normal(0,1.6,(TILE,TILE))
    a = np.uint8(np.clip(base[None,None,:]+noise[:,:,None],0,255))
    im = Image.fromarray(a,'RGB'); d = ImageDraw.Draw(im)
    if i in (0,1):
        # The atlas holds paint, lapped plates, rivets and tapered oxidised drips.
        for y in (6,88,170,249):
            d.line((3,y,252,y), fill=tuple(max(0,int(c*.7)) for c in base), width=2)
            d.line((3,y+2,252,y+2),fill=tuple(min(255,int(c*1.12)) for c in base))
            for x in range(14,255,26):
                d.ellipse((x,y+5,x+2,y+7),fill=rgb('#c0bdb0'))
        for y in (8,90,172):
            for k in range(16):
                x=int(rng.integers(4,248)); length=int(rng.integers(6,48)); w=int(rng.integers(1,5))
                d.polygon([(x-w,y),(x+w,y),(x+1,y+length),(x,y+length+4)],fill=rgb('#785243' if i else '#6c4a36'))
        for x in (4,126,250):
            d.line((x,0,x,255),fill=tuple(int(c*.77) for c in base))
    if i in (2,10):
        for y in range(6,256,32):
            d.line((0,y,256,y),fill=rgb('#465055'))
            for x in range((y//32%2)*32,256,64):
                d.line((x,y,x,y+31),fill=rgb('#465055'))
                for yy in (y+5,y+26):
                    d.ellipse((x+4,yy,x+5,yy+1),fill=rgb('#778185'))
        if i==10:
            d.ellipse((35,35,221,221),outline=rgb('#d9ceb4'),width=6)
            d.line((91,86,91,171),fill=rgb('#d9ceb4'),width=8)
            d.line((165,86,165,171),fill=rgb('#d9ceb4'),width=8)
            d.line((91,128,165,128),fill=rgb('#d9ceb4'),width=8)
    if i==5:
        for y in range(8,248,14):
            d.line((4,y,252,y),fill=rgb('#283b42'),width=5)
            d.line((4,y+5,252,y+5),fill=rgb('#8a9da0'),width=2)
    if i==7:
        d.rectangle((4,4,252,252),fill=rgb('#213a43'))
        for x in range(12,250,48):
            d.rectangle((x,12,x+35,244),fill=rgb('#5a949e'))
            d.polygon([(x,12),(x+35,12),(x+35,45),(x,180)],fill=rgb('#97b5b4'))
            d.line((x,235,x+35,235),fill=rgb('#c7b791'),width=2)
    if i==9:
        for x in range(-256,512,48):
            d.polygon([(x,0),(x+23,0),(x+279,256),(x+256,256)],fill=rgb('#29343a'))
    if i==11:
        for y in range(14,250,51):
            d.rectangle((118,y,138,y+28),fill=rgb('#525e62'))
    if i==12:
        d.ellipse((28,28,228,228),fill=rgb('#c4643b'))
        for p in [(32,110,224,146),(110,32,146,224)]:d.rectangle(p,fill=rgb('#e4dcc3'))
    if i==14:
        d.polygon([(0,170),(256,43),(256,86),(0,213)],fill=rgb('#ede0bf'))
        d.polygon([(0,227),(256,100),(256,124),(0,251)],fill=rgb('#d7b96e'))
    if i==15:
        for y in range(0,256,12):
            d.line((2,y,254,y),fill=rgb('#111d22'),width=5)
    return im

manifest=[]
for fleet in ('tide','ember'):
    # Reset RNG so paint/weathering differs only in fleet colour.
    rng=np.random.default_rng(7007)
    atlas=Image.new('RGB',(SIZE,SIZE))
    for i in range(16):atlas.paste(tile_for(i,fleet),((i%4)*TILE,(i//4)*TILE))
    p=OUT/f'fleet-{fleet}-1024.png';atlas.save(p,optimize=True)
    manifest.append({'file':p.name,'width':1024,'height':1024,'role':'Shared ship colour atlas; 16 material swatches','bytes':p.stat().st_size})

# One 256 atlas for the anonymous crew member: jacket, uniform, face and boots.
crew=Image.new('RGB',(256,256));d=ImageDraw.Draw(crew)
for i,c in enumerate(('#dc9750','#394e59','#bd9672','#182d35')):
    x=(i%2)*128;y=(i//2)*128;d.rectangle((x,y,x+127,y+127),fill=rgb(c))
d.rectangle((12,24,116,36),fill=rgb('#e3d8ad'));d.rectangle((12,88,116,96),fill=rgb('#e3d8ad'))
d.line((63,4,63,123),fill=rgb('#745838'),width=3)
p=OUT/'crew-256.png';crew.save(p,optimize=True)
manifest.append({'file':p.name,'width':256,'height':256,'role':'One crew atlas','bytes':p.stat().st_size})

# Seamless normal map from periodic waves; no photograph or external material.
n=256; yy,xx=np.mgrid[0:n,0:n];u=xx/n*2*np.pi;v=yy/n*2*np.pi
wave_rng=np.random.default_rng(7521);dx=np.zeros((n,n));dy=dx.copy()
for i in range(32):
    fx,fy=wave_rng.integers(-18,19,2);phase=wave_rng.random()*2*np.pi
    strength=.38/(1+fx*fx+fy*fy)**.63
    derivative=np.cos(u*fx+v*fy+phase)*strength
    dx+=derivative*fx;dy+=derivative*fy
normal=np.stack((-dx*.22,-dy*.22,np.ones_like(dx)),axis=-1);normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
p=OUT/'ocean-normal-256.png';Image.fromarray(np.uint8((normal*.5+.5)*255)).save(p,optimize=True)
manifest.append({'file':p.name,'width':256,'height':256,'role':'Periodic tangent normal; two moving samples','bytes':p.stat().st_size})

# Tileable noise LUT replaces many per-fragment sin/hash calls on phone GPUs.
noise_rng=np.random.default_rng(7014)
noise=np.uint8(noise_rng.random((128,128))*255)
p=OUT/'noise-128.png';Image.fromarray(noise,'L').save(p,optimize=True)
manifest.append({'file':p.name,'width':128,'height':128,'role':'Linear repeating shader noise LUT','bytes':p.stat().st_size})

# Eroded basalt with ochre seams; separate environment atlas avoids ship texture waste.
rng=np.random.default_rng(7011);low=Image.fromarray(np.uint8(rng.random((32,32))*255)).resize((512,512),Image.Resampling.BICUBIC)
a=np.array(low).astype(float)/255
rock=np.stack((65+a*40,70+a*45,66+a*38),axis=-1)
rock*=np.where((np.sin(np.mgrid[:512,:512][0]*.14+a*7)>.93)[:,:,None],.65,1)
p=OUT/'basalt-512.png';Image.fromarray(np.uint8(rock)).save(p,optimize=True)
manifest.append({'file':p.name,'width':512,'height':512,'role':'Original basalt; island and rocks share','bytes':p.stat().st_size})
for row in manifest:row['sha256']=hashlib.sha256((OUT/row['file']).read_bytes()).hexdigest()
(ROOT/'verification/textures.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
