#!/usr/bin/env python3
"""Build CC0 MakeHuman-derived, canonical-rig soccer characters.

Run with Blender 4.3+: blender -b --factory-startup --python source/character_build.py
Source anatomy and shape deltas are unmodified CC0 data, not MakeHuman program code.
This v7 builder reuses the CC0 anatomical source data already committed in v6.
It preserves anatomical head aspect, clips garment boundaries, reserves explicit
eye/collar/hair topology budgets, and exports compact PBR skin primitives.
All eight identities are synthetic parameter blends with no real likeness.
"""
from pathlib import Path
import bpy, numpy as np, json, math, struct, hashlib, sys, shutil, os
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.dont_write_bytecode=True
from PIL import Image, ImageDraw, ImageFilter

HERE=Path(__file__).resolve().parent
PACKAGE=HERE.parent
OUT=Path(os.environ.get('SOCCER_CHARACTER_OUTPUT',str(PACKAGE))).resolve()
if not (OUT.is_relative_to(PACKAGE) or OUT.is_relative_to(Path('/tmp'))):raise RuntimeError('Character output must stay inside the new character package or temporary authoring workspace')
SRC=HERE.parent.parent.parent/'soccer-v6'/'characters'/'source'/'makehuman'
ASSETS=OUT/'models'; TEX=OUT/'textures'
ASSETS.mkdir(parents=True,exist_ok=True); TEX.mkdir(parents=True,exist_ok=True)
MOUTH_COMPRESSION=float(os.environ.get('SOCCER_CHARACTER_MOUTH_COMPRESSION','.40'))
if not math.isfinite(MOUTH_COMPRESSION) or not 0<=MOUTH_COMPRESSION<=.60:
    raise ValueError('Authoring mouth compression must be finite and between 0 and .60')
EYE_CLOSURE_EXTRA=float(os.environ.get('SOCCER_CHARACTER_EYE_CLOSURE_EXTRA','0'))
EYE_COLOR_FACTOR=float(os.environ.get('SOCCER_CHARACTER_EYE_COLOR_FACTOR','1'))
CROWN_OWN_NORMAL=float(os.environ.get('SOCCER_CHARACTER_CROWN_OWN_NORMAL','.20'))
if not math.isfinite(CROWN_OWN_NORMAL) or not 0<=CROWN_OWN_NORMAL<=.35:
    raise ValueError('Crown own-normal blend must be finite and within 0..0.35')
HAIR_MACRO_IDS=[x.strip() for x in os.environ.get('SOCCER_CHARACTER_HAIR_MACRO_IDS','player-03,player-04').split(',') if x.strip()]
if not set(HAIR_MACRO_IDS)<=set(('player-03','player-04')):
    raise ValueError('The tested macro groom supports only player-03 and player-04')
if not math.isfinite(EYE_CLOSURE_EXTRA) or not 0<=EYE_CLOSURE_EXTRA<=.12:
    raise ValueError('Authoring eye closure offset must be between 0 and .12')
if not math.isfinite(EYE_COLOR_FACTOR) or not .70<=EYE_COLOR_FACTOR<=1:
    raise ValueError('Authoring eye color factor must be between .70 and 1')

NAMES=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']
PARENTS=[None,0,1,2,3,4,3,6,7,3,9,10,1,12,13,1,15,16]
LOCAL=np.array([[0,0,0],[0,.86,0],[0,.20,0],[0,.18,0],[0,.10,0],[0,.13,0],[.16,.06,0],[0,-.27,0],[0,-.24,0],[-.16,.06,0],[0,-.27,0],[0,-.24,0],[.10,0,0],[0,-.41,0],[0,-.37,0],[-.10,0,0],[0,-.41,0],[0,-.37,0]],float)
WORLD=LOCAL.copy()
for i,p in enumerate(PARENTS):
    if p is not None:WORLD[i]+=WORLD[p]

PEOPLE=[
 dict(id='player-01',label='איתן',role='field',skin=(150,104,80),heritage=(.12,.1,.78),head='head-square',hair='crop',hairColor=(27,20,16),eye=(67,45,26)),
 dict(id='player-02',label='גיא',role='field',skin=(72,43,31),heritage=(.92,0,.08),head='head-rectangular',hair='coils',hairColor=(17,13,11),eye=(49,31,22)),
 dict(id='player-03',label='ליאם',role='field',skin=(204,153,124),heritage=(0,.88,.12),head='head-oval',hair='sweep',hairColor=(15,17,19),eye=(54,41,27)),
 dict(id='player-04',label='נבו',role='field',skin=(224,176,146),heritage=(0,.05,.95),head='head-rectangular',hair='quiff',hairColor=(99,58,32),eye=(79,105,103)),
 dict(id='player-05',label='רון',role='field',skin=(115,75,50),heritage=(.48,.3,.22),head='head-square',hair='buzz',hairColor=(27,24,20),eye=(71,52,27)),
 dict(id='player-06',label='עומר',role='field',skin=(184,124,87),heritage=(.20,.12,.68),head='head-oval',hair='waves',hairColor=(47,31,23),eye=(65,72,41)),
 dict(id='goalkeeper',label='שוער',role='goalkeeper',skin=(105,66,47),heritage=(.7,.06,.24),head='head-oval',hair='coils',hairColor=(20,16,13),eye=(44,31,23)),
 dict(id='referee',label='שופט',role='referee',skin=(190,140,111),heritage=(.08,.05,.87),head='head-square',hair='short',hairColor=(57,49,44),eye=(63,49,36)),
]
KITS={'kit-a':((18,91,65),(231,230,212),(29,101,71)), 'kit-b':((28,62,132),(225,229,234),(28,62,132)), 'keeper':((226,143,28),(31,38,43),(224,144,28)), 'referee':((211,220,45),(27,31,37),(27,31,37))}

def obj_data(path):
    verts=[];uv=[];groups={};g='body'
    for line in path.read_text().splitlines():
        a=line.split()
        if not a:continue
        if a[0]=='v':verts.append(list(map(float,a[1:4])))
        elif a[0]=='vt':uv.append(list(map(float,a[1:3])))
        elif a[0]=='g':g=a[1]
        elif a[0]=='f':
            f=[];t=[]
            for x in a[1:]:
                b=x.split('/');f.append(int(b[0])-1);t.append(int(b[1])-1 if len(b)>1 and b[1] else 0)
            groups.setdefault(g,[]).append((f,t))
    return np.array(verts,float),np.array(uv,float),groups

BASE,BASEUV,GROUPS=obj_data(SRC/'base.obj')
def target(name):
    d=np.zeros(BASE.shape)
    for line in (SRC/(name+'.target')).read_text().splitlines():
        a=line.split()
        if len(a)==4 and not line.startswith('#'):d[int(a[0])]=list(map(float,a[1:]))
    return d
TARGETS={x.stem:target(x.stem) for x in SRC.glob('*.target')}
FACE_TARGETS={}
for file in (HERE/'cc0-face-targets').glob('*.target'):
    data=np.zeros(BASE.shape)
    for line in file.read_text().splitlines():
        a=line.split()
        if len(a)==4 and not line.startswith('#'):data[int(a[0])]=list(map(float,a[1:]))
    FACE_TARGETS[file.stem]=data

def ids(group):return np.unique([v for f,t in GROUPS[group] for v in f])

def human_morph(person):
    v=BASE.copy()
    for factor,name in zip(person['heritage'],['african-male-young','asian-male-young','caucasian-male-young']):v+=TARGETS[name]*factor
    v+=TARGETS['universal-male-young-maxmuscle-minweight']*.76
    v+=TARGETS['universal-male-young-maxmuscle-averageweight']*.24
    v+=TARGETS[person['head']]*.27
    idx=int(person['id'][-2:]) if person['id'].startswith('player') else (7 if person['role']=='goalkeeper' else 8)
    if idx%2:v+=TARGETS['nose-scale-depth-incr']*.13
    if idx in [2,5]:v+=TARGETS['mouth-scale-horiz-incr']*.20+TARGETS['nose-width1-incr']*.14
    if person['role']=='goalkeeper':v+=TARGETS['mouth-scale-horiz-incr']*.055+TARGETS['nose-width1-incr']*.045+TARGETS['nose-scale-depth-incr']*.12
    # Independent, restrained anatomical deltas distinguish the fictional roster.
    # Player01 is unchanged here to keep the shared hair comparison controlled.
    shapes={
        'player-01':(0,0,0,0,0,0),
        'player-02':(.13,.02,.20,.05,.05,.025),
        'player-03':(.04,.03,.03,.12,.02,.015),
        'player-04':(.16,.12,.18,.08,.03,.035),
        'player-05':(.10,.04,.08,.08,.07,.045),
        'player-06':(.08,.10,.12,.02,.06,.025),
        'goalkeeper':(.20,.06,.11,.15,.025,.07),
        'referee':(.055,.08,.16,.06,.04,.10),
    }
    cheek,volume,width,prominence,height,temple=shapes[person['id']]
    for side in ['l','r']:
        v+=FACE_TARGETS[side+'-cheek-bones-incr']*cheek
        v+=FACE_TARGETS[side+'-cheek-volume-decr']*volume
    for name,amount in [('chin-width-incr',width),('chin-prominent-incr',prominence),('chin-height-decr',height),('forehead-temple-incr',temple)]:
        v+=FACE_TARGETS[name]*amount
    # Relaxed upper lids wrap the iris instead of leaving a permanently wide stare.
    closure=(.075 if person['heritage'][1]>.65 else .115)+EYE_CLOSURE_EXTRA
    for amount,family in zip(person['heritage'],['african','asian','caucasian']):
        # A restrained closed rest expression uses licensed anatomical deltas.
        # No facial features, shadows or expression lines are painted onto skin.
        v+=FACE_TARGETS[family+'-mouth-compression']*amount*MOUTH_COMPRESSION
        for side in ['left','right']:
            v+=FACE_TARGETS[family+'-eye-'+side+'-closure']*amount*closure
            v+=FACE_TARGETS[family+'-eye-'+side+'-slit']*amount*.060
    return v

def rotation_between(a,b):
    return np.array(Vector(a).rotation_difference(Vector(b)).to_matrix())
def line_distance(p,a,b):
    d=b-a;t=np.clip(np.dot(p-a,d)/np.dot(d,d),0,1)
    return np.linalg.norm(p-(a+t*d)),t

def deform(v):
    joint={g[6:]:v[ids(g)].mean(0) for g in GROUPS if g.startswith('joint-')}
    out=np.zeros(v.shape);weights=np.zeros((len(v),18));regions=[]
    hip=joint['l-upper-leg'][1]; neck=joint['neck'][1];top=v[ids('body'),1].max()
    srcbones={};xf={}
    for side,sign,arm,leg in [('l',1,6,12),('r',-1,9,15)]:
        shoulder=joint[f'{side}-shoulder'];elbow=joint[f'{side}-elbow'];wrist=joint[f'{side}-hand']
        finger=joint[f'{side}-finger-3-4'];thigh=joint[f'{side}-upper-leg'];knee=joint[f'{side}-knee'];ankle=joint[f'{side}-ankle']
        for i,a,b,tl in [(arm,shoulder,elbow,.27),(arm+1,elbow,wrist,.24),(arm+2,wrist,finger,.17),(leg,thigh,knee,.41),(leg+1,knee,ankle,.37)]:
            R=rotation_between(b-a,[0,-1,0]);scale=tl/np.linalg.norm(b-a)
            xf[i]=(a,R*scale,WORLD[i]);srcbones[i]=(a,b)
        xf[leg+2]=(ankle,np.eye(3)*.105,WORLD[leg+2]);srcbones[leg+2]=(ankle,ankle+np.array([0,0,2]))
    def trans(p,i):
        a,M,b=xf[i];return b+M@(p-a)
    for j,p in enumerate(v):
        x,y,z=p;sgn=1 if x>=0 else -1;arm=6 if sgn>0 else 9;leg=12 if sgn>0 else 15
        is_arm=(abs(x)>2.50 and y>.3) or (abs(x)>1.36 and y>3.2)
        if is_arm:
            ds=[line_distance(p,*srcbones[k])[0] for k in [arm,arm+1,arm+2]]
            k=[arm,arm+1,arm+2][np.argmin(ds)]
            # Smoothly blend transforms around anatomical joints.
            w={k:1.0}
            for a,b,piv in [(arm,arm+1,srcbones[arm][1]),(arm+1,arm+2,srcbones[arm+1][1])]:
                dist=np.linalg.norm(p-piv)
                if dist<.62:
                    direction=srcbones[b][1]-piv
                    q=np.dot(p-piv,direction)/np.linalg.norm(direction)
                    t=np.clip(.5+q/1.0,0,1);w={a:1-t,b:t};break
            out[j]=sum(trans(p,k)*ww for k,ww in w.items())
            for k,ww in w.items():weights[j,k]=ww
            chest=np.clip((2.55-abs(x))/1.25,0,1)
            chest=chest*chest*(3-2*chest)
            if chest>0:
                shoulder_y=joint['l-shoulder'][1]
                qy=(.86+(y-hip)*(.44/(shoulder_y-hip))) if y<shoulder_y else (1.30+(y-shoulder_y)*.126)
                center=np.interp(y,[hip,shoulder_y,neck,top],[.08,.12,.15,.47])
                torso=np.array([x*(.098+.004*np.clip((y-shoulder_y)/1.0,0,1)),qy,(z-center)*.103])
                out[j]=out[j]*(1-chest)+torso*chest
                weights[j]*=1-chest
                t=np.clip((qy-1.04)/.16,0,1)
                weights[j,2]+=chest*(1-t);weights[j,3]+=chest*t
            regions.append('arm')
        elif y<hip:
            knee=srcbones[leg][1];ankle=srcbones[leg+1][1]
            if y<ankle[1]+.25:
                out[j]=trans(p,leg+2);weights[j,leg+2]=1
            elif abs(y-knee[1])<.65:
                t=np.clip(.5+(knee[1]-y)/1.3,0,1)
                out[j]=trans(p,leg)*(1-t)+trans(p,leg+1)*t;weights[j,leg]=1-t;weights[j,leg+1]=t
            else:
                k=leg if y>knee[1] else leg+1;out[j]=trans(p,k);weights[j,k]=1
            regions.append('leg')
        else:
            # Preserve the anatomical head aspect: v6 separately stretched neck/jaw.
            shoulder_y=joint['l-shoulder'][1]
            head_blend=np.clip((y-shoulder_y)/1.0,0,1)
            out[j,0]=x*(.098+.004*head_blend)
            out[j,1]=(.86+(y-hip)*(.44/(shoulder_y-hip))) if y<shoulder_y else (1.30+(y-shoulder_y)*.126)
            center=np.interp(y,[hip,shoulder_y,neck,top],[.08,.12,.15,.47])
            out[j,2]=(z-center)*(.103 if y>neck else .103)
            q=out[j,1]
            if q>1.49:weights[j,5]=1
            elif q>1.405:
                t=np.clip((q-1.405)/.085,0,1);weights[j,4]=1-t;weights[j,5]=t
            elif q>1.2:
                t=np.clip((q-1.2)/.205,0,1);weights[j,3]=1-t*.65;weights[j,4]=t*.65
            elif q>1.04:
                t=(q-1.04)/.16;weights[j,2]=1-t;weights[j,3]=t
            else:
                t=np.clip((q-.88)/.16,0,1);weights[j,1]=1-t;weights[j,2]=t
            regions.append('head' if q>1.40 else 'torso')
    return out,weights,regions,joint

# The v7 atlas allocates most face texels to a cropped head UV island.
sys.path.insert(0,str(HERE))
from character_atlas import atlas, rectuv, skin_uv, normalize_shirt_uv, KITS, RECT, FACE_CROP, skin_source_info
if OUT!=PACKAGE:
    import character_atlas as _atlas_module
    _atlas_module.ROOT=OUT;_atlas_module.TEXTURES=TEX
from character_face_helper import FaceSurface

def make_mesh(name,verts,faces,faceuv,weights,atlas_region=None,atlas_class=None):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    obj['surface']='Eyes' if name.startswith('eye-') else 'HairCards' if name.startswith('hair-') else 'HairCards' if name.startswith('eyebrow') else 'Cloth'
    if atlas_region:obj['atlasRegion']=atlas_region
    if atlas_class:obj['atlasClass']=atlas_class
    uv=mesh.uv_layers.new(name='AtlasUV')
    for poly,uvs in zip(mesh.polygons,faceuv):
        poly.use_smooth=True
        for li,tex in zip(poly.loop_indices,uvs):uv.data[li].uv=tex
    for k,n in enumerate(NAMES):
        group=obj.vertex_groups.new(name=n)
        for i,w in enumerate(weights[:,k]):
            if w>1e-6:group.add([i],float(w),'REPLACE')
    return obj

def clipped(poly, axis, limit, keep_greater):
    """Clip a skinned surface at a precise garment seam, preserving interpolated UV/skin."""
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        da=(a[0][axis]-limit)*(1 if keep_greater else -1)
        db=(b[0][axis]-limit)*(1 if keep_greater else -1)
        if da>=-1e-8:out.append(a)
        if (da>=0)!=(db>=0):
            t=da/(da-db)
            out.append(tuple(x+(y-x)*t for x,y in zip(a,b)))
    return out

def clipped_uv(poly, axis, limit, keep_greater):
    # UV-space partition keeps each resulting face inside one atlas region.
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        da=(a[1][axis]-limit)*(1 if keep_greater else -1)
        db=(b[1][axis]-limit)*(1 if keep_greater else -1)
        if da>=-1e-10:out.append(a)
        if (da>=0)!=(db>=0):
            t=da/(da-db);out.append(tuple(x+(y-x)*t for x,y in zip(a,b)))
    return out

def body_parts(person):
    src=human_morph(person);v,w,reg,joints=deform(src)
    normals=np.zeros(v.shape)
    for f,t in GROUPS['body']:
        a,b,c=v[f[:3]];n=np.cross(b-a,c-a)
        for i in f:normals[i]+=n
    normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-12)
    buckets={'face':[],'body':[],'cloth':[],'underlay':[]}
    def add(part,f,t,kind,lo=None,hi=None,inflate=0):
        poly=[]
        for i,ti in zip(f,t):
            q=v[i].copy()
            if inflate:
                q+=normals[i]*inflate
                # Performance fabric has ease; retain athletic silhouette without painted-on muscles.
                if kind=='shirt':
                    q[0]*=1.025;q[2]*=1.035
                elif kind=='shorts':
                    center=.10 if q[0]>0 else -.10
                    q[0]=center+(q[0]-center)*1.05
            uv0=BASEUV[ti]
            poly.append((q,np.array(uv0),w[i].copy()))
        if lo is not None:poly=clipped(poly,1,lo,True)
        if hi is not None:poly=clipped(poly,1,hi,False)
        if len(poly)<3:return
        if kind=='skin' and part=='face':
            a,b,c,d=FACE_CROP;inside=poly;outside=[]
            for axis,limit,greater in [(0,a,True),(0,c,False),(1,b,True),(1,d,False)]:
                if len(inside)<3:break
                fragment=clipped_uv(inside,axis,limit,not greater)
                if len(fragment)>=3:outside.append(fragment)
                inside=clipped_uv(inside,axis,limit,greater)
            for fragment in outside:
                buckets[part].append((fragment,[skin_uv(*uv,prefer_face=False) for q,uv,ww in fragment]))
            if len(inside)>=3:
                buckets[part].append((inside,[skin_uv(*uv,prefer_face=True) for q,uv,ww in inside]))
            return
        pmean=np.mean([x[0] for x in poly],0);y=pmean[1]
        arm=sum(reg[i]=='arm' for i in f)>len(f)/2
        uvs=[]
        for q,original_uv,ww in poly:
            if kind=='skin':uvs.append(skin_uv(*original_uv,prefer_face=part=='face'))
            else:
                center=(.16 if q[0]>0 else -.16) if arm else ((.10 if q[0]>0 else -.10) if y<.86 else 0)
                u=(math.atan2(q[0]-center,q[2])/(2*math.pi)+.5)%1
                bounds={'shirt':(.875,1.405),'shorts':(.615,.90),'socks':(.09,.455),'gloves':(.60,.81)}
                a,b=bounds[kind];vv=np.clip((q[1]-a)/(b-a),0,1)
                uvs.append(rectuv(kind,u,vv))
        buckets[part].append((poly,uvs))
    for f,t in GROUPS['body']:
        p=v[f].mean(0);y=p[1]
        arm=sum(reg[i]=='arm' for i in f)>len(f)/2
        # Anatomical skin under the collar, cuffs and shorts overlaps the sewn shell.
        if arm and max(v[f,1])>1.11:add('underlay',f,t,'skin',lo=1.105,hi=1.405,inflate=-.004)
        elif not arm and max(v[f,1])>1.14 and min(v[f,1])<1.405:add('underlay',f,t,'skin',lo=1.14,hi=1.405,inflate=-.004)
        if max(v[f,1])>1.375 and not arm:add('face',f,t,'skin',lo=1.375)
        if arm and min(v[f,1])<1.18:
            add('body',f,t,'gloves' if person['role']=='goalkeeper' and y<.82 else 'skin',hi=1.18,inflate=.004 if person['role']=='goalkeeper' and y<.82 else 0)
        knee_skin_lo=.36 if os.environ.get('SOCCER_CHARACTER_SOCK_VARIANT','15')=='23' else .42
        if not arm and min(v[f,1])<.66 and max(v[f,1])>knee_skin_lo:add('body',f,t,'skin',lo=knee_skin_lo,hi=.66)
        if not arm:
            pass # Authored CC0 tailored jersey is fitted separately.
            if max(v[f,1])>.615 and min(v[f,1])<.90:add('cloth',f,t,'shorts',lo=.615,hi=.90,inflate=.013)
            pass # Clean lofted sock cuffs and calf shells are generated separately.
    objects=[]
    for part,polys in buckets.items():
        used={};vv=[];ff=[];ww=[];uu=[]
        for poly,uv in polys:
            face=[]
            for q,original_uv,weights in poly:
                key=tuple(np.round(np.r_[q,weights],7))
                if key not in used:used[key]=len(vv);vv.append(q);ww.append(weights)
                face.append(used[key])
            ff.append(face);uu.append(uv)
        obj=make_mesh(person['id']+'-'+part,vv,ff,uu,np.array(ww),atlas_region='shorts' if part=='cloth' else 'skin' if part=='underlay' else None,atlas_class=part)
        obj['surface']='Cloth' if part=='cloth' else 'Skin'
        objects.append(obj)
    return objects,src,joints

def ellipsoid(name,center,scale,joint,kind,segments=16,rings=9,eye=False,iris_shift=0.):
    vs=[];fs=[];uvs=[]
    for j in range(rings+1):
        t=math.pi*j/rings
        for i in range(segments+1):
            a=2*math.pi*i/segments
            point=np.array(center)+np.array(scale)*[math.sin(t)*math.sin(a),math.cos(t),math.sin(t)*math.cos(a)]
            if eye and point[2]>center[2]:
                radius2=(point[0]-center[0])**2+(point[1]-center[1]-iris_shift)**2
                if radius2<.0072**2:point[2]+=.0010*(1-radius2/.0072**2)**2
            vs.append(point)
    for j in range(rings):
        for i in range(segments):
            f=[j*(segments+1)+i,j*(segments+1)+i+1,(j+1)*(segments+1)+i+1,(j+1)*(segments+1)+i];fs.append(f)
            if eye:
                # Project pupil onto the eye's forward hemisphere.
                uv=[]
                for k in f:
                    rel=(vs[k]-center)/scale
                    rel[1]=(vs[k][1]-center[1]-iris_shift)/scale[0]  # circular iris aligned to the actual socket opening
                    uv.append(rectuv(kind,.5+rel[0]*.44,.5+rel[1]*.44))
                uvs.append(uv)
            else:uvs.append([rectuv(kind,i/segments,j/rings),rectuv(kind,(i+1)/segments,j/rings),rectuv(kind,(i+1)/segments,(j+1)/rings),rectuv(kind,i/segments,(j+1)/rings)])
    fs=[list(reversed(f)) for f in fs];uvs=[list(reversed(f)) for f in uvs]
    w=np.zeros((len(vs),18));w[:,joint]=1
    return make_mesh(name,vs,fs,uvs,w,atlas_region=kind)

def hair_style(person):
    return {'crop':'short04','coils':'afro01','sweep':'short02','quiff':'short03','buzz':'short01','waves':'short04','short':'short01'}[person['hair']]

def fit_asset_vertices(path,src):
    vv,uv,groups=obj_data(path.with_suffix('.obj'))
    mapping=[];scales=np.ones(3);reading=False
    for line in path.with_suffix('.mhclo').read_text().splitlines():
        a=line.split()
        if not a:continue
        if a[0] in ['x_scale','y_scale','z_scale']:
            axis={'x_scale':0,'y_scale':1,'z_scale':2}[a[0]];scales[axis]=abs(src[int(a[1]),axis]-src[int(a[2]),axis])/float(a[3])
        elif a[0]=='verts':reading=True
        elif reading and len(a)==9:
            try:mapping.append(([int(x) for x in a[:3]],[float(x) for x in a[3:6]],[float(x) for x in a[6:9]]))
            except ValueError:reading=False
        elif reading and len(a)==1 and a[0].isdigit():mapping.append(([int(a[0])]*3,[1,0,0],[0,0,0]))
        elif reading:reading=False
    if len(mapping)!=len(vv):raise RuntimeError('Clothing fitting map mismatch '+str(len(mapping))+'/'+str(len(vv)))
    vv=np.array([np.array(ws)@src[idx]+np.array(off)*scales for idx,ws,off in mapping])
    return vv,uv,groups

def fitted_shirt(person,src,joints,shorts=None):
    path=HERE/'cc0-clothing'/'male_casualsuit06'
    vv,uv,groups=fit_asset_vertices(path,src)
    dv,ww,regions,_=deform(np.vstack([src,vv]));v=dv[len(src):];w=ww[len(src):]
    # The source is an actual short-sleeve shirt; retain its continuous collar and hem loops.
    hip=joints['l-upper-leg'][1];shoulder_y=joints['l-shoulder'][1]
    for i,p in enumerate(vv):
        if p[1]<hip+.35:
            qy=.86+(p[1]-hip)*.44/(shoulder_y-hip)
            center=np.interp(p[1],[hip,shoulder_y],[.08,.12])
            v[i]=[p[0]*.098,qy,(p[2]-center)*.103]
            t=np.clip((qy-.88)/.16,0,1);w[i]=0;w[i,1]=1-t;w[i,2]=t
    # Connected components separate the true shirt from the jeans in the CC0 source.
    allfaces=[(f,t) for polys in groups.values() for f,t in polys]
    parent=list(range(len(v)))
    def find(i):
        while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
        return i
    def union(a,b):
        a=find(a);b=find(b)
        if a!=b:parent[b]=a
    for f,t in allfaces:
        for j in f[1:]:union(f[0],j)
    ymax={}
    for i,p in enumerate(v):
        key=find(i);ymax[key]=max(ymax.get(key,-100),p[1])
    faces=[];uvs=[]
    for f,t in allfaces:
        if ymax[find(f[0])]<1.0:continue
        faces.append(f);uvs.append([rectuv('shirt',*normalize_shirt_uv(*uv[ti])) for ti in t])
    # Sew the actual lower boundary into a clean, slightly eased horizontal hem.
    edge_uses={}
    for f in faces:
        for a,b in zip(f,f[1:]+f[:1]):
            e=tuple(sorted((a,b)));edge_uses[e]=edge_uses.get(e,0)+1
    boundary=[e for e,n in edge_uses.items() if n==1]
    from character_seams import tailored_hem
    v,faces,uvs,w=tailored_hem(v,faces,uvs,w,rectuv,shorts)
    edge_uses={}
    for f in faces:
        for a,b in zip(f,f[1:]+f[:1]):
            e=tuple(sorted((a,b)));edge_uses[e]=edge_uses.get(e,0)+1
    boundary=[e for e,n in edge_uses.items() if n==1]
    # Raised rib-knit binding follows the actual collar boundary. It is sewn to
    # the fitted garment rather than painted onto an unrelated atlas coordinate.
    collar={i for e in boundary for i in e if v[i,1]>1.34 and abs(v[i,0])<.12}
    if collar and os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15') not in ('17','18'):
        adjacency={i:set() for i in collar}
        for a,b in boundary:
            if a in collar and b in collar:adjacency[a].add(b);adjacency[b].add(a)
        for _ in range(2):
            updates={i:.68*v[i]+.32*np.mean(v[list(ns)],0) for i,ns in adjacency.items() if ns}
            for i,q in updates.items():v[i]=q
        seam_v=[];seam_w=[]
        for a,b in boundary:
            if a not in collar or b not in collar:continue
            first=len(v)+len(seam_v);points=[]
            for j,down in [(a,0),(b,0),(b,.006),(a,.006)]:
                q=v[j].copy();r=np.array([q[0],0,q[2]-.025]);r/=max(np.linalg.norm(r),1e-6)
                q+=r*.0011;q[1]-=down
                points.append(q);seam_v.append(q);seam_w.append(w[j])
            f=[first,first+1,first+2,first+3]
            u0=(math.atan2(v[a,0],v[a,2]-.025)/(2*math.pi))%1
            u1=(math.atan2(v[b,0],v[b,2]-.025)/(2*math.pi))%1
            if abs(u1-u0)>.5:u1+=1 if u0>u1 else -1
            uu=[rectuv('shirt',u0,.986),rectuv('shirt',u1%1,.986),rectuv('shirt',u1%1,.96),rectuv('shirt',u0,.96)]
            if np.dot(np.cross(points[1]-points[0],points[2]-points[0]),np.mean(points,0)*[1,0,1])<0:f=list(reversed(f));uu=list(reversed(uu))
            faces.append(f);uvs.append(uu)
        if seam_v:v=np.vstack([v,seam_v]);w=np.vstack([w,seam_w])
    obj=make_mesh(person['id']+'-jersey-cloth',v,faces,uvs,w,atlas_region='shirt',atlas_class='shirt');obj['surface']='Cloth'
    obj['garmentBoundaryEdges']=[int(i) for edge in boundary for i in edge]
    return obj

def fitted_hair(person,src,joints):
    style=hair_style(person);path=SRC/'hair'/style
    vv,huv,groups=obj_data(path/(style+'.obj'))
    mapping=[];scales=np.ones(3);reading=False
    for line in (path/(style+'.mhclo')).read_text().splitlines():
        a=line.split()
        if not a:continue
        if a[0] in ['x_scale','y_scale','z_scale']:
            axis={'x_scale':0,'y_scale':1,'z_scale':2}[a[0]];scales[axis]=abs(src[int(a[1]),axis]-src[int(a[2]),axis])/float(a[3])
        elif a[0]=='verts':reading=True
        elif reading and len(a)==9:
            try:mapping.append(([int(x) for x in a[:3]],[float(x) for x in a[3:6]],[float(x) for x in a[6:9]]))
            except ValueError:reading=False
        elif reading and len(a)==1 and a[0].isdigit():mapping.append(([int(a[0])]*3,[1,0,0],[0,0,0]))
    if len(mapping)==len(vv):
        vv=np.array([np.array(ws)@src[idx]+np.array(off)*scales for idx,ws,off in mapping])
    else:raise RuntimeError('Hair fitting map mismatch '+style+': '+str(len(mapping))+'/'+str(len(vv)))
    hip=joints['l-upper-leg'][1];neck=joints['neck'][1];top=src[ids('body'),1].max()
    shoulder_y=joints['l-shoulder'][1]
    hair=vv.copy();hair[:,0]*=.102
    yy=vv[:,1];hair[:,1]=1.30+(yy-shoulder_y)*.126
    center=np.interp(yy,[hip,shoulder_y,neck,top],[.08,.12,.15,.47]);hair[:,2]=(vv[:,2]-center)*.103
    # Lift the fringe away from the iris instead of occluding an eye with a hair lobe.
    if person['hair'] in ['sweep','buzz','short']:
        forward=np.clip((hair[:,2]-.060)/.055,0,1)
        hair[:,1]+=np.maximum(0,1.640-hair[:,1])*forward
    if person['hair']=='waves':
        # Shorter textured crop with an asymmetric brushed crown.
        t=np.clip((hair[:,1]-1.65)/.10,0,1);hair[:,1]-=.018*t;hair[:,0]+=.007*t
    elif person['hair']=='quiff':
        t=np.clip((hair[:,1]-1.65)/.10,0,1);hair[:,1]+=.012*t;hair[:,2]+=.005*t
    elif person['hair']=='buzz':
        t=np.clip((hair[:,1]-1.65)/.10,0,1);hair[:,1]-=.014*t
    faces=[];uvs=[]
    hair_center=np.array([0,1.30+(joints['l-eye'][1]-shoulder_y)*.126+.050,.012])
    for group in groups.values():
        for f,t in group:
            q=hair[f];outward=np.mean(q,0)-hair_center
            if np.dot(np.cross(q[1]-q[0],q[2]-q[0]),outward)<0:f=list(reversed(f));t=list(reversed(t))
            faces.append(f);uvs.append([rectuv('hair',*huv[ti]) for ti in t])
    w=np.zeros((len(hair),18));w[:,5]=1
    obj=make_mesh('hair-source-cards',hair,faces,uvs,w,atlas_region='hair')
    obj['hairCenter']=[0,1.30+(joints['l-eye'][1]-shoulder_y)*.126+.050,.012]
    return obj

def layered_hair_wisps(person,hair,src):
    """Fine curved alpha ribbons over the licensed anatomical hair foundation.

    Every ribbon follows an actual fitted hair-surface raycast; this retains the
    silhouette of the source style while adding smaller strand groups and a soft
    fringe. It is ordinary layered hair-card geometry, without real hair scans.
    """
    hv=[Vector(v.co) for v in hair.data.vertices]
    hf=[list(p.vertices) for p in hair.data.polygons]
    bvh=BVHTree.FromPolygons(hv,hf,all_triangles=False)
    dv,_,_,_=deform(src)
    eyec=(dv[ids('joint-l-eye')].mean(0)+dv[ids('joint-r-eye')].mean(0))*.5
    center=np.array([0,eyec[1]+.050,.012])
    rng=np.random.default_rng(811+sum(ord(x) for x in person['id']))
    vs=[];fs=[];uvs=[]
    curly=person['hair']=='coils'
    scalp=FaceSurface(dv,[f for f,t in GROUPS['body']])
    count=110 if curly else 160
    for i in range(count):
        if curly:
            az=rng.uniform(-math.pi,math.pi);lat=rng.uniform(.18,1.7)
            axis=np.array([math.sin(lat)*math.sin(az),math.cos(lat),math.sin(lat)*math.cos(az)])
            tangent=np.cross(axis,[0,1,0]);tangent/=max(np.linalg.norm(tangent),1e-6)
            ortho=np.cross(axis,tangent)
            direction=lambda t: (axis+tangent*math.sin(t*math.pi*1.1)*.10+ortho*(1-math.cos(t*math.pi*1.1))*.07)
        else:
            az=-1.40+2.80*(i+.35)/count+rng.normal(0,.018)
            start=.12+rng.uniform(0,.24);end=1.47+.12*abs(math.sin(az))+rng.uniform(-.045,.055)
            def direction(t,az=az,start=start,end=end):
                a=start+(end-start)*t
                aa=az+.075*math.sin(t*math.pi)+rng.uniform(-.002,.002)
                return np.array([math.sin(a)*math.sin(aa),math.cos(a),math.sin(a)*math.cos(aa)])
        tip=None
        if not curly:
            tx=.085*math.sin(az)
            ty=eyec[1]+.077-.026*abs(math.sin(az))**1.4-rng.uniform(.001,.004)
            hit,normal=scalp.front(tx,ty,eyec[2])
            if hit is not None:tip=hit+normal*.0020
        pts=[];steps=9;valid=True
        for j in range(steps+1):
            t=j/steps;d=direction(t);d/=max(np.linalg.norm(d),1e-6)
            point,normal,index,distance=bvh.ray_cast(Vector(center+d*.42),Vector(-d),.84)
            if point is None or np.dot(np.array(point)-center,d)<.025:
                point,normal,index,distance=scalp.bvh.ray_cast(Vector(center+d*.42),Vector(-d),.84)
                if point is None or np.dot(np.array(point)-center,d)<.025:valid=False;break
                q=np.array(point)+d*.0065
            else:q=np.array(point)+d*(.0026+.0008*t)
            if tip is not None and j>=steps-2:
                blend=(j-(steps-2))/2;blend=blend*blend*(3-2*blend)
                q=q*(1-blend)+tip*blend
            pts.append(q)
        if not valid:continue
        width=(.0030+rng.uniform(0,.0028)) if not curly else (.0023+rng.uniform(0,.0025))
        tile=i%8;first=len(vs)
        for j,q in enumerate(pts):
            tangent=pts[min(j+1,steps)]-pts[max(0,j-1)]
            normal=q-center;normal/=max(np.linalg.norm(normal),1e-6)
            lateral=np.cross(normal,tangent);lateral/=max(np.linalg.norm(lateral),1e-6)
            taper=1-.25*(j/steps)
            vs.extend([q-lateral*width*.5*taper,q+lateral*width*.5*taper])
        for j in range(steps):
            f=[first+j*2+2,first+j*2+3,first+j*2+1,first+j*2]
            u0=tile/8+.005;u1=(tile+1)/8-.005
            uu=[rectuv('wisps',u0,(j+1)/steps),rectuv('wisps',u1,(j+1)/steps),rectuv('wisps',u1,j/steps),rectuv('wisps',u0,j/steps)]
            q=np.array([vs[k] for k in f]);outward=q.mean(0)-center
            if np.dot(np.cross(q[1]-q[0],q[2]-q[0]),outward)<0:f=list(reversed(f));uu=list(reversed(uu))
            fs.append(f);uvs.append(uu)
    weights=np.zeros((len(vs),18));weights[:,5]=1
    obj=make_mesh('hair-fine-wisps',vs,fs,uvs,weights,atlas_region='wisps');obj['hairCenter']=center.tolist();return obj

def extras(person,src,joints,face_obj=None):
    objs=[]
    fitted_socks=os.environ.get('SOCCER_CHARACTER_SOCK_VARIANT','15') in ('21','23')
    if fitted_socks:
        from character_sock21 import fit_upper_sock
        sock_anatomy,sock_weights,_,_=deform(src)
    # The tailored CC0 jersey contains a sewn collar and proper sleeve/hem edge loops.
    for s,leg in [(1,14),(-1,17)]:
        # Smooth calf-shaped sock with continuous sewn top and ankle loops.
        sv=[];sf=[];su=[];sw=[]
        profile=[(.093,.034,.035),(.12,.035,.035),(.18,.039,.037),(.25,.047,.044),(.32,.050,.047),(.40,.054,.053),(.445,.061,.061),(.453,.061,.061)]
        if os.environ.get('SOCCER_CHARACTER_SOCK_VARIANT','15')=='23':profile=[(.093,.034,.035),(.12,.035,.035),(.18,.039,.037),(.25,.047,.044),(.32,.050,.047),(.365,.052,.050),(.390,.053,.052),(.398,.052,.051)]
        for y,rx,rz in profile:
            for i in range(24):
                a=2*math.pi*i/24
                sv.append([s*.10+rx*math.sin(a),y,rz*math.cos(a)])
                weights=np.zeros(18)
                footblend=np.clip((.17-y)/.08,0,1)
                kneeblend=np.clip((y-.425)/.028,0,1)*.25
                weights[leg]=footblend;weights[leg-1]=(1-footblend)*(1-kneeblend);weights[leg-2]=(1-footblend)*kneeblend
                sw.append(weights)
        sock_fit=None
        if fitted_socks:
            fitted,fit_weights,sock_fit=fit_upper_sock(sv,sw,sock_anatomy,sock_weights,[f for f,t in GROUPS['body']],s*.10,full_fit_y=.39 if os.environ.get('SOCCER_CHARACTER_SOCK_VARIANT','15')=='23' else .40)
            sv=fitted.tolist();sw=fit_weights.tolist()
        for j in range(len(profile)-1):
            for i in range(24):
                sf.append([j*24+i,j*24+(i+1)%24,(j+1)*24+(i+1)%24,(j+1)*24+i])
                su.append([rectuv('socks',i/24,j/7),rectuv('socks',(i+1)/24,j/7),rectuv('socks',(i+1)/24,(j+1)/7),rectuv('socks',i/24,(j+1)/7)])
        if fitted_socks:
            top=(len(profile)-1)*24;inner=len(sv)
            for i in range(24):
                p=np.asarray(sv[top+i]);radial=p-[s*.10,p[1],0];radial/=max(float(np.linalg.norm(radial)),1e-8)
                q=p-radial*.0016;q[1]-=.002
                sv.append(q.tolist());sw.append(sw[top+i])
            for i in range(24):
                j=(i+1)%24
                sf.append([top+i,top+j,inner+j,inner+i]);su.append([rectuv('socks',i/24,.999),rectuv('socks',(i+1)/24,.999),rectuv('socks',(i+1)/24,.985),rectuv('socks',i/24,.985)])
        sock=make_mesh('sock-calf-shell',sv,sf,su,np.array(sw),atlas_region='socks')
        if sock_fit:sock['anatomicalSockFit']=json.dumps(sock_fit,separators=(',',':'))
        objs.append(sock)
        # Sculpted boot upper, independent sole, six small moulded studs per foot.
        vs=[];fs=[];uvs=[];zz=[-.071,-.055,.0,.075,.145,.205,.225];width=[.022,.043,.048,.049,.047,.038,.012];height=[.035,.058,.077,.065,.047,.035,.024]
        for k,z in enumerate(zz):
            for i in range(12):
                a=2*math.pi*i/12;vs.append([s*.10+width[k]*math.sin(a),max(.031,.047+height[k]*math.cos(a)*.70),z])
        for k in range(len(zz)-1):
            for i in range(12):
                fs.append([k*12+i,(k+1)*12+i,(k+1)*12+(i+1)%12,k*12+(i+1)%12]);uvs.append([rectuv('boots',i/12,k/6),rectuv('boots',i/12,(k+1)/6),rectuv('boots',(i+1)/12,(k+1)/6),rectuv('boots',(i+1)/12,k/6)])
        fs.extend([list(range(11,-1,-1)),list(range(72,84))]);uvs.extend([[rectuv('boots',.5,.5)]*12]*2)
        weights=np.zeros((len(vs),18));weights[:,leg]=1;objs.append(make_mesh('boot-upper',vs,fs,uvs,weights,atlas_region='boots'))
        objs.append(ellipsoid('boot-sole',[s*.10,.026,.075],[.05,.012,.151],leg,'boots',12,4))
        for x in [-.029,.029]:
            for z in [-.035,.075,.17]:objs.append(ellipsoid('moulded-stud',[s*.10+x,.011,z],[.009,.009,.009],leg,'boots',6,3))
        for z in [.018,.039,.060,.081]:
            # Off-white flat laces from the gloves swatch; no logos or trade dress.
            objs.append(ellipsoid('lace',[s*.10,.098-z*.19,z],[.026,.0018,.002],leg,'gloves',8,3))
    # Eyeballs sit behind the actual MakeHuman eyelid rims.
    dv,_,_,_=deform(src)
    surface=FaceSurface(np.array([v.co[:] for v in face_obj.data.vertices]),[list(p.vertices) for p in face_obj.data.polygons]) if face_obj is not None else FaceSurface(dv,[f for f,t in GROUPS['body']])
    for side in ['l','r']:
        c=dv[ids('joint-'+side+'-eye')].mean(0)
        # Keep eyeballs behind the anatomical lid rims, with the iris visible.
        eye_c=c+np.array([0,-.0015,.0018])
        upper,lower,iris_shift=surface.lid_outline(eye_c)
        if os.environ.get('SOCCER_CHARACTER_EYE_VARIANT','16')=='19':
            from character_eye19 import build_eye19
            eye=build_eye19(surface,eye_c,rectuv,segments=48,lod='near',head_joint=5)
            upper=eye.get('upper',upper);lower=eye.get('lower',lower)
            for feature,surface_name in [('opaque','Eyes'),('cornea','EyesCornea')]:
                geometry=eye[feature]
                ew=np.zeros((len(geometry['vertices']),18));ew[:,5]=1
                globe=make_mesh('eye-'+feature+'-'+side,geometry['vertices'],geometry['faces'],geometry['face_uvs'],ew,atlas_region='eyes')
                globe['surface']=surface_name;globe['eyeVariant']='19'
                globe['eyeAlignment']=json.dumps(eye.get('alignment',{}),separators=(',',':'))
                center=geometry.get('sphere_center',eye.get('cornea_center'))
                if feature=='cornea' and center is not None:globe['corneaSphereCenter']=np.asarray(center).tolist()
                objs.append(globe)
        else:objs.append(ellipsoid('eye-'+side,eye_c,[.0140,.0122,.0140],5,'eyes',32,16,True,iris_shift))
        vs,fs,unituv=surface.upper_lid_margin(upper)
        ew=np.zeros((len(vs),18));ew[:,5]=1
        margin=make_mesh('eyelid-lash-margin-'+side,vs,fs,[[rectuv('brows',*uv) for uv in row] for row in unituv],ew,atlas_region='brows')
        margin['surface']='HairCards';objs.append(margin)
        brow_width=.037*(1+.055*math.sin(sum(map(ord,person['id']))))
        if os.environ.get('SOCCER_CHARACTER_FACE_VARIANT','24')=='27':
            from character_face27 import brow_volume
            vs,fs,unituv=brow_volume(surface,c,side,width=brow_width)
        else:vs,fs,unituv=surface.brow(c,side,points=22,width=brow_width)
        uvs=[[rectuv('brows',*uv) for uv in row] for row in unituv]
        ew=np.zeros((len(vs),18));ew[:,5]=1;objs.append(make_mesh('eyebrow-'+side,vs,fs,uvs,ew,atlas_region='brows'))
    if not person.get('legacyHairCards',False):
        from character_hair import groomed_crop
        dv=deform(src)[0]
        eye_center=(dv[ids('joint-l-eye')].mean(0)+dv[ids('joint-r-eye')].mean(0))*.5
        objs.extend(groomed_crop(person,dv,[f for f,t in GROUPS['body']],eye_center,make_mesh,rectuv))
    else:
        foundation=fitted_hair(person,src,joints);objs.append(foundation)
        objs.append(layered_hair_wisps(person,foundation,src))
    return objs

def simplify(obj,tri_target):
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    tri=sum(len(p.vertices)-2 for p in obj.data.polygons)
    if tri>tri_target:
        mod=obj.modifiers.new('budgeted surface simplification','DECIMATE');mod.ratio=tri_target/tri;mod.use_collapse_triangulate=True
        if obj.get('coherentFarCap'):mod.delimit={'UV'}
        bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=obj.modifiers.new('explicit triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons:poly.use_smooth=True
    obj.data.update()
    obj.select_set(False)

def collect(objects):
    verts=[];normals=[];uv=[];joints=[];weights=[];indices=[];lookup={};ranges=[]
    card_normal_field=None
    if os.environ.get('SOCCER_CHARACTER_HAIR_NORMAL_FIELD','base')=='projected':
        from character_normal_field import HairNormalField
        cap=next((o for o in objects if o.name.startswith('hair-scalp')),None)
        if cap is None:raise RuntimeError('Projected hair normals require a filled undercoat')
        card_normal_field=HairNormalField(cap)
    checks={'faceCoreTriangles':0,'faceCoreMappedTriangles':0,'shirtCoreTriangles':0,'explicitRegionObjects':sum(bool(o.get('atlasRegion') or o.get('atlasClass')) for o in objects)}
    eye_alignment=[json.loads(o['eyeAlignment']) for o in objects if o.get('surface')=='Eyes' and o.get('eyeAlignment')]
    if eye_alignment:checks['eye19Alignment']=eye_alignment
    refined_faces=[o for o in objects if o.get('subdivisionCurvatureVariant') in ('25','27')]
    if refined_faces:
        checks['faceCurvatureRefinement']=[{'variant':str(o['subdivisionCurvatureVariant']),'method':'Catmull-Clark level1 before triangulation and feature fitting','protectedBoundaryEdges':int(o['protectedBoundaryEdges']),'controlTriangles':int(o.get('faceControlTriangles',0)),'refinedBeforeQEMTriangles':int(o.get('faceRefinedTriangles',0)),'finalTriangles':sum(len(p.vertices)-2 for p in o.data.polygons),'anatomicalCheekCurvature':json.loads(o['anatomicalCurvature']) if o.get('anatomicalCurvature') else None} for o in refined_faces]
    hair_postprocess=[json.loads(o['hair28Diagnostics']) for o in objects if o.get('hair28Diagnostics')]
    if hair_postprocess:checks['hairGeometryPostprocess']=hair_postprocess
    hair_shapes=[json.loads(o['hairShape31Diagnostics']) for o in objects if o.get('hairShape31Diagnostics')]
    if hair_shapes:checks['hairMacroShape']=hair_shapes
    far_caps=[json.loads(o['coherentFarCapEvidence']) for o in objects if o.get('coherentFarCapEvidence')]
    if far_caps:checks['coherentFarCap']=far_caps
    cloth_finishing=[json.loads(o['clothFinishing']) for o in objects if o.get('clothFinishing')]
    if cloth_finishing:checks['clothFinishing']=cloth_finishing
    sock_fits=[json.loads(o['anatomicalSockFit']) for o in objects if o.get('anatomicalSockFit')]
    if sock_fits:checks['anatomicalSockFit']=sock_fits
    if checks['explicitRegionObjects']!=len(objects):raise AssertionError('Missing copy-stable atlas metadata')
    surfaces=['Skin','Cloth','Eyes','HairCards']+(['EyesCornea'] if any(o.get('surface')=='EyesCornea' for o in objects) else [])
    for surface in surfaces:
      start=len(indices)
      for obj in [o for o in objects if o.get('surface','Cloth')==surface]:
          name=obj.name.rsplit('.',1)[0] if obj.name.rsplit('.',1)[-1].isdigit() else obj.name
          mesh=obj.data
          undercoat_normals={}
          if surface=='HairCards' and name.startswith('hair-scalp'):
              # Source cap polygons duplicate their UV-edge vertices. Average
              # coincident positions so displaced locks get true smooth volume
              # normals, rather than either per-polygon facets or the old
              # perfect-ellipsoid normal that hid all clump volume.
              sums={}
              for face in mesh.polygons:
                  area_normal=np.array(face.normal[:])*face.area
                  for index in face.vertices:
                      key=tuple(round(float(x),6) for x in mesh.vertices[index].co)
                      sums[key]=sums.get(key,np.zeros(3))+area_normal
              for vertex in mesh.vertices:
                  key=tuple(round(float(x),6) for x in vertex.co)
                  if key not in sums:continue  # QEM may leave unused vertices.
                  n=sums[key]
                  if np.linalg.norm(n)<1e-8:n=np.array(vertex.co[:])-np.array(obj.get('hairCenter',[0,1.65,.012]))
                  undercoat_normals[vertex.index]=(n/max(float(np.linalg.norm(n)),1e-8)).tolist()
          for poly in mesh.polygons:
              avg=np.mean([mesh.uv_layers.active.data[li].uv[:] for li in poly.loop_indices],0)
              region=obj.get('atlasRegion','');part=obj.get('atlasClass','')
              if not region and part=='face':region='face' if avg[1]>.36 else 'skin'
              if not region and part=='body':region='gloves' if avg[1]>.285 else 'skin'
              if not region:
                  if name.startswith('hair-source'):region='hair'
                  elif name.startswith('hair-scalp'):region='hair'
                  elif name.startswith('hair-'):region='wisps'
                  elif name.startswith('eyebrow'):region='brows'
                  elif name.startswith('eye-'):region='eyes'
                  elif name.startswith('jersey-protected'):region='stitch'
                  elif name.endswith('-jersey-cloth'):region='shirt'
                  elif name.endswith('-cloth'):region='shorts'
                  elif name.startswith('sock-'):region='socks'
                  elif name.startswith('lace'):region='gloves'
                  elif surface=='Cloth':region='boots'
                  elif name.endswith('-face'):region='face' if avg[1]>.36 else 'skin'
                  elif name.endswith('-body') and avg[1]>.285:region='gloves'
                  else:region='skin'
              physical=np.mean([mesh.vertices[i].co[:] for i in poly.vertices],0)
              x,y,z=physical
              face_core=part=='face' and z>.035 and abs(x)<.04 and 1.635<y<1.665 and float(poly.normal.z)>.4
              shirt_core=part=='shirt' and abs(x)<.10 and 1.0<y<1.32 and z>.075
              if face_core:
                  checks['faceCoreTriangles']+=1
                  checks['faceCoreMappedTriangles']+=int(region=='face')
              if shirt_core:
                  if region!='shirt':raise AssertionError('Physical shirt core mapped outside fabric atlas')
                  checks['shirtCoreTriangles']+=1
              bounds=list(RECT[region]);inset=.5/1024
              if region=='wisps':
                  # Each disconnected ribbon samples one of eight alpha tiles.
                  tile=int(np.clip(math.floor((avg[0]-bounds[0])/(bounds[2]-bounds[0])*8),0,7))
                  step=(bounds[2]-bounds[0])/8
                  bounds[2]=bounds[0]+step*(tile+1);bounds[0]+=step*tile
              for li in poly.loop_indices:
                  loop=mesh.loops[li];vertex=mesh.vertices[loop.vertex_index]
                  raw=mesh.uv_layers.active.data[li].uv[:]
                  tex=(float(np.clip(raw[0],bounds[0]+inset,bounds[2]-inset)),float(np.clip(raw[1],bounds[1]+inset,bounds[3]-inset)))
                  ws=sorted([(g.group,g.weight) for g in vertex.groups],key=lambda x:-x[1])[:4]
                  total=sum(w for j,w in ws) or 1
                  jj=[j for j,w in ws]+[0]*(4-len(ws));ww=[w/total for j,w in ws]+[0]*(4-len(ws))
                  # glTF texture coordinates have top-left image origin; Blender UVs have bottom-left.
                  tex=(tex[0],1-tex[1])
                  n=vertex.normal[:];p=vertex.co[:]
                  if undercoat_normals:
                      n=undercoat_normals[vertex.index]
                  elif card_normal_field is not None and surface=='HairCards' and name.startswith('hair-'):
                      n=card_normal_field.sample(p)
                      if os.environ.get('SOCCER_CHARACTER_HAIR_VARIANT','24')=='29' and name.startswith('hair-groom-clumps'):
                          projected=np.asarray(n,dtype=float);own=np.asarray(vertex.normal[:],dtype=float)
                          if np.dot(own,projected)<0:own=-own
                          mixed=projected*(1-CROWN_OWN_NORMAL)+own*CROWN_OWN_NORMAL
                          n=(mixed/max(float(np.linalg.norm(mixed)),1e-9)).tolist()
                  elif surface=='HairCards' and name.startswith('hair-'):
                      center=np.array(obj.get('hairCenter',[0,1.65,.012]))
                      radial=(np.array(p)-center)/np.array([.100,.125,.108])**2
                      n=(radial/max(np.linalg.norm(radial),1e-8)).tolist()
                  elif surface=='EyesCornea' and obj.get('corneaSphereCenter') is not None:
                      radial=np.asarray(p)-np.asarray(obj['corneaSphereCenter'])
                      n=(radial/max(float(np.linalg.norm(radial)),1e-8)).tolist()
                  key=tuple(round(x,6) for x in (*p,*n,*tex,*jj,*ww))
                  if key not in lookup:
                      lookup[key]=len(verts);verts.append(p);normals.append(n);uv.append(tex);joints.append(jj);weights.append(ww)
                  indices.append(lookup[key])
      if len(indices)>start:ranges.append({'surface':surface,'start':start,'count':len(indices)-start})
    if checks['faceCoreTriangles']==0 or checks['shirtCoreTriangles']==0:
        raise AssertionError('Missing physical face/shirt UV core coverage')
    checks['faceCoreCoverage']=checks['faceCoreMappedTriangles']/checks['faceCoreTriangles']
    if checks['faceCoreCoverage']<.5:raise AssertionError('Front forehead core outside intended facial atlas')
    return {'generationChecks':checks,'POSITION':np.array(verts,np.float32),'NORMAL':np.array(normals,np.float32),'TEXCOORD_0':np.array(uv,np.float32),'JOINTS_0':np.array(joints,np.uint16),'WEIGHTS_0':np.array(weights,np.float32),'indices':np.array(indices,np.uint16 if len(verts)<65536 else np.uint32),'ranges':ranges}

def export_glb(path,mesh,textures,person,lod,kit):
    blob=bytearray();views=[];accessors=[]
    def data(buf,target=None):
        while len(blob)%4:blob.append(0)
        start=len(blob);blob.extend(buf);view={'buffer':0,'byteOffset':start,'byteLength':len(buf)}
        if target:view['target']=target
        views.append(view);return len(views)-1
    attrs={}
    for name,arr in mesh.items():
        if name in ['ranges','generationChecks']:continue
        vt=data(arr.tobytes(),34963 if name=='indices' else 34962)
        typ='SCALAR' if arr.ndim==1 else 'VEC'+str(arr.shape[1]);comp={np.dtype('float32'):5126,np.dtype('uint16'):5123,np.dtype('uint32'):5125}[arr.dtype]
        acc={'bufferView':vt,'componentType':comp,'count':len(arr),'type':typ}
        if name=='POSITION':acc.update(min=arr.min(0).tolist(),max=arr.max(0).tolist())
        accessors.append(acc);attrs[name]=len(accessors)-1
    inv=[]
    for p in WORLD:
        m=np.eye(4,dtype=np.float32);m[:3,3]=-p;inv.append(m.T.flatten())
    iv=data(np.array(inv,np.float32).tobytes());accessors.append({'bufferView':iv,'componentType':5126,'count':18,'type':'MAT4'});ibm=len(accessors)-1
    images=[]
    for k in ['basecolor','normal','orm']:
        image_path=OUT/textures[k];b=image_path.read_bytes()
        images.append({'bufferView':data(b),'mimeType':'image/webp' if image_path.suffix=='.webp' else 'image/png','name':person['id']+'-'+k})
    nodes=[]
    for i,n in enumerate(NAMES):
        node={'name':n,'translation':LOCAL[i].tolist(),'rotation':[0,0,0,1]}
        children=[j for j,p in enumerate(PARENTS) if p==i]
        if children:node['children']=children
        nodes.append(node)
    nodes.append({'name':person['id']+'-'+kit+'-'+lod,'mesh':0,'skin':0,'extras':{'role':person['role'],'lod':lod,'identity':person['id'],'fictional':True}})
    attributes={k:a for k,a in attrs.items() if k!='indices'}
    materials=[]
    surfaces=['Skin','Cloth','Eyes','HairCards']+(['EyesCornea'] if any(r['surface']=='EyesCornea' for r in mesh['ranges']) else [])
    for surface in surfaces:
        m={'name':surface,'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicRoughnessTexture':{'index':2},'metallicFactor':0,'roughnessFactor':1},'normalTexture':{'index':1,'scale':.30 if surface=='Eyes' else .80 if surface=='Cloth' and os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15') in ('17','18') else .50},'occlusionTexture':{'index':2,'strength':.12},'doubleSided':surface=='HairCards','alphaMode':'MASK' if surface=='HairCards' else 'OPAQUE'}
        if surface=='HairCards':
            m['alphaCutoff']=.25
            m['extensions']={'KHR_materials_specular':{'specularFactor':.18 if person['hair']=='coils' else .26}}
            if os.environ.get('SOCCER_CHARACTER_HAIR_TEXTURE_VARIANT','16')=='20':m['normalTexture']['scale']=1.0
            hair_side=os.environ.get('SOCCER_CHARACTER_HAIR_SIDEDNESS','double')
            if hair_side=='front' or (hair_side=='front-straight' and person['hair']!='coils'):m['doubleSided']=False
        if surface=='Eyes':
            m.pop('occlusionTexture',None)
            m['extensions']={'KHR_materials_clearcoat':{'clearcoatFactor':1,'clearcoatRoughnessFactor':.055,'clearcoatTexture':{'index':2}},'KHR_materials_specular':{'specularFactor':.65}}
            if 'EyesCornea' in surfaces:m['extensions']={'KHR_materials_specular':{'specularFactor':.28}}
        if surface=='EyesCornea':
            m={'name':surface,'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicRoughnessTexture':{'index':2},'metallicFactor':0,'roughnessFactor':1},'normalTexture':{'index':1,'scale':.30},'alphaMode':'OPAQUE','doubleSided':False,'extensions':{'KHR_materials_clearcoat':{'clearcoatFactor':1,'clearcoatRoughnessFactor':.055,'clearcoatTexture':{'index':2}},'KHR_materials_specular':{'specularFactor':.65},'KHR_materials_ior':{'ior':1.376}},'extras':{'fictional':True,'physicalLayer':'opaque atlas-colored convex eye lens with physical clearcoat','castShadow':False,'depthWrite':True,'transmission':False,'portableOptics':True,'approximation':'The curved atlas-colored lens occludes the recessed iris. Visible depth comes from the anatomical socket, lids and lens curvature, without a transmission framebuffer or runtime blend adapter.'}}
        if surface in ('Eyes','EyesCornea') and EYE_COLOR_FACTOR!=1:
            m['pbrMetallicRoughness']['baseColorFactor']=[EYE_COLOR_FACTOR,EYE_COLOR_FACTOR,EYE_COLOR_FACTOR,1]
        materials.append(m)
    primitives=[]
    ia=accessors[attrs['indices']]
    for r in mesh['ranges']:
        accessors.append({'bufferView':ia['bufferView'],'byteOffset':r['start']*mesh['indices'].dtype.itemsize,'componentType':ia['componentType'],'count':r['count'],'type':'SCALAR'})
        primitives.append({'attributes':attributes,'indices':len(accessors)-1,'material':surfaces.index(r['surface']),'mode':4})
    doc={'asset':{'version':'2.0','generator':'soccer-v7 canonical anatomical athlete library'},'scene':0,'scenes':[{'nodes':[0,18]}],'nodes':nodes,'skins':[{'name':'canonical-18-identity-bind','joints':list(range(18)),'skeleton':0,'inverseBindMatrices':ibm}],'meshes':[{'name':person['id']+'-'+lod,'primitives':primitives}],'materials':materials,'extensionsUsed':['KHR_materials_clearcoat'],'textures':[{'source':i,'sampler':0} for i in range(3)],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],'images':images,'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(blob)}],'extras':{'license':'CC0-1.0','realPerson':False,'canonicalSkeleton':'../../motion2/soccer.json','triangles':len(mesh['indices'])//3,'textureMaxDimension':1024,'uvCoreAssertions':mesh['generationChecks']}}
    if str(textures['basecolor']).endswith('.webp'):
        doc['textures'][0]={'sampler':0,'extensions':{'EXT_texture_webp':{'source':0}}}
        doc['extensionsUsed'].append('EXT_texture_webp');doc['extensionsRequired']=['EXT_texture_webp']
    doc['extensionsUsed'].append('KHR_materials_specular')
    if 'EyesCornea' in surfaces:doc['extensionsUsed'].append('KHR_materials_ior')
    js=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*((-len(js))%4);blob+=b'\0'*((-len(blob))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob)

def main():
    characters=[]
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    selected=PEOPLE if not args else [p for p in PEOPLE if p['id'] in args]
    for person in selected:
        bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
        body,src,joints=body_parts(person)
        shorts=next(o for o in body if o.get('atlasRegion')=='shorts')
        face_obj=next(o for o in body if o.get('atlasClass')=='face')
        bpy.context.view_layer.objects.active=face_obj
        if os.environ.get('SOCCER_CHARACTER_FACE_VARIANT','24') in ('25','27'):
            # hm08 is a subdivision control cage. Refine its quad curvature
            # before triangulation, eye fitting or the final explicit budgets.
            # Open eyelid/mouth/neck boundaries keep their attachment points.
            edge_uses={}
            for poly in face_obj.data.polygons:
                for a,b in zip(poly.vertices,list(poly.vertices[1:])+[poly.vertices[0]]):
                    edge=tuple(sorted((int(a),int(b))));edge_uses[edge]=edge_uses.get(edge,0)+1
            crease=face_obj.data.attributes.get('crease_edge') or face_obj.data.attributes.new('crease_edge','FLOAT','EDGE')
            face_variant=os.environ.get('SOCCER_CHARACTER_FACE_VARIANT','24')
            eye_centres=None
            if face_variant=='27':
                from character_face27 import cheek_curvature,boundary_crease
                anatomy=deform(src)[0];eye_centres=[anatomy[ids('joint-'+side+'-eye')].mean(0) for side in ('l','r')]
                face_obj['anatomicalCurvature']=json.dumps(cheek_curvature(face_obj,eye_centres),separators=(',',':'))
            protected=0
            for edge in face_obj.data.edges:
                boundary=edge_uses.get(tuple(sorted(edge.vertices)),0)==1
                midpoint=np.mean([face_obj.data.vertices[i].co[:] for i in edge.vertices],0)
                crease.data[edge.index].value=(boundary_crease(midpoint,eye_centres) if face_variant=='27' else 1.0) if boundary else 0.0
                protected+=int(boundary)
            before_tri=sum(len(p.vertices)-2 for p in face_obj.data.polygons)
            refine=face_obj.modifiers.new('anatomical control cage curvature 25','SUBSURF');refine.subdivision_type='CATMULL_CLARK';refine.levels=1;refine.render_levels=1;refine.boundary_smooth='PRESERVE_CORNERS';refine.uv_smooth='PRESERVE_BOUNDARIES'
            bpy.ops.object.modifier_apply(modifier=refine.name)
            face_obj['subdivisionCurvatureVariant']=face_variant;face_obj['protectedBoundaryEdges']=protected
            face_obj['faceControlTriangles']=before_tri;face_obj['faceRefinedTriangles']=sum(len(p.vertices)-2 for p in face_obj.data.polygons)
            print('FACE25',person['id'],'controlTriangles',before_tri,'refinedTriangles',sum(len(p.vertices)-2 for p in face_obj.data.polygons),'protectedEdges',protected,flush=True)
        face_tri=face_obj.modifiers.new('exact facial projection triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=face_tri.name)
        shirt=fitted_shirt(person,src,joints,shorts);body.append(shirt)
        if os.environ.get('SOCCER_CHARACTER_CLOTH_FINISHING','0')=='31':
            from character_cloth_finish import finish_jersey
            visible_vertices=[];visible_faces=[]
            for skin_object in [o for o in body if o.get('surface')=='Skin' and not o.name.endswith('-underlay')]:
                start=len(visible_vertices);visible_vertices.extend([v.co[:] for v in skin_object.data.vertices])
                visible_faces.extend([[start+i for i in f.vertices] for f in skin_object.data.polygons])
            shirt['clothFinishing']=json.dumps(finish_jersey(shirt,deform(src)[0],[f for f,t in GROUPS['body']],visible_skin_vertices=np.asarray(visible_vertices),visible_skin_faces=visible_faces),separators=(',',':'))
        if os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15') in ('17','18'):
            from character_cloth17 import enhance_jersey
            body.extend(enhance_jersey(person,shirt,make_mesh,rectuv))
        from character_seams import jersey_seams
        seams=jersey_seams(person,shirt,make_mesh,rectuv)
        if seams is not None:body.append(seams)
        other=extras(person,src,joints,face_obj)
        if os.environ.get('SOCCER_CHARACTER_HAIR_VARIANT','24')=='28':
            from character_hair28 import refine_card_groom
            diagnostics=refine_card_groom(person,other)
            next(o for o in other if o.name.startswith('hair-scalp'))['hair28Diagnostics']=json.dumps(diagnostics,separators=(',',':'))
        elif os.environ.get('SOCCER_CHARACTER_HAIR_VARIANT','24')=='29':
            from character_hair29 import refine_crown29
            diagnostics=refine_crown29(person,other)
            next(o for o in other if o.name.startswith('hair-scalp'))['hair28Diagnostics']=json.dumps(diagnostics,separators=(',',':'))
        if os.environ.get('SOCCER_CHARACTER_CROWN_FLYAWAYS','0')=='1':
            from character_hair31 import add_crown_wisps
            wisp,diagnostics=add_crown_wisps(person,other,make_mesh,rectuv)
            if wisp is not None:
                wisp['crownFlyawayLayer']=True;wisp['hair31Diagnostics']=json.dumps(diagnostics,separators=(',',':'));other.append(wisp)
        if os.environ.get('SOCCER_CHARACTER_HAIR_MACRO_SHAPE','0')=='31' and person['id'] in HAIR_MACRO_IDS:
            from character_hair_shape31 import shape_groom
            diagnostics=shape_groom(person,other)
            next(o for o in other if o.name.startswith('hair-scalp'))['hairShape31Diagnostics']=json.dumps(diagnostics,separators=(',',':'))
        original=body+other
        record={k:person[k] for k in ['id','label','role']};record['fictional']=True;record['design']={k:person[k] for k in ['head','heritage','hair','eye']};record['source']='MakeHuman Community hm08 CC0';record['kits']=[]
        kitids=[('kit-a' if int(person['id'][-2:])<=3 else 'kit-b')] if person['role']=='field' else ['keeper' if person['role']=='goalkeeper' else 'referee']
        meshes={}
        for lod,budgets in [('lod0',{'face':14000,'body':1350,'cloth':2400,'other':2400}),('lod1',{'face':1050,'body':380,'cloth':780,'other':700})]:
            clones=[]
            for obj in original:
                if lod=='lod1' and obj.get('crownFlyawayLayer'):continue
                c=obj.copy();c.data=obj.data.copy();bpy.context.collection.objects.link(c);clones.append(c)
                far_cap_reference=None
                if lod=='lod1' and obj.name.startswith('hair-scalp') and os.environ.get('SOCCER_CHARACTER_FAR_CAP','24')=='32':
                    from character_farcap32 import prepare_far_cap,finish_far_cap
                    far_cap_reference=prepare_far_cap(c)
                part='face' if obj.name.endswith('-face') else 'body' if obj.name.endswith('-body') or obj.name.endswith('-underlay') else 'cloth' if obj.name.endswith('-cloth') else 'other'
                target=budgets[part]
                if part=='face' and lod=='lod0' and os.environ.get('SOCCER_CHARACTER_FACE_VARIANT','24') in ('25','27'):
                    target=11000 if person['hair']=='coils' else 14000
                if part=='body' and person['role']=='goalkeeper':target=2900 if lod=='lod0' else 600
                if obj.name.endswith('-underlay'):target=650 if lod=='lod0' else 240
                if part=='other':
                    # Preserve focal features independently; hair never consumes the eye budget.
                    near=lod=='lod0'
                    if obj.name.startswith('jersey-protected'):target=700 if near else 200
                    elif obj.name.startswith(('jersey-binding17','jersey-binding18')):target=int(obj.get('recommendedNearTriangles',1200)) if near else int(obj.get('recommendedFarTriangles',100))
                    elif obj.name.startswith('jersey-hem-backing'):target=256 if near else 96
                    elif obj.name.startswith('eye-cornea'):target=900 if near else 48
                    elif obj.name.startswith('eye-'):target=1400 if near and os.environ.get('SOCCER_CHARACTER_EYE_VARIANT','16')=='19' else 1100 if near else 72 if os.environ.get('SOCCER_CHARACTER_EYE_VARIANT','16')=='19' else 96
                    elif obj.name.startswith('eyebrow'):target=98 if not near and os.environ.get('SOCCER_CHARACTER_FACE_VARIANT','24')=='27' else 100
                    elif obj.name.startswith('eyelid-lash'):target=100
                    elif obj.name.startswith('crew-neck'):target=384 if near else 96
                    elif obj.name.startswith('hair-scalp'):target=850 if near else 260
                    elif obj.name.startswith('hair-groom-coils'):target=7300 if near else 400 if os.environ.get('SOCCER_CHARACTER_EYE_VARIANT','16')=='19' else 450
                    elif obj.name.startswith('hair-groom'):target=5000 if near else 400
                    elif obj.name.startswith('hair-fine'):target=3600 if near else 100 if os.environ.get('SOCCER_CHARACTER_EYE_VARIANT','16')=='19' else 120
                    elif obj.name.startswith('hair-'):target=1800 if near else 450
                    elif obj.name.startswith('boot-upper'):target=168 if near else 72
                    elif obj.name.startswith('boot-sole'):target=84 if near else 32
                    elif obj.name.startswith('sock-'):target=400 if near and os.environ.get('SOCCER_CHARACTER_SOCK_VARIANT','15') in ('21','23') else 336 if near else 144
                    elif obj.name.startswith('moulded-stud'):target=18 if near else 6
                    elif obj.name.startswith('lace'):target=20 if near else 6
                    else:target=80 if near else 20
                    if obj.get('crownFlyawayLayer') and not near:target=0
                if part=='cloth':
                    if os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15')=='18':target=2800 if lod=='lod0' else 820 if os.environ.get('SOCCER_CHARACTER_EYE_VARIANT','16')=='19' else 900
                    uses={}
                    for face in c.data.polygons:
                        p=list(face.vertices)
                        for a,b in zip(p,p[1:]+p[:1]):
                            edge=tuple(sorted((a,b)));uses[edge]=uses.get(edge,0)+1
                    border={v for edge,count in uses.items() if count==1 for v in edge}
                    fabric=c.vertex_groups.new(name='_fabric_relax')
                    inside=[v.index for v in c.data.vertices if v.index not in border]
                    if inside:fabric.add(inside,1,'REPLACE')
                    smooth=c.modifiers.new('relaxed sports fabric surface','SMOOTH');smooth.factor=.08 if os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15')=='18' else .18;smooth.iterations=1 if os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15')=='18' else 2
                    smooth.vertex_group=fabric.name
                    bpy.context.view_layer.objects.active=c;bpy.ops.object.modifier_apply(modifier=smooth.name)
                    fabric_group=c.vertex_groups.get('_fabric_relax')
                    if fabric_group:c.vertex_groups.remove(fabric_group)
                simplify(c,target)
                if far_cap_reference is not None:c['coherentFarCapEvidence']=json.dumps(finish_far_cap(c,far_cap_reference,RECT['hair']),separators=(',',':'))
            from character_seams import ensure_hem_clearance
            hem_checks=ensure_hem_clearance(next(o for o in clones if o.get('atlasClass')=='shirt'),next(o for o in clones if o.get('atlasRegion')=='shorts'))
            if os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15') in ('17','18'):
                for binding in [o for o in clones if o.get('bindingKind')=='hem']:
                    check=ensure_hem_clearance(binding,next(o for o in clones if o.get('atlasRegion')=='shorts'))
                    hem_checks['bindingHemMinimumRadialClearanceMeters']=check['hemMinimumRadialClearanceMeters']
                    hem_checks['bindingHemEnclosureSamples']=check['hemEnclosureSamples']
            meshes[lod]=collect(clones);meshes[lod]['generationChecks'].update(hem_checks)
            for o in clones:bpy.data.objects.remove(o,do_unlink=True)
        for kit in kitids:
            textures=atlas(person,kit);k={'id':kit,'color':'#%02x%02x%02x'%KITS[kit][0],'textures':textures}
            for lod in ['lod0','lod1']:
                stem=person['id']+'-'+lod
                path=ASSETS/(stem+'.glb');export_glb(path,meshes[lod],textures,person,lod,kit)
                k[lod]=str(path.relative_to(OUT));k[lod+'Triangles']=len(meshes[lod]['indices'])//3;k[lod+'BytesBeforeDraco']=path.stat().st_size;k[lod+'GenerationChecks']=meshes[lod]['generationChecks']
            record['kits'].append(k)
        characters.append(record)
        print('BUILT',person['id'],[(lod,len(m['indices'])//3,len(m['POSITION'])) for lod,m in meshes.items()],flush=True)
    partial=OUT/('asset-manifest-'+selected[0]['id']+'.json') if len(selected)!=len(PEOPLE) else OUT/'asset-manifest.json'
    partial.write_text(json.dumps({'schemaVersion':1,'kind':'soccer-human-character-library','skeleton':'rig.json','license':'CC0-1.0','characters':characters,'authoring':{'skinInputs':skin_source_info(),'faceSourceUvCrop':list(FACE_CROP),'runtimeAtlasDimensions':[1024,1024],'atlasRegions':RECT,'hair':'anatomical scalp undercoat with authored curved alpha cards','synthetic':True,'generator':'source/character_build.py','restExpression':{'mouthCompression':MOUTH_COMPRESSION,'eyeSlit':.060,'eyeClosureExtra':EYE_CLOSURE_EXTRA,'eyeColorFactor':EYE_COLOR_FACTOR},'hairShading':'isotropic','crownOwnNormalBlend':CROWN_OWN_NORMAL,'hairMacroShape':os.environ.get('SOCCER_CHARACTER_HAIR_MACRO_SHAPE','0'),'hairMacroIds':HAIR_MACRO_IDS,'farCap':os.environ.get('SOCCER_CHARACTER_FAR_CAP','24'),'clothFinishing':os.environ.get('SOCCER_CHARACTER_CLOTH_FINISHING','0'),'crownFlyaways':os.environ.get('SOCCER_CHARACTER_CROWN_FLYAWAYS','0'),'hairGeometryVariant':os.environ.get('SOCCER_CHARACTER_HAIR_VARIANT','24'),'faceVariant':os.environ.get('SOCCER_CHARACTER_FACE_VARIANT','24'),'hairNormalField':os.environ.get('SOCCER_CHARACTER_HAIR_NORMAL_FIELD','base'),'eyeVariant':os.environ.get('SOCCER_CHARACTER_EYE_VARIANT','16'),'hairTextureVariant':os.environ.get('SOCCER_CHARACTER_HAIR_TEXTURE_VARIANT','16'),'sockVariant':os.environ.get('SOCCER_CHARACTER_SOCK_VARIANT','15'),'clothVariant':os.environ.get('SOCCER_CHARACTER_CLOTH_VARIANT','15')},'budgets':{'lod0Triangles':36000 if os.environ.get('SOCCER_CHARACTER_FACE_VARIANT','24') in ('25','27') else 34000 if os.environ.get('SOCCER_CHARACTER_EYE_VARIANT','16')=='19' else 30000,'lod1Triangles':6000,'textureMaxDimension':1024,'maxGlbBytes':1500000}},ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main()
