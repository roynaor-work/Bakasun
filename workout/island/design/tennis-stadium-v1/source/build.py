#!/usr/bin/env python3
"""Original CC0 stadium authoring. Python 3 + Pillow; no downloaded assets."""
import hashlib
import json
import math
import random
import struct
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'runtime'
OUT.mkdir(exist_ok=True)
MODELS = []


def material(name, rgb, metal=0, emission=None):
    def linear(v):
        v /= 255
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    color = [linear(v) for v in rgb]
    m = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': color + [1],
         'metallicFactor': metal, 'roughnessFactor': .67}}
    if emission:
        m['emissiveFactor'] = [linear(v) for v in emission]
    return m


MATS = [material('chalk concrete', (116, 137, 151)),
        material('deep ocean steel', (24, 47, 65), .45),
        material('lagoon seat', (56, 144, 151)),
        material('gold seat', (221, 173, 91)),
        material('warm white', (230, 228, 210)),
        material('court blue', (32, 100, 139)),
        material('rubber', (23, 31, 41)),
        material('lamp diffuser', (255, 227, 171), emission=(255, 221, 160)),
        material('muted teal', (31, 91, 102))]


class Model:
    """Merge geometry by material: few draw calls, indexed flat-normal faces."""
    def __init__(self, name):
        self.name = name
        self.parts = {}

    def face(self, pts, mat, uv=None):
        p, n, t, ids = self.parts.setdefault(mat, ([], [], [], []))
        a, b, c = pts[:3]
        u = [b[i] - a[i] for i in range(3)]
        v = [c[i] - a[i] for i in range(3)]
        normal = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        length = math.sqrt(sum(x*x for x in normal))
        normal = [x / length for x in normal]
        offset = len(p) // 3
        for i, pt in enumerate(pts):
            p.extend(pt)
            n.extend(normal)
            t.extend(uv[i] if uv else [(0, 1), (1, 1), (1, 0), (0, 0)][i % 4])
        for i in range(1, len(pts)-1):
            ids.extend((offset, offset+i, offset+i+1))

    def box(self, center, size, mat):
        x, y, z = center
        w, h, d = [v/2 for v in size]
        v = [(x-w,y-h,z-d),(x+w,y-h,z-d),(x+w,y+h,z-d),(x-w,y+h,z-d),
             (x-w,y-h,z+d),(x+w,y-h,z+d),(x+w,y+h,z+d),(x-w,y+h,z+d)]
        for f in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(3,7,6,2),(0,1,5,4)]:
            self.face([v[i] for i in f], mat)

    def beam(self, a, b, radius, mat, sides=8):
        axis = [b[i]-a[i] for i in range(3)]
        length = math.sqrt(sum(x*x for x in axis))
        axis = [x/length for x in axis]
        ref = [0,1,0] if abs(axis[1]) < .9 else [1,0,0]
        u = [axis[1]*ref[2]-axis[2]*ref[1],axis[2]*ref[0]-axis[0]*ref[2],axis[0]*ref[1]-axis[1]*ref[0]]
        norm = math.sqrt(sum(x*x for x in u))
        u = [x/norm for x in u]
        v = [axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0]]
        ring = lambda p: [tuple(p[k]+radius*(u[k]*math.cos(i*2*math.pi/sides)+v[k]*math.sin(i*2*math.pi/sides)) for k in range(3)) for i in range(sides)]
        r, s = ring(a), ring(b)
        for i in range(sides):
            j = (i+1) % sides
            self.face([r[i],r[j],s[j],s[i]],mat)
        self.face(list(reversed(r)), mat)
        self.face(s, mat)

    def save(self, cap=1500, texture=None):
        blob = bytearray()
        views, access, primitives = [], [], []
        def acc(data, kind, ctype):
            while len(blob) % 4:
                blob.append(0)
            start = len(blob)
            blob.extend(struct.pack('<'+('H' if ctype==5123 else 'f')*len(data), *data))
            view = len(views)
            views.append({'buffer':0,'byteOffset':start,'byteLength':len(blob)-start})
            width = {'SCALAR':1,'VEC2':2,'VEC3':3}[kind]
            a = {'bufferView':view,'componentType':ctype,'count':len(data)//width,'type':kind}
            if kind=='VEC3':
                a['min'] = [min(data[k::3]) for k in range(3)]
                a['max'] = [max(data[k::3]) for k in range(3)]
            access.append(a)
            return len(access)-1
        for mat, (p,n,t,ids) in sorted(self.parts.items()):
            primitives.append({'attributes':{'POSITION':acc(p,'VEC3',5126),'NORMAL':acc(n,'VEC3',5126),
                'TEXCOORD_0':acc(t,'VEC2',5126)},'indices':acc(ids,'SCALAR',5123),'material':mat,'mode':4})
        triangles = sum(len(v[3])//3 for v in self.parts.values())
        assert triangles <= cap, (self.name,triangles)
        mats = json.loads(json.dumps(MATS))
        doc = {'asset':{'version':'2.0','generator':'Bakasun original stadium authoring',
            'copyright':'CC0-1.0; original work; see ../LICENSES.md'},
            'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':self.name,'mesh':0}],
            'meshes':[{'name':self.name,'primitives':primitives}], 'materials':mats,
            'buffers':[{'byteLength':len(blob)}],'bufferViews':views,'accessors':access}
        if texture:
            mats.append(material('original score display', (255,255,255), emission=(255,255,255)))
            mats[-1]['pbrMetallicRoughness']['baseColorTexture'] = {'index':0}
            mats[-1]['emissiveTexture'] = {'index':0}
            doc.update(images=[{'uri':texture}],textures=[{'source':0,'sampler':0}],
                samplers=[{'magFilter':9729,'minFilter':9729,'wrapS':33071,'wrapT':33071}])
        j = json.dumps(doc,separators=(',',':')).encode()
        j += b' ' * (-len(j)%4)
        blob.extend(b'\0' * (-len(blob)%4))
        data = struct.pack('<III',0x46546c67,2,28+len(j)+len(blob))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(blob),0x004e4942)+blob
        assert len(data) <= 300_000, (self.name,len(data))
        path = OUT / (self.name+'.glb')
        path.write_bytes(data)
        p = [p for part in self.parts.values() for p in zip(*[iter(part[0])]*3)]
        bounds = [[round(f(v[k] for v in p),4) for k in range(3)] for f in (min,max)]
        MODELS.append({'path':'runtime/'+path.name,'triangles':triangles,'limit':cap,'bounds':bounds})


def models():
    m = Model('stand-10m')
    # +X along module; +Z toward rear; front at Z=0. Repeat at 10 m pitch.
    for row in range(5):
        y, z = .28+row*.42, .48+row*.88
        m.box((0,y/2,z),(10,y,.88),0)
        m.box((0,y+.012,z-.405),(10,.024,.055),3)
        for col in range(12):
            x = (-4.5+col*.7) if col<6 else (.95+(col-6)*.7)
            color = 3 if (col+row*3)%11==0 else 2
            m.box((x,y+.37,z),(.52,.11,.48),color)
            m.box((x,y+.62,z+.205),(.52,.46,.09),color)
        # A center aisle with a half-height tread in every riser.
        m.box((0,y-.105,z-.34),(.78,.21,.22),0)
    for x in (-4.95,4.95):
        for row in (0,2,4):
            z=.48+row*.88
            y=.28+row*.42
            m.beam((x,y,z),(x,y+.95,z),.028,1)
        m.beam((x,1.23,.48),(x,2.91,4),.028,1)
    for x in (-4.95,-2.5,0,2.5,4.95):
        m.beam((x,1.96,4.38),(x,2.96,4.38),.03,1)
    for y in (2.46,2.96):
        m.beam((-4.95,y,4.38),(4.95,y,4.38),.03,1)
    m.save(3000)

    m=Model('ad-board')
    m.box((0,.48,0),(3,.96,.16),1)
    m.box((0,.49,-.088),(2.88,.82,.025),8)
    for x in (-1.05,-.45,.15):
        m.face([(x,.28,-.105),(x+.3,.72,-.105),(x+.5,.72,-.105),(x+.2,.28,-.105)],3)
    m.box((.89,.49,-.108),(.44,.38,.02),4)
    for x in (-1.12,1.12):
        m.box((x,.055,.13),(.4,.11,.65),6)
    m.save()

    m=Model('umpire-chair')
    for x in (-.43,.43):
        for z in (-.38,.4):
            m.beam((x*1.65,.06,z*1.8),(x,2.2,z),.045,1)
        for i in range(7):
            y=.22+i*.28
            z=.72-y*.14
            m.beam((-.43,y,z),(.43,y,z),.025,4)
        m.beam((x,1.9,-.4),(x,2.8,-.4),.032,1)
        m.beam((x,2.62,-.4),(x,2.62,.3),.032,1)
    m.box((0,2.2,0),(1.04,.12,.95),4)
    m.box((0,2.37,0),(.65,.12,.55),2)
    m.box((0,2.65,.24),(.65,.55,.1),2)
    m.box((0,2.5,-.55),(.92,.07,.24),3)
    m.save()

    m=Model('net-post')
    m.box((0,.035,0),(.32,.07,.32),6)
    m.beam((0,.07,0),(0,1.07,0),.065,1,12)
    m.beam((0,1.07,0),(0,1.1,0),.07,3,12)
    m.beam((.06,.78,0),(.18,.78,0),.022,4)
    m.beam((.18,.78,0),(.18,.68,0),.022,4)
    m.save()

    m=Model('player-bench')
    for z in (-.17,0,.17):
        m.box((0,.48,z),(2.4,.09,.115),4)
    for y in (.74,.96):
        m.box((0,y,.23),(2.4,.16,.08),2)
    for x in (-.85,.85):
        m.beam((x,.06,-.24),(x,.96,.24),.04,1)
        m.beam((x,.06,.27),(x,.48,0),.04,1)
        m.box((x,.045,0),(.16,.09,.7),6)
    m.save()

    m=Model('scoreboard')
    for x in (-1,1):
        m.box((x,1.4,0),(.16,2.8,.16),1)
        m.box((x,.06,0),(.6,.12,.65),6)
    m.box((0,3.15,0),(3.5,1.75,.22),1)
    m.box((0,4.05,0),(3.6,.08,.32),3)
    m.face([(-1.64,2.4,-.116),(-1.64,3.9,-.116),(1.64,3.9,-.116),(1.64,2.4,-.116)],len(MATS),
           [(1,1),(1,0),(0,0),(0,1)])
    m.save(texture='score-display.png')

    m=Model('floodlight')
    m.box((0,.1,0),(.9,.2,.9),0)
    m.beam((0,.2,0),(0,10,0),.11,1,10)
    m.box((0,10.1,0),(2.7,.16,.2),1)
    for x in (-.9,0,.9):
        m.box((x,10.12,-.12),(.76,.6,.22),1)
        m.box((x,10.12,-.245),(.66,.46,.03),7)
        m.box((x,10.12,-.27),(.025,.46,.02),1)
    m.save()

    m=Model('net')
    # Tiny geometric mesh avoids an alpha texture and all shader dependencies.
    for i in range(81):
        x=-6.4+i*.16
        top=.914+.156*(abs(x)/6.4)**2
        m.face([(x-.007,.07,0),(x+.007,.07,0),(x+.007,top,0),(x-.007,top,0)],6)
    for i in range(7):
        y=.08+i*.14
        m.face([(-6.4,y-.007,0),(6.4,y-.007,0),(6.4,y+.007,0),(-6.4,y+.007,0)],6)
    for i in range(32):
        a=-6.4+i*.4
        b=a+.4
        ya=.914+.156*(abs(a)/6.4)**2
        yb=.914+.156*(abs(b)/6.4)**2
        m.face([(a,ya-.04,0),(b,yb-.04,0),(b,yb+.02,0),(a,ya+.02,0)],4)
    m.save()


GLYPHS = {'A':['01110','10001','10001','11111','10001','10001','10001'],
 'B':['11110','10001','10001','11110','10001','10001','11110'],
 'P':['11110','10001','10001','11110','10000','10000','10000'],
 'S':['01111','10000','10000','01110','00001','00001','11110'],
 'E':['11111','10000','10000','11110','10000','10000','11111'],
 'T':['11111','00100','00100','00100','00100','00100','00100'],
 '0':['01110','10001','10011','10101','11001','10001','01110'],
 '3':['11110','00001','00001','01110','00001','00001','11110'],
 '4':['10010','10010','10010','11111','00010','00010','00010'],
 '6':['01110','10000','10000','11110','10001','10001','01110'],
 ' ':['00000']*7}


def text(draw, xy, word, scale, color):
    x,y=xy
    for letter in word:
        for j,line in enumerate(GLYPHS[letter]):
            for i,b in enumerate(line):
                if b=='1':
                    draw.rectangle((x+i*scale,y+j*scale,x+(i+1)*scale-1,y+(j+1)*scale-1),fill=color)
        x+=6*scale


def textures():
    rng=random.Random(419)
    w,h=512,1024
    im=Image.new('RGB',(w,h))
    pix=im.load()
    # A toroidal noise field; exact opposite edge pixels match for repeat wrap.
    for y in range(h-1):
        for x in range(w-1):
            n=rng.randrange(-2,3)
            pix[x,y]=(43+n,95+n,89+n)
    d=ImageDraw.Draw(im)
    def pt(x,z): return ((x/18.29+.5)*(w-1),(z/36.57+.5)*(h-1))
    a,b=pt(-5.485,-11.885),pt(5.485,11.885)
    d.rectangle((*a,*b),fill=(37,108,157))
    for y in range(int(a[1])+1,int(b[1])):
        for x in range(int(a[0])+1,int(b[0])):
            n=rng.randrange(-2,3)
            pix[x,y]=(37+n,108+n,157+n)
    def line(a,b): d.line([pt(*a),pt(*b)],fill=(239,236,211),width=2)
    for x in (-5.485,-4.115,4.115,5.485): line((x,-11.885),(x,11.885))
    for z in (-11.885,11.885): line((-5.485,z),(5.485,z))
    for z in (-6.4,6.4): line((-4.115,z),(4.115,z))
    line((0,-6.4),(0,6.4))
    for z in (-11.885,11.885): line((0,z),(0,z-math.copysign(.18,z)))
    for y in range(h): pix[w-1,y]=pix[0,y]
    for x in range(w): pix[x,h-1]=pix[x,0]
    im.save(OUT/'court-blue-green.png',optimize=True)

    tile=Image.new('RGB',(128,128))
    for y in range(127):
        for x in range(127):
            n=rng.randrange(-3,4)
            tile.putpixel((x,y),(37+n,108+n,157+n))
    for y in range(128): tile.putpixel((127,y),tile.getpixel((0,y)))
    for x in range(128): tile.putpixel((x,127),tile.getpixel((x,0)))
    tile.save(OUT/'hardcourt-tile.png',optimize=True)

    im=Image.new('RGB',(1024,512))
    d=ImageDraw.Draw(im)
    stops=[(0,(13,23,49)),(.55,(80,91,125)),(.84,(212,153,126)),(1,(62,88,107))]
    for y in range(512):
        t=y/511
        a,b=next((a,b) for a,b in zip(stops,stops[1:]) if a[0]<=t<=b[0])
        f=(t-a[0])/(b[0]-a[0])
        d.line((0,y,1023,y),fill=tuple(round(u+(v-u)*f) for u,v in zip(a[1],b[1])))
    # Periodic original skyline; no real city, building or landmark.
    for layer in range(3):
        x=0
        while x<1024:
            width=rng.randrange(12,45)
            top=455-rng.randrange(15,75)+layer*13
            color=[(75,87,109),(48,66,86),(29,46,65)][layer]
            d.rectangle((x,top,x+width,511),fill=color)
            if layer==1:
                for wx in range(x+4,x+width-2,7):
                    for wy in range(top+6,490,10):
                        if rng.random()<.28: d.rectangle((wx,wy,wx+1,wy+2),fill=(203,165,117))
            x+=width+2
    # Seam-safe sky/city for a 360 degree cylinder (not an HDR environment).
    for y in range(512):
        im.putpixel((1023,y),im.getpixel((0,y)))
    im.save(OUT/'evening-city.png',optimize=True)

    im=Image.new('RGB',(512,256),(10,24,35))
    d=ImageDraw.Draw(im)
    d.rectangle((10,10,501,245),outline=(64,111,120),width=3)
    text(d,(270,24),'SET PTS',3,(150,178,174))
    for y,who,score in [(80,'A','6 40'),(164,'B','4 30')]:
        text(d,(32,y),'P '+who,6,(229,232,217))
        text(d,(272,y),score,6,(246,191,98))
    d.line((24,147,486,147),fill=(52,78,90),width=2)
    im.save(OUT/'score-display.png',optimize=True)


def scene():
    placements=[]
    def place(model,x,y,z,rotation=0):
        placements.append({'model':model,'position':[x,y,z],'rotationY':rotation})
    for side in (-1,1):
        for z in (-10,0,10):
            place('stand-10m',side*10.4,0,z,side*math.pi/2)
        for x in (-5,5):
            place('stand-10m',x,0,side*19.5,0 if side==1 else math.pi)
        place('net-post',side*6.4,0,0)
        place('player-bench',side*8.1,0,5.8,side*math.pi/2)
        for z in (-13,13):
            place('floodlight',side*10,0,z,side*math.pi/2)
        for z in (-8,-4,4,8):
            place('ad-board',side*9.35,0,z,side*math.pi/2)
        for x in (-6,6):
            place('ad-board',x,0,side*17.5,0 if side==1 else math.pi)
    place('net',0,0,0)
    place('umpire-chair',7.1,0,0,-math.pi/2)
    place('scoreboard',0,0,-18.1,math.pi)
    doc={'units':'metres','up':'+Y','standFront':'-Z','courtSize':[18.29,36.57],
         'crowd':{'columns':8,'rows':2,'variants':8,'poses':['down','up'],'cellSize':[128,256],
                  'layout':'index = variant * 2 + pose; row-major from top left',
                  'planeSize':[.88,1.76],'alphaTest':.5,'mipmaps':False},'placements':placements}
    (ROOT/'scene.json').write_text(json.dumps(doc,indent=2)+'\n')


if __name__=='__main__':
    models()
    textures()
    scene()
    assets=MODELS+[{'path':'runtime/'+p.name,'width':Image.open(p).width,'height':Image.open(p).height}
                   for p in sorted(OUT.glob('*.png'))]
    for a in assets:
        b=(ROOT/a['path']).read_bytes()
        a.update(bytes=len(b),sha256=hashlib.sha256(b).hexdigest(),license='CC0-1.0',source='source/build.py' if 'crowd' not in a['path'] else 'source/fans.py')
    (ROOT/'assets.json').write_text(json.dumps({'version':1,'assets':assets},indent=2)+'\n')
    print(json.dumps(assets,indent=2))
