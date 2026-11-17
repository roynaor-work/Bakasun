#!/usr/bin/env python3
"""Original low-poly Alpine Runner world. Deterministic standard-library GLB authoring.

All mesh vertices, materials and silhouettes are authored here; no stock meshes,
textures, logos, fonts or game assets are used. Run from any working directory.
"""
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TAU = math.tau


def rgb(hex_color):
    values = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in values]


MATERIALS = [
    ('Packed snow', 'e9f5fa', .91, 0), ('Fresh snow', 'ffffff', .97, 0),
    ('Glacier blue', '83cfe3', .53, .05), ('Deep fjord', '264a66', .83, 0),
    ('Evergreen', '397d7c', .94, 0), ('Pine shadow', '285a64', .95, 0),
    ('Cedar', '926952', .91, 0), ('Warm timber', 'bf8b69', .93, 0),
    ('Coral', 'f97966', .64, 0), ('Sun gold', 'ffd16c', .40, .25),
    ('Night slate', '30415b', .82, 0), ('Ice light', 'bdeef4', .43, .05),
    ('Warm window', 'ffe3a0', .62, 0), ('Penguin ink', '263345', .86, 0),
    ('Berry', 'a887cc', .68, 0), ('Mint', '86e0bf', .49, .12),
]
SNOW, WHITE, ICE, DEEP, PINE, PINE_DARK, WOOD, TIMBER, CORAL, GOLD, SLATE, LIGHT_ICE, WINDOW, INK, BERRY, MINT = range(len(MATERIALS))


def sub(a, b): return [a[i] - b[i] for i in range(3)]
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def unit(a):
    length = math.sqrt(sum(v*v for v in a))
    return [v/length for v in a] if length > 1e-12 else [0, 1, 0]


class Mesh:
    def __init__(self): self.parts = {}

    def face(self, points, mat, normals=None):
        part = self.parts.setdefault(mat, {'pos': [], 'normal': [], 'index': []})
        start = len(part['pos'])
        normal = unit(cross(sub(points[1], points[0]), sub(points[2], points[0])))
        part['pos'].extend(points)
        part['normal'].extend(normals if normals else [normal] * len(points))
        for i in range(1, len(points)-1): part['index'].extend([start, start+i, start+i+1])

    def box(self, center, size, mat, yaw=0):
        x, y, z = [s/2 for s in size]
        points = [[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]]
        cs, sn = math.cos(yaw), math.sin(yaw)
        points = [[center[0]+p[0]*cs+p[2]*sn, center[1]+p[1], center[2]-p[0]*sn+p[2]*cs] for p in points]
        for f in ([0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]): self.face([points[i] for i in f], mat)

    def cone(self, center, radius, height, mat, n=7, top_radius=0, axis='y'):
        # Rings run counterclockwise viewed down +Y; positive y points to the tip.
        def place(p):
            if axis == 'z': p = [p[0], -p[2], p[1]]
            elif axis == 'x': p = [p[1], p[0], -p[2]]
            return [center[k]+p[k] for k in range(3)]
        bottom = [place([radius*math.cos(i*TAU/n), -height/2, radius*math.sin(i*TAU/n)]) for i in range(n)]
        top = [place([top_radius*math.cos(i*TAU/n), height/2, top_radius*math.sin(i*TAU/n)]) for i in range(n)]
        self.face(bottom, mat)
        if top_radius: self.face(list(reversed(top)), mat)
        for i in range(n):
            j = (i+1) % n
            self.face([bottom[j], bottom[i], top[i]] + ([top[j]] if top_radius else []), mat)

    def sphere(self, center, radii, mat, segments=10, rings=5):
        # Pole fans avoid zero-area triangles. Smooth ellipsoid normals.
        def sample(theta, phi):
            q = [math.cos(theta)*math.sin(phi), math.cos(phi), math.sin(theta)*math.sin(phi)]
            p = [center[k]+q[k]*radii[k] for k in range(3)]
            return p, unit([q[k]/radii[k] for k in range(3)])
        for r in range(rings):
            for i in range(segments):
                t0, t1 = i*TAU/segments, (i+1)*TAU/segments
                p0, p1 = r*math.pi/rings, (r+1)*math.pi/rings
                corners = [sample(t0,p0), sample(t0,p1), sample(t1,p1), sample(t1,p0)]
                if r == 0: corners = [corners[0],corners[1],corners[2]]
                elif r == rings-1: corners = [corners[0],corners[1],corners[3]]
                corners = list(reversed(corners))
                self.face([c[0] for c in corners], mat, [c[1] for c in corners])

    def glb(self, path, name, extras=None):
        data = bytearray()
        views, accessors, primitives = [], [], []
        def accessor(values, fmt, typ, component, target, bounds=False):
            while len(data) % 4: data.append(0)
            offset = len(data)
            flat = [v for row in values for v in row] if isinstance(values[0], (list,tuple)) else values
            data.extend(struct.pack('<'+fmt*len(flat), *flat))
            vi = len(views)
            views.append({'buffer':0,'byteOffset':offset,'byteLength':len(data)-offset,'target':target})
            ai = len(accessors)
            a = {'bufferView':vi,'componentType':component,'count':len(values),'type':typ}
            if bounds:
                a['min'] = [min(p[k] for p in values) for k in range(3)]
                a['max'] = [max(p[k] for p in values) for k in range(3)]
            accessors.append(a)
            return ai
        used_mats = list(sorted(self.parts))
        tris = 0
        all_pos = []
        for mi in used_mats:
            part = self.parts[mi]
            all_pos.extend(part['pos'])
            p = accessor(part['pos'],'f','VEC3',5126,34962,True)
            n = accessor(part['normal'],'f','VEC3',5126,34962)
            indices = accessor(part['index'],'H','SCALAR',5123,34963)
            tris += len(part['index']) // 3
            primitives.append({'attributes':{'POSITION':p,'NORMAL':n},'indices':indices,'material':used_mats.index(mi),'mode':4})
        materials = []
        for mi in used_mats:
            label, color, roughness, metalness = MATERIALS[mi]
            mat = {'name':label,'pbrMetallicRoughness':{'baseColorFactor':rgb(color)+[1],'metallicFactor':metalness,'roughnessFactor':roughness}}
            if mi == WINDOW: mat['emissiveFactor'] = [v*.25 for v in rgb(color)]
            materials.append(mat)
        asset = {'asset':{'version':'2.0','generator':'Alpine Runner v1 original procedural world'},'scene':0,'scenes':[{'nodes':[0]}],
                 'nodes':[{'name':name,'mesh':0}],'meshes':[{'name':name,'primitives':primitives}],
                 'materials':materials,'buffers':[{'byteLength':len(data)}],'bufferViews':views,'accessors':accessors,
                 'extras':{'original':True,'license':'CC0-1.0',**(extras or {})}}
        js = json.dumps(asset,separators=(',',':'),ensure_ascii=True).encode()
        js += b' ' * (-len(js) % 4)
        data.extend(b'\0' * (-len(data) % 4))
        total = 12+8+len(js)+8+len(data)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(data),b'BIN\0')+data)
        return {'path':path.relative_to(ROOT).as_posix(),'bytes':total,'triangleCount':tris,
                'visualBounds':{'min':[round(min(p[k] for p in all_pos),5) for k in range(3)],'max':[round(max(p[k] for p in all_pos),5) for k in range(3)]}}


def pine(mesh, x, z, h=3, y=0):
    mesh.cone([x,y+h*.22,z],h*.065,h*.44,WOOD,n=6,top_radius=h*.055)
    for j in range(3):
        level = y+h*(.36+j*.21)
        radius = h*(.28-j*.06)
        mesh.cone([x,level,z],radius,h*.54,PINE if j % 2 else PINE_DARK,n=7)
        mesh.cone([x,level+h*.10,z],radius*.87,h*.39,WHITE,n=7)


def crystal(mesh, x, z, h, y=0):
    mesh.cone([x,y+h*.47,z],h*.21,h*.94,ICE,n=5,top_radius=h*.11)
    mesh.cone([x,y+h,z],h*.11,h*.12,LIGHT_ICE,n=5)


def cabin(mesh, x, z, yaw=0, scale=1):
    s = scale
    mesh.box([x,.85*s,z],[2.1*s,1.7*s,2.3*s],TIMBER,yaw)
    # Gabled roof with thick snow cap, rotated as a whole.
    def p(a,b,c): return [x+s*(a*math.cos(yaw)+c*math.sin(yaw)),s*b,z+s*(-a*math.sin(yaw)+c*math.cos(yaw))]
    front = [p(-1.25,1.65,-1.35),p(1.25,1.65,-1.35),p(0,2.55,-1.35)]
    back = [p(-1.25,1.65,1.35),p(1.25,1.65,1.35),p(0,2.55,1.35)]
    mesh.face(list(reversed(front)),WOOD)
    mesh.face(back,WOOD)
    mesh.face([back[0],back[2],front[2],front[0]],WHITE)
    mesh.face([back[2],back[1],front[1],front[2]],SNOW)
    # Side facing the lane is naturally visible from a rear-follow camera.
    for dz in (-.55,.55):
        cx, cy, cz = p(-1.059,.95,dz)
        mesh.box([cx,cy,cz],[.026*s,.50*s,.50*s],WINDOW,yaw)
    cx,cy,cz = p(1.059,.95,0)
    mesh.box([cx,cy,cz],[.026*s,.52*s,.62*s],WINDOW,yaw)
    cx,cy,cz = p(.6,2.25,.5)
    mesh.box([cx,cy,cz],[.31*s,.85*s,.38*s],SLATE,yaw)
    cx,cy,cz = p(.6,2.69,.5)
    mesh.box([cx,cy,cz],[.43*s,.12*s,.49*s],WHITE,yaw)


def centerline(kind, z):
    if z <= 0 or z >= 30: return [0,0,0,0]
    a = math.pi*z/30
    dx = 1.2*math.sin(a)**2 if kind == 'gentle_turn' else 0
    y = 1.5*math.sin(a)**2 if kind == 'slope' else 0
    derivative = math.pi/30*math.sin(2*a)
    return [dx,y,1.2*derivative if kind == 'gentle_turn' else 0,1.5*derivative if kind == 'slope' else 0]


WIDTHS = [-5.6,-3.6,-1.2,1.2,3.6,5.6]
HEIGHTS = [.35,0,0,0,0,.35]


def track(kind):
    m = Mesh()
    # Identical six-vertex profiles at both ports; analytic normals use the same
    # endpoint tangent for every tile. Outer banks do not enter the lane corridor.
    for row in range(20):
        z0, z1 = row*1.5, (row+1)*1.5
        c0,c1 = centerline(kind,z0),centerline(kind,z1)
        for col in range(5):
            w0,w1=WIDTHS[col:col+2]
            h0,h1=HEIGHTS[col:col+2]
            points=[[w0+c0[0],h0+c0[1],z0],[w0+c1[0],h0+c1[1],z1],
                    [w1+c1[0],h1+c1[1],z1],[w1+c0[0],h1+c0[1],z0]]
            sx=(h1-h0)/(w1-w0)
            normals=[unit([-sx,1,-c[3]+sx*c[2]]) for c in [c0,c1,c1,c0]]
            m.face(points,SNOW if col in [1,2,3] else WHITE,normals)
        # Dark snowpack sides remain flush across longitudinal tile ports.
        for side in (-1,1):
            a,b=side*5.6+c0[0],side*5.6+c1[0]
            pts=[[a,c0[1]-.35,z0],[b,c1[1]-.35,z1],[b,c1[1]+.35,z1],[a,c0[1]+.35,z0]]
            m.face(pts if side < 0 else list(reversed(pts)),ICE)
    # Small groove dashes make the three lanes readable without branding/text.
    for z in range(2,30,3):
        za,zb=z-.475,z+.475
        ca,cb=centerline(kind,za),centerline(kind,zb)
        for lane_edge in (-1.2,1.2):
            # Follow the same slope/curve as the road rather than burying a flat
            # marking box in the uphill half of the slope tile.
            m.face([[ca[0]+lane_edge-.025,ca[1]+.018,za],
                    [cb[0]+lane_edge-.025,cb[1]+.018,zb],
                    [cb[0]+lane_edge+.025,cb[1]+.018,zb],
                    [ca[0]+lane_edge+.025,ca[1]+.018,za]],ICE,
                   [unit([0,1,-c[3]]) for c in [ca,cb,cb,ca]])
    # Two end beacons create a steady rhythm as tiles recycle.
    for z in (3,27):
        c=centerline(kind,z)
        for side in (-1,1):
            m.box([c[0]+side*4.15,c[1]+.47,z],[.085,.94,.085],TIMBER)
            m.box([c[0]+side*4.15,c[1]+.87,z],[.17,.17,.12],CORAL if side<0 else MINT)
    if kind == 'straight':
        for x,z,h in [(-6.7,8,3.2),(6.9,19,3.7),(-7.2,24,2.7)]: pine(m,x,z,h)
        m.sphere([6, .45, 8],[1,.7,.9],WHITE,7,3)
    elif kind == 'gentle_turn':
        for x,z,h in [(-6.2,7,3.1),(7.8,13,3.9),(-5.6,21,3.4)]: pine(m,x,z,h)
        for z in (8,16,24):
            c=centerline(kind,z)
            m.box([c[0]-4.5,.75,z],[.9,.32,.12],MINT,.08)
    elif kind == 'slope':
        for side in (-1,1):
            for z,h in [(7,1.4),(14,2.1),(23,1.1)]:
                c=centerline(kind,z)
                crystal(m,side*(6.1+h*.1),z,h,c[1])
        for x,z,h in [(-7.5,14,3.1),(7.8,22,2.9)]: pine(m,x,z,h,centerline(kind,z)[1])
    elif kind == 'bridge':
        for side in (-1,1):
            m.box([side*4.4,.87,15],[.12,.18,24],WOOD)
            m.box([side*4.4,.91,15],[.16,.10,24],WHITE)
            for z in (3,7,11,15,19,23,27): m.box([side*4.4,.37,z],[.18,.9,.18],TIMBER)
            for z in (5,15,25): m.box([side*3.8,-2.2,z],[.6,4,.8],SLATE)
        for z in (5,15,25): m.box([0,-.6,z],[8.7,.55,.9],SLATE)
    elif kind == 'ice_tunnel':
        # A continuous faceted vault, open at z=4/26. Min soffit is 3.7m.
        for j in range(12):
            a0,a1=j*math.pi/12,(j+1)*math.pi/12
            def q(a,z,outer=False): return [(4.5+(.4 if outer else 0))*math.cos(a),.15+(4.2+(.4 if outer else 0))*math.sin(a),z]
            # The soffit faces inward; the separate outer shell stays visible
            # before entering the tunnel. Both remain ordinary opaque material.
            m.face([q(a0,26),q(a1,26),q(a1,4),q(a0,4)],ICE if j%3 else LIGHT_ICE)
            m.face([q(a0,4,True),q(a1,4,True),q(a1,26,True),q(a0,26,True)],LIGHT_ICE)
            for z in (4,26):
                rim=[q(a0,z),q(a0,z,True),q(a1,z,True),q(a1,z)]
                m.face(list(reversed(rim)) if z==4 else rim,LIGHT_ICE)
        for side in (-1,1):
            for z in (5,12,19,25): crystal(m,side*5.15,z,1.6)
        for z in (4.15,25.85):
            for x in (-3,0,3): m.sphere([x,3.9,z],[.14,.1,.14],WINDOW,6,3)
    elif kind == 'village':
        for x,z,yaw,s in [(-7.4,8,.13,1),(7.4,12,-.15,1.1),(-7.5,23,.05,.85),(7,26,-.2,.8)]: cabin(m,x,z,yaw,s)
        pine(m,-6.5,16,2.8)
        pine(m,7.2,4,2.3)
        for side in (-1,1):
            m.cone([side*4.8,1.4,18],.06,2.8,SLATE,n=6,top_radius=.06)
            m.sphere([side*4.8,2.85,18],[.24,.28,.24],WINDOW,8,4)
    elif kind == 'forest':
        for x,z,h in [(-6.7,4,3.3),(7.4,5,4.2),(-7.6,11,4.7),(6.3,13,3.1),(-6.4,20,3.6),(7.5,21,4.5),(-7.5,27,4),(6.4,28,3)]: pine(m,x,z,h)
    elif kind == 'summit':
        for x,z,h in [(-7,6,2.7),(7.2,9,3.3),(-7.5,18,3.8),(6.7,25,2.5)]:
            m.cone([x,h*.39,z],h*.72,h*.78,SLATE,5,top_radius=h*.18)
            m.cone([x,h*.82,z],h*.40,h*.65,WHITE,5)
        for side in (-1,1):
            m.box([side*4.6,1.5,16],[.08,3,.08],TIMBER)
            flag=[[side*4.6,2.9,16],[side*4.6,2.2,16],[side*5.6,2.55,16]]
            m.face(flag if side<0 else list(reversed(flag)),CORAL if side<0 else MINT)
    return m


def prop(kind):
    m=Mesh()
    if kind == 'tree': pine(m,0,0,2.9)
    elif kind == 'rock':
        m.sphere([0,.53,0],[.88,.72,.65],SLATE,7,3)
        m.sphere([-.05,.92,0],[.73,.37,.53],WHITE,7,3)
    elif kind == 'low_fence':
        for x in (-.88,.88):
            m.box([x,.48,0],[.15,.96,.15],WOOD)
            m.box([x,.98,0],[.24,.1,.24],WHITE)
        m.box([0,.56,0],[1.92,.26,.15],CORAL)
        m.box([0,.72,0],[1.95,.09,.20],WHITE)
        m.box([0,.28,0],[1.92,.10,.12],TIMBER)
    elif kind == 'high_beam':
        for x in (-.99,.99): m.box([x,.79,0],[.15,1.58,.19],SLATE)
        m.box([0,1.37,0],[2.14,.64,.26],CORAL)
        m.box([0,1.72,0],[2.22,.10,.34],WHITE)
        for x in (-.6,0,.6): m.box([x,1.37,-.135],[.17,.32,.015],WHITE)
    elif kind == 'cable_car':
        m.box([0,.83,0],[1.5,1.55,1.3],PINE)
        m.box([0,1.17,.66],[1.32,.55,.025],LIGHT_ICE)
        m.box([0,1.17,-.66],[1.32,.55,.025],LIGHT_ICE)
        for x in (-.76,.76): m.box([x,1.17,0],[.025,.55,1.12],DEEP)
        m.box([0,1.67,0],[1.7,.16,1.48],WHITE)
        m.box([0,2.10,0],[.12,.75,.12],SLATE)
        m.box([0,2.46,0],[1.15,.12,.12],SLATE)
        m.box([0,.16,0],[1.6,.16,1.42],CORAL)
    elif kind == 'ice_crevasse':
        # An opaque dark crack decal sits above the immutable snow surface.
        # A thinner raised ice lip suggests depth without requiring a terrain
        # boolean operation or hiding the crack behind the road depth buffer.
        outline=[[-1.06,.009,-.83],[-.43,.009,-.65],[-.10,.009,-.9],[.43,.009,-.7],[1.05,.009,-.8],[1.00,.009,.78],[.52,.009,.65],[.1,.009,.9],[-.44,.009,.72],[-1.04,.009,.82]]
        center=[0,.006,0]
        for i,p in enumerate(outline):
            q=outline[(i+1)%len(outline)]
            m.face([center,q,p],DEEP)
            ip=[v*.86 for v in p]; iq=[v*.86 for v in q]
            ip[1]=iq[1]=.025
            m.face([p,ip,iq,q],ICE if i%2 else LIGHT_ICE)
    elif kind == 'snowman':
        m.sphere([0,.48,0],[.52,.49,.46],WHITE,10,5)
        m.sphere([0,1.14,0],[.38,.37,.35],SNOW,10,5)
        m.sphere([0,1.67,0],[.29,.29,.27],WHITE,10,5)
        m.cone([0,1.44,0],.32,.12,CORAL,10,top_radius=.32)
        m.box([.13,1.22,.34],[.11,.38,.08],CORAL)
        for x in (-.11,.11): m.sphere([x,1.73,.245],[.035,.035,.035],INK,6,3)
        m.cone([0,1.64,.35],.055,.24,CORAL,6,axis='z')
        m.cone([0,1.95,0],.33,.06,SLATE,10,top_radius=.33)
        m.cone([0,2.10,0],.19,.28,SLATE,10,top_radius=.18)
        for x in (-.63,.63): m.box([x,1.15,0],[.62,.07,.07],WOOD,yaw=x*.6)
        for y in (.98,1.15): m.sphere([0,y,.35],[.035,.035,.035],INK,6,3)
    elif kind == 'penguin':
        m.sphere([0,.62,0],[.36,.52,.31],INK,10,5)
        m.sphere([0,.55,.23],[.27,.38,.10],WHITE,10,5)
        m.sphere([0,1.08,0],[.29,.29,.27],INK,10,5)
        for x in (-.11,.11):
            m.sphere([x,1.10,.237],[.065,.076,.035],WHITE,8,4)
            m.sphere([x,1.11,.269],[.025,.033,.015],INK,6,3)
            m.sphere([x,.07,.15],[.14,.065,.21],GOLD,7,3)
        m.cone([0,1.0,.34],.075,.22,GOLD,4,axis='z')
        for x in (-.36,.36): m.sphere([x,.65,-.04],[.12,.34,.10],INK,8,4)
        m.cone([0,.85,0],.30,.11,CORAL,10,top_radius=.29)
        m.box([.16,.66,.28],[.10,.26,.045],CORAL)
    elif kind == 'rolling_snowball':
        m.sphere([0,.77,0],[.78,.77,.78],WHITE,12,6)
        # Embedded ice facets distinguish its rolling direction from a white ball.
        for x,y,z in [(-.4,1.15,.43),(.39,.55,.57),(.08,1.44,-.2)]:
            m.sphere([x,y,z],[.15,.12,.07],LIGHT_ICE,5,3)
    elif kind in ('coin','double_coin'):
        def coin(x,z):
            m.cone([x,0,z],.29,.075,GOLD,16,top_radius=.29,axis='z')
            m.cone([x,0,z+.043],.23,.018,WINDOW,16,top_radius=.23,axis='z')
            # An original mountain glyph, geometry only; no text baked in.
            m.face([[x-.15,-.10,z+.054],[x+.15,-.10,z+.054],[x+.025,.13,z+.054]],GOLD)
        coin(-.10 if kind=='double_coin' else 0,0)
        if kind=='double_coin': coin(.12,.11)
    elif kind == 'star':
        # Five-point gem, original star silhouette, faceted front/back.
        outline=[]
        for i in range(10):
            a=math.pi/2+i*TAU/10
            r=.37 if i%2==0 else .17
            outline.append([r*math.cos(a),r*math.sin(a),0])
        for i in range(10):
            p,q=outline[i],outline[(i+1)%10]
            m.face([[0,0,.105],p,q],GOLD if i%2 else WINDOW)
            m.face([[0,0,-.105],q,p],GOLD)
    elif kind == 'magnet':
        # Squared U magnet in the xy plane; poles are intentionally distinct.
        m.box([-.23,.02,0],[.16,.58,.18],CORAL)
        m.box([.23,.02,0],[.16,.58,.18],CORAL)
        m.box([0,-.24,0],[.62,.18,.18],CORAL)
        for x in (-.23,.23): m.box([x,.34,0],[.16,.16,.18],LIGHT_ICE)
        m.box([0,-.23,.10],[.28,.06,.035],GOLD)
    elif kind == 'shield':
        outline=[[-.34,.31,0],[.34,.31,0],[.31,-.12,0],[0,-.40,0],[-.31,-.12,0]]
        for i in range(5):
            m.face([[0,0,.13],outline[(i+1)%5],outline[i]],MINT if i%2 else LIGHT_ICE)
            m.face([[0,0,-.07],outline[i],outline[(i+1)%5]],PINE)
        m.box([0,.025,.135],[.075,.36,.035],WHITE)
        m.box([0,.025,.135],[.26,.075,.035],WHITE)
    elif kind == 'turbo':
        outline=[[-.02,.41,0],[-.30,-.02,0],[-.04,-.02,0],[-.13,-.41,0],[.31,.10,0],[.05,.10,0]]
        # Triangulate the concave lightning polygon explicitly.
        for f in ([0,1,2],[0,2,5],[2,3,4],[2,4,5]):
            m.face([[outline[i][0],outline[i][1],.075] for i in f],GOLD)
            m.face([[outline[i][0],outline[i][1],-.075] for i in reversed(f)],CORAL)
        for i in range(6):
            p,q=outline[i],outline[(i+1)%6]
            m.face([[p[0],p[1],-.075],[q[0],q[1],-.075],[q[0],q[1],.075],[p[0],p[1],.075]],WINDOW)
    return m


TILES=['straight','gentle_turn','slope','bridge','ice_tunnel','village','forest','summit']
PROPS={
    'tree':('dodge',[.75,2.9,.75]),'rock':('dodge',[.88,1.25,.65]),
    'low_fence':('jump',[1.02,.82,.20]),'high_beam':('slide',[1.10,1.69,.23]),
    'cable_car':('dodge',[.85,2.52,.74]),'ice_crevasse':('jump',[1.05,.08,.90]),
    'snowman':('dodge',[.76,2.24,.46]),'penguin':('dodge',[.49,1.37,.43]),
    'rolling_snowball':('dodge',[.78,1.55,.78]),'coin':('collect',[.30,.30,.07]),
    'star':('collect',[.37,.37,.11]),'magnet':('powerup',[.32,.43,.12]),
    'shield':('powerup',[.34,.41,.14]),'turbo':('powerup',[.32,.42,.08]),
    'double_coin':('powerup',[.41,.30,.19]),
}


def build():
    spec={'schemaVersion':1,'license':'CC0-1.0','authorship':'Original procedural geometry authored in source/build-world.py; no third-party visual assets.',
          'units':'metres','axes':{'up':'+Y','forward':'+Z'},'laneCentersMeters':[-2.4,0,2.4],
          'tileLengthMeters':30,'playableWidthMeters':7.2,'surfaceWidthMeters':11.2,
          'ports':{'nearZ':0,'farZ':30,'crossSection':[[x,y] for x,y in zip(WIDTHS,HEIGHTS)],'continuity':'C1 position and tangent; all 64 ordered tile pairs compatible'},
          'tiles':[],'props':[],
          'collectiblePlacement':{'arc':{'count':7,'spacingMeters':1.4,'baseHeightMeters':.85,'peakAdditionalHeightMeters':1.1,'formula':'y = baseHeight + peakAdditionalHeight * sin(pi*i/(count-1))'},'runtimeRotationAxis':'+Y'},
          'seamNotes':'Surface y=0 and centerline x=0 at both boundaries. Interior curvature/elevation never changes the port profile. Sample player and prop y from centerline.',
          'interpretations':{'ice_crevasse':'קרוב קרח interpreted as a jumpable ice crevasse.'}}
    for kind in TILES:
        item=track(kind).glb(ROOT/'assets'/'tiles'/f'{kind}.glb',f'Tile_{kind}',{'tileLengthMeters':30,'variant':kind})
        assert item['bytes']<=150000,(kind,item['bytes'])
        item.update({'id':kind,'lengthMeters':30,'laneCentersMeters':[-2.4,0,2.4],
                     'centerlineEquation':{'x':'1.2*sin(pi*z/30)^2' if kind=='gentle_turn' else '0','y':'1.5*sin(pi*z/30)^2' if kind=='slope' else '0'},
                     'centerline':[{'z':round(i*1.5,3),**dict(zip(['x','y','dx_dz','dy_dz'],[round(v,8) for v in centerline(kind,i*1.5)]))} for i in range(21)],
                     'ports':{'near':{'center':[0,0,0],'tangent':[0,0,1]},'far':{'center':[0,0,30],'tangent':[0,0,1]}}})
        spec['tiles'].append(item)
    for kind,(action,bounds) in PROPS.items():
        item=prop(kind).glb(ROOT/'assets'/'props'/f'{kind}.glb',f'Prop_{kind}',{'interaction':action})
        centered = kind in ['coin','star','magnet','shield','turbo','double_coin']
        item.update({'id':kind,'interaction':action,'origin':'object center' if centered else 'ground center',
                     'collider':{'type':'box','halfExtentsMeters':[bounds[0],bounds[1]/2,bounds[2]],'centerMeters':[0,0 if centered else bounds[1]/2,0]},
                     'recommendedLaneCount':1})
        if kind=='high_beam': item['slideClearanceMeters']=1.05
        if kind=='low_fence': item['jumpClearanceMeters']=1.05
        if kind=='ice_crevasse': item['jumpGapLengthMeters']=1.8
        if kind=='rolling_snowball': item['motion']={'axis':'-Z','rollingRadiusMeters':.78,'recommendedSpeedMetersPerSecond':2.2}
        if kind in ['magnet','shield','turbo','double_coin']: item['durationSeconds']=8
        spec['props'].append(item)
    (ROOT/'world-spec.json').write_text(json.dumps(spec,indent=2)+'\n')
    print(json.dumps({'tiles':[(t['id'],t['bytes'],t['triangleCount']) for t in spec['tiles']], 'props':len(spec['props']), 'bytes':sum(t['bytes'] for t in spec['tiles']+spec['props'])},indent=2))


if __name__=='__main__': build()
