#!/usr/bin/env python3
"""Original CC0 basketball data textures, baked onto the athlete's hm08 UVs.

Run from anywhere: python workout/island/design/athlete-kits-v1/generate.py
Requires Python 3, numpy, Pillow and scipy. No source image is edited or copied.
The GLB is read only. See REPORT.md for the alpha/reveal material contract.
"""
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter

HERE = Path(__file__).resolve().parent
MODEL = HERE.parent.parent / "assets/athlete/athlete.glb"
SIZE = 2048
KNEE_HEM = 0.55
SOCK_TOP = 0.23
SOURCE_SHORTS_HEM = 0.76850957
SHORTS_PIVOT = 1.025


def fitted_shorts_y(y):
    """Matches the optional, nonpersistent preview fit in preview.mjs."""
    t = np.clip((SHORTS_PIVOT - y) / (SHORTS_PIVOT - SOURCE_SHORTS_HEM), 0, 1)
    return y - (SOURCE_SHORTS_HEM - KNEE_HEM) * t ** 1.35


def read_glb(path):
    data = path.read_bytes()
    assert data[:4] == b"glTF"
    length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + length])
    binary = data[28 + length:]

    def accessor(index):
        spec = doc["accessors"][index]
        view = doc["bufferViews"][spec["bufferView"]]
        dtype = {5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}[spec["componentType"]]
        width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[spec["type"]]
        offset = view.get("byteOffset", 0) + spec.get("byteOffset", 0)
        stride = view.get("byteStride", np.dtype(dtype).itemsize * width)
        return np.ndarray((spec["count"], width), dtype=dtype, buffer=binary,
                          offset=offset, strides=(stride, np.dtype(dtype).itemsize)).copy()

    mesh = next(mesh for mesh in doc["meshes"] if mesh["name"] == "Athlete")
    return mesh, accessor


def bake_surface():
    """Rasterize skin first, then the offset kit; pixel centres in glTF UVs.

    GLTFLoader uses flipY=false: v is the PNG row coordinate, not 1-v.
    Region 0=skin, 1=jersey, 2=shorts, 3=socks, 4=shoes, -1=unused.
    """
    mesh, get = read_glb(MODEL)
    position = np.zeros((SIZE, SIZE, 3), dtype=np.float32)
    region = np.full((SIZE, SIZE), -1, dtype=np.int8)
    for primitive in sorted(mesh["primitives"], key=lambda p: p["material"]):
        attributes = primitive["attributes"]
        points = get(attributes["POSITION"])
        uv = get(attributes["TEXCOORD_0"]) * SIZE
        tags = get(attributes["_REGION"])[:, 0]
        triangles = get(primitive["indices"]).reshape(-1, 3)
        for ids in triangles:
            a, b, c = uv[ids]
            lo = np.maximum(np.floor(np.min([a, b, c], axis=0)).astype(int), 0)
            hi = np.minimum(np.ceil(np.max([a, b, c], axis=0)).astype(int), SIZE - 1)
            if np.any(hi < lo):
                continue
            x, y = np.meshgrid(np.arange(lo[0], hi[0] + 1) + 0.5,
                               np.arange(lo[1], hi[1] + 1) + 0.5)
            denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(denominator) < 1e-8:
                continue
            wa = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / denominator
            wb = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / denominator
            wc = 1 - wa - wb
            inside = (wa >= -1e-6) & (wb >= -1e-6) & (wc >= -1e-6)
            patch = np.s_[lo[1]:hi[1] + 1, lo[0]:hi[0] + 1]
            values = wa[..., None] * points[ids[0]] + wb[..., None] * points[ids[1]] + wc[..., None] * points[ids[2]]
            tag = int(round(float(np.median(tags[ids])))) if primitive["material"] == 1 else 0
            # The offset shirt overlaps the shorts at the waist in the source
            # atlas. Give the upper garment consistent priority over every
            # lower region, independent of triangle index order.
            if tag:
                previous = region[patch]
                inside &= (previous <= 0) | (previous >= tag)
            position[patch][inside] = values[inside]
            region[patch][inside] = tag
    return position, region


def band(distance, width):
    return np.clip((width - np.abs(distance)) / 0.002 + 0.5, 0, 1)


def make_textures():
    position, region = bake_surface()
    x, y, z = np.moveaxis(position, -1, 0)
    # Detail seams use the presentation fit. The RGB/alpha topology and the
    # source GLB UVs are unchanged. Both fitted and exact-source views exist.
    y[region == 2] = fitted_shorts_y(y[region == 2])
    ax = np.abs(x)
    occupied = region >= 0
    # Signed distances in metres, continuous around the chest/shoulder UV seams.
    front = np.clip((z + 0.015) / 0.07, 0, 1)
    scoop = (1.525 - 0.055 * front) + (0.055 + 0.055 * front) * np.minimum((ax / 0.112) ** 2, 1)
    neck_distance = y - scoop  # jersey stays below this curved neckline
    arm_ellipse = np.sqrt(((ax - 0.267) / 0.113) ** 2 + ((y - 1.455) / 0.205) ** 2)
    arm_distance = (arm_ellipse - 1) * 0.113
    jersey = (region == 1) & (neck_distance < 0) & (arm_distance > 0) & (ax < 0.24)
    # The source soccer shorts stop at .769 m. Continue on the existing skin UVs
    # to .55 m (knee at .536 m). No fabricated loose geometry is baked into GLB.
    extension = (region == 0) & (y >= KNEE_HEM) & (y < 0.87) & (ax < 0.29)
    shorts = (region == 2) | extension
    socks = (region == 3) & (y <= SOCK_TOP)
    shoes = region == 4
    cloth = jersey | shorts | socks
    coverage = cloth | shoes
    mask = np.zeros((SIZE, SIZE, 4), dtype=np.float32)
    mask[..., 0] = jersey
    mask[..., 1] = shorts
    mask[..., 2] = socks
    mask[..., 3] = coverage

    # Original seam layout: contrast binding at neckline and both armholes,
    # narrow shorts hem/waist piping, side panels, sock cuff, unbranded footwear.
    neck_binding = band(neck_distance + 0.009, 0.009) * jersey
    arm_binding = band(arm_distance - 0.009, 0.009) * jersey
    binding = np.maximum(neck_binding, arm_binding)
    hem = band(y - (KNEE_HEM + 0.016), 0.012) * shorts
    waist = band(y - 1.025, 0.012) * shorts
    side_panel = np.clip((ax - (0.183 + 0.022 * np.sin(y * 6))) / 0.015, 0, 1) * shorts
    jersey_panel = np.clip((ax - 0.135) / 0.025, 0, 1) * jersey * (1 - binding)
    cuff = band(y - (SOCK_TOP - 0.013), 0.009) * socks
    sole = band(y - 0.027, 0.012) * shoes
    tongue = np.exp(-((ax - 0.209) / 0.035) ** 2) * np.clip((z - 0.04) / 0.035, 0, 1) * shoes
    trim = np.maximum.reduce([binding, hem, waist, side_panel * 0.82, cuff, sole * 0.8, tongue * 0.85])

    # Broad drape folds in model space, with a fine staggered perforation knit.
    row, col = np.indices((SIZE, SIZE), dtype=np.float32)
    fold_strength = np.clip((1.45 - y) / 0.43, 0.15, 1) * jersey + shorts * 0.72
    folds = np.sin(x * 91 + np.sin(y * 12) * 1.5 + z * 23) * fold_strength
    folds += np.sin(x * 153 - y * 14 + z * 12) * fold_strength * 0.26
    folds += np.sin(y * 125 + z * 38) * jersey * np.exp(-((y - 1.06) / 0.065) ** 2) * 0.5
    spacing = 7.5
    pr = row % spacing - spacing / 2
    pc = (col + (np.floor(row / spacing) % 2) * spacing / 2) % spacing - spacing / 2
    perforation = np.exp(-(pc * pc / 1.15 + pr * pr / 0.65)) * cloth
    weave = np.sin(col * 2.1) * np.sin(row * 2.1) * cloth
    stitch_line = np.maximum(band(neck_distance + 0.020, 0.0018) * jersey,
                             band(arm_distance - 0.020, 0.0018) * jersey)
    stitch_line = np.maximum(stitch_line, band(y - (KNEE_HEM + 0.035), 0.0018) * shorts)
    stitch_line = np.maximum(stitch_line, band(y - 1.005, 0.0018) * shorts)
    stitch = stitch_line * (np.sin((x + y) * 1350) > 0).astype(np.float32)
    sock_rib = np.sin(x * 1300 + z * 900) * socks
    luminance = 0.72 + folds * 0.047 - perforation * 0.10 + weave * 0.009 + stitch * 0.10 + sock_rib * 0.025
    luminance = np.where(shoes, 0.62 + sole * 0.15 + tongue * 0.06 + np.sin(z * 650) * tongue * 0.025, luminance)
    luminance = np.where(coverage, luminance, 0.74)
    mesh_panel = np.clip((0.16 + jersey_panel * 0.6 + perforation * 0.5) * jersey, 0, 1)
    detail = np.stack([luminance, trim, mesh_panel], axis=-1)

    height = (folds * 0.22 + weave * 0.009 - perforation * 0.07 + stitch * 0.04 + binding * 0.06 + hem * 0.04 + sock_rib * 0.025)
    height *= cloth
    height += (sole * 0.1 + tongue * 0.03 + np.sin(z * 850) * tongue * 0.025) * shoes
    # Nearest-surface padding prevents atlas seams bleeding from unused UVs.
    distances, nearest = distance_transform_edt(~occupied, return_indices=True)
    padding = (~occupied) & (distances <= 16)
    for texture in (mask, detail):
        texture[padding] = texture[nearest[0][padding], nearest[1][padding]]
    height[padding] = height[nearest[0][padding], nearest[1][padding]]

    def byte(values):
        return (np.clip(values, 0, 1) * 255 + 0.5).astype(np.uint8)

    # Keep discrete data labels. Alpha alone antialiases the physical cut edges.
    mask_image = Image.fromarray(byte(mask)).resize((1024, 1024), Image.Resampling.BOX)
    mask_image.save(HERE / "kit-mask-basketball.png", optimize=True)
    Image.fromarray(byte(detail)).save(HERE / "kit-detail-basketball.png", optimize=True)
    height_small = np.asarray(Image.fromarray(height.astype(np.float32)).resize((1024, 1024), Image.Resampling.BOX))
    dy, dx = np.gradient(gaussian_filter(height_small, 0.45))
    normal = np.stack([-dx * 5.5, -dy * 5.5, np.ones_like(dx)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    Image.fromarray(byte(normal * 0.5 + 0.5)).save(HERE / "kit-normal-basketball.jpg", quality=94, subsampling=0, optimize=True)
    print(json.dumps({
        "source_sha256": hashlib.sha256(MODEL.read_bytes()).hexdigest(),
        "bake_size": SIZE, "knee_hem_m": KNEE_HEM, "sock_top_m": SOCK_TOP,
        "occupied_texels": int(occupied.sum()), "jersey_texels": int(jersey.sum()),
        "shorts_texels": int(shorts.sum()), "sock_texels": int(socks.sum()),
        "shoe_texels": int(shoes.sum()), "padding_px_at_1024": 8,
    }, indent=2))


if __name__ == "__main__":
    make_textures()
