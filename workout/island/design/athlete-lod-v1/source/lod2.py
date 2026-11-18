"""Original closed low-poly anatomical lofts fitted to source surface vertices.

Every position and skin-weight tuple is an unchanged source sample. Seam-free
neutral UVs avoid projecting a detailed facial atlas over distant coarse faces.
"""
import numpy as np


def authored_lod2(a, source_morphs, weight_matrix):
    p = a['POSITION']
    weights = weight_matrix(a)
    regions = a['_REGION'].ravel()
    defaults = {r: a['COLOR_0'][regions == r][0] for r in np.unique(regions)}
    source_ids, semantic_regions, faces = [], [], []

    def sample(point, joints, region):
        mask = weights[:, joints].sum(1) > .25
        candidates = np.flatnonzero(mask)
        distance = np.sum((p[candidates] - point) ** 2, axis=1)
        # Prefer the intended surface, while allowing the adjoining anatomical
        # region at joint boundaries. This excludes hidden hockey placeholders.
        distance += np.where(regions[candidates] == region, 0, .0005)
        index = candidates[distance.argmin()]
        source_ids.append(int(index))
        semantic_regions.append(region)
        return len(source_ids) - 1

    def loft(rings, sides, joints, caps=True, top_apex=None, bottom_apex=None):
        # rings: y, x-center, z-center, x-radius, z-radius, region.
        start = len(source_ids)
        for y, x, z, rx, rz, region in rings:
            for i in range(sides):
                angle = 2 * np.pi * (i / sides + .125)
                sample(np.array([x + rx * np.cos(angle), y, z + rz * np.sin(angle)]), joints, region)
        for ring in range(len(rings) - 1):
            for i in range(sides):
                u = start + ring * sides + i
                v = start + ring * sides + (i + 1) % sides
                faces.extend([(u, u + sides, v), (v, u + sides, v + sides)])
        if caps:
            bottom = start + (len(rings) - 1) * sides
            for base, apex, region, reverse in [(start, top_apex, rings[0][-1], False),
                                                (bottom, bottom_apex, rings[-1][-1], True)]:
                if apex is None:
                    triangles = [(base, base + i, base + i + 1) for i in range(1, sides - 1)]
                else:
                    source_ids.append(int(apex)); semantic_regions.append(region)
                    center = len(source_ids) - 1
                    triangles = [(center, base + i, base + (i + 1) % sides) for i in range(sides)]
                faces.extend([(x, z, y) if reverse else (x, y, z) for x, y, z in triangles])

    # Ring order is top to bottom. The caps keep each anatomical volume closed.
    loft([(1.39, 0, .005, .060, .050, 1), (1.30, 0, .010, .182, .113, 1),
          (1.10, 0, .020, .163, .124, 1), (.875, 0, .020, .170, .119, 1)], 6, [1, 2, 3, 4])
    loft([(1.48, 0, .005, .043, .042, 0), (1.37, 0, .005, .048, .043, 0)], 4, [3, 4, 5])
    loft([(1.72, 0, .008, .040, .052, 0), (1.60, 0, .015, .084, .096, 0),
          (1.47, 0, .028, .050, .060, 0)], 6, [4, 5], top_apex=p[:, 1].argmax())
    loft([(.905, 0, .017, .170, .112, 2), (.795, 0, .020, .169, .113, 2)], 6, [1, 12, 15])
    for side, arm, forearm, hand, thigh, shin, foot in [(1, 6, 7, 8, 12, 13, 14), (-1, 9, 10, 11, 15, 16, 17)]:
        x = side * .10
        loft([(.825, x, .020, .075, .106, 2), (.635, x, .035, .072, .082, 2),
              (.615, x, .035, .064, .075, 0), (.430, x, .004, .053, .059, 0),
              (.390, x, -.004, .051, .052, 8), (.175, x, -.010, .038, .038, 8),
              (.080, x, .010, .030, .034, 8)], 4, [thigh, shin, foot])
        foot_vertices = np.flatnonzero(weights[:, foot] > .8)
        sole = foot_vertices[p[foot_vertices, 1].argmin()]
        loft([(.083, x, .072, .048, .140, 4), (.005128, x, .075, .050, .150, 5)], 6, [foot], bottom_apex=sole)
        x = side * .16
        loft([(1.315, x, .001, .045, .060, 0), (1.155, x, .003, .041, .049, 0),
              (1.030, x, .005, .035, .037, 0), (.790, x, .006, .025, .026, 0)], 4, [arm, forearm, hand])
        # The sleeve loft selects the source sleeve's exact sport morph deltas;
        # the underlying skin remains present when basketball retracts it.
        loft([(1.315, x, .002, .050, .065, 1), (1.155, x, .005, .047, .055, 1),
              (1.145, x, .005, .047, .055, 3)], 4, [arm, forearm], caps=False)
        loft([(.800, x, .004, .026, .025, 0), (.710, x, .005, .039, .035, 0),
              (.635, x, .005, .024, .025, 0)], 4, [forearm, hand])

    ids = np.asarray(source_ids)
    attrs = {key: values[ids].copy() for key, values in a.items()}
    attrs['_REGION'] = np.asarray(semantic_regions, np.uint8).reshape(-1, 1)
    attrs['COLOR_0'] = np.asarray([defaults[r] for r in semantic_regions], np.float32)
    attrs['TEXCOORD_0'][:] = [.80, .20]  # neutral cloth tile in the shared source atlas
    attrs['TEXCOORD_0'][attrs['_REGION'].ravel() == 0] = [.12, .20]  # source skin tile, without facial feature UV seams
    faces = np.asarray(faces, np.uint32)
    # Orient every side/cap outward using the local normal of the sampled source
    # surface. Remove zero-area triangles caused by tied nearest samples.
    xyz = attrs['POSITION'][faces]
    cross = np.cross(xyz[:, 1] - xyz[:, 0], xyz[:, 2] - xyz[:, 0])
    reverse = np.sum(cross * attrs['NORMAL'][faces].mean(1), axis=1) < 0
    faces[reverse] = faces[reverse][:, [0, 2, 1]]
    faces = faces[np.linalg.norm(cross, axis=1) > 1e-9]
    # Coarse volumes need their own smooth normals, rather than isolated source
    # nose/eyelid/knuckle normals on a much larger new polygon.
    normals = np.zeros_like(attrs['NORMAL'])
    xyz = attrs['POSITION'][faces]
    cross = np.cross(xyz[:, 1] - xyz[:, 0], xyz[:, 2] - xyz[:, 0])
    for corner in range(3):
        np.add.at(normals, faces[:, corner], cross)
    length = np.linalg.norm(normals, axis=1)
    valid = length > 1e-10
    normals[valid] /= length[valid, None]
    normals[~valid] = attrs['NORMAL'][~valid]
    attrs['NORMAL'] = normals
    return attrs, faces, [m[ids].copy() for m in source_morphs], ids
