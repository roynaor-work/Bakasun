"""Independently import final Draco GLBs with Blender; never rebuild their source."""
import bpy
import json
import math
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out = pathlib.Path(args[args.index("--out") + 1]) if "--out" in args else root / "validation-models.json"
records = []

for filename in sorted(root.rglob("*.glb")):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(filename))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    assert meshes, f"{filename.name}: no decoded meshes"
    triangles = vertices = uv_triangles = 0
    minimum = [math.inf] * 3
    maximum = [-math.inf] * 3
    names = []
    anchors = {}
    for obj in bpy.context.scene.objects:
        p = obj.matrix_world.translation
        if obj.type == "EMPTY" and obj.name.startswith("anchor_"):
            anchors[obj.name] = [float(p.x), float(p.z), float(-p.y)]
    for obj in meshes:
        names.append(obj.name)
        mesh = obj.data
        mesh.calc_loop_triangles()
        assert mesh.uv_layers, f"{filename.name}/{obj.name}: no UV0"
        uv = mesh.uv_layers[0].data
        for vertex in mesh.vertices:
            assert all(math.isfinite(v) for v in vertex.co), f"{filename.name}: nonfinite vertex"
            p = obj.matrix_world @ vertex.co
            position = (p.x, p.z, -p.y)  # Blender Z-up -> delivered glTF Y-up.
            for axis in range(3):
                minimum[axis] = min(minimum[axis], position[axis])
                maximum[axis] = max(maximum[axis], position[axis])
        vertices += len(mesh.vertices)
        for triangle in mesh.loop_triangles:
            a, b, c = [mesh.vertices[i].co for i in triangle.vertices]
            assert (b - a).cross(c - a).length > 1e-10, f"{filename.name}/{obj.name}: degenerate geometry at triangle {triangle.index}, vertices {tuple(triangle.vertices)}: {tuple(a)}, {tuple(b)}, {tuple(c)}"
            coords = [uv[i].uv for i in triangle.loops]
            assert all(math.isfinite(v) for p in coords for v in p), f"{filename.name}: nonfinite UV"
            a, b, c = coords
            area = abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x))
            assert area > 1e-12, f"{filename.name}/{obj.name}: degenerate UV triangle"
            uv_triangles += 1
        triangles += len(mesh.loop_triangles)
        for normal in mesh.corner_normals:
            assert all(math.isfinite(v) for v in normal.vector), f"{filename.name}: nonfinite normal"
            assert normal.vector.length > .9, f"{filename.name}: invalid normal"
    records.append({"file": filename.relative_to(root).as_posix(), "triangles": triangles,
                    "vertices": vertices, "uvTriangles": uv_triangles,
                    "finiteVerticesNormalsUvs": True, "nondegenerateGeometryAndUVs": True,
                    "boundsGltf": {"min": minimum, "max": maximum},
                    "meshNames": sorted(names), "anchorsGltf": anchors})

assert records, "No GLBs found"
result = {"allPassed": True, "decoder": "Blender glTF importer (final compressed files)",
          "blenderVersion": bpy.app.version_string, "models": records}
out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"allPassed": True, "models": len(records), "triangles": sum(r["triangles"] for r in records)}))
