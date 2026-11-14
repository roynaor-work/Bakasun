"""CC0 athlete LOD authoring. Python 3 + numpy; meshoptimizer 1.3.0.

LOD1 attributes and all LOD2 positions/skin weights are selected from the source.
LOD2 uses original fitted anatomical lofts with single-volume mitten hands.
No Blender export, skeleton rebake, runtime compression, or external mesh input.
"""
import copy
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import zlib

import numpy as np
from lod2 import authored_lod2

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
SOURCE = REPO / 'workout/island/assets/athlete-body-v22'
TYPES = {5121: np.dtype('u1'), 5123: np.dtype('<u2'), 5125: np.dtype('<u4'), 5126: np.dtype('<f4')}
WIDTH = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + size])
    binary = data[28 + size:]

    def read(index):
        a = doc['accessors'][index]
        view = doc['bufferViews'][a['bufferView']]
        dtype, width = TYPES[a['componentType']], WIDTH[a['type']]
        return np.ndarray((a['count'], width), dtype, binary,
                          view.get('byteOffset', 0) + a.get('byteOffset', 0),
                          (view.get('byteStride', width * dtype.itemsize), dtype.itemsize)).copy()

    primitive = doc['meshes'][0]['primitives'][0]
    return doc, {k: read(v) for k, v in primitive['attributes'].items()}, \
        read(primitive['indices']).reshape(-1, 3), \
        [read(t['POSITION']) for t in primitive['targets']], read(doc['skins'][0]['inverseBindMatrices'])


class Buffer:
    def __init__(self):
        self.data = bytearray()
        self.views = []
        self.accessors = []

    def add(self, values, kind, component=5126, target=None):
        a = np.asarray(values, dtype=TYPES[component]).reshape(-1, WIDTH[kind])
        self.data.extend(b'\0' * (-len(self.data) % 4))
        raw = a.tobytes()
        # glTF vertex attributes, including scalar custom bytes, have four-byte alignment.
        stride = max(4, a.shape[1] * a.dtype.itemsize) if target == 34962 else a.shape[1] * a.dtype.itemsize
        if target == 34962 and stride != a.shape[1] * a.dtype.itemsize:
            padded = bytearray(len(a) * stride)
            for i, row in enumerate(a):
                padded[i * stride:i * stride + row.nbytes] = row.tobytes()
            raw = bytes(padded)
        view = {'buffer': 0, 'byteOffset': len(self.data), 'byteLength': len(raw)}
        if target:
            view['target'] = target
        if target == 34962:
            view['byteStride'] = stride
        self.views.append(view)
        self.data.extend(raw)
        accessor = {'bufferView': len(self.views) - 1, 'componentType': component, 'count': len(a), 'type': kind}
        if kind == 'VEC3':
            accessor.update(min=a.min(0).tolist(), max=a.max(0).tolist())
        self.accessors.append(accessor)
        return len(self.accessors) - 1


def pack(doc, binary, destination):
    doc['bufferViews'] = binary.views
    doc['accessors'] = binary.accessors
    binary.data.extend(b'\0' * (-len(binary.data) % 4))
    doc['buffers'] = [{'byteLength': len(binary.data)}]
    raw = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
    raw += b' ' * (-len(raw) % 4)
    data = struct.pack('<III', 0x46546c67, 2, 28 + len(raw) + len(binary.data))
    data += struct.pack('<II', len(raw), 0x4e4f534a) + raw
    data += struct.pack('<II', len(binary.data), 0x004e4942) + binary.data
    destination.write_bytes(data)


def weight_matrix(a):
    weights = np.zeros((len(a['POSITION']), 18), np.float32)
    for k in range(4):
        weights[np.arange(len(weights)), a['JOINTS_0'][:, k]] += a['WEIGHTS_0'][:, k]
    return weights


def simplify(a, faces, target):
    importance = np.where(a['POSITION'][:, 1] > 1.43, 2.5, 1).reshape(-1, 1)
    attributes = np.concatenate([a['NORMAL'] * importance, a['TEXCOORD_0'], weight_matrix(a),
                                 np.eye(9, dtype=np.float32)[a['_REGION'].ravel()]], axis=1)
    lock = np.zeros(len(a['POSITION']), np.uint8)
    # Preserve exact scalp/sole extents and body width, including all tied extrema.
    for axis in range(3):
        for value in (a['POSITION'][:, axis].min(), a['POSITION'][:, axis].max()):
            lock[np.abs(a['POSITION'][:, axis] - value) < 1e-7] = 1
    # Four source silhouette anchors around elbows and knees prevent a long
    # simplified triangle from consuming an entire bending cross-section.
    for x, y, radius, z in [(.16, 1.03, .035, .005), (-.16, 1.03, .035, .005),
                             (.10, .45, .06, .025), (-.10, .45, .06, .025),
                             (.10, .08, .05, .02), (-.10, .08, .05, .02)]:
        for dx, dz in [(radius, 0), (-radius, 0), (0, radius), (0, -radius)]:
            point = np.array([x + dx, y, z + dz])
            if target > 500:
                lock[np.linalg.norm(a['POSITION'] - point, axis=1).argmin()] = 1
    with tempfile.TemporaryDirectory(prefix='athlete-lod-') as tmp:
        path = Path(tmp) / 'input.json'
        path.write_text(json.dumps({'indices': faces.ravel().tolist(), 'positions': a['POSITION'].ravel().tolist(),
                                    'attributes': attributes.ravel().tolist(), 'lock': lock.tolist(), 'target': target}))
        output = subprocess.check_output(['node', str(ROOT / 'source/simplify.mjs'), str(path)], text=True)
    result = json.loads(output)
    faces = np.array(result['indices'], np.uint32).reshape(-1, 3)
    # A locked vertex can still lose all incident faces. Restore each original
    # sole landmark by selecting it in place of its nearest retained sole point.
    # This keeps the source stature and still selects exact source attributes.
    weights = weight_matrix(a)
    for joint in (14, 17):
        candidates = np.flatnonzero(weights[:, joint] > .8)
        sole = candidates[a['POSITION'][candidates, 1].argmin()]
        used = np.unique(faces)
        retained = used[(weights[used, joint] > .8) & (a['_REGION'].ravel()[used] == 5)]
        nearest = retained[np.linalg.norm(a['POSITION'][retained] - a['POSITION'][sole], axis=1).argmin()]
        if sole not in used:
            faces[faces == nearest] = sole
    return faces, result['attributeWeightedError']


def number_faces(a, faces):
    """A draped alpha-mask layer reuses actual back surface triangles, with no digit mesh."""
    p = a['POSITION'][faces]
    n = a['NORMAL'][faces].mean(1)
    region = a['_REGION'].ravel()[faces]
    cross_rect = (p[:, :, 0].min(1) < .078) & (p[:, :, 0].max(1) > -.078) \
        & (p[:, :, 1].min(1) < 1.31) & (p[:, :, 1].max(1) > 1.115)
    return faces[cross_rect & (p[:, :, 2].mean(1) < -.045) & (n[:, 2] < -.45)
                 & np.isin(region, [1, 3]).all(1)]


def write_model(source, a, faces, morphs, ibm, destination, level, source_ids=None):
    doc = copy.deepcopy(source)
    binary = Buffer()
    used = np.unique(faces)
    remap = np.zeros(len(a['POSITION']), np.uint32)
    remap[used] = np.arange(len(used))
    attributes = {}
    for key, values in a.items():
        component = 5121 if key in ('JOINTS_0', '_REGION') else 5126
        attributes[key] = binary.add(values[used], {1: 'SCALAR', 2: 'VEC2', 3: 'VEC3', 4: 'VEC4'}[values.shape[1]], component, 34962)
    primitive = {'attributes': attributes, 'indices': binary.add(remap[faces], 'SCALAR', 5123, 34963),
                 'material': 0, 'targets': [{'POSITION': binary.add(m[used], 'VEC3', target=34962)} for m in morphs]}
    mesh = doc['meshes'][0]
    mesh['primitives'] = [primitive]
    patches = number_faces(a, faces)
    patch_vertices = np.unique(patches)
    if not len(patches):
        raise ValueError('Back number has no supporting surface')
    patch_remap = np.zeros(len(a['POSITION']), np.uint32)
    patch_remap[patch_vertices] = np.arange(len(patch_vertices))
    patch_positions = a['POSITION'][patch_vertices] + a['NORMAL'][patch_vertices] * .0007
    # +Z is front; reverse horizontal coordinate on the -Z back face.
    uv = np.column_stack([(.078 - a['POSITION'][patch_vertices, 0]) / .156,
                          (1.31 - a['POSITION'][patch_vertices, 1]) / .195])
    patch_attrs = {
        'POSITION': binary.add(patch_positions, 'VEC3', target=34962),
        'NORMAL': binary.add(a['NORMAL'][patch_vertices], 'VEC3', target=34962),
        'TEXCOORD_0': binary.add(uv, 'VEC2', target=34962),
        'JOINTS_0': binary.add(a['JOINTS_0'][patch_vertices], 'VEC4', 5121, 34962),
        'WEIGHTS_0': binary.add(a['WEIGHTS_0'][patch_vertices], 'VEC4', target=34962),
        'COLOR_0': binary.add(np.tile(a['COLOR_0'][a['_REGION'].ravel() == 3][0], (len(patch_vertices), 1)), 'VEC4', target=34962),
        '_REGION': binary.add(np.full((len(patch_vertices), 1), 3), 'SCALAR', 5121, 34962),
    }
    mesh['primitives'].append({'attributes': patch_attrs,
        'indices': binary.add(patch_remap[patches], 'SCALAR', 5123, 34963), 'material': 1,
        'targets': [{'POSITION': binary.add(m[patch_vertices], 'VEC3', target=34962)} for m in morphs]})
    mesh['extras'].update(lod=level, fingerPolicy='single-mitten-volume' if level == 2 else 'source-fingers',
                         sourceVertexIndices=(used if source_ids is None else source_ids[used]).tolist(), numberMask='number-23-mask.png')
    doc['skins'][0]['inverseBindMatrices'] = binary.add(ibm, 'MAT4')
    doc['images'][0]['uri'] = '../../../assets/athlete-body-v22/textures/athlete-atlas.png'
    sampler = len(doc.setdefault('samplers', []))
    doc['samplers'].append({'magFilter': 9729, 'minFilter': 9729, 'wrapS': 33071, 'wrapT': 33071})
    texture = len(doc['textures'])
    doc['images'].append({'name': 'CC0 original back-number alpha mask', 'uri': '../textures/number-23-mask.png'})
    doc['textures'].append({'source': len(doc['images']) - 1, 'sampler': sampler})
    doc['materials'].append({'name': 'back_number_mask', 'alphaMode': 'MASK', 'alphaCutoff': .5,
        'pbrMetallicRoughness': {'baseColorTexture': {'index': texture}, 'metallicFactor': 0, 'roughnessFactor': .88}})
    doc['asset'].update(generator='athlete-lod-v1 / meshoptimizer offline selection',
                        copyright='CC0-1.0; source athlete-body-v22 and original LOD/number adaptation')
    pack(doc, binary, destination)
    return {'bodyTriangles': len(faces), 'numberMaskTriangles': len(patches), 'triangles': len(faces) + len(patches),
            'vertices': len(used) + len(patch_vertices), 'bytes': destination.stat().st_size,
            'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}


def write_mask():
    # Original seven-segment block glyphs. No font file or third-party artwork.
    segments = [(.18, .08, .82, .19), (.73, .14, .86, .49), (.73, .51, .86, .86),
                (.18, .81, .82, .92), (.14, .51, .27, .86), (.14, .14, .27, .49), (.18, .445, .82, .555)]
    codes = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgecd', 'abc', 'abcdefg', 'abfgcd']
    width, height = 128, 128
    pixels = bytearray(width * height * 4)
    for column, digit in enumerate('23'):
        for segment in codes[int(digit)]:
            x0, y0, x1, y1 = segments[ord(segment) - ord('a')]
            for y in range(int(y0 * 100 + 14), int(y1 * 100 + 14)):
                for x in range(int(column * 54 + 10 + x0 * 54), int(column * 54 + 10 + x1 * 54)):
                    p = (y * width + x) * 4
                    pixels[p:p + 4] = b'\xff' * 4
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    rows = b''.join(b'\0' + pixels[y * width * 4:(y + 1) * width * 4] for y in range(height))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')
    (ROOT / 'textures/number-23-mask.png').write_bytes(png)


def main():
    for directory in ('models', 'textures', 'verification'):
        (ROOT / directory).mkdir(exist_ok=True)
    write_mask()
    _, base, source_faces, _, _ = read_glb(SOURCE / 'models/soccer.glb')
    levels = {}
    for level, input_faces, target, budget in [(1, source_faces, 1400, 1500)]:
        faces, error = simplify(base, input_faces, target)
        levels[level] = [faces, error, budget]
    manifest = {'schemaVersion': 1, 'sourceCommit': subprocess.check_output(['git', 'log', '-1', '--format=%H', '--', str(SOURCE.relative_to(REPO))], cwd=REPO, text=True).strip(),
                'source': 'workout/island/assets/athlete-body-v22', 'sourceBodyTriangles': len(source_faces),
                'license': 'CC0-1.0', 'compression': 'none', 'canonicalJointCount': 18,
                'models': []}
    for profile in ('guard', 'wing', 'center', 'soccer'):
        path = SOURCE / f'models/{profile}.glb'
        doc, attrs, original, morphs, ibm = read_glb(path)
        assert np.array_equal(source_faces, original), 'Shared body topology changed'
        for level, (faces, error, budget) in levels.items():
            destination = ROOT / f'models/{profile}-lod{level}.glb'
            record = write_model(doc, attrs, faces, morphs, ibm, destination, level)
            if record['triangles'] > budget:
                raise ValueError(f'{destination.name}: {record["triangles"]} > {budget}')
            record.update(id=profile, lod=level, path=f'models/{destination.name}',
                          sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                          attributeWeightedSimplificationError=error)
            manifest['models'].append(record)
            print(profile, level, record['triangles'], record['bytes'])
        low_attrs, low_faces, low_morphs, ids = authored_lod2(attrs, morphs, weight_matrix)
        destination = ROOT / f'models/{profile}-lod2.glb'
        record = write_model(doc, low_attrs, low_faces, low_morphs, ibm, destination, 2, ids)
        if record['triangles'] > 400:
            raise ValueError(f'{destination.name}: {record["triangles"]} > 400')
        record.update(id=profile, lod=2, path=f'models/{destination.name}',
                      sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                      method='original anatomical lofts; exact source vertex positions and skin weights; neutral UV')
        manifest['models'].append(record)
        print(profile, 2, record['triangles'], record['bytes'])
    (ROOT / 'asset-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
