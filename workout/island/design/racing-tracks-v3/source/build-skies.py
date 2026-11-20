"""Author six seamless equirectangular sky textures with periodic cloud fields."""

from pathlib import Path

import numpy as np
from PIL import Image


SIZE = (1536, 768)
ROOT = Path(__file__).resolve().parents[1] / "assets" / "skies"
SKIES = {
    "neon-quay": ("101531", "34305a", "585673", "303549", "9c8fb2", 0.36, 0.48, 0.24, True),
    "red-mesa": ("4a668b", "cb8c6c", "f7bf80", "a76a57", "ffddac", 0.29, 0.51, 0.13, False),
    "saltwater-bay": ("1e629d", "6eaec3", "c1dfd9", "5a889f", "fff5d9", 0.57, 0.66, 0.55, False),
    "cloud-pass": ("2b5093", "799fbb", "b8c9d0", "7e9db5", "f3ecde", 0.12, 0.61, 0.52, False),
    "cedar-bend": ("33556b", "7c9ca5", "dbc399", "75898f", "fff0b8", 0.93, 0.43, 0.35, False),
    "frostline": ("345b8b", "91b2cd", "d0dbe8", "93a8c5", "f9eef1", 0.71, 0.57, 0.5, False),
}


def rgb(code):
    return np.array([int(code[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255


def mix(a, b, weight):
    return a + (b - a) * weight[..., None]


def noise(rng, width, height, x, y):
    field = rng.random((height, width))
    u, v = x * width, np.clip(y * height, 0, height - 1.000001)
    ui, vi = np.floor(u).astype(int), np.floor(v).astype(int)
    a, b = u - ui, v - vi
    a, b = a * a * (3 - 2 * a), b * b * (3 - 2 * b)
    upper = field[vi, ui % width] * (1 - a) + field[vi, (ui + 1) % width] * a
    lower = field[vi + 1, ui % width] * (1 - a) + field[vi + 1, (ui + 1) % width] * a
    return upper * (1 - b) + lower * b


def smoothstep(lo, hi, value):
    t = np.clip((value - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def paint(name, spec, seed):
    zenith, upper_sky, horizon, cloud_shadow, light, solar_x, solar_y, coverage, night = spec
    width, height = SIZE
    x = (np.arange(width)[None, :] + 0.5) / width
    y = (np.arange(height)[:, None] + 0.5) / height
    altitude = np.pi * (0.5 - y)
    direction = 2 * np.pi * (x - solar_x)
    solar_altitude = solar_y * np.pi / 3
    cos_angle = np.sin(altitude) * np.sin(solar_altitude) + np.cos(altitude) * np.cos(solar_altitude) * np.cos(direction)
    angle = np.arccos(np.clip(cos_angle, -1, 1))
    rgb_sun = rgb(light)
    rgb_horizon = rgb(horizon)
    warmth = (0.17 if night else 0.32) * np.exp(-angle ** 2 / 0.34)
    sky = mix(rgb_horizon, rgb(upper_sky), smoothstep(0, 0.62, altitude))
    sky = mix(sky, rgb(zenith), smoothstep(0.12, 1.57, altitude))
    sky = mix(sky, rgb(zenith) * 0.67, smoothstep(0, 1.15, -altitude))
    sky = mix(sky, rgb_sun, warmth)
    glow = 0.23 * np.exp(-angle ** 2 / (0.085 if night else 0.045))
    sky = mix(sky, rgb_sun, glow)

    rng = np.random.default_rng(seed)
    if night:
        for _ in range(680):
            i, j = rng.integers(0, width), rng.integers(3, int(height * 0.44))
            sky[j, i] += (0.16 + rng.random() * 0.46) * (1 - j / (height * 0.60))
        sky = mix(sky, rgb("d2e5e7"), 0.89 * (1 - smoothstep(0.013, 0.018, angle)))
    else:
        sky = mix(sky, rgb("fff6db"), 0.87 * (1 - smoothstep(0.008, 0.022, angle)))

    advect = x + 0.027 * np.sin(11 * y + np.cos(2 * np.pi * x))
    coarse = noise(rng, 22, 18, advect, y)
    medium = noise(rng, 59, 37, x + coarse * 0.028, y)
    fine = noise(rng, 140, 92, x + medium * 0.014, y)
    broad = noise(rng, 8, 19, x, y)
    billow = coarse * 0.48 + medium * 0.25 + fine * 0.13 + broad * 0.14
    base = 0.70 - coverage * 0.39
    alpha = smoothstep(base - 0.075, base + 0.15, billow)
    alpha *= smoothstep(-0.05, 0.12, altitude) * (1 - 0.70 * smoothstep(0.73, 1.58, altitude))
    facing = smoothstep(0.05, 0.88, coarse * 0.48 + (1 - medium) * 0.27 + np.exp(-angle ** 2 / 0.65) * 0.25)
    clouds = mix(rgb(cloud_shadow), rgb_sun, facing * (0.34 if night else 0.78))
    sky = mix(sky, clouds, alpha * (0.50 if night else 0.86))

    stipple = rng.uniform(-0.0018, 0.0018, sky.shape[:2])
    pixels = np.uint8(np.clip(sky + stipple[..., None], 0, 1) * 255 + 0.5)
    Image.fromarray(pixels).save(ROOT / f"{name}.webp", quality=88, method=6)


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    for index, (name, spec) in enumerate(SKIES.items()):
        paint(name, spec, 5701 + index * 31)
