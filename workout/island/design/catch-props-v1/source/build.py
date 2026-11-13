#!/usr/bin/env python3
"""Original CC0 catch props. Python 3 standard library; deterministic glTF 2.0.

Run from any directory: python3 path/to/source/build.py
Meshes are authored directly in metres, +Y up, +Z forward. No imported meshes.
"""
from pathlib import Path
import hashlib
import json
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
PALETTE = {
    'cream': '#fff0cc', 'sand': '#dfbf83', 'ochre': '#ba854f', 'wood': '#795444',
    'orange': '#ef884b', 'orange_light': '#ffb36a', 'red': '#d56351', 'coral': '#ec9277',
    'yellow': '#f7ca62', 'gold': '#dca541', 'mint': '#83bfa0', 'green': '#458e7a',
    'teal': '#4b9d9d', 'teal_light': '#8acec1', 'blue': '#527b9b', 'blue_light': '#8bafbf',
    'navy': '#304e67', 'glass': '#3c6e80', 'glass_light': '#78a8b2', 'glass_shine': '#c5ded1',
    'rubber': '#353d42', 'rubber_light': '#515957', 'metal': '#afb8ae', 'metal_dark': '#758b8a',
    'oil': '#403e49', 'oil_edge': '#59515b', 'oil_sheen': '#77717d', 'oil_warm': '#8d7772',
    'water': '#6eafbd', 'water_edge': '#a4ced0', 'water_shine': '#d0e5d9', 'water_deep': '#5895ab',
}
COLORS = list(PALETTE)


def atlas_png():
    """One 1024 square swatch atlas, no lettering, 8 x 8 padded solid tiles."""
    rows = bytearray()
    for y in range(1024):
        rows.append(0)
        for x in range(1024):
            index = (y // 128) * 8 + x // 128
            key = COLORS[index] if index < len(COLORS) else 'cream'
            rgb = bytes.fromhex(PALETTE[key][1:])
            alpha = 232 if key.startswith('oil') else 220 if key.startswith('water') else 255
            rows.extend(rgb + bytes([alpha]))
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1024, 1024, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(rows), 9)) + chunk(b'IEND', b''))


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def mul(v, s):
    return tuple(x * s for x in v)


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(v):
    length = math.sqrt(sum(x*x for x in v))
    if length < 1e-10:
        raise ValueError('Degenerate face')
    return mul(v, 1/length)


class Mesh:
    def __init__(self):
        self.p, self.n, self.uv, self.i = [], [], [], []

    def face(self, points, color):
        points=list(points)
        # Rectangle clipping can leave coincident or collinear boundary vertices.
        changed=True
        while changed and len(points)>=3:
            changed=False
            for i,p in enumerate(points):
                a=sub(p,points[i-1])
                b=sub(points[(i+1)%len(points)],p)
                if sum(v*v for v in cross(a,b))<1e-18:
                    points.pop(i)
                    changed=True
                    break
        if len(points)<3: return
        normal = unit(cross(sub(points[1], points[0]), sub(points[2], points[0])))
        start = len(self.p)
        tile = COLORS.index(color)
        # glTF image origin is the upper left; no texture flip or vertex colours.
        uv = ((tile % 8 + .5) / 8, (tile // 8 + .5) / 8)
        self.p.extend(points)
        self.n.extend([normal]*len(points))
        self.uv.extend([uv]*len(points))
        for i in range(1, len(points)-1):
            self.i.extend([start, start+i, start+i+1])

    def box(self, center, size, color, top=None):
        x, y, z = center
        a, b, c = (v/2 for v in size)
        p = [(x+dx*a, y+dy*b, z+dz*c) for dx, dy, dz in
             [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
              (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        for ids in [(3,2,1,0),(4,5,6,7),(0,1,5,4),(2,3,7,6),(1,2,6,5),(3,0,4,7)]:
            self.face([p[i] for i in ids], top if ids == (2,3,7,6) and top else color)

    def beam(self, a, b, width, depth, color):
        axis = unit(sub(b, a))
        reference = (0,1,0) if abs(axis[1]) < .9 else (0,0,1)
        u = mul(unit(cross(axis, reference)), width/2)
        v = mul(unit(cross(axis, u)), depth/2)
        rings = [[add(q, add(mul(u, s), mul(v, t))) for s, t in [(1,1),(-1,1),(-1,-1),(1,-1)]] for q in [a,b]]
        self.loft(rings, color)

    def loft(self, rings, color, end=None, sides=None):
        n = len(rings[0])
        self.face(rings[0][::-1], end or color)
        for a, b in zip(rings, rings[1:]):
            for i in range(n):
                j = (i+1) % n
                self.face([a[i], a[j], b[j], b[i]], sides[i] if sides else color)
        self.face(rings[-1], end or color)

    def cylinder(self, center, radii, length, color, axis='y', segments=12, cap=None):
        # Rings are counterclockwise as seen from the positive axis.
        rings = []
        for h, r in [(-length/2, radii[0]), (length/2, radii[1])]:
            ring = []
            for i in range(segments):
                angle = math.tau*i/segments
                c, s = r*math.cos(angle), r*math.sin(angle)
                p = (h, c, s) if axis == 'x' else (c, s, h) if axis == 'z' else (c, h, -s)
                ring.append(add(center, p))
            rings.append(ring)
        self.loft(rings, color, end=cap)

    def torus(self, center, radius, tube, color, major=16, minor=4):
        # Upright torus, its hole faces +Z.
        rings = []
        for j in range(major):
            a = math.tau*j/major
            rings.append([add(center, ((radius+tube*math.cos(math.tau*k/minor))*math.cos(a),
                                      (radius+tube*math.cos(math.tau*k/minor))*math.sin(a),
                                      tube*math.sin(math.tau*k/minor))) for k in range(minor)])
        for j in range(major):
            for k in range(minor):
                self.face([rings[j][k], rings[(j+1)%major][k], rings[(j+1)%major][(k+1)%minor],
                           rings[j][(k+1)%minor]], color)

    def icon(self, xy, z, color, back=False):
        # Icons here are convex pieces or explicitly supplied triangles.
        points = [(x,y,z) for x,y in xy]
        self.face(points[::-1] if back else points, color)


def body_ring(z, width, low, high, bevel=.10):
    b = min(bevel, (high-low)/3, width/3)
    return [(x,y,z) for x,y in [(-width,low+b),(-width+b,low),(width-b,low),(width,low+b),
                                (width,high-b),(width-b,high),(-width+b,high),(-width,high-b)]]


def wheels(m, x, y, zs, radius=.32):
    for side in [-1,1]:
        for z in zs:
            m.cylinder((side*x,y,z),(radius,radius),.24,'rubber',axis='x')
            m.cylinder((side*(x+.126),y,z),(radius*.58,radius*.58),.018,'cream',axis='x',segments=8)
            m.cylinder((side*(x+.14),y,z),(.065,.065),.022,'metal_dark',axis='x',segments=8)


def car(kind):
    m = Mesh()
    sedan = kind != 'hatchback'
    color = 'yellow' if kind == 'taxi' else 'coral' if sedan else 'mint'
    length = 2.12 if sedan else 1.82
    m.loft([body_ring(-length,.64,.25,.65),body_ring(-length+.30,.86,.25,.93),
            body_ring(length-.3,.86,.25,.87),body_ring(length,.69,.29,.68)],color)
    # Cabin: sloping glass front/rear, painted roof, chunky window frames.
    rear, roofrear, rooffront, front = (-1.30,-.82,.54,1.10) if sedan else (-1.42,-1.12,.42,.93)
    base, roof = .87, 1.53 if sedan else 1.62
    rings = []
    for z,w,t in [(rear,.79,.96),(roofrear,.66,roof),(rooffront,.66,roof),(front,.79,.96)]:
        rings.append([(-w,base,z),(w,base,z),(w,t,z),(-w,t,z)])
    m.loft(rings, color)
    for side in [-1,1]:
        def window(zlo, zhi, ztoplo, ztophi):
            points=[(side*.779,.99,zlo),(side*.779,.99,zhi),
                    (side*.679,roof-.09,ztophi),(side*.679,roof-.09,ztoplo)]
            m.face(points[::-1] if side == 1 else points, 'glass')
        split = -.17
        window(rear+.16,split-.06,roofrear+.10,split-.06)
        window(split+.06,front-.16,split+.06,rooffront-.08)
        m.box((side*.867,.77,-.28),(.035,.045,.24),'cream')
        m.box((side*.94,.99,.58),(.22,.12,.25),color)
        # Side sill reads clearly from a low chase camera.
        m.box((side*.86,.39,0),(.045,.08,length*1.3),'sand')
    def pane(zbottom,ztop,back):
        # Follow the actual sloped cabin surface, with a 7 mm outward offset.
        offset=-.007 if back else .007
        zb=zbottom+(ztop-zbottom)*(1.01-.96)/(roof-.96)+offset
        zt=zbottom+(ztop-zbottom)*(roof-.075-.96)/(roof-.96)+offset
        points=[(-.70,1.01,zb),(.70,1.01,zb),(.595,roof-.075,zt),(-.595,roof-.075,zt)]
        m.face(points[::-1] if back else points, 'glass_light')
    pane(front,rooffront,False)
    pane(rear,roofrear,True)
    for side in [-1,1]:
        m.box((side*.48,.63,length+.006),(.34,.18,.035),'cream')
        m.box((side*.48,.61,-length-.006),(.33,.15,.035),'red')
        m.box((side*.48,.66,-length-.029),(.14,.045,.012),'yellow')
    m.box((0,.42,length+.04),(1.43,.12,.13),'cream')
    m.box((0,.42,-length-.04),(1.43,.12,.13),'cream')
    m.box((0,.60,length+.028),(.38,.11,.03),'navy')
    wheels(m,.84,.32,[-1.22,1.22] if sedan else [-1.05,1.05])
    if kind == 'taxi':
        m.box((0,roof+.09,-.03),(.54,.18,.25),'gold',top='cream')
        # A geometric checker accent, no taxi lettering or real-world livery.
        for side in [-1,1]:
            for i in range(6):
                m.box((side*.872,.80,-.55+i*.18),(.018,.075,.13),'navy' if i%2 else 'cream')
    return m


def motorcycle():
    m=Mesh()
    for z in [-.83,.86]:
        m.cylinder((0,.34,z),(.34,.34),.20,'rubber',axis='x')
        m.cylinder((0,.34,z),(.22,.22),.215,'sand',axis='x',segments=10)
        m.cylinder((0,.34,z),(.095,.095),.23,'metal_dark',axis='x',segments=8)
    for side in [-1,1]:
        m.beam((side*.11,.35,-.83),(side*.11,.68,-.12),.07,.07,'metal_dark')
        m.beam((side*.12,.34,.86),(side*.12,1.03,.57),.065,.065,'sand')
        m.beam((side*.11,.4,-.35),(side*.11,.9,.35),.08,.08,'metal_dark')
    m.loft([body_ring(-.58,.23,.56,.89,.08),body_ring(.10,.30,.55,1.03,.08),
            body_ring(.52,.25,.62,.98,.08)],'orange')
    m.box((0,.99,-.35),(.46,.14,.72),'navy')
    m.box((0,.58,0),(.37,.25,.40),'metal_dark')
    m.cylinder((0,1.01,.68),(.16,.16),.14,'cream',axis='z',segments=10,cap='yellow')
    m.beam((-.43,1.16,.43),(.43,1.16,.43),.08,.08,'metal_dark')
    m.beam((0,.94,.60),(0,1.16,.43),.09,.09,'sand')
    for side in [-1,1]:
        m.box((side*.39,1.16,.43),(.18,.10,.10),'rubber')
        m.box((side*.28,.65,-.47),(.19,.38,.48),'orange_light')
    m.box((0,.81,-.76),(.20,.12,.055),'red')
    return m


def nitro():
    m=Mesh()
    for cy,r1,r2,h,c in [(.10,.19,.27,.20,'teal'),(.55,.27,.27,.70,'teal'),
                         (.99,.27,.13,.18,'teal_light'),(1.13,.13,.13,.10,'navy'),
                         (1.23,.18,.18,.10,'yellow')]:
        m.cylinder((0,cy,0),(r1,r2),h,c,segments=12)
    for y in [.22,.85]:
        m.cylinder((0,y,0),(.277,.277),.065,'cream')
    # Lightning pictogram assembled from triangles; it is geometry, not a glyph.
    a=(-.03,.76); b=(-.17,.48); c=(-.015,.48); d=(-.08,.29); e=(.17,.58); f=(.015,.58)
    for tri in [(a,b,c),(a,c,f),(f,c,e),(c,d,e)]:
        m.icon(tri,.274,'yellow')
        m.icon(tri,-.274,'yellow',back=True)
    m.box((.16,1.23,0),(.24,.08,.09),'gold')
    return m


def repair_wheel():
    m=Mesh()
    m.torus((0,.56,0),.40,.16,'rubber',major=16)
    for z in [-.13,.13]:
        m.torus((0,.56,z),.29,.045,'green',major=12)
        for i in range(5):
            a=math.tau*i/5
            m.beam((.10*math.cos(a),.56+.10*math.sin(a),z),
                   (.26*math.cos(a),.56+.26*math.sin(a),z),.055,.045,'cream')
    m.cylinder((0,.56,0),(.12,.12),.30,'sand',axis='z',segments=10)
    # Readable from either driving direction: one small wrench on each face.
    for z in [-.19,.19]:
        m.beam((-.22,.32,z),(.17,.74,z),.09,.065,'yellow')
        m.torus((-.22,.32,z),.075,.028,'gold',major=8)
        m.beam((.13,.72,z),(.25,.87,z),.08,.07,'yellow')
        m.beam((.13,.72,z),(.01,.85,z),.08,.07,'yellow')
    return m


def decal(kind, variant):
    m=Mesh()
    n=18 if variant == 'a' else 22
    # Concentric convex-ish rings have identical radial rays and never overlap.
    outline=[]
    for i in range(n):
        a=math.tau*i/n
        r=1+.15*math.sin(3*a+.8)+.08*math.sin(5*a+variant.count('b'))
        outline.append((math.cos(a)*r*(1.38 if variant=='a' else 1.05),0,
                        math.sin(a)*r*(.91 if variant=='a' else 1.4)))
    inner=[mul(p,.73) for p in outline]
    outer,mid,core=('oil_edge','oil','oil_sheen') if kind=='oil' else ('water_edge','water','water_deep')
    for i in range(n):
        j=(i+1)%n
        m.face([inner[i],inner[j],outline[j],outline[i]],outer)
        m.face([(0,0,0),inner[j],inner[i]],core if i in [2,3,4,11] else mid)
    # Both variants remain completely planar at Y=0.
    return m


def warning_sign():
    m=Mesh()
    m.box((0,.045,0),(.72,.09,.63),'wood')
    m.box((0,.65,0),(.095,1.21,.095),'sand')
    for z,back in [(.065,False),(-.065,True)]:
        m.icon([(-.68,1.02),(.68,1.02),(0,2.07)],z,'red',back)
        m.icon([(-.50,1.12),(.50,1.12),(0,1.89)],z+(-.002 if back else .002),'yellow',back)
        # A road bump pictogram, with no lettering or exclamation mark.
        q=z+(-.004 if back else .004)
        m.icon([(-.30,1.24),(.30,1.24),(.30,1.29),(-.30,1.29)],q,'navy',back)
        m.icon([(-.23,1.28),(.23,1.28),(0,1.53)],q,'navy',back)
    m.face([(-.68,1.02,-.065),(-.68,1.02,.065),(0,2.07,.065),(0,2.07,-.065)],'red')
    m.face([(0,2.07,-.065),(0,2.07,.065),(.68,1.02,.065),(.68,1.02,-.065)],'red')
    m.face([(-.68,1.02,-.065),(.68,1.02,-.065),(.68,1.02,.065),(-.68,1.02,.065)],'red')
    return m


def wedge(m,x,z0,z1,width,h0,h1):
    # A solid ramp with a two-centimetre entry lip, bottom at Y=0.
    p=[(x-width/2,0,z0),(x+width/2,0,z0),(x+width/2,h0,z0),(x-width/2,h0,z0),
       (x-width/2,0,z1),(x+width/2,0,z1),(x+width/2,h1,z1),(x-width/2,h1,z1)]
    for ids,c in [((3,2,1,0),'ochre'),((4,5,6,7),'wood'),((0,1,5,4),'wood'),
                  ((2,3,7,6),'navy'),((1,2,6,5),'orange'),((3,0,4,7),'orange')]:
        m.face([p[i] for i in ids],c)
    def height(z): return h0+(h1-h0)*(z-z0)/(z1-z0)+.006
    for side in [-1,1]:
        lo=x+side*(width/2-.14)
        hi=lo+.09
        m.face([(lo,height(z0),z0),(lo,height(z1),z1),(hi,height(z1),z1),(hi,height(z0),z0)],'yellow')
    for z in [z0+(z1-z0)*.35,z0+(z1-z0)*.65]:
        # Chevron arrow points +Z along the driving direction.
        for side in [-1,1]:
            points=[(x,height(z+.29),z+.29),(x+side*.57,height(z-.10),z-.10),
                    (x+side*.57,height(z-.25),z-.25),(x,height(z+.14),z+.14)]
            m.face(points if side>0 else points[::-1],'cream')


def ramp(bridge=False):
    m=Mesh()
    if not bridge:
        wedge(m,0,-1.8,1.8,2.9,.02,.90)
        for side in [-1,1]:
            m.box((side*1.49,.45,1.25),(.12,.90,.26),'sand')
    else:
        wedge(m,0,-4.2,-.75,3.4,.02,1.25)
        wedge(m,0,.75,4.2,3.4,1.25,.02)
        for side in [-1,1]:
            for z in [-1.08,1.08]:
                m.box((side*1.55,.52,z),(.22,1.04,.45),'sand')
            for start,end in [(-3.2,-.78),(.78,3.2)]:
                def h(z): return 1.25*(4.2-abs(z))/3.45+.32
                m.beam((side*1.67,h(start),start),(side*1.67,h(end),end),.09,.10,'yellow')
                for z in [start,end]:
                    m.beam((side*1.67,h(z)-.32,z),(side*1.67,h(z),z),.08,.08,'sand')
    return m


def barrel(m,x=0,z=0):
    for cy,r1,r2,h,c in [(.06,.39,.40,.12,'rubber'),(.20,.35,.38,.16,'blue'),
                         (.36,.38,.39,.16,'cream'),(.54,.39,.39,.20,'blue'),
                         (.72,.39,.38,.16,'cream'),(.86,.38,.34,.12,'blue'),
                         (.94,.34,.34,.04,'navy')]:
        m.cylinder((x,cy,z),(r1,r2),h,c)
    m.cylinder((x+.13,.964,z+.06),(.045,.045),.008,'sand',segments=8)


def clipped(poly, axis, value, less):
    result=[]
    for p,q in zip(poly,poly[1:]+poly[:1]):
        pin=(p[axis]<=value) if less else (p[axis]>=value)
        qin=(q[axis]<=value) if less else (q[axis]>=value)
        if pin: result.append(p)
        if pin != qin:
            t=(value-p[axis])/(q[axis]-p[axis])
            result.append(tuple(a+t*(b-a) for a,b in zip(p,q)))
    return result


def striped_plank(m,width,y,depth,color):
    height=.35
    m.box((0,y,0),(width,height,depth),'cream')
    for z,back in [(depth/2+.002,False),(-depth/2-.002,True)]:
        for i in range(math.ceil(width/.55)+2):
            x=-width/2-.6+i*.55
            poly=[(x,y-height/2),(x+.27,y-height/2),(x+.60,y+height/2),(x+.33,y+height/2)]
            poly=clipped(clipped(poly,0,-width/2,False),0,width/2,True)
            if len(poly)>=3: m.icon(poly,z,color,back)


def barrier(construction=False):
    m=Mesh()
    if construction:
        for x in [-1.08,1.08]:
            for side in [-1,1]:
                m.beam((x,.045,side*.50),(x,1.07,0),.12,.12,'ochre')
            m.box((x,.025,0),(.43,.05,1.14),'rubber')
        striped_plank(m,3.05,.85,.18,'orange')
        striped_plank(m,3.05,.41,.14,'orange')
        for x in [-1.12,1.12]:
            m.cylinder((x,1.15,0),(.11,.11),.20,'yellow',segments=8)
            m.cylinder((x,1.055,0),(.14,.14),.045,'navy',segments=8)
    else:
        for x in [-1.63,1.63]: barrel(m,x)
        striped_plank(m,4.15,.79,.18,'blue')
    return m


def cone():
    m=Mesh()
    m.loft([body_ring(-.35,.35,0,.08,.04),body_ring(.35,.35,0,.08,.04)],'rubber')
    for low,high,r0,r1,c in [(.08,.36,.28,.19,'orange'),(.36,.54,.19,.13,'cream'),
                            (.54,.78,.13,.055,'orange'),(.78,.88,.055,.035,'orange_light')]:
        m.cylinder((0,(low+high)/2,0),(r0,r1),high-low,c,segments=8)
    return m


def guardrail():
    m=Mesh()
    for z in [-1.8,1.8]:
        m.box((0,.035,z),(.42,.07,.35),'wood')
        m.box((.07,.46,z),(.14,.85,.14),'ochre')
    # Corrugated W profile rather than a solid wall; longitudinal axis is +Z.
    profile=[(-.03,.53),(-.14,.60),(-.14,.69),(-.045,.76),(-.14,.83),(-.14,.92),(-.03,.99)]
    for (x0,y0),(x1,y1) in zip(profile,profile[1:]):
        m.face([(x0,y0,-2.5),(x0,y0,2.5),(x1,y1,2.5),(x1,y1,-2.5)],'metal')
        m.face([(x0+.035,y0,-2.5),(x1+.035,y1,-2.5),(x1+.035,y1,2.5),(x0+.035,y0,2.5)],'metal_dark')
    for z in [-2.48,2.48]:
        m.box((-.06,.76,z),(.24,.49,.12),'sand')
        m.box((-.189,.78,z),(.022,.13,.09),'orange_light')
    return m


def helicopter():
    m=Mesh()
    rings=[]
    for z,w,h in [(-1.04,.38,.34),(-.62,.72,.60),(.40,.74,.62),(1.0,.55,.48),(1.43,.20,.23)]:
        rings.append([(w*math.cos(math.tau*i/12),1.26+h*math.sin(math.tau*i/12),z) for i in range(12)])
    m.face(rings[0][::-1],'blue')
    for index,(a,b) in enumerate(zip(rings,rings[1:])):
        for i in range(12):
            j=(i+1)%12
            glass = index>=2 and i in [0,1,2,3,4,5]
            c='glass' if glass else 'cream' if i in [5,6,11,0] else 'blue'
            m.face([a[i],a[j],b[j],b[i]],c)
    m.face(rings[-1],'glass_light')
    # Tail boom, fin, stabilizer.
    m.loft([body_ring(-2.85,.10,1.35,1.59,.03),body_ring(-.85,.32,1.02,1.56,.06)],'blue')
    m.box((0,1.84,-2.67),(.10,.65,.37),'blue',top='cream')
    m.box((0,1.48,-2.22),(1.02,.075,.42),'cream')
    for side in [-1,1]:
        m.box((side*.724,1.24,-.11),(.028,.35,.47),'cream')
        m.box((side*.744,1.33,-.11),(.025,.19,.30),'glass_light')
        m.box((side*.752,1.06,-.16),(.025,.035,.16),'sand')
        # Plain shield silhouette: invented geometry, no agency insignia.
        x=side*.754
        p=[(x,1.11,.38),(x,1.11,.57),(x,.94,.56),(x,.87,.475),(x,.94,.39)]
        m.face(p if side>0 else p[::-1],'yellow')
        # Skids touch the ground exactly at Y=0.
        m.cylinder((side*.66,.07,0),(.07,.07),2.36,'sand',axis='z',segments=8)
        for z in [-.57,.61]:
            m.beam((side*.39,.86,z),(side*.66,.13,z),.075,.075,'metal_dark')
    m.cylinder((0,1.98,-.10),(.23,.23),.30,'navy',segments=10)
    m.cylinder((0,1.96,.56),(.13,.13),.18,'blue_light',segments=8)
    # Tail rotor is static geometry; the required independent main node is below.
    m.cylinder((.15,1.73,-2.70),(.10,.10),.25,'sand',axis='x',segments=8)
    m.box((.285,1.73,-2.70),(.045,.64,.07),'navy')
    m.box((.285,1.73,-2.70),(.045,.07,.64),'navy')
    rotor=Mesh()
    rotor.cylinder((0,0,0),(.16,.16),.16,'sand',segments=10)
    for angle in [0,math.pi/2,math.pi,3*math.pi/2]:
        def p(x,y,z):
            return (x*math.cos(angle)+z*math.sin(angle),y,-x*math.sin(angle)+z*math.cos(angle))
        # Tapered, thick four-blade rotor; pivot is at its physical hub.
        rings=[[p(x,y,z) for x,y in [(-w,-.025),(w,-.025),(w,.025),(-w,.025)]]
               for z,w in [(.13,.09),(1.82,.15),(2.04,.09)]]
        rotor.loft(rings,'navy')
        rotor.face([p(-.12,.027,1.68),p(-.09,.027,1.93),p(.09,.027,1.93),p(.12,.027,1.68)],'yellow')
    return [(m,'body',(0,0,0)),(rotor,'rotor',(0,2.20,-.10))]


def write_glb(asset_id, parts, atlas, decal=False):
    if isinstance(parts,Mesh): parts=[(parts,'mesh',(0,0,0))]
    original=[add(p,offset) for m,_,offset in parts for p in m.p]
    minimum=[min(p[i] for p in original) for i in range(3)]
    maximum=[max(p[i] for p in original) for i in range(3)]
    origin=((minimum[0]+maximum[0])/2,minimum[1],(minimum[2]+maximum[2])/2)
    parts=[(m,name,sub(offset,origin)) for m,name,offset in parts]
    blob=bytearray()
    views=[]
    accessors=[]
    meshes=[]
    nodes=[{'name':asset_id,'children':list(range(1,len(parts)+1)),
            'extras':{'units':'metres','up':'+Y','forward':'+Z','origin':'bottom-centre','license':'CC0-1.0'}}]
    def view(data,target=None):
        while len(blob)%4: blob.append(0)
        v={'buffer':0,'byteOffset':len(blob),'byteLength':len(data)}
        if target: v['target']=target
        blob.extend(data)
        views.append(v)
        return len(views)-1
    def accessor(values,typ,code,component,target):
        flat=[x for row in values for x in row] if isinstance(values[0],tuple) else values
        v=view(struct.pack('<'+code*len(flat),*flat),target)
        a={'bufferView':v,'componentType':component,'count':len(values),'type':typ}
        if typ=='VEC3' and code=='f':
            a['min']=[min(row[i] for row in values) for i in range(3)]
            a['max']=[max(row[i] for row in values) for i in range(3)]
        accessors.append(a)
        return len(accessors)-1
    allpoints=[]
    triangles=0
    for m,name,offset in parts:
        pos=accessor(m.p,'VEC3','f',5126,34962)
        normal=accessor(m.n,'VEC3','f',5126,34962)
        uv=accessor(m.uv,'VEC2','f',5126,34962)
        idx=accessor(m.i,'SCALAR','H',5123,34963)
        meshes.append({'name':name,'primitives':[{'attributes':{'POSITION':pos,'NORMAL':normal,'TEXCOORD_0':uv},
                                                'indices':idx,'material':0,'mode':4}]})
        node={'name':name,'mesh':len(meshes)-1}
        if any(offset): node['translation']=list(offset)
        if name=='rotor': node['extras']={'rotationAxis':'+Y','pivot':'main rotor hub'}
        nodes.append(node)
        allpoints.extend([add(p,offset) for p in m.p])
        triangles+=len(m.i)//3
    imageview=view(atlas)
    material={'name':'catch-flat-atlas','pbrMetallicRoughness':{'baseColorTexture':{'index':0},
                  'metallicFactor':0,'roughnessFactor':1},'doubleSided':False}
    if decal: material.update({'alphaMode':'BLEND','doubleSided':True})
    gltf={'asset':{'version':'2.0','generator':'Original catch-props-v1 / source/build.py',
                   'copyright':'Original work dedicated to CC0-1.0; see LICENSES.md'},
          'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'meshes':meshes,
          'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':accessors,
          'materials':[material],'textures':[{'source':0,'sampler':0}],
          'images':[{'name':'catch-atlas-1024','bufferView':imageview,'mimeType':'image/png'}],
          'samplers':[{'magFilter':9728,'minFilter':9728,'wrapS':33071,'wrapT':33071}]}
    data=json.dumps(gltf,separators=(',',':')).encode()
    data+=b' '*((-len(data))%4)
    blob+=b'\0'*((-len(blob))%4)
    out=(struct.pack('<III',0x46546c67,2,12+8+len(data)+8+len(blob))
         +struct.pack('<II',len(data),0x4e4f534a)+data+struct.pack('<II',len(blob),0x004e4942)+blob)
    path=ROOT/'models'/f'{asset_id}.glb'
    path.write_bytes(out)
    lo=[min(p[i] for p in allpoints) for i in range(3)]
    hi=[max(p[i] for p in allpoints) for i in range(3)]
    if triangles>1500 or abs(lo[1])>1e-6: raise ValueError((asset_id,triangles,lo))
    return {'id':asset_id,'path':f'models/{asset_id}.glb','triangles':triangles,'bytes':len(out),
            'sha256':hashlib.sha256(out).hexdigest(),'bounds':{'min':[round(v,5) for v in lo],
            'max':[round(v,5) for v in hi]},'decal':decal,'nodes':[n['name'] for n in nodes]}


def main():
    (ROOT/'models').mkdir(exist_ok=True)
    atlas=atlas_png()
    (ROOT/'atlas-1024.png').write_bytes(atlas)
    specs=[
        ('nitro-bottle','בקבוק מהירות','pickups',nitro(),False,[-3.6,0,-4]),
        ('repair-wheel','גלגל תיקון','pickups',repair_wheel(),False,[.2,0,-4]),
        ('oil-slick-a','שמן · רחב','hazards',decal('oil','a'),True,[-3.9,0,3]),
        ('oil-slick-b','שמן · ארוך','hazards',decal('oil','b'),True,[-.1,0,3]),
        ('puddle-a','שלולית · רחבה','hazards',decal('water','a'),True,[3.8,0,3]),
        ('puddle-b','שלולית · ארוכה','hazards',decal('water','b'),True,[3.8,0,8]),
        ('warning-sign','שלט אזהרה','hazards',warning_sign(),False,[6.1,0,3]),
        ('short-ramp','רמפה קצרה','jumps',ramp(),False,[-3.6,0,13]),
        ('jump-bridge','גשר קפיצה','jumps',ramp(True),False,[2.4,0,16]),
        ('police-helicopter','מסוק משטרה','vehicles',helicopter(),False,[4.4,4.1,29]),
        ('civilian-hatchback','מכונית קומפקטית','vehicles',car('hatchback'),False,[-3.9,0,24]),
        ('civilian-sedan','מכונית משפחתית','vehicles',car('sedan'),False,[-.15,0,28]),
        ('taxi','מונית','vehicles',car('taxi'),False,[-3.8,0,32]),
        ('motorcycle','אופנוע','vehicles',motorcycle(),False,[3.3,0,25]),
        ('police-barrel','חבית משטרה','barriers',(lambda m:(barrel(m),m)[1])(Mesh()),False,[-5.3,0,39]),
        ('police-barrier','מחסום משטרה','barriers',barrier(),False,[-1.9,0,40]),
        ('construction-barrier','מחסום בנייה','barriers',barrier(True),False,[3.1,0,40]),
        ('traffic-cone','קונוס','roadside',cone(),False,[5.1,0,-3.8]),
        ('guardrail','מעקה','roadside',guardrail(),False,[-6.4,0,11]),
    ]
    assets=[]
    for asset_id,label,group,mesh,isdecal,position in specs:
        result=write_glb(asset_id,mesh,atlas,isdecal)
        result.update({'label':label,'group':group,'previewPosition':position,'license':'CC0-1.0'})
        assets.append(result)
        print(f'{asset_id:24} {result["triangles"]:4} triangles {result["bytes"]:7} bytes')
    manifest={'schemaVersion':1,'name':'catch-props-v1','license':'CC0-1.0',
              'coordinates':{'forward':'+Z','up':'+Y','units':'metres','origin':'bottom-centre'},
              'triangleLimit':1500,'compression':'none','atlas':{'path':'atlas-1024.png',
              'width':1024,'height':1024,'sha256':hashlib.sha256(atlas).hexdigest(),
              'embedding':'Identical PNG embedded in each standalone GLB; one shared atlas design.'},
              'palette':{key:{'color':value,'tile':i,'uv':[(i%8+.5)/8,(i//8+.5)/8]}
                         for i,(key,value) in enumerate(PALETTE.items())},
              'assets':assets,'totals':{'assets':len(assets),'triangles':sum(a['triangles'] for a in assets),
                                       'glbBytes':sum(a['bytes'] for a in assets)}}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    main()
