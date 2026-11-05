"""Independent high-resolution surface/turnaround review with Blender Cycles.

Art is read from decoded final GLB, never rebuilt for these pictures. The local
browser screenshots remain the authoritative runtime appearance. Studio lights
are deliberately neutral so disconnected components and rear geometry are clear.
"""
import bpy,math,json,sys,argparse
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--samples',type=int,default=128);parser.add_argument('--input',default='/tmp/defense-v7-studio-input');parser.add_argument('--ids',default='');parser.add_argument('--denoise',action='store_true');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
DEST=ROOT/'verification'/'studio';DEST.mkdir(parents=True,exist_ok=True)
paths=sorted(Path(args.input).glob('*.glb'))
if args.ids:paths=[p for p in paths if p.stem in args.ids.split(',')]
record_file=DEST/'renders.json'
records=[r for r in json.loads(record_file.read_text()) if r['asset'] not in args.ids.split(',')] if args.ids and record_file.exists() else []
for path in paths:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported=[o for o in bpy.context.scene.objects if o.type=='MESH']
    # Render bind at frame 0; imported motion remains stored in the input GLB.
    for obj in bpy.context.scene.objects:
        if obj.animation_data:
            obj.animation_data.action=None
            for track in obj.animation_data.nla_tracks:track.mute=True
    bpy.context.scene.frame_set(0)
    deps=bpy.context.evaluated_depsgraph_get()
    points=[]
    for obj in imported:
        evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh()
        points.extend(evaluated.matrix_world@v.co for v in mesh.vertices)
        evaluated.to_mesh_clear()
    lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)));center=(lo+hi)*.5;extent=max(hi-lo)
    # Blender's glTF import converts Y-up to Blender Z-up.
    bpy.ops.mesh.primitive_plane_add(size=200,location=(center.x,center.y,lo.z-.002*extent))
    ground=bpy.context.object;ground.name='studio_floor'
    material=bpy.data.materials.new('neutral cream');material.diffuse_color=(.76,.75,.68,1);material.use_nodes=True
    material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.76,.75,.68,1);material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;ground.data.materials.append(material)
    world=bpy.data.worlds.new('studio_world');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.62,.72,.76,1);world.node_tree.nodes['Background'].inputs[1].default_value=.35
    for location,power,size,color in [((-3,-4,6),600,4,(1,.89,.72)),((4,-1,3),280,3,(.75,.89,1)),((1,5,4),450,3,(1,.95,.85))]:
        bpy.ops.object.light_add(type='AREA',location=center+Vector(location)*extent*.60);light=bpy.context.object;light.data.energy=power*extent**2;light.data.shape='DISK';light.data.size=size*extent*.60;light.data.color=color;light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=args.denoise;scene.render.threads_mode='FIXED';scene.render.threads=1
    scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
    for label,direction in [('front',(3,-5,2.8)),('rear',(-3,5,2.4)),('side',(5,1,1.3))]:
        bpy.ops.object.camera_add(location=center+Vector(direction).normalized()*extent*3)
        camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=extent*1.30;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
        destination=DEST/(path.stem+'-'+label+'.png');scene.render.filepath=str(destination);bpy.ops.render.render(write_still=True)
        records.append({'asset':path.stem,'angle':label,'file':destination.name,'samples':args.samples,'denoise':args.denoise,'source':path.name,'units':'metres','boundsBlender':{'min':list(lo),'max':list(hi)}})
        (DEST/'renders.json').write_text(json.dumps(records,indent=2))
        bpy.data.objects.remove(camera,do_unlink=True)
print('Studio rendered',len(records),'images')
