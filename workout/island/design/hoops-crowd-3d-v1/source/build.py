"""CC0 basketball adaptation of the repository's CC0 tennis crowd.

Python standard library only. Exact 210/90/24 triangles, sparse arm morphs,
one unlit vertex-color primitive, no textures, codecs or external buffers.
"""
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
from geometry import Fan, SKINS, HAIR

ROOT = Path(__file__).resolve().parents[1]
WIDTHS = [.42, .48, .39, .46, .43, .50, .40, .45, .49, .41, .44, .47]
SHIRT = 'fffefd'


class Person(Fan):
    def __init__(self):
        super().__init__()
        self.shirt = []

    def face(self, points, color, target=None, head=False):
        super().face(points, color, target, head)
        self.shirt.extend([int(color == SHIRT)] * len(points))


def tetra(f, points, color, head=False):
    center = [sum(p[k] for p in points)/4 for k in range(3)]
    for face in [[0,2,1], [0,1,3], [1,2,3], [2,0,3]]:
        a, b, c = [points[k] for k in face]
        u, v = [[p[k]-a[k] for k in range(3)] for p in [b,c]]
        n = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        if sum(n[k]*(a[k]-center[k]) for k in range(3)) < 0:
            face.reverse()
        f.face([points[k] for k in face],color,head=head)


def bent(f, a, b, c, radius, colors):
    # Three triangular rings, continuous elbow/knee, closed caps: 14 triangles.
    points = [[p[0]+math.cos(k*math.tau/3)*radius,
               p[1]+math.sin(k*math.tau/3)*radius*.55,
               p[2]+math.sin(k*math.tau/3)*radius*.65]
              for p in [a,b,c] for k in range(3)]
    faces = [[2,1,0],[6,7,8]] + [
        [r*3+k,r*3+(k+1)%3,(r+1)*3+(k+1)%3,(r+1)*3+k]
        for r in range(2) for k in range(3)]
    for j, face in enumerate(faces):
        f.face([points[k] for k in face],colors[0] if j == 0 or 2 <= j < 5 else colors[1])


def make(i, level, pose=0):
    f = Person()
    seated, width = i < 6, WIDTHS[i]
    skin, hair = SKINS[i], HAIR[i]
    hip_y = .50 if seated else .91
    bottom = .67 if seated else 1.03
    h = [.43,.46,.41,.48][i%4]
    neck, head_y = bottom+h, bottom+h+.20
    pivot = [0,neck+.025,-.015]
    if level == 0:
        f.prism([0,hip_y,.02],[width*.92,.18,.28],'35465a')
        f.prism([0,bottom+h/2,-.015],[width,h,.25],SHIRT,top=1.1)
        f.octa([0,neck+.018,-.005],[.075,.09,.075],skin)
        rings = [[.145,head_y-.11,.105],[.158,head_y+.105,.125]]
        points = [[math.sin(k*math.tau/8)*r[0],r[1],math.cos(k*math.tau/8)*r[2]]
                  for r in rings for k in range(8)]
        f.hull(points,[list(reversed(range(8))),list(range(8,16))]+
               [[k,(k+1)%8,(k+1)%8+8,k+8] for k in range(8)],skin,head=True)
        crown = head_y+[.17,.22,.135,.18][i%4]
        lower = [[math.sin(k*math.tau/8)*.161,head_y+.055-(
            .16 if i%4==1 and 2<=k<=6 else .055 if k in [3,4,5] else 0),
            math.cos(k*math.tau/8)*.128] for k in range(8)]
        upper = [[p[0]*.83,crown+(.045*(k%2) if i%4==3 else
                   .025*p[0]/.161 if i%4==0 else 0),p[2]*.83] for k,p in enumerate(lower)]
        f.hull(lower+upper,[[k,(k+1)%8,(k+1)%8+8,k+8] for k in range(8)]+
               [list(range(8,16))],hair,head=True)
        for x in [-.058,.058]:
            f.face([[x-.014,head_y+.012,.126],[x+.014,head_y+.012,.126],
                    [x+.014,head_y+.034,.126],[x-.014,head_y+.034,.126]],'242d36',head=True)
        f.hull([[-.025,head_y-.02,.116],[.025,head_y-.02,.116],
                [0,head_y+.025,.117],[0,head_y-.014,.155]],
               [[0,1,3],[1,2,3],[2,0,3],[0,2,1]],skin,head=True)
    elif level == 1:
        f.prism([0,(hip_y-.04+neck)/2,-.015],
                [width,neck-hip_y+.04,.25],SHIRT,top=1.1)
        crown = head_y+[.17,.22,.135,.18][i%4]
        p = [[sx*(.158 if sy else .145),crown if sy else head_y-.11,
              sz*(.125 if sy else .105)] for sy in [0,1] for sz in [-1,1] for sx in [-1,1]]
        for face, tint in [([0,1,3,2],skin),([4,6,7,5],hair),([0,4,5,1],hair),
                           ([2,3,7,6],skin),([0,2,6,4],skin),([1,5,7,3],skin)]:
            f.face([p[k] for k in face],tint,head=True)
        tetra(f,[[-.07,neck-.02,0],[.07,neck-.02,0],
                 [0,neck+.12,-.06],[0,neck+.12,.075]],skin)
    else:
        # Same 24-triangle hybrid as the reference tennis LOD: solid torso
        # and octahedral head (16), depth-bent two-sided limbs (8).
        p=[[x,y,z] for y,w in [(hip_y-.04,width),(neck,width*1.1)]
           for x,z in [(-w/2,.12),(w/2,.12),(0,-.14)]]
        f.hull(p,[[2,1,0],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]],SHIRT)
        hp=[[-.158,head_y,0],[.158,head_y,0],[0,neck+.035,0],
            [0,head_y+[.17,.22,.135,.18][i%4],0],[0,head_y,-.125],[0,head_y,.125]]
        for face in [[4,2,0],[3,4,0],[5,3,0],[2,5,0],[2,4,1],[4,3,1],[3,5,1],[5,2,1]]:
            f.face([hp[k] for k in face],hair if 3 in face or 4 in face else skin,head=True)
        # Back/top head vertices retain a hair-colored crown at distance.
    for sign in [-1,1]:
        shoulder = [sign*(width/2+.015),neck-.07,-.005]
        if pose == 0:
            elbow = [shoulder[0]+sign*.045,neck-.34,.12]
            wrist = [sign*.16,hip_y+.09 if seated else hip_y-.04,.31 if seated else .10]
        elif pose == 1:
            elbow = [sign*(width/2+.12),neck+.16,.015]
            wrist = [sign*(width/2+.17),neck+.51,.075]
        else:
            elbow = [sign*(width/2+.08),neck-.27,.18]
            wrist = [sign*(.22 if pose == 2 else .063),neck-.12,.39]
        hip = [sign*.115,hip_y,.04]
        knee = [sign*.145,.45 if seated else .49,.40 if seated else .065]
        ankle = [sign*.145,.115,.43 if seated else .02]
        if level == 0:
            f.limb(shoulder,elbow,.085,SHIRT)
            f.limb(elbow,wrist,.066,skin,sides=3)
            f.octa(wrist,[.061,.079,.059],skin)
            f.limb(hip,knee,.115,'35465a')
            f.limb(knee,ankle,.073,'586478',sides=3)
            f.prism([sign*.145,.061,ankle[2]+.06],[.16,.12,.28],
                    ['ede6d4','293848','a4b6b9'][i%3])
        elif level == 1:
            bent(f,shoulder,elbow,wrist,.085,[SHIRT,skin])
            bent(f,hip,knee,ankle,.115,['35465a','586478'])
            shoe = [[sign*.145-.08,.001,ankle[2]-.06],
                    [sign*.145+.08,.001,ankle[2]-.06],
                    [sign*.145,.001,ankle[2]+.20],[sign*.145,.121,ankle[2]+.06]]
            f.hull(shoe,[[0,1,3],[1,2,3],[2,0,3]],['ede6d4','293848','a4b6b9'][i%3])
        else:
            f.face([[shoulder[0]-.07,shoulder[1],shoulder[2]],
                    [wrist[0]-.055,wrist[1],wrist[2]],
                    [wrist[0]+.055,wrist[1],wrist[2]+.025],
                    [elbow[0]+.07,elbow[1],elbow[2]+.025]],skin)
            f.face([[hip[0]-.08,hip[1],hip[2]],
                    [ankle[0]-.065,.001,ankle[2]+.14],
                    [ankle[0]+.065,.001,ankle[2]+.19],
                    [knee[0]+.08,knee[1],knee[2]]],'35465a')
    assert len(f.indices)//3 == [210,90,24][level]
    return f,pivot


def export(i, level):
    fan,pivot = make(i,level)
    targets = [make(i,level,p)[0] for p in [1,2,3]]
    # Merge only identical vertices across every pose and semantic mask.
    unique, keep, remap = {}, [], []
    for j,p in enumerate(fan.positions):
        key=tuple(p+fan.colors[j]+[fan.head[j],fan.shirt[j]]+
                  [v for t in targets for v in t.positions[j]])
        if key not in unique:
            unique[key]=len(keep);keep.append(j)
        remap.append(unique[key])
    fan.indices=[remap[j] for j in fan.indices]
    for name in ['positions','colors','head','shirt']:
        values=getattr(fan,name);setattr(fan,name,[values[j] for j in keep])
    for t in targets:t.positions=[t.positions[j] for j in keep]
    blob,views,accessors = bytearray(),[],[]
    def view(data, target=None):
        blob.extend(b'\0' * (-len(blob)%4))
        v = {'buffer':0,'byteOffset':len(blob),'byteLength':len(data)}
        if target: v['target']=target
        views.append(v);blob.extend(data)
        return len(views)-1
    def pack(data, fmt):
        flat = [v for row in data for v in row] if isinstance(data[0],list) else data
        return struct.pack('<'+fmt*len(flat),*flat)
    def attr(data, fmt, component, kind, normalized=False, target=34962):
        a = {'bufferView':view(pack(data,fmt),target),'componentType':component,
             'count':len(data),'type':kind}
        if normalized:a['normalized']=True
        if component==5126:
            rows = data if isinstance(data[0],list) else [[v] for v in data]
            a.update(min=[min(r[k] for r in rows) for k in range(len(rows[0]))],
                     max=[max(r[k] for r in rows) for k in range(len(rows[0]))])
        accessors.append(a)
        return len(accessors)-1
    attrs = {'POSITION':attr(fan.positions,'f',5126,'VEC3'),
             'COLOR_0':attr(fan.colors,'B',5121,'VEC4',True),
             '_PART':attr([[int(h),s,0,0] for h,s in zip(fan.head,fan.shirt)],'B',5121,'VEC4')}
    indices = attr(fan.indices,'H',5123,'SCALAR',target=34963)
    morphs=[]
    for t in targets:
        deltas = [[round(b[k]-a[k],7) for k in range(3)] for a,b in zip(fan.positions,t.positions)]
        changed = [j for j,row in enumerate(deltas) if any(row)]
        a = {'componentType':5126,'count':len(deltas),'type':'VEC3',
             'min':[min(r[k] for r in deltas) for k in range(3)],
             'max':[max(r[k] for r in deltas) for k in range(3)],
             'sparse':{'count':len(changed),
                       'indices':{'bufferView':view(pack(changed,'H')),'componentType':5123},
                       'values':{'bufferView':view(pack([deltas[j] for j in changed],'f'))}}}
        accessors.append(a);morphs.append({'POSITION':len(accessors)-1})
    times = attr([0.,.18,.36,.54,.72],'f',5126,'SCALAR',target=None)
    up_weights = attr([0.,0.,0., 1.,0.,0., 1.,0.,0., 1.,0.,0., 0.,0.,0.],
                      'f',5126,'SCALAR',target=None)
    clap_weights = attr([0.,1.,0., 0.,0.,1., 0.,1.,0., 0.,0.,1., 0.,1.,0.],
                        'f',5126,'SCALAR',target=None)
    weights = [[0,0,0],[1,0,0],[0,1,0]][i%3]
    name = f'fan-{i+1:02}'
    doc={'asset':{'version':'2.0','generator':'CC0 hoops-crowd-3d-v1/source/build.py'},
         'extensionsUsed':['KHR_materials_unlit'],'scene':0,'scenes':[{'nodes':[0]}],
         'nodes':[{'name':name,'mesh':0,'extras':{'headPivot':pivot,
                    'posture':'seated' if i<6 else 'standing','restPose':i%3}}],
         'meshes':[{'name':name,'weights':weights,'extras':{'targetNames':['arms-up','clap-open','clap-close']},
                    'primitives':[{'attributes':attrs,'indices':indices,'material':0,'mode':4,'targets':morphs}]}],
         'materials':[{'name':'team-shirt-baked-colors','pbrMetallicRoughness':{
             'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':1},
             'doubleSided':level==2,
             'extensions':{'KHR_materials_unlit':{}}}],
         'animations':[{'name':n,'samplers':[{'input':times,'output':out,'interpolation':'LINEAR'}],
             'channels':[{'sampler':0,'target':{'node':0,'path':'weights'}}]}
             for n,out in [('celebrate',up_weights),('clap',clap_weights)]],
         'bufferViews':views,'accessors':accessors,'buffers':[{'byteLength':len(blob)}]}
    raw=json.dumps(doc,separators=(',',':')).encode();raw+=b' '*(-len(raw)%4)
    blob.extend(b'\0'*(-len(blob)%4))
    data=struct.pack('<III',0x46546c67,2,28+len(raw)+len(blob))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(blob),0x004e4942)+blob
    path=ROOT/f'runtime/lod{level}/{name}.glb';path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    return {'file':path.relative_to(ROOT).as_posix(),'variant':i,'level':level,
            'posture':'seated' if i<6 else 'standing','pose':['down','up','clap'][i%3],
            'triangles':len(fan.indices)//3,'vertices':len(fan.positions),'headPivot':pivot,
            'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}


if __name__=='__main__':
    assets=[export(i,level) for level in range(3) for i in range(12)]
    manifest={'license':'CC0-1.0','units':'meters','up':'+Y','forward':'+Z',
              'compression':'none','payloadBytes':sum(a['bytes'] for a in assets),'assets':assets}
    (ROOT/'assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'models':len(assets),'bytes':manifest['payloadBytes'],'triangles':[210,90,24]}))
