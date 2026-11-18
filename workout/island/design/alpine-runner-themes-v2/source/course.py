# SPDX-License-Identifier: CC0-1.0
"""Connectable track geometry, scenery placements and gates."""
import math
from random import Random

from geometry import Mesh, mix, unit
from props import column, crystal
from themes import TILES

LENGTH = 30
ROWS = 20
STEP = LENGTH / ROWS
BASE_CROSS_SECTION = [[-5.6, 0.35], [-3.6, 0], [-1.2, 0], [1.2, 0], [3.6, 0], [5.6, 0.35]]
COLUMNS = [-16, -12.6, -8.6] + [x for x, _ in BASE_CROSS_SECTION] + [8.6, 12.6, 16]
HEIGHTS = [-1.1, -0.29, 0.45] + [y for _, y in BASE_CROSS_SECTION] + [0.45, -0.29, -1.1]
BANKS = {
    "straight": (0.33, 0.26), "gentle_turn": (0.24, 1.15), "slope": (0.62, 0.52), "bridge": (-1.76, -2.05),
    "ice_tunnel": (1.14, 1.14), "village": (0.24, 0.12), "forest": (1.35, 0.86), "summit": (1.57, -0.97),
}
# The most recognizable silhouettes establish each environment at the entry.
ENTRY_PROPS = {
    "forest": (0, 0, 6, 2, 1, 3), "ice": (0, 2, 1, 3, 0, 5), "frozen-lava": (0, 1, 6, 2, 5, 4),
    "aurora": (0, 1, 4, 2, 6, 0), "village": (0, 1, 3, 2, 0, 5), "summit": (0, 0, 4, 8, 1, 7),
}
BANK_PROPS = {
    "forest": [(-12.6, 8.5, 1), (12.7, 11.2, 0), (-12.1, 18.2, 0), (12.1, 23.4, 1), (-13.0, 25.7, 2)],
    "ice": [(12.1, 6.8, 1), (-11.7, 16.9, 0), (12.5, 22.8, 3)],
    "frozen-lava": [(12.8, 7.2, 2), (-12.5, 16.8, 1), (12.0, 22.0, 2)],
    "village": [(-11.8, 15.4, 0), (11.4, 20.7, 3), (-12.1, 24.5, 2)],
}


def centerline(tile, z):
    if z <= 0 or z >= LENGTH:
        return 0, 0, 0, 0
    a = math.pi * z / LENGTH
    profile, grade = math.sin(a) ** 2, math.pi / LENGTH * math.sin(2 * a)
    if tile == "gentle_turn":
        return 1.2 * profile, 0, 1.2 * grade, 0
    if tile == "slope":
        return 0, 1.5 * profile, 0, 1.5 * grade
    return 0, 0, 0, 0


def profiles():
    return {
        key: [[i * STEP, *[round(v, 7) for v in centerline(key, i * STEP)]] for i in range(ROWS + 1)]
        for key, _ in TILES
    }


def bank_height(theme, tile, col, z):
    x = COLUMNS[col]
    lift = centerline(tile, z)[1]
    if abs(x) <= 5.6 or z in (0, LENGTH):
        return HEIGHTS[col] + lift
    width = (abs(x) - 5.6) / (16 - 5.6)
    sag = math.sin(math.pi * z / LENGTH) ** 2
    strength = BANKS[tile][x > 0]
    relief = {"forest": 1.15, "ice": 1.28, "frozen-lava": 1.35, "aurora": 0.69, "village": 0.48, "summit": 1.58}
    rock = 0.30 * math.sin(z * 0.38 + col * 2.5) + 0.17 * math.cos(z * 0.7 - x)
    return HEIGHTS[col] + lift + sag * width * (strength * relief[theme] * 2.5 + rock)


def surface(theme, tile, x, z):
    """Local track position at a lateral offset. Height follows the mesh triangles."""
    row = min(ROWS - 1, int(z / STEP))
    z0, z1 = row * STEP, (row + 1) * STEP
    dz = (z - z0) / STEP
    base_x = centerline(tile, z0)[0] * (1 - dz) + centerline(tile, z1)[0] * dz
    col = next(i for i in range(len(COLUMNS) - 1) if x <= COLUMNS[i + 1])
    dx = (x - COLUMNS[col]) / (COLUMNS[col + 1] - COLUMNS[col])
    left0, left1 = (bank_height(theme, tile, col, s) for s in (z0, z1))
    right0, right1 = (bank_height(theme, tile, col + 1, s) for s in (z0, z1))
    # Faces are triangulated across the near-left to far-right diagonal.
    if dz >= dx:
        y = (1 - dz) * left0 + (dz - dx) * left1 + dx * right1
    else:
        y = (1 - dx) * left0 + (dx - dz) * right0 + dz * right1
    return base_x + x, y, z


def decal(m, theme, tile, outline, color, material="matte", lift=0.012):
    points = []
    for x, z in outline:
        xx, y, zz = surface(theme, tile, x, z)
        points.append((xx, y + lift, zz))
    m.face(points, color, material)


def decor(m, theme, tile, p, rng):
    # Translucent-looking frost patches are colored mesh, with no texture lookups.
    decoration = {"forest": 0.20, "ice": 0.36, "frozen-lava": 0.76, "aurora": 0.47, "village": 0.32, "summit": 0.54}
    for side in (-1, 1):
        for j in range(12):
            x, z = side * rng.uniform(4.0, 12.2), rng.uniform(1.6, 27.3)
            width, depth = rng.uniform(0.22, 1.15), rng.uniform(0.30, 1.32)
            if side < 0:
                width = min(width, -3.71 - x)
            else:
                width = min(width, x - 3.71)
            tint = mix(p["shade"], p["rock"], decoration[theme] if j % 3 else 0.11)
            decal(m, theme, tile, [(x - width, z), (x - width * 0.36, z + depth),
                                   (x + width, z + depth * 0.59), (x + width * 0.67, z - depth * 0.59)], tint,
                  "ice" if theme == "ice" else "matte", 0.028)

    for z in (2.3, 5.3, 8.3, 11.3, 14.3, 17.3, 20.3, 23.3, 26.3):
        for x in (-1.2, 1.2):
            tint = mix(p["shade"], p["ice"], 0.32)
            decal(m, theme, tile, [(x - 0.049, z - 0.49), (x - 0.049, z + 0.41),
                                   (x + 0.049, z + 0.41), (x + 0.049, z - 0.49)], tint, lift=0.018)
        for side in (-1, 1):
            x = side * 3.48
            tint = p["accent"] if int(z) % 2 == 0 else p["shade"]
            decal(m, theme, tile, [(x - 0.052, z - 0.34), (x - 0.052, z + 0.48),
                                   (x + 0.052, z + 0.37), (x + 0.052, z - 0.42)], tint, lift=0.018)

    # A pair of finer grooming lines separates the compacted snow from each bank.
    for side in (-1, 1):
        for i in range(1, ROWS - 1):
            za, zb = i * STEP, (i + 1) * STEP
            x = side * 3.69
            decal(m, theme, tile, [(x - 0.038, za), (x - 0.038, zb),
                                   (x + 0.038, zb), (x + 0.038, za)], mix(p["snow"], p["shade"], 0.52))
        for z in (3.1, 14.5, 26.7):
            x, y, _ = surface(theme, tile, side * 4.16, z)
            m.box((x, y + 0.30, z), (0.08, 0.66, 0.08), p["dark"])
            m.box((x, y + 0.64, z), (0.17, 0.13, 0.15), p["accent"], "light" if theme == "aurora" else "matte")


def bridge(m, theme, tile, p):
    for side in (-1, 1):
        for z in (6, 12, 18, 24):
            x, y, _ = surface(theme, tile, side * 4.78, z)
            for height in (0.68, 1.04):
                m.box((x, y + height, z), (0.18, 0.105, 6), p["timber"])
            m.box((x, y + 0.53, z - 2.82), (0.25, 1.14, 0.25), p["dark"])
            m.box((x, y + 1.10, z - 2.82), (0.29, 0.14, 0.29), p["accent"])
            m.box((side * 4.9, -1.57, z), (0.56, 3.0, 0.85), p["rock"])
        for z in (9, 15, 21):
            m.box((side * 4.78, 0.95, z), (0.20, 0.07, 5.77), p["snow"])
    for z in (6, 12, 18, 24):
        m.box((0, -0.73, z), (10.28, 0.56, 0.46), p["timber"])


def canopy(m, theme, tile, p, rng):
    for z in (9, 16.5, 23):
        for side in (-1, 1):
            x, y, _ = surface(theme, tile, side * 5.12, z)
            if theme == "ice":
                section = Mesh()
                crystal(section, p, rng, height=5.67, radius=0.79, lean=-side * 0.27)
                m.add(section, (x, y - 0.12, z))
            elif theme == "frozen-lava":
                section = Mesh()
                column(section, p, 5.12, 0.70)
                m.add(section, (x, y - 0.18, z))
            else:
                m.beam((x, y - 0.14, z), (x * 0.93, 4.9, z), 0.27, 0.58, p["timber"])
            m.beam((side * 5.26, 4.79, z), (side * 3.15, 5.55, z), 0.54, 0.57, p["dark"])
        m.beam((-3.31, 5.55, z), (3.31, 5.55, z), 0.73, 0.52, p["ice"] if theme == "ice" else p["dark"],
               "ice" if theme == "ice" else "matte")
        m.box((0, 5.85, z), (7.0, 0.17, 0.92), p["snow"])
        for x in (-3.15, 0, 3.15):
            m.box((x, 5.34, z - 0.39), (0.43, 0.098, 0.10), p["light"], "light")


def build_tile(theme, tile, p, seed):
    m, rng = Mesh(), Random(seed)
    for row in range(ROWS):
        za, zb = row * STEP, (row + 1) * STEP
        for col, (xa, xb) in enumerate(zip(COLUMNS, COLUMNS[1:])):
            corners = [(col, za), (col, zb), (col + 1, zb), (col + 1, za)]
            points, normals, colors = [], [], []
            for vertex_col, z in corners:
                cx, _, dx, _ = centerline(tile, z)
                y = bank_height(theme, tile, vertex_col, z)
                sx = (bank_height(theme, tile, col + 1, z) - bank_height(theme, tile, col, z)) / (xb - xa)
                dy = 0 if z in (0, LENGTH) else (
                    bank_height(theme, tile, vertex_col, z + 0.01) -
                    bank_height(theme, tile, vertex_col, z - 0.01)
                ) / 0.02
                points.append((COLUMNS[vertex_col] + cx, y, z))
                normals.append(unit((-sx, 1, sx * dx - dy)))
                x = abs(COLUMNS[vertex_col])
                base = p["snow"]
                if x > 3.6:
                    base = p["white"] if x <= 5.6 else mix(p["shade"], p["rock"], min(0.42, (x - 5.6) * 0.046))
                elif x != 1.2:
                    base = mix(base, p["white"], 0.29)
                sway = (0.5 + 0.5 * math.sin(z * 0.39 + col * 2.4 + seed)) * math.sin(math.pi * z / LENGTH) ** 2
                tint = mix(base, p["shade"], sway * (0.09 if x <= 3.6 else 0.25))
                colors.append(tint)
            m.face(points, p["snow"], normals=normals, colors=colors)

        for side in (-1, 1):
            col = 0 if side < 0 else len(COLUMNS) - 1
            a = (side * 16 + centerline(tile, za)[0], bank_height(theme, tile, col, za), za)
            b = (side * 16 + centerline(tile, zb)[0], bank_height(theme, tile, col, zb), zb)
            edge = [(a[0], a[1] - 0.86, za), (b[0], b[1] - 0.86, zb), b, a]
            normals = [unit((side, 0, -side * centerline(tile, z)[2])) for z in (za, zb, zb, za)]
            if side > 0:
                edge, normals = edge[::-1], normals[::-1]
            m.face(edge, p["rock"], normals=normals)

    decor(m, theme, tile, p, rng)
    if tile == "bridge":
        bridge(m, theme, tile, p)
    elif tile == "ice_tunnel":
        canopy(m, theme, tile, p, rng)
    elif tile in ("village", "forest", "summit"):
        for i, z in enumerate((7.5, 14.6, 22.5)):
            for side in (-1, 1):
                x, y, _ = surface(theme, tile, side * (5.85 + 0.21 * i), z)
                if tile == "village":
                    m.box((x + side * 0.52, y, z), (1.29, 0.31, 2.56), p["rock"], yaw=side * 0.12)
                    m.box((x + side * 0.52, y + 0.16, z), (1.30, 0.06, 2.50), p["white"], yaw=side * 0.12)
                else:
                    height = (0.72 if tile == "forest" else 1.05) * rng.uniform(0.61, 1.25)
                    m.tube((x, y - 0.17, z), (x + side * 0.29, y + height, z), 0.73, 0.19,
                           [p["shade"], p["snow"], p["white"]], 5)
    return m


def placements(theme, slot, props):
    chosen = ENTRY_PROPS[theme] if slot == 0 else tuple((slot * 4 + i) % len(props) for i in range(6))
    tile = TILES[slot][0]
    layout = [(-8.85, 5.4), (9.25, 7.5), (-6.85, 11.7), (8.6, 15.9), (-8.4, 22.0), (9.65, 25.5)]
    if tile == "bridge":
        layout = [(-9.9, 5.4), (10.5, 7.5), (-9.75, 11.7), (10.6, 15.9), (-9.3, 22.0), (10.2, 25.5)]
    design = [(x, z, prop) for (x, z), prop in zip(layout, chosen)]
    if tile not in ("bridge", "ice_tunnel"):
        design.extend(BANK_PROPS.get(theme, ()))
    result = []
    for i, (x, z, prop_id) in enumerate(design):
        prop = props[prop_id]
        xx, y, _ = surface(theme, tile, x, z)
        yaw = (0.26 if x > 0 else -0.33) * (1 if (slot + i) % 2 == 0 else -0.64)
        result.append({"prop": prop["id"], "position": [round(xx, 4), round(y - 0.074, 4), z],
                       "yawRadians": round(yaw, 4)})
    return result


GLYPHS = {
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    "N": ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
}


def letters(m, word, color, board_y, depth):
    spacing = 0.169
    for side in (-1, 1):
        for i, letter in enumerate(word):
            for row, data in enumerate(GLYPHS[letter]):
                for col, pixel in enumerate(data):
                    if pixel == "0":
                        continue
                    center = side * (i * 6 + col - (len(word) * 6 - 2) / 2) * spacing
                    x0, x1 = center - spacing / 2, center + spacing / 2
                    y1 = board_y + (3.5 - row) * spacing
                    y0 = y1 - spacing
                    z = side * depth
                    rect = [(x0, y0, z), (x0, y1, z), (x1, y1, z), (x1, y0, z)]
                    m.face(rect if side < 0 else rect[::-1], color)


def build_gate(theme, kind, p, seed):
    m, rng = Mesh(), Random(seed)
    for side in (-1, 1):
        x = side * 4.52
        m.box((x, 0.22, 0), (0.85, 0.44, 0.94), p["rock"])
        if theme == "ice":
            spire = Mesh()
            crystal(spire, p, rng, height=5.4, radius=0.64, lean=-side * 0.19)
            m.add(spire, (x, 0.10, 0))
        elif theme == "frozen-lava":
            pillar = Mesh()
            column(pillar, p, 4.72, 0.58)
            m.add(pillar, (x, 0, 0))
        else:
            w = 0.27 if theme in ("aurora", "summit") else 0.43
            m.beam((x, 0.15, 0), (x * 0.96, 4.72, 0), w, w * 1.24, p["timber"])
            for y in (0.7, 2.8):
                m.box((x * (1 - y * .008), y, 0), (w + 0.095, 0.15, w * 1.32), p["accent"],
                      "light" if theme == "aurora" else "matte")
        for facing in (-1, 1):
            for i in range(3):
                m.box((side * (3.74 + i * 0.19), 4.43 + i * 0.16, facing * 0.171),
                      (0.14, 0.082, 0.035), p["accent"], "light" if theme == "aurora" else "matte")
    m.box((0, 4.50, 0), (9.3, 1.58, 0.31), p["dark"])
    m.box((0, 5.30, 0), (9.5, 0.13, 0.42), p["snow"])
    m.box((0, 3.73, 0), (9.45, 0.105, 0.39), p["accent"])
    if theme in ("forest", "village"):
        for side in (-1, 1):
            m.beam((0, 5.90, 0), (side * 4.94, 5.28, 0), 0.65, 0.18, p["white"])
    if kind == "finish":
        for side in (-1, 1):
            for facing in (-1, 1):
                for col in range(3):
                    for row in range(2):
                        if (col + row) % 2:
                            continue
                        m.box((side * (3.55 + col * 0.21), 4.23 + row * 0.21, facing * 0.183),
                              (0.195, 0.195, 0.05), p["white"])
    letters(m, kind.upper(), p["white"], 4.53, 0.166)
    return m
