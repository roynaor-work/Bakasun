"""Adapt the repository's original CC0 athlete surfaces into four tennis adults.

Read-only imports reuse modeled anatomy, garment lofts, faces and sneaker lasts.
No source generator is executed, no existing file is written. All raw data goes
to /tmp/tennis-v7-raw. One 512 atlas per character is authored here.
"""
import sys, json, math
from pathlib import Path
sys.dont_write_bytecode = True
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT.parent/'characters2/source'))
from mesh import Mesh, linear_rgb
from body import add_body, loft, blend
from head_hands import _face, _hair
from gear import _shoe_upper, _shoe_details, _surface

SOURCE=json.loads((ROOT.parent/'characters/rig.json').read_text())
OLD=[j['name'] for j in SOURCE['joints']]
RIG={j['name']:np.linalg.inv(np.array(j['inverseBindMatrix']).reshape(4,4).T)[:3,3] for j in SOURCE['joints']}
CANON=json.loads((ROOT.parent/'motion2/soccer.json').read_text())['skeleton']['bones']
NAMES=[b['name'] for b in CANON]
RAW=Path('/tmp/tennis-v7-raw');RAW.mkdir(exist_ok=True)
(ROOT/'textures').mkdir(exist_ok=True)

LOOKS=[
 {'id':'man-01','gender':'male','label':'שחקן א׳','skin':'#B67D57','hair':'#2C2928','shirt':'#F5F0DF','shorts':'#234D49','accent':'#D3AF6E','style':'crop'},
 {'id':'man-02','gender':'male','label':'שחקן ב׳','skin':'#6E4637','hair':'#211D20','shirt':'#C9785C','shorts':'#ECE9DB','accent':'#F3DFBA','style':'curls'},
 {'id':'woman-01','gender':'female','label':'שחקנית א׳','skin':'#D5A27C','hair':'#543B2D','shirt':'#436F63','shorts':'#F4ECDD','accent':'#DAC58F','style':'pony'},
 {'id':'woman-02','gender':'female','label':'שחקנית ב׳','skin':'#895B45','hair':'#201F26','shirt':'#D3AA6C','shorts':'#263F49','accent':'#EFE8D7','style':'bun'},
]

def adult(p, female=False):
 x,y,z=p
 yy=float(np.interp(y,[0,.12,.55,.65,1.04,1.075,1.32],[0,.14,.925,1.045,1.495,1.535,1.797]))
 head=y>1.065
 sx=1.12 if head else 1.25
 if female and not head and not (abs(x)>.14 and y>.9):
  sx*=float(np.interp(y,[0,.55,.65,.75,1.0,1.065],[.94,.99,.84,.81,.90,.95]))
 return [float(x*sx),yy,float(z*(1.08 if head else 1.16))]

def grip(mesh, sign):
 """Five distinct curled fingers and a palm around a 26 mm racket handle."""
 wrist=RIG['LeftHand' if sign>0 else 'RightHand']
 weight={'LeftHand' if sign>0 else 'RightHand':1}
 def p(dx,dy,dz): return wrist+np.array([sign*dx,dy,dz])
 mesh.ellipsoid(p(.017,0,0),[.027,.023,.014],'skin',weight,segments=16,rings=8)
 for i in range(4):
  yy=-.017+i*.011
  points=[p(.023,yy,.004),p(.043,yy,.006),p(.052,yy,-.007),p(.046,yy,-.023),p(.029,yy,-.023)]
  mesh.tube(points,[.0065,.0062,.0058,.0055,.004],'skin',weight,segments=8)
  mesh.ellipsoid(p(.043,yy,-.025),[.0055,.0036,.0012],'nails',weight,segments=8,rings=4,color='#BE9578')
 mesh.tube([p(.007,.017,0),p(.029,.025,-.002),p(.045,.019,-.013),p(.037,.007,-.023)],
  [.009,.008,.007,.005],'skin',weight,segments=10)
 # A terry wristband reads clearly at broadcast distance.
 mesh.tube([p(-.015,0,0),p(-.001,0,0)],[.027,.027],'accent',weight,segments=18)

def hair(mesh, look):
 style=look['style']
 if style=='crop':
  _hair(mesh,'soccer-player')
 elif style=='curls':
  mesh.ellipsoid([0,1.272,-.025],[.081,.060,.081],'hair',{'Head':1},segments=24,rings=12)
  rng=np.random.default_rng(142)
  for j in range(65):
   a=float(rng.uniform(0,2*math.pi));p=float(rng.uniform(0,1.4))
   mesh.ellipsoid([.077*math.sin(p)*math.sin(a),1.267+.067*math.cos(p),-.027+.078*math.sin(p)*math.cos(a)],
    [.013,.012,.013],'hair',{'Head':1},segments=8,rings=5)
 else:
  # A sculpted swept cap with a shaped front hairline, ears remain visible.
  verts=[[0,1.333,-.02]];rows=10;seg=40
  for r in range(1,rows+1):
   for j in range(seg):
    a=j*math.tau/seg
    bottom=1.207+.046*max(math.cos(a),0)**2-.024*max(-math.cos(a),0)
    p=r/rows*math.acos(np.clip((bottom-1.220)/.116,-.999,.999))
    verts.append([.081*math.sin(p)*math.sin(a),1.220+.116*math.cos(p),-.020+.089*math.sin(p)*math.cos(a)])
  faces=[(0,1+j,1+(j+1)%seg) for j in range(seg)]
  for r in range(rows-1):
   for j in range(seg):
    a=1+r*seg+j;b=1+r*seg+(j+1)%seg
    faces.extend([(a,b,a+seg),(b,b+seg,a+seg)])
  mesh.add(verts,faces,'hair',{'Head':1})
  if style=='pony':
   mesh.tube([[0,1.278,-.089],[0,1.277,-.135],[.012,1.238,-.163],[.020,1.183,-.167],[.021,1.137,-.146]],
    [.027,.030,.028,.022,.010],'hair',{'Head':1},segments=18)
   mesh.tube([[0,1.278,-.105],[0,1.276,-.119]],[.029,.029],'accent',{'Head':1},segments=18)
  else:
   mesh.ellipsoid([0,1.284,-.111],[.044,.041,.040],'hair',{'Head':1},segments=22,rings=12)
  for sign in [-1,1]:
   mesh.tube([[sign*.022,1.323,.013],[sign*.065,1.299,-.002],[sign*.077,1.257,-.046],[sign*.042,1.267,-.091]],
    [.0035]*4,'hair',{'Head':1},segments=6,color='#70523D' if style=='pony' else '#37333E')

def shoes(mesh):
 for side,sign in [('Left',1),('Right',-1)]:
  x=sign*.085;weights={side+'Foot':1}
  _shoe_upper(mesh,x,weights,False)
  rings=[]
  for y,s in [(.009,.96),(.016,1.01),(.031,1.01),(.037,.96)]:
   rings.append([(x+.052*s*math.sin(j*math.tau/28),y+max(0,.125*math.cos(j*math.tau/28)-.065)*.07,
    .003+.125*s*math.cos(j*math.tau/28)) for j in range(28)])
  _surface(mesh,rings,'soles',weights)
  _shoe_details(mesh,x,weights,'tennis')

def atlas(mesh,look):
 rng=np.random.default_rng(705)
 image=np.full((512,512,3),255,np.uint8)
 keys=[];tile_for={}
 for part in mesh.parts:
  key=(part['region'],tuple(round(v,6) for v in part['linearRGB']))
  if key not in tile_for:tile_for[key]=len(keys);keys.append(key)
 if len(keys)>64:raise ValueError('Atlas palette full')
 for (region,rgb),index in tile_for.items():
  rgb=np.array(rgb);srgb=np.where(rgb<=.0031308,rgb*12.92,1.055*rgb**(1/2.4)-.055)
  tile=np.broadcast_to(srgb*255,(64,64,3)).copy()
  noise=rng.normal(0,.7,(64,64,1))
  if region in ['shirt','shorts','accent','socks']:
   yy,xx=np.mgrid[:64,:64]
   noise+=(((xx%3)==0)*.85+((yy%3)==0)*.6-1)[...,None]
  tile=np.uint8(np.clip(tile+noise,0,255))
  x=index%8*64;y=index//8*64;image[y:y+64,x:x+64]=tile
 uv=np.zeros((len(mesh.positions),2))
 for part in mesh.parts:
  key=(part['region'],tuple(round(v,6) for v in part['linearRGB']));index=tile_for[key]
  for i in range(part['firstVertex'],part['firstVertex']+part['vertexCount']):
   x,y,z=mesh.positions[i]
   # Interior 6 px gutters prevent adjacent material bleeding in mip levels.
   u=.10+.80*((x*3+z*1.6)%1);v=.10+.80*((y*3)%1)
   uv[i]=[(index%8+u)/8,(index//8+v)/8]
 out=ROOT/'textures'/(look['id']+'-atlas.png');Image.fromarray(image).save(out,optimize=True)
 return uv.tolist(),len(keys)

def build(look):
 female=look['gender']=='female'
 palette={**look,'socks':'#F4F0E4','shoes':'#EEE8D8','soles':'#D8D2C4'}
 mesh=Mesh(OLD,palette)
 add_body(mesh,'basketball-player' if female else 'soccer-player',RIG)
 # Remove the entire old long-sock shell and its raised top cuff. It would
 # otherwise coincide with exposed calf skin and leave a visible circular seam.
 remove=set()
 old_sock_top=.185 if female else .307
 for part in mesh.parts:
  indices=range(part['firstVertex'],part['firstVertex']+part['vertexCount'])
  ys=[mesh.positions[i][1] for i in indices]
  old_cuff=part['region']=='accent' and ((min(ys)>old_sock_top-.016 and max(ys)<old_sock_top+.016) or (female and min(ys)>.353 and max(ys)<.378))
  if part['region']=='socks' or old_cuff:remove.update(indices)
 mesh.indices=[tri for tri in mesh.indices if not any(i in remove for i in tri)]
 if female:
  # Remove the visible lower basketball-short legs beneath the tennis skort.
  keep=[]
  for tri in mesh.indices:
   if all(mesh.regions[i]=='shorts' for i in tri) and min(mesh.positions[i][1] for i in tri)<.455:continue
   keep.append(tri)
  mesh.indices=keep
 for side in ['Left','Right']:
  hip,knee,ankle=[RIG[side+n] for n in ['UpLeg','Leg','Foot']]
  def center(y):
   a,b=(hip,knee) if y>=knee[1] else (knee,ankle)
   t=float((a[1]-y)/(a[1]-b[1]));return (a*(1-t)+b*t).tolist()
  if female:
   rows=[(.485,(.067,.070)),(.458,(.065,.068)),(.430,(.061,.063)),(.402,(.055,.058)),(.374,(.046,.050)),(.355,(.040,.044))]
   mesh.tube([center(y) for y,r in rows],[r for y,r in rows],'skin',
    [blend(side+'UpLeg',side+'Leg',(.365-y)/.08) for y,r in rows],segments=26,caps=False)
  rows=[(.145,(.030,.034)),(.140,(.030,.034)),(.112,(.027,.031)),(.088,(.027,.030))]
  mesh.tube([center(y) for y,r in rows],[r for y,r in rows],'socks',
   [blend(side+'Leg',side+'Foot',(.124-y)/.07) for y,r in rows],segments=24,caps=False)
 head_start=len(mesh.positions);_face(mesh,'soccer-player');hair(mesh,look)
 if look['id']=='woman-01':
  # A plain tennis visor frames the swept ponytail and shades the eyes.
  arc=[[.080*math.sin(a),1.260,-.008+.088*math.cos(a)] for a in np.linspace(-math.pi,math.pi,45)]
  mesh.tube(arc,.006,'accent',{'Head':1},segments=8,caps=False)
  mesh.ellipsoid([0,1.252,.100],[.077,.006,.040],'shorts',{'Head':1},segments=28,rings=6)
 elif look['id'] in ['woman-02','man-02']:
  arc=[[.080*math.sin(a),1.258,-.010+.090*math.cos(a)] for a in np.linspace(-math.pi,math.pi,45)]
  mesh.tube(arc,[.005]*45,'accent',{'Head':1},segments=8,caps=False)
 for i in range(head_start,len(mesh.positions)):
  x,y,z=mesh.positions[i]
  region=mesh.regions[i]
  # Compact, softly modeled adult faces. Larger open eyes and a shorter nose
  # avoid a miniature photorealistic face becoming a hard mask on phone screens.
  eye=region.startswith('preserve_eye') or region in ['preserve_iris','preserve_pupil']
  lid=region=='skin' and z>.075 and 1.202<y<1.228 and .014<abs(x)<.052
  if eye or lid:
   cx=.031 if x>0 else -.031
   x=cx+(x-cx)*(1.24 if region in ['preserve_iris','preserve_pupil'] else 1.10)
   y=1.215+(y-1.215)*1.38
  if abs(x)<.023 and 1.172<y<1.238 and z>.086:z=.077+(z-.077)*.73
  if region in ['preserve_lip','preserve_mouth']:y+=.003*(abs(x)/.023)**1.4
  if region=='skin' and z>.045:z+=.0025*math.exp(-((abs(x)-.043)/.025)**2-((y-1.177)/.023)**2)
  if female:x*=1-.09*math.exp(-((y-1.112)/.04)**2)
  x*=1.055;y=1.097+(y-1.075)*.85
  mesh.positions[i]=[x,y,z]
 grip(mesh,1);grip(mesh,-1);shoes(mesh)
 if female:
  # Real pleated skort, with a continuous hem and side-weighted lower panels.
  rings=[(.653,.126,.089,.008),(.620,.144,.099,.008),(.570,.168,.110,.010),(.510,.187,.124,.011),(.445,.197,.133,.012)]
  def skirt_weight(y): return {'Hips':1}
  before=len(mesh.positions)
  loft(mesh,list(reversed(rings)),'shorts',skirt_weight,segments=56,folds=.025,caps=False)
  for i in range(before,len(mesh.positions)):
   x,y,z=mesh.positions[i];a=math.atan2(z-.01,x)
   f=1+.025*math.sin(a*18)*max(0,(.65-y)/.2)
   mesh.positions[i]=[x*f,y,(z-.01)*f+.01]
   side='LeftUpLeg' if x>0 else 'RightUpLeg';t=max(0,min(.38,(.59-y)*2.3))*min(1,abs(x)/.11)
   ids=[OLD.index('Hips'),OLD.index(side),0,0];mesh.joints[i]=ids;mesh.weights[i]=[1-t,t,0,0]
 # Original collar becomes a tennis polo placket for the male silhouettes.
 if not female:
  mesh.tube([[0,1.026,.049],[0,.996,.072],[0,.965,.081]],[.006,.005,.0035],
   'accent',{'Chest':1},segments=8)
  for y in [1.008,.990]:mesh.ellipsoid([0,y,.075],[.002,.002,.0018],'soles',{'Chest':1},segments=8,rings=4)
 uv,swatches=atlas(mesh,look)
 # Atlas supplies region color. COLOR_0 only handles the exposed-calf boundary.
 colors=[[1.,1.,1.] for _ in mesh.positions]
 mesh.positions=[adult(p,female) for p in mesh.positions]
 raw=mesh.to_dict();raw['colors']=colors;raw['uv']=uv;raw['look']=look;raw['atlasSwatches']=swatches
 (RAW/(look['id']+'.json')).write_text(json.dumps(raw,separators=(',',':')))
 print(look['id'],len(mesh.positions),'vertices',len(mesh.indices),'triangles',flush=True)

for look in LOOKS:build(look)
bind={name:adult(RIG[name]) for name in NAMES}
rig={'name':'TennisCanonical18','boneCount':18,'canonicalSource':'../motion2/soccer.json / skeleton.bones',
 'units':'metres','up':'+Y','forward':'+Z','bindPose':'T-pose; geometry-calibrated translations, identity local rotations',
 'rotationContract':'Absolute parent-local xyzw; canonical names, order and parents. Use supplied inverse binds; embedded clips need no retargeter.',
 'joints':[{'name':b['name'],'parent':b['parent'],
  'translation':(np.array(bind[b['name']])-np.array(bind[b['parent']] if b['parent'] else [0,0,0])).tolist(),
  'worldPosition':bind[b['name']]} for b in CANON]}
(ROOT/'rig.json').write_text(json.dumps(rig,indent=2)+'\n')
