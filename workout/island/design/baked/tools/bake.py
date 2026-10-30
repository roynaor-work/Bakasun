"""Bake imported main GLBs. Blender 5.2, CPU Cycles; no source GLB writes.
Run: blender -b --python tools/bake.py -- --scratch <directory>
Then run package.py with ordinary Python + Pillow + numpy.
"""
import bpy, sys, json, math, hashlib, argparse
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT.parent / 'models'
ENV = ROOT.parent / 'environment'
IDS = ['soccer-stadium', 'basketball-arena', 'ski-slope']

def imported(path):
    before=set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()
    return list(set(bpy.context.scene.objects)-before)

def audit(obs, size=1024):
    # Strict interior samples ignore shared triangle edges. Raster audit at 2x bake size.
    counts=np.zeros((size,size),dtype=np.uint16); out=0; deg=0
    for o in obs:
        me=o.data; me.calc_loop_triangles()
        uv=me.uv_layers.active
        if not uv: return {'missing':True}
        for tri in me.loop_triangles:
            p=np.array([uv.data[i].uv[:] for i in tri.loops])*size
            out+=int(np.any(p<-.01) or np.any(p>size+.01))
            a,b,c=p; den=np.cross(b-a,c-a).item()
            if abs(den)<1e-8: deg+=1; continue
            mn=np.maximum(np.floor(p.min(axis=0)).astype(int),0)
            mx=np.minimum(np.ceil(p.max(axis=0)).astype(int),size-1)
            if np.any(mx<mn): continue
            yy,xx=np.mgrid[mn[1]:mx[1]+1,mn[0]:mx[0]+1]
            q=np.stack((xx+.5,yy+.5),axis=-1)-a
            u=(q[...,0]*(c-a)[1]-q[...,1]*(c-a)[0])/den
            v=((b-a)[0]*q[...,1]-(b-a)[1]*q[...,0])/den
            hit=(u>1e-5)&(v>1e-5)&(u+v<1-1e-5)
            counts[mn[1]:mx[1]+1,mn[0]:mx[0]+1]+=hit
    return {'raster_size':size,'covered_pixels':int((counts>0).sum()),
            'overlap_pixels':int((counts>1).sum()),'out_of_range_triangles':out,'degenerate_uv_triangles':deg}

def select(obs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active=obs[0]

def unwrap_copy(obs):
    # Draco splits vertices at palette/normal seams. Weld ONLY disposable UV proxies,
    # then transfer UV coordinates by triangle positions. Source topology stays intact.
    import bmesh
    proxies=[]
    for o in obs:
        proxy=o.copy();proxy.data=o.data.copy();bpy.context.collection.objects.link(proxy)
        for layer in list(proxy.data.uv_layers):proxy.data.uv_layers.remove(layer)
        proxy.data.uv_layers.new(name='BAKE_UV')
        bm=bmesh.new();bm.from_mesh(proxy.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(proxy.data);bm.free()
        proxies.append(proxy)
    select(proxies);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.002,area_weight=0,scale_to_bounds=True)
    bpy.ops.uv.pack_islands(rotate=True,margin_method='FRACTION',margin=.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    def key(co):return tuple(round(x,5) for x in co)
    for o,proxy in zip(obs,proxies):
        proxy.data.calc_loop_triangles();lookup={}
        for t in proxy.data.loop_triangles:
            pts=[key(proxy.data.vertices[proxy.data.loops[i].vertex_index].co) for i in t.loops]
            lookup[tuple(sorted(pts))]={pt:proxy.data.uv_layers.active.data[li].uv[:] for pt,li in zip(pts,t.loops)}
        layer=o.data.uv_layers.new(name='BAKE_UV');o.data.uv_layers.active=layer;layer.active_render=True
        o.data.calc_loop_triangles()
        for t in o.data.loop_triangles:
            pts=[key(o.data.vertices[o.data.loops[i].vertex_index].co) for i in t.loops]
            uv=lookup[tuple(sorted(pts))]
            for pt,li in zip(pts,t.loops):layer.data[li].uv=uv[pt]
        bpy.data.objects.remove(proxy,do_unlink=True)

def image(name,size):
    im=bpy.data.images.new(name,width=size,height=size,alpha=False,float_buffer=True)
    im.colorspace_settings.name='Non-Color'
    im.generated_color=(1,1,1,1)
    return im

def bake_nodes(obs,im,kind,distance):
    for o in obs:
        for slot in o.material_slots:
            m=slot.material
            m.use_nodes=True; n=m.node_tree.nodes; n.clear(); l=m.node_tree.links
            out=n.new('ShaderNodeOutputMaterial')
            if kind=='ao':
                ao=n.new('ShaderNodeAmbientOcclusion'); ao.samples=64
                ao.inputs['Distance'].default_value=distance
                em=n.new('ShaderNodeEmission'); l.new(ao.outputs['AO'],em.inputs['Color']); l.new(em.outputs[0],out.inputs[0])
            else:
                diffuse=n.new('ShaderNodeBsdfDiffuse');diffuse.inputs['Color'].default_value=(1,1,1,1)
                l.new(diffuse.outputs[0],out.inputs[0])
            tex=n.new('ShaderNodeTexImage'); tex.image=im; n.active=tex

def save_raw(im,path):
    np.save(path,np.array(im.pixels[:],dtype=np.float32).reshape(im.size[1],im.size[0],4))

def props(asset):
    # Static occluders in Blender Z-up metres; do not export as part of venue.
    result=[]
    if asset=='soccer-stadium':
        for sign in (-1,1):
            oo=imported(MODELS/'soccer-goal.glb')
            roots=[o for o in oo if o.parent is None]
            for o in roots:
                o.location.y=sign*52.5; o.location.z=.04
                o.rotation_euler.z=0 if sign==-1 else math.pi
            result+=oo
    if asset=='ski-slope':
        oo=imported(MODELS/'slalom-gate.glb')
        for o in oo:
            if o.parent is None: o.location.z=3.25
        result+=oo
    bpy.context.view_layer.update()
    return result

def mul(nodes,links,a,b):
    n=nodes.new('ShaderNodeMixRGB'); n.blend_type='MULTIPLY'; n.inputs[0].default_value=1
    links.new(a,n.inputs[1]); links.new(b,n.inputs[2]); return n.outputs[0]

def display_materials(obs,asset,ao,lm,state):
    for o in obs:
        m=bpy.data.materials.new(o.name+'_display');m.use_nodes=True
        o.data.materials.clear();o.data.materials.append(m)
        n=m.node_tree.nodes;n.clear();l=m.node_tree.links
        out=n.new('ShaderNodeOutputMaterial');em=n.new('ShaderNodeEmission');l.new(em.outputs[0],out.inputs[0])
        vc=n.new('ShaderNodeVertexColor');vc.layer_name=o.data.color_attributes[0].name; base=vc.outputs['Color']
        tile=None
        if o.name=='pitch_surface': tile='grass-mown.webp'
        if o.name=='court_surface': tile='parquet.webp'
        if o.name=='slope_surface': tile='snow.webp'
        if tile:
            # Object-position mapping is preview-only; original UV0 remains available.
            tex=n.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(ENV/'textures'/tile),check_existing=True)
            geom=n.new('ShaderNodeNewGeometry'); sep=n.new('ShaderNodeSeparateXYZ');l.new(geom.outputs['Position'],sep.inputs[0])
            comb=n.new('ShaderNodeCombineXYZ')
            scale={'grass-mown.webp':.035,'parquet.webp':.12,'snow.webp':.06}[tile]
            for i,key in enumerate(('X','Y')):
                mult=n.new('ShaderNodeMath');mult.operation='MULTIPLY';mult.inputs[1].default_value=scale
                l.new(sep.outputs[key],mult.inputs[0]);l.new(mult.outputs[0],comb.inputs[i])
            l.new(comb.outputs[0],tex.inputs['Vector'])
            # Surface has its own texture color, not the untextured white/wood palette.
            base=tex.outputs['Color']
        geom=n.new('ShaderNodeNewGeometry');dot=n.new('ShaderNodeVectorMath');dot.operation='DOT_PRODUCT'
        l.new(geom.outputs['Normal'],dot.inputs[0]);dot.inputs[1].default_value=Vector((-1,-1,2)).normalized()
        mx=n.new('ShaderNodeMath');mx.operation='MAXIMUM';mx.inputs[1].default_value=0;l.new(dot.outputs['Value'],mx.inputs[0])
        mad=n.new('ShaderNodeMath');mad.operation='MULTIPLY_ADD';mad.inputs[1].default_value=.35;mad.inputs[2].default_value=.65;l.new(mx.outputs[0],mad.inputs[0])
        shade=mad.outputs[0]
        if ao and state!='before':
            uv=n.new('ShaderNodeUVMap');uv.uv_map=o.data.uv_layers.active.name
            at=n.new('ShaderNodeTexImage');at.image=ao;l.new(uv.outputs[0],at.inputs[0])
            base=mul(n,l,base,at.outputs['Color'])
            if state=='light':
                lt=n.new('ShaderNodeTexImage');lt.image=lm;l.new(uv.outputs[0],lt.inputs[0]);shade=lt.outputs['Color']
        l.new(mul(n,l,base,shade),em.inputs['Color'])

def render(asset,obs,context,ao,lm,scratch):
    sc=bpy.context.scene
    # Identical emission-only comparison: no runtime AO, shadows or post effects.
    sc.render.engine='CYCLES';sc.cycles.samples=32;sc.cycles.use_denoising=False
    sc.world.node_tree.nodes['Background'].inputs[0].default_value=(.075,.115,.15,1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value=.8
    sc.view_settings.view_transform='Standard';sc.view_settings.look='None'
    sc.view_settings.exposure=0;sc.view_settings.gamma=1
    vs=[o.matrix_world@Vector(c) for o in obs+context if o.type=='MESH' for c in o.bound_box]
    lo=Vector([min(v[k] for v in vs) for k in range(3)]);hi=Vector([max(v[k] for v in vs) for k in range(3)])
    center=(lo+hi)/2;extent=max(hi-lo)
    direction=Vector((1.2,-1.5,1.35) if asset!='ski-slope' else (1.25,-1.55,1.25)).normalized()
    bpy.ops.object.camera_add(location=center+direction*extent*3)
    cam=bpy.context.object;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.clip_end=2000;cam.data.sensor_fit='HORIZONTAL'
    sc.camera=cam;bpy.context.view_layer.update()
    local=[cam.matrix_world.inverted()@v for v in vs]
    width=max(v.x for v in local)-min(v.x for v in local);height=max(v.y for v in local)-min(v.y for v in local)
    display_materials([o for o in context if o.type=='MESH'],asset,None,None,'before')
    for state in ('before','ao','light'):
        display_materials(obs,asset,ao,lm,state)
        for orientation,w,h in [('portrait',390,844),('landscape',844,390)]:
            view=Vector((.18,-1,1.6)).normalized() if orientation=='portrait' else direction
            cam.location=center+view*extent*3;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
            bpy.context.view_layer.update()
            local=[cam.matrix_world.inverted()@v for v in vs]
            width=max(v.x for v in local)-min(v.x for v in local);height=max(v.y for v in local)-min(v.y for v in local)
            cam.data.ortho_scale=max(width,height*w/h)*1.08
            sc.render.resolution_x=w;sc.render.resolution_y=h;sc.render.resolution_percentage=100
            sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGB'
            sc.render.filepath=str(scratch/f'{asset}-{orientation}-{state}.png')
            bpy.ops.render.render(write_still=True)

def run(asset,scratch):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc=bpy.context.scene;sc.world=bpy.data.worlds.new('world');sc.world.use_nodes=True
    source=MODELS/(asset+'.glb'); allobs=imported(source);obs=[o for o in allobs if o.type=='MESH']
    original=audit(obs)
    fallback=original.get('missing') or original['overlap_pixels']>0 or original['out_of_range_triangles']>0 or original['degenerate_uv_triangles']>0
    if fallback:
        unwrap_copy(obs)
        # Export before bake nodes: preserve palette, nodes, UV0, anchors, transforms.
        select(allobs)
        bpy.ops.export_scene.gltf(filepath=str(ROOT/(asset+'-uv2.glb')),export_format='GLB',use_selection=True,
            export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=7,
            export_draco_position_quantization=16,export_draco_normal_quantization=10,export_draco_texcoord_quantization=20,
            export_draco_color_quantization=8,export_vertex_color='MATERIAL',export_all_vertex_colors=True,
            export_texcoords=True,export_normals=True,export_extras=True,export_cameras=False,export_lights=False)
    final=audit(obs)
    if final['overlap_pixels'] or final['out_of_range_triangles']: raise RuntimeError((asset,final))
    context=props(asset)
    # Materials must be unique per target object so all active bake image nodes agree.
    for o in obs:
        for slot in o.material_slots: slot.material=slot.material.copy()
    sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=64;sc.cycles.seed=271030;sc.cycles.use_denoising=False
    sc.render.bake.margin=4;sc.render.bake.use_clear=False;sc.render.bake.margin_type='EXTEND'
    ao=image(asset+'_ao',512);distance={'soccer-stadium':4.,'basketball-arena':1.4,'ski-slope':1.8}[asset]
    bake_nodes(obs,ao,'ao',distance);select(obs);bpy.ops.object.bake(type='EMIT')
    save_raw(ao,scratch/(asset+'-ao.npy'))
    lm=image(asset+'_light',256)
    bake_nodes(obs,lm,'light',distance)
    sc.world.node_tree.nodes['Background'].inputs[0].default_value=(1,1,1,1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value=.65
    bpy.ops.object.light_add(type='SUN',location=(-10,-10,20))
    sun=bpy.context.object;sun.data.energy=.7;sun.data.angle=math.radians(12)
    sun.rotation_euler=Vector((1,1,-2)).to_track_quat('-Z','Y').to_euler()
    # Direct illumination + unoccluded world ambient; AO provides the contact component.
    select(obs);bpy.ops.object.bake(type='DIFFUSE',pass_filter={'DIRECT','INDIRECT'})
    # Unit-white diffuse irradiance is converted into a conservative multiplicative map.
    raw=np.array(lm.pixels[:],dtype=np.float32).reshape(256,256,4)
    raw[:,:,:3]=np.clip(raw[:,:,:3],.35,1.)
    lm.pixels.foreach_set(raw.reshape(-1));lm.update()
    save_raw(lm,scratch/(asset+'-light.npy'))
    report={'id':asset,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'original_uv_audit':original,
        'bake_uv_audit':final,'uv_set':1 if fallback else 0,'ao_distance_m':distance,'samples':64,
        'occluders':['soccer-goal at y=+/-52.5m, z=.04m, inward facing'] if asset=='soccer-stadium' else ['slalom-gate at (0,0,3.25)m'] if asset=='ski-slope' else ['built-in basket frames'],
        'coordinates':'Blender Z-up metres; glTF is Y-up'}
    (scratch/(asset+'.json')).write_text(json.dumps(report,indent=2),newline='\n')
    # Preview uses the actual quantized delivered WebP decoded by Blender, never raw bake floats.
    # packaging pass supplies WebP files before --render-only is called.
    return obs,context

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--scratch',required=True);p.add_argument('--asset',choices=IDS);p.add_argument('--render-only',action='store_true')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);scratch=Path(a.scratch).resolve();scratch.mkdir(parents=True,exist_ok=True)
    for asset in ([a.asset] if a.asset else IDS):
        if not a.render_only: run(asset,scratch)
        else:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            sc=bpy.context.scene;sc.world=bpy.data.worlds.new('world');sc.world.use_nodes=True
            f=ROOT/(asset+'-uv2.glb');oo=imported(f if f.exists() else MODELS/(asset+'.glb'))
            obs=[o for o in oo if o.type=='MESH']
            for o in obs:
                if len(o.data.uv_layers)>1:o.data.uv_layers.active_index=1
            ctx=props(asset)
            ao=bpy.data.images.load(str(ROOT/(asset+'-ao.webp')));ao.colorspace_settings.name='Non-Color'
            lm=bpy.data.images.load(str(ROOT/(asset+'-light.webp')));lm.colorspace_settings.name='Non-Color'
            render(asset,obs,ctx,ao,lm,scratch)
