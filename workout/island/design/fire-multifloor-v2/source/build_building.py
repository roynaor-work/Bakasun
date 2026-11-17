#!/usr/bin/env python3
"""Build Fire Multifloor v2. Pure Python, deterministic glTF 2.0/GLB.

Furniture shapes and geometry helpers adapted from Fire Rooms v1 (CC0),
commit 37305d4d816d9dc3dcd2e31c2410a169c02490ca. New architecture,
stairs, damage geometry and state composition are original CC0.
Run: python3 source/build_building.py
Coordinates are metres, Y up, front +Z. No external assets required.
"""
import hashlib
import itertools
import json
import math
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"
MODELS.mkdir(exist_ok=True)
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
        if min(size) < 0.095:
            bevel = 0
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



class FurnitureCapture:
    def __init__(self, *args):
        self.items=[]
    def shell(self, **kwargs):
        pass
    def burn(self, name, title, at, fire, geometry, category):
        self.items.append((name,title,at,fire,geometry,category))
Room = FurnitureCapture

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



def translated(g, offset, rotation=0):
    out=Geometry()
    co,si=math.cos(rotation),math.sin(rotation)
    for points,color in g.faces:
        out.face([(offset[0]+p[0]*co+p[2]*si, offset[1]+p[1], offset[2]-p[0]*si+p[2]*co) for p in points],color)
    return out


def damage(g,category):
    """Collapsing wood, sagged fabric and slumped electrical cases; no palette-only swap."""
    out=Geometry()
    factor=0.66 if category in ('fabric','upholstery') else 0.79 if 'electrical' in category else 0.73
    for i,(points,color) in enumerate(g.faces):
        changed=[]
        for x,y,z in points:
            changed.append((x*(0.98+0.035*math.sin(y*9+z*3)), y*factor+0.018*math.sin(x*7+z*5),
                            z+0.035*math.sin(y*6+x*4)*min(1,max(0,y))))
        out.face(changed,('soot','ash','soot','char','soot','pale_ash')[i%6])
    # Fallen charcoal fragments are closed small pieces around the damaged object.
    if category not in ('cooking_oil',):
        for i in range(3):
            a=i*2.3
            out.box((math.cos(a)*0.34,0.025,math.sin(a)*0.28),(0.15,0.05,0.08),'soot',rotation=a)
    return out


class GLB:
    def __init__(self,name):
        self.name=name
        self.nodes=[];self.meshes=[];self.views=[];self.accessors=[];self.binary=bytearray()
        self.root=self.node(name,extras={'units':'metres','up':'+Y','front':'+Z','license':'CC0-1.0'})
        self.items=[];self.rooms=[]
        self.triangles=0;self.visible=0
    def node(self,name,parent=None,**kw):
        i=len(self.nodes);self.nodes.append({'name':name,**kw})
        if parent is not None:self.nodes[parent].setdefault('children',[]).append(i)
        return i
    def accessor(self,values,n,component=5126,target=34962,normalized=False):
        while len(self.binary)%4:self.binary.append(0)
        offset=len(self.binary)
        code,size={5126:('f',4),5123:('H',2),5121:('B',1)}[component]
        self.binary.extend(struct.pack('<'+code*len(values),*values))
        view=len(self.views);self.views.append({'buffer':0,'byteOffset':offset,'byteLength':len(values)*size,'target':target})
        a={'bufferView':view,'componentType':component,'count':len(values)//n,'type':{1:'SCALAR',3:'VEC3',4:'VEC4'}[n]}
        if normalized:a['normalized']=True
        if component==5126:
            a['min']=[min(values[i::n]) for i in range(n)];a['max']=[max(values[i::n]) for i in range(n)]
        self.accessors.append(a);return len(self.accessors)-1
    def mesh(self,name,g,material=0):
        pos=[];norm=[];colors=[];indices=[];cache={}
        for points,color in g.faces:
            normal=cross(sub(points[1],points[0]),sub(points[2],points[0]));length=math.sqrt(dot(normal,normal))
            if length<1e-9:continue
            normal=tuple(round(v/length,7) for v in normal)
            rgb=bytes.fromhex(PALETTE[COLOR[color]][1])
            # Vertex colors are linear. A single material batches all static surfaces.
            rgb=tuple(round((v/255/12.92 if v/255<=0.04045 else ((v/255+.055)/1.055)**2.4)*255) for v in rgb)+(255,)
            ids=[]
            for p in points:
                key=tuple(round(x,6) for x in p)+normal+rgb
                if key not in cache:
                    cache[key]=len(pos)//3;pos.extend(p);norm.extend(normal);colors.extend(rgb)
                ids.append(cache[key])
            for j in range(1,len(ids)-1):indices.extend((ids[0],ids[j],ids[j+1]))
        if len(pos)//3>65535:raise ValueError('Primitive vertex limit')
        mi=len(self.meshes)
        self.meshes.append({'name':name,'primitives':[{'attributes':{'POSITION':self.accessor(pos,3),
            'NORMAL':self.accessor(norm,3),'COLOR_0':self.accessor(colors,4,5121,normalized=True)},
            'indices':self.accessor(indices,1,5123,34963),'material':material}]})
        self.triangles+=len(indices)//3
        return mi
    def fixed(self,name,g,parent=None,**kw):
        self.node(name,self.root if parent is None else parent,mesh=self.mesh(name,g),**kw)
        self.visible+=g.triangles
    def burn(self,room,name,title,at,fire,g,category):
        ident=f'f{self.floor}_{room}_{name}'
        parent=self.node('burn_'+ident,self.current_room,translation=at,extras={'label':title,'category':category,
            'intactNode':'intact_'+ident,'burntNode':'burnt_'+ident,'fireNode':'fire_'+ident,'defaultState':'intact'})
        self.node('intact_'+ident,parent,mesh=self.mesh('intact_'+ident,g),extras={'state':'intact'})
        self.node('burnt_'+ident,parent,mesh=self.mesh('burnt_'+ident,damage(g,category)),scale=[0,0,0],extras={'state':'burnt','restScale':[1,1,1]})
        self.node('fire_'+ident,parent,translation=fire,extras={'role':'fire_origin','room':room,'floor':self.floor})
        self.visible+=g.triangles
        roomcenter=self.center
        self.items.append({'id':ident,'room':f'f{self.floor}_{room}','label':title,'category':category,
            'parent':'burn_'+ident,'intact':'intact_'+ident,'burnt':'burnt_'+ident,'fire':'fire_'+ident,
            'fireLocal':fire,'fireWorld':[round(at[0]+fire[0]+roomcenter,4),round(at[1]+fire[1]+(self.floor-1)*3.2,4),round(at[2]+fire[2]-1.5,4)],
            'trianglesPerState':g.triangles})
    def save(self):
        doc={'asset':{'version':'2.0','generator':'Bakasun Fire Multifloor v2 deterministic GLB writer','copyright':'CC0-1.0; furniture adapted from fire-rooms-v1'},
            'scene':0,'scenes':[{'name':self.name,'nodes':[self.root]}],'nodes':self.nodes,'meshes':self.meshes,
            'buffers':[{'byteLength':len(self.binary)}],'bufferViews':self.views,'accessors':self.accessors,
            'materials':[{'name':'warm_architectural_vertex_palette','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':0.86}}]}
        j=json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode();j+=b' '*(-len(j)%4)
        b=bytes(self.binary)+b'\0'*(-len(self.binary)%4)
        glb=struct.pack('<4sII',b'glTF',2,28+len(j)+len(b))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(b),b'BIN\0')+b
        path=MODELS/(self.name+'.glb');path.write_bytes(glb)
        return {'id':self.name,'file':'models/'+path.name,'bytes':len(glb),'sha256':hashlib.sha256(glb).hexdigest(),
            'totalTriangles':self.triangles,'visibleTriangles':self.visible,'nodeCount':len(self.nodes),'rooms':self.rooms,'items':self.items}


def exit_sign(g,x,y,z,arrow=-1):
    g.box((x,y,z),(0.9,.34,.065),'sage_dark',.016)
    # Geometric exit pictogram: doorway, running body, head and directional arrow.
    g.box((x-.2,y,z+.043),(.035,.23,.012),'ivory')
    g.box((x-.085,y+.105,z+.043),(.23,.028,.012),'ivory')
    g.box((x+.03,y,z+.043),(.028,.23,.012),'ivory')
    g.cylinder((x-.09,y+.055,z+.064),.028,.03,'ivory',8)
    # Use front-facing head silhouette and segmented limbs.
    g.box((x-.09,y+.055,z+.051),(.055,.05,.012),'ivory',.01)
    for a,b in [((-.09,.02),(-.05,-.045)),((-.05,-.045),(-.15,-.10)),((-.05,-.045),(.045,-.10)),((-.075,.005),(-.17,-.015)),((-.075,.005),(.015,.025))]:
        g.rod((x+a[0],y+a[1],z+.055),(x+b[0],y+b[1],z+.055),.012,'ivory',4)
    ax=x+.26
    g.box((ax,y,z+.048),(.21,.025,.013),'ivory')
    g.face([(ax-.13,y,z+.058),(ax-.02,y+.07,z+.058),(ax-.02,y-.07,z+.058)],'ivory',(0,0,1))


def door_geometry():
    g=Geometry()
    # Hinge at right edge; physically opened 64 degrees into the room.
    g.box((0,1.125,0),(.99,2.25,.065),'teal',.022)
    for y,h in ((.5,.65),(1.52,.93)):
        g.box((0,y,.04),(.76,h,.025),'sage_dark',.013)
        g.box((0,y,.056),(.67,h-.09,.012),'teal_light',.008)
    g.rod((-.35,1.03,.09),(-.18,1.03,.09),.024,'gold',8)
    out=Geometry();angle=math.radians(-64)
    for points,color in g.faces:
        out.face([(.99+(p[0]-.495)*math.cos(angle)+p[2]*math.sin(angle),p[1],-(p[0]-.495)*math.sin(angle)+p[2]*math.cos(angle)) for p in points],color)
    return out


def room_architecture(floor,kind,cx):
    floor.current_room=floor.node(f'room_f{floor.floor}_{kind}',floor.root,translation=[cx,0,-1.5],extras={'type':kind,'floor':floor.floor,'bounds':[[-3.32,0,-2.42],[3.32,3.04,2.42]]})
    floor.center=cx
    g=Geometry()
    g.box((0,-.09,0),(6.64,.18,4.84),'wood_dark')
    # Real floorboard/tile geometry with narrow grout/shadow joints.
    if kind=='kitchen':
        for i in range(8):
            for j in range(6):
                g.box((-2.89+i*.825,.006,-2.025+j*.81),(.812,.012,.797),('linen','ivory','cream')[(i+j)%3])
    else:
        for i in range(12):
            for j in range(4):
                g.box((-3.03+i*.55,.008,-1.80+j*1.2),(.538,.016,1.188),('wood_light','sand','wood_light','linen')[(i+j+floor.floor)%4])
    # Back wall has an actual 2.08 x 1.42 m glazed opening.
    wall='cream' if kind=='living' else 'sage' if kind=='kitchen' else 'linen'
    g.box((0,.59,-2.36),(6.52,1.18,.16),wall)
    g.box((0,2.945,-2.36),(6.52,.21,.16),wall)
    g.box((-2.76,2.01,-2.36),(1,1.66,.16),wall)
    g.box((1.60,2.01,-2.36),(3.44,1.66,.16),wall)
    for x in (-3.26,3.26):
        g.box((x,1.52,0),(.12,3.04,4.72),wall)
        g.box((x*.978,.075,0),(.055,.15,4.6),'ivory')
    g.box((0,.075,-2.25),(6.4,.15,.055),'ivory')
    g.box((0,3.035,-2.34),(6.64,.09,.2),'ivory',.012)
    # Window behind glazing: blue sky / distant facade in geometric color layers.
    g.box((-1.27,2.02,-2.397),(2.06,1.64,.02),'sky')
    for xx in (-2.32,-1.27,-.22):g.box((xx,2.02,-2.285),(.055,1.72,.12),'ivory')
    for yy in (1.18,2.02,2.86):g.box((-1.27,yy,-2.285),(2.2,.06,.12),'ivory')
    g.box((-1.27,1.15,-2.19),(2.26,.065,.35),'ivory',.01)
    # Room doorway on front, 1.08 metres clear, with transom and panel frame.
    for xx in (1.73,2.89):g.box((xx,1.18,2.30),(.09,2.36,.17),'ivory',.012)
    g.box((2.31,2.38,2.3),(1.27,.11,.17),'ivory',.01)
    g.box((2.31,.018,2.32),(1.10,.035,.31),'metal_light')
    # Front wall is supplied separately so preview can expose the complete interior.
    floor.fixed(f'architecture_f{floor.floor}_{kind}',g,parent=floor.current_room)
    fg=Geometry()
    fg.box((-.86,1.52,2.36),(4.98,3.04,.12),wall)
    fg.box((3.13,1.52,2.36),(.38,3.04,.12),wall)
    fg.box((2.31,2.75,2.36),(1.18,.58,.12),wall)
    floor.fixed(f'cutaway_front_f{floor.floor}_{kind}',fg,parent=floor.current_room,extras={'role':'cutaway_front','previewVisible':False})
    cg=Geometry();cg.box((0,3.09,0),(6.64,.1,4.84),'ivory')
    floor.fixed(f'cutaway_ceiling_f{floor.floor}_{kind}',cg,parent=floor.current_room,extras={'role':'ceiling','previewVisible':False})
    sg=Geometry();exit_sign(sg,2.31,2.69,2.46)
    floor.fixed(f'exit_sign_f{floor.floor}_{kind}',sg,parent=floor.current_room)
    floor.burn(kind,'door','דלת',[1.85,0,2.32],[.3,1.0,-.2],door_geometry(),'wood')
    if kind!='kitchen':
        rod=Geometry();rod.rod((-2.7,2.97,-2.12),(.14,2.97,-2.12),.025,'metal',8)
        floor.fixed(f'curtain_rod_f{floor.floor}_{kind}',rod,parent=floor.current_room)
        for ident,x in [('left',-2.43),('right',-.10)]:
            c=Geometry();c.curtain(.48,1.84)
            floor.burn(kind,'curtain_'+ident,'וילון',[x,1.04,-2.10],[0,.8,.08],c,'fabric')
    # Native nodes record three smoke strata per room; effects are accumulated at runtime.
    for level,y,extent in [('low',.45,[6.2,.9,4.4]),('mid',1.45,[6.2,1.1,4.4]),('ceiling',2.64,[6.2,.75,4.4])]:
        floor.node(f'smoke_{level}_f{floor.floor}_{kind}',floor.current_room,translation=[0,y,0],extras={'role':'smoke_volume','extent':extent,'stratum':level})
    floor.node(f'door_exit_f{floor.floor}_{kind}',floor.current_room,translation=[2.31,0,2.46],extras={'width':1.08,'role':'navigation_threshold','normal':[0,0,1]})
    rescue={'living':[1.77,0,1.08],'kitchen':[2.18,0,1.32],'bedroom':[.15,0,1.55]}[kind]
    floor.node(f'rescue_f{floor.floor}_{kind}',floor.current_room,translation=rescue,extras={'role':'rescue_placement','clearRadius':.35})
    floor.rooms.append({'id':f'f{floor.floor}_{kind}','type':kind,'node':f'room_f{floor.floor}_{kind}','center':[cx,(floor.floor-1)*3.2,-1.5],
        'size':[6.64,3.04,4.84],'door':[cx+2.31,(floor.floor-1)*3.2,.96],'rescue':[cx+rescue[0],(floor.floor-1)*3.2,rescue[2]-1.5],
        'smokeNodes':[f'smoke_{level}_f{floor.floor}_{kind}' for level in ('low','mid','ceiling')]})


def floor_model(index):
    f=GLB('building-floor-'+str(index));f.floor=index
    for kind,cx,make in [('living',-6.64,living_room),('kitchen',0,kitchen),('bedroom',6.64,bedroom)]:
        room_architecture(f,kind,cx)
        for name,title,at,fire,g,category in make().items:
            f.burn(kind,name,title,at,fire,g,category)
    return f.save()


def shell_model():
    s=GLB('building-shell')
    for level in range(3):
        base=3.2*level
        parent=s.node(f'shell_floor_{level+1}',s.root,translation=[0,base,0],extras={'floor':level+1,'height':base})
        g=Geometry()
        # A continuous 2.2m corridor, joining the stair top/bottom landings.
        g.box((2,.0,2.02),(24,.18,2.2),'metal_light')
        for i in range(30):
            g.box((-9.59+i*.8,.102,2.02),(.788,.024,2.17),('linen','cream')[(i+level)%2])
        # Subtle edge bumper on corridor; no front wall obscures the cutaway.
        for x in (-9.96,9.96,13.96):
            g.box((x,1.5,2.98),(.16,3.0,.16),'sage_dark',.018)
        g.box((2.0,.11,3.13),(24.1,.22,.12),'teal')
        for x in (-9.89,-6,-2,2,6,10,13.9):
            g.rod((x,.2,3.14),(x,1.0,3.14),.026,'metal',6)
        g.rod((-9.9,1.0,3.14),(12.18 if level==0 else 13.9,1.0,3.14),.035,'metal_light',8)
        for x in (-8.1,-1.5,5.1):
            # Floor direction arrows lead to the stair on the right.
            g.box((x,.127,2.1),(.48,.008,.06),'sage_dark')
            g.face([(x+.35,.132,2.1),(x+.16,.132,1.96),(x+.16,.132,2.24)],'sage_dark',(0,1,0))
        exit_sign(g,10.25,2.58,2.85)
        # Corridor lighting has a visible fixture and diffuser, independent of runtime lights.
        for x in (-6.64,0,6.64):
            g.box((x,2.94,1.40),(1.0,.08,.25),'metal_light',.02)
            g.box((x,2.885,1.40),(.86,.025,.17),'ivory',.01)
        # Floor number plate, digits made from rectangular geometry.
        g.box((12.9,2.3,2.98),(.6,.6,.08),'teal')
        glyph={1:['010','110','010','010','111'],2:['111','001','111','100','111'],3:['111','001','111','001','111']}[level+1]
        for iy,row in enumerate(glyph):
            for ix,p in enumerate(row):
                if p=='1':g.box((12.81+ix*.09,2.48-iy*.09,3.028),(.075,.075,.014),'ivory')
        s.fixed(f'corridor_f{level+1}',g,parent=parent)
        if level<2:
            st=Geometry()
            # U-stair: 16 rises x 0.20m. Two 1.25m wide flights, clear middle landing.
            left,right=10.82,12.5
            for flight,xx in enumerate((left,right)):
                for k in range(8):
                    h=(k+1)*.2+flight*1.6
                    z=2.35-(k+.5)*.29 if flight==0 else .03+(k+.5)*.29
                    st.box((xx,h-.09,z),(1.32,.18,.29),'sand')
                    st.box((xx,h+.006,z+.1 if flight==0 else z-.1),(1.33,.012,.065),'ivory')
                startz=2.35 if flight==0 else .03
                endz=.03 if flight==0 else 2.35
                starty=flight*1.6
                endy=(flight+1)*1.6
                # Steel stringers support the open-riser stair treads.
                for beamx in (xx-.46,xx+.46):
                    st.rod((beamx,starty+.02,startz),(beamx,endy-.12,endz),.085,'metal',4)
                for side in (-1,1):
                    x=xx+side*.61
                    for j in range(5):
                        t=j/4;z=startz+(endz-startz)*t;y=starty+(endy-starty)*t
                        st.rod((x,y+.10,z),(x,y+1.0,z),.024,'metal',6)
                    st.rod((x,starty+1,startz),(x,endy+1,endz),.037,'metal_light',8)
            st.box((11.66,1.51,-.62),(3.18,.18,1.3),'sand')
            for xx in (10.18,13.15):
                st.rod((xx,0,-1.17),(xx,1.48,-1.17),.07,'metal',4)
            for x in (10.12,13.18):st.rod((x,1.6,-1.22),(x,2.6,-1.22),.03,'metal',8)
            st.rod((10.12,2.6,-1.22),(13.18,2.6,-1.22),.035,'metal_light',8)
            for x in (10.12,13.18):st.rod((x,2.6,-1.22),(x,2.6,-.02),.035,'metal_light',8)
            s.fixed(f'stairs_f{level+1}_to_f{level+2}',st,parent=parent)
            s.node(f'stair_bottom_f{level+1}',parent,translation=[left,0,2.55],extras={'role':'stair_navigation','next':f'stair_mid_f{level+1}'})
            s.node(f'stair_mid_f{level+1}',parent,translation=[11.66,1.6,-.62],extras={'role':'stair_navigation','next':f'stair_top_f{level+2}'})
            s.node(f'stair_top_f{level+2}',parent,translation=[right,3.2,2.55],extras={'role':'stair_navigation','next':f'corridor_f{level+2}'})
        # Back structural posts do not cover room windows in cutaway.
        col=Geometry()
        for x in (-9.98,-3.32,3.32,9.98):col.box((x,1.52,-3.94),(.20,3.04,.20),'sage_dark')
        s.fixed(f'structure_f{level+1}',col,parent=parent)
    # Ground entry threshold and marked exit.
    e=Geometry();e.box((13.1,-.09,4.0),(1.65,.18,1.7),'sand',.03)
    s.fixed('entry_landing',e)
    s.node('building_entry',s.root,translation=[13.1,0,4.0],extras={'role':'spawn','forward':[0,0,-1]})
    return s.save()


def main():
    floors=[floor_model(i) for i in (1,2,3)]
    shell=shell_model()
    result={'license':'CC0-1.0','units':'metres','up':'+Y','front':'+Z','origin':[0,0,0],
        'bounds':[[-10.08,-.18,-4.06],[14.08,9.6,4.85]],'floorHeight':3.2,
        'assembly':'Place shell at origin. Place building-floor-N at [0, (N-1)*3.2, 0].',
        'floors':[dict(f,elevation=i*3.2) for i,f in enumerate(floors)],'shell':shell,
        'cutaway':{'hidePrefixes':['cutaway_front_','cutaway_ceiling_'],'note':'Full front walls and ceilings are included; hide only for cutaway inspection.'},
        'stateContract':{'parent':'burn_<id>','intact':'intact_<id>','burnt':'burnt_<id>','fire':'fire_<id>',
            'default':'intact','burntStoredScale':[0,0,0],'activeScale':[1,1,1],
            'burning':'intact visible; fire anchor drives runtime flame and accumulating smoke sprites',
            'burntNotes':'intact scale zero; burnt scale one. Geometry collapses with char and ash faces.'},
        'smoke':{'layers':['low','mid','ceiling'],'initialLayer':'ceiling','accumulation':'Fill ceiling first; extend to mid then low over exposure time. Ventilation may decay density.',
            'limits':{'ceilingOpacity':.6,'midOpacity':.36,'lowOpacity':.18}},
        'navigation':{'corridor':{'min':[-9.96,0,.92],'max':[13.96,0,3.12],'clearWidth':2.2},
            'stairs':{'flightWidth':1.32,'risesPerFloor':16,'rise':.2,'going':.29,'landingDepth':1.3,
                'pathPerStorey':[[10.82,0,2.55],[10.82,1.6,.03],[11.66,1.6,-.62],[12.5,1.6,.03],[12.5,3.2,2.55]]},
            'entry':[13.1,0,4.0]},
        'camera':{'overview':{'position':[26,22,30],'target':[1.4,4.2,-.2]},
            'floor':{'position':[16,13,24],'target':[1.2,1.15,-.3]}},
        'source':{'reference':'Fire Rooms v1','commit':'37305d4d816d9dc3dcd2e31c2410a169c02490ca','scope':'CC0 furniture geometry and geometry helper adapted; new shell stairs damage state composition.'}}
    (ROOT/'source'/'building.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    for r in [*floors,shell]:print(r['file'],r['bytes'],'bytes;',r['totalTriangles'],'tris;',len(r['items']),'burnables')
    print('TOTAL',sum(r['bytes'] for r in floors+[shell]))


if __name__=='__main__':main()
