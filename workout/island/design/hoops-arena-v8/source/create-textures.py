"""Original geometric maple court and fictional spectator atlas. Pillow only."""
from pathlib import Path
import random, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
ROOT = Path(__file__).resolve().parents[1] / 'runtime'
ROOT.mkdir(exist_ok=True)
rng = random.Random(80341)
W,H = 1024,640
im = Image.new('RGB',(W,H)); pix=im.load()
for y in range(H):
    row=y//6
    for x in range(W):
        board=(x+(row%3)*31)//91
        local=random.Random(row*177+board*734).random()
        wave=math.sin(x*.12+y*.83)*1.5+math.sin(x*.037+y*2.7)
        v=(local-.5)*17+wave+rng.uniform(-1.8,1.8)
        seam=-18 if (x+(row%3)*31)%91==0 or y%6==0 else 0
        pix[x,y]=tuple(max(0,min(255,int(c+v+seam))) for c in (188,139,83))
# Image y maps from negative to positive Z; court long axis is X, in metres.
def pt(x,z): return ((x+16)/32*W,(z+10)/20*H)
def rect(x0,z0,x1,z1,fill):
    d.rectangle((*pt(x0,z0),*pt(x1,z1)),fill=fill)
def line(points,fill=(235,232,216),width=.045):
    d.line([pt(*p) for p in points],fill=fill,width=max(1,round(width*W/32)),joint='curve')
def arc(cx,cz,r,a,b,fill=(235,232,216),width=.05):
    line([(cx+r*math.cos(t),cz+r*math.sin(t)) for t in [a+(b-a)*i/160 for i in range(161)]],fill,width)
baseW,baseH=W,H
im=im.resize((W*3,H*3),Image.Resampling.NEAREST); W,H=im.size
d=ImageDraw.Draw(im)
ink=(229,225,207); teal=(25,70,74); dark=(18,34,42)
rect(-16,-10,16,-7.665,dark);rect(-16,7.665,16,10,dark)
rect(-16,-7.665,-14.37,7.665,dark);rect(14.37,-7.665,16,7.665,dark)
for side in [-1,1]:
    if side<0: rect(-14.325,-2.44,-8.535,2.44,teal)
    else: rect(8.535,-2.44,14.325,2.44,teal)
    x=side*8.535
    line([(side*14.325,-2.44),(x,-2.44),(x,2.44),(side*14.325,2.44)],ink)
    arc(x,0,1.83,-math.pi/2 if side<0 else math.pi/2, math.pi/2 if side<0 else 3*math.pi/2)
    for i in range(8):
        a=math.pi/2+i*math.pi/8 if side<0 else -math.pi/2+i*math.pi/8
        arc(x,0,1.83,a,a+math.pi/16,ink,.035)
    rim=side*12.75
    theta=math.asin(6.70/7.24)
    # The 3-point arc is centred on the basket, with straight corner segments.
    a=math.pi/2-.215 if side<0 else math.pi/2+.215
    b=3*math.pi/2+.215 if side<0 else 3*math.pi/2-.215
    if side<0: a=-theta; b=theta
    else: a=math.pi-theta; b=math.pi+theta
    arc(rim,0,7.24,a,b)
    endx=rim+7.24*math.cos(a); endz=7.24*math.sin(a)
    line([(side*14.325,endz),(endx,endz)])
    line([(side*14.325,-endz),(endx,-endz)])
    arc(rim,0,1.22,-math.pi/2 if side<0 else math.pi/2,math.pi/2 if side<0 else 3*math.pi/2,ink,.04)
    # Lane hash marks.
    for h in [1.1,2.1,3.1,4.1]:
        xx=side*(14.325-h)
        for s in [-1,1]: line([(xx,s*2.48),(xx,s*2.68)],ink,.05)
line([(-14.325,-7.62),(14.325,-7.62),(14.325,7.62),(-14.325,7.62),(-14.325,-7.62)],ink,.055)
line([(0,-7.62),(0,7.62)],ink,.045)
arc(0,0,1.83,0,math.tau,ink,.055)
arc(0,0,.6,0,math.tau,ink,.035)
# Thin offset runoff trim and neutral baseline typography; no badges or symbols.
line([(-15.35,-8.65),(15.35,-8.65),(15.35,8.65),(-15.35,8.65),(-15.35,-8.65)],(63,107,111),.028)
font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font=ImageFont.truetype(font_path,60)
label=Image.new('RGBA',(900,96)); ld=ImageDraw.Draw(label)
ld.text((450,48),'B A S K E T B A L L',font=font,anchor='mm',fill=(183,197,193,255))
for side in [-1,1]:
    text=label.rotate(90 if side<0 else -90,expand=True,resample=Image.Resampling.BICUBIC)
    px,pz=pt(side*15.1,0);im.paste(text,(int(px-text.width/2),int(pz-text.height/2)),text)
im=im.resize((baseW,baseH),Image.Resampling.LANCZOS); W,H=baseW,baseH
im.save(ROOT/'parquet.webp',quality=94,method=6)
# R = occlusion, G = perceptual roughness, B = metallic. Texture is linear.
orm=Image.new('RGB',(W,H));op=orm.load()
for y in range(H):
    for x in range(W):
        n=128+int(12*math.sin(x*.02+y*.18))+rng.randrange(-8,9)
        if y%6==0:n+=18
        op[x,y]=(255,n,0)
orm.save(ROOT/'parquet-orm.webp',lossless=True,method=6)
normal=Image.new('RGB',(512,512));np=normal.load()
for y in range(512):
    for x in range(512):
        np[x,y]=(128+rng.randrange(-1,2),128+int(3*math.cos(x*.23+y*1.8)),255)
normal.save(ROOT/'parquet-normal.webp',lossless=True,method=6)
# 32 invented silhouettes. Render larger and downsample for alpha-tested edges.
S=2; atlas=Image.new('RGBA',(1024*S,512*S))
wardrobe=[(28,91,94),(207,184,139),(177,92,52),(28,41,59),(102,120,113),(160,162,154),(59,76,89),(205,133,61)]
skins=[(204,154,113),(151,103,75),(106,70,51),(226,184,143),(179,129,89)]
for tile in range(32):
    cell=Image.new('RGBA',(128*S,128*S));p=ImageDraw.Draw(cell)
    def poly(coords,c): p.polygon([(int(x*S),int(y*S)) for x,y in coords],fill=c)
    def ellipse(box,c):p.ellipse(tuple(int(v*S) for v in box),fill=c)
    def rr(box,c,r=4):p.rounded_rectangle(tuple(int(v*S) for v in box),radius=r*S,fill=c)
    c=wardrobe[tile%8]; skin=skins[(tile*3)%5]; hair=[(31,24,20),(58,39,25),(76,58,38),(24,25,28)][tile%4]
    # Sitting legs and shoes; bodies are intentionally anonymous at viewing distance.
    poly([(44,85),(60,87),(61,112),(49,113),(42,99)],(41,47,54))
    poly([(66,87),(82,85),(86,100),(79,114),(67,111)],(45,50,56))
    rr((43,109,61,117),(183,182,164),3);rr((69,109,87,117),(174,176,164),3)
    poly([(42,49),(57,44),(74,45),(86,53),(83,85),(74,94),(53,92),(43,80)],c)
    poly([(47,53),(54,54),(51,83),(43,79)],tuple(max(0,v-15) for v in c))
    poly([(59,41),(73,41),(74,52),(58,52)],skin)
    ellipse((52,17,80,46),skin)
    poly([(53,31),(52,23),(56,17),(68,13),(78,18),(81,28),(75,24),(70,22),(64,26),(56,27)],hair)
    if tile%7==0: poly([(50,20),(58,14),(77,16),(81,22),(86,25),(52,25)],(38,59,66))
    p.line((57*S,35*S,61*S,35*S),fill=(92,66,51),width=S)
    p.line((71*S,35*S,75*S,35*S),fill=(92,66,51),width=S)
    # A quarter cheer; asymmetry avoids a repeated cutout pattern.
    if tile>=24:
        poly([(44,52),(34,48),(26,23),(20,24),(23,53),(41,68)],c)
        ellipse((19,16,28,28),skin)
        poly([(80,52),(91,43),(96,20),(103,22),(101,52),(84,68)],c)
        ellipse((95,14,105,25),skin)
    else:
        poly([(45,52),(38,57),(38,79),(52,91),(58,85),(48,76),(50,59)],c)
        poly([(82,53),(90,60),(87,80),(72,91),(68,84),(78,76),(77,61)],c)
        ellipse((52,82,63,91),skin);ellipse((65,81,76,90),skin)
    atlas.alpha_composite(cell,((tile%8)*128*S,(tile//8)*128*S))
atlas=atlas.resize((1024,512),Image.Resampling.LANCZOS)
atlas.save(ROOT/'crowd.webp',lossless=True,method=6)
print('Textures:',', '.join(f'{p.name} {p.stat().st_size:,}B' for p in ROOT.glob('*.webp')))
