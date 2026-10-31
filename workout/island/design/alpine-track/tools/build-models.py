"""Original Alpine track props. Blender 5.2, no external packages or downloads.

Run: blender -b --factory-startup --python <this file>
Only models/*.glb and models.json beside this package are written.
All authoring values below are already glTF metres: +Y up, +Z downhill.
"""
import bpy
import bmesh
import math
import json
import hashlib
import struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'models'
OUT.mkdir(parents=True, exist_ok=True)
COLORS = {'snow': '#e7f2f6', 'fresh': '#f5f9fa', 'ice': '#9ecddd',
          'navy': '#203d52', 'coral': '#f47b62', 'mint': '#4ccbb5',
          'steel': '#64899c', 'rope': '#e8dbc0'}
MODELS = []


def blender(p):
    return (p[0], -p[2], p[1])


def gltf(p):
    return (p[0], p[2], -p[1])


def linear(v):
    return v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4


def color(key):
    h = COLORS.get(key, key).lstrip('#')
    return [linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]


def reset():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials):
        for item in list(collection):
            if not item.users:
                collection.remove(item)
    material = bpy.data.materials.new('alpine_vertex_palette')
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = .86
    vertex = material.node_tree.nodes.new('ShaderNodeVertexColor')
    vertex.layer_name = 'COLOR_0'
    material.node_tree.links.new(vertex.outputs['Color'], shader.inputs['Base Color'])
    return material


def finish_mesh(obj, tone, smooth=False):
    # Original geometry gets a subtle normal-based ambient shade, carried in
    # COLOR_0. No baked texture is borrowed from a different mesh/UV layout.
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=.0001)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    obj.data.materials.append(bpy.data.materials['alpine_vertex_palette'])
    colors = obj.data.color_attributes.new(name='COLOR_0', type='BYTE_COLOR', domain='CORNER')
    for layer in list(obj.data.uv_layers):
        obj.data.uv_layers.remove(layer)
    uv = obj.data.uv_layers.new(name='TEXCOORD_0')
    base = color(tone)
    points = [gltf(v.co) for v in obj.data.vertices]
    mins = [min(v[i] for v in points) for i in range(3)]
    spans = [max(v[i] for v in points) - mins[i] for i in range(3)]
    for face in obj.data.polygons:
        normal = gltf(face.normal)
        shade = .88 + .12 * max(0, normal[1])
        if normal[1] < -.4:
            shade = .74
        dominant = max(range(3), key=lambda i: abs(normal[i]))
        # Every upward snow face shares u across +X and v downhill +Z,
        # including steep curved walls. Separate vertical sides/end caps use
        # dominant-axis UVs so no face collapses to a line in UV space.
        axes = (0, 2) if tone in ('snow', 'fresh') and normal[1] > .02 else (2, 1) if dominant == 0 else (0, 2) if dominant == 1 else (0, 1)
        face.use_smooth = smooth
        for loop_id in face.loop_indices:
            p = points[obj.data.loops[loop_id].vertex_index]
            uv.data[loop_id].uv = tuple((p[a] - mins[a]) / max(spans[a], .00001) for a in axes)
            colors.data[loop_id].color = tuple(c * shade for c in base) + (1,)
    return obj


def mesh(name, vertices, faces, tone='snow', smooth=False):
    data = bpy.data.meshes.new(name + '_mesh')
    data.from_pydata([blender(p) for p in vertices], [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return finish_mesh(obj, tone, smooth)


def box(name, center, size, tone, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=blender(center))
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if bevel:
        mod = obj.modifiers.new('small_original_edge_rounding', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish_mesh(obj, tone)


def tube(name, a, b, radius, tone, sides=8):
    a, b = Vector(a), Vector(b)
    axis = (b - a).normalized()
    first = axis.cross(Vector((0, 1, 0)) if abs(axis.y) < .95 else Vector((1, 0, 0))).normalized()
    second = axis.cross(first).normalized()
    vertices = []
    for p in (a, b):
        for i in range(sides):
            vertices.append(tuple(p + radius * (first * math.cos(i * math.tau / sides) + second * math.sin(i * math.tau / sides))))
    faces = [tuple(reversed(range(sides))), tuple(range(sides, sides * 2))]
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((i, j, j + sides, i + sides))
    return mesh(name, vertices, faces, tone, True)


def prism(name, polygon, front_z, depth, tone):
    # Polygon in local X/Y, extruded along Z; no lettering or logos.
    vertices = [(x, y, z) for z in (front_z, front_z + depth) for x, y in polygon]
    n = len(polygon)
    faces = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, j + n, i + n))
    return mesh(name, vertices, faces, tone)


def ramp(asset_id, width, length, rise, kicker=False):
    reset()
    columns = [-width / 2, -width / 2 + .06, -width / 2 + .18, 0, width / 2 - .18, width / 2 - .06, width / 2]
    offsets = [-.10, -.025, 0, 0, 0, -.025, -.10]
    segments = 32 if not kicker else 28
    curve = lambda t: rise * ((.15 * t * t + .85 * t ** 3) if kicker else t * t)
    vertices = [(x, curve(j / segments) + offsets[k], length * j / segments)
                for j in range(segments + 1) for k, x in enumerate(columns)]
    top_count = len(vertices)
    # Flat buried base makes a solid wedge; surface snap points remain y=0.
    vertices += [(x, -.18, length * j / segments) for j in range(segments + 1) for x in columns]
    faces = []
    K = len(columns)
    for j in range(segments):
        for k in range(K - 1):
            a = j * K + k
            faces.append((a, a + K, a + K + 1, a + 1))
            a += top_count
            faces.append((a, a + 1, a + K + 1, a + K))
        left = j * K
        right = left + K - 1
        faces.extend([(left, left + top_count, left + K + top_count, left + K),
                      (right, right + K, right + K + top_count, right + top_count)])
    for k in range(K - 1):
        faces.append((k, k + 1, k + 1 + top_count, k + top_count))
        a = segments * K + k
        faces.append((a, a + top_count, a + 1 + top_count, a + 1))
    body = mesh('kicker_snow' if kicker else 'ramp_snow', vertices, faces, 'fresh', True)
    # Raised narrow guide edges follow the exact same curve and stay outside
    # the central clear width. They add no copied geometry or texture.
    for side in (-1, 1):
        v = []
        for j in range(segments + 1):
            t = j / segments
            for dx in (-.045, .045):
                v.append((side * (width / 2 - .24) + dx, curve(t) + .012, length * t))
        f = [(j * 2, j * 2 + 2, j * 2 + 3, j * 2 + 1) for j in range(segments)]
        mesh('guide_edge', v, f, 'coral' if kicker else 'mint')
    angle = math.degrees(math.atan(rise * (2.85 if kicker else 2) / length))
    export(asset_id, {'anchor_origin': [0, 0, 0], 'anchor_approach': [0, 0, 0],
                     'anchor_takeoff': [0, rise, length], 'anchor_center': [0, curve(.5), length / 2]},
           {'width': width, 'length': length, 'rise': rise, 'clearWidth': width - .6, 'takeoffSlopeDegrees': round(angle, 4), 'buriedBaseDepth': .18},
           'Smooth curved snow ramp; +Z downhill. Join by the approach/takeoff surface anchors. The underside is intentionally 0.18m below the placement plane.')


def halfpipe():
    reset()
    F, R, angle, rounding, length = 6.5, 4.2, math.radians(70), .25, 12
    right = [(0, 0), (F / 2, 0), (F, 0)]
    for i in range(1, 33):
        a = angle * i / 32
        right.append((F + R * math.sin(a), R * (1 - math.cos(a))))
    lip_x, lip_y = right[-1]
    for i in range(1, 7):
        a = angle * (1 - i / 6)
        right.append((lip_x + rounding * (math.sin(angle) - math.sin(a)), lip_y + rounding * (math.cos(a) - math.cos(angle))))
    deck_x, deck_y = right[-1]
    right.append((deck_x + 1, deck_y))
    profile = [(-x, y) for x, y in reversed(right[1:])] + right
    sections, K = 4, len(profile)
    vertices = [(x, y, length * j / sections) for j in range(sections + 1) for x, y in profile]
    top_count = len(vertices)
    vertices += [(x, y - .3, length * j / sections) for j in range(sections + 1) for x, y in profile]
    faces = []
    for j in range(sections):
        for k in range(K - 1):
            a = j * K + k
            faces.append((a, a + K, a + K + 1, a + 1))
            b = a + top_count
            faces.append((b, b + 1, b + K + 1, b + K))
        a = j * K
        b = a + K - 1
        faces.extend([(a, a + top_count, a + K + top_count, a + K), (b, b + K, b + K + top_count, b + top_count)])
    for k in range(K - 1):
        faces.append((k, k + 1, k + 1 + top_count, k + top_count))
        a = sections * K + k
        faces.append((a, a + top_count, a + 1 + top_count, a + 1))
    mesh('rounded_halfpipe_shell', vertices, faces, 'snow', True)
    export('halfpipe-segment', {'anchor_origin': [0, 0, 0], 'anchor_route_start': [0, 0, 0], 'anchor_route_end': [0, 0, length],
                              'anchor_left_lip_start': [-lip_x, lip_y, 0], 'anchor_right_lip_start': [lip_x, lip_y, 0],
                              'anchor_left_deck_start': [-deck_x, deck_y, 0], 'anchor_right_deck_start': [deck_x, deck_y, 0]},
           {'length': length, 'flatHalfWidth': F, 'wallRadius': R, 'maxWallAngleDegrees': 70, 'roundedLipRadius': rounding,
            'wallLipHeight': lip_y, 'deckHeight': deck_y, 'deckWidthEachSide': 1, 'shellThicknessVertical': .3},
           'Straight local halfpipe module with rounded lips. Endpoints have identical cross-sections and can snap directly along +Z. Local centerline grade is zero; world descent is supplied by placement, not baked twice.')


def mogul():
    reset()
    sides, rings, rx, rz, height = 24, 8, 1.8, 2.5, .65
    vertices = [(0, height, 0)]
    for j in range(1, rings + 1):
        r = j / rings
        for i in range(sides):
            a = i * math.tau / sides
            vertices.append((rx * r * math.cos(a), height * (1 - r * r) ** 2, rz * r * math.sin(a)))
    bottom = len(vertices)
    vertices.append((0, 0, 0))
    faces = []
    for i in range(sides):
        faces.append((0, 1 + i, 1 + (i + 1) % sides))
    for j in range(rings - 1):
        a = 1 + j * sides
        for i in range(sides):
            k = (i + 1) % sides
            faces.append((a + i, a + sides + i, a + sides + k, a + k))
    a = 1 + (rings - 1) * sides
    for i in range(sides):
        faces.append((bottom, a + (i + 1) % sides, a + i))
    mesh('instanced_mogul', vertices, faces, 'fresh', True)
    export('mogul', {'anchor_origin': [0, 0, 0], 'anchor_peak': [0, height, 0], 'anchor_front': [0, 0, -rz], 'anchor_back': [0, 0, rz]},
           {'width': rx * 2, 'length': rz * 2, 'height': height, 'instancingReady': True, 'singleMesh': True},
           'Original smooth elliptical snow bump. Surface meets the ground with zero slope at its perimeter. One mesh/material, centered origin, no attached markers; suitable for shared-geometry instances.')


def post(x=0, name='rope_post'):
    tube(name + '_foot', [x, 0, 0], [x, .08, 0], .16, 'steel', 10)
    tube(name + '_shaft', [x, .06, 0], [x, 1.25, 0], .055, 'coral', 10)
    tube(name + '_reflector', [x, .88, 0], [x, 1.04, 0], .058, 'fresh', 10)
    tube(name + '_cap', [x, 1.20, 0], [x, 1.26, 0], .064, 'navy', 10)


def markers():
    reset()
    post()
    export('rope-post', {'anchor_origin': [0, 0, 0], 'anchor_rope': [0, 1.1, 0]},
           {'height': 1.26, 'footDiameter': .32, 'ropeHeight': 1.1}, 'Standalone original reflective rope post, base at y=0.')
    reset()
    post(-4, 'left_post')
    post(4, 'right_post')
    y = lambda x: .94 + .16 * (x / 4) ** 2
    for i in range(12):
        x0, x1 = -4 + i * 8 / 12, -4 + (i + 1) * 8 / 12
        tube('sagging_rope', [x0, y(x0), 0], [x1, y(x1), 0], .021, 'rope', 6)
    for i in range(7):
        x = -3 + i
        mesh('route_flag', [(x - .17, y(x), 0), (x + .17, y(x), 0), (x + .07, y(x) - .35, .045),
                            (x - .17, y(x), .012), (x + .17, y(x), .012), (x + .07, y(x) - .35, .057)],
             [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], 'mint' if i % 2 else 'coral')
    export('flag-rope', {'anchor_origin': [0, 0, 0], 'anchor_snap_left': [-4, 0, 0], 'anchor_snap_right': [4, 0, 0], 'anchor_rope_center': [0, .94, 0]},
           {'span': 8, 'postHeight': 1.26, 'ropeSag': .16, 'flags': 7}, 'Eight-metre route boundary. Snap its endpoint anchors; adjacent modules share endpoint locations. Posts are included; do not also instance a rope-post at those same endpoints.')
    reset()
    tube('sign_post', [0, 0, 0], [0, 1.76, 0], .055, 'steel', 10)
    box('sign_base', [0, .04, 0], [.34, .08, .34], 'navy', .025)
    box('rounded_signboard', [0, 1.65, 0], [1.35, .5, .075], 'navy', .018)
    prism('direction_arrow', [(-.48, 1.58), (.13, 1.58), (.13, 1.47), (.51, 1.65), (.13, 1.83), (.13, 1.72), (-.48, 1.72)], -.05, .014, 'mint')
    export('direction-sign', {'anchor_origin': [0, 0, 0], 'anchor_board_center': [0, 1.65, 0], 'anchor_arrow_tip': [.51, 1.65, -.05]},
           {'boardWidth': 1.35, 'boardHeight': .5, 'boardCenterHeight': 1.65, 'frontNormal': [0, 0, -1], 'arrowDirection': [1, 0, 0]},
           'Original pictogram sign without letters, numbers, logos or texture. Front faces uphill (-Z); arrow points locally right (+X). Rotate the whole instance around Y for another route direction.')


def export(asset_id, anchors, dimensions, notes):
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = asset_id.replace('-', '_')
    # Every asset uses a single palette material and a single exported primitive.
    obj.data.materials.clear()
    obj.data.materials.append(bpy.data.materials['alpine_vertex_palette'])
    for p in obj.data.polygons:
        p.material_index = 0
    root = bpy.data.objects.new('asset_root', None)
    bpy.context.collection.objects.link(root)
    obj.parent = root
    for name, point in anchors.items():
        anchor = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(anchor)
        anchor.parent = root
        anchor.location = blender(point)
    root['units'] = 'metres'
    root['up'] = '+Y'
    root['forward'] = '+Z downhill'
    file = OUT / (asset_id + '.glb')
    bpy.ops.export_scene.gltf(filepath=str(file), export_format='GLB', export_yup=True, export_normals=True,
                              export_texcoords=True, export_vertex_color='ACTIVE', export_materials='EXPORT',
                              export_extras=True, export_animations=False, export_cameras=False, export_lights=False,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=16, export_draco_normal_quantization=12,
                              export_draco_texcoord_quantization=14, export_draco_color_quantization=8)
    data = file.read_bytes()
    doc = json.loads(data[20:20 + struct.unpack_from('<I', data, 12)[0]])
    primitives = [p for m in doc['meshes'] for p in m['primitives']]
    if 'KHR_draco_mesh_compression' not in doc.get('extensionsRequired', []) or not all('KHR_draco_mesh_compression' in p.get('extensions', {}) for p in primitives):
        raise RuntimeError('A real Draco payload is required in every primitive: ' + asset_id)
    points = [gltf(obj.matrix_world @ v.co) for v in obj.data.vertices]
    bounds = [[round(min(p[i] for p in points), 6) for i in range(3)], [round(max(p[i] for p in points), 6) for i in range(3)]]
    triangles = sum(doc['accessors'][p['indices']]['count'] // 3 for p in primitives)
    MODELS.append({'id': asset_id, 'file': 'models/' + file.name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                   'triangles': triangles, 'primitives': len(primitives), 'units': 'metres', 'up': '+Y', 'forward': '+Z',
                   'root': 'asset_root', 'rootTransform': {'translation': [0, 0, 0], 'rotation': [0, 0, 0, 1], 'scale': [1, 1, 1]},
                   'mesh': obj.name, 'anchors': anchors, 'dimensions': dimensions, 'bounds': bounds,
                   'uv': {'attribute': 'TEXCOORD_0', 'range': [0, 1], 'topSnowU': '+X across full mesh width', 'topSnowV': '+Z across full mesh length',
                          'purpose': 'base-color tiling; upward snow uses X/Z; vertical sides/end caps use dominant axes; different faces may overlap; not a lightmap atlas'},
                   'colors': 'COLOR_0, original palette with subtle normal-based shading', 'materials': 1,
                   'compression': 'KHR_draco_mesh_compression required on every primitive', 'notes': notes})
    print('ALPINE_MODEL', asset_id, triangles, len(data))


ramp('jump-ramp', 6, 12, 2.4)
ramp('kicker', 4, 6, 1.8, True)
halfpipe()
mogul()
markers()
total = sum(m['bytes'] for m in MODELS)
if total > 220000:
    raise RuntimeError('Model budget exceeded: ' + str(total))
(ROOT / 'models.json').write_text(json.dumps({'schemaVersion': 1, 'kind': 'new-design-assets-not-runtime', 'license': 'CC0-1.0',
    'generator': 'Blender 5.2 / tools/build-models.py; original geometry', 'units': 'metres', 'up': '+Y', 'forward': '+Z downhill',
    'modelBudgetBytes': 220000, 'modelBytes': total, 'modelCount': len(MODELS), 'models': MODELS}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print('ALPINE_MODEL_TOTAL', len(MODELS), total)
