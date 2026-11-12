#!/usr/bin/env python3
"""Build the original naval-base kit. Pure Python 3, no downloads or plug-ins.

All dimensions are glTF metres: +Y up, +Z front, origin at ground centre.
The intentionally small meshes use flat normals and linear vertex colours.
Each GLB contains one shared opaque PBR material and three separate scenes.
"""
from __future__ import annotations

import hashlib
import json
import math
import random
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAU = math.tau


def rgb(h):
    h = h.lstrip('#')
    a = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in a)


PALETTES = {
    'coastal': dict(wall='#ccbfa1', edge='#e6d8b4', roof='#aaa68e', metal='#608e91', dark='#294b57', trim='#f4d280', crate='#a57549', ground='#dfc38f', glass='#396676'),
    'palace': dict(wall='#eee9dc', edge='#fff8e4', roof='#2981be', metal='#448ca5', dark='#224e6b', trim='#e4b852', crate='#d3b77e', ground='#ded2ad', glass='#327ca3'),
    'submarine': dict(wall='#697b84', edge='#91a1a3', roof='#425965', metal='#5a8691', dark='#273e4b', trim='#e8b765', crate='#9e8872', ground='#73858a', glass='#9dc8cb'),
}


class Mesh:
    def __init__(self):
        self.p, self.n, self.c, self.i = [], [], [], []

    def face(self, points, color, shade=1):
        """Counter-clockwise polygon, flat shaded and triangulated as a fan."""
        a, b, c = points[:3]
        u, v = [b[k] - a[k] for k in range(3)], [c[k] - a[k] for k in range(3)]
        norm = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        length = math.sqrt(sum(x*x for x in norm))
        if length < 1e-9:
            return
        norm = [x/length for x in norm]
        start = len(self.p)
        for point in points:
            self.p.append(tuple(point))
            self.n.append(norm)
            self.c.append(tuple(max(0, min(1, v*shade)) for v in color))
        for j in range(1, len(points)-1):
            self.i.extend((start, start+j, start+j+1))

    def box(self, center, size, color, yaw=0, roll=0):
        x, y, z = [s/2 for s in size]
        pts = [(-x,-y,-z), (x,-y,-z), (x,y,-z), (-x,y,-z), (-x,-y,z), (x,-y,z), (x,y,z), (-x,y,z)]
        def transform(v):
            a,b,c=v
            a,b=a*math.cos(roll)-b*math.sin(roll),a*math.sin(roll)+b*math.cos(roll)
            a,c=a*math.cos(yaw)+c*math.sin(yaw),-a*math.sin(yaw)+c*math.cos(yaw)
            return (a+center[0],b+center[1],c+center[2])
        pts = list(map(transform, pts))
        for ids, s in [((4,5,6,7),1), ((1,0,3,2),.96), ((5,1,2,6),.91), ((0,4,7,3),1.01), ((7,6,2,3),1.06), ((0,1,5,4),.85)]:
            self.face([pts[k] for k in ids], color, s)

    def octbox(self, center, size, color, bevel=.22):
        x,y,z=[s/2 for s in size]
        b=min(bevel,x*.65,z*.65)
        ring=[(-x+b,-z), (x-b,-z), (x,-z+b), (x,z-b), (x-b,z),(-x+b,z),(-x,z-b),(-x,-z+b)]
        lo=[(a+center[0],center[1]-y,c+center[2]) for a,c in ring]
        hi=[(a+center[0],center[1]+y,c+center[2]) for a,c in ring]
        self.face(lo, color, .86)
        self.face(list(reversed(hi)), color, 1.04)
        for k in range(8):
            j=(k+1)%8
            self.face([lo[k],hi[k],hi[j],lo[j]],color,.95+(.06 if k in (2,3,4) else 0))

    def cylinder(self, center, radius, length, color, axis='y', segments=8, end_radius=None, caps=True):
        r2=radius if end_radius is None else end_radius
        def point(a,h,r):
            c,s=math.cos(a)*r,math.sin(a)*r
            v=(c,h,s) if axis=='y' else (c,s,h)
            return tuple(v[k]+center[k] for k in range(3))
        # Rings run clockwise when viewed along the positive cylinder axis.
        lo=[point(-TAU*j/segments,-length/2,radius) for j in range(segments)]
        hi=[point(-TAU*j/segments,length/2,r2) for j in range(segments)]
        if axis=='z':
            lo.reverse(); hi.reverse()
        for k in range(segments):
            j=(k+1)%segments
            self.face([lo[k],lo[j],hi[j],hi[k]], color)
        if caps:
            self.face(list(reversed(lo)),color,.9)
            self.face(hi,color,1.04)

    def dome(self, center, radius, height, color, segments=10, bands=3):
        rings=[]
        # A tiny top ring avoids duplicate vertices / degenerate fan triangles.
        for band in range(bands):
            angle=(math.pi/2)*band/bands
            r=radius*math.cos(angle)
            rings.append([(center[0]+r*math.cos(-TAU*j/segments),center[1]+height*math.sin(angle),center[2]+r*math.sin(-TAU*j/segments)) for j in range(segments)])
        for a,b in zip(rings,rings[1:]):
            for k in range(segments):
                j=(k+1)%segments
                self.face([a[k],a[j],b[j],b[k]],color)
        apex=(center[0],center[1]+height,center[2])
        for k in range(segments):
            self.face([rings[-1][k],rings[-1][(k+1)%segments],apex],color)

    def soot(self, center, rx, ry, seed=1, axis='z'):
        """Irregular flush front-facing soot stain, shared material."""
        rng=random.Random(seed)
        outside=[]; inside=[]
        for i in range(9):
            a=TAU*i/9
            scale=rng.uniform(.72,1.1)
            dx,dy=math.cos(a)*rx*scale,math.sin(a)*ry*scale
            if axis=='x':
                outside.append((center[0],center[1]+dy,center[2]-dx))
                inside.append((center[0]+.002,center[1]+dy*.5,center[2]-dx*.5))
            else:
                outside.append((center[0]+dx,center[1]+dy,center[2]))
                inside.append((center[0]+dx*.5,center[1]+dy*.5,center[2]+.002))
        for i in range(9):
            j=(i+1)%9
            self.face([outside[i],outside[j],inside[j],inside[i]],rgb('#625b51'))
        # Radial triangles remain valid for an irregular (possibly concave) ring.
        middle=(center[0]+.002,center[1],center[2]) if axis=='x' else (center[0],center[1],center[2]+.002)
        for i in range(9):
            self.face([middle,inside[i],inside[(i+1)%9]],rgb('#303c40'))

    def merge(self, other):
        offset=len(self.p)
        self.p.extend(other.p); self.n.extend(other.n); self.c.extend(other.c)
        self.i.extend(i+offset for i in other.i)

    @property
    def triangles(self):
        return len(self.i)//3


def colors(style):
    return {k:rgb(v) for k,v in PALETTES[style].items()}


def gun(style, damaged=False):
    p=colors(style); m=Mesh(); t=Mesh(); b=Mesh()
    m.octbox((0,.15,0),(7,.3,6),p['ground'],.4)
    m.octbox((0,.91,-.4),(6.35,1.22,4.85),p['wall'],.5)
    m.octbox((0,1.5,-.4),(6.5,.16,5),p['edge'],.5)
    # Front access door and armoured slit, both visibly on +Z.
    m.box((0,.83,2.035),(1.25,1.05,.06),p['dark'])
    m.box((0,1.24,2.075),(1.5,.13,.08),p['trim'])
    for x in (-2.1,2.1):
        m.box((x,1.05,2.065),(1.12,.28,.06),p['glass'])
        m.box((x,.78,2.09),(1.28,.10,.08),p['edge'])
    m.box((0,.20,2.65),(2.0,.10,.65),p['edge'])
    m.cylinder((0,1.59,-.55),1.5,.18,p['dark'],segments=10)
    # Turret local pivot sits at ground y=1.66; barrel hinge is in this frame.
    t.octbox((0,.49,0),(3.25,.98,2.45),p['metal'],.4)
    t.box((0,.65,1.205),(1.35,.25,.08),p['dark'])
    if style=='palace':
        t.dome((0,.98,-.15),1.10,.36,p['roof'],segments=10,bands=2)
        t.cylinder((0,.96,0),1.35,.09,p['trim'],segments=10)
    else:
        t.octbox((0,1.04,-.12),(2.65,.14,1.9),p['roof'],.3)
        t.box((-.7,1.28,-.2),(.55,.12,.6),p['edge'])
    # Barrel +Z, no built-in elevation: rotate the barrel node around X.
    b.cylinder((0,0,.95),.22,1.90,p['metal'],axis='z',segments=8)
    b.cylinder((0,0,1.92),.32,.36,p['edge'],axis='z',segments=8)
    b.cylinder((0,0,2.107),.22,.012,p['dark'],axis='z',segments=8)
    if damaged:
        m.soot((-1.7,.92,2.115),.8,.5,4)
        t.soot((.65,.51,1.254),.65,.43,6)
        m.soot((3.183,.94,-.4),.8,.48,7,axis='x')
    return [(m,None,None),(t,'turret_damaged' if damaged else 'turret', [0,1.66,-.55]),(b,'barrel_damaged' if damaged else 'barrel',[0,.60,.94])]


def tower(style,damaged=False):
    p=colors(style); m=Mesh()
    m.octbox((0,.20,0),(5,.4,5),p['ground'],.35)
    m.octbox((0,3.65,0),(2.7,6.5,2.7),p['wall'],.27)
    m.octbox((0,6.85,0),(4.3,.35,4.3),p['edge'],.25)
    m.octbox((0,8.00,0),(3.85,2.15,3.85),p['wall'],.18)
    for side in (-1,1):
        m.box((0,8.18,side*1.945),(3.15,.96,.035),p['glass'])
        m.box((side*1.945,8.18,0),(.035,.96,3.15),p['glass'])
    # Four gold corner uprights silhouette the cabin against its glazing.
    for x in (-1.78,1.78):
        for z in (-1.78,1.78):
            m.box((x,8.13,z),(.18,1.35,.18),p['trim'])
    m.box((0,7.57,1.98),(4.03,.12,.12),p['trim'])
    m.octbox((0,9.12,0),(4.6,.20,4.6),p['edge'],.3)
    if style=='palace':
        m.dome((0,9.22,0),2.22,1.60,p['roof'],segments=10,bands=3)
        m.cylinder((0,10.91,0),.12,.18,p['trim'],segments=6)
    else:
        # Low truncated hip roof and short rounded beacon, never a sharp spike.
        m.dome((0,9.22,0),2.4,1.05,p['roof'],segments=4,bands=2)
        m.cylinder((0,10.63,0),.22,.74,p['trim'],segments=6)
    m.box((.58,1.34,1.38),(1.05,1.88,.06),p['dark'])
    # Side ladder is readable at play distance, with five broad rungs.
    for x in (-.46,.46):
        m.box((x,3.62,-1.42),(.11,5.8,.12),p['metal'])
    for i in range(5):
        m.box((0,1.35+i*1.05,-1.47),(1.03,.11,.15),p['trim'])
    if damaged:
        m.soot((-.37,4.5,1.36),1.02,1.35,3)
        m.soot((.6,8.13,1.985),.82,.65,8)
        m.soot((1.357,3.45,0),.8,1.1,9,axis='x')
    return [(m,None,None)]


def arch(m,p):
    inner=[(-3,5),(-2.5,6),(-1.4,6.7),(1.4,6.7),(2.5,6),(3,5)]
    outer=[(-4.05,5),(-3.35,6.6),(-1.8,7.7),(1.8,7.7),(3.35,6.6),(4.05,5)]
    for i in range(len(inner)-1):
        j=i+1
        a,b=inner[i],inner[j]; c,d=outer[i],outer[j]
        for z,reverse in ((1.1,False),(-1.1,True)):
            q=[(a[0],a[1],z),(b[0],b[1],z),(d[0],d[1],z),(c[0],c[1],z)]
            m.face(list(reversed(q)) if reverse else q,p['trim'] if i in (1,2,3) else p['edge'])
        m.face([(a[0],a[1],-1.1),(b[0],b[1],-1.1),(b[0],b[1],1.1),(a[0],a[1],1.1)],p['wall'])
        m.face([(c[0],c[1],1.1),(d[0],d[1],1.1),(d[0],d[1],-1.1),(c[0],c[1],-1.1)],p['edge'])


def gate(style,damaged=False):
    p=colors(style);m=Mesh()
    for side in (-1,1):
        x=side*8
        m.octbox((x,.18,0),(6,.36,3.6),p['ground'],.25)
        m.octbox((x,3.9,0),(5.65,7.2,3.15),p['wall'],.35)
        m.box((side*4,2.5,0),(2,5,2.2),p['wall'])
        m.octbox((x,7.55,0),(6,.25,3.6),p['edge'],.3)
        for z in (-1.58,1.58):
            m.box((x,6.05,z),(2.05,.65,.06),p['glass'])
        m.box((x,1.20,1.605),(2.1,1.7,.05),p['dark'])
        m.box((x,2.17,1.64),(2.5,.16,.10),p['trim'])
        if style=='palace':
            m.dome((x,7.68,0),1.6,1.22,p['roof'],segments=8,bands=2)
            m.cylinder((x,8.95,0),.12,.10,p['trim'],segments=6)
        else:
            m.octbox((x,8.30,0),(5.4,1.4,3),p['roof'],.3)
            for dx in (-1.7,1.7):
                m.box((x+dx,8.84,1.2),(.55,.32,.5),p['edge'])
    arch(m,p)
    if damaged:
        m.soot((-7.5,4.3,1.61),1.8,1.35,10)
        m.soot((4.0,2.5,1.112),.6,1.3,9)
        m.soot((10.832,4.2,0),.75,1.05,11,axis='x')
    return [(m,None,None)]


def crate(m,p,center,size):
    m.box(center,size,p['crate'])
    x,y,z=center; w,h,d=size
    m.box((x,y,z+d/2+.014),(w+.03,.13,.04),p['trim'])
    # A single broad strap crosses the top and front of each supply crate.
    m.box((x,y+h/2+.02,z),(.14,.04,d+.03),p['dark'])


def depot(style,damaged=False):
    p=colors(style);m=Mesh()
    m.octbox((0,.15,0),(9,.3,6),p['ground'],.28)
    m.box((-1.65,1.75,-.63),(4.7,2.9,3.95),p['wall'])
    m.box((2.2,1.5,-.95),(2.4,2.4,3.3),p['metal'])
    for x in (-3.4,-2.5,-1.6,-.7,.2):
        m.box((x,1.75,1.38),(.10,2.8,.09),p['edge'])
    for x in (1.28,2.15,3.12):
        m.box((x,1.5,.74),(.11,2.35,.09),p['edge'])
    m.box((-1.65,1.7,1.445),(1.65,2.5,.06),p['dark'])
    m.box((-1.65,3.0,1.49),(2.0,.16,.12),p['trim'])
    m.box((-1.65,.55,1.50),(1.65,.19,.12),p['trim'])
    if style=='palace':
        m.box((-1.65,3.27,-.63),(4.9,.14,4.05),p['trim'])
        for x in (-2.8,-.45):
            m.dome((x,3.34,-.63),1.05,.66,p['roof'],segments=8,bands=2)
    else:
        m.box((-1.65,3.31,-.63),(4.9,.22,4.05),p['roof'])
        m.box((-1.65,3.71,-1.2),(2.8,.58,1.4),p['metal'])
    m.box((2.2,2.76,-.95),(2.6,.12,3.5),p['roof'])
    crate(m,p,(-3.35,.76,2.14),(1.45,.92,1.3))
    crate(m,p,(1.15,.80,2.05),(1.35,1.0,1.4))
    crate(m,p,(2.75,.78,2.1),(1.45,.96,1.3))
    crate(m,p,(2.7,1.58,2.1),(1.15,.64,1.05))
    # Closed cylindrical supply drums, kept clear of the front/side soot panels.
    # Broad lids and a contrasting belt read clearly at the game's small scale.
    for x,z,radius,height in ((-.1,2.42,.38,1.2),(3.95,1.0,.40,1.4)):
        m.cylinder((x,.3+height/2,z),radius,height,p['metal'],segments=8)
        m.cylinder((x,.3+height*.50,z),radius+.012,.15,p['trim'],segments=8,caps=False)
        m.cylinder((x,.3+height+.035,z),radius+.025,.07,p['edge'],segments=8)
    if damaged:
        m.soot((-2.4,1.84,1.515),1.35,.95,13)
        m.soot((2.45,1.54,.80),.64,.8,15)
        m.soot((3.407,1.65,-.8),.9,.77,16,axis='x')
    return [(m,None,None)]


def submarine_hull(m,p):
    rings=[];segments=10
    for z,r in [(-4.35,.17),(-3.7,.82),(-2.5,1),(2.45,1),(3.6,.78),(4.3,.13)]:
        rings.append([(1.55*r*math.cos(-TAU*i/segments),1.75+1.22*r*math.sin(-TAU*i/segments),z) for i in range(segments)])
    for a,b in zip(rings,rings[1:]):
        for i in range(segments):
            j=(i+1)%segments
            m.face([a[j],a[i],b[i],b[j]],p['metal'] if i not in (1,2,3) else p['dark'])
    m.face(rings[0],p['dark']);m.face(list(reversed(rings[-1])),p['metal'])
    m.octbox((0,3.25,-.5),(1.15,1.3,2.1),p['dark'],.3)
    m.box((0,3.89,-.5),(1.05,.10,1.8),p['edge'])
    m.cylinder((0,4.37,-.3),.13,.9,p['metal'],segments=6)
    m.box((0,4.81,-.1),(.3,.17,.65),p['edge'])
    # Front cockpit window gives the small, friendly sub an obvious bow.
    m.box((0,3.40,.57),(.78,.28,.05),p['glass'])
    m.box((0,1.90,-3.85),(3.6,.14,.7),p['dark'])
    m.box((0,2.25,-3.8),(.14,1.9,.75),p['dark'])
    m.box((0,2.85,.7),(1.08,.13,4.6),p['edge'])


def pen(style,damaged=False):
    p=colors(style);m=Mesh()
    m.box((0,.16,0),(12,.32,10),p['ground'])
    for side in (-1,1):
        x=side*5.5
        m.box((x,.88,0),(1,1.1,10),p['wall'])
        for z in (-4.45,4.45):
            m.box((x,3.55,z),(.55,6.45,.55),p['edge'])
        m.box((x,6.75,0),(.58,.5,10),p['dark'])
        m.box((side*5.25,5.85,3.75),(.55,1.7,.23),p['trim'],roll=side*.38)
    # Short rear canopy leaves the bow and conning tower exposed to view.
    m.box((0,6.75,-3.38),(12,.5,3.24),p['roof'])
    m.box((0,6.7,4.65),(12,.4,.7),p['dark'])
    m.box((0,2.1,-4.77),(10.4,3.55,.46),p['wall'])
    for x in (-3.7,3.7):
        m.box((x,.38,0),(.18,.12,8.6),p['trim'])
    submarine_hull(m,p)
    if damaged:
        m.soot((-4.5,2.0,-4.52),.7,1.25,21)
        m.soot((3.3,2.0,-4.52),1.3,.9,22)
    return [(m,None,None)]


SIZES={'coastal-gun':(7,3,6),'watchtower':(5,11,5),'gate':(22,9,3.6),'ammo-depot':(9,4,6),'submarine-pen':(12,7,10)}
BUILDERS={'coastal-gun':gun,'watchtower':tower,'gate':gate,'ammo-depot':depot,'submarine-pen':pen}


def rubble(style,kind):
    p=colors(style);m=Mesh();w,h,d=SIZES[kind]
    # Flat surviving footprint: state swaps never change placement or origin.
    if kind=='gate':
        for x in (-8,8):
            m.octbox((x,.10,0),(6,.2,d),p['ground'],.25)
    else:
        m.octbox((0,.10,0),(w,.2,d),p['ground'],.3)
    rng=random.Random(37+sum(map(ord,kind+style)))
    count=9 if kind=='gate' else 7
    for i in range(count):
        x=rng.uniform(-w*.36,w*.36);z=rng.uniform(-d*.31,d*.31)
        sx=rng.uniform(.8,1.7);sy=rng.uniform(.3,.7);sz=rng.uniform(.6,1.4)
        m.box((x,.2+sy*.5,z),(sx,sy,sz),p['wall'] if i%3 else p['roof'],yaw=rng.uniform(-1,1))
    m.box((0,.9,-.18),(min(w*.45,3.0),.34,1.0),p['dark'],yaw=.32)
    if kind=='coastal-gun':
        m.cylinder((1,.72,1.0),.25,2.4,p['metal'],axis='z',segments=8)
    elif kind=='watchtower':
        m.box((.1,.52,.4),(2.3,.18,2.1),p['glass'],yaw=.4)
    elif kind=='ammo-depot':
        m.box((1.8,.67,1.2),(1.7,.75,1.3),p['crate'],yaw=-.25)
    elif kind=='submarine-pen':
        m.box((0,.70,1.2),(2.3,1.0,3.5),p['metal'],yaw=.1)
    return m


class GLB:
    def __init__(self,asset_id):
        self.doc={'asset':{'version':'2.0','generator':'Bakasun naval-base-models-v1 original Python authoring'},'scene':0,'scenes':[],'nodes':[],'meshes':[],'materials':[{'name':asset_id+'-vertex-palette','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':.05,'roughnessFactor':.84},'doubleSided':False}],'accessors':[],'bufferViews':[],'buffers':[{'byteLength':0}]}
        self.bin=bytearray()

    def acc(self,data,typ,component=5126,target=34962):
        while len(self.bin)%4:self.bin.append(0)
        start=len(self.bin)
        flat=[v for row in data for v in row] if typ!='SCALAR' else data
        self.bin.extend(struct.pack('<'+('f' if component==5126 else 'H')*len(flat),*flat))
        view=len(self.doc['bufferViews']);self.doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(self.bin)-start,'target':target})
        acc={'bufferView':view,'componentType':component,'count':len(data),'type':typ}
        if typ=='VEC3':
            acc['min']=[min(p[k] for p in data) for k in range(3)];acc['max']=[max(p[k] for p in data) for k in range(3)]
        index=len(self.doc['accessors']);self.doc['accessors'].append(acc);return index

    def mesh(self,name,m):
        p=self.acc(m.p,'VEC3');n=self.acc(m.n,'VEC3');c=self.acc(m.c,'VEC3');i=self.acc(m.i,'SCALAR',5123,34963)
        idx=len(self.doc['meshes']);self.doc['meshes'].append({'name':name,'primitives':[{'attributes':{'POSITION':p,'NORMAL':n,'COLOR_0':c},'indices':i,'material':0,'mode':4}]});return idx

    def node(self,name,mesh=None,translation=None):
        n={'name':name}
        if mesh is not None:n['mesh']=mesh
        if translation is not None:n['translation']=translation
        i=len(self.doc['nodes']);self.doc['nodes'].append(n);return i

    def state(self,state,components,kind):
        root=self.node(state);children=[];turret=None
        for m,name,translation in components:
            name=name or state+'_structure'
            n=self.node(name,self.mesh(name,m),translation)
            if name.startswith('barrel'):
                self.doc['nodes'][turret].setdefault('children',[]).append(n)
                self.doc['nodes'][n]['extras']={'axis':'+Z','elevationAxis':'+X','pivot':'breech','part':'barrel'}
            else:
                children.append(n)
            if name.startswith('turret'):
                turret=n;self.doc['nodes'][n]['extras']={'yawAxis':'+Y','part':'turret'}
        self.doc['nodes'][root]['children']=children
        self.doc['nodes'][root]['extras']={'state':state,'front':'+Z','groundY':0}
        self.doc['scenes'].append({'name':state,'nodes':[root]})

    def write(self,path,extras):
        self.doc['extras']=extras
        self.doc['buffers'][0]['byteLength']=len(self.bin)
        js=json.dumps(self.doc,separators=(',',':'),ensure_ascii=True).encode()
        js+=b' '*((-len(js))%4);self.bin+=b'\0'*((-len(self.bin))%4)
        total=12+8+len(js)+8+len(self.bin)
        path.write_bytes(struct.pack('<4sII',b'glTF',2,total)+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(self.bin),0x004e4942)+self.bin)


def main():
    (ROOT/'models').mkdir(exist_ok=True)
    assets=[]
    for style in PALETTES:
        kinds=list(BUILDERS) if style=='submarine' else list(BUILDERS)[:-1]
        for kind in kinds:
            asset_id=f'{style}-{kind}';glb=GLB(asset_id);counts={}
            for state in ('intact','damaged','ruined'):
                components=[(rubble(style,kind),None,None)] if state=='ruined' else BUILDERS[kind](style,state=='damaged')
                counts[state]=sum(m.triangles for m,_,_ in components)
                glb.state(state,components,kind)
            assert sum(counts.values())<=1500,(asset_id,counts)
            file=f'models/{asset_id}.glb'
            glb.write(ROOT/file,{'id':asset_id,'style':style,'type':kind,'dimensions':list(SIZES[kind]),'unit':'metre','front':'+Z','up':'+Y','origin':'ground-centre','stateScenes':['intact','damaged','ruined'],'defaultState':'intact','triangles':counts,'singleMaterial':True,'textureSize':0,'license':'CC0-1.0'})
            asset={'id':asset_id,'style':style,'type':kind,'file':file,'dimensions':list(SIZES[kind]),'triangles':counts,'totalTriangles':sum(counts.values()),'bytes':(ROOT/file).stat().st_size,'sha256':hashlib.sha256((ROOT/file).read_bytes()).hexdigest(),'states':['intact','damaged','ruined']}
            assets.append(asset)
            print(f'{asset_id:31} {counts} total={asset["totalTriangles"]} bytes={asset["bytes"]}')
    manifest={'version':1,'name':'naval-base-models-v1','units':'metres','up':'+Y','front':'+Z','origin':'ground-centre','stateScenes':['intact','damaged','ruined'],'defaultState':'intact','material':'one PBR material per GLB; linear vertex colours; no textures','compression':'none','license':'CC0-1.0','assets':assets}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    main()
