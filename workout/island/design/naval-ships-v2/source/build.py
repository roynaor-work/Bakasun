#!/usr/bin/env python3
"""Rebuild the original, text-free naval fleet. Python 3 + NumPy; no asset downloads."""
import hashlib
import json
import math
from pathlib import Path
import struct

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PALETTES = {
    'player': {'hull': '258b8a', 'shade': '2c6569', 'trim': 'e9be69',
               'cream': 'fff0cc', 'dark': '354c58', 'glass': 'a4dbdc',
               'wood': 'b97b50', 'cargo': '76b1a2'},
    'enemy': {'hull': '733e54', 'shade': '354251', 'trim': 'dc7758',
              'cream': 'ffe3b0', 'dark': '354251', 'glass': 'a4dbdc',
              'wood': '815442', 'cargo': 'b97b50'},
}
SPECS = {
    'destroyer': (6.2, 1.55, .48, .34, 'משחתת'),
    'cruiser': (7.3, 1.9, .58, .42, 'סיירת'),
    'light-carrier': (8.2, 2.6, .62, .44, 'נושאת מטוסים קטנה'),
    'cargo-ship': (6.8, 2., .55, .4, 'ספינת משא'),
    'speedboat': (3.8, 1.25, .29, .24, 'סירה מהירה'),
    'base-ship': (7., 3.4, .6, .38, 'ספינת בסיס'),
}


def linear(h):
    c = np.array([int(h[i:i+2], 16)/255 for i in (0, 2, 4)])
    return np.where(c <= .04045, c/12.92, ((c+.055)/1.055)**2.4)


class Geo:
    def __init__(self):
        self.faces = []

    def face(self, points, color, normal=None):
        p = [np.asarray(v, dtype=float) for v in points]
        n = np.cross(p[1]-p[0], p[2]-p[0])
        if np.linalg.norm(n) < 1e-10:
            raise ValueError('Degenerate face')
        if normal is not None and np.dot(n, normal) < 0:
            p.reverse()
        for i in range(1, len(p)-1):
            n = np.cross(p[i]-p[0], p[i+1]-p[0])
            n /= np.linalg.norm(n)
            self.faces.append(([p[0], p[i], p[i+1]], n, color))

    def box(self, p, size, color):
        x, y, z = np.asarray(size)/2
        v = np.array([[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],
                      [-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]])+p
        for ix, n in [([0,3,2,1],[0,0,-1]),([4,5,6,7],[0,0,1]),
                      ([0,4,7,3],[-1,0,0]),([1,2,6,5],[1,0,0]),
                      ([3,7,6,2],[0,1,0]),([0,1,5,4],[0,-1,0])]:
            self.face(v[ix], color, n)

    def prism(self, p, size, color, top=.88, bevel=.16):
        x, h, z = np.asarray(size)/2
        outline = [(x*(1-bevel),z),(x,z*(1-bevel)),(x,-z*(1-bevel)),
                   (x*(1-bevel),-z),(-x*(1-bevel),-z),(-x,-z*(1-bevel)),
                   (-x,z*(1-bevel)),(-x*(1-bevel),z)]
        self.rings(p, [(a,-h,b) for a,b in outline],
                   [(a*top,h,b*top) for a,b in outline], color)

    def rings(self, p, lower, upper, color, caps=True):
        lo, hi = np.asarray(lower)+p, np.asarray(upper)+p
        for i in range(len(lo)):
            j = (i+1) % len(lo)
            normal = (lo[i]+lo[j]+hi[i]+hi[j])/4-p
            normal[1] = 0
            self.face([lo[i],lo[j],hi[j],hi[i]], color, normal)
        if caps:
            for ring, n in [(lo,[0,-1,0]), (hi,[0,1,0])]:
                center = ring.mean(axis=0)
                for i in range(len(ring)):
                    self.face([center,ring[i],ring[(i+1)%len(ring)]], color, n)

    def cylinder(self, a, b, radius, color, sides=8, r2=None, caps=True):
        a, b = np.asarray(a), np.asarray(b)
        axis = b-a
        axis = axis/np.linalg.norm(axis)
        u = np.cross(axis, [0,0,1] if abs(axis[2]) < .9 else [0,1,0])
        u /= np.linalg.norm(u)
        v = np.cross(axis, u)
        rings = []
        for p, r in [(a,radius),(b,radius if r2 is None else r2)]:
            rings.append([p+r*(u*math.cos(i*2*math.pi/sides)+v*math.sin(i*2*math.pi/sides)) for i in range(sides)])
        lo, hi = rings
        for i in range(sides):
            j = (i+1) % sides
            self.face([lo[i],lo[j],hi[j],hi[i]], color,
                      (lo[i]+lo[j]+hi[i]+hi[j])/4-(a+b)/2)
        if caps:
            for ring, p, n in [(lo,a,-axis),(hi,b,axis)]:
                for i in range(sides):
                    self.face([p,ring[i],ring[(i+1)%sides]], color, n)

    def beam(self, a, b, width, color):
        self.cylinder(a, b, width/2, color, sides=4)

    def annulus(self, p, radius, width, color, sides=16):
        x,y,z = p
        for i in range(sides):
            a,b = i*math.tau/sides,(i+1)*math.tau/sides
            self.face([[x+r*math.cos(t),y,z+r*math.sin(t)]
                       for r,t in [(radius,a),(radius,b),(radius-width,b),(radius-width,a)]],color,[0,1,0])


class GLB:
    def __init__(self, kind, team):
        self.kind, self.team = kind, team
        self.data = bytearray()
        self.d = {'asset': {'version':'2.0','generator':'Bakasun naval-ships-v2 original geometry',
                            'copyright':'CC0-1.0'},
                  'scene':0,'scenes':[{'name':'default','nodes':[0]}],
                  'nodes':[{'name':kind,'children':[], 'extras':{'team':team,'waterlineY':0}}],
                  'meshes':[], 'accessors':[], 'bufferViews':[],
                  'materials':[{'name':'paint','pbrMetallicRoughness':{
                      'baseColorFactor':[1,1,1,1],'metallicFactor':.05,'roughnessFactor':.76}}]}
        for name, color in [('port','f25449'),('starboard','76d7a2'),('warm','fff0cc')]:
            rgb = linear(color).tolist()
            self.d['materials'].append({'name':name+'_light','pbrMetallicRoughness':{
                'baseColorFactor':[*rgb,1],'metallicFactor':0,'roughnessFactor':.4},
                'emissiveFactor':rgb})
        self.palette = {k:linear(v) for k,v in PALETTES[team].items()}
        self.triangles = 0

    def acc(self, values, kind, target=None, indices=False):
        a = np.asarray(values, dtype='<u2' if indices else '<f4')
        self.data.extend(b'\0'*((-len(self.data))%4))
        view = {'buffer':0,'byteOffset':len(self.data),'byteLength':a.nbytes}
        if target:
            view['target'] = target
        self.d['bufferViews'].append(view)
        self.data.extend(a.tobytes())
        ac = {'bufferView':len(self.d['bufferViews'])-1,'componentType':5123 if indices else 5126,
              'count':len(a),'type':kind}
        if kind in ('VEC3','SCALAR'):
            ac['min'] = np.atleast_1d(a.min(axis=0)).tolist()
            ac['max'] = np.atleast_1d(a.max(axis=0)).tolist()
        self.d['accessors'].append(ac)
        return len(self.d['accessors'])-1

    def node(self, name, g=None, p=(0,0,0), parent=0, material=0, extras=None):
        n = {'name':name,'translation':list(p)}
        if extras:
            n['extras'] = extras
        if g is not None:
            positions, normals, colors, ix, lookup = [],[],[],[],{}
            for tri,normal,color in g.faces:
                c = self.palette[color] if material == 0 else np.ones(3)
                for point in tri:
                    key = tuple(np.round(np.r_[point,normal,c],7))
                    if key not in lookup:
                        lookup[key] = len(positions)
                        positions.append(point); normals.append(normal); colors.append(c)
                    ix.append(lookup[key])
            attributes = {'POSITION':self.acc(positions,'VEC3',34962),
                          'NORMAL':self.acc(normals,'VEC3',34962)}
            if material == 0:
                attributes['COLOR_0'] = self.acc(colors,'VEC3',34962)
            primitive = {'attributes':attributes,'indices':self.acc(ix,'SCALAR',34963,True),
                         'material':material,'mode':4}
            self.d['meshes'].append({'name':name+'_geometry','primitives':[primitive]})
            n['mesh'] = len(self.d['meshes'])-1
            self.triangles += len(ix)//3
        self.d['nodes'].append(n)
        index = len(self.d['nodes'])-1
        self.d['nodes'][parent].setdefault('children',[]).append(index)
        return index

    def finish(self):
        radar = next(i for i,n in enumerate(self.d['nodes']) if n['name']=='radar')
        times = self.acc([0,1,2,3,4],'SCALAR')
        rotations = self.acc([[0,math.sin(i*math.pi/4),0,math.cos(i*math.pi/4)] for i in range(5)],'VEC4')
        self.d['animations'] = [{'name':'radar_spin','samplers':[{'input':times,'output':rotations,'interpolation':'LINEAR'}],
                                 'channels':[{'sampler':0,'target':{'node':radar,'path':'rotation'}}]}]
        self.d['buffers'] = [{'byteLength':len(self.data)}]
        j = json.dumps(self.d,separators=(',',':')).encode()
        j += b' '*((-len(j))%4)
        self.data.extend(b'\0'*((-len(self.data))%4))
        blob = struct.pack('<III',0x46546c67,2,28+len(j)+len(self.data))
        blob += struct.pack('<II',len(j),0x4e4f534a)+j
        blob += struct.pack('<II',len(self.data),0x004e4942)+self.data
        path = ROOT/'models'/f'{self.kind}-{self.team}.glb'
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(blob)
        # Include every scene instance and its complete rest transform.
        lo,hi = np.full(3,np.inf),np.full(3,-np.inf)
        def bounds(i, matrix):
            nonlocal lo,hi
            n = self.d['nodes'][i]
            local = np.eye(4)
            if 'rotation' in n:
                x,y,z,w = n['rotation']
                local[:3,:3] = [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                                [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                                [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
            local[:3,3] = n.get('translation',[0,0,0])
            matrix = matrix@local
            if 'mesh' in n:
                for p in self.d['meshes'][n['mesh']]['primitives']:
                    a = self.d['accessors'][p['attributes']['POSITION']]
                    import itertools
                    corners = np.array(list(itertools.product(*zip(a['min'],a['max']))))
                    world = (matrix@np.c_[corners,np.ones(len(corners))].T).T[:,:3]
                    lo = np.minimum(lo,world.min(axis=0))
                    hi = np.maximum(hi,world.max(axis=0))
            for c in n.get('children',[]):
                bounds(c,matrix)
        bounds(0,np.eye(4))
        assert 600 <= self.triangles <= 1500, (self.kind,self.triangles)
        pivots = {n['name']:n['translation'] for n in self.d['nodes'][1:]
                  if n['name'] in ('turret','funnel','radar','lights')}
        return {'id':self.kind+'-'+self.team,'ship':self.kind,'team':self.team,
                'file':str(path.relative_to(ROOT)), 'bytes':len(blob),
                'sha256':hashlib.sha256(blob).hexdigest(),'triangles':self.triangles,
                'boundsMetres':{'min':lo.round(5).tolist(),'max':hi.round(5).tolist(),
                                'size':(hi-lo).round(5).tolist()},
                'drawCalls':len(self.d['meshes']), 'pivotsMetres':pivots,
                'nodes':[n['name'] for n in self.d['nodes']],
                'animation':{'name':'radar_spin','node':'radar','axis':'+Y','durationSeconds':4,'loop':True}}


def hull(g, length, beam, deck, draft, x=0):
    w = beam/2
    outline = [(0,length*.5),(w*.44,length*.43),(w*.82,length*.29),
               (w,length*.05),(w,-length*.36),(w*.78,-length*.5),
               (-w*.78,-length*.5),(-w,-length*.36),(-w,length*.05),
               (-w*.82,length*.29),(-w*.44,length*.43)]
    rings = [(draft*-.95,.62),(-.055,.91),(.045,1.),(deck-.065,1.015),(deck,.99)]
    for i in range(len(rings)-1):
        y,s = rings[i]; yy,ss = rings[i+1]
        a = [(xx*s,y,z*s) for xx,z in outline]
        b = [(xx*ss,yy,z*ss) for xx,z in outline]
        g.rings([x,0,0],a,b,['dark','shade','hull','trim'][i],caps=False)
    for (y,s),normal,color in [(rings[0],[0,-1,0],'dark'),(rings[-1],[0,1,0],'cream')]:
        for i in range(len(outline)):
            a,b = outline[i],outline[(i+1)%len(outline)]
            g.face([[x,y,0],[x+a[0]*s,y,a[1]*s],[x+b[0]*s,y,b[1]*s]],color,normal)


def cabin(g, p, size):
    x,y,z = p; w,h,l = size
    g.prism(p,size,'cream',top=.84)
    # Pane offsets follow the sloping faces, avoiding floating windows.
    y0,y1 = y+h*.06,y+h*.30
    def half_at(t, extent):
        return extent/2*(1-.16*(t-(y-h/2))/h)
    for s in (-1,1):
        for zz in (-.21,.17):
            z0,z1 = z+l*(zz-.13),z+l*(zz+.13)
            g.face([[x+s*(half_at(t,w)+.002),t,zz2]
                    for t,zz2 in [(y0,z0),(y0,z1),(y1,z1),(y1,z0)]], 'glass',[s,0,0])
    for xx in (-.21,.21):
        x0,x1 = x+w*(xx-.16),x+w*(xx+.16)
        g.face([[xx2,t,z+half_at(t,l)+.002]
                for xx2,t in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]], 'glass',[0,0,1])
    g.prism([x,y+h*.51,z],[w*.96,.09,l*.96],'trim',top=1.)


def bollards(g, length, beam, deck, count=4):
    for i in range(count):
        side = -1 if i%2 else 1
        z = length*(.29 if i<2 else -.36)
        x = side*beam*.32
        g.cylinder([x,deck,z],[x,deck+.095,z],.055,'dark',sides=6)
        g.box([x,deck+.105,z],[.18,.045,.085],'trim')


def rails(g, length, beam, deck, scale=1.):
    for s in (-1,1):
        x,z0,z1 = s*beam*.43,-length*.34,-length*.08
        y = deck+.22*scale
        for z in (z0,z1):
            g.beam([x,deck,z],[x,y,z],.035*scale,'cream')
        g.beam([x,y,z0],[x,y,z1],.03*scale,'cream')


def turret(f, pos, scale=1., twin=False, suffix='', heading=0):
    g=Geo()
    g.cylinder([0,0,0],[0,.09*scale,0],.35*scale,'dark',sides=8)
    g.prism([0,.23*scale,0],[.62*scale,.35*scale,.60*scale],'hull',top=.70)
    g.box([0,.405*scale,-.03*scale],[.24*scale,.025*scale,.21*scale],'trim')
    t = f.node('turret'+suffix,g,pos,extras={'role':'gun-yaw','axis':'+Y','yawLimitsDegrees':[-150,150]})
    if heading:
        f.d['nodes'][t]['rotation'] = [0,1,0,0]
    b = Geo()
    for x in ([-.115*scale,.115*scale] if twin else [0.]):
        b.cylinder([x,0,0],[x,0,.70*scale],.055*scale,'dark',sides=6)
        b.cylinder([x,0,.62*scale],[x,0,.82*scale],.083*scale,'trim',sides=6)
        # Solid dark recessed muzzle, no zero-area or coincident cap.
        b.cylinder([x,0,.821*scale],[x,0,.825*scale],.052*scale,'dark',sides=6)
    barrel = f.node('barrel'+suffix,b,[0,.29*scale,.23*scale],t,
                    extras={'role':'gun-pitch','axis':'+X','pitchLimitsDegrees':[-35,5]})
    f.node('muzzle'+suffix,p=[0,0,.83*scale],parent=barrel,extras={'forward':'+Z'})


def equipment(f, g, deck, radar_pos, funnel_pos, compact=False, second=False):
    k = .6 if compact else 1.
    # Exhaust is a separate component even on the fast boat (compact twin exhausts).
    e=Geo()
    if compact:
        for x in (-.11,.11):
            e.cylinder([x,0,0],[x,.30,0],.075,'hull',sides=8)
            e.cylinder([x,.28,0],[x,.34,0],.09,'dark',sides=8)
    else:
        for z in ([0,-.72] if second else [0]):
            e.prism([0,.32,z],[.44,.64,.52],'hull',top=.77)
            e.prism([0,.65,z],[.4,.12,.47],'dark',top=1.)
            e.box([0,.49,z+.225],[.36,.08,.03],'trim')
    f.node('funnel',e,funnel_pos,extras={'role':'exhaust','smokeAnchor':'exhaust'})
    f.node('exhaust',p=[funnel_pos[0],funnel_pos[1]+(.34 if compact else .72),funnel_pos[2]],
           extras={'role':'smoke-anchor'})
    x,y,z=radar_pos
    g.cylinder([x,deck,z],[x,y,z],.045*k,'dark',sides=6)
    r=Geo()
    r.cylinder([0,-.08*k,0],[0,.08*k,0],.12*k,'trim',sides=8)
    r.box([0,.12*k,0],[.96*k,.24*k,.07*k],'hull')
    r.box([0,.12*k,.04*k],[.82*k,.12*k,.015*k],'glass')
    for xx in (-.32,.0,.32):
        r.box([xx*k,.12*k,.055*k],[.025*k,.19*k,.018*k],'cream')
    f.node('radar',r,radar_pos,extras={'role':'radar','axis':'+Y','periodSeconds':4})


def lights(f, beam, deck, z, mast):
    parent = f.node('lights',p=[0,deck,z],extras={'role':'navigation-lights','emissive':True})
    # glTF +X is starboard, -X is port when facing +Z.
    for name, x, material in [('port_light',-beam*.36,1),('starboard_light',beam*.36,2)]:
        q=Geo(); q.prism([0,0,0],[.12,.12,.16],'cream',top=.7)
        f.node(name,q,[x,.20,0],parent,material)
    q=Geo(); q.cylinder([0,0,0],[0,.12,0],.06,'cream',sides=6)
    f.node('mast_light',q,[mast[0],mast[1]-deck+.20,mast[2]-z],parent,3)
    q=Geo(); q.box([0,0,0],[.12,.10,.07],'cream')
    f.node('stern_light',q,[0,.15,-SPECS[f.kind][0]*.45-z],parent,3)


def aircraft(g, x,z,y,scale=.65):
    s=scale
    g.cylinder([x,y,z-.42*s],[x,y,z+.42*s],.075*s,'cream',sides=6,r2=.025*s)
    g.face([[x-.66*s,y,z-.19*s],[x,y,z+.17*s],[x+.66*s,y,z-.19*s],
            [x+.2*s,y,z-.30*s],[x-.2*s,y,z-.30*s]],'trim',[0,1,0])
    # A thin solid swept wing and tail silhouette, no insignia.
    g.face([[x-.66*s,y-.025*s,z-.19*s],[x,y-.025*s,z+.17*s],[x+.66*s,y-.025*s,z-.19*s],
            [x+.2*s,y-.025*s,z-.30*s],[x-.2*s,y-.025*s,z-.30*s]],'trim',[0,-1,0])
    g.box([x,y+.1*s,z-.30*s],[.025*s,.24*s,.18*s],'hull')
    g.box([x,y+.045*s,z-.29*s],[.33*s,.025*s,.13*s],'cream')
    g.prism([x,y+.065*s,z+.12*s],[.10*s,.07*s,.21*s],'glass')


def build_ship(kind,team):
    length,beam,deck,draft,label = SPECS[kind]
    f=GLB(kind,team); g=Geo()
    if kind == 'base-ship':
        for x in (-1.12,1.12):
            hull(g,length,.95,deck,draft,x=x)
        g.prism([0,deck-.02,-.12],[3.35,.25,5.9],'cream',top=1.)
        g.prism([0,deck+.13,1.70],[2.7,.12,1.5],'shade',top=1.)
        cabin(g,[0,deck+.55,-1.1],[1.35,1.05,1.6])
        cabin(g,[0,deck+1.23,-1.30],[1.,.38,1.])
        # Open stern service gantry and two supply tanks.
        for x in (-1.23,1.23):
            g.box([x,deck+.55,-2.25],[.12,1.1,.18],'trim')
            g.cylinder([x,deck+.2,.10],[x,deck+.2,.95],.2,'cargo',sides=8)
        g.box([0,deck+1.08,-2.25],[2.58,.14,.18],'trim')
        g.box([0,deck+.86,-2.25],[.14,.30,.10],'dark')
        g.annulus([0,deck+.198,1.7],.57,.035,'cream')
        for x in (-1,1):
            g.prism([x,deck+.18,-.8],[.36,.32,.44],'wood',top=1.)
        radar=(0,deck+2.0,-1.3); funnel=(.95,deck,-1.2)
        turret(f,[0,deck+.20,2.35],.9)
    else:
        hull(g,length,beam,deck,draft)
        if kind == 'destroyer':
            cabin(g,[0,deck+.42,-.20],[.96,.80,1.65])
            g.prism([0,deck+.08,-1.85],[.78,.15,.85],'shade',top=1.)
            for x in (-.22,.22):
                g.box([x,deck+.18,-1.8],[.22,.15,.58],'hull')
                g.box([x,deck+.26,-1.8],[.12,.025,.46],'dark')
            radar=(0,deck+1.7,-.15); funnel=(0,deck,-1.25)
            turret(f,[0,deck,1.65],.95)
            g.annulus([0,deck+.006,-2.4],.36,.04,'trim',sides=12)
        elif kind == 'cruiser':
            g.prism([0,deck+.16,-.12],[1.35,.32,2.45],'hull',top=.9)
            cabin(g,[0,deck+.66,.10],[1.08,.72,1.38])
            g.prism([0,deck+1.12,-.05],[.65,.25,.76],'cream',top=.82)
            radar=(0,deck+2.12,-.12); funnel=(0,deck+.30,-.94)
            turret(f,[0,deck,2.18],1.05,True)
            turret(f,[0,deck,-2.55],.88,True,'_aft',heading=math.pi)
        elif kind == 'light-carrier':
            g.prism([0,deck+.08,0],[2.85,.18,7.9],'trim',top=1.,bevel=.13)
            g.prism([0,deck+.181,0],[2.68,.025,7.67],'dark',top=1.,bevel=.13)
            for x in (-.91,.35):
                g.box([x,deck+.198,.10],[.035,.012,5.15],'cream')
            for z in (-2.1,-1.5,-.9):
                g.box([-.30,deck+.20,z],[.95,.015,.027],'trim')
            cabin(g,[.88,deck+.66,-.70],[.72,.86,1.42])
            g.prism([.88,deck+1.19,-.93],[.48,.25,.67],'cream')
            radar=(.88,deck+1.93,-.8); funnel=(.9,deck+.2,-1.9)
            turret(f,[-1.1,deck+.2,2.65],.56)
            aircraft(g,-.62,1.85,deck+.27,.75)
            aircraft(g,-.65,.55,deck+.27,.75)
            # Two deck service chests.
            for z in (-2.7,-3.15):
                g.prism([.95,deck+.33,z],[.40,.22,.30],'hull',top=1.)
        elif kind == 'cargo-ship':
            cabin(g,[0,deck+.58,-2.02],[1.38,1.10,1.18])
            cabin(g,[0,deck+1.27,-2.05],[1.06,.30,.92])
            for i,z in enumerate((-.65,.35,1.35)):
                for x in (-.43,.43):
                    h=.56 if i==2 else .81
                    g.prism([x,deck+h/2,z],[.77,h,.86],['cargo','wood','hull'][i],top=1.,bevel=.04)
                    for zz in (-.27,0,.27):
                        for side in (-1,1):
                            xx=x+side*.389
                            g.face([[xx,deck+h*.075,z+zz-.0125],[xx,deck+h*.925,z+zz-.0125],
                                    [xx,deck+h*.925,z+zz+.0125],[xx,deck+h*.075,z+zz+.0125]],
                                   'trim',[side,0,0])
                    g.box([x,deck+h+.012,z],[.60,.025,.03],'trim')
            # A small derrick between containers and the bow.
            g.box([-.65,deck+.60,2.03],[.11,1.2,.12],'trim')
            g.beam([-.65,deck+1.16,2.03],[.52,deck+.93,2.03],.08,'trim')
            g.beam([.52,deck+.93,2.03],[.52,deck+.55,2.03],.025,'dark')
            radar=(0,deck+2.02,-2.02); funnel=(.53,deck+.25,-2.82)
            turret(f,[0,deck,2.60],.49)
        elif kind == 'speedboat':
            g.prism([0,deck+.04,-.38],[.83,.12,1.39],'dark',top=1.)
            cabin(g,[0,deck+.35,.13],[.78,.57,.91])
            for x in (-.21,.21):
                g.prism([x,deck+.16,-.72],[.28,.25,.36],'cream',top=.9)
                g.prism([x,deck+.31,-.85],[.30,.25,.10],'hull',top=.9)
            for x in (-.25,.25):
                g.prism([x,deck-.015,-1.77],[.24,.46,.35],'hull',top=.80)
                g.cylinder([x,-.13,-1.78],[x,-.13,-1.99],.1,'dark',sides=6)
            for side in (-1,1):
                for z in (-1.11,-.48):
                    g.cylinder([side*.53,deck*.5,z-.11],[side*.53,deck*.5,z+.11],.065,'dark',sides=6)
            radar=(0,deck+1.01,-.24); funnel=(0,deck,-1.32)
            turret(f,[0,deck,1.12],.41)
    equipment(f,g,deck,radar,funnel,compact=kind=='speedboat',second=kind=='cruiser')
    bollards(g,length,beam,deck)
    rails(g,length,beam,deck,.7 if kind=='speedboat' else 1.)
    # Ventilation housings stay readable at gameplay scale.
    if kind in ('destroyer','cruiser'):
        for x in (-beam*.33,beam*.33):
            g.prism([x,deck+.12,.62],[.20,.22,.45],'shade',top=.8)
            for z in (.48,.61,.74):
                g.box([x,deck+.237,z],[.14,.016,.025],'dark')
    f.node('hull',g)
    lights(f,beam,deck, .45 if kind=='speedboat' else -.2,radar)
    f.node('bow',p=[0,.025,length*.5],extras={'role':'bow-spray'})
    f.node('wake',p=[0,.025,-length*.5],extras={'role':'wake'})
    return f.finish()


def main():
    models=[]
    for kind in SPECS:
        for team in PALETTES:
            model=build_ship(kind,team)
            print(model['id'],model['triangles'],model['bytes'])
            models.append(model)
    manifest={'schemaVersion':1,'id':'naval-ships-v2','version':'2.0.0',
              'createdDate':'2026-11-14','license':'CC0-1.0','licenseFile':'LICENSES.md',
              'report':'REPORT.md','preview':{'file':'preview.html','viewport':[844,390]},
              'coordinates':{'units':'metres','handedness':'right','up':'+Y','forward':'+Z',
                             'right':'+X','waterlineY':0,'origin':'midships at the waterline'},
              'style':{'geometry':'warm low poly, flat normals','text':False,'brands':False,
                       'references':[
                           {'branch':'codex/torpedo-sub-v1','commit':'aab3372c088b5bbf67d387ba4655c707b86e5196'},
                           {'branch':'codex/naval-extras-v1','commit':'bfc24132de75646f42e71512c9ff1fa7a906c6cd'}]},
              'palettesSrgb':PALETTES,'compression':'none','requiredExtensions':[],
              'externalModelResources':False,'triangleBudgetPerSceneInstance':[600,1500],
              'ships':[{'id':k,'labelHe':s[4],'lengthMetres':s[0],'beamMetres':s[1],
                        'deckY':s[2],'variants':{t:f'models/{k}-{t}.glb' for t in PALETTES}}
                       for k,s in SPECS.items()],
              'rig':{'turret':{'axis':'+Y','yawLimitsDegrees':[-150,150]},
                     'barrel':{'axis':'+X','pitchLimitsDegrees':[-35,5]},
                     'muzzle':{'parent':'barrel','forward':'+Z'},
                     'funnel':{'anchor':'exhaust'},
                     'radar':{'clip':'radar_spin','axis':'+Y','periodSeconds':4},
                     'lights':{'children':['port_light','starboard_light','mast_light','stern_light'],
                               'type':'emissive mesh; no punctual lights; toggle group.visible'},
                     'cruiserAdditionalRig':['turret_aft','barrel_aft','muzzle_aft']},
              'source':{'file':'source/build.py','requires':['Python 3','NumPy']},
              'integration':{'runtimeModified':False,'loader':'standard GLTFLoader, no decoders',
                             'previewDependencies':['../../vendor/three.module.js','../../vendor/GLTFLoader.js'],
                             'offline':'serve the repository over HTTP; all resources are same-origin',
                             'animation':'AnimationMixer.clipAction(radar_spin).play(); update mixer with seconds',
                             'scale':'preserve metre units; ships have deliberately stylized proportions',
                             'poolReset':'stop mixer, restore rest transforms (including aft turret yaw PI) and lights visibility'},
              'models':models}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')


if __name__ == '__main__':
    main()
