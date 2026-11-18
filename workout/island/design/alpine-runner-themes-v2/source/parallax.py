# SPDX-License-Identifier: CC0-1.0
"""Paints wrapping alpine panoramas as three individually compositable WebP layers."""
import math
from random import Random

from PIL import Image, ImageDraw, ImageFilter

from geometry import mix, rgb

WIDTH, HEIGHT = 1536, 512
SCALE = 2
MOUNTAINS = {
    "forest": [(0.04, 0.31, 0.22), (0.23, 0.18, 0.23), (0.36, 0.37, 0.16), (0.60, 0.29, 0.20),
               (0.78, 0.18, 0.25), (0.91, 0.32, 0.20)],
    "ice": [(0.08, 0.33, 0.22), (0.22, 0.19, 0.18), (0.32, 0.27, 0.16), (0.55, 0.31, 0.18),
            (0.70, 0.15, 0.19), (0.79, 0.24, 0.18), (0.91, 0.34, 0.16)],
    "frozen-lava": [(0.05, 0.34, 0.22), (0.23, 0.21, 0.27), (0.40, 0.36, 0.16),
                    (0.63, 0.31, 0.26), (0.82, 0.18, 0.28), (0.97, 0.34, 0.18)],
    "aurora": [(0.03, 0.41, 0.17), (0.22, 0.35, 0.22), (0.35, 0.43, 0.18), (0.55, 0.46, 0.18),
               (0.74, 0.34, 0.24), (0.89, 0.40, 0.22)],
    "village": [(0.02, 0.35, 0.18), (0.21, 0.23, 0.22), (0.34, 0.38, 0.15), (0.55, 0.33, 0.19),
                (0.78, 0.24, 0.25), (0.92, 0.34, 0.23)],
    "summit": [(0.04, 0.28, 0.22), (0.20, 0.10, 0.22), (0.32, 0.28, 0.19), (0.53, 0.22, 0.20),
               (0.69, 0.15, 0.18), (0.80, 0.26, 0.20), (0.94, 0.33, 0.18)],
}


def blank():
    return Image.new("RGBA", (WIDTH * SCALE, HEIGHT * SCALE))


def wrap_polygon(draw, points, color):
    for dx in (-WIDTH, 0, WIDTH):
        draw.polygon([((x + dx) * SCALE, y * SCALE) for x, y in points], fill=color)


def wrap_ellipse(draw, x, y, rx, ry, color):
    for dx in (-WIDTH, 0, WIDTH):
        draw.ellipse(((x + dx - rx) * SCALE, (y - ry) * SCALE, (x + dx + rx) * SCALE, (y + ry) * SCALE), fill=color)


def sky(theme, spec, rng):
    image = blank()
    draw = ImageDraw.Draw(image)
    top, middle, horizon = [rgb(c) for c in spec["sky"]]
    for y in range(HEIGHT * SCALE):
        phase = y / (HEIGHT * SCALE)
        color = mix(top, middle, phase / .48) if phase < .48 else mix(middle, horizon, min(1, (phase - .48) / .37))
        draw.line((0, y, WIDTH * SCALE, y), fill=color)

    haze = blank()
    haze_draw = ImageDraw.Draw(haze)
    sundisks = {"forest": (0.27, 0.20, 23), "ice": (0.67, 0.24, 24), "frozen-lava": (0.36, 0.19, 30),
                "aurora": (0.77, 0.16, 19), "village": (0.29, 0.25, 24), "summit": (0.68, 0.21, 23)}
    x, y, radius = sundisks[theme]
    x, y = x * WIDTH, y * HEIGHT
    tint = rgb("b8e4fb") if theme == "aurora" else horizon
    wrap_ellipse(haze_draw, x, y, radius * 3.8, radius * 2.65, (*tint, 95))
    lines = 9 if theme != "aurora" else 4
    for i in range(lines):
        x0 = rng.uniform(0, WIDTH)
        y0 = HEIGHT * (0.25 + 0.035 * i)
        span = rng.uniform(WIDTH * 0.1, WIDTH * 0.38)
        lean = rng.uniform(-22, 23)
        points = [(x0 + span * j / 10, y0 + lean * j / 10 + math.sin(j * .81 + i) * 4.5)
                  for j in range(11)]
        lower = [(x, y + 12 * math.sin(j * math.pi / 10) ** 2) for j, (x, y) in enumerate(points)]
        wrap_polygon(haze_draw, points + lower[::-1], (*mix(middle, horizon, 0.78), rng.randrange(28, 90)))
    image = Image.alpha_composite(image, haze.filter(ImageFilter.GaussianBlur(11 * SCALE)))
    draw = ImageDraw.Draw(image)
    if theme == "aurora":
        for i in range(148):
            x0, y0 = rng.uniform(0, WIDTH), rng.uniform(8, HEIGHT * 0.56)
            size = rng.uniform(.33, 1.35) if i % 19 else 1.78
            tint = mix(top, rgb("e7fdff"), rng.uniform(0.32, 0.95))
            wrap_ellipse(draw, x0, y0, size, size, tint)
        wrap_ellipse(draw, x, y, radius, radius, rgb("e7f3f8"))
        moon = rgb("caddf1")
        wrap_ellipse(draw, x - radius * 0.31, y - radius * 0.26, radius * .28, radius * .32, moon)
        wrap_ellipse(draw, x + radius * .28, y + radius * .22, radius * .22, radius * .17, moon)
    else:
        wrap_ellipse(draw, x, y, radius, radius, mix(horizon, (255, 253, 244), 0.67))
    return image


def mountain(draw, theme, rng, x, peak, width, base, col, shade, snow, rocky=False):
    # Individually lit ridges, with exposed stone between the uneven snow tongues.
    left = [(-1, 1), (-0.80, 0.79), (-0.60, 0.59), (-0.48, 0.46), (-0.37, 0.46), (-0.24, 0.27), (-0.13, 0.16)]
    right = [(0.12, 0.20), (0.23, 0.25), (0.34, 0.42), (0.46, 0.44), (0.56, 0.60), (0.74, 0.70), (1, 1)]
    if theme in ("ice", "summit"):
        left = [(-1, 1), (-0.72, 0.68), (-0.58, 0.44), (-0.47, 0.52), (-0.31, 0.27), (-0.22, 0.33)]
        right = [(0.12, 0.23), (0.245, 0.29), (0.32, 0.43), (0.47, 0.37), (0.56, 0.56), (0.72, 0.68), (1, 1)]
    if theme == "frozen-lava":
        left = [(-1, 1), (-0.86, 0.73), (-0.60, 0.58), (-0.47, 0.44), (-0.38, 0.27), (-0.20, 0.12)]
        crest = [(-0.10, 0.19), (0, 0.21), (0.08, 0.17), (0.19, 0.02), (0.27, 0.07)]
        right = [(0.38, 0.23), (0.45, 0.44), (0.56, 0.51), (0.72, 0.62), (0.82, 0.76), (1, 1)]
    else:
        crest = [(0, 0)]
    height = base - peak
    raw = left + crest + right
    points = [(x + dx * width, peak + (u + rng.uniform(-.035, .035) * math.sin(u * math.pi)) * height)
              for dx, u in raw]
    wrap_polygon(draw, points + [(x + width, HEIGHT), (x - width, HEIGHT)], col)
    ridge = [(x + width * dx, peak + dy * height) for dx, dy in [(0.15, 0.22), (0.055, 0.39), (0.18, 0.52),
                                                              (0.26, 0.68), (0.25, 0.80), (0.52, 1)]]
    wrap_polygon(draw, points[len(left):] + ridge[::-1], shade)
    tint = mix(col, snow, 0.34)
    for i in (2, 4, 6, 8):
        a = points[i]
        b = points[min(i + 2, len(points) - 2)]
        c = (x + (a[0] - x) * 0.63, a[1] + height * rng.uniform(0.19, 0.46))
        d = (c[0] - width * rng.uniform(0.02, 0.17), c[1] + height * 0.08)
        wrap_polygon(draw, [a, b, c, d], tint if i <= 4 else mix(shade, col, 0.38))
    split = 4 if rocky else 3
    cap_outline = points[split:len(points) - split]
    tongues = [
        (x + width * .40, peak + height * .25), (x + width * .29, peak + height * .36),
        (x + width * .22, peak + height * .26), (x + width * .11, peak + height * .39),
        (x + width * .018, peak + height * .29), (x - width * .17, peak + height * .50),
        (x - width * .20, peak + height * .38), (x - width * .34, peak + height * .47),
        (x - width * .29, peak + height * .31), (x - width * .42, peak + height * .37),
    ]
    wrap_polygon(draw, cap_outline + tongues, snow)
    wrap_polygon(draw, points[len(left):len(left) + min(5, len(right))] + tongues[:4][::-1],
                 mix(snow, shade, 0.41))
    if theme == "frozen-lava" and rocky:
        for i in range(3):
            y = peak + height * (0.43 + i * 0.11)
            wrap_polygon(draw, [(x - width * (.39 + i * .08), y), (x + width * .12, y + height * .05),
                                (x + width * .45, y + height * .13), (x + width * .09, y + height * .10)],
                         mix(shade, rgb("be8379"), 0.53))


def ridges(theme, spec, rng):
    image = blank()
    draw = ImageDraw.Draw(image)
    col, light, snow, dark, haze = [rgb(c) for c in spec["ridges"]]
    for cx in (0.03, 0.19, 0.38, 0.56, 0.71, 0.90):
        mountain(draw, theme, rng, cx * WIDTH, rng.uniform(0.37, 0.47) * HEIGHT, 0.16 * WIDTH, 0.78 * HEIGHT,
                 mix(light, snow, 0.27), mix(light, col, 0.34), mix(snow, haze, 0.19))
    for i, (x, y, scale) in enumerate(MOUNTAINS[theme]):
        width = scale * WIDTH * rng.uniform(.69, .87)
        tint = mix(col, light, .24 if i % 3 else .07)
        shadow = mix(col, dark, .21 if i % 3 else .44)
        white = mix(snow, light, .07 if i % 2 else .26)
        if theme == "frozen-lava":
            white = mix(snow, light, .41)
        mountain(draw, theme, rng, x * WIDTH, y * HEIGHT, width, HEIGHT * rng.uniform(.70, .93),
                 tint, shadow, white, rocky=True)
    return image


def slope(x, phase, raised=0):
    u = math.tau * x / WIDTH
    return HEIGHT * (0.76 + raised + 0.08 * math.cos(u + phase) + 0.037 * math.cos(2 * u + phase) +
                     0.026 * math.sin(4 * u - phase) + 0.012 * math.sin(9 * u + phase))


def tree(draw, x, y, h, color, highlight, wind=0):
    width = h * 0.24
    for i in range(3):
        floor = y - h * i * .20
        radius = width * (1 - i * .22)
        apex = (x + wind * radius, floor - h * .58)
        lower = [(x - radius, floor), (x, floor - h * .09), (x + radius, floor + h * .015)]
        wrap_polygon(draw, [apex, *lower], color)
        wrap_polygon(draw, [apex, lower[1], lower[2]], highlight)


def roofline(draw, x, y, w, h, cols, tower=False):
    dark, shade, snow = cols
    edge = y - h * .50
    tip = y - h
    wrap_polygon(draw, [(x - w * .42, y + 5), (x - w * .42, edge), (x, tip),
                        (x + w * .43, edge), (x + w * .43, y + 5)], dark)
    wrap_polygon(draw, [(x, tip), (x + w * .43, edge), (x + w * .43, y + 5), (x, y + 5)], shade)
    wrap_polygon(draw, [(x - w * .52, edge), (x, tip - 2), (x + w * .52, edge), (x + w * .32, edge - 1),
                        (x, tip + h * .14), (x - w * .34, edge + 2)], snow)
    sy = y - h * (.48 if tower else .26)
    for side in (-1, 1):
        x0 = x + side * w * .19
        wrap_polygon(draw, [(x0 - 2, sy), (x0 - 2, sy + 4), (x0 + 2, sy + 4), (x0 + 2, sy)], rgb("ffe5a6"))


def foothills(theme, spec, rng):
    image = blank()
    draw = ImageDraw.Draw(image)
    col, light, snow, dark, haze = [rgb(c) for c in spec["ridges"]]
    base_phase = {"forest": 0.20, "ice": -0.10, "frozen-lava": 0.05, "aurora": 0.36, "village": -0.32, "summit": .16}[theme]
    for level, (phase, elevation, tint) in enumerate([
        (base_phase + .65, -.12, mix(col, haze, .51)), (base_phase - .36, -.04, haze),
        (base_phase, .005, mix(dark, col, .35))
    ]):
        points = [(x, slope(x, phase, elevation)) for x in range(0, WIDTH + 1, 12)]
        wrap_polygon(draw, points + [(WIDTH, HEIGHT), (0, HEIGHT)], tint)
        for _ in range(17):
            x = rng.uniform(0, WIDTH)
            y = slope(x, phase, elevation) + rng.uniform(1, 26)
            d = rng.uniform(10, 55)
            wrap_polygon(draw, [(x - d, y + 5), (x - d * .41, y + 1), (x, y - 5), (x + d * .21, y - 2),
                                (x + d * .67, y - 3), (x + d, y + 1), (x + d * .32, y + 5)],
                         mix(tint, light, .37 + level * .12))
        if theme in ("forest", "village", "aurora"):
            count = 85 if theme == "forest" else 38
            for _ in range(count):
                x = rng.uniform(0, WIDTH)
                y = slope(x, phase, elevation) + rng.uniform(1, 15)
                h = rng.uniform(9, 31 if level < 2 else 64)
                if theme == "forest":
                    h *= 1.20
                if theme == "village":
                    h *= 0.64
                tree(draw, x, y, h, mix(tint, dark, .53), mix(tint, snow, .22), 0.36)

        if theme == "village" and level > 0:
            for anchor in ((0.11, 0.36, 0.67, 0.86) if level == 1 else (0.17, 0.78)):
                for j in range(4):
                    x = WIDTH * anchor + (j - 1.5) * rng.uniform(21, 32)
                    y = slope(x, phase, elevation) + rng.uniform(13, 31)
                    roofline(draw, x, y, 18 + rng.uniform(0, 9), 24 + rng.uniform(0, 12) + 13 * (j == 2),
                             (mix(dark, rgb("704c50"), .48), mix(haze, dark, .25), snow), tower=j == 2)

        if theme in ("ice", "frozen-lava", "summit") and level > 0:
            for _ in range(30):
                x = rng.uniform(0, WIDTH)
                y = slope(x, phase, elevation) + rng.uniform(4, 19)
                w, h = rng.uniform(6, 37), rng.uniform(14, 43 if level == 1 else 66)
                if theme == "frozen-lava":
                    top = [(x - w * .42, y - h), (x + w * .36, y - h), (x + w * .50, y - h + 6)]
                else:
                    top = [(x - w * .35, y - h * .64), (x + w * .35, y - h), (x + w * .56, y - h * .59)]
                wrap_polygon(draw, [(x - w * .61, y + 4), *top, (x + w * .72, y + 5)], mix(tint, dark, .29))
                wrap_polygon(draw, [top[1], top[2], (x + w * .72, y + 5), (x + w * .14, y + 3)],
                             mix(tint, light, .36))
                wrap_polygon(draw, [*top, (x + w * .26, y - h * .62), (x - w * .49, y - h * .59)],
                             mix(tint, snow, .62))
    return image


def build_layers(folder, key, spec, seed):
    folder.mkdir(parents=True, exist_ok=True)
    rng = Random(seed)
    for name, paint in [("sky", sky), ("ridges", ridges), ("foothills", foothills)]:
        layer = paint(key, spec, rng).resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        if name == "sky":
            layer = layer.convert("RGB")
        layer.save(folder / f"{name}.webp", format="WEBP", quality=88, method=6, alpha_quality=100)
