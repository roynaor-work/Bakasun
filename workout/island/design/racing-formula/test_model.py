#!/usr/bin/env python3
"""Load and validate formula.glb, including a real Blender import.

Run: python3 test_model.py
Only the Python standard library and Blender are required. The GLB reader is
independent of the authoring script and derives bounds from the actual vertices.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
import shutil
import struct
import subprocess
import unittest


MODEL = Path(__file__).resolve().with_name("formula.glb")
WHEELS = ("WheelFrontL", "WheelFrontR", "WheelRearL", "WheelRearR")
REQUIRED = ("Body", "FrontWing", "RearWing", "Cockpit", "Helmet") + WHEELS
IDENTITY = ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1))


def multiply(a, b):
    return tuple(tuple(sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4))
                 for r in range(4))


def transform(matrix, point):
    return tuple(sum(matrix[r][c] * point[c] for c in range(3)) + matrix[r][3]
                 for r in range(3))


def local_matrix(node):
    if "matrix" in node:
        return tuple(tuple(node["matrix"][c * 4 + r] for c in range(4))
                     for r in range(4))
    x, y, z, w = node.get("rotation", (0, 0, 0, 1))
    scale = node.get("scale", (1, 1, 1))
    offset = node.get("translation", (0, 0, 0))
    rotation = (
        (1 - 2 * (y*y + z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)),
        (2 * (x*y + z*w), 1 - 2 * (x*x + z*z), 2 * (y*z - x*w)),
        (2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2 * (x*x + y*y)),
    )
    return tuple(tuple(rotation[r][c] * scale[c] for c in range(3)) + (offset[r],)
                 for r in range(3)) + ((0, 0, 0, 1),)


def bounds(points):
    return (tuple(min(p[i] for p in points) for i in range(3)),
            tuple(max(p[i] for p in points) for i in range(3)))


class GLB:
    """Small binary glTF reader for uncompressed, embedded triangle assets."""

    COMPONENTS = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
    WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

    def __init__(self, path):
        data = path.read_bytes()
        if len(data) < 20:
            raise ValueError("Truncated GLB")
        magic, version, length = struct.unpack_from("<4sII", data)
        if magic != b"glTF" or version != 2 or length != len(data):
            raise ValueError("Invalid GLB 2.0 header or file length")
        chunks = []
        cursor = 12
        while cursor < length:
            size, kind = struct.unpack_from("<II", data, cursor)
            cursor += 8
            if size % 4 or cursor + size > length:
                raise ValueError("Invalid GLB chunk alignment or range")
            chunks.append((kind, data[cursor:cursor+size]))
            cursor += size
        if cursor != length or len(chunks) != 2:
            raise ValueError("Expected JSON and embedded BIN chunks")
        if [c[0] for c in chunks] != [0x4E4F534A, 0x004E4942]:
            raise ValueError("Unexpected GLB chunk types")
        self.doc = json.loads(chunks[0][1])
        self.binary = chunks[1][1]
        self.nodes = self.doc["nodes"]
        self.named = {node.get("name"): i for i, node in enumerate(self.nodes)}
        self.instances = []
        self.world = {}
        scene = self.doc["scenes"][self.doc.get("scene", 0)]

        def visit(index, parent, ancestry):
            if index in ancestry or index in self.world:
                raise ValueError("Cyclic or multiply parented node")
            node = self.nodes[index]
            matrix = multiply(parent, local_matrix(node))
            self.world[index] = matrix
            if "mesh" in node:
                self.instances.append((index, node["mesh"], matrix))
            for child in node.get("children", []):
                visit(child, matrix, ancestry | {index})

        for root in scene["nodes"]:
            visit(root, IDENTITY, set())

    def accessor(self, index):
        accessor = self.doc["accessors"][index]
        if "sparse" in accessor:
            raise ValueError("Unexpected sparse accessor")
        view = self.doc["bufferViews"][accessor["bufferView"]]
        if view.get("buffer", 0) != 0:
            raise ValueError("Unexpected external buffer")
        fmt = "<" + self.COMPONENTS[accessor["componentType"]] * self.WIDTHS[accessor["type"]]
        size = struct.calcsize(fmt)
        stride = view.get("byteStride", size)
        start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
        end = start + max(0, accessor["count"] - 1) * stride + size
        if stride < size or end > len(self.binary):
            raise ValueError("Accessor escapes the binary buffer")
        if end > view.get("byteOffset", 0) + view["byteLength"]:
            raise ValueError("Accessor escapes its bufferView")
        return [struct.unpack_from(fmt, self.binary, start + i * stride)
                for i in range(accessor["count"])]

    def mesh_points(self, mesh_index):
        return [point for primitive in self.doc["meshes"][mesh_index]["primitives"]
                for point in self.accessor(primitive["attributes"]["POSITION"])]

    def node_points(self, name):
        index = self.named[name]
        return [transform(self.world[index], p)
                for p in self.mesh_points(self.nodes[index]["mesh"])]

    def triangle_count(self):
        count = 0
        for _, mesh_index, _ in self.instances:
            for primitive in self.doc["meshes"][mesh_index]["primitives"]:
                count += len(self.accessor(primitive["indices"])) // 3
        return count


class FormulaModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = GLB(MODEL)
        cls.doc = cls.model.doc

    def test_embedded_glb(self):
        self.assertEqual(self.doc["asset"]["version"], "2.0")
        self.assertEqual(len(self.doc["buffers"]), 1)
        self.assertNotIn("uri", self.doc["buffers"][0])
        self.assertLessEqual(self.doc["buffers"][0]["byteLength"], len(self.model.binary))
        self.assertFalse(self.doc.get("extensionsRequired", []), "No runtime codec should be required")
        self.assertFalse(self.doc.get("images", []), "Paint and details must remain self-contained materials")

    def test_required_mesh_nodes(self):
        names = [n.get("name") for n in self.model.nodes]
        for name in REQUIRED:
            with self.subTest(node=name):
                self.assertEqual(names.count(name), 1)
                index = self.model.named[name]
                self.assertIn(index, self.model.world)
                self.assertIn("mesh", self.model.nodes[index])
        wheel_meshes = [self.model.nodes[self.model.named[n]]["mesh"] for n in WHEELS]
        self.assertEqual(len(wheel_meshes), 4)  # Four independently transformable nodes.

    def test_geometry_integrity_and_budget(self):
        for mesh in self.doc["meshes"]:
            for primitive in mesh["primitives"]:
                self.assertEqual(primitive.get("mode", 4), 4)
                points = self.model.accessor(primitive["attributes"]["POSITION"])
                normals = self.model.accessor(primitive["attributes"]["NORMAL"])
                indices = [v[0] for v in self.model.accessor(primitive["indices"])]
                self.assertEqual(len(indices) % 3, 0)
                self.assertEqual(len(points), len(normals))
                self.assertTrue(points)
                self.assertTrue(all(math.isfinite(v) for p in points + normals for v in p))
                self.assertTrue(all(0 <= i < len(points) for i in indices))
                self.assertTrue(all(abs(sum(v*v for v in n) - 1) < 0.025 for n in normals))
                for a, b, c in zip(indices[::3], indices[1::3], indices[2::3]):
                    ab = [points[b][i] - points[a][i] for i in range(3)]
                    ac = [points[c][i] - points[a][i] for i in range(3)]
                    cross = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]]
                    self.assertGreater(sum(v*v for v in cross), 1e-20, "Degenerate triangle")
        count = self.model.triangle_count()
        self.assertGreater(count, 0)
        self.assertLessEqual(count, 12_000)

    def test_length_ground_center_and_body_origin(self):
        scene = self.doc["scenes"][self.doc.get("scene", 0)]
        self.assertEqual(len(scene["nodes"]), 1, "The model should have a single scene root")
        root_matrix = local_matrix(self.model.nodes[scene["nodes"][0]])
        for row in range(4):
            for column in range(4):
                self.assertAlmostEqual(root_matrix[row][column], IDENTITY[row][column], delta=0.0001)
        points = [transform(matrix, p) for _, mesh, matrix in self.model.instances
                  for p in self.model.mesh_points(mesh)]
        low, high = bounds(points)
        self.assertAlmostEqual(high[2] - low[2], 4.6, delta=0.0001)
        self.assertAlmostEqual(low[1], 0, delta=0.0001)
        self.assertAlmostEqual(low[0] + high[0], 0, delta=0.0001)
        self.assertAlmostEqual(low[2] + high[2], 0, delta=0.0001)
        origin = transform(self.model.world[self.model.named["Body"]], (0, 0, 0))
        for value in origin:
            self.assertAlmostEqual(value, 0, delta=0.0001)

    def test_wheel_axles_and_forward_direction(self):
        centers = {}
        for name in WHEELS:
            index = self.model.named[name]
            centers[name] = transform(self.model.world[index], (0, 0, 0))
            matrix = self.model.world[index]
            for axis in range(3):
                self.assertAlmostEqual(matrix[axis][0], 1 if axis == 0 else 0, delta=0.0001,
                                       msg=f"{name} must rotate around local X without scale")
            local = self.model.mesh_points(self.model.nodes[index]["mesh"])
            low, high = bounds(local)
            for axis in range(3):
                self.assertAlmostEqual(low[axis] + high[axis], 0, delta=0.0001,
                                       msg=f"{name} pivot must be centered on the axle")
            self.assertGreater(high[1] - low[1], high[0] - low[0])
            self.assertAlmostEqual(high[1] - low[1], high[2] - low[2], delta=0.001)
            self.assertGreater(centers[name][1], 0)
            self.assertAlmostEqual(min(p[1] for p in self.model.node_points(name)), 0, delta=0.0001)
        for end in ("Front", "Rear"):
            left, right = centers[f"Wheel{end}L"], centers[f"Wheel{end}R"]
            self.assertGreater(left[0], 0)
            self.assertLess(right[0], 0)
            self.assertAlmostEqual(left[0], -right[0], delta=0.0001)
            self.assertAlmostEqual(left[1], right[1], delta=0.0001)
            self.assertAlmostEqual(left[2], right[2], delta=0.0001)
        self.assertGreater(centers["WheelFrontL"][2], centers["WheelRearL"][2])
        part_z = {name: sum(p[2] for p in self.model.node_points(name)) / len(self.model.node_points(name))
                  for name in ("FrontWing", "RearWing", "Helmet")}
        self.assertGreater(part_z["FrontWing"], part_z["Helmet"])
        self.assertGreater(part_z["Helmet"], part_z["RearWing"])

    def test_shared_recolorable_paint(self):
        materials = self.doc["materials"]
        paint_indices = [i for i, m in enumerate(materials) if m.get("name") == "Paint 1"]
        self.assertEqual(len(paint_indices), 1)
        paint = paint_indices[0]
        body = self.model.nodes[self.model.named["Body"]]["mesh"]
        self.assertIn(paint, [p["material"] for p in self.doc["meshes"][body]["primitives"]])
        uses = [mesh for mesh in self.doc["meshes"]
                if any(p.get("material") == paint for p in mesh["primitives"])]
        self.assertGreaterEqual(len(uses), 3, "Body and both wings should share the paint material")
        self.assertNotIn("baseColorTexture", materials[paint].get("pbrMetallicRoughness", {}))
        self.assertNotIn("COLOR_0", self.doc["meshes"][body]["primitives"][0]["attributes"])

    def test_real_blender_import(self):
        blender = shutil.which("blender")
        self.assertIsNotNone(blender, "Install Blender to run the real GLB loading test")
        script = '''
import bpy, json
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
result = bpy.ops.import_scene.gltf(filepath=MODEL_PATH)
assert result == {'FINISHED'}, result
for name in REQUIRED_NAMES:
    assert name in bpy.data.objects, name
    assert bpy.data.objects[name].type == 'MESH', name
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
points = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
low = [min(p[i] for p in points) for i in range(3)]
high = [max(p[i] for p in points) for i in range(3)]
assert abs(high[1] - low[1] - 4.6) < 0.0001, (low, high)
assert abs(low[2]) < 0.0001, low
assert abs(high[0] + low[0]) < 0.0001, (low, high)
assert abs(high[1] + low[1]) < 0.0001, (low, high)
count = 0
for obj in meshes:
    obj.data.calc_loop_triangles()
    count += len(obj.data.loop_triangles)
assert 0 < count <= 12000, count
assert 'Paint 1' in bpy.data.materials
print('FORMULA_IMPORT_OK ' + json.dumps({'meshes': len(meshes), 'triangles': count, 'bounds': [low, high]}))
'''
        script = f"MODEL_PATH = {str(MODEL)!r}\nREQUIRED_NAMES = {REQUIRED!r}\n" + script
        result = subprocess.run([blender, "--background", "--factory-startup", "--python-exit-code", "1",
                                 "--python-expr", script], capture_output=True, text=True, timeout=120,
                                env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        output = result.stdout + result.stderr
        self.assertEqual(result.returncode, 0, output[-6000:])
        self.assertIn("FORMULA_IMPORT_OK ", output, output[-6000:])
        print(next(line for line in output.splitlines() if line.startswith("FORMULA_IMPORT_OK ")))


if __name__ == "__main__":
    unittest.main(verbosity=2)
