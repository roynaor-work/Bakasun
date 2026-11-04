#!/usr/bin/env python3
"""Build CC0 MakeHuman-derived, canonical-rig soccer characters.

Run with Blender 4.3+: blender -b --factory-startup --python source/build-characters.py
Source anatomy and shape deltas are unmodified CC0 data, not MakeHuman program code.
This builder authors clothing, UVs, PBR atlases and an exact identity-bind 18-joint skin.
"""
from pathlib import Path
import bpy, numpy as np, json, math, struct, hashlib, sys, shutil
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFilter

HERE=Path(__file__).resolve().parent
OUT=HERE.parent
SRC=HERE/'makehuman'
ASSETS=OUT/'assets'; TEX=OUT/'textures'
ASSETS.mkdir(exist_ok=True); TEX.mkdir(exist_ok=True)

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
 dict(id='goalkeeper',label='שוער',role='goalkeeper',skin=(105,66,47),heritage=(.7,.06,.24),head='head-rectangular',hair='coils',hairColor=(20,16,13),eye=(44,31,23)),
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
def ids(group):return np.unique([v for f,t in GROUPS[group] for v in f])

def human_morph(person):
    v=BASE.copy()
    for factor,name in zip(person['heritage'],['african-male-young','asian-male-young','caucasian-male-young']):v+=TARGETS[name]*factor
    v+=TARGETS['universal-male-young-maxmuscle-minweight']*.76
    v+=TARGETS['universal-male-young-maxmuscle-averageweight']*.24
    v+=TARGETS[person['head']]*.27
    idx=int(person['id'][-2:]) if person['id'].startswith('player') else 2
    if idx%2:v+=TARGETS['nose-scale-depth-incr']*.13
    if idx in [2,5]:v+=TARGETS['mouth-scale-horiz-incr']*.20+TARGETS['nose-width1-incr']*.14
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
            if out[j,1]>1.20 and abs(out[j,0])<.15:
                chest=np.clip((.15-abs(out[j,0]))/.065,0,1)
                weights[j]*=1-chest;weights[j,3]+=chest
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
            head_blend=np.clip((y-neck)/.55,0,1)
            out[j,0]=x*(.087+.011*head_blend)
            out[j,1]=np.interp(y,[hip,4.57,neck,joint['jaw'][1],joint['l-eye'][1],top],[.86,1.24,1.40,1.49,1.62,1.74])
            center=np.interp(y,[hip,4.57,neck,top],[.1,-.05,.15,.47])
            out[j,2]=(z-center)*.095
            q=out[j,1]
            if q>1.445:weights[j,5]=1
            elif q>1.36:
                t=np.clip((q-1.36)/.085,0,1);weights[j,4]=1-t;weights[j,5]=t
            elif q>1.2:
                t=np.clip((q-1.2)/.16,0,1);weights[j,3]=1-t*.45;weights[j,4]=t*.45
            elif q>1.04:
                t=(q-1.04)/.16;weights[j,2]=1-t;weights[j,3]=t
            else:
                t=np.clip((q-.88)/.16,0,1);weights[j,1]=1-t;weights[j,2]=t
            regions.append('head' if q>1.40 else 'torso')
    return out,weights,regions,joint

# Atlas rectangles (UV lower-left coordinates). One UV set and three PBR maps per identity/kit.
RECT={'skin':(.015,.015,.485,.485),'shirt':(.51,.51,.99,.99),'shorts':(.51,.27,.99,.49),'socks':(.51,.13,.99,.25),'boots':(.51,.015,.99,.115),'hair':(.015,.51,.245,.99),'eyes':(.265,.52,.485,.72),'brows':(.265,.727,.485,.744),'gloves':(.265,.75,.485,.99)}
def rectuv(kind,u,v):
    a,b,c,d=RECT[kind];return (a+(c-a)*u,b+(d-b)*v)

def atlas(person,kit):
    key=person['id']+'-'+kit;shirt,shorts,socks=KITS[kit]
    image=Image.new('RGBA',(1024,1024),(70,68,65,255));normal=Image.new('RGB',(1024,1024),(128,128,255));rough=Image.new('RGB',(1024,1024),(255,180,0))
    rng=np.random.default_rng(700+len(key));
    def box(kind):
        a,b,c,d=RECT[kind];return tuple(map(int,(a*1024,(1-d)*1024,c*1024,(1-b)*1024)))
    for kind,color in [('skin',person['skin']),('shirt',shirt),('shorts',shorts),('socks',socks),('boots',(23,28,30)),('hair',person['hairColor']),('gloves',(225,230,220))]:
        B=box(kind);w=B[2]-B[0];h=B[3]-B[1];yy,xx=np.mgrid[:h,:w]
        col=np.zeros((h,w,4),np.uint8);col[...,:3]=color;col[...,3]=255
        if kind=='skin':
            # Real texture is used when provided; fallback retains restrained pigmentation.
            skinpath=SRC/('skin-dark-diffuse.png' if person['heritage'][0]>.5 else 'skin-diffuse.png')
            if skinpath.exists():
                im=Image.open(skinpath).convert('RGB').resize((w,h),Image.Resampling.LANCZOS)
                arr=np.asarray(im).astype(float)
                reference=np.array([109,75,58] if person['heritage'][0]>.5 else [226,176,145])
                col[...,:3]=np.clip(arr/reference*np.array(color),0,255)
                gray=arr.mean(2);dy,dx=np.gradient(gray)
                micro=np.zeros((h,w,3),np.uint8);micro[...,0]=np.clip(128-dx*.25,119,137);micro[...,1]=np.clip(128+dy*.25,119,137);micro[...,2]=255
                normal.paste(Image.fromarray(micro),B[:2])
            else:
                noise=np.asarray(Image.fromarray(rng.integers(90,167,(h//3+1,w//3+1),dtype=np.uint8)).resize((w,h)).filter(ImageFilter.GaussianBlur(1))).astype(float)
                col[...,:3]=np.clip(np.array(color)+(noise[...,None]-128)*.10,0,255)
        elif kind in ['shirt','shorts','socks']:
            weave=1.7*np.sin(xx*2.8)+1.5*np.cos(yy*2.8)
            folds=5*np.sin(xx*.035+2*np.sin(yy*.016))*np.sin(yy*.015)
            col[...,:3]=np.clip(np.array(color)+weave[...,None]+folds[...,None],0,255)
            n=np.zeros((h,w,3),np.uint8);n[...,0]=128+(np.sin(xx*2.8)*6).astype(np.int16);n[...,1]=128+(np.cos(yy*2.8)*6).astype(np.int16);n[...,2]=254
            normal.paste(Image.fromarray(n),B[:2]);rough.paste((255,212,0),B)
        elif kind=='hair':
            hairname=hair_style(person)
            hairpath=next((SRC/'hair'/hairname).glob('*diffuse.png'))
            arr=np.asarray(Image.open(hairpath).convert('RGBA').resize((w,h),Image.Resampling.LANCZOS)).astype(float)
            lum=arr[...,:3].mean(2,keepdims=True)
            col[...,:3]=np.clip(np.array(color)+(lum-80)*.13,0,255)
            col[...,3]=arr[...,3]
            rough.paste((255,170,0),B)
        elif kind=='boots':rough.paste((255,105,0),B)
        image.paste(Image.fromarray(col),B[:2])
    draw=ImageDraw.Draw(image)
    draw.rectangle(box('brows'),fill=person['hairColor']+(255,))
    # Apparel construction: twin-needle hems, collar binding, side seam, ventilated panel.
    for kind in ['shirt','shorts','socks']:
        x0,y0,x1,y1=box(kind);base=shirt if kind=='shirt' else shorts if kind=='shorts' else socks
        stitch=tuple(min(255,int(c*1.2+14)) for c in base)+(255,)
        for off in [4,8]:draw.line([(x0+3,y1-off),(x1-3,y1-off)],fill=stitch,width=1)
        for x in [x0+int((x1-x0)*.25),x0+int((x1-x0)*.75)]:
            draw.line([(x,y0+3),(x,y1-3)],fill=tuple(max(0,c-18) for c in base)+(255,),width=2)
            for y in range(y0+4,y1-4,5):draw.line([(x+3,y),(x+3,y+2)],fill=stitch,width=1)
    # Eye patch: sclera, iris annuli, dark pupil with small specular catchlight.
    x0,y0,x1,y1=box('eyes');draw.rectangle((x0,y0,x1,y1),fill=(204,197,181,255))
    cx=(x0+x1)//2;cy=(y0+y1)//2;r=int((y1-y0)*.22)
    draw.ellipse((cx-r,cy-r,cx+r,cy+r),fill=person['eye']+(255,),outline=(33,30,27,255),width=3)
    for rr in range(5,r,3):draw.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),outline=tuple(max(0,c-10) for c in person['eye'])+(255,))
    pr=int(r*.32);draw.ellipse((cx-pr,cy-pr,cx+pr,cy+pr),fill=(8,10,10,255))
    draw.ellipse((cx-r*.35,cy-r*.45,cx-r*.12,cy-r*.22),fill=(240,240,228,255))
    rough.paste((255,58,0),(x0,y0,x1,y1))
    image.save(TEX/(key+'-basecolor.png'),optimize=True)
    normal.save(TEX/(person['id']+'-normal.png'),optimize=True)
    rough.save(TEX/(person['id']+'-orm.png'),optimize=True)
    return {'basecolor':str((TEX/(key+'-basecolor.png')).relative_to(OUT)),**{k:str((TEX/(person['id']+'-'+k+'.png')).relative_to(OUT)) for k in ['normal','orm']}}

def make_mesh(name,verts,faces,faceuv,weights):
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    uv=mesh.uv_layers.new(name='AtlasUV')
    for poly,uvs in zip(mesh.polygons,faceuv):
        poly.use_smooth=True
        for li,tex in zip(poly.loop_indices,uvs):uv.data[li].uv=tex
    for k,n in enumerate(NAMES):
        group=obj.vertex_groups.new(name=n)
        for i,w in enumerate(weights[:,k]):
            if w>1e-6:group.add([i],float(w),'REPLACE')
    return obj

def body_parts(person):
    src=human_morph(person);v,w,reg,joints=deform(src)
    normals=np.zeros(v.shape)
    for f,t in GROUPS['body']:
        a,b,c=v[f[:3]];n=np.cross(b-a,c-a)
        for i in f:normals[i]+=n
    normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-12)
    parts={'face':([],[],[]),'body':([],[],[]),'cloth':([],[],[])}
    # Exclude the original feet and internal oral cavity; boots and eyeballs are purpose-built.
    for f,t in GROUPS['body']:
        p=v[f].mean(0);y=p[1];x=abs(p[0]);arm=sum(reg[i]=='arm' for i in f)>len(f)/2
        if y<.080 or (y<.135 and np.mean(w[f,14]+w[f,17])>.75):continue
        if y>1.44 or (y>1.395 and x<.055):kind='skin';part='face'
        elif arm:
            if y>1.135:kind='shirt';part='cloth'
            elif person['role']=='goalkeeper' and y<.81:kind='gloves';part='body'
            else:kind='skin';part='body'
        elif y>1.315 and x>=.055:kind='shirt';part='cloth'
        elif y>1.395:kind='skin';part='face'
        elif y>.86:kind='shirt';part='cloth'
        elif y>.625:kind='shorts';part='cloth'
        elif y>.445:kind='skin';part='body'
        else:kind='socks';part='cloth'
        # Solid, close-cropped roots beneath translucent hair cards prevent scalp gaps.
        if kind=='skin' and part=='face' and (y>1.675 or (p[2]<.0 and y>1.615) or (x>.070 and y>1.635)):
            kind='hairroot'
        coords=[];uvs=[]
        for i,ti in zip(f,t):
            q=v[i].copy()
            if kind in ['shirt','shorts','socks','gloves']:
                inflate={'shirt':.007,'shorts':.007,'socks':.007,'gloves':.006}[kind]
                q+=normals[i]*inflate
            coords.append((i,q))
            if kind=='skin':uvs.append(rectuv(kind,*BASEUV[ti]))
            elif kind=='hairroot':uvs.append(rectuv('brows',.5,.5))
            else:
                # Cylindrical and longitudinal garment UVs give legible fabric + seams.
                center=(.16 if q[0]>0 else -.16) if arm else ((.10 if q[0]>0 else -.10) if y<.86 else 0)
                u=(math.atan2(q[0]-center,q[2])/(2*math.pi)+.5)%1
                lo,hi={'shirt':(.86,1.36),'shorts':(.625,.86),'socks':(.115,.445),'gloves':(.60,.81)}[kind]
                vv=np.clip((q[1]-lo)/(hi-lo),0,1);uvs.append(rectuv(kind,u,vv))
        parts[part][0].append(coords);parts[part][1].append(uvs);parts[part][2].append(kind)
        # Continuous underlying neck/chest skin overlaps the crew-neck garment.
        # Separate material borders never reveal a hole during neck/shoulder deformation.
        if not arm and 1.315<y<1.40:
            parts['face'][0].append([(i,v[i].copy()) for i in f])
            parts['face'][1].append([rectuv('skin',*BASEUV[ti]) for ti in t])
            parts['face'][2].append('skin')
        if kind!='skin' and ((arm and 1.10<y<1.19) or (not arm and (.405<y<.49 or .59<y<.67))):
            parts['body'][0].append([(i,v[i].copy()) for i in f])
            parts['body'][1].append([rectuv('skin',*BASEUV[ti]) for ti in t])
            parts['body'][2].append('skin')
    objects=[]
    for part,(polys,uvs,kinds) in parts.items():
        used={};vv=[];ff=[];ww=[]
        for poly in polys:
            face=[]
            for original,q in poly:
                key=(original,tuple(np.round(q,7)))
                if key not in used:used[key]=len(vv);vv.append(q);ww.append(w[original])
                face.append(used[key])
            ff.append(face)
        objects.append(make_mesh(person['id']+'-'+part,vv,ff,uvs,np.array(ww)))
    return objects,src,joints

def ellipsoid(name,center,scale,joint,kind,segments=16,rings=9,eye=False):
    vs=[];fs=[];uvs=[]
    for j in range(rings+1):
        t=math.pi*j/rings
        for i in range(segments+1):
            a=2*math.pi*i/segments
            vs.append(np.array(center)+np.array(scale)*[math.sin(t)*math.sin(a),math.cos(t),math.sin(t)*math.cos(a)])
    for j in range(rings):
        for i in range(segments):
            f=[j*(segments+1)+i,j*(segments+1)+i+1,(j+1)*(segments+1)+i+1,(j+1)*(segments+1)+i];fs.append(f)
            if eye:
                # Project pupil onto the eye's forward hemisphere.
                uv=[]
                for k in f:
                    rel=(vs[k]-center)/scale
                    uv.append(rectuv(kind,.5+rel[0]*.44,.5+rel[1]*.44))
                uvs.append(uv)
            else:uvs.append([rectuv(kind,i/segments,j/rings),rectuv(kind,(i+1)/segments,j/rings),rectuv(kind,(i+1)/segments,(j+1)/rings),rectuv(kind,i/segments,(j+1)/rings)])
    w=np.zeros((len(vs),18));w[:,joint]=1
    return make_mesh(name,vs,fs,uvs,w)

def hair_style(person):
    return {'crop':'short04','coils':'afro01','sweep':'short02','quiff':'short03','buzz':'short01','waves':'short04','short':'short01'}[person['hair']]

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
    hair=vv.copy();hair[:,0]*=.098
    # Extrapolate upper scalp instead of clipping hair tips to the skin's top.
    yy=vv[:,1];hair[:,1]=np.interp(yy,[hip,4.57,neck,joints['jaw'][1],joints['l-eye'][1],top],[.86,1.24,1.40,1.49,1.62,1.74])
    hair[:,1]=np.where(yy>top,1.74+(yy-top)*.105,hair[:,1])
    center=np.interp(yy,[hip,4.57,neck,top],[.1,-.05,.15,.47]);hair[:,2]=(vv[:,2]-center)*.095
    if person['hair']=='waves':
        # Shorter textured crop with an asymmetric brushed crown.
        t=np.clip((hair[:,1]-1.65)/.10,0,1);hair[:,1]-=.018*t;hair[:,0]+=.007*t
    elif person['hair']=='quiff':
        t=np.clip((hair[:,1]-1.65)/.10,0,1);hair[:,1]+=.012*t;hair[:,2]+=.005*t
    elif person['hair']=='buzz':
        t=np.clip((hair[:,1]-1.65)/.10,0,1);hair[:,1]-=.014*t
    faces=[];uvs=[]
    for group in groups.values():
        for f,t in group:faces.append(f);uvs.append([rectuv('hair',*huv[ti]) for ti in t])
    w=np.zeros((len(hair),18));w[:,5]=1
    return make_mesh('hair-source-cards',hair,faces,uvs,w)

def extras(person,src,joints):
    objs=[]
    # A separately sewn crew-neck binding overlaps the garment's irregular cut edge.
    cv=[];cf=[];cu=[]
    for j in range(6):
        t=2*math.pi*j/6
        for i in range(32):
            a=2*math.pi*i/32
            cv.append([(.053+.0035*math.cos(t))*math.sin(a),1.395+.0035*math.sin(t),.006+(.044+.0035*math.cos(t))*math.cos(a)])
    for j in range(6):
        for i in range(32):
            cf.append([j*32+i,j*32+(i+1)%32,((j+1)%6)*32+(i+1)%32,((j+1)%6)*32+i]);cu.append([rectuv('shirt',i/32,.985),rectuv('shirt',(i+1)/32,.985),rectuv('shirt',(i+1)/32,.998),rectuv('shirt',i/32,.998)])
    cw=np.zeros((len(cv),18));cw[:,4]=1;objs.append(make_mesh('crew-neck-binding',cv,cf,cu,cw))
    for s,leg in [(1,14),(-1,17)]:
        # Ribbed sock cuff overlaps both the shin and the boot opening.
        sv=[];sf=[];su=[]
        for y in [.073,.112,.160]:
            for i in range(16):
                a=2*math.pi*i/16;radius=.034+(y-.073)*.07;sv.append([s*.10+radius*math.sin(a),y,radius*math.cos(a)])
        for j in range(2):
            for i in range(16):
                sf.append([j*16+i,j*16+(i+1)%16,(j+1)*16+(i+1)%16,(j+1)*16+i]);su.append([rectuv('socks',i/16,j*.06),rectuv('socks',(i+1)/16,j*.06),rectuv('socks',(i+1)/16,(j+1)*.06),rectuv('socks',i/16,(j+1)*.06)])
        sw=np.zeros((len(sv),18));sw[:,leg]=1;objs.append(make_mesh('sock-cuff',sv,sf,su,sw))
        # Sculpted boot upper, independent sole, six small moulded studs per foot.
        vs=[];fs=[];uvs=[];zz=[-.071,-.055,.0,.075,.145,.205,.225];width=[.022,.043,.048,.049,.047,.038,.012];height=[.035,.058,.077,.065,.047,.035,.024]
        for k,z in enumerate(zz):
            for i in range(12):
                a=2*math.pi*i/12;vs.append([s*.10+width[k]*math.sin(a),.047+height[k]*math.cos(a)*.70,z])
        for k in range(len(zz)-1):
            for i in range(12):
                fs.append([k*12+i,k*12+(i+1)%12,(k+1)*12+(i+1)%12,(k+1)*12+i]);uvs.append([rectuv('boots',i/12,k/6),rectuv('boots',(i+1)/12,k/6),rectuv('boots',(i+1)/12,(k+1)/6),rectuv('boots',i/12,(k+1)/6)])
        fs.extend([list(range(11,-1,-1)),list(range(72,84))]);uvs.extend([[rectuv('boots',.5,.5)]*12]*2)
        weights=np.zeros((len(vs),18));weights[:,leg]=1;objs.append(make_mesh('boot-upper',vs,fs,uvs,weights))
        objs.append(ellipsoid('boot-sole',[s*.10,.026,.075],[.05,.012,.151],leg,'boots',12,4))
        for x in [-.029,.029]:
            for z in [-.035,.075,.17]:objs.append(ellipsoid('moulded-stud',[s*.10+x,.011,z],[.009,.009,.009],leg,'boots',6,3))
        for z in [.018,.039,.060,.081]:
            # Off-white flat laces from the gloves swatch; no logos or trade dress.
            objs.append(ellipsoid('lace',[s*.10,.098-z*.19,z],[.026,.0018,.002],leg,'gloves',8,3))
    # Eyeballs sit behind the actual MakeHuman eyelid rims.
    dv,_,_,_=deform(src)
    for side in ['l','r']:
        c=dv[ids('joint-'+side+'-eye')].mean(0)
        # Keep eyeballs behind the anatomical lid rims, with the iris visible.
        objs.append(ellipsoid('eye-'+side,c,[.0135,.0115,.0120],5,'eyes',20,10,True))
        vs=[];fs=[];uvs=[]
        for j in range(8):
            q=c+np.array([-.018+j*.036/7,.016+math.sin(j/7*math.pi)*.003,.006])
            vs.extend([q+[0,-.0018,0],q+[0,.0018,0]])
        for j in range(7):
            fs.append([j*2,j*2+1,j*2+3,j*2+2]);uvs.append([rectuv('brows',j/7,0),rectuv('brows',j/7,1),rectuv('brows',(j+1)/7,1),rectuv('brows',(j+1)/7,0)])
        ew=np.zeros((len(vs),18));ew[:,5]=1;objs.append(make_mesh('eyebrow-'+side,vs,fs,uvs,ew))
    objs.append(fitted_hair(person,src,joints))
    return objs

def simplify(obj,tri_target):
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    tri=sum(len(p.vertices)-2 for p in obj.data.polygons)
    if tri>tri_target:
        mod=obj.modifiers.new('budgeted surface simplification','DECIMATE');mod.ratio=tri_target/tri;mod.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    mod=obj.modifiers.new('explicit triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
    for poly in obj.data.polygons:poly.use_smooth=True
    obj.data.update()
    obj.select_set(False)

def collect(objects):
    verts=[];normals=[];uv=[];joints=[];weights=[];indices=[];lookup={}
    for obj in objects:
        mesh=obj.data
        for poly in mesh.polygons:
            for li in poly.loop_indices:
                loop=mesh.loops[li];vertex=mesh.vertices[loop.vertex_index]
                tex=mesh.uv_layers.active.data[li].uv[:]
                ws=sorted([(g.group,g.weight) for g in vertex.groups],key=lambda x:-x[1])[:4]
                total=sum(w for j,w in ws) or 1
                jj=[j for j,w in ws]+[0]*(4-len(ws));ww=[w/total for j,w in ws]+[0]*(4-len(ws))
                # glTF texture coordinates have top-left image origin; Blender UVs have bottom-left.
                tex=(tex[0],1-tex[1])
                n=vertex.normal[:];p=vertex.co[:]
                key=tuple(round(x,6) for x in (*p,*n,*tex,*jj,*ww))
                if key not in lookup:
                    lookup[key]=len(verts);verts.append(p);normals.append(n);uv.append(tex);joints.append(jj);weights.append(ww)
                indices.append(lookup[key])
    return {'POSITION':np.array(verts,np.float32),'NORMAL':np.array(normals,np.float32),'TEXCOORD_0':np.array(uv,np.float32),'JOINTS_0':np.array(joints,np.uint16),'WEIGHTS_0':np.array(weights,np.float32),'indices':np.array(indices,np.uint16 if len(verts)<65536 else np.uint32)}

def export_glb(path,mesh,textures,person,lod,kit):
    blob=bytearray();views=[];accessors=[]
    def data(buf,target=None):
        while len(blob)%4:blob.append(0)
        start=len(blob);blob.extend(buf);view={'buffer':0,'byteOffset':start,'byteLength':len(buf)}
        if target:view['target']=target
        views.append(view);return len(views)-1
    attrs={}
    for name,arr in mesh.items():
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
        b=(OUT/textures[k]).read_bytes();images.append({'bufferView':data(b),'mimeType':'image/png','name':person['id']+'-'+k})
    nodes=[]
    for i,n in enumerate(NAMES):
        node={'name':n,'translation':LOCAL[i].tolist(),'rotation':[0,0,0,1]}
        children=[j for j,p in enumerate(PARENTS) if p==i]
        if children:node['children']=children
        nodes.append(node)
    nodes.append({'name':person['id']+'-'+kit+'-'+lod,'mesh':0,'skin':0,'extras':{'role':person['role'],'lod':lod,'identity':person['id'],'fictional':True}})
    attributes={k:a for k,a in attrs.items() if k!='indices'}
    doc={'asset':{'version':'2.0','generator':'soccer-v6 CC0 MakeHuman-derived canonical human builder'},'scene':0,'scenes':[{'nodes':[0,18]}],'nodes':nodes,'skins':[{'name':'canonical-18-identity-bind','joints':list(range(18)),'skeleton':0,'inverseBindMatrices':ibm}],'meshes':[{'name':person['id']+'-'+lod,'primitives':[{'attributes':attributes,'indices':attrs['indices'],'material':0,'mode':4}]}],'materials':[{'name':'human-cloth-boot-atlas','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicRoughnessTexture':{'index':2},'metallicFactor':0,'roughnessFactor':1},'normalTexture':{'index':1,'scale':.55},'occlusionTexture':{'index':2,'strength':.25},'doubleSided':True,'alphaMode':'MASK','alphaCutoff':.35}],'textures':[{'source':i,'sampler':0} for i in range(3)],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],'images':images,'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(blob)}],'extras':{'license':'CC0-1.0','realPerson':False,'canonicalSkeleton':'../../motion/soccer.json','triangles':len(mesh['indices'])//3,'textureMaxDimension':1024}}
    js=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*((-len(js))%4);blob+=b'\0'*((-len(blob))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob)

def write_rig():
    bones=[]
    for i,name in enumerate(NAMES):
        m=np.eye(4);m[:3,3]=-WORLD[i]
        bones.append({'name':name,'parent':NAMES[PARENTS[i]] if PARENTS[i] is not None else None,'restTranslationMeters':LOCAL[i].tolist(),'restRotationQuaternion':[0,0,0,1],'worldRestPositionMeters':WORLD[i].tolist(),'inverseBindMatrix':m.T.flatten().tolist()})
    doc={'schemaVersion':1,'kind':'canonical-human-skin-rig','units':'meters','axes':{'up':'+Y','forward':'+Z','anatomicalLeft':'+X'},'rotationFormat':'quaternion-xyzw','rotationSpace':'parent-local','restPose':'arms down, legs straight, feet forward','canonicalSource':'../../motion/soccer.json','bones':bones,'restHeightMeters':1.76,'skinWeights':'up to four influences per vertex, normalized','bindRotationsIdentity':True}
    (OUT/'rig.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')

def main():
    write_rig();characters=[]
    args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
    selected=PEOPLE if not args else [p for p in PEOPLE if p['id'] in args]
    for person in selected:
        bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
        body,src,joints=body_parts(person);other=extras(person,src,joints);original=body+other
        record={k:person[k] for k in ['id','label','role']};record['fictional']=True;record['source']='MakeHuman Community hm08 CC0';record['kits']=[]
        kitids=['kit-a','kit-b'] if person['role']=='field' else ['keeper' if person['role']=='goalkeeper' else 'referee']
        meshes={}
        for lod,budgets in [('lod0',{'face':2600,'body':1450,'cloth':1750,'other':1400}),('lod1',{'face':900,'body':520,'cloth':700,'other':600})]:
            clones=[]
            for obj in original:
                c=obj.copy();c.data=obj.data.copy();bpy.context.collection.objects.link(c);clones.append(c)
                part='face' if obj.name.endswith('-face') else 'body' if obj.name.endswith('-body') else 'cloth' if obj.name.endswith('-cloth') else 'other'
                target=budgets[part]
                if part=='other':
                    # Extras have a joint budget, proportional to their authored face count.
                    total=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in other)
                    target=max(4,target*sum(len(p.vertices)-2 for p in obj.data.polygons)/total)
                if part=='cloth':
                    uses={}
                    for face in c.data.polygons:
                        p=list(face.vertices)
                        for a,b in zip(p,p[1:]+p[:1]):
                            edge=tuple(sorted((a,b)));uses[edge]=uses.get(edge,0)+1
                    border={v for edge,count in uses.items() if count==1 for v in edge}
                    fabric=c.vertex_groups.new(name='_fabric_relax')
                    inside=[v.index for v in c.data.vertices if v.index not in border]
                    if inside:fabric.add(inside,1,'REPLACE')
                    smooth=c.modifiers.new('relaxed sports fabric surface','SMOOTH');smooth.factor=.42;smooth.iterations=3
                    smooth.vertex_group=fabric.name
                    bpy.context.view_layer.objects.active=c;bpy.ops.object.modifier_apply(modifier=smooth.name)
                    fabric_group=c.vertex_groups.get('_fabric_relax')
                    if fabric_group:c.vertex_groups.remove(fabric_group)
                simplify(c,target)
            meshes[lod]=collect(clones)
            for o in clones:bpy.data.objects.remove(o,do_unlink=True)
        for kit in kitids:
            textures=atlas(person,kit);k={'id':kit,'color':'#%02x%02x%02x'%KITS[kit][0],'textures':textures}
            for lod in ['lod0','lod1']:
                stem=person['id']+'-'+kit+'-'+lod if person['role']=='field' else person['id']+'-'+lod
                path=ASSETS/(stem+'.glb');export_glb(path,meshes[lod],textures,person,lod,kit)
                k[lod]=str(path.relative_to(OUT));k[lod+'Triangles']=len(meshes[lod]['indices'])//3;k[lod+'BytesBeforeDraco']=path.stat().st_size
            record['kits'].append(k)
        characters.append(record)
        print('BUILT',person['id'],[(lod,len(m['indices'])//3,len(m['POSITION'])) for lod,m in meshes.items()],flush=True)
    partial=OUT/('asset-manifest-'+selected[0]['id']+'.json') if len(selected)!=len(PEOPLE) else OUT/'asset-manifest.json'
    partial.write_text(json.dumps({'schemaVersion':1,'kind':'soccer-human-character-library','skeleton':'rig.json','license':'CC0-1.0','characters':characters,'budgets':{'lod0Triangles':8000,'lod1Triangles':3000,'textureMaxDimension':1024,'maxGlbBytes':1500000}},ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main()
