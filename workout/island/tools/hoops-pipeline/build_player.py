"""Builds one adult basketball player in Blender from MakeHuman (MPFB) CC0 assets.

Usage: blender -b --factory-startup --python build_player.py -- <spec.json> <out.glb>
The spec says body macros, skin, hair, eyebrows and a seed for small face targets.
Uniforms are added by uniform.py from the body itself; this script only writes the .blend.
"""
import sys, os, json, random
sys.path.insert(0, os.path.dirname(__file__))
from common import enable, imp
import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
spec = json.load(open(argv[0]))
out_blend = argv[1]

enable()
HS = imp("mpfb.services.humanservice", "HumanService")
AS = imp("mpfb.services.assetservice", "AssetService")
HOP = imp("mpfb.entities.objectproperties", "HumanObjectProperties")
TS = imp("mpfb.services.targetservice", "TargetService")
LS = imp("mpfb.services.locationservice", "LocationService")

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)

h = HS.create_human()
for key, value in spec['macro'].items():
    HOP.set_value(key, value, entity_reference=h)
TS.reapply_macro_details(h)


def body_height():
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    e = h.evaluated_get(dg)
    m = e.to_mesh()
    gi = h.vertex_groups['body'].index
    zs = [(h.matrix_world @ m.vertices[v.index].co).z for v in h.data.vertices if any(g.group == gi for g in v.groups)]
    e.to_mesh_clear()
    return max(zs) - min(zs)


if spec.get('targetHeight'):
    lo, hi = 0.0, 1.0
    for _ in range(9):
        mid = (lo + hi) / 2
        HOP.set_value('height', mid, entity_reference=h)
        TS.reapply_macro_details(h)
        if body_height() < spec['targetHeight']:
            lo = mid
        else:
            hi = mid
    HOP.set_value('height', (lo + hi) / 2, entity_reference=h)
    TS.reapply_macro_details(h)
print('BODY HEIGHT', round(body_height(), 3))

rng = random.Random(spec.get('seed', 1))
targets_root = LS.get_mpfb_data("targets")
face = spec.get('face', {})
for rel, weight in face.items():
    path = os.path.join(targets_root, rel + '.target.gz')
    if os.path.exists(path):
        TS.load_target(h, path, weight=weight)
    else:
        print('MISSING TARGET', rel)

skin = AS.find_asset_absolute_path(spec['skin'] + '.mhmat', asset_subdir='skins')
HS.set_character_skin(skin, h, skin_type="GAMEENGINE")
rig = HS.add_builtin_rig(h, "mixamo")

assets = [("eyes", "low-poly.mhclo", "Eyes"),
          ("eyebrows", spec.get('eyebrows', 'eyebrow001') + ".mhclo", "Eyebrows"),
          ("eyelashes", "eyelashes01.mhclo", "Eyelashes"),
          ("clothes", spec.get('shoes', 'shoes06') + ".mhclo", "Clothes")]
if spec.get('hair'):
    assets.append(("hair", spec['hair'] + ".mhclo", "Hair"))
for sub, fname, kind in assets:
    p = AS.find_asset_absolute_path(fname, asset_subdir=sub)
    if not p:
        print('MISSING ASSET', fname)
        continue
    HS.add_mhclo_asset(p, h, asset_type=kind, material_type="GAMEENGINE", subdiv_levels=0)

bpy.ops.wm.save_as_mainfile(filepath=out_blend)
print('SAVED', out_blend, [o.name for o in bpy.data.objects])
