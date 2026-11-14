"""Original mesh and uncompressed glTF authoring. SPDX-License-Identifier: CC0-1.0."""
import json
import math
import struct
from pathlib import Path

import numpy as np


def linear(hex_color):
    rgb = [int(hex_color.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]


def unit(v):
    v = np.asarray(v, dtype=float)
    return v / max(1e-12, np.linalg.norm(v))


class Mesh:
    def __init__(self):
        self.positions, self.normals, self.colors = [], [], []
        self.joints, self.weights, self.team = [], [], []

    @property
    def triangles(self):
        return len(self.positions) // 3

    def tri(self, a, b, c, color, bone=0, team=0):
        normal = unit(np.cross(np.subtract(b, a), np.subtract(c, a)))
        if np.linalg.norm(normal) < .5:
            return
        for p in (a, b, c):
            self.positions.append(list(p))
            self.normals.append(normal.tolist())
            self.colors.append(linear(color) + [1])
            self.joints.append([bone, 0, 0, 0])
            self.weights.append([1, 0, 0, 0])
            self.team.append([team])

    def quad(self, a, b, c, d, color, bone=0, team=0):
        self.tri(a, b, c, color, bone, team)
        self.tri(a, c, d, color, bone, team)

    def box(self, center, size, color, bone=0, team=0, rotation=None):
        center, half = np.asarray(center), np.asarray(size) / 2
        points = [np.array([x, y, z]) * half for x, y, z in
                  [(-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                   (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)]]
        if rotation is not None:
            points = [rotation @ p for p in points]
        points = [p + center for p in points]
        for indices in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 4, 7, 3),
                        (1, 2, 6, 5), (3, 7, 6, 2), (0, 1, 5, 4)]:
            self.quad(*(points[i] for i in indices), color, bone, team)

    def rings(self, rings, color, bone=0, team=0, segments=8, caps=True):
        """Elliptical rings (centerX,Y,centerZ,radiusX,radiusZ), Y axis."""
        verts = [[(x + rx * math.cos(2 * math.pi * i / segments), y,
                   z + rz * math.sin(2 * math.pi * i / segments))
                  for i in range(segments)] for x, y, z, rx, rz in rings]
        for low, high in zip(verts, verts[1:]):
            for i in range(segments):
                j = (i + 1) % segments
                self.quad(low[i], high[i], high[j], low[j], color, bone, team)
        if caps:
            for ring, reverse in [(verts[0], False), (verts[-1], True)]:
                for i in range(1, segments - 1):
                    a, b, c = ring[0], ring[i], ring[i + 1]
                    self.tri(a, c, b, color, bone, team) if reverse else self.tri(a, b, c, color, bone, team)

    def ellipsoid(self, center, size, color, bone=0, team=0, segments=10, levels=4):
        x, y, z = center
        rx, ry, rz = np.asarray(size) / 2
        rings = []
        for i in range(levels + 1):
            lat = -math.pi / 2 + math.pi * i / levels
            radius = max(.001, math.cos(lat))
            rings.append((x, y + ry * math.sin(lat), z, rx * radius, rz * radius))
        self.rings(rings, color, bone, team, segments, True)

    def cylinder(self, start, end, radius, color, bone=0, segments=10, team=0):
        start, end = np.asarray(start), np.asarray(end)
        axis = unit(end - start)
        u = unit(np.cross(axis, [0, 0, 1] if abs(axis[2]) < .9 else [0, 1, 0]))
        v = np.cross(axis, u)
        rings = [[p + radius * (u * math.cos(2 * math.pi * i / segments)
                  + v * math.sin(2 * math.pi * i / segments)) for i in range(segments)] for p in [start, end]]
        for i in range(segments):
            j = (i + 1) % segments
            self.quad(rings[0][i], rings[0][j], rings[1][j], rings[1][i], color, bone, team)
        for ring, reverse in [(rings[0], True), (rings[1], False)]:
            for i in range(1, segments - 1):
                if reverse:
                    self.tri(ring[0], ring[i + 1], ring[i], color, bone, team)
                else:
                    self.tri(ring[0], ring[i], ring[i + 1], color, bone, team)

    def wheel(self, center, radius=.34, width=.30, segments=24, axle='x'):
        """Closed hollow tyre with shaped sidewalls; no intersecting filled disks."""
        center = np.array(center)
        profile = [(-.5 * width, .53 * radius), (-.5 * width, .86 * radius),
                   (-.39 * width, .98 * radius), (-.27 * width, radius),
                   (.27 * width, radius), (.39 * width, .98 * radius),
                   (.5 * width, .86 * radius), (.5 * width, .53 * radius)]
        def p(ax, r, theta):
            q = [ax, math.cos(theta) * r, math.sin(theta) * r]
            if axle == 'y':
                q = [q[1], q[0], q[2]]
            return center + q
        for k in range(len(profile)):
            a, b = profile[k], profile[(k + 1) % len(profile)]
            for i in range(segments):
                lo, hi = 2 * math.pi * i / segments, 2 * math.pi * (i + 1) / segments
                shade = '#202a36' if k in (0, 1, 5, 6) else '#111923'
                self.quad(p(*a, lo), p(*a, hi), p(*b, hi), p(*b, lo), shade)
        # Hub and six visible spokes on both ends. The rim leaves genuine gaps.
        for sign in (-1, 1):
            ax = sign * .49 * width
            for i in range(segments):
                lo, hi = 2 * math.pi * i / segments, 2 * math.pi * (i + 1) / segments
                self.quad(p(ax, radius * .52, lo), p(ax, radius * .55, lo),
                          p(ax, radius * .55, hi), p(ax, radius * .52, hi), '#9eacb9')
            for i in range(6):
                t = i * math.pi / 3
                self.quad(p(ax, radius * .12, t - .14), p(ax, radius * .51, t - .075),
                          p(ax, radius * .51, t + .075), p(ax, radius * .12, t + .14), '#8294a4')
        a, b = center.copy(), center.copy()
        axis_index = 1 if axle == 'y' else 0
        a[axis_index] -= .52 * width
        b[axis_index] += .52 * width
        self.cylinder(a, b, radius * .15, '#d6aa3b', segments=8)


class GLB:
    def __init__(self):
        self.binary = bytearray()
        self.doc = {'asset': {'version': '2.0', 'generator': 'Original racing pit v1 CC0 authoring',
                              'copyright': 'CC0-1.0; original geometry and animation'},
                    'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
                    'accessors': [], 'bufferViews': [],
                    'materials': [{'name': 'VertexColors', 'pbrMetallicRoughness':
                                   {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': .12, 'roughnessFactor': .65}}]}

    def accessor(self, values, kind, dtype='<f4', target=None, bounds=False):
        array = np.asarray(values, dtype=dtype)
        array = array.reshape(-1, {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[kind])
        while len(self.binary) % 4:
            self.binary.append(0)
        view = {'buffer': 0, 'byteOffset': len(self.binary), 'byteLength': array.nbytes}
        if target:
            view['target'] = target
        self.binary.extend(array.tobytes())
        self.doc['bufferViews'].append(view)
        access = {'bufferView': len(self.doc['bufferViews']) - 1, 'componentType':
                  {'<f4': 5126, '<u2': 5123}[dtype], 'count': len(array), 'type': kind}
        if bounds:
            access.update(min=array.min(axis=0).tolist(), max=array.max(axis=0).tolist())
        self.doc['accessors'].append(access)
        return len(self.doc['accessors']) - 1

    def mesh(self, name, mesh, skinned=False, material=0):
        attributes = {'POSITION': self.accessor(mesh.positions, 'VEC3', target=34962, bounds=True),
                      'NORMAL': self.accessor(mesh.normals, 'VEC3', target=34962),
                      'COLOR_0': self.accessor(mesh.colors, 'VEC4', target=34962)}
        if skinned:
            attributes.update(JOINTS_0=self.accessor(mesh.joints, 'VEC4', '<u2', 34962),
                              WEIGHTS_0=self.accessor(mesh.weights, 'VEC4', target=34962),
                              _TEAM_MASK=self.accessor(mesh.team, 'SCALAR', target=34962))
        self.doc['meshes'].append({'name': name, 'primitives': [{'attributes': attributes,
                                  'mode': 4, 'material': material}], 'extras': {'triangles': mesh.triangles}})
        return len(self.doc['meshes']) - 1

    def node(self, name, **fields):
        self.doc['nodes'].append({'name': name, **fields})
        return len(self.doc['nodes']) - 1

    def animation(self, name, channels, metadata=None):
        samplers, targets = [], []
        for node, path, times, values in channels:
            samplers.append({'input': self.accessor(times, 'SCALAR', bounds=True),
                             'output': self.accessor(values, 'VEC4' if path == 'rotation' else 'VEC3'),
                             'interpolation': 'LINEAR'})
            targets.append({'sampler': len(samplers) - 1, 'target': {'node': node, 'path': path}})
        self.doc.setdefault('animations', []).append({'name': name, 'channels': targets,
                                                      'samplers': samplers, 'extras': metadata or {}})

    def save(self, path):
        self.doc['buffers'] = [{'byteLength': len(self.binary)}]
        payload = json.dumps(self.doc, separators=(',', ':'), ensure_ascii=False).encode()
        payload += b' ' * (-len(payload) % 4)
        self.binary.extend(b'\0' * (-len(self.binary) % 4))
        total = 12 + 8 + len(payload) + 8 + len(self.binary)
        Path(path).write_bytes(struct.pack('<III', 0x46546C67, 2, total)
                               + struct.pack('<II', len(payload), 0x4E4F534A) + payload
                               + struct.pack('<II', len(self.binary), 0x004E4942) + self.binary)
