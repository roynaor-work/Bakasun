"""Original CC0 transparent champagne VFX flipbook; deterministic procedural particles.
Run python3 source/build-effects.py. No photographs or generated texture dependencies.
"""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math,random,json
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'assets';OUT.mkdir(exist_ok=True)
SIZE=128;SS=3
atlas=Image.new('RGBA',(SIZE*8,SIZE),(0,0,0,0))
for frame in range(8):
 im=Image.new('RGBA',(SIZE*SS,SIZE*SS),(0,0,0,0));d=ImageDraw.Draw(im)
 rng=random.Random(198710)
 # Individual bubbles continuously feed the cone, then drift down with gravity.
 for p in range(185):
  birth=rng.random()*8-3.5
  age=(frame-birth)%8
  speed=rng.uniform(8,17)
  theta=rng.uniform(-.36,.36)
  x=7+age*speed*math.cos(theta)
  y=64+age*speed*math.sin(theta)+age*age*.5
  radius=rng.uniform(.5,1.75)*(1-.05*age)
  alpha=int(max(0,1-age/8)*rng.uniform(110,235))
  if x>126 or y<2 or y>126: continue
  # Tiny cyan/gold specular foam particles, soft inner core + sharp glint.
  col=(215+rng.randrange(35),240+rng.randrange(16),204+rng.randrange(47),alpha)
  r=max(.4,radius)*SS;cx=x*SS;cy=y*SS
  d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=col)
  if p%8==0:
   length=rng.uniform(2,5)*SS
   d.line((cx-length*math.cos(theta),cy-length*math.sin(theta),cx,cy),fill=(*col[:3],max(1,alpha//2)),width=SS)
 # Dense immediate foam at the nozzle has no opaque rectangle or matte fringe.
 for p in range(17):
  x=rng.uniform(5,23);y=64+rng.gauss(0,1.8+x*.09);r=rng.uniform(.7,1.5)
  d.ellipse(((x-r)*SS,(y-r)*SS,(x+r)*SS,(y+r)*SS),fill=(245,255,235,rng.randrange(70,190)))
 im=im.resize((SIZE,SIZE),Image.Resampling.LANCZOS)
 atlas.alpha_composite(im,(frame*SIZE,0))
atlas.save(OUT/'champagne-spray.png',optimize=True)
# Six small ribbon silhouettes in a compact transparent atlas for optional sprites.
conf=Image.new('RGBA',(256,64),(0,0,0,0));dr=ImageDraw.Draw(conf)
colors=['#F0BE58','#4DDED0','#F4F5EC','#F56559']
for i,c in enumerate(colors):
 x=i*64;dr.polygon([(x+25,10),(x+39,15),(x+35,34),(x+42,48),(x+29,54),(x+22,36)],fill=c)
conf.save(OUT/'confetti.png',optimize=True)
metadata={
 'schemaVersion':1,'license':'CC0-1.0','alpha':'straight RGBA; transparent background',
 'champagne':{'file':'assets/champagne-spray.png','width':1024,'height':128,'frames':8,'columns':8,'rows':1,'frameSize':[128,128],'fps':12,'duration':8/12,'loop':True,'originUV':[7/128,.5],'direction':'+X in sprite plane','worldSize':[1.55,1.55], 'blend':'normal','depthWrite':False,'frameUV':[{'frame':i,'offset':[i/8,0],'repeat':[1/8,1]} for i in range(8)]},
 'confetti':{'file':'assets/confetti.png','columns':4,'rows':1,'count':160,'lifeSeconds':4.2,'seed':73117,'gravity':2.5,'drag':.20,'pieceSizeMetres':[.026,.065],'emitterPositions':[[-2.7,.2,.6],[2.7,.2,.6]],'velocityX':[-1.8,1.8],'velocityY':[2.6,5.5],'velocityZ':[-.8,.8],'angularVelocity':[-6,6],'colors':colors,'previewImplementation':'GPU instances; optional transparent atlas for billboard renderers'}
}
(OUT/'effects.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('champagne-spray.png', (OUT/'champagne-spray.png').stat().st_size)
print('confetti.png',(OUT/'confetti.png').stat().st_size)
