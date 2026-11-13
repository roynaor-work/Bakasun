"""Original low-poly fire tools. Run with Python 3 + numpy + Pillow, no Blender needed."""
from pathlib import Path
import hashlib
import json
import math
import struct

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1]
PALETTE = [
    ('red', '#e43632'), ('red_dark', '#ad252b'), ('red_light', '#f15b46'),
    ('rubber', '#202a30'), ('charcoal', '#39434b'), ('fold', '#505d65'),
    ('silver', '#bdc9cb'), ('silver_dark', '#819296'), ('ivory', '#f1eee4'),
    ('brass', '#c7a15d'), ('hose', '#d7b578'), ('hose_light', '#eed19a'),
    ('black', '#10191e'), ('green', '#65977b'), ('wall', '#dce1da'), ('white', '#ffffff'),
]
SWATCH = {name: i for i, (name, _) in enumerate(PALETTE)}


def unit(a):
    a = np.array(a, dtype=float)
    return a / np.linalg.norm(a)


def frame(axis):
    w = unit(axis)
    ref = (1, 0, 0) if abs(w[1]) > .9 else (0, 1, 0)
    u = unit(np.cross(ref, w))
    return u, np.cross(w, u), w


class Mesh:
    def __init__(self, name):
        self.name = name
        self.positions, self.normals, self.uvs, self.indices = [], [], [], []
        self.parts = []

    def face(self, points, color):
        p = np.array(points, dtype=float)
        n = unit(np.cross(p[1] - p[0], p[2] - p[0]))
        tile = SWATCH[color]
        uv = ((tile % 4 + .5) / 4, (tile // 4 + .5) / 4)
        start = len(self.positions)
        self.positions.extend(p.tolist())
        self.normals.extend([n.tolist()] * len(p))
        self.uvs.extend([uv] * len(p))
        for i in range(1, len(p) - 1):
            self.indices.extend((start, start + i, start + i + 1))

    def box(self, center, size, color, bevel=0):
        x, y, z = np.array(center)
        sx, sy, sz = np.array(size) / 2
        if bevel:
            b = min(bevel, sx * .45, sy * .45, sz * .45)
            outline = [(-sx+b,-sz), (sx-b,-sz), (sx,-sz+b), (sx,sz-b),
                       (sx-b,sz), (-sx+b,sz), (-sx,sz-b), (-sx,-sz+b)]
            rings = []
            for h, inset in [(-sy,b), (-sy+b,0), (sy-b,0), (sy,b)]:
                rings.append([(x+px*(1-inset/sx), y+h, z+pz*(1-inset/sz))
                              for px,pz in outline])
            self.face(rings[0], color)  # outline normal is -Y
            self.face(rings[-1][::-1], color)
            for a, b in zip(rings, rings[1:]):
                for j in range(8):
                    k = (j+1) % 8
                    self.face([a[k], a[j], b[j], b[k]], color)
            return
        p = [(x+dx*sx,y+dy*sy,z+dz*sz) for dx,dy,dz in
             [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
              (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        for f in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2)]:
            self.face([p[i] for i in f], color)

    def revolve(self, center, axis, profile, color, sides=12, caps=True, colors=None):
        u,v,w = frame(axis)
        center = np.array(center)
        rings = [[center+w*d+r*(u*math.cos(j*2*math.pi/sides)+v*math.sin(j*2*math.pi/sides))
                  for j in range(sides)] for d,r in profile]
        for band,(a,b) in enumerate(zip(rings, rings[1:])):
            for j in range(sides):
                k=(j+1)%sides
                self.face([a[j],a[k],b[k],b[j]], colors[band] if colors else color)
        if caps:
            self.face(rings[0][::-1], color)
            self.face(rings[-1], color)

    def rod(self, a, b, radius, color, sides=8):
        self.revolve(a, np.array(b)-a, [(0,radius),(float(np.linalg.norm(np.array(b)-a)),radius)], color, sides)

    def tube(self, points, radius, color, sides=8, caps=True):
        points = np.array(points)
        rings=[]
        previous_u=None
        for i,p in enumerate(points):
            tangent = unit(points[min(i+1,len(points)-1)]-points[max(0,i-1)])
            if previous_u is None:
                u,v,_=frame(tangent)
            else:
                # Parallel transport prevents an arbitrary reference-axis flip at a bend.
                u=unit(previous_u-tangent*np.dot(previous_u,tangent))
                v=np.cross(tangent,u)
            previous_u=u
            rings.append([p+radius*(u*math.cos(j*2*math.pi/sides)+v*math.sin(j*2*math.pi/sides))
                          for j in range(sides)])
        for a,b in zip(rings,rings[1:]):
            for j in range(sides):
                k=(j+1)%sides
                self.face([a[j],a[k],b[k],b[j]],color)
        if caps:
            self.face(rings[0][::-1],color)
            self.face(rings[-1],color)

    def torus(self, center, axis, radius, thickness, color, segments=24, sides=6):
        u,v,w=frame(axis)
        rings=[]
        for i in range(segments):
            theta=2*math.pi*i/segments
            radial=u*math.cos(theta)+v*math.sin(theta)
            rings.append([np.array(center)+(radius+thickness*math.cos(j*2*math.pi/sides))*radial
                          +thickness*math.sin(j*2*math.pi/sides)*w for j in range(sides)])
        for i,a in enumerate(rings):
            b=rings[(i+1)%segments]
            for j in range(sides):
                k=(j+1)%sides
                self.face([a[k],a[j],b[j],b[k]],color)

    def export(self, nozzle, purpose='spray'):
        positions=np.array(self.positions,dtype='<f4')
        lo,hi=positions.min(axis=0),positions.max(axis=0)
        shift=np.array([(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2],dtype='<f4')
        positions-=shift
        nozzle=np.round(np.array(nozzle)-shift,6).tolist()
        blob=bytearray()
        views=[]
        accessors=[]

        def view(data,target=None):
            while len(blob)%4: blob.append(0)
            entry={'buffer':0,'byteOffset':len(blob),'byteLength':len(data)}
            if target: entry['target']=target
            views.append(entry);blob.extend(data)
            return len(views)-1

        def accessor(data,kind,component,target,bounds=False):
            a={'bufferView':view(data.tobytes(),target),'componentType':component,'count':len(data),'type':kind}
            if bounds: a.update(min=data.min(axis=0).tolist(),max=data.max(axis=0).tolist())
            accessors.append(a)
            return len(accessors)-1

        pos=accessor(positions,'VEC3',5126,34962,True)
        norm=accessor(np.array(self.normals,dtype='<f4'),'VEC3',5126,34962)
        uv=accessor(np.array(self.uvs,dtype='<f4'),'VEC2',5126,34962)
        idx=accessor(np.array(self.indices,dtype='<u2'),'SCALAR',5123,34963)
        atlas=(OUT/'fire-tools-atlas.png').read_bytes()
        image_view=view(atlas)
        j={
            'asset':{'version':'2.0','generator':'Bakasun original fire-tools/source/build.py',
                     'extras':{'units':'meters','up':'+Y','forward':'-Z','origin':'floor, AABB center X/Z'}},
            'scene':0,'scenes':[{'nodes':[0]}],
            'nodes':[{'name':self.name,'children':[1,2]}, {'name':'geometry','mesh':0},
                     {'name':'nozzle','translation':nozzle,
                      'extras':{'purpose':purpose,'direction':[0,0,-1]}}],
            'meshes':[{'name':self.name,'primitives':[{'attributes':{'POSITION':pos,'NORMAL':norm,'TEXCOORD_0':uv},
                      'indices':idx,'material':0,'mode':4}]}],
            'materials':[{'name':'fire-tools-shared-atlas','pbrMetallicRoughness':{
                'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.8}}],
            'textures':[{'sampler':0,'source':0}],
            'samplers':[{'magFilter':9728,'minFilter':9728,'wrapS':33071,'wrapT':33071}],
            'images':[{'name':'fire-tools-atlas','mimeType':'image/png','bufferView':image_view}],
            'accessors':accessors,'bufferViews':views,'buffers':[{'byteLength':len(blob)}],
        }
        jb=json.dumps(j,separators=(',',':')).encode()
        jb+=b' '*((-len(jb))%4)
        blob+=b'\0'*((-len(blob))%4)
        glb=struct.pack('<III',0x46546c67,2,28+len(jb)+len(blob))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(blob),0x004e4942)+blob
        (OUT/f'{self.name}.glb').write_bytes(glb)
        report={'file':f'{self.name}.glb','bytes':len(glb),'triangles':len(self.indices)//3,
                'bounds':{'min':positions.min(axis=0).tolist(),'max':positions.max(axis=0).tolist()},
                'dimensions_m':np.round(hi-lo,6).tolist(),'nozzle_m':nozzle,'nozzle_purpose':purpose,
                'sha256':hashlib.sha256(glb).hexdigest(),'atlas_sha256':hashlib.sha256(atlas).hexdigest()}
        assert len(glb)<=150000 and report['triangles']<=3000, report
        return report


def extinguisher():
    m=Mesh('fire-extinguisher')
    m.revolve((0,0,0),(0,1,0),[(0,.088),(.025,.103),(.39,.103),(.43,.094),(.46,.063),(.475,.027)],'red',16,
              colors=['red_dark','red','red','red_light','red_light'])
    m.revolve((0,.006,0),(0,1,0),[(0,.098),(.024,.107),(.036,.107)],'rubber',16)
    m.revolve((0,.472,0),(0,1,0),[(0,.032),(.047,.032)],'brass',10)
    m.box((0,.526,0),(.13,.023,.05),'silver',.004)
    m.box((-.053,.557,0),(.022,.058,.034),'rubber',.004)
    m.box((.039,.559,0),(.02,.058,.034),'rubber',.004)
    m.box((-.007,.584,0),(.13,.018,.038),'rubber',.004)
    m.box((-.005,.608,-.001),(.156,.018,.04),'red',.004)
    # Unlettered pressure dial: ivory face, green sector represented by a bar, red needle.
    m.revolve((0,.531,-.026),(0,0,-1),[(0,.027),(.014,.027)],'silver',12)
    m.revolve((0,.531,-.041),(0,0,-1),[(0,.021),(.001,.021)],'ivory',12)
    m.rod((-.011,.539,-.043),(.011,.539,-.043),.003,'green',6)
    m.rod((0,.529,-.045),(.009,.542,-.045),.002,'red',6)
    m.tube([(.031,.508,.012),(.10,.515,.012),(.157,.485,.008),(.177,.425,-.003),
            (.176,.347,-.014),(.17,.278,-.034),(.165,.26,-.075),(.165,.26,-.104)],.012,'rubber',8)
    m.revolve((.165,.26,-.1),(0,0,-1),[(0,.018),(.025,.019),(.065,.032),(.081,.034),(.081,.025),(.065,.019)],'rubber',10,caps=False)
    m.revolve((.165,.26,-.162),(0,0,-1),[(0,.018),(.001,.018)],'black',10)
    m.box((.112,.355,-.008),(.035,.026,.026),'red_dark',.003)
    return m.export((.165,.26,-.181))


def blanket():
    m=Mesh('fire-blanket')
    for y,w,d,col in [(.017,.44,.34,'charcoal'),(.047,.434,.329,'fold'),(.078,.442,.337,'charcoal'),(.105,.43,.325,'charcoal')]:
        m.box((0,y,0),(w,.03,d),col,.01)
    # Layered folds on the exposed front edge, broad red band wrapped around the stack.
    m.box((-.105,.121,0),(.071,.003,.304),'red',.001)
    m.box((-.105,.066,-.164),(.071,.095,.006),'red_dark',.002)
    m.box((-.105,.066,.164),(.071,.095,.006),'red',.002)
    for x in [-.152,.15]:
        m.box((x,.013,-.197),(.035,.012,.097),'red',.004)
        m.box((x,.013,-.239),(.037,.014,.018),'red_dark',.004)
    # Required common anchor is the deployment edge; a blanket has no fluid outlet.
    return m.export((0,.064,-.17),'deploy-edge; no fluid outlet')


def foam_hose():
    m=Mesh('foam-hose')
    pts=[]
    for i in range(39):
        t=2*math.pi*i/38
        pts.append((.21*math.sin(t),.032,.23+.25*math.cos(t)))
    m.tube(pts,.028,'hose',8)
    m.tube([(0,.032,.48),(.10,.04,.46),(.20,.06,.36),(.19,.09,.21),(.11,.15,.13),(0,.18,.12)],.028,'hose',8)
    m.revolve((0,.18,.15),(0,0,-1),[(0,.044),(.05,.044),(.064,.034)],'brass',12)
    m.revolve((0,.18,.08),(0,0,-1),[(0,.037),(.12,.039),(.21,.046)],'silver',12)
    for z in [.025,-.012,-.049]:
        m.revolve((0,.18,z),(0,0,-1),[(0,.043),(.012,.043)],'rubber',10)
    m.revolve((0,.18,-.13),(0,0,-1),[(0,.05),(.035,.051),(.13,.083),(.16,.088),(.16,.067),(.135,.063),(.11,.052)],'red',12,caps=False,
              colors=['red_dark','red','red','silver','rubber','rubber'])
    m.revolve((0,.18,-.235),(0,0,-1),[(0,.052),(.002,.052)],'black',12)
    # Open bail handle and red lever, both clear at button-sized preview scale.
    for x in [-.065,.065]:
        m.rod((x,.18,.032),(x,.29,.012),.012,'rubber')
    m.rod((-.065,.29,.012),(.065,.29,.012),.014,'rubber')
    m.box((0,.239,-.05),(.034,.018,.1),'red_dark',.004)
    return m.export((0,.18,-.29))


def hose_reel():
    m=Mesh('wall-hose-reel')
    # A wall section is included. Its floor edge establishes a useful world-space origin.
    m.box((0,.66,.19),(.82,1.32,.045),'wall',.014)
    m.box((0,.91,.135),(.18,.30,.08),'silver_dark',.008)
    for x in [-.064,.064]:
        for y in [.81,1.01]:
            m.revolve((x,y,.09),(0,0,-1),[(0,.012),(.008,.012)],'silver',6)
    m.rod((0,.93,.12),(0,.93,-.16),.045,'silver',12)
    m.revolve((0,.93,.07),(0,0,-1),[(0,.30),(.024,.312),(.037,.30)],'red_dark',24)
    # Black wound hose visible between the front spokes: one continuous spiral.
    coil=[]
    for i in range(73):
        t=2*math.pi*4*i/72
        r=.09+.175*i/72
        coil.append((r*math.cos(t),.93+r*math.sin(t),-.012))
    m.tube(coil,.021,'rubber',6)
    m.torus((0,.93,-.087),(0,0,1),.295,.018,'red',24,6)
    for i in range(5):
        a=2*math.pi*i/5
        m.rod((.072*math.cos(a),.93+.072*math.sin(a),-.087),
              (.288*math.cos(a),.93+.288*math.sin(a),-.087),.018,'red',6)
    m.revolve((0,.93,-.075),(0,0,-1),[(0,.09),(.028,.09),(.041,.075)],'red',12)
    m.revolve((0,.93,-.117),(0,0,-1),[(0,.023),(.012,.023)],'silver',8)
    m.rod((.045,.93,-.132),(.137,.93,-.132),.013,'silver',8)
    m.rod((.137,.93,-.132),(.137,.93,-.181),.018,'rubber',8)
    # The free end follows the wall and turns into a forward-facing brass nozzle.
    m.tube([(.265,.93,-.012),(.318,.85,-.015),(.332,.67,-.018),(.327,.46,-.02),
            (.30,.29,-.03),(.22,.23,-.046),(.13,.25,-.07),(.112,.33,-.08),(.112,.40,-.09),(.112,.40,-.135)],.019,'rubber',6)
    m.box((.112,.365,-.081),(.07,.025,.043),'red',.004)
    m.revolve((.112,.40,-.126),(0,0,-1),[(0,.025),(.035,.027),(.095,.019),(.108,.023),(.108,.012),(.09,.012)],'brass',10,caps=False)
    m.revolve((.112,.40,-.213),(0,0,-1),[(0,.012),(.001,.012)],'black',10)
    return m.export((.112,.40,-.234))


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    atlas=Image.new('RGB',(512,512))
    for i,(_,color) in enumerate(PALETTE):
        atlas.paste(color,((i%4)*128,(i//4)*128,(i%4+1)*128,(i//4+1)*128))
    atlas.save(OUT/'fire-tools-atlas.png',optimize=True)
    reports=[extinguisher(),blanket(),foam_hose(),hose_reel()]
    (OUT/'manifest.json').write_text(json.dumps({'units':'meters','up':'+Y','forward':'-Z',
        'atlas':{'file':'fire-tools-atlas.png','width':512,'height':512,'palette':dict(PALETTE)},
        'models':reports},indent=2)+'\n')
    for r in reports: print(r['file'],r['triangles'],'triangles,',r['bytes'],'bytes')


if __name__=='__main__':
    main()
