#!/usr/bin/env python3
"""Validate the shipped GLBs from their binary geometry, independently of the author.

Run from any directory. Requires Python 3 and numpy. For the official Khronos
validator too, install gltf-validator@2.0.0-dev.3.10 outside this repository and
pass --validator-module /absolute/path/to/node_modules/gltf-validator.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
STATES = ("intact", "damaged", "ruined")
TYPES = ("coastal-gun", "watchtower", "gate", "ammo-depot")
EXPECTED = {(style, kind) for style in ("coastal", "palace", "submarine") for kind in TYPES}
EXPECTED.add(("submarine", "submarine-pen"))
COMPONENTS = {5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
TARGETS = {"coastal-gun": (7, 3, 6), "watchtower": (5, 11, None), "gate": (22, 9, None), "ammo-depot": (9, 4, None), "submarine-pen": (12, 7, 10)}


class Model:
    def __init__(self, path):
        self.path = path
        self.raw = path.read_bytes()
        assert len(self.raw) >= 20, "GLB header is truncated"
        magic, version, length = struct.unpack_from("<4sII", self.raw)
        assert magic == b"glTF" and version == 2, "Not a glTF 2 GLB"
        assert length == len(self.raw), "GLB declared length differs from file length"
        chunks = []
        offset = 12
        while offset < length:
            size, kind = struct.unpack_from("<I4s", self.raw, offset)
            assert size % 4 == 0, "GLB chunk is not four-byte aligned"
            assert offset + 8 + size <= length, "GLB chunk exceeds file length"
            chunks.append((kind, self.raw[offset + 8:offset + 8 + size]))
            offset += size + 8
        assert chunks[0][0] == b"JSON" and len(chunks) == 2 and chunks[1][0] == b"BIN\x00", "Expected JSON then one embedded BIN chunk"
        self.doc = json.loads(chunks[0][1])
        self.bin = chunks[1][1]
        self.nodes = self.doc["nodes"]
        self.parents = {}
        for i, node in enumerate(self.nodes):
            for child in node.get("children", []):
                assert child not in self.parents, "A node has multiple parents"
                self.parents[child] = i

    def accessor(self, index):
        a = self.doc["accessors"][index]
        assert "sparse" not in a, "Sparse accessors are not part of this package contract"
        view = self.doc["bufferViews"][a["bufferView"]]
        assert view.get("buffer", 0) == 0
        dtype = np.dtype(COMPONENTS[a["componentType"]])
        width = WIDTHS[a["type"]]
        stride = view.get("byteStride", dtype.itemsize * width)
        offset = view.get("byteOffset", 0) + a.get("byteOffset", 0)
        end = offset + max(0, a["count"] - 1) * stride + dtype.itemsize * width
        assert end <= view.get("byteOffset", 0) + view["byteLength"] <= len(self.bin), "Accessor exceeds its buffer view"
        arr = np.ndarray((a["count"], width), dtype=dtype, buffer=self.bin, offset=offset, strides=(stride, dtype.itemsize)).copy()
        if a.get("normalized"):
            limit = np.iinfo(dtype)
            arr = np.maximum(arr.astype(float) / limit.max, -1)
        return arr

    @staticmethod
    def local(node):
        if "matrix" in node:
            return np.array(node["matrix"], dtype=float).reshape(4, 4).T
        x, y, z, w = node.get("rotation", [0, 0, 0, 1])
        rotation = np.array([
            [1 - 2*y*y - 2*z*z, 2*x*y - 2*z*w, 2*x*z + 2*y*w],
            [2*x*y + 2*z*w, 1 - 2*x*x - 2*z*z, 2*y*z - 2*x*w],
            [2*x*z - 2*y*w, 2*y*z + 2*x*w, 1 - 2*x*x - 2*y*y],
        ])
        result = np.eye(4)
        result[:3, :3] = rotation @ np.diag(node.get("scale", [1, 1, 1]))
        result[:3, 3] = node.get("translation", [0, 0, 0])
        return result

    def world(self, index):
        result = self.local(self.nodes[index])
        visited = {index}
        while index in self.parents:
            index = self.parents[index]
            assert index not in visited, "Cycle in node hierarchy"
            visited.add(index)
            result = self.local(self.nodes[index]) @ result
        return result

    def descendants(self, index):
        result = [index]
        for child in self.nodes[index].get("children", []):
            result.extend(self.descendants(child))
        assert len(result) == len(set(result)), "Cycle in node hierarchy"
        return result

    def geometry(self, root):
        triangles, colors, materials = [], [], set()
        for ni in self.descendants(root):
            node = self.nodes[ni]
            if "mesh" not in node:
                continue
            matrix = self.world(ni)
            for primitive in self.doc["meshes"][node["mesh"]]["primitives"]:
                assert primitive.get("mode", 4) == 4, "All package primitives must be triangles"
                p = self.accessor(primitive["attributes"]["POSITION"]).astype(float)
                assert p.shape[1] == 3 and np.isfinite(p).all(), "Invalid positions"
                pos = np.column_stack((p, np.ones(len(p)))) @ matrix.T
                ix = self.accessor(primitive["indices"]).reshape(-1) if "indices" in primitive else np.arange(len(p))
                assert len(ix) % 3 == 0 and ix.max(initial=0) < len(p), "Invalid triangle indices"
                tri = pos[ix.reshape(-1, 3), :3]
                assert np.all(np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1) > 1e-8), "Degenerate triangles"
                triangles.extend(tri)
                materials.add(primitive.get("material"))
                if "COLOR_0" in primitive["attributes"]:
                    color = self.accessor(primitive["attributes"]["COLOR_0"])
                    assert color.shape[0] == len(p) and np.isfinite(color).all() and color.min() >= 0 and color.max() <= 1, "Invalid vertex colors"
                    colors.extend(color[:, :3])
                if "NORMAL" in primitive["attributes"]:
                    normal = self.accessor(primitive["attributes"]["NORMAL"])
                    assert normal.shape == p.shape and np.isfinite(normal).all(), "Invalid normals"
                    assert np.all(np.abs(np.linalg.norm(normal, axis=1) - 1) < .002), "Non-unit normals"
                    transformed_normal = normal @ np.linalg.inv(matrix[:3, :3])
                    face_normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
                    averaged_normal = transformed_normal[ix.reshape(-1, 3)].mean(axis=1)
                    assert np.all(np.einsum("ij,ij->i", face_normal, averaged_normal) > 0), "Triangle winding disagrees with vertex normals"
        assert triangles, "State contains no geometry"
        return np.array(triangles), np.array(colors), materials


def bounds(triangles):
    points = triangles.reshape(-1, 3)
    return points.min(axis=0), points.max(axis=0)


def ray_hits(triangles, origin, direction=(0, 0, 1)):
    """Two-sided Moller-Trumbore intersections, including triangle boundaries."""
    direction = np.array(direction, dtype=float)
    e1 = triangles[:, 1] - triangles[:, 0]
    e2 = triangles[:, 2] - triangles[:, 0]
    h = np.cross(direction, e2)
    det = np.einsum("ij,ij->i", e1, h)
    valid = np.abs(det) > 1e-9
    inv = np.divide(1, det, out=np.zeros_like(det), where=valid)
    s = np.array(origin) - triangles[:, 0]
    u = inv * np.einsum("ij,ij->i", s, h)
    q = np.cross(s, e1)
    v = inv * (q @ direction)
    t = inv * np.einsum("ij,ij->i", e2, q)
    return int(np.sum(valid & (u >= -1e-8) & (v >= -1e-8) & (u+v <= 1+1e-8) & (t >= 0)))


def check_asset(entry):
    path = ROOT / entry["file"]
    assert path.parent == ROOT / "models" and path.suffix == ".glb", "Unexpected model path"
    m = Model(path)
    d = m.doc
    assert d["asset"]["version"] == "2.0"
    for forbidden in ("KHR_draco_mesh_compression", "EXT_meshopt_compression"):
        assert forbidden not in json.dumps(d), f"Forbidden compression: {forbidden}"
    assert len(d.get("buffers", [])) == 1 and "uri" not in d["buffers"][0], "GLB must be self-contained"
    assert len(d.get("materials", [])) == 1, "Exactly one shared material is required"
    textures = []
    for img in d.get("images", []):
        assert "uri" not in img and "bufferView" in img, "Images must be embedded"
        view = d["bufferViews"][img["bufferView"]]
        data = m.bin[view.get("byteOffset", 0):view.get("byteOffset", 0)+view["byteLength"]]
        from io import BytesIO
        from PIL import Image
        image = Image.open(BytesIO(data))
        assert max(image.size) <= 512, "Texture exceeds 512 pixels"
        textures.append(list(image.size))
    assert len(d.get("scenes", [])) == 3, "Exactly three state scenes are required"
    default_scene = d["scenes"][d.get("scene", 0)]
    assert default_scene["name"] == "intact", "Only intact should be visible in the default scene"
    scene_by_name = {scene["name"]: scene for scene in d["scenes"]}
    assert set(scene_by_name) == set(STATES), "Missing or unexpected state scenes"
    states, state_geo, state_colors, state_roots = {}, {}, {}, {}
    for state in STATES:
        scene = scene_by_name[state]
        assert len(scene["nodes"]) == 1, "Each scene must have one state root"
        ri = scene["nodes"][0]
        state_roots[state] = ri
        assert m.nodes[ri]["name"] == state and ri not in m.parents, "State root name or parent is incorrect"
        tri, color, mats = m.geometry(ri)
        assert mats == {0}, "All primitives must share the one material"
        lo, hi = bounds(tri)
        assert abs(lo[1]) < .015, f"{state} must stand on Y=0, found {lo[1]}"
        assert len(tri) <= 1500, "State exceeds the 1500 triangle limit"
        signed_volume = float(np.einsum("ij,ij->i", tri[:, 0], np.cross(tri[:, 1], tri[:, 2])).sum()/6)
        assert signed_volume > 0, "Geometry has an inverted signed volume"
        state_geo[state], state_colors[state] = tri, color
        states[state] = {"triangles": len(tri), "min": lo.round(5).tolist(), "max": hi.round(5).tolist(), "dimensions": (hi-lo).round(5).tolist(), "signed_volume": round(signed_volume, 5)}
    assert sum(v["triangles"] for v in states.values()) <= 1500, "All three states combined exceed the conservative 1500 triangle budget"
    assert len(set(state_roots.values())) == 3, "States must be separate nodes"
    lo, hi = bounds(state_geo["intact"])
    dimensions = hi-lo
    assert np.max(np.abs((hi+lo)[[0, 2]] / 2)) <= .05, "Intact footprint must be centered on X/Z origin"
    for axis, target in enumerate(TARGETS[entry["type"]]):
        if target is not None:
            assert abs(dimensions[axis]-target) <= max(.12, target*.06), f"Unexpected dimension {axis}: {dimensions[axis]} vs target {target}"
    assert np.allclose(dimensions, entry["dimensions"], atol=.015), "Manifest dimensions do not match actual world geometry"
    assert states["ruined"]["max"][1] <= 1.405, "Ruined geometry must be a low pile, at most 1.4 units high"
    assert hashlib.sha256(state_geo["damaged"].tobytes()+state_colors["damaged"].tobytes()).digest() != hashlib.sha256(state_geo["intact"].tobytes()+state_colors["intact"].tobytes()).digest(), "Damaged geometry/colors are identical to intact"
    assert len(state_colors["damaged"]), "Soot state must carry vertex colors"
    intact_palette = {tuple(c) for c in state_colors["intact"].round(6)}
    new_dark_colors = [c for c in state_colors["damaged"].round(6) if tuple(c) not in intact_palette and float(c @ np.array([.2126, .7152, .0722])) < .08]
    assert len(new_dark_colors) >= 9, "Damaged state lacks a distinct dark soot palette"
    for state in STATES:
        assert entry["triangles"][state] == states[state]["triangles"], f"Manifest triangle mismatch for {state}"
    checks = {"self_contained": True, "one_shared_material": True, "no_compression": True, "bottom_origin": True, "centered_footprint": True, "three_separate_states": True, "default_intact_only": True, "low_ruin": True, "normal_winding_consistency": True, "positive_signed_volume": True, "distinct_soot_colors": True}
    if entry["type"] == "gate":
        samples = [(x, y) for x in (-1, 0, 1) for y in (1, 2, 3, 4, 5)]
        for state in ("intact", "damaged"):
            for x, y in samples:
                assert ray_hits(state_geo[state], (x, y, lo[2]-1)) == 0, f"{state} gate opening blocked at x={x},y={y}"
        checks["central_opening_30_rays"] = True
    if entry["type"] == "coastal-gun":
        for state, suffix in (("intact", ""), ("damaged", "_damaged")):
            descendants = m.descendants(state_roots[state])
            named = {m.nodes[i].get("name"): i for i in descendants}
            turret, barrel = named["turret"+suffix], named["barrel"+suffix]
            assert barrel in m.descendants(turret) and barrel != turret, "Barrel must be parented beneath turret"
            turret_pivot, barrel_pivot = m.world(turret)[:3, 3], m.world(barrel)[:3, 3]
            assert abs(turret_pivot[0]) < .05 and .5 < turret_pivot[1] < 3.5, "Turret yaw pivot is outside gun assembly"
            assert abs(barrel_pivot[0]) < .1 and barrel_pivot[1] > .5, "Barrel elevation pivot is outside gun assembly"
            barrel_tri, _, _ = m.geometry(barrel)
            blo, bhi = bounds(barrel_tri)
            assert (bhi-blo)[2] > max((bhi-blo)[0], (bhi-blo)[1]) and bhi[2] > barrel_pivot[2]+.5, "Barrel must point forward along +Z"
        checks["gun_hierarchy_pivots_front_positive_z"] = True
    return {"id": entry["id"], "file": entry["file"], "bytes": len(m.raw), "sha256": hashlib.sha256(m.raw).hexdigest(), "materials": 1, "textures": textures, "triangles_all_states": sum(v["triangles"] for v in states.values()), "states": states, "checks": checks}


def official_validator(module, entries):
    code = r"""
const fs = require('fs');
const validator = require(process.argv[1]);
const paths = JSON.parse(fs.readFileSync(0, 'utf8'));
(async () => {
  const reports = [];
  for (const item of paths) {
    const report = await validator.validateBytes(new Uint8Array(fs.readFileSync(item.path)), {uri:item.file, maxIssues:1000});
    reports.push({file:item.file, ...report});
  }
  process.stdout.write(JSON.stringify({validator:validator.version(), reports}));
})().catch(error => {process.stderr.write(String(error)); process.exit(1)});
"""
    paths = [{"file": e["file"], "path": str(ROOT/e["file"])} for e in entries]
    result = subprocess.run(["node", "-e", code, str(Path(module).resolve())], input=json.dumps(paths), text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validator-module", help="Path to installed official gltf-validator npm module")
    args = parser.parse_args()
    entries = json.loads((ROOT/"manifest.json").read_text())["assets"]
    assert len(entries) == 13 and {(e["style"], e["type"]) for e in entries} == EXPECTED, "Expected exactly the 13 requested assets"
    assert len({e["id"] for e in entries}) == len(entries), "Duplicate asset IDs"
    assert {p.relative_to(ROOT).as_posix() for p in (ROOT/"models").glob("*.glb")} == {e["file"] for e in entries}, "Manifest and model directory differ"
    report = {"tool": "independent GLB geometry checks", "triangle_budget": "1500 per GLB including all three states", "assets": [], "failures": []}
    for entry in entries:
        try:
            report["assets"].append(check_asset(entry))
            print(f"PASS {entry['id']}")
        except (AssertionError, KeyError, ValueError, IndexError) as error:
            report["failures"].append({"id": entry["id"], "error": str(error)})
            print(f"FAIL {entry['id']}: {error}", file=sys.stderr)
    if args.validator_module:
        khronos = official_validator(args.validator_module, entries)
        (ROOT/"verification"/"khronos-validator.json").write_text(json.dumps(khronos, indent=2)+"\n")
        report["khronos"] = {"version": khronos["validator"], "errors": sum(r["issues"]["numErrors"] for r in khronos["reports"]), "warnings": sum(r["issues"]["numWarnings"] for r in khronos["reports"])}
        if report["khronos"]["errors"] or report["khronos"]["warnings"]:
            report["failures"].append({"id": "khronos", "error": "Official glTF validator found errors or warnings; inspect khronos-validator.json"})
    report["passed"] = not report["failures"]
    (ROOT/"verification"/"asset-validation.json").write_text(json.dumps(report, indent=2)+"\n")
    print(f"{len(report['assets'])}/13 passed; {len(report['failures'])} failures")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
