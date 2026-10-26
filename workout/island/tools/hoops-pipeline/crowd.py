"""Renders seated spectators (MakeHuman CC0 people in casual clothes) into a sprite atlas.
blender -b --factory-startup --python crowd.py -- out_dir count
Each spectator gets two poses: seated (hands on knees) and cheering (arms up).
"""
import sys, os, json, random, math
sys.path.insert(0, os.path.dirname(__file__))
from common import enable, imp
import bpy
from mathutils import Euler, Vector

args = sys.argv[sys.argv.index('--') + 1:]
out_dir, count = args[0], int(args[1])
only = int(args[2]) if len(args) > 2 else None
os.makedirs(out_dir, exist_ok=True)
enable()
HS = imp("mpfb.services.humanservice", "HumanService")
AS = imp("mpfb.services.assetservice", "AssetService")
HOP = imp("mpfb.entities.objectproperties", "HumanObjectProperties")
TS = imp("mpfb.services.targetservice", "TargetService")

SKINS_M = ['young_african_male', 'young_caucasian_male', 'young_asian_male', 'middleage_caucasian_male', 'middleage_african_male', 'middleage_asian_male']
SKINS_F = ['young_african_female', 'young_caucasian_female', 'young_asian_female', 'middleage_caucasian_female', 'middleage_african_female']
HAIR_M = ['short01', 'short02', 'short03', 'short04', 'afro01', None]
HAIR_F = ['long01', 'ponytail01', 'bob01', 'bob02', 'braid01', 'afro01']
CLOTH_M = ['male_casualsuit01', 'male_casualsuit03', 'male_casualsuit05']
CLOTH_F = ['male_casualsuit01', 'male_casualsuit03', 'male_casualsuit05']

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x = 128
scene.render.resolution_y = 192
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.view_settings.view_transform = 'Standard'


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def setup_light_cam():
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = 1.75
    co = bpy.data.objects.new('cam', cam)
    bpy.context.collection.objects.link(co)
    co.location = (0, -6, 0.62)
    co.rotation_euler = Euler((math.radians(90), 0, 0))
    scene.camera = co
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3.2
    so = bpy.data.objects.new('sun', sun)
    so.rotation_euler = Euler((math.radians(50), math.radians(-20), math.radians(-25)))
    bpy.context.collection.objects.link(so)
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.55
    scene.world = world


def pose(rig, cheer):
    pb = rig.pose.bones
    P = 'mixamorig:'

    def rot(name, x=0, y=0, z=0):
        b = pb[P + name]
        b.rotation_mode = 'XYZ'
        b.rotation_euler = Euler((math.radians(x), math.radians(y), math.radians(z)))
    for b in pb:
        b.rotation_mode = 'XYZ'
        b.rotation_euler = Euler((0, 0, 0))
    rot('LeftUpLeg', 86, 0, -6)
    rot('RightUpLeg', 86, 0, 6)
    rot('LeftLeg', -90, 0, 0)
    rot('RightLeg', -90, 0, 0)
    rot('LeftFoot', 10, 0, 0)
    rot('RightFoot', 10, 0, 0)
    rot('Spine', -4, 0, 0)
    if cheer:
        rot('LeftArm', -25, 0, 100)
        rot('RightArm', -25, 0, -100)
        rot('LeftForeArm', 0, 0, 20)
        rot('RightForeArm', 0, 0, -20)
    else:
        rot('LeftArm', 55, 0, -10)
        rot('RightArm', 55, 0, 10)
        rot('LeftForeArm', 30, 0, 0)
        rot('RightForeArm', 30, 0, 0)
    bpy.context.view_layer.update()


rng = random.Random(77)
setup_light_cam()
meta = []
for i in range(count):
    female = rng.random() < 0.42
    if only is not None and i != only:
        rng.random(); rng.random(); rng.random(); rng.random(); rng.random(); rng.random(); rng.random()
        continue
    for o in [o for o in bpy.data.objects if o.type in ('MESH', 'ARMATURE')]:
        bpy.data.objects.remove(o, do_unlink=True)
    h = HS.create_human()
    eth = [rng.random() for _ in range(3)]
    s = sum(eth)
    macro = dict(gender=0.0 if female else 1.0, age=0.3 + rng.random() * 0.45, muscle=0.3 + rng.random() * 0.5,
                 weight=0.3 + rng.random() * 0.6, height=0.3 + rng.random() * 0.5,
                 african=eth[0] / s, asian=eth[1] / s, caucasian=eth[2] / s)
    for k, v in macro.items():
        HOP.set_value(k, v, entity_reference=h)
    TS.reapply_macro_details(h)
    skin = rng.choice(SKINS_F if female else SKINS_M)
    dom = max(range(3), key=lambda k: eth[k])
    pref = ['african', 'asian', 'caucasian'][dom]
    cands = [x for x in (SKINS_F if female else SKINS_M) if pref in x]
    if cands:
        skin = rng.choice(cands)
    HS.set_character_skin(AS.find_asset_absolute_path(skin + '.mhmat', asset_subdir='skins'), h, skin_type='GAMEENGINE')
    rig = HS.add_builtin_rig(h, 'mixamo')
    hair = rng.choice(HAIR_F if female else HAIR_M)
    items = [('eyes', 'low-poly.mhclo', 'Eyes'), ('eyebrows', 'eyebrow00%d.mhclo' % rng.randint(1, 6), 'Eyebrows'),
             ('clothes', rng.choice(CLOTH_F if female else CLOTH_M) + '.mhclo', 'Clothes'), ('clothes', 'shoes0%d.mhclo' % rng.randint(1, 4), 'Clothes')]
    if hair:
        items.append(('hair', hair + '.mhclo', 'Hair'))
    for sub, fname, kind in items:
        p = AS.find_asset_absolute_path(fname, asset_subdir=sub)
        if p:
            HS.add_mhclo_asset(p, h, asset_type=kind, material_type='GAMEENGINE', subdiv_levels=0)
    # recolour tops so the stands look varied (team colours dominate)
    hue = rng.random()
    for o in bpy.data.objects:
        if o.type == 'MESH' and 'casualsuit' in o.name:
            for mat in o.data.materials:
                if mat and mat.use_nodes:
                    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                    if bsdf:
                        mix = mat.node_tree.nodes.new('ShaderNodeHueSaturation')
                        mix.inputs['Hue'].default_value = 0.5 + (hue - 0.5) * 0.25
                        mix.inputs['Saturation'].default_value = 0.8 + rng.random() * 0.5
                        src = bsdf.inputs['Base Color'].links[0].from_socket if bsdf.inputs['Base Color'].links else None
                        if src:
                            mat.node_tree.links.new(src, mix.inputs['Color'])
                            mat.node_tree.links.new(mix.outputs['Color'], bsdf.inputs['Base Color'])
        if o.type == 'MESH':
            for mat in o.data.materials:
                if mat:
                    mat.blend_method = 'HASHED' if any(k in o.name for k in ('hair', 'short', 'long', 'bob', 'braid', 'pony', 'afro', 'eyebrow', 'eyelash')) else 'OPAQUE'
    for cheer in (0, 1):
        pose(rig, cheer)
        # sitting: drop the body so the hips sit at the seat
        rig.location.z = -0.45
        scene.render.filepath = os.path.join(out_dir, 'p%02d_%d.png' % (i, cheer))
        bpy.ops.render.render(write_still=True)
    meta.append({'i': i, 'female': female, 'skin': skin, 'hair': hair})
    print('RENDERED', i, female, skin, hair, flush=True)
json.dump(meta, open(os.path.join(out_dir, 'meta.json'), 'w'), indent=1)
