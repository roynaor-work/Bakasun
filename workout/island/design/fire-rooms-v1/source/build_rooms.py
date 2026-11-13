#!/usr/bin/env python3
"""Original CC0 room geometry and glTF 2.0 writer; Python standard library only.

Run from any directory: python3 path/to/source/build_rooms.py
All coordinates are metres, Y-up, with the open front at +Z.
"""

import hashlib
import itertools
import json
import math
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
PALETTE = [
    ("cream", "F5DEC0"), ("wall", "EBD1AD"), ("peach", "DDB493"),
    ("sand", "D9B58E"), ("wood", "AD7350"), ("wood_light", "CF9766"),
    ("wood_dark", "775347"), ("ivory", "FFF1D4"),
    ("coral", "D4785C"), ("coral_light", "ED9B76"), ("rust", "AE574B"),
    ("ochre", "E6B654"), ("mustard", "BF8E43"), ("gold", "F4D17E"),
    ("sage", "9BB7A2"), ("sage_dark", "618E82"),
    ("teal", "4D8584"), ("teal_light", "85B8AD"), ("blue", "638D9F"),
    ("sky", "B5D6CF"), ("navy", "344F5B"), ("screen", "537782"),
    ("metal", "809293"), ("metal_light", "C1CDCA"), ("dark", "3E484A"),
    ("oil", "D69A35"), ("soot", "302D30"), ("ash", "514748"),
    ("char", "6B5650"), ("pale_ash", "8F7766"), ("pink", "E5B3A3"),
    ("linen", "E9D5AC"), ("leaf", "72946D"), ("leaf_light", "A7BC85"),
    ("hill", "97B4A1"), ("cloud", "E7EADB"),
]
COLOR = {name: i for i, (name, _) in enumerate(PALETTE)}
CAMERA = {"position": [0, 5.4, 11], "target": [0, 1.35, 0],
          "verticalSpan": 5.7, "aspect": 4 / 3, "near": 0.1, "far": 40}


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


class Geometry:
    def __init__(self):
        self.faces = []

    def face(self, points, color, outward=None):
        points = [tuple(p) for p in points]
        normal = cross(sub(points[1], points[0]), sub(points[2], points[0]))
        if outward is not None and dot(normal, outward) < 0:
            points.reverse()
        self.faces.append((points, color))

    def box(self, center, size, color, bevel=0, rotation=0):
        half = [v / 2 for v in size]
        bevel = min(bevel, min(half) * 0.8)
        inner = [v - bevel for v in half]
        polygons = []
        for axis in range(3):
            other = [i for i in range(3) if i != axis]
            for sign in (-1, 1):
                points = []
                for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    p = [0, 0, 0]
                    p[axis] = sign * half[axis]
                    p[other[0]] = sa * inner[other[0]]
                    p[other[1]] = sb * inner[other[1]]
                    points.append(p)
                polygons.append(points)
        if bevel:
            for a, b in itertools.combinations(range(3), 2):
                c = 3 - a - b
                for sa, sb in itertools.product((-1, 1), repeat=2):
                    points = []
                    for end, side in ((-1, 0), (1, 0), (1, 1), (-1, 1)):
                        p = [0, 0, 0]
                        p[c] = end * inner[c]
                        p[a] = sa * (half[a] if side == 0 else inner[a])
                        p[b] = sb * (inner[b] if side == 0 else half[b])
                        points.append(p)
                    polygons.append(points)
            for signs in itertools.product((-1, 1), repeat=3):
                points = []
                for axis in range(3):
                    points.append([signs[i] * (half[i] if i == axis else inner[i])
                                   for i in range(3)])
                polygons.append(points)
        co, si = math.cos(rotation), math.sin(rotation)
        for points in polygons:
            normal = cross(sub(points[1], points[0]), sub(points[2], points[0]))
            middle = [sum(p[i] for p in points) / len(points) for i in range(3)]
            if dot(normal, middle) < 0:
                points.reverse()
            self.face([(center[0] + co * p[0] + si * p[2], center[1] + p[1],
                        center[2] - si * p[0] + co * p[2]) for p in points], color)

    def cylinder(self, center, radius, height, color, sides=12, top_radius=None):
        top_radius = radius if top_radius is None else top_radius
        low, high = [], []
        for i in range(sides):
            angle = i * math.tau / sides
            low.append((center[0] + radius * math.cos(angle), center[1] - height / 2,
                        center[2] + radius * math.sin(angle)))
            high.append((center[0] + top_radius * math.cos(angle), center[1] + height / 2,
                         center[2] + top_radius * math.sin(angle)))
        self.face(low, color, (0, -1, 0))
        self.face(high, color, (0, 1, 0))
        for i in range(sides):
            j = (i + 1) % sides
            self.face([low[i], high[i], high[j], low[j]], color,
                      sub(((low[i][0] + low[j][0]) / 2, center[1],
                           (low[i][2] + low[j][2]) / 2), center))

    def rod(self, a, b, radius, color, sides=6):
        direction = sub(b, a)
        length = math.sqrt(dot(direction, direction))
        axis = tuple(v / length for v in direction)
        tangent = cross(axis, (0, 1, 0) if abs(axis[1]) < 0.9 else (1, 0, 0))
        tangent = tuple(v / math.sqrt(dot(tangent, tangent)) for v in tangent)
        bitangent = cross(axis, tangent)
        rings = []
        for center in (a, b):
            rings.append([tuple(center[k] + radius * (tangent[k] * math.cos(i * math.tau / sides)
                           + bitangent[k] * math.sin(i * math.tau / sides)) for k in range(3))
                          for i in range(sides)])
        self.face(rings[0], color, tuple(-v for v in axis))
        self.face(rings[1], color, axis)
        for i in range(sides):
            j = (i + 1) % sides
            outward = sub(rings[0][i], a)
            self.face([rings[0][i], rings[0][j], rings[1][j], rings[1][i]], color, outward)

    def curtain(self, width=0.47, height=1.8):
        # A closed folded fabric prism. The irregular hem is geometry, not an image.
        sections = 8
        front = []
        for i in range(sections + 1):
            x = -width / 2 + width * i / sections
            z = 0.035 if i % 2 else -0.055
            bottom = 0.03 if i % 2 else 0
            front.append(((x, bottom, z), (x, height, z)))
        for i in range(sections):
            a, b = front[i], front[i + 1]
            col = "coral" if i % 2 else "coral_light"
            self.face([a[0], b[0], b[1], a[1]], col, (0, 0, 1))
            self.face([(p[0], p[1], p[2] - 0.025) for p in [a[0], a[1], b[1], b[0]]],
                      col, (0, 0, -1))
            for end in (0, 1):
                self.face([a[end], b[end], (b[end][0], b[end][1], b[end][2] - 0.025),
                           (a[end][0], a[end][1], a[end][2] - 0.025)], col,
                          (0, -1 if end == 0 else 1, 0))
        for i, normal in ((0, (-1, 0, 0)), (-1, (1, 0, 0))):
            a, b = front[i]
            self.face([a, b, (b[0], b[1], b[2] - 0.025), (a[0], a[1], a[2] - 0.025)],
                      "coral", normal)

    @property
    def triangles(self):
        return sum(len(points) - 2 for points, _ in self.faces)


def png_atlas():
    rgb = [bytes.fromhex(col) for _, col in PALETTE]
    rgb += [rgb[0]] * (64 - len(rgb))
    rows = []
    for y in range(1024):
        row = b"".join(rgb[(y // 128) * 8 + x] * 128 for x in range(8))
        rows.append(b"\0" + row)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    image = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1024, 1024, 8, 2, 0, 0, 0))
             + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))
    (ROOT / "palette-1024.png").write_bytes(image)


class Room:
    def __init__(self, name, title, rescue):
        self.name, self.title = name, title
        self.nodes, self.meshes, self.views, self.accessors = [], [], [], []
        self.binary = bytearray()
        self.root = self.node("room_" + name, extras={"units": "metres", "up": "+Y", "front": "+Z",
                              "origin": "floor centre", "license": "CC0-1.0", "defaultState": "intact"})
        self.items, self.structural_triangles = [], 0
        self.node("rescue_spot", self.root, translation=rescue,
                  extras={"role": "child_or_pet_placement", "clearRadius": 0.35})
        self.node("door_exit", self.root, translation=[2.38, 0, -2.42],
                  extras={"role": "exit_threshold", "width": 1.02, "outward": [0, 0, -1]})

    def node(self, name, parent=None, **props):
        index = len(self.nodes)
        self.nodes.append({"name": name, **props})
        if parent is not None:
            self.nodes[parent].setdefault("children", []).append(index)
        return index

    def accessor(self, values, dimensions, kind="FLOAT", target=34962):
        while len(self.binary) % 4:
            self.binary.append(0)
        offset = len(self.binary)
        code, component = ("f", 5126) if kind == "FLOAT" else ("H", 5123)
        self.binary.extend(struct.pack("<" + code * len(values), *values))
        view = len(self.views)
        self.views.append({"buffer": 0, "byteOffset": offset,
                           "byteLength": len(values) * (4 if kind == "FLOAT" else 2), "target": target})
        item = {"bufferView": view, "componentType": component,
                "count": len(values) // dimensions, "type": {1: "SCALAR", 2: "VEC2", 3: "VEC3"}[dimensions]}
        if kind == "FLOAT":
            item["min"] = [min(values[i::dimensions]) for i in range(dimensions)]
            item["max"] = [max(values[i::dimensions]) for i in range(dimensions)]
        self.accessors.append(item)
        return len(self.accessors) - 1

    def mesh(self, name, geometry, burnt=False):
        positions, normals, uv, indices = [], [], [], []
        for face_index, (points, color) in enumerate(geometry.faces):
            normal = cross(sub(points[1], points[0]), sub(points[2], points[0]))
            length = math.sqrt(dot(normal, normal))
            if length < 1e-10:
                raise ValueError(f"Degenerate face: {name} / {face_index}")
            normal = tuple(v / length for v in normal)
            if burnt:
                # Stable mottled soot, with no baked lighting or photographic texture.
                color = ("soot", "ash", "soot", "char", "ash")[face_index % 5]
            swatch = COLOR[color]
            coord = ((swatch % 8 + 0.5) / 8, (swatch // 8 + 0.5) / 8)
            base = len(positions) // 3
            for p in points:
                positions.extend(p)
                normals.extend(normal)
                uv.extend(coord)
            for i in range(1, len(points) - 1):
                indices.extend((base, base + i, base + i + 1))
        primitive = {"attributes": {"POSITION": self.accessor(positions, 3),
                                     "NORMAL": self.accessor(normals, 3), "TEXCOORD_0": self.accessor(uv, 2)},
                     "indices": self.accessor(indices, 1, "UNSIGNED_SHORT", 34963), "material": 0, "mode": 4}
        self.meshes.append({"name": name, "primitives": [primitive]})
        return len(self.meshes) - 1

    def fixed(self, name, geometry):
        self.node(name, self.root, mesh=self.mesh(name, geometry))
        self.structural_triangles += geometry.triangles

    def burn(self, name, title, at, fire, geometry, category):
        intact, burnt, focus = "intact_" + name, "burnt_" + name, "fire_" + name
        parent = self.node("burn_" + name, self.root, translation=at,
                           extras={"label": title, "category": category, "intactNode": intact,
                                   "burntNode": burnt, "fireNode": focus, "defaultState": "intact"})
        self.node(intact, parent, mesh=self.mesh(intact, geometry), extras={"state": "intact"})
        self.node(burnt, parent, mesh=self.mesh(burnt, geometry, True), scale=[0, 0, 0],
                  extras={"state": "burnt", "restScale": [1, 1, 1]})
        self.node(focus, parent, translation=fire, extras={"role": "fire_origin"})
        self.items.append({"name": name, "label": title, "category": category,
                           "trianglesPerState": geometry.triangles,
                           "fireLocal": fire, "fireWorld": [round(a + b, 4) for a, b in zip(at, fire)]})

    def shell(self, window=True, kitchen=False):
        g = Geometry()
        g.box((0, -0.11, 0), (6.64, 0.22, 4.84), "wood_light", 0.055)
        # Stone slabs, metal window trim, plaster and masonry are fixed architecture.
        for x in range(8):
            for z in range(4):
                g.box((-2.8 + x * 0.8, -0.015, -1.725 + z * 1.15), (0.788, 0.03, 1.138),
                      ("linen", "sand", "cream")[(x + z * 2) % 3])
        # Back wall has a real opening for the door, and optionally for a window.
        openings = [(1.84, 2.92, 0, 2.35)]
        if window:
            openings.append((-2.63, -0.51, 1.38, 2.8))
        xs = sorted({-3.2, 3.2, *[a for op in openings for a in op[:2]]})
        ys = sorted({0, 1.05, 3.12, *[a for op in openings for a in op[2:]]})
        for x1, x2 in zip(xs, xs[1:]):
            for y1, y2 in zip(ys, ys[1:]):
                x, y = (x1 + x2) / 2, (y1 + y2) / 2
                if any(a < x < b and c < y < d for a, b, c, d in openings):
                    continue
                g.box((x, y, -2.36), (x2 - x1, y2 - y1, 0.16), "wall" if y > 1.05 else "peach")
        for x in (-3.26, 3.26):
            g.box((x, 1.56, 0), (0.12, 3.12, 4.72), "wall")
            g.box((x * 0.978, 0.1, 0), (0.05, 0.2, 4.6), "ivory")
            g.box((x, 3.12, 0), (0.18, 0.08, 4.8), "ivory", 0.015)
        g.box((-0.7, 0.1, -2.245), (5.06, 0.2, 0.06), "ivory")
        g.box((0, 3.12, -2.35), (6.6, 0.08, 0.22), "ivory", 0.015)
        for x in (1.79, 2.97):
            g.box((x, 1.19, -2.23), (0.1, 2.38, 0.18), "ivory", 0.015)
        g.box((2.38, 2.39, -2.23), (1.28, 0.12, 0.18), "ivory", 0.015)
        g.box((2.38, 1.17, -2.58), (1.06, 2.34, 0.06), "navy")
        g.box((2.38, 0.018, -2.35), (1.1, 0.036, 0.42), "sand")
        if window:
            self.window(g)
        if kitchen:
            # Small ceramic backsplash tiles, all color from the same atlas.
            for x in range(10):
                for y in range(2):
                    g.box((-2.55 + x * 0.4, 1.2 + y * 0.28, -2.252), (0.386, 0.266, 0.022),
                          "sage" if (x + y) % 3 else "teal_light")
        self.fixed("architecture_stone_plaster_metal", g)
        door = Geometry()
        door.box((0, 1.13, 0), (0.96, 2.26, 0.065), "teal", 0.025)
        door.box((0, 1.43, 0.038), (0.74, 1.16, 0.02), "teal_light", 0.012)
        door.box((0, 0.44, 0.038), (0.74, 0.55, 0.02), "sage_dark", 0.012)
        door.rod((-0.35, 1.02, 0.08), (-0.19, 1.02, 0.08), 0.025, "gold", 8)
        # A door opened towards the corridor, beyond the playable floor.
        transformed = Geometry()
        angle = math.radians(-58)
        for points, color in door.faces:
            transformed.face([(0.48 + (p[0] - 0.48) * math.cos(angle) + p[2] * math.sin(angle), p[1],
                               -(p[0] - 0.48) * math.sin(angle) + p[2] * math.cos(angle)) for p in points], color)
        self.burn("door", "דלת", [2.38, 0, -2.44], [0.19, 1.08, -0.4], transformed, "wood")

    def window(self, g):
        g.box((-1.57, 2.09, -2.405), (2.1, 1.42, 0.04), "sky")
        # Abstract outdoor shapes contain no text, symbols or photographic assets.
        g.face([(-2.6, 1.41, -2.376), (-2.6, 1.91, -2.376), (-2.13, 2.13, -2.376),
                (-1.38, 1.56, -2.376), (-0.54, 1.41, -2.376)], "hill", (0, 0, 1))
        g.box((-1.17, 2.51, -2.374), (0.47, 0.075, 0.016), "cloud", 0.02)
        for x in (-2.64, -1.57, -0.5):
            g.box((x, 2.1, -2.29), (0.065, 1.49, 0.12), "ivory")
        for y in (1.37, 2.11, 2.83):
            g.box((-1.57, y, -2.29), (2.2, 0.065, 0.12), "ivory")
        g.box((-1.57, 1.34, -2.2), (2.3, 0.07, 0.3), "ivory", 0.02)
        g.rod((-2.99, 2.94, -2.12), (-0.13, 2.94, -2.12), 0.026, "metal", 8)
        for name, x in (("curtain_left", -2.72), ("curtain_right", -0.42)):
            curtain = Geometry()
            curtain.curtain()
            self.burn(name, "וילון " + ("שמאל" if x < -1 else "ימין"),
                      [x, 1.08, -2.09], [0, 0.8, 0.07], curtain, "fabric")

    def save(self):
        total = self.structural_triangles + 2 * sum(i["trianglesPerState"] for i in self.items)
        if total > 6000:
            raise ValueError(f"{self.name}: {total} triangles exceeds 6,000")
        tilt = math.atan2(CAMERA["position"][1] - CAMERA["target"][1], CAMERA["position"][2])
        self.node("camera_game", self.root, camera=0, translation=CAMERA["position"],
                  rotation=[-math.sin(tilt / 2), 0, 0, math.cos(tilt / 2)],
                  extras={"target": CAMERA["target"], "fixed": True})
        doc = {"asset": {"version": "2.0", "generator": "Original CC0 Fire Rooms v1 / build_rooms.py",
                          "copyright": "CC0-1.0 — original geometry; see LICENSES.md"},
               "scene": 0, "scenes": [{"name": self.name, "nodes": [self.root]}],
               "nodes": self.nodes, "meshes": self.meshes, "buffers": [{"byteLength": len(self.binary)}],
               "bufferViews": self.views, "accessors": self.accessors,
               "materials": [{"name": "shared_flat_palette", "pbrMetallicRoughness": {
                   "baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 1}}],
               "textures": [{"source": 0, "sampler": 0}], "images": [{"uri": "palette-1024.png"}],
               "samplers": [{"magFilter": 9728, "minFilter": 9728, "wrapS": 33071, "wrapT": 33071}],
               "cameras": [{"name": "camera_game", "type": "orthographic", "orthographic": {
                   "xmag": CAMERA["verticalSpan"] * CAMERA["aspect"] / 2,
                   "ymag": CAMERA["verticalSpan"] / 2, "znear": 0.1, "zfar": 40}}]}
        json_bytes = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
        json_bytes += b" " * (-len(json_bytes) % 4)
        binary = bytes(self.binary) + b"\0" * (-len(self.binary) % 4)
        glb = (struct.pack("<4sII", b"glTF", 2, 28 + len(json_bytes) + len(binary))
               + struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes
               + struct.pack("<I4s", len(binary), b"BIN\0") + binary)
        filename = self.name + ".glb"
        (ROOT / filename).write_bytes(glb)
        return {"id": self.name, "label": self.title, "file": filename, "bytes": len(glb),
                "sha256": hashlib.sha256(glb).hexdigest(), "totalTriangles": total,
                "visibleTriangles": self.structural_triangles + sum(i["trianglesPerState"] for i in self.items),
                "architectureTriangles": self.structural_triangles, "nodeCount": len(self.nodes),
                "burnableCount": len(self.items), "items": self.items}


def table(width, depth, height, top="wood_light"):
    g = Geometry()
    g.box((0, height - 0.055, 0), (width, 0.11, depth), top, 0.03)
    for x, z in itertools.product((-1, 1), repeat=2):
        g.box((x * (width / 2 - 0.13), (height - 0.11) / 2, z * (depth / 2 - 0.12)),
              (0.095, height - 0.11, 0.095), "wood")
    return g


def console(width=1.42, height=0.68, depth=0.62):
    g = Geometry()
    for x in (-width / 2 + 0.12, width / 2 - 0.12):
        g.box((x, 0.1, 0), (0.12, 0.2, depth - 0.14), "wood_dark")
    g.box((0, (height + 0.16) / 2, 0), (width, height - 0.16, depth), "wood_light", 0.025)
    for x in (-width / 4, width / 4):
        g.box((x, height / 2 + 0.08, depth / 2 + 0.018),
              (width / 2 - 0.045, height - 0.24, 0.04), "wood", 0.015)
        g.box((x + 0.09, height / 2 + 0.09, depth / 2 + 0.052), (0.16, 0.025, 0.025), "gold")
    return g


def lamp(small=False):
    g = Geometry()
    h, r = (0.48, 0.17) if small else (1.74, 0.32)
    g.cylinder((0, 0.025, 0), r * 0.85, 0.05, "wood_dark", 12)
    g.cylinder((0, h * 0.42, 0), 0.022, h * 0.8, "mustard", 8)
    g.cylinder((0, h * 0.86, 0), r, h * 0.28, "gold", 12, r * 0.64)
    g.cylinder((0, h * 0.72, 0), r * 0.98, 0.025, "ivory", 12)
    return g


def television():
    g = Geometry()
    g.box((0, 0.56, 0), (1.18, 0.76, 0.09), "dark", 0.025)
    g.box((0, 0.565, 0.049), (1.07, 0.65, 0.012), "screen", 0.012)
    g.face([(-0.5, 0.29, 0.057), (0.51, 0.84, 0.057), (0.51, 0.29, 0.057)], "blue", (0, 0, 1))
    for x in (-0.4, 0.4):
        g.rod((x, 0.24, 0), (x * 1.12, 0.02, 0.15), 0.025, "dark")
        g.rod((x, 0.24, 0), (x * 0.88, 0.02, -0.12), 0.025, "dark")
    return g


def living_room():
    room = Room("living-room", "סלון", [1.77, 0, 1.08])
    room.shell()
    g = Geometry()
    for x, z in itertools.product((-1.06, 1.06), (-0.39, 0.39)):
        g.box((x, 0.105, z), (0.12, 0.21, 0.12), "wood_dark")
    g.box((0, 0.32, 0), (2.5, 0.35, 1.04), "rust", 0.06)
    g.box((0, 0.81, -0.42), (2.42, 0.77, 0.25), "coral", 0.065)
    for x in (-1.14, 1.14):
        g.box((x, 0.62, 0.02), (0.25, 0.6, 1.04), "coral", 0.07)
    for x in (-0.52, 0.52):
        g.box((x, 0.55, 0.08), (1.0, 0.22, 0.79), "coral_light", 0.06)
        g.box((x, 0.84, -0.24), (1.0, 0.55, 0.19), "coral_light", 0.05)
    g.box((-0.81, 0.84, 0.04), (0.37, 0.39, 0.19), "gold", 0.055, -0.16)
    g.box((0.79, 0.82, 0.04), (0.37, 0.36, 0.18), "teal_light", 0.055, 0.2)
    room.burn("sofa", "ספה", [-1.34, 0, -1.25], [0, 0.7, 0.17], g, "upholstery")
    rug = Geometry()
    rug.box((0, 0.012, 0), (3.3, 0.024, 2.05), "ochre", 0.008)
    rug.box((0, 0.026, 0), (3.08, 0.008, 1.83), "cream")
    rug.box((0, 0.032, 0), (2.92, 0.004, 1.67), "ochre")
    for x in (-1.29, 1.29):
        rug.box((x, 0.036, 0), (0.085, 0.004, 1.35), "mustard")
    room.burn("rug", "שטיח", [-1, 0, 0.54], [1.18, 0.07, 0.6], rug, "fabric")
    room.burn("coffee_table", "שולחן קפה", [-1.12, 0.04, 0.65], [0, 0.58, 0],
              table(1.54, 0.78, 0.53), "wood")
    room.burn("tv_console", "ארון טלוויזיה", [0.98, 0, -1.76], [0, 0.48, 0.34], console(), "wood")
    room.burn("television", "טלוויזיה", [0.98, 0.68, -1.74], [0, 0.56, 0.08], television(), "electrical")
    room.burn("floor_lamp", "מנורת רצפה", [-2.76, 0, -0.25], [0, 1.5, 0], lamp(), "electrical_fabric")
    return room


def kitchen():
    room = Room("kitchen", "מטבח", [2.18, 0, 1.32])
    room.shell(window=False, kitchen=True)
    stove = Geometry()
    stove.box((0, 0.49, 0), (1.02, 0.94, 0.84), "ivory", 0.028)
    stove.box((0, 0.982, 0), (1.06, 0.045, 0.86), "dark", 0.012)
    stove.box((0, 0.48, 0.431), (0.82, 0.59, 0.028), "metal", 0.018)
    stove.box((0, 0.47, 0.45), (0.67, 0.4, 0.018), "navy", 0.015)
    stove.box((0, 0.76, 0.47), (0.7, 0.035, 0.05), "dark")
    for x in (-0.33, -0.11, 0.11, 0.33):
        stove.cylinder((x, 0.88, 0.44), 0.039, 0.045, "dark", 8)
    for x, z in itertools.product((-0.25, 0.25), (-0.2, 0.2)):
        stove.cylinder((x, 1.011, z), 0.14, 0.017, "metal", 12)
        stove.cylinder((x, 1.024, z), 0.08, 0.012, "dark", 10)
    room.burn("stove", "כיריים ותנור", [-2.16, 0, -1.73], [0, 1.03, 0.2], stove, "electrical")
    pot = Geometry()
    pot.cylinder((0, 0.105, 0), 0.195, 0.21, "rust", 12)
    pot.cylinder((0, 0.215, 0), 0.205, 0.025, "metal_light", 12)
    pot.cylinder((0, 0.23, 0), 0.17, 0.008, "oil", 12)
    for x in (-0.26, 0.26):
        pot.box((x, 0.14, 0), (0.16, 0.055, 0.085), "wood_dark", 0.014)
    room.burn("oil_pot", "סיר שמן", [-2.41, 1.035, -1.53], [0, 0.27, 0], pot, "cooking_oil")
    room.burn("base_cabinet", "ארון מטבח תחתון", [-0.88, 0, -1.74], [0, 0.55, 0.43],
              console(1.42, 0.97, 0.84), "wood")
    cabinet = console(1.42, 0.82, 0.34)
    room.burn("wall_cabinet", "ארון מטבח עליון", [-0.88, 1.9, -2.07], [0, 0.42, 0.2], cabinet, "wood")
    fridge = Geometry()
    fridge.box((0, 1.07, 0), (0.95, 2.14, 0.85), "sage_dark", 0.045)
    for y, h in ((0.77, 1.37), (1.82, 0.62)):
        fridge.box((0, y, 0.446), (0.89, h, 0.07), "sage", 0.025)
        fridge.box((-0.32, y + 0.07, 0.507), (0.045, h * 0.4, 0.055), "ivory", 0.012)
    room.burn("refrigerator", "מקרר", [0.64, 0, -1.77], [-0.3, 0.38, 0.47], fridge, "electrical")
    room.burn("kitchen_table", "שולחן מטבח", [-0.57, 0, 0.67], [0, 0.86, 0],
              table(1.64, 0.86, 0.84, "cream"), "wood")
    for name, x in (("chair_left", -1.84), ("chair_right", 0.72)):
        chair = Geometry()
        chair.box((0, 0.45, 0), (0.47, 0.08, 0.48), "teal", 0.024)
        chair.box((0, 0.77, -0.21), (0.47, 0.58, 0.075), "teal_light", 0.025)
        for a, b in itertools.product((-0.17, 0.17), repeat=2):
            chair.box((a, 0.215, b), (0.055, 0.43, 0.055), "wood")
        room.burn(name, "כיסא " + ("שמאל" if x < 0 else "ימין"), [x, 0, 0.66],
                  [0, 0.58, 0], chair, "wood")
    socket = Geometry()
    socket.box((0, 0, 0), (0.19, 0.23, 0.045), "ivory", 0.015)
    for x, y in ((-0.043, 0.03), (0.043, 0.03), (0, -0.038)):
        socket.box((x, y, 0.025), (0.023, 0.023, 0.008), "dark")
    room.burn("electrical_outlet", "שקע חשמל", [1.47, 0.49, -2.24], [0, 0, 0.05], socket, "electrical")
    strip = Geometry()
    strip.box((0, 0.05, 0), (0.22, 0.1, 0.65), "ivory", 0.018)
    for z in (-0.2, 0, 0.2):
        for x in (-0.045, 0.045):
            strip.box((x, 0.104, z), (0.025, 0.008, 0.04), "dark")
    strip.box((0, 0.105, 0.255), (0.07, 0.014, 0.05), "coral")
    points = [(0, 0.06, -0.33), (-0.1, 0.025, -0.64), (-0.25, 0.025, -1),
              (-0.66, 0.025, -1.3), (-1.06, 0.04, -1.57), (-1.06, 0.49, -1.63)]
    for a, b in zip(points, points[1:]):
        strip.rod(a, b, 0.014, "dark", 6)
    room.burn("power_strip", "מפצל וכבל חשמל", [2.53, 0, -0.57], [0, 0.15, 0], strip, "electrical")
    return room


def bedroom():
    room = Room("bedroom", "חדר שינה", [0.15, 0, 1.55])
    room.shell()
    bed = Geometry()
    bed.box((0, 0.31, 0), (1.76, 0.25, 2.73), "wood_light", 0.035)
    bed.box((0, 0.68, -1.32), (1.84, 1.16, 0.14), "wood", 0.035)
    bed.box((0, 0.53, 1.32), (1.84, 0.36, 0.14), "wood", 0.025)
    for x, z in itertools.product((-0.7, 0.7), (-1.1, 1.1)):
        bed.box((x, 0.1, z), (0.13, 0.2, 0.13), "wood_dark")
    room.burn("bed", "מסגרת מיטה", [-1.53, 0, -0.59], [0, 0.4, 1.27], bed, "wood")
    mattress = Geometry()
    mattress.box((0, 0.15, 0), (1.61, 0.3, 2.53), "ivory", 0.07)
    mattress.box((0, 0.12, 0), (1.62, 0.035, 2.54), "linen", 0.012)
    room.burn("mattress", "מזרן", [-1.53, 0.435, -0.59], [0.5, 0.24, 0.94], mattress, "upholstery")
    blanket = Geometry()
    blanket.box((0, 0.035, 0), (1.69, 0.07, 1.74), "teal_light", 0.025)
    blanket.box((0, 0.077, -0.73), (1.7, 0.035, 0.26), "teal", 0.012)
    for x in (-0.45, 0.45):
        blanket.box((x, 0.074, 0.02), (0.035, 0.008, 1.39), "sage")
    room.burn("blanket", "שמיכה", [-1.53, 0.735, -0.22], [0, 0.12, 0.1], blanket, "fabric")
    pillow = Geometry()
    pillow.box((0, 0.11, 0), (1.02, 0.22, 0.49), "gold", 0.075)
    room.burn("pillow", "כרית", [-1.53, 0.735, -1.54], [0, 0.25, 0], pillow, "fabric")
    wardrobe = Geometry()
    wardrobe.box((0, 1.13, 0), (1.17, 2.26, 0.7), "wood_light", 0.035)
    for x in (-0.285, 0.285):
        wardrobe.box((x, 1.15, 0.363), (0.54, 2.08, 0.045), "wood", 0.02)
    for x in (-0.075, 0.075):
        wardrobe.box((x, 1.12, 0.41), (0.027, 0.25, 0.04), "gold", 0.008)
    room.burn("wardrobe", "ארון בגדים", [0.44, 0, -1.84], [0, 1.2, 0.42], wardrobe, "wood")
    room.burn("desk", "שולחן מחשב", [1.68, 0, 0.97], [0.4, 0.82, 0.3], table(1.77, 0.85, 0.8), "wood")
    computer = Geometry()
    computer.box((0, 0.4, -0.12), (0.83, 0.51, 0.055), "navy", 0.018)
    computer.box((0, 0.405, -0.087), (0.74, 0.42, 0.012), "sky", 0.01)
    computer.box((0, 0.15, -0.12), (0.06, 0.23, 0.07), "metal")
    computer.box((0, 0.025, -0.12), (0.4, 0.05, 0.24), "navy", 0.012)
    computer.box((0, 0.025, 0.22), (0.58, 0.04, 0.19), "ivory", 0.01)
    # Blank geometric key rows, no letters or characters on the keyboard or display.
    for z in (0.17, 0.21, 0.25):
        computer.box((0, 0.05, z), (0.49, 0.01, 0.024), "metal_light")
    computer.box((0.55, 0.2, -0.06), (0.22, 0.4, 0.35), "navy", 0.018)
    computer.box((0.55, 0.24, 0.12), (0.13, 0.02, 0.012), "metal_light")
    room.burn("computer", "מחשב", [1.62, 0.8, 0.94], [0, 0.4, -0.05], computer, "electrical")
    room.burn("nightstand", "שידה", [-2.77, 0, -1.27], [0, 0.4, 0.27], console(0.56, 0.61, 0.53), "wood")
    room.burn("bedside_lamp", "מנורת לילה", [-2.77, 0.61, -1.27], [0, 0.4, 0], lamp(True), "electrical_fabric")
    return room


def main():
    png_atlas()
    rooms = [living_room(), kitchen(), bedroom()]
    manifest = {"version": 1, "license": "CC0-1.0", "atlas": "palette-1024.png",
                "atlasSize": [1024, 1024], "units": "metres", "up": "+Y", "front": "+Z",
                "origin": [0, 0, 0], "camera": CAMERA,
                "stateContract": {"parent": "burn_<name>", "intact": "intact_<name>",
                                  "burnt": "burnt_<name>", "fire": "fire_<name>",
                                  "default": "intact", "burntStoredScale": [0, 0, 0],
                                  "burntActiveScale": [1, 1, 1]},
                "rooms": [room.save() for room in rooms]}
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    for room in manifest["rooms"]:
        print(f"{room['file']}: {room['totalTriangles']} total / {room['visibleTriangles']} active triangles; "
              f"{room['burnableCount']} burnable objects; {room['bytes']} bytes")


if __name__ == "__main__":
    main()
