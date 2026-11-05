"""Render repository baseline vessels for reference; never modify source assets."""
import bpy,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];REPO=ROOT.parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for i,name in enumerate(('ship-player.glb','enemy-ship-b-512.glb','boss-ship-512.glb')):
    old=set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(REPO/'assets/models'/name))
    obs=[o for o in bpy.context.scene.objects if o not in old]
    meshes=[o for o in obs if o.type=='MESH']
    points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
    lo=Vector(tuple(min(v[k] for v in points) for k in range(3)));hi=Vector(tuple(max(v[k] for v in points) for k in range(3)))
    size=hi-lo;scale=18/max(size.x,size.y);center=(lo+hi)/2
    for o in obs:
        if o.parent is None:
            o.location=(o.location-center)*scale+Vector(((i-1)*16,0,0));o.scale*=scale
world=bpy.context.scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.19,.25,.3,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
for loc,power,size in [((-20,-15,30),2800,25),((20,10,18),1800,20)]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(33,-44,35));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=64;bpy.context.scene.camera=cam
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=128;s.cycles.use_denoising=False;s.render.resolution_x=1440;s.render.resolution_y=800;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.filepath=str(ROOT/'references/prior-fleet.png');s.view_settings.view_transform='AgX'
bpy.ops.render.render(write_still=True)
