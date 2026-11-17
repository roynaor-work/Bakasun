#!/usr/bin/env python3
"""Deterministic, uncompressed glTF 2.0 authoring. Python standard library only.

Run from anywhere: python3 source/build-assets.py. Writes inside this pack only.
All geometry is original CC0, based on the existing CC0 Formula's measured frame.
"""
from pathlib import Path
import base64
import hashlib
import json
import math
import struct

ROOT = Path(__file__).resolve().parents[1]
ISLAND = ROOT.parent.parent
TAU = math.tau


def write(path, data):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data if isinstance(data, bytes) else data.encode())


def hexcolor(s):
    # glTF factors are linear, unlike the sRGB swatches shown in the UI.
    def linear(c):
        v = int(c, 16) / 255
        return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
    return [linear(s[i:i+2]) for i in (1, 3, 5)] + [1]


def material(name, color, metal=0, rough=.4):
    return dict(name=name, pbrMetallicRoughness=dict(baseColorFactor=hexcolor(color),
                metallicFactor=metal, roughnessFactor=rough))


PAINT = material('Paint 1', '#16b8a6', .48, .25)
DARK = material('Graphite', '#202a37', .25, .36)
ACCENT = material('Paint Stripes', '#e9f7df', .3, .29)
ALLOY = material('Forged Alloy', '#a9bdca', .83, .25)
RUBBER = material('Slick Rubber', '#252a31', 0, .86)
VISOR = material('Visor', '#24465e', .72, .17)


class Mesh:
    def __init__(self):
        self.parts = {}

    def face(self, points, mat=0):
        """Convex face; keep exact face normals for crisp machined silhouettes."""
        a, b, c = points[:3]
        u, v = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
        n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        norm = math.sqrt(sum(x*x for x in n))
        if norm < 1e-10:
            return
        normal = [x/norm for x in n]
        pos, normals, idx = self.parts.setdefault(mat, ([], [], []))
        offset = len(pos)
        pos.extend(points)
        normals.extend([normal]*len(points))
        for i in range(1, len(points)-1):
            idx.extend([offset, offset+i, offset+i+1])

    def surface(self, vertices, faces, mat=0, smooth=False):
        if not smooth:
            for face in faces:
                self.face([vertices[i] for i in face], mat)
            return
        pos, normals, idx = self.parts.setdefault(mat, ([], [], []))
        offset = len(pos)
        sums = [[0, 0, 0] for _ in vertices]
        for face in faces:
            for j in range(1, len(face)-1):
                ids = [face[0], face[j], face[j+1]]
                a, b, c = [vertices[i] for i in ids]
                u, v = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
                n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
                for i in ids:
                    for k in range(3):
                        sums[i][k] += n[k]
                idx.extend(offset+i for i in ids)
        pos.extend(vertices)
        for n in sums:
            length = math.sqrt(sum(x*x for x in n)) or 1
            normals.append([x/length for x in n])

    def box(self, center, size, mat=0):
        x, y, z = center
        a, b, c = [s/2 for s in size]
        vertices = [(x+i*a, y+j*b, z+k*c) for i,j,k in
                    [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                     (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        self.surface(vertices, [(0,3,2,1),(4,5,6,7),(0,1,5,4),
                               (1,2,6,5),(2,3,7,6),(3,0,4,7)], mat)

    def rod(self, start, end, radius, mat=0, segments=12):
        axis = [end[i]-start[i] for i in range(3)]
        length = math.sqrt(sum(x*x for x in axis))
        axis = [x/length for x in axis]
        temp = (0,1,0) if abs(axis[1]) < .9 else (1,0,0)
        u = [axis[1]*temp[2]-axis[2]*temp[1],axis[2]*temp[0]-axis[0]*temp[2],axis[0]*temp[1]-axis[1]*temp[0]]
        length = math.sqrt(sum(x*x for x in u))
        u = [x/length for x in u]
        v = [axis[1]*u[2]-axis[2]*u[1],axis[2]*u[0]-axis[0]*u[2],axis[0]*u[1]-axis[1]*u[0]]
        pts = [tuple(p[k]+radius*(u[k]*math.cos(i*TAU/segments)+v[k]*math.sin(i*TAU/segments)) for k in range(3))
               for p in (start, end) for i in range(segments)]
        faces = [tuple(reversed(range(segments))),tuple(range(segments,2*segments))]
        faces += [(i,(i+1)%segments,(i+1)%segments+segments,i+segments) for i in range(segments)]
        self.surface(pts, faces, mat)

    def ring_x(self, profile, mat=0, segments=40):
        pts = [(x,r*math.cos(i*TAU/segments),r*math.sin(i*TAU/segments))
               for x,r in profile for i in range(segments)]
        # Profile runs counterclockwise in X/r: face winding is outward.
        faces = [(j*segments+i, ((j+1)%len(profile))*segments+i,
                  ((j+1)%len(profile))*segments+(i+1)%segments, j*segments+(i+1)%segments)
                 for j in range(len(profile)) for i in range(segments)]
        self.surface(pts, faces, mat, True)

    def sphere(self, radii, mat=0, segments=28, rings=14):
        rx,ry,rz = radii
        pts = [(0,ry,0)]
        for j in range(1,rings):
            t = math.pi*j/rings
            pts += [(rx*math.sin(t)*math.cos(i*TAU/segments),ry*math.cos(t),
                     rz*math.sin(t)*math.sin(i*TAU/segments)) for i in range(segments)]
        pts.append((0,-ry,0))
        faces = [(0,1+(i+1)%segments,1+i) for i in range(segments)]
        for j in range(rings-2):
            for i in range(segments):
                a,b=1+j*segments+i,1+j*segments+(i+1)%segments
                faces.append((a,b,b+segments,a+segments))
        last = 1+(rings-2)*segments
        faces += [(len(pts)-1,last+i,last+(i+1)%segments) for i in range(segments)]
        self.surface(pts,faces,mat,True)

    def foil(self, span, chord, y, z, sweep=0, rise=0, mat=0, split=0):
        xs = [-span/2,-span*.40,-span*.22,0,span*.22,span*.40,span/2]
        profile = [(1,0),(.83,.016),(.43,.031),(0,.042),(0,.018),(.42,-.003),(.84,-.009),(1,-.01)]
        pts=[]
        for x in xs:
            tip=abs(x)/(span/2)
            for t,h in profile:
                pts.append((x,y+h+rise*tip**2,z+t*chord-sweep*tip+split*(1-tip)**2))
        faces=[tuple(range(7,-1,-1))]
        faces += [(j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i) for j in range(6) for i in range(8)]
        faces.append(tuple(range(48,56)))
        # Cap/side order corrected by signed volume, so both culling and normals agree.
        volume=sum(sum(pts[f[0]][k]*[
            pts[f[j]][1]*pts[f[j+1]][2]-pts[f[j]][2]*pts[f[j+1]][1],
            pts[f[j]][2]*pts[f[j+1]][0]-pts[f[j]][0]*pts[f[j+1]][2],
            pts[f[j]][0]*pts[f[j+1]][1]-pts[f[j]][1]*pts[f[j+1]][0]][k] for k in range(3))
            for f in faces for j in range(1,len(f)-1))
        if volume < 0:
            faces=[tuple(reversed(f)) for f in faces]
        self.surface(pts,faces,mat)


def glb(name, mesh, mats, connectors=None):
    binary=bytearray()
    used_materials=sorted(mesh.parts)
    doc=dict(asset=dict(version='2.0',generator='Bakasun racing-customize-v1 / original CC0'),
             scene=0,scenes=[dict(nodes=[0])],nodes=[dict(name='Mount',children=[1],extras=dict(slot=name))],
             meshes=[],materials=[mats[i] for i in used_materials],accessors=[],bufferViews=[],buffers=[])

    def accessor(values, kind, component, target):
        width={'VEC3':3,'SCALAR':1}[kind]
        while len(binary)%4: binary.append(0)
        start=len(binary)
        flat=[v for row in values for v in row] if width>1 else values
        binary.extend(struct.pack('<'+str(len(flat))+('f' if component==5126 else 'H'),*flat))
        view=len(doc['bufferViews'])
        doc['bufferViews'].append(dict(buffer=0,byteOffset=start,byteLength=len(binary)-start,target=target))
        a=dict(bufferView=view,componentType=component,count=len(values),type=kind)
        if kind=='VEC3' and target==34962:
            if values is not None:
                a.update(min=[min(v[k] for v in values) for k in range(3)],max=[max(v[k] for v in values) for k in range(3)])
        doc['accessors'].append(a)
        return len(doc['accessors'])-1

    primitives=[]
    for mi,(pos,normals,indices) in sorted(mesh.parts.items()):
        assert max(indices)<65536
        primitives.append(dict(attributes=dict(POSITION=accessor(pos,'VEC3',5126,34962),NORMAL=accessor(normals,'VEC3',5126,34962)),
                               indices=accessor(indices,'SCALAR',5123,34963),material=used_materials.index(mi),mode=4))
    doc['meshes'].append(dict(name=name,primitives=primitives))
    doc['nodes'].append(dict(name=name,mesh=0))
    for node,point in (connectors or {}).items():
        doc['nodes'][0]['children'].append(len(doc['nodes']))
        doc['nodes'].append(dict(name=node,translation=point))
    doc['buffers']=[dict(byteLength=len(binary))]
    return encode_glb(doc,binary)


def encode_glb(doc,binary):
    js=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode()
    js+=b' '*((-len(js))%4)
    binary=bytes(binary)+b'\0'*((-len(binary))%4)
    return struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(binary),b'BIN\0')+binary


COLORS=[('lagoon','לגונה','#19bba9','#f0ffd1'),('ember','גחלת','#f05b38','#ffe8ab'),
        ('cobalt','קובלט','#426df0','#d1f4ff'),('orchid','סחלב','#9866e8','#f6ddff'),
        ('sun','שמש','#f1c54e','#253346'),('pearl','פנינה','#edece2','#218f91'),
        ('cherry','דובדבן','#ca355b','#ffdbcf'),('forest','יער','#35765d','#e3d3a2'),
        ('graphite','גרפיט','#394658','#a9eece'),('ice','קרח','#8cceea','#f5f4e8')]
FRONT=[('sweep','סחף',1.98,.02,.01,2),('delta','דלתא',2.04,.12,.018,2),
       ('cascade','מדרגות',1.96,.06,.02,3),('manta','מנטה',2.08,-.07,.065,2),
       ('split','מפוצלת',1.94,.07,.01,2),('blade','להב',2.02,.01,0,1),
       ('wave','גל',1.99,.04,.075,3),('arrow','חץ',2.06,.15,.035,2)]
REAR=[('arc','קשת',1.32,.015,2),('highline','גבוהה',1.40,.025,3),
      ('swan','ברבור',1.38,.055,2),('box','מסגרת',1.46,0,2),
      ('split','חצויה',1.34,.025,2),('lowdrag','זרימה',1.30,0,1),
      ('vortex','מערבולת',1.44,.08,3),('stepped','מדורגת',1.50,.045,2)]
WHEELS=[('five','חמישה חישורים',5),('turbine','טורבינה',10),('mesh','רשת',12),
        ('aero','דיסק אוויר',0),('split','חישורים כפולים',7),('rally','מסלול רטוב',6)]
HELMETS=[('classic','קלאסית'),('aero','אווירודינמית'),('ridge','רכס'),('halo','הילה'),
         ('comet','שביט'),('vent','מאווררת'),('prism','מנסרה'),('tail','סנפיר')]
DECALS=[('stripes-twin','פסים כפולים','stripes'),('stripes-chevron','פסי חץ','stripes'),
        ('stripes-offset','פסים מדורגים','stripes'),('stripes-speed','פסי מהירות','stripes'),
        ('stars-one','כוכב יחיד','stars'),('stars-trio','שלושה כוכבים','stars'),
        ('stars-orbit','מסלול כוכבים','stars'),('stars-burst','כוכב מתפרץ','stars'),
        ('flames-classic','להבות זורמות','flames'),('flames-twin','להבות כפולות','flames'),
        ('flames-curl','להבה מסתלסלת','flames'),('flames-sharp','להבות חדות','flames')]
EFFECTS=[('amber','להבה ענברית','flame','#ff853f',36),('ion','להבה כחולה','flame','#63d5ff',36),
         ('gold','ניצוצות זהב','sparks','#ffd35d',40),('electric','ניצוצות סגולים','sparks','#bd9bff',40),
         ('teal','עשן טורקיז','smoke','#4fdbbb',32),('violet','עשן ורוד','smoke','#ea8bd4',32)]
CATEGORIES=[('front-wings','כנף קדמית',8),('rear-wings','כנף אחורית',8),('wheels','גלגלים',6),
            ('decals','מדבקות',12),('paints','צבעים',10),('effects','אפקטים',6),('helmets','קסדות',8)]


def star(cx,cy,r,inner=None,n=5):
    inner=inner or r*.43
    return ' '.join(f'{cx+math.sin(i*math.pi/n)*(r if i%2==0 else inner):.2f},{cy-math.cos(i*math.pi/n)*(r if i%2==0 else inner):.2f}' for i in range(2*n))


def decal_art(idx):
    if idx==0: return '<path d="M30 2h12v92H30zM54 2h12v92H54z"/>'
    if idx==1: return '<path d="m15 21 33 24 33-24v15L48 60 15 36zm0 27 33 24 33-24v15L48 87 15 63z"/>'
    if idx==2: return '<path d="M16 8h11v60H16zM37 25h11v63H37zM58 8h11v68H58zM79 25h6v63h-6z"/>'
    if idx==3: return '<path d="M11 22h72L66 33H11zM11 43h60L54 54H11zM11 64h48L42 75H11z"/>'
    if idx==4: return f'<polygon points="{star(48,48,39)}"/>'
    if idx==5: return ''.join(f'<polygon points="{star(x,y,r)}"/>' for x,y,r in [(28,63,22),(51,30,25),(78,63,16)])
    if idx==6: return f'<polygon points="{star(49,48,24)}"/><path d="M12 57C2 29 77 9 87 35S10 90 9 65" fill="none" stroke="currentColor" stroke-width="5"/>'
    if idx==7: return f'<polygon points="{star(48,48,41,15,8)}"/>'
    if idx==8: return '<path d="M15 85C-2 53 40 52 29 6c31 22 9 36 25 47 0-20 16-21 17-39 32 47 3 38 13 66-22-12-33-6-69 5Z"/>'
    if idx==9: return '<path d="M8 87C1 53 35 45 24 4c31 28 9 38 26 58-5 17-22 17-42 25Zm46 0c-7-34 27-42 16-83 31 28 9 38 24 58-4 17-20 17-40 25Z"/>'
    if idx==10: return '<path d="M15 87C-3 50 10 23 36 9c-16 20-11 40 4 39 30-2-1-31 20-41-4 27 39 30 22 62-8-24-22-14-17-3 6 15-20 29-50 21Z"/>'
    return '<path d="m9 88 12-40 12 13L44 2l13 50 16-29-4 41 20-11-11 35-21-14-14 16-13-14Z"/>'


def svg(body, size=96, color='#d4f6db', background=False):
    bg='<rect x="1" y="1" width="94" height="94" rx="20" fill="#17252e"/>' if background else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 96 96" fill="{color}" color="{color}">{bg}{body}</svg>'


def icon(category, i, color='#70dbc0'):
    if category=='front-wings':
        span=35+i%4
        body=f'<path d="m{48-span} 42 30-9h{span*2-60}l30 9v12H{48-span}z" fill="{color}"/><path d="M12 57h72v7H12zM44 24h8v32h-8z" fill="#e5f1ec"/>'
        body+=f'<path d="M9 36h6v34H9zM81 36h6v34h-6z" fill="{color}"/>'
        if i in (2,6): body+='<path d="M18 48h60v4H18z" fill="#173e42"/>'
        if i in (3,6): body+='<path d="m14 42 11-10v9m57 1L71 32v9" fill="none" stroke="#e5f1ec" stroke-width="3"/>'
        if i==4: body+='<path d="M41 38h14v17H41z" fill="#17252e"/><path d="M44 25h8v35h-8z" fill="#e5f1ec"/>'
    elif category=='rear-wings':
        body=f'<path d="M12 29h72v{10+i%3*3}H12zM16 48h64v7H16z" fill="{color}"/><path d="M30 55h6v22h-6zM60 55h6v22h-6zM9 24h6v38H9zM81 24h6v38h-6z" fill="#e5f1ec"/>'
        if i in (1,6): body+='<path d="M17 19h62v5H17z" fill="#e5f1ec"/>'
        if i==3: body+='<path d="M12 62h72v5H12z" fill="#e5f1ec"/>'
        if i==5: body+='<path d="M15 46h66v12H15z" fill="#17252e"/>'
    elif category=='wheels':
        body='<circle cx="48" cy="48" r="35" fill="#0b1117" stroke="#465860" stroke-width="4"/><circle cx="48" cy="48" r="23" fill="#283e4c" stroke="#c3d8df" stroke-width="3"/>'
        count=WHEELS[i][2]
        if count==0: body+='<circle cx="48" cy="48" r="21" fill="#aec1cb"/><circle cx="48" cy="48" r="15" fill="#72969c"/>'
        else:
            for k in range(count):
                angle=k*360/count
                body+=f'<path d="M45 48 44 27h7l1 21z" fill="#d4e8ed" transform="rotate({angle} 48 48)"/>'
        body+=f'<circle cx="48" cy="48" r="7" fill="{color}"/>'
        if i==5: body+='<path d="m22 22 5 4m-7 17 6 1m43-22-4 5m12 27-7-1m-5 23-4-5" stroke="#98acb2" stroke-width="3"/>'
    elif category=='decals': body=f'<g transform="translate(14 14) scale(.71)" fill="{color}">{decal_art(i)}</g>'
    elif category=='paints':
        c=COLORS[i]
        body=f'<rect x="16" y="16" width="64" height="64" rx="23" fill="{c[2]}"/><path d="M38 16h8v64h-8zM51 16h6v64h-6z" fill="{c[3]}"/>'
    elif category=='effects':
        kind=EFFECTS[i][2]; color=EFFECTS[i][3]
        if kind=='flame': body=f'<path d="M47 7c-6 27-32 29-27 58 3 18 33 28 51 9 17-19-3-37-4-48-6 15-10 20-14 17-6-10 3-22-6-36Z" fill="{color}"/><path d="M46 42c-2 15-19 17-12 29s29 8 25-5c-3-10-7-10-13-24Z" fill="#fff5d7"/>'
        elif kind=='sparks': body=f'<path d="m48 15-5 25-22-8 17 18-20 16 25-7 8 25 4-27 25 2-23-13 13-21-21 15z" fill="{color}"/>'
        else: body=''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}" opacity="{a}"/>' for x,y,r,a in [(56,25,13,.45),(35,43,20,.65),(61,53,22,.85),(36,71,16,1)])
    else:
        body=f'<path d="M17 62V43a31 31 0 0 1 62 0v25l-18 12H30z" fill="{color}"/><path d="m24 42 48-3 3 18-26 6-23-7z" fill="#132c3c"/><path d="m29 44 20-2-17 9z" fill="#669caa"/><path d="M28 68h33v5H28z" fill="#e3f3ee"/>'
        if i in (1,7): body+='<path d="m64 16 18 20-8-2-9-9z" fill="#e7f5e5"/>'
        if i in (2,4): body+='<path d="M44 13h8v22h-8z" fill="#e7f5e5"/>'
        if i==5: body+='<path d="M22 29h12v4H22zM62 29h12v4H62z" fill="#143c42"/>'
        if i==6: body+='<path d="m28 21 18 13 19-14-14-6z" fill="#e7f5e5"/>'
        if i==3: body+='<path d="M27 31q20-25 42 0" stroke="#e7f5e5" stroke-width="5" fill="none"/>'
        if i==7: body+='<path d="m17 40-9 28 12-6" fill="#e7f5e5"/>'
    return svg(body, background=True)


def build():
    manifest=dict(schemaVersion='1.0.0',id='racing-customize-v1',name='הסדנה · פורמולה',
      license='CC0-1.0',units='metres',coordinateSystem=dict(up='+Y',forward='+Z',left='+X',handedness='right'),
      constraints=dict(maxBytes=8000000,localOnly=True,wasm=False,compression=False,brands=False,decalText=False),
      categories=[dict(id=i,label=l,count=n,icon=f'icons/categories/{i}.svg') for i,l,n in CATEGORIES],
      items=[],defaults=dict(frontWing='front-sweep',rearWing='rear-arc',wheels='wheel-five',decal='decal-stars-one',
                          bodyPaint='paint-lagoon',stripePaint='paint-pearl',effect='effect-amber',helmet='helmet-classic'),
      compatibility=dict(profile='island-formula-4.6-v1',source='../../assets/racing-formula/formula.glb',
        sourceSha256=hashlib.sha256((ISLAND/'assets/racing-formula/formula.glb').read_bytes()).hexdigest(),
        previewBase='assets/base/formula-mounted.glb',root='Formula',body='Body',paintMaterial='Paint 1',
        setupOrder='Attach to the original named scene BEFORE racing-view.mergeFormula; that function merges away replaceable nodes.',
        player=True,rivals=False,physics='Cosmetic only; preserve vehicle dimensions, collision shape, handling and save data.',
        unsupported=['racing-v7 coupes','racing-formula-cars-v1 rivals','createStandIn fallback'],
        transforms='All mount rotations [0,0,0,1], scales [1,1,1]; wheel rear scaling is explicit below.',
        mounts={
          'frontWing':dict(node='MountFrontWing',translation=[0,.20,1.98],replace=['FrontWing'],assetNode='Mount'),
          'rearWing':dict(node='MountRearWing',translation=[0,.21,-1.78],replace=['RearWing'],assetNode='Mount'),
          'helmet':dict(node='MountHelmet',translation=[0,.695,-.235],replace=['Helmet'],assetNode='Mount'),
          'effect':dict(node='MountEffect',translation=[0,.27,-1.98],replace=[],assetNode='Mount'),
          'wheels':dict(assetNode='Mount',axle='+X',frontRadius=.34,rearRadius=.36,
            instances=[dict(node=n,translation=p,scale=s) for n,p,s in [
              ('WheelFrontL',[.85,.34,1.25],[1,1,1]),('WheelFrontR',[-.85,.34,1.25],[1,1,1]),
              ('WheelRearL',[.83,.36,-1.31],[.35/.29,.36/.34,.36/.34]),
              ('WheelRearR',[-.83,.36,-1.31],[.35/.29,.36/.34,.36/.34])]])}),
      paint=dict(bodyMaterial='Paint 1',stripeMaterial='Paint Stripes',independentLayers=True,
        stripeMask='assets/paints/stripes.svg',
        projectors=[dict(position=[0,.51,1.13],size=[.23,1.72,.8]),
                    dict(position=[.38,.53,-.52],size=[.075,1.1,.7]),
                    dict(position=[-.38,.53,-.52],size=[.075,1.1,.7])],
        orientation=[-math.pi/2,0,0]),
      decals=dict(target='Body',orientation=[-math.pi/2,0,0],position=[0,.56,.73],size=[.29,.40,.65],
        secondaryProjectors=[dict(position=[.39,.53,-.53],size=[.20,.32,.7]),dict(position=[-.39,.53,-.53],size=[.20,.32,.7])],
        depthBias=-4,transparent=True,replacePrevious=True),
      effects=dict(emitters=['EmitterL','EmitterR'],direction=[0,0,-1],maxParticles=40,reducedMotion='Static accessory, no particles'),
      preview=dict(file='preview.html',width=844,height=390,selfContained=True,networkRequests=0),
      economy=dict(mode='catalog-preview',currency=None,prices=None,description='No invented prices or connection to the live wallet.'))

    def item(id,label,category,index,**extra):
        data=dict(id=id,label=label,category=category,icon=f'icons/{category}/{id}.svg',
                  compatibility=['island-formula-4.6-v1'],cosmetic=True,**extra)
        manifest['items'].append(data)
        write(data['icon'],icon(category,index))

    for i,(key,label,span,sweep,rise,layers) in enumerate(FRONT):
        m=Mesh()
        m.foil(span,.40,-.035,-.10,sweep,rise,0, .055 if key=='split' else 0)
        for k in range(layers-1):
            m.foil(span-.08-k*.35,.21,.055+k*.064,-.29-k*.028,sweep*.5,rise*.5,1 if k%2==0 else 2)
        for sign in (-1,1):
            # Front tyre's foremost point is Z=1.59; every outboard surface starts beyond 1.60.
            zmin=min(-.10-sweep,-.29-sweep*.5 if layers>1 else -.10-sweep)
            m.box((sign*(span/2-.018),.072,zmin+.24),(.028,.23,.48),0)
            m.rod((sign*.075,.09,-.04),(sign*.075,-.028,.06),.015,1,8)
            if key in ('delta','arrow','wave'):
                m.box((sign*(span/2-.08),.105,.03),(.015,.12,.15),2)
        path=f'assets/front-wings/{key}.glb'
        write(path,glb('FrontWing',m,[PAINT,DARK,ACCENT],{'ConnectorL':[.075,.09,-.04],'ConnectorR':[-.075,.09,-.04]}))
        item('front-'+key,label,'front-wings',i,asset=path,slot='frontWing',style=key)

    for i,(key,label,span,rise,layers) in enumerate(REAR):
        m=Mesh()
        for k in range(layers):
            m.foil(span,.31 if k==0 else .15,.61+k*.105,-.51+k*.02,.015,rise,0 if k==0 else 1,
                   .05 if key=='split' else 0)
        for sign in (-1,1):
            top=.61+(layers-1)*.105+.07+rise
            m.box((sign*(span/2+.012),(.50+top)/2,-.32),(.026,top-.50,.44),0)
            if key=='swan':
                m.rod((sign*.19,0,0),(sign*.19,.81,-.26),.022,1,8)
                m.rod((sign*.19,.81,-.26),(sign*.19,.66,-.37),.022,1,8)
            else:
                m.rod((sign*.19,0,0),(sign*.19,.61,-.31),.022,1,8)
            if key in ('vortex','stepped'):
                m.box((sign*(span/2-.075),.59,-.32),(.012,.12,.19),2)
        if key=='box': m.foil(span,.18,.49,-.48,0,0,2)
        path=f'assets/rear-wings/{key}.glb'
        write(path,glb('RearWing',m,[PAINT,DARK,ACCENT],{'ConnectorL':[.19,0,0],'ConnectorR':[-.19,0,0]}))
        item('rear-'+key,label,'rear-wings',i,asset=path,slot='rearWing',style=key)

    for i,(key,label,spokes) in enumerate(WHEELS):
        m=Mesh()
        # Closed lathed tyre, no logos or sidewall lettering, exact .34m tread radius.
        m.ring_x([(-.145,.20),(-.145,.28),(-.132,.322),(-.11,.34),(.11,.34),(.132,.322),(.145,.28),(.145,.20)],0,40)
        for sign in (-1,1):
            x=sign*.147
            m.ring_x([(x-.007,.188),(x+.007,.188),(x+.007,.211),(x-.007,.211)],1,32)
            m.rod((x-sign*.025,0,0),(x-sign*.018,0,0),.18,3,24)
            m.rod((x-sign*.01,0,0),(x+sign*.02,0,0),.047,2,10)
            if spokes==0:
                m.rod((x,0,0),(x+sign*.007,0,0),.19,1,32)
                for j in range(8):
                    a=j*TAU/8
                    m.rod((x+sign*.009,.143*math.cos(a),.143*math.sin(a)),
                          (x+sign*.012,.143*math.cos(a),.143*math.sin(a)),.017,3,8)
            else:
                for j in range(spokes):
                    a=j*TAU/spokes
                    for delta in ([-.045,.045] if key in ('mesh','split') else [0]):
                        sweep=.28 if key=='turbine' else .12
                        m.rod((x,.048*math.cos(a+delta),.048*math.sin(a+delta)),
                              (x,.197*math.cos(a+delta+sweep),.197*math.sin(a+delta+sweep)),
                              .009 if key in ('mesh','split') else .016,1,4)
        if key=='rally':
            # Subtle raised chevrons, bounded by the same .34m tyre envelope.
            for j in range(24):
                a=j*TAU/24
                for sign in (-1,1):
                    m.rod((sign*.11,.333*math.cos(a),.333*math.sin(a)),
                          (0,.333*math.cos(a+.10),.333*math.sin(a+.10)),.006,0,4)
        path=f'assets/wheels/{key}.glb'
        write(path,glb('Wheel',m,[RUBBER,ALLOY,material('Center Lock','#d9ae52',.7,.24),DARK],{'Axle':[0,0,0]}))
        item('wheel-'+key,label,'wheels',i,asset=path,slot='wheels',style=key)

    for i,(key,label) in enumerate(HELMETS):
        m=Mesh(); bodyColor=COLORS[i][2]
        rx=.123 if key!='prism' else .127
        m.sphere((rx,.142,.137),0,20 if key=='prism' else 28,12)
        verts=[]
        for j in range(5):
            theta=1.07+j*.12
            for k in range(19):
                phi=.12+math.pi*k/18*.92
                verts.append(((rx+.003)*math.sin(theta)*math.cos(phi),.145*math.cos(theta),
                              .141*math.sin(theta)*math.sin(phi)))
        m.surface(verts,[(j*19+k,j*19+k+1,(j+1)*19+k+1,(j+1)*19+k) for j in range(4) for k in range(18)],1,True)
        # Visor rim and chin vent remain visible from the default three-quarter view.
        m.rod((-.044,-.068,.115),(.044,-.068,.115),.006,2,8)
        if key in ('aero','tail','comet'):
            m.box((0,.064,-.125),(.13,.023,.10 if key!='tail' else .14),2)
        if key in ('ridge','comet','prism'):
            m.box((0,.140,-.022),(.025,.012,.09),2)
        if key in ('vent','halo'):
            for sign in (-1,1):
                for z in (-.035,0,.035): m.box((sign*.067,.119,z),(.029,.008,.008),2)
        # Independent shell material, never accidentally recoloured with car paint.
        path=f'assets/helmets/{key}.glb'
        write(path,glb('Helmet',m,[material('Helmet Shell',bodyColor,.24,.23),VISOR,ACCENT],{'Neck':[0,-.13,0]}))
        item('helmet-'+key,label,'helmets',i,asset=path,slot='helmet',style=key)

    for i,(key,label,family) in enumerate(DECALS):
        path=f'assets/decals/{key}.svg'
        write(path,svg(decal_art(i),512,'#ffffff'))
        item('decal-'+key,label,'decals',i,asset=path,slot='decal',family=family,format='image/svg+xml')

    for i,(key,label,body,stripes) in enumerate(COLORS):
        item('paint-'+key,label,'paints',i,slot='paint',body=body,stripes=stripes,
             selectableLayers=['body','stripes'],metallic=.48,roughness=.25)
    write('assets/paints/stripes.svg',svg('<path d="M27 0h14v96H27zM55 0h14v96H55z"/>',256,'#ffffff'))

    for i,(key,label,kind,color,count) in enumerate(EFFECTS):
        m=Mesh()
        m.box((0,0,.045),(.66,.045,.05),1)
        for sign in (-1,1):
            x=sign*.26
            radius=.048 if kind=='flame' else .036 if kind=='sparks' else .057
            m.rod((x,0,.06),(x,0,-.12),radius,0,12)
            m.rod((x,0,-.121),(x,0,-.128),radius*.76,1,12)
            m.rod((x,0,-.13),(x,0,-.133),radius*.54,2,12)
            if kind=='smoke':m.box((x,.025,.018),(.10,.055,.08),0)
        path=f'assets/effects/{key}.glb'
        write(path,glb('EffectAccessory',m,[ALLOY,DARK,material('Effect Accent',color,.25,.33)],
                       {'EmitterL':[.26,0,-.145],'EmitterR':[-.26,0,-.145]}))
        item('effect-'+key,label,'effects',i,asset=path,slot='effect',kind=kind,color=color,
             particles=dict(count=count,lifetime=.48 if kind=='flame' else .72 if kind=='sparks' else 1.4,
                            speed=2.8 if kind=='sparks' else 1.5,size=.18 if kind=='smoke' else .055,
                            additive=kind!='smoke',seed=104729+i))

    for cat,_,_ in CATEGORIES:
        selected=next(x for x in manifest['items'] if x['category']==cat)
        write(f'icons/categories/{cat}.svg',(ROOT/selected['icon']).read_bytes())

    # Read-only reuse of the actual current player car, with additive mount empties.
    source=(ISLAND/'assets/racing-formula/formula.glb').read_bytes()
    length=struct.unpack_from('<I',source,12)[0]
    doc=json.loads(source[20:20+length])
    binary=source[28+length:]
    root=next(n for n in doc['nodes'] if n.get('name')=='Formula')
    for slot in ('frontWing','rearWing','helmet','effect'):
        mount=manifest['compatibility']['mounts'][slot]
        root['children'].append(len(doc['nodes']))
        doc['nodes'].append(dict(name=mount['node'],translation=mount['translation']))
    doc['asset']['copyright']='CC0-1.0; original Bakasun Formula, additive mount empties by racing-customize-v1'
    write('assets/base/formula-mounted.glb',encode_glb(doc,binary))

    # The asset inventory is checked independently by validate.mjs.
    for entry in manifest['items']:
        for key in ('asset','icon'):
            if key in entry:
                blob=(ROOT/entry[key]).read_bytes()
                entry[key+'Bytes']=len(blob)
                entry[key+'Sha256']=hashlib.sha256(blob).hexdigest()
    write('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('Built',len(manifest['items']),'items;',len(list(ROOT.rglob('*.glb'))),'GLBs')


if __name__=='__main__':
    build()
