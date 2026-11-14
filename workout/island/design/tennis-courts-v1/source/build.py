#!/usr/bin/env python3
"""Original CC0 tennis textures. Rebuild: Python 3, Pillow, NumPy. No downloads."""
from pathlib import Path
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
TEX = ROOT / 'runtime/textures'
assets = []

def save(image, file, role, **meta):
    path = TEX / file
    path.parent.mkdir(parents=True, exist_ok=True)
    # Adaptive RGB palettes preserve fine grain; RGBA keeps smooth alpha gradients.
    # FASTOCTREE RGBA collapses these narrow palettes and visibly bands the skies.
    if not meta.get('transparency'):
        image = image.convert('RGB').quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    image.save(path, optimize=True)
    assets.append(dict(file=str(path.relative_to(ROOT)), role=role,
        width=image.width, height=image.height, bytes=path.stat().st_size,
        sha256=hashlib.sha256(path.read_bytes()).hexdigest(), license='CC0-1.0',
        colorSpace='sRGB', **meta))
    return image.convert('RGBA')

def noise(n, seed, color, strength):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:n, 0:n] / (n - 1)
    field = np.zeros((n, n))
    for freq, amp in [(1, 1.3), (3, .9), (7, .6), (17, .28), (43, .2)]:
        for _ in range(3):
            a, b = rng.integers(-freq, freq+1, 2)
            field += np.sin(2*np.pi*(a*x+b*y)+rng.random()*6.28)*amp
    grain = rng.normal(0, .65, (n, n))
    v = np.array(color)[None, None, :] + (field+grain)[:, :, None]*strength
    v = np.uint8(np.clip(v, 0, 255))
    v[-1] = v[0]
    v[:, -1] = v[:, 0]
    return Image.fromarray(v).convert('RGBA')

def court_lines(size=(512, 1024)):
    # World patch 16x28 m, playable singles 8.23x18 m, service line at +/-4.5.
    s = 3
    im = Image.new('RGBA', (size[0]*s, size[1]*s))
    d = ImageDraw.Draw(im)
    def p(x, z): return ((x/16+.5)*im.width, (z/28+.5)*im.height)
    def line(a, b, w=.055): d.line([p(*a), p(*b)], fill=(251, 248, 225, 255), width=max(1, round(w*im.width/16)))
    for x in [-4.115, 4.115, -5.485, 5.485]: line((x, -9), (x, 9))
    for z in [-9, 9]: line((-5.485, z), (5.485, z), .10)
    for z in [-4.5, 4.5]: line((-4.115, z), (4.115, z))
    line((0, -4.5), (0, 4.5))
    for z in [-9, 9]: line((0, z), (0, z+(.25 if z<0 else -.25)))
    return im.resize(size, Image.Resampling.LANCZOS)

lines = court_lines()
save(lines, 'shared/court-lines.png', 'court-lines', transparency=True, wrap='clamp', worldSize=[16,28])

palettes = {
    'clay': dict(base=(172,76,47), apron=(116,58,43), strength=2.5, seed=311),
    'grass': dict(base=(63,112,63), apron=(36,78,58), strength=1.7, seed=719),
    'hard': dict(base=(46,106,155), apron=(30,76,94), strength=1.15, seed=1201),
}
for surface, cfg in palettes.items():
    tile = noise(256, cfg['seed'], cfg['base'], cfg['strength'])
    if surface == 'grass':
        ar = np.array(tile)
        for x in range(256):
            ar[:,x,:3] = np.uint8(np.clip(ar[:,x,:3].astype(float)*(1+.025*math.cos(2*math.pi*x/255)),0,255))
        ar[-1] = ar[0]; ar[:,-1] = ar[:,0]
        tile = Image.fromarray(ar)
    tile = save(tile, surface+'/surface-tile.png', 'surface-tile', surface=surface, transparency=False, wrap='repeat', seamless=True, worldSize=[2,2])
    court = Image.new('RGBA', (512,1024), (*cfg['apron'],255))
    for y in range(0,1024,256):
        for x in range(0,512,256): court.paste(tile, (x,y))
    a = np.array(court).astype(float)
    xx = (np.arange(512)/512-.5)*16
    zz = (np.arange(1024)/1024-.5)*28
    inside = (np.abs(xx)[None,:]<=5.485)&(np.abs(zz)[:,None]<=9)
    a[:,:,:3][~inside] *= .76
    if surface == 'grass':
        stripes = np.where((np.floor((zz+9)/1.8).astype(int)%2)==0,1.07,.94)
        a[:,:,:3] *= stripes[:,None,None]
        # Warm, subtle baseline wear; all noise is original and deterministic.
        wear = np.exp(-((np.abs(zz[:,None])-8.2)/.65)**2)*np.exp(-(xx[None,:]/2.7)**2)
        a[:,:,:3] = a[:,:,:3]*(1-wear[:,:,None]*.12)+np.array([145,132,72])*wear[:,:,None]*.12
    if surface == 'clay':
        # Drag-brush sweeps, never crossing or replacing the court markings.
        sweep = np.sin((xx[None,:]**2+(zz[:,None]-9)**2)*.9)*.9
        a[:,:,:3] += sweep[:,:,None]
    court = Image.fromarray(np.uint8(np.clip(a,0,255)))
    court.alpha_composite(lines)
    save(court,surface+'/court.png','court',surface=surface,transparency=False,wrap='clamp',worldSize=[16,28],markingsBaked=True)

# Full net with open alpha cells, reinforced top tape and bottom binding.
net = Image.new('RGBA',(1024,128)); d = ImageDraw.Draw(net)
for x in range(0,1024,8): d.line((x,4,x,127), fill=(30,43,45,220),width=1)
for y in range(4,128,8): d.line((0,y,1023,y), fill=(30,43,45,215),width=1)
d.rectangle((0,0,1023,5),fill=(243,240,220,255)); d.line((0,6,1023,6),fill=(158,167,157,255),width=2)
d.rectangle((0,124,1023,127),fill=(45,56,54,255))
save(net,'shared/net.png','net',transparency=True,wrap='clamp',worldSize=[11.3,1.07],sagCenter=.156)

y,x=np.mgrid[-1:1:128j,-1:1:128j]
r=x*x+y*y
rgba=np.zeros((128,128,4),dtype=np.uint8); rgba[:,:,:3]=[17,26,29]
rgba[:,:,3]=np.uint8(np.clip(np.exp(-r*5.5)*(1-np.minimum(r,1))*150,0,255))
save(Image.fromarray(rgba),'shared/ball-shadow.png','ball-shadow',transparency=True,wrap='clamp',pivot=[.5,.5])

for tier,base in [('lower',(65,86,94)),('upper',(48,68,79))]:
    im=Image.new('RGBA',(512,128)); d=ImageDraw.Draw(im)
    d.rounded_rectangle((1,1,510,126),radius=5,fill=(*base,255))
    for yy in range(12,128,28):
        d.rectangle((4,yy,507,yy+3),fill=(145,160,158,255))
        d.rectangle((4,yy+4,507,yy+6),fill=(30,45,53,255))
    for xx in range(64,512,64): d.line((xx,6,xx,122),fill=(32,47,53,255),width=2)
    d.rectangle((3,3,508,7),fill=(209,178,109,255))
    save(im,f'shared/stand-{tier}.png',f'stand-{tier}',transparency=True,wrap='clamp',tiers=2)

im=Image.new('RGBA',(512,128)); d=ImageDraw.Draw(im)
for i,col in enumerate([(23,64,64),(197,165,91),(226,226,205),(44,81,107)]):
    x=i*128
    d.rounded_rectangle((x+3,3,x+124,124),radius=6,fill=(23,36,40,255))
    d.rounded_rectangle((x+6,6,x+121,121),radius=4,fill=(*col,255))
    # Plain colored panels: no writing, pseudo lettering, sponsor marks or logo.
    d.rectangle((x+9,9,x+118,12),fill=(255,255,240,55))
save(im,'shared/blank-signs.png','blank-signs',transparency=True,wrap='clamp',frames=4,frameSize=[128,128],gutter=3)

for effect in ['clay-dust','grass-spray']:
    im=Image.new('RGBA',(768,128)); rng=np.random.default_rng(439 if effect=='clay-dust' else 990)
    particles=[(rng.uniform(-1,1),rng.uniform(.3,1),rng.uniform(1,5),rng.uniform(0,1)) for _ in range(35)]
    for frame in range(6):
        f=Image.new('RGBA',(128,128)); dr=ImageDraw.Draw(f); t=frame/5
        for vx,vy,size,phase in particles:
            px=64+vx*(10+t*47); py=99-vy*(10+80*t)+40*t*t
            alpha=round((1-t)**.8*180)
            if effect=='clay-dust':
                rr=size*(1+t*1.5)
                dr.ellipse((px-rr,py-rr,px+rr,py+rr),fill=(205+round(phase*24),130+round(phase*25),81,alpha))
            else:
                dr.polygon([(px-size,py+size),(px+size*.5,py-size*2.2),(px+size,py+size)],fill=(80+round(phase*40),135+round(phase*45),45,alpha))
        if effect=='clay-dust': f=f.filter(ImageFilter.GaussianBlur(.85))
        im.alpha_composite(f,(frame*128,0))
    save(im,'shared/'+effect+'.png',effect,transparency=True,wrap='clamp',frames=6,frameSize=[128,128],pivot=[.5,.78],duration=.6)

for mode,stops in {
    'day':[(33,94,146),(103,169,201),(198,220,216)],
    'sunset':[(36,43,85),(159,101,119),(246,176,116)],
    'night':[(5,14,31),(13,30,53),(35,60,76)]
}.items():
    w,h=1024,512
    yy,xx=np.mgrid[0:h,0:w]; t=yy/(h-1)
    a=np.array(stops[0])*(1-np.minimum(t*2,1))[:,:,None]+np.array(stops[1])*np.minimum(t*2,1)[:,:,None]
    k=np.maximum(t*2-1,0)[:,:,None]; a=a*(1-k)+np.array(stops[2])*k
    # Periodic clouds at horizon; identical horizontal boundary pixels.
    cloud=(np.sin(xx*2*np.pi/(w-1)*3+np.sin(yy/37))*.5+.5)*np.exp(-((t-.6)/.18)**2)
    a+=cloud[:,:,None]*(10 if mode!='night' else 2)
    im=Image.fromarray(np.uint8(np.clip(a,0,255))).convert('RGBA')
    dr=ImageDraw.Draw(im)
    if mode=='night':
        rng=np.random.default_rng(1117)
        for _ in range(95):
            sx=int(rng.integers(6,w-6)); sy=int(rng.integers(5,330)); b=int(rng.integers(80,175))
            dr.ellipse((sx,sy,sx+1,sy+1),fill=(b,b,min(b+25,255),255))
    else:
        # Soft sun stays away from the horizontal seam.
        glow=Image.new('RGBA',(w,h)); gd=ImageDraw.Draw(glow)
        sx,sy=(770,124) if mode=='day' else (750,370)
        gd.ellipse((sx-36,sy-36,sx+36,sy+36),fill=(255,222,159,38))
        glow=glow.filter(ImageFilter.GaussianBlur(18)); im.alpha_composite(glow)
        dr=ImageDraw.Draw(im); r=14 if mode=='day' else 21
        dr.ellipse((sx-r,sy-r,sx+r,sy+r),fill=(255,243,205,255))
    ar=np.array(im); ar[:,-1]=ar[:,0]; im=Image.fromarray(ar)
    save(im,f'shared/sky-{mode}.png','sky',time=mode,transparency=False,wrap='repeat-x',seamlessX=True)

y,x=np.mgrid[0:512,0:256]; t=y/511; center=127.5
width=7+t*118
alpha=np.maximum(0,1-((x-center)/width)**2)*(1-t)**1.2*60
rgba=np.zeros((512,256,4),dtype=np.uint8); rgba[:,:,:3]=[191,222,238]; rgba[:,:,3]=alpha.astype('uint8')
save(Image.fromarray(rgba),'shared/floodlight-beam.png','floodlight-beam',transparency=True,wrap='clamp',pivot=[.5,0],blend='additive')
im=Image.new('RGBA',(256,128)); d=ImageDraw.Draw(im)
d.rounded_rectangle((3,20,252,108),radius=10,fill=(34,48,58,255))
for row in range(2):
    for col in range(6):
        x=15+col*39; y=30+row*34
        d.rounded_rectangle((x,y,x+31,y+26),radius=3,fill=(226,239,235,255))
        d.rectangle((x+4,y+4,x+27,y+22),fill=(253,253,226,255))
save(im,'shared/floodlight-lamp.png','floodlight-lamp',transparency=True,wrap='clamp')

shared=[a['file'] for a in assets if '/shared/' in a['file']]
sets=[]
for surface in palettes:
    files=shared+[a['file'] for a in assets if a.get('surface')==surface]
    # Counting every shared image (all three skies and both surface effects) per set is conservative.
    payload=sum(a['bytes'] for a in assets if a['file'] in files)
    sets.append(dict(id=surface,files=files,payloadBytes=payload,budgetBytes=800000,
        effect={'clay':'clay-dust','grass':'grass-spray','hard':None}[surface]))
manifest=dict(id='tennis-courts-v1',version=1,license='CC0-1.0',units='meters',up='+Y',forward='+Z',
    origin='court center at ground level; +Z toward near baseline',compression='adaptive RGB palette / RGBA PNG; no WASM or decoder',
    compatibility=dict(package='tennis-crowd-3d-v1',referenceCommit='950f6650bc2dd4b2216c66228ceceb7476949b9b',
        assetIndex='assets.json',adapter='createCourt({T,base,surface,time,lod})',crowdAdapter='createCrowd({T,GLTFLoader,seats,base})',
        seats=600,seatSpacing=.7,rowRise=.42,rowSetback=.88,footToSeatHeight=.50),
    court=dict(worldSize=[16,28],singlesWidth=8.23,doublesWidth=10.97,length=18,serviceLength=4.5,
        gameScale=True,note='Game dimensions from config; decorative doubles alleys are not a gameplay change.',
        net=dict(width=11.3,postHeight=1.07,centerHeight=.914)),
    stands=dict(tiers=['lower','upper'],rows=5,lowerRows=2,upperRows=3,modules=10,lods=['high','low']),
    preview=dict(viewport=[844,390],cameras=dict(game=dict(position=[0,12.8,25],target=[0,.4,-.7],fov=40.3))),
    assets=assets,sets=sets,payloadBytes=sum(a['bytes'] for a in assets))
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
# Keep the original crowd package's flat assets[] index for tooling that expects assets.json.
(ROOT/'assets.json').write_text(json.dumps({k:manifest[k] for k in ['license','units','up','forward','compression','assets','payloadBytes']},indent=2)+'\n')
for entry in sets:
    assert entry['payloadBytes']<=800000, entry
print(json.dumps({'images':len(assets),'pngBytes':manifest['payloadBytes'],'sets':{s['id']:s['payloadBytes'] for s in sets}}))
