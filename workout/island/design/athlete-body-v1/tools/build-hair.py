#!/usr/bin/env python3
"""Original CC0 hairstyle meshes, local to the canonical Head joint.

No downloaded geometry, textures, trademarks or likeness references are used.
The optional atlas is the single atlas shared by the athlete-body-v1 bodies.
"""
import hashlib
import json
import math
from pathlib import Path
import struct

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'runtime/hair'
HEAD_Y = 1.47
STYLES = ['buzz', 'crop', 'side-part', 'quiff', 'curls', 'afro', 'swept-back', 'bun']
LABELS = ['קצוץ', 'קצוץ עם פוני', 'שביל בצד', 'בלורית', 'תלתלים', 'אפרו', 'מסורק לאחור', 'אסוף']


class Mesh:
    def __init__(self):
        self.positions = []
        self.uvs = []
        self.faces = []
        self.colors = []

    def vertex(self, p, uv=(.8, .78), shade=1):
        self.positions.append([p[0], p[1] - HEAD_Y, p[2]])
        self.uvs.append(uv)
        # Values are linear RGB; the material is the same PBR material as body.
        self.colors.append([.055 * shade, .030 * shade, .018 * shade, 1.0])
        return len(self.positions) - 1

    def face(self, a, b, c):
        self.faces.append([a, b, c])

    def normals(self):
        p = np.array(self.positions, dtype=np.float64)
        normals = np.zeros_like(p)
        for a, b, c in self.faces:
            n = np.cross(p[b] - p[a], p[c] - p[a])
            normals[a] += n
            normals[b] += n
            normals[c] += n
        lengths = np.linalg.norm(normals, axis=1)
        normals /= np.maximum(lengths[:, None], 1e-12)
        return normals.astype('<f4')


def cap(mesh, style, segments=24, rings=10):
    """Anatomical hairline, continuous crown and shaped silhouette."""
    # Fit the shared source scalp, including its forward cranial offset.
    # The smaller initial ellipsoid intersected the forehead and crown.
    rx, ry, rz = .089, .140, .122
    cy, cz = 1.604, .014
    if style == 'afro':
        rx, ry, rz, cy = .105, .164, .122, 1.61
    if style in ('curls', 'bun'):
        segments, rings = 16, 6
    if style == 'buzz':
        rx, ry, rz = .0875, .140, .122

    def point(theta, phi):
        sn, co = math.sin(theta), math.cos(theta)
        front = max(0, math.cos(phi))
        x = rx * sn * math.sin(phi)
        y = cy + ry * co
        z = cz + rz * sn * math.cos(phi)
        crown = max(0, co)
        if style == 'crop':
            y += .018 * crown ** .7
            z += .008 * front * sn ** 2
            y -= .007 * front * sn ** 3
        elif style == 'side-part':
            # Raised swept side and a shallow, continuous side part.
            side = .5 + .5 * math.sin(phi)
            y += (.011 + .025 * side) * crown
            part = math.exp(-((x + .026) / .008) ** 2)
            y -= .010 * part * max(0, co)
            x += .008 * crown ** 1.5
        elif style == 'quiff':
            y += .036 * crown + .032 * front * sn * max(0, co)
            z += .012 * front * crown
            x += .004 * crown
        elif style == 'afro':
            bulge = .0035 * math.sin(phi * 8 + theta * 11) * math.sin(theta * 7)
            x += bulge * math.sin(phi)
            z += bulge * math.cos(phi)
            y += .003 * math.cos(phi * 7) * sn ** 2
        elif style == 'swept-back':
            y += .022 * crown
            z -= .014 * crown
            y += .004 * math.cos(phi * 8 + theta * 3) * sn * max(.2, co)
        elif style == 'bun':
            y += .006 * crown
            z -= .004 * crown
        elif style == 'curls':
            y += .008 * crown
        return [x, y, z]

    def max_theta(phi):
        # Hairline above the forehead, lower around ears and nape.
        front = .5 + .5 * math.cos(phi)
        return 2.0 - .9 * front ** 1.45

    top = mesh.vertex(point(0, 0), (.8, .69), 1.05)
    grid = []
    for i in range(1, rings + 1):
        row = []
        for j in range(segments):
            phi = 2 * math.pi * j / segments
            theta = max_theta(phi) * i / rings
            shade = .94 + .10 * math.cos(phi * 5 + theta * 2) ** 2
            row.append(mesh.vertex(point(theta, phi),
                                   (.635 + .34 * j / segments, .67 + .23 * i / rings), shade))
        grid.append(row)
    for j in range(segments):
        mesh.face(top, grid[0][j], grid[0][(j + 1) % segments])
    for i in range(rings - 1):
        for j in range(segments):
            k = (j + 1) % segments
            mesh.face(grid[i][j], grid[i + 1][j], grid[i + 1][k])
            mesh.face(grid[i][j], grid[i + 1][k], grid[i][k])


def ellipsoid(mesh, center, radii, segments=8, rings=4, shade=1):
    top = mesh.vertex([center[0], center[1] + radii[1], center[2]], shade=shade)
    grid = []
    for i in range(1, rings):
        row = []
        theta = math.pi * i / rings
        for j in range(segments):
            phi = 2 * math.pi * j / segments
            p = [center[0] + radii[0] * math.sin(theta) * math.sin(phi),
                 center[1] + radii[1] * math.cos(theta),
                 center[2] + radii[2] * math.sin(theta) * math.cos(phi)]
            row.append(mesh.vertex(p, (.66 + .30 * j / segments, .68 + .2 * i / rings),
                                   shade * (.94 + .10 * math.cos(phi * 3) ** 2)))
        grid.append(row)
    bottom = mesh.vertex([center[0], center[1] - radii[1], center[2]], shade=shade)
    for j in range(segments):
        k = (j + 1) % segments
        mesh.face(top, grid[0][j], grid[0][k])
        mesh.face(grid[-1][j], bottom, grid[-1][k])
    for i in range(len(grid) - 1):
        for j in range(segments):
            k = (j + 1) % segments
            mesh.face(grid[i][j], grid[i + 1][j], grid[i + 1][k])
            mesh.face(grid[i][j], grid[i + 1][k], grid[i][k])


def make_mesh(style):
    mesh = Mesh()
    cap(mesh, style)
    if style == 'curls':
        # Dense small coils follow the scalp. 20 clumps, not loose spheres.
        for ring, count, theta in [(0, 1, .05), (1, 7, .50), (2, 12, .98)]:
            for j in range(count):
                phi = 2 * math.pi * j / count + ring * .21
                center = [.089 * math.sin(theta) * math.sin(phi),
                          1.604 + .140 * math.cos(theta),
                          .014 + .122 * math.sin(theta) * math.cos(phi)]
                ellipsoid(mesh, center, [.021, .019, .022], segments=6, rings=3,
                          shade=.94 + .09 * math.sin(j * 2.17) ** 2)
    if style == 'bun':
        # Swept nape and a compact rear knot, with an understated wrap.
        ellipsoid(mesh, [0, 1.66, -.099], [.047, .046, .041], segments=12, rings=7)
        ellipsoid(mesh, [0, 1.654, -.076], [.039, .029, .017], segments=12, rings=3, shade=.78)
    return mesh


def write_glb(mesh, style, label):
    binary = bytearray()
    views, accessors = [], []

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
            a['min'] = np.min(array, axis=0).tolist()
            a['max'] = np.max(array, axis=0).tolist()
        accessors.append(a)
        return len(accessors) - 1

    p = np.array(mesh.positions, dtype='<f4')
    n = mesh.normals()
    uv = np.array(mesh.uvs, dtype='<f4')
    colors = np.array(mesh.colors, dtype='<f4')
    # Vertex attributes require four-byte element alignment even for uint8 IDs.
    region = np.zeros((len(p), 4), dtype='u1')
    region[:, 0] = 7
    indices = np.array(mesh.faces, dtype='<u2').flatten()
    attrs = {
        'POSITION': attribute(p, 5126, 'VEC3', 34962, True),
        'NORMAL': attribute(n, 5126, 'VEC3', 34962),
        'TEXCOORD_0': attribute(uv, 5126, 'VEC2', 34962),
        'COLOR_0': attribute(colors, 5126, 'VEC4', 34962),
        '_REGION': attribute(region, 5121, 'SCALAR', 34962, stride=4),
    }
    idx = attribute(indices, 5123, 'SCALAR', 34963)
    name = 'hair-' + style
    extras = {'attachmentBone': 'Head', 'localSpace': 'canonical Head joint',
              'license': 'CC0-1.0', 'source': 'tools/build-hair.py; original authored geometry',
              'style': style, 'label': label, 'triangles': len(mesh.faces),
              'region': 7, 'sharedAtlas': '../textures/athlete-atlas.png'}
    doc = {
        'asset': {'version': '2.0', 'generator': 'athlete-body-v1 original hair builder',
                  'copyright': 'CC0-1.0; original fictional hairstyle geometry'},
        'scene': 0, 'scenes': [{'nodes': [0]}],
        'nodes': [{'name': name, 'mesh': 0, 'extras': extras}],
        'meshes': [{'name': name, 'primitives': [{'attributes': attrs, 'indices': idx, 'material': 0}]}],
        'materials': [{'name': 'athlete_shared', 'pbrMetallicRoughness': {
            'baseColorFactor': [1, 1, 1, 1], 'baseColorTexture': {'index': 0},
            'metallicFactor': 0, 'roughnessFactor': .88}}],
        'textures': [{'source': 0, 'sampler': 0}],
        'images': [{'name': 'athlete-atlas', 'uri': '../textures/athlete-atlas.png'}],
        'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
        'buffers': [{'byteLength': len(binary)}], 'bufferViews': views, 'accessors': accessors,
        'extras': extras,
    }
    encoded = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    binary += b'\0' * (-len(binary) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    data = struct.pack('<III', 0x46546C67, 2, total)
    data += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    data += struct.pack('<II', len(binary), 0x004E4942) + binary
    path = OUT / (style + '.glb')
    path.write_bytes(data)
    return {'id': style, 'label': label, 'path': 'runtime/hair/' + path.name,
            'triangles': len(mesh.faces), 'vertices': len(p), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest(),
            'boundsHeadLocal': [p.min(axis=0).tolist(), p.max(axis=0).tolist()],
            'attachmentBone': 'Head', 'region': 7, 'license': 'CC0-1.0',
            'source': 'tools/build-hair.py; original authored geometry, no external mesh input'}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    rows = [write_glb(make_mesh(style), style, label) for style, label in zip(STYLES, LABELS)]
    for row in rows:
        assert row['triangles'] <= 800, row
    manifest = {'schemaVersion': 1, 'license': 'CC0-1.0', 'source': 'tools/build-hair.py',
                'coordinateSystem': 'metres; +Y up, +Z forward; canonical Head joint local',
                'headJointWorld': [0, HEAD_Y, 0], 'hair': rows}
    (OUT / 'hair-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps([(r['id'], r['triangles'], r['bytes']) for r in rows]))


if __name__ == '__main__':
    main()
