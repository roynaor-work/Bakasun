"""Optional sparse cap-rooted crown wisps; no change to the existing groom."""
import math

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from character_hair28 import _geometry_hash, _immutable_hash, _unit


def add_crown_wisps(person, objects, make_mesh, rectuv):
    """Return (new object or None, JSON-safe diagnostics), before QEM.

    This small layer is deliberately absent from the fringe and temples. Its
    attached roots begin inside the filled cap; the exporter can omit it from
    far LOD using crownFlyawayLayer. It shares the existing HairCards surface.
    """
    preserved = [o for o in objects if o.name.startswith('hair-')]
    signatures = {o.name: (_geometry_hash(o), _immutable_hash(o)) for o in preserved}
    report = {'variant': '31', 'kind': 'sparse-cap-rooted-crown-wisps',
              'style': person.get('hair'), 'cards': 0, 'triangles': 0,
              'additionalImages': 0, 'additionalSurfaces': 0,
              'farLODOmitted': True, 'existingGroomUnchanged': True}
    cap = next((o for o in objects if o.name.startswith('hair-scalp-undercoat')), None)
    if person.get('hair') == 'coils' or cap is None:
        report.update(skipped=True, reason='Coils retain their original edge treatment.')
        return None, report
    points = np.asarray([v.co[:] for v in cap.data.vertices], dtype=float)
    polygons = [list(p.vertices) for p in cap.data.polygons]
    center = np.asarray(cap.get('hairCenter', [0, 1.65, .012]), dtype=float)
    bvh = BVHTree.FromPolygons([Vector(p) for p in points], polygons, all_triangles=False)
    triangles, areas = [], []
    crown_minimum_y = max(center[1] + .045, float(points[:, 1].max()) - .048)
    for polygon in cap.data.polygons:
        for i in range(1, len(polygon.vertices) - 1):
            q = points[[polygon.vertices[0], polygon.vertices[i], polygon.vertices[i + 1]]]
            normal = np.cross(q[1] - q[0], q[2] - q[0])
            area = float(np.linalg.norm(normal))
            if area < 1e-10:
                continue
            normal /= area
            mid = q.mean(axis=0)
            if normal[1] > .55 and mid[1] > crown_minimum_y and abs(mid[0]) < .067:
                triangles.append(q)
                areas.append(area)
    if not triangles:
        report.update(skipped=True, reason='No safe upper-crown surface available.')
        return None, report
    probability = np.asarray(areas) / sum(areas)
    seed = 310627 + sum((i + 1) * ord(c) for i, c in enumerate(person['id']))
    rng = np.random.default_rng(seed)
    vertices, faces, face_uvs, roots, depths, heights, widths, lengths = [], [], [], [], [], [], [], []
    count = 26 if person.get('hair') == 'buzz' else 28
    for attempt in range(800):
        if len(roots) >= count:
            break
        tri = triangles[int(rng.choice(len(triangles), p=probability))]
        a, b = rng.random(2)
        if a + b > 1:
            a, b = 1 - a, 1 - b
        candidate = tri[0] + a * (tri[1] - tri[0]) + b * (tri[2] - tri[0])
        if any(float(np.linalg.norm(candidate - old)) < .009 for old in roots):
            continue
        location, normal, _, _ = bvh.find_nearest(Vector(candidate))
        if location is None:
            continue
        root, normal = np.asarray(location, dtype=float), np.asarray(normal, dtype=float)
        if normal[1] < .55 or root[1] < crown_minimum_y:
            continue
        direction = np.asarray([.75, 0, -.25] if person.get('hair') == 'sweep' else [.15, 0, -.9])
        direction = _unit(direction - normal * np.dot(direction, normal), [1, 0, 0])
        lateral = _unit(np.cross(normal, direction), [0, 0, 1])
        angle = rng.uniform(-.65, .65)
        direction = direction * math.cos(angle) + lateral * math.sin(angle)
        lateral = _unit(np.cross(normal, direction), [0, 0, 1])
        length = rng.uniform(.004, .007)
        width = rng.uniform(.00045, .00075)
        tip = rng.uniform(.0012, .0024) * (.70 if person.get('hair') == 'buzz' else 1)
        bend = rng.uniform(-.00065, .00065)
        rows, normals, clearance = [], [], []
        for j in range(5):
            t = j / 4
            target = root + direction * length * t + lateral * bend * math.sin(math.pi * t)
            p, n, _, _ = bvh.find_nearest(Vector(target))
            if p is None:
                break
            p, n = np.asarray(p, dtype=float), np.asarray(n, dtype=float)
            if n[1] < .48 or p[1] < crown_minimum_y - .003:
                break
            height = -.00025 * (1 - t) + tip * math.sin(math.pi * .5 * t) ** 1.3
            rows.append(p + n * height)
            normals.append(n)
            clearance.append(height)
        if len(rows) != 5:
            continue
        first = len(vertices)
        for j, (mid, n) in enumerate(zip(rows, normals)):
            tangent = rows[min(j + 1, 4)] - rows[max(0, j - 1)]
            across = _unit(np.cross(n, tangent), lateral)
            half = width * .5 * (1 - .65 * j / 4)
            vertices.extend([(mid - across * half).tolist(), (mid + across * half).tolist()])
        tile = len(roots) % 8
        u0, u1 = tile / 8 + .008, (tile + 1) / 8 - .008
        for j in range(4):
            quad = [first + j * 2, first + j * 2 + 1,
                    first + j * 2 + 3, first + j * 2 + 2]
            uv = [rectuv('wisps', u0, j / 4), rectuv('wisps', u1, j / 4),
                  rectuv('wisps', u1, (j + 1) / 4), rectuv('wisps', u0, (j + 1) / 4)]
            for corners in ((0, 1, 2), (0, 2, 3)):
                ids = [quad[k] for k in corners]
                tex = [uv[k] for k in corners]
                q = np.asarray([vertices[k] for k in ids])
                cross = np.cross(q[1] - q[0], q[2] - q[0])
                if float(np.linalg.norm(cross)) < 1e-11:
                    raise AssertionError('Hair31 generated a degenerate fine card')
                if np.dot(cross, q.mean(axis=0) - center) < 0:
                    ids.reverse()
                    tex.reverse()
                faces.append(ids)
                face_uvs.append(tex)
        roots.append(root)
        depths.append(clearance[0])
        heights.append(clearance[-1])
        widths.append(width)
        lengths.append(sum(float(np.linalg.norm(b - a)) for a, b in zip(rows, rows[1:])))
    if not roots or not np.isfinite(np.asarray(vertices)).all():
        raise AssertionError('Hair31 could not construct finite attached crown wisps')
    weights = np.zeros((len(vertices), 18))
    weights[:, 5] = 1
    obj = make_mesh('hair-crown-flyaway-layer', vertices, faces, face_uvs, weights)
    obj['surface'] = 'HairCards'
    obj['atlasRegion'] = 'wisps'
    obj['hairCenter'] = center.tolist()
    obj['crownFlyawayLayer'] = True
    report.update(seed=seed, cards=len(roots), triangles=len(faces), vertices=len(vertices),
                  rootSignedClearanceRangeMeters=[min(depths), max(depths)],
                  tipSignedClearanceRangeMeters=[min(heights), max(heights)],
                  actualCurveLengthRangeMeters=[min(lengths), max(lengths)],
                  widthRangeMeters=[min(widths), max(widths)],
                  minimumRootY=min(float(p[1]) for p in roots),
                  crownMinimumY=crown_minimum_y, rigidHead5=True, skipped=False)
    report['existingGroomUnchanged'] = all((_geometry_hash(o), _immutable_hash(o)) == signatures[o.name]
                                         for o in preserved)
    if not report['existingGroomUnchanged']:
        raise AssertionError('Hair31 changed the existing cap, crown or fringe')
    return obj, report
