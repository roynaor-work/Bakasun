# SPDX-License-Identifier: CC0-1.0
"""Small indexed-mesh exporter for the original track artwork."""
import json
import math
import struct
from functools import lru_cache


def delta(a, b):
    return tuple(x - y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def unit(v):
    length = math.hypot(*v)
    return tuple(x / length for x in v)


def move(point, origin, yaw=0):
    x, y, z = point
    c, s = math.cos(yaw), math.sin(yaw)
    return (origin[0] + c * x + s * z, origin[1] + y, origin[2] - s * x + c * z)


def rgb(color):
    return tuple(bytes.fromhex(color.lstrip("#")))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


@lru_cache(None)
def linear_byte(value):
    s = value / 255
    return round(255 * (s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4))


MATERIALS = {
    "matte": {"pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 0.92}},
    "ice": {"pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 0.45}},
    "light": {
        "pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": 0.56},
        "emissiveFactor": [0.24, 0.25, 0.22],
    },
}


class Mesh:
    def __init__(self):
        self.groups = {}

    def face(self, points, color, material="matte", normals=None, colors=None):
        vertices, indices = self.groups.setdefault(material, ({}, []))
        if normals is None:
            normals = [unit(cross(delta(points[1], points[0]), delta(points[2], points[0])))] * len(points)
        if colors is None:
            colors = [color] * len(points)

        def index(i):
            position = tuple(round(value, 6) + 0.0 for value in points[i])
            normal = tuple(round(value, 7) + 0.0 for value in normals[i])
            rgba = tuple(linear_byte(value) for value in colors[i]) + (255,)
            return vertices.setdefault((position, normal, rgba), len(vertices))

        fan = [index(i) for i in range(len(points))]
        for i in range(1, len(fan) - 1):
            indices.extend((fan[0], fan[i], fan[i + 1]))

    def box(self, center, size, color, material="matte", yaw=0):
        w, h, d = [value / 2 for value in size]
        points = [move(p, center, yaw) for p in [
            (-w, -h, -d), (w, -h, -d), (w, h, -d), (-w, h, -d),
            (-w, -h, d), (w, -h, d), (w, h, d), (-w, h, d),
        ]]
        for face in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 4, 7, 3), (1, 2, 6, 5), (0, 1, 5, 4), (3, 7, 6, 2)):
            self.face([points[i] for i in face], color, material)

    def beam(self, a, b, width, depth, color, material="matte"):
        """A rectangular-section beam with ends centered on a and b."""
        axis = unit(delta(b, a))
        reference = (0, 1, 0) if abs(axis[1]) < 0.94 else (0, 0, 1)
        right = unit(cross(axis, reference))
        back = cross(right, axis)
        rim = [tuple(x * width * p / 2 + y * depth * q / 2 for x, y in zip(right, back))
               for p, q in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        bottom = [tuple(x + y for x, y in zip(a, point)) for point in rim]
        top = [tuple(x + y for x, y in zip(b, point)) for point in rim]
        self.rings([bottom, top], [color], color, color, material)

    def rings(self, rings, colors, bottom, top, material="matte"):
        if bottom is not None:
            self.face(rings[0], bottom, material)
        for layer, (previous, current) in enumerate(zip(rings, rings[1:])):
            for i in range(len(previous)):
                j = (i + 1) % len(previous)
                a, b, c, d = previous[j], previous[i], current[i], current[j]
                color = colors[(i + layer) % len(colors)]
                if a != b:
                    self.face([a, b, c], color, material)
                if c != d:
                    self.face([a, c, d], color, material)
        if top is not None:
            self.face(list(reversed(rings[-1])), top, material)

    def tube(self, a, b, r0, r1, colors, sides=6, material="matte", cap=True):
        axis = unit(delta(b, a))
        reference = (0, 1, 0) if abs(axis[1]) < 0.94 else (0, 0, 1)
        u = unit(cross(axis, reference))
        v = cross(u, axis)

        def rim(center, radius):
            return [
                tuple(c + radius * (x * math.cos(i * math.tau / sides) + y * math.sin(i * math.tau / sides))
                      for c, x, y in zip(center, u, v))
                for i in range(sides)
            ]

        self.rings([rim(a, r0), rim(b, r1)], colors, colors[0] if cap else None,
                   colors[-1] if cap and r1 else None, material)

    def add(self, other, origin, yaw=0):
        for material, (source, faces) in other.groups.items():
            vertices, indices = self.groups.setdefault(material, ({}, []))
            translate = []
            for position, normal, color in source:
                key = (move(position, origin, yaw), move(normal, (0, 0, 0), yaw), color)
                translate.append(vertices.setdefault(key, len(vertices)))
            indices.extend(translate[i] for i in faces)

    def write(self, path, name, extras):
        binary = bytearray()
        views, accessors, primitives, materials, positions = [], [], [], [], []
        triangles = 0

        def view(data, target, stride=None):
            binary.extend(b"\0" * (-len(binary) % 4))
            info = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(data), "target": target}
            if stride:
                info["byteStride"] = stride
            views.append(info)
            binary.extend(data)
            return len(views) - 1

        def accessor(view_index, component, count, kind, **kwargs):
            accessors.append({"bufferView": view_index, "componentType": component, "count": count,
                              "type": kind, **kwargs})
            return len(accessors) - 1

        for name_of_material, (vertices, indices) in self.groups.items():
            coordinates = [vertex[0] for vertex in vertices]
            positions.extend(coordinates)
            # Derive bounds from the same float32 values read by the validator.
            packed = b"".join(struct.pack("<3f3f4B", *p, *n, *rgba) for p, n, rgba in vertices)
            floats = [struct.unpack_from("<3f", packed, offset) for offset in range(0, len(packed), 28)]
            minimum = [min(axis) for axis in zip(*floats)]
            maximum = [max(axis) for axis in zip(*floats)]
            data = view(packed, 34962, 28)
            position = accessor(data, 5126, len(vertices), "VEC3", min=minimum, max=maximum)
            normal = accessor(data, 5126, len(vertices), "VEC3", byteOffset=12)
            color = accessor(data, 5121, len(vertices), "VEC4", byteOffset=24, normalized=True)
            index_view = view(struct.pack(f"<{len(indices)}H", *indices), 34963)
            index = accessor(index_view, 5123, len(indices), "SCALAR")
            primitives.append({"attributes": {"POSITION": position, "NORMAL": normal, "COLOR_0": color},
                               "indices": index, "material": len(materials)})
            materials.append({"name": name_of_material, **MATERIALS[name_of_material]})
            triangles += len(indices) // 3

        binary.extend(b"\0" * (-len(binary) % 4))
        gltf = {
            "asset": {"version": "2.0", "generator": "Alpine Runner Themes v2 original artwork"},
            "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"name": name, "mesh": 0}],
            "meshes": [{"name": name, "primitives": primitives}], "materials": materials,
            "buffers": [{"byteLength": len(binary)}], "bufferViews": views, "accessors": accessors,
            "extras": {"license": "CC0-1.0", **extras},
        }
        data = json.dumps(gltf, separators=(",", ":"), ensure_ascii=True).encode()
        data += b" " * (-len(data) % 4)
        total = 28 + len(data) + len(binary)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(struct.pack("<4sIII4s", b"glTF", 2, total, len(data), b"JSON") + data +
                         struct.pack("<I4s", len(binary), b"BIN\0") + binary)
        return {
            "triangles": triangles,
            "primitives": len(primitives),
            "bounds": [[round(f(axis), 5) for axis in zip(*positions)] for f in (min, max)],
        }
