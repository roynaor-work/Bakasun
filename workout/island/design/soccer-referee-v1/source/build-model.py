#!/usr/bin/env python3
"""CC0-1.0. Rebuild economical referees from the existing CC0 MakeHuman asset.

Run from any directory with Blender 4.3+:
blender -b --factory-startup --python <this file>

The existing soccer-v6 source is read without modifying its files. Blender only
decimates geometry. A small glTF writer below preserves the exact motion2 bind
translations, identity local rotations, named joints, and inverse bind matrices.
No Draco, meshopt or other glTF extension is required by the delivered models.
"""
from pathlib import Path
import importlib.util
import io
import json
import math
import struct
import hashlib
import sys
import bpy
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
DESIGN = OUT.parent
SOURCE = DESIGN / 'soccer-v6/characters/source/build-characters.py'
spec = importlib.util.spec_from_file_location('cc0_soccer_v6_source', SOURCE)
source = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
spec.loader.exec_module(source)
CONTRACT = json.loads((DESIGN/'motion2/soccer.json').read_text())['skeleton']
NAMES = [b['name'] for b in CONTRACT['bones']]
LOCAL = np.array([b['restTranslationMeters'] for b in CONTRACT['bones']], float)
PARENTS = [NAMES.index(b['parent']) if b['parent'] else None for b in CONTRACT['bones']]
WORLD = LOCAL.copy()
for i, parent in enumerate(PARENTS):
    if parent is not None:
        WORLD[i] += WORLD[parent]
assert source.NAMES == NAMES and np.max(np.abs(source.WORLD-WORLD)) < 1e-12


def anatomy():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    person = next(p for p in source.PEOPLE if p['id'] == 'referee')
    body, src, joints = source.body_parts(person)
    extras = source.extras(person, src, joints)
    kept = []
    budgets = {'face': 600, 'body': 180}
    for obj in body:
        kind = obj.name.rsplit('-', 1)[-1]
        # The old independently cut garments develop gaps at this budget.
        # Fit continuous closed sportswear over the reused anatomical surfaces.
        if kind == 'cloth':
            continue
        source.simplify(obj, budgets[kind])
        kept.append(obj)
    extra_budget = {'crew-neck-binding': 16, 'sock-cuff': 12,
                    'boot-upper': 48, 'boot-sole': 16,
                    'eye-l': 20, 'eye-r': 20,
                    'eyebrow-l': 8, 'eyebrow-r': 8, 'hair-source-cards': 60}
    for obj in extras:
        name = obj.name.split('.')[0]
        if name in extra_budget:
            source.simplify(obj, extra_budget[name])
            kept.append(obj)
    result = source.collect(kept)
    # A collapse can move the boot's lowest corners below its authored sole.
    # Correct only the shoe surface, leaving skeleton and all bind axes exact.
    shoe = np.max(result['WEIGHTS_0'] * np.isin(result['JOINTS_0'], [14,17]),axis=1) > .99
    result['POSITION'][shoe,1] = np.maximum(result['POSITION'][shoe,1], .002)
    # Shirt has its own named material, enabling yellow/black without an atlas
    # mutation. Its original cloth surface and skinning remain in the mesh.
    triangles = result.pop('indices').reshape((-1, 3))
    uv = result['TEXCOORD_0']
    # Source anatomy contains extra skin patches behind the old garment seams.
    # Hide those patches under the new continuous sportswear rather than
    # allowing their decimated edge triangles to protrude through the cloth.
    keep=[]
    for triangle in triangles:
        p=result['POSITION'][triangle].mean(axis=0)
        skin=all(uv[i,0]<.5 and uv[i,1]>.5 for i in triangle)
        leg=np.mean(np.sum(result['WEIGHTS_0'][triangle]*np.isin(result['JOINTS_0'][triangle],[12,13,15,16]),axis=1))>.7
        covered_shoulder=1.11<p[1]<1.425 and (abs(p[0])>.060 or p[1]<1.398)
        covered_leg=leg
        keep.append(not(skin and (covered_shoulder or covered_leg)))
    triangles=triangles[np.array(keep,bool)]
    shirt = np.array([all(uv[i, 0] > .50 and uv[i, 1] < .50 for i in t)
                      for t in triangles], bool)
    return result, [triangles[~shirt].flatten(), triangles[shirt].flatten()]


def atlas(skin_variant=0):
    path = DESIGN/'soccer-v6/characters/textures/referee-referee-basecolor.png'
    im = Image.open(path).convert('RGBA').resize((512, 512), Image.Resampling.LANCZOS)
    if skin_variant:
        arr = np.array(im)
        # Only the atlas's skin tile changes; hair, boots and clothing remain.
        color = arr[264:505, 8:249, :3].astype(float)
        arr[264:505, 8:249, :3] = np.clip(color*np.array([.69, .63, .61]), 0, 255)
        im = Image.fromarray(arr)
    b = io.BytesIO()
    im.save(b, format='PNG', optimize=True)
    return b.getvalue()


def box(center, size):
    c = np.array(center)
    s = np.array(size)/2
    pos, normals, idx = [], [], []
    # Independent face vertices produce a clean rigid prop silhouette.
    for normal, corners in [
        ([0,0,1], [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]),
        ([0,0,-1], [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]),
        ([1,0,0], [[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]),
        ([-1,0,0], [[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]),
        ([0,1,0], [[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]),
        ([0,-1,0], [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]])]:
        base = len(pos)
        pos.extend((c+np.array(corners)*s).tolist())
        normals.extend([normal]*4)
        idx.extend([base,base+1,base+2,base,base+2,base+3])
    return {'POSITION': np.array(pos,np.float32), 'NORMAL': np.array(normals,np.float32)}, np.array(idx,np.uint16)


def join_parts(parts):
    attrs = {key:[] for key in parts[0][0]}
    indices = []
    for a, ix in parts:
        offset = len(attrs['POSITION'])
        for k in attrs:
            attrs[k].extend(a[k].tolist())
        indices.extend((ix+offset).tolist())
    return {k: np.array(v,np.uint16 if k=='JOINTS_0' else np.float32) for k,v in attrs.items()}, np.array(indices,np.uint16)


def tube(a, b, radius, segments=6):
    a, b = np.array(a), np.array(b)
    axis = b-a
    axis = axis/np.linalg.norm(axis)
    tangent = np.cross(axis,[0,0,1])
    if np.linalg.norm(tangent)<1e-6:
        tangent = np.cross(axis,[0,1,0])
    tangent /= np.linalg.norm(tangent)
    bitangent = np.cross(axis,tangent)
    vertices, normals, ix = [], [], []
    for p in [a,b]:
        for i in range(segments):
            n = tangent*math.cos(i*2*math.pi/segments)+bitangent*math.sin(i*2*math.pi/segments)
            vertices.append(p+radius*n)
            normals.append(n)
    for i in range(segments):
        j=(i+1)%segments
        ix.extend([i,j,segments+j,i,segments+j,segments+i])
    for i in range(1,segments-1):
        ix.extend([0,i+1,i,segments,segments+i,segments+i+1])
    return {'POSITION': np.array(vertices,np.float32),'NORMAL': np.array(normals,np.float32)}, np.array(ix,np.uint16)


def skinned_rings(rings, segments=8, cap=False):
    """Closed or open elliptical garment; rings run from top to bottom.

    Each ring is (centerXYZ, radiusX, radiusZ, {jointIndex:weight}).
    """
    p,n,j,w,ix=[],[],[],[],[]
    for center,rx,rz,weights in rings:
        for k in range(segments):
            a=2*math.pi*k/segments
            p.append([center[0]+rx*math.cos(a),center[1],center[2]+rz*math.sin(a)])
            normal=np.array([math.cos(a)/rx,0,math.sin(a)/rz]);normal/=np.linalg.norm(normal)
            n.append(normal)
            pairs=list(weights.items())
            j.append([i for i,v in pairs]+[0]*(4-len(pairs)))
            w.append([v for i,v in pairs]+[0]*(4-len(pairs)))
    for row in range(len(rings)-1):
        for k in range(segments):
            a=row*segments+k;b=row*segments+(k+1)%segments
            ix.extend([a,b,b+segments,a,b+segments,a+segments])
    if cap:
        for k in range(1,segments-1):
            ix.extend([0,k+1,k])
            b=(len(rings)-1)*segments
            ix.extend([b,b+k,b+k+1])
    return {'POSITION':np.array(p,np.float32),'NORMAL':np.array(n,np.float32),
            'JOINTS_0':np.array(j,np.uint16),'WEIGHTS_0':np.array(w,np.float32)},np.array(ix,np.uint16)


def sportswear():
    shirt=[skinned_rings([([0,1.432,0],.055,.047,{3:.65,4:.35}),
                          ([0,1.402,0],.173,.092,{3:1}),
                          ([0,1.180,0],.163,.102,{2:.30,3:.70}),
                          ([0,.865,0],.145,.091,{1:.40,2:.60})])]
    black=[]
    exposed=[]
    for side,sign,arm,leg in [('Left',1,6,12),('Right',-1,9,15)]:
        shirt.append(skinned_rings([([sign*.166,1.402,0],.068,.071,{3:.35,arm:.65}),
                                    ([sign*.166,1.115,0],.054,.059,{arm:1})],6,True))
        black.append(skinned_rings([([sign*.100,.857,0],.083,.101,{1:.75,leg:.25}),
                                    ([sign*.100,.613,0],.071,.078,{leg:1})],6,True))
        black.append(skinned_rings([([sign*.100,.475,0],.042,.046,{leg+1:1}),
                                    ([sign*.100,.101,0],.035,.039,{leg+1:.20,leg+2:.80})],6,True))
        # Keep an unbroken exposed knee/thigh silhouette between the new
        # shorts and socks; the source's coarsely cut seam patch is hidden.
        exposed.append(skinned_rings([([sign*.100,.635,0],.059,.068,{leg:1}),
                                      ([sign*.100,.459,0],.043,.048,{leg:.65,leg+1:.35})],6,True))
    black.append(skinned_rings([([0,.874,0],.148,.093,{1:1}),
                                ([0,.790,0],.165,.095,{1:1})]))
    return shirt,black,exposed


class GLB:
    def __init__(self, role):
        self.bin = bytearray()
        self.j = {'asset': {'version':'2.0','generator':'soccer-referee-v1 CC0 v6 anatomy reduction',
                           'copyright':'CC0-1.0; fictional referee derived from MakeHuman hm08. See LICENSES.md.'},
                  'scene':0,'scenes':[{'nodes': [0,18]}], 'nodes':[], 'meshes':[],
                  'skins':[], 'materials':[], 'bufferViews':[], 'accessors':[], 'buffers':[{'byteLength':0}],
                  'extras':{'license':'CC0-1.0','role':role,'units':'meters','axes':CONTRACT['axes'],
                            'canonicalSkeleton':'motion2/soccer.json','sourceGeometry':'soccer-v6/characters/source/build-characters.py'}}
        for i,name in enumerate(NAMES):
            node={'name':name,'translation':LOCAL[i].tolist(),'rotation':[0,0,0,1],'scale':[1,1,1]}
            children=[k for k,p in enumerate(PARENTS) if p==i]
            if children:node['children']=children
            self.j['nodes'].append(node)

    def view(self, data, target=None):
        self.bin.extend(bytes((-len(self.bin))%4))
        index=len(self.j['bufferViews'])
        view={'buffer':0,'byteOffset':len(self.bin),'byteLength':len(data)}
        if target:view['target']=target
        self.j['bufferViews'].append(view)
        self.bin.extend(data)
        return index

    def accessor(self, arr, type=None, target=None):
        arr=np.ascontiguousarray(arr)
        types={np.dtype('float32'):5126,np.dtype('uint16'):5123,np.dtype('uint32'):5125}
        result={'bufferView':self.view(arr.tobytes(),target),'componentType':types[arr.dtype],
                'count':len(arr),'type':type or ('SCALAR' if arr.ndim==1 else 'VEC'+str(arr.shape[1]))}
        if result['type']=='VEC3':
            result.update(min=arr.min(axis=0).tolist(),max=arr.max(axis=0).tolist())
        self.j['accessors'].append(result)
        return len(self.j['accessors'])-1

    def material(self,name,color=None,texture=False,metallic=0):
        pbr={'metallicFactor':metallic,'roughnessFactor':.84}
        if color:pbr['baseColorFactor']=color
        if texture:pbr['baseColorTexture']={'index':0}
        m={'name':name,'pbrMetallicRoughness':pbr,'doubleSided':True}
        if texture:m.update(alphaMode='MASK',alphaCutoff=.35)
        self.j['materials'].append(m)
        return len(self.j['materials'])-1

    def mesh(self,name,primitives):
        index=len(self.j['meshes'])
        self.j['meshes'].append({'name':name,'primitives':primitives})
        return index

    def primitive(self,attrs,ix,mat):
        return {'attributes':{k:self.accessor(v,target=34962) for k,v in attrs.items()},
                'indices':self.accessor(ix.astype(np.uint16),target=34963),'material':mat,'mode':4}

    def prop(self,name,attrs,ix,mat,parent,translation=(0,0,0),hidden=False,extras=None,rotation=(0,0,0,1)):
        mesh=self.mesh(name,[self.primitive(attrs,ix,mat)])
        index=len(self.j['nodes'])
        node={'name':name,'mesh':mesh,'translation':list(translation),'rotation':list(rotation),
              'scale':[0,0,0] if hidden else [1,1,1],
              'extras':{'visibleScale':[1,1,1],'socket':parent,**(extras or {})}}
        self.j['nodes'].append(node)
        self.j['nodes'][NAMES.index(parent)].setdefault('children',[]).append(index)

    def save(self,path):
        self.j['buffers'][0]['byteLength']=len(self.bin)
        j=json.dumps(self.j,separators=(',',':')).encode()
        j+=b' '*((-len(j))%4)
        self.bin.extend(bytes((-len(self.bin))%4))
        length=28+len(j)+len(self.bin)
        path.write_bytes(struct.pack('<III',0x46546c67,2,length)+struct.pack('<II',len(j),0x4e4f534a)+j+
                         struct.pack('<II',len(self.bin),0x004e4942)+self.bin)
        triangles=sum(self.j['accessors'][p['indices']]['count']//3 for m in self.j['meshes'] for p in m['primitives'])
        print(json.dumps({'file':str(path.relative_to(OUT)),'bytes':length,'triangles':triangles,
                          'bodyTriangles':sum(self.j['accessors'][p['indices']]['count']//3 for p in self.j['meshes'][0]['primitives']),
                          'joints':18,'heightMeters':float(ANATOMY['POSITION'][:,1].max())}))


def build(name,assistant=False,dark=False):
    glb=GLB('assistant' if assistant else 'referee')
    j=glb.j
    image=glb.view(atlas(int(dark)))
    j['images']=[{'name':'Existing CC0 referee atlas reduced to 512','bufferView':image,'mimeType':'image/png'}]
    j['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}]
    j['textures']=[{'source':0,'sampler':0}]
    skin=glb.material('anatomy-atlas',texture=True)
    shirt=glb.material('shirt',[1,.75,.035,1])
    black=glb.material('black-trim',[.012,.018,.024,1])
    yellow=glb.material('yellow-card',[1,.79,.015,1])
    red=glb.material('red-card',[.90,.018,.025,1])
    silver=glb.material('whistle',[.24,.28,.30,1],metallic=.75)
    orange=glb.material('flag-orange',[1,.28,.025,1])
    neon=glb.material('flag-yellow',[1,.87,.035,1])
    exposed_skin=glb.material('skin-solid',[.515,.263,.158,1])
    shirt_parts,black_parts,exposed_parts=sportswear()
    shirt_parts.insert(0,({k:v for k,v in ANATOMY.items() if k!='TEXCOORD_0'},INDICES[1]))
    # Pocket, collar placket and sleeve piping make the referee shirt readable.
    trim=join_parts([box([.077,1.245,.101],[.057,.051,.003]),
                     box([0,1.335,.101],[.019,.096,.003])])
    trim_attrs,trim_ix=trim
    trim_attrs['JOINTS_0']=np.tile(np.array([3,0,0,0],np.uint16),(len(trim_attrs['POSITION']),1))
    trim_attrs['WEIGHTS_0']=np.tile(np.array([1,0,0,0],np.float32),(len(trim_attrs['POSITION']),1))
    black_parts.append((trim_attrs,trim_ix))
    shirt_attrs,shirt_ix=join_parts(shirt_parts)
    black_attrs,black_ix=join_parts(black_parts)
    primitives=[glb.primitive(ANATOMY,INDICES[0],skin),
                glb.primitive(shirt_attrs,shirt_ix,shirt),
                glb.primitive(black_attrs,black_ix,black)]
    exposed_attrs,exposed_ix=join_parts(exposed_parts)
    primitives.append(glb.primitive(exposed_attrs,exposed_ix,exposed_skin))
    body=glb.mesh('RefereeBody',primitives)
    j['nodes'].append({'name':'RefereeBody','mesh':body,'skin':0})
    matrices=[]
    for p in WORLD:
        mat=np.eye(4,dtype=np.float32);mat[:3,3]=-p
        matrices.append(mat.T.flatten())
    j['skins']=[{'name':'canonical-18-identity-bind','joints':list(range(18)),'skeleton':0,
                 'inverseBindMatrices':glb.accessor(np.array(matrices,np.float32),'MAT4')}]
    if not assistant:
        attrs,ix=box([0,.040,.012],[.078,.112,.0035])
        glb.prop('YellowCard',attrs,ix,yellow,'RightHand',translation=[0,-.025,.035],hidden=True,
                 extras={'dimensionsMeters':[.078,.112,.0035],'purpose':'yellow_card only; mutually exclusive with RedCard'},rotation=[0,0,1,0])
        glb.prop('RedCard',attrs,ix,red,'RightHand',translation=[0,-.025,.035],hidden=True,
                 extras={'dimensionsMeters':[.078,.112,.0035],'purpose':'red_card only; mutually exclusive with YellowCard'},rotation=[0,0,1,0])
        attrs,ix=join_parts([box([0,0,.006],[.027,.023,.025]),box([0,0,-.015],[.013,.010,.023]),
                            tube([-.014,0,.006],[.014,0,.006],.013,6)])
        glb.prop('Whistle',attrs,ix,silver,'RightHand',translation=[0,-.040,.032],hidden=True,
                 extras={'purpose':'visible during whistle gesture','mouthEndLocal':[0,0,-.026]})
    else:
        attrs,ix=tube([0,0,0],[0,-.50,0],.007,6)
        # Both pole and two-sided fabric live below one independently animated
        # Flag node. Its origin is the hand grip; the rest pole points down -Y.
        flag_primitives=[glb.primitive(attrs,ix,black)]
        for row in range(2):
            for col in range(2):
                x0=col*.105;x1=(col+1)*.105;y0=-.255-row*.105;y1=-.255-(row+1)*.105
                a={'POSITION':np.array([[x0,y0,0],[x1,y0,0],[x1,y1,0],[x0,y1,0]],np.float32),
                   'NORMAL':np.tile(np.array([0,0,1],np.float32),(4,1))}
                flag_primitives.append(glb.primitive(a,np.array([0,2,1,0,3,2],np.uint16),orange if (row+col)%2 else neon))
        mesh=glb.mesh('AssistantFlag',flag_primitives)
        node=len(j['nodes'])
        j['nodes'].append({'name':'Flag','mesh':mesh,'translation':[0,-.045,.025],
                           'rotation':[0,0,0,1],'scale':[1,1,1],
                           'extras':{'socket':'RightHand','visibleScale':[1,1,1],
                                     'poleDirectionLocal':[0,-1,0],'poleLengthMeters':.50,
                                     'flagSizeMeters':[.21,.21],'gripLocal':[0,0,0]}})
        j['nodes'][11].setdefault('children',[]).append(node)
    glb.save(OUT/'source/base'/name)


ANATOMY,INDICES=anatomy()
(OUT/'source/base').mkdir(exist_ok=True)
build('referee.glb')
build('assistant-left.glb',assistant=True)
build('assistant-right.glb',assistant=True,dark=True)
