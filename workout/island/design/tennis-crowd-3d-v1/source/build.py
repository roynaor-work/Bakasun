"""Original CC0 faceted seated crowd. Python standard library; deterministic GLB 2.0."""
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
SHIRTS = ['ed684b', '41a99a', 'e5b94b', '567cc1', 'bd6d9f', 'eee2c8',
          '729c4c', '955eb6', 'e58c42', '4e9fc5', 'bf535d', '8895ac']
SKINS = ['f2c5a0', '986342', 'd99b73', '663f2c', 'e4b08a', 'b87c54',
         '835135', 'f4d1af', 'c18b65', '593a2d', 'dcaf8a', 'a86c48']
HAIR = ['342c28', '1e2429', '805337', '272324', 'b48a50', '52372b',
        '252b32', 'b2ac9e', '6c4931', '1d2225', '9c6741', '6d6763']


def rgb(h):
    # glTF vertex colors are linear, unlike the palette's sRGB hex values.
    def linear(v):
        v = v / 255
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    return [linear(int(h[i:i + 2], 16)) for i in (0, 2, 4)]


class Fan:
    def __init__(self):
        self.positions, self.colors, self.deltas, self.head, self.indices = [], [], [], [], []

    def face(self, points, color, target=None, head=False):
        a, b, c = points[:3]
        u, v = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
        n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        length = math.sqrt(sum(x*x for x in n)) or 1
        light = sum(n[i]/length * [-.35, .8, .48][i] for i in range(3))
        # Baked broad key + cool ambient; darken under the seat and arms.
        shade = .64 + .30 * max(0, light)
        start = len(self.positions)
        for k, p in enumerate(points):
            self.positions.append(p)
            ao = .80 if .37 < p[1] < .67 else 1
            self.colors.append([round(min(1, x*shade*ao)*255) for x in rgb(color)] + [255])
            self.deltas.append([target[k][i]-p[i] for i in range(3)] if target else [0, 0, 0])
            self.head.append(1.0 if head else 0.0)
        for k in range(1, len(points)-1):
            self.indices.extend([start, start+k, start+k+1])

    def hull(self, points, faces, color, target=None, head=False):
        for f in faces:
            self.face([points[i] for i in f], color,
                      [target[i] for i in f] if target else None, head)

    def prism(self, center, dims, color, top=.9, head=False):
        x, y, z = center
        w, h, d = [n/2 for n in dims]
        p = [[x+sx*w*(top if sy>0 else 1), y+sy*h, z+sz*d]
             for sy in [-1, 1] for sz in [-1, 1] for sx in [-1, 1]]
        self.hull(p, [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1],
                      [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]], color, head=head)

    def limb(self, a, b, radius, color, target=None, sides=4):
        def points(a, b):
            axis = [b[i]-a[i] for i in range(3)]
            length = math.sqrt(sum(x*x for x in axis))
            axis = [x/length for x in axis]
            # All limb axes stay in YZ or mostly Y, so X is a stable ring direction.
            right = [0, -axis[2], axis[1]]
            if abs(axis[0]) < .9:
                right = [1-axis[0]*axis[0], -axis[0]*axis[1], -axis[0]*axis[2]]
            length = math.sqrt(sum(x*x for x in right))
            right = [x/length for x in right]
            up = [axis[1]*right[2]-axis[2]*right[1], axis[2]*right[0]-axis[0]*right[2], axis[0]*right[1]-axis[1]*right[0]]
            return [[p[j]+radius*(1 if end==0 else .83)*
                     (math.cos(k*math.tau/sides+math.pi/4)*right[j]+math.sin(k*math.tau/sides+math.pi/4)*up[j])
                     for j in range(3)] for end, p in enumerate([a, b]) for k in range(sides)]
        faces = [list(reversed(range(sides))), list(range(sides, sides*2))]
        faces += [[k, (k+1)%sides, (k+1)%sides+sides, k+sides] for k in range(sides)]
        self.hull(points(a, b), faces, color, points(*target) if target else None)

    def octa(self, center, dims, color, target=None):
        def points(c):
            return [[c[j]+(dims[j]*s if j==axis else 0) for j in range(3)]
                    for axis in range(3) for s in [-1, 1]]
        self.hull(points(center), [[4, 2, 0], [3, 4, 0], [5, 3, 0], [2, 5, 0],
                                  [2, 4, 1], [4, 3, 1], [3, 5, 1], [5, 2, 1]],
                  color, points(target) if target else None)


def make_fan(i):
    f = Fan()
    skin, hair, shirt = SKINS[i], HAIR[i], SHIRTS[i]
    width = [.42, .48, .39, .46, .43, .50, .40, .45, .49, .41, .44, .47][i]
    torso_h = [.43, .46, .41, .48][i%4]
    f.prism([0, .50, .02], [width*.92, .18, .28], '35465a')
    f.prism([0, .67+torso_h/2, -.015], [width, torso_h, .25], shirt, top=1.1)
    neck_y = .67+torso_h
    f.octa([0, neck_y+.018, -.005], [.075, .09, .075], skin)
    pivot = [0, neck_y+.025, -.015]
    head_y = neck_y+.20
    # Eight-sided, two-ring head with actual front/back volume; 28 triangles.
    rings = [[.145, head_y-.11, .105], [.158, head_y+.105, .125]]
    p = [[math.sin(k*math.tau/8)*r[0], r[1], math.cos(k*math.tau/8)*r[2]] for r in rings for k in range(8)]
    f.hull(p, [list(reversed(range(8))), list(range(8, 16))] +
           [[k, (k+1)%8, (k+1)%8+8, k+8] for k in range(8)], skin, head=True)
    # Hair silhouette changes with crown height and a three-style fringe.
    crown = head_y + [.17, .22, .135, .18][i%4]
    lower = [[math.sin(k*math.tau/8)*.161, head_y+.055-(
        .16 if i%4==1 and 2<=k<=6 else .055 if k in [3,4,5] else 0),
        math.cos(k*math.tau/8)*.128] for k in range(8)]
    upper = [[p[0]*.83, crown+(.045*(k%2) if i%4==3 else .025*p[0]/.161 if i%4==0 else 0), p[2]*.83] for k,p in enumerate(lower)]
    f.hull(lower+upper, [[k,(k+1)%8,(k+1)%8+8,k+8] for k in range(8)]+[list(range(8,16))], hair, head=True)
    # Tiny, anonymous eyes and nose, no texture and no real-person likeness.
    for x in [-.058, .058]:
        f.face([[x-.014,head_y+.012,.126],[x+.014,head_y+.012,.126],
                [x+.014,head_y+.034,.126],[x-.014,head_y+.034,.126]], '242d36', head=True)
    f.hull([[-.025,head_y-.02,.116],[.025,head_y-.02,.116],
            [0,head_y+.025,.117],[0,head_y-.014,.155]],
           [[0,1,3],[1,2,3],[2,0,3],[0,2,1]], skin, head=True)
    for sign in [-1, 1]:
        x = sign*(width/2+.015)
        shoulder = [x, neck_y-.07, -.005]
        elbow = [x+sign*.045, .76, .12]
        wrist = [sign*.16, .59, .31]
        up_elbow = [sign*(width/2+.12), neck_y+.16, .015]
        up_wrist = [sign*(width/2+.17), neck_y+.51, .075]
        f.limb(shoulder, elbow, .085, shirt, (shoulder, up_elbow))
        f.limb(elbow, wrist, .066, skin, (up_elbow, up_wrist), sides=3)
        f.octa(wrist, [.071,.079,.069], skin, up_wrist)
        hip, knee, ankle = [sign*.115,.50,.04], [sign*.145,.45,.40], [sign*.145,.115,.43]
        f.limb(hip, knee, .115, '35465a')
        f.limb(knee, ankle, .073, '586478', sides=3)
        f.prism([sign*.145,.061,.49], [.16,.12,.28], ['ede6d4','293848','a4b6b9'][i%3])
    return f, pivot


def write_glb(i):
    f, pivot = make_fan(i)
    blob, views, accessors = bytearray(), [], []
    def accessor(data, fmt, component, kind, target=None, normalized=False):
        while len(blob)%4: blob.append(0)
        offset = len(blob)
        flat = [n for row in data for n in row] if isinstance(data[0], list) else data
        blob.extend(struct.pack('<'+fmt*len(flat), *flat))
        view = {'buffer':0, 'byteOffset':offset, 'byteLength':len(blob)-offset}
        if target: view['target'] = target
        views.append(view)
        a = {'bufferView':len(views)-1,'componentType':component,'count':len(data),'type':kind}
        if normalized: a['normalized'] = True
        if component==5126:
            rows = data if isinstance(data[0],list) else [[x] for x in data]
            a['min'] = [min(row[k] for row in rows) for k in range(len(rows[0]))]
            a['max'] = [max(row[k] for row in rows) for k in range(len(rows[0]))]
        accessors.append(a)
        return len(accessors)-1
    pos = accessor(f.positions,'f',5126,'VEC3',34962)
    color = accessor(f.colors,'B',5121,'VEC4',34962,True)
    head = accessor(f.head,'f',5126,'SCALAR',34962)
    delta = accessor(f.deltas,'f',5126,'VEC3',34962)
    indices = accessor(f.indices,'H',5123,'SCALAR',34963)
    times = accessor([0.,1.,2.],'f',5126,'SCALAR')
    weights = accessor([0.,1.,0.],'f',5126,'SCALAR')
    triangles = len(f.indices)//3
    assert triangles <= 220, triangles
    doc = {'asset':{'version':'2.0','generator':'Original CC0 tennis-crowd-3d-v1/source/build.py'},
           'extensionsUsed':['KHR_materials_unlit'],
           'scene':0,'scenes':[{'nodes':[0]}],
           'nodes':[{'name':f'fan-{i+1:02}','mesh':0,'extras':{'headPivot':pivot,'forward':'+Z','seatHeight':.50}}],
           'meshes':[{'name':f'fan-{i+1:02}','weights':[0],'extras':{'targetNames':['arms-up']},
                      'primitives':[{'attributes':{'POSITION':pos,'COLOR_0':color,'_HEAD':head},'indices':indices,
                                     'material':0,'mode':4,'targets':[{'POSITION':delta}]}]}],
           'materials':[{'name':'baked-vertex-colors','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':1},'extensions':{'KHR_materials_unlit':{}}}],
           'animations':[{'name':'celebrate','samplers':[{'input':times,'output':weights,'interpolation':'LINEAR'}],
                          'channels':[{'sampler':0,'target':{'node':0,'path':'weights'}}]}],
           'bufferViews':views,'accessors':accessors,'buffers':[{'byteLength':len(blob)}]}
    raw = json.dumps(doc,separators=(',',':')).encode()
    raw += b' '*((-len(raw))%4)
    blob += b'\x00'*((-len(blob))%4)
    glb = struct.pack('<III',0x46546c67,2,28+len(raw)+len(blob))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(blob),0x004e4942)+blob
    name = f'runtime/fan-{i+1:02}.glb'
    (ROOT/name).write_bytes(glb)
    return {'file':name,'bytes':len(glb),'triangles':triangles,'vertices':len(f.positions),
            'shirt':'#'+SHIRTS[i],'skin':'#'+SKINS[i],'hair':'#'+HAIR[i],
            'headPivot':pivot,'sha256':hashlib.sha256(glb).hexdigest()}


if __name__ == '__main__':
    assets = [write_glb(i) for i in range(12)]
    manifest = {'license':'CC0-1.0','units':'meters','up':'+Y','forward':'+Z',
                'compression':'none; no Draco, meshopt, WASM, textures or external buffers',
                'assets':assets,'payloadBytes':sum(a['bytes'] for a in assets),
                'crowd':{'instances':600,'perVariant':50,'triangles':sum(a['triangles']*50 for a in assets)}}
    (ROOT/'assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'bytes':manifest['payloadBytes'],'triangles':manifest['crowd']['triangles']}))
