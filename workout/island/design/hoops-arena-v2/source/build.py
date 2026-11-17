"""Build an original complete, unbranded arena as portable core glTF 2.0.

python3 workout/island/design/hoops-arena-v2/source/build.py
Metres, +Y up, X court length, Z court width. All textures embedded in GLB.
No Blender, Draco, external model, or proprietary glTF extension is required.
Meshes are shared for seating; preview batches these into GPU instances.
"""
from collections import OrderedDict
from pathlib import Path
import math
import struct
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'assets'
OUT.mkdir(exist_ok=True)
TAU = math.tau


def linear(h):
    vals = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    return [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in vals]


class Mesh:
    def __init__(self):
        self.p, self.n, self.uv, self.ix = [], [], [], []
        self.cache = {}

    def vertex(self, p, n, uv=None):
        key = tuple(round(float(v), 7) for v in (*p, *n, *(uv or ())))
        if key not in self.cache:
            self.cache[key] = len(self.p)
            self.p.append(tuple(p)); self.n.append(tuple(n))
            if uv is not None: self.uv.append(uv)
        return self.cache[key]

    def face(self, pts, normal=None, uvs=None):
        if normal is None:
            a,b,c = map(np.asarray, pts[:3])
            normal = np.cross(b-a, c-a)
            normal /= np.linalg.norm(normal)
        idx = [self.vertex(p, normal, None if uvs is None else uvs[i]) for i,p in enumerate(pts)]
        for i in range(1,len(idx)-1): self.ix.extend([idx[0],idx[i],idx[i+1]])


class Kit:
    def __init__(self):
        self.meshes = OrderedDict()
    def get(self, group, mat):
        return self.meshes.setdefault((group,mat), Mesh())
    def face(self,g,m,pts,**kw): self.get(g,m).face(pts,**kw)

    def box(self,g,m,p,s,angle=0,bevel=0):
        # Six planar faces; optional chamfer adds twelve edges and eight corners.
        p=np.array(p,dtype=float); h=np.array(s,dtype=float)/2
        rot=np.array([[math.cos(angle),0,math.sin(angle)],[0,1,0],[-math.sin(angle),0,math.cos(angle)]])
        def add(vs):
            n=np.cross(vs[1]-vs[0],vs[2]-vs[0])
            if np.dot(n,np.mean(vs,axis=0))<0: vs=list(reversed(vs))
            self.face(g,m,[p+rot@v for v in vs])
        if not bevel:
            for axis in range(3):
                b,c=[a for a in range(3) if a!=axis]
                for sign in (-1,1):
                    vs=[]
                    for sb,sc in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                        v=np.zeros(3);v[axis]=sign*h[axis];v[b]=sb*h[b];v[c]=sc*h[c];vs.append(v)
                    add(vs)
            return
        r=min(bevel,float(min(h))*.8)
        for axis in range(3):
            b,c=[a for a in range(3) if a!=axis]
            for sign in (-1,1):
                vs=[]
                for sb,sc in [(-1,-1),(1,-1),(1,1),(-1,1)]:
                    v=np.zeros(3);v[axis]=sign*h[axis];v[b]=sb*(h[b]-r);v[c]=sc*(h[c]-r);vs.append(v)
                add(vs)
        for a in range(3):
            b,c=[t for t in range(3) if t!=a]
            for sb in (-1,1):
                for sc in (-1,1):
                    vs=[]
                    for sa,edge in [(-1,0),(1,0),(1,1),(-1,1)]:
                        v=np.zeros(3);v[a]=sa*(h[a]-r)
                        v[b]=sb*(h[b]-(r if edge else 0));v[c]=sc*(h[c]-(0 if edge else r));vs.append(v)
                    add(vs)
        for sx in (-1,1):
            for sy in (-1,1):
                for sz in (-1,1):
                    signs=np.array([sx,sy,sz]);vs=[]
                    for a in range(3):
                        v=signs*(h-r);v[a]=signs[a]*h[a];vs.append(v)
                    add(vs)

    def tube(self,g,m,a,b,r,segments=8,cap=True,r2=None):
        a=np.array(a,dtype=float);b=np.array(b,dtype=float)
        direction=b-a;direction/=np.linalg.norm(direction)
        temp=np.array([0.,1.,0.]) if abs(direction[1])<.9 else np.array([1.,0.,0.])
        v=np.cross(direction,temp);v/=np.linalg.norm(v);w=np.cross(direction,v)
        ns=[v*math.cos(i*TAU/segments)+w*math.sin(i*TAU/segments) for i in range(segments)]
        r2=r if r2 is None else r2
        mesh=self.get(g,m)
        for i in range(segments):
            j=(i+1)%segments
            points=[a+ns[i]*r,a+ns[j]*r,b+ns[j]*r2,b+ns[i]*r2]
            # Cylinder surface winds outward around the axial direction.
            ids=[mesh.vertex(p,n) for p,n in zip(points,[ns[i],ns[j],ns[j],ns[i]])]
            mesh.ix.extend([ids[0],ids[1],ids[2],ids[0],ids[2],ids[3]])
        if cap:
            mesh.face([a+n*r for n in reversed(ns)],-direction)
            mesh.face([b+n*r2 for n in ns],direction)

    def plane(self,g,m,x0,x1,z0,z1,y,repeat=None):
        pts=[(x0,y,z0),(x0,y,z1),(x1,y,z1),(x1,y,z0)]
        uv=None if repeat is None else [(x0/repeat,z0/repeat),(x0/repeat,z1/repeat),(x1/repeat,z1/repeat),(x1/repeat,z0/repeat)]
        self.face(g,m,pts,normal=(0,1,0),uvs=uv)

    def line(self,g,m,points,width=.05,y=.024):
        for a,b in zip(points[:-1],points[1:]):
            a=np.array(a,dtype=float);b=np.array(b,dtype=float)
            d=b-a;n=np.array([-d[1],d[0]])*width/(2*np.linalg.norm(d))
            q=[a-n,a+n,b+n,b-n]
            self.face(g,m,[(v[0],y,v[1]) for v in q],normal=(0,1,0))

    def arc(self,g,m,c,r,start=0,end=TAU,width=.05,y=.025,steps=128):
        pts=[(c[0]+r*math.cos(a),c[1]+r*math.sin(a)) for a in np.linspace(start,end,steps+1)]
        self.line(g,m,pts,width,y)


kit=Kit()
materials=OrderedDict()
def mat(name,color,rough=.65,metal=0,alpha=1,emissive=None):
    pbr={'baseColorFactor':[*linear(color),alpha],'metallicFactor':metal,'roughnessFactor':rough}
    m={'name':name,'pbrMetallicRoughness':pbr}
    if alpha<1: m.update(alphaMode='BLEND',doubleSided=True)
    if emissive: m['emissiveFactor']=linear(emissive)
    materials[name]=m

mat('maple','ffffff',1)
mat('ink','152630',.43)
mat('paint','315b67',.32)
mat('chalk','f0ebda',.38)
mat('concrete','46525c',.86)
mat('riser','242f3b',.83)
mat('wall','303d49',.81)
mat('acoustic','202a35',.94)
mat('seat-lower','286276',.43)
mat('seat-middle','244858',.46)
mat('seat-upper','325967',.49)
mat('seat-accent','ba7850',.47)
mat('steel','8a9ba7',.35,.72)
mat('dark-steel','182530',.48,.58)
mat('rail','778b98',.50,.68)
mat('rim','f07835',.28,.25)
mat('net','ece7d9',.85)
mat('glass','b9dde4',.12,alpha=.21)
mat('rubber','101f2c',.65)
mat('warm-led','fff0c9',.42,emissive='fff0c9')
mat('white-led','d6e9ef',.35,emissive='d6e9ef')
mat('ad-cyan','3e91a1',.5,emissive='27535d')
mat('ad-amber','cc9162',.5,emissive='513925')


def court():
    g='Court'
    kit.box(g,'dark-steel',(0,-.22,0),(34.8,.4,21.2),bevel=.06)
    kit.plane(g,'ink',-17.3,17.3,-10.5,10.5,-.012)
    kit.plane(g,'maple',-15.4,15.4,-8.9,8.9,0,repeat=4)
    # Narrow double boundary inlays and a natural timber safety apron.
    kit.line(g,'chalk',[(-14,-7.5),(-14,7.5),(14,7.5),(14,-7.5),(-14,-7.5)])
    kit.line(g,'chalk',[(0,-7.5),(0,7.5)])
    kit.arc(g,'chalk',(0,0),1.8)
    # Centre medallion uses only circles and inlays; no marks or lettering.
    kit.arc(g,'paint',(0,0),1.65,width=.08,y=.022)
    kit.arc(g,'paint',(0,0),.45,width=.055,y=.022)
    for sign in (-1,1):
        x0,x1=sorted((sign*8.2,sign*14))
        kit.plane(g,'paint',x0,x1,-2.45,2.45,.012)
        kit.line(g,'chalk',[(sign*14,-2.45),(sign*8.2,-2.45),(sign*8.2,2.45),(sign*14,2.45)])
        # Free throw solid front half and dashed rear half.
        st,en=(math.pi/2,3*math.pi/2) if sign==1 else (-math.pi/2,math.pi/2)
        kit.arc(g,'chalk',(sign*8.2,0),1.8,st,en,steps=64)
        for k in range(12):
            a=en+k*math.pi/12
            kit.arc(g,'chalk',(sign*8.2,0),1.8,a,a+math.pi/24,steps=5)
        # FIBA 6.75 m arc meets the 6.60 m corner lines tangentially in plan.
        cut=math.asin(6.6/6.75)
        if sign==1: st,en=math.pi-cut,math.pi+cut
        else: st,en=-cut,cut
        kit.arc(g,'chalk',(sign*12.425,0),6.75,st,en,steps=150)
        join=sign*(12.425-math.sqrt(6.75**2-6.6**2))
        for z in (-6.6,6.6): kit.line(g,'chalk',[(sign*14,z),(join,z)])
        st,en=(math.pi/2,3*math.pi/2) if sign==1 else (-math.pi/2,math.pi/2)
        kit.arc(g,'chalk',(sign*12.425,0),1.25,st,en,steps=64)
        for zsign in (-1,1):
            kit.line(g,'chalk',[(sign*12.425,zsign*1.25),(sign*12.8,zsign*1.25)])
            for d in (1.75,2.65,3.65,4.55):
                xx=sign*(14-d)
                kit.line(g,'chalk',[(xx,zsign*2.45),(xx,zsign*2.64)],.05)
    # Perimeter safety panels are free from text and brands.
    for z in (-9.12,9.12): kit.line(g,'ad-amber',[(-15.6,z),(15.6,z)],.025,.005)


def seat_mesh():
    # A single moulded bucket profile is reused by the entire arena.
    # The back leans 10 degrees away from the court; front is local -Z.
    g='SeatShell'
    profile=[(-.23,.44),(-.20,.395),(.19,.39),(.255,.45),(.31,.91),(.265,.94),(.21,.51),(.17,.465)]
    for i in range(len(profile)):
        j=(i+1)%len(profile)
        z,y=profile[i];zz,yy=profile[j]
        kit.face(g,'seat-lower',[(-.235,y,z),(.235,y,z),(.235,yy,zz),(-.235,yy,zz)])
    # Caps use a triangulated concave profile instead of a triangle fan.
    # It is an L shaped shell: triangulate each quadrilateral section.
    captris=[(0,1,7),(1,2,7),(2,3,6),(2,6,7),(3,4,5),(3,5,6)]
    for sx in (-1,1):
        for tri in captris:
            pts=[(sx*.235,profile[k][1],profile[k][0]) for k in tri]
            if sx>0: pts.reverse()
            kit.face(g,'seat-lower',pts,normal=(sx,0,0))
    kit.box('SeatBase','dark-steel',(0,.24,.08),(.12,.31,.16))
    kit.box('SeatBase','dark-steel',(0,.105,.04),(.38,.055,.34))


seat_nodes=[]
def stands():
    tiers=[(1.0,10.9,0),(3.8,14.0,1),(6.7,17.1,2)]
    # Four-sided bowl, three architectural decks, three rows per deck.
    for side in ('Far','Near','East','West'):
        islong=side in ('Far','Near')
        sign=1 if side in ('Far','East') else -1
        angle=0 if side=='Far' else math.pi if side=='Near' else math.pi/2 if side=='East' else -math.pi/2
        for base,depth,t in tiers:
            g=f'Stands_{side}_Tier{t+1}'
            matname=['seat-lower','seat-middle','seat-upper'][t]
            maxlen=16.5 if islong else 10.0
            for row in range(3):
                y=base+row*.62; outward=depth+row*.82
                if islong:
                    p=(0,y-.31,sign*outward);s=(maxlen*2,.62,.91)
                else:
                    p=(sign*(outward+6.6),y-.31,0);s=(.91,.62,maxlen*2)
                kit.box(g,'riser',p,s)
                # Seats leave clear aisle strips at the centre and ends.
                for i in range(-int(maxlen/.57)+1,int(maxlen/.57)):
                    along=i*.57
                    if abs(along)<1.0 or (islong and abs(abs(along)-8.55)<.7): continue
                    # Player tunnel openings occupy the first row on end decks.
                    if not islong and t==0 and abs(along)<2.4: continue
                    if islong: pos=[along,y,sign*outward]
                    else: pos=[sign*(outward+6.6),y,along]
                    color='seat-accent' if (i+row*2)%17==0 else matname
                    seat_nodes.append((g,pos,angle,color))
            # Front balcony fascia, warm edge ribbon and stainless handrail.
            outer=depth-.5
            if islong:
                kit.box(g,'ink',(0,base-.13,sign*outer),(33.2,.65,.18))
                kit.box(g,'warm-led',(0,base+.17,sign*(outer-.10)),(33.0,.025,.025))
                a=(-16.6,base+.94,sign*outer);b=(16.6,base+.94,sign*outer)
                poles=[(v,base,sign*outer) for v in np.arange(-16.5,16.6,2.1)]
            else:
                kit.box(g,'ink',(sign*(outer+6.6),base-.13,0),(.18,.65,20.2))
                kit.box(g,'warm-led',(sign*(outer+6.48),base+.17,0),(.025,.025,20))
                a=(sign*(outer+6.6),base+.94,-10);b=(sign*(outer+6.6),base+.94,10)
                poles=[(sign*(outer+6.6),base,v) for v in np.arange(-10,10.1,2)]
            kit.tube(g,'rail',a,b,.021,6)
            for p in poles: kit.tube(g,'rail',p,(p[0],p[1]+.94,p[2]),.017,6)
            # Dedicated stairs between rows, including a half riser each step.
            aisle_values=(-8.55,0,8.55) if islong else (0,)
            for along in aisle_values:
                for k in range(6):
                    yy=base-.31+k*.31;dd=depth-.39+k*.41
                    p=(along,yy-.12,sign*dd) if islong else (sign*(dd+6.6),yy-.12,along)
                    s=(1.03,.24,.43) if islong else (.43,.24,1.03)
                    kit.box(g,'concrete',p,s)
                    if islong: kit.box(g,'warm-led',(along,yy+.005,sign*(dd-.19)),(.86,.012,.025))
            # Solid rear concourse joins the next tier instead of floating decks.
            p=(0,base+1.28,sign*(depth+2.25)) if islong else (sign*(depth+8.85),base+1.28,0)
            s=(33.2,.26,.65) if islong else (.65,.26,20.2)
            kit.box(g,'concrete',p,s)

    # Rounded corner terraces continue the bowl without opaque filler blocks.
    for sx in (-1,1):
        for sz in (-1,1):
            side='Near' if sz<0 else 'Far'
            for base,depth,t in tiers:
                g=f'Stands_{side}_Corner{sx}_Tier{t+1}'
                material=['seat-lower','seat-middle','seat-upper'][t]
                def point(r,a,y):return (sx*(16.6+r*math.cos(a)),y,sz*(10+r*math.sin(a)))
                for row in range(3):
                    r=depth-10+row*.82;y=base+row*.62
                    n=max(8,int(math.pi*r/.55))
                    angles=np.linspace(0,math.pi/2,n+1)
                    for a,b in zip(angles[:-1],angles[1:]):
                        pts=[point(r-.455,a,y),point(r-.455,b,y),point(r+.455,b,y),point(r+.455,a,y)]
                        if sx*sz<0:pts.reverse()
                        kit.face(g,'riser',pts,normal=(0,1,0))
                        for rr in (r-.455,r+.455):
                            pp=[point(rr,a,y-.62),point(rr,b,y-.62),point(rr,b,y),point(rr,a,y)]
                            # Orient the inner riser toward the open court.
                            norm=np.cross(np.array(pp[1])-pp[0],np.array(pp[2])-pp[0])
                            desired=np.array([-sx*math.cos((a+b)/2),0,-sz*math.sin((a+b)/2)])
                            if rr>r:desired=-desired
                            if np.dot(norm,desired)<0:pp.reverse()
                            kit.face(g,'riser',pp)
                    count=max(2,int((math.pi/2)*r/.59))
                    for i in range(count):
                        a=(i+.5)*(math.pi/2)/count
                        pos=list(point(r,a,y));angle=math.atan2(sx*math.cos(a),sz*math.sin(a))
                        seat_nodes.append((g,pos,angle,'seat-accent' if i%19==0 else material))
                # Curved rail and fascia on the front edge of every corner deck.
                r=depth-10-.50
                for a,b in zip(np.linspace(0,math.pi/2,19)[:-1],np.linspace(0,math.pi/2,19)[1:]):
                    kit.tube(g,'rail',point(r,a,base+.94),point(r,b,base+.94),.021,6)
                    pp=[point(r,a,base-.44),point(r,b,base-.44),point(r,b,base+.19),point(r,a,base+.19)]
                    norm=np.cross(np.array(pp[1])-pp[0],np.array(pp[2])-pp[0])
                    if np.dot(norm,[-sx*math.cos(a),0,-sz*math.sin(a)])<0:pp.reverse()
                    kit.face(g,'ink',pp)
                    kit.tube(g,'warm-led',point(r-.02,a,base+.17),point(r-.02,b,base+.17),.012,5)
                for a in np.linspace(0,math.pi/2,5):kit.tube(g,'rail',point(r,a,base),point(r,a,base+.94),.017,6)


def architecture():
    # Walls use separate camera-facing groups so the preview can cut them away.
    for sign,side in ((1,'Far'),(-1,'Near')):
        g='Wall_'+side
        kit.box(g,'wall',(0,6.0,sign*20),(53,12.4,.45))
        kit.box(g,'acoustic',(0,12.5,sign*19.72),(52.8,1.4,.12))
        for x in np.arange(-25.5,26,1.2):
            kit.box(g,'dark-steel',(x,11.3,sign*19.70),(.32,3.0,.14))
        for x in (-24,-16,-8,0,8,16,24):
            kit.box(g,'steel',(x,6.4,sign*19.43),(.22,12.8,.22))
    for sign,side in ((1,'East'),(-1,'West')):
        g='Wall_'+side
        # Actual gap under a lintel, with a deep four metre player entrance.
        for z in (-11,11): kit.box(g,'wall',(sign*26.0,5.8,z),(.45,12,18))
        kit.box(g,'wall',(sign*26,8.1,0),(.45,7.3,4))
        kit.box(g,'rubber',(sign*27.8,1.8,0),(.2,3.6,4.0))
        for z in (-2.05,2.05): kit.box(g,'ink',(sign*25.4,1.65,z),(2.5,3.3,.16))
        kit.box(g,'ink',(sign*25.4,3.36,0),(2.5,.2,4.25))
        for z in (-1.91,1.91): kit.box(g,'warm-led',(sign*25.85,1.8,z),(.025,3.1,.025))
        # Tunnel mouths at the lower bowl, connected to the rear corridor.
        for z in (-2.12,2.12): kit.box('Tunnel_'+side,'ink',(sign*18.1,1.1,z),(1.35,2.3,.2))
        kit.box('Tunnel_'+side,'ink',(sign*18.1,2.29,0),(1.35,.20,4.45))
        kit.box('Tunnel_'+side,'rubber',(sign*20.1,1.05,0),(.1,2.2,4))
        for z in (-2.01,2.01): kit.box('Tunnel_'+side,'warm-led',(sign*17.42,1.14,z),(.025,2.05,.025))
        for z in np.arange(-18,19,1.5): kit.box(g,'acoustic',(sign*25.7,11.25,z),(.15,2.9,.6))
    for near in (False,True):
        g='Roof_'+('Near' if near else 'Far')
        z0,z1=(-20,0) if near else (0,20)
        kit.box(g,'acoustic',(0,14.30,(z0+z1)/2),(53,.26,z1-z0))
        for z in np.arange(z0+.6,z1,1.25):
            kit.box(g,'dark-steel',(0,14.1,z),(52.9,.19,.12))
        # Triangulated steel truss, including verticals and diagonal webs.
        for x in (-22,-11,0,11,22):
            for yy in (12.7,13.75): kit.tube(g,'steel',(x,yy,z0),(x,yy,z1),.065,8)
            for z in np.arange(z0,z1,2.5):
                kit.tube(g,'steel',(x,12.7,z),(x,13.75,z+2.5),.038,6)
                kit.tube(g,'steel',(x,12.7,z),(x,13.75,z),.032,6)
        # Suspended luminaire bars have fins, a reflector housing and hangers.
        for x in (-16,-8,0,8,16):
            for z in ((-11,-4) if near else (4,11)):
                kit.box(g,'dark-steel',(x,12.48,z),(2.3,.16,.65),bevel=.035)
                kit.box(g,'white-led',(x,12.385,z),(2.12,.025,.49))
                for xx in (-.8,.8): kit.tube(g,'dark-steel',(x+xx,12.55,z),(x+xx,14.15,z),.015,6)
                for xx in np.arange(-.96,1.0,.24): kit.box(g,'steel',(x+xx,12.59,z),(.035,.12,.61))


def hoop():
    # Reusable east assembly in world metres. West is a Y half-turn instance.
    g='Hoop'
    kit.box(g,'rubber',(16.15,.24,0),(1.6,.48,1.55),bevel=.12)
    kit.box(g,'ink',(16.05,1.02,0),(.90,1.6,1.20),bevel=.10)
    kit.tube(g,'dark-steel',(16.12,.45,0),(15.65,2.5,0),.16,12)
    for z in (-.39,.39):
        kit.tube(g,'steel',(15.8,2.1,z),(12.98,3.6,z),.075,12)
        kit.tube(g,'dark-steel',(15.85,1.25,z),(13.3,3.58,z),.045,10)
        kit.tube(g,'steel',(13.4,3.38,z),(12.86,3.03,z),.036,8)
    kit.tube(g,'steel',(12.91,3.6,-.61),(12.91,3.6,.61),.055,10)
    kit.box(g,'glass',(12.81,3.425,0),(.035,1.05,1.8))
    # Aluminium frame and bottom safety padding are geometrically separate.
    for z in (-.925,.925): kit.box(g,'steel',(12.815,3.425,z),(.085,1.13,.045),bevel=.01)
    for yy in (2.88,3.97): kit.box(g,'steel',(12.815,yy,0),(.085,.045,1.9),bevel=.01)
    kit.box(g,'rubber',(12.79,2.86,0),(.14,.12,1.93),bevel=.025)
    for z in (-.295,.295): kit.box(g,'chalk',(12.785,3.245,z),(.009,.49,.045))
    for yy in (3.02,3.49): kit.box(g,'chalk',(12.785,yy,0),(.009,.045,.63))
    kit.box(g,'rim',(12.72,3.045,0),(.19,.075,.15),bevel=.015)
    # True 450 mm inner diameter torus: tube centre radius .234 + 9 mm tube.
    r=.234;minor=.009;mesh=kit.get(g,'rim')
    for i in range(72):
        for j in range(8):
            ids=[]
            for a,b in ((i,j),(i+1,j),(i+1,j+1),(i,j+1)):
                theta=a*TAU/72;phi=b*TAU/8
                n=np.array([math.cos(theta)*math.cos(phi),math.sin(phi),math.sin(theta)*math.cos(phi)])
                p=np.array([12.425+r*math.cos(theta),3.05,r*math.sin(theta)])+minor*n
                ids.append(mesh.vertex(p,n))
            mesh.ix.extend([ids[0],ids[2],ids[1],ids[0],ids[3],ids[2]])
    # Twelve tied anchors, five zigzag rows: real braided diamond net geometry.
    radii=[.23,.205,.173,.145,.137,.143]
    for row in range(5):
        for k in range(12):
            a=k*TAU/12+(row%2)*math.pi/12
            p=(12.425+radii[row]*math.cos(a),3.035-row*.086,radii[row]*math.sin(a))
            for dk in (0,-1 if row%2==0 else 1):
                b=(k+dk)*TAU/12+((row+1)%2)*math.pi/12
                q=(12.425+radii[row+1]*math.cos(b),3.035-(row+1)*.086,radii[row+1]*math.sin(b))
                kit.tube(g,'net',p,q,.0025,5,cap=False)
    # Visible hinge pin and locking bolts on each support, not branded decals.
    for z in (-.52,.52):
        kit.tube(g,'steel',(15.8,2.14,z-.03),(15.8,2.14,z+.03),.10,12)
        kit.tube(g,'dark-steel',(12.89,3.6,z-.025),(12.89,3.6,z+.025),.06,10)


def sideline():
    # Courtside team seats and scorer station, on the near technical sideline.
    for sign in (-1,1):
        g='TeamBench_'+('West' if sign<0 else 'East')
        kit.box(g,'dark-steel',(sign*8.5,.22,-9.75),(6.7,.14,.70))
        for i in range(10):
            x=sign*(5.6+i*.64)
            kit.box(g,'rubber',(x,.51,-9.72),(.52,.12,.48),bevel=.045)
            kit.box(g,'ink',(x,.91,-9.93),(.53,.62,.12),bevel=.04)
            for dx in (-.18,.18): kit.tube(g,'steel',(x+dx,.05,-9.85),(x+dx,.48,-9.65),.023,8)
        kit.box(g,'ink',(sign*12.4,.43,-9.7),(.70,.80,.64),bevel=.05)
        kit.box(g,'chalk',(sign*12.4,.87,-9.7),(.73,.08,.67),bevel=.02)
        for i in range(3):
            x=sign*(12.17+i*.22)
            kit.tube(g,'glass',(x,.91,-9.68),(x,1.13,-9.68),.055,10)
            kit.tube(g,'ad-cyan',(x,1.13,-9.68),(x,1.18,-9.68),.035,8)
    g='ScorersTable'
    kit.box(g,'ink',(0,.52,-9.78),(4.5,.90,.75),bevel=.055)
    kit.box(g,'steel',(0,1,-9.78),(4.7,.075,.90),bevel=.025)
    kit.box(g,'ad-cyan',(0,.55,-9.38),(4.35,.54,.022))
    for x in (-1.35,0,1.35):
        kit.box(g,'dark-steel',(x,1.15,-9.7),(.57,.31,.04),bevel=.012)
        kit.box(g,'rubber',(x,1.045,-9.55),(.61,.024,.24))
        kit.box(g,'ink',(x,.5,-10.4),(.48,.14,.46),bevel=.025)
        kit.box(g,'ink',(x,.84,-10.63),(.48,.52,.07),bevel=.025)
    # Unbranded advertising boards with abstract coloured geometric panels.
    for sign in (-1,1):
        for i in range(8):
            x=-14+i*4
            if sign<0 and abs(x)<12: continue
            g='Ads_'+('Far' if sign>0 else 'Near')
            z=sign*10.0
            kit.box(g,'dark-steel',(x,.42,z),(3.8,.82,.16),bevel=.025)
            kit.box(g,'ad-cyan' if i%2==0 else 'ad-amber',(x,.44,z-sign*.09),(3.65,.59,.025))
            for j in range(3):
                kit.box(g,'ink',(x-1+j*.7,.44,z-sign*.108),(.32,.61,.013),angle=0)


def export(path, only_hoop=False):
    selected=[(k,v) for k,v in kit.meshes.items() if (k[0]=='Hoop' if only_hoop else True)]
    used_mats={m for (g,m),_ in selected}
    if not only_hoop: used_mats.update(['seat-middle','seat-upper','seat-accent'])
    matnames=[m for m in materials if m in used_mats]
    doc={'asset':{'version':'2.0','generator':'Hoops Arena v2 — original deterministic authoring','copyright':'Original work for roynaor-work/Bakasun; repository terms apply'},
         'scene':0,'scenes':[{'name':'Hoops Arena v2','nodes':[]}],
         'nodes':[],'meshes':[],'materials':[materials[m] for m in matnames],
         'buffers':[],'bufferViews':[],'accessors':[]}
    data=bytearray()
    def view(raw,target=None):
        while len(data)%4: data.append(0)
        idx=len(doc['bufferViews']);entry={'buffer':0,'byteOffset':len(data),'byteLength':len(raw)}
        if target: entry['target']=target
        data.extend(raw);doc['bufferViews'].append(entry);return idx
    def accessor(arr,typ,component,target,bounds=False):
        arr=np.asarray(arr,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[component])
        ix=len(doc['accessors']);a={'bufferView':view(arr.tobytes(),target),'componentType':component,'count':len(arr),'type':typ}
        if bounds:a.update(min=arr.min(axis=0).tolist(),max=arr.max(axis=0).tolist())
        doc['accessors'].append(a);return ix
    if not only_hoop:
        doc['images']=[];doc['textures']=[];doc['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]
        for file,mime in [('maple-albedo.jpg','image/jpeg'),('maple-normal.png','image/png'),('maple-orm.png','image/png')]:
            ix=len(doc['images']);doc['images'].append({'name':file,'bufferView':view((ROOT/'textures'/file).read_bytes()),'mimeType':mime})
            doc['textures'].append({'sampler':0,'source':ix})
        wood=doc['materials'][matnames.index('maple')]
        wood['pbrMetallicRoughness'].update(baseColorTexture={'index':0},metallicRoughnessTexture={'index':2})
        wood['normalTexture']={'index':1,'scale':.3}
    groups={};mesh_lookup={}
    for (g,m),mesh in selected:
        positions=np.asarray(mesh.p)-[12.425,0,0] if only_hoop else mesh.p
        attrs={'POSITION':accessor(positions,'VEC3',5126,34962,True),'NORMAL':accessor(mesh.n,'VEC3',5126,34962)}
        if mesh.uv:
            attrs['TEXCOORD_0']=accessor(mesh.uv,'VEC2',5126,34962)
            # UV +U follows +X and +V follows +Z on the +Y-facing floor.
            attrs['TANGENT']=accessor([(1,0,0,-1)]*len(mesh.p),'VEC4',5126,34962)
        prim={'attributes':attrs,'indices':accessor(mesh.ix,'SCALAR',5123 if len(mesh.p)<65536 else 5125,34963),'material':matnames.index(m)}
        mi=len(doc['meshes']);doc['meshes'].append({'name':g+'_'+m,'primitives':[prim]});mesh_lookup[(g,m)]=mi
        if g in ('SeatShell','SeatBase'):continue
        if g not in groups:
            groups[g]=len(doc['nodes']);doc['nodes'].append({'name':g,'children':[],'extras':{'component':g}})
            doc['scenes'][0]['nodes'].append(groups[g])
        node=len(doc['nodes']);doc['nodes'].append({'name':g+'_'+m,'mesh':mi});doc['nodes'][groups[g]]['children'].append(node)
    if not only_hoop:
        # The second basket reuses every mesh; no negative scales or mirrored normals.
        hoopeast=doc['nodes'][groups['Hoop']];hoopeast['name']='Hoop_East'
        west={'name':'Hoop_West','rotation':[0,1,0,0],'children':[],'extras':{'component':'Hoop_West'}}
        wi=len(doc['nodes']);doc['nodes'].append(west);doc['scenes'][0]['nodes'].append(wi)
        for old in hoopeast['children']:
            ni=len(doc['nodes']);doc['nodes'].append(dict(doc['nodes'][old],name=doc['nodes'][old]['name']+'_West'));west['children'].append(ni)
        # Shared seat shell in four material colours; accessors remain shared.
        shell=mesh_lookup[('SeatShell','seat-lower')]
        shells={'seat-lower':shell}
        for color in ('seat-middle','seat-upper','seat-accent'):
            prim=dict(doc['meshes'][shell]['primitives'][0],material=matnames.index(color))
            shells[color]=len(doc['meshes']);doc['meshes'].append({'name':'SeatShell_'+color,'primitives':[prim]})
        for i,(group,pos,angle,color) in enumerate(seat_nodes):
            idx=len(doc['nodes']);doc['nodes'].append({'name':f'Seat_{i:04d}','translation':pos,'rotation':[0,math.sin(angle/2),0,math.cos(angle/2)],
                'children':[idx+1,idx+2],'extras':{'seat':True}})
            doc['nodes'][groups[group]]['children'].append(idx)
            doc['nodes'].append({'name':'shell','mesh':shells[color]})
            doc['nodes'].append({'name':'base','mesh':mesh_lookup[('SeatBase','dark-steel')]})
    while len(data)%4:data.append(0)
    doc['buffers']=[{'byteLength':len(data)}]
    meta=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode()
    meta+=b' '*((-len(meta))%4)
    payload=struct.pack('<III',0x46546c67,2,12+8+len(meta)+8+len(data))+struct.pack('<II',len(meta),0x4e4f534a)+meta+struct.pack('<II',len(data),0x004e4942)+data
    path.write_bytes(payload)
    # Count scene triangles, including both basket and all shared seat instances.
    tris=sum(doc['accessors'][p['indices']]['count']//3 for node in doc['nodes'] if 'mesh' in node for p in doc['meshes'][node['mesh']]['primitives'])
    return {'file':str(path.relative_to(ROOT)),'bytes':len(payload),'triangles':tris,'meshes':len(doc['meshes']),'nodes':len(doc['nodes']),'materials':len(matnames),'extensions':doc.get('extensionsUsed',[])}


if __name__=='__main__':
    court();seat_mesh();stands();architecture();hoop();sideline()
    stats={'coordinates':{'unit':'metre','up':'+Y','courtLengthAxis':'X','courtWidthAxis':'Z'},
        'court':[28,15],'rimHeight':3.05,'rimInnerDiameter':.45,'seats':len(seat_nodes),
        'tiers':3,'rowsPerTier':3,'lamps':20,'adText':False,'brands':False,
        'models':[export(OUT/'arena.glb'),export(OUT/'hoop.glb',True)]}
    (ROOT/'verification'/'geometry.json').write_text(json.dumps(stats,indent=2)+'\n')
    print(json.dumps(stats,indent=2))
