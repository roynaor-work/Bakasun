#!/usr/bin/env python3
"""Rebuild the original CC0 crash pack. Python 3 standard library only."""
import hashlib
import json
import math
from pathlib import Path
import random
import struct
import zlib

ROOT = Path(__file__).resolve().parent
SEED = 73109


def png(width, height, pixels):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    rows = b''.join(b'\0' + bytes(pixels[y * width * 4:(y + 1) * width * 4]) for y in range(height))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', width, height, 8, 6, 0, 0, 0))
            + chunk(b'sRGB', b'\0') + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


def clamp(x, lo=0, hi=1):
    return max(lo, min(hi, x))


def atlases():
    rng = random.Random(SEED)
    particles = [(rng.uniform(-math.pi, 0), rng.uniform(14, 29), rng.uniform(.4, .9)) for _ in range(15)]
    puffs = [(rng.uniform(-1, 1), rng.uniform(-.8, .8), rng.uniform(.35, .65)) for _ in range(9)]
    sparks, smoke = bytearray(256 * 256 * 4), bytearray(256 * 256 * 4)
    for frame in range(16):
        t = frame / 15
        segments = []
        for angle, speed, heat in particles:
            def point(age):
                return (32 + math.cos(angle) * speed * age, 36 + math.sin(angle) * speed * age + 8 * age * age)
            head, tail = point(.08 + .82 * t), point(max(0, .08 + .82 * t - .16))
            segments.append((head, tail, heat))
        for y in range(64):
            for x in range(64):
                offset = (((frame // 4) * 64 + y) * 256 + (frame % 4) * 64 + x) * 4
                # Three fully transparent pixels on every tile edge prevent linear-filter bleed.
                edge = clamp((min(x, y, 63 - x, 63 - y) - 3) / 3)
                glow = 0
                core = 0
                for (hx, hy), (tx, ty), heat in segments:
                    dx, dy = hx - tx, hy - ty
                    u = clamp(((x + .5 - tx) * dx + (y + .5 - ty) * dy) / max(.001, dx * dx + dy * dy))
                    d2 = (x + .5 - tx - dx * u) ** 2 + (y + .5 - ty - dy * u) ** 2
                    glow += math.exp(-d2 / 2.6) * heat * (.28 + .72 * u)
                    core += math.exp(-d2 / .33) * heat * (.3 + .7 * u)
                intensity = clamp(glow) * (1 - .94 * t) ** .85 * edge
                hot = clamp(core / max(.001, glow))
                sparks[offset:offset + 4] = bytes((255, round(125 + 119 * hot), round(12 + 105 * hot), round(255 * intensity)))
                # A growing, drifting cloud with coherent lobes and low-frequency turbulence.
                radius = 5.5 + 15 * t
                xx, yy = (x + .5 - 32) / radius, (y + .5 - (35 - 4 * t)) / radius
                density = 0
                for px, py, size in puffs:
                    cx = px * (.35 + .42 * t) + .10 * math.sin(t * 3 + py * 4)
                    cy = py * (.35 + .4 * t)
                    density += math.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (size * size))
                turbulence = .86 + .08 * math.sin(xx * 11 + yy * 7 + t * 3) + .06 * math.sin(yy * 17 - xx * 5)
                alpha = clamp(density * .34) * turbulence * (.72 - .68 * t) * edge
                gray = round(210 + 17 * clamp(density / 3) + 3 * math.sin(xx * 4 + yy * 3))
                smoke[offset:offset + 4] = bytes((gray, gray, gray, round(255 * alpha)))
    (ROOT / 'sparks-atlas.png').write_bytes(png(256, 256, sparks))
    (ROOT / 'smoke-dust-atlas.png').write_bytes(png(256, 256, smoke))


def tire_texture():
    pixels = bytearray()
    for y in range(128):
        v = y / 127
        for x in range(128):
            # Wrapped circumferential scuffs; no text, badges or colored manufacturer stripes.
            u = x / 128
            wear = 2 * math.sin(2 * math.pi * (11 * u + 3 * v)) + 1.5 * math.cos(2 * math.pi * (23 * u - 2 * v))
            grain = ((x * 37 + y * 19 + x * y * 7) % 11) / 5 - 1
            tread = .32 <= v <= .48
            base = (44 if tread else 29) + wear + grain
            # Fine molded sidewall rings, clear of the slick contact patch.
            if min(abs(v - .20), abs(v - .62), abs(v - .79)) < .013:
                base += 11
            pixels.extend((round(base), round(base + 1), round(base + 3), 255))
    data = png(128, 128, pixels)
    (ROOT / 'formula-tire-128.png').write_bytes(data)
    return data


def sub(a, b):
    return [a[i] - b[i] for i in range(len(a))]


def unit(v):
    length = math.sqrt(sum(x * x for x in v))
    assert length > 1e-9
    return [x / length for x in v]


def normal(a, b, c):
    u, v = sub(b, a), sub(c, a)
    return unit([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]])


def triangulate(poly):
    """Ear clipping for the deliberately jagged cut edges (counter-clockwise X/Z)."""
    def cross(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    remaining = list(range(len(poly)))
    result = []
    while len(remaining) > 3:
        for i, b in enumerate(remaining):
            a, c = remaining[i - 1], remaining[(i + 1) % len(remaining)]
            if cross(poly[a], poly[b], poly[c]) <= 1e-9:
                continue
            if any(all(cross(poly[p], poly[q], poly[k]) >= 0 for p, q in [(a, b), (b, c), (c, a)])
                   for k in remaining if k not in (a, b, c)):
                continue
            result.append((a, b, c))
            remaining.pop(i)
            break
        else:
            raise ValueError('Non-simple polygon')
    return result + [tuple(remaining)]


def prism(poly, bottom, thickness, warp=lambda x, z: 0):
    n = len(poly)
    vertices = [(x, bottom + warp(x, z) + layer * thickness, z) for layer in range(2) for x, z in poly]
    cap = triangulate(poly)
    # CCW in X/Z faces down in a Y-up coordinate system.
    faces = list(cap) + [(a + n, c + n, b + n) for a, b, c in cap]
    for a in range(n):
        b = (a + 1) % n
        faces.extend([(a, a + n, b + n), (a, b + n, b)])
    return vertices, faces


def box(x0, x1, y0, y1, z0, z1):
    return prism([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], y0, y1 - y0)


def combine(*parts):
    vertices, faces = [], []
    for v, f in parts:
        faces.extend(tuple(i + len(vertices) for i in tri) for tri in f)
        vertices.extend(v)
    return vertices, faces


def loft(rings):
    """Closed, faceted body section with CCW cross-sections in the X/Y plane."""
    n = len(rings[0])
    vertices = [v for ring in rings for v in ring]
    faces = []
    for section in range(len(rings) - 1):
        for j in range(n):
            a, b = section * n + j, section * n + (j + 1) % n
            faces.extend([(a, b, b + n), (a, b + n, a + n)])
    for a, b, c in triangulate([(v[0], v[1]) for v in rings[0]]):
        faces.append((a, c, b))
    start = (len(rings) - 1) * n
    for a, b, c in triangulate([(v[0], v[1]) for v in rings[-1]]):
        faces.append((start + a, start + b, start + c))
    return vertices, faces


def debris():
    wing = combine(
        prism([(-.57, -.15), (.43, -.15), (.57, -.06), (.43, 0), (.54, .06), (.38, .16), (-.57, .16)], -.025, .035, lambda x, z: z * .12),
        box(-.59, -.55, -.04, .20, -.18, .19),
        prism([(-.51, .20), (.34, .20), (.43, .25), (-.51, .29)], .045, .025))
    pod_profile = [(-.24, -.11), (.14, -.11), (.27, -.01), (.21, .13), (-.07, .20), (-.24, .12)]
    sidepod = loft([[(x * scale + shift, y * scale, z + (cut[j] if cut else 0))
                     for j, (x, y) in enumerate(pod_profile)]
                    for z, scale, shift, cut in [(-.43, .7, -.03, None), (-.24, 1, 0, None),
                                                  (.12, .88, -.015, None), (.36, .57, -.05, [0, -.05, .04, -.07, .05, -.03])]])
    mirror = combine(box(-.17, .035, -.055, -.025, -.018, .018),
                     prism([(-.035, -.065), (.15, -.065), (.19, -.025), (.17, .065), (-.02, .065), (-.06, .02)], -.03, .085))
    nose_profile = [(-.5, -.5), (.5, -.5), (.5, .15), (.30, .5), (-.30, .5), (-.5, .15)]
    nose = loft([[(x * width, y * height - .08 * z, z + (cut[j] if cut else 0))
                  for j, (x, y) in enumerate(nose_profile)]
                 for z, width, height, cut in [(-.38, .35, .18, None), (.12, .25, .13, None),
                                               (.40, .13, .085, [0, .04, -.03, .06, -.05, .015])]])
    panel_a = prism([(-.29, -.15), (.13, -.20), (.31, -.02), (.12, .18), (-.04, .13), (-.25, .20)], -.009, .018,
                    lambda x, z: .13 * x + .07 * z)
    panel_b = prism([(-.16, -.26), (.20, -.12), (.13, .16), (-.04, .29), (-.19, .10)], -.008, .016,
                    lambda x, z: -.09 * x + .16 * z)
    names = ['broken_front_wing', 'half_sidepod', 'mirror', 'nose_fragment', 'body_panel_a', 'body_panel_b']
    return list(zip(names, [wing, sidepod, mirror, nose, panel_a, panel_b]))


class GLB:
    def __init__(self, materials):
        self.data = bytearray()
        self.doc = dict(asset={'version': '2.0', 'generator': 'Bakasun original CC0 crash pack v1',
                               'copyright': 'CC0-1.0; original procedural assets'},
                        scene=0, scenes=[{'nodes': []}], nodes=[], meshes=[], materials=materials,
                        buffers=[{}], bufferViews=[], accessors=[])

    def view(self, data, target=None):
        self.data.extend(b'\0' * (-len(self.data) % 4))
        view = dict(buffer=0, byteOffset=len(self.data), byteLength=len(data))
        if target:
            view['target'] = target
        self.doc['bufferViews'].append(view)
        self.data.extend(data)
        return len(self.doc['bufferViews']) - 1

    def accessor(self, values, size, kind=5126):
        flat = [c for v in values for c in v] if size > 1 else values
        data = struct.pack('<' + ('f' if kind == 5126 else 'H') * len(flat), *flat)
        entry = dict(bufferView=self.view(data, 34963 if kind != 5126 else 34962), componentType=kind,
                     count=len(values), type={1: 'SCALAR', 2: 'VEC2', 3: 'VEC3'}[size])
        if size == 3:
            entry.update(min=[min(v[i] for v in values) for i in range(3)], max=[max(v[i] for v in values) for i in range(3)])
        self.doc['accessors'].append(entry)
        return len(self.doc['accessors']) - 1

    def mesh(self, name, vertices, faces, normals=None, uvs=None):
        lo = [min(v[i] for v in vertices) for i in range(3)]
        hi = [max(v[i] for v in vertices) for i in range(3)]
        center = [(lo[i] + hi[i]) / 2 for i in range(3)]
        vertices = [[v[i] - center[i] for i in range(3)] for v in vertices]
        if normals is None:
            flat_v, normals = [], []
            for face in faces:
                tri = [vertices[i] for i in face]
                flat_v.extend(tri)
                normals.extend([normal(*tri)] * 3)
            vertices = flat_v
            faces = [tuple(range(i, i + 3)) for i in range(0, len(vertices), 3)]
        attributes = dict(POSITION=self.accessor(vertices, 3), NORMAL=self.accessor(normals, 3))
        if uvs:
            attributes['TEXCOORD_0'] = self.accessor(uvs, 2)
        indices = self.accessor([i for face in faces for i in face], 1, 5123)
        self.doc['meshes'].append(dict(name=name, primitives=[dict(attributes=attributes, indices=indices, material=0, mode=4)]))
        index = len(self.doc['nodes'])
        self.doc['nodes'].append(dict(name=name, mesh=len(self.doc['meshes']) - 1))
        self.doc['scenes'][0]['nodes'].append(index)
        return dict(name=name, triangles=len(faces), dimensions=[round(hi[i] - lo[i], 5) for i in range(3)])

    def save(self, filename):
        self.doc['buffers'][0]['byteLength'] = len(self.data)
        raw = json.dumps(self.doc, separators=(',', ':'), ensure_ascii=True).encode()
        raw += b' ' * (-len(raw) % 4)
        self.data.extend(b'\0' * (-len(self.data) % 4))
        body = struct.pack('<2I', len(raw), 0x4e4f534a) + raw + struct.pack('<2I', len(self.data), 0x004e4942) + self.data
        (ROOT / filename).write_bytes(struct.pack('<3I', 0x46546c67, 2, len(body) + 12) + body)


def models(texture):
    glb = GLB([dict(name='car_paint_tint', pbrMetallicRoughness=dict(baseColorFactor=[1, 1, 1, 1], metallicFactor=.15, roughnessFactor=.57))])
    pieces = [glb.mesh(name, *geometry) for name, geometry in debris()]
    assert len(pieces) == 6 and all(p['triangles'] <= 60 for p in pieces)
    glb.save('body-fragments.glb')
    tire = GLB([dict(name='unbranded_slick_rubber', pbrMetallicRoughness=dict(
        baseColorFactor=[1, 1, 1, 1], baseColorTexture={'index': 0}, metallicFactor=0, roughnessFactor=.94))])
    tire.doc.update(images=[dict(name='formula-tire-128', bufferView=tire.view(texture), mimeType='image/png')],
                    samplers=[dict(magFilter=9729, minFilter=9987, wrapS=10497, wrapT=10497)],
                    textures=[dict(source=0, sampler=0)])
    # Ten circumferential segments times six profile edges times two = 120 triangles.
    profile = [(-.13, .205), (-.19, .28), (-.13, .355), (.13, .355), (.19, .28), (.13, .205)]
    vertices, normals, uv, faces = [], [], [], []
    for i in range(11):
        angle = i * 2 * math.pi / 10
        for j in range(7):
            x, radius = profile[j % 6]
            previous, following = profile[(j - 1) % 6], profile[(j + 1) % 6]
            a = unit([-(radius - previous[1]), x - previous[0]])
            b = unit([-(following[1] - radius), following[0] - x])
            nx, nr = unit([a[0] + b[0], a[1] + b[1]])
            vertices.append((x, radius * math.cos(angle), radius * math.sin(angle)))
            normals.append((nx, nr * math.cos(angle), nr * math.sin(angle)))
            uv.append((i / 10, j / 6))
    for i in range(10):
        for j in range(6):
            a, b = i * 7 + j, (i + 1) * 7 + j
            faces.extend([(a, b, b + 1), (a, b + 1, a + 1)])
    wheel = tire.mesh('formula_tire', vertices, faces, normals, uv)
    tire.save('formula-tire.glb')
    return pieces, wheel


def main():
    atlases()
    pieces, tire = models(tire_texture())
    def file_info(filename):
        data = (ROOT / filename).read_bytes()
        return dict(file=filename, bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    manifest = dict(schemaVersion=1, id='racing-crash-fx-v1', license='CC0-1.0', original=True, generator='generate.py', seed=SEED,
                    compression='none', units='meters', upAxis='+Y', forwardAxis='+Z', axleAxis='+X',
                    atlases=[dict(id=kind, **file_info(filename), width=256, height=256, columns=4, rows=4,
                                  frameCount=16, frameWidth=64, frameHeight=64, frameOrder='row-major-top-left',
                                  alpha='straight', transparentGutter=3, blending=blend, fps=fps, loop=False)
                             for kind, filename, blend, fps in [('sparks', 'sparks-atlas.png', 'AdditiveBlending', 40),
                                                               ('smoke-dust', 'smoke-dust-atlas.png', 'NormalBlending', 20)]],
                    models=[dict(id='body-fragments', **file_info('body-fragments.glb'), triangleLimitPerMesh=60,
                                 triangles=sum(p['triangles'] for p in pieces), material='car_paint_tint', meshes=pieces),
                            dict(id='formula-tire', **file_info('formula-tire.glb'), triangleLimitPerMesh=120,
                                 triangles=tire['triangles'], material='unbranded_slick_rubber', meshes=[tire],
                                 texture=dict(**file_info('formula-tire-128.png'), width=128, height=128, embedded=True))])
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({m['file']: m['triangles'] for m in manifest['models']}))


if __name__ == '__main__':
    main()
