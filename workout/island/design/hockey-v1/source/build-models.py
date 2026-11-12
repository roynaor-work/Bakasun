#!/usr/bin/env python3
# SPDX-License-Identifier: CC0-1.0
# מקור: התאמת ליבת hoops-tall CC0 וציוד הוקי מקורי, ללא מותגים.
import json,struct,hashlib,math,copy
from pathlib import Path
import numpy as np
OUT=Path(__file__).resolve().parents[1]
REPO=OUT.parents[3]
SOURCE=REPO/'workout/island/assets/hoops-tall/guard.glb'
NAMES=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']
PARENTS=[None,0,1,2,3,4,3,6,7,3,9,10,1,12,13,1,15,16]
REST=[[0,0,0],[0,.86,0],[0,.2,0],[0,.18,0],[0,.1,0],[0,.13,0],[.16,.06,0],[0,-.27,0],[0,-.24,0],[-.16,.06,0],[0,-.27,0],[0,-.24,0],[.1,0,0],[0,-.41,0],[0,-.37,0],[-.1,0,0],[0,-.41,0],[0,-.37,0]]
WORLD=[]
for i,r in enumerate(REST): WORLD.append(np.array(r)+(WORLD[PARENTS[i]] if PARENTS[i] is not None else 0))
WORLD=np.array(WORLD)
PALETTE={'uniform_primary':[.015,.32,.41,1], 'uniform_secondary':[.012,.035,.075,1], 'uniform_trim':[.94,.72,.32,1], 'equipment_white':[.79,.84,.86,1], 'equipment_dark':[.017,.026,.04,1], 'blade_steel':[.40,.48,.54,1], 'lace':[.81,.85,.84,1]}
def read_glb(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:],b
def read_attr(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];typ={5126:np.float32,5125:np.uint32,5123:np.uint16,5121:np.uint8,5122:np.int16}[a['componentType']];k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];sz=np.dtype(typ).itemsize
 x=np.ndarray((a['count'],k),dtype=typ,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',sz*k),sz)).copy()
 if a.get('normalized'):x=x.astype(np.float32)/({5123:65535,5121:255,5122:32767}[a['componentType']])
 return x
class GLB:
 def __init__(self):
  self.bin=bytearray();self.d={'asset':{'version':'2.0','generator':'נכסי הוקי מקוריים והתאמת גוף CC0','copyright':'CC0-1.0'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'accessors':[],'bufferViews':[]};self.parts={};self.materials={}
 def view(self,b,target=None):
  while len(self.bin)%4:self.bin.append(0)
  o=len(self.bin);self.bin.extend(b);v={'buffer':0,'byteOffset':o,'byteLength':len(b)}
  if target:v['target']=target
  self.d['bufferViews'].append(v);return len(self.d['bufferViews'])-1
 def attr(self,x,kind,ct=5126,target=34962):
  x=np.array(x,dtype={5126:np.float32,5123:np.uint16,5125:np.uint32}[ct]);view=self.view(x.tobytes(),target);a={'bufferView':view,'componentType':ct,'count':len(x),'type':kind}
  if kind=='VEC3':a.update(min=x.min(axis=0).tolist(),max=x.max(axis=0).tolist())
  self.d['accessors'].append(a);return len(self.d['accessors'])-1
 def material(self,name,definition=None):
  if name not in self.materials:
   self.materials[name]=len(self.d['materials']);self.d['materials'].append(definition or {'name':name,'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':.72 if name=='blade_steel' else 0,'roughnessFactor':.27 if name=='blade_steel' else .72}})
  return self.materials[name]
 def add(self,name,positions,indices,joints,weights,normals=None,uvs=None,colors=None,label=None):
  p=np.array(positions,float);ix=np.array(indices,int).reshape(-1,3)
  if normals is None:
   normals=np.zeros_like(p);face=np.cross(p[ix[:,1]]-p[ix[:,0]],p[ix[:,2]]-p[ix[:,0]])
   for k in range(3):np.add.at(normals,ix[:,k],face)
   norms=np.linalg.norm(normals,axis=1);normals[norms<1e-10]=[0,1,0];norms=np.linalg.norm(normals,axis=1);normals/=norms[:,None]
  joints=np.array(joints).copy();weights=np.array(weights);joints[weights<1e-8]=0
  v=self.parts.setdefault(name,{'positions':[],'normals':[],'uvs':[],'joints':[],'weights':[],'colors':[],'indices':[],'labels':[]})
  base=sum(len(a) for a in v['positions']);v['positions'].append(p);v['normals'].append(normals);v['uvs'].append(np.array(uvs) if uvs is not None else np.zeros((len(p),2)));v['joints'].append(np.array(joints));v['weights'].append(np.array(weights));v['colors'].append(np.array(colors) if colors is not None else np.tile(PALETTE.get(name,[1,1,1,1]),(len(p),1)));v['indices'].append(ix+base)
  if label:v['labels'].append(label)
 def gear(self,mat,p,ix,joint,label=None,weightfun=None):
  js=np.zeros((len(p),4),int);ws=np.zeros((len(p),4));js[:,0]=joint;ws[:,0]=1
  if weightfun:
   for i,point in enumerate(p):
    pairs=weightfun(point)
    for k,(j,w) in enumerate(pairs):js[i,k]=j;ws[i,k]=w
  self.add(mat,p,ix,js,ws,label=label)
 def finalize(self,name,skin=True):
  prim=[];regions={}
  for mat,v in self.parts.items():
   p=np.concatenate(v['positions']);attrs={'POSITION':self.attr(p,'VEC3'),'NORMAL':self.attr(np.concatenate(v['normals']),'VEC3'),'TEXCOORD_0':self.attr(np.concatenate(v['uvs']),'VEC2'),'COLOR_0':self.attr(np.concatenate(v['colors']),'VEC4')}
   if skin:attrs.update(JOINTS_0=self.attr(np.concatenate(v['joints']),'VEC4',5123),WEIGHTS_0=self.attr(np.concatenate(v['weights']),'VEC4'))
   ix=np.concatenate(v['indices']).reshape(-1,1);pid=len(prim);prim.append({'attributes':attrs,'indices':self.attr(ix,'SCALAR',5125,34963),'material':self.material(mat),'extras':{'region':mat,'parts':v['labels']}})
   if mat.startswith('uniform_'):regions[mat]={'primitiveIndex':pid,'vertexCount':len(p)}
  self.d['meshes']=[{'name':name,'primitives':prim}]
  if skin:
   nodes=[]
   for i,n in enumerate(NAMES):
    node={'name':n,'translation':REST[i]};children=[j for j,p in enumerate(PARENTS) if p==i]
    if children:node['children']=children
    nodes.append(node)
   nodes.append({'name':name,'mesh':0,'skin':0});self.d['nodes']=nodes;self.d['scenes'][0]['nodes']=[0,18]
   ib=[]
   for p in WORLD:
    m=np.eye(4);m[:3,3]=-p;ib.append(m.T.reshape(-1))
   self.d['skins']=[{'name':'canonical18','skeleton':0,'joints':list(range(18)),'inverseBindMatrices':self.attr(ib,'MAT4',target=None)}]
  self.d['extras']={'license':'CC0-1.0','teamRegions':regions,'units':'meters','up':'+Y','forward':'+Z','anatomicalLeft':'+X','source':'source/build-models.py','stickConvention':'מקור המקל באחיזת יד ימין, הציר לאורך מינוס Y והלהב לכיוון Z חיובי'}
  self.d['buffers']=[{'byteLength':len(self.bin)}]
  jb=json.dumps(self.d,ensure_ascii=False,separators=(',',':')).encode();jb+=b' '*((-len(jb))%4);bb=bytes(self.bin);bb+=b'\0'*((-len(bb))%4);payload=struct.pack('<III',0x46546c67,2,12+8+len(jb)+8+len(bb))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(bb),0x004e4942)+bb
  (OUT/'models'/f'{name}.glb').write_bytes(payload)
  positions=np.concatenate([np.concatenate(v['positions'])for v in self.parts.values()]);return {'file':f'models/{name}.glb','bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'triangles':sum(len(np.concatenate(v['indices']))for v in self.parts.values()),'vertices':len(positions),'boundsMeters':{'min':positions.min(axis=0).tolist(),'max':positions.max(axis=0).tolist()},'teamRegions':regions,'skinJoints':NAMES if skin else []}
def rings(ringlist,sides=16,caps=True):
 # each ring (center x,y,z, radius x, radius z); outward orientation
 p=[];ix=[]
 for x,y,z,rx,rz in ringlist:
  for j in range(sides):a=2*math.pi*j/sides;p.append([x+rx*math.cos(a),y,z+rz*math.sin(a)])
 for i in range(len(ringlist)-1):
  for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;c=b+sides;d=a+sides;ix.extend([[a,c,b],[a,d,c]])
 if caps:
  for end in [0,len(ringlist)-1]:
   c=len(p);p.append(list(ringlist[end][:3]));base=end*sides
   for j in range(sides):ix.append([c,base+(j+1)%sides,base+j] if end else [c,base+j,base+(j+1)%sides])
 return np.array(p),ix

def ellipsoid(c,r,n=16,m=10):
 # poles have single vertices to avoid degenerate triangles
 p=[(c[0],c[1]+r[1],c[2])];ix=[]
 for i in range(1,m):
  th=math.pi*i/m
  for j in range(n):a=2*math.pi*j/n;p.append([c[0]+r[0]*math.sin(th)*math.cos(a),c[1]+r[1]*math.cos(th),c[2]+r[2]*math.sin(th)*math.sin(a)])
 bot=len(p);p.append([c[0],c[1]-r[1],c[2]])
 for j in range(n):ix.append([0,1+(j+1)%n,1+j]);ix.append([bot,1+(m-2)*n+j,1+(m-2)*n+(j+1)%n])
 for i in range(m-2):
  for j in range(n):a=1+i*n+j;b=1+i*n+(j+1)%n;ix.extend([[a,b,b+n],[a,b+n,a+n]])
 return np.array(p),ix

def box(c,size,bevel=.012):
 # chamfered rectangular prism, eight perimeter vertices at each face
 x,y,z=c;rx,ry,rz=np.array(size)/2;b=min(bevel,rx*.8,ry*.8)
 shape=[(-rx+b,-ry), (rx-b,-ry),(rx,-ry+b),(rx,ry-b),(rx-b,ry),(-rx+b,ry),(-rx,ry-b),(-rx,-ry+b)]
 p=[[x+u,y+v,z-rz]for u,v in shape]+[[x+u,y+v,z+rz]for u,v in shape];ix=[]
 for j in range(8):k=(j+1)%8;ix.extend([[j,k,k+8],[j,k+8,j+8]])
 p.extend([[x,y,z-rz],[x,y,z+rz]])
 for j in range(8):k=(j+1)%8;ix.extend([[16,k,j],[17,j+8,k+8]])
 return np.array(p),ix

def rod(a,b,r=.004,n=8):
 a=np.array(a);b=np.array(b);v=b-a;v/=np.linalg.norm(v);u=np.cross(v,[0,0,1] if abs(v[2])<.9 else[1,0,0]);u/=np.linalg.norm(u);w=np.cross(v,u);p=[];ix=[]
 for c in [a,b]:
  for j in range(n):angle=math.pi*2*j/n;p.append(c+r*(u*math.cos(angle)+w*math.sin(angle)))
 for j in range(n):k=(j+1)%n;ix.extend([[j,k,k+n],[j,k+n,j+n]])
 return np.array(p),ix

def blend_y(a,b):
 def fn(p):
  ya,yb=WORLD[a,1],WORLD[b,1];t=np.clip((p[1]-ya)/(yb-ya),0,1);return [(a,float(1-t)),(b,float(t))]
 return fn

def body(goalie=False):
 g=GLB();d,bin,raw=read_glb(SOURCE);old=[]
 for i,n in enumerate(d['nodes'][:18]):old.append(np.array(n.get('translation',[0,0,0]))+(old[PARENTS[i]]if PARENTS[i] is not None else 0))
 old=np.array(old)
 # Preserve the licensed face atlas. Its binary bufferView is extracted unchanged.
 if d.get('images'):
  images=[]
  for im in d['images']:
   view=d['bufferViews'][im['bufferView']];buf=bin[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']];images.append({'bufferView':g.view(buf),'mimeType':im['mimeType']})
  g.d.update(images=images,textures=copy.deepcopy(d['textures']),samplers=copy.deepcopy(d.get('samplers',[])))
 for prim in d['meshes'][0]['primitives']:
  mat=d['materials'][prim['material']];name=mat['name']
  if name not in ['human_surface','eyes']:continue
  at=prim['attributes'];p=read_attr(d,bin,at['POSITION']).astype(float);js=read_attr(d,bin,at['JOINTS_0']).astype(int);ws=read_attr(d,bin,at['WEIGHTS_0']).astype(float);ws/=ws.sum(axis=1,keepdims=True)
  # Linear blend of joint relocation keeps exactly the canonical bind and existing anatomical surfaces.
  newp=p+np.sum(ws[:,:,None]*(WORLD[js]-old[js]),axis=1)
  # The canonical Head pivot sits at the lower head: extend the skull above that pivot.
  headweight=np.sum(ws*(js==5),axis=1);newp[:,1]+=headweight*np.maximum(0,p[:,1]-old[5,1])*.62
  indices=read_attr(d,bin,prim['indices']).reshape(-1,3)
  # Exclude torso/limbs fully hidden by hockey equipment; retain complete visible head/neck.
  visible=(p[:,1]>1.59)&((p[:,1]>1.71)|(np.abs(p[:,0])<.12))
  keep=np.all(visible[indices],axis=1)
  indices=indices[keep]
  used,inv=np.unique(indices.reshape(-1),return_inverse=True)
  g.material(name,copy.deepcopy(mat));g.add(name,newp[used],inv.reshape(-1,3),js[used],ws[used],uvs=read_attr(d,bin,at['TEXCOORD_0'])[used],label='פנים ועור מליבת MakeHuman CC0')
 # padded jersey, broad shoulders, original unbranded surface
 p,ix=rings([(0,.77,0,.19,.13),(0,.86,0,.205,.135),(0,1.03,0,.18,.13),(0,1.20,0,.19,.14),(0,1.31,0,.195,.13),(0,1.35,0,.18,.11)],20)
 def torso_weights(p):
  y=p[1]
  if y<.91:return [(1,1)]
  if y<1.14:t=(y-.91)/.23;return [(1,float(1-t)),(2,float(t))]
  t=np.clip((y-1.14)/.16,0,1);return [(2,float(1-t)),(3,float(t))]
 g.gear('uniform_primary',p,ix,3,'חולצה מרופדת',torso_weights)
 for y,h in [(.80,.035),(.85,.023)]:p,ix=rings([(0,y-h/2,0,.199,.137),(0,y+h/2,0,.202,.139)],20);g.gear('uniform_trim',p,ix,1,'פס מותניים')
 p,ix=rings([(0,1.34,0,.102,.091),(0,1.42,0,.087,.077)],16);g.gear('uniform_secondary',p,ix,4,'צווארון')
 for side,arm,fore,hand,thigh,knee,foot in [(1,6,7,8,12,13,14),(-1,9,10,11,15,16,17)]:
  x=side*.21
  p,ix=ellipsoid((side*.158,1.295,0),(.118,.075,.128),12,6);g.gear('uniform_primary',p,ix,3,'כיסוי תפר כתף')
  p,ix=rings([(x,1.32,0,.11,.105),(x,1.22,0,.10,.098),(x,1.08,0,.083,.088),(x,.98,0,.078,.084)],14);g.gear('uniform_primary',p,ix,arm,'שרוול עליון',blend_y(arm,fore))
  p,ix=rings([(x,1.00,0,.080,.088),(x,.88,0,.073,.079),(x,.79,0,.067,.073)],14);g.gear('uniform_primary',p,ix,fore,'שרוול תחתון')
  for yy in [.85,.89]:p,ix=rings([(x,yy-.01,0,.075,.082),(x,yy+.01,0,.075,.082)],14);g.gear('uniform_trim',p,ix,fore,'פסי שרוול')
  p,ix=ellipsoid((x,.725,.012),(.078,.09,.087),12,8);g.gear('uniform_secondary',p,ix,hand,'כפפת שחקן')
  p,ix=box((x,.73,.084),(.115,.115,.025));g.gear('uniform_trim',p,ix,hand,'מגן מפרקים')
  # Hockey pants terminate above knee and use two-bone weights at the hip.
  tx=side*.11
  p,ix=rings([(tx,.84,0,.122,.13),(tx,.68,0,.122,.128),(tx,.57,0,.103,.11),(tx,.535,0,.092,.102)],16);g.gear('uniform_secondary',p,ix,thigh,'מכנס מרופד')
  p,ix=rings([(side*.1,.55,0,.086,.088),(side*.1,.33,0,.078,.079),(side*.1,.17,0,.064,.065)],14);g.gear('uniform_primary',p,ix,knee,'גרב הוקי')
  for yy in [.28,.32]:p,ix=rings([(side*.1,yy-.011,0,.077,.079),(side*.1,yy+.011,0,.077,.079)],14);g.gear('uniform_trim',p,ix,knee,'פסי גרב')
  p,ix=ellipsoid((side*.1,.111,.050),(.079,.064,.156),16,8);g.gear('equipment_dark',p,ix,foot,'נעל החלקה')
  p,ix=box((side*.1,.060,.051),(.156,.023,.29));g.gear('equipment_white',p,ix,foot,'מחזיק להב')
  p,ix=box((side*.1,.0175,.056),(.009,.035,.285),.004);g.gear('blade_steel',p,ix,foot,'להב קרח')
  for zz in [-.04,.14]:p,ix=box((side*.1,.041,zz),(.018,.035,.018),.003);g.gear('blade_steel',p,ix,foot,'עמוד להב')
  for yy,zz in [(.134,.10),(.146,.075),(.156,.045)]:p,ix=rod([side*.1-.042,yy,zz],[side*.1+.042,yy,zz],.004,6);g.gear('lace',p,ix,foot,'שרוכים')
 # Helmet lower edge at eye brow, domed shell at exactly 1.85 metres.
 p,ix=rings([(0,1.665,.015,.116,.14),(0,1.72,.008,.135,.15),(0,1.78,-.002,.13,.14),(0,1.83,-.005,.083,.092),(0,1.85,-.005,.012,.014)],20);g.gear('uniform_primary',p,ix,5,'קסדת שוער' if goalie else 'קסדה')
 # helmet crown and temples strips, face remains visible
 for x in [-.043,.043]:
  points=[[x,1.70,.153],[x,1.74,.148],[x,1.78,.133],[x,1.815,.095],[x,1.833,.069]]
  for a,b in zip(points,points[1:]):p,ix=rod(a,b,.007,6);g.gear('uniform_trim',p,ix,5,'פס קסדה')
 for side in [-1,1]:p,ix=ellipsoid((side*.111,1.653,.002),(.026,.062,.067),10,6);g.gear('uniform_primary',p,ix,5,'מגן אוזן')
 # Metal cage protects the fictional athlete without opaque visor.
 for yy in ([1.535,1.585,1.635,1.68] if goalie else[1.555,1.61,1.665]):
  points=[(-.103,yy,.115),(-.075,yy,.158),(0,yy,.178),(.075,yy,.158),(.103,yy,.115)]
  for a,b in zip(points,points[1:]):p,ix=rod(a,b,.0032,6);g.gear('blade_steel',p,ix,5,'סורג מגן פנים')
 for xx in [-.065,0,.065]:
  p,ix=rod([xx,1.535 if goalie else 1.555,.172-abs(xx)*.18],[xx,1.68,.172-abs(xx)*.18],.0032,6);g.gear('blade_steel',p,ix,5,'סורג אנכי')
 if goalie:
  for side,knee,foot in [(1,13,14),(-1,16,17)]:
   # Front pad does not bridge the knee: separate cuff follows the thigh.
   p,ix=box((side*.125,.345,.055),(.215,.355,.10),.025);g.gear('equipment_white',p,ix,knee,'רפידת שוער תחתונה')
   p,ix=box((side*.13,.51,.06),(.215,.16,.10),.022);g.gear('equipment_white',p,ix,12 if side==1 else 15,'רפידת ברך')
   for yy in [.25,.32,.41,.50]:p,ix=box((side*.125,yy,.112),(.19,.022,.015),.006);g.gear('uniform_trim',p,ix,knee if yy<.45 else(12 if side==1 else 15),'תפרי רפידה')
   p,ix=box((side*.125,.35,.112),(.033,.32,.012),.007);g.gear('uniform_primary',p,ix,knee,'פס רפידה')
  p,ix=ellipsoid((.19,.704,.062),(.137,.128,.052),16,10);g.gear('equipment_white',p,ix,8,'כפפת תפיסה')
  p,ix=ellipsoid((.19,.704,.112),(.096,.097,.014),14,8);g.gear('uniform_secondary',p,ix,8,'כיס כפפת תפיסה')
  for ang in np.linspace(0,math.pi,6):
   x=.19+.10*math.cos(ang);y=.704+.10*math.sin(ang);p,ix=rod([.19,.68,.13],[x,y,.13],.003,6);g.gear('uniform_trim',p,ix,8,'רשת כפפה')
  p,ix=box((-.19,.735,.108),(.19,.265,.088),.025);g.gear('equipment_white',p,ix,11,'מחסום יד ימין')
  p,ix=box((-.19,.735,.156),(.15,.22,.014),.015);g.gear('uniform_primary',p,ix,11,'פני מחסום יד')
 name='goalie'if goalie else'skater';return g.finalize(name)

def stick():
 g=GLB()
 p,ix=box((0,-.515,0),(.028,1.39,.023),.004);g.gear('uniform_secondary',p,ix,0,'ידית מקל')
 # Lower shaft blade heel has a slight forward rake.
 p,ix=rod([0,-1.19,0],[0,-1.26,.055],.016,8);g.gear('uniform_secondary',p,ix,0,'עקב מקל')
 p,ix=box((0,-1.266,.186),(.018,.065,.285),.012);g.gear('equipment_dark',p,ix,0,'להב מקל')
 for yy in [-.04,-.07,-.10]:p,ix=box((0,yy,0),(.032,.015,.027),.003);g.gear('uniform_trim',p,ix,0,'סרט אחיזה')
 for zz in [.11,.15,.19,.23,.27,.31]:p,ix=box((0,-1.266,zz),(.019,.067,.016),.003);g.gear('uniform_trim',p,ix,0,'סרט להב')
 g.d['nodes']=[{'name':'Stick','mesh':0,'children':[1,2]},{'name':'RightHandGrip','translation':[0,0,0],'extras':{'attachmentBone':'RightHand'}},{'name':'BladePoint','translation':[0,-1.28,.31],'extras':{'kind':'puckContact'}}];g.d['scenes'][0]['nodes']=[0]
 return g.finalize('stick',False)
if __name__=='__main__':
 (OUT/'models').mkdir(exist_ok=True)
 evidence={'license':'CC0-1.0','source':{'path':str(SOURCE.relative_to(REPO)),'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'gitBlobSha':'814f4d93c33a31570b6fc7deafd8a78c4d94754b','sourceUrl':'https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/runtime/guard.glb','licenseUrl':'https://github.com/roynaor-work/Bakasun/blob/cfd4215c314fb673a6585f7a482ac4fb5ea3cbaa/workout/island/design/hoops-tall-v1/LICENSES.md','description':'ליבת אדם ועיניים CC0 מתוך hoops-tall; בגדים, קסדות, מחליקיים, מקל וציוד שוער חדשים ומקוריים'},'models':[body(False),body(True),stick()],'rig':{'names':NAMES,'parents':PARENTS,'restLocalMeters':REST,'skinJoints':18,'restRotations':'identity','bindPose':'exact canonical18','heightIncludesHelmetMeters':1.85,'bladeContactLocalMeters':[0,-.08,0]},'limitations':['מקור האנימציה אינו מצריך עצמות אצבעות או פנים; הכפפות נעות עם עצמות כף היד','הגובה נמדד מהלהב עד כתר הקסדה; מידות הגאומטריה מותאמות לשלד הקנוני ואינן משנות את מנוחת העצמות']}
 (OUT/'model-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(evidence,ensure_ascii=False,indent=2))
