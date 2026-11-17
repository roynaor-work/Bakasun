"""Export core glTF 2.0, embedded textures, three scenes and five skeletal loops.

Requires Python 3, numpy, scipy and Pillow. Run build-geometry.py with Blender first.
No glTF extensions, remote resources, runtime dependencies or hidden LOD overlaps.
"""
from pathlib import Path
import io
import json
import math
import struct
import hashlib
import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation as R

ROOT = Path(__file__).resolve().parent.parent
WORK = Path('/tmp/tennis-people-tools')
PEOPLE = json.loads((ROOT/'source/people.json').read_text())
CLIPS = [('seated_idle',4.0),('polite_applause',3.2),('cheer',4.0),
         ('track_ball',5.0),('stand_up',6.0)]
NAMES = ['Hips','Spine','Chest','Neck','Head','UpperArm_L','ForeArm_L','Hand_L',
         'UpperArm_R','ForeArm_R','Hand_R','UpperLeg_L','Leg_L','Foot_L',
         'UpperLeg_R','Leg_R','Foot_R']
PARENTS = [-1,0,1,2,3,2,5,6,2,8,9,0,11,12,0,14,15]
SOURCES = ['pelvis','spine-3','spine-1','neck','head','l-shoulder','l-elbow','l-hand',
           'r-shoulder','r-elbow','r-hand','l-upper-leg','l-knee','l-ankle',
           'r-upper-leg','r-knee','r-ankle']
RECTS = {'head':(0,0,128,128),'body':(128,0,128,256),
         'hat':(0,128,128,64),'hair':(0,192,128,64)}

def rgb(h):
    return np.array([int(h[i:i+2],16) for i in [1,3,5]],float)

def atlas(c):
    """Original small albedo atlas: restrained facial detail and woven fabrics."""
    rng=np.random.default_rng(int(c['id'][-2:]))
    im=np.full((256,256,3),128.,float)
    for name,(x,y,w,h) in RECTS.items():
        yy,xx=np.mgrid[:h,:w]; u=xx/(w-1);v=yy/(h-1)
        base=rgb({'head':c['skin'],'body':c['skin'],'hat':c['hatColor'],'hair':c['hair']}[name])
        noise=rng.normal(0,.72,(h,w))
        shade=np.ones((h,w))
        if name=='body':
            # One continuous body UV island keeps shirt and short hems horizontal,
            # even where a low-poly triangle spans a clothing boundary or joint.
            worldx=(u-.5)*1.1;worldy=(1-v)*1.40
            pixels=np.broadcast_to(base,(h,w,3)).copy()
            shorts=(worldy>=.68)&(worldy<1.012)&(abs(worldx)<.28)
            torso=(worldy>=1.012)&(worldy<1.37)&(abs(worldx)<.218)
            sleeves=(worldy>=1.205)&(worldy<1.36)&(abs(worldx)<.285)
            shirt=torso|sleeves
            pixels[shorts]=rgb(c['bottom']);pixels[shirt]=rgb(c['shirt'])
            shade+=.008*np.sin(xx*1.5)*np.sin(yy*1.9)
            folds=.04*np.sin(worldx*67+worldy*2)*np.sin(np.clip((worldy-1.01)/.36,0,1)*np.pi)
            shade[shirt]+=folds[shirt]
            if c['outfit']=='stripe':shade[shirt]-=.20*(np.sin(worldy[shirt]*58)>.58)
            if c['outfit']=='check':shade[shirt]-=.14*((np.sin(worldy[shirt]*82)>.7)|(np.sin(worldx[shirt]*82)>.7))
            collar=shirt&(worldy>1.28)&(abs(worldx)<.065)&(worldy<1.35-abs(worldx)*.55)
            shade[collar]-=.13
            if c['outfit'] in ['polo','linen','check']:
                shade[shirt&(abs(worldx)<.004)&(worldy>1.18)&(worldy<1.32)]-=.16
                for by in [1.225,1.27]:
                    shade[(abs(worldx-.002)<.004)&(abs(worldy-by)<.005)]-=.16
            shoe=worldy<.12;pixels[shoe]=rgb('#e3e0d3')
            shade[shoe]-=.15*(worldy[shoe]<.03)
            shade[shoe]-=.15*(np.sin(worldy[shoe]*280)>.85)
            im[y:y+h,x:x+w]=pixels*shade[...,None]+noise[...,None]
            continue
        if name=='head':
            phi=(u-.5)*np.pi; f=np.ones_like(u)
            shade-=.08*np.exp(-((v-.67)/.09)**2)*f
            shade+=.035*np.cos(phi)*np.sin(v*np.pi)
            im[y:y+h,x:x+w]=base*shade[...,None]+noise[...,None]
            a=im[y:y+h,x:x+w]
            def blend(mask,color,alpha=1):
                a[:]=a*(1-mask[...,None]*alpha)+np.array(color)*mask[...,None]*alpha
            # Eyes occupy natural proportions: small lids, irises and orbital shadows.
            for ex in [.333,.667]:
                eye=np.exp(-((u-ex)/.063)**4-((v-.453)/.010)**2)*f
                shadow=np.exp(-((u-ex)/.080)**2-((v-.438)/.024)**2)*f
                blend(shadow,base*.66,.33)
                blend(eye,[183,176,157],.78)
                iris=np.exp(-((u-ex)/.016)**2-((v-.453)/.009)**2)*f
                blend(iris,[48,45,37],.90)
                brow=np.exp(-((u-ex)/.070)**4-((v-.416)/.006)**2)*f
                blend(brow,rgb(c['hair'])*.74,.84)
            nose=np.exp(-((u-.5)/.035)**2-((v-.535)/.035)**2)*f
            blend(nose,base*1.10,.58)
            nostril=np.exp(-((abs(u-.5)-.036)/.012)**2-((v-.563)/.007)**2)*f
            blend(nostril,base*.46,.52)
            lip=np.exp(-((u-.5)/.085)**4-((v-.634)/.009)**2)*f
            blend(lip,base*np.array([.79,.65,.67]),.72)
            mouth=np.exp(-((u-.5)/.082)**4-((v-.635)/.0028)**2)*f
            blend(mouth,base*.42,.65)
            if c['age']>50:
                for wy in [.374,.389,.484]:
                    wrinkle=np.exp(-((v-wy)/.0028)**2)*np.exp(-((u-.5)/.32)**4)*f
                    blend(wrinkle,base*.65,.20)
            hairline=.24+.045*np.cos(phi*2)+(.055 if c['age']>60 else 0)
            hairmask=(v<hairline)|((abs(u-.5)>.43)&(v<(.62 if c['hairStyle']=='bob' else .46)))
            blend(hairmask.astype(float),rgb(c['hair']),1)
            if c['glasses']:
                for ex in [.333,.667]:
                    lens=np.exp(-((u-ex)/.095)**6-((v-.452)/.028)**6)*f
                    blend(lens,[32,44,42],.96)
                    highlight=np.exp(-((u-ex+.026)/.030)**2-((v-.442)/.004)**2)*f
                    blend(highlight,[150,165,155],.35)
                bridge=(abs(u-.5)<.075)&(abs(v-.45)<.005)
                blend(bridge.astype(float),[48,44,36],.85)
            continue
        if name=='hat':
            shade+=.025*np.sin(xx*2)+.025*np.sin(yy*2)
            shade-=.32*((v>.55)&(v<.65))
        if name=='hair':
            shade+=.05*np.sin(u*160)
        im[y:y+h,x:x+w]=base*shade[...,None]+noise[...,None]
    out=io.BytesIO(); Image.fromarray(np.uint8(np.clip(im,0,255))).save(out,format='PNG',optimize=True)
    return out.getvalue()

def normalize(v):
    length=np.linalg.norm(v)
    return v/length if length>1e-12 else np.array([0.,1.,0.])

def between(a,b):
    a,b=normalize(a),normalize(b)
    dot=np.clip(np.dot(a,b),-1,1)
    if dot<-.99999:
        axis=normalize(np.cross(a,[1,0,0] if abs(a[0])<.9 else [0,1,0]))
        return R.from_rotvec(axis*np.pi)
    return R.from_quat(np.r_[np.cross(a,b),1+dot]/np.linalg.norm(np.r_[np.cross(a,b),1+dot]))

def ik(a,b,l1,l2,pole):
    d=b-a;length=np.linalg.norm(d);u=normalize(d)
    distance=np.clip(length,abs(l1-l2)+.001,l1+l2-.0005)
    center=(l1*l1-l2*l2+distance*distance)/(2*distance)
    height=math.sqrt(max(0,l1*l1-center*center))
    perpendicular=normalize(np.array(pole)-u*np.dot(pole,u))
    return a+u*center+perpendicular*height,a+u*distance

def smooth(x):
    x=np.clip(x,0,1);return x*x*(3-2*x)

def pose(clip,t,duration,rest,scale,age):
    local=[R.identity() for _ in NAMES]
    globalq=[R.identity() for _ in NAMES]
    pos=np.zeros_like(rest)
    phase=t/duration; cycle=math.sin(phase*2*np.pi)
    rise=0.
    if clip=='stand_up':
        rise=smooth((phase-.15)/.23)*(1-smooth((phase-.66)/.24))
    lean=.028+(.18*math.sin(np.pi*min(1,phase/.35))**2 if clip=='stand_up' and phase<.35 else .0)
    if age>60: lean+=.025
    pos[0]=rest[0]+np.array([0,-.34*(1-rise)+.0018*cycle,-.10+.43*rise])*scale
    local[0]=R.from_euler('x',lean)
    local[1]=R.from_euler('x',.018+.009*cycle)
    yaw=.50*math.sin(phase*2*np.pi) if clip=='track_ball' else .025*cycle
    local[3]=R.from_euler('y',yaw*.22)
    local[4]=R.from_euler('yx',[yaw*.78,-.018])
    for i in range(5):
        if i:
            p=PARENTS[i];pos[i]=pos[p]+globalq[p].apply(rest[i]-rest[p])
            globalq[i]=globalq[p]*local[i]
        else:globalq[0]=local[0]
    for side,upper,fore,hand,thigh,knee,foot in [(1,5,6,7,11,12,13),(-1,8,9,10,14,15,16)]:
        pos[upper]=pos[2]+globalq[2].apply(rest[upper]-rest[2])
        # A relaxed lap pose, with the wrists outside the thighs.
        wrist=np.array([side*.145,.705,.245])*scale
        wrist[1]+=.34*rise*scale
        wrist[2]+=.34*rise*scale
        if clip=='polite_applause':
            # Two complete polite claps; contact on both palms, no interpenetration.
            opening=.026+.071*(.5-.5*math.cos(phase*4*np.pi))
            wrist=np.array([side*opening,1.025,.325])*scale
        elif clip=='cheer':
            lift=math.sin(np.pi*phase)**2
            wrist=(np.array([side*.145,.705,.245])*(1-lift)+
                   np.array([side*.32,1.49,.24])*lift)*scale
        elbow,wrist=ik(pos[upper],wrist,np.linalg.norm(rest[fore]-rest[upper]),
                       np.linalg.norm(rest[hand]-rest[fore]),[side*.9,-.35,-.65])
        for i,target,child in [(upper,elbow,fore),(fore,wrist,hand)]:
            world=between(rest[child]-rest[i],target-pos[i])
            local[i]=globalq[PARENTS[i]].inv()*world;globalq[i]=world
            pos[child]=target
        globalq[hand]=globalq[fore]*R.from_euler('z',side*.10)
        if clip=='polite_applause':
            globalq[hand]=between(np.array([side*.035,-.085,.070]),np.array([0,1,.04]))
        local[hand]=globalq[fore].inv()*globalq[hand]
        pos[thigh]=pos[0]+globalq[0].apply(rest[thigh]-rest[0])
        ankle=np.array([side*.185,.073,.372])*scale
        kneep,ankle=ik(pos[thigh],ankle,np.linalg.norm(rest[knee]-rest[thigh]),
                       np.linalg.norm(rest[foot]-rest[knee]),[0,.05,1])
        for i,target,child in [(thigh,kneep,knee),(knee,ankle,foot)]:
            world=between(rest[child]-rest[i],target-pos[i])
            local[i]=globalq[PARENTS[i]].inv()*world;globalq[i]=world
            pos[child]=target
        globalq[foot]=R.identity();local[foot]=globalq[knee].inv()
    return np.array([q.as_quat() for q in local]),pos[0],pos

def influences(p,rest):
    y=p[1]
    if y>rest[3,1]-.025:
        t=np.clip((y-rest[3,1])/.055,0,1)
        return [(3,1-t),(4,t)]
    # Assign contiguous arm surfaces before torso, with blended elbow/wrist rings.
    for upper,fore,hand in [(5,6,7),(8,9,10)]:
        shoulder=rest[upper]
        if p[0]*shoulder[0]>0 and abs(p[0])>abs(shoulder[0])*.92 and y>rest[0,1]+.025:
            points=[rest[upper],rest[fore],rest[hand]]
            distances=[]
            for a,b in zip(points[:-1],points[1:]):
                t=np.clip(np.dot(p-a,b-a)/np.dot(b-a,b-a),0,1)
                distances.append(np.linalg.norm(p-a-t*(b-a)))
            if min(distances)<.105 or abs(p[0])>abs(rest[hand,0])*.86:
                along=np.dot(p-rest[hand],normalize(rest[hand]-rest[fore]))
                if along>-.04:
                    w=float(smooth((along+.04)/.04))
                    return [(fore,1-w),(hand,w)]
                d=np.linalg.norm(p-rest[fore])
                if d<.06:
                    s=np.dot(p-rest[fore],normalize(rest[hand]-rest[upper]))
                    w=np.clip(.5+s/.10,0,1)
                    return [(upper,1-w),(fore,w)]
                if distances[0]<distances[1]:
                    w=np.clip(np.linalg.norm(p-shoulder)/.065,0,1)
                    return [(2,1-w),(upper,w)]
                return [(fore,1)]
    if y<rest[0,1]+.02:
        thigh,knee,foot=(11,12,13) if p[0]>0 else (14,15,16)
        if y<rest[foot,1]+.045:
            w=np.clip((y-rest[foot,1]+.015)/.06,0,1)
            return [(foot,1-w),(knee,w)]
        if abs(y-rest[knee,1])<.075:
            w=np.clip((y-rest[knee,1]+.075)/.15,0,1)
            return [(knee,1-w),(thigh,w)]
        if y<rest[knee,1]:return [(knee,1)]
        w=np.clip((rest[0,1]+.025-y)/.15,0,1)
        if abs(p[0])<.055:w*=abs(p[0])/.055
        return [(0,1-w),(thigh,w)]
    t=np.clip((y-rest[1,1])/(rest[2,1]-rest[1,1]),0,1)
    if y<rest[1,1]:
        t=np.clip((y-rest[0,1])/(rest[1,1]-rest[0,1]),0,1)
        return [(0,1-t),(1,t)]
    return [(1,1-t),(2,t)]

def accessory(c,rest,lod):
    scale=c['height']/1.666
    top=c['height']-.008*scale;center=np.array([0,top-.09*scale,.012*scale])
    p=[];f=[];regions=[]
    def ring(rx,rz,y,n):
        ids=[]
        for i in range(n):
            a=2*np.pi*i/n;ids.append(len(p));p.append([rx*np.sin(a)*scale,y,center[2]+rz*np.cos(a)*scale])
        return ids
    if c['hat']!='none':
        if lod==0:
            n=6;a=ring(.101,.107,top-.035*scale,n);b=ring(.073,.078,top+.045*scale,n)
            for k in range(n):
                j=(k+1)%n;f.extend([[a[k],a[j],b[k]],[a[j],b[j],b[k]]])
            p.append([0,top+.047*scale,center[2]])
            for k in range(n):f.append([b[k],b[(k+1)%n],len(p)-1])
            if c['hat'] in ['sunhat','bucket']:
                brim=ring(.155 if c['hat']=='sunhat' else .128,.151 if c['hat']=='sunhat' else .125,top-.035*scale,n)
                p.append([0,top-.036*scale,center[2]])
                for k in range(n):f.append([brim[(k+1)%n],brim[k],len(p)-1])
            else:
                # Six visor triangles share a shallow front arc; no giant cartoon cap.
                start=len(p);p.append([0,top-.037*scale,.055*scale])
                for k in range(7):
                    angle=-np.pi/2+k*np.pi/6
                    p.append([.115*np.sin(angle)*scale,top-.047*scale,.05*scale+.139*np.cos(angle)*scale])
                for k in range(6):f.append([start,start+k+1,start+k+2])
        else:
            n=4;a=ring(.103,.108,top-.032*scale,n);b=ring(.078,.083,top+.042*scale,n)
            for k in range(n):
                j=(k+1)%n;f.extend([[a[k],a[j],b[k]],[a[j],b[j],b[k]]])
            f.extend([[b[0],b[1],b[2]],[b[0],b[2],b[3]]])
            brim=ring(.153 if c['hat']=='sunhat' else .125,.15,top-.038*scale,4)
            if c['hat'] in ['cap','visor']:
                for i in brim:p[i][2]=max(p[i][2],.045*scale)
            f.extend([[brim[0],brim[2],brim[1]],[brim[0],brim[3],brim[2]]])
        regions=['hat']*len(f)
    else:
        # Close-fitting hair shell sampled from an ellipsoidal cranial envelope.
        # 24 / 12 triangles, with the rear mass length varied for bob/bun styles.
        n=6 if lod==0 else 4
        rows=3 if lod==0 else 2
        for j in range(rows):
            a=j/(rows-1)*np.pi/2
            for k in range(n):
                phi=2*np.pi*k/n
                y=top-.106*scale+np.sin(a)*.113*scale
                if j==0 and c['hairStyle']=='bob' and np.cos(phi)<.5:y-=.075*scale
                p.append([.085*np.cos(a)*np.sin(phi)*scale,y,.013*scale+.09*np.cos(a)*np.cos(phi)*scale])
        # Keep a small top ring rather than zero-area pole triangles.
        for k in range(n):
            a=2*np.pi*k/n;p[(rows-1)*n+k]=[.012*np.sin(a)*scale,top+.009*scale,.013*scale+.012*np.cos(a)*scale]
        for j in range(rows-1):
            for k in range(n):
                a=j*n+k;b=j*n+(k+1)%n;d=a+n;e=b+n
                f.extend([[a,b,d],[b,e,d]])
        if lod==1:
            # 8 sides + 2 top + 2 rear hair triangles = 12.
            f.extend([[4,5,6],[4,6,7],[0,3,7],[0,7,4]])
        regions=['hair']*len(f)
    assert len(f)==(24 if lod==0 else 12)
    if c['hat']=='visor':
        # Crown is hair under a narrow light visor band in the UV mapping.
        regions[:18 if lod==0 else 10]=['hair']*(18 if lod==0 else 10)
    return np.array(p),np.array(f),regions

def far_geometry(c,rest):
    scale=c['height']/1.666;p=[];f=[];reg=[]
    def add(points,faces,region):
        start=len(p);p.extend(points);f.extend([[i+start for i in face] for face in faces]);reg.extend([region]*len(faces))
    center=np.array([0,c['height']-.11*scale,.012*scale])
    head=[center+[0,.11*scale,0],center+[0,-.11*scale,0],center+[.077*scale,0,0],
          center+[-.077*scale,0,0],center+[0,0,.085*scale],center+[0,0,-.085*scale]]
    add(head,[[0,2,4],[0,4,3],[0,3,5],[0,5,2],[1,4,2],[1,3,4],[1,5,3],[1,2,5]],'head')
    # A six-point double-sided torso silhouette includes shoulders and a neck.
    # Four triangles leave enough budget for articulated limbs and a volume head.
    add([[x*scale,y*scale,.03*scale] for x,y in
         [(-.14,.93),(.14,.93),(.17,1.34),(.05,1.455),(-.05,1.455),(-.17,1.34)]],
        [[0,1,2],[0,2,3],[0,3,4],[0,4,5]],'body')
    for a,b,d,region in [(5,6,7,'skin'),(8,9,10,'skin'),(11,12,13,'skin'),(14,15,16,'skin')]:
        width=(.042 if a<10 else .067)*scale
        add([rest[a]+[-width,0,.01],rest[a]+[width,0,.01],rest[b]+[-width*.75,0,.01],
             rest[b]+[width*.75,0,.01],rest[d]+[0,-.025*scale,.02]],[[0,1,2],[1,3,2],[2,3,4]],region)
    assert len(f)==24
    return np.array(p),np.array(f),reg

def body_region(point,c,rest):
    p=point/(c['height']/1.666);x,y,z=p
    if y>1.395:return 'head' if z>.022 else 'hair'
    return 'body'

def uv(point,region,c):
    x,y,z=point/(c['height']/1.666)
    if region=='head':
        u=.5+x/.18
        v=1-np.clip((y-1.395)/.275,0,1)
    elif region=='body':
        u=.5+x/1.1
        v=np.clip((1.40-y)/1.40,0,1)
    elif region=='hat':
        u=.5+math.atan2(x,z-.012)/(2*np.pi);v=np.clip((c['height']/(c['height']/1.666)+.05-y)/.13,0,1)
    else:
        u=(x*7+.5)%1;v=(y*5)%1
    rx,ry,w,h=RECTS[region]
    # glTF texture coordinates use the upper-left image origin (no OpenGL flip).
    return [(rx+2+np.clip(u,0,1)*(w-4))/256,(ry+2+np.clip(v,0,1)*(h-4))/256]

class GLB:
    def __init__(self):
        self.bin=bytearray();self.doc={'asset':{'version':'2.0','generator':'Tennis crowd people v2 / CC0 MakeHuman-derived anatomy',
            'copyright':'Original derivative assets CC0-1.0; MakeHuman CC0, see LICENSES.md.'},
            'scene':0,'scenes':[],'nodes':[],'meshes':[],'skins':[],'animations':[],
            'buffers':[{'byteLength':0}],'bufferViews':[],'accessors':[],
            'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],
            'textures':[{'sampler':0,'source':0}],
            'materials':[{'name':'Summer clothes / skin / accessories','doubleSided':True,
                'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.94}}]}
    def view(self,raw,target=None):
        self.bin.extend(b'\0'*(-len(self.bin)%4));offset=len(self.bin);self.bin.extend(raw)
        v={'buffer':0,'byteOffset':offset,'byteLength':len(raw)}
        if target:v['target']=target
        self.doc['bufferViews'].append(v);return len(self.doc['bufferViews'])-1
    def accessor(self,a,kind,component=5126,target=None,bounds=False):
        a=np.asarray(a,dtype={5126:'<f4',5123:'<u2',5121:'u1'}[component])
        count=a.shape[0]
        d={'bufferView':self.view(a.tobytes(),target),'componentType':component,'count':count,'type':kind}
        if bounds:
            q=a.reshape(count,-1);d['min']=q.min(0).tolist();d['max']=q.max(0).tolist()
        self.doc['accessors'].append(d);return len(self.doc['accessors'])-1
    def save(self,path):
        self.doc['buffers'][0]['byteLength']=len(self.bin)
        j=json.dumps(self.doc,separators=(',',':'),ensure_ascii=False).encode();j+=b' '*(-len(j)%4)
        self.bin+=b'\0'*(-len(self.bin)%4)
        b=struct.pack('<III',0x46546c67,2,12+8+len(j)+8+len(self.bin))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(self.bin),0x004e4942)+self.bin
        path.write_bytes(b);return b

def export(c):
    data=json.loads((WORK/(c['id']+'-geometry.json')).read_text())
    rest=np.array([data['joints'][x] for x in SOURCES]);scale=c['height']/1.666
    glb=GLB();d=glb.doc
    d['extras']={'id':c['id'],'heightMeters':c['height'],'ageYears':c['age'],'fictional':True,
        'coordinateSystem':'+Y up, +Z face forward, meters','lodSceneIndices':[0,1,2],
        'loopClips':[x[0] for x in CLIPS],'seatHeightMeters':.46*scale,'seatCenter':[0,.46*scale,-.10*scale]}
    texture=atlas(c);d['images']=[{'name':c['id']+' / original albedo 256px','mimeType':'image/png','bufferView':glb.view(texture)}]
    ibm=np.tile(np.eye(4),(len(NAMES),1,1));ibm[:,:3,3]=-rest
    ibm=ibm.transpose(0,2,1).reshape(len(NAMES),16)
    bind=glb.accessor(ibm,'MAT4')
    rig_roots=[]
    for lod in range(3):
        base=len(d['nodes']);rig_roots.append(base)
        for i,name in enumerate(NAMES):
            node={'name':f'L{lod}_{name}','translation':(rest[i]-rest[PARENTS[i]] if PARENTS[i]>=0 else rest[i]).tolist()}
            children=[base+j for j,p in enumerate(PARENTS) if p==i]
            if children:node['children']=children
            d['nodes'].append(node)
        d['skins'].append({'name':f'Crowd17_LOD{lod}','inverseBindMatrices':bind,'skeleton':base,
                           'joints':[base+i for i in range(len(NAMES))]})
    lod_records=[]
    for lod,budget in enumerate([210,90,24]):
        if lod<2:
            geo=data['lods'][lod];p=np.array(geo['positions']);f=np.array(geo['triangles'])
            regions=[body_region(p[face].mean(0),c,rest) for face in f]
            ap,af,ar=accessory(c,rest,lod)
            af+=len(p);p=np.vstack([p,ap]);f=np.vstack([f,af]);regions+=ar
        else:
            p,f,regions=far_geometry(c,rest)
            regions=[body_region(p[face].mean(0),c,rest) for face in f]
        assert len(f)==budget
        normals=np.zeros_like(p)
        for face in f:
            a,b,e=p[face];normal=np.cross(b-a,e-a)
            for index in face:normals[index]+=normal
        normals=np.array([normalize(x) for x in normals])
        positions=[];outnorm=[];tex=[];joints=[];weights=[]
        # De-index at UV/material boundaries; triangle budgets include every accessory.
        for face,region in zip(f,regions):
            uvs=[uv(p[i],region,c) for i in face]
            # Fix equirectangular seam triangles by clamping to their own edge.
            if region=='hat' and max(x[0] for x in uvs)-min(x[0] for x in uvs)>.3:
                for x in uvs:x[0]=.49 if x[0]<.1 else x[0]
            for i,coord in zip(face,uvs):
                positions.append(p[i]);outnorm.append(normals[i]);tex.append(coord)
                inf=[(4,1.)] if lod<2 and i>=len(data['lods'][lod]['positions']) else influences(p[i],rest)
                if lod==2 and i in [8,11]:inf=[(2,1.)]
                if lod==2 and i in [9,10]:inf=[(3,1.)]
                inf=[(j,w) for j,w in inf if w>1e-7]
                total=sum(w for _,w in inf)
                joints.append([j for j,w in inf]+[0]*(4-len(inf)))
                weights.append([w/total for j,w in inf]+[0.]*(4-len(inf)))
        name=f'People_LOD{lod}_{budget}'
        attrs={'POSITION':glb.accessor(positions,'VEC3',target=34962,bounds=True),
               'NORMAL':glb.accessor(outnorm,'VEC3',target=34962),
               'TEXCOORD_0':glb.accessor(tex,'VEC2',target=34962),
               'JOINTS_0':glb.accessor(joints,'VEC4',5121,34962),
               'WEIGHTS_0':glb.accessor(weights,'VEC4',target=34962)}
        mesh=len(d['meshes']);d['meshes'].append({'name':name,'primitives':[{'attributes':attrs,'material':0,'mode':4}],
            'extras':{'lod':lod,'triangles':budget,'recommendedDistanceMeters':[0,12,28][lod]}})
        index=len(d['nodes']);d['nodes'].append({'name':name,'mesh':mesh,'skin':lod})
        d['scenes'].append({'name':f'LOD{lod}_{budget}_triangles','nodes':[rig_roots[lod],index]})
        lod_records.append({'scene':lod,'mesh':name,'triangles':budget,'distanceMeters':[0,12,28][lod]})
    for clip,duration in CLIPS:
        n=round(duration*12)+1;times=np.linspace(0,duration,n)
        frames=[pose(clip,t,duration,rest,scale,c['age']) for t in times]
        quats=np.array([x[0] for x in frames]);translations=np.array([x[1] for x in frames])
        quats[-1]=quats[0];translations[-1]=translations[0]
        # Keep quaternion hemisphere continuous, preventing interpolation flips.
        for j in range(len(NAMES)):
            for i in range(1,n):
                if np.dot(quats[i-1,j],quats[i,j])<0:quats[i,j]*=-1
        input=glb.accessor(times,'SCALAR',bounds=True)
        a={'name':clip,'samplers':[],'channels':[],'extras':{'loop':True,'durationSeconds':duration,'sampleRateHz':(n-1)/duration}}
        for j in range(len(NAMES)):
            a['samplers'].append({'input':input,'output':glb.accessor(quats[:,j],'VEC4'),'interpolation':'LINEAR'})
            for lod in range(3):
                a['channels'].append({'sampler':len(a['samplers'])-1,'target':{'node':rig_roots[lod]+j,'path':'rotation'}})
        a['samplers'].append({'input':input,'output':glb.accessor(translations,'VEC3'),'interpolation':'LINEAR'})
        for lod in range(3):
            a['channels'].append({'sampler':len(a['samplers'])-1,'target':{'node':rig_roots[lod],'path':'translation'}})
        d['animations'].append(a)
    path=ROOT/'models'/(c['id']+'.glb');b=glb.save(path)
    print(path.name,len(b),flush=True)
    return {**c,'file':'models/'+path.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),
            'texture':{'width':256,'height':256,'embedded':True},'joints':17,'lods':lod_records,
            'clips':[{'name':name,'durationSeconds':dur,'loop':True} for name,dur in CLIPS],
            'seatHeightMeters':.46*scale,'seatCenter':[0,.46*scale,-.10*scale]}

if __name__=='__main__':
    records=[export(c) for c in PEOPLE]
    manifest={'schemaVersion':1,'title':'Tennis crowd people v2','created':'2026-11-17',
        'license':'CC0-1.0','units':'meters','upAxis':'+Y','forwardAxis':'+Z',
        'budgetBytes':5000000,'modelCount':14,'lodTriangles':[210,90,24],
        'lodSelection':'Mount all gltf.scenes in one Group and set scene.visible = (index === lod). Bind AnimationMixer to that Group. Each core scene has an independent rig; all five animations target all three rigs using shared keyframe accessors.',
        'rig':{'name':'Crowd17','jointNames':NAMES,'parents':PARENTS},
        'clips':[{'name':name,'durationSeconds':dur,'loop':True} for name,dur in CLIPS],
        'models':records,'modelBytes':sum(r['bytes'] for r in records)}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
