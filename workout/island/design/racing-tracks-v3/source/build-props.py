"""Build the original, metre-scale roadside assets as core glTF 2.0 meshes."""

from collections import defaultdict
from pathlib import Path
import json
import math
import struct


ROOT = Path(__file__).resolve().parents[1] / "assets" / "props"


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def subtract(a, b):
    return tuple(x - y for x, y in zip(a, b))


def unit(v):
    size = math.hypot(*v)
    return tuple(x / size for x in v)


def linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


class Prop:
    def __init__(self):
        self.faces = defaultdict(list)

    def face(self, pigment, *vertices, glow=0):
        for i in range(1, len(vertices) - 1):
            a, b, c = vertices[0], vertices[i], vertices[i + 1]
            normal = unit(cross(subtract(b, a), subtract(c, a)))
            self.faces[pigment, glow].extend((point, normal) for point in (a, b, c))

    def box(self, pigment, x, y, z, w, h, d, glow=0):
        x0, x1 = x - w / 2, x + w / 2
        z0, z1 = z - d / 2, z + d / 2
        y1 = y + h
        a, b, c, e = (x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)
        f, g, j, k = (x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)
        for face in [(a, b, c, e), (f, k, j, g), (a, f, g, b), (b, g, j, c), (c, j, k, e), (e, k, f, a)]:
            self.face(pigment, *face, glow=glow)

    def tube(self, pigment, a, b, r0, r1=None, sides=9, glow=0):
        r1 = r0 if r1 is None else r1
        axis = unit(subtract(b, a))
        guide = (0, 1, 0) if abs(axis[1]) < 0.9 else (1, 0, 0)
        u = unit(cross(guide, axis))
        v = cross(axis, u)

        def ring(origin, radius):
            return [tuple(p + radius * (math.cos(angle) * i + math.sin(angle) * j)
                          for p, i, j in zip(origin, u, v))
                    for angle in (math.tau * i / sides for i in range(sides))]

        low, high = ring(a, r0), ring(b, r1)
        self.face(pigment, *reversed(low), glow=glow)
        if r1:
            self.face(pigment, *high, glow=glow)
        for i in range(sides):
            j = (i + 1) % sides
            if r1:
                self.face(pigment, low[i], low[j], high[j], high[i], glow=glow)
            else:
                self.face(pigment, low[i], low[j], b, glow=glow)

    def roof(self, pigment, x, y, z, w, h, d):
        x0, x1 = x - w / 2, x + w / 2
        z0, z1 = z - d / 2, z + d / 2
        a, b, c = (x0, y, z0), (x1, y, z0), (x, y + h, z0)
        d0, e, f = (x0, y, z1), (x1, y, z1), (x, y + h, z1)
        for face in [(a, c, b), (d0, e, f), (a, b, e, d0), (a, d0, f, c), (b, c, f, e)]:
            self.face(pigment, *face)

    def strata(self, colors, x, z, radius, height, tiers, sides=7):
        for i, factor in enumerate(tiers):
            taper = tiers[i + 1] if i + 1 < len(tiers) else factor * 0.76
            self.tube(colors[i % len(colors)], (x, i * height / len(tiers), z),
                      (x, (i + 1) * height / len(tiers), z), radius * factor, radius * taper, sides)

    def write(self, path):
        binary = bytearray()
        document = {
            "asset": {"version": "2.0", "generator": "Bakasun racing tracks v3"},
            "scene": 0, "scenes": [{"nodes": [0]}],
            "nodes": [{"name": path.stem, "mesh": 0}],
            "meshes": [{"primitives": []}], "materials": [],
            "accessors": [], "bufferViews": [], "buffers": [],
        }
        footprint = 0
        for (pigment, glow), vertices in self.faces.items():
            rgb = [linear(int(pigment[i:i + 2], 16) / 255) for i in (0, 2, 4)]
            material = {"pbrMetallicRoughness": {"baseColorFactor": [*rgb, 1], "metallicFactor": 0, "roughnessFactor": 0.82}}
            if glow:
                material["emissiveFactor"] = [channel * glow for channel in rgb]
            material_id = len(document["materials"])
            document["materials"].append(material)
            attributes = {}
            for attribute, columns in zip(("POSITION", "NORMAL"), zip(*vertices)):
                offset = len(binary)
                for vector in columns:
                    binary.extend(struct.pack("<3f", *vector))
                view = len(document["bufferViews"])
                document["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": len(binary) - offset, "target": 34962})
                accessor = {"bufferView": view, "componentType": 5126, "count": len(columns), "type": "VEC3"}
                if attribute == "POSITION":
                    accessor["min"] = [min(col) for col in zip(*columns)]
                    accessor["max"] = [max(col) for col in zip(*columns)]
                    footprint = max(footprint, *(math.hypot(x, z) for x, _, z in columns))
                attributes[attribute] = len(document["accessors"])
                document["accessors"].append(accessor)
            document["meshes"][0]["primitives"].append({"attributes": attributes, "material": material_id})
        document["extras"] = {"footprintRadiusM": math.ceil(100 * footprint) / 100}
        document["buffers"].append({"byteLength": len(binary)})
        header = json.dumps(document, separators=(",", ":")).encode()
        header += b" " * (-len(header) % 4)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(struct.pack("<4sII", b"glTF", 2, 28 + len(header) + len(binary))
                         + struct.pack("<I4s", len(header), b"JSON") + header
                         + struct.pack("<I4s", len(binary), b"BIN\0") + binary)


def building(p, walls, trim, width=6, depth=5, height=3):
    p.box(walls, 0, 0, 0, width, height, depth)
    p.box(trim, 0, 0, 0, width + 0.22, 0.22, depth + 0.22)


def shelter(p, posts, roof, width=5, depth=3, height=3):
    for x in (-width / 2 + 0.2, width / 2 - 0.2):
        for z in (-depth / 2 + 0.18, depth / 2 - 0.18):
            p.box(posts, x, 0, z, 0.22, height, 0.22)
    p.roof(roof, 0, height, 0, width + 0.55, 0.85, depth + 0.48)


def fence(p, posts, rails, width=12, barrier_height=1.12):
    for i in range(5):
        p.box(posts, (i / 4 - 0.5) * width, 0, 0, 0.18, barrier_height, 0.2)
    for y in (barrier_height * 0.28, barrier_height * 0.67):
        p.box(rails, 0, y, 0, width + 0.22, 0.16, 0.115)


def mast(p, frame, cap, height=7):
    p.tube(frame, (0, 0, 0), (0, height, 0), 0.24, 0.095, 8)
    p.box(frame, 0, height - 0.25, 0, 2.5, 0.15, 0.2)
    for x in (-1, 1):
        p.box(cap, x, height - 0.45, 0.04, 0.52, 0.23, 0.39, glow=0.72)


def pine(p, x, z, height, wood, greens, snow=False):
    p.tube(wood, (x, 0, z), (x, height * 0.92, z), height * 0.037, height * 0.012, 7)
    for i, green in enumerate(greens):
        y = height * (0.24 + 0.18 * i)
        r = height * (0.28 - 0.055 * i)
        p.tube(green, (x, y, z), (x, y + height * 0.43, z), r, 0, 8)
        if snow:
            p.tube("e5f3f8", (x, y + height * 0.07, z), (x, y + height * 0.45, z), r * 0.86, 0, 8)


def palms(p, stems):
    for x, z, height, lean in stems:
        top = (x + lean, height, z + 0.25)
        p.tube("a88456", (x, 0, z), (x + lean * 0.35, height * 0.56, z), 0.30, 0.22, 7)
        p.tube("c3a475", (x + lean * 0.35, height * 0.56, z), top, 0.22, 0.12, 7)
        for leaf in range(7):
            angle = math.tau * leaf / 7
            dx, dz = math.cos(angle), math.sin(angle)
            mid = (top[0] + dx * 1.15, height + 0.47, top[2] + dz * 1.15)
            edge_a = (mid[0] - dz * 0.49, height + 0.12, mid[2] + dx * 0.49)
            edge_b = (mid[0] + dz * 0.49, height + 0.12, mid[2] - dx * 0.49)
            tip = (top[0] + dx * 2.62, height - 0.46, top[2] + dz * 2.62)
            p.face("39835c", top, edge_a, mid)
            p.face("63a966", top, mid, edge_b)
            p.face("39835c", mid, edge_a, tip)
            p.face("63a966", mid, tip, edge_b)
            p.face("2e6449", tip, edge_a, top, edge_b)


def city():
    p = Prop()
    for x, w, h, tint in ((-4, 6.8, 20, "243651"), (2.7, 6.5, 28, "302c52"), (8, 4.3, 15, "2d3f58")):
        p.box(tint, x, 0, 0, w, h, 5.1)
        p.box("171e36", x, h, 0, w + 0.42, 0.53, 5.55)
        for floor in range(2, 1 + int(h / 2)):
            for z in (-2.56, 2.56):
                y = 1.75 * floor
                for i in (-1, 0, 1):
                    tone = ("71e4f3", "bf90f6", "ffc37b")[(i - floor) % 3]
                    if (i + floor) % 5:
                        p.box(tone, x + w * i / 3.9, y, z, w * 0.15, 0.72, 0.045, glow=0.79)
            for side in (-1, 1):
                p.box("69c5df", x + side * w / 2, 1.75 * floor, 0, 0.055, 0.56, 2.4, glow=0.68)
    yield "glass-towers", p

    p = Prop()
    mast(p, "4f6580", "9ef4ff", 9.1)
    yield "streetlight", p

    p = Prop()
    shelter(p, "465967", "273045", 6.4, 2.65, 2.9)
    p.box("385269", 0, 0.73, 0.85, 6.15, 1.89, 0.12)
    p.box("e893fb", -2.0, 1.07, -0.96, 0.86, 1.33, 0.11, glow=0.82)
    p.box("79868d", 0.55, 0.54, 0.38, 2.25, 0.14, 0.38)
    yield "transit-shelter", p

    p = Prop()
    building(p, "566488", "32384b", 9, 7, 4.5)
    p.box("253448", 0, 4.5, 0, 9.45, 0.55, 7.32)
    for x in (-2.75, 0, 2.75):
        p.box("2b3449", x, 0.12, 3.53, 2.1, 2.65, 0.09)
        p.box("7ad1e6", x, 2.95, 3.57, 1.72, 0.1, 0.08, glow=0.74)
    yield "service-block", p

    p = Prop()
    for x in (-1.65, 1.65):
        for z in (-1.5, 1.5):
            p.tube("546583", (x, 0, z), (x * 0.77, 6.4, z * 0.77), 0.16, sides=7)
    p.tube("6f7790", (0, 5.8, 0), (0, 7.8, 0), 2, 2.34)
    p.tube("3b4564", (0, 7.8, 0), (0, 8.7, 0), 2.34, 0.25)
    yield "water-tower", p

    p = Prop()
    for x in (-2.65, 2.65):
        p.box("53647e", x, 0, 0, 0.22, 4.5, 0.25)
    p.box("26334b", 0, 3.8, 0, 5.8, 0.78, 0.45)
    for x in (-1.38, -0.46, 0.46, 1.38):
        p.box("e98cf4", x, 3.99, 0.25, 0.49, 0.33, 0.065, glow=0.8)
    yield "signal-frame", p

    p = Prop()
    p.box("303953", 0, 0, 0, 4.2, 0.23, 4.5)
    p.box("31506b", 0, 0.23, -1.71, 4.2, 3.34, 0.32)
    for x in (-1.89, 1.89):
        p.box("587c8d", x, 0.2, 0, 0.23, 2.75, 4.19)
    p.box("80ebf3", 0, 2.88, 1.9, 4.19, 0.21, 0.27, glow=0.86)
    yield "metro-entrance", p

    p = Prop()
    p.box("393b5b", 0, 0, 0, 2.3, 0.28, 1.28)
    p.box("695180", 0, 0.28, 0, 1.92, 4.4, 0.68)
    for y in (1.26, 2.16, 3.06, 3.96):
        p.box("d783ee", 0, y, 0, 1.98, 0.16, 0.71, glow=0.83)
    yield "neon-pylon", p


def desert():
    sand = ("a8583c", "d69152", "bf7046", "864a3c")
    p = Prop()
    for x in (-2.8, 2.8):
        p.strata(sand, x, 0, 1.64, 5.4, (1.20, 1.08, 0.83, 1.02), 8)
    p.tube("bd704a", (-3, 5.37, 0), (3, 5.56, 0), 1.08, 1.11, 8)
    p.tube("d98f54", (-2.1, 5.88, 0.02), (2.47, 6.05, 0), 0.79, 0.85, 7)
    yield "sandstone-arch", p

    p = Prop()
    p.tube("628255", (0, 0, 0), (0.12, 4.52, 0), 0.39, 0.24, 9)
    for x, y in ((-1, 1.95), (1.12, 2.55)):
        p.tube("75946a", (0, y, 0), (x, y + 0.38, 0), 0.21, 0.17, 7)
        p.tube("75946a", (x, y + 0.38, 0), (x * 1.05, y + 1.31, 0), 0.19, 0.13, 7)
    yield "saguaro", p

    p = Prop()
    shelter(p, "735346", "e2b484", 6.1, 4, 2.85)
    p.box("ab7450", 0, 0, 1.15, 3, 0.86, 0.78)
    yield "shade-station", p

    p = Prop()
    p.strata(sand, 0, 0, 3.35, 6.1, (1.2, 1.05, 1.07, 0.76, 0.64), 8)
    p.strata(sand[1:], 3.6, 1.3, 1.75, 2.8, (1, 0.79, 0.82), 7)
    yield "mesa-stack", p

    p = Prop()
    mast(p, "796b65", "f1bb69", 4.25)
    p.box("c09c6e", 0, 0, 0, 0.9, 0.68, 0.75)
    yield "survey-mast", p

    p = Prop()
    for i in range(12):
        angle = i * 2.39996
        height = 0.45 + (i % 5) * 0.17
        x, z = 0.67 * math.cos(angle), 0.58 * math.sin(angle)
        p.tube(("b29f5e", "c1ab73", "ae8857")[i % 3], (x * 0.3, 0, z * 0.3),
               (x, height, z), 0.035, 0, 4)
    yield "dune-grass", p

    p = Prop()
    fence(p, "6f4d38", "a9825d")
    yield "sand-fence", p

    p = Prop()
    p.tube("aa8665", (0, 0, 0), (0, 1.98, 0), 1.7, sides=12)
    p.tube("e2b887", (0, 1.98, 0), (0, 2.38, 0), 1.77, 0.55, 12)
    p.tube("826d56", (1.2, 0.22, 0), (2.24, 0.22, 0), 0.25)
    yield "cistern", p


def coast():
    p = Prop()
    p.tube("e6dfc9", (0, 0, 0), (0, 2, 0), 2.19, 1.94, 12)
    for i in range(4):
        p.tube(("cd5947", "f4edda")[i % 2], (0, 2 + i * 2.5, 0), (0, 4.5 + i * 2.5, 0),
               1.94 - 0.14 * i, 1.8 - 0.14 * i, 12)
    p.tube("293946", (0, 12, 0), (0, 12.42, 0), 2.0, 1.9, 12)
    p.tube("f2cd80", (0, 12.42, 0), (0, 13.66, 0), 1.17, sides=12, glow=0.76)
    p.tube("a64438", (0, 13.66, 0), (0, 14.79, 0), 1.66, 0.31, 12)
    yield "lighthouse", p

    p = Prop()
    palms(p, [(-1.7, 0, 7.75, -0.45), (0.8, -1.1, 6.82, 0.88), (1.75, 0.85, 5.36, 0.71)])
    yield "palm-cluster", p

    p = Prop()
    for x in (-1.7, 1.7):
        for z in (-1.2, 1.2):
            p.box("786c52", x, 0, z, 0.25, 1.45, 0.25)
    p.box("e5a751", 0, 1.42, 0, 4.01, 2.2, 3.03)
    p.roof("c95948", 0, 3.62, 0, 4.51, 0.86, 3.34)
    p.box("4b737b", 0, 2.25, 1.53, 1.4, 0.91, 0.09)
    yield "lifeguard-hut", p

    p = Prop()
    p.roof("4a8b9e", 0, 0.0, 0, 2.3, 0.47, 5.5)
    p.box("e7dec8", 0, 0.28, -0.18, 1.94, 0.26, 4.65)
    p.tube("7e898d", (0, 0.4, 0), (0, 6.1, 0), 0.07, sides=6)
    for x in (-0.045, 0.045):
        p.face("f3ebd8", (x, 1.0, -2.9), (x, 0.92, 0.05), (x, 5.9, 0.05))
        p.face("f3ebd8", (x, 5.9, 0.05), (x, 0.92, 0.05), (x, 1.0, -2.9))
    yield "sailboat", p

    p = Prop()
    p.tube("dfd7c7", (0, 0, 0), (0, 2.55, 0), 0.062, sides=6)
    for i in range(10):
        a, b = math.tau * i / 10, math.tau * (i + 1) / 10
        p.face(("f5e7c7", "de775c")[i % 2], (0, 2.65, 0),
               (1.4 * math.cos(b), 2.13, 1.4 * math.sin(b)), (1.4 * math.cos(a), 2.13, 1.4 * math.sin(a)))
    p.box("d0af83", 0.64, 0.34, 0, 0.66, 0.12, 1.31)
    yield "beach-umbrella", p

    p = Prop()
    for z in (-4.3, -1.4, 1.4, 4.3):
        for x in (-1.3, 1.3):
            p.tube("725a45", (x, 0, z), (x, 2.45, z), 0.21, sides=7)
    p.box("b09269", 0, 1.43, 0, 3.2, 0.18, 9.1)
    for x in (-1.38, 1.38):
        p.box("a88f6e", x, 2.32, 0, 0.12, 0.12, 8.97)
    yield "fishing-pier", p

    p = Prop()
    fence(p, "8d734e", "bca87d", 10.5)
    yield "dune-fence", p

    p = Prop()
    for x, color in ((-0.95, "f0bd48"), (0.84, "d9604d")):
        p.tube(color, (x, 0, 0), (x, 0.75, 0), 0.43, 0.32, 10)
        p.tube("fcf4d8", (x, 0.75, 0), (x, 1.27, 0), 0.32, 0.11, 10)
    yield "buoy-pair", p


def mountain():
    p = Prop()
    building(p, "856346", "6e726b", 7.4, 6.3, 3.15)
    p.roof("877b6d", 0, 3.15, 0, 8.05, 2.2, 6.79)
    p.box("677574", 2.49, 4.06, -1.48, 0.61, 1.63, 0.63)
    p.box("e8ad64", 0, 2, 3.16, 1.32, 0.68, 0.065, glow=0.36)
    yield "alpine-chalet", p

    p = Prop()
    p.strata(("5e6d74", "7d8d8d", "95a6a6"), 0, 0, 2.64, 7.1, (1.18, 0.87, 0.67, 0.41), 7)
    p.strata(("667472", "8a9790"), -2.1, 1.65, 1.22, 2.62, (1, 0.61), 6)
    yield "granite-needle", p

    p = Prop()
    for a, b in [((-2, 0, 0), (-0.29, 8.5, 0)), ((2, 0, 0), (0.29, 8.5, 0)), ((-1.33, 3.35, 0), (0.67, 6.75, 0)),
                 ((1.33, 3.35, 0), (-0.67, 6.75, 0))]:
        p.tube("647578", a, b, 0.15, sides=6)
    p.box("3f545e", 0, 8.45, 0, 6.3, 0.25, 0.45)
    for x in (-2.4, 2.4):
        p.tube("aa815e", (x, 8.7, -0.26), (x, 8.7, 0.29), 0.32, sides=10)
    yield "cable-tower", p

    p = Prop()
    fence(p, "566367", "8d9491", 12.8, 2)
    p.box("a37c60", 0, 1.5, 0.033, 12.94, 0.17, 0.053)
    yield "avalanche-fence", p

    p = Prop()
    for x, z, height in [(-1.95, 0.6, 4), (0.25, -0.4, 5.8), (1.85, 0.67, 3.4)]:
        pine(p, x, z, height, "6c5e4a", ("45634f", "5c7961", "719076"))
    yield "juniper-cluster", p

    p = Prop()
    p.box("986f50", 0, 0.61, 0, 6.18, 0.22, 4.15)
    for x in (-2.83, 2.83):
        for z in (-1.88, 1.88):
            p.box("796451", x, 0, z, 0.18, 1.76, 0.18)
        p.box("aa8a6d", x, 1.65, 0, 0.19, 0.13, 3.89)
    p.box("aa8a6d", 0, 1.65, 1.88, 5.77, 0.13, 0.15)
    yield "lookout-deck", p

    p = Prop()
    p.strata(("6c756d", "9b9b86", "83897c"), 0, 0, 0.89, 1.91, (1, 0.8, 0.74, 0.41, 0.27))
    yield "cairn", p

    p = Prop()
    building(p, "819294", "52646b", 4.1, 3.15, 2.3)
    p.box("667478", 0, 2.3, 0, 4.47, 0.31, 3.38)
    p.box("38474c", 0, 0.22, 1.59, 1.16, 1.5, 0.06)
    yield "spillway-box", p


def forest():
    p = Prop()
    for x, z, height in [(-3.33, 0.88, 10.5), (0, -1.32, 15), (3.4, 0.61, 11.3)]:
        pine(p, x, z, height, "765244", ("274c42", "38664e", "4b7a5f"))
    yield "cedar-grove", p

    p = Prop()
    for x, z, height in [(-0.8, 0.56, 3.45), (1.08, -0.26, 4.27)]:
        pine(p, x, z, height, "694c3a", ("3e5e42", "59774a", "648754"))
    yield "saplings", p

    p = Prop()
    shelter(p, "6a4934", "527365", 5.6, 4, 3.28)
    p.box("a57e53", 0, 0.53, 0.93, 3.58, 0.16, 0.85)
    yield "trail-shelter", p

    p = Prop()
    for x in (-1.5, 1.5):
        for z in (-1.5, 1.5):
            p.box("74543d", x, 0, z, 0.16, 6.7, 0.17)
    p.box("a08059", 0, 5.77, 0, 3.4, 1.48, 3.45)
    p.roof("47685b", 0, 7.25, 0, 3.7, 0.99, 3.77)
    p.box("344c46", 0, 6.37, 1.74, 1.84, 0.62, 0.06)
    yield "ranger-tower", p

    p = Prop()
    p.strata(("536766", "75807b", "6b8654"), 0, 0, 1.84, 2.45, (1, 1.12, 0.73, 0.3), 8)
    p.strata(("657374", "63844f"), 1.98, 0.84, 0.84, 1.08, (1, 0.58), 6)
    yield "moss-boulder", p

    p = Prop()
    for x, y in ((-0.84, 0.44), (0.0, 0.44), (0.84, 0.44), (-0.42, 1.16), (0.42, 1.16)):
        p.tube("75503b", (x, y, -1.84), (x, y, 1.84), 0.43, sides=10)
        p.tube("c09867", (x, y, 1.84), (x, y, 1.88), 0.33, sides=10)
        p.tube("a57a55", (x, y, 1.88), (x, y, 1.92), 0.17, sides=10)
    yield "log-stack", p

    p = Prop()
    for x in (-0.68, 0.68):
        p.box("745e44", x, 0, 0, 0.13, 2.55, 0.13)
    p.box("876947", 0, 1.32, 0.06, 1.79, 1.13, 0.19)
    p.box("586b53", 0, 1.43, 0.17, 1.55, 0.89, 0.05)
    p.roof("5b6552", 0, 2.5, 0, 2.0, 0.23, 0.55)
    yield "trail-board", p

    p = Prop()
    for i in range(8):
        a = math.tau * i / 8
        dx, dz = math.cos(a), math.sin(a)
        p.tube("638345", (0, 0, 0), (dx * 0.73, 0.59, dz * 0.73), 0.022, 0.01, 5)
        for fraction in (0.35, 0.56, 0.77, 0.95):
            x, y, z = dx * fraction * 0.73, 0.59 * fraction, dz * fraction * 0.73
            for side in (-1, 1):
                p.tube("6a9a54", (x, y, z), (x + dx * 0.16 - dz * side * 0.18, y + 0.10, z + dz * 0.16 + dx * side * 0.18),
                       0.047, 0, 4)
    yield "fern-clump", p


def snow():
    p = Prop()
    for x, z, height, radius in [(-2.85, 0, 7.35, 1.67), (0, -0.7, 9.5, 1.96), (2.45, 0.6, 5.78, 1.55)]:
        p.tube("75b6cc", (x, 0, z), (x + 0.47, height * 0.65, z - 0.12), radius, radius * 0.65, 5)
        p.tube("b0dbe8", (x + 0.47, height * 0.65, z - 0.12), (x + 0.83, height, z - 0.15), radius * 0.65, 0, 5)
    yield "ice-spires", p

    p = Prop()
    for x, z, height in [(-1.08, 0.5, 6.1), (1.42, -0.3, 8.24)]:
        pine(p, x, z, height, "75695d", ("446c68", "3e6e63", "58877a"), snow=True)
    yield "snow-spruce", p

    p = Prop()
    building(p, "b96b50", "69767b", 5.5, 4.36, 2.66)
    p.roof("e3eef0", 0, 2.66, 0, 6.1, 1.55, 4.84)
    p.box("ffd48d", 0, 1.34, 2.2, 1.8, 0.84, 0.07, glow=0.44)
    yield "ski-patrol-hut", p

    p = Prop()
    fence(p, "94674d", "d98450", 12.3, 1.48)
    yield "snow-fence", p

    p = Prop()
    building(p, "849cac", "758093", 7.5, 6.1, 3.42)
    p.roof("dce9ed", 0, 3.42, 0, 8.28, 1.25, 6.63)
    p.box("5f7182", 0, 0.23, 3.06, 4.31, 2.66, 0.1)
    for x in (-2.61, 2.61):
        p.box("e79557", x, 0, 3.52, 0.19, 1.27, 0.19)
    yield "plow-depot", p

    p = Prop()
    mast(p, "899caa", "f0a676", 6.2)
    for x in (-1.16, 1.16):
        p.tube("e4ebeb", (x, 6.2, 0), (x, 6.54, 0), 0.19, sides=7)
    p.box("abb5b9", 0, 0, 0, 1.16, 0.68, 0.92)
    yield "weather-mast", p

    p = Prop()
    p.box("52697d", 0, 0, 0, 1.44, 0.22, 1.01)
    p.tube("778591", (0, 0.2, 0), (0, 1.41, 0), 0.19, sides=8)
    p.tube("e0a755", (0, 1.28, -0.48), (0, 1.89, 0.56), 0.41, 0.51, 12)
    p.tube("526d81", (0, 1.89, 0.56), (0, 1.95, 0.66), 0.47, 0.46, 12)
    yield "snow-cannon", p

    p = Prop()
    for x in (-0.92, 0.92):
        p.box("6f7677", x, 0, 0, 0.12, 2.3, 0.12)
        p.box("ffe0aa", x, 2.04, 0, 0.29, 0.31, 0.28, glow=0.8)
        p.roof("b5cbd4", x, 2.35, 0, 0.42, 0.23, 0.43)
    yield "trail-lanterns", p


if __name__ == "__main__":
    for name, build in (("neon-quay", city), ("red-mesa", desert), ("saltwater-bay", coast),
                        ("cloud-pass", mountain), ("cedar-bend", forest), ("frostline", snow)):
        for asset, model in build():
            model.write(ROOT / name / f"{asset}.glb")
