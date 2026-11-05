"""Bake a portable 1024² farm shadow layer from the final delivered geometry.

One texture replaces the dynamic shadow pass when the automatic mobile profile
needs it. Static poses match small LOD2 actors. Studio output is not used as art.
"""
import bpy,json,sys,argparse,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--input',default='/tmp/defense-v7-shadow-input');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
bpy.ops.wm.read_factory_settings(use_empty=True)
layout=json.loads((ROOT/'farm-layout.json').read_text())
def add(asset,position,scale=1,yaw=0):
    if asset.startswith(('guard-ranger','guard-lookout','guard-keeper','boar-')):asset+='-lod2'
    before=set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.input)/(asset+'.glb')))
    objects=set(bpy.context.scene.objects)-before
    parent=bpy.data.objects.new('bake_instance',None);bpy.context.collection.objects.link(parent)
    for o in objects:
        if o.parent not in objects:o.parent=parent
        if o.type=='MESH':o.visible_camera=False
        if o.animation_data:
            o.animation_data.action=None
            for track in o.animation_data.nla_tracks:track.mute=True
    parent.location=(position[0],-position[2],position[1]);parent.rotation_euler.z=yaw;parent.scale=(scale,)*3
for p in layout['props']:
    if p['asset']!='farm-island':add(p['asset'],p['position'],p.get('scale',1),p.get('rotationY',0))
for p in layout['fence']:add('farm-fence',p['position'],1,p['rotationY'])
for p in layout['boars']+layout['guards']:add(p['asset'],p['position'],p.get('scale',1),p.get('rotationY',0))
bpy.ops.mesh.primitive_plane_add(size=18.6,location=(0,0,.235))
plane=bpy.context.object;plane.is_shadow_catcher=True
material=bpy.data.materials.new('shadow catcher');material.use_nodes=True;material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(1,1,1,1);material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=1;plane.data.materials.append(material)
world=bpy.data.worlds.new('neutral');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(1,1,1,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;bpy.context.scene.world=world
bpy.ops.object.light_add(type='SUN',location=(-8,-8,18));sun=bpy.context.object;sun.rotation_euler=(Vector((0,0,0))-sun.location).to_track_quat('-Z','Y').to_euler();sun.data.energy=2;sun.data.angle=.065
bpy.ops.object.camera_add(location=(0,0,25));camera=bpy.context.object;camera.rotation_euler=(0,0,0);camera.data.type='ORTHO';camera.data.ortho_scale=18.6
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=False;scene.cycles.max_bounces=2;scene.cycles.diffuse_bounces=2;scene.render.threads_mode='FIXED';scene.render.threads=1
scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.film_transparent=True
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='Standard'
scene.render.filepath='/tmp/defense-v7-farm-shadow-raw.png';bpy.ops.render.render(write_still=True)
(ROOT/'verification/shadow-bake.json').write_text(json.dumps({'source':'final decoded GLBs + farm-layout.json','size':[1024,1024],'worldSpanMeters':18.6,'planeY':.235,'texturePlaneY':.27,'sunPositionThree':[-8,18,8],'samples':48,'method':'Cycles transparent shadow catcher; one texture, one draw in fallback profile'},indent=2))
