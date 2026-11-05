"""Optional coherent front-crown volume experiment for the two tested styles.

No topology, UV, material or skin weights change. The existing fine fringe and
all non-hair objects remain exact. The exporter must rebuild its projected cap
normal field after this deformation and any subsequent QEM.
"""
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from character_hair28 import _components, _geometry_hash, _immutable_hash


def _smooth(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


def shape_groom(person, objects):
    report = {'variant': 'macro-shape31', 'style': person.get('hair'),
              'method': 'shared C1 front-crown volume field with bounded attached-root refit',
              'addedVertices': 0, 'addedPolygons': 0, 'objects': [],
              'fringeUnchanged': True, 'otherObjectsUnchanged': True}
    if person.get('hair') not in ('quiff', 'sweep'):
        report.update(skipped=True, reason='Only the paired quiff and sweep prototypes change.')
        return report
    cap = next((o for o in objects if o.name.startswith('hair-scalp-undercoat')), None)
    if cap is None:
        raise AssertionError('Macro groom needs its filled undercoat')
    affected = [o for o in objects if o.name.startswith(('hair-scalp-undercoat',
                                                       'hair-groom-clumps',
                                                       'hair-crown-flyaway-layer'))]
    untouched = [o for o in objects if o not in affected]
    unchanged = {o.name: (_geometry_hash(o), _immutable_hash(o)) for o in untouched}
    immutable = {o.name: _immutable_hash(o) for o in affected}
    before = {o.name: np.asarray([v.co[:] for v in o.data.vertices], dtype=float) for o in affected}
    center = np.asarray(cap.get('hairCenter', [0, 1.65, .012]), dtype=float)
    eye_y = float(center[1] - .05)
    fringe = [o for o in objects if o.name.startswith('hair-fine-fringe')]
    fringe_points = [np.asarray([v.co[:] for v in o.data.vertices], dtype=float) for o in fringe]
    maximum_fringe_y = max([eye_y + .09, *[float(p[:, 1].max()) for p in fringe_points if len(p)]])
    lower_y = max(eye_y + .09, maximum_fringe_y + .001)

    def raw_weight(points):
        x, y, z = points[:, 0], points[:, 1], points[:, 2]
        top = _smooth((y - lower_y) / .06)
        side = np.maximum(0, 1 - (np.abs(x) / .085) ** 2) ** 2
        front = _smooth((z - .005) / .075)
        asymmetry = .55 + .45 * _smooth((.015 - x) / .09) if person['hair'] == 'sweep' else 1
        return top * side * front * asymmetry

    normalizer = max(float(raw_weight(p).max()) for p in before.values() if len(p))
    if normalizer < 1e-5:
        report.update(skipped=True, reason='No safe crown support remains above the exact fringe band.')
        return report
    amplitude = .014 if person['hair'] == 'quiff' else .008
    lateral = 0.0 if person['hair'] == 'quiff' else -.0015

    def displacement(points):
        weight = _smooth(raw_weight(points) / normalizer)
        return np.column_stack((lateral * weight, amplitude * weight, weight * 0))

    fringe_field = max([0.0, *[float(np.linalg.norm(displacement(p), axis=1).max())
                              for p in fringe_points if len(p)]])
    if fringe_field > 1e-12:
        raise AssertionError('Macro crown field reaches the protected fringe')
    for obj in affected:
        moved = before[obj.name] + displacement(before[obj.name])
        for vertex, point in zip(obj.data.vertices, moved):
            vertex.co = point.tolist()
        obj.data.update()

    # Pointwise deformation agrees at coincident cap vertices. Its nonlinear
    # interior can nevertheless differ slightly from a coarse triangle's
    # linear interpolation. Tuck any affected ribbon root back into that actual
    # deformed cap; ease the fit away before the tip, without raising any tip.
    bvh = BVHTree.FromPolygons([v.co.copy() for v in cap.data.vertices],
                               [list(p.vertices) for p in cap.data.polygons],
                               all_triangles=False)
    root_refits, maximum_root_fit, root_depths, irregular_root_components = 0, 0.0, [], 0
    for obj in affected:
        if obj is cap:
            continue
        mesh = obj.data
        coordinates = np.asarray([v.co[:] for v in mesh.vertices], dtype=float)
        is_flyaway = bool(obj.get('crownFlyawayLayer'))
        desired = -.00025 if is_flyaway else .0002
        for ids in _components(mesh):
            paired = len(ids) >= 4 and len(ids) % 2 == 0 and all(b == a + 1 for a, b in zip(ids[::2], ids[1::2]))
            if not paired:
                # The original clipped short cards can retain a single tiny
                # triangle after zero-area faces are removed. Keep its topology
                # and translate it into the cap rather than inventing rows.
                irregular_root_components += 1
                mid = coordinates[ids].mean(axis=0)
                p, n, _, _ = bvh.find_nearest(Vector(mid))
                if p is None:
                    raise AssertionError('Macro groom lost a clipped-card witness')
                normal = np.asarray(n, dtype=float)
                depth = float(np.dot(mid - np.asarray(p), normal))
                correction = max(0.0, depth - desired)
                if correction > .003:
                    raise AssertionError('Macro clipped-card fit exceeds its3mm bound')
                if correction:
                    coordinates[ids] -= normal * correction
                    root_refits += 1
                maximum_root_fit = max(maximum_root_fit, correction)
                root_depths.append(depth - correction)
                continue
            rows = coordinates[ids].reshape(-1, 2, 3).copy()
            total_fit = 0.0
            for _ in range(2):
                mid = rows[0].mean(axis=0)
                p, n, _, _ = bvh.find_nearest(Vector(mid))
                if p is None:
                    raise AssertionError('Macro groom lost the cap root witness')
                normal = np.asarray(n, dtype=float)
                depth = float(np.dot(mid - np.asarray(p), normal))
                if depth <= desired + .0001:
                    break
                correction = depth - desired
                total_fit += correction
                if total_fit > .003:
                    raise AssertionError('Macro crown root fit exceeds its3mm bound')
                for row in range(len(rows)):
                    t = row / (len(rows) - 1)
                    rows[row] -= normal * correction * (1 - float(_smooth(t / .4)))
            coordinates[ids] = rows.reshape(-1, 3)
            if total_fit:
                root_refits += 1
            maximum_root_fit = max(maximum_root_fit, total_fit)
            mid = rows[0].mean(axis=0)
            p, n, _, _ = bvh.find_nearest(Vector(mid))
            root_depths.append(float(np.dot(mid - np.asarray(p), np.asarray(n))))
        for vertex, point in zip(mesh.vertices, coordinates):
            vertex.co = point.tolist()
        mesh.update()

    for obj in affected:
        after = np.asarray([v.co[:] for v in obj.data.vertices], dtype=float)
        if not np.isfinite(after).all() or _immutable_hash(obj) != immutable[obj.name]:
            raise AssertionError('Macro groom changed topology/UV/weights or generated nonfinite coordinates')
        for face in obj.data.polygons:
            ids = list(face.vertices)
            for i in range(1, len(ids) - 1):
                tri = [ids[0], ids[i], ids[i + 1]]
                a, b = before[obj.name][tri], after[tri]
                na, nb = np.cross(a[1] - a[0], a[2] - a[0]), np.cross(b[1] - b[0], b[2] - b[0])
                denominator = np.linalg.norm(na) * np.linalg.norm(nb)
                if np.linalg.norm(na) > 1e-10 and (np.linalg.norm(nb) < max(1e-12, .02 * np.linalg.norm(na)) or np.dot(na, nb) < .10 * denominator):
                    raise AssertionError('Macro groom triangle guard: '+str({'object':obj.name,'triangle':tri,'oldCrossNorm':float(np.linalg.norm(na)),'newCrossNorm':float(np.linalg.norm(nb)),'normalDot':float(np.dot(na,nb)/max(denominator,1e-30)),'rootRefits':root_refits,'maximumRootFitMeters':maximum_root_fit}))
        delta = after - before[obj.name]
        report['objects'].append({'name': obj.name, 'vertices': len(after),
                                  'maximumLiftMeters': float(delta[:, 1].max()),
                                  'maximumDisplacementMeters': float(np.linalg.norm(delta, axis=1).max()),
                                  'topologyUvWeightsUnchanged': True})
    report['otherObjectsUnchanged'] = all((_geometry_hash(o), _immutable_hash(o)) == unchanged[o.name]
                                          for o in untouched)
    report['fringeUnchanged'] = all((_geometry_hash(o), _immutable_hash(o)) == unchanged[o.name] for o in fringe)
    if not report['otherObjectsUnchanged'] or not report['fringeUnchanged']:
        raise AssertionError('Macro groom changed an unowned object')
    report.update(skipped=False, eyeY=eye_y, supportStartsAtY=lower_y,
                  fringeMaximumY=maximum_fringe_y, fringeMaximumFieldDisplacementMeters=fringe_field,
                  nominalMaximumLiftMeters=amplitude, nominalMaximumLateralMeters=abs(lateral),
                  rootRefits=root_refits, irregularClippedCardComponents=irregular_root_components, maximumRootFitMeters=maximum_root_fit,
                  rootSignedDepthRangeMeters=[min(root_depths), max(root_depths)] if root_depths else [])
    return report
