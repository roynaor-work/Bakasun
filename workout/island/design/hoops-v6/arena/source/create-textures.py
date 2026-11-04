from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random, math, pathlib
out=pathlib.Path(__file__).resolve().parent.parent
island=out.parents[2]
r=random.Random(610411)
S=1024
im=Image.new('RGB',(S,S),'#b8844c'); d=ImageDraw.Draw(im)
# Warm maple planks, subtle open grain, staggered 1.8 m joints.
for row in range(102):
 y0=round(row*S/102); y1=round((row+1)*S/102)
 offset=r.randrange(-58,0)
 while offset<S:
  w=r.randrange(48,84); value=r.randrange(-13,14)
  col=(min(235,189+value),min(209,141+value),min(176,83+value))
  d.rectangle([offset,y0,offset+w,y1],fill=col)
  d.line([offset,y0,offset+w,y0],fill=(121,81,42),width=1)
  d.line([offset,y0,offset,y1],fill=(121,81,42),width=1)
  for _ in range(5):
   sy=r.randint(y0,y1); sx=offset+r.randrange(max(1,w)); ex=min(offset+w,sx+r.randrange(5,36))
   d.line([sx,sy,ex,sy],fill=tuple(min(255,c+r.choice([-5,-3,3,4])) for c in col))
  offset+=w
# Physical court: long X ±14m, Z ±7.5m within 32×19m runoff.
def p(x,z): return ((x+16)/32*S,(z+9.5)/19*S)
def line(points,fill='#eee8da',width=.05): d.line([p(*a) for a in points],fill=fill,width=max(1,round(width*S/24)))
def rect(x0,z0,x1,z1,fill=None,outline=None,width=.05): d.rectangle([p(x0,z0),p(x1,z1)],fill=fill,outline=outline,width=max(1,round(width*S/24)))
def ellipse(x,z,rx,rz,fill=None,outline='#eee8da',width=.05): d.ellipse([p(x-rx,z-rz),p(x+rx,z+rz)],fill=fill,outline=outline,width=max(1,round(width*S/24)))
# Deep navy apron and restrained two-tone keys.
rect(-16,-9.5,16,-7.5,'#101d2b');rect(-16,7.5,16,9.5,'#101d2b');rect(-16,-7.5,-14,7.5,'#101d2b');rect(14,-7.5,16,7.5,'#101d2b')
rect(-14,-2.45,-8.2,2.45,'#28434a');rect(8.2,-2.45,14,2.45,'#9d5836')
# Visible wood lacquer variation also crosses painted regions.
for y in range(0,S,10): d.line([(64,y),(960,y)],fill=(210,164,104),width=1) if r.random()<.13 else None
rect(-14,-7.5,14,7.5,outline='#f5edda',width=.085)
line([(0,-7.5),(0,7.5)],width=.065)
ellipse(0,0,1.8,1.8,width=.065)
for sign in [-1,1]:
 x=sign*8.2
 rect(min(sign*14,x),-2.45,max(sign*14,x),2.45,outline='#f1e5cc',width=.065)
 ellipse(x,0,1.8,1.8,width=.06)
 # Arc correct from basket centre, terminating at short corner line.
 pts=[]
 for i in range(129):
  a=-math.asin(6.6/6.75)+i/128*(2*math.asin(6.6/6.75))
  pts.append((sign*(12.425-6.75*math.cos(a)),6.75*math.sin(a)))
 line(pts,width=.065)
 line([(sign*14,-6.60),(sign*(12.425-math.sqrt(6.75**2-6.6**2)),-6.60)],width=.065)
 line([(sign*14,6.60),(sign*(12.425-math.sqrt(6.75**2-6.6**2)),6.60)],width=.065)
 # Restricted-area semicircle 1.25m.
 pts=[(sign*(12.425-1.25*math.cos(-math.pi/2+i/40*math.pi)),1.25*math.sin(-math.pi/2+i/40*math.pi)) for i in range(41)]
 line(pts,width=.055)
 for xk in [9.5,10.5,11.5]:
  line([(sign*xk,-2.45),(sign*xk,-2.8)],width=.07);line([(sign*xk,2.45),(sign*xk,2.8)],width=.07)
# Original colour-only medallion, deliberately generic and unbranded.
ellipse(0,0,1.38,1.38,fill='#182d36',outline='#dcb67b',width=.08)
line([(-.8,-.6),(0,.68),(.8,-.6)],fill='#cf7f42',width=.18)
line([(-.8,.6),(0,-.68),(.8,.6)],fill='#d8c8a5',width=.18)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
fontsmall=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
for z in [-8.65,8.2]:
 xy=p(0,z);d.text((xy[0],xy[1]),'H O O P S   /   C O U R T   0 6',font=font,fill='#c3b39b',anchor='mm')
# Sparse shoe scuffs and dust without overpowering court markings.
layer=Image.new('RGBA',(S,S)); ld=ImageDraw.Draw(layer)
for _ in range(145):
 x=r.randint(72,952); y=r.randint(112,912); a=r.randrange(10,32)
 ld.arc([x-8,y-3,x+8,y+3],r.randrange(180),r.randrange(180,360),fill=(42,31,22,a),width=1)
for _ in range(400):
 x=r.randint(65,960);y=r.randint(105,920);ld.point((x,y),fill=(41,31,20,r.randrange(8,27)))
im=Image.alpha_composite(im.convert('RGBA'),layer).convert('RGB');im.save(out/'parquet-albedo.webp',quality=92,method=6)
# Normals encode weak directional maple grain; no oversized texture is used.
normal=Image.new('RGB',(S,S)); pix=normal.load(); rough=Image.new('RGB',(S,S)); rp=rough.load()
for y in range(S):
 for x in range(S):
  seam=(y%10==0);g=r.randrange(-2,3);n=7 if seam else g
  pix[x,y]=(128+r.randrange(-1,2),128+n,254)
  a=(115 if seam else 70)+r.randrange(-5,6)
  # More worn, slightly rougher lanes and shoe turning zones.
  a+=int(24*math.exp(-((x-245)**2+(y-512)**2)/6500)+24*math.exp(-((x-779)**2+(y-512)**2)/6500))
  rp[x,y]=(a,a,a)
normal.save(out/'parquet-normal.webp',quality=86,method=6)
rough.save(out/'parquet-roughness.webp',quality=84,method=6)
Image.open(island/'assets/textures/hoops-crowd.webp').resize((896,1008),Image.Resampling.LANCZOS).save(out/'crowd-atlas.webp',quality=88,method=6)
print([(p.name,p.stat().st_size) for p in out.glob('*.webp')])
