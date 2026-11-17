#!/usr/bin/env python3
"""Author original 1200-triangle canonical18 skier geometry and 30 Hz motion.
No external meshes, textures or captured motion are inputs. Requires numpy.
Run from any directory: python source/build-skier.py.
"""
from pathlib import Path
import json, math, struct, hashlib
import numpy as np

PACK=Path(__file__).resolve().parents[1]
BONES=[('Root',None,[0,0,0]),('Hips','Root',[0,.86,0]),('Spine','Hips',[0,.2,0]),('Chest','Spine',[0,.18,0]),('Neck','Chest',[0,.1,0]),('Head','Neck',[0,.13,0]),('LeftArm','Chest',[.16,.06,0]),('LeftForeArm','LeftArm',[0,-.27,0]),('LeftHand','LeftForeArm',[0,-.24,0]),('RightArm','Chest',[-.16,.06,0]),('RightForeArm','RightArm',[0,-.27,0]),('RightHand','RightForeArm',[0,-.24,0]),('LeftUpLeg','Hips',[.1,0,0]),('LeftLeg','LeftUpLeg',[0,-.41,0]),('LeftFoot','LeftLeg',[0,-.37,0]),('RightUpLeg','Hips',[-.1,0,0]),('RightLeg','RightUpLeg',[0,-.41,0]),('RightFoot','RightLeg',[0,-.37,0])]
INDEX={b[0]:i for i,b in enumerate(BONES)}
REST=np.zeros((18,3))
for i,(name,parent,t) in enumerate(BONES): REST[i]=np.array(t)+(REST[INDEX[parent]] if parent else 0)

def quat(e):
 x,y,z=np.array(e)*.5
 sx,cx=math.sin(x),math.cos(x);sy,cy=math.sin(y),math.cos(y);sz,cz=math.sin(z),math.cos(z)
 return np.array([sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz])

def qmat(q):
 x,y,z,w=q
 return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])

def fk(rot,trans):
 world=[]
 for i,(_,parent,_) in enumerate(BONES):
  m=np.eye(4);m[:3,:3]=qmat(rot[i]);m[:3,3]=trans[i]
  world.append(world[INDEX[parent]]@m if parent else m)
 return np.array(world)

class Geometry:
 def __init__(self): self.tris=[];self.parts=[]
 def tri(self,a,b,c,j,mat):
  a,b,c=map(lambda v:np.array(v,dtype=float),(a,b,c))
  n=np.cross(b-a,c-a);length=np.linalg.norm(n)
  assert length>1e-10
  self.tris.append((np.array([a,b,c]),n/length,j,mat))
 def ringbody(self,name,center,rings,n,j,mat):
  start=len(self.tris);center=np.array(center)
  rs=[[center+np.array([rx*math.cos(2*math.pi*k/n),y,rz*math.sin(2*math.pi*k/n)]) for k in range(n)] for y,rx,rz in rings]
  for r in range(len(rs)-1):
   for k in range(n):
    l=(k+1)%n

    if rings[-1][0] > rings[0][0]:
     self.tri(rs[r][k],rs[r+1][k],rs[r+1][l],j,mat);self.tri(rs[r][k],rs[r+1][l],rs[r][l],j,mat)
    else:
     self.tri(rs[r][k],rs[r+1][l],rs[r+1][k],j,mat);self.tri(rs[r][k],rs[r][l],rs[r+1][l],j,mat)
  for k in range(1,n-1):

   if rings[-1][0] > rings[0][0]:
    self.tri(rs[0][0],rs[0][k],rs[0][k+1],j,mat);self.tri(rs[-1][0],rs[-1][k+1],rs[-1][k],j,mat)
   else:
    self.tri(rs[0][0],rs[0][k+1],rs[0][k],j,mat);self.tri(rs[-1][0],rs[-1][k],rs[-1][k+1],j,mat)
  self.parts.append({'name':name,'triangles':len(self.tris)-start,'joint':BONES[j][0]})
 def sphere(self,name,center,scale,n,lat,j,mat):
  start=len(self.tris);c=np.array(center);s=np.array(scale)
  rings=[]
  for r in range(1,lat):
   th=math.pi*r/lat
   rings.append([c+s*np.array([math.sin(th)*math.cos(2*math.pi*k/n),math.cos(th),math.sin(th)*math.sin(2*math.pi*k/n)]) for k in range(n)])
  top=c+s*np.array([0,1,0]);bot=c-s*np.array([0,1,0])
  for k in range(n):
   l=(k+1)%n
   self.tri(top,rings[0][l],rings[0][k],j,mat);self.tri(bot,rings[-1][k],rings[-1][l],j,mat)
  for r in range(len(rings)-1):
   for k in range(n):
    l=(k+1)%n
    self.tri(rings[r][k],rings[r][l],rings[r+1][l],j,mat);self.tri(rings[r][k],rings[r+1][l],rings[r+1][k],j,mat)
  self.parts.append({'name':name,'triangles':len(self.tris)-start,'joint':BONES[j][0]})
 def box(self,name,c,s,j,mat):
  start=len(self.tris);c=np.array(c);s=np.array(s)*.5
  v=[c+s*np.array(p) for p in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
  for a,b,c0,d in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(3,7,6,2),(0,1,5,4)]:
   self.tri(v[a],v[b],v[c0],j,mat);self.tri(v[a],v[c0],v[d],j,mat)
  self.parts.append({'name':name,'triangles':len(self.tris)-start,'joint':BONES[j][0]})
 def rod(self,name,a,b,r,n,j,mat):
  start=len(self.tris);a=np.array(a);b=np.array(b);d=b-a;d=d/np.linalg.norm(d);u=np.cross(d,[1,0,0]);u=u/np.linalg.norm(u);v=np.cross(d,u)
  ra=[a+r*(u*math.cos(2*math.pi*k/n)+v*math.sin(2*math.pi*k/n)) for k in range(n)];rb=[p+b-a for p in ra]
  for k in range(n):
   l=(k+1)%n
   self.tri(ra[k],ra[l],rb[l],j,mat);self.tri(ra[k],rb[l],rb[k],j,mat)
  for k in range(1,n-1):self.tri(ra[0],ra[k+1],ra[k],j,mat);self.tri(rb[0],rb[k],rb[k+1],j,mat)
  self.parts.append({'name':name,'triangles':len(self.tris)-start,'joint':BONES[j][0]})

G=Geometry()
# Material slots: suit, deep-ink textile, glacier white, warm gold, skin, visor.
G.ringbody('tailored jacket',[0,.86,0],[(-.05,.14,.105),(.1,.175,.115),(.29,.215,.13),(.39,.175,.11)],10,INDEX['Spine'],0)
G.ringbody('snow trousers seat',[0,.86,0],[(-.13,.18,.11),(-.02,.17,.12),(.08,.15,.11)],8,INDEX['Hips'],1)
G.ringbody('neck gaiter',REST[4], [(-.04,.08,.07),(.08,.078,.07)],8,4,1)
G.sphere('face',REST[5]+[0,.015,.015],[.135,.155,.13],10,5,5,4)
G.sphere('helmet',REST[5]+[0,.065,-.025],[.175,.18,.17],12,6,5,2)
G.box('goggle strap rear',REST[5]+[0,.055,-.174],[.21,.043,.025],5,1)
G.box('goggle visor',REST[5]+[0,.035,.141],[.245,.085,.055],5,5)
G.box('goggle bridge',REST[5]+[0,.033,.176],[.024,.09,.012],5,3)
G.box('helmet center stripe',REST[5]+[0,.207,-.008],[.045,.018,.19],5,0)
G.box('back chevron upper',[0,1.175,-.13],[.26,.05,.018],3,2)
G.box('back spine stripe',[0,1.075,-.126],[.045,.17,.018],2,3)
G.box('zip front',[0,1.13,.132],[.018,.3,.014],2,2)
for side in ['Left','Right']:
 sign=1 if side=='Left' else -1
 arm=INDEX[side+'Arm'];fore=INDEX[side+'ForeArm'];hand=INDEX[side+'Hand'];thigh=INDEX[side+'UpLeg'];shin=INDEX[side+'Leg'];foot=INDEX[side+'Foot']
 G.ringbody(side+' jacket sleeve',REST[arm],[(.035,.10,.1),(-.1,.078,.082),(-.265,.064,.066)],8,arm,0)
 G.ringbody(side+' sleeve cuff',REST[fore],[(.025,.069,.068),(-.15,.055,.058),(-.24,.048,.048)],8,fore,0)
 G.sphere(side+' insulated glove',REST[hand]+[0,-.035,.01],[.065,.08,.063],8,4,hand,1)
 G.ringbody(side+' upper trousers',REST[thigh],[(.035,.103,.105),(-.17,.089,.095),(-.405,.068,.073)],8,thigh,1)
 G.ringbody(side+' lower trousers',REST[shin],[(.02,.074,.077),(-.22,.065,.07),(-.36,.061,.065)],8,shin,1)
 G.box(side+' trouser reflective seam',REST[thigh]+[sign*.091,-.18,-.014],[.012,.25,.035],thigh,2)
 G.box(side+' boot',REST[foot]+[0,.04,.025],[.15,.16,.25],foot,1)
 G.box(side+' binding',REST[foot]+[0,-.025,.01],[.18,.044,.17],foot,3)
 # Sculpted six-station ski prism, curved shovel (front is +Z).
 x=REST[foot][0];y=REST[foot][1];stations=[(-.64,.067,-.055),(-.4,.074,-.055),(.32,.073,-.055),(.66,.07,-.04),(.8,.058,.025),(.86,.025,.055)]
 rings=[]
 for z,w,h in stations:rings.append([[x-w,y+h,z],[x+w,y+h,z],[x+w,y+h+.025,z],[x-w,y+h+.025,z]])
 start=len(G.tris)
 for r in range(len(rings)-1):
  for k in range(4):
   l=(k+1)%4
   G.tri(rings[r][k],rings[r+1][l],rings[r+1][k],foot,0);G.tri(rings[r][k],rings[r][l],rings[r+1][l],foot,0)
 for rr in [rings[0],list(reversed(rings[-1]))]:G.tri(rr[0],rr[2],rr[1],foot,0);G.tri(rr[0],rr[3],rr[2],foot,0)
 G.parts.append({'name':side+' shaped ski','triangles':len(G.tris)-start,'joint':BONES[foot][0]})
 G.box(side+' ski rear inlay',[x,y-.026,-.35],[.035,.008,.36],foot,2)
 # Poles remain held by palms; the tapered shaft points aft in glide.
 G.rod(side+' pole shaft',REST[hand]+[0,-.03,0],REST[hand]+[0,-.52,-.38],.009,5,hand,3)
 G.sphere(side+' pole basket',REST[hand]+[0,-.49,-.36],[.04,.014,.04],6,3,hand,1)

# Spend remaining triangles on smooth helmet/suit tessellation, without dummy faces.
base_count=len(G.tris)
assert base_count<=1200,(base_count,'budget exceeded')
assert (1200-base_count)%2==0
for _ in range((1200-base_count)//2):
 scores=[np.linalg.norm(np.cross(t[0][1]-t[0][0],t[0][2]-t[0][0])) for t in G.tris]
 k=int(np.argmax(scores));v,n,j,m=G.tris.pop(k);mid=np.mean(v,axis=0)
 for a,b in [(0,1),(1,2),(2,0)]:G.tri(v[a],v[b],mid,j,m)
assert len(G.tris)==1200

# Fully authored deterministic pose curves. Foot IK keeps parallel skis supported.
def ease(t):return t*t*(3-2*t)
def pose(knee=.16,lean=.19,arms=-.62,roll=0):
 trans=np.array([b[2] for b in BONES],float);rot=np.zeros((18,3))
 # Knee parameter is flexion factor; exact sagittal IK preserves canonical lengths.
 hip_y=.76-knee*.49;trans[1]=[0,hip_y,0]
 d=hip_y-.08;L=.41;l=.37
 d=max(abs(L-l)+.001,min(L+l-.001,d))
 a=math.acos((L*L+d*d-l*l)/(2*L*d));b=math.acos((L*L+l*l-d*d)/(2*L*l))
 for side in ['Left','Right']:
  sign=1 if side=='Left' else -1
  rot[INDEX[side+'UpLeg']]=[-a,0,0]
  rot[INDEX[side+'Leg']]=[math.pi-b,0,0]
  rot[INDEX[side+'Foot']]=[a-(math.pi-b),0,0]
  rot[INDEX[side+'Arm']]=[arms,0,sign*.15]
  rot[INDEX[side+'ForeArm']]=[-.65,0,0]
  rot[INDEX[side+'Hand']]=[.2,0,0]
 rot[2]=[lean,0,roll];rot[3]=[.03,0,roll*.25];rot[4]=[-lean*.4,0,0];rot[5]=[-lean*.4,0,0]
 return rot,trans

GLIDE=pose()
DURATIONS={'glide':1.2,'lane_left':.4,'lane_right':.4,'jump_rise':.3,'jump_apex':.3,'jump_land':.4,'slide':.8,'fall_left':.8,'fall_right':.8,'fall_forward':.8,'get_up':1.2,'celebrate':1.6,'turbo':.8}

def sample(name,t):
 u=t/DURATIONS[name];s=ease(u);air=0
 r,tr=pose()
 if name=='glide':
  w=math.sin(u*math.tau);r,tr=pose(.16+.015*w,.19+.012*w,arms=-.62+.025*w,roll=.014*w)
 elif name.startswith('lane_'):
  sign=1 if name=='lane_left' else -1;w=math.sin(math.pi*u)**2
  r,tr=pose(.16+.08*w,.19,roll=-sign*.22*w)
  r[1][1]=sign*.07*w
  for side in ['Left','Right']:r[INDEX[side+'Foot']][1]=sign*.12*w
 elif name.startswith('jump_'):
  # Continuous 1 s authored jump arc, segmented at .3 and .6 seconds.
  jt=t+({'jump_rise':0,'jump_apex':.3,'jump_land':.6}[name]);rise=ease(max(0,min(1,(jt-2/30)/(8/30))));fall=ease(max(0,min(1,((1-jt)-2/30)/(8/30))));jump=rise*fall;air=1.25*jump
  k=.16+.20*jump;r,tr=pose(k,.19-.10*jump,arms=-.62-.6*jump)
 elif name=='slide':
  # Hold core for 0.4 s so the runtime can extend under longer beams.
  w=ease(min(1,u/.25))*ease(min(1,(1-u)/.25))
  r,tr=pose(.16+.81*w,.19+.73*w,arms=-.62-.62*w)
  for side in ['Left','Right']:r[INDEX[side+'Hand']][0]=.2-1.7*w
 elif name.startswith('fall_'):
  w=ease(max(0,min(1,(t-2/30)/(DURATIONS[name]-4/30))));r,tr=pose(.16+.42*w,.19,arms=-.62-.35*w)
  if name=='fall_forward':r[0][0]=1.34*w;tr[0][2]=.16*w
  else:r[0][2]=(1 if name=='fall_left' else -1)*1.35*w
  if name=='fall_forward':
   for side in ['Left','Right']:r[INDEX[side+'Foot']][0]-=r[0][0]
  for side in ['Left','Right']:r[INDEX[side+'Hand']][0]=.2-2.1*w
 elif name=='get_up':
  # Start from forward-fall endpoint; recover through kneeling, then settle.
  w=1-ease(max(0,min(1,(t-2/30)/(DURATIONS[name]-4/30))));r,tr=pose(.16+.42*w,.19,arms=-.62-.35*w);r[0][0]=1.34*w;tr[0][2]=.16*w
  for side in ['Left','Right']:r[INDEX[side+'Foot']][0]-=r[0][0]
  for side in ['Left','Right']:r[INDEX[side+'Hand']][0]=.2-2.1*w
 elif name=='celebrate':
  w=math.sin(math.pi*u)**2;r,tr=pose(.16+.03*math.sin(u*math.tau*2),.19-.14*w,arms=-.62)
  for side in ['Left','Right']:
   sign=1 if side=='Left' else -1;r[INDEX[side+'Arm']]=[-.62-.8*w,0,sign*(.15+1.7*w)];r[INDEX[side+'ForeArm']]=[-.65+.6*w,0,0]
 elif name=='turbo':
  w=math.sin(math.pi*u)**2;r,tr=pose(.16+.36*w,.19+.38*w,arms=-.62+.3*w)
  for side in ['Left','Right']:r[INDEX[side+'Hand']][0]=.2-2.1*w
 q=np.array([quat(x) for x in r]);world=fk(q,tr)
 if name in ['fall_forward','get_up']:
  # Foot/skis remain at the same ground contact while the torso pitches down.
  foot_z=(world[14,2,3]+world[17,2,3])*.5
  tr[1]+=qmat(q[0]).T@np.array([0,0,-foot_z]);world=fk(q,tr)
 # Grounded motion is placed using the actual deformed mesh support envelope.
 min_y=1e6
 for verts,_,j,_ in G.tris:
  local=verts-REST[j];p=local@world[j,:3,:3].T+world[j,:3,3];min_y=min(min_y,float(p[:,1].min()))
 correction=.008-min_y
 tr[1]+=qmat(q[0]).T@np.array([0,correction,0])
 tr[0][1]=air
 return q,tr

class GLB:
 def __init__(self):
  self.bin=bytearray();self.d={'asset':{'version':'2.0','generator':'Bakasun alpine-runner-v1 original procedural authoring'},'scene':0,'scenes':[{'nodes':[0,18]}],'nodes':[],'meshes':[],'skins':[],'materials':[],'animations':[],'bufferViews':[],'accessors':[]}
 def accessor(self,values,typ,component=5126,target=None,bounds=False):
  arr=np.asarray(values,dtype={5126:'<f4',5123:'<u2'}[component]);arr=np.ascontiguousarray(arr)
  while len(self.bin)%4:self.bin.append(0)
  offset=len(self.bin);self.bin.extend(arr.tobytes());view={'buffer':0,'byteOffset':offset,'byteLength':arr.nbytes}
  if target:view['target']=target
  vi=len(self.d['bufferViews']);self.d['bufferViews'].append(view)
  ac={'bufferView':vi,'componentType':component,'count':len(arr),'type':typ}
  if bounds:ac.update(min=np.atleast_1d(arr.min(axis=0)).tolist(),max=np.atleast_1d(arr.max(axis=0)).tolist())
  ai=len(self.d['accessors']);self.d['accessors'].append(ac);return ai
 def write(self,path):
  while len(self.bin)%4:self.bin.append(0)
  self.d['buffers']=[{'byteLength':len(self.bin)}]
  js=json.dumps(self.d,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
  content=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(self.bin))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(self.bin),0x004E4942)+self.bin
  path.write_bytes(content)

spec={'schemaVersion':1,'name':'Original alpine courier','authorship':'All geometry and movement authored here; no external meshes, textures or captured motion.','trianglesPerCharacter':1200,'baseSculptTriangles':base_count,'jointCount':18,'sampleRateHz':30,'axes':{'up':'+Y','forward':'+Z','anatomicalLeft':'+X'},'units':'metres','canonicalSource':'workout/island/design/motion2/alpine.json#skeleton.bones','joints':[{'name':n,'parent':p,'restTranslationMeters':t} for n,p,t in BONES],'suits':[],'clips':[],'parts':G.parts,'rootPolicy':{'lateral':'lane clips are in-place; runtime translates lane centers','forward':'in-place; runtime scrolls the track','vertical':'Root owns the complete vertical jump arc; Hips owns ground support correction. Runtime must not add a second jump displacement.'},'transitions':{'jump':['jump_rise','jump_apex','jump_land'],'recovery':'All fall variations -> get_up with 0.18 s crossfade. get_up starts in forward-fall pose and finishes at glide.','slideHoldSeconds':[.2,.6],'loop':['glide'],'crossfadeSeconds':.12},'license':'CC0-1.0'}
for name,dur in DURATIONS.items():
 entry={'clip':'glide','timeSeconds':0};exit={'clip':'glide','timeSeconds':0}
 if name=='jump_rise':exit={'clip':'jump_apex','timeSeconds':0}
 if name=='jump_apex':entry={'clip':'jump_rise','timeSeconds':.3};exit={'clip':'jump_land','timeSeconds':0}
 if name=='jump_land':entry={'clip':'jump_apex','timeSeconds':.3}
 if name.startswith('fall_'):exit={'clip':name,'timeSeconds':dur}
 if name=='get_up':entry={'clip':'fall_forward','timeSeconds':.8}
 spec['clips'].append({'name':name,'durationSeconds':dur,'sampleCount':round(dur*30)+1,'loop':name=='glide','sampleRateHz':30,'transitionReferences':{'entry':entry,'exit':exit},'soleLocal':[0,-.055,0],'contactPolicy':'grounded skis sliding' if not name.startswith('jump_') else 'continuous authored jump with takeoff, apex hold and landing segmented across three clips','locomotion':False})

OUT=PACK/'assets/characters';OUT.mkdir(parents=True,exist_ok=True)
for suit,color in [('coral',[.95,.20,.16,1]),('teal',[.025,.68,.63,1]),('violet',[.43,.24,.85,1])]:
 glb=GLB();d=glb.d
 for i,(name,parent,t) in enumerate(BONES):
  node={'name':name,'translation':t};children=[j for j,b in enumerate(BONES) if b[1]==name]
  if children:node['children']=children
  d['nodes'].append(node)
 d['nodes'].append({'name':'OriginalSkier_'+suit,'mesh':0,'skin':0})
 palettes=[('suit',color,.65,0),('ink',[.025,.055,.095,1],.8,0),('glacier',[.89,.98,1,1],.5,0),('gold',[1,.65,.12,1],.4,.4),('skin',[.94,.66,.45,1],.8,0),('visor',[.035,.18,.28,1],.18,.65)]
 for name,c,rough,metal in palettes:d['materials'].append({'name':name,'pbrMetallicRoughness':{'baseColorFactor':c,'metallicFactor':metal,'roughnessFactor':rough}})
 primitives=[]
 for mat in range(len(palettes)):
  subset=[t for t in G.tris if t[3]==mat];pos=np.concatenate([t[0] for t in subset]);norm=np.concatenate([np.tile(t[1],(3,1)) for t in subset]);joints=np.array([[t[2],0,0,0] for t in subset for _ in range(3)]);weights=np.tile([1,0,0,0],(len(pos),1))
  primitives.append({'attributes':{'POSITION':glb.accessor(pos,'VEC3',target=34962,bounds=True),'NORMAL':glb.accessor(norm,'VEC3',target=34962),'JOINTS_0':glb.accessor(joints,'VEC4',5123,34962),'WEIGHTS_0':glb.accessor(weights,'VEC4',target=34962)},'material':mat,'mode':4})
 d['meshes']=[{'name':'Original 1200 triangle skier','primitives':primitives,'extras':{'triangles':1200,'suit':suit,'original':True}}]
 ibms=[]
 for p in REST:m=np.eye(4);m[:3,3]=-p;ibms.append(m.T.flatten())
 d['skins']=[{'name':'Canonical18','joints':list(range(18)),'skeleton':0,'inverseBindMatrices':glb.accessor(ibms,'MAT4')}]
 for name,dur in DURATIONS.items():
  times=np.arange(round(dur*30)+1,dtype=float)/30;poses=[sample(name,float(t)) for t in times];timeacc=glb.accessor(times,'SCALAR',bounds=True);anim={'name':name,'channels':[],'samplers':[],'extras':{'sampleRateHz':30,'loop':name=='glide','rootMotion':'vertical jump only; hips support correction'}}
  for j in range(18):
   values=np.array([p[0][j] for p in poses]);si=len(anim['samplers']);anim['samplers'].append({'input':timeacc,'output':glb.accessor(values,'VEC4'),'interpolation':'LINEAR'});anim['channels'].append({'sampler':si,'target':{'node':j,'path':'rotation'}})
  for j in [0,1]:
   si=len(anim['samplers']);values=np.array([p[1][j] for p in poses]);anim['samplers'].append({'input':timeacc,'output':glb.accessor(values,'VEC3'),'interpolation':'LINEAR'});anim['channels'].append({'sampler':si,'target':{'node':j,'path':'translation'}})
  d['animations'].append(anim)
 path=OUT/f'skier-{suit}.glb';glb.write(path);spec['suits'].append({'id':suit,'path':str(path.relative_to(PACK)),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'triangles':1200,'suitColor':color})
(PACK/'character-spec.json').write_text(json.dumps(spec,indent=2)+'\n')
print(json.dumps({'triangles':len(G.tris),'baseSculptTriangles':base_count,'suits':spec['suits'],'clips':spec['clips']},indent=2))
