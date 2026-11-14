#!/usr/bin/env python3
"""Build an original low-poly arena scoreboard, embedding one shared glyph atlas.

Rebuild with Python 3 and Pillow. No downloaded asset or font is embedded.
Seven-segment glyphs and labels are drawn here; Open Sans is used only to rasterize
the small labels (the output PNG contains no font program).
"""
import io
import json
import math
from pathlib import Path
import struct
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
for folder in ('models', 'textures'):
    (ROOT / folder).mkdir(exist_ok=True)

ATLAS_W, ATLAS_H, CELL_W, CELL_H = 1024, 512, 64, 128
atlas = Image.new('RGBA', (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
draw = ImageDraw.Draw(atlas)
segments = {
    'a': [(13, 12), (51, 12), (57, 18), (51, 24), (13, 24), (7, 18)],
    'g': [(13, 58), (51, 58), (57, 64), (51, 70), (13, 70), (7, 64)],
    'd': [(13, 104), (51, 104), (57, 110), (51, 116), (13, 116), (7, 110)],
    'f': [(6, 22), (12, 27), (12, 53), (6, 59), (1, 53), (1, 27)],
    'b': [(57, 22), (63, 27), (63, 53), (57, 59), (52, 53), (52, 27)],
    'e': [(6, 69), (12, 75), (12, 100), (6, 106), (1, 100), (1, 75)],
    'c': [(57, 69), (63, 75), (63, 100), (57, 106), (52, 100), (52, 75)],
}
lit = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgecd', 'abc', 'abcdefg', 'abfgcd']
for digit, active in enumerate(lit):
    for segment, poly in segments.items():
        if segment in active:
            draw.polygon([(x + digit * CELL_W, y) for x, y in poly], fill='white')
# Cell 10 is blank; cell 11 is a colon. Remaining cells are reserved.
for cy in (44, 85):
    draw.rounded_rectangle((11 * CELL_W + 18, cy - 8, 11 * CELL_W + 46, cy + 8), radius=4, fill='white')
font_path = Path('/usr/share/fonts/truetype/open-sans/OpenSans-Semibold.ttf')
if not font_path.exists():
    raise SystemExit('Open Sans Semibold is required to rasterize labels. See vendor/LICENSE.OpenSans for the source font notice.')
font = ImageFont.truetype(str(font_path), 38)
labels = {}
for row, label in enumerate(('ISLAND ARENA', 'HOME', 'AWAY', 'GAME', 'SHOT', 'PERIOD')):
    y = 128 + row * 64
    draw.text((512, y + 32), label, font=font, anchor='mm', fill='white')
    x0, y0, x1, y1 = draw.textbbox((512, y + 32), label, font=font, anchor='mm')
    labels[label] = [(x0-8) / ATLAS_W, (y0-5) / ATLAS_H, (x1+8) / ATLAS_W, (y1+5) / ATLAS_H]
png_io = io.BytesIO()
atlas.save(png_io, format='PNG', optimize=True)
png = png_io.getvalue()
(ROOT / 'textures/digits.png').write_bytes(png)

gltf = {'asset': {'version': '2.0', 'generator': 'Original hoops referee scoreboard v1 builder'},
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'name': 'SuspendedScoreboard', 'children': []}], 'meshes': [],
        'buffers': [{'byteLength': 0}], 'bufferViews': [], 'accessors': [],
        'samplers': [{'magFilter': 9729, 'minFilter': 9729, 'wrapS': 33071, 'wrapT': 33071}],
        'images': [], 'textures': [{'source': 0, 'sampler': 0}], 'materials': [],
        'extensionsUsed': ['KHR_materials_unlit']}
binary = bytearray()

def blob(data, target=None):
    while len(binary) % 4:
        binary.append(0)
    view = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)}
    if target is not None:
        view['target'] = target
    binary.extend(data)
    gltf['bufferViews'].append(view)
    return len(gltf['bufferViews']) - 1

def accessor(values, kind, size, target=34962, component=5126):
    flat = [v for entry in values for v in entry] if size > 1 else values
    fmt = 'f' if component == 5126 else 'H'
    view = blob(struct.pack('<' + fmt * len(flat), *flat), target)
    a = {'bufferView': view, 'componentType': component, 'count': len(values), 'type': kind}
    if kind == 'VEC3':
        a.update(min=[min(v[i] for v in values) for i in range(3)], max=[max(v[i] for v in values) for i in range(3)])
    gltf['accessors'].append(a)
    return len(gltf['accessors']) - 1

def material(name, color, metal=0, rough=.5, unlit=False, texture=False, emissive=None):
    m = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [*color, 1], 'metallicFactor': metal, 'roughnessFactor': rough}}
    if texture:
        m['pbrMetallicRoughness']['baseColorTexture'] = {'index': 0}
        m['alphaMode'] = 'BLEND'
    if unlit:
        m['extensions'] = {'KHR_materials_unlit': {}}
    if emissive:
        m['emissiveFactor'] = emissive
    gltf['materials'].append(m)
    return len(gltf['materials']) - 1

housing = material('powdercoat_charcoal', [.024, .036, .052], .65, .34)
rim = material('brushed_warm_aluminium', [.28, .18, .065], .82, .28)
panel = material('display_black', [.003, .006, .009], 0, .9)
cable = material('suspension_steel', [.12, .15, .18], .85, .35)
gold = material('digits_amber', [1, .64, .16], unlit=True, texture=True)
red = material('digits_red', [1, .12, .055], unlit=True, texture=True)
white = material('labels_cool_white', [.72, .8, .86], unlit=True, texture=True)
lamp = material('red_lamp', [.12, .002, .001], rough=.2, emissive=[.08, 0, 0])

def primitive(pos, norm, index, mat, uv=None):
    attrs = {'POSITION': accessor(pos, 'VEC3', 3), 'NORMAL': accessor(norm, 'VEC3', 3)}
    if uv:
        attrs['TEXCOORD_0'] = accessor(uv, 'VEC2', 2)
    return {'attributes': attrs, 'indices': accessor(index, 'SCALAR', 1, 34963, 5123), 'material': mat}

def add_node(name, prim, translation=None, rotation=None, parent=0, extras=None):
    gltf['meshes'].append({'name': name, 'primitives': [prim]})
    n = {'name': name, 'mesh': len(gltf['meshes']) - 1}
    if translation:
        n['translation'] = translation
    if rotation:
        n['rotation'] = rotation
    if extras:
        n['extras'] = extras
    gltf['nodes'].append(n)
    gltf['nodes'][parent].setdefault('children', []).append(len(gltf['nodes']) - 1)
    return len(gltf['nodes']) - 1

def cube(name, center, dimensions, mat):
    x, y, z = [v / 2 for v in dimensions]
    pos, norms, idx = [], [], []
    faces = [([[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]],[0,0,1]),
             ([[x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z]],[0,0,-1]),
             ([[x,-y,z],[x,-y,-z],[x,y,-z],[x,y,z]],[1,0,0]),
             ([[-x,-y,-z],[-x,-y,z],[-x,y,z],[-x,y,-z]],[-1,0,0]),
             ([[-x,y,z],[x,y,z],[x,y,-z],[-x,y,-z]],[0,1,0]),
             ([[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z]],[0,-1,0])]
    for verts, norm in faces:
        start = len(pos)
        pos.extend(verts)
        norms.extend([norm] * 4)
        idx.extend([start, start+1, start+2, start, start+2, start+3])
    return add_node(name, primitive(pos, norms, idx, mat), center)

def quad(name, center, width, height, mat, uv_rect=(0, 0, 1, 1), yaw=0, extras=None):
    u0, v0, u1, v1 = uv_rect
    positions = [[-width/2,-height/2,0],[width/2,-height/2,0],[width/2,height/2,0],[-width/2,height/2,0]]
    uv = [[u0,v1],[u1,v1],[u1,v0],[u0,v0]]
    return add_node(name, primitive(positions, [[0,0,1]]*4, [0,1,2,0,2,3], mat, uv), center, [0,math.sin(yaw/2),0,math.cos(yaw/2)], extras=extras)

cube('Housing', [0,1.15,0], [3.6,2.18,3.6], housing)
for y in (.13, 2.17):
    cube('MetalRimTop' if y>1 else 'MetalRimBottom', [0,y,0], [3.72,.13,3.72], rim)
for x in (-1.76, 1.76):
    for z in (-1.76, 1.76):
        cube('CornerPost', [x,1.15,z], [.08,2.12,.08], rim)
        cube('SuspensionCable', [x*.72,3.22,z*.72], [.026,1.96,.026], cable)
cube('SuspensionYoke', [0,4.15,0], [2.85,.1,2.85], cable)

initial = {'home0':0,'home1':7,'home2':2,'away0':0,'away1':6,'away2':8,
           'game0':0,'game1':2,'game2':1,'game3':4,'shot0':2,'shot1':4,'period0':4}
face_names = ('front', 'right', 'back', 'left')
digits = []
lamps = []

for side, face in enumerate(face_names):
    yaw = side * math.pi/2
    def world(x,y,z=1.817):
        return [x*math.cos(yaw)+z*math.sin(yaw),y,-x*math.sin(yaw)+z*math.cos(yaw)]
    quad('Screen_'+face, world(0,1.15), 3.43,1.91, panel, yaw=yaw)
    def label(text,x,y,w,h):
        quad('label_'+face+'_'+text.replace(' ','_'), world(x,y,1.819), w,h,white,labels[text],yaw)
    label('ISLAND ARENA',0,2.0,2.5,.24)
    label('HOME',-.93,1.72,1.0,.20)
    label('AWAY',.93,1.72,1.0,.20)
    label('GAME',0,.98,.80,.16)
    label('PERIOD',-1.25,.84,.80,.15)
    label('SHOT',1.25,.84,.80,.15)
    layout = []
    for prefix, xs in [('home',[-1.24,-.93,-.62]),('away',[.62,.93,1.24])]:
        for i,x in enumerate(xs):
            layout.append((prefix+str(i), x,1.30,.265,.56,gold))
    for i,x in enumerate([-.64,-.25,.25,.64]):
        layout.append(('game'+str(i),x,.58,.31,.59,gold))
    for i,x in enumerate([1.09,1.39]):
        layout.append(('shot'+str(i),x,.47,.24,.43,red))
    layout.append(('period0',-1.25,.47,.24,.43,gold))
    for field,x,y,w,h,mat in layout:
        value = initial[field]
        name='digit_'+face+'_'+field
        quad(name,world(x,y,1.824),w,h,mat,(value/16,0,(value+1)/16,.25),yaw,{'scoreboardDigit': field, 'face':face,'initialDigit':value})
        digits.append({'name':name,'field':field,'initialDigit':value})
    quad('colon_'+face, world(0,.58,1.824),.15,.59,gold,(11/16,0,12/16,.25),yaw)
    # Four continuous red bars surround each face; no postprocessing required.
    for suffix,x,y,w,h in [('top',0,2.102,3.37,.034),('bottom',0,.196,3.37,.034),
                           ('left',-1.69,1.15,.034,1.94),('right',1.69,1.15,.034,1.94)]:
        name='lamp_'+face+'_'+suffix
        quad(name,world(x,y,1.826),w,h,lamp,yaw=yaw,extras={'scoreboardLamp':True})
        lamps.append(name)

image_view=blob(png)
gltf['images']=[{'bufferView':image_view,'mimeType':'image/png','name':'shared_digit_and_label_atlas'}]
gltf['buffers'][0]['byteLength']=len(binary)
raw_json=json.dumps(gltf,separators=(',',':')).encode()
raw_json+=b' '*((-len(raw_json))%4)
binary+=b'\0'*((-len(binary))%4)
glb=struct.pack('<4sII',b'glTF',2,12+8+len(raw_json)+8+len(binary))+struct.pack('<II',len(raw_json),0x4E4F534A)+raw_json+struct.pack('<II',len(binary),0x004E4942)+binary
(ROOT/'models/scoreboard.glb').write_bytes(glb)
triangles=sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
metadata={'schemaVersion':1,'asset':'models/scoreboard.glb','generator':'source/build-scoreboard.py',
    'units':'meters','axes':{'up':'+Y','front':'+Z'},'housingBounds':{'min':[-1.86,.065,-1.86],'max':[1.86,2.25,1.86]},
    'completeBounds':{'min':[-1.86,.065,-1.86],'max':[1.86,4.2,1.86]},
    'placement':'Set root position to court centre at desired floor clearance; lowest point is local y0.065.',
    'triangles':triangles,'bytes':len(glb),'faces':4,'digitQuadsPerFace':13,'digitTriangles':len(digits)*2,
    'textureCount':1,'atlas':{'file':'textures/digits.png','embedded':True,'width':1024,'height':512,'columns':16,'digitRowV':[0,.25],
        'cells':{**{str(i):i for i in range(10)},'blank':10,'colon':11},'labelsBaked':list(labels)},
    'digitNodes':digits,'lampNodes':lamps,'initial':{'home':72,'away':68,'gameSeconds':134,'shotSeconds':24,'period':4,'running':False},
    'api':'runtime/scoreboard.mjs: createClock(initial,onEvent), createScoreboard({THREE,root,initial,onEvent})',
    'provenance':{'geometry':'Original authored primitive meshes; no third-party model','glyphs':'Original seven-segment polygon atlas','labels':'Open Sans Semibold rasterized from the installed Debian fonts-open-sans package; Apache-2.0, Google Corporation 2010-2011. No font binary embedded; see vendor/LICENSE.OpenSans and vendor/LICENSE.Apache-2.0.'}}
(ROOT/'scoreboard-metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps({'triangles':triangles,'bytes':len(glb),'digitQuads':len(digits),'textures':1}))
