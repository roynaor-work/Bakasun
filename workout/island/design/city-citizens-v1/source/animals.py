"""CC0 city fauna authoring. Writes raw indexed, skinned meshes for export.py.

Cat/dog derive from this repository's CC0 fire-v24/friends GLBs. Their geometry
is simplified per connected component so eyes, paws and ears stay distinct.
All other geometry and all 30 Hz loop choreography are authored here.
Dependencies: numpy; scipy; fast-simplification==0.2.0 for cat/dog simplification.
Install optional authoring dependency outside the repository, e.g. in /tmp.
"""
from __future__ import annotations
import collections
import json
import math
import pathlib
import struct
import sys

import numpy as np
from scipy.spatial import cKDTree

if pathlib.Path('/tmp/city-citizens-animal-deps').exists():
    sys.path.insert(0, '/tmp/city-citizens-animal-deps')
import fast_simplification

REPO = pathlib.Path(__file__).resolve().parents[5]
OUT = pathlib.Path('/tmp/city-citizens')
OUT.mkdir(exist_ok=True)
TAU = math.tau


def quat(x=0, y=0, z=0):
    a,b,c = x*.5,y*.5,z*.5
    sx,cx,sy,cy,sz,cz=math.sin(a),math.cos(a),math.sin(b),math.cos(b),math.sin(c),math.cos(c)
    return [sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz]


def track(bone, path, duration, fn):
    times=[i/30 for i in range(round(duration*30)+1)]
    values=[fn(t/duration) for t in times]
    values[-1]=list(values[0])
    return {'bone':bone,'path':path,'times':times,'values':values}


def animation(name, duration, specs):
    return {'name':name,'duration':duration,'loop':True,'fps':30,
            'tracks':[track(b,p,duration,f) for b,p,f in specs]}


def normals(v,f):
    result=np.zeros_like(v,dtype=float)
    for a,b,c in f:
        n=np.cross(v[b]-v[a],v[c]-v[a])
        result[a]+=n;result[b]+=n;result[c]+=n
    lengths=np.linalg.norm(result,axis=1)
    for i,L in enumerate(lengths):
        result[i]=result[i]/L if L>1e-10 else np.array([0.,1.,0.])
    return result


def read_glb(path):
    data=path.read_bytes();size=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+size]);binary=data[28+size:]
    def acc(index):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
        dtype={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[a['componentType']]
        width={'VEC3':3,'VEC4':4,'SCALAR':1,'MAT4':16}[a['type']]
        values=np.frombuffer(binary,dtype=dtype,count=a['count']*width,
           offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape((-1,width)).copy()
        if a.get('normalized') and dtype!='<f4':
            values=values.astype(float)/np.iinfo(dtype).max
        return values
    p=doc['meshes'][0]['primitives'][0]
    attributes={k:acc(i) for k,i in p['attributes'].items()}
    faces=acc(p['indices']).ravel().reshape((-1,3)).astype(np.int32)
    skin=doc['skins'][0];joint_nodes=skin['joints']
    index_by_node={node:i for i,node in enumerate(joint_nodes)}
    parents={child:idx for idx,n in enumerate(doc['nodes']) for child in n.get('children',[])}
    bones=[]
    for idx in joint_nodes:
        n=doc['nodes'][idx]
        parent=parents.get(idx)
        bones.append({'name':n['name'],'parent':doc['nodes'][parent]['name'] if parent in index_by_node else None,
                      'restTranslationMeters':n.get('translation',[0,0,0])})
    return attributes,faces,bones


def simplify_components(positions, faces, ratio=.28):
    parent=list(range(len(positions)))
    def find(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]];i=parent[i]
        return i
    for tri in faces:
        for j in tri[1:]:parent[find(int(j))]=find(int(tri[0]))
    groups=collections.defaultdict(list)
    for face in faces:groups[find(int(face[0]))].append(face)
    newv=[];newf=[];nearest=[]
    for group in groups.values():
        source=np.unique(group);lookup={v:i for i,v in enumerate(source)}
        p=np.array(positions[source],dtype=np.float64)
        f=np.array([[lookup[v] for v in face] for face in group],dtype=np.int32)
        target=max(8,int(len(f)*ratio))
        if len(f)>16:
            p2,f2=fast_simplification.simplify(p,f,target_count=target,agg=4.)
        else:p2,f2=p,f
        # Attribute transfer is restricted to each original connected surface.
        inds=cKDTree(p).query(p2)[1]
        offset=len(newv)
        newv.extend(p2);newf.extend(f2+offset);nearest.extend(source[inds])
    return np.array(newv),np.array(newf,dtype=np.int32),np.array(nearest)


def save(raw):
    raw['metadata'].update({'fps':30,'rootMotion':False,'license':'CC0-1.0','triangles':len(raw['indices'])//3})
    p=OUT/f"animals-{raw['id']}.json"
    p.write_text(json.dumps(raw,separators=(',',':'))+'\n')
    print(raw['id'],len(raw['positions']),'vertices',len(raw['indices'])//3,'triangles',len(raw['animations']),'loops')


def make_quadruped(species,scale):
    path=REPO/f'workout/island/assets/fire-v24/friends/{species}.glb'
    a,faces,bones=read_glb(path)
    v,f,nearest=simplify_components(a['POSITION'],faces)
    v*=scale
    for b in bones:b['restTranslationMeters']=[float(x*scale) for x in b['restTranslationMeters']]
    color=a['COLOR_0'][nearest]
    if color.shape[1]==3:color=np.column_stack([color,np.ones(len(color))])
    joints=a['JOINTS_0'][nearest].astype(int)
    weights=a['WEIGHTS_0'][nearest]
    weights=weights/weights.sum(axis=1)[:,None]
    world={}
    for b in bones:
        p=np.array(b['restTranslationMeters']);world[b['name']]=p+(world[b['parent']] if b['parent'] else 0)
    duration=1.2 if species=='cat' else .8
    duty=.64 if species=='cat' else .55
    stride=.13*scale if species=='cat' else .18*scale
    lift=.035*scale
    hiprest=next(b['restTranslationMeters'] for b in bones if b['name']=='Hips')
    legnames=[b['name'] for b in bones if b['name'].startswith(('FrontLeg','BackLeg'))]
    def bob(u):return -.012*scale+.003*scale*math.cos(2*TAU*u)
    def leg_angles(bone,u):
        front=bone.startswith('Front');left=bone.endswith('_L')
        # Diagonal trot, and cat diagonal walk with longer ground support.
        p=(u+(0 if front==left else .5))%1
        if p<=duty:
            z=stride*(.5-p/duty);h=0.
        else:
            s=(p-duty)/(1-duty)
            # Cubic Hermite swing matches the backwards stance velocity at both
            # ends; the elevated foot returns smoothly before replanting.
            velocity=-stride/duty*(1-duty)
            z=(-stride*.5)*(2*s**3-3*s**2+1)+(stride*.5)*(-2*s**3+3*s**2)+velocity*(2*s**3-3*s**2+s)
            h=lift*math.sin(math.pi*s)**2
        shin=bone.replace('Leg','Shin');paw=bone.replace('Leg','Paw')
        l1=abs(next(b['restTranslationMeters'][1] for b in bones if b['name']==shin))
        l2=abs(next(b['restTranslationMeters'][1] for b in bones if b['name']==paw))
        y=world[paw][1]+h-(world[bone][1]+bob(u))
        d=min(l1+l2-1e-6,max(abs(l1-l2)+1e-6,math.hypot(y,z)))
        upper=math.atan2(-z,-y)-math.acos(max(-1,min(1,(l1*l1+d*d-l2*l2)/(2*l1*d))))
        knee=math.pi-math.acos(max(-1,min(1,(l1*l1+l2*l2-d*d)/(2*l1*l2))))
        return upper,knee,-upper-knee
    specs=[('Hips','translation',lambda u:[hiprest[0],hiprest[1]+bob(u),hiprest[2]]),
           ('Head','rotation',lambda u:quat(.015*math.sin(TAU*u),.04*math.sin(TAU*u))),
           ('Tail','rotation',lambda u:quat(0,.18*math.sin(TAU*u),.06*math.sin(TAU*u)))]
    for n in legnames:
        for ix,target in enumerate([n,n.replace('Leg','Shin'),n.replace('Leg','Paw')]):
            specs.append((target,'rotation',lambda u,n=n,ix=ix:quat(leg_angles(n,u)[ix])))
    moving=animation('walk' if species=='cat' else 'trot',duration,specs)
    moving['recommendedSpeedMps']=stride/(duty*duration)
    idle_specs=[('Head','rotation',lambda u:quat(.025*math.sin(TAU*u),.06*math.sin(TAU*u))),
                ('Tail','rotation',lambda u:quat(0,.24*math.sin(TAU*u),.06*math.sin(TAU*u)))]
    if species=='dog':
        idle_specs.extend((n,'rotation',lambda u,s=s:quat(0,0,s*.07*math.sin(TAU*u))) for n,s in [('Ear_L',1),('Ear_R',-1)])
    save({'id':species,'name':species.title(),'labelHe':'חתול' if species=='cat' else 'כלב',
          'category':'animal','positions':v.tolist(),'normals':normals(v,f).tolist(),'indices':f.ravel().tolist(),
          'joints':joints.tolist(),'weights':weights.tolist(),'colors':color.tolist(),'skeleton':{'bones':bones},
          'animations':[animation('idle',2.4,idle_specs),moving],
          'metadata':{'provenance':str(path.relative_to(REPO)),
           'sourceLicense':'workout/island/assets/fire-v24/friends/LICENSES.md',
           'modifications':'Per-surface QEM simplification, city scale, new analytic foot-contact loops; original source animation discarded.',
           'recommendedSpeedMps':moving['recommendedSpeedMps'],'scaleFromSource':scale}})


class Mesh:
    def __init__(self,id,label,bones):
        self.id=id;self.label=label;self.bones=bones
        self.p=[];self.f=[];self.c=[];self.j=[];self.w=[]
        self.boneindex={b['name']:i for i,b in enumerate(bones)}
    def vertex(self,p,c,bone):
        self.p.append(list(p));self.c.append(list(c)+[1] if len(c)==3 else list(c))
        self.j.append([self.boneindex[bone],0,0,0]);self.w.append([1,0,0,0])
        return len(self.p)-1
    def ellipsoid(self,center,radii,c,bone,segments=10,rings=5):
        top=self.vertex([center[0],center[1]+radii[1],center[2]],c,bone)
        rows=[]
        for k in range(1,rings):
            a=math.pi*k/rings;row=[]
            for i in range(segments):
                p=TAU*i/segments
                row.append(self.vertex([center[0]+radii[0]*math.sin(a)*math.cos(p),center[1]+radii[1]*math.cos(a),center[2]+radii[2]*math.sin(a)*math.sin(p)],c,bone))
            rows.append(row)
        bottom=self.vertex([center[0],center[1]-radii[1],center[2]],c,bone)
        for i in range(segments):
            j=(i+1)%segments
            self.f.append([top,rows[0][j],rows[0][i]])
            self.f.append([bottom,rows[-1][i],rows[-1][j]])
        for a,b in zip(rows,rows[1:]):
            for i in range(segments):
                j=(i+1)%segments;self.f.extend([[a[i],a[j],b[j]],[a[i],b[j],b[i]]])
    def prism(self,outline,thickness,c,bone):
        # Outline lies approximately in XZ; both sides have outward winding.
        a=[self.vertex((x,y+thickness*.5,z),c,bone) for x,y,z in outline]
        b=[self.vertex((x,y-thickness*.5,z),tuple(v*.78 for v in c[:3]),bone) for x,y,z in outline]
        normal=np.cross(np.array(outline[1])-outline[0],np.array(outline[2])-outline[0])
        if normal[1]<0:a=a[::-1];b=b[::-1]
        for i in range(1,len(a)-1):self.f.extend([[a[0],a[i],a[i+1]],[b[0],b[i+1],b[i]]])
        for i in range(len(a)):
            j=(i+1)%len(a);self.f.extend([[a[i],b[i],b[j]],[a[i],b[j],a[j]]])
    def cone(self,start,end,radius,c,bone,sides=7):
        axis=np.array(end)-start;axis=axis/np.linalg.norm(axis)
        ref=np.array([0,1,0]) if abs(axis[1])<.9 else np.array([1,0,0])
        a=np.cross(axis,ref);a/=np.linalg.norm(a);b=np.cross(axis,a)
        row=[self.vertex(np.array(start)+radius*(a*math.cos(TAU*i/sides)+b*math.sin(TAU*i/sides)),c,bone) for i in range(sides)]
        tip=self.vertex(end,c,bone);base=self.vertex(start,c,bone)
        for i in range(sides):
            j=(i+1)%sides;self.f.extend([[row[i],row[j],tip],[base,row[j],row[i]]])
    def save(self,anims,meta=None):
        v=np.array(self.p);f=np.array(self.f)
        save({'id':self.id,'name':self.id.title(),'labelHe':self.label,'category':'animal',
              'positions':self.p,'normals':normals(v,f).tolist(),'indices':f.ravel().tolist(),
              'joints':self.j,'weights':self.w,'colors':self.c,'skeleton':{'bones':self.bones},
              'animations':anims,'metadata':{'provenance':'Original geometry and choreography authored in source/animals.py',**(meta or {})}})


def bone(name,parent,p):return {'name':name,'parent':parent,'restTranslationMeters':list(p)}


def make_bird(pigeon=False):
    id='pigeon' if pigeon else 'bird'
    bones=[bone('Root',None,(0,0,0)),bone('Body','Root',(0,.135,0)),bone('Head','Body',(0,.09,.075)),
           bone('Wing_L','Body',(.035,.025,0)),bone('Wing_R','Body',(-.035,.025,0)),
           bone('Tail','Body',(0,0,-.075)),bone('Foot_L','Root',(.038,.025,.005)),bone('Foot_R','Root',(-.038,.025,.005))]
    m=Mesh(id,'יונה' if pigeon else 'ציפור',bones)
    plumage=(.38,.43,.49) if pigeon else (.13,.35,.57)
    chest=(.47,.51,.55) if pigeon else (.82,.49,.22)
    dark=(.14,.19,.25)
    m.ellipsoid((0,.14,0),(.072,.105,.105),plumage,'Body',12,6)
    m.ellipsoid((0,.134,.058),(.058,.078,.064),chest,'Body',10,5)
    if pigeon:m.ellipsoid((0,.213,.055),(.037,.045,.034),(.18,.43,.37),'Head',10,4)
    m.ellipsoid((0,.237,.08),(.047,.049,.045),plumage if pigeon else (.12,.29,.46),'Head',10,5)
    m.cone((0,.228,.115),(0,.219,.165 if pigeon else .151),.012,(.39,.37,.33) if pigeon else (.83,.58,.24),'Head',6)
    for s in [-1,1]:
        m.ellipsoid((s*.041,.247,.099),(.006,.008,.008),(.025,.034,.04),'Head',6,3)
        m.ellipsoid((s*.0445,.249,.104),(.002,.0025,.0025),(.95,.95,.85),'Head',5,3)
        # Long flight feathers and a contrasting leading edge produce an
        # identifiable wing silhouette even at city-map scale.
        outline=[(s*.035,.16,.045),(s*.095,.17,.062),(s*.178,.16,.016),(s*.215,.151,-.045),
                 (s*.203,.148,-.081),(s*.174,.15,-.065),(s*.145,.15,-.074),(s*.125,.15,-.052),(s*.056,.16,-.047)]
        m.prism(outline,.009,plumage,'Wing_L' if s>0 else 'Wing_R')
        m.prism([(s*.065,.167,.032),(s*.107,.172,.034),(s*.179,.166,-.036),(s*.17,.165,-.051)],.001,dark,'Wing_L' if s>0 else 'Wing_R')
        m.cone((s*.038,.066,.005),(s*.038,.01,.005),.008,(.53,.28,.24),'Foot_L' if s>0 else 'Foot_R',6)
        for dx in [-.013,0,.013]:m.cone((s*.038,.009,.005),(s*.038+dx,.006,.038),.003,(.53,.28,.24),'Foot_L' if s>0 else 'Foot_R',5)
    m.prism([(-.04,.13,-.066),(.04,.13,-.066),(.047,.122,-.16),(.021,.119,-.172),(0,.12,-.166),(-.021,.119,-.172),(-.047,.122,-.16)],.009,dark,'Tail')
    flutter=animation('flutter' if pigeon else 'fly',.8,[('Wing_L','rotation',lambda u:quat(0,0,.95*math.sin(TAU*u))),('Wing_R','rotation',lambda u:quat(0,0,-.95*math.sin(TAU*u))),('Head','rotation',lambda u:quat(.025*math.sin(TAU*u))),('Tail','rotation',lambda u:quat(.06*math.sin(TAU*u)))])
    if not pigeon:
        flutter['tracks'].append(track('Root','translation',.8,lambda u:[0,.13+.01*math.sin(TAU*u),0]))
    anims=[flutter]
    if pigeon:
        anims.insert(0,animation('peck',2.4,[('Head','rotation',lambda u:quat(.32*(1-math.cos(TAU*u))*.5,.08*math.sin(TAU*u))),('Wing_L','rotation',lambda u:quat(0,0,-.85)),('Wing_R','rotation',lambda u:quat(0,0,.85))]))
    m.save(anims,{'habitat':'sidewalk' if pigeon else 'air','nominalHeightMeters':.286})


def make_fish():
    bones=[bone('Root',None,(0,.2,0)),bone('Body','Root',(0,0,0)),bone('Tail','Body',(0,0,-.082)),
           bone('Fin_L','Body',(.028,-.01,.016)),bone('Fin_R','Body',(-.028,-.01,.016))]
    m=Mesh('fish','דג',bones)
    m.ellipsoid((0,.2,0),(.043,.064,.12),(.91,.47,.17),'Body',12,6)
    m.ellipsoid((0,.184,.055),(.036,.04,.062),(.95,.72,.37),'Body',10,4)
    for s in [-1,1]:
        m.ellipsoid((s*.031,.219,.078),(.011,.012,.012),(.95,.94,.77),'Body',7,4)
        m.ellipsoid((s*.039,.22,.081),(.005,.006,.006),(.027,.052,.065),'Body',6,3)
        m.prism([(s*.027,.19,.03),(s*.09,.174,.001),(s*.077,.169,-.035),(s*.029,.184,-.013)],.004,(.93,.63,.25),'Fin_L' if s>0 else 'Fin_R')
    # Fish tail and dorsal fin are thin closed volumes in the YZ plane.
    for side in [-1,1]:
        x=side*.004
        ids=[m.vertex((x,.2,-.085),(.83,.32,.13),'Tail'),m.vertex((x,.268,-.178),(.96,.61,.22),'Tail'),m.vertex((x,.2,-.157),(.95,.55,.2),'Tail'),m.vertex((x,.137,-.177),(.96,.61,.22),'Tail')]
        m.f.extend([ids[:3],[ids[0],ids[2],ids[3]]] if side>0 else [[ids[0],ids[2],ids[1]],[ids[0],ids[3],ids[2]]])
    # Additional closed dorsal wedge keeps the fin visible from either side.
    m.cone((0,.248,-.012),(0,.291,-.044),.014,(.89,.36,.16),'Body',5)
    swim=animation('swim',1.2,[('Body','rotation',lambda u:quat(0,.07*math.sin(TAU*u))),('Tail','rotation',lambda u:quat(0,.43*math.sin(TAU*u-.4))),('Fin_L','rotation',lambda u:quat(0,0,.3*math.sin(2*TAU*u))),('Fin_R','rotation',lambda u:quat(0,0,-.3*math.sin(2*TAU*u))),('Root','translation',lambda u:[0,.2+.007*math.sin(TAU*u),0])])
    m.save([swim],{'habitat':'water','nominalLengthMeters':.3})


def make_butterfly():
    bones=[bone('Root',None,(0,.24,0)),bone('Body','Root',(0,0,0)),bone('Wing_L','Body',(.006,0,0)),bone('Wing_R','Body',(-.006,0,0))]
    m=Mesh('butterfly','פרפר',bones)
    m.ellipsoid((0,.24,0),(.009,.009,.058),(.13,.16,.22),'Body',8,5)
    m.ellipsoid((0,.242,.052),(.012,.011,.013),(.16,.19,.23),'Body',7,4)
    for s in [-1,1]:
        b='Wing_L' if s>0 else 'Wing_R'
        upper=[(s*.005,.24,.015),(s*.04,.24,.077),(s*.089,.24,.082),(s*.116,.24,.059),(s*.108,.24,.025),(s*.068,.24,.004),(s*.017,.24,-.006)]
        lower=[(s*.012,.24,.001),(s*.072,.24,-.002),(s*.097,.24,-.036),(s*.076,.24,-.066),(s*.047,.24,-.073),(s*.017,.24,-.038)]
        m.prism(upper,.0028,(.09,.22,.34),b);m.prism(lower,.0028,(.09,.22,.34),b)
        # Inset pigmentation follows the wing and is ordinary coloration.
        m.prism([(s*.018,.242,.017),(s*.047,.242,.064),(s*.083,.242,.068),(s*.099,.242,.051),(s*.089,.242,.03),(s*.058,.242,.015)],.0008,(.22,.66,.82),b)
        m.prism([(s*.025,.242,-.012),(s*.065,.242,-.014),(s*.078,.242,-.036),(s*.065,.242,-.053),(s*.045,.242,-.059)],.0008,(.91,.56,.28),b)
        m.cone((s*.006,.246,.059),(s*.019,.257,.09),.0016,(.15,.17,.2),'Body',5)
        m.ellipsoid((s*.019,.257,.09),(.0025,.0025,.0025),(.2,.22,.24),'Body',5,3)
    flutter=animation('flutter',.4,[('Wing_L','rotation',lambda u:quat(0,0,.88*math.sin(TAU*u))),('Wing_R','rotation',lambda u:quat(0,0,-.88*math.sin(TAU*u))),('Root','translation',lambda u:[0,.24+.006*math.sin(TAU*u),0]),('Body','rotation',lambda u:quat(.05*math.sin(TAU*u),.07*math.sin(TAU*u)))])
    m.save([flutter],{'habitat':'air','nominalWingspanMeters':.232})


if __name__=='__main__':
    make_quadruped('cat',.52)
    make_quadruped('dog',.58)
    make_bird(True)
    make_bird(False)
    make_fish()
    make_butterfly()
