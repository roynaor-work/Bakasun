"""Offline fixture preparation. Run with Blender 4.3; no runtime build required.

Sources stay untouched. Atlas, joined meshes, Draco, and two human LODs keep
the camera review representative of a twelve-player mobile scene.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DESIGN = ROOT.parent
OUT = ROOT / 'assets'
records = {}

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)

def select(objects, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active or objects[0]

def export(name, objects, animations=False):
    select(objects)
    path = OUT / name
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB',
        use_selection=True, export_animations=animations,
        export_animation_mode='ACTIONS', export_skins=True,
        export_draco_mesh_compression_enable=False,
        export_image_format='AUTO', export_extras=True)
    records[name] = {'bytes': path.stat().st_size,
        'triangles': sum(triangles(o) for o in objects if o.type == 'MESH')}

def decimate(obj, ratio):
    select([obj])
    mod = obj.modifiers.new('Mobile triangle budget', 'DECIMATE')
    mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=mod.name)

def prepare_athlete():
    reset()
    bpy.ops.import_scene.gltf(filepath='/tmp/broadcast-decoded/athlete.glb')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    rig = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    # Bind the original source images to their original UVs before unwrapping.
    for obj in meshes:
        for mat in obj.data.materials:
            if not mat.use_nodes:
                continue
            for node in list(mat.node_tree.nodes):
                if node.type == 'TEX_IMAGE' and not node.inputs['Vector'].is_linked:
                    uv = mat.node_tree.nodes.new('ShaderNodeUVMap')
                    uv.uv_map = obj.data.uv_layers[0].name
                    mat.node_tree.links.new(uv.outputs[0], node.inputs['Vector'])
            if mat.name == 'team_primary':
                bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
                bsdf.inputs['Base Color'].default_value = (.65, .65, .65, 1)
    select(meshes, meshes[0])
    bpy.ops.object.join()
    actor = bpy.context.object
    actor.name = 'Athlete'
    uv = actor.data.uv_layers.new(name='BroadcastAtlas')
    actor.data.uv_layers.active = uv
    uv.active_render = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.012)
    bpy.ops.object.mode_set(mode='OBJECT')
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 5
    atlas = bpy.data.images.new('Athlete_albedo', width=1024, height=1024, alpha=True)
    atlas.generated_color = (.06, .08, .1, 1)
    normal = bpy.data.images.new('Athlete_normal', width=1024, height=1024)
    normal.colorspace_settings.name = 'Non-Color'
    targets = []
    for mat in actor.data.materials:
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        target = nodes.new('ShaderNodeTexImage')
        target.image = atlas
        nodes.active = target
        targets.append((nodes, target))
        # A subtle fabric normal is baked only on the generic clothing materials.
        if any(key in mat.name.lower() for key in ['team_', 'jersey', 'short']):
            bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bsdf:
                noise = nodes.new('ShaderNodeTexNoise')
                noise.inputs['Scale'].default_value = 270
                noise.inputs['Detail'].default_value = 1
                bump = nodes.new('ShaderNodeBump')
                bump.inputs['Strength'].default_value = .22
                bump.inputs['Distance'].default_value = .002
                mat.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
                mat.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    select([actor])
    bpy.ops.object.bake(type='DIFFUSE')
    for nodes, target in targets:
        target.image = normal
        nodes.active = target
    bpy.ops.object.bake(type='NORMAL')
    # Opaque albedo alpha stores a clothing tint mask. It is NOT transparency.
    # Both teams consequently use the exact same atlas and geometry.
    mask = bpy.data.images.new('Clothing mask', width=1024, height=1024)
    restore = []
    for mat, (nodes, target) in zip(actor.data.materials, targets):
        target.image = mask; nodes.active = target
        output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
        restore.append((mat, output, output.inputs['Surface'].links[0].from_socket))
        emission = nodes.new('ShaderNodeEmission')
        value = 1 if mat.name == 'team_primary' else 0
        emission.inputs['Color'].default_value = (value, value, value, 1)
        mat.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    bpy.ops.object.bake(type='EMIT')
    pixels = list(atlas.pixels[:]); mask_pixels = mask.pixels[:]
    for i in range(0, len(pixels), 4):
        pixels[i + 3] = 1 - mask_pixels[i] * .5
    atlas.pixels[:] = pixels
    for mat, output, socket in restore:
        mat.node_tree.links.new(socket, output.inputs['Surface'])
    for image, filename in [(atlas, 'athlete-albedo.png'), (normal, 'athlete-normal.png')]:
        image.filepath_raw = str(OUT / filename)
        image.file_format = 'PNG'
        image.save()
        image.pack()
    mat = bpy.data.materials.new('Athlete · one UV atlas')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .68
    tex = nodes.new('ShaderNodeTexImage'); tex.image = atlas
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    texn = nodes.new('ShaderNodeTexImage'); texn.image = normal
    normalnode = nodes.new('ShaderNodeNormalMap')
    normalnode.inputs['Strength'].default_value = .55
    mat.node_tree.links.new(texn.outputs['Color'], normalnode.inputs['Color'])
    mat.node_tree.links.new(normalnode.outputs['Normal'], bsdf.inputs['Normal'])
    for polygon in actor.data.polygons:
        polygon.material_index = 0
    actor.data.materials.clear(); actor.data.materials.append(mat)
    # Make the atlas the sole UV channel after source baking.
    for layer in list(actor.data.uv_layers):
        if layer.name != 'BroadcastAtlas':
            actor.data.uv_layers.remove(layer)
    actor['fixture'] = 'Generic fictional athlete; existing MakeHuman geometry and CMU-derived clips'
    export('athlete-lod0.glb', [actor, rig], True)
    decimate(actor, .49)
    export('athlete-lod1.glb', [actor, rig], True)
    # A static, strongly reduced copy for one instanced crowd draw call.
    rig.animation_data_clear()
    select([actor]); bpy.ops.object.convert(target='MESH')
    actor = bpy.context.object
    actor.parent = None
    decimate(actor, .095)
    actor.name = 'Spectator'
    export('spectator.glb', [actor])

import sys
if "--stages-only" not in sys.argv:
    prepare_athlete()
else:
    records.update(json.loads((OUT / "geometry.json").read_text()))

for sport, source in [('soccer', 'soccer-v4/soccer-stadium.glb'),
                      ('basketball', 'hoops/lod-v4/hoops-v4-arena-lod.glb')]:
    reset()
    bpy.ops.import_scene.gltf(filepath='/tmp/broadcast-decoded/' + sport + '.glb')
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for obj in list(meshes):
        if any(key in obj.name.lower() for key in ['crowd', 'field_markings', 'court_markings', 'court_surface', 'painted_keys', 'lighting_trusses', 'hanging_scoreboard']) or (sport == 'basketball' and 'floodlights' in obj.name.lower()):
            bpy.data.objects.remove(obj, do_unlink=True)
            meshes.remove(obj)
        elif triangles(obj) > 2000:
            decimate(obj, .18 if 'pitch_surface' in obj.name else .32)
    select(meshes, meshes[0]); bpy.ops.object.join()
    stadium = bpy.context.object
    stadium.name = sport + '_stage'
    stadium['source'] = source
    export(sport + '-stage.glb', [stadium])

(OUT / 'geometry.json').write_text(json.dumps(records, indent=2) + '\n')
print('BROADCAST_FIXTURES', json.dumps(records))
