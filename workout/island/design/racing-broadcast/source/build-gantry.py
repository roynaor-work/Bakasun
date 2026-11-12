"""Original CC0 geometry. Run: blender --background --python source/build-gantry.py.

Blender Z-up is exported as glTF Y-up; the lamps face glTF +Z.
No textures, linked assets, font outlines, compression, or external dependencies.
"""
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, metallic=0, roughness=.4, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = 1
    return mat


navy = material('frame_navy', (.018, .042, .065), .5)
steel = material('truss_silver', (.26, .34, .39), .7, .32)
dark = material('housing_graphite', (.006, .009, .014), .15)
teal = material('trim_teal', (.015, .48, .44), .3)


def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def box(name, center, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat)


def rod(name, a, b, radius=.07, mat=steel, sides=6):
    delta = Vector(b) - Vector(a)
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius,
                                      depth=delta.length, end_fill_type='NGON',
                                      location=(Vector(a) + Vector(b)) / 2)
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return finish(obj, name, mat)


# Two light square truss towers; the clear opening is 12.3 m wide.
for side in (-1, 1):
    x = side * 6.5
    box('foot', (x, 0, .1), (1.15, 1.35, .2), navy)
    box('foot_trim', (x, -.68, .15), (.95, .025, .08), teal)
    for dx in (-.25, .25):
        for y in (-.3, .3):
            rod('tower_chord', (x+dx, y, .2), (x+dx, y, 5.65), .065)
    for z in (1.25, 2.35, 3.45, 4.55, 5.65):
        for y in (-.3, .3):
            rod('tower_brace', (x-.25, y, z-1.05), (x+.25, y, z), .04)
    box('tower_sleeve', (x, 0, .48), (.65, .75, .55), navy)

# Overhead truss with diagonal bracing, visible above the signal panel.
for y in (-.3, .3):
    for z in (5.15, 5.7):
        rod('span_chord', (-6.5, y, z), (6.5, y, z), .075)
    for n in range(13):
        x = -6.5+n
        rod('span_brace', (x, y, 5.15), (x+1, y, 5.7), .035)

box('signal_panel', (0, -.05, 4.8), (8.1, .65, 1.18), navy)
box('top_teal_rail', (0, -.39, 5.38), (8.1, .035, .055), teal)
box('bottom_silver_rail', (0, -.39, 4.23), (8.1, .035, .045), steel)
for x in (-3.5, 3.5):
    box('signal_hanger', (x, .08, 5.35), (.12, .2, .75), steel)

for i in range(5):
    x = (i-2)*1.5
    rod('lamp_bezel', (x, -.38, 4.8), (x, -.48, 4.8), .50, dark, 24)
    # A slim metal rim and a separately addressable shallow lens.
    rod('lamp_rim', (x, -.485, 4.8), (x, -.505, 4.8), .43, steel, 24)
    lamp = material('lamp'+str(i+1), (.09, .002, .002), .1, .24,
                    emission=(1, .012, .004))
    lens = rod('lamp'+str(i+1), (x, -.51, 4.8), (x, -.55, 4.8), .38, lamp, 24)
    lens['control'] = 'Set material.emissiveIntensity to 0 (off) or 1 (on).'
    lens['order'] = i+1

# Join structural parts by material, keeping each lamp as its own named mesh.
for mat in (navy, steel, dark, teal):
    bpy.ops.object.select_all(action='DESELECT')
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH'
             and o.data.materials and o.data.materials[0] == mat]
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    bpy.context.object.name = mat.name

for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    triangulate = obj.modifiers.new('Explicit triangles', 'TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    obj.select_set(False)

triangles = sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH')
assert triangles <= 3000, triangles
bpy.context.scene['license'] = 'CC0-1.0; original geometry; see LICENSES.md'
bpy.context.scene['placement'] = 'Origin on ground at span center; +Y up, lamps face +Z after glTF export.'
bpy.ops.export_scene.gltf(filepath=str(ROOT/'assets/start-gantry.glb'),
                          export_format='GLB', export_yup=True,
                          export_draco_mesh_compression_enable=False,
                          export_texcoords=False, export_normals=True,
                          export_animations=False, export_extras=True,
                          export_cameras=False, export_lights=False)
print('GANTRY_TRIANGLES='+str(triangles))
