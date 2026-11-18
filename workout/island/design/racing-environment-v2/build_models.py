#!/usr/bin/env python3
"""Original CC0 racing venue geometry; deterministic, standard glTF 2.0 GLBs.

Run with Python 3 + Pillow after build_textures.py. Geometry uses metres, Y up,
front +Z. Each material part is one primitive. Each untextured polygon receives
its own padded UV chart; textured panels use unique strips of the crowd atlas.
No downloaded meshes, typefaces, brands, compression codecs, or WebAssembly.
"""
from __future__ import annotations
import io
import json
import math
import struct
import sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
RUNTIME = HERE / 'runtime'
sys.dont_write_bytecode = True
TAU = math.tau


def add(a, b): return tuple(x+y for x, y in zip(a, b))
def sub(a, b): return tuple(x-y for x, y in zip(a, b))
def mul(a, k): return tuple(x*k for x in a)
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def norm(a):
    length = math.sqrt(sum(x*x for x in a))
    if length < 1e-12: raise ValueError('Degenerate face/direction')
    return mul(a, 1/length)


class Part:
    def __init__(self, name, material):
        self.name, self.material, self.faces = name, material, []

    def polygon(self, vertices, uvs=None):
        vertices = [tuple(float(v) for v in p) for p in vertices]
        normal = norm(cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0])))
        self.faces.append((vertices, normal, uvs))

    def quad(self, a, b, c, d): self.polygon([a, b, c, d])

    def box(self, center, size):
        x,y,z=center; a,b,c=(s/2 for s in size)
        v=[(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
           (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        for f in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2)]:
            self.polygon([v[i] for i in f])

    def beam(self, start, end, width):
        direction=norm(sub(end,start)); reference=(0,1,0) if abs(direction[1])<.9 else (1,0,0)
        u=mul(norm(cross(direction,reference)),width/2); v=mul(norm(cross(direction,u)),width/2)
        rings=[]
        for p in [start,end]:
            rings.append([add(add(p,mul(u,a)),mul(v,b)) for a,b in [(-1,-1),(1,-1),(1,1),(-1,1)]])
        self.polygon(rings[0][::-1]); self.polygon(rings[1])
        for i in range(4): self.quad(rings[0][i],rings[0][(i+1)%4],rings[1][(i+1)%4],rings[1][i])

    def cylinder(self, center, radius, depth, segments=12, axis='y'):
        def p(x,y,z):
            q=(x,y,z) if axis=='y' else ((x,-z,y) if axis=='z' else (y,-x,z))
            return add(center,q)
        rings=[[p(radius*math.cos(TAU*i/segments),y,radius*math.sin(TAU*i/segments)) for i in range(segments)] for y in [-depth/2,depth/2]]
        for i in range(segments):
            j=(i+1)%segments
            self.quad(rings[0][i],rings[1][i],rings[1][j],rings[0][j])
            self.polygon([p(0,depth/2,0),rings[1][j],rings[1][i]])
            self.polygon([p(0,-depth/2,0),rings[0][i],rings[0][j]])

    def torus(self, center, major, minor, segments=12, cross_segments=5):
        def p(i,j):
            theta,phi=TAU*i/segments,TAU*j/cross_segments
            return add(center,((major+minor*math.cos(phi))*math.cos(theta),minor*math.sin(phi),(major+minor*math.cos(phi))*math.sin(theta)))
        for i in range(segments):
            for j in range(cross_segments): self.quad(p(i,j),p(i,j+1),p(i+1,j+1),p(i+1,j))

    def arrays(self):
        positions=[]; normals=[]; uvs=[]; indices=[]
        n=math.ceil(math.sqrt(len(self.faces))); margin=.08
        for k,(vertices,normal,custom_uv) in enumerate(self.faces):
            cell_x,cell_y=k%n,k//n
            corners=[(0,0),(1,0),(1,1),(0,1)] if len(vertices)==4 else [(0,0),(1,0),(0,1)]
            chart=[((cell_x+margin+u*(1-2*margin))/n,(cell_y+margin+v*(1-2*margin))/n) for u,v in corners]
            chart=custom_uv or chart
            offset=len(positions)
            positions.extend(vertices); normals.extend([normal]*len(vertices)); uvs.extend(chart)
            for i in range(1,len(vertices)-1): indices.extend([offset,offset+i,offset+i+1])
        return positions,normals,uvs,indices


class Model:
    def __init__(self, root_name):
        self.root_name=root_name; self.parts={}; self.materials={}; self.images=[]
        self.add_material('Concrete',(.52,.56,.55),roughness=.95)
        self.add_material('Cream',(.79,.78,.68),roughness=.82)
        self.add_material('Steel',(.45,.54,.58),metallic=.55,roughness=.42)
        self.add_material('DarkSteel',(.095,.16,.19),metallic=.45,roughness=.48)
        self.add_material('Glass',(.055,.25,.31),metallic=.48,roughness=.22)
        self.add_material('Orange',(.94,.29,.075),roughness=.65)
        self.add_material('White',(.88,.90,.86),roughness=.7)
        self.add_material('Roof',(.12,.26,.29),metallic=.25,roughness=.55)
        self.add_material('Black',(.038,.047,.05),roughness=.98)
        self.add_material('Red',(.61,.052,.035),roughness=.75)

    def add_material(self,name,color,metallic=0,roughness=.8,emissive=None,texture=None,double_sided=False):
        data={'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*color,1.0],'metallicFactor':metallic,'roughnessFactor':roughness}}
        if emissive: data['emissiveFactor']=list(emissive)
        if texture is not None: data['pbrMetallicRoughness']['baseColorTexture']={'index':texture}
        if double_sided: data['doubleSided']=True
        self.materials[name]=data

    def texture(self,path):
        image=Image.open(path).convert('RGB'); output=io.BytesIO(); image.save(output,format='PNG',optimize=True)
        self.images.append((path.name,output.getvalue()))
        return len(self.images)-1

    def part(self,name,material):
        if name not in self.parts: self.parts[name]=Part(name,material)
        assert self.parts[name].material==material
        return self.parts[name]

    def textured_quad(self,name,material,corners,uvs): self.part(name,material).polygon(corners,uvs)

    def write(self,filename):
        binary=bytearray(); views=[]; accessors=[]; meshes=[]; nodes=[]; all_positions=[]; triangles=0
        material_names=[name for name in self.materials if any(part.material==name for part in self.parts.values())]
        materials=[self.materials[name] for name in material_names]
        def view(data,target=None):
            while len(binary)%4: binary.append(0)
            index=len(views); item={'buffer':0,'byteOffset':len(binary),'byteLength':len(data)}
            if target: item['target']=target
            views.append(item); binary.extend(data); return index
        def accessor(values,kind,component=5126):
            size={'SCALAR':1,'VEC2':2,'VEC3':3}[kind]
            flat=[x for v in values for x in v] if size>1 else values
            fmt='f' if component==5126 else 'H'
            data=struct.pack('<'+fmt*len(flat),*flat)
            item={'bufferView':view(data,34962 if size>1 else 34963),'componentType':component,'count':len(values),'type':kind}
            if kind=='VEC3': item.update(min=[min(v[i] for v in values) for i in range(3)],max=[max(v[i] for v in values) for i in range(3)])
            accessors.append(item); return len(accessors)-1
        for part in self.parts.values():
            positions,normals,uvs,indices=part.arrays()
            if not positions: continue
            all_positions.extend(positions); triangles+=len(indices)//3
            attrs={'POSITION':accessor(positions,'VEC3'),'NORMAL':accessor(normals,'VEC3'),'TEXCOORD_0':accessor(uvs,'VEC2')}
            primitive={'attributes':attrs,'indices':accessor(indices,'SCALAR',5123),'material':material_names.index(part.material),'mode':4}
            meshes.append({'name':part.name+'Mesh','primitives':[primitive]}); nodes.append({'name':part.name,'mesh':len(meshes)-1})
        images=[]
        for name,data in self.images: images.append({'name':name,'bufferView':view(data),'mimeType':'image/png'})
        bounds=[[round(fn(v[i] for v in all_positions),5) for i in range(3)] for fn in [min,max]]
        root={'name':self.root_name,'children':list(range(len(nodes))),'extras':{'units':'metres','forward':'+Z','origin':'base centre','license':'CC0-1.0'}}
        nodes.append(root)
        doc={'asset':{'version':'2.0','generator':'Original Racing Environment v2 procedural authoring','copyright':'CC0-1.0; original geometry and textures; see LICENSES.md'},'scene':0,'scenes':[{'name':self.root_name,'nodes':[len(nodes)-1]}],'nodes':nodes,'meshes':meshes,'materials':materials,'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':accessors}
        if images:
            doc.update(images=images,samplers=[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],textures=[{'sampler':0,'source':i} for i in range(len(images))])
        encoded=json.dumps(doc,separators=(',',':')).encode()
        encoded+=b' '*((-len(encoded))%4); binary.extend(b'\0'*((-len(binary))%4))
        glb=struct.pack('<4sII',b'glTF',2,12+8+len(encoded)+8+len(binary))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+struct.pack('<I4s',len(binary),b'BIN\0')+binary
        RUNTIME.mkdir(exist_ok=True); (RUNTIME/filename).write_bytes(glb)
        assert len(glb)<=300_000,(filename,len(glb))
        return {'file':'runtime/'+filename,'type':'model/gltf-binary','bytes':len(glb),'triangles':triangles,'bounds':{'min':bounds[0],'max':bounds[1]},'dimensions_m':[round(b-a,5) for a,b in zip(*bounds)],'root':self.root_name,'origin':[0,0,0],'front':'+Z','up':'+Y','units':'metres','nodes':[n['name'] for n in nodes],'materials':material_names,'compression':'none','uvs':'Disjoint padded polygon charts per mesh; painted panels have independent non-overlapping atlas bands.'}


def grandstand(m):
    concrete=m.part('Terraces','Concrete'); steel=m.part('Structure','DarkSteel'); seats=m.part('Seats','Orange'); rails=m.part('Railings','Steel')
    concrete.box((0,.12,0),(20,.24,7.6))
    for row in range(7):
        y=.36+row*.48; z=2.65-row*.84
        concrete.box((0,y/2+.24,z),(19.8,y,.80))
        seats.box((0,y+.31,z-.14),(19.25,.12,.43))
        for x in [-9.55,0,9.55]: steel.box((x,y+.14,z-.14),(.09,.28,.35))
    for x in [-9.55,-4.8,4.8,9.55]:
        steel.beam((x,.24,-3.35),(x,5.3,-3.35),.18)
        steel.beam((x,3.7,-3.35),(x,5.45,3.5),.14)
        steel.beam((x,5.3,-3.35),(x,5.45,3.5),.12)
    roof=m.part('Canopy','Roof'); roof.box((0,5.51,-.12),(20,.16,7.36))
    trim=m.part('CanopyTrim','Orange'); trim.box((0,5.51,3.61),(20,.22,.10))
    for z in [-3.55,3.45]:
        rails.beam((-9.75,1.0,z),(9.75,1.0,z),.055)
        for x in [-9.75,-6.5,-3.25,0,3.25,6.5,9.75]: rails.beam((x,.24,z),(x,1.04,z),.045)
    for x in [-9.7,9.7]:
        for row in range(8):
            z=3.0-row*.84; y=.75+row*.48
            rails.beam((x,y-.4,z),(x,y+.4,z),.045)
            if row<7: rails.beam((x,y+.4,z),(x,y+.88,z-.84),.055)
    crowd=m.texture(HERE/'textures/crowd-atlas.webp'); m.add_material('PaintedCrowd',(1,1,1),roughness=.95,texture=crowd,double_sided=True)
    # Image bands begin at pixel y16, each32 high. glTF image top is v=0.
    for row in range(7):
        y=.36+row*.48+.24; z=2.65-row*.84-.10
        v0=(16+row*32)/256; v1=(16+(row+1)*32)/256
        corners=[(-9.4,y+.22,z),(9.4,y+.22,z),(9.4,y+.96,z),(-9.4,y+.96,z)]
        m.textured_quad('CrowdRow'+str(row+1),'PaintedCrowd',corners,[(0,v1),(1,v1),(1,v0),(0,v0)])


def start_gantry(m):
    structure=m.part('GantryStructure','DarkSteel'); trim=m.part('GantryTrim','Orange'); rail=m.part('GantryLattice','Steel')
    for x in [-7.25,7.25]:
        structure.box((x,.15,0),(1.25,.3,1.9))
        for z in [-.52,.52]: structure.beam((x,.3,z),(x,6.3,z),.20)
        for y in [1,2.25,3.5,4.75,6.0]:
            rail.beam((x,y,-.52),(x,y+1.05,.52),.075)
            rail.beam((x,y,.52),(x,y+1.05,-.52),.075)
    for y in [5.9,6.8]:
        for z in [-.52,.52]: structure.beam((-7.25,y,z),(7.25,y,z),.14)
    for i in range(12):
        x=-7.25+i*14.5/12
        for z in [-.52,.52]: rail.beam((x,5.9,z),(x+14.5/12,6.8,z),.065)
    header=m.part('Header','Roof'); header.box((0,6.35,.6),(13.0,.74,.12))
    trim.box((0,6.77,.68),(13.0,.08,.12))
    housings=m.part('SignalHousings','Black')
    m.add_material('SignalRed',(.60,.001,.001),roughness=.6,emissive=(1,0,0))
    for i in range(5):
        x=(i-2)*1.15
        structure.beam((x,5.95,.45),(x,5.1,.45),.08)
        housings.box((x,5.22,.60),(.86,.96,.46))
        m.part('Light'+str(i+1),'SignalRed').cylinder((x,5.22,.86),.30,.08,24,axis='z')
    # Original geometry lettering RACE on header is shared with sponsorship board texture.
    index=m.texture(HERE/'textures/sponsor-race.webp'); m.add_material('HeaderRace',(1,1,1),roughness=.75,texture=index)
    m.textured_quad('RaceHeader','HeaderRace',[(-2.0,6.0,.675),(2.0,6.0,.675),(2.0,6.70,.675),(-2.0,6.70,.675)],[(0,1),(1,1),(1,0),(0,0)])


def tire_barrier(m):
    base=m.part('TireBase','DarkSteel'); rubber=m.part('Tires','Black'); band=m.part('SafetyBands','Orange')
    base.box((0,.04,0),(5.8,.08,1.0))
    for level in range(2):
        for i in range(8): rubber.torus(((i-3.5)*.70,.27+level*.38,0),.255,.12,12,5)
    # Woven retaining strips make the reusable module legible at a distance.
    for x in [-2.55,0,2.55]:
        for z in [-.38,.38]: band.box((x,.45,z),(.075,.74,.035))
        band.box((x,.835,0),(.075,.035,.80))


def chainlink_fence(m):
    posts=m.part('FencePosts','Steel'); wires=m.part('DiamondMesh','DarkSteel'); feet=m.part('FenceFeet','Concrete')
    for x in [-3,0,3]:
        posts.cylinder((x,1.35,0),.055,2.7,12)
        feet.box((x,.06,0),(.32,.12,.48))
    for y in [.22,2.52]: posts.beam((-3,y,0),(3,y,0),.055)
    # Clip both families of 45-degree diagonal wires to the frame rectangle.
    xmin,xmax,ymin,ymax=-2.98,2.98,.22,2.52
    for slope in [-1,1]:
        for n in range(-28,29):
            b=n*.32; points=[]
            for x in [xmin,xmax]:
                y=slope*x+b
                if ymin-1e-8<=y<=ymax+1e-8: points.append((x,y,.015))
            for y in [ymin,ymax]:
                x=(y-b)/slope
                if xmin-1e-8<=x<=xmax+1e-8: points.append((x,y,.015))
            unique=[]
            for p in points:
                if p not in unique: unique.append(p)
            if len(unique)==2 and sum((a-b)**2 for a,b in zip(*unique))>1e-8: wires.beam(*unique,.012)


def sponsor_board(m):
    legs=m.part('BoardSupports','DarkSteel'); rim=m.part('BoardFrame','Orange'); panel=m.part('BoardBack','Roof')
    for x in [-1.8,1.8]:
        legs.box((x,.65,0),(.14,1.3,.14)); legs.box((x,.06,0),(.80,.12,1.2))
    panel.box((0,1.45,0),(5.0,1.9,.14))
    for y in [.48,2.42]: rim.box((0,y,0),(5.12,.10,.20))
    for x in [-2.51,2.51]: rim.box((x,1.45,0),(.10,1.9,.20))
    index=m.texture(HERE/'textures/sponsor-race.webp'); m.add_material('RaceGraphic',(1,1,1),roughness=.85,texture=index)
    m.textured_quad('RacePanel','RaceGraphic',[(-2.44,.55,.075),(2.44,.55,.075),(2.44,2.35,.075),(-2.44,2.35,.075)],[(0,1),(1,1),(1,0),(0,0)])


def main():
    from model_architecture import pit_building, control_tower
    specs=[('Grandstand','grandstand.glb',grandstand),('PitBuilding','pit-building.glb',pit_building),('StartGantry','start-gantry.glb',start_gantry),('ControlTower','control-tower.glb',control_tower),('TireBarrier','tire-barrier.glb',tire_barrier),('ChainlinkFence','chainlink-fence.glb',chainlink_fence),('SponsorBoard','sponsor-board.glb',sponsor_board)]
    info=[]
    for root,file,build in specs:
        model=Model(root); build(model); result=model.write(file); info.append(result)
        print(f'{file}: {result["triangles"]:,} triangles, {result["bytes"]:,} bytes, {result["dimensions_m"]} m')
    assert info[0]['triangles']<=4000
    assert info[1]['triangles']<=6000
    (HERE/'models-info.json').write_text(json.dumps({'license':'CC0-1.0','source':'Original geometry authored in build_models.py and model_architecture.py; embedded original texture sources in build_textures.py.','models':info},indent=2)+'\n')


if __name__=='__main__': main()
