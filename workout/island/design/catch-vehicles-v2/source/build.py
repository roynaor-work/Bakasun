#!/usr/bin/env python3
"""Rebuild the 14 CC0 vehicles. Python 3 + NumPy + Pillow; no Blender needed.

Cars adapt the unmodified, hash-checked Kenney inputs in the adjacent ZIP.
Bike construction adapts the CC0 catch-props-v1 motorcycle, with new parts,
silhouettes, damage shapes, wheels and lighting. See ../LICENSES.md.
Three native glTF scenes reuse mesh topology and contain independent rigs.
"""
from __future__ import annotations

import collections
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import zipfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'source'
STATES = ['intact', 'damaged', 'crushed']


def rgb(hex_value):
    return np.array([int(hex_value[i:i+2], 16) / 255 for i in [1, 3, 5]])


def srgb_linear(values):
    values = np.array(values, dtype=float)
    return np.where(values <= .04045, values / 12.92, ((values + .055) / 1.055) ** 2.4)


SPECS = [
    dict(id='police-sedan', label='ניידת סדאן', kind='sedan', team='police',
         source='police', color='#e5eef2', accent='#17324d', length=4.35, segments=10),
    dict(id='police-suv', label='ניידת שטח', kind='suv', team='police',
         source='suv', color='#d6e7dc', accent='#17495a', length=4.05, segments=8),
    dict(id='police-dirt-bike', label='אופנוע שטח משטרתי', kind='dirt', team='police',
         color='#e3edff', accent='#2855ac'),
    dict(id='police-touring-bike', label='אופנוע סיור משטרתי', kind='touring', team='police',
         color='#eae8db', accent='#264e6d'),
    dict(id='police-van', label='ואן משטרתי', kind='van', team='police',
         source='van', color='#a9c8df', accent='#193b63', length=4.6, segments=10),
    dict(id='police-luxury', label='ניידת יוקרה', kind='luxury', team='police',
         source='sedan-sports', color='#323d57', accent='#d8e8f4', length=4.55, segments=10),
    dict(id='fugitive-sport', label='מכונית ספורט', kind='sport', team='fugitive',
         source='sedan-sports', color='#f05839', accent='#202c3c', length=4.25, segments=10),
    dict(id='fugitive-van', label='ואן נמלט', kind='van', team='fugitive',
         source='van', color='#41aa9b', accent='#eee2c6', length=4.4, segments=10),
    dict(id='fugitive-truck', label='משאית קטנה', kind='truck', team='fugitive',
         source='truck', color='#eb9a35', accent='#fff0d4', length=4.85, segments=10),
    dict(id='fugitive-taxi', label='מונית', kind='taxi', team='fugitive',
         source='taxi', color='#f3c53f', accent='#263745', length=4.3, segments=10),
    dict(id='fugitive-motorcycle', label='אופנוע ספורט', kind='sport-bike', team='fugitive',
         color='#8f7ade', accent='#263041'),
    dict(id='fugitive-scooter', label='קטנוע', kind='scooter', team='fugitive',
         color='#e68baf', accent='#f4e8d5'),
    dict(id='fugitive-suv', label='ג׳יפ נמלט', kind='suv', team='fugitive',
         source='suv', color='#83a34e', accent='#e3d5b1', length=4.2, segments=8),
    dict(id='fugitive-classic', label='מכונית ישנה', kind='classic', team='fugitive',
         source='sedan', color='#65a4c4', accent='#e9d8bb', length=4.2, segments=10),
]


class Geometry:
    """Triangle soup grouped into real, independently addressable parts."""
    def __init__(self):
        self.parts = collections.defaultdict(lambda: collections.defaultdict(list))

    def face(self, pts, material, part):
        p = np.asarray(pts, dtype=float)
        for i in range(1, len(p) - 1):
            t = p[[0, i, i+1]]
            if np.linalg.norm(np.cross(t[1]-t[0], t[2]-t[0])) > 1e-9:
                self.parts[part][material].append(t)

    def box(self, center, size, material, part):
        c = np.asarray(center)
        a = np.asarray(size) / 2
        pts = c + np.array([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
                            [-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]) * a
        for ids in [[3,2,1,0],[4,5,6,7],[0,1,5,4],[2,3,7,6],[1,2,6,5],[3,0,4,7]]:
            self.face(pts[ids], material, part)

    def loft(self, rings, material, part, cap=None):
        rings = [np.asarray(r) for r in rings]
        self.face(rings[0][::-1], cap or material, part)
        for a, b in zip(rings, rings[1:]):
            for i in range(len(a)):
                k = (i+1) % len(a)
                self.face([a[i], a[k], b[k], b[i]], material, part)
        self.face(rings[-1], cap or material, part)

    def cylinder(self, center, radius, length, material, part, axis='x', segments=8):
        rings = []
        for h in [-length/2, length/2]:
            ring = []
            for i in range(segments):
                a = math.tau * i / segments
                c, s = radius * math.cos(a), radius * math.sin(a)
                point = (h, c, s) if axis == 'x' else (c, s, h) if axis == 'z' else (c, h, -s)
                ring.append(np.asarray(center) + point)
            rings.append(ring)
        self.loft(rings, material, part)

    def beam(self, start, end, width, depth, material, part):
        start, end = np.array(start), np.array(end)
        axis = end-start
        axis /= np.linalg.norm(axis)
        ref = np.array([0,1,0]) if abs(axis[1]) < .9 else np.array([0,0,1])
        u = np.cross(axis, ref)
        u = u / np.linalg.norm(u) * width / 2
        v = np.cross(axis, u)
        v = v / np.linalg.norm(v) * depth / 2
        self.loft([[p + s*u + t*v for s,t in [(1,1),(-1,1),(-1,-1),(1,-1)]]
                   for p in [start, end]], material, part)


def ring(z, width, bottom, top, bevel=.07):
    b = min(bevel, (top-bottom)/3, width/3)
    return [(x,y,z) for x,y in [(-width,bottom+b),(-width+b,bottom),
            (width-b,bottom),(width,bottom+b),(width,top-b),(width-b,top),
            (-width+b,top),(-width,top-b)]]


def source_glb(data):
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20+size])
    blob = data[28+size:]

    def accessor(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        dtype = {5126:'<f4', 5123:'<u2', 5125:'<u4', 5121:'u1'}[a['componentType']]
        components = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        return np.ndarray((a['count'], components), dtype=dtype, buffer=blob,
            offset=view.get('byteOffset',0) + a.get('byteOffset',0),
            strides=(view.get('byteStride', np.dtype(dtype).itemsize*components),
                     np.dtype(dtype).itemsize)).copy()

    iv = doc['bufferViews'][doc['images'][0]['bufferView']]
    image = Image.open(io.BytesIO(blob[iv['byteOffset']:iv['byteOffset']+iv['byteLength']])).convert('RGB')
    return doc, accessor, image


def car_geometry(spec, inputs):
    doc, accessor, image = source_glb(inputs.read(spec['source'] + '.glb'))
    node = next(n for n in doc['nodes'] if n.get('name') == 'body')
    prim = doc['meshes'][node['mesh']]['primitives'][0]
    position = accessor(prim['attributes']['POSITION']) + node.get('translation', [0,0,0])
    uv = accessor(prim['attributes']['TEXCOORD_0'])
    indices = accessor(prim['indices']).reshape(-1,3)
    lo, hi = position.min(axis=0), position.max(axis=0)
    scale = spec['length'] / (hi[2]-lo[2])
    middle = (hi[2]+lo[2])/2
    center = np.array([0, 0, middle])
    # Preserve Kenney's recognizable profile and wheel arches, with a lower GT roof.
    transforms = np.array([scale*(1.07 if spec['kind']=='sport' else 1),
        scale*({'luxury':.91,'sport':.85}.get(spec['kind'],1)), scale])
    transformed = (position-center) * transforms
    out = Geometry()
    for ids in indices:
        old = position[ids]
        p = transformed[ids]
        centroid = old.mean(axis=0)
        x, y, z = p.mean(axis=0)
        t = uv[ids].mean(axis=0)
        color = np.array(image.getpixel((min(511,int(t[0]*512)),min(511,int(t[1]*512)))))
        if spec['source']=='police' and old[:,1].min() > 1.205:
            continue  # Replace the stock beacon lenses with independently named lenses.
        part = 'body'
        material = 'trim'
        # The first column of Kenney's palette is the pale blue window family.
        if t[0] < .15:
            if z > spec['length']*.34 and y < .65*scale:
                material, part = 'head_lamp', 'head_left' if x < 0 else 'head_right'
            else:
                material, part = 'glass', 'glass'
        elif z > spec['length']*.34 and y < hi[1]*transforms[1]*.38:
            part = 'bumper_front'
        elif z < -spec['length']*.35 and y < hi[1]*transforms[1]*.38:
            part = 'bumper_rear'
        elif abs(x) > .48*scale and abs(z) < spec['length']*.22 and y > .34*scale:
            part = 'door_left' if x < 0 else 'door_right'
        elif z > spec['length']*.15 and y > .39*scale:
            part = 'hood'
        elif z < -spec['length']*.23 and y > .4*scale:
            part = 'trunk'
        elif y > .79*scale:
            part = 'cabin'

        if material not in ['glass','head_lamp']:
            colorful = int(color.max())-int(color.min()) > 50
            near_front = z > spec['length']*.35
            near_back = z < -spec['length']*.35
            if colorful and near_back and color[0] > color[1]*1.4:
                material, part = 'tail_lamp', 'tail_left' if x < 0 else 'tail_right'
            elif .15 < t[0] < .28 and near_front and y < .7*scale:
                material, part = 'head_lamp', 'head_left' if x < 0 else 'head_right'
            elif colorful:
                material = 'paint'
            elif color.mean() > 185:
                material = 'accent' if spec['team']=='police' else 'silver'
            elif color.mean() > 110:
                material = 'paint' if spec['team']=='police' and y > .4*scale else 'trim'
            else:
                material = 'rubber'

            # Dark hood/roof, pale doors and a stripe make a fictional police livery.
            if spec['team']=='police' and material=='paint' and part in ['hood','trunk','cabin']:
                material = 'accent'
            elif material=='paint':
                material = 'paint_light' if color.mean()>175 else 'paint'
        out.face(p, material, part)

    # Some source bodies use the same swatch for a headlight and their paint.
    # In that case add slim, independently emissive lenses over the blank nose.
    if not any(part.startswith('head') for part in out.parts):
        front_z=(hi[2]-middle)*scale+.018
        lamp_y=(.32 if spec['kind']=='sport' else .46)*scale
        for side in [-1,1]:
            out.box((side*.44*scale,lamp_y,front_z),(.25*scale,.09*scale,.035*scale),
                    'head_lamp','head_left' if side<0 else 'head_right')
    if spec['kind']=='sport':
        spoiler=next(n for n in doc['nodes'] if n.get('name')=='spoiler')
        for prim in doc['meshes'][spoiler['mesh']]['primitives']:
            points=(accessor(prim['attributes']['POSITION'])+spoiler.get('translation',[0,0,0])-center)*transforms
            for ids in accessor(prim['indices']).reshape(-1,3):
                out.face(points[ids],'accent','spoiler')

    # Engine block is separate and revealed when the hood is crushed or displaced.
    smoke = np.array([0, .70*scale, (hi[2]-.62-middle)*scale])
    if spec['kind'] in ['van','truck']:
        smoke = np.array([0, .75*scale, (hi[2]-.42-middle)*scale])
    out.box(smoke + [0,-.21,0], [.55*scale,.20*scale,.45*scale], 'engine', 'engine')
    if spec['kind']=='classic':
        # Sparse original rust shapes, with no lettering or decal textures.
        for side in [-1,1]:
            for z in [-.45,.30]:
                x = side*.651*scale
                points = [(x,.48*scale,z*scale),(x,.56*scale,(z+.12)*scale),
                          (x,.51*scale,(z+.24)*scale),(x,.44*scale,(z+.16)*scale)]
                out.face(points if side < 0 else points[::-1], 'rust', 'door_left' if side<0 else 'door_right')

    # Wheels use the actual source world-space centres, not the source node offsets.
    wheels = []
    for n in doc['nodes']:
        if 'mesh' not in n or not n.get('name','').startswith('wheel-'):
            continue
        if n['name']=='wheel-back':
            continue
        ps = np.concatenate([accessor(p['attributes']['POSITION'])
                             for p in doc['meshes'][n['mesh']]['primitives']])
        ps += n.get('translation', [0,0,0])
        a, b = ps.min(axis=0), ps.max(axis=0)
        c = ((a+b)/2-center) * transforms
        radius = float((b[1]-a[1])/2*transforms[1])
        c[1] = radius  # Exact ground contact for every replacement wheel.
        key = ('F' if c[2]>0 else 'R') + ('L' if c[0]<0 else 'R')
        wheels.append(dict(id=key, position=c.tolist(), radius=radius,
                           width=float((b[0]-a[0])*scale*.82), segments=spec['segments']))
    roof = float(max(p[:,1].max() for mats in out.parts.values() for ts in mats.values() for p in ts))
    # The taxi sign is blank; its source geometry is retained. All police lenses are new.
    if spec['team']=='police':
        roof_y = roof if spec['source']!='police' else 1.20*transforms[1]
        out.box((0,roof_y+.035,0),(.92,.075,.32),'trim','beacon_mount')
        out.box((-.29,roof_y+.12,0),(.38,.17,.28),'siren_red','beacon_red')
        out.box((.29,roof_y+.12,0),(.38,.17,.28),'siren_blue','beacon_blue')
        for side,color in [(-1,'red'),(1,'blue')]:
            out.box((side*.29,roof_y+.12,0),(.386,.176,.286),
                    'siren_'+color+'_glow','beacon_'+color+'_glow')
    # A small matching spare makes the SUV silhouette distinct from the sedan.
    if spec['kind']=='suv':
        wheels.append(dict(id='spare', position=[0,.52*scale,(lo[2]-middle-.09)*scale],
                           radius=.29*scale,width=.23*scale,segments=8,spare=True))
    wheels.sort(key=lambda w:w['id'])
    return out, wheels, smoke.tolist()


def bike_geometry(spec):
    g = Geometry()
    kind = spec['kind']
    scooter = kind=='scooter'
    dirt = kind=='dirt'
    touring = kind=='touring'
    radius = .25 if scooter else .37 if dirt else .34
    front, rear = (.67,-.67) if scooter else (.91,-.86)
    wheels = [dict(id=k,position=[0,radius,z],radius=radius,width=.19 if scooter else .23,
                   segments=12,bike=True) for k,z in [('F',front),('R',rear)]]
    for side in [-1,1]:
        g.beam((side*.12,radius,rear),(side*.12,.63,-.08),.075,.075,'engine','frame')
        g.beam((side*.12,.42,-.26),(side*.12,.91,.35),.075,.075,'engine','frame')
        g.beam((side*.12,radius,front),(side*.12,1.04,.59),.065,.065,'silver','fork')
    if scooter:
        g.loft([ring(-.85,.22,.31,.62),ring(-.60,.34,.31,.79),
                ring(-.13,.30,.31,.72)],'paint','rear_cowl')
        g.box((0,.35,.10),(.59,.12,.85),'accent','floorboard')
        g.loft([ring(.38,.28,.36,.53),ring(.49,.32,.45,1.04),
                ring(.63,.26,.59,1.06)],'paint','leg_shield')
        g.box((0,.85,-.43),(.57,.14,.72),'seat','seat')
        g.beam((0,.69,.59),(0,1.22,.45),.11,.11,'silver','handlebar')
        g.cylinder((0,1.15,.54),.14,.15,'head_lamp','head',axis='z',segments=12)
        g.box((0,.46,.66),(.27,.08,.44),'accent','fender_front')
        g.box((0,.60,-.88),(.20,.10,.045),'tail_lamp','tail')
        smoke = [0,.52,-.50]
    else:
        width = .23 if dirt else .30
        top = 1.07 if dirt else 1.01
        g.loft([ring(-.57,width,.57,.85),ring(.07,width+.055,.54,top),
                ring(.48,width,.64,.98)],'paint','tank')
        g.box((0,1.01 if dirt else .96,-.40),(.43 if dirt else .50,.14,.80),'seat','seat')
        g.box((0,.55,.0),(.39,.30,.43),'engine','engine')
        # Six visible cooling fins, a meaningful silhouette detail within the budget.
        for y in [.44,.49,.54,.59]:
            g.box((0,y,.02),(.45,.018,.35),'silver','engine')
        g.cylinder((0,1.06,.68),.13,.13,'head_lamp','head',axis='z',segments=12)
        g.box((0,.81,-.87),(.21,.11,.045),'tail_lamp','tail')
        g.box((0,.83 if dirt else .72,.80),(.24,.07,.64),'paint','fender_front')
        g.box((0,.84,-.80),(.28,.065,.40),'paint','fender_rear')
        if dirt:
            g.box((0,1.04,.69),(.34,.32,.08),'accent','fairing')
            # Individual tread shoulders keep the dirt bike recognizable.
            for wheel in wheels:
                wheel['knobby'] = True
        elif touring:
            for side in [-1,1]:
                g.loft([ring(-.57,.21,.57,.91),ring(.25,.29,.49,1.13)],'paint','fairing') if side==1 else None
                g.box((side*.36,.71,-.57),(.31,.41,.60),'paint','pannier_left' if side<0 else 'pannier_right')
                g.box((side*.36,.90,-.57),(.32,.045,.61),'accent','pannier_left' if side<0 else 'pannier_right')
            g.box((0,1.05,-.92),(.51,.31,.39),'paint','topbox')
            g.loft([[(-.28,1.02,.62),(.28,1.02,.62),(.25,1.42,.40),(-.25,1.42,.40)],
                    [(-.28,1.02,.65),(.28,1.02,.65),(.25,1.42,.43),(-.25,1.42,.43)]],
                   'glass','windscreen')
        else:
            for side in [-1,1]:
                x = side*.34
                g.face([(x,.46,.15),(x,1.06,.45),(x*.85,.83,.71),(x*.85,.39,.42)],
                       'paint_light','fairing_left' if side<0 else 'fairing_right')
                g.face([(x,.46,.15),(x*.8,.49,-.31),(x*.82,.87,-.12),(x,1.06,.45)],
                       'paint','fairing_left' if side<0 else 'fairing_right')
            g.face([(-.23,1.05,.55),(.23,1.05,.55),(.19,1.27,.32),(-.19,1.27,.32)],
                   'glass','windscreen')
        g.cylinder((.30,.43,-.53),.08,.68,'silver','exhaust',axis='z',segments=8)
        g.cylinder((.30,.43,-.88),.052,.025,'rubber','exhaust',axis='z',segments=8)
        smoke = [0,.72,.12]
    bar_y = 1.25 if scooter or dirt else 1.14
    bar_z = .44
    g.beam((-.42,bar_y,bar_z),(.42,bar_y,bar_z),.065,.065,'engine','handlebar')
    for side in [-1,1]:
        g.box((side*.38,bar_y,bar_z),(.18,.08,.09),'rubber','handlebar')
        g.beam((side*.32,bar_y,bar_z),(side*.45,bar_y+.19,bar_z-.04),.025,.025,'silver','mirror_left' if side<0 else 'mirror_right')
        g.box((side*.46,bar_y+.20,bar_z-.04),(.17,.10,.05),'silver','mirror_left' if side<0 else 'mirror_right')
    if spec['team']=='police':
        z = .65 if dirt else -.61
        y = 1.14 if dirt else 1.01
        for side in [-1,1]:
            g.box((side*.22,y,z),(.13,.16,.15),'siren_red' if side<0 else 'siren_blue',
                  'beacon_red' if side<0 else 'beacon_blue')
            color='red' if side<0 else 'blue'
            g.box((side*.22,y,z),(.136,.166,.156),'siren_'+color+'_glow','beacon_'+color+'_glow')
    if scooter:
        # Engine and transmission casing are visible beside the small rear wheel.
        g.cylinder((.22,.32,-.45),.16,.13,'engine','engine',axis='x',segments=10)
        for y in [.37,.42,.47]:
            g.box((.25,y,-.38),(.14,.022,.32),'silver','engine')
    return g, wheels, smoke


def tyre_geometry(wheel):
    g = Geometry()
    r, w, n = wheel['radius'], wheel['width'], wheel['segments']
    # Three cross-section points on cars and four on bikes form a real open tyre.
    # The silver discs fill the hub; there are no invisible tyre end caps.
    tread = r*.93 if wheel.get('knobby') else r
    profile = [(-w/2,r*.64),(-w/2,tread), (w/2,tread), (w/2,r*.64)] if wheel.get('bike') else [(-w/2,r*.66),(0,r),(w/2,r*.66)]
    for i in range(n):
        a, b = math.tau*i/n, math.tau*(i+1)/n
        for j, (x,rad) in enumerate(profile):
            k = (j+1)%len(profile)
            xx, rr = profile[k]
            g.face([(x,rad*math.cos(a),rad*math.sin(a)),
                    (x,rad*math.cos(b),rad*math.sin(b)),
                    (xx,rr*math.cos(b),rr*math.sin(b)),
                    (xx,rr*math.cos(a),rr*math.sin(a))], 'rubber','tire')
    if wheel.get('knobby'):
        # Six shoulder blocks per wheel; separate from the rotating silver disc.
        for i in range(6):
            a = math.tau*i/6
            block = Geometry()
            block.box((0,r-.025,0),(.25,.05,.09),'rubber','tire')
            for ts in block.parts['tire'].values():
                for t in ts:
                    p = t.copy()
                    p[:,1] = t[:,1]*math.cos(a)-t[:,2]*math.sin(a)
                    p[:,2] = t[:,1]*math.sin(a)+t[:,2]*math.cos(a)
                    g.face(p,'rubber','tire')
    for side in [-1,1]:
        x = side*(w/2+.002)
        for i in range(n):
            a, b = math.tau*i/n, math.tau*(i+1)/n
            pts = [(x,0,0),(x,r*.65*math.cos(a),r*.65*math.sin(a)),
                   (x,r*.65*math.cos(b),r*.65*math.sin(b))]
            g.face(pts if side>0 else pts[::-1], 'rim_dark' if i%3==0 else 'silver','rim')
    return g


def damaged(points, bounds, severity):
    p = np.asarray(points)
    q = p.copy()
    low, high = bounds
    length = high[2]-low[2]
    height = high[1]
    f = np.clip((p[:,2] - (low[2]+length*.57))/(length*.43),0,1)
    rear = np.clip(((low[2]+length*.15)-p[:,2])/(length*.15),0,1)
    roof = np.clip((p[:,1]-height*.53)/(height*.47),0,1)
    if severity==1:
        q[:,2] -= length*.065*f**1.3
        q[:,1] -= height*(.040*f + .055*roof)
        q[:,0] += .07*np.sin(p[:,1]*8+p[:,2]*6)*f
    elif severity==2:
        q[:,2] -= length*.19*f**1.2
        q[:,2] += length*.030*rear
        q[:,1] -= height*(.11*f + .25*roof)
        q[:,0] += .16*np.sin(p[:,1]*8+p[:,2]*6)*f + .07*np.sin(p[:,2]*7)*roof
    return q


def normals(points):
    t = np.asarray(points).reshape(-1,3,3)
    n = np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0])
    mag = np.linalg.norm(n,axis=1)
    if np.any(mag<1e-10):
        raise ValueError('Degenerate damage shape')
    return np.repeat(n/mag[:,None],3,axis=0)


class GLB:
    def __init__(self, spec):
        self.spec = spec
        self.blob = bytearray()
        self.doc = dict(asset=dict(version='2.0',generator='catch-vehicles-v2/source/build.py',
            copyright='Kenney CC0 + original CC0 adaptations; see LICENSES.md'),scene=0,
            scenes=[],nodes=[],meshes=[],materials=[],accessors=[],bufferViews=[],animations=[])
        self.materials = {}
        self.triangles = {}
        self.mesh_meta = {}

    def accessor(self, data, kind='VEC3', target=34962):
        a = np.asarray(data,dtype='<f4')
        self.blob += b'\0' * ((-len(self.blob))%4)
        view = dict(buffer=0,byteOffset=len(self.blob),byteLength=a.nbytes)
        if target:
            view['target'] = target
        vi = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append(view)
        self.blob.extend(a.tobytes())
        shaped = a.reshape(-1,{'SCALAR':1,'VEC3':3,'VEC4':4}[kind])
        result = dict(bufferView=vi,componentType=5126,count=len(shaped),type=kind,
                      min=shaped.min(axis=0).tolist(),max=shaped.max(axis=0).tolist())
        ai = len(self.doc['accessors'])
        self.doc['accessors'].append(result)
        return ai

    def material(self, name):
        if name in self.materials:
            return self.materials[name]
        paint = rgb(self.spec['color'])
        accent = rgb(self.spec['accent'])
        colors = dict(paint=paint,paint_light=np.clip(paint*1.10+.03,0,1),accent=accent,
            trim=rgb('#24303d'),rubber=rgb('#182028'),silver=rgb('#c5d3df'),
            rim_dark=rgb('#50637c'),glass=rgb('#39758d'),engine=rgb('#39424b'),
            seat=rgb('#26303b'),rust=rgb('#a96135'),head_lamp=rgb('#fff1be'),
            tail_lamp=rgb('#ef3d39'),siren_red=rgb('#ff394f'),siren_blue=rgb('#3b8cff'))
        colors.update(siren_red_glow=colors['siren_red'],siren_blue_glow=colors['siren_blue'])
        c = srgb_linear(colors[name])
        mat = dict(name=name,pbrMetallicRoughness=dict(baseColorFactor=[*c.tolist(),1],
            metallicFactor=.65 if name in ['silver','rim_dark','engine'] else .18 if name=='glass' else .10 if name.startswith('paint') else 0,
            roughnessFactor=.17 if name=='glass' else .29 if name in ['paint','paint_light','accent','silver'] else .82))
        if name in ['head_lamp','tail_lamp'] or name.startswith('siren_'):
            mat['emissiveFactor'] = (c*(.06 if name in ['siren_red','siren_blue'] else .80)).tolist()
        if name in ['glass']:
            mat['doubleSided'] = True
        index = len(self.doc['materials'])
        self.doc['materials'].append(mat)
        self.materials[name] = index
        return index

    def mesh(self, name, mats, bounds=None, tire_radius=None):
        world_points = np.concatenate([np.asarray(ts).reshape(-1,3) for ts in mats.values()])
        pivot = (world_points.min(axis=0)+world_points.max(axis=0))/2
        if tire_radius is not None:
            pivot = np.zeros(3)
        prims = []
        count = 0
        for material, ts in mats.items():
            p = np.asarray(ts).reshape(-1,3)
            n = normals(p)
            pos = p-pivot
            prim = dict(attributes=dict(POSITION=self.accessor(pos),NORMAL=self.accessor(n)),
                        material=self.material(material),mode=4)
            targets = []
            if bounds is not None:
                for level in [1,2]:
                    q = damaged(p,bounds,level)
                    targets.append(dict(POSITION=self.accessor(q-p),NORMAL=self.accessor(normals(q)-n)))
            elif tire_radius is not None:
                q = p.copy()
                r = tire_radius
                # Sidewall collapse and a clear, uneven lower contact patch.
                q[:,1] *= .66
                q[:,2] *= .87
                q[:,0] *= 1.20
                floor = -.53*r
                q[:,1] = np.where(q[:,1]<floor, floor+(q[:,1]-floor)*.12, q[:,1])
                q[:,1] += .045*r*np.sin(p[:,2]*31/r)
                targets.append(dict(POSITION=self.accessor(q-p),NORMAL=self.accessor(normals(q)-n)))
            if targets:
                prim['targets'] = targets
            prims.append(prim)
            count += len(p)//3
        mesh = dict(name=name,primitives=prims)
        if bounds is not None:
            mesh.update(extras=dict(targetNames=['damage_damaged','damage_crushed']))
        elif tire_radius is not None:
            mesh.update(extras=dict(targetNames=['punctured']))
        mi = len(self.doc['meshes'])
        self.doc['meshes'].append(mesh)
        self.triangles[mi] = count
        return mi,pivot

    def node(self, name, **values):
        i = len(self.doc['nodes'])
        self.doc['nodes'].append(dict(name=name,**values))
        return i

    def write(self, spec, geometry, wheels, smoke):
        allpoints = np.concatenate([np.asarray(t).reshape(-1,3)
            for mats in geometry.parts.values() for t in mats.values()])
        bounds = [allpoints.min(axis=0),allpoints.max(axis=0)]
        meshes = {}
        for part,mats in geometry.parts.items():
            meshes[part] = self.mesh(part,mats,bounds=bounds)
        wheel_meshes = {}
        for w in wheels:
            gm = tyre_geometry(w)
            wheel_meshes[w['id']] = {part:self.mesh('wheel_'+w['id']+'_'+part,mats,
                tire_radius=w['radius'] if part=='tire' and not w.get('spare') else None)
                for part,mats in gm.parts.items()}
        spin_nodes, tire_nodes = [],collections.defaultdict(list)
        beacon_nodes = collections.defaultdict(list)
        scene_triangles = {}
        for state_index,state in enumerate(STATES):
            prefix = state+'__'
            children = []
            for part,(mesh,pivot) in meshes.items():
                kwargs = dict(mesh=mesh,translation=pivot.tolist(),
                    weights=[[0,0],[1,0],[0,1]][state_index],
                    extras=dict(partId=part,role='body_part',detachable=part not in ['body','cabin','engine']))
                if part.startswith('beacon_') and part!='beacon_mount':
                    glow = part.endswith('_glow')
                    color = 'red' if 'red' in part else 'blue'
                    kwargs['extras']['role'] = 'beacon_glow' if glow else 'beacon'
                    kwargs['extras']['channel'] = color
                    if glow:
                        kwargs['scale'] = [1,1,1] if color=='red' else [.001,.001,.001]
                elif part.startswith('head'):
                    kwargs['extras']['role'] = 'head_lamp'
                elif part.startswith('tail'):
                    kwargs['extras']['role'] = 'tail_lamp'
                if state_index:
                    severity = state_index
                    if part in ['hood','tank','leg_shield']:
                        kwargs['rotation'] = [math.sin(-.10*severity),0,0,math.cos(-.10*severity)]
                        kwargs['translation'][1] += .05*severity
                    elif part=='bumper_front':
                        kwargs['rotation'] = [0,0,math.sin(.045*severity),math.cos(.045*severity)]
                    elif part in ['door_left','door_right']:
                        angle = (-1 if part.endswith('left') else 1)*.035*severity
                        kwargs['rotation'] = [0,math.sin(angle),0,math.cos(angle)]
                part_node=self.node(prefix+part,**kwargs)
                children.append(part_node)
                if part.endswith('_glow'):
                    beacon_nodes['red' if 'red' in part else 'blue'].append(part_node)
            for wheel in wheels:
                key = wheel['id']
                spin_children = []
                for part,(mesh,pivot) in wheel_meshes[key].items():
                    extras = dict(partId='wheel_'+key+'_'+part,role=part,wheel=key)
                    kwargs = dict(mesh=mesh,extras=extras)
                    if part=='tire' and not wheel.get('spare'):
                        kwargs['weights'] = [0]
                    ni = self.node(prefix+'wheel_'+key+'_'+part,**kwargs)
                    spin_children.append(ni)
                    if part=='tire' and not wheel.get('spare'):
                        tire_nodes[key].append(ni)
                if wheel.get('spare'):
                    children.append(self.node(prefix+'spare',children=spin_children,translation=wheel['position'],
                        rotation=[0,math.sin(math.pi/4),0,math.cos(math.pi/4)],
                        extras=dict(partId='spare',role='spare')))
                    continue
                spin = self.node(prefix+'wheel_'+key+'_spin',children=spin_children,
                    extras=dict(partId='wheel_'+key+'_spin',role='wheel_spin',wheel=key,
                                radius=wheel['radius'],axis='+X'))
                spin_nodes.append(spin)
                steer = self.node(prefix+'wheel_'+key+'_steer',translation=wheel['position'],children=[spin],
                    extras=dict(partId='wheel_'+key+'_steer',role='wheel_steer',wheel=key,
                                front=key.startswith('F'),axis='+Y'))
                children.append(steer)
            smoke_pos = damaged(np.array([smoke]),bounds,state_index)[0].tolist() if state_index else smoke
            children.append(self.node(prefix+'fx_engine_smoke',translation=smoke_pos,
                extras=dict(partId='fx_engine_smoke',role='engine_smoke_emitter',direction=[0,1,0])))
            root = self.node('vehicle_'+state,children=children,
                extras=dict(vehicleId=spec['id'],damageState=state,forward='+Z',units='metres'))
            self.doc['scenes'].append(dict(name=state,nodes=[root],extras=dict(damageState=state)))
            scene_triangles[state] = sum(self.triangles[m] for m,_ in meshes.values()) + sum(
                self.triangles[m] for mm in wheel_meshes.values() for m,_ in mm.values())
        # Native glTF clips make wheel roll and punctures usable without this viewer.
        times = self.accessor([0,.25,.5,.75,1],kind='SCALAR',target=None)
        quats = [[math.sin(math.pi*t),0,0,math.cos(math.pi*t)] for t in [0,.25,.5,.75,1]]
        output = self.accessor(quats,kind='VEC4',target=None)
        self.doc['animations'].append(dict(name='wheels_roll',samplers=[dict(input=times,output=output,interpolation='LINEAR')],
            channels=[dict(sampler=0,target=dict(node=i,path='rotation')) for i in spin_nodes]))
        burst_times = self.accessor([0,.12],kind='SCALAR',target=None)
        burst_values = self.accessor([0,1],kind='SCALAR',target=None)
        for wheel,nodes in tire_nodes.items():
            self.doc['animations'].append(dict(name='tire_burst_'+wheel,
                samplers=[dict(input=burst_times,output=burst_values,interpolation='LINEAR')],
                channels=[dict(sampler=0,target=dict(node=i,path='weights')) for i in nodes]))
        if beacon_nodes:
            times=[0,.12,.20,.30,.40,.52,.60,.70,.80]
            ti=self.accessor(times,kind='SCALAR',target=None)
            red=[1,.001,1,.001,.001,.001,.001,.001,1]
            blue=[.001,.001,.001,.001,1,.001,1,.001,.001]
            samplers=[]
            channels=[]
            for color,values in [('red',red),('blue',blue)]:
                output=self.accessor([[v,v,v] for v in values],kind='VEC3',target=None)
                sampler=len(samplers)
                samplers.append(dict(input=ti,output=output,interpolation='STEP'))
                channels.extend(dict(sampler=sampler,target=dict(node=i,path='scale')) for i in beacon_nodes[color])
            self.doc['animations'].append(dict(name='beacons_flash',samplers=samplers,channels=channels))
        self.doc['buffers'] = [dict(byteLength=len(self.blob))]
        self.doc['extras'] = dict(license='CC0-1.0',vehicleId=spec['id'],
            damageStates=STATES,triangleBudget=[500,1200],noBranding=True)
        json_bytes = json.dumps(self.doc,separators=(',',':')).encode()
        json_bytes += b' '*((-len(json_bytes))%4)
        self.blob += b'\0'*((-len(self.blob))%4)
        data = struct.pack('<III',0x46546c67,2,28+len(json_bytes)+len(self.blob))
        data += struct.pack('<II',len(json_bytes),0x4e4f534a)+json_bytes
        data += struct.pack('<II',len(self.blob),0x004e4942)+self.blob
        path = ROOT/'models'/(spec['id']+'.glb')
        path.write_bytes(data)
        if any(not 500 <= t <= 1200 for t in scene_triangles.values()):
            raise ValueError((spec['id'],scene_triangles))
        return dict(id=spec['id'],label=spec['label'],team=spec['team'],kind=spec['kind'],
            path='models/'+path.name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),
            triangles=scene_triangles,storedMeshTriangles=sum(self.triangles.values()),
            scenes={state:i for i,state in enumerate(STATES)},parts=list(meshes),
            wheels=[{k:v for k,v in w.items() if k in ['id','position','radius','width','spare']} for w in wheels],
            colors=[spec['color'], '#e65b42','#57b9a4','#ecbd49','#8d83cf'],
            accent=spec['accent'],engineSmokeAnchor='fx_engine_smoke',
            animations=[a['name'] for a in self.doc['animations']],
            source='Kenney Car Kit 3.1 adapted' if 'source' in spec else 'catch-props-v1 CC0 motorcycle adapted',
            license='CC0-1.0')


def main():
    (ROOT/'models').mkdir(exist_ok=True)
    provenance = json.loads((SOURCE/'provenance.json').read_text())
    with zipfile.ZipFile(SOURCE/'kenney-car-kit-inputs.zip') as inputs:
        for name,expected in provenance['sha256'].items():
            assert hashlib.sha256(inputs.read(name)).hexdigest()==expected, name
        assets = []
        for spec in SPECS:
            geom,wheels,smoke = car_geometry(spec,inputs) if 'source' in spec else bike_geometry(spec)
            result = GLB(spec).write(spec,geom,wheels,smoke)
            assets.append(result)
            print(f"{spec['id']:24} {result['triangles']['intact']:4} triangles {result['bytes']:7} bytes")
    manifest = dict(schemaVersion=2,name='catch-vehicles-v2',license='CC0-1.0',
        coordinates=dict(forward='+Z',up='+Y',right='+X',units='metres',origin='ground centre'),
        format='glTF 2.0 binary',extensionsRequired=[],textures=0,triangleLimit=[500,1200],
        budgetBytes=6_000_000,preview=dict(path='preview.html',viewport=[844,390]),
        damage=dict(states=STATES,method='Three native scenes; shared part meshes; two damage morph targets per part',
                    default='intact',nodeConvention='{state}__{partId}',semanticKey='extras.partId'),
        effects=dict(controller='vehicle-controller.mjs',wheelRollAxis='+X',steeringAxis='+Y',
            smoke='Pooled engine particles at fx_engine_smoke',tireBurst='Per-wheel morph target and pooled rubber shards',
            policeBeacons='Native beacons_flash clip and independent emissive red/blue nodes, alternating double flash'),
        assets=assets,totals=dict(vehicles=len(assets),police=6,fugitive=8,
            glbBytes=sum(a['bytes'] for a in assets),textures=0))
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':
    main()
