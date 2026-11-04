#!/usr/bin/env python3
"""Build original geometry, geometric decals and particle effects. No network.

Requires Python 3.11+, Pillow and NumPy. Scene art is generated separately using
image_gen; this script only crops/resizes/encodes those unaltered source plates.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

import numpy as np
from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ENVS = ["sunset", "fog", "night-floodlit"]
ASSETS = []


def write_json(path, value):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def register(asset_id, kind, path, environments=None, **kwargs):
    entry = dict(id=asset_id, kind=kind, path=path,
                 environmentIds=environments or ENVS.copy(), **kwargs)
    ASSETS.append(entry)
    return entry


def save_image(path, array):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    im = array if isinstance(array, Image.Image) else Image.fromarray(array.astype(np.uint8))
    if p.suffix == ".webp":
        im.save(p, lossless=True, method=6, exact=True)
    else:
        im.save(p, optimize=True)


def bg_exports(sources):
    source_info = {}
    for env, source in zip(ENVS, sources):
        with Image.open(source) as original:
            plate = original.convert("RGB")
            source_info[env] = dict(sha256=hashlib.sha256(Path(source).read_bytes()).hexdigest(),
                                    dimensions=list(plate.size), tool="image_gen.imagegen")
            for orientation, size in [("landscape", (1536, 864)), ("portrait", (720, 1280))]:
                name = f"backgrounds/{env}-{orientation}.webp"
                # Preserve the main summit and open valley in the narrow crop.
                crop = ImageOps.fit(plate, size, Image.Resampling.LANCZOS,
                                    centering=(0.37, 0.5) if orientation == "portrait" else (0.5, 0.5))
                (ROOT / name).parent.mkdir(parents=True, exist_ok=True)
                crop.save(ROOT / name, quality=87, method=6)
                register(f"{env}-{orientation}", "background", name, [env],
                         width=size[0], height=size[1], colorSpace="srgb", alpha=False,
                         orientation=orientation, wrap="clamp-to-edge", mipmaps=False,
                         projection="camera-backplate", hdr=False, lightingBaked=True,
                         source=source_info[env],
                         cropCenter=[0.37 if orientation == "portrait" else 0.5, 0.5])
    write_json("sources.json", dict(schemaVersion=1, backgroundSources=source_info,
                                    generatedDate="2026-11-04",
                                    notes="Original PNG masters remain outside this package; shipped WebP plates are final assets."))


def smooth(x):
    x = np.clip(x, 0, 1)
    return x*x*(3-2*x)


def surface():
    n = 512
    y, x = np.mgrid[0:n, 0:n] / (n-1)
    rng = np.random.default_rng(504)
    field = np.zeros((n, n))
    for _ in range(50):
        fx, fy = rng.integers(1, 38, size=2)
        field += np.sin(2*np.pi*(fx*x+fy*y)+rng.uniform(0, 2*np.pi)) / (fx+fy)**1.22
    field /= np.max(np.abs(field))
    ripples = np.sin(2*np.pi*(x*3+y*2)+0.2*np.sin(2*np.pi*y*4))
    height = field*.25 + ripples*.12
    grain = rng.normal(0, .7, (n, n))
    lum = np.clip(243 + height*10 + grain, 229, 250)
    rgb = np.stack([lum-3, lum-1, lum+1], axis=-1).clip(0, 255).astype(np.uint8)
    rgb[-1] = rgb[0]; rgb[:, -1] = rgb[:, 0]
    save_image("textures/snow-albedo.webp", rgb)
    # Rebuild on a periodic 256-pixel grid for tangent-space normals.
    h = np.asarray(Image.fromarray(height.astype(np.float32), mode="F").resize((255, 255), Image.Resampling.BILINEAR))
    dx = (np.roll(h, -1, 1)-np.roll(h, 1, 1))*1.8
    dy = (np.roll(h, -1, 0)-np.roll(h, 1, 0))*1.8
    normals = np.stack([-dx, -dy, np.ones_like(dx)], axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    normal = np.pad(((normals*.5+.5)*255).round().astype(np.uint8), ((0, 1), (0, 1), (0, 0)), mode="wrap")
    rough = np.pad(np.clip(242+h*8, 232, 252).astype(np.uint8), ((0, 1), (0, 1)), mode="wrap")
    save_image("textures/snow-normal.webp", normal)
    save_image("textures/snow-roughness.webp", rough)
    for name, dims, cs in [("albedo", 512, "srgb"), ("normal", 256, "linear-data"), ("roughness", 256, "linear-data")]:
        register(f"snow-{name}", "surface", f"textures/snow-{name}.webp", width=dims, height=dims,
                 colorSpace=cs, wrap="repeat", tileMeters=[4, 4], mipmaps=True,
                 normalConvention="OpenGL +Y tangent space" if name == "normal" else None,
                 dataChannel="R" if name == "roughness" else "RGB")


def alpha_atlas(kind, cell=128, fps=20):
    size = cell*4
    out = np.zeros((size, size, 4), np.uint8)
    out[:, :, :3] = [248, 252, 255]
    y, x = np.mgrid[0:cell, 0:cell]
    u, v = x/(cell-1), y/(cell-1)
    pad = 12
    edge = smooth(np.minimum.reduce([x-pad, y-pad, cell-1-pad-x, cell-1-pad-y])/5)
    rng = np.random.default_rng(511 if kind == "powder-spray" else 524)
    particles = [(rng.uniform(-1, 1), rng.uniform(.25, 1), rng.uniform(.02, .055)) for _ in range(36)]
    for f in range(16):
        t = f/15
        density = np.zeros((cell, cell))
        envelope = smooth(t/.12) * (1-smooth((t-.42)/.58))
        if kind == "landing-cloud":
            for j, (side, rise, r) in enumerate(particles[:22]):
                cx = .5 + side*(.05+.30*t)
                cy = .77 - rise*.36*t + .08*t*t
                rx = r*(.9+2*t); ry = rx*.76
                density += np.exp(-.5*(((u-cx)/rx)**2+((v-cy)/ry)**2))*.25
            density += np.exp(-.5*(((u-.5)/(.05+.2*t))**2+((v-.76+.12*t)/(.025+.045*t))**2))*.35
        else:
            for j, (side, rise, r) in enumerate(particles):
                cx = .48 + side*.30*t + .10*t*t
                cy = .80 - rise*.65*t + .27*t*t
                rx = r*(.45+t*.65); ry = rx*.7
                density += np.exp(-.5*(((u-cx)/rx)**2+((v-cy)/ry)**2))*.7
        alpha = ((1-np.exp(-density))*envelope*edge*230).clip(0, 255).astype(np.uint8)
        out[(f//4)*cell:(f//4+1)*cell, (f%4)*cell:(f%4+1)*cell, 3] = alpha
    path = f"atlases/{kind}.png"
    save_image(path, out)
    frames = []
    for f in range(16):
        px, py = f%4*cell, f//4*cell
        frames.append(dict(index=f, rect=[px, py, cell, cell],
                           uv=[(px+.5)/size, 1-(py+cell-.5)/size,
                               (px+cell-.5)/size, 1-(py+.5)/size]))
    meta = dict(schemaVersion=1, id=kind, environmentIds=ENVS, image=f"{kind}.png",
                width=size, height=size, columns=4, rows=4, frameCount=16, frameSize=[cell, cell],
                paddingPixels=pad, fps=fps, durationSeconds=16/fps, loop=False,
                frameOrder="row-major-left-to-right-top-to-bottom", imageOrigin="top-left",
                uvOrigin="bottom-left", uvInsetPixels=.5, alphaMode="straight",
                colorSpace="srgb", blendMode="alpha", depthWrite=False, depthTest=True,
                mipmaps=False, wrap="clamp-to-edge", filter="linear", pivot=[.5, .8],
                opacityBaked=True, firstAndLastFramesEmpty=True, frames=frames,
                billboard="camera-facing, world-up constrained", sizeMeters=[2.8, 1.6] if kind == "landing-cloud" else [1.5, 1.5],
                maxInstances=2 if kind == "landing-cloud" else 3,
                reducedMotion=dict(frame=5, seconds=.15, opacity=.35),
                trigger="visual-only; authoritative contact event from host simulation",
                completion="At age >= durationSeconds hide the quad. Do not leave frame 14 resident.")
    write_json(f"atlases/{kind}.json", meta)
    register(kind, "animated-atlas", path, metadata=f"atlases/{kind}.json", width=size, height=size,
             frameCount=16, colorSpace="srgb", alpha=True)


def draw_mask(name, cell):
    s = 4
    m = Image.new("L", (cell*s, cell*s))
    d = ImageDraw.Draw(m)
    def line(points, width=6): d.line([(int(x*s), int(y*s)) for x, y in points], fill=255, width=width*s, joint="curve")
    def poly(points): d.polygon([(int(x*s), int(y*s)) for x, y in points], fill=255)
    def ellipse(rect, width=0):
        d.ellipse(tuple(int(v*s) for v in rect), fill=None if width else 255, outline=255, width=max(1, width*s))
    if name == "downhill-arrow":
        poly([(56, 108), (72, 108), (72, 49), (92, 49), (64, 18), (36, 49), (56, 49)])
    elif name == "double-chevron":
        for cy in (40, 79): line([(30, cy+18), (64, cy-12), (98, cy+18)], 11)
    elif name in ("turn-left", "turn-right"):
        line([(84, 104), (84, 64), (41, 64)], 13)
        poly([(24, 64), (56, 35), (56, 93)])
        if name.endswith("right"): m = ImageOps.mirror(m)
    elif name == "caution-diamond":
        line([(64, 16), (111, 64), (64, 112), (17, 64), (64, 16)], 6)
        line([(64, 40), (64, 71)], 8); ellipse([60, 83, 68, 91])
    elif name == "boundary-dashes":
        for cy in (20, 53, 86): poly([(53, cy), (75, cy), (75, cy+23), (53, cy+23)])
    elif name == "landing-ring":
        ellipse([17, 17, 111, 111], 6); ellipse([44, 44, 84, 84], 4)
        for a, b in [([(64, 12), (64, 32)], 4), ([(64, 96), (64, 116)], 4), ([(12, 64), (32, 64)], 4), ([(96, 64), (116, 64)], 4)]: line(a, b)
    elif name == "finish-checks":
        for row in range(4):
            for col in range(4):
                if (row+col)%2 == 0: poly([(20+col*22, 20+row*22), (42+col*22, 20+row*22), (42+col*22, 42+row*22), (20+col*22, 42+row*22)])
    elif name == "ski-grooves":
        for cx in (47, 81):
            line([(cx, 16), (cx-3, 48), (cx-2, 81), (cx+3, 112)], 5)
            line([(cx+6, 16), (cx+3, 48), (cx+4, 81), (cx+9, 112)], 2)
    elif name in ("carve-left", "carve-right"):
        d.arc((25*s, 2*s, 182*s, 160*s), 122, 226, fill=255, width=5*s)
        d.arc((36*s, 8*s, 182*s, 154*s), 122, 226, fill=180, width=3*s)
        if name.endswith("right"): m = ImageOps.mirror(m)
    elif name == "contact-scuff":
        for k in range(9): line([(33+k*5, 94), (21+k*10, 51-(k%3)*6)], 2)
        ellipse([25, 80, 105, 104], 3)
    elif name == "powder-drift":
        for k in range(4): d.arc((18*s, (34+k*12)*s, 112*s, (65+k*12)*s), 187, 350, fill=255-k*30, width=3*s)
    elif name == "ice-crack":
        line([(23, 20), (58, 44), (51, 63), (78, 86), (70, 111)], 3)
        line([(51, 63), (28, 80)], 2); line([(78, 86), (109, 76)], 2)
    elif name == "pole-contacts":
        ellipse([32, 51, 44, 65], 2); ellipse([85, 65, 97, 79], 2)
    elif name == "route-dot":
        ellipse([27, 27, 101, 101], 7); ellipse([51, 51, 77, 77])
    m = m.resize((cell, cell), Image.Resampling.LANCZOS)
    arr = np.asarray(m).copy()
    arr[:10] = 0; arr[-10:] = 0; arr[:, :10] = 0; arr[:, -10:] = 0
    return arr


def decals():
    names = ["downhill-arrow", "double-chevron", "turn-left", "turn-right", "caution-diamond",
             "boundary-dashes", "landing-ring", "finish-checks", "ski-grooves", "carve-left",
             "carve-right", "contact-scuff", "powder-drift", "ice-crack", "pole-contacts", "route-dot"]
    atlas = np.zeros((512, 512, 4), np.uint8)
    frames = []
    for f, name in enumerate(names):
        col = [244, 155, 85] if f == 4 else ([43, 75, 102] if 8 <= f <= 14 else [32, 124, 173])
        x, y = f%4*128, f//4*128
        atlas[y:y+128, x:x+128, :3] = col
        atlas[y:y+128, x:x+128, 3] = draw_mask(name, 128)
        frames.append(dict(id=name, rect=[x, y, 128, 128],
                           uv=[(x+.5)/512, 1-(y+127.5)/512, (x+127.5)/512, 1-(y+.5)/512],
                           category="snow-impression" if 8 <= f <= 14 else "route-marking",
                           physicalSizeMeters=[.7, 1.6] if f == 8 else [2, 2],
                           rotationRadians=0, heading="image top is downhill +Z"))
    save_image("decals/route-and-snow.png", atlas)
    write_json("decals/route-and-snow.json", dict(schemaVersion=1, id="route-and-snow", environmentIds=ENVS,
               image="route-and-snow.png", width=512, height=512, columns=4, rows=4, cellSize=128,
               paddingPixels=10, frames=frames, alphaMode="straight", imageOrigin="top-left", uvOrigin="bottom-left",
               colorSpace="srgb", depthWrite=False, depthTest=True, polygonOffsetFactor=-1,
               polygonOffsetUnits=-1, wrap="clamp-to-edge", mipmaps=False, filter="linear",
               usage="Project on local snow surface; do not use a single horizontal plane over slopes.",
               defaultOpacity=.72, nightOpacity=.9, notCollision=True))
    register("route-and-snow", "decal-atlas", "decals/route-and-snow.png",
             metadata="decals/route-and-snow.json", width=512, height=512, alpha=True, colorSpace="srgb")


def flakes():
    atlas = np.zeros((256, 256, 4), np.uint8); atlas[:, :, :3] = [248, 252, 255]
    rng = np.random.default_rng(572)
    frames = []
    for f in range(16):
        mask = Image.new("L", (256, 256)); d = ImageDraw.Draw(mask)
        points = []
        for i in range(7):
            a = i*2*math.pi/7
            r = rng.uniform(35, 78)
            points.append((128+math.cos(a)*r, 128+math.sin(a)*r))
        d.polygon(points, fill=int(rng.integers(170, 255)))
        mask = mask.resize((64, 64), Image.Resampling.LANCZOS)
        x, y = f%4*64, f//4*64
        atlas[y:y+64, x:x+64, 3] = np.asarray(mask)
        frames.append(dict(index=f, rect=[x, y, 64, 64],
                           uv=[(x+.5)/256, 1-(y+63.5)/256, (x+63.5)/256, 1-(y+.5)/256]))
    save_image("atlases/snow-flecks.png", atlas)
    write_json("atlases/snow-flecks.json", dict(schemaVersion=1, id="snow-flecks", environmentIds=ENVS,
               image="snow-flecks.png", width=256, height=256, frameSize=[64, 64], columns=4, rows=4,
               frameCount=16, mode="random-static-particle-variants", animated=False, frames=frames,
               paddingPixels=8, alphaMode="straight", colorSpace="srgb", wrap="clamp-to-edge",
               mipmaps=False, filter="linear", depthWrite=False, depthTest=True,
               sizeMeters=[.008, .035], maxParticles=48, maxScreenFraction=.035,
               reducedMotion="disable ambient snowfall; retain brief contact cue"))
    register("snow-flecks", "particle-atlas", "atlases/snow-flecks.png", metadata="atlases/snow-flecks.json",
             width=256, height=256, alpha=True, colorSpace="srgb")


def overlays():
    for name, size, envs, color in [("fog-ribbon", (512, 128), ["fog"], [220, 235, 246]),
                                   ("light-cone", (128, 256), ["night-floodlit"], [255, 240, 211]),
                                   ("light-pool", (256, 256), ["night-floodlit"], [255, 239, 202])]:
        w, h = size
        y, x = np.mgrid[0:h, 0:w]
        u, v = x/(w-1), y/(h-1)
        if name == "fog-ribbon":
            a = np.exp(-((v-.5)/.24)**2) * np.sin(np.pi*u)**2 * (.55+.20*np.sin(u*17+v*3))*.48
        elif name == "light-cone":
            width = .025+.44*v
            a = np.exp(-((u-.5)/width)**4)*smooth(v/.06)*(1-smooth((v-.65)/.35))*.32
        else:
            a = np.maximum(0, 1-(((u-.5)/.48)**2+((v-.5)/.48)**2))**2*.48
        a *= smooth(np.minimum.reduce([x, y, w-1-x, h-1-y])/5)
        rgba = np.zeros((h, w, 4), np.uint8); rgba[:, :, :3] = color; rgba[:, :, 3] = np.clip(a*255, 0, 255).astype(np.uint8)
        save_image(f"effects/{name}.png", rgba)
        register(name, "overlay", f"effects/{name}.png", envs, width=w, height=h, alpha=True, colorSpace="srgb",
                 alphaMode="straight", blendMode="alpha", depthWrite=False, depthTest=True,
                 wrap="clamp-to-edge", mipmaps=False, filter="linear")


class Mesh:
    """Minimal glTF 2.0 mesh writer, independent of Blender/Draco."""
    def __init__(self, materials):
        self.materials = materials; self.groups = [[] for _ in materials]

    def face(self, vertices, material):
        a, b, c = [np.array(p, dtype=float) for p in vertices[:3]]
        n = np.cross(b-a, c-a); n /= np.linalg.norm(n)
        for i in range(1, len(vertices)-1):
            for p in [vertices[0], vertices[i], vertices[i+1]]:
                self.groups[material].append([*p, *n])

    def box(self, center, size, material):
        x, y, z = np.array(size)/2; cx, cy, cz = center
        p = [(cx+a*x, cy+b*y, cz+c*z) for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        for inds in [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]]:
            self.face([p[i] for i in inds], material)

    def rod(self, start, end, radius, material, segments=6):
        a, b = np.array(start, dtype=float), np.array(end, dtype=float); axis = b-a; axis /= np.linalg.norm(axis)
        ref = np.array([1.,0,0]) if abs(axis[0]) < .85 else np.array([0.,1,0])
        u = np.cross(axis, ref); u /= np.linalg.norm(u); v = np.cross(axis, u)
        ring = [radius*(math.cos(i*2*math.pi/segments)*u+math.sin(i*2*math.pi/segments)*v) for i in range(segments)]
        for i in range(segments):
            j = (i+1)%segments
            self.face([a+ring[i], a+ring[j], b+ring[j], b+ring[i]], material)
        self.face([a+p for p in reversed(ring)], material)
        self.face([b+p for p in ring], material)

    def save(self, asset_id, environments, anchors, extras):
        binary = bytearray(); views = []; accessors = []; primitives = []
        points = []; triangles = 0
        for mat, verts in enumerate(self.groups):
            if not verts: continue
            arr = np.array(verts, dtype="<f4"); pos = arr[:, :3]; normal = arr[:, 3:]
            attrs = {}
            for semantic, values in [("POSITION", pos), ("NORMAL", normal)]:
                raw = values.tobytes(); idx = len(views)
                views.append(dict(buffer=0, byteOffset=len(binary), byteLength=len(raw), target=34962))
                binary.extend(raw)
                accessor = dict(bufferView=idx, componentType=5126, count=len(values), type="VEC3")
                if semantic == "POSITION": accessor.update(min=pos.min(axis=0).tolist(), max=pos.max(axis=0).tolist())
                attrs[semantic] = len(accessors); accessors.append(accessor)
            primitives.append(dict(attributes=attrs, material=mat, mode=4)); points.extend(pos.tolist()); triangles += len(pos)//3
        points = np.asarray(points)
        nodes = [dict(name=asset_id, mesh=0, children=list(range(1, len(anchors)+1)),
                      extras=dict(environmentIds=environments, units="meters", up="+Y", forward="+Z", **extras))]
        nodes.extend(dict(name=name, translation=value, extras=dict(role="placement-anchor")) for name,value in anchors.items())
        doc = dict(asset=dict(version="2.0", generator="alpine-v5 original Mesh writer"),
                   scene=0, scenes=[dict(nodes=[0])], nodes=nodes,
                   meshes=[dict(name=asset_id, primitives=primitives)], materials=self.materials,
                   accessors=accessors, bufferViews=views, buffers=[dict(byteLength=len(binary))])
        js = json.dumps(doc, separators=(",", ":")).encode(); js += b" "*((-len(js))%4)
        binary += b"\0"*((-len(binary))%4)
        payload = struct.pack("<III", 0x46546C67, 2, 12+8+len(js)+8+len(binary)) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(binary), 0x004E4942) + binary
        path = f"models/{asset_id}.glb"; (ROOT/path).parent.mkdir(parents=True, exist_ok=True); (ROOT/path).write_bytes(payload)
        register(asset_id, "model", path, environments, triangles=triangles,
                 bounds=dict(min=points.min(axis=0).round(5).tolist(), max=points.max(axis=0).round(5).tolist()),
                 units="meters", up="+Y", forward="+Z", anchors=anchors, drawCalls=len(primitives),
                 compression="none; small self-contained glTF 2.0, no decoder required", **extras)


def material(name, rgb, roughness=.7, emissive=None):
    m = dict(name=name, pbrMetallicRoughness=dict(baseColorFactor=[*rgb, 1], metallicFactor=0, roughnessFactor=roughness))
    if emissive: m["emissiveFactor"] = emissive
    return m


def models():
    for env in ENVS:
        net = [.92, .30, .10] if env == "sunset" else ([1., .52, .08] if env == "fog" else [.16, .65, .77])
        mats = [material("powder-coated-post", [.08,.14,.21], .62), material("safety-net", net, .92),
                material("reflective-cap", [.95,.96,.88], .44, [.12,.14,.15] if env == "night-floodlit" else None)]
        mesh = Mesh(mats)
        for x in (-3., 3.):
            mesh.rod([x,-.12,0.], [x,1.24,0.], .045, 0, 8)
            mesh.rod([x,1.17,0.], [x,1.27,0.], .052, 2, 8)
        # Real open net geometry: no expensive transparent full-panel overdraw.
        for y in np.linspace(.18, 1.12, 7): mesh.rod([-3.,float(y),0.], [3.,float(y),0.], .009, 1, 4)
        for x in np.linspace(-2.9, 2.9, 33): mesh.rod([float(x),.18,0.], [float(x),1.12,0.], .008, 1, 4)
        mesh.save(f"safety-fence-{env}", [env], dict(anchor_snap_left=[-3,0,0], anchor_snap_right=[3,0,0]),
                  dict(widthMeters=6, burialMeters=.12, includesEndPosts=True,
                       joinPolicy="Align snap anchors; coincident end posts overlap intentionally. Suitable for instancing."))
        sign = Mesh([material("marker-pole", [.15,.23,.29]), material("route-blue", [.03,.28,.48]),
                     material("reflective-arrow", [.96,.98,1], .45, [.18,.20,.22] if env == "night-floodlit" else None)])
        sign.rod([0.,-.12,0.], [0.,1.9,0.], .035, 0, 8)
        sign.rod([0.,1.57,.025], [0.,1.57,-.025], .25, 1, 16)
        # Front faces -Z. The arrow points up along the sign's +Y direction.
        sign.face([[-.13,1.55,-.029], [0,1.76,-.029], [.13,1.55,-.029]], 2)
        sign.box([0,1.49,-.029], [.07,.14,.006], 2)
        sign.rod([0,1.91,0], [0,1.99,0], .045, 2, 8)
        sign.save(f"route-marker-{env}", [env], dict(anchor_ground=[0,0,0], anchor_sign=[0,1.57,-.03]),
                  dict(front="-Z", arrow="+Y on sign face", burialMeters=.12))
    tower = Mesh([material("galvanized-steel", [.24,.32,.40], .42), material("lamp-housing", [.055,.075,.11], .56),
                  material("lamp-lens", [1,.91,.74], .3, [1,.84,.58])])
    tower.rod([0.,-.3,0.], [0.,11.7,0.], .10, 0, 10)
    tower.box([0,11.7,0], [2.1,.12,.16], 0)
    for x in (-.18,.18): tower.rod([x,.2,-.17], [x,11.4,-.17], .016, 0, 5)
    for y in np.arange(.4,11.4,.4): tower.rod([-.18,float(y),-.17], [.18,float(y),-.17], .011, 0, 4)
    anchors = dict(anchor_ground=[0,0,0])
    for i, x in enumerate((-.72,0.,.72)):
        tower.box([x,11.78,.08], [.57,.38,.24], 1)
        tower.box([x,11.75,.206], [.45,.26,.016], 2)
        anchors[f"anchor_lamp_{i}"] = [x,11.75,.22]
    tower.save("floodlight-tower", ["night-floodlit"], anchors,
               dict(front="+Z", heightMeters=11.97, burialMeters=.3,
                    lighting="Emissive lenses only. Place runtime lights at anchors; emission alone does not illuminate snow."))


def environments():
    settings = {
        "sunset": dict(label="שקיעה", backgroundColor="#887990", snowTint="#fff3ed",
                       fog=dict(type="linear", color="#b6abc0", nearMeters=65, farMeters=240),
                       hemisphere=dict(sky="#e8d6ee", ground="#7d91b3", intensity=2.1),
                       sun=dict(color="#ffcf9d", intensity=3.0, position=[-35,22,-18]),
                       exposure=1.0, powderTint="#fff0e3", ambientSnowRate=5),
        "fog": dict(label="ערפל", backgroundColor="#b7c9db", snowTint="#f1f6fa",
                    fog=dict(type="linear", color="#bdd0e1", nearMeters=26, farMeters=100),
                    hemisphere=dict(sky="#dceaf5", ground="#8b9fb3", intensity=2.6),
                    sun=dict(color="#f1f7ff", intensity=1.1, position=[-20,35,-10]),
                    exposure=1.0, powderTint="#eff8ff", ambientSnowRate=12),
        "night-floodlit": dict(label="לילה עם זרקורים", backgroundColor="#081d42", snowTint="#b2cbed",
                               fog=dict(type="linear", color="#152d50", nearMeters=48, farMeters=185),
                               hemisphere=dict(sky="#98b9f5", ground="#354564", intensity=.85),
                               sun=dict(color="#afcfff", intensity=.9, position=[-25,35,-15]),
                               exposure=1.05, powderTint="#d2eaff", ambientSnowRate=8)
    }
    for env in ENVS:
        v = dict(schemaVersion=1, id=env, environmentIds=[env], units="meters", up="+Y", downhill="+Z", **settings[env])
        v["backgrounds"] = dict(landscape=f"{env}-landscape", portrait=f"{env}-portrait",
                                projection="camera-backplate", objectFit="cover", mipmaps=False,
                                parallax=False, repeat=False,
                                notes="Baked distant lighting; foreground uses the live lights below. Not an HDR environment map.")
        v["assets"] = [f"{env}-landscape", f"{env}-portrait", "snow-albedo", "snow-normal", "snow-roughness",
                       "powder-spray", "landing-cloud", "snow-flecks", "route-and-snow", f"safety-fence-{env}", f"route-marker-{env}"]
        v["surface"] = dict(albedo="snow-albedo", normal="snow-normal", roughness="snow-roughness",
                            normalScale=.22, roughnessChannel="R", metalness=0, repeatMeters=[4,4])
        v["effects"] = dict(powder="powder-spray", landing="landing-cloud", flakes="snow-flecks",
                            maxConcurrentLanding=2, maxConcurrentPowder=3, maxAmbientParticles=48,
                            maxTransparentScreenFraction=.12, reducedMotion="Disable drifting fog, cones and ambient snow; show brief static contact cue.")
        v["previewCamera"] = dict(position=[0,3.1,-8], target=[0,.2,20], fovLandscape=59, fovPortrait=66, near=.1, far=300)
        v["loadPolicy"] = dict(oneEnvironmentAtATime=True, oneBackgroundOrientationAtATime=True,
                               discardOldBackgroundOnRotate=True, shadowCastingLightsMax=1, postprocessing=False,
                               realtimeSpotLightsMax=2 if env == "night-floodlit" else 0)
        if env == "fog":
            v["assets"].append("fog-ribbon")
            v["fogOverlay"] = dict(asset="fog-ribbon", maxLayers=2, opacity=.28, driftMetersPerSecond=.15,
                                   nearestMeters=35, reducedMotion="static or disabled")
        if env == "night-floodlit":
            v["assets"].extend(["floodlight-tower", "light-cone", "light-pool"])
            v["floodlights"] = dict(model="floodlight-tower", cone="light-cone", pool="light-pool",
                                     placements=[dict(position=[-9,0,20], target=[1,0,33]), dict(position=[9,0,48], target=[-1,0,58])],
                                     color="#fff0d0", intensityCandela=420, distanceMeters=44, angleRadians=.62,
                                     penumbra=.5, decay=2, castShadow=False, maxLiveLights=2,
                                     reducedMotion="Static light pools, omit cone billboards.",
                                     lowEnd="Emissive lenses + light pools; disable realtime spot lights.")
        write_json(f"environments/{env}.json", v)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--sunset"); p.add_argument("--fog"); p.add_argument("--night")
    p.add_argument("--reuse-backgrounds", action="store_true", help="Keep shipped background plates and regenerate all procedural assets.")
    args = p.parse_args()
    if args.reuse_backgrounds:
        previous = json.loads((ROOT/"tools/asset-registry.json").read_text())["assets"]
        ASSETS.extend(a for a in previous if a["kind"] == "background")
    else:
        if not all([args.sunset,args.fog,args.night]): p.error("Provide all three source plates, or use --reuse-backgrounds")
        bg_exports([args.sunset, args.fog, args.night])
    surface()
    alpha_atlas("powder-spray", fps=20); alpha_atlas("landing-cloud", fps=16)
    flakes(); decals(); overlays(); models(); environments()
    write_json("tools/asset-registry.json", dict(schemaVersion=1, assets=ASSETS))
    print(f"Built {len(ASSETS)} registered assets and {len(ENVS)} environment presets.")


if __name__ == "__main__":
    main()
