#!/usr/bin/env python3
"""Original CC0 formula car. Deterministic glTF 2.0 writer; Python stdlib only.

Run from any directory: python3 path/to/source/build.py
Coordinates are authored directly in metres, +Y up, +Z forward, +X driver-left.
This is one design with shared hard points, not three unrelated vehicle meshes.
Source and dedication: ../LICENSES.md.
"""
from collections import defaultdict
from pathlib import Path
import hashlib
import json
import math
import struct

ROOT = Path(__file__).resolve().parents[1]
TAU = math.tau
MATERIALS = [
    ("body_team", "#d93228", .48, .26),
    ("wing_team", "#eceee8", .32, .32),
    ("secondary", "#202730", .25, .48),
    ("tire", "#171b20", 0, .92),
    ("alloy", "#a4afbb", .82, .27),
    ("helmet", "#e6ebee", .15, .3),
    ("visor", "#142d3b", .65, .13),
]


def sub(a, b):
    return tuple(x-y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(a):
    d = math.sqrt(sum(x*x for x in a))
    return tuple(x/d for x in a) if d > 1e-12 else (0, 1, 0)


class Mesh:
    def __init__(self):
        self.parts = defaultdict(lambda: [[], [], []])

    def face(self, material, points, normals=None):
        p, n, indices = self.parts[material]
        start = len(p)
        normal = unit(cross(sub(points[1], points[0]), sub(points[2], points[0])))
        p.extend(points)
        n.extend(normals or [normal]*len(points))
        for i in range(1, len(points)-1):
            indices.extend((start, start+i, start+i+1))

    def box(self, material, center, size):
        x, y, z = center
        a, b, c = (v/2 for v in size)
        p = [(x+sx*a, y+sy*b, z+sz*c) for sx, sy, sz in
             [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
              (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        for ids in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(3,7,6,2),(0,1,5,4)]:
            self.face(material, [p[i] for i in ids])

    def loft(self, material, rings, caps=True, smooth=False):
        """Counter-clockwise cross-sections as seen from the +Z end."""
        normals = []
        if smooth:
            for r, ring in enumerate(rings):
                before, after = rings[max(0,r-1)], rings[min(len(rings)-1,r+1)]
                normals.append([unit(cross(sub(ring[(j+1)%len(ring)],ring[j-1]),
                                          sub(after[j],before[j]))) for j in range(len(ring))])
        for r, (a, b) in enumerate(zip(rings, rings[1:])):
            for j in range(len(a)):
                k = (j+1) % len(a)
                ns = [normals[r][j],normals[r][k],normals[r+1][k],normals[r+1][j]] if smooth else None
                self.face(material, [a[j], a[k], b[k], b[j]], ns)
        if caps:
            self.face(material, list(reversed(rings[0])))
            self.face(material, rings[-1])

    def tube(self, material, a, b, radius, sides=6):
        axis = unit(sub(b, a))
        u = unit(cross(axis, (0,1,0) if abs(axis[1]) < .95 else (0,0,1)))
        v = cross(axis, u)
        rings = [[tuple(c[k]+radius*(math.cos(i*TAU/sides)*u[k]+math.sin(i*TAU/sides)*v[k])
                        for k in range(3)) for i in range(sides)] for c in (a,b)]
        self.loft(material, rings)

    def wheel_profile(self, material, profile, sides, caps=False):
        """Surface of revolution around local X, with smooth shoulder normals."""
        rings = [[(x, r*math.cos(i*TAU/sides), r*math.sin(i*TAU/sides))
                  for i in range(sides)] for x,r in profile]
        for j in range(len(profile)-1):
            x0,r0 = profile[max(0,j-1)]
            x1,r1 = profile[min(len(profile)-1,j+1)]
            na = unit((r0-r1, x1-x0, 0))
            x0,r0 = profile[j]
            x1,r1 = profile[min(len(profile)-1,j+2)]
            nb = unit((r0-r1, x1-x0, 0))
            for i in range(sides):
                k = (i+1) % sides
                normal = lambda t,a: (t[0],t[1]*math.cos(a*TAU/sides),t[1]*math.sin(a*TAU/sides))
                self.face(material, [rings[j][i],rings[j][k],rings[j+1][k],rings[j+1][i]],
                          [normal(na,i),normal(na,k),normal(nb,k),normal(nb,i)])
        if caps:
            self.face(material, list(reversed(rings[0])))
            self.face(material, rings[-1])

    def sphere(self, material, center, radii, sides, bands, visor=False):
        x,y,z = center
        rx,ry,rz = radii
        def point(j,i):
            a = math.pi*j/bands
            b = TAU*i/sides
            n = (math.sin(a)*math.sin(b),math.cos(a),math.sin(a)*math.cos(b))
            return (x+rx*n[0],y+ry*n[1],z+rz*n[2]),unit((n[0]/rx,n[1]/ry,n[2]/rz))
        for j in range(bands):
            for i in range(sides):
                ids = [(j,i),(j+1,i),(j+1,(i+1)%sides),(j,(i+1)%sides)]
                if j == 0:
                    ids = ids[:3]
                if j == bands-1:
                    ids = [ids[0],ids[1],ids[3]]
                pn = [point(*q) for q in ids]
                mid = TAU*(i+.5)/sides
                mat = 'visor' if visor and j == bands//2-1 and math.cos(mid) > .25 else material
                self.face(mat,[a for a,b in pn],[b for a,b in pn])


def section(z, width, bottom, top, bevel=.15, center_x=0):
    """A chamfered rectangular body cross-section, same silhouette in every LOD."""
    w = width/2
    h = top-bottom
    return [(center_x+x, y, z) for x,y in
            [(-w,bottom+bevel*h),(-w+bevel*width,bottom),(w-bevel*width,bottom),
             (w,bottom+bevel*h),(w,top-bevel*h),(w-bevel*width,top),
             (-w+bevel*width,top),(-w,top-bevel*h)]]


def wedge(z, width, bottom, top, center_x=0):
    return [(center_x-width/2,bottom,z),(center_x+width/2,bottom,z),
            (center_x+width*.36,top,z),(center_x-width*.36,top,z)]


def make_car(lod):
    nodes = []
    meshes = {}

    def node(name, parent=None, translation=(0,0,0), extras=None):
        index = len(nodes)
        n = {"name": name, "translation": list(translation), "children": []}
        if extras:
            n['extras'] = extras
        nodes.append(n)
        if parent is not None:
            nodes[parent]['children'].append(index)
        meshes[index] = Mesh()
        return index, meshes[index]

    root,_ = node('formula_car', extras={"license":"CC0-1.0","units":"metres",
        "forward":"+Z","up":"+Y","driverLeft":"+X","length":5.2,"lod":lod,
        "source":"../source/build.py","steering":"steer_front/steer_fl and steer_front/steer_fr: local Y",
        "wheelSpin":"wheel_fl, wheel_fr, wheel_rl, wheel_rr: local +X; angle = distance / radius"})
    _,body = node('chassis',root)
    front,fw = node('wing_front',root,(0,.19,2.27),{"detachable":True,"mass":8,"role":"front_wing"})
    _,rw = node('wing_rear',root,(0,.86,-2.30),{"detachable":True,"mass":9})
    _,engine = node('engine',root)
    _,helmet = node('helmet',root,(0,.81,.03))
    steering,_ = node('steer_front',root,extras={"axis":"Y","targets":["steer_fl","steer_fr"],
        "operation":"Rotate both spindle children about their local Y axes; keep this common parent at identity."})

    # A long tapered raised nose and an open cockpit formed by separate side walls.
    if lod < 2:
        nose = [(2.48,.19,.30,.40),(2.12,.29,.28,.43),(1.40,.39,.24,.55),
                (.80,.58,.20,.66),(.45,.63,.19,.62)]
        body.loft('body_team',[section(*q) for q in reversed(nose)],smooth=True)
        for s in [-1,1]:
            body.loft('body_team',[section(-.77,.16,.20,.64,center_x=s*.30),
                section(-.30,.18,.19,.68,center_x=s*.31),section(.45,.17,.19,.62,center_x=s*.29)],smooth=True)
            # Undercut sidepods taper aggressively toward the rear axle.
            pods = [(-1.65,.29,.18,.34),(-1.02,.60,.20,.50),(-.32,.66,.21,.59),(.49,.40,.26,.52)]
            body.loft('body_team',[section(z,w,b,t,bevel=.27,center_x=s*(.38+w/2)) for z,w,b,t in pods],smooth=True)
            # Black forward radiator mouths are geometry, never textures.
            body.face('secondary',[(s*.50,.30,.505),(s*.79,.30,.505),
                (s*.75,.46,.505),(s*.52,.46,.505)] if s>0 else
                [(s*.52,.46,.505),(s*.75,.46,.505),(s*.79,.30,.505),(s*.50,.30,.505)])
        body.box('secondary',(0,.16,-.10),(1.68,.055,3.40))
        body.box('secondary',(0,.40,-.12),(.44,.12,.88))
        # Cockpit inner well, seat and headrest; there is no solid roof over the driver.
        body.box('secondary',(0,.54,-.53),(.49,.20,.19))
        body.box('secondary',(0,.40,.25),(.44,.10,.14))
        # Narrow engine cover and raised intake behind the helmet.
        engine.loft('body_team',[section(-1.94,.18,.25,.45),section(-1.27,.44,.22,.77),
            section(-.61,.43,.29,1.02),section(-.40,.28,.53,1.04)],smooth=True)
        engine.box('secondary',(0,.88,-.383),(.17,.17,.026))
        if lod == 0:
            # Engine/transaxle visible between the tapered body and rear wheels.
            engine.box('secondary',(0,.31,-1.88),(.34,.26,.43))
            engine.tube('alloy',(0,.62,-1.75),(0,.62,-2.02),.057,12)
            for z in [-1.13,-1.02,-.91,-.80]:
                for s in [-1,1]:
                    engine.box('secondary',(s*.255,.63,z),(.028,.015,.055))
        # Halo follows the open cockpit; the forward post is clearly separated from the nose.
        halo = [(-.30,.78,-.41),(-.34,.85,-.08),(-.27,.82,.36),(0,.79,.57),
                (.27,.82,.36),(.34,.85,-.08),(.30,.78,-.41)]
        for a,b in zip(halo,halo[1:]):
            body.tube('secondary',a,b,.025,6 if lod==0 else 4)
        body.tube('secondary',(0,.60,.57),(0,.79,.57),.024,6 if lod==0 else 4)
    else:
        body.loft('body_team',[wedge(z,w,b,t) for z,w,b,t in
            [(.44,.63,.19,.62),(1.25,.40,.24,.56),(2.48,.19,.30,.40)]])
        for s in [-1,1]:
            body.loft('body_team',[wedge(-1.65,.30,.18,.34,s*.54),
                wedge(-.34,.66,.21,.59,s*.71),wedge(.49,.40,.26,.52,s*.58)])
            # These wall faces leave an actual opening around the helmet even at 500 triangles.
            body.face('body_team',[(s*.22,.37,-.58),(s*.37,.64,-.58),
                (s*.37,.64,.45),(s*.22,.37,.45)] if s<0 else
                [(s*.22,.37,.45),(s*.37,.64,.45),(s*.37,.64,-.58),(s*.22,.37,-.58)])
        body.box('secondary',(0,.18,-.15),(1.52,.055,3.3))
        engine.loft('body_team',[wedge(-1.94,.18,.25,.45),wedge(-1.27,.44,.22,.77),
            wedge(-.61,.43,.29,1.02),wedge(-.40,.28,.53,1.04)])

    # Front and rear wings keep their full span, height and endplates at every level.
    # Local max front Z .33 gives exactly +2.60; rear min -.30 gives exactly -2.60.
    fw.box('wing_team',(0,0,0),(1.96,.055,.66))
    rw.box('wing_team',(0,.13,0),(1.42,.07,.60))
    for s in [-1,1]:
        fw.box('secondary',(s*.965,.055,0),(.03,.22,.66))
        rw.box('wing_team',(s*.715,.025,0),(.035,.37,.60))
    if lod < 2:
        fw.box('wing_team',(0,.075,-.15),(1.82,.035,.24))
        rw.box('secondary',(0,-.12,.055),(1.36,.045,.38))
        for s in [-1,1]:
            body.tube('secondary',(s*.15,.34,2.10),(s*.15,.19,2.21),.025,4)
            body.tube('secondary',(s*.24,.30,-1.96),(s*.24,.94,-2.23),.032,4)
        if lod==0:
            fw.box('body_team',(0,.012,.14),(.36,.06,.38))
            for s in [-1,1]:
                fw.box('wing_team',(s*.62,.12,-.24),(.58,.025,.12))
                rw.box('secondary',(s*.46,-.055,-.08),(.018,.28,.30))
    else:
        # Single broad rear support is still visible in the low-detail silhouette.
        body.face('secondary',[(-.18,.25,-1.94),(.18,.25,-1.94),(.18,.96,-2.25),(-.18,.96,-2.25)])

    helmet.sphere('helmet',(0,0,0),(.135,.16,.16),16 if lod==0 else 10 if lod==1 else 6,
                  8 if lod==0 else 5 if lod==1 else 3,visor=True)

    # Mirrors are rigid, individually detachable branches, including their stems.
    for s,label in [(1,'l'),(-1,'r')]:
        _,mirror = node('mirror_'+label,root,(s*.36,.62,.40),
            {"detachable":True,"mass":.5,"role":"mirror"})
        if lod < 2:
            mirror.tube('secondary',(0,0,0),(s*.22,.05,.03),.012,4)
            mirror.box('body_team',(s*.25,.065,.035),(.14,.08,.16))
            mirror.box('alloy',(s*.25,.065,-.048),(.12,.055,.004))
        else:
            mirror.face('body_team',[(0,0,0),(s*.30,.04,-.03),(s*.30,.12,.10)])

    for label,s,z,r,w in [('fl',1,1.50,.355,.30),('fr',-1,1.50,.355,.30),
                          ('rl',1,-1.55,.375,.37),('rr',-1,-1.55,.375,.37)]:
        x = s*(.845 if label[0]=='f' else .825)
        axle = (x,r,z)
        if label[0]=='f':
            spindle,_ = node('steer_'+label,steering,axle,{"axis":"Y"})
            _,wheel = node('wheel_'+label,spindle,extras={"spinAxis":"X","radius":r,
                "detachable":True,"mass":10,"role":"wheel"})
        else:
            _,wheel = node('wheel_'+label,root,axle,{"spinAxis":"X","radius":r,
                "detachable":True,"mass":11,"role":"wheel"})
        if lod == 0:
            profile = [(-w/2,r*.66),(-w/2,r*.88),(-w*.42,r*.98),(-w*.29,r),
                       (w*.29,r),(w*.42,r*.98),(w/2,r*.88),(w/2,r*.66)]
            wheel.wheel_profile('tire',profile,32)
            wheel.wheel_profile('alloy',[(-w*.505,r*.64),(-w*.505,r*.70),
                (w*.505,r*.70),(w*.505,r*.64)],24)
            wheel.wheel_profile('secondary',[(-w*.36,r*.48),(w*.36,r*.48)],16,caps=True)
            # Five visibly open spokes on each side, not solid toy wheel covers.
            for side in [-1,1]:
                for i in range(5):
                    a = i*TAU/5
                    wheel.tube('alloy',(side*w*.48,.035*math.cos(a),.035*math.sin(a)),
                        (side*w*.48,r*.64*math.cos(a),r*.64*math.sin(a)),.019,4)
            wheel.wheel_profile('secondary',[(-w*.53,.055),(w*.53,.055)],12,caps=True)
        elif lod == 1:
            wheel.wheel_profile('tire',[(-w/2,r*.70),(-w*.32,r),(w*.32,r),(w/2,r*.70)],16)
            wheel.wheel_profile('alloy',[(-w*.505,r*.67),(w*.505,r*.67)],12,caps=True)
            wheel.wheel_profile('secondary',[(-w*.52,r*.40),(w*.52,r*.40)],8,caps=True)
        else:
            wheel.wheel_profile('tire',[(-w/2,r*.88),(-w*.30,r),(w*.30,r),(w/2,r*.88)],8,caps=True)
            # Outer-face metallic hub; rear-facing tyre face stays dark at distance.
            pts = [(s*w*.505,r*.60*math.cos(i*TAU/8),r*.60*math.sin(i*TAU/8)) for i in range(8)]
            wheel.face('alloy',pts if s>0 else list(reversed(pts)))
        # Wishbones: narrow negative space separates every tyre from the body.
        if lod < 2:
            for dz,dy in [(-.31,-.03),(.28,-.03),(0,.16)]:
                body.tube('secondary',(s*.27,r+dy,z+dz),(s*.77,r+.015,z),.016,4)
        else:
            body.face('secondary',[(s*.28,r-.025,z-.18),(s*.79,r,z),
                (s*.28,r+.025,z+.18)] if s>0 else [(s*.28,r+.025,z+.18),
                (s*.79,r,z),(s*.28,r-.025,z-.18)])
    return nodes,meshes


def linear_color(hex_color):
    rgb = [int(hex_color[i:i+2],16)/255 for i in (1,3,5)]
    return [c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb]+[1]


def export(lod):
    nodes,meshes = make_car(lod)
    doc = {"asset":{"version":"2.0","generator":"Original formula-car builder v1",
                    "copyright":"CC0-1.0; see ../LICENSES.md"},
           "scene":0,"scenes":[{"nodes":[0]}],"nodes":nodes,"meshes":[],
           "materials":[{"name":name,"pbrMetallicRoughness":{"baseColorFactor":linear_color(color),
               "metallicFactor":metal,"roughnessFactor":rough}} for name,color,metal,rough in MATERIALS],
           "accessors":[],"bufferViews":[],"buffers":[{"byteLength":0}]}
    blob = bytearray()
    mat_ids = {m[0]:i for i,m in enumerate(MATERIALS)}
    total = 0
    lo = [float('inf')]*3
    hi = [float('-inf')]*3
    triangle_parts = {}

    def accessor(values, kind, component, target):
        while len(blob)%4:
            blob.append(0)
        start = len(blob)
        flat = [x for v in values for x in v] if kind=='VEC3' else values
        blob.extend(struct.pack('<'+('f' if component==5126 else 'H')*len(flat),*flat))
        view = len(doc['bufferViews'])
        doc['bufferViews'].append({"buffer":0,"byteOffset":start,"byteLength":len(blob)-start,"target":target})
        acc = {"bufferView":view,"componentType":component,"count":len(values),"type":kind}
        if kind=='VEC3':
            acc['min'] = [min(v[i] for v in values) for i in range(3)]
            acc['max'] = [max(v[i] for v in values) for i in range(3)]
        index = len(doc['accessors'])
        doc['accessors'].append(acc)
        return index

    def translation(index):
        here = nodes[index]['translation'][:]
        for i,n in enumerate(nodes):
            if index in n['children']:
                parent = translation(i)
                return [a+b for a,b in zip(here,parent)]
        return here

    for index,mesh in meshes.items():
        if not mesh.parts:
            continue
        primitives = []
        triangles = 0
        for material,(p,n,indices) in mesh.parts.items():
            triangles += len(indices)//3
            primitives.append({"attributes":{"POSITION":accessor(p,'VEC3',5126,34962),
                "NORMAL":accessor(n,'VEC3',5126,34962)},"indices":accessor(indices,'SCALAR',5123,34963),
                "material":mat_ids[material],"mode":4})
            origin = translation(index)
            for v in p:
                for j in range(3):
                    lo[j] = min(lo[j],v[j]+origin[j])
                    hi[j] = max(hi[j],v[j]+origin[j])
        nodes[index]['mesh'] = len(doc['meshes'])
        doc['meshes'].append({"name":nodes[index]['name']+'_mesh',"primitives":primitives})
        total += triangles
        triangle_parts[nodes[index]['name']] = triangles
    budget = [6000,2000,500][lod]
    assert total <= budget, (lod,total,budget,triangle_parts)
    assert abs(hi[2]-lo[2]-5.2) < 1e-6
    for n in nodes:
        if not n['children']:
            del n['children']
    while len(blob)%4:
        blob.append(0)
    doc['buffers'][0]['byteLength'] = len(blob)
    js = json.dumps(doc,separators=(',',':')).encode()
    js += b' '*((-len(js))%4)
    content = (struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(blob))+
               struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(blob),b'BIN\0')+blob)
    path = ROOT/'assets'/f'formula-lod{lod}.glb'
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(content)
    return {"level":lod,"file":f'assets/{path.name}',"triangles":total,"budget":budget,
            "bytes":len(content),"sha256":hashlib.sha256(content).hexdigest(),
            "bounds":{"min":[round(x,6) for x in lo],"max":[round(x,6) for x in hi]},
            "nodes":[n['name'] for n in nodes],"trianglesByPart":triangle_parts,
            "primitives":sum(len(m['primitives']) for m in doc['meshes'])}


if __name__ == '__main__':
    levels = [export(i) for i in range(3)]
    assert all(l['nodes']==levels[0]['nodes'] for l in levels)
    manifest = {"license":"CC0-1.0","source":"source/build.py","lengthMetres":5.2,
        "up":"+Y","forward":"+Z","driverLeft":"+X","textures":0,"compression":"none",
        "materials":[m[0] for m in MATERIALS],"lods":levels}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    for level in levels:
        print(f"LOD{level['level']}: {level['triangles']}/{level['budget']} triangles, {level['bytes']:,} bytes")
