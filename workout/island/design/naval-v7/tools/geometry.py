"""Small Blender authoring helpers. Dimensions are metres, Blender Z is up."""
import bpy, math, random
from mathutils import Vector
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARTS = []
MAT = None
LOD = 0

def reset(lod=0, atlas='fleet-tide-1024.png'):
    global MAT, PARTS, LOD
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    PARTS=[];LOD=lod
    MAT=bpy.data.materials.new('NavalSharedAtlas');MAT.use_nodes=True
    bs=MAT.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Roughness'].default_value=.72;bs.inputs['Metallic'].default_value=.22
    tex=MAT.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ROOT/'assets/textures'/atlas),check_existing=True)
    MAT.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])

def uv_tile(obj, tile, flat=False):
    mesh=obj.data
    uv=mesh.uv_layers.active or mesh.uv_layers.new(name='AtlasUV')
    mesh.update()
    # Box projection respects real dimensions while never bleeding across tiles.
    for poly in mesh.polygons:
        normal=poly.normal;axis=max(range(3),key=lambda i:abs(normal[i]));axes=[i for i in range(3) if i!=axis]
        vals=[[mesh.vertices[mesh.loops[li].vertex_index].co[ax] for li in poly.loop_indices] for ax in axes]
        mins=[min(v) for v in vals];spans=[max(v)-min(v) for v in vals]
        for li in poly.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            a=(co[axes[0]]-mins[0])/max(.0001,spans[0]);b=(co[axes[1]]-mins[1])/max(.0001,spans[1])
            if flat:a=b=.5
            uv.data[li].uv=((tile%4+(a*.94+.03))/4,1-(tile//4+(1-b)*.94+.03)/4)
    obj.data.materials.clear();obj.data.materials.append(MAT)
    obj['atlasTile']=tile
    return obj

def mesh(name,verts,faces,tile=0,bevel=0):
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update()
    o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);PARTS.append(o)
    if bevel and LOD<2:
        bpy.context.view_layer.objects.active=o;o.select_set(True)
        mod=o.modifiers.new('Machined edges','BEVEL');mod.width=bevel;mod.segments=1;mod.affect='EDGES'
        bpy.ops.object.modifier_apply(modifier=mod.name);o.select_set(False)
    uv_tile(o,tile)
    return o

def box(name,loc,size,tile=1,bevel=.06):
    x,y,z=[v/2 for v in size]
    o=mesh(name,[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],tile,bevel)
    o.location=loc;return o

def cyl(name,loc,radius,depth,tile=5,vertices=None,top=None,direction=None):
    n=vertices or (12 if LOD==0 else 8 if LOD==1 else 6)
    rtop=radius if top is None else top
    vs=[(math.cos(i*2*math.pi/n)*r,math.sin(i*2*math.pi/n)*r,z) for z,r in [(-depth/2,radius),(depth/2,rtop)] for i in range(n)]
    fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    o=mesh(name,vs,fs,tile);o.location=loc
    if direction:o.rotation_euler=Vector(direction).to_track_quat('Z','Y').to_euler()
    return o

def tube(name,a,b,radius,tile=4,n=None):
    a=Vector(a);b=Vector(b);return cyl(name,(a+b)/2,radius,(b-a).length,tile,n,direction=b-a)

def sphere(name,loc,scale,tile=4,subdiv=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv,radius=1,location=loc)
    o=bpy.context.object;o.name=name
    for v in o.data.vertices:v.co*=Vector(scale)
    PARTS.append(o);uv_tile(o,tile);o.select_set(False);return o

def ring(name,loc,major,minor,tile=12,rotation=None):
    n=16 if LOD==0 else 10;m=5 if LOD==0 else 4
    vs=[((major+minor*math.cos(j*2*math.pi/m))*math.cos(i*2*math.pi/n),(major+minor*math.cos(j*2*math.pi/m))*math.sin(i*2*math.pi/n),minor*math.sin(j*2*math.pi/m)) for i in range(n) for j in range(m)]
    fs=[(i*m+j,((i+1)%n)*m+j,((i+1)%n)*m+(j+1)%m,i*m+(j+1)%m) for i in range(n) for j in range(m)]
    o=mesh(name,vs,fs,tile);o.location=loc
    if rotation:o.rotation_euler=rotation
    return o

def wedge(name,loc,w,d,h,tile=1,lean=.2):
    pts=[(-w*.5,-d*.5),(w*.5,-d*.5),(w*.5,d*.5),(-w*.5,d*.5)]
    vs=[(x,y,-h/2) for x,y in pts]+[(x*(1-lean),y*(1-lean),h/2) for x,y in pts]
    o=mesh(name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],tile,.09);o.location=loc;return o

def merge(objects,name,origin=(0,0,0)):
    objects=[o for o in objects if o and o.type=='MESH']
    if not objects:return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=objects[0];o.name=name
    bpy.context.scene.cursor.location=origin;bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    # One primitive per static assembly and one atlas lookup for the whole fleet.
    for p in o.data.polygons:p.material_index=0
    while len(o.data.materials)>1:o.data.materials.pop(index=len(o.data.materials)-1)
    for p in o.data.polygons:p.use_smooth=False
    o.select_set(False);return o

def group_since(start,name,origin=(0,0,0)):
    objects=PARTS[start:];del PARTS[start:]
    return merge(objects,name,origin)

def export(path, extras=None):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    if extras:
        for o in bpy.context.scene.objects:
            if o.name=='body':
                for key,value in extras.items():o[key]=value
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',export_yup=True,
        export_texcoords=True,export_normals=True,export_materials='EXPORT',export_extras=True,
        export_animations=False,export_skins=True,export_def_bones=False,
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,export_draco_color_quantization=8,
        export_image_format='AUTO',export_apply=False)

def rail(points,z,tile=4):
    if LOD==2:return
    # Double safety rail at LOD0; a single simplified upper rail at LOD1.
    for a,b in zip(points,points[1:]):
        for h in ([.45,.95] if LOD==0 else [.95]):tube('Safety rail',(a[0],a[1],z+h),(b[0],b[1],z+h),.035 if LOD==0 else .05,tile,n=5)
    for x,y in points:tube('Stanchion',(x,y,z),(x,y,z+1),.045,tile,n=5)
