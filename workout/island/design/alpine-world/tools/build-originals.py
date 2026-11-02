"""Original glacier wall and atlas-backed powder cards; Blender 4.3+.

Writes only alpine-world/models/{ice-wall,snow-powder}.glb. The pack step
adds the portable glTF powder animation and mandatory Draco compression.
All points below are glTF metres (+Y up, +Z downhill).
"""
import bpy
import bmesh
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / 'models'
MODELS.mkdir(parents=True, exist_ok=True)


def point(p):
    return (p[0], -p[2], p[1])


def linear(c):
    return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for table in (bpy.data.meshes, bpy.data.materials):
        for item in list(table):
            if not item.users:
                table.remove(item)
    root = bpy.data.objects.new('asset_root', None)
    bpy.context.collection.objects.link(root)
    root['units'] = 'metres'
    root['up'] = '+Y'
    root['forward'] = '+Z'
    return root


def palette(name, hex_color, roughness=.4):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    rgb = tuple(linear(int(hex_color[i:i+2], 16) / 255) for i in (0, 2, 4))
    bsdf.inputs['Base Color'].default_value = rgb + (1,)
    bsdf.inputs['Roughness'].default_value = roughness
    return material


def mesh(name, vertices, faces, material, root, smooth=False):
    data = bpy.data.meshes.new(name + '_mesh')
    data.from_pydata([point(p) for p in vertices], [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    data.materials.append(material)
    for face in data.polygons:
        face.use_smooth = smooth
    return obj


def anchor(root, name, p):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    obj.location = point(p)


def export(name):
    bpy.ops.export_scene.gltf(filepath=str(MODELS / (name + '.glb')),
        export_format='GLB', export_yup=True, export_normals=True,
        export_texcoords=True, export_materials='EXPORT', export_extras=True,
        export_animations=False, export_cameras=False, export_lights=False)


def wall():
    root = reset()
    ice = palette('glacier_blue', '89bfd1', .25)
    snow = palette('fresh_snow', 'edf6fa', .94)
    dark = palette('deep_ice_fissure', '407e9a', .35)
    bright = palette('ice_fracture_edge', 'c7e6ef', .22)
    columns, rows = 40, 14

    def top(x):
        return 3.15 + .21 * math.sin(x * 1.8) + .13 * math.cos(x * 3.5)

    def front(x, t):
        return -.68 - .23 * math.cos(x * 4.4) * (.4 + .6 * t) - .12 * math.sin(x * 8.3 + t * 3)

    vertices = []
    # Closed, faceted ice block. Bottom extends 12cm below placement plane.
    for side in range(2):
        for y in range(rows + 1):
            t = y / rows
            for col in range(columns + 1):
                x = -5 + 10 * col / columns
                height = -.12 + (top(x) + .12) * t
                z = front(x, t) if side == 0 else .8 + .08 * math.sin(x * 1.7 + t)
                vertices.append((x, height, z))
    stride = columns + 1
    layer = stride * (rows + 1)
    faces = []
    for side in range(2):
        for y in range(rows):
            for col in range(columns):
                a = side * layer + y * stride + col
                if (y + col) % 2:
                    triangles = [(a, a + 1, a + stride), (a + 1, a + stride + 1, a + stride)]
                else:
                    triangles = [(a, a + 1, a + stride + 1), (a, a + stride + 1, a + stride)]
                faces.extend(triangles if side == 0 else [tuple(reversed(t)) for t in triangles])
    for col in range(columns):
        faces.append((col, col + layer, col + layer + 1, col + 1))
        a = rows * stride + col
        faces.append((a, a + 1, a + layer + 1, a + layer))
    for y in range(rows):
        for col in (0, columns):
            a = y * stride + col
            faces.append((a, a + stride, a + stride + layer, a + layer))
    mesh('sculpted_glacier', vertices, faces, ice, root)

    # Rounded snow cornice follows the irregular upper ridge without borrowing
    # a baked map from another mesh. Longitudinal grid remains deterministic.
    vertices, faces = [], []
    cross = 10
    for col in range(columns + 1):
        x = -5 + 10 * col / columns
        for j in range(cross + 1):
            v = j / cross
            z = front(x, 1) - .09 + (1.01 - front(x, 1)) * v
            y = top(x) - .07 + .27 * math.sin(v * math.pi) ** .65
            vertices.append((x, y, z))
    for col in range(columns):
        for j in range(cross):
            a = col * (cross + 1) + j
            faces.append((a, a + 1, a + cross + 2, a + cross + 1))
    mesh('snow_cornice', vertices, faces, snow, root, True)

    # Geometric fissures are visible even without texture sampling. Each has
    # a narrow shadow and an offset frost lip; all cards lie on the front.
    for i, x0 in enumerate([-4.65, -3.7, -2.5, -1.9, -.65, .35, 1.4, 2.4, 3.1, 4.5]):
        for tone, width, shift in [(dark, .026, 0), (bright, .012, .035)]:
            vertices, faces = [], []
            start = .15 + .09 * (i % 3)
            end = .82 + .045 * (i % 4)
            for j in range(12):
                t = start + (end - start) * j / 11
                x = x0 + .075 * math.sin(j * 1.7 + i) + shift
                y = -.12 + (top(x) + .12) * t
                z = front(x, t) - .009 - shift * .05
                vertices.extend([(x - width, y, z), (x + width, y, z)])
                if j:
                    a = 2 * j
                    faces.append((a - 2, a - 1, a + 1, a))
            mesh('fissure_%02d_%s' % (i, tone.name), vertices, faces, tone, root)
    anchor(root, 'anchor_origin', (0, 0, 0))
    anchor(root, 'anchor_snap_left', (-5, 0, 0))
    anchor(root, 'anchor_snap_right', (5, 0, 0))
    anchor(root, 'anchor_top', (0, top(0) + .2, 0))
    # One mesh, four material groups. Fissure segments do not become dozens
    # of independent draw calls in the delivered wall.
    bpy.ops.object.select_all(action='DESELECT')
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    bpy.context.object.name = 'glacier_wall'
    export('ice-wall')


def powder():
    root = reset()
    material = bpy.data.materials.new('powder_atlas_straight_alpha')
    material.use_nodes = True
    material.surface_render_method = 'DITHERED'
    material.use_transparency_overlap = False
    material.use_backface_culling = False
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = 1
    shader.inputs['Specular IOR Level'].default_value = 0
    texture = material.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(ROOT / 'textures' / 'ski-powder-atlas.png'))
    texture.interpolation = 'Linear'
    material.node_tree.links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    material.node_tree.links.new(texture.outputs['Alpha'], shader.inputs['Alpha'])
    # All frames use a common material and atlas. The pack step sets
    # minification LINEAR and CLAMP_TO_EDGE, disabling mip bleeding.
    for frame in range(16):
        vertices, faces = [], []
        for plane in range(3):
            a = plane * math.pi / 3
            dx, dz = .85 * math.cos(a), .85 * math.sin(a)
            base = len(vertices)
            vertices.extend([(-dx, .02, -dz), (dx, .02, dz), (dx, 1.42, dz), (-dx, 1.42, -dz)])
            faces.append((base, base + 1, base + 2, base + 3))
        obj = mesh('powder_frame_%02d' % frame, vertices, faces, material, root)
        uv = obj.data.uv_layers.new(name='TEXCOORD_0')
        inset = .5 / 384
        u0, v0 = (frame % 4) / 4 + inset, (3 - frame // 4) / 4 + inset
        u1, v1 = u0 + .25 - 2 * inset, v0 + .25 - 2 * inset
        for face in obj.data.polygons:
            for loop, value in zip(face.loop_indices, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]):
                uv.data[loop].uv = value
        obj['frame'] = frame
        obj['straightAlpha'] = True
        obj['depthWrite'] = False
        obj.scale = (1, 1, 1) if frame == 7 else (0, 0, 0)
    anchor(root, 'anchor_emitter', (0, .02, 0))
    root['presentationOnly'] = True
    root['durationSeconds'] = .8
    export('snow-powder')


wall()
powder()
