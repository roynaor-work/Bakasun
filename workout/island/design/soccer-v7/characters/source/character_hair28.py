"""Small, deterministic groom geometry experiment; no atlas or normal changes.

Call refine_card_groom(person, objects) immediately after the existing groom is
constructed, before QEM.  Only ribbon vertex coordinates may change.  The filled
undercoat, topology, UVs, weights, materials and projected normal recipe remain
owned by the existing exporter.  A failed per-ribbon geometric check restores
that ribbon rather than accepting an inverted or collapsed card.
"""
import hashlib
import math
import struct

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def _geometry_hash(obj):
    h = hashlib.sha256()
    for v in obj.data.vertices:
        h.update(struct.pack('<3f', *v.co))
    for p in obj.data.polygons:
        h.update(struct.pack('<I', len(p.vertices)))
        h.update(struct.pack('<' + 'I' * len(p.vertices), *p.vertices))
    return h.hexdigest()


def _immutable_hash(obj):
    h = hashlib.sha256()
    for p in obj.data.polygons:
        h.update(struct.pack('<I', len(p.vertices)))
        h.update(struct.pack('<' + 'I' * len(p.vertices), *p.vertices))
    uv = obj.data.uv_layers.active
    if uv:
        for loop in uv.data:
            h.update(struct.pack('<2f', *loop.uv))
    for vertex in obj.data.vertices:
        for group in vertex.groups:
            h.update(struct.pack('<If', group.group, group.weight))
        h.update(b'|')
    return h.hexdigest()


def _unit(value, fallback):
    length = float(np.linalg.norm(value))
    return value / length if length > 1e-12 else np.asarray(fallback, dtype=float)


def _components(mesh):
    adjacent = [[] for _ in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacent[a].append(b)
        adjacent[b].append(a)
    seen = set()
    for first in range(len(adjacent)):
        if first in seen or not adjacent[first]:
            continue
        found, pending = [], [first]
        seen.add(first)
        while pending:
            index = pending.pop()
            found.append(index)
            for other in adjacent[index]:
                if other not in seen:
                    seen.add(other)
                    pending.append(other)
        yield sorted(found)


def _signed_clearance(bvh, point):
    location, normal, _, distance = bvh.find_nearest(Vector(point))
    if location is None:
        return None, None
    normal = np.asarray(normal, dtype=float)
    return float(np.dot(point - np.asarray(location), normal)), normal


def refine_card_groom(person, objects):
    """Mutate only existing non-coil card positions; return JSON-safe evidence.

    Existing cards are disconnected ribbons with consecutive left/right pairs.
    Jitter lives in the local tangent plane.  Small curvature and width changes
    break the repeated straight stripe; fringe endpoints receive unequal length
    factors.  A support-distance check caps added lift at 0.25 mm.  It does not
    replace the exporter's projected16c normal field.
    """
    undercoats = [o for o in objects if o.name.startswith('hair-scalp-undercoat')]
    unchanged = {o.name: _geometry_hash(o) for o in undercoats}
    report = {'variant': '28', 'seed': None, 'style': person.get('hair'),
              'method': 'tangential seeded ribbon jitter, gentle bend, staggered fringe and narrower edge clumps',
              'normalRecipe': 'existing projected16c unchanged', 'addedVertices': 0,
              'addedPolygons': 0, 'maximumAddedClearanceMeters': 0.0,
              'maximumDisplacementMeters': 0.0, 'objects': []}
    if person.get('hair') == 'coils' or not undercoats:
        report.update(skipped=True, reason='Coil construction and filled mass are preserved.')
        report['undercoatUnchanged'] = True
        return report
    cap = undercoats[0]
    bvh = BVHTree.FromPolygons([v.co.copy() for v in cap.data.vertices],
                              [list(p.vertices) for p in cap.data.polygons],
                              all_triangles=False)
    seed = 280913 + sum((i + 1) * ord(c) for i, c in enumerate(person['id']))
    report['seed'] = seed
    rng = np.random.default_rng(seed)
    for obj in objects:
        name = obj.name.split('.')[0]
        if name not in ('hair-groom-clumps', 'hair-fine-fringe'):
            continue
        mesh = obj.data
        before = np.asarray([v.co[:] for v in mesh.vertices], dtype=float)
        after = before.copy()
        immutable_before = _immutable_hash(obj)
        center = np.asarray(obj.get('hairCenter', [0, 1.65, .012]), dtype=float)
        fringe = name == 'hair-fine-fringe'
        strength = .45 if person.get('hair') == 'buzz' else 1.0
        polygons = [tuple(p.vertices) for p in mesh.polygons]
        incident = [[] for _ in mesh.vertices]
        for index, face in enumerate(polygons):
            for vertex in face:
                incident[vertex].append(index)
        accepted = rejected = skipped = 0
        lengths, widths, clearances = [], [], []
        for ids in _components(mesh):
            # The original generator appends left/right pairs per longitudinal
            # row. Reject other topology rather than guessing a new ordering.
            if len(ids) < 6 or len(ids) % 2 or ids != list(range(ids[0], ids[-1] + 1)):
                skipped += 1
                continue
            old = before[ids].reshape(-1, 2, 3)
            mid = old.mean(axis=1)
            count = len(mid)
            root = mid[0]
            direction = _unit(mid[-1] - root, [0, -1, 0])
            normal = _unit((root - center) / np.asarray([.100, .125, .108]) ** 2, [0, 1, 0])
            direction = _unit(direction - normal * np.dot(direction, normal), [0, 0, -1])
            lateral = _unit(np.cross(normal, direction), [1, 0, 0])
            root_jitter = (lateral * rng.uniform(-.00065, .00065)
                           + direction * rng.uniform(-.00040, .00040)) * strength
            bend = rng.uniform(-.00080, .00080) * strength
            curve_phase = rng.uniform(-.55, .55)
            length_scale = rng.uniform(.82, 1.045) if fringe else rng.uniform(.97, 1.025)
            width_scale = rng.uniform(.75, .93) if fringe else rng.uniform(.87, 1.02)
            candidate = np.empty_like(old)
            added_clearance = []
            for row in range(count):
                t = row / (count - 1)
                # No outward tip displacement: the bend follows the scalp's
                # tangent, and its endpoints return towards the root jitter.
                shift = root_jitter * (1 - .20 * t)
                shift += lateral * bend * math.sin(math.pi * t) * (1 + .18 * math.sin(2 * math.pi * t + curve_phase))
                p = root + (mid[row] - root) * length_scale + shift
                half_width = (old[row, 1] - old[row, 0]) * .5 * width_scale
                for side, sign in enumerate((-1, 1)):
                    q = p + sign * half_width
                    # Frontal ends stay well above the eyelid aperture. Side
                    # and rear roots retain their existing sideburn silhouette.
                    if q[2] > center[2] + .045 and abs(q[0]) < .065:
                        q[1] = max(q[1], center[1])
                    old_clearance, _ = _signed_clearance(bvh, old[row, side])
                    new_clearance, new_normal = _signed_clearance(bvh, q)
                    if old_clearance is not None and new_clearance is not None:
                        excess = new_clearance - old_clearance
                        if excess > .00025:
                            q -= new_normal * (excess - .00025)
                        elif excess < -.00025:
                            q += new_normal * (-.00025 - excess)
                        final_clearance, _ = _signed_clearance(bvh, q)
                        added_clearance.append(final_clearance - old_clearance)
                    candidate[row, side] = q
            flat = candidate.reshape(-1, 3)
            index_lookup = {vertex: i for i, vertex in enumerate(ids)}
            valid = bool(np.isfinite(flat).all()) and float(np.max(np.linalg.norm(flat - before[ids], axis=1))) <= .0026
            for face_index in set(i for vertex in ids for i in incident[vertex]):
                face = polygons[face_index]
                for k in range(1, len(face) - 1):
                    tri = [face[0], face[k], face[k + 1]]
                    a = before[tri]
                    b = flat[[index_lookup[v] for v in tri]]
                    na, nb = np.cross(a[1] - a[0], a[2] - a[0]), np.cross(b[1] - b[0], b[2] - b[0])
                    denominator = np.linalg.norm(na) * np.linalg.norm(nb)
                    if denominator < 1e-16 or float(np.dot(na, nb)) < .30 * denominator:
                        valid = False
                        break
                if not valid:
                    break
            if not valid:
                rejected += 1
                continue
            after[ids] = flat
            accepted += 1
            lengths.append(length_scale)
            widths.append(width_scale)
            clearances.extend(added_clearance)
        for vertex, value in zip(mesh.vertices, after):
            vertex.co = value.tolist()
        mesh.update()
        if _immutable_hash(obj) != immutable_before:
            raise AssertionError('Hair28 changed topology, UV or weights')
        displacement = np.linalg.norm(after - before, axis=1)
        maximum = float(np.max(displacement)) if len(displacement) else 0.0
        maximum_clearance = max([0.0, *clearances])
        report['maximumDisplacementMeters'] = max(report['maximumDisplacementMeters'], maximum)
        report['maximumAddedClearanceMeters'] = max(report['maximumAddedClearanceMeters'], maximum_clearance)
        report['objects'].append({'name': obj.name, 'vertices': len(mesh.vertices),
                                  'polygons': len(mesh.polygons), 'acceptedRibbons': accepted,
                                  'rejectedRibbons': rejected, 'skippedComponents': skipped,
                                  'maximumDisplacementMeters': maximum,
                                  'maximumAddedClearanceMeters': maximum_clearance,
                                  'lengthScaleRange': [min(lengths), max(lengths)] if lengths else [],
                                  'widthScaleRange': [min(widths), max(widths)] if widths else [],
                                  'topologyUvWeightsUnchanged': True})
    report['undercoatUnchanged'] = all(_geometry_hash(o) == unchanged[o.name] for o in undercoats)
    if not report['undercoatUnchanged']:
        raise AssertionError('Hair28 changed the filled undercoat')
    report['skipped'] = not bool(report['objects'])
    return report
