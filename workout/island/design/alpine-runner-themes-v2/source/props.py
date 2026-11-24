# SPDX-License-Identifier: CC0-1.0
"""Original landmarks and smaller scenery, built on grounded, metre-scale pivots."""
import math
from random import Random

from geometry import Mesh, mix, rgb


def rock(m, p, rng, height=2, width=1, depth=1, snow=0.28, lean=0, ice=False):
    material = "ice" if ice else "matte"
    n = 6 if ice else 7
    phase = rng.uniform(0, math.tau)
    angles = [i * math.tau / n + phase for i in range(n)]
    wobble = [rng.uniform(0.78, 1.11) for _ in angles]

    def ring(level, radius):
        return [(lean * level + width * radius * q * math.cos(a), height * level,
                 depth * radius * q * math.sin(a)) for a, q in zip(angles, wobble)]

    sides = [p["dark"], p["rock"], mix(p["rock"], p["ice"], 0.33), p["rock"], p["ice"]] if ice else [
        p["dark"], p["rock"], mix(p["dark"], p["rock"], 0.58), mix(p["rock"], p["shade"], 0.29),
    ]
    upper = 1 - snow
    rings = [ring(0, 0.82), ring(0.2 * upper, 1.04), ring(0.73 * upper, 0.88), ring(upper, 0.65)]
    m.rings(rings, sides, sides[0], None if snow else sides[-1], material)
    if snow:
        m.rings([rings[-1], ring(upper + snow * 0.64, 0.55), ring(1, 0.22)],
                [p["shade"], p["snow"], p["white"], p["snow"]], None, p["white"])


def crystal(m, p, rng, height=3.4, radius=0.72, lean=0.7):
    n = rng.choice((4, 5, 6))
    angles = [i * math.tau / n + rng.uniform(-0.07, 0.07) for i in range(n)]
    rings = [
        [(x * math.cos(a) * radius + lean * y, height * y, x * math.sin(a) * radius) for a in angles]
        for y, x in [(0, 0.94), (0.54, 1), (0.78, 0.68), (1, 0)]
    ]
    m.rings(rings, [p["ice"], p["shade"], mix(p["ice"], p["white"], 0.48), p["rock"], p["snow"]],
            p["ice"], None, "ice")


def fir(m, p, rng, height=7, girth=1.25, larch=False):
    offset = rng.uniform(-0.28, 0.3)
    m.tube((0, 0, 0), (offset, height * 0.85, 0), 0.19, 0.07, [p["timber"], p["dark"]], 6)
    for tier, (level, radius) in enumerate([(0.13, 1), (0.32, 0.82), (0.49, 0.66), (0.64, 0.46)]):
        y = height * level
        turn = tier * 0.51
        reach = girth * radius
        n = 10
        angles = [i * math.tau / n + turn for i in range(n)]
        flare = [(1.0 if i % 2 else 0.71) * rng.uniform(0.84, 1.16) for i in range(n)]
        band = [rng.uniform(-0.12, 0.14) * reach for i in range(n)]
        inner = mix(p["rock"], p["accent"], 0.35) if larch else p["rock"]

        def ring(scale, yy):
            return [(offset * level + math.cos(a) * reach * f * scale, y + yy + b,
                     math.sin(a) * reach * f * scale) for a, f, b in zip(angles, flare, band)]

        bottom = ring(1, 0)
        snowline = ring(0.87, 0.32 * reach)
        cone = ring(0.45, height * 0.19)
        tip = [(offset * (level + 0.36), y + height * 0.36, 0)] * n
        m.rings([bottom, snowline], [p["dark"], inner, inner], None, None)
        m.rings([snowline, cone, tip], [p["snow"], p["white"], p["shade"], p["white"]], None, None)


def birch(m, p, rng):
    for x, h in [(-0.42, 5.5), (0.54, 4.1), (0.15, 5.1)]:
        a, b = (x, 0, x * 0.29), (x * 1.42, h, 0.3)
        m.tube(a, b, 0.15, 0.062, [p["white"], p["shade"], p["snow"]], 7)
        for i in range(4):
            t = (i + 0.85) / 5
            y = h * t
            cx = x + x * 0.42 * t
            z = a[2] + (b[2] - a[2]) * t
            m.box((cx, y, z - 0.092), (0.18 - 0.015 * i, 0.074, 0.025), p["dark"], yaw=rng.uniform(-0.18, 0.18))
            start = (cx, y, z)
            end = (cx + (-1) ** i * rng.uniform(0.4, 1.1), y + 0.65, z + rng.uniform(-0.51, 0.58))
            m.tube(start, end, 0.061, 0.023, [p["snow"], p["timber"]], 5)
            m.tube(end, (end[0] + (-1) ** i * 0.32, end[1] + 0.42, end[2] - 0.18), 0.024, 0.013,
                   [p["timber"]], 4)


def lantern(m, p, height=2.8, wide=0.44):
    m.box((0, 0.12, 0), (wide, 0.24, wide), p["rock"])
    m.box((0, height * 0.40, 0), (0.15, height * 0.80, 0.15), p["dark"])
    m.box((0, height * 0.78, 0), (wide, 0.14, wide), p["timber"])
    m.box((0, height * 0.88, 0), (wide * 0.76, height * 0.19, wide * 0.76), p["light"], "light")
    for x in (-1, 1):
        for z in (-1, 1):
            m.box((x * wide * 0.40, height * 0.89, z * wide * 0.40),
                  (0.045, height * 0.23, 0.045), p["dark"])
    m.tube((0, height * 0.973, 0), (0, height * 1.11, 0), wide * 0.71, 0.04, [p["dark"], p["white"]], 4)


def rail(m, p, width=3.1, rope=False, lit=False):
    h = 1.06 if rope else 0.89
    for x in (-width / 2, 0, width / 2):
        m.box((x, h / 2, 0), (0.15, h, 0.14), p["dark"] if rope else p["timber"])
        m.box((x, h, 0), (0.18, 0.07, 0.17), p["accent"] if rope else p["snow"])
    for y in (0.30, 0.69):
        if rope:
            for x in (-width / 2, 0):
                knot = (x + width / 4, y - 0.14, 0)
                for a, b in [((x, y, 0), knot), (knot, (x + width / 2, y, 0))]:
                    m.tube(a, b, 0.029, 0.029, [p["light"]], 5)
        else:
            m.box((0, y, 0), (width + 0.18, 0.12, 0.12), p["timber"])
            m.box((0, y + 0.069, 0), (width + 0.24, 0.035, 0.095),
                  p["accent"] if lit else p["snow"], "light" if lit else "matte")


def logs(m, p, radius=0.25, length=1.65):
    for row in range(3):
        for j in range(4 - row):
            x = (j - (3 - row) / 2) * radius * 1.86
            y = radius + row * radius * 1.62
            z = 0.13 * (-1) ** j
            m.tube((x, y, z - length / 2), (x, y, z + length / 2), radius, radius * 0.92,
                   [p["timber"], p["dark"], mix(p["timber"], p["shade"], 0.3)], 8)
            end = (x, y, z - length / 2)
            for step, tint in [(0.77, p["light"]), (0.54, p["timber"]), (0.32, p["light"])]:
                m.tube(end, (x, y, end[2] - 0.013), radius * step, radius * step, [tint], 8)
                end = (x, y, end[2] - 0.013)
    m.box((0, radius * 4.9, 0.14), (radius * 4.3, radius * 0.59, length * 0.74), p["snow"], yaw=0.12)


def cabin(m, p, w=3.1, d=2.55, h=2.03, high=1.05, kind="house"):
    color = p["timber"]
    m.box((0, 0.14, 0), (w + 0.17, 0.28, d + 0.10), p["rock"])
    m.box((0, (h + 0.18) / 2, 0), (w, h - 0.18, d), color)
    for side in (-1, 1):
        edge = side * d / 2
        triangle = [(-w / 2, h, edge), (0, h + high, edge), (w / 2, h, edge)]
        m.face(triangle if side < 0 else triangle[::-1], color)
        for x in (-w * 0.34, 0, w * 0.34):
            if x == 0 and side < 0 and kind != "tower":
                m.box((x, 0.88, edge - 0.035), (0.62, 1.24, 0.12), p["dark"])
                m.box((0.19, 0.83, edge - 0.11), (0.053, 0.056, 0.046), p["light"])
                continue
            if w < 2.4 and x:
                continue
            m.box((x, h * 0.66, edge + side * 0.040), (0.54, 0.62, 0.096), p["dark"])
            m.box((x, h * 0.66, edge + side * 0.097), (0.38, 0.46, 0.037), p["light"], "light")
            m.box((x, h * 0.66, edge + side * 0.125), (0.042, 0.45, 0.028), p["dark"])
        m.box((0, h * 0.87, edge + side * 0.03), (w, 0.09, 0.10), p["dark"])
    for side in (-1, 1):
        wall_x = side * w / 2
        for z in (-d * 0.29, d * 0.29):
            m.box((wall_x + side * 0.046, 0.54 * h, z), (0.11, 0.56, 0.6), p["dark"])
            m.box((wall_x + side * 0.11, 0.54 * h, z), (0.047, 0.39, 0.43), p["light"], "light")
        for z in (-d / 2, d / 2):
            m.box((wall_x, (h + 0.29) / 2, z), (0.16, h - 0.29, 0.17), p["dark"])
        extent = (side * (w / 2 + 0.31), h - 0.11, 0)
        m.beam((0, h + high + 0.066, 0), extent, d + 0.57, 0.22, p["dark"])
        m.beam((0, h + high + 0.224, 0), (extent[0], extent[1] + 0.21, 0), d + 0.57, 0.16, p["snow"])
    if kind == "tower":
        center = (0, h + 0.02, -d / 2 - 0.07)
        m.tube(center, (0, center[1], center[2] - 0.075), 0.46, 0.46, [p["dark"]], 16)
        m.tube((0, center[1], center[2] - 0.074), (0, center[1], center[2] - 0.10), 0.38, 0.38,
               [p["white"]], 16)
        m.box((0, center[1] + 0.12, center[2] - 0.12), (0.045, 0.25, 0.03), p["dark"])
        m.box((0.11, center[1], center[2] - 0.12), (0.24, 0.045, 0.035), p["dark"])
    else:
        m.box((w * 0.25, h + high * 0.72, d * 0.24), (0.37, 0.93, 0.44), p["rock"])
        m.box((w * 0.25, h + high * 0.72 + 0.45, d * 0.24), (0.46, 0.10, 0.54), p["white"])


def marker(m, p, height=1.7, width=0.78):
    m.box((0, height / 2, 0), (0.11, height, 0.12), p["dark"])
    m.box((0, height - 0.16, 0), (width, 0.42, 0.16), p["accent"])
    for side in (-1, 1):
        z = side * 0.093
        m.beam((-0.17, height - 0.25, z), (0.01, height - 0.08, z), 0.064, 0.033, p["dark"])
        m.beam((0.01, height - 0.08, z), (0.20, height - 0.25, z), 0.064, 0.033, p["dark"])


def cairn(m, p, rng):
    for i, (radius, thickness) in enumerate([(0.72, 0.34), (0.53, 0.31), (0.44, 0.28), (0.29, 0.25)]):
        y = (0, 0.3, 0.56, 0.79)[i]
        x = rng.uniform(-0.11, 0.11)
        top = (x + 0.05, y + thickness, 0.08) if i else (x, y + thickness, 0)
        m.tube((x, y, 0), top, radius, radius * 0.82,
               [p["rock"], p["shade"], p["dark"]], 7)
    m.tube((0, 1.03, 0.08), (0, 1.10, 0.08), 0.28, 0.15, [p["white"]], 7)


def column(m, p, height, radius):
    m.tube((0, 0, 0), (0, height, 0), radius, radius * 0.88,
           [p["dark"], p["rock"], mix(p["rock"], p["timber"], 0.42)], 6)
    m.tube((0, height, 0), (0, height + 0.16, 0), radius * 0.88, radius * 0.57,
           [p["shade"], p["snow"], p["white"]], 6)


def tripod(m, p, center=(0, 1.48, 0)):
    for i in range(3):
        a = i * math.tau / 3
        foot = (math.cos(a) * 0.63, 0.04, math.sin(a) * 0.63)
        m.beam(foot, center, 0.087, 0.087, p["dark"])
        m.box((foot[0], 0.06, foot[2]), (0.20, 0.12, 0.19), p["accent"])


def flag(m, p, windsock=False):
    m.tube((0, 0, 0), (0, 3, 0), 0.06, 0.041, [p["dark"], p["snow"]], 6)
    if windsock:
        for j in range(4):
            a = (j * 0.38, 2.86 - j * 0.10, 0)
            b = ((j + 1) * 0.38, 2.86 - (j + 1) * 0.10, 0)
            m.tube(a, b, 0.24 - 0.04 * j, 0.20 - 0.04 * j, [p["accent"] if j % 2 == 0 else p["white"]], 8)
    else:
        for i in range(5):
            a = i * 0.37
            b = a + 0.37
            z0, z1 = 0.09 * math.sin(a * 5), 0.09 * math.sin(b * 5)
            pts = [(a, 2.68, z0), (a, 1.92 + a * 0.32, z0), (b, 1.92 + b * 0.32, z1), (b, 2.68, z1)]
            m.face(pts, p["accent"] if i != 1 else p["white"])
            m.face(pts[::-1], p["accent"] if i != 1 else p["white"])


def make_prop(key, p, seed):
    m, rng = Mesh(), Random(seed)

    def put(builder, origin, yaw=0, **kwargs):
        part = Mesh()
        builder(part, p, **kwargs)
        m.add(part, origin, yaw)

    if key in ("fir", "night-fir", "larch"):
        fir(m, p, rng, height=7.25 if key != "larch" else 5.2, girth=1.65 if key != "larch" else 0.93,
            larch=key == "larch")
    elif key == "birch":
        birch(m, p, rng)
    elif key in ("log-stack", "wood-pile"):
        logs(m, p, radius=0.31 if key == "log-stack" else 0.23)
    elif key == "stump":
        m.tube((0, 0, 0), (0, 0.86, 0), 0.69, 0.45, [p["dark"], p["timber"]], 8)
        for r, y, tint in [(0.45, 0.86, p["snow"]), (0.33, 0.875, p["timber"]), (0.22, 0.89, p["light"])]:
            m.tube((0, y, 0), (0, y + 0.015, 0), r, r * 0.99, [tint], 8)
    elif key in ("footbridge-rail", "split-fence", "light-rail", "rope-marker", "rope-stanchion"):
        rail(m, p, width=3.8 if key == "footbridge-rail" else 3.1, rope=key in ("rope-marker", "rope-stanchion"),
             lit=key == "light-rail")
    elif key in ("trail-lantern", "frost-lantern", "lamp-post", "survey-beacon", "guide-bollard", "ground-beacon"):
        heights = {"trail-lantern": 2.8, "frost-lantern": 2.2, "lamp-post": 3.75, "survey-beacon": 1.75,
                   "guide-bollard": 1.18, "ground-beacon": 0.76}
        lantern(m, p, heights[key], 0.58 if key == "ground-beacon" else 0.48)
        if key == "survey-beacon":
            m.box((0, 0.54, 0), (0.50, 0.32, 0.54), p["accent"])
    elif key in ("boulder", "glacial-boulder", "drift", "frosted-shelf", "strata", "mica-boulder",
                 "ridge-spire", "stacked-slate", "wind-carved-bank", "obsidian-fin"):
        designs = {
            "boulder": (1.95, 1.62, 1.11, 0.38, 0.43),
            "glacial-boulder": (2.10, 1.20, 1.00, 0.27, -0.22),
            "drift": (1.20, 1.72, 1.10, 0.81, 0.30),
            "frosted-shelf": (1.58, 1.92, 1.03, 0.22, 0.36),
            "strata": (2.05, 1.68, 0.92, 0.16, 1.05),
            "mica-boulder": (1.72, 1.18, 0.96, 0.39, 0.31),
            "ridge-spire": (5.50, 1.38, 1.21, 0.25, 1.06),
            "stacked-slate": (2.3, 1.48, 1.01, 0.20, -0.81),
            "wind-carved-bank": (1.42, 1.82, 1.41, 0.85, 0.40),
            "obsidian-fin": (4.70, 1.23, 0.81, 0.12, 0.95),
        }
        h, w, d, snow, lean = designs[key]
        rock(m, p, rng, h, w, d, snow, lean, key == "glacial-boulder")
    elif key in ("blue-spire", "prism", "split-shards", "violet-crystals"):
        if key == "violet-crystals":
            p = {**p, "ice": rgb("9181d8"), "snow": rgb("d6c7fa"), "rock": rgb("5d5896")}
        spikelets = {
            "blue-spire": [(0, 0, 7.5, 1.4, 0.90), (-1.18, 0.3, 3.2, 0.69, -0.80), (1.19, 0.25, 3.8, 0.78, 0.35)],
            "prism": [(0, 0, 4.9, 0.86, 0.20), (0.90, 0.25, 2.1, 0.36, 0.38)],
            "split-shards": [(0, 0, 3.6, 0.75, -0.30), (0.66, 0.36, 2.6, 0.46, 0.95), (-0.9, -0.5, 1.72, 0.44, -0.38)],
            "violet-crystals": [(0, 0, 3.3, 0.70, 0.72), (-0.69, 0.5, 2.4, 0.48, -0.50), (0.57, -0.6, 1.32, 0.38, 0.35)],
        }
        for x, z, h, r, lean in spikelets[key]:
            put(crystal, (x, 0, z), rng=rng, height=h, radius=r, lean=lean)
    elif key in ("ice-wall", "icefall"):
        for i in range(5):
            h = (2.4, 3.3, 4.1, 3.9, 2.7)[i]
            put(rock, ((i - 2) * 0.58, 0, 0.23 * math.sin(i)), rng=rng, height=h, width=0.76, depth=0.58,
                snow=0.16, lean=0.16, ice=True)
            if key == "icefall":
                x = (i - 2) * 0.51
                m.tube((x, h * 0.35, -0.47), (x + 0.05, h * 0.83, -0.5), 0, 0.20, [p["ice"], p["snow"]],
                       5, "ice", cap=False)
    elif key == "frozen-arch":
        for x in (-1.36, 1.36):
            put(crystal, (x, 0, 0), rng=rng, height=2.86, radius=0.66, lean=-x * 0.27)
            m.beam((x, 1.75, 0), (x * 0.52, 3.08, 0), 0.72, 0.65, p["ice"], "ice")
        m.beam((-0.74, 3.06, 0), (0.74, 3.06, 0), 0.79, 0.58, p["snow"], "ice")
    elif key in ("basalt-column", "column-cluster"):
        if key == "basalt-column":
            column(m, p, 5.65, 1.32)
            put(column, (1.0, 0, -0.35), height=2.65, radius=0.52)
        else:
            for x, z, h, r in [(-1.2, 0, 2.5, 0.73), (0, 0.54, 4.1, 0.83), (1.22, 0.1, 3.25, 0.72),
                              (-0.25, -0.6, 1.75, 0.54), (0.81, -0.87, 1.1, 0.53)]:
                put(column, (x, 0, z), height=h, radius=r)
    elif key in ("frozen-fissure", "copper-ore"):
        for side in (-1, 1):
            put(rock, (side * 0.89, 0, side * 0.18), yaw=side * 0.31, rng=rng,
                height=1.7 if key == "copper-ore" else 0.84, width=0.79, depth=1.15, snow=0.17, lean=side * 0.19)
        tint = p["ice"] if key == "frozen-fissure" else p["accent"]
        knots = [(-0.21, 0.1, -1.14), (0.18, 0.36, -0.61), (-0.19, 0.73, 0.07), (0.28, 0.90, 0.65)]
        for a, b in zip(knots, knots[1:]):
            m.beam(a, b, 0.15, 0.12, tint, "ice" if key == "frozen-fissure" else "matte")
    elif key in ("cairn", "summit-cairn"):
        cairn(m, p, rng)
        if key == "summit-cairn":
            m.box((0.50, 0.48, -0.33), (0.08, 0.96, 0.10), p["accent"], yaw=0.29)
    elif key in ("ridge-marker", "trail-post"):
        marker(m, p, 2.0 if key == "ridge-marker" else 1.57)
    elif key in ("berry-brush", "planter"):
        if key == "planter":
            m.box((0, 0.28, 0), (1.6, 0.56, 0.92), p["timber"])
            m.box((0, 0.58, 0), (1.74, 0.14, 1.03), p["snow"])
            for x in (-0.38, 0.38):
                put(fir, (x, 0.60, 0), rng=rng, height=1.35, girth=0.35)
        else:
            for j in range(8):
                x, z, h = rng.uniform(-0.68, 0.68), rng.uniform(-0.45, 0.45), rng.uniform(0.42, 0.96)
                m.tube((x * 0.5, 0, z * 0.4), (x, h, z), 0.068, 0.022, [p["timber"], p["dark"]], 5)
                m.tube((x, h - 0.08, z), (x, h + 0.1, z), 0.082, 0.049, [rgb("bc6655"), p["snow"]], 5)
    elif key in ("chalet", "clock-tower", "supply-shed", "rescue-hut", "observation-pod"):
        sizes = {"chalet": (4.2, 3.8, 2.55, 1.52), "clock-tower": (2.24, 2.34, 5.05, 1.54),
                 "supply-shed": (2.6, 2.3, 1.85, 0.64), "observation-pod": (3.16, 2.75, 2.05, 0.53),
                 "rescue-hut": (3.75, 3.06, 2.30, 0.91)}
        cabin(m, {**p, "timber": p["accent"]} if key == "rescue-hut" else p,
              *sizes[key], kind="tower" if key == "clock-tower" else "house")
    elif key in ("ridge-flag", "wind-sock"):
        flag(m, p, windsock=key == "wind-sock")
    elif key in ("survey-tripod", "ridge-telescope", "array-dish", "weather-mast"):
        h = 2.45 if key == "array-dish" else 1.56
        tripod(m, p, (0, h, 0))
        if key == "array-dish":
            m.tube((0, h, 0), (0.26, h + 0.29, -0.43), 0.23, 0.64, [p["dark"], p["ice"]], 10)
            m.tube((0.26, h + 0.29, -0.43), (0.53, h + 0.52, -0.77), 0.64, 1.12,
                   [p["shade"], p["snow"], p["ice"]], 10)
            m.beam((0.5, h + 0.5, -0.74), (0.83, h + 0.77, -1.08), 0.10, 0.12, p["light"])
        elif key == "weather-mast":
            m.tube((0, h - 0.15, 0), (0, 4.9, 0), 0.09, 0.057, [p["snow"], p["dark"]], 6)
            for y in (2.6, 3.7, 4.73):
                m.box((0.0, y, 0.0), (1.0, 0.09, 0.10), p["accent"])
                m.box((0.46, y, 0), (0.17, 0.21, 0.20), p["light"])
        else:
            a, b = (-0.16, h + 0.13, 0.45), (0.37, h + 0.48, -0.58)
            m.tube(a, b, 0.23, 0.19, [p["rock"], p["accent"], p["white"]], 9)
            m.tube(b, (b[0] + 0.03, b[1] + 0.025, b[2] - 0.09), 0.165, 0.165, [p["ice"]], 12, "ice")
    elif key == "snow-bench":
        for x in (-0.77, 0.77):
            m.box((x, 0.28, 0), (0.13, 0.56, 0.44), p["dark"])
            m.box((x, 0.62, 0.23), (0.12, 0.88, 0.12), p["dark"])
        for z in (-0.22, -0.07, 0.08, 0.23):
            m.box((0, 0.54, z), (2.07, 0.11, 0.13), p["timber"])
        m.box((0, 0.97, 0.25), (2.07, 0.27, 0.10), p["timber"])
        m.box((0, 0.62, -0.04), (1.88, 0.066, 0.38), p["snow"])
    elif key == "sled-rack":
        m.box((0, 0.12, 0), (2.36, 0.24, 0.96), p["timber"])
        for i in range(4):
            x = (i - 1.5) * 0.47
            color = p["accent"] if i % 2 else p["ice"]
            m.beam((x, 0.22, -0.36), (x, 1.79, 0.34), 0.36, 0.10, color)
            for side in (-1, 1):
                m.beam((x + side * 0.18, 0.24, -0.42), (x + side * 0.18, 1.78, 0.26), 0.063, 0.071, p["snow"])
    elif key == "market-stall":
        m.box((0, 0.54, 0), (2.40, 1.0, 1.56), p["timber"])
        for x in (-1.09, 1.09):
            for z in (-0.64, 0.64):
                m.box((x, 1.14, z), (0.12, 2.28, 0.12), p["dark"])
        for i in range(8):
            x = (i - 3.5) * 0.35
            m.beam((x, 2.64, 0.82), (x, 2.15, -0.99), 0.35, 0.11,
                   p["accent"] if i % 2 else p["white"])
    elif key == "expedition-crate":
        for x, y, z, size in [(0, 0.49, 0, 0.98), (-0.77, 0.28, 0.43, 0.56), (0.32, 1.23, 0, 0.52)]:
            m.box((x, y, z), (size, size, size), p["timber"])
            for dx in (-0.38, 0.38):
                m.box((x + dx * size, y, z), (size * 0.10, size * 1.02, size * 1.04), p["accent"])
            m.box((x, y + size * 0.49, z), (size * 0.78, 0.06, size * 0.81), p["snow"])
    else:
        raise ValueError(key)
    return m
