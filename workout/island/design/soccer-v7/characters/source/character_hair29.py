"""Isolated overlapping short crown locks; preserves the original fine fringe.

The existing crown object is rebuilt before QEM. No undercoat, fringe, atlas,
material or normal-projection recipe is changed here. This is an authoring
experiment and needs independent phone-frame comparison before acceptance.
"""
import math

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from character_hair28 import _components, _geometry_hash, _immutable_hash


def _curve_at(distance, cumulative, centers, widths):
    row = max(0, min(len(centers) - 2,
                     int(np.searchsorted(cumulative, distance, side='right')) - 1))
    factor = float(np.clip((distance - cumulative[row]) /
                           max(cumulative[row + 1] - cumulative[row], 1e-12), 0, 1))
    return (centers[row] * (1 - factor) + centers[row + 1] * factor,
            widths[row] * (1 - factor) + widths[row + 1] * factor)


def _sublock(start, end, cumulative, centers, widths, cap_bvh):
    root, _ = _curve_at(start, cumulative, centers, widths)
    location, normal, _, _ = cap_bvh.find_nearest(Vector(root))
    if location is None:
        return None
    normal = np.asarray(normal, dtype=float)
    depth = float(np.dot(root - np.asarray(location), normal))
    # Lower a floating mid-card start into the filled mass. A root already
    # tucked inside the undercoat stays tucked; no outward displacement.
    drop = max(0.0, depth - .0002)
    rows = []
    for index in range(5):
        u = index / 4
        point, half_width = _curve_at(start + (end - start) * u,
                                      cumulative, centers, widths)
        blend = float(np.clip(u / .42, 0, 1))
        blend = blend * blend * (3 - 2 * blend)
        point = point - normal * drop * (1 - blend)
        # A mild final taper avoids a broad cut end. It never lengthens a tip.
        half_width = half_width * (1 - .12 * u)
        rows.append((point, half_width))
    length = sum(float(np.linalg.norm(b[0] - a[0]))
                 for a, b in zip(rows, rows[1:]))
    return rows, length, depth - drop


def refine_crown29(person, objects):
    """Return JSON-safe evidence; mutate only hair-groom-clumps mesh data."""
    preserved = [o for o in objects if o.name.startswith(('hair-scalp-undercoat',
                                                        'hair-fine-fringe'))]
    geometry_before = {o.name: (_geometry_hash(o), _immutable_hash(o)) for o in preserved}
    result = {'variant': '29', 'method': 'overlapping short crown sublocks with cap-rooted starts',
              'style': person.get('hair'), 'objects': [], 'normalRecipeOwnedByExporter': True,
              'undercoatAndFringeUnchanged': True, 'maximumSublockLengthMeters': 0.0}
    cap = next((o for o in objects if o.name.startswith('hair-scalp-undercoat')), None)
    if person.get('hair') == 'coils' or cap is None:
        result.update(skipped=True, reason='Coil geometry is unchanged.')
        return result
    cap_bvh = BVHTree.FromPolygons([v.co.copy() for v in cap.data.vertices],
                                   [list(p.vertices) for p in cap.data.polygons],
                                   all_triangles=False)
    for obj in objects:
        if obj.name.split('.')[0] != 'hair-groom-clumps':
            continue
        old = obj.data
        groups = [(g.name, g.index) for g in obj.vertex_groups]
        if len(groups) != 18 or obj.vertex_groups.get('Head') is None or obj.vertex_groups['Head'].index != 5:
            raise AssertionError('Hair29 needs the original canonical18 groups and Head5')
        points = np.asarray([v.co[:] for v in old.vertices], dtype=float)
        uv_values = {}
        uv_layer = old.uv_layers.active
        if uv_layer is None:
            raise AssertionError('Hair29 crown has no UV layer')
        for polygon in old.polygons:
            for loop_index in polygon.loop_indices:
                vertex_index = old.loops[loop_index].vertex_index
                value = np.asarray(uv_layer.data[loop_index].uv[:], dtype=float)
                if vertex_index in uv_values and not np.allclose(uv_values[vertex_index], value, atol=1e-7):
                    raise AssertionError('Unexpected UV seam within a crown ribbon')
                uv_values[vertex_index] = value
        vertices, faces, vertex_uv = [], [], []
        center = np.asarray(obj.get('hairCenter', [0, 1.65, .012]), dtype=float)
        unchanged = split = invalid = discarded_degenerate = 0
        old_lengths, new_lengths, root_depths = [], [], []

        def add_ribbon(rows, uv_start, uv_end):
            nonlocal discarded_degenerate
            first = len(vertices)
            for index, (mid, half) in enumerate(rows):
                t = index / (len(rows) - 1)
                vertices.extend([(mid - half).tolist(), (mid + half).tolist()])
                vertex_uv.extend([(uv_start[0] * (1 - t) + uv_end[0] * t).tolist(),
                                  (uv_start[1] * (1 - t) + uv_end[1] * t).tolist()])
            for index in range(len(rows) - 1):
                quad = [first + index * 2, first + index * 2 + 1,
                        first + index * 2 + 3, first + index * 2 + 2]
                for corners in ((0, 1, 2), (0, 2, 3)):
                    ids = [quad[k] for k in corners]
                    q = np.asarray([vertices[k] for k in ids])
                    normal = np.cross(q[1] - q[0], q[2] - q[0])
                    if float(np.linalg.norm(normal)) < 1e-10:
                        # The original clipped crown can end with duplicate
                        # rows. Do not export their zero-area triangles.
                        discarded_degenerate += 1
                        continue
                    if float(np.dot(normal, q.mean(axis=0) - center)) < 0:
                        ids.reverse()
                    faces.append(ids)

        for ids in _components(old):
            if len(ids) < 6 or len(ids) % 2 or ids != list(range(ids[0], ids[-1] + 1)):
                raise AssertionError('Unexpected non-ribbon crown topology')
            coordinates = points[ids].reshape(-1, 2, 3)
            centers = coordinates.mean(axis=1)
            widths = (coordinates[:, 1] - coordinates[:, 0]) * .5
            cumulative = np.concatenate(([0.0], np.cumsum(np.linalg.norm(np.diff(centers, axis=0), axis=1))))
            length = float(cumulative[-1])
            old_lengths.append(length)
            uv_start = np.asarray([uv_values[ids[0]], uv_values[ids[1]]])
            uv_end = np.asarray([uv_values[ids[-2]], uv_values[ids[-1]]])
            if length <= .022:
                add_ribbon(list(zip(centers, widths)), uv_start, uv_end)
                unchanged += 1
                new_lengths.append(length)
                continue
            overlap = min(.0035, length * .13)
            pieces = max(2, math.ceil((length - overlap) / (.0215 - overlap)))
            blocks = None
            for count in range(pieces, pieces + 3):
                span = (length + (count - 1) * overlap) / count
                starts = np.linspace(0, length - span, count)
                candidate = [_sublock(float(start), float(start + span), cumulative,
                                     centers, widths, cap_bvh) for start in starts]
                if all(block is not None and block[1] <= .022001 for block in candidate):
                    blocks = candidate
                    break
            if blocks is None:
                # Do not silently replace an unsafe component with guessed
                # geometry or hide an overlong lock in a success report.
                invalid += 1
                raise AssertionError('Hair29 could not make bounded sublocks')
            for rows, sub_length, root_depth in blocks:
                add_ribbon(rows, uv_start, uv_end)
                new_lengths.append(sub_length)
                root_depths.append(root_depth)
            split += 1
        if not np.isfinite(np.asarray(vertices)).all():
            raise AssertionError('Hair29 generated nonfinite coordinates')
        mesh = bpy.data.meshes.new(old.name + '-short-crown29')
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        target_uv = mesh.uv_layers.new(name=uv_layer.name)
        for polygon in mesh.polygons:
            polygon.use_smooth = True
            for loop_index in polygon.loop_indices:
                target_uv.data[loop_index].uv = vertex_uv[mesh.loops[loop_index].vertex_index]
        for material in old.materials:
            mesh.materials.append(material)
        old_vertices, old_polygons = len(old.vertices), len(old.polygons)
        obj.data = mesh
        # Blender can clear the object's group definitions when swapping in
        # mesh data without a deform layer. Recreate the exact ordered18 slots.
        if [(g.name, g.index) for g in obj.vertex_groups] != groups:
            obj.vertex_groups.clear()
            for group_name, _ in groups:
                obj.vertex_groups.new(name=group_name)
        obj.vertex_groups['Head'].add(list(range(len(mesh.vertices))), 1.0, 'REPLACE')
        if [(g.name, g.index) for g in obj.vertex_groups] != groups:
            raise AssertionError('Hair29 changed the canonical vertex group definitions')
        for vertex in mesh.vertices:
            if len(vertex.groups) != 1 or vertex.groups[0].group != 5 or abs(vertex.groups[0].weight - 1) > 1e-7:
                raise AssertionError('Hair29 did not preserve rigid Head5 weights')
        if old.users == 0:
            bpy.data.meshes.remove(old)
        max_length = max(new_lengths, default=0.0)
        result['maximumSublockLengthMeters'] = max(result['maximumSublockLengthMeters'], max_length)
        result['objects'].append({'name': obj.name, 'oldVertices': old_vertices,
                                  'newVertices': len(mesh.vertices), 'oldPolygons': old_polygons,
                                  'newPolygons': len(mesh.polygons), 'splitOriginalRibbons': split,
                                  'unchangedShortRibbons': unchanged, 'invalidRibbons': invalid,
                                  'discardedDegenerateTriangles': discarded_degenerate,
                                  'newRibbonCount': len(new_lengths),
                                  'oldLengthRangeMeters': [min(old_lengths), max(old_lengths)],
                                  'newLengthRangeMeters': [min(new_lengths), max(new_lengths)],
                                  'rootSignedDepthRangeMeters': [min(root_depths), max(root_depths)] if root_depths else [],
                                  'rigidHead5': True, 'canonicalGroupsUnchanged': True,
                                  'uvTilePreserved': True, 'normalRecipeChangedHere': False})
    result['undercoatAndFringeUnchanged'] = all((_geometry_hash(o), _immutable_hash(o)) == geometry_before[o.name] for o in preserved)
    if not result['undercoatAndFringeUnchanged']:
        raise AssertionError('Hair29 changed the preserved undercoat or fringe')
    result['skipped'] = not bool(result['objects'])
    return result
