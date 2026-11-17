#!/usr/bin/env python3
"""Deterministic, texture-free city GLBs. Python standard library only.

All meshes are authored here; the 18-joint bind contract comes from motion2.
Run from any directory: python3 path/to/source/build.py
"""
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
CANON_PATH = ROOT.parent / 'motion2/soccer.json'
CANON = json.loads(CANON_PATH.read_text())['skeleton']
BONES = CANON['bones']
NAMES = [b['name'] for b in BONES]
P = {
    'coral': '#ef7966', 'mint': '#66bda9', 'yellow': '#edbd52',
    'blue': '#739fcb', 'lilac': '#aa91c4', 'peach': '#e5a17e',
    'cream': '#f6e7c8', 'white': '#f7f4e9', 'roof': '#394c61',
    'glass': '#304e69', 'glassLight': '#8dc6d8', 'metal': '#52677a',
    'dark': '#263a4a', 'rubber': '#29333c', 'red': '#ee645c',
    'orange': '#ef9850', 'green': '#63b75d', 'leaf': '#63a66d',
    'leafLight': '#8bc477', 'pine': '#397e6c', 'wood': '#a57a51',
    'sand': '#d3b991', 'stone': '#b5b6b0', 'asphalt': '#596775',
    'skinA': '#e7b28b', 'skinB': '#ad7657', 'skinC': '#794e3d',
    'hairA': '#624330', 'hairB': '#352e2d', 'hairC': '#d5af68',
}


def rgb(color):
    h = P.get(color, color).lstrip('#')
    v = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    # glTF vertex colors are linear, whereas the authored palette is sRGB.
    return [c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in v]


def sub(a, b): return [x-y for x, y in zip(a, b)]
def dot(a, b): return sum(x*y for x, y in zip(a, b))
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def length(a): return math.sqrt(dot(a, a))
def quat(axis, angle):
    s = math.sin(angle/2)
    return [x*s for x in axis] + [math.cos(angle/2)]


class Mesh:
    def __init__(self):
        self.pos, self.norm, self.col, self.indices, self.joints = [], [], [], [], []

    def face(self, points, color, joint=0):
        n = cross(sub(points[1], points[0]), sub(points[2], points[0]))
        magnitude = length(n)
        if magnitude < 1e-10:
            raise ValueError('Degenerate authored polygon')
        n = [v/magnitude for v in n]
        start = len(self.pos)//3
        for point in points:
            self.pos.extend(point); self.norm.extend(n); self.col.extend(rgb(color)); self.joints.append(joint)
        for k in range(1, len(points)-1):
            self.indices.extend((start, start+k, start+k+1))

    def solid(self, points, faces, color, joint=0):
        c = [sum(p[i] for p in points)/len(points) for i in range(3)]
        for face in faces:
            ps = [points[i] for i in face]
            n = cross(sub(ps[1], ps[0]), sub(ps[2], ps[0]))
            mid = [sum(p[i] for p in ps)/len(ps) for i in range(3)]
            if dot(n, sub(mid, c)) < 0:
                ps.reverse()
            self.face(ps, color, joint)

    def box(self, center, size, color, joint=0):
        x, y, z = [v/2 for v in size]
        points = [[center[0]+a*x, center[1]+b*y, center[2]+c*z]
                  for a, b, c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                                  (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        self.solid(points, [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(3,7,6,2),(0,1,5,4)], color, joint)

    def bevel(self, center, size, color, joint=0, inset=.16):
        """Octagonal footprint, flat top and bottom; 28 triangles."""
        x, y, z = [v/2 for v in size]
        b = min(x, z)*inset
        ring = [(-x+b,-z),(x-b,-z),(x,-z+b),(x,z-b),(x-b,z),(-x+b,z),(-x,z-b),(-x,-z+b)]
        points = [[center[0]+a, center[1]+yy, center[2]+c] for yy in (-y, y) for a, c in ring]
        self.solid(points, [tuple(range(8)),tuple(range(8,16))] + [(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)], color, joint)

    def cylinder(self, center, r0, r1, height, color, segments=8, joint=0, axis='y'):
        points = []
        for h, radius in [(-height/2, r0), (height/2, r1)]:
            for i in range(segments):
                a = i/segments*math.tau
                p = [radius*math.cos(a), h, radius*math.sin(a)]
                if axis == 'x': p = [p[1], p[0], p[2]]
                points.append([p[k]+center[k] for k in range(3)])
        n = segments
        self.solid(points, [tuple(range(n)),tuple(range(n,2*n))] + [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)], color, joint)

    def roof(self, width, depth, y, rise, color):
        w, d = width/2, depth/2
        self.solid([[-w,y,-d],[w,y,-d],[w,y,d],[-w,y,d],[0,y+rise,-d],[0,y+rise,d]],
                   [(0,1,2,3),(0,4,1),(3,2,5),(0,3,5,4),(1,4,5,2)], color)

    def front(self, x, y, z, w, h, color):
        self.face([[x-w/2,y-h/2,z],[x+w/2,y-h/2,z],[x+w/2,y+h/2,z],[x-w/2,y+h/2,z]], color)

    def side(self, x, y, z, w, h, color):
        ps = [[x,y-h/2,z-w/2],[x,y+h/2,z-w/2],[x,y+h/2,z+w/2],[x,y-h/2,z+w/2]]
        self.face(ps if x > 0 else list(reversed(ps)), color)


class GLB:
    def __init__(self, name):
        self.name, self.bin = name, bytearray()
        self.doc = {'asset': {'version':'2.0','generator':'Catch City v1 / deterministic original meshes'},
                    'scene':0, 'scenes':[{'name':name,'nodes':[]}], 'nodes':[], 'meshes':[],
                    'accessors':[], 'bufferViews':[], 'buffers':[],
                    'materials':[{'name':'matte vertex palette','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1], 'metallicFactor':0,'roughnessFactor':.82}}]}

    def accessor(self, values, kind, component=5126, target=None):
        width = {'SCALAR':1,'VEC3':3,'VEC4':4,'MAT4':16}[kind]
        while len(self.bin)%4: self.bin.append(0)
        offset = len(self.bin)
        fmt = {5126:'f',5123:'H',5121:'B'}[component]
        self.bin.extend(struct.pack('<'+fmt*len(values), *values))
        view = {'buffer':0,'byteOffset':offset,'byteLength':len(self.bin)-offset}
        if target: view['target'] = target
        view_id = len(self.doc['bufferViews']); self.doc['bufferViews'].append(view)
        acc = {'bufferView':view_id,'componentType':component,'count':len(values)//width,'type':kind}
        if component == 5126 and kind in ('VEC3','SCALAR'):
            acc['min'] = [min(values[i::width]) for i in range(width)]
            acc['max'] = [max(values[i::width]) for i in range(width)]
        idx = len(self.doc['accessors']); self.doc['accessors'].append(acc)
        return idx

    def mesh(self, m, name, skin=None):
        attrs = {k:self.accessor(v,'VEC3',target=34962) for k,v in [('POSITION',m.pos),('NORMAL',m.norm),('COLOR_0',m.col)]}
        if skin is not None:
            attrs['JOINTS_0'] = self.accessor([j for a in m.joints for j in (a,0,0,0)],'VEC4',5121,34962)
            attrs['WEIGHTS_0'] = self.accessor([v for _ in m.joints for v in (1.,0.,0.,0.)],'VEC4',target=34962)
        mi = len(self.doc['meshes'])
        self.doc['meshes'].append({'name':name,'primitives':[{'attributes':attrs,'indices':self.accessor(m.indices,'SCALAR',5123,34963),'material':0,'mode':4}]})
        ni = len(self.doc['nodes']); node = {'name':name,'mesh':mi}
        if skin is not None: node['skin'] = skin
        self.doc['nodes'].append(node)
        return ni

    def write(self):
        self.doc['buffers'] = [{'byteLength':len(self.bin)}]
        js = json.dumps(self.doc,separators=(',',':'),ensure_ascii=False).encode()
        js += b' '*((-len(js))%4)
        data = bytes(self.bin) + b'\0'*((-len(self.bin))%4)
        content = struct.pack('<III',0x46546c67,2,28+len(js)+len(data)) + struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(data),0x004e4942)+data
        out = ROOT/'models'/f'{self.name}.glb'
        out.write_bytes(content)
        return content


ASSETS = []


def save(id, label, category, mesh, extra=None, glb=None):
    g = glb or GLB(id)
    if glb is None:
        idx = g.mesh(mesh,'asset_root'); g.doc['scenes'][0]['nodes'] = [idx]
    g.doc['extras'] = {'id':id,'units':'meters','up':'+Y','forward':'+Z','pivot':'ground center','fictional':True}
    b = g.write()
    positions = [a for m in g.doc['meshes'] for p in m['primitives'] for a in [g.doc['accessors'][p['attributes']['POSITION']]]]
    bounds = [[min(a['min'][k] for a in positions) for k in range(3)], [max(a['max'][k] for a in positions) for k in range(3)]]
    record = {'id':id,'labelHe':label,'category':category,'path':f'models/{id}.glb',
              'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),
              'triangles':sum(g.doc['accessors'][p['indices']]['count']//3 for m in g.doc['meshes'] for p in m['primitives']),
              'boundsMeters':bounds,'sizeMeters':[round(bounds[1][k]-bounds[0][k],5) for k in range(3)],
              'pivotMeters':[0,0,0], 'forward':'+Z','license':'repository-original'}
    if extra: record.update(extra)
    ASSETS.append(record)
    print(f'{id:26s} {record["triangles"]:4d} triangles  {len(b):6d} bytes')


def windows(m, w, d, rows, cols=3, h=3.6):
    for row in range(rows):
        y = 1.5 + row*(h-1.7)/max(1,rows-1)
        for col in range(cols):
            x = (col-(cols-1)/2)*(w/(cols+.4))
            m.front(x,y,d/2+.012,.59,.72,'cream')
            m.front(x,y+.025,d/2+.016,.43,.51,'glass')
        for x in (-w/2-.012,w/2+.012):
            for z in (-d*.25,d*.25):
                m.side(x,y,z,.60,.72,'cream'); m.side(x*1.0008,y+.025,z,.44,.51,'glass')


def buildings():
    # Every facade is plain geometry, without lettering, brands or signage.
    definitions = [
        ('house-coral','בית אלמוג','coral',3.8,3.6,3.4,'gable',2),
        ('shop-mint','חנות מנטה','mint',4.5,3.6,3.1,'shop',1),
        ('apartment-sun','בניין שמש','yellow',4.2,3.9,6.8,'apartment',4),
        ('office-blue','משרדים כחולים','blue',3.6,4.0,7.8,'office',4),
        ('villa-lilac','וילה לילך','lilac',4.4,3.7,3.7,'villa',2),
        ('market-peach','שוק אפרסק','peach',5.2,3.7,3.0,'market',1),
        ('workshop-teal','סדנה טורקיז','mint',4.8,4.0,3.4,'workshop',1),
        ('civic-cream','בית ציבורי','cream',5.1,4.1,4.6,'civic',2),
    ]
    for id,label,color,w,d,h,kind,rows in definitions:
        m = Mesh(); m.box([0,.10,0],[w+.18,.2,d+.18],'stone')
        m.box([0,(h+.2)/2,0],[w,h-.2,d],color)
        m.box([0,h-.08,0],[w+.18,.16,d+.18],'cream')
        if kind in ('gable','villa','workshop'):
            m.roof(w+.42,d+.40,h,.80 if kind!='workshop' else .65,'roof')
        else:
            m.box([0,h+.16,0],[w+.28,.27,d+.28],'roof')
        windows(m,w,d,rows,2 if kind=='office' else 3,h-.35)
        m.front(0,.65,d/2+.025,.70,1.10,'roof')
        m.front(0,.72,d/2+.029,.46,.81,'glassLight')
        if kind=='gable':
            m.box([-w*.26,h+.57,-d*.16],[.40,1.1,.43],'coral')
            m.box([-w*.26,h+1.13,-d*.16],[.52,.14,.53],'cream')
        if kind in ('shop','market'):
            m.front(0,1.06,d/2+.04,w-.52,1.36,'glass')
            for x in (-w*.22,w*.22): m.front(x,1.08,d/2+.045,.055,1.34,'cream')
            for i in range(7):
                x=(i-3)*(w+.3)/7
                m.box([x,2.17,d/2+.40],[(w+.3)/7,.15,.92],'cream' if i%2 else color)
            for x in (-w/2,w/2): m.box([x,1.10,d/2+.72],[.07,2.0,.07],'cream')
        if kind=='apartment':
            for y in (2.0,3.5,5.0):
                m.box([0,y,d/2+.25],[w-.45,.14,.58],'cream')
                m.box([0,y+.34,d/2+.50],[w-.5,.38,.05],'mint')
        if kind=='office':
            m.box([w*.20,h+.44,-d*.17],[w*.56,.42,d*.68],'blue')
            m.box([w*.20,h+.70,-d*.17],[w*.60,.10,d*.72],'roof')
            for y in (2.0,3.8,5.6): m.box([0,y,0],[w+.08,.08,d+.08],'cream')
        if kind=='villa':
            m.box([-w*.22,1.4,d/2+.48],[w*.45,2.45,.9],'lilac')
            m.box([-w*.22,2.68,d/2+.48],[w*.48,.18,1.05],'cream')
            m.front(-w*.22,1.30,d/2+.94,.64,1.2,'roof')
        if kind=='workshop':
            m.front(0,1.22,d/2+.04,w*.60,1.85,'roof')
            for y in (.55,.88,1.21,1.54,1.87): m.front(0,y,d/2+.05,w*.57,.045,'metal')
        if kind=='civic':
            for x in (-w*.32,w*.32): m.box([x,1.45,d/2+.4],[.32,2.6,.36],'white')
            m.box([0,2.88,d/2+.35],[w*.82,.22,.9],'cream')
            m.box([0,.09,d/2+.60],[w*.9,.18,1.2],'stone')
            m.box([0,h+.49,0],[w*.46,.40,d*.62],'peach')
        save(id,label,'building',m,{'collision':{'type':'box','centerMeters':[0,h/2,0],'sizeMeters':[w,h,d]}})


def infrastructure():
    m = Mesh(); m.bevel([0,.10,0],[.64,.20,.64],'metal')
    m.cylinder([0,1.65,0],.07,.07,3.1,'metal')
    m.bevel([0,2.70,.12],[.40,1.02,.30],'dark')
    for y,color in [(2.99,'red'),(2.70,'yellow'),(2.41,'green')]:
        m.front(0,y,.278,.235,.235,color)
        m.box([0,y+.14,.34],[.34,.045,.23],'dark')
    save('traffic-light','רמזור','infrastructure',m,{'signalLensOrder':['red','amber','green'],'note':'Colored lenses; no traffic controller or timing is embedded.'})
    m = Mesh(); m.bevel([0,.08,0],[.5,.16,.5],'metal')
    m.cylinder([0,1.95,0],.07,.045,3.8,'metal')
    m.box([0,3.80,.43],[.09,.12,.9],'metal')
    m.bevel([0,3.76,.93],[.39,.18,.72],'metal')
    m.box([0,3.655,.93],[.30,.032,.56],'cream')
    save('street-lamp','עמוד תאורה','infrastructure',m)
    m = Mesh()
    # An open span: the road is at y=1.0m; a 6m gap remains between piers.
    m.box([0,.84,0],[5.2,.32,9.0],'stone')
    m.box([0,1.01,0],[4.6,.02,9.0],'asphalt')
    for z in (-3.75,3.75): m.box([0,.34,z],[4.75,.68,.48],'peach')
    for x in (-2.48,2.48):
        m.box([x,1.75,0],[.12,.14,9.0],'cream')
        for z in (-4.35,-2.2,0,2.2,4.35): m.box([x,1.37,z],[.13,.74,.13],'mint')
    for z in (-3,-1,1,3): m.box([0,1.026,z],[.10,.012,1.05],'cream')
    save('bridge-span','גשר','infrastructure',m,{'roadDeckYMeters':1.02,'clearWidthMeters':4.6,'lengthMeters':9.0,
        'sockets':{'entry':[0,1.02,-4.5],'exit':[0,1.02,4.5]},'collision':{'type':'compound','note':'Deck and rails; preserve open space below the central span.'}})
    m = Mesh(); n = 10; inner,outer,spring,depth = 2.25,2.78,1.6,5.5
    # A true hollow arch shell. No wall or end cap crosses the drivable bore.
    for i in range(n):
        a,b=i/n*math.pi,(i+1)/n*math.pi
        rings=[]
        for z in (-depth/2,depth/2):
            rings.extend([[r*math.cos(t),spring+r*math.sin(t),z] for r,t in [(inner,a),(inner,b),(outer,b),(outer,a)]])
        m.solid(rings,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'sand' if i%2 else 'cream')
    for x in (-2.515,2.515): m.box([x,spring/2,0],[.53,spring,depth],'sand')
    m.box([0,.04,0],[4.5,.08,depth],'asphalt')
    for x in (-2.18,2.18): m.box([x,.13,0],[.12,.15,depth],'cream')
    save('tunnel-segment','מקטע מנהרה','infrastructure',m,{'clearWidthMeters':4.5,'springYMeters':spring,
        'centralClearHeightMeters':spring+inner,'lengthMeters':depth,'sockets':{'entry':[0,.08,-depth/2],'exit':[0,.08,depth/2]},
        'collision':{'type':'compound','note':'Two side walls, arch shell and road only; never use a solid bounding box for the bore.'}})


def car_mesh(kind,color):
    m=Mesh()
    specs={'compact':(1.55,3.0,1.42),'sedan':(1.70,3.85,1.42),'wagon':(1.76,4.05,1.53),
           'van':(1.85,3.95,2.04),'pickup':(1.85,4.15,1.70)}
    w,l,h=specs[kind]
    m.bevel([0,.55,0],[w,.48,l],color)
    m.box([0,.32,0],[w*.87,.18,l*.92],'dark')
    rear = -l*.30 if kind in ('wagon','van') else -l*.17
    front = l*.22
    if kind=='pickup': rear=-l*.02
    bottom=.77; top=h-.14
    # Sloped windshield, narrowed roof and distinct cabin length for each body.
    v=[[-w*.45,bottom,rear],[w*.45,bottom,rear],[w*.45,bottom,front+.32],[-w*.45,bottom,front+.32],
       [-w*.35,top,rear+.14],[w*.35,top,rear+.14],[w*.35,top,front-.12],[-w*.35,top,front-.12]]
    faces=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(0,3,7,4),(1,5,6,2)]
    m.solid(v,faces,color)
    # Glass sits slightly outward from the actual sloping cabin surfaces.
    glass_z=(front+.32)*.24+(front-.12)*.76
    m.face([[-w*.405,bottom+.08,front+.29],[w*.405,bottom+.08,front+.29],
            [w*.345,top-.07,glass_z+.016],[-w*.345,top-.07,glass_z+.016]],'glass')
    for side in (-1,1):
        # A trapezoidal strip on each side, flush with the cabin taper.
        points=[[side*(w*.45-.018),bottom+.10,rear+.16],[side*(w*.45-.018),bottom+.10,front+.18],
                [side*(w*.35+.012),top-.07,front-.17],[side*(w*.35+.012),top-.07,rear+.20]]
        if side>0: points.reverse()
        m.face(points,'glass')
        m.box([side*w*.465,.90,front+.05],[.16,.12,.18],color)
    if kind=='pickup':
        m.box([0,.80,-l*.31],[w*.78,.03,l*.30],'dark')
        for x in (-w*.44,w*.44): m.box([x,.92,-l*.31],[.16,.32,l*.31],color)
        m.box([0,.92,-l*.455],[w,.32,.13],color)
    if kind=='van': m.box([0,top+.07,(rear+front)/2],[w*.72,.14,front-rear],'cream')
    for side in (-1,1):
        for z in (-l*.30,l*.29):
            m.cylinder([side*w*.47,.31,z],.30,.30,.20,'rubber',8,axis='x')
            m.cylinder([side*w*.535,.31,z],.135,.135,.026,'cream',8,axis='x')
    m.box([0,.42,l/2+.035],[w*.91,.12,.12],'cream')
    m.box([0,.42,-l/2-.035],[w*.91,.12,.12],'metal')
    for x in (-w*.32,w*.32):
        m.front(x,.67,l/2+.008,.27,.15,'cream')
        m.face([[x-.12,.59,-l/2-.009],[x-.12,.74,-l/2-.009],[x+.12,.74,-l/2-.009],[x+.12,.59,-l/2-.009]],'red')
    return m


def cars():
    for kind,label,color in [('compact','מכונית קטנה','yellow'),('sedan','מכונית משפחתית','coral'),
                             ('wagon','סטיישן','mint'),('van','מסחרית','cream'),('pickup','טנדר','blue')]:
        m=car_mesh(kind,color)
        save(f'car-{kind}',label,'vehicle',m,{'civilian':True,'wheelRadiusMeters':.30,'collision':{'type':'box'}})


def vegetation():
    for kind,label in [('round','עץ רחב'),('column','עץ צר'),('pine','עץ מחט')]:
        m=Mesh(); m.cylinder([0,.95,0],.14,.095,1.9,'wood',6)
        if kind=='round':
            m.cylinder([0,2.02,0],.67,.99,.55,'leaf',7)
            m.cylinder([0,2.57,0],.99,.48,.55,'leafLight',7)
            m.cylinder([0,2.93,0],.48,.12,.18,'leaf',7)
        elif kind=='column':
            m.cylinder([0,2.02,0],.42,.55,.76,'leaf',7)
            m.cylinder([0,2.78,0],.55,.18,.76,'leafLight',7)
        else:
            for y,r in [(1.15,.82),(1.87,.66),(2.52,.45)]:
                m.cylinder([0,y+.48,0],r,.035,.96,'pine' if y<2 else 'leaf',7)
        save(f'tree-{kind}',label,'vegetation',m)
    m=Mesh()
    for x in (-1.45,1.45): m.box([x,.68,0],[.12,1.36,.12],'cream')
    for y in (.39,.98): m.box([0,y,0],[3.0,.13,.09],'wood')
    for x in (-1.05,-.70,-.35,0,.35,.70,1.05): m.box([x,.68,0],[.09,1.1,.10],'cream')
    save('fence-picket','גדר עץ','prop',m,{'lengthMeters':3.0,'sockets':{'left':[-1.5,0,0],'right':[1.5,0,0]}})
    m=Mesh()
    for x in (-1.45,1.45): m.box([x,.64,0],[.13,1.28,.13],'metal')
    for y in (.27,1.12): m.box([0,y,0],[3.0,.10,.10],'metal')
    for x in (-1.05,-.7,-.35,0,.35,.7,1.05): m.box([x,.69,0],[.045,.8,.045],'mint')
    save('fence-metal','גדר מתכת','prop',m,{'lengthMeters':3.0,'sockets':{'left':[-1.5,0,0],'right':[1.5,0,0]}})
    for id,label,height in [('cone-small','קונוס קטן',.64),('cone-tall','קונוס גבוה',.96)]:
        m=Mesh();m.bevel([0,.045,0],[.48,.09,.48],'dark')
        # Three connected frusta form the stripe without a texture or decal.
        r0,r1=.20,.035
        for a,b,color in [(0,.43,'orange'),(.43,.66,'cream'),(.66,1,'orange')]:
            m.cylinder([0,.09+(height-.09)*(a+b)/2,0],r0+(r1-r0)*a,r0+(r1-r0)*b,(height-.09)*(b-a),color,8)
        save(id,label,'prop',m)


WALK_SECONDS=32/30
WALK_SPEED=.90


def walk_pose(t):
    phase=(t/WALK_SECONDS)%1.0
    rotations={name:[0,0,0,1] for name in NAMES}
    hips=[0,.780+.004*math.cos(phase*math.tau*2),0]
    for side,offset in [('Left',0),('Right',.5)]:
        p=(phase+offset)%1
        half=WALK_SPEED*WALK_SECONDS*.6/2
        if p<.6:
            z=half-WALK_SPEED*WALK_SECONDS*p; y=.08
        else:
            u=(p-.6)/.4; smooth=u*u*(3-2*u)
            # Match stance velocity at lift-off and touchdown. This avoids a
            # velocity discontinuity when LINEAR glTF tracks cross the seam.
            tangent=-WALK_SPEED*WALK_SECONDS*.4
            z=-half+2*half*smooth+tangent*(2*u**3-3*u*u+u)
            y=.08+.13*math.sin(math.pi*u)**2
        dy=y-hips[1]; r=math.hypot(dy,z); a,b=.41,.37
        knee=math.acos(max(-1,min(1,(r*r-a*a-b*b)/(2*a*b))))
        hip=math.atan2(-z,-dy)-math.atan2(b*math.sin(knee),a+b*math.cos(knee))
        rotations[side+'UpLeg']=quat([1,0,0],hip)
        rotations[side+'Leg']=quat([1,0,0],knee)
        rotations[side+'Foot']=quat([1,0,0],-hip-knee)
        swing=.25*math.cos(p*math.tau)
        rotations[side+'Arm']=quat([1,0,0],swing)
        rotations[side+'ForeArm']=quat([1,0,0],-.15-.06*(1-math.cos(p*math.tau)))
    rotations['Spine']=quat([1,0,0],.025)
    rotations['Chest']=quat([0,1,0],.055*math.sin(phase*math.tau))
    rotations['Head']=quat([0,1,0],-.035*math.sin(phase*math.tau))
    return hips,rotations


def pedestrians():
    world={}
    for bone in BONES:
        parent=world.get(bone['parent'],[0,0,0])
        world[bone['name']]=[parent[i]+bone['restTranslationMeters'][i] for i in range(3)]
    for index,(id,label,shirt,skin,hair) in enumerate([
        ('pedestrian-coral','הולך רגל אלמוג','coral','skinA','hairA'),
        ('pedestrian-mint','הולכת רגל מנטה','mint','skinB','hairB'),
        ('pedestrian-sun','הולך רגל שמש','yellow','skinC','hairC')]):
        m=Mesh()
        def box(p,s,c,b):m.bevel(p,s,c,NAMES.index(b),.25)
        box([0,.886,0],[.30,.14,.20],'roof','Hips')
        box([0,1.032,0],[.30,.21,.20],shirt,'Spine')
        box([0,1.205,0],[.32,.20,.21],shirt,'Chest')
        m.cylinder([0,1.345,0],.052,.052,.12,skin,6,NAMES.index('Neck'))
        box([0,1.506,.007],[.25,.29,.24],skin,'Head')
        box([0,1.635,-.009],[.265,.085,.25],hair,'Head')
        if index==0: box([-.06,1.691,-.02],[.14,.055,.18],hair,'Head')
        elif index==1:
            box([0,1.48,-.11],[.26,.28,.09],hair,'Head')
            m.cylinder([0,1.70,-.035],.07,.055,.095,hair,7,NAMES.index('Head'))
        else:
            box([0,1.641,.06],[.28,.055,.28],'blue','Head')
            box([0,1.678,-.015],[.25,.075,.19],'blue','Head')
        # Tiny geometric eyes; no face texture, writing or identifiers.
        for x in (-.052,.052):
            m.face([[x-.012,1.5225,.129],[x+.012,1.5225,.129],[x+.012,1.5475,.129],[x-.012,1.5475,.129]],'dark',NAMES.index('Head'))
        box([0,1.485,.136],[.038,.044,.035],skin,'Head')
        for side,s in [('Left',1),('Right',-1)]:
            x=.16*s
            box([x,1.19,0],[.105,.22,.14],shirt,side+'Arm')
            box([x,1.075,0],[.092,.035,.125],skin,side+'Arm')
            box([x,.915,0],[.083,.22,.115],skin,side+'ForeArm')
            box([x,.765,.012],[.088,.10,.12],skin,side+'Hand')
            box([.10*s,.66,0],[.125,.39,.17],'roof',side+'UpLeg')
            box([.10*s,.275,0],[.112,.34,.15],'blue' if index==2 else 'roof',side+'Leg')
            box([.10*s,.049,.045],[.135,.098,.26],'cream',side+'Foot')
            box([.10*s,.013,.045],[.14,.026,.27],'dark',side+'Foot')
        g=GLB(id)
        for bone in BONES:
            node={'name':bone['name'],'translation':bone['restTranslationMeters']}
            children=[NAMES.index(b['name']) for b in BONES if b['parent']==bone['name']]
            if children: node['children']=children
            g.doc['nodes'].append(node)
        inverse=[]
        for bone in BONES:
            x,y,z=world[bone['name']]
            inverse.extend([1,0,0,0,0,1,0,0,0,0,1,0,-x,-y,-z,1])
        g.doc['skins']=[{'name':'canonical18','skeleton':0,'joints':list(range(18)),
                         'inverseBindMatrices':g.accessor(inverse,'MAT4')}]
        meshnode=g.mesh(m,'asset_root',0);g.doc['scenes'][0]['nodes']=[0,meshnode]
        times=[i/30 for i in range(33)]
        poses=[walk_pose(t) for t in times]
        poses[-1]=poses[0]  # bit-identical seam, including quaternion signs.
        input_acc=g.accessor(times,'SCALAR')
        animation={'name':'walk','samplers':[],'channels':[],
                   'extras':{'loop':True,'sampleHz':30,'durationSeconds':WALK_SECONDS,
                             'inPlace':True,'speedMetersPerSecond':WALK_SPEED,'stanceFraction':.6}}
        for name in NAMES:
            values=[v for _,rot in poses for v in rot[name]]
            sampler=len(animation['samplers'])
            animation['samplers'].append({'input':input_acc,'output':g.accessor(values,'VEC4'),'interpolation':'LINEAR'})
            animation['channels'].append({'sampler':sampler,'target':{'node':NAMES.index(name),'path':'rotation'}})
        sampler=len(animation['samplers'])
        animation['samplers'].append({'input':input_acc,'output':g.accessor([v for hip,_ in poses for v in hip],'VEC3'),'interpolation':'LINEAR'})
        animation['channels'].append({'sampler':sampler,'target':{'node':NAMES.index('Hips'),'path':'translation'}})
        g.doc['animations']=[animation]
        save(id,label,'pedestrian',m,{'canonicalSkeleton':'skeleton.json','animations':[{'name':'walk','loop':True,'sampleHz':30,
            'samples':33,'durationSeconds':WALK_SECONDS,'inPlace':True,'speedMetersPerSecond':WALK_SPEED}]},g)


def road_tiles():
    for id,label,crossing in [('road-straight','קטע כביש',False),('road-crossing','מעבר חציה',True)]:
        m=Mesh();m.box([0,.06,0],[6,.12,6],'asphalt')
        for x in (-2.7,2.7): m.box([x,.15,0],[.6,.18,6],'cream')
        if crossing:
            for x in (-1.75,-1.05,-.35,.35,1.05,1.75): m.box([x,.125,0],[.43,.01,1.8],'white')
        else:
            for z in (-2,0,2): m.box([0,.125,z],[.09,.01,.95],'cream')
        save(id,label,'ground',m,{'tileSizeMeters':[6,6],'roadDeckYMeters':.12})


def main():
    (ROOT/'models').mkdir(exist_ok=True)
    buildings();infrastructure();cars();vegetation();pedestrians();road_tiles()
    (ROOT/'skeleton.json').write_text(json.dumps(CANON,indent=2)+'\n')
    manifest={'schemaVersion':1,'id':'catch-city-v1','titleHe':'תפוס את הפושע · ערכת עיר',
              'createdDate':'2026-11-17','baseCommit':'43b27dc235387e3cb737aee9558cdf9d5fd5a262',
              'units':'meters','axes':{'up':'+Y','forward':'+Z','anatomicalLeft':'+X'},
              'format':'glTF 2.0 binary','compression':'none','textures':0,'externalGLBResources':0,
              'budget':{'maxFolderBytes':3000000,'buildingTrianglesMin':50,'buildingTrianglesMax':400},
              'assetCount':len(ASSETS),'glbBytes':sum(a['bytes'] for a in ASSETS),'assets':ASSETS,
              'canonicalSkeleton':{'path':'skeleton.json','source':'../motion2/soccer.json#skeleton','jointCount':18,
                  'sourceSha256':hashlib.sha256(CANON_PATH.read_bytes()).hexdigest(),'bind':'exact canonical parent-local translations; identity rotations and unit scale'},
              'preview':{'path':'preview.html','viewport':[844,390],'dependencies':['vendor/three.module.js','vendor/GLTFLoader.js','vendor/SkeletonUtils.js','vendor/BufferGeometryUtils.js'],
                         'network':'self-contained folder; HTTP only; no external requests'},
              'integration':{'status':'asset delivery; game logic untouched','animation':'Use AnimationMixer walk with LoopRepeat; translate actor at 0.90 m/s along local +Z.',
                  'collision':'Metadata is advisory. Construct compound bridge/tunnel colliders; keep openings clear.'}}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__': main()
