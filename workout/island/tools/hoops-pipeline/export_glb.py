"""Bakes an MPFB character (.blend) and exports a skinned GLB.
blender -b in.blend --python export_glb.py -- out.glb
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from common import enable, imp
import bpy

out = sys.argv[sys.argv.index('--') + 1:][0]
enable()
ES = imp("mpfb.services.exportservice", "ExportService")
OS = imp("mpfb.services.objectservice", "ObjectService")

base = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name == 'Human')
root = ES.create_character_copy(base, name_suffix="_x")
xb = OS.find_object_of_type_amongst_nearest_relatives(root, "Basemesh")
ES.bake_modifiers_remove_helpers(xb, bake_masks=True, bake_subdiv=True, remove_helpers=True, also_proxy=True)

for o in [root] + list(OS.get_list_of_children(root)):
    if o.type == 'MESH' and o.data.shape_keys:
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
        print('BAKED SHAPEKEYS', o.name)
for o in [root] + list(OS.get_list_of_children(root)):
    if o.type == 'MESH' and len(o.vertex_groups):
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bones = set(b.name for b in root.data.bones) if root.type == 'ARMATURE' else set()
        for g in list(o.vertex_groups):
            if bones and g.name not in bones:
                o.vertex_groups.remove(g)
        bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
        bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
        print('NORMALIZED', o.name)
import uniform
body = next(o for o in OS.get_list_of_children(root) if o.type == 'MESH' and o.name.startswith('Human_x'))
uniform.build(body, root)
for o in list(OS.get_list_of_children(root)):
    if o.type != 'MESH':
        continue
    cut = any(k in o.name for k in ('eyebrow', 'eyelash', 'short0', 'afro', 'hair'))
    for mat in o.data.materials:
        if mat is None:
            continue
        mat.blend_method = 'CLIP' if cut else 'OPAQUE'
        mat.alpha_threshold = 0.4
        if not cut and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    n.inputs['Alpha'].default_value = 1.0
                    for l in list(n.inputs['Alpha'].links):
                        mat.node_tree.links.remove(l)
MAXS = int(os.environ.get('TEX_MAX', '1024'))
for img in bpy.data.images:
    if img.size[0] > MAXS:
        img.scale(MAXS, MAXS)
bpy.ops.object.select_all(action='DESELECT')
keep = [root] + list(OS.get_list_of_children(root))
for o in keep:
    o.select_set(True)
bpy.context.view_layer.objects.active = root
for o in keep:
    if o.type == 'MESH':
        print('MESH', o.name, len(o.data.vertices), len(o.data.polygons))
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_format='GLB',
                          export_skins=True, export_morph=False, export_animations=False,
                          export_apply=False, export_yup=True, export_texcoords=True,
                          export_normals=True, export_vertex_color='ACTIVE', export_image_format='JPEG', export_jpeg_quality=85)
print('EXPORTED', out, os.path.getsize(out))
