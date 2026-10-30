"""Original mesh-authoring helpers. Blender coordinates: X right, Y depth, Z up."""
import bpy, math, sys
sys.dont_write_bytecode=True
from mathutils import Vector

PALETTE = {
    'navy': '#243D51', 'mint': '#35B59D', 'coral': '#EF7967',
    'purple': '#8061AE', 'amber': '#F1B94C', 'cream': '#F6EBCB',
    'white': '#EEF6F5', 'steel': '#718B9B', 'dark': '#193340',
    'snow': '#E2F2F5', 'ice': '#92CADA', 'pine': '#268778',
    'wood': '#A97950', 'orange': '#E88A36', 'grey': '#8FA2AC',
}

def linear(v):
    return v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4

def rgba(color):
    s=PALETTE.get(color,color).lstrip('#')
    return tuple(linear(int(s[i:i+2],16)/255) for i in (0,2,4))+(1,)

def reset():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes,bpy.data.materials,bpy.data.cameras,bpy.data.lights):
        for d in list(datablocks):
            if d.users == 0: datablocks.remove(d)
    mat=bpy.data.materials.new('vertex_palette'); mat.use_nodes=True
    n=mat.node_tree.nodes; p=n.get('Principled BSDF'); p.inputs['Roughness'].default_value=.82
    a=n.new('ShaderNodeVertexColor'); a.layer_name='COLOR_0'
    mat.node_tree.links.new(a.outputs['Color'],p.inputs['Base Color'])
    return mat

def paint(obj,color,face_colors=None):
    obj.data.materials.clear(); obj.data.materials.append(bpy.data.materials['vertex_palette'])
    attr=obj.data.color_attributes.new(name='COLOR_0',type='BYTE_COLOR',domain='CORNER')
    for p in obj.data.polygons:
        c=rgba(face_colors[p.index] if face_colors else color)
        for li in p.loop_indices: attr.data[li].color=c
    return obj

def mesh(name,verts,faces,color='white',face_colors=None):
    m=bpy.data.meshes.new(name+'_mesh'); m.from_pydata(verts,[],faces); m.update()
    o=bpy.data.objects.new(name,m); bpy.context.collection.objects.link(o)
    return paint(o,color,face_colors)

def box(name,loc,size,color,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name
    o.dimensions=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('edge_chamfer','BEVEL'); mod.width=min(bevel,min(size)*.22); mod.segments=1
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
    return paint(o,color)

def cylinder(name,a,b,radius,color,vertices=8,radius2=None):
    d=Vector(b)-Vector(a); mid=(Vector(a)+Vector(b))/2
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=radius,radius2=radius if radius2 is None else radius2,depth=d.length,location=mid)
    o=bpy.context.object; o.name=name; o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return paint(o,color)

def polyline(name,points,radius,color,vertices=6,closed=False):
    pieces=[]
    for a,b in zip(points,points[1:]+([points[0]] if closed else [])):
        if (Vector(a)-Vector(b)).length>1e-6: pieces.append(cylinder(name,a,b,radius,color,vertices))
    return join(name,pieces)

def ring(name,loc,radius,tube,color,major=32,minor=6):
    bpy.ops.mesh.primitive_torus_add(major_segments=major,minor_segments=minor,location=loc,major_radius=radius,minor_radius=tube)
    o=bpy.context.object; o.name=name; return paint(o,color)

def join(name,objects):
    objects=[o for o in objects if o]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]; bpy.ops.object.join()
    o=bpy.context.object; o.name=name; return o

def anchor(name,loc):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); o.location=loc
    o.empty_display_type='SPHERE'; o.empty_display_size=.12; return o

def finalize(name,outdir,category,notes='',view=(1.25,-1.6,1.1)):
    """Non-overlapping UV atlas, identity base root, metre export and authoring metadata."""
    import os,json
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    # Bake object transforms so every mesh lives in the same metre coordinate system.
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active=meshes[0]
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.012,area_weight=0,correct_aspect=True,scale_to_bounds=True)
    bpy.ops.uv.pack_islands(rotate=True,margin=.006)
    bpy.ops.object.mode_set(mode='OBJECT')
    # A dedicated pitch material uses the whole tile, independent of the untextured atlas.
    for o in meshes:
        if o.get('uv_layout')=='full_surface_0_1':
            for loop in o.data.loops:
                co=o.data.vertices[loop.vertex_index].co
                o.data.uv_layers.active.data[loop.index].uv=(co.x/68+.5,co.y/105+.5)
            mat=o.data.materials[0].copy(); mat.name='pitch_surface_material'
            mat['suggested_texture']='../environment/textures/grass-mown.webp'
            o.data.materials[0]=mat
    root=anchor('asset_root',(0,0,0)); root['asset_id']=name; root['units']='metres'; root['category']=category
    root['reference_player_height_m']=1.8
    if not bpy.data.objects.get('anchor_origin'): anchor('anchor_origin',(0,0,0))
    nodes=[o for o in bpy.context.scene.objects if o!=root]
    for o in nodes: o.parent=root
    bpy.context.scene.unit_settings.system='METRIC'; bpy.context.scene.unit_settings.scale_length=1
    os.makedirs(outdir,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(outdir,name+'.glb'),export_format='GLB',export_yup=True,
        export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7,
        export_draco_position_quantization=16,export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=20 if name=='soccer-stadium' else 16,export_draco_color_quantization=8,
        export_materials='EXPORT',export_vertex_color='MATERIAL',export_all_vertex_colors=True,export_texcoords=True,export_normals=True,
        export_cameras=False,export_lights=False,export_extras=True)
    vs=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
    lo=[min(v[i] for v in vs) for i in range(3)]; hi=[max(v[i] for v in vs) for i in range(3)]
    def gl(p): return [round(p[0],6),round(p[2],6),round(-p[1],6)]
    meta={'id':name,'category':category,'notes':notes,'view':view,
        'bounds_blender':[lo,hi], 'anchors':{o.name:gl(o.location) for o in nodes if o.type=='EMPTY'},
        'objects':[o.name for o in meshes], 'triangles':sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons)}
    with open(os.path.join(outdir,name+'.authoring.json'),'w',encoding='utf8') as f: json.dump(meta,f,indent=2)
    return meta
