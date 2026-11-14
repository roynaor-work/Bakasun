"""CC0. Adapt the repository's original CC0 tennis fans; never write outside this package.

Standard-library-only, deterministic GLB 2.0. Two sparse morphs, vertex shirt mask,
six seated and six standing silhouettes. No texture, compression or decoder.
"""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
TENNIS = ROOT.parent / 'tennis-crowd-3d-v1'


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


original = module('tennis_original', TENNIS / 'source/build.py')
lod = module('tennis_lod', TENNIS / 'lod/source/build.py')
BaseFan = original.Fan
base_bent = lod.bent_limb


def build_fan(index, level, clap=False):
    width = lod.WIDTHS[index]
    neck = .67 + [.43, .46, .41, .48][index % 4]
    standing = index >= 6
    lift = .38 if standing else 0

    def clap_joint(point):
        # Replace exact arm joints before ring construction, keeping limb volume.
        if not clap:
            return list(point)
        sign = 1 if point[0] >= 0 else -1
        if point[1] > neck + .35:
            return [sign * .047, neck + .035, .45]
        if point[1] > neck + .08:
            return [sign * (width / 2 + .10), neck - .19, .23]
        return list(point)

    def leg_joint(p):
        # New standing hip/knee/ankle, expressed before the common upper-body lift.
        if p[1] > .48:
            return [p[0], .88 - lift, .04]
        if p[1] > .3:
            return [p[0], .46 - lift, .035]
        return [p[0], p[1] - lift, .04]

    class SoccerFan(BaseFan):
        def __init__(self):
            super().__init__()
            self.shirt = []

        def face(self, points, color, target=None, head=False):
            is_shirt = color == original.SHIRTS[index]
            # LOD2's arm cards are made directly, so map their endpoint offsets.
            if level == 2 and clap and target:
                sign = 1 if target[0][0] >= 0 else -1
                shoulder = [sign * (width / 2 + .015), neck - .07, -.005]
                wrist = [sign * (width / 2 + .17), neck + .51, .075]
                adjusted = []
                for p in target:
                    joint = min([shoulder, wrist], key=lambda q: sum((p[k]-q[k])**2 for k in range(3)))
                    new = clap_joint(joint)
                    adjusted.append([p[k] - joint[k] + new[k] for k in range(3)])
                target = adjusted
            if standing and level == 2 and color == '35465a' and not target:
                points = [[p[0], (.88 if p[1] > .48 else .46 if p[1] > .3 else p[1]) - lift,
                           .04 if p[1] > .3 else .16] for p in points]
            points = [[p[0], p[1] + lift, p[2]] for p in points]
            target = [[p[0], p[1] + lift, p[2]] for p in target] if target else None
            super().face(points, 'ffffff' if is_shirt else color, target, head)
            self.shirt.extend([1 if is_shirt else 0] * len(points))

        def limb(self, a, b, radius, color, target=None, sides=4):
            if standing and not target and a[1] <= .51:
                a, b = leg_joint(a), leg_joint(b)
            if target:
                target = tuple(clap_joint(p) for p in target)
            super().limb(a, b, radius, color, target, sides)

        def octa(self, center, dims, color, target=None):
            super().octa(center, dims, color, clap_joint(target) if target else None)

        def prism(self, center, dims, color, top=.9, head=False):
            if standing and center[1] < .1:
                center = [center[0], center[1] - lift, center[2] - .4]
            super().prism(center, dims, color, top, head)

    def bent(f, a, b, c, radius, color, target=None):
        if standing and not target:
            a, b, c = map(leg_joint, [a, b, c])
        if target:
            target = [clap_joint(p) for p in target]
        base_bent(f, a, b, c, radius, color, target)

    # Both modules hold their own imported original module. Only in-memory APIs
    # are replaced; source files and bytecode are never changed.
    original.Fan = SoccerFan
    lod.original.Fan = SoccerFan
    lod.bent_limb = bent
    f, pivot = original.make_fan(index) if level == 0 else lod.make_fan(index, level)
    # Three shoe faces in LOD1 are generated directly by its source function.
    if standing and level == 1:
        for p, mask in zip(f.positions, f.head):
            if not mask and .38 <= p[1] < .51 and p[2] > .35:
                p[1] -= lift
                p[2] -= .4
    pivot[1] += lift
    assert len(f.indices) // 3 == [210, 90, 24][level]
    return f, pivot


def write_glb(index, level):
    fan, pivot = build_fan(index, level)
    clapping, _ = build_fan(index, level, clap=True)
    assert fan.positions == clapping.positions
    binary, views, accessors = bytearray(), [], []

    def view(values, fmt, target=None):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        values = [v for row in values for v in row] if isinstance(values[0], list) else values
        binary.extend(struct.pack('<' + fmt * len(values), *values))
        result = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(binary) - offset}
        if target:
            result['target'] = target
        views.append(result)
        return len(views) - 1

    def accessor(values, fmt, component, kind, target=34962, normalized=False, sparse=False):
        a = {'componentType': component, 'count': len(values), 'type': kind}
        if sparse:
            selected = [i for i, p in enumerate(values) if any(abs(v) > 1e-9 for v in p)]
            a['sparse'] = {'count': len(selected),
                           'indices': {'bufferView': view(selected, 'H'), 'componentType': 5123},
                           'values': {'bufferView': view([values[i] for i in selected], fmt)}}
        else:
            a['bufferView'] = view(values, fmt, target)
        if normalized:
            a['normalized'] = True
        if component == 5126:
            rows = values if isinstance(values[0], list) else [[v] for v in values]
            a['min'] = [min(p[k] for p in rows) for k in range(len(rows[0]))]
            a['max'] = [max(p[k] for p in rows) for k in range(len(rows[0]))]
        accessors.append(a)
        return len(accessors) - 1

    attrs = {'POSITION': accessor(fan.positions, 'f', 5126, 'VEC3'),
             'COLOR_0': accessor(fan.colors, 'B', 5121, 'VEC4', normalized=True),
             '_HEAD': accessor(fan.head, 'f', 5126, 'SCALAR'),
             '_SHIRT': accessor(fan.shirt, 'f', 5126, 'SCALAR')}
    indices = accessor(fan.indices, 'H', 5123, 'SCALAR', 34963)
    up = accessor(fan.deltas, 'f', 5126, 'VEC3', sparse=True)
    clap = accessor(clapping.deltas, 'f', 5126, 'VEC3', sparse=True)
    times = accessor([0., .25, .5, .75, 1.], 'f', 5126, 'SCALAR', target=None)
    clips = []
    for name, weights in [('arms-up', [0.,0., .5,0., 1.,0., .5,0., 0.,0.]),
                          ('clap', [0.,.65, 0.,1., 0.,.65, 0.,1., 0.,.65])]:
        output = accessor(weights, 'f', 5126, 'SCALAR', target=None)
        clips.append({'name': name, 'samplers': [{'input': times, 'output': output, 'interpolation': 'LINEAR'}],
                      'channels': [{'sampler': 0, 'target': {'node': 0, 'path': 'weights'}}]})
    name = f'fan-{index+1:02}'
    doc = {'asset': {'version': '2.0', 'generator': 'CC0 soccer-crowd-3d-v1/source/build.py'},
           'extensionsUsed': ['KHR_materials_unlit'], 'scene': 0, 'scenes': [{'nodes': [0]}],
           'nodes': [{'name': name, 'mesh': 0, 'extras': {'headPivot': pivot, 'forward': '+Z',
                      'posture': 'standing' if index >= 6 else 'seated', 'shirtMask': '_SHIRT'}}],
           'meshes': [{'name': name, 'weights': [0, 0], 'extras': {'targetNames': ['arms-up', 'clap']},
                       'primitives': [{'attributes': attrs, 'indices': indices, 'material': 0, 'mode': 4,
                                       'targets': [{'POSITION': up}, {'POSITION': clap}]}]}],
           'materials': [{'name': 'vertex-palette-shirt-neutral', 'doubleSided': level == 2,
                          'pbrMetallicRoughness': {'baseColorFactor': [1,1,1,1], 'metallicFactor': 0, 'roughnessFactor': 1},
                          'extensions': {'KHR_materials_unlit': {}}}], 'animations': clips,
           'bufferViews': views, 'accessors': accessors, 'buffers': [{'byteLength': len(binary)}]}
    raw = json.dumps(doc, separators=(',', ':')).encode()
    raw += b' ' * (-len(raw) % 4)
    binary += b'\0' * (-len(binary) % 4)
    glb = struct.pack('<III', 0x46546c67, 2, 28 + len(raw) + len(binary))
    glb += struct.pack('<II', len(raw), 0x4e4f534a) + raw + struct.pack('<II', len(binary), 0x004e4942) + binary
    path = ROOT / f'runtime/lod{level}/{name}.glb'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(glb)
    return {'file': path.relative_to(ROOT).as_posix(), 'variant': index, 'level': level,
            'triangles': len(fan.indices)//3, 'bytes': len(glb), 'sha256': hashlib.sha256(glb).hexdigest(),
            'posture': 'standing' if index >= 6 else 'seated', 'headPivot': pivot}


if __name__ == '__main__':
    assets = [write_glb(i, level) for level in range(3) for i in range(12)]
    manifest = {'license': 'CC0-1.0', 'units': 'meters', 'up': '+Y', 'forward': '+Z',
                'compression': 'none', 'assets': assets, 'payloadBytes': sum(a['bytes'] for a in assets)}
    (ROOT / 'assets.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'models': len(assets), 'payloadBytes': manifest['payloadBytes']}))
