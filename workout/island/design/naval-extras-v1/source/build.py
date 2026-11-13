#!/usr/bin/env python3
"""Original naval extras authoring source. CC0-1.0; see ../LICENSES.md.

Run: python source/build.py (Python 3, numpy, scipy, Pillow, ffmpeg).
No downloaded art, samples, fonts, meshes, compression codecs or runtime changes.
"""
from pathlib import Path
import argparse
import json
import math
import struct
import subprocess
import tempfile
import wave

import numpy as np
from PIL import Image, ImageDraw
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
PALETTE = [
    '#f29b45', '#e56b3e', '#ffcb73', '#fff0ce',
    '#448e89', '#2c6569', '#76b1a2', '#b9d3bc',
    '#b97b50', '#815442', '#e1b885', '#e8ce9d',
    '#374c56', '#263942', '#a4dbdc', '#f9df83',
]


def dump(path, data):
    (ROOT / path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')


def atlas():
    """Gutter-safe 4x4 warm palette atlas; each swatch has a subtle paint gradient."""
    a = np.zeros((1024, 1024, 4), dtype=np.uint8)
    yy, xx = np.mgrid[0:256, 0:256]
    for n, h in enumerate(PALETTE):
        color = np.array([int(h[i:i+2], 16) for i in (1, 3, 5)])
        # Broad painted variation, not image noise. UVs stay inside the 12px gutter.
        shade = (0.96 + 0.06 * (1 - yy / 255) + 0.014 * np.sin(xx / 43))[:, :, None]
        rgb = np.clip(color * shade, 0, 255).astype(np.uint8)
        r, c = divmod(n, 4)
        a[r*256:(r+1)*256, c*256:(c+1)*256, :3] = rgb
        a[r*256:(r+1)*256, c*256:(c+1)*256, 3] = 255
    Image.fromarray(a).save(ROOT / 'naval_atlas_1024.png', optimize=True)


class Geo:
    def __init__(self):
        self.p, self.n, self.uv = [], [], []

    def face(self, points, tile):
        points = np.array(points, dtype=float)
        normal = np.cross(points[1]-points[0], points[2]-points[0])
        length = np.linalg.norm(normal)
        if length < 1e-10:
            return
        normal /= length
        r, c = divmod(tile, 4)
        # glTF UV origin is top left. Never touch neighbouring palette swatches.
        uv = [(c/4+.035, r/4+.21), (c/4+.21, r/4+.21),
              (c/4+.21, r/4+.035), (c/4+.035, r/4+.035)]
        for i in range(1, len(points)-1):
            for j in (0, i, i+1):
                self.p.append(points[j].tolist())
                self.n.append(normal.tolist())
                self.uv.append(uv[j % 4])

    def box(self, center, size, tile, top=None):
        x, y, z = center
        a, b, c = np.array(size)/2
        p = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
             (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        for f in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4)]:
            self.face([p[i] for i in f], tile)
        self.face([p[i] for i in (3,7,6,2)], tile if top is None else top)

    def radial(self, center, rings, tile, sides=10, axis='Y', caps=True):
        """Lathed low-poly surface. rings are (axis offset, radius)."""
        ringpts = []
        for h, radius in rings:
            pts = []
            for i in range(sides):
                angle = 2*math.pi*i/sides
                p = [radius*math.sin(angle), h, radius*math.cos(angle)]
                if axis == 'Z':
                    p = [p[0], -p[2], p[1]]
                pts.append((np.array(p)+center).tolist())
            ringpts.append(pts)
        for a, b in zip(ringpts, ringpts[1:]):
            for i in range(sides):
                j = (i+1) % sides
                self.face([a[i], a[j], b[j], b[i]], tile)
        if caps:
            for k, reverse in [(0,True),(-1,False)]:
                pts = ringpts[k]
                mid = np.mean(pts, axis=0)
                for i in range(sides):
                    j = (i+1) % sides
                    self.face([mid,pts[j],pts[i]] if reverse else [mid,pts[i],pts[j]], tile)

    def beam(self, a, b, radius, tile, sides=6):
        a, b = np.array(a), np.array(b)
        up = (b-a)/np.linalg.norm(b-a)
        ref = np.array([0,0,1]) if abs(up[2]) < .9 else np.array([1,0,0])
        right = np.cross(up, ref)
        right /= np.linalg.norm(right)
        back = np.cross(right, up)
        g = Geo()
        g.radial([0,0,0], [(0,radius),(np.linalg.norm(b-a),radius)], tile, sides)
        mat = np.stack([right,up,back], axis=1)
        self.p.extend((np.array(g.p) @ mat.T + a).tolist())
        self.n.extend((np.array(g.n) @ mat.T).tolist())
        self.uv.extend(g.uv)

    def hull(self, width, length, tile, damaged=False):
        # Outline proceeds anticlockwise viewed from above; bow is +Z.
        outline = [(-.34,-.5),(.34,-.5),(.5,-.30),(.5,.13),(.30,.39),
                   (0,.54),(-.30,.39),(-.5,.13),(-.5,-.30)]
        rings = []
        for y, s in [(-.31,.65),(.03,1),(.29,1.01)]:
            ring = []
            for i,(x,z) in enumerate(outline):
                dent = .16 if damaged and i in (3,4) and y > 0 else 0
                ring.append([x*width*(s-dent),y,z*length*s])
            rings.append(ring)
        for band,(a,b) in enumerate(zip(rings,rings[1:])):
            for i in range(len(a)):
                j=(i+1)%len(a)
                self.face([a[i],b[i],b[j],a[j]], 12 if band == 0 else tile)
        for i in range(len(outline)):
            j=(i+1)%len(outline)
            self.face([[0,.29,0],rings[-1][j],rings[-1][i]],10)
            self.face([[0,-.31,0],rings[0][i],rings[0][j]],12)


class GLB:
    def __init__(self, name):
        self.name, self.bin = name, bytearray()
        self.d = {
            'asset': {'version':'2.0','generator':'Original naval-extras-v1 source/build.py',
                      'copyright':'CC0-1.0 — original work, see LICENSES.md'},
            'scene':0, 'scenes':[], 'nodes':[], 'meshes':[], 'accessors':[], 'bufferViews':[],
            'images':[{'uri':'naval_atlas_1024.png'}],
            'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],
            'textures':[{'sampler':0,'source':0}],
            'materials':[
                {'name':'warm_atlas','pbrMetallicRoughness':{'baseColorTexture':{'index':0},
                 'metallicFactor':0,'roughnessFactor':.83}},
                {'name':'amber_lens_on','pbrMetallicRoughness':{'baseColorTexture':{'index':0},
                 'metallicFactor':0,'roughnessFactor':.3},'emissiveFactor':[1,.58,.15]},
                {'name':'landing_decal_hidden','pbrMetallicRoughness':{
                 'baseColorFactor':[1,.54,.13,0],'metallicFactor':0,'roughnessFactor':1},
                 'alphaMode':'BLEND','doubleSided':True},
            ], 'extras':{'units':'metres','up':'+Y','forward':'+Z','waterline':0,
                         'license':'CC0-1.0','textOrBranding':False,'draco':False},
        }

    def accessor(self, values, kind, component=5126, target=None):
        data=np.asarray(values,dtype='<f4' if component==5126 else '<u2')
        while len(self.bin)%4:
            self.bin.append(0)
        view={'buffer':0,'byteOffset':len(self.bin),'byteLength':data.nbytes}
        if target:
            view['target']=target
        self.d['bufferViews'].append(view)
        self.bin.extend(data.tobytes())
        acc={'bufferView':len(self.d['bufferViews'])-1,'componentType':component,
             'count':len(data),'type':kind}
        if kind=='VEC3' or kind=='SCALAR':
            acc['min']=np.atleast_1d(data.min(axis=0)).tolist()
            acc['max']=np.atleast_1d(data.max(axis=0)).tolist()
        self.d['accessors'].append(acc)
        return len(self.d['accessors'])-1

    def mesh(self, name, g, material=0):
        p=self.accessor(g.p,'VEC3',target=34962)
        n=self.accessor(g.n,'VEC3',target=34962)
        attributes={'POSITION':p,'NORMAL':n}
        if material!=2:
            attributes['TEXCOORD_0']=self.accessor(g.uv,'VEC2',target=34962)
        self.d['meshes'].append({'name':name,'primitives':[
            {'attributes':attributes,'material':material,'mode':4}]})
        return len(self.d['meshes'])-1

    def node(self, name, mesh=None, parent=None, translation=None, **extra):
        n={'name':name,**extra}
        if mesh is not None:
            n['mesh']=mesh
        if translation is not None:
            n['translation']=list(translation)
        self.d['nodes'].append(n)
        index=len(self.d['nodes'])-1
        if parent is not None:
            self.d['nodes'][parent].setdefault('children',[]).append(index)
        return index

    def scene(self, name, root):
        self.d['scenes'].append({'name':name,'nodes':[root]})

    def finish(self):
        # Omit unused definitions, avoiding needless loader resources and validator hints.
        used={p['material'] for m in self.d['meshes'] for p in m['primitives']}
        mapping={old:new for new,old in enumerate(sorted(used))}
        self.d['materials']=[m for i,m in enumerate(self.d['materials']) if i in used]
        for m in self.d['meshes']:
            for p in m['primitives']:
                p['material']=mapping[p['material']]
        self.d['buffers']=[{'byteLength':len(self.bin)}]
        js=json.dumps(self.d,separators=(',',':')).encode()
        js+=b' '*((-len(js))%4)
        self.bin+=b'\0'*((-len(self.bin))%4)
        blob=struct.pack('<III',0x46546C67,2,28+len(js)+len(self.bin))
        blob+=struct.pack('<II',len(js),0x4E4F534A)+js
        blob+=struct.pack('<II',len(self.bin),0x004E4942)+self.bin
        (ROOT/(self.name+'.glb')).write_bytes(blob)


def gun(gun_radius=.28):
    t=Geo()
    t.radial([0,0,0],[(0,gun_radius*1.1),(.09,gun_radius*1.1),(.22,gun_radius),(.34,gun_radius*.72)],5,10)
    t.box([0,.25,.06],[gun_radius*1.45,.21,gun_radius*1.4],4,6)
    barrel=Geo()
    barrel.radial([0,0,0],[(0,.075),(.43,.075),(.49,.11),(.62,.11)],12,8,'Z')
    # Recessed dark muzzle surrounded by the thicker barrel sleeve.
    barrel.radial([0,0,0],[(.621,.072),(.624,.072)],13,8,'Z')
    return t,barrel


def ship(kind):
    spec={'patrol_boat':(1.45,3.2),'small_destroyer':(1.75,4.65),'tower_submarine':(1.25,3.8)}
    width,length=spec[kind]
    f=GLB(kind)
    turret,barrel=gun(.24 if kind!='small_destroyer' else .31)
    tm,bm=f.mesh('turret_geometry',turret),f.mesh('barrel_geometry',barrel)
    for state in ('intact','damaged','sinking'):
        damage=state!='intact'
        root=f.node(state,extras={'state':state,'waterline':0})
        hull=Geo()
        if kind=='tower_submarine':
            hull.radial([0,-.06,0],[(-1.93,.07),(-1.65,.39),(-1.1,.58),(.9,.58),(1.5,.36),(1.94,.06)],5,12,'Z')
            hull.box([.05 if damage else 0,.58,-.08],[.58,.85,.83],4,6)
            hull.box([0,.33,-1.54],[1.35,.09,.42],6)
            hull.box([0,.32,1.27],[1.1,.08,.32],6)
            hull.beam([.12,1.0,-.1],[.22 if damage else .12,1.43,-.1],.045,10,6)
            hull.beam([.22 if damage else .12,1.43,-.1],[.22 if damage else .12,1.43,.14],.045,10,6)
            hull.radial([0,.43,.85],[(0,.19),(.06,.19)],10,8)
            hull.box([0,.8,.343],[.38,.15,.018],13 if damage else 14)
            hull.radial([0,-.06,0],[(-1.62,.395),(-1.53,.43)],0,12,'Z',False)
            gunpos=(0,.43,.82)
        else:
            hull.hull(width,length,1 if damage else 4,damage)
            # Faceted wheelhouse, separate roof, large readable front glass.
            cabinz=-.38 if kind=='patrol_boat' else -.22
            hull.box([.055 if damage else 0,.66,cabinz],[width*.49,.74,length*.23],3,11)
            hull.box([0,1.06,cabinz],[width*.58,.12,length*.27],1 if damage else 0,2)
            hull.box([0,.85,cabinz+length*.116+.005],[width*.40,.20,.021],13 if damage else 14)
            for sign in (-1,1):
                hull.box([sign*width*.249,.83,cabinz],[.018,.19,length*.14],14)
                # Stern float and rubber fenders.
                hull.box([sign*width*.42,.37,-length*.28],[.16,.13,.44],12)
                hull.beam([sign*width*.4,.31,-length*.39],[sign*width*.4,.56,-length*.39],.025,10,5)
                hull.beam([sign*width*.4,.56,-length*.39],[sign*width*.4,.56,-length*.05],.024,10,5)
            hull.beam([0,1.13,cabinz],[.20 if damage else 0,1.61,cabinz-.03],.035,12,6)
            hull.box([.20 if damage else 0,1.55,cabinz],[.49,.10,.08],10)
            hull.radial([0,.32,-length*.36],[(0,.21),(.1,.21)],8,8)
            # Small stern equipment chest and warm trim across the stern.
            hull.box([0,.48,-length*.32],[.48,.29,.38],8,10)
            hull.box([0,.14,-length*.502],[width*.53,.09,.025],0)
            if kind=='small_destroyer':
                hull.radial([0,.3,-1.14],[(0,.25),(.65,.25)],12,8)
                hull.radial([0,.3,-1.14],[(.63,.28),(.72,.28)],0,8)
                hull.box([0,.38,.55],[.62,.16,.30],6)
            gunpos=(0,.30,length*.27)
        if damage:
            # Geometry damage: an inset dent, asymmetric broken plate, tilted mast,
            # dark scorch facets. No smoke meshes, people or violent imagery.
            x=width*.47
            hull.face([[x,.08,.35],[x*.77,.23,.52],[x*.86,.03,.83],[x,.02,.67]],13)
            hull.face([[-.25,.303,.38],[.08,.303,.49],[.19,.303,.27],[-.08,.303,.14]],9)
            hull.face([[.23,.32,-.68],[.43,.54,-.58],[.50,.32,-.28]],8)
        f.node('hull',f.mesh(state+'_hull_geometry',hull),root)
        t=f.node('turret',tm,root,gunpos,extras={'role':'turret','axis':'+Y','yawLimitsDegrees':[-150,150]})
        b=f.node('barrel',bm,t,[0,.26,.18],extras={'role':'barrel','axis':'+X','pitchLimitsDegrees':[-35,10]})
        f.node('muzzle',None,b,[0,0,.624],extras={'role':'muzzle','forward':'+Z'})
        f.scene(state,root)
        if state=='sinking':
            times=f.accessor([0,.7,1.7,2.8],'SCALAR')
            pos=f.accessor([[0,0,0],[0,-.16,0],[0,-.85,0],[0,-2.7,0]],'VEC3')
            quats=[]
            for roll,pitch in [(0,0),(.10,.05),(.32,.19),(.65,.36)]:
                # qz(roll) * qx(pitch), normalized by construction.
                quats.append([math.cos(roll/2)*math.sin(pitch/2),math.sin(roll/2)*math.sin(pitch/2),
                              math.sin(roll/2)*math.cos(pitch/2),math.cos(roll/2)*math.cos(pitch/2)])
            rot=f.accessor(quats,'VEC4')
            f.d['animations']=[{'name':'sinking','samplers':[
                {'input':times,'output':pos,'interpolation':'LINEAR'},
                {'input':times,'output':rot,'interpolation':'LINEAR'}],
                'channels':[{'sampler':0,'target':{'node':root,'path':'translation'}},
                            {'sampler':1,'target':{'node':root,'path':'rotation'}}]}]
    f.finish()


def pickups():
    f=GLB('supply_buoy')
    root=f.node('supply_buoy')
    g=Geo()
    g.radial([0,0,0],[(-.25,.30),(-.10,.54),(.08,.54),(.23,.39),(.27,.27)],0,12)
    g.radial([0,0,0],[(-.06,.548),(.055,.548)],3,12, caps=False)
    g.radial([0,0,0],[(.23,.27),(.45,.19),(.72,.17)],0,10)
    g.radial([0,0,0],[(.43,.195),(.50,.187)],3,10, caps=False)
    g.radial([0,0,0],[(.72,.23),(.79,.23)],12,10)
    for sign in (-1,1):
        g.beam([sign*.20,.25,0],[sign*.20,.48,0],.025,8,6)
        g.beam([sign*.20,.48,0],[sign*.12,.57,0],.025,8,6)
    f.node('float',f.mesh('orange_float',g),root)
    lens=Geo()
    lens.radial([0,0,0],[(0,.17),(.14,.17),(.23,.095),(.26,.01)],15,10)
    lm=f.mesh('amber_lens',lens,1)
    f.d['extensionsUsed']=['KHR_lights_punctual']
    f.d['extensions']={'KHR_lights_punctual':{'lights':[
        {'name':'supply_beacon','type':'point','color':[1,.62,.22],'intensity':2,'range':2.5}]}}
    f.node('light',lm,root,[0,.79,0],extensions={'KHR_lights_punctual':{'light':0}},extras={'on':True})
    f.scene('default',root)
    f.finish()

    f=GLB('ammo_crate')
    root=f.node('ammo_crate')
    g=Geo()
    # Wooden supply box, floating on two rounded low-poly pontoons.
    g.box([0,.28,0],[.9,.64,.73],8,10)
    g.box([0,.63,0],[.98,.10,.81],10,11)
    for z in (-.25,.25):
        g.box([0,.285,z],[.93,.67,.065],5,6)
        g.radial([-.6,-.07,z],[(-.14,.14),(.14,.14)],5,8,'Z')
        g.radial([.6,-.07,z],[(-.14,.14),(.14,.14)],5,8,'Z')
    for x in (-.40,.40):
        for z in (-.32,.32):
            g.box([x,.26,z],[.13,.67,.13],10,2)
    g.box([0,.55,.407],[.18,.19,.035],2)
    g.beam([-.18,.69,0],[-.18,.79,0],.025,9)
    g.beam([-.18,.79,0],[.18,.79,0],.025,9)
    g.beam([.18,.79,0],[.18,.69,0],.025,9)
    f.node('crate',f.mesh('floating_wooden_crate',g),root)
    f.scene('default',root)
    f.finish()


def projectiles():
    for name,r,length,tile in [('shell_regular',.075,.34,10),('shell_heavy',.12,.48,1)]:
        f=GLB(name)
        root=f.node(name)
        g=Geo()
        g.radial([0,0,0],[(-length/2,r),(.10*length,r),(.35*length,r*.7),(length/2,.005)],tile,10,'Z')
        g.radial([0,0,0],[(-length*.35,r*1.02),(-length*.19,r*1.02)],2,10,'Z',False)
        f.node('shell',f.mesh(name,g),root)
        f.scene('default',root)
        f.finish()

    f=GLB('landing_flag')
    root=f.node('landing_flag')
    g=Geo()
    g.radial([0,0,0],[(-.13,.23),(.05,.31),(.12,.23)],3,12)
    g.radial([0,0,0],[(.04,.315),(.09,.29)],0,12,caps=False)
    g.beam([0,.1,0],[0,1.24,0],.026,10,8)
    # Two sided waving blank flag, rather than country insignia or lettering.
    for side in (False,True):
        for a,b in [(0,.22),(.22,.47),(.47,.64)]:
            za=.04*math.sin(a*12)
            zb=.04*math.sin(b*12)
            pts=[[a,1.17,za],[a,.79,za],[b,.83,zb],[b,1.17,zb]]
            g.face(list(reversed(pts)) if side else pts,0 if a<.4 else 2)
    f.node('flag',f.mesh('orange_flag',g),root)
    ring=Geo()
    sides=48
    for i in range(sides):
        a,b=2*math.pi*i/sides,2*math.pi*(i+1)/sides
        ring.face([[.66*math.sin(a),.012,.66*math.cos(a)],
                   [.88*math.sin(a),.012,.88*math.cos(a)],
                   [.88*math.sin(b),.012,.88*math.cos(b)],
                   [.66*math.sin(b),.012,.66*math.cos(b)]],0)
    f.node('landing_decal',f.mesh('round_decal',ring,2),root,extras={'defaultOpacity':0,'visibleOpacity':.55})
    f.scene('default',root)
    f.finish()


def sprite_frame(kind,t,seed):
    """Analytic, supersampled graphic particles; no stock imagery or text."""
    scale=4
    im=Image.new('RGBA',(64*scale,64*scale),(0,0,0,0))
    d=ImageDraw.Draw(im)
    rng=np.random.default_rng(seed)
    def poly(points, color):
        d.polygon([(round(x*scale),round(y*scale)) for x,y in points],fill=color)
    def ellipse(box,color,width=None):
        box=[round(x*scale) for x in box]
        if width:
            d.ellipse(box,outline=color,width=max(1,round(width*scale)))
        else:
            d.ellipse(box,fill=color)
    if kind=='vulcan_missile':
        flicker=.8+.2*math.sin(t*math.pi*8)
        poly([(26,38),(32,61),(38,38)],(255,146,65,round(220*flicker)))
        poly([(29,37),(32,53),(35,37)],(255,235,159,255))
        poly([(27,23),(27,40),(37,40),(37,23),(32,9)],(242,193,125,255))
        poly([(27,23),(32,9),(37,23)],(234,112,61,255))
        poly([(27,31),(20,44),(27,40)],(75,138,134,255))
        poly([(37,31),(44,44),(37,40)],(75,138,134,255))
        poly([(28,25),(30,25),(30,37),(28,37)],(255,236,196,255))
    else:
        life=(.35+.65*math.sin(math.pi*t))*(1-t*.82)
        alpha=round(230*life)
        if kind in ('landing_splash','water_explosion'):
            radius=7+22*t
            ellipse([32-radius,44-radius*.27,32+radius,44+radius*.27],(225,249,238,alpha),1.9*(1-t)+.5)
            n=9 if kind=='landing_splash' else 14
            for i in range(n):
                ang=(i/n)*math.tau+rng.uniform(-.18,.18)
                vx=math.cos(ang)*(10+10*rng.random())
                vy=(16+12*rng.random())*(1.3 if kind=='water_explosion' else .9)
                x=32+vx*t*1.35
                y=43-vy*math.sin(math.pi*t*.86)
                w=(2.3-1.4*t)*(1.1 if kind=='water_explosion' else 1)
                poly([(x-w,y+4),(x-w*.6,y),(x,y-2.8),(x+w,y+.7),(x+w*.6,y+5)],
                     (189+int(40*rng.random()),236,232,alpha))
            if kind=='water_explosion':
                w=5.5*(1-t)+1
                h=30*math.sin(math.pi*t*.85)
                poly([(32-w*1.5,43),(32-w,43-h*.7),(31,43-h),(34,43-h*.9),(32+w,43)],(235,251,239,alpha))
        elif kind=='bow_mist':
            for sign in (-1,1):
                for i in range(8):
                    p=i/7
                    x=32+sign*(4+p*(12+11*t))
                    y=15+p*31+2*math.sin(t*math.tau+i)
                    w=1.3+p*2.0
                    poly([(x-w,y),(x,y-2),(x+w,y),(x+w*.5,y+4),(x-w*.6,y+3)],
                         (230,249,236,round(alpha*(.9-p*.48))))
        elif kind=='foam':
            for i in range(16):
                angle=i/16*math.tau
                radius=15+9*t+rng.uniform(-3,3)
                x=32+math.cos(angle)*radius
                y=32+math.sin(angle)*radius*.62
                w=2+rng.random()*2.5
                ellipse([x-w,y-w*.55,x+w,y+w*.55],(240,250,229,alpha),.8)
                if i%3==0:
                    ellipse([x+1,y+3,x+2.5,y+4.5],(193,233,222,alpha))
    a=np.array(im.resize((64,64),Image.Resampling.LANCZOS))
    a[:3,:,3]=a[-3:,:,3]=a[:,:3,3]=a[:,-3:,3]=0
    return Image.fromarray(a)


def effects():
    for kind in ['bow_mist','landing_splash','water_explosion','foam','vulcan_missile']:
        sheet=Image.new('RGBA',(256,256),(0,0,0,0))
        for i in range(16):
            sheet.paste(sprite_frame(kind,(i+.4)/16,84),((i%4)*64,(i//4)*64))
        # Transparent texels carry edge RGB, preventing dark fringes in linear sampling.
        a=np.array(sheet)
        from scipy.ndimage import distance_transform_edt
        mask=a[:,:,3]==0
        _,nearest=distance_transform_edt(mask,return_indices=True)
        a[mask,:3]=a[nearest[0][mask],nearest[1][mask],:3]
        Image.fromarray(a).save(ROOT/(kind+'.png'),optimize=True)
    im=Image.new('RGBA',(1024,1024),(0,0,0,0))
    d=ImageDraw.Draw(im)
    d.ellipse((64,64,960,960),outline=(255,165,70,170),width=90)
    im.resize((256,256),Image.Resampling.LANCZOS).save(ROOT/'landing_decal.png',optimize=True)


def synth(kind,sr=48000):
    duration={'supply_collect':.72,'shell_hit_ship':.62,'base_cannon':.76,'depot_burst':1.05}[kind]
    t=np.arange(round(duration*sr))/sr
    rng=np.random.default_rng(20261113)
    noise=rng.normal(0,1,len(t))
    low=sosfilt(butter(3,1800,fs=sr,output='sos'),noise)
    rumble=sosfilt(butter(3,400,fs=sr,output='sos'),noise)
    if kind=='supply_collect':
        x=np.zeros(len(t))
        for delay,freq in [(0,523.25),(.105,659.25),(.21,783.99)]:
            s=np.maximum(0,t-delay)
            env=np.where(t>=delay,(1-np.exp(-s*220))*np.exp(-s*9),0)
            x+=env*(np.sin(math.tau*freq*s)+.16*np.sin(math.tau*freq*2*s))*.25
    elif kind=='shell_hit_ship':
        x=low*np.exp(-t*19)*.48+np.sin(math.tau*(155*t-47*t*t))*np.exp(-t*13)*.46
        x+=.12*np.sin(math.tau*580*t)*np.exp(-t*26)
    elif kind=='base_cannon':
        x=low*np.exp(-t*23)*.33+rumble*np.exp(-t*9)*.72
        phase=math.tau*(92*t-29*t*t)
        x+=np.sin(phase)*np.exp(-t*12)*.55
    else:
        x=rumble*np.exp(-t*5.8)*1.5+low*np.exp(-t*13)*.28
        x+=.42*np.sin(math.tau*(72*t-20*t*t))*np.exp(-t*8)
        for start in [.07,.13]:
            s=np.maximum(t-start,0)
            x+=np.where(t>=start,low*np.exp(-s*25)*.23,0)
    # Round transients and give short effects enough body for -16 LUFS without
    # clipping. The fractional soft curve also lengthens the audible decay.
    x=np.sign(x)*np.abs(np.tanh(x*4))**.65
    x*=np.minimum(t/.006,1)*np.minimum((duration-t)/.06,1)
    return x*.74


def measure(path):
    p=subprocess.run(['ffmpeg','-nostdin','-hide_banner','-i',str(path),'-af',
        'loudnorm=I=-16:TP=-1:LRA=7:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
    return json.loads(p.stderr[p.stderr.rfind('{'):p.stderr.rfind('}')+1])


def audio():
    metrics=[]
    with tempfile.TemporaryDirectory(prefix='naval-extras-audio-') as td:
        for name in ['supply_collect','shell_hit_ship','base_cannon','depot_burst']:
            wav=Path(td)/(name+'.wav')
            x=synth(name)
            with wave.open(str(wav),'wb') as w:
                w.setparams((1,2,48000,len(x),'NONE','not compressed'))
                w.writeframes((x*32767).astype('<i2').tobytes())
            stats=measure(wav)
            filt=('loudnorm=I=-16:TP=-1.5:LRA=7:linear=true:'
                  f'measured_I={stats["input_i"]}:measured_TP={stats["input_tp"]}:'
                  f'measured_LRA={stats["input_lra"]}:measured_thresh={stats["input_thresh"]}:'
                  f'offset={stats["target_offset"]}')
            for ext,codec,options in [('ogg','libvorbis',['-q:a','5']),('mp3','libmp3lame',['-b:a','192k'])]:
                path=ROOT/(name+'.'+ext)
                correction=0
                for attempt in range(4):
                    af=filt+(f',volume={correction}dB' if correction else '')
                    subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(wav),'-af',af,
                        '-ar','48000','-ac','1','-map_metadata','-1','-c:a',codec,*options,str(path)],check=True)
                    observed=measure(path)
                    delta=-16-float(observed['input_i'])
                    if abs(delta)<=.08:
                        break
                    correction+=delta
                metrics.append({'file':path.name,'integratedLUFS':float(observed['input_i']),
                    'truePeakDBTP':float(observed['input_tp']),'sampleRate':48000,'channels':1,
                    'sourceDurationSeconds':len(x)/48000,'codec':codec})
    dump('audio_metrics.json',metrics)


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--only',choices=['models','effects','audio','all'],default='all')
    args=ap.parse_args()
    if args.only in ('all','models'):
        atlas()
        pickups()
        for k in ['patrol_boat','small_destroyer','tower_submarine']:
            ship(k)
        projectiles()
    if args.only in ('all','effects'):
        effects()
    if args.only in ('all','audio'):
        audio()
    print('Authored',args.only,'at',ROOT)


if __name__=='__main__':
    main()
