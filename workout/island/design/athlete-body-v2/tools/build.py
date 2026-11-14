#!/usr/bin/env python3
"""CC0-1.0. Add sculpted hands to the shipped CC0 body; never rewrite an input.

Run from any directory with Python 3 + NumPy. The canonical rig and all original
vertex attributes remain byte-identical; only distal skin faces are replaced.
"""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import struct
import numpy as np

HERE = Path(__file__).resolve().parents[1]
ISLAND = HERE.parents[1]
SOURCE = ISLAND / 'assets/athlete-body-v22'
DTYPES = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
SIZES = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
CUT_Y = .805
# One concave palm silhouette, a thumb web, and two rounded finger groups.
# Coordinates are metres relative to the LEFT hand, +Y up. No finger joints.
OUTLINE = np.array([
    [-.022, .013], [.022, .013], [.029, -.038], [.034, -.074],
    [.033, -.135], [.027, -.151], [.007, -.157], [.001, -.148],
    [-.002, -.113], [-.007, -.150], [-.018, -.160], [-.030, -.154],
    [-.035, -.137], [-.035, -.088], [-.031, -.072],
    [-.057, -.109], [-.067, -.106], [-.072, -.095],
    [-.066, -.075], [-.041, -.044], [-.028, -.017],
], dtype=float)


def read_glb(path):
    blob = Path(path).read_bytes()
    length = struct.unpack_from('<I', blob, 12)[0]
    doc = json.loads(blob[20:20 + length])
    return doc, blob[28 + length:]


def accessor(doc, binary, index):
    a = doc['accessors'][index]
    v = doc['bufferViews'][a['bufferView']]
    dtype = np.dtype(DTYPES[a['componentType']])
    n = SIZES[a['type']]
    return np.ndarray((a['count'], n), dtype, buffer=binary,
                      offset=v.get('byteOffset', 0) + a.get('byteOffset', 0),
                      strides=(v.get('byteStride', dtype.itemsize * n), dtype.itemsize)).copy()


def triangulate(poly):
    """Ear clipping preserves the real thumb/finger notches (never a convex fan)."""
    def cross(a, b, c):
        u, v = b - a, c - a
        return u[0] * v[1] - u[1] * v[0]
    ids = list(range(len(poly)))
    if sum(poly[i, 0]*poly[(i+1) % len(poly), 1] -
           poly[i, 1]*poly[(i+1) % len(poly), 0] for i in ids) < 0:
        ids.reverse()
    out = []
    while len(ids) > 3:
        for k, b in enumerate(ids):
            a, c = ids[k - 1], ids[(k + 1) % len(ids)]
            if cross(poly[a], poly[b], poly[c]) <= 1e-10:
                continue
            if any(min(cross(poly[a], poly[b], poly[p]),
                       cross(poly[b], poly[c], poly[p]),
                       cross(poly[c], poly[a], poly[p])) >= -1e-10
                   for p in ids if p not in (a, b, c)):
                continue
            out.append([a, b, c])
            ids.pop(k)
            break
        else:
            raise ValueError('Invalid hand contour')
    return out + [ids]


def hand_geometry(sign, width, depth):
    n = len(OUTLINE)
    pts = []
    for layer in [-1, 0, 1]:
        for x, y in OUTLINE:
            # Bevel: the face is slightly inset from the edge. The concave
            # outline is the same on all three rings, retaining both notches.
            inset = .93 if layer else 1
            px, py = x * inset, -.065 + (y + .065) * inset
            thickness = .014 + .006 * np.clip((py + .16) / .10, 0, 1)
            pts.append([sign * (.16 + px * width), .79 + py,
                        (.005 + layer * thickness) * depth])
    pts = np.array(pts, dtype='<f4')
    caps = triangulate(OUTLINE)
    faces = [[c, b, a] for a, b, c in caps]
    faces += [[a + 2*n, b + 2*n, c + 2*n] for a, b, c in caps]
    # OUTLINE is clockwise; wall winding follows the same handedness as caps.
    clockwise = sum(OUTLINE[i, 0] * OUTLINE[(i+1) % n, 1] -
                    OUTLINE[i, 1] * OUTLINE[(i+1) % n, 0] for i in range(n)) < 0
    for layer in range(2):
        for i in range(n):
            if i == 0:
                continue  # Open wrist: joined to the exact clipped forearm ring.
            j = (i + 1) % n
            a, b, c, d = layer*n+i, layer*n+j, (layer+1)*n+j, (layer+1)*n+i
            faces += [[a, c, b], [a, d, c]] if clockwise else [[a, b, c], [a, c, d]]
    faces = np.array(faces, dtype='<u2')
    if sign < 0:
        faces = faces[:, ::-1]
    glove = pts.copy()
    distal = np.clip((.795 - pts[:, 1]) / .055, 0, 1)
    glove[:, 0] += (pts[:, 0] - sign * .16) * .24 * distal
    glove[:, 1] -= (.795 - pts[:, 1]) * .065 * distal
    glove[:, 2] += (pts[:, 2] - .005 * depth) * .65 * distal
    return pts, faces, glove


def normals(pts, faces):
    out = np.zeros_like(pts)
    for a, b, c in faces:
        v = np.cross(pts[b] - pts[a], pts[c] - pts[a])
        out[[a, b, c]] += v
    return out / np.maximum(np.linalg.norm(out, axis=1)[:, None], 1e-12)


def build(info):
    path = SOURCE / 'models' / (info['id'] + '.glb')
    doc, binary = read_glb(path)
    old_primitive = doc['meshes'][0]['primitives'][0]
    arrays = {k: accessor(doc, binary, i).tolist() for k, i in old_primitive['attributes'].items()}
    morphs = [accessor(doc, binary, t['POSITION']).tolist() for t in old_primitive['targets']]
    source_count = len(arrays['POSITION'])
    arrays['_GLOVE'] = [[0] for _ in range(source_count)]
    glove_delta = [[0, 0, 0] for _ in range(source_count)]
    glove_normals = [[0, 0, 0] for _ in range(source_count)]
    old_faces = accessor(doc, binary, old_primitive['indices']).reshape(-1, 3)
    clipped = {}
    wrist_vertices = {1: set(), -1: set()}

    def intersection(i, j):
        key = tuple(sorted((int(i), int(j))))
        if key in clipped:
            return clipped[key]
        p, q = np.array(arrays['POSITION'][i]), np.array(arrays['POSITION'][j])
        t = (CUT_Y - p[1]) / (q[1] - p[1])
        index = len(arrays['POSITION'])
        for name, values in arrays.items():
            if name in ('JOINTS_0', 'WEIGHTS_0'):
                continue
            value = (1-t) * np.array(values[i]) + t * np.array(values[j])
            if name == 'NORMAL':
                value /= max(np.linalg.norm(value), 1e-12)
            values.append(value.tolist())
        # Interpolate by joint name rather than interpolating integer indices.
        weights = {}
        for at, factor in [(i, 1-t), (j, t)]:
            for bone, w in zip(arrays['JOINTS_0'][at], arrays['WEIGHTS_0'][at]):
                weights[bone] = weights.get(bone, 0) + factor*w
        top = sorted(((j, w) for j, w in weights.items() if w > 1e-8), key=lambda v: -v[1])[:4]
        top += [(0, 0)] * (4 - len(top))
        arrays['JOINTS_0'].append([v[0] for v in top])
        total = sum(v[1] for v in top)
        arrays['WEIGHTS_0'].append([v[1]/total for v in top])
        for values in morphs:
            values.append(((1-t) * np.array(values[i]) + t * np.array(values[j])).tolist())
        glove_delta.append([0, 0, 0]); glove_normals.append([0, 0, 0])
        clipped[key] = index
        return index

    faces = []
    affected_faces = 0
    for tri in old_faces:
        p = np.array([arrays['POSITION'][i] for i in tri])
        skin = all(arrays['_REGION'][i][0] == 0 for i in tri)
        hand = all(abs(v[0]) > .08 for v in p) and p[:, 1].min() < CUT_Y
        hand &= any(any(j in (8, 11) and w > 0 for j, w in
                        zip(arrays['JOINTS_0'][i], arrays['WEIGHTS_0'][i])) for i in tri)
        if not (skin and hand):
            faces.append(list(tri)); continue
        affected_faces += 1
        polygon = []
        for k, i in enumerate(tri):
            j = tri[(k+1) % 3]
            inside_i = arrays['POSITION'][i][1] >= CUT_Y
            inside_j = arrays['POSITION'][j][1] >= CUT_Y
            if inside_i:
                polygon.append(int(i))
            if inside_i != inside_j:
                v = intersection(i, j)
                polygon.append(v)
                wrist_vertices[1 if p[:, 0].mean() > 0 else -1].add(v)
        for k in range(1, len(polygon)-1):
            faces.append([polygon[0], polygon[k], polygon[k+1]])
    retained_triangles = len(faces)
    hand_ranges = []
    for sign in [1, -1]:
        pts, hand_faces, glove = hand_geometry(sign, info['bodyShape']['width'], info['bodyShape']['depth'])
        ns, gn = normals(pts, hand_faces), normals(glove, hand_faces)
        start = len(arrays['POSITION'])
        hand_ranges.append([start, len(pts)])
        for k, pos in enumerate(pts):
            hand_weight = float(np.clip((.819 - pos[1]) / .055, .35, 1))
            values = {
                'POSITION': pos.tolist(), 'NORMAL': ns[k].tolist(),
                'TEXCOORD_0': [.265, .87],
                'JOINTS_0': [8 if sign > 0 else 11, (7 if sign > 0 else 10) if hand_weight < 1 else 0, 0, 0],
                'WEIGHTS_0': [hand_weight, 1-hand_weight, 0, 0],
                'COLOR_0': [.546, .266, .141, 1], '_REGION': [0], '_GLOVE': [1],
            }
            for name in arrays:
                arrays[name].append(values[name])
            for target in morphs:
                target.append([0, 0, 0])
            glove_delta.append((glove[k] - pos).tolist())
            glove_normals.append((gn[k] - ns[k]).tolist())
        faces.extend((hand_faces + start).tolist())
        # Weld by position across the inherited UV seams, then zipper the
        # actual forearm cross-section to the six-sided open hand wrist.
        unique = {}
        for v in sorted(wrist_vertices[sign]):
            unique.setdefault(tuple(np.round(arrays['POSITION'][v], 6)), v)
        upper = list(unique.values())
        n = len(OUTLINE)
        lower = [start+i for i in [0, 1, n+1, 2*n+1, 2*n, n]]
        center = np.array([sign*.16, .005*info['bodyShape']['depth']])
        def angle(v):
            p = np.array(arrays['POSITION'][v])[[0, 2]] - center
            return np.arctan2(p[1], p[0])
        upper.sort(key=angle); lower.sort(key=angle)
        i = j = 0
        while i < len(upper) or j < len(lower):
            a, b = upper[i % len(upper)], lower[j % len(lower)]
            if j == len(lower) or (i < len(upper) and (i+1)/len(upper) <= (j+1)/len(lower)):
                tri = [a, upper[(i+1) % len(upper)], b]; i += 1
            else:
                tri = [a, lower[(j+1) % len(lower)], b]; j += 1
            pa, pb, pc = np.array([arrays['POSITION'][v] for v in tri])
            outward = (pa+pb+pc)/3 - np.array([center[0], CUT_Y, center[1]])
            outward[1] = 0
            if np.dot(np.cross(pb-pa, pc-pa), outward) < 0:
                tri.reverse()
            faces.append(tri)

    out = copy.deepcopy(doc)
    out['accessors'], out['bufferViews'] = [], []
    data = bytearray()

    def add(values, ctype, kind, target=None, bounds=False):
        a = np.asarray(values, dtype=DTYPES[ctype]).reshape(-1, SIZES[kind])
        data.extend(b'\0' * (-len(data) % 4))
        view = {'buffer': 0, 'byteOffset': len(data), 'byteLength': a.nbytes}
        if ctype == 5121 and kind == 'SCALAR':
            # Four-byte aligned scalar vertex attributes for glTF portability.
            padded = np.zeros((len(a), 4), dtype='u1'); padded[:, 0] = a[:, 0]
            view.update(byteStride=4, byteLength=padded.nbytes); data.extend(padded.tobytes())
        else:
            data.extend(a.tobytes())
        if target:
            view['target'] = target
        item = {'bufferView': len(out['bufferViews']), 'componentType': ctype, 'count': len(a), 'type': kind}
        if bounds:
            item.update(min=a.min(0).tolist(), max=a.max(0).tolist())
        out['bufferViews'].append(view); out['accessors'].append(item)
        return len(out['accessors']) - 1

    attributes = {}
    for name, values in arrays.items():
        old = doc['accessors'][old_primitive['attributes'][name]] if name in old_primitive['attributes'] else {'componentType': 5121, 'type': 'SCALAR'}
        attributes[name] = add(values, old['componentType'], old['type'], 34962, name == 'POSITION')
    targets = [{'POSITION': add(m, 5126, 'VEC3', 34962, True)} for m in morphs]
    targets.append({'POSITION': add(glove_delta, 5126, 'VEC3', 34962, True),
                    'NORMAL': add(glove_normals, 5126, 'VEC3', 34962)})
    primitive = {'attributes': attributes, 'indices': add(np.array(faces).ravel(), 5123, 'SCALAR', 34963),
                 'material': 0, 'targets': targets}
    out['meshes'][0]['primitives'] = [primitive]
    out['meshes'][0]['weights'] = [0, 0, 0, 0]
    out['meshes'][0]['extras']['targetNames'].append('goalkeeper_gloves')
    out['meshes'][0]['extras'].update(originalVertexCount=source_count, handVertexRanges=hand_ranges,
                                     wristJoin='clipped forearm boundary to open six-sided hand wrist', authoredHandTriangles=2*len(hand_faces))
    ibm = accessor(doc, binary, doc['skins'][0]['inverseBindMatrices'])
    out['skins'][0]['inverseBindMatrices'] = add(ibm, 5126, 'MAT4')
    out['asset'].update(generator='athlete-body-v2 CC0; tools/build.py',
                        copyright='CC0-1.0; inherited CC0 athlete, original sculpted hands')
    out['buffers'] = [{'byteLength': len(data)}]
    data.extend(b'\0' * (-len(data) % 4))
    header = json.dumps(out, separators=(',', ':'), ensure_ascii=False).encode()
    header += b' ' * (-len(header) % 4)
    result = struct.pack('<III', 0x46546c67, 2, 28+len(header)+len(data))
    result += struct.pack('<II', len(header), 0x4e4f534a) + header
    result += struct.pack('<II', len(data), 0x004e4942) + data
    dest = HERE / 'runtime/models' / path.name
    dest.parent.mkdir(parents=True, exist_ok=True); dest.write_bytes(result)
    return {'id': info['id'], 'path': 'runtime/models/' + path.name,
            'heightMeters': info['heightMeters'], 'bodyShape': info['bodyShape'],
            'trianglesBefore': len(old_faces), 'trianglesAfter': len(faces),
            'triangleDelta': len(faces)-len(old_faces), 'handTriangles': 2*len(hand_faces),
            'replacedSourceFaces': affected_faces, 'retainedAndClippedTriangles': retained_triangles,
            'vertices': len(arrays['POSITION']), 'sourceVertices': source_count,
            'bytes': len(result), 'sha256': hashlib.sha256(result).hexdigest(),
            'sourceSha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    source_manifest = json.loads((SOURCE / 'body-manifest.json').read_text())
    models = [build(info) for info in source_manifest['models']]
    assert all(m['triangleDelta'] <= 300 for m in models)
    texture = HERE / 'runtime/textures/athlete-atlas.png'
    texture.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE / 'textures/athlete-atlas.png', texture)
    manifest = {'version': 'athlete-body-v2', 'license': 'CC0-1.0',
                'sourceCommit': 'd759582c171600dd7c7df7906c2fb38ae7f8b88a',
                'source': 'workout/island/assets/athlete-body-v22', 'models': models,
                'canonicalBones': source_manifest['canonicalBones'],
                'regions': source_manifest['regions'], 'defaultColors': source_manifest['defaultColors'],
                'morphs': ['basketball', 'hockey', 'tennis', 'goalkeeper_gloves'],
                'gloves': {'attribute': '_GLOVE', 'color': 'uniform_secondary', 'newBones': 0},
                'numbers': {'range': [0, 99], 'color': 'uniform_trim', 'method': 'analytic seven-segment rest-space shader'},
                'crest': {'method': 'geometric shield mask in rest space', 'realLogo': False},
                'draco': False, 'meshopt': False}
    (HERE / 'body-manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+'\n')
    print(json.dumps(models, indent=2))


if __name__ == '__main__':
    main()
