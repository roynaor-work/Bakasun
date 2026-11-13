#!/usr/bin/env python3
"""Original CC0 building kit. Python 3 standard library only; no external assets.

Run from any directory: python3 path/to/build_assets.py
Outputs deterministic, uncompressed glTF 2.0 GLBs and one shared 1024px atlas.
Coordinates are authored directly in metres, Y up, facade toward positive Z.
"""
import hashlib
import json
import math
from pathlib import Path
import random
import struct
import zlib

OUT = Path(__file__).resolve().parent
PALETTE = [
    ("peach_plaster", "#d7a07d", "plaster"),
    ("honey_plaster", "#e6c492", "plaster"),
    ("sand_plaster", "#cfb59a", "plaster"),
    ("limestone", "#eee0bf", "stone"),
    ("terracotta", "#b95f42", "tile"),
    ("walnut", "#694939", "wood"),
    ("sage", "#637c6b", "paint"),
    ("brass", "#bf9560", "metal"),
    ("recess", "#302c31", "plain"),
    ("charcoal", "#514444", "soot"),
    ("linen", "#f2d9aa", "cloth"),
    ("glazing", "#7fa8a7", "glass"),
    ("iron", "#465757", "metal"),
    ("flame_orange", "#ef7638", "plain"),
    ("flame_gold", "#ffce65", "plain"),
    ("brick", "#aa765c", "brick"),
]
TILE = {name: i for i, (name, _, _) in enumerate(PALETTE)}
SPECS = [
    dict(id="private-2f", label="בית פרטי", floors=2, width=9.0, depth=6.2,
         spacing=2.8, plaster="honey_plaster", roof_rise=1.85),
    dict(id="residential-3f", label="בניין מגורים", floors=3, width=10.8, depth=6.8,
         spacing=3.35, plaster="peach_plaster", roof_rise=1.65),
    dict(id="highrise-5f", label="בניין גבוה", floors=5, width=11.4, depth=7.2,
         spacing=3.55, plaster="sand_plaster", roof_rise=1.3),
]


def dump(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def make_atlas():
    """16 hand-designed material tiles, 8px UV gutters, no lettering/logos."""
    rng = random.Random(9417)
    pixels = bytearray(1024 * 1024 * 3)
    for i, (_, color, style) in enumerate(PALETTE):
        rgb = tuple(int(color[c:c + 2], 16) for c in (1, 3, 5))
        for y in range(256):
            for x in range(256):
                # Clamp the gutters to the usable tile edge to prevent bleeding.
                u, v = min(247, max(8, x)), min(247, max(8, y))
                delta = rng.randrange(-3, 4)
                if style == "plaster":
                    delta += 2 * math.sin(u / 27) * math.sin(v / 39)
                elif style == "stone":
                    delta += -9 if v % 60 < 2 else 0
                elif style == "tile":
                    row = v // 48
                    curve = int(5 * math.cos((u + (row % 2) * 24) * math.pi / 24))
                    delta += -18 if (v + curve) % 48 < 3 else 0
                    delta += -12 if (u + row % 2 * 24) % 48 < 2 else 0
                    delta += 5 * math.cos(u * math.pi / 24)
                elif style == "wood":
                    delta += 6 * math.sin(u / 5 + math.sin(v / 29))
                    delta += -12 if u % 60 < 2 else 0
                elif style == "paint":
                    delta += 2 * math.sin(u / 11)
                elif style == "cloth":
                    delta += 3 if u % 4 == 0 else -1
                    delta += 2 if v % 4 == 0 else -1
                elif style == "glass":
                    delta += (u - v) / 35
                    delta += 19 if 70 < u - v < 83 else 0
                elif style == "soot":
                    delta += 7 * math.sin(u / 13) * math.cos(v / 9)
                elif style == "brick":
                    delta += 17 if v % 48 < 3 or (u + (v // 48 % 2) * 48) % 96 < 3 else 0
                elif style == "metal":
                    delta += 3 * math.sin(u / 40)
                px, py = (i % 4) * 256 + x, (i // 4) * 256 + y
                offset = (py * 1024 + px) * 3
                pixels[offset:offset + 3] = bytes(max(0, min(255, round(c + delta))) for c in rgb)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    scanlines = b"".join(b"\0" + pixels[y * 3072:(y + 1) * 3072] for y in range(1024))
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1024, 1024, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(scanlines, 9)) + chunk(b"IEND", b"")
    (OUT / "warm-atlas-1024.png").write_bytes(png)
    dump(OUT / "atlas.json", {"image": "warm-atlas-1024.png", "size": [1024, 1024],
        "gutterPixels": 8, "license": "CC0-1.0", "tiles": [
            {"name": name, "color": color, "pixelRect": [i % 4 * 256, i // 4 * 256, 256, 256],
             "uvRect": [(i % 4 * 256 + 8) / 1024, (i // 4 * 256 + 8) / 1024,
                        (i % 4 * 256 + 248) / 1024, (i // 4 * 256 + 248) / 1024]}
            for i, (name, color, _) in enumerate(PALETTE)]})
    return png


def subtract(a, b):
    return [a[i] - b[i] for i in range(3)]


def normal(a, b, c):
    u, v = subtract(b, a), subtract(c, a)
    n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    length = math.sqrt(sum(x * x for x in n))
    if length < 1e-10:
        raise ValueError("Degenerate face")
    return [x / length for x in n]


def quat(axis, angle):
    s = math.sin(angle / 2)
    return [axis[0] * s, axis[1] * s, axis[2] * s, math.cos(angle / 2)]


class Mesh:
    def __init__(self):
        self.positions, self.normals, self.uvs, self.indices = [], [], [], []

    def face(self, points, tile, uv=None):
        n, start = normal(*points[:3]), len(self.positions) // 3
        index = TILE[tile]
        if uv is None:
            uv = [(0, 1), (1, 1), (1, 0), (0, 0)] if len(points) == 4 else [
                (.5 + .48 * math.cos(2 * math.pi * i / len(points)),
                 .5 + .48 * math.sin(2 * math.pi * i / len(points))) for i in range(len(points))]
        for p, (u, v) in zip(points, uv):
            self.positions.extend(p)
            self.normals.extend(n)
            self.uvs.extend(((index % 4 * 256 + 8 + u * 240) / 1024,
                             (index // 4 * 256 + 8 + v * 240) / 1024))
        for i in range(1, len(points) - 1):
            self.indices.extend((start, start + i, start + i + 1))

    def box(self, center, size, tile, rotation_z=0):
        x, y, z = center
        a, b, c = [d / 2 for d in size]
        faces = [
            [(a, -b, -c), (a, b, -c), (a, b, c), (a, -b, c)],
            [(-a, -b, c), (-a, b, c), (-a, b, -c), (-a, -b, -c)],
            [(-a, b, c), (a, b, c), (a, b, -c), (-a, b, -c)],
            [(-a, -b, -c), (a, -b, -c), (a, -b, c), (-a, -b, c)],
            [(-a, -b, c), (a, -b, c), (a, b, c), (-a, b, c)],
            [(a, -b, -c), (-a, -b, -c), (-a, b, -c), (a, b, -c)],
        ]
        cs, sn = math.cos(rotation_z), math.sin(rotation_z)
        for face in faces:
            self.face([(x + u * cs - v * sn, y + u * sn + v * cs, z + w) for u, v, w in face], tile)

    def cylinder(self, center, radius, height, tile, sides=8, top_radius=None, axis="y"):
        r2 = radius if top_radius is None else top_radius
        def point(i, top):
            a = 2 * math.pi * i / sides
            r = r2 if top else radius
            p = [r * math.cos(a), height / 2 if top else -height / 2, r * math.sin(a)]
            if axis == "x":
                p = [p[1], -p[0], p[2]]
            return [center[k] + p[k] for k in range(3)]
        for i in range(sides):
            self.face([point(i, False), point(i, True), point(i + 1, True), point(i + 1, False)], tile)
        self.face([point(i, True) for i in reversed(range(sides))], tile)
        self.face([point(i, False) for i in range(sides)], tile)

    def beam(self, a, b, thickness, tile):
        # Rectangular beam between arbitrary points, including balcony braces.
        direction = subtract(b, a)
        length = math.sqrt(sum(x * x for x in direction))
        d = [x / length for x in direction]
        reference = [0, 0, 1] if abs(d[2]) < .9 else [1, 0, 0]
        u = normal([0, 0, 0], d, reference)
        v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]]
        rings = [[tuple(p[k] + thickness / 2 * (s * u[k] + t * v[k]) for k in range(3))
                  for s, t in [(1, 1), (-1, 1), (-1, -1), (1, -1)]] for p in (a, b)]
        self.face(list(reversed(rings[0])), tile)
        self.face(rings[1], tile)
        for i in range(4):
            self.face([rings[0][i], rings[0][(i + 1) % 4], rings[1][(i + 1) % 4], rings[1][i]], tile)


class GLB:
    def __init__(self, spec, atlas):
        self.spec, self.binary = spec, bytearray()
        self.doc = {"asset": {"version": "2.0", "generator": "Original fire-building-v1 authoring script",
                             "copyright": "CC0-1.0; original geometry and texture, 2026"},
                    "scene": 0, "scenes": [{"name": spec["id"] + "_scene", "nodes": [0]}],
                    "nodes": [], "meshes": [], "accessors": [], "bufferViews": [], "animations": [],
                    "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
                    "textures": [{"source": 0, "sampler": 0}],
                    "materials": [{"name": "warm_atlas", "pbrMetallicRoughness": {
                        "baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": .88}},
                        {"name": "warm_atlas_flame", "pbrMetallicRoughness": {
                            "baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 1},
                         "emissiveTexture": {"index": 0}, "emissiveFactor": [1, .65, .2]}],
                    "extras": {"units": "metres", "upAxis": "+Y", "frontAxis": "+Z",
                               "license": "CC0-1.0", "floorCount": spec["floors"],
                               "stateEncoding": "scale STEP for windows/fire; TRS clips for props/door"}}
        self.doc["images"] = [{"name": "warm-atlas-1024", "mimeType": "image/png", "bufferView": self.view(atlas)}]
        self.node(spec["id"], extras={"kind": "building", "units": "metres", "front": "+Z", "up": "+Y"})

    def view(self, data, target=None):
        while len(self.binary) % 4:
            self.binary.append(0)
        i = len(self.doc["bufferViews"])
        view = {"buffer": 0, "byteOffset": len(self.binary), "byteLength": len(data)}
        if target:
            view["target"] = target
        self.doc["bufferViews"].append(view)
        self.binary.extend(data)
        return i

    def accessor(self, values, size, integer=False, target=None, bounds=False):
        data = struct.pack("<" + ("H" if integer else "f") * len(values), *values)
        entry = {"bufferView": self.view(data, target), "componentType": 5123 if integer else 5126,
                 "count": len(values) // size, "type": {1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4"}[size]}
        if bounds:
            entry["min"] = [min(values[k::size]) for k in range(size)]
            entry["max"] = [max(values[k::size]) for k in range(size)]
        self.doc["accessors"].append(entry)
        return len(self.doc["accessors"]) - 1

    def mesh(self, name, mesh, material=0):
        if not mesh.indices:
            raise ValueError("Empty mesh: " + name)
        primitive = {"attributes": {
            "POSITION": self.accessor(mesh.positions, 3, target=34962, bounds=True),
            "NORMAL": self.accessor(mesh.normals, 3, target=34962),
            "TEXCOORD_0": self.accessor(mesh.uvs, 2, target=34962)},
            "indices": self.accessor(mesh.indices, 1, integer=True, target=34963), "material": material, "mode": 4}
        self.doc["meshes"].append({"name": name, "primitives": [primitive]})
        return len(self.doc["meshes"]) - 1

    def node(self, name, parent=None, mesh=None, translation=None, scale=None, extras=None):
        i, node = len(self.doc["nodes"]), {"name": name}
        for key, value in [("mesh", mesh), ("translation", translation), ("scale", scale), ("extras", extras)]:
            if value is not None:
                node[key] = value
        self.doc["nodes"].append(node)
        if parent is not None:
            self.doc["nodes"][parent].setdefault("children", []).append(i)
        return i

    def clip(self, name, channels, interpolation="LINEAR"):
        animation = {"name": name, "samplers": [], "channels": []}
        for node, path, times, values in channels:
            sampler = {"input": self.accessor(times, 1, bounds=True),
                       "output": self.accessor([x for row in values for x in row], 4 if path == "rotation" else 3),
                       "interpolation": interpolation}
            animation["channels"].append({"sampler": len(animation["samplers"]), "target": {"node": node, "path": path}})
            animation["samplers"].append(sampler)
        self.doc["animations"].append(animation)

    def toggle_clips(self, root_name, a, b):
        for state, first, last in [("burnt", [1, 1, 1], [0, 0, 0]), ("intact", [0, 0, 0], [1, 1, 1])]:
            self.clip(root_name + "__" + state, [(a, "scale", [0, .12], [first, last]),
                (b, "scale", [0, .12], [last, first])], "STEP")

    def finish(self):
        nodes = self.doc["nodes"]
        total = sum(self.doc["accessors"][p["indices"]]["count"] // 3
                    for node in nodes if "mesh" in node for p in self.doc["meshes"][node["mesh"]]["primitives"])
        if total > 8000:
            raise ValueError(f"{self.spec['id']}: {total} triangles > 8000")
        # Default scene bounds, with exact zero-scale state meshes excluded.
        visible_triangles, bounds = 0, [[], [], []]
        def visit(index, translation, scale):
            nonlocal visible_triangles
            node = nodes[index]
            pos = [translation[k] + node.get("translation", [0, 0, 0])[k] * scale[k] for k in range(3)]
            scl = [scale[k] * node.get("scale", [1, 1, 1])[k] for k in range(3)]
            if "mesh" in node and all(scl):
                for primitive in self.doc["meshes"][node["mesh"]]["primitives"]:
                    visible_triangles += self.doc["accessors"][primitive["indices"]]["count"] // 3
                    accessor = self.doc["accessors"][primitive["attributes"]["POSITION"]]
                    for k in range(3):
                        bounds[k].extend([pos[k] + accessor[bound][k] * scl[k] for bound in ("min", "max")])
            for child in node.get("children", []):
                visit(child, pos, scl)
        visit(0, [0, 0, 0], [1, 1, 1])
        self.doc["extras"]["trianglesAllStates"] = total
        self.doc["extras"]["trianglesDefault"] = visible_triangles
        self.doc["buffers"] = [{"byteLength": len(self.binary)}]
        doc = json.dumps(self.doc, ensure_ascii=False, separators=(",", ":")).encode()
        doc += b" " * (-len(doc) % 4)
        binary = bytes(self.binary) + b"\0" * (-len(self.binary) % 4)
        glb = struct.pack("<III", 0x46546c67, 2, 28 + len(doc) + len(binary))
        glb += struct.pack("<II", len(doc), 0x4e4f534a) + doc
        glb += struct.pack("<II", len(binary), 0x004e4942) + binary
        filename = self.spec["id"] + ".glb"
        (OUT / filename).write_bytes(glb)
        return {"id": self.spec["id"], "label": self.spec["label"], "path": filename,
                "floors": self.spec["floors"], "frontWindows": self.spec["floors"] * 3,
                "trianglesAllStates": total, "trianglesDefault": visible_triangles,
                "bytes": len(glb), "sha256": hashlib.sha256(glb).hexdigest(),
                "boundsDefault": {"min": [round(min(b), 4) for b in bounds], "max": [round(max(b), 4) for b in bounds]},
                "nodes": [{"index": i, "name": node["name"], "kind": node.get("extras", {}).get("kind", "mesh" if "mesh" in node else "group"),
                           **({"states": node["extras"]["states"]} if "states" in node.get("extras", {}) else {})} for i, node in enumerate(nodes)],
                "animations": [a["name"] for a in self.doc["animations"]]}


def add_window(g, n, x, y, z, upper):
    w, h = 1.50, 1.65
    name = f"win_{n}"
    root = g.node(name, parent=0, translation=[x, y, z], extras={
        "kind": "window", "interaction": "water_target", "defaultState": "intact",
        "states": {"intact": name + "_intact", "burnt": name + "_burnt"},
        "clips": {state: name + "__" + state for state in ("intact", "burnt")},
        "hitBox": {"center": [0, 0, .04], "size": [w + .28, h + .28, .40]}})
    frame = Mesh()
    for dx in (-w / 2 - .075, w / 2 + .075):
        frame.box((dx, 0, .09), (.15, h + .3, .24), "limestone")
    for dy in (-h / 2 - .075, h / 2 + .075):
        frame.box((0, dy, .09), (w, .15, .24), "limestone")
    frame.box((0, -h / 2 - .18, .20), (w + .5, .15, .5), "limestone")
    frame.box((0, h / 2 + .23, .08), (w + .44, .12, .30), "brick")
    if upper:
        for side in (-1, 1):
            sx = side * (w / 2 + .35)
            frame.box((sx, 0, -.015), (.36, h, .09), "sage")
            for yy in (-.55, -.27, .01, .29, .57):
                frame.box((sx, yy, .045), (.28, .065, .04), "iron")
    g.node(name + "_frame", parent=root, mesh=g.mesh(name + "_frame_mesh", frame))
    intact, burnt = Mesh(), Mesh()
    intact.box((0, 0, -.21), (w, h, .12), "recess")
    intact.box((0, 0, -.13), (w - .07, h - .07, .025), "glazing")
    # Pleated linen panels, visible in front of the stylized opaque glazing.
    for side in (-1, 1):
        for j in range(4):
            xx = side * (.41 + j * .07)
            zz = -.065 + (j % 2) * .06
            intact.face([(xx - .036, -.68, zz), (xx + .036, -.68, zz + .03),
                         (xx + .05, .70, zz + .03), (xx - .05, .70, zz)], "linen")
    intact.box((0, .66, -.01), (w - .12, .18, .06), "linen")
    intact.box((0, 0, .04), (.07, h - .04, .09), "walnut")
    intact.box((0, .03, .04), (w - .02, .07, .09), "walnut")
    intact.face([(-.60, .23, -.10), (-.47, .24, -.10), (.18, .63, -.10), (.02, .63, -.10)], "limestone")
    # The alternate mesh has a different silhouette, broken glass and ragged cloth.
    burnt.box((0, 0, -.22), (w, h, .08), "recess")
    burnt.box((0, -.68, -.15), (w - .1, .14, .12), "charcoal")
    for side in (-1, 1):
        burnt.box((side * (w / 2 + .035), 0, .225), (.18, h + .22, .035), "charcoal")
        for points, tile in [
                ([(side * .7, .72, -.04), (side * .33, .72, -.04), (side * .52, .21, -.04)], "charcoal"),
                ([(side * .65, -.66, -.08), (side * .26, -.66, -.08), (side * .65, -.32, -.08)], "glazing"),
                ([(side * .55, .93, .23), (side * .83, .86, .23), (side * .68, 1.27, .23)], "charcoal")]:
            burnt.face(points if normal(*points)[2] > 0 else list(reversed(points)), tile)
    burnt.box((0, h / 2 + .04, .226), (w, .18, .04), "charcoal")
    burnt.box((-.08, .28, .01), (.065, .75, .07), "charcoal", rotation_z=-.22)
    a = g.node(name + "_intact", parent=root, mesh=g.mesh(name + "_intact_mesh", intact), extras={"kind": "state", "state": "intact"})
    b = g.node(name + "_burnt", parent=root, mesh=g.mesh(name + "_burnt_mesh", burnt), scale=[0, 0, 0], extras={"kind": "state", "state": "burnt"})
    g.toggle_clips(name, a, b)


def add_target(g, kind, position, ordinal):
    name = "target_" + kind
    mesh, h, depth = Mesh(), .82, .58
    if kind.startswith("bin"):
        h, depth = .92, .58
        mesh.box((0, .47, 0), (.56, .82, .58), "sage" if ordinal == 0 else "iron")
        mesh.box((0, .93, -.01), (.63, .12, .65), "iron")
        mesh.box((0, 1.01, .02), (.20, .07, .09), "walnut")
        for side in (-1, 1):
            mesh.cylinder((side * .29, .10, -.18), .10, .06, "recess", sides=8, axis="x")
            mesh.box((side * .15, .46, .302), (.035, .54, .03), "iron")
    elif kind.startswith("crate"):
        h, depth = .68, .62
        mesh.box((0, .34, 0), (.67, .68, .62), "walnut")
        for xx in (-.24, .24):
            mesh.box((xx, .34, .33), (.08, .68, .055), "brass")
        for yy in (.10, .57):
            mesh.box((0, yy, .337), (.68, .07, .06), "brass")
        mesh.beam((-.23, .10, .38), (.23, .57, .38), .075, "brick")
        mesh.beam((-.23, .57, .38), (.23, .10, .38), .075, "brick")
        if kind == "crate_small":
            mesh.positions = [value * .70 for value in mesh.positions]
    else:
        h, depth = .90, .66
        mesh.cylinder((0, .45, 0), .33, .82, "brick", sides=10, top_radius=.30)
        for yy in (.16, .70):
            mesh.cylinder((0, yy, 0), .344, .065, "iron", sides=10)
        mesh.cylinder((0, .88, 0), .31, .04, "iron", sides=10)
        mesh.cylinder((.13, .91, 0), .045, .025, "brass", sides=6)
    # After a +90-degree X turn, the maximum local Z becomes the lowest Y.
    # Use the actual mesh extent, including lid handles and crate braces.
    extent = {"min": [min(mesh.positions[k::3]) for k in range(3)],
              "max": [max(mesh.positions[k::3]) for k in range(3)]}
    final = [g.spec["spacing"] + (ordinal - 2) * .9, extent["max"][2] + .025,
             g.spec["depth"] / 2 + 3.65 + (ordinal % 2) * .16]
    rotation = quat([1, 0, 0], math.pi / 2)
    index = g.node(name, parent=0, mesh=g.mesh(name + "_mesh", mesh), translation=position,
        extras={"kind": "target", "interaction": "water_impulse", "defaultState": "upright",
                "states": {"upright": {"translation": position, "rotation": [0, 0, 0, 1]},
                           "fallen": {"translation": final, "rotation": rotation}},
                "clips": {"fallen": name + "__fall", "upright": name + "__upright"},
                "hitBox": {"center": [(extent["min"][k] + extent["max"][k]) / 2 for k in range(3)],
                           "size": [extent["max"][k] - extent["min"][k] + .06 for k in range(3)]},
                "fallDuration": 1.35})
    times = [0, .22, .48, .76, 1.12, 1.35]
    positions = [position, [position[0], position[1] + 1.55, position[2] + .4],
                 [final[0], position[1] + 1.50, final[2] - .5],
                 [final[0], max(final[1] + .6, position[1] * .56), final[2]],
                 [final[0], final[1] + .14, final[2]], final]
    rotations = [quat([1, 0, 0], a) for a in (0, .35, .85, 1.4, 1.68, math.pi / 2)]
    g.clip(name + "__fall", [(index, "translation", times, positions), (index, "rotation", times, rotations)])
    g.clip(name + "__upright", [(index, "translation", [0, .01], [position, position]),
                               (index, "rotation", [0, .01], [[0, 0, 0, 1]] * 2)], "STEP")


def add_roof_fire(g, n, position):
    name, flame = f"fire_roof_{n}", Mesh()
    root = g.node(name, parent=0, translation=position, extras={"kind": "fire_anchor", "interaction": "extinguish",
        "direction": [0, 1, 0], "radius": .65, "defaultState": "off", "effectNode": name + "_flame",
        "clips": {"on": name + "__on", "off": name + "__off"}})
    for x, y, z, r, height, tile in [(0, 0, 0, .38, 1.45, "flame_orange"),
            (-.3, 0, .06, .23, 1.05, "flame_orange"), (.25, 0, .05, .24, 1.12, "flame_orange"),
            (0, -.03, .22, .23, .95, "flame_gold")]:
        bottom = [(x + r * math.cos(i * math.pi / 3), y, z + r * math.sin(i * math.pi / 3)) for i in range(6)]
        middle = [(x + r * .65 * math.cos(i * math.pi / 3), y + height * .48,
                   z + r * .65 * math.sin(i * math.pi / 3)) for i in range(6)]
        for i in range(6):
            j = (i + 1) % 6
            flame.face([bottom[i], middle[i], middle[j], bottom[j]], tile)
            flame.face([middle[i], (x + .15, y + height, z - .07), middle[j]], tile)
        flame.face(bottom, tile)
    child = g.node(name + "_flame", parent=root, mesh=g.mesh(name + "_flame_mesh", flame, material=1),
                   scale=[0, 0, 0], extras={"kind": "effect"})
    for state, start, end in [("on", [0, 0, 0], [1, 1, 1]), ("off", [1, 1, 1], [0, 0, 0])]:
        g.clip(name + "__" + state, [(child, "scale", [0, .12], [start, end])], "STEP")


def make_building(spec, atlas):
    g, shell, balcony = GLB(spec, atlas), Mesh(), Mesh()
    w, d, floors, spacing = spec["width"], spec["depth"], spec["floors"], spec["spacing"]
    base, floor_h = .24, 3.2
    top, front = base + floors * floor_h, d / 2
    door_x, door_w, door_h = -spacing / 2, 1.18, 2.30
    holes = [(x - .75, x + .75, base + floor * floor_h + 1.95 - .825,
              base + floor * floor_h + 1.95 + .825) for floor in range(floors) for x in (-spacing, 0, spacing)]
    holes.append((door_x - door_w / 2, door_x + door_w / 2, base, base + door_h))
    # Real front-wall openings, rather than a solid wall behind interactive nodes.
    levels = sorted({base, top, *(v for hole in holes for v in hole[2:])})
    for lo, hi in zip(levels, levels[1:]):
        spans = sorted((a, b) for a, b, c, e in holes if c < (lo + hi) / 2 < e)
        cursor = -w / 2
        for a, b in spans + [(w / 2, w / 2)]:
            if a > cursor:
                shell.box(((a + cursor) / 2, (lo + hi) / 2, front - .12),
                          (a - cursor, hi - lo, .24), spec["plaster"])
            cursor = b
    shell.box((0, top / 2 + base / 2, -front + .12), (w, top - base, .24), spec["plaster"])
    for side in (-1, 1):
        shell.box((side * (w / 2 - .12), (top + base) / 2, 0), (.24, top - base, d - .48), spec["plaster"])
        for z in (-front, front):
            shell.box((side * (w / 2 - .13), (top + base) / 2, z), (.28, top - base, .28), "limestone")
        # Narrow, dark service pipes on the rear corners.
        shell.cylinder((side * (w / 2 + .03), (top + base) / 2, -front + .3), .055, top - base, "iron", sides=6)
    shell.box((0, .12, 0), (w + .65, .24, d + .65), "limestone")
    shell.box((door_x, .075, front + .58), (1.8, .15, .9), "limestone")
    for floor in range(floors + 1):
        yy = base + floor * floor_h
        if floor:
            shell.box((0, yy - .10, 0), (w + .18, .20, d + .18), "limestone")
        # Interior floors and ceiling: safe to view through the door and openings.
        shell.box((0, yy + .01, 0), (w - .48, .08, d - .48), "walnut")
    for n, (x, floor) in enumerate((x, f) for f in range(floors) for x in (-spacing, 0, spacing)):
        add_window(g, n + 1, x, base + floor * floor_h + 1.95, front + .015, floor > 0)

    # An actual hollow lobby and a hinged, raycastable door leaf.
    for dx in (-door_w / 2 - .09, door_w / 2 + .09):
        shell.box((door_x + dx, base + door_h / 2, front + .06), (.18, door_h + .16, .34), "limestone")
    shell.box((door_x, base + door_h + .12, front + .11), (door_w + .5, .24, .44), "limestone")
    shell.box((door_x, base + door_h + .38, front + .22), (door_w + .74, .13, .88), "terracotta")
    shell.box((door_x, base + 1.25, -front + .27), (2.5, .10, .07), "limestone")
    shell.box((door_x, base + .28, -front + .57), (1.8, .12, .52), "walnut")
    for side in (-1, 1):
        shell.box((door_x + side * .7, base + .12, -front + .57), (.1, .24, .45), "iron")
    shell.box((door_x + 1.0, base + 2.05, -front + .3), (.3, .40, .1), "brass")
    leaf = Mesh()
    leaf.box((door_w / 2, door_h / 2, 0), (door_w - .025, door_h - .025, .12), "walnut")
    for yy, hh in [(.62, .75), (1.6, .70)]:
        leaf.box((door_w / 2, yy, .071), (.88, hh, .04), "brick")
    leaf.box((door_w - .17, 1.08, .105), (.07, .22, .07), "brass")
    hinge = g.node("door_main", parent=0, mesh=g.mesh("door_main_leaf", leaf),
        translation=[door_x - door_w / 2, base, front + .04], extras={
            "kind": "door", "interaction": "enter", "pivot": "left_hinge", "defaultState": "closed",
            "entryNode": "entry_spawn", "lookNode": "entry_focus",
            "states": {"closed": {"rotation": [0, 0, 0, 1]}, "open": {"rotation": quat([0, 1, 0], math.radians(105))}},
            "clips": {"open": "door_main__open", "closed": "door_main__close"},
            "hitBox": {"center": [door_w / 2, door_h / 2, 0], "size": [door_w, door_h, .2]}})
    for state, angles in [("open", (0, 105)), ("close", (105, 0))]:
        g.clip("door_main__" + state, [(hinge, "rotation", [0, .65], [quat([0, 1, 0], math.radians(a)) for a in angles])])
    g.node("entry_spawn", parent=0, translation=[door_x, base + 1.62, front - 1.1], extras={"kind": "entry_point"})
    g.node("entry_focus", parent=0, translation=[door_x, base + 1.35, -front + .45], extras={"kind": "look_point"})

    # One balcony on each upper storey; props are separate animated nodes.
    deck_width, near, far = 3.00, front + .12, front + 1.85
    balcony_x = spacing
    for floor in range(1, floors):
        yy = base + floor * floor_h + .09
        balcony.box((balcony_x, yy, (near + far) / 2), (deck_width, .18, far - near + .2), "limestone")
        for rail_y in (yy + .45, yy + 1.08):
            balcony.box((balcony_x, rail_y, far), (deck_width + .1, .07, .075), "iron")
            for side in (-1, 1):
                balcony.box((balcony_x + side * deck_width / 2, rail_y, (near + far) / 2), (.075, .07, far - near), "iron")
        for j in range(7):
            balcony.box((balcony_x - deck_width / 2 + j * deck_width / 6, yy + .64, far), (.045, .96, .045), "iron")
        for side in (-1, 1):
            xx = balcony_x + side * (deck_width / 2 - .18)
            balcony.beam((xx, yy - .7, near), (xx, yy - .1, far - .2), .11, "walnut")
    # Two bins, two differently sized crates and a barrel, all on balconies.
    for i, kind in enumerate(("bin_green", "bin_ash", "crate", "barrel", "crate_small")):
        floor = 1 if floors == 2 else (1 if i < 2 else floors - 1)
        xx = balcony_x + (i - 1.5) * .70 if floors == 2 else balcony_x + (-.63 if i % 2 == 0 else .63)
        zz = front + 1.12
        if kind == "crate_small":
            xx = balcony_x + (.35 if floors == 2 else -.63)
            zz = front + .35
        add_target(g, kind, [xx, base + floor * floor_h + .185, zz], i)

    # Hipped clay roof, eaves, ridge and hollow masonry chimney.
    roof, rise = Mesh(), spec["roof_rise"]
    rw, rz, ridge = w / 2 + .48, front + .46, w * .26
    a, b, c, e = (-rw, top + .10, rz), (rw, top + .10, rz), (rw, top + .10, -rz), (-rw, top + .10, -rz)
    left, right = (-ridge, top + rise, 0), (ridge, top + rise, 0)
    roof.face([a, b, right, left], "terracotta")
    roof.face([b, c, right], "terracotta")
    roof.face([c, e, left, right], "terracotta")
    roof.face([e, a, left], "terracotta")
    roof.box((0, top - .015, 0), (rw * 2, .20, rz * 2), "walnut")
    roof.cylinder((0, top + rise + .035, 0), .12, ridge * 2 + .15, "terracotta", sides=8, axis="x")
    for zz in (-rz, rz):
        roof.cylinder((0, top + .06, zz), .08, rw * 2, "terracotta", sides=8, axis="x")
    chimney_x, chimney_z = -w * .28, -.55
    chimney_top = top + rise + 1.15
    for dx in (-.32, .32):
        roof.box((chimney_x + dx, (top + chimney_top) / 2, chimney_z), (.16, chimney_top - top, .74), "brick")
    for dz in (-.29, .29):
        roof.box((chimney_x, (top + chimney_top) / 2, chimney_z + dz), (.48, chimney_top - top, .16), "brick")
    for dx in (-.37, .37):
        roof.box((chimney_x + dx, chimney_top, chimney_z), (.22, .18, .96), "limestone")
    for dz in (-.37, .37):
        roof.box((chimney_x, chimney_top, chimney_z + dz), (.54, .18, .22), "limestone")
    roof.box((chimney_x, chimney_top - .4, chimney_z), (.48, .03, .40), "recess")
    g.node("building_shell", parent=0, mesh=g.mesh("building_shell_mesh", shell), extras={"kind": "architecture"})
    g.node("balconies", parent=0, mesh=g.mesh("balconies_mesh", balcony), extras={"kind": "architecture"})
    g.node("roof_chimney", parent=0, mesh=g.mesh("roof_chimney_mesh", roof), extras={"kind": "architecture"})
    for i, pos in enumerate([[-w * .27, top + rise * .52 + .12, rz * .5],
                             [w * .25, top + rise * .64 + .12, rz * .36],
                             [chimney_x, chimney_top + .10, chimney_z]]):
        add_roof_fire(g, i + 1, pos)
    return g.finish()


def main():
    atlas = make_atlas()
    models = [make_building(spec, atlas) for spec in SPECS]
    manifest = {"format": "fire-building-v1", "license": "CC0-1.0", "units": "metres", "up": "+Y", "front": "+Z",
                "triangleBudgetPerModel": 8000, "budgetIncludes": "all mesh nodes, alternative states, balconies, props and flame meshes",
                "atlas": {"path": "warm-atlas-1024.png", "size": [1024, 1024], "embeddedInEachGLB": True,
                          "sha256": hashlib.sha256(atlas).hexdigest()}, "models": models}
    dump(OUT / "manifest.json", manifest)
    for model in models:
        print(f"{model['id']}: {model['trianglesDefault']} default / {model['trianglesAllStates']} stored triangles; {model['bytes']} bytes")


if __name__ == "__main__":
    main()
