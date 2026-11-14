#!/usr/bin/env python3
"""Original, deterministic art + glTF authoring. Python 3 + Pillow + NumPy; no downloads.
SPDX-License-Identifier: CC0-1.0
Run from any directory. Audio mastering is in build_audio.py (requires FFmpeg).
"""
from pathlib import Path
import json
import math
import struct
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
S = 4
PALETTE = {'coolant': '#55edff', 'vulcan-magazine': '#ffbd50', 'energy': '#bd8aff'}


def rgba(c, a=255):
    if isinstance(c, str):
        return tuple(bytes.fromhex(c.lstrip('#'))) + (int(a),)
    return tuple(c[:3]) + (int(a),)


class Art:
    def __init__(self, w, h=None):
        self.w, self.h = w, h or w
        self.im = Image.new('RGBA', (w*S, self.h*S))
        self.glow = Image.new('RGBA', self.im.size)

    def draw(self, kind, xy, fill=None, outline=None, width=1, glow=False, **kw):
        d = ImageDraw.Draw(self.glow if glow else self.im)
        if kind in ('polygon', 'line'):
            xy = [(round(x*S), round(y*S)) for x, y in xy]
        else:
            xy = [round(x*S) for x in xy]
        opts = dict(fill=fill)
        if kind not in ('line', 'arc'):
            opts['outline'] = outline
        if kind in ('line', 'ellipse', 'arc', 'rounded_rectangle'):
            opts['width'] = max(1, round(width*S))
        if 'radius' in kw:
            kw['radius'] *= S
        getattr(d, kind)(xy, **opts, **kw)

    def line(self, xy, color, width=1, glow=False):
        self.draw('line', xy, color, width=width, glow=glow)

    def ellipse(self, xy, color=None, outline=None, width=1, glow=False):
        self.draw('ellipse', xy, color, outline, width, glow)

    def poly(self, xy, color, outline=None, glow=False):
        self.draw('polygon', xy, color, outline, glow=glow)

    def arc(self, box, start, end, color, width=2, glow=False):
        self.draw('arc', box, fill=color, start=start, end=end, width=width, glow=glow)

    def finish(self):
        base = self.glow.filter(ImageFilter.GaussianBlur(3.4*S))
        base = Image.alpha_composite(base, self.glow.filter(ImageFilter.GaussianBlur(1.2*S)))
        base = Image.alpha_composite(base, self.im).resize((self.w, self.h), Image.Resampling.LANCZOS)
        # A fully transparent outer guard prevents frame bleeding in a linear-filtered atlas.
        d = ImageDraw.Draw(base)
        d.rectangle((0, 0, self.w-1, self.h-1), outline=(0, 0, 0, 0), width=2)
        return base


def ring(a, cx, cy, radius, c, width=2, alpha=255):
    box = [cx-radius, cy-radius, cx+radius, cy+radius]
    a.ellipse(box, outline=rgba(c, alpha), width=width)
    a.ellipse(box, outline=rgba(c, alpha), width=width+1, glow=True)


def icon(kind):
    a = Art(96)
    c = PALETTE[kind]
    a.ellipse([20, 65, 76, 79], rgba('#041018', 180))
    a.poly([(48, 8), (79, 25), (82, 62), (48, 83), (14, 62), (17, 25)], rgba(c, 40), glow=True)
    a.poly([(48, 12), (78, 29), (78, 64), (48, 81), (18, 64), (18, 29)], '#152a3b', '#41576a')
    a.poly([(48, 12), (78, 29), (48, 46), (18, 29)], '#2c4658')
    a.poly([(48, 46), (78, 29), (78, 64), (48, 81)], '#0b1c2c')
    a.line([(21, 62), (48, 77), (75, 62)], c, 2, True)
    a.line([(21, 62), (48, 77), (75, 62)], c, 1.5)
    if kind == 'coolant':
        a.poly([(28, 30), (47, 20), (68, 32), (68, 55), (47, 67), (28, 55)], '#234e64', '#84a9bd')
        for i in range(6):
            y = 32+i*4
            a.line([(30, y), (46, y+9), (65, y-1)], '#0a283c', 2)
        # Circular fan with three distinct blades; no glyphs or lettering.
        a.ellipse([33, 30, 60, 57], '#0b253a', '#55edff', 1.3)
        for i in range(3):
            angle = i*math.tau/3
            pts = [(46, 44)] + [(46+12*math.cos(angle+t), 44+12*math.sin(angle+t)) for t in (.1, .4, .85)]
            a.poly(pts, '#55edff')
        a.ellipse([42, 40, 50, 48], '#d5fbff')
        a.line([(32, 23), (47, 15), (62, 23)], '#a7f8ff', 2)
    elif kind == 'vulcan-magazine':
        a.poly([(26, 44), (50, 32), (69, 43), (69, 62), (48, 73), (26, 61)], '#71532d', '#be944b')
        for x, y in [(31, 34), (44, 27), (57, 34)]:
            a.poly([(x, y), (x+8, y-4), (x+8, y+19), (x, y+23)], '#e4a842', '#ffdb88')
            a.poly([(x, y), (x+4, y-12), (x+8, y-4)], '#fff2b3')
            a.line([(x+1, y+16), (x+7, y+13)], '#684a2c', 2)
        a.line([(29, 52), (48, 63), (65, 54)], '#ffca68', 3, True)
        a.line([(29, 52), (48, 63), (65, 54)], '#ffca68', 2)
    else:
        a.poly([(48, 17), (64, 31), (65, 50), (48, 70), (31, 51), (32, 31)], '#7755c9', '#ead8ff')
        a.poly([(48, 17), (48, 69), (31, 51), (32, 31)], '#ab80ee')
        a.poly([(48, 17), (64, 31), (48, 38), (32, 31)], '#dfc4ff')
        a.poly([(49, 27), (38, 46), (47, 44), (44, 60), (59, 37), (50, 39)], '#f5ecff', glow=True)
        a.poly([(49, 27), (38, 46), (47, 44), (44, 60), (59, 37), (50, 39)], '#fff7ff')
    return a.finish()


def effect(kind, i, n):
    w, h = (128, 64) if kind == 'enemy-shell' else (128, 128)
    a = Art(w, h)
    t = i/(n-1)
    if kind == 'pickup-burst':
        r = 13+41*t
        opacity = round(255*(1-t)**.65)
        ring(a, 64, 64, r, '#78f4ff', max(1, 5*(1-t)), opacity)
        for k in range(10):
            q = k*math.tau/10+.3*t
            x, y = 64+math.cos(q)*r, 64+math.sin(q)*r
            a.line([(x, y), (x+math.cos(q)*(4+5*t), y+math.sin(q)*(4+5*t))], rgba('#d5fcff', opacity), 2, True)
            a.line([(x, y), (x+math.cos(q)*(4+5*t), y+math.sin(q)*(4+5*t))], rgba('#d5fcff', opacity), 1.5)
        a.ellipse([54, 54, 74, 74], rgba('#d9fcff', 150*(1-t)), glow=True)
    elif kind == 'refill-ring':
        for k in range(11):
            color = '#6af2ff' if k < i else '#294657'
            angle = -90+k*360/11
            a.arc([18, 18, 110, 110], angle+3, angle+360/11-4, color, 5)
            if k < i:
                a.arc([18, 18, 110, 110], angle+3, angle+360/11-4, rgba(color, 160), 5, True)
        a.ellipse([28, 28, 100, 100], outline=rgba('#6af2ff', 45), width=1)
        if i == n-1:
            ring(a, 64, 64, 37, '#d5ffff', 1, 200)
    elif kind == 'enemy-shell':
        pulse = .65+.35*math.sin(i*math.pi/2)
        a.poly([(9, 32), (83, 21), (96, 32), (83, 43)], rgba('#ff593f', 145*pulse), glow=True)
        a.poly([(9+3*i, 32), (83, 27), (96, 32), (83, 37)], rgba('#ff6c36', 170))
        a.line([(25, 32), (92, 32)], '#ffb76b', 2, True)
        a.ellipse([78, 16, 110, 48], outline=rgba('#ff443b', 150+90*pulse), width=2, glow=True)
        a.poly([(80, 27), (99, 25), (111, 32), (99, 39), (80, 37)], '#ffe6a9', '#e88a51')
        a.poly([(83, 27), (88, 27), (88, 37), (83, 37)], '#9c4540')
        a.line([(94, 27), (100, 27), (107, 32)], '#fffdf1', 1.5)
    elif kind == 'water-target':
        pulse = (math.sin(i*math.tau/n)+1)/2
        ring(a, 64, 64, 36+6*pulse, '#ff434e', 2.5, 160+95*pulse)
        ring(a, 64, 64, 26, '#ff434e', 1.3, 120)
        a.ellipse([53, 53, 75, 75], rgba('#ff434e', 25+55*pulse), glow=True)
        for q in range(4):
            angle = q*math.pi/2
            a.line([(64+math.cos(angle)*31, 64+math.sin(angle)*31), (64+math.cos(angle)*48, 64+math.sin(angle)*48)], '#ff7a7f', 2)
        a.ellipse([61, 61, 67, 67], '#ffb0b2')
    elif kind == 'edge-warning':
        opacity = 110+145*(math.sin(i*math.tau/n)+1)/2
        # Canonical LEFT source arrow points outward; rotate around center for other edges.
        a.poly([(16, 64), (49, 34), (49, 53), (104, 53), (104, 75), (49, 75), (49, 94)], rgba('#ff4354', opacity), glow=True)
        a.poly([(18, 64), (48, 37), (48, 55), (98, 55), (98, 73), (48, 73), (48, 91)], rgba('#ff5160', opacity))
        a.line([(23, 64), (43, 46)], rgba('#ffd4d4', opacity), 2)
        a.line([(91, 48), (105, 48), (105, 80), (91, 80)], rgba('#ff7180', opacity*.6), 1.5)
    elif kind == 'muzzle-flash':
        r = [18, 45, 52, 42, 28, 12][i]
        alpha = [230, 255, 240, 190, 120, 20][i]
        pts = []
        for k in range(20):
            q = k*math.tau/20
            rr = r*(1 if k % 2 == 0 else .33)
            pts.append((64+math.cos(q)*rr, 64+math.sin(q)*rr*.8))
        a.poly(pts, rgba('#ff913c', alpha), glow=True)
        a.poly(pts, rgba('#ffd56c', alpha))
        a.ellipse([64-r*.32, 64-r*.32, 64+r*.32, 64+r*.32], rgba('#fffceb', alpha))
        for k in range(5):
            q = k*math.tau/5+.25
            a.line([(64+math.cos(q)*r*.8, 64+math.sin(q)*r*.8), (64+math.cos(q)*r, 64+math.sin(q)*r)], rgba('#ffbc68', alpha), 1.5)
    elif kind == 'shockwave':
        r = 9+44*t
        alpha = 250*(1-t)**.8
        ring(a, 64, 64, r, '#ffd4a0', 4-2.5*t, alpha)
        ring(a, 64, 64, r*.76, '#ff9864', 1.5, alpha*.5)
    return a.finish()


def save(im, path):
    p = ROOT/path
    p.parent.mkdir(parents=True, exist_ok=True)
    im.save(p, optimize=True)


def atlas(images, path):
    sheet = Image.new('RGBA', (images[0].width*len(images), images[0].height))
    for i, im in enumerate(images):
        sheet.paste(im, (i*im.width, 0))
    save(sheet, path)


# glTF geometry uses meters, +Y up, +Z forward, origin at waterline.
class Mesh:
    def __init__(self):
        self.faces = []

    def face(self, a, b, c, color, emissive=False):
        self.faces.append((np.array([a, b, c], dtype=float), color, emissive))

    def box(self, center, size, color):
        x, y, z = center
        sx, sy, sz = np.array(size)/2
        v = [(x+dx*sx, y+dy*sy, z+dz*sz) for dx, dy, dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        for face in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2)]:
            self.face(v[face[0]], v[face[1]], v[face[2]], color)
            self.face(v[face[0]], v[face[2]], v[face[3]], color)

    def cylinder(self, center, radius, height, color, n=12, top_radius=None, emissive=False):
        center = np.array(center)
        rt = radius if top_radius is None else top_radius
        for i in range(n):
            a, b = math.tau*i/n, math.tau*(i+1)/n
            v = [center+np.array([r*math.cos(q), y, r*math.sin(q)]) for r,y,q in [(radius,-height/2,a),(radius,-height/2,b),(rt,height/2,b),(rt,height/2,a)]]
            if rt > 0:
                self.face(v[0],v[3],v[2],color,emissive)
            self.face(v[0],v[2],v[1],color,emissive)
            self.face(center+[0,-height/2,0],v[0],v[1],color,emissive)
            if rt > 0:
                self.face(center+[0,height/2,0],v[2],v[3],color,emissive)

    def torus(self, y, radius, tube, color, n=24, m=4, emissive=False):
        def v(i,j):
            u, q = i*math.tau/n, j*math.tau/m
            return [(radius+tube*math.cos(q))*math.cos(u), y+tube*math.sin(q), (radius+tube*math.cos(q))*math.sin(u)]
        for i in range(n):
            for j in range(m):
                self.face(v(i,j),v(i,j+1),v(i+1,j+1),color,emissive)
                self.face(v(i,j),v(i+1,j+1),v(i+1,j),color,emissive)

    def export(self, kind):
        # Refine actual surface triangles to the exact requested 600; no hidden padding faces.
        if len(self.faces) > 600 or len(self.faces) % 2:
            raise ValueError((kind, len(self.faces)))
        while len(self.faces) < 600:
            k = max(range(len(self.faces)), key=lambda j: np.linalg.norm(np.cross(self.faces[j][0][1]-self.faces[j][0][0], self.faces[j][0][2]-self.faces[j][0][0])))
            tri, c, e = self.faces.pop(k)
            mid = tri.mean(axis=0)
            for j in range(3):
                self.face(tri[j],tri[(j+1)%3],mid,c,e)
        binary = bytearray()
        views, accessors, primitives = [], [], []
        def data(array, component, typ, target):
            while len(binary)%4:
                binary.append(0)
            offset = len(binary)
            binary.extend(array.tobytes())
            views.append(dict(buffer=0,byteOffset=offset,byteLength=array.nbytes,target=target))
            acc = dict(bufferView=len(views)-1,componentType=component,count=len(array),type=typ)
            if typ == 'VEC3':
                acc.update(min=array.min(axis=0).tolist(),max=array.max(axis=0).tolist())
            accessors.append(acc)
            return len(accessors)-1
        for emissive in (False, True):
            vertices, normals, colors, indices, lookup = [], [], [], [], {}
            for tri,c,e in self.faces:
                if e != emissive:
                    continue
                normal = np.cross(tri[1]-tri[0],tri[2]-tri[0])
                normal /= np.linalg.norm(normal)
                rgb = np.array(rgba(c)[:3])/255
                # glTF vertex colors are linear; convert authored sRGB palette once.
                rgb = np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
                for p in tri:
                    key = tuple(np.round(np.concatenate([p,normal,rgb]),7))
                    if key not in lookup:
                        lookup[key] = len(vertices)
                        vertices.append(p); normals.append(normal); colors.append([*rgb,1])
                    indices.append(lookup[key])
            if not vertices:
                continue
            attrs = dict(POSITION=data(np.array(vertices,dtype='<f4'),5126,'VEC3',34962),NORMAL=data(np.array(normals,dtype='<f4'),5126,'VEC3',34962),COLOR_0=data(np.array(colors,dtype='<f4'),5126,'VEC4',34962))
            index = data(np.array(indices,dtype='<u2'),5123,'SCALAR',34963)
            primitives.append(dict(attributes=attrs,indices=index,material=int(emissive),mode=4))
        gltf = dict(asset=dict(version='2.0',generator='Bakasun original refill authoring / CC0-1.0'),scene=0,scenes=[dict(nodes=[0])],nodes=[dict(name=kind,mesh=0)],meshes=[dict(name=kind,primitives=primitives)],materials=[dict(name='painted-alloy',pbrMetallicRoughness=dict(baseColorFactor=[1,1,1,1],metallicFactor=.3,roughnessFactor=.42)),dict(name='signal-light',pbrMetallicRoughness=dict(baseColorFactor=[1,1,1,1],metallicFactor=0,roughnessFactor=.35),emissiveFactor=[.6,.6,.6])],buffers=[dict(byteLength=len(binary))],bufferViews=views,accessors=accessors,extras=dict(license='CC0-1.0',triangles=600,waterline=0,units='meters',up='+Y',forward='+Z'))
        js = json.dumps(gltf,separators=(',',':')).encode()
        js += b' '*((-len(js))%4)
        binary += b'\0'*((-len(binary))%4)
        out = struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(binary))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(binary),b'BIN\0')+binary
        p = ROOT/'models'/f'{kind}.glb'
        p.parent.mkdir(exist_ok=True)
        p.write_bytes(out)
        bounds = np.concatenate([f[0] for f in self.faces])
        return dict(file=str(p.relative_to(ROOT)),triangles=600,bytes=len(out),bounds=dict(min=bounds.min(axis=0).round(5).tolist(),max=bounds.max(axis=0).round(5).tolist()),primitives=len(primitives))


def model(kind):
    m = Mesh()
    color = PALETTE[kind]
    m.torus(.02,.43,.11,'#243c50',n=20,m=4)
    m.cylinder((0,.10,0),.39,.12,'#465e6b',n=12)
    m.torus(.12,.46,.027,color,n=20,m=3,emissive=True)
    if kind == 'coolant':
        m.box((0,.4,0),(.48,.48,.36),'#31586e')
        for x in [-.25,-.125,0,.125,.25]:
            m.box((x,.43,0),(.025,.42,.47),'#9ab8c4')
        m.cylinder((0,.69,0),.16,.1,color,n=12,emissive=True)
        m.cylinder((0,.77,0),.11,.06,'#d8f8ff',n=8)
    elif kind == 'vulcan-magazine':
        m.box((0,.27,0),(.56,.22,.44),'#765a36')
        for x,z in [(-.17,.08),(0,-.12),(.17,.08)]:
            m.cylinder((x,.48,z),.095,.36,'#e4a842',n=8)
            m.cylinder((x,.71,z),.095,.1,'#ffe8a1',n=8,top_radius=0)
        m.box((0,.28,.24),(.44,.07,.04),color)
    else:
        m.cylinder((0,.42,0),.26,.5,'#8f61d4',n=6,top_radius=.16)
        m.cylinder((0,.76,0),.16,.18,'#dcc0ff',n=6,top_radius=0,emissive=True)
        m.torus(.40,.29,.025,color,n=16,m=3,emissive=True)
        for x in [-.25,.25]:
            m.box((x,.29,0),(.07,.23,.26),'#c4abd6')
    return m.export(kind)


def build():
    icons=[]
    for kind in PALETTE:
        im=icon(kind); icons.append(im); save(im,f'icons/{kind}.png')
    atlas(icons,'icons/refill-carousel.png')
    specs=[('pickup-burst',6,20,False),('refill-ring',12,0,False),('enemy-shell',4,16,True),('water-target',8,8,True),('edge-warning',8,8,True),('muzzle-flash',6,30,False),('shockwave',8,20,False)]
    sprites={}
    for kind,n,fps,loop in specs:
        images=[effect(kind,i,n) for i in range(n)]
        for i,im in enumerate(images):
            save(im,f'vfx/frames/{kind}/{i:02d}.png')
        atlas(images,f'vfx/{kind}.png')
        sprites[kind]=dict(file=f'vfx/{kind}.png',frameCount=n,frameWidth=images[0].width,frameHeight=images[0].height,columns=n,rows=1,fps=fps,loop=loop,anchor=([.75,.5] if kind=='enemy-shell' else [.5,.5]),blend='normal',alpha='straight',transparentGuardPx=2,sampler=dict(wrap='clamp-to-edge',minFilter='linear',magFilter='linear',mipmaps=False,uvInsetTexels=.5),frames=[f'vfx/frames/{kind}/{i:02d}.png' for i in range(n)])
    sprites['refill-ring'].update(mode='state',progressValues=[round(i/11,6) for i in range(12)],frameFormula='round(clamp(progress, 0, 1) * 11)',emptyFrame=0,fullFrame=11)
    sprites['enemy-shell'].update(forward='+X',rotationOrigin='anchor',tipPixels=[111,32])
    sprites['edge-warning'].update(sourceDirection='left',points='outward toward incoming source',rotationRadiansClockwise=dict(left=0,top=math.pi/2,right=math.pi,bottom=-math.pi/2))
    sprites['water-target'].update(plane='XZ',worldUp='+Y',depthWrite=False,depthTest=True,surfaceOffsetMeters=.035)
    models={kind:model(kind) for kind in PALETTE}
    manifest=dict(schemaVersion=1,package='refill-enemyfire-v1',baseBranch='main',baseCommit='d759582c171600dd7c7df7906c2fb38ae7f8b88a',license='CC0-1.0',provenance='Original procedural geometry, supersampled raster art and synthesized audio. No stock, samples, fonts, logos or external assets.',runtimeIntegration=False,textInArtwork=False,preview='preview.html',coordinateSystem=dict(units='meters',up='+Y',forward='+Z',waterline=0),palette=PALETTE,icons=dict(frameWidth=96,frameHeight=96,alpha='straight',glow='baked',order=list(PALETTE),carousel=dict(file='icons/refill-carousel.png',columns=3,rows=1,frameCount=3),items={k:dict(file=f'icons/{k}.png',color=v,model=models[k]['file']) for k,v in PALETTE.items()}),models=models,floatIdle=dict(pivot='waterline',bobAmplitudeMeters=.035,bobFrequencyHz=.8,tiltAmplitudeRadians=.045,yawRadiansPerSecond=.24),sprites=sprites,audio={},previewSequence=dict(cycleSeconds=4,warningAtSeconds=.35,shotAtSeconds=1.15,impactAtSeconds=2.35,pickupAtSeconds=2.95,sourceAlternates=True),integrationNotes=['Cooldown, magazine and energy silhouettes are distinct without color.','Assets only: actual Vulcan refill and enemy fire rates are unchanged.','Water target is a circular texture: rotate plane onto XZ; camera perspective supplies foreshortening.','One warning sound per incoming salvo; do not retrigger each animation loop.','refill-ring is state-driven, not a looping animation.'])
    (ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    print('Created 3 icons, carousel, 52 VFX frames + 7 atlases, and three 600-triangle GLBs.')


if __name__=='__main__':
    build()
