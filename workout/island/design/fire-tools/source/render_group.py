"""Blender 4.3+: import the delivered GLBs and render all four at their real scale.

blender -b -t 4 --python workout/island/design/fire-tools/source/render_group.py
"""
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for name, x, y in [('fire-extinguisher',-.80,-.05),('fire-blanket',-.45,.50),
                   ('foam-hose',.30,.42),('wall-hose-reel',.62,-.48)]:
    before=set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/f'{name}.glb'))
    imported=set(bpy.context.scene.objects)-before
    for obj in imported:
        if obj.parent is None:
            obj.location+=Vector((x,y,0))

bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.001))
floor=bpy.context.object
floor.name='preview-floor-only'
material=bpy.data.materials.new('preview-ivory')
material.diffuse_color=(.76,.78,.72,1)
material.use_nodes=True
material.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.76,.78,.72,1)
material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.86
floor.data.materials.append(material)

def area(name,position,power,size):
    bpy.ops.object.light_add(type='AREA',location=position)
    light=bpy.context.object
    light.name=name
    light.data.energy=power
    light.data.shape='DISK'
    light.data.size=size
    light.rotation_euler=(Vector((0,0,.45))-light.location).to_track_quat('-Z','Y').to_euler()

area('soft-key',(-3,4,6),450,4)
area('soft-fill',(4,1,4),220,3)
area('soft-rim',(0,-4,5),330,3)
# glTF -Z forward becomes +Y when Blender imports its Z-up scene.
bpy.ops.object.camera_add(location=(2.8,5,3.2))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,.05,.55))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'
camera.data.ortho_scale=2.8
scene=bpy.context.scene
scene.camera=camera
scene.render.engine='CYCLES'
scene.cycles.device='CPU'
scene.cycles.samples=64
scene.cycles.use_denoising=False
scene.world.color=(.34,.34,.34)
scene.view_settings.view_transform='Standard'
scene.render.resolution_x=1400
scene.render.resolution_y=1000
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(ROOT/'all-tools.png')
bpy.ops.render.render(write_still=True)
