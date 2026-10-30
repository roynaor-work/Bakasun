"""Render each delivered Draco GLB by reimporting it, never the pre-export scene."""
import bpy, os, sys, json, math, argparse
from mathutils import Vector
sys.path.insert(0,os.path.dirname(__file__))
from common import rgba

def render(path):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=path)
    obs=[o for o in bpy.context.scene.objects if o.type=='MESH']
    bpy.context.view_layer.update()
    vs=[o.matrix_world@Vector(c) for o in obs for c in o.bound_box]
    lo=Vector([min(v[k] for v in vs) for k in range(3)]); hi=Vector([max(v[k] for v in vs) for k in range(3)])
    center=(lo+hi)/2; extent=max(hi-lo)
    meta=json.load(open(path.replace('.glb','.authoring.json'),encoding='utf8'))
    direction=Vector(meta.get('view',(1.25,-1.6,1.1))).normalized()
    # Exported assets have no textures. Stadium preview alone borrows the existing environment tile.
    pitch=bpy.data.objects.get('pitch_surface')
    tile=os.path.abspath(os.path.join(os.path.dirname(path),'..','environment','textures','grass-mown.webp'))
    if pitch and os.path.isfile(tile):
        mat=bpy.data.materials.new('preview_existing_environment_grass');mat.use_nodes=True
        tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(tile,check_existing=True)
        bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Roughness'].default_value=.95
        mat.node_tree.links.new(tex.outputs['Color'],bsdf.inputs['Base Color'])
        pitch.data.materials.clear();pitch.data.materials.append(mat)
    bpy.ops.object.camera_add(location=center+direction*extent*3)
    camera=bpy.context.object;camera.name='preview_camera'
    camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'; bpy.context.view_layer.update()
    local=[camera.matrix_world.inverted()@v for v in vs]
    width=max(v.x for v in local)-min(v.x for v in local)
    height=max(v.y for v in local)-min(v.y for v in local)
    camera.data.ortho_scale=max(width,height)*1.22
    camera.data.lens=55;camera.data.clip_end=max(1000,extent*20)
    scene=bpy.context.scene;scene.camera=camera
    # The ground is preview-only and is never exported to the asset.
    bpy.ops.mesh.primitive_plane_add(size=extent*200,location=(center.x,center.y,lo.z-.008*max(1,extent)))
    ground=bpy.context.object;ground.name='preview_ground'
    m=bpy.data.materials.new('preview_ground_material');m.diffuse_color=rgba('#CBD8DF');m.use_nodes=True
    m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=rgba('#CBD8DF')
    m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.85
    ground.data.materials.append(m)
    for label,position,energy,size in (
        ('key',(-1.5,-2,3),150,2),('fill',(2,-.5,1.5),65,2),('rim',(.5,2,2.7),110,1.5)):
        bpy.ops.object.light_add(type='AREA',location=center+Vector(position)*extent)
        light=bpy.context.object;light.name=label
        light.data.energy=energy*extent*extent;light.data.shape='DISK';light.data.size=size*extent
        light.rotation_euler=(center-light.location).to_track_quat('-Z','Y').to_euler()
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.65,.73,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.30
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
    scene.render.image_settings.compression=100
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    scene.render.film_transparent=False
    scene.render.filepath=path.replace('.glb','.png')
    bpy.ops.render.render(write_still=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--models',required=True);p.add_argument('--asset')
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
    for name in sorted(os.listdir(a.models)):
        if name.endswith('.glb') and (not a.asset or name==a.asset+'.glb'):
            render(os.path.abspath(os.path.join(a.models,name)))
