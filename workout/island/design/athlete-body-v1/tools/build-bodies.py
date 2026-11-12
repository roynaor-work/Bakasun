#!/usr/bin/env python3
"""CC0 athlete variants from one pinned canonical CC0 actor.

Usage: python3 tools/build-bodies.py --source /path/to/canonical-player-01.glb
The input is the immutable motion-fix-v12 runtime model identified in the
manifest. No images, identities, brands, motion tracks or third-party code are
generated or copied by this script. It preserves the input skin/face topology,
UVs and weights, replaces its hair and sleeve strips, and emits a shared atlas.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import struct

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REGIONS = {'skin': 0, 'uniform_primary': 1, 'uniform_secondary': 2,
           'uniform_trim': 3, 'shoe_upper': 4, 'shoe_sole': 5, 'eyes': 6,
           'hair': 7, 'sock': 8}
SKIN = ['#f2c6a0', '#d9a17b', '#bd8058', '#9a6041', '#70422d', '#44291f']
DEFAULT = {0: '#c38d69', 1: '#187e83', 2: '#16363b', 3: '#e7dbb9',
           4: '#253540', 5: '#d4d5cb', 6: '#e0e0e0', 7: '#442d22', 8: '#e7dbb9'}
PROFILES = [('soccer', 'כדורגל', 1.80, 1.00, 1.00),
            ('guard', 'רכז', 1.78, .97, .98),
            ('wing', 'קיצוני', 1.94, 1.045, 1.035),
            ('center', 'סנטר', 2.08, 1.12, 1.09)]
BONES = [('Root', None, [0, 0, 0]), ('Hips', 'Root', [0, .86, 0]),
         ('Spine', 'Hips', [0, .20, 0]), ('Chest', 'Spine', [0, .18, 0]),
         ('Neck', 'Chest', [0, .10, 0]), ('Head', 'Neck', [0, .13, 0]),
         ('LeftArm', 'Chest', [.16, .06, 0]), ('LeftForeArm', 'LeftArm', [0, -.27, 0]),
         ('LeftHand', 'LeftForeArm', [0, -.24, 0]), ('RightArm', 'Chest', [-.16, .06, 0]),
         ('RightForeArm', 'RightArm', [0, -.27, 0]), ('RightHand', 'RightForeArm', [0, -.24, 0]),
         ('LeftUpLeg', 'Hips', [.10, 0, 0]), ('LeftLeg', 'LeftUpLeg', [0, -.41, 0]),
         ('LeftFoot', 'LeftLeg', [0, -.37, 0]), ('RightUpLeg', 'Hips', [-.10, 0, 0]),
         ('RightLeg', 'RightUpLeg', [0, -.41, 0]), ('RightFoot', 'RightLeg', [0, -.37, 0])]
SOURCE_SHA = 'd6c8ac7d103a51fb7a48875641a88623173e466c05e87c52cf1cec2b6366b122'


def linear_color(hex_color):
    rgb = np.array([int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    return np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)


class Source:
    def __init__(self, path):
        data = Path(path).read_bytes()
        self.sha = hashlib.sha256(data).hexdigest()
        if self.sha != SOURCE_SHA:
            raise ValueError('Source hash differs from the pinned CC0 actor')
        length = struct.unpack_from('<I', data, 12)[0]
        self.doc = json.loads(data[20:20 + length])
        self.bin = data[28 + length:]

    def array(self, index):
        a = self.doc['accessors'][index]
        view = self.doc['bufferViews'][a['bufferView']]
        dtype = {5126: '<f4', 5125: '<u4', 5123: '<u2', 5121: 'u1'}[a['componentType']]
        count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        offset = view.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = view.get('byteStride', np.dtype(dtype).itemsize * count)
        return np.ndarray((a['count'], count), dtype=dtype, buffer=self.bin,
                          offset=offset, strides=(stride, np.dtype(dtype).itemsize)).copy()

    def atlas(self):
        v = self.doc['bufferViews'][self.doc['images'][0]['bufferView']]
        from io import BytesIO
        image = Image.open(BytesIO(self.bin[v.get('byteOffset', 0):
                                          v.get('byteOffset', 0) + v['byteLength']])).convert('RGB')
        # The source is already a 1024 atlas; no per-profile or per-sport copies.
        if image.size != (1024, 1024):
            image = image.resize((1024, 1024), Image.Resampling.LANCZOS)
        pix = np.asarray(image, dtype=np.float64) / 255
        # Neutralise skin pigmentation while retaining lips, sockets, face detail
        # and surface shading. COLOR_0 carries the six independent skin tones.
        for ys, xs in [(slice(0, 556), slice(0, 617)),
                       (slice(746, 1017), slice(0, 414))]:
            area = pix[ys, xs]
            area[:] = np.clip(area / np.array([.75, .56, .43]), .08, 1.0)
        # Neutral clothing swatches retain only subtle textile detail. Their
        # primary/secondary/trim colours are independent vertex colour regions.
        for ys, xs in [(slice(0, 456), slice(630, 1024)),
                       (slice(466, 661), slice(630, 1024)),
                       (slice(715, 741), slice(0, 414)),
                       (slice(816, 1024), slice(425, 617)),
                       (slice(560, 574), slice(425, 617))]:
            area = pix[ys, xs]
            lum = area.mean(axis=2)
            area[:] = np.clip(.88 + .10 * lum[..., None], 0, 1)
        # Shoes have one neutral swatch; source laces keep the white atlas tile.
        pix[578:804, 426:617] = [.88, .89, .90]
        # A neutral hair tile is shared with all original hair geometry.
        area = pix[670:942, 630:1024]
        lum = area.mean(axis=2)
        area[:] = np.clip(.80 + .19 * lum[..., None], 0, 1)
        # Reserved neutral textile tile for the shared sleeve strips. Keep all
        # generated sleeve UVs inside it, away from unrelated source charts.
        pix[1000:1024, 1000:1024] = [.95, .95, .95]
        target = ROOT / 'runtime/textures/athlete-atlas.png'
        target.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(np.uint8(np.clip(pix, 0, 1) * 255 + .5), 'RGB').save(target, optimize=True)
        return target


def source_geometry(source):
    arrays = {name: [] for name in ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0']}
    faces, regions = [], []
    offset = 0
    removed_sleeve_triangles = 0
    for prim in source.doc['meshes'][0]['primitives']:
        material = prim['material']
        if material == 3:  # replace alpha hair cards by original solid hairstyles
            continue
        attrs = {k: source.array(v) for k, v in prim['attributes'].items()}
        p, uv = attrs['POSITION'], attrs['TEXCOORD_0']
        idx = source.array(prim['indices']).reshape(-1, 3)
        region = np.full(len(p), 0 if material == 0 else 6, dtype='u1')
        if material == 1:
            region[:] = 1
            region[(p[:, 1] < 1.055) & (uv[:, 1] > .44)] = 2
            region[p[:, 1] < .50] = 8
            region[p[:, 1] < .102] = 4
            region[p[:, 1] < .036] = 5
            region[(uv[:, 0] < .41) & (uv[:, 1] > .69) & (uv[:, 1] < .746)] = 3
            region[(p[:, 1] < .102) & (uv[:, 0] < .41)] = 3
            # Remove only the short source sleeve charts and sleeve trim. The
            # source torso/shoulder topology and skin underneath are retained.
            arm = ((attrs['JOINTS_0'] == 6) | (attrs['JOINTS_0'] == 9))
            arm_weight = (attrs['WEIGHTS_0'] * arm).sum(axis=1)
            sleeve = ((uv[:, 0] > .895) & (p[:, 1] > 1.10) & (p[:, 1] < 1.38))
            sleeve |= ((uv[:, 0] < .10) & (p[:, 1] > 1.10) & (p[:, 1] < 1.38) & (arm_weight > .40))
            drop = sleeve[idx].all(axis=1)
            removed_sleeve_triangles += int(drop.sum())
            idx = idx[~drop]
        # Compact disconnected/removed vertices, preserving source UV exactly.
        used = np.unique(idx)
        remap = np.full(len(p), -1, dtype=int)
        remap[used] = np.arange(len(used)) + offset
        for name in arrays:
            arrays[name].append(attrs[name][used])
        regions.append(region[used])
        faces.extend(remap[idx].tolist())
        offset += len(used)
    result = {name: np.concatenate(parts) for name, parts in arrays.items()}
    result['regions'] = np.concatenate(regions)
    result['faces'] = np.asarray(faces, dtype='<u2')
    return result, removed_sleeve_triangles


def add_shared_sleeves(data):
    """Full canonical sleeves have valid elbow weights in all three morphs.

    Hidden portions collapse radially underneath the continuous source skin;
    bone-local lengths never change. This lets a standard glTF morph select
    sleeveless/short/long sportswear without changing the arm bind pose.
    """
    positions, normals, uvs, joints, weights, regions, faces = [], [], [], [], [], [], []
    basketball, hockey = [], []
    ys = [1.35, 1.32, 1.28, 1.23, 1.18, 1.155, 1.145, 1.135, 1.035, .95, .87, .79]
    radii = [.031, .050, .052, .050, .047, .046, .045, .044, .041, .039, .036, .035]
    sides = 16
    start = len(data['POSITION'])
    for sign, arm, fore, hand in [(1, 6, 7, 8), (-1, 9, 10, 11)]:
        base = start + len(positions)
        for ring, (y, radius) in enumerate(zip(ys, radii)):
            for k in range(sides):
                theta = k / sides * 2 * math.pi
                c, s = math.cos(theta), math.sin(theta)
                visible = y >= 1.145
                base_radius = radius if visible else .002
                x = sign * .16 + base_radius * c
                z = .005 + base_radius * 1.20 * s
                positions.append([x, y, z])
                normals.append([c, 0, s / 1.20])
                # Dedicated neutral textile area in the same source atlas.
                uvs.append([.980 + .014 * k / sides, .006 + .012 * ring / (len(ys) - 1)])
                if y > 1.315:
                    chest = min(.65, (y - 1.315) / .035 * .65)
                    joint, weight = [3, arm, fore, hand], [chest, 1 - chest, 0, 0]
                else:
                    f = max(0, min(1, (1.08 - y) / .09))
                    h = max(0, min(.5, (.82 - y) / .06))
                    joint, weight = [arm, fore, hand, 0], [1 - f, f * (1 - h), f * h, 0]
                joints.append(joint)
                weights.append(weight)
                regions.append(3 if ring in (5, 6, 11) else 1)
                basketball.append([sign * .16 + .0015 * c, y, .005 + .0018 * s])
                hockey.append([sign * .16 + radius * c, y, .005 + radius * 1.20 * s])
        for ring in range(len(ys) - 1):
            for k in range(sides):
                a, b = base + ring * sides + k, base + ring * sides + (k + 1) % sides
                c, d = a + sides, b + sides
                # Rings descend along Y; this winding points out of the sleeve.
                faces.extend([[a, b, c], [b, d, c]])
    sleeve_base = np.asarray(positions, dtype='<f4')
    for name, values, dtype in [('POSITION', positions, '<f4'), ('NORMAL', normals, '<f4'),
                                ('TEXCOORD_0', uvs, '<f4'), ('JOINTS_0', joints, '<u2'),
                                ('WEIGHTS_0', weights, '<f4')]:
        data[name] = np.concatenate([data[name], np.asarray(values, dtype=dtype)])
    data['regions'] = np.concatenate([data['regions'], np.asarray(regions, dtype='u1')])
    data['faces'] = np.concatenate([data['faces'], np.asarray(faces, dtype='<u2')])
    targets = {name: data['POSITION'].copy() for name in ['basketball', 'hockey', 'tennis']}
    targets['basketball'][start:] = np.asarray(basketball)
    targets['hockey'][start:] = np.asarray(hockey)
    # Narrow shoulder straps and a lower neck opening are explicit silhouettes.
    p = targets['basketball'][:start]
    cloth = np.isin(data['regions'][:start], [1, 3])
    def smoothstep(low, high, values):
        t = np.clip((values - low) / (high - low), 0, 1)
        return t * t * (3 - 2 * t)
    shoulder_weight = smoothstep(1.23, 1.36, p[:, 1])
    shoulder_weight *= smoothstep(.09, .15, np.abs(p[:, 0])) * cloth
    p[:, 0] -= np.sign(p[:, 0]) * np.maximum(0, np.abs(p[:, 0]) - .115) * .925 * shoulder_weight
    # Continuous falloff keeps adjacent collar vertices on a smooth curve.
    neck_weight = smoothstep(1.34, 1.41, p[:, 1])
    neck_weight *= (1 - smoothstep(.045, .11, np.abs(p[:, 0])))
    neck_weight *= smoothstep(.005, .045, p[:, 2]) * cloth
    p[:, 1] -= .025 * neck_weight
    # Tennis polo-style raised back/side collar; same crew opening at front.
    p = targets['tennis'][:start]
    collar = cloth & (p[:, 1] > 1.39) & (np.abs(p[:, 0]) < .09) & (p[:, 2] < .035)
    p[collar, 1] += .018
    return targets, len(faces)


def world_joints():
    positions = {}
    for name, parent, rest in BONES:
        positions[name] = np.asarray(rest, dtype=float) + (positions[parent] if parent else 0)
    return np.asarray([positions[name] for name, _, _ in BONES])


def profile_shape(p, j, w, width, depth):
    origin = (world_joints()[j.astype(int)] * w[:, :, None]).sum(axis=1)
    out = p.copy()
    out[:, 0] += (p[:, 0] - origin[:, 0]) * (width - 1)
    out[:, 2] += (p[:, 2] - origin[:, 2]) * (depth - 1)
    return out


def write_model(data, targets, profile):
    ident, label, height, width, depth = profile
    p = profile_shape(data['POSITION'], data['JOINTS_0'], data['WEIGHTS_0'], width, depth)
    normal = data['NORMAL'].copy() / [width, 1, depth]
    normal /= np.maximum(np.linalg.norm(normal, axis=1)[:, None], 1e-12)
    floor = float(p[:, 1].min())
    stature = float(p[:, 1].max() - floor)
    scale = height / stature
    colors = np.ones((len(p), 4), dtype='<f4')
    for region, color in DEFAULT.items():
        colors[data['regions'] == region, :3] = linear_color(color)
    binary, views, accessors = bytearray(), [], []

    def attribute(array, component, kind, target=None, bounds=False, stride=None):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(array.tobytes())
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': array.nbytes}
        if target:
            view['target'] = target
        if stride:
            view['byteStride'] = stride
        views.append(view)
        a = {'bufferView': len(views) - 1, 'componentType': component,
             'count': len(array), 'type': kind}
        if bounds:
            a['min'], a['max'] = array.min(axis=0).tolist(), array.max(axis=0).tolist()
        accessors.append(a)
        return len(accessors) - 1

    region_padded = np.zeros((len(p), 4), dtype='u1')
    region_padded[:, 0] = data['regions']
    skin_joints = data['JOINTS_0'].copy()
    skin_joints[data['WEIGHTS_0'] == 0] = 0
    attrs = {'POSITION': attribute(p.astype('<f4'), 5126, 'VEC3', 34962, True),
             'NORMAL': attribute(normal.astype('<f4'), 5126, 'VEC3', 34962),
             'TEXCOORD_0': attribute(data['TEXCOORD_0'].astype('<f4'), 5126, 'VEC2', 34962),
             'JOINTS_0': attribute(skin_joints.astype('<u2'), 5123, 'VEC4', 34962),
             'WEIGHTS_0': attribute(data['WEIGHTS_0'].astype('<f4'), 5126, 'VEC4', 34962),
             'COLOR_0': attribute(colors, 5126, 'VEC4', 34962),
             '_REGION': attribute(region_padded, 5121, 'SCALAR', 34962, stride=4)}
    indices = attribute(data['faces'].reshape(-1).astype('<u2'), 5123, 'SCALAR', 34963)
    morph_targets = []
    for target in targets.values():
        shaped = profile_shape(target, data['JOINTS_0'], data['WEIGHTS_0'], width, depth)
        delta = (shaped - p).astype('<f4')
        morph_targets.append({'POSITION': attribute(delta, 5126, 'VEC3', 34962, True)})
    matrices = []
    for joint in world_joints():
        m = np.eye(4, dtype='<f4')
        m[:3, 3] = -joint
        matrices.append(m.T.reshape(-1))
    ibm = attribute(np.asarray(matrices, dtype='<f4'), 5126, 'MAT4')
    nodes = [{'name': 'BodyScale', 'scale': [scale] * 3, 'translation': [0, -floor * scale, 0],
              'children': [1], 'extras': {'profile': ident, 'statureMeters': height,
                                            'canonicalBindUnchanged': True}}]
    names = [b[0] for b in BONES]
    for i, (name, parent, rest) in enumerate(BONES):
        node = {'name': name, 'translation': rest}
        children = [k + 1 for k, b in enumerate(BONES) if b[1] == name]
        if children:
            node['children'] = children
        nodes.append(node)
    nodes.append({'name': 'athlete-body', 'mesh': 0, 'skin': 0})
    material = {'name': 'athlete_shared', 'pbrMetallicRoughness': {
        'baseColorFactor': [1, 1, 1, 1], 'baseColorTexture': {'index': 0},
        'metallicFactor': 0, 'roughnessFactor': .88}}
    region_counts = {name: int((data['regions'] == region).sum()) for name, region in REGIONS.items()}
    extras = {'license': 'CC0-1.0', 'source': 'canonical-player-01; see body-manifest.json',
              'sourceSha256': SOURCE_SHA, 'regions': REGIONS, 'profile': ident,
              'statureMeters': height, 'canonicalHeightMeters': stature,
              'regionVertexCounts': region_counts, 'uniformMorphs': list(targets),
              'triangleBudgetIncludesOneHair': True,
              'bodyShape': {'widthAroundBindJoints': width, 'depthAroundBindJoints': depth}}
    doc = {'asset': {'version': '2.0', 'generator': 'athlete-body-v1 CC0 shared-body builder',
                     'copyright': 'CC0-1.0; fictional anatomy and original sportswear adaptation'},
           'scene': 0, 'scenes': [{'nodes': [0, 19]}], 'nodes': nodes,
           'meshes': [{'name': 'athlete-body', 'weights': [0, 0, 0],
                       'extras': {'targetNames': list(targets), 'regions': REGIONS},
                       'primitives': [{'attributes': attrs, 'indices': indices, 'material': 0,
                                       'targets': morph_targets}]}],
           'skins': [{'name': 'canonical18', 'skeleton': 1, 'joints': list(range(1, 19)),
                      'inverseBindMatrices': ibm}],
           'materials': [material], 'textures': [{'source': 0, 'sampler': 0}],
           'images': [{'name': 'athlete-atlas', 'uri': '../textures/athlete-atlas.png'}],
           'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
           'buffers': [{'byteLength': len(binary)}], 'bufferViews': views,
           'accessors': accessors, 'extras': extras}
    encoded = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary += b'\0' * (-len(binary) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    result = struct.pack('<III', 0x46546C67, 2, total)
    result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    result += struct.pack('<II', len(binary), 0x004E4942) + binary
    path = ROOT / 'runtime/models' / (ident + '.glb')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(result)
    return {'id': ident, 'label': label, 'path': 'runtime/models/' + path.name,
            'height': height, 'heightMeters': height, 'scale': scale,
            'canonicalFloorY': floor, 'canonicalHeightMeters': stature,
            'triangles': len(data['faces']), 'vertices': len(p), 'bytes': len(result),
            'sha256': hashlib.sha256(result).hexdigest(), 'morphs': list(targets),
            'regions': region_counts,
            'uvSha256': hashlib.sha256(data['TEXCOORD_0'].astype('<f4').tobytes()).hexdigest(),
            'bodyShape': {'width': width, 'depth': depth}}


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--source', type=Path, required=True)
    options = args.parse_args()
    source = Source(options.source)
    atlas = source.atlas()
    data, removed = source_geometry(source)
    targets, sleeve_triangles = add_shared_sleeves(data)
    models = [write_model(data, targets, p) for p in PROFILES]
    hair_file = ROOT / 'runtime/hair/hair-manifest.json'
    hair_doc = json.loads(hair_file.read_text()) if hair_file.exists() else {}
    hair = hair_doc.get('styles', hair_doc.get('hair', hair_doc.get('assets', [])))
    manifest = {'schemaVersion': 1, 'version': 'athlete-body-v1', 'license': 'CC0-1.0',
                'models': models, 'regions': REGIONS,
                'regionEncoding': '_REGION uint8 scalar; COLOR_0 linear RGBA; texture sRGB',
                'skinTones': SKIN, 'skinPalette': SKIN,
                'defaultColors': {name: DEFAULT[region] for name, region in REGIONS.items()},
                'sports': [{'id': 'soccer', 'label': 'כדורגל', 'morph': None},
                           {'id': 'basketball', 'label': 'כדורסל', 'morph': 'basketball'},
                           {'id': 'tennis', 'label': 'טניס', 'morph': 'tennis'},
                           {'id': 'hockey', 'label': 'הוקי', 'morph': 'hockey'}],
                'hair': hair,
                'texture': {'path': 'runtime/textures/athlete-atlas.png', 'width': 1024,
                            'height': 1024, 'bytes': atlas.stat().st_size,
                            'sha256': hashlib.sha256(atlas.read_bytes()).hexdigest(),
                            'uvLayout': 'shared source UV; original sleeves use neutral cloth tile'},
                'canonicalBones': [{'name': n, 'parent': p, 'rest': r} for n, p, r in BONES],
                'source': {'path': 'workout/island/design/motion-fix-v12/runtime/models/canonical-player-01.glb',
                           'ref': 'codex/motion-fix-v12', 'sha256': source.sha,
                           'license': 'CC0-1.0', 'originalActorSource': {
                               'commit': '0c6b5877bd81d69bf389b1e3831e5c49b5feb770',
                               'path': 'workout/island/design/soccer-motion-v11/runtime/clips/celebrate_player.glb',
                               'sha256': 'b723711ad5c46afca7ef3651e80fba2effcf439f91639418f2527433250ea85a'}},
                'processing': {'sourceTriangles': 5781, 'sourceHairTrianglesRemoved': 1076,
                               'sourceSleeveTrianglesRemoved': removed,
                               'originalCanonicalSleeveTrianglesAdded': sleeve_triangles,
                               'sourceFaceSkinEyesUVAndWeightsPreserved': True,
                               'bindChanges': 0, 'meshopt': False, 'draco': False,
                               'heightDefinition': 'skin/skinned-body sole-to-scalp; hairstyles may add height',
                               'hockeyScope': 'long-sleeve jersey; no pads or ice skates requested'},
                'runtime': {'material': 'athlete_shared', 'roughness': .88, 'metallic': 0,
                            'hairAttachmentBone': 'Head', 'outlineMeters': .003,
                            'hairAttachmentScale': 'Head-local scale [bodyShape.width, 1, bodyShape.depth]; actor wrapper supplies stature',
                            'sportSelection': 'set one named morph to1, others0; soccer all0',
                            'recolor': 'replace COLOR_0 RGB for vertices with matching _REGION'}}
    (ROOT / 'body-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'models': models, 'removedSleeveTriangles': removed,
                      'addedSleeveTriangles': sleeve_triangles, 'atlasBytes': atlas.stat().st_size}, indent=2))


if __name__ == '__main__':
    main()
