#!/usr/bin/env python3
"""Measured, common-axis iris/cornea geometry for the canonical18 library.

Pure geometry: the caller creates Head-weighted Blender objects and materials.
No source images, highlights, extra bones or transmission render target.
"""
import json
import math
from collections import Counter
import numpy as np


def _smooth(x):
    x = min(1.0, max(0.0, float(x)))
    return x*x*(3.0-2.0*x)


def _aperture(upper, lower, cx):
    if len(upper) < 5 or len(lower) < 5:
        raise ValueError('Actual skin did not provide a complete eyelid aperture')
    lo = max(min(float(p[0]) for p in upper), min(float(p[0]) for p in lower))
    hi = min(max(float(p[0]) for p in upper), max(float(p[0]) for p in lower))
    x = .5*(lo+hi)
    def at(row):
        ordered = sorted(row, key=lambda p: p[0])
        return float(np.interp(x, [p[0] for p in ordered], [p[1] for p in ordered]))
    uy, ly = at(upper), at(lower)
    return {'center': [x, .5*(uy+ly)], 'widthMeters': hi-lo,
            'heightAtAxisMeters': uy-ly, 'upperAtAxisY': uy,
            'lowerAtAxisY': ly, 'xRange': [lo, hi]}


def _mesh(vertices, faces, uv_vertex):
    return {'vertices': [list(map(float, p)) for p in vertices],
            'faces': [list(map(int, f)) for f in faces],
            'face_uvs': [[list(map(float, uv_vertex[i])) for i in f] for f in faces]}


def _mesh_proof(mesh, closed):
    p = np.asarray(mesh['vertices'], dtype=float)
    edges = Counter()
    directions = Counter()
    areas = []
    positive_projected = 0
    triangles = 0
    signed_volume = 0.0
    origin = p.mean(axis=0)
    for face in mesh['faces']:
        for a, b in zip(face, face[1:]+face[:1]):
            edge = tuple(sorted((a, b)))
            edges[edge] += 1
            directions[edge] += 1 if a < b else -1
        for j in range(1, len(face)-1):
            a, b, c = p[[face[0], face[j], face[j+1]]]
            cross = np.cross(b-a, c-a)
            areas.append(float(np.linalg.norm(cross)*.5))
            positive_projected += int(cross[2] > 0)
            signed_volume += float(np.dot(a-origin, np.cross(b-origin, c-origin))/6)
            triangles += 1
    boundary = sum(n == 1 for n in edges.values())
    nonmanifold = sum(n > 2 for n in edges.values())
    inconsistent = sum(edges[edge] == 2 and balance != 0 for edge, balance in directions.items())
    orientation = signed_volume > 0 if closed else positive_projected == triangles
    valid = bool(np.all(np.isfinite(p)) and min(areas) > 1e-13
                 and nonmanifold == 0 and inconsistent == 0 and orientation
                 and (not closed or boundary == 0))
    return {'vertices': len(p), 'triangles': triangles,
            'minimumTriangleAreaSquareMeters': min(areas),
            'boundaryEdges': boundary, 'nonmanifoldEdges': nonmanifold,
            'inconsistentSharedEdgeDirections': inconsistent,
            'signedVolumeCubicMeters': signed_volume if closed else None,
            'outwardOrientationPass': bool(orientation),
            'positiveProjectedTriangles': positive_projected, 'pass': valid}


def build_eye19(surface, center, rectuv, segments=48, lod='near', head_joint=5,
                globe_scale=(.0132, .0120, .0132), iris_fraction=.49,
                iris_recess=.00035, corneal_protrusion=.0012):
    """Return opaque/cornea mesh dictionaries, actual skin alignment and sphere.

    Coordinates are canonical rest-world metres, +Y up/+Z forward. The entire
    eye optical center follows the measured skin aperture: iris geometry, UV,
    cornea and globe share this axis. No independent painted-pupil shift.
    ``surface`` is the caller's FaceSurface over the actual deformed skin.
    """
    original = np.asarray(center, dtype=float)
    c = original.copy()
    radii = np.asarray(globe_scale, dtype=float)
    if c.shape != (3,) or radii.shape != (3,) or np.min(radii) <= 0:
        raise ValueError('Expected finite 3D center and positive globe radii')
    upper, lower, _ = surface.lid_outline(c, radius=tuple(radii))
    initial_aperture = _aperture(upper, lower, c[0])
    for _ in range(3):
        a = _aperture(upper, lower, c[0])
        correction = np.asarray(a['center'])-c[:2]
        c[:2] = original[:2]+np.clip(c[:2]+correction-original[:2], -.0025, .0025)
        upper, lower, _ = surface.lid_outline(c, radius=tuple(radii))
        if np.linalg.norm(correction) < .000025:
            break
    aperture = _aperture(upper, lower, c[0])
    far = lod in ('far', 'lod1', 1)
    n = max(12, int(segments)//4) if far else max(32, int(segments))
    front_rings, back_rings, iris_rings, cap_rings = (2, 1, 2, 4) if far else (6, 4, 5, 8)
    ri = float(radii[0]*iris_fraction)
    clearance = .00025  # Survives position quantization; no coincident surfaces.

    def globe_front(r, angle):
        x, y = r*math.cos(angle), r*math.sin(angle)
        u = (x/radii[0])**2+(y/radii[1])**2
        return float(c[2]+radii[2]*math.sqrt(max(0.0, 1-u)))

    def outer_radius(angle):
        return 1/math.sqrt((math.cos(angle)/radii[0])**2+(math.sin(angle)/radii[1])**2)

    def point(r, angle, z):
        return [float(c[0]+r*math.cos(angle)), float(c[1]+r*math.sin(angle)), float(z)]

    def uv(p):
        # Identical projected eye-patch convention to character_atlas.py.
        return rectuv('eyes', .5+(p[0]-c[0])/radii[0]*.44,
                      .5+(p[1]-c[1])/radii[0]*.44)

    angles = [2*math.pi*i/n for i in range(n)]
    boundary_z = [globe_front(ri, a) for a in angles]
    mean_boundary = float(np.mean(boundary_z))
    apex = float(c[2]+radii[2]+corneal_protrusion)
    height = apex-(mean_boundary+clearance)
    sphere_radius = (ri*ri+height*height)/(2*height)
    sphere_center = [float(c[0]), float(c[1]), float(apex-sphere_radius)]

    def iris_z(r, angle):
        u = r/ri
        return (mean_boundary-iris_recess*(1-_smooth(u))
                +(globe_front(ri, angle)-mean_boundary)*_smooth((u-.72)/.28))

    def cap_z(r, angle):
        u = r/ri
        spherical = sphere_center[2]+math.sqrt(max(0, sphere_radius*sphere_radius-r*r))
        return spherical+(globe_front(ri, angle)-mean_boundary)*_smooth((u-.65)/.35)

    vertices, faces, tex = [], [], []
    def add(p):
        index = len(vertices);vertices.append(p);tex.append(uv(p));return index
    def ring(radius_fn, z_fn):
        return [add(point(radius_fn(a), a, z_fn(radius_fn(a), a))) for a in angles]
    def connect(a, b):
        for i in range(n):
            j = (i+1) % n
            faces.append([a[i], b[i], b[j], a[j]])

    # One watertight opaque globe, with a real hole in the front sclera that is
    # closed by the inset iris. A white sphere cannot cover the recessed pupil.
    first = ring(lambda a: ri, globe_front)
    previous = first
    for j in range(1, front_rings+1):
        t = j/front_rings
        current = ring(lambda a: ri+(outer_radius(a)-ri)*t, globe_front)
        connect(previous, current);previous = current
    for j in range(1, back_rings):
        t = 1-j/back_rings
        current = ring(lambda a: outer_radius(a)*t,
                       lambda r, a: 2*c[2]-globe_front(r, a))
        connect(previous, current);previous = current
    back_center = add([float(c[0]), float(c[1]), float(c[2]-radii[2])])
    for i in range(n):
        faces.append([previous[i], back_center, previous[(i+1) % n]])
    iris_center = add([float(c[0]), float(c[1]), float(mean_boundary-iris_recess)])
    previous = None
    for j in range(1, iris_rings+1):
        current = first if j == iris_rings else ring(lambda a: ri*j/iris_rings, iris_z)
        if previous is None:
            for i in range(n):faces.append([iris_center, current[i], current[(i+1) % n]])
        else:connect(previous, current)
        previous = current
    opaque = _mesh(vertices, faces, tex)

    vertices, faces, tex = [], [], []
    cap_center = add([float(c[0]), float(c[1]), apex])
    previous = None
    for j in range(1, cap_rings+1):
        current = ring(lambda a: ri*j/cap_rings, cap_z)
        if previous is None:
            for i in range(n):faces.append([cap_center, current[i], current[(i+1) % n]])
        else:connect(previous, current)
        previous = current
    cornea = _mesh(vertices, faces, tex)
    cornea['normals'] = [(lambda q: (q/np.linalg.norm(q)).tolist())(
        np.asarray(p)-np.asarray(sphere_center)) for p in cornea['vertices']]

    gaps = [cap_z(ri*u, a)-iris_z(ri*u, a)
            for u in np.linspace(0, 1, 65) for a in angles]
    samples = []
    for dx in (-.008, -.004, 0, .004, .008):
        for dy in (-.006, -.003, 0, .003, .006):
            skin, _ = surface.front(c[0]+dx, c[1]+dy, c[2])
            r = math.hypot(dx, dy);a = math.atan2(dy, dx)
            front = iris_z(r, a) if r <= ri else globe_front(r, a)
            samples.append({'dx': dx, 'dy': dy, 'skinZ': None if skin is None else float(skin[2]),
                            'opaqueZ': front, 'opaqueVisible': bool(skin is None or front > skin[2]),
                            'corneaZ': cap_z(r, a) if r <= ri else None})
    opaque_proof, cap_proof = _mesh_proof(opaque, True), _mesh_proof(cornea, False)
    axis_error = float(np.linalg.norm(np.asarray(aperture['center'])-c[:2]))
    alignment = {'coordinateConvention': '+Y up; common +Z optical axis; canonical rest metres',
                 'sourceCenter': original.tolist(), 'opticalCenter': c.tolist(),
                 'centerCorrectionMeters': (c-original).tolist(), 'globeRadiiMeters': radii.tolist(),
                 'initialAperture': initial_aperture, 'measuredAperture': aperture,
                 'axisToMeasuredApertureXYMeters': axis_error,
                 'irisRadiusMeters': ri, 'irisDiameterMeters': 2*ri,
                 'irisCenterRecessMeters': iris_recess,
                 'cornealApexAboveGlobeMeters': corneal_protrusion,
                 'cornealSphereCenter': sphere_center, 'cornealSphereRadiusMeters': sphere_radius,
                 'minimumCorneaIrisSeparationMeters': float(min(gaps)),
                 'skinDepthSamples': samples, 'opaqueGeometry': opaque_proof, 'corneaGeometry': cap_proof,
                 'geometryPass': bool(opaque_proof['pass'] and cap_proof['pass'] and min(gaps) > .0001),
                 'apertureAlignmentPass': axis_error < .0005,
                 'normalModel': 'Analytic spherical cap; outer rim smoothly follows ellipsoid limbus',
                 'headJoint': head_joint, 'lod': str(lod), 'extraDrawCalls': 1,
                 'extraImages': 0, 'transmissionRenderTarget': False, 'paintedHighlights': False}
    if not alignment['geometryPass']:
        raise ValueError('Eye geometry failed finite/winding/clearance proof: '+str(alignment))
    return {'opaque': opaque, 'cornea': cornea, 'cornea_center': sphere_center,
            'upper': upper, 'lower': lower, 'alignment': alignment,
            'material': {'name': 'EyesCornea', 'alphaMode': 'BLEND', 'doubleSided': False,
                         'pbrMetallicRoughness': {'baseColorFactor': [0, 0, 0, .16], 'metallicFactor': 0,
                                                 'roughnessFactor': .05},
                         'extensions': {'KHR_materials_clearcoat': {'clearcoatFactor': 1,
                                                                  'clearcoatRoughnessFactor': .02},
                                        'KHR_materials_specular': {'specularFactor': 0},
                                        'KHR_materials_ior': {'ior': 1.376}},
                         'extras': {'castShadow': False, 'depthWrite': False,
                                    'opticalApproximation': 'Thin reflected corneal cap; no transmission/refraction pass'}}}


if __name__ == '__main__':
    import argparse
    from pathlib import Path
    parser = argparse.ArgumentParser();parser.add_argument('--out');args = parser.parse_args()
    class AnalyticSocket:
        def __init__(self):self.cx, self.cy = .0307, 1.6205
        def lid_outline(self, center, radius=None):
            upper, lower = [], []
            for x in np.linspace(self.cx-.0105, self.cx+.0105, 33):
                h = .0045*math.sqrt(max(0, 1-((x-self.cx)/.0105)**2))
                upper.append((float(x), self.cy+h, .094, np.array([0, 0, 1])))
                lower.append((float(x), self.cy-h, .094, np.array([0, 0, 1])))
            return upper, lower, self.cy-center[1]
        def front(self, x, y, eye_z=0):
            inside = ((x-self.cx)/.0105)**2+((y-self.cy)/.0045)**2 < 1
            return np.array([x, y, .075 if inside else .094]), np.array([0, 0, 1])
    results = []
    for lod in ('near', 'far'):
        result = build_eye19(AnalyticSocket(), [.03, 1.62, .08], lambda kind, u, v: [u, v], lod=lod)
        results.append(result['alignment'])
    proof = {'kind': 'eye19-pure-geometry-analytic-socket-fixture',
             'scope': 'Finite/manifold/front-cap winding/clearance/common-axis math only. Actual deformed-skin alignment is returned by build_eye19 and must be recorded by the real character export. No visual acceptance or real-person data.',
             'results': results, 'pass': all(r['geometryPass'] and r['apertureAlignmentPass'] for r in results)}
    text = json.dumps(proof, indent=2)+'\n'
    if args.out:Path(args.out).write_text(text)
    print(json.dumps({'pass': proof['pass'], 'lods': [{'lod': r['lod'], 'opaqueTriangles': r['opaqueGeometry']['triangles'], 'corneaTriangles': r['corneaGeometry']['triangles'], 'minimumGapMeters': r['minimumCorneaIrisSeparationMeters'], 'axisErrorMeters': r['axisToMeasuredApertureXYMeters']} for r in results]}))
