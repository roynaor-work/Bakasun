#!/usr/bin/env python3
"""CC0 alpine content; Python 3.11+, numpy 2.x, Pillow 12.x. No downloads.

Run from any directory. Writes only this package. Metres, Y up, downhill -Z.
PNG model renders are captured from the final GLBs by verify.mjs.
"""
from pathlib import Path
from collections import defaultdict
import json, math, struct, hashlib
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TAU = math.tau
SNOW='#f4f1df'; TEAL='#579f9c'; CORAL='#df8963'; GOLD='#edbd79'
WOOD='#987250'; DARK='#44616b'; ROCK='#7f9b90'; ICE='#9ed7df'
CREAM='#fff8df'; BROWN='#865f48'; TAN='#c29971'

def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

def linear(c):
    v=np.array([int(c[i:i+2],16)/255 for i in (1,3,5)])
    return np.where(v<=.04045,v/12.92,((v+.055)/1.055)**2.4).tolist()

class Mesh:
    def __init__(self): self.groups=defaultdict(list)
    def face(self, ps, c):
        for i in range(1,len(ps)-1):
            tri=np.array([ps[0],ps[i],ps[i+1]],float)
            n=np.cross(tri[1]-tri[0],tri[2]-tri[0]); length=np.linalg.norm(n)
            if length<1e-9: continue
            self.groups[c].append((tri,n/length))
    def box(self,p,s,c):
        p=np.array(p);s=np.array(s)/2
        vs=[p+s*np.array(v) for v in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        for f in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)]: self.face([vs[i] for i in f],c)
    def beam(self,a,b,r,c,n=6,r2=None):
        a=np.array(a,float);b=np.array(b,float);axis=(b-a)/np.linalg.norm(b-a)
        u=np.cross(axis,[0,0,1] if abs(axis[2])<.9 else [0,1,0]);u/=np.linalg.norm(u);v=np.cross(axis,u)
        rings=[[p+rr*(math.cos(i*TAU/n)*u+math.sin(i*TAU/n)*v) for i in range(n)] for p,rr in [(a,r),(b,r if r2 is None else r2)]]
        for i in range(n): j=(i+1)%n;self.face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],c)
        self.face(rings[0][::-1],c);self.face(rings[1],c)
    def ellipsoid(self,p,s,c,n=8,lat=4):
        p=np.array(p,float);s=np.array(s,float)
        rings=[[p+s*np.array([math.sin(j*math.pi/lat)*math.cos(i*TAU/n),math.cos(j*math.pi/lat),math.sin(j*math.pi/lat)*math.sin(i*TAU/n)]) for i in range(n)] for j in range(1,lat)]
        top=p+[0,s[1],0];bottom=p-[0,s[1],0]
        for i in range(n):
            k=(i+1)%n;self.face([top,rings[0][k],rings[0][i]],c);self.face([bottom,rings[-1][i],rings[-1][k]],c)
            for j in range(len(rings)-1): self.face([rings[j][i],rings[j][k],rings[j+1][k],rings[j+1][i]],c)
    def gem(self,p,s,c):
        x,y,z=p;a,b,d=s;r=[(x-a,y,z),(x,y,z+d),(x+a,y,z),(x,y,z-d)]
        for i in range(4): self.face([r[(i+1)%4],(x,y+b,z),r[i]],c);self.face([r[i],(x,y-b,z),r[(i+1)%4]],c)
    def extrude(self,xy,depth,c,z=0):
        # Ear clipping handles the concave star, shield and heart without overlapping fans.
        pts=[np.array(p,float) for p in xy]
        area=sum(pts[i][0]*pts[(i+1)%len(pts)][1]-pts[i][1]*pts[(i+1)%len(pts)][0] for i in range(len(pts)))
        if area<0: pts.reverse()
        ids=list(range(len(pts)));triangles=[]
        cross=lambda a,b,c:float((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))
        while len(ids)>3:
            for j in range(len(ids)):
                a,b,c0=ids[j-1],ids[j],ids[(j+1)%len(ids)]
                if cross(pts[a],pts[b],pts[c0])<=1e-9: continue
                if any(all(x>=-1e-9 for x in [cross(pts[a],pts[b],pts[k]),cross(pts[b],pts[c0],pts[k]),cross(pts[c0],pts[a],pts[k])]) for k in ids if k not in (a,b,c0)):continue
                triangles.append((a,b,c0));ids.pop(j);break
            else: raise ValueError('Non-simple polygon')
        triangles.append(tuple(ids))
        for t in triangles:
            self.face([(pts[i][0],pts[i][1],z+depth/2) for i in t],c)
            self.face([(pts[i][0],pts[i][1],z-depth/2) for i in reversed(t)],c)
        for i in range(len(pts)):
            j=(i+1)%len(pts);a,b=pts[i],pts[j]
            self.face([(a[0],a[1],z-depth/2),(b[0],b[1],z-depth/2),(b[0],b[1],z+depth/2),(a[0],a[1],z+depth/2)],c)
    def ring(self,r,inner,y,h,c,n=16):
        for i in range(n):
            a=i*TAU/n;b=(i+1)*TAU/n
            def p(rad,yy,ang):return (rad*math.cos(ang),yy,rad*math.sin(ang))
            self.face([p(r,y+h,a),p(r,y+h,b),p(r,y,b),p(r,y,a)],c)
            self.face([p(inner,y+h,b),p(inner,y+h,a),p(inner,y,a),p(inner,y,b)],c)
            self.face([p(inner,y+h,b),p(r,y+h,b),p(r,y+h,a),p(inner,y+h,a)],c)
            self.face([p(r,y,b),p(inner,y,b),p(inner,y,a),p(r,y,a)],c)

def star(x=0,y=.8,r=.64):
    return [(x+(r if i%2==0 else r*.46)*math.sin(i*math.pi/5),y+(r if i%2==0 else r*.46)*math.cos(i*math.pi/5)) for i in range(10)]

class Asset:
    def __init__(self,id,name,category,behavior):
        self.id=id;self.name=name;self.category=category;self.behavior=behavior;self.parts=[];self.tracks=[];self.extra={}
    def part(self,name,p=(0,0,0)):
        m=Mesh();self.parts.append((name,m,list(p)));return m
    def track(self,name,node,prop,times,values): self.tracks.append((name,node,prop,times,values))
    def write(self):
        blob=bytearray();views=[];access=[];materials=[];meshes=[];nodes=[{'name':self.id,'children':list(range(1,len(self.parts)+1))}];allpoints=[]
        def attr(data,width,kind,target=None):
            ar=np.asarray(data,dtype='<f4').reshape(-1,width);offset=len(blob);blob.extend(ar.tobytes());v={'buffer':0,'byteOffset':offset,'byteLength':ar.nbytes}
            if target:v['target']=target
            views.append(v);a={'bufferView':len(views)-1,'componentType':5126,'count':len(ar),'type':kind}
            if kind in ('VEC3','SCALAR'): a.update(min=ar.min(axis=0).tolist(),max=ar.max(axis=0).tolist())
            access.append(a);return len(access)-1
        colors=list(dict.fromkeys(c for _,m,_ in self.parts for c in m.groups))
        for c in colors: materials.append({'name':c,'pbrMetallicRoughness':{'baseColorFactor':linear(c)+[1],'metallicFactor':0,'roughnessFactor':.9}})
        triangles=0
        for name,m,p in self.parts:
            prim=[]
            for c,ts in m.groups.items():
                pos=np.concatenate([t[0] for t in ts]);normal=np.concatenate([np.tile(t[1],(3,1)) for t in ts]);triangles+=len(ts)
                prim.append({'attributes':{'POSITION':attr(pos,3,'VEC3',34962),'NORMAL':attr(normal,3,'VEC3',34962)},'material':colors.index(c),'mode':4})
                allpoints.extend(pos+np.array(p))
            meshes.append({'name':name,'primitives':prim});nodes.append({'name':name,'mesh':len(meshes)-1,'translation':p})
        animations=[]
        for clip in dict.fromkeys(t[0] for t in self.tracks):
            samplers=[];channels=[]
            for name,node,prop,times,vals in self.tracks:
                if name!=clip:continue
                inp=attr(times,1,'SCALAR');out=attr(vals,4 if prop=='rotation' else 3,'VEC4' if prop=='rotation' else 'VEC3')
                samplers.append({'input':inp,'output':out,'interpolation':'LINEAR'});channels.append({'sampler':len(samplers)-1,'target':{'node':node,'path':prop}})
            animations.append({'name':clip,'samplers':samplers,'channels':channels})
        doc={'asset':{'version':'2.0','generator':'Bakasun alpine-content-v1 CC0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'meshes':meshes,'materials':materials,'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':access}
        if animations:doc['animations']=animations
        path=ROOT/'models'/f'{self.id}.glb';write_glb(path,doc,blob)
        bounds=np.array(allpoints);lo=bounds.min(axis=0);hi=bounds.max(axis=0)
        entry={'id':self.id,'name':self.name,'category':self.category,'glb':f'models/{self.id}.glb','png':f'png/{self.id}.png','triangles':triangles,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bounds':{'min':lo.round(5).tolist(),'max':hi.round(5).tolist()},'pivot':[0,0,0],'behavior':self.behavior,'clips':[{'name':n,'durationSeconds':max(max(t[3]) for t in self.tracks if t[0]==n)} for n in dict.fromkeys(t[0] for t in self.tracks)],'license':'CC0-1.0',**self.extra}
        print(self.id,triangles,path.stat().st_size,flush=True)
        if self.category!='effect':assert 100<=triangles<=600,(self.id,triangles)
        return entry

def write_glb(path,doc,blob):
    js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);blob=bytes(blob)+b'\0'*((-len(blob))%4)
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob)

def quat(axis,angle):
    return [*(np.array(axis)*math.sin(angle/2)).tolist(),math.cos(angle/2)]

def obstacles():
    assets=[]
    a=Asset('falling-tree','עץ נופל','obstacle','jump-or-avoid');m=a.part('trunk-and-snow',(-2.1,0,0));m.beam((0,.5,0),(4.2,.5,0),.26,WOOD,10,.17)
    for x in [.5,1.6,2.7,3.6]:
        m.beam((x,.52,0),(x+.3,.64,-.65),.09,WOOD);m.ellipsoid((x,.73,0),(.55,.16,.26),SNOW,8,3)
    m.beam((4.21,.5,0),(4.23,.5,0),.14,GOLD,10)
    a.track('fall',1,'rotation',[0,.35,1.1,1.3],[quat([0,0,1],1.35),quat([0,0,1],1.35),quat([0,0,1],-.03),quat([0,0,1],0)])
    a.extra={'collision':{'type':'box','center':[0,.5,0],'halfExtents':[2.1,.32,.7]},'animationMode':'once-clamp','animatedSweepRadiusMetres':4.5,'animationBounds':{'min':[-3.2,-.2,-.85],'max':[2.4,4.5,.35]}};assets.append(a)
    a=Asset('boulder','סלע','obstacle','avoid');m=a.part('faceted-boulder');m.ellipsoid((0,.68,0),(1.05,.75,.85),ROCK,10,5);m.ellipsoid((-.14,1.17,-.1),(.74,.3,.61),SNOW,8,3)
    for x,z in [(-.9,.55),(.8,.56)]:m.gem((x,.13,z),(.23,.14,.2),ROCK)
    a.extra={'collision':{'type':'sphere','center':[0,.7,0],'radius':1.05}};assets.append(a)
    a=Asset('deep-snow','שלג כבד','obstacle','slow-zone');m=a.part('powder-drift');m.ellipsoid((0,.09,0),(1.7,.48,1.25),SNOW,16,5)
    for x,z in [(-.9,-.2),(.8,.3),(.25,-.6)]:m.ellipsoid((x,.23,z),(.48,.3,.44),CREAM,8,3)
    a.extra={'collision':{'type':'zone','halfExtents':[1.7,.5,1.25]},'suggestedSpeedMultiplier':.62};assets.append(a)
    a=Asset('fence','גדר','obstacle','jump-or-avoid');m=a.part('snow-fence')
    for x in [-1.8,0,1.8]:m.beam((x,0,0),(x,1.14,0),.095,WOOD,8);m.ellipsoid((x,1.15,0),(.15,.09,.15),SNOW,6,3)
    for y in [.42,.88]:m.box((0,y,0),(3.8,.16,.12),CORAL)
    for i in range(8):m.beam((-1.7+i*.47,.32,.01),(-1.47+i*.47,.98,.01),.035,TEAL,4)
    a.extra={'collision':{'type':'box','center':[0,.6,0],'halfExtents':[1.95,.62,.16]}};assets.append(a)
    a=Asset('warning-sign','שלט','obstacle','avoid');m=a.part('warning-sign');m.beam((0,0,0),(0,1.9,0),.095,WOOD,8);m.extrude([(-.58,1.68),(0,1.14),(.58,1.68),(0,2.22)],.13,CORAL)
    m.extrude([(-.43,1.68),(0,1.28),(.43,1.68),(0,2.08)],.025,CREAM,.085);m.box((0,1.77,.112),(.09,.35,.028),DARK);m.ellipsoid((0,1.47,.12),(.06,.06,.03),DARK,6,3);m.ellipsoid((0,2.16,0),(.33,.1,.14),SNOW,8,3)
    a.extra={'collision':{'type':'box','center':[0,1.1,0],'halfExtents':[.59,1.12,.16]}};assets.append(a)
    a=Asset('ice-patch','קרח','obstacle','slippery-zone');m=a.part('matte-ice');m.ellipsoid((0,.025,0),(1.55,.09,1.2),ICE,20,4)
    for x,z in [(-.8,.3),(.1,.6),(.5,-.5)]:
        m.beam((x,.111,z),(x+.45,.113,z-.3),.018,CREAM,4);m.beam((x+.23,.112,z-.14),(x+.16,.113,z-.4),.013,CREAM,4)
    for x,z in [(-1.3,.3),(1.1,-.55)]:m.ellipsoid((x,.05,z),(.34,.1,.28),SNOW,8,3)
    a.extra={'collision':{'type':'zone','halfExtents':[1.55,.12,1.2]},'suggestedGripMultiplier':.35};assets.append(a)
    a=Asset('snow-hole','חור','obstacle','jump-or-avoid');m=a.part('recessed-hole');m.ring(1.35,1.07,-.05,.15,SNOW,20)
    for i in range(20):
        t=i*TAU/20;u=(i+1)*TAU/20;m.face([(1.07*math.cos(t),.1,1.07*math.sin(t)),(.6*math.cos(t),-.65,.6*math.sin(t)),(.6*math.cos(u),-.65,.6*math.sin(u)),(1.07*math.cos(u),.1,1.07*math.sin(u))],DARK)
    m.beam((0,-.72,0),(0,-.67,0),.62,'#314d5b',20)
    a.extra={'terrainCutout':{'shape':'circle','radius':1.08,'required':True},'collision':{'type':'pit','radius':1.07,'depth':.72}};assets.append(a)
    a=Asset('spring-pad','קפיץ','obstacle','bounce');m=a.part('base');m.box((0,.08,0),(1.3,.16,1.3),DARK);m=a.part('coil')
    for i in range(32):
        def p(j):t=j*TAU*3/32;return (.34*math.cos(t),.16+j/32*.65,.34*math.sin(t))
        m.beam(p(i),p(i+1),.045,GOLD,4)
    m=a.part('launch-pad',(0,.88,0));m.box((0,0,0),(1.18,.16,1.18),TEAL);m.extrude(star(0,0,.34),.025,CREAM,.61)
    # The emblem is on the vertical front face; the spring remains readable from behind.
    a.track('bounce',3,'translation',[0,.18,.37,.65],[[0,.88,0],[0,.58,0],[0,1.18,0],[0,.88,0]])
    a.extra={'collision':{'type':'zone','halfExtents':[.65,.98,.65]},'animationMode':'once-clamp'};assets.append(a)
    for id,label,high in [('high-ramp','רמפה גבוהה',True),('trick-ramp','רמפת טריקים',False)]:
        a=Asset(id,label,'obstacle','launch-high' if high else 'launch-trick');m=a.part('curved-snow-kicker');w=1.25 if high else 1.5;length=4 if high else 2.8;height=2 if high else 1.22
        for i in range(10):
            t=i/10;u=(i+1)/10;z=length/2-t*length;zz=length/2-u*length;y=.08+height*t*t;yy=.08+height*u*u
            m.face([(-w,y,z),(w,y,z),(w,yy,zz),(-w,yy,zz)],SNOW)
            m.face([(-w,0,z),(-w,y,z),(-w,yy,zz),(-w,0,zz)],ROCK);m.face([(w,0,zz),(w,yy,zz),(w,y,z),(w,0,z)],ROCK)
            for x in [-w,w]:m.beam((x,y+.03,z),(x,yy+.03,zz),.035,CORAL if high else TEAL,4)
        m.face([(-w,0,-length/2),(-w,height+.08,-length/2),(w,height+.08,-length/2),(w,0,-length/2)],ROCK)
        m.face([(-w,0,length/2),(w,0,length/2),(w,.08,length/2),(-w,.08,length/2)],ROCK)
        # Two inlaid chevrons follow the curved surface, downhill toward -Z.
        for z0 in [.3,1.0] if high else [.2,.7]:
            def surf(x,z):return (x,.10+height*((length/2-z)/length)**2,z)
            for side in [-1,1]:m.face([surf(0,z0-.34),surf(side*.6,z0+.1),surf(side*.6,z0+.24),surf(0,z0-.16)],GOLD)
        a.extra={'collision':{'type':'ramp','width':w*2,'length':length,'exitHeight':height+.08,'profile':'quadratic','downhillAxis':'-Z'},'launchAnchor':[0,height+.08,-length/2]};assets.append(a)
    a=Asset('narrow-passage','מעבר צר','obstacle','thread-gap');m=a.part('left-wall');m.ellipsoid((-1.65,1,0),(.85,1.05,1.6),ROCK,8,4);m.ellipsoid((-1.65,1.72,0),(.75,.37,1.35),SNOW,8,3);m=a.part('right-wall');m.ellipsoid((1.65,1,0),(.85,1.05,1.6),ROCK,8,4);m.ellipsoid((1.65,1.72,0),(.75,.37,1.35),SNOW,8,3)
    for x in [-.85,.85]:m.beam((x,0,.85),(x,1.1,.85),.05,TEAL,6);m.gem((x,1.1,.85),(.12,.16,.1),CORAL)
    a.extra={'clearanceMetres':1.6,'collision':{'type':'compound','boxes':[{'center':[-1.65,1,0],'halfExtents':[.85,1.1,1.6]},{'center':[1.65,1,0],'halfExtents':[.85,1.1,1.6]}]}};assets.append(a)
    a=Asset('bridge','גשר','obstacle','balance-crossing');m=a.part('plank-deck')
    for z in np.linspace(-2.25,2.25,12):m.box((0,.3,z),(2.2,.2,.37),WOOD)
    for x in [-1.17,1.17]:
        m.box((x,.18,0),(.16,.22,5.0),DARK)
        for z in [-2.35,0,2.35]:m.beam((x,0,z),(x,1.1,z),.075,WOOD,6);m.ellipsoid((x,1.1,z),(.12,.06,.12),SNOW,6,3)
        for y in [.65,1.0]:m.beam((x,y,-2.35),(x,y,2.35),.035,TEAL,6)
    for z in [-2.18,1.78]:m.box((0,.42,z),(2.17,.04,.34),SNOW)
    a.extra={'collision':{'type':'bridge','deckHalfExtents':[1.1,.1,2.5],'deckY':.4,'railX':1.17},'entryAnchor':[0,.4,2.5],'exitAnchor':[0,.4,-2.5]};assets.append(a)
    return assets

def bonuses():
    out=[]
    for id,label,kind in [('star','כוכב','score'),('magnet','מגנט','attract'),('shield','מגן','protect'),('boost','האצה','speed'),('clock','שעון','time'),('double-coin','מטבע כפול','score-multiplier'),('magic-wand','מטה קסמים','clear-path'),('heart','לב','life')]:
        a=Asset(id,label,'bonus',kind);m=a.part('collectible')
        if id=='star':
            m.extrude(star(),.23,GOLD);m.extrude(star(r=.48),.035,CREAM,.135)
            for x in [-.21,.21]:m.gem((x,.78,.18),(.055,.08,.035),GOLD)
            m.ellipsoid((0,.8,0),(.28,.3,.17),GOLD,8,3)
        elif id=='magnet':
            for i in range(12):
                t=math.pi+i*math.pi/12;u=math.pi+(i+1)*math.pi/12
                m.extrude([(.6*math.cos(t),.95+.6*math.sin(t)),(.6*math.cos(u),.95+.6*math.sin(u)),(.31*math.cos(u),.95+.31*math.sin(u)),(.31*math.cos(t),.95+.31*math.sin(t))],.25,CORAL)
            for x in [-.455,.455]:m.box((x,1.05,0),(.29,.45,.25),CORAL);m.box((x,1.3,0),(.29,.16,.25),CREAM)
        elif id=='shield':
            xy=[(-.6,1.3),(0,1.5),(.6,1.3),(.51,.65),(0,.17),(-.51,.65)];m.extrude(xy,.22,TEAL);m.extrude([(x*.78,.84+(y-.84)*.78) for x,y in xy],.04,CREAM,.13);m.extrude(star(0,.92,.3),.04,GOLD,.17);m.ellipsoid((0,.86,-.04),(.45,.5,.14),TEAL,8,3)
        elif id=='boost':
            xy=[(.1,1.55),(-.47,.77),(-.08,.77),(-.25,.15),(.5,.99),(.08,.99)];m.extrude(xy,.25,GOLD);m.extrude([(x*.67,.85+(y-.85)*.67) for x,y in xy],.03,CREAM,.15)
            for x,y in [(-.7,.65),(-.65,.95),(-.49,1.26),(-.32,1.49)]:m.gem((x,y,0),(.14,.05,.06),TEAL)
            m.ellipsoid((0,.78,-.06),(.34,.42,.16),GOLD,8,3)
        elif id=='clock':
            # Cylinder axis Z; real hands instead of a text decal.
            m.beam((0,.83,-.13),(0,.83,.13),.61,TEAL,16);m.beam((0,.83,.135),(0,.83,.16),.5,CREAM,16);m.beam((0,1.46,0),(0,1.57,0),.12,GOLD,8)
            m.beam((0,.83,.18),(0,1.15,.18),.035,DARK,4);m.beam((0,.83,.18),(.25,.83,.18),.035,CORAL,4)
            for x,y in [(0,1.24),(0,.42),(-.41,.83),(.41,.83)]:m.box((x,y,.18),(.055,.055,.02),GOLD)
        elif id=='double-coin':
            for x,z in [(-.18,-.12),(.18,.14)]:
                m.beam((x,.82,z-.12),(x,.82,z+.12),.54,GOLD,16);m.beam((x,.82,z+.13),(x,.82,z+.15),.42,CREAM,16);m.extrude(star(x,.82,.26),.025,GOLD,z+.18)
        elif id=='magic-wand':
            m.beam((-.28,.12,0),(.2,1.13,0),.075,TEAL,8);m.beam((-.3,.09,0),(-.2,.3,0),.09,GOLD,8);m.extrude(star(.25,1.3,.4),.18,GOLD)
            for x,y in [(-.35,1.4),(.8,1.15),(.65,1.85)]:m.gem((x,y,0),(.09,.14,.05),CREAM)
        else:
            xy=[(0,.22),(-.58,.8),(-.62,1.08),(-.43,1.34),(-.2,1.36),(0,1.17),(.2,1.36),(.43,1.34),(.62,1.08),(.58,.8)]
            m.extrude(xy,.25,CORAL);m.extrude([(x*.76,.87+(y-.87)*.76) for x,y in xy],.04,'#efb39a',.145);m.ellipsoid((-.23,1.13,.19),(.12,.07,.025),CREAM,8,3)
        # Reusable spin is a standard glTF clip; 0 and 2pi need intermediate quaternions.
        a.track('collect',0,'rotation',[0,.5,1,1.5,2],[quat([0,1,0],q) for q in [0,math.pi/2,math.pi,3*math.pi/2,TAU]])
        a.extra={'collision':{'type':'collect-sphere','center':[0,.85,0],'radius':.72},'floatHeightMetres':.65,'animationMode':'loop'};out.append(a)
    return out

def enemies():
    out=[]
    a=Asset('bear','דוב','enemy','amble-across');m=a.part('body');m.ellipsoid((0,.88,0),(.48,.52,.8),BROWN,10,4);m.ellipsoid((0,1.23,-.68),(.4,.4,.34),BROWN,8,4);m.ellipsoid((0,1.13,-.96),(.26,.19,.18),TAN,8,3);m.gem((0,1.2,-1.12),(.12,.07,.05),DARK)
    for x in [-.28,.28]:m.ellipsoid((x,1.56,-.65),(.14,.15,.1),BROWN,6,3);m.gem((x*.71,1.35,-.95),(.037,.04,.025),DARK)
    for i,(x,z) in enumerate([(-.3,-.5),(.3,-.5),(-.3,.5),(.3,.5)]):
        m=a.part(f'leg-{i}',(x,.68,z));m.beam((0,0,0),(0,-.51,0),.16,BROWN,6);m.box((0,-.51,-.055),(.28,.17,.37),BROWN)
        a.track('amble',i+2,'rotation',[0,.35,.7,1.05,1.4],[quat([1,0,0],v*(1 if i in [0,3] else -1)) for v in [-.28,0,.28,0,-.28]])
    a.extra={'collision':{'type':'capsule','radius':.5,'height':1.55,'length':2.15},'animationMode':'loop','movementHint':'translate root laterally; clip animates feet only'};out.append(a)
    a=Asset('deer','צבי','enemy','bound-across');m=a.part('body');m.ellipsoid((0,1.05,0),(.31,.38,.65),TAN,8,4);m.beam((0,1.13,-.38),(0,1.71,-.62),.2,TAN,8,.14);m.ellipsoid((0,1.75,-.75),(.21,.25,.34),TAN,8,3);m.gem((0,1.7,-1.08),(.1,.07,.06),DARK);m.gem((0,1.24,.7),(.1,.2,.22),CREAM)
    for x in [-.17,.17]:
        m.gem((x,1.99,-.69),(.18,.14,.09),TAN);m.gem((x*.9,1.83,-.97),(.025,.035,.02),DARK)
        m.beam((x,1.94,-.62),(x*1.65,2.32,-.42),.035,WOOD,4);m.beam((x*1.3,2.13,-.53),(x*2.2,2.21,-.63),.028,WOOD,4);m.beam((x*1.65,2.32,-.42),(x*2.1,2.48,-.5),.026,WOOD,4)
    for i,(x,z) in enumerate([(-.2,-.4),(.2,-.4),(-.2,.42),(.2,.42)]):
        m=a.part(f'leg-{i}',(x,.89,z));m.beam((0,0,0),(0,-.67,.07),.065,TAN,5,.045);m.box((0,-.74,.05),(.13,.15,.19),DARK)
        a.track('bound',i+2,'rotation',[0,.22,.44,.66,.88],[quat([1,0,0],v*(1 if i<2 else -1)) for v in [-.4,0,.4,0,-.4]])
    a.track('bound',0,'translation',[0,.22,.44,.66,.88],[[0,0,0],[0,.14,0],[0,0,0],[0,.14,0],[0,0,0]])
    a.extra={'collision':{'type':'capsule','radius':.33,'height':1.9,'length':1.9},'animationMode':'loop'};out.append(a)
    a=Asset('snowman','אדם שלג','enemy','wobble');m=a.part('snowman');m.ellipsoid((0,.48,0),(.58,.49,.5),SNOW,10,5);m.ellipsoid((0,1.12,0),(.43,.4,.38),SNOW,8,4);m.ellipsoid((0,1.65,0),(.32,.32,.3),CREAM,8,4);m.beam((0,1.65,-.26),(0,1.64,-.62),.085,CORAL,6,0)
    for x in [-.12,.12]:m.gem((x,1.77,-.26),(.035,.04,.04),DARK)
    m.beam((0,1.91,0),(0,1.97,0),.4,DARK,10);m.beam((0,1.94,0),(0,2.25,0),.25,DARK,10);m.beam((0,1.96,0),(0,2.04,0),.255,CORAL,10)
    m.beam((0,1.39,0),(0,1.49,0),.37,TEAL,10);m.box((.28,1.16,-.29),(.18,.55,.08),TEAL)
    for x in [-1,1]:m.beam((x*.32,1.2,0),(x*.86,1.49,0),.035,WOOD,5)
    for y in [.8,1.08,1.3]:m.gem((0,y,-.38),(.045,.05,.035),DARK)
    a.track('wobble',0,'rotation',[0,.4,.8,1.2,1.6],[quat([0,0,1],v) for v in [-.12,0,.12,0,-.12]])
    a.extra={'collision':{'type':'capsule','radius':.6,'height':2.25},'animationMode':'loop'};out.append(a)
    return out

def rival():
    # Reuse the requested style's ready CC0 skier, retaining its exact geometry.
    source=ROOT.parent/'alpine-themes-v1/shared/reference-skier.glb';b=source.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);blob=bytearray(b[28+n:]);j['nodes'][0]['name']='rival-skier'
    def attr(data,w,kind):
        a=np.array(data,dtype='<f4').reshape(-1,w);off=len(blob);blob.extend(a.tobytes());j['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':a.nbytes});v={'bufferView':len(j['bufferViews'])-1,'componentType':5126,'count':len(a),'type':kind}
        if w==1:v.update(min=[float(a.min())],max=[float(a.max())])
        j['accessors'].append(v);return len(j['accessors'])-1
    inp=attr([0,.4,.8,1.2,1.6],1,'SCALAR');out=attr([quat([0,0,1],q) for q in [-.17,0,.17,0,-.17]],4,'VEC4')
    j['animations']=[{'name':'carve','samplers':[{'input':inp,'output':out,'interpolation':'LINEAR'}],'channels':[{'sampler':0,'target':{'node':0,'path':'rotation'}}]}];j['buffers'][0]['byteLength']=len(blob);write_glb(ROOT/'models/rival-skier.glb',j,blob)
    pts=[];tris=0
    for mesh in j['meshes']:
        for p in mesh['primitives']:
            ac=j['accessors'][p['attributes']['POSITION']];view=j['bufferViews'][ac['bufferView']];ar=np.frombuffer(blob,dtype='<f4',count=ac['count']*3,offset=view.get('byteOffset',0)+ac.get('byteOffset',0)).reshape(-1,3);pts.extend(ar);tris+=ac['count']//3
    pts=np.array(pts);p=ROOT/'models/rival-skier.glb'
    return {'id':'rival-skier','name':'גולש מתחרה','category':'enemy','glb':'models/rival-skier.glb','png':'png/rival-skier.png','triangles':tris,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bounds':{'min':pts.min(0).tolist(),'max':pts.max(0).tolist()},'pivot':[0,0,0],'behavior':'overtake','clips':[{'name':'carve','durationSeconds':1.6}],'collision':{'type':'capsule','radius':.42,'height':1.7},'animationMode':'loop','license':'CC0-1.0','source':'../alpine-themes-v1/shared/reference-skier.glb','sourceSha256':hashlib.sha256(b).hexdigest()}

def effects():
    out=[]
    for level,count in [('light',14),('medium',28),('heavy',48)]:
        a=Asset(f'snow-spray-{level}',{'light':'שלג קל','medium':'שלג בינוני','heavy':'שלג חזק'}[level],'effect','snow-spray');rng=np.random.default_rng(count)
        for i in range(count):
            end=np.array([rng.uniform(-1,1),rng.uniform(.3,1.4),rng.uniform(.1,1.8)])*(.6+count/48*.55);mid=end*np.array([.5,.85,.5]);size=rng.uniform(.035,.095)
            m=a.part(f'flake-{i}',mid);m.gem((0,0,0),(size,size*.8,size),CREAM if i%3 else '#c6dbd6');times=[0,.14,.48,.9]
            a.track('spray',i+1,'translation',times,[[0,.05,0],(end*.2).tolist(),mid.tolist(),(end-[0,.3,0]).tolist()]);a.track('spray',i+1,'scale',times,[[.01]*3,[1]*3,[.8]*3,[0]*3])
        a.extra={'animationMode':'once-clamp','particleCount':count,'durationSeconds':.9,'maxConcurrent':{'light':4,'medium':3,'heavy':2}[level]};out.append(a)
    a=Asset('skier-trail','שובל גולש','effect','ski-trail');m=a.part('twin-track-ribbon')
    for x in [-.22,.22]:
        for i in range(28):
            z=i*.14;zz=(i+1)*.14;offset=.12*math.sin(z*1.7);offset2=.12*math.sin(zz*1.7)
            for dx,c in [(-.04,TEAL),(.04,SNOW)]:m.face([(x+offset+dx-.04,.014,z),(x+offset2+dx-.04,.014,zz),(x+offset2+dx+.04,.014,zz),(x+offset+dx+.04,.014,z)],c)
    a.extra={'staticSample':True,'runtimeModule':'effects/runtime.mjs','surfaceOffsetMetres':.014,'lifetimeSeconds':1.15,'maxSegmentsPerSki':28};out.append(a)
    return out

def textures():
    n=64;yy,xx=np.mgrid[-1:1:complex(n),-1:1:complex(n)];alpha=np.clip((1-(xx*xx+yy*yy))**2,0,1);alpha[xx*xx+yy*yy>=1]=0
    rgba=np.zeros((n,n,4),np.uint8);rgba[:,:,:3]=[244,241,223];rgba[:,:,3]=(alpha*210).astype(np.uint8)
    Image.fromarray(rgba).save(ROOT/'effects/powder-particle.png',optimize=True)
    h=128;w=32;v,u=np.mgrid[0:1:complex(h),-1:1:complex(w)];im=np.zeros((h,w,4),np.uint8);im[:,:,:3]=[151,190,187];im[:,:,3]=(np.clip(1-u*u,0,1)*np.sin(v*math.pi)**.45*150).astype(np.uint8)
    Image.fromarray(im).save(ROOT/'effects/trail-strip.png',optimize=True)

def main():
    for folder in ['models','png','effects','verification']:(ROOT/folder).mkdir(parents=True,exist_ok=True)
    items=[a.write() for a in obstacles()+bonuses()+enemies()];items.insert(22,rival());items.extend(a.write() for a in effects());textures()
    themes=json.loads((ROOT.parent/'alpine-themes-v1/manifest.json').read_text())
    manifest={'schemaVersion':1,'id':'alpine-content-v1','created':'2026-11-16','license':'CC0-1.0','designOnly':True,'units':'metres','upAxis':'+Y','forwardAxis':'-Z','cameraAxis':'+Z','png':{'size':[320,320],'alpha':'straight','colorSpace':'sRGB','purpose':'transparent 3D render; sprite fallback or catalogue'},'style':{'reference':'../alpine-themes-v1/manifest.json','referenceCommit':'c918a88f9c6b1d2b66f6cd97cbac9b741e7e6ef9','description':'warm low poly / soft matte / coral and teal','palette':{'snow':SNOW,'coral':CORAL,'teal':TEAL,'gold':GOLD,'rock':ROCK},'themePalettes':[{'id':t['id'],'palette':t['palette']} for t in themes['themes']]},'limits':{'packageBytes':3000000,'modelTriangles':[100,600]},'counts':{'obstacles':12,'bonuses':8,'enemies':4,'effects':4},'assets':items,'effects':{'runtimeModule':'effects/runtime.mjs','particleTexture':'effects/powder-particle.png','trailTexture':'effects/trail-strip.png','intensities':[{'id':'light','emitPerSecond':18,'maxParticles':24},{'id':'medium','emitPerSecond':42,'maxParticles':48},{'id':'heavy','emitPerSecond':78,'maxParticles':96}],'trail':{'segmentsPerSki':28,'lifetimeSeconds':1.15,'widthMetres':.12,'surfaceOffsetMetres':.014}},'integrationNotes':['GLBs embed all geometry and materials; no decoder, textures or external URI required.','Collision entries and suggested multipliers are design metadata, not active gameplay.','snow-hole requires the host terrain to cut out a 1.08m radius circle; it is not a dark decal.','falling-tree fall clip starts upright and ends fallen; widen collision during its 4.5m sweep.','Enemy animation loops do not move through the course; translate the root externally.','Use one AnimationMixer per independently animated instance.','PNG renders are normalized to fit; use GLB metre bounds for gameplay scale.','Static skier-trail.glb demonstrates the shape; runtime.mjs builds a moving trail from actual ski positions.']}
    dump(ROOT/'manifest.json',manifest)

if __name__=='__main__':main()
