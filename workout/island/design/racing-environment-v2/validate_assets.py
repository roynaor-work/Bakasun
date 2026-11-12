#!/usr/bin/env python3
"""Independently read and validate every delivered file. Requires Pillow + NumPy.

Run: PYTHONDONTWRITEBYTECODE=1 python validate_assets.py
No generator is imported and no file is rewritten.
"""
from __future__ import annotations

import ast
import hashlib
import io
import json
import math
import re
import struct
import subprocess
import unittest
from html.parser import HTMLParser
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
MODELS = ('grandstand', 'pit-building', 'start-gantry', 'control-tower',
          'tire-barrier', 'chainlink-fence', 'sponsor-board')
TILES = ('asphalt-clean', 'asphalt-skid', 'kerb-red-white', 'kerb-normal',
         'gravel-runoff', 'grass-01', 'grass-02', 'grass-03',
         'concrete-barrier', 'tire-barrier', 'paint-white', 'paint-yellow',
         'asphalt-pits')
DTYPES = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2',
          5125: '<u4', 5126: '<f4'}
WIDTHS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    data = path.read_bytes()
    assert len(data) >= 20, path
    magic, version, size = struct.unpack_from('<4sII', data)
    assert magic == b'glTF' and version == 2 and size == len(data), path
    chunks, offset = [], 12
    while offset < len(data):
        length, kind = struct.unpack_from('<II', data, offset)
        assert length % 4 == 0 and offset + 8 + length <= len(data), path
        chunks.append((kind, data[offset + 8:offset + 8 + length]))
        offset += 8 + length
    assert [k for k, _ in chunks] == [0x4e4f534a, 0x004e4942], path
    doc = json.loads(chunks[0][1])
    binary = chunks[1][1]
    assert doc['asset']['version'] == '2.0'
    assert len(doc['buffers']) == 1 and 'uri' not in doc['buffers'][0]
    assert len(binary) - 3 <= doc['buffers'][0]['byteLength'] <= len(binary)
    for view in doc['bufferViews']:
        assert view.get('buffer', 0) == 0
        assert 0 <= view.get('byteOffset', 0)
        assert view.get('byteOffset', 0) + view['byteLength'] <= len(binary)
    for image in doc.get('images', []):
        assert image['mimeType'] in ('image/png', 'image/jpeg')
        view = doc['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        with Image.open(io.BytesIO(binary[start:start + view['byteLength']])) as im:
            im.load()
            assert max(im.size) <= 1024
    return doc, binary


def accessor(doc, binary, index):
    acc = doc['accessors'][index]
    assert not acc.get('sparse')
    view = doc['bufferViews'][acc['bufferView']]
    dtype = np.dtype(DTYPES[acc['componentType']])
    width = WIDTHS[acc['type']]
    row = width * dtype.itemsize
    stride = view.get('byteStride', row)
    relative = acc.get('byteOffset', 0)
    assert relative + (acc['count'] - 1) * stride + row <= view['byteLength']
    result = np.ndarray((acc['count'], width), dtype=dtype, buffer=binary,
                        offset=view.get('byteOffset', 0) + relative,
                        strides=(stride, dtype.itemsize)).copy()
    assert np.isfinite(result).all()
    return result


def cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]


def signed_area(poly):
    if len(poly) < 3:
        return 0.0
    a = poly[0]
    return sum(cross2(b - a, c - a)
               for b, c in zip(poly[1:-1], poly[2:])) / 2


def intersection_area(a, b):
    """Convex Sutherland-Hodgman clipping, retaining shared edges at zero area."""
    poly = list(a)
    if signed_area(b) < 0:
        b = b[::-1]
    for start, end in zip(b, np.roll(b, -1, axis=0)):
        output = []
        if not poly:
            return 0.0
        prev = poly[-1]
        prev_side = cross2(end - start, prev - start)
        for point in poly:
            side = cross2(end - start, point - start)
            if (side >= -1e-12) != (prev_side >= -1e-12):
                output.append(prev + (point - prev) * prev_side / (prev_side - side))
            if side >= -1e-12:
                output.append(point)
            prev, prev_side = point, side
        poly = output
    return abs(signed_area(poly))


def assert_unique_uv(triangles):
    # Spatial bins avoid quadratic comparisons on the dense diamond fence.
    cells, checked = {}, set()
    for index, tri in enumerate(triangles):
        assert abs(signed_area(tri)) > 1e-12, 'Degenerate UV triangle'
        lower = np.floor(tri.min(axis=0) * 40).astype(int)
        upper = np.floor(tri.max(axis=0) * 40).astype(int)
        for x in range(lower[0], upper[0] + 1):
            for y in range(lower[1], upper[1] + 1):
                bucket = cells.setdefault((x, y), [])
                for other in bucket:
                    pair = (other, index)
                    if pair in checked:
                        continue
                    checked.add(pair)
                    a = triangles[other]
                    if np.any(a.max(axis=0) <= tri.min(axis=0) + 1e-10) or np.any(tri.max(axis=0) <= a.min(axis=0) + 1e-10):
                        continue
                    assert intersection_area(a, tri) < 1e-9, f'UV overlap: triangles {other}, {index}'
                bucket.append(index)


def node_matrix(node):
    if 'matrix' in node:
        return np.array(node['matrix']).reshape((4, 4), order='F')
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    matrix = np.eye(4)
    matrix[:3, :3] = [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                      [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                      [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]
    matrix[:3, :3] *= np.array(node.get('scale', [1, 1, 1]))
    matrix[:3, 3] = node.get('translation', [0, 0, 0])
    return matrix


def geometry_summary(doc, binary):
    triangles = 0
    for mesh in doc['meshes']:
        assert mesh.get('name') and len(mesh['primitives']) == 1, 'One material per part'
        all_uv = []
        for primitive in mesh['primitives']:
            assert primitive.get('mode', 4) == 4 and not primitive.get('extensions')
            pos = accessor(doc, binary, primitive['attributes']['POSITION'])
            norm = accessor(doc, binary, primitive['attributes']['NORMAL'])
            uv = accessor(doc, binary, primitive['attributes']['TEXCOORD_0'])
            indices = accessor(doc, binary, primitive['indices']).reshape(-1)
            assert len(indices) % 3 == 0 and indices.min() >= 0 and indices.max() < len(pos)
            assert len(norm) == len(uv) == len(pos)
            assert np.allclose(np.linalg.norm(norm, axis=1), 1, atol=.003)
            assert uv.min() >= 0 and uv.max() <= 1
            faces = indices.reshape(-1, 3)
            edge1, edge2 = pos[faces[:, 1]] - pos[faces[:, 0]], pos[faces[:, 2]] - pos[faces[:, 0]]
            assert (np.linalg.norm(np.cross(edge1, edge2), axis=1) > 1e-9).all(), 'Degenerate geometry'
            all_uv.extend(uv[faces].astype(float))
            assert 0 <= primitive['material'] < len(doc['materials'])
            triangles += len(faces)
        assert_unique_uv(np.array(all_uv))
    world_points = []

    def visit(index, parent):
        node = doc['nodes'][index]
        assert re.fullmatch(r'[A-Za-z][A-Za-z0-9_ .-]*', node['name']), node['name']
        matrix = parent @ node_matrix(node)
        if 'mesh' in node:
            for p in doc['meshes'][node['mesh']]['primitives']:
                pos = accessor(doc, binary, p['attributes']['POSITION'])
                world_points.extend((matrix @ np.column_stack((pos, np.ones(len(pos)))).T).T[:, :3])
        for child in node.get('children', []):
            visit(child, matrix)

    roots = doc['scenes'][doc.get('scene', 0)]['nodes']
    assert len(roots) == 1 and np.allclose(node_matrix(doc['nodes'][roots[0]]), np.eye(4))
    visit(roots[0], np.eye(4))
    points = np.array(world_points)
    lower, upper = points.min(axis=0), points.max(axis=0)
    assert abs(lower[1]) < 1e-5, ('Base is not on ground', lower)
    assert abs(lower[0] + upper[0]) < 1e-4 and abs(lower[2] + upper[2]) < 1e-4, ('Base is not centered', lower, upper)
    return triangles, lower.tolist(), upper.tolist()


class AssetPackTests(unittest.TestCase):
    def test_01_load_every_file_and_licenses(self):
        licenses = (HERE / 'LICENSES.md').read_text()
        files = [p for p in HERE.rglob('*') if p.is_file()]
        self.assertLessEqual(sum(p.stat().st_size for p in files), 4_000_000)
        for path in files:
            with self.subTest(file=str(path.relative_to(HERE))):
                data = path.read_bytes()
                self.assertTrue(data)
                self.assertIn('`' + path.relative_to(HERE).as_posix() + '`', licenses)
                suffix = path.suffix
                if suffix == '.glb':
                    read_glb(path)
                elif suffix in ('.webp', '.jpg', '.jpeg', '.png'):
                    with Image.open(path) as image:
                        image.load()
                elif suffix == '.json':
                    json.loads(data)
                else:
                    text = data.decode('utf-8')
                    if suffix == '.py':
                        ast.parse(text)
                    elif suffix == '.mjs':
                        subprocess.run(['node', '--check', str(path)], check=True, capture_output=True)
                    elif suffix == '.html':
                        HTMLParser().feed(text)

    def test_02_runtime_glbs_and_uv(self):
        self.assertEqual({p.stem for p in (HERE / 'runtime').glob('*.glb')}, set(MODELS))
        for name in MODELS:
            with self.subTest(model=name):
                path = HERE / 'runtime' / (name + '.glb')
                self.assertLessEqual(path.stat().st_size, 300_000)
                doc, binary = read_glb(path)
                self.assertFalse(set(doc.get('extensionsUsed', [])) & {'KHR_draco_mesh_compression', 'EXT_meshopt_compression'})
                triangles, lower, upper = geometry_summary(doc, binary)
                if name == 'grandstand':
                    self.assertLessEqual(triangles, 4000)
                    self.assertAlmostEqual(upper[0] - lower[0], 20, places=4)
                    self.assertTrue(doc.get('images'), 'Painted crowd must be embedded')
                if name == 'pit-building':
                    self.assertLessEqual(triangles, 6000)
                if name == 'start-gantry':
                    for i in range(1, 6):
                        lights = [n for n in doc['nodes'] if n['name'] == 'Light' + str(i)]
                        self.assertEqual(len(lights), 1)
                        for p in doc['meshes'][lights[0]['mesh']]['primitives']:
                            emission = doc['materials'][p['material']]['emissiveFactor']
                            self.assertGreater(emission[0], .5)
                            self.assertGreater(emission[0], 10 * max(emission[1:]))

    def test_03_decoded_texture_tiles(self):
        for name in TILES:
            with self.subTest(texture=name):
                path = HERE / 'textures' / (name + '.webp')
                with Image.open(path) as image:
                    self.assertLessEqual(max(image.size), 1024)
                    self.assertEqual(image.format, 'WEBP')
                    pixels = np.array(image.convert('RGB'))
                self.assertTrue(np.array_equal(pixels[0], pixels[-1]), 'Horizontal boundary seam')
                self.assertTrue(np.array_equal(pixels[:, 0], pixels[:, -1]), 'Vertical boundary seam')
                if name == 'kerb-normal':
                    normals = pixels.astype(float) / 127.5 - 1
                    self.assertTrue((normals[:, :, 2] > .5).all())
                    self.assertTrue(np.allclose(np.linalg.norm(normals, axis=2), 1, atol=.025))

    def test_04_inventory_hashes_and_render_evidence(self):
        manifest = json.loads((HERE / 'manifest.json').read_text())
        actual = {p.relative_to(HERE).as_posix(): p.stat().st_size
                  for p in HERE.rglob('*') if p.is_file()}
        recorded = {entry['file']: entry['bytes'] for entry in manifest['files']}
        self.assertEqual(recorded, actual, 'Refresh build_catalog.py after changing files')
        for entry in manifest['models'] + manifest['textures']:
            with self.subTest(asset=entry['file']):
                data = (HERE / entry['file']).read_bytes()
                self.assertEqual(len(data), entry['bytes'])
                self.assertEqual(hashlib.sha256(data).hexdigest(), entry['sha256'])
        browser = json.loads((HERE / 'evidence' / 'browser.json').read_text())
        self.assertEqual(browser['result'], 'PASS')
        self.assertEqual(browser['errors'], [])
        self.assertEqual(browser['textureCount'], 15)
        self.assertEqual({row['name'] for row in browser['models']}, set(MODELS))
        self.assertEqual(browser['webAssembly'], 'unavailable before module startup')
        for row in browser['models']:
            self.assertTrue(row['rendered'])
            self.assertGreater(row['drawStats']['triangles'], 100)


if __name__ == '__main__':
    unittest.main(verbosity=2)
