#!/usr/bin/env python3
"""Independently inspect this package's GLBs using Python's standard library.

No authoring modules are imported. Bounds are calculated from actual vertices
and the scene hierarchy, rather than trusting accessor min/max or source data.
Run from any directory: python3 source/validate.py [package-directory].
Original validation code for Bakasun; CC0-1.0.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys


COMPONENTS = {
    5120: ("b", 1, 127), 5121: ("B", 1, 255),
    5122: ("h", 2, 32767), 5123: ("H", 2, 65535),
    5125: ("I", 4, 4294967295), 5126: ("f", 4, None),
}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4,
          "MAT2": 4, "MAT3": 9, "MAT4": 16}
IDENTITY = ((1, 0, 0, 0), (0, 1, 0, 0),
            (0, 0, 1, 0), (0, 0, 0, 1))
EPSILON = 2e-5


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def close(actual, expected, label, tolerance=EPSILON):
    require(abs(actual - expected) <= tolerance,
            f"{label}: expected {expected}, got {actual}")


def multiply(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(4))
                       for j in range(4)) for i in range(4))


def transform(matrix, point):
    return tuple(sum(matrix[i][j] * point[j] for j in range(3))
                 + matrix[i][3] for i in range(3))


def quaternion_matrix(q):
    x, y, z, w = q
    return ((1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w), 0),
            (2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w), 0),
            (2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y), 0),
            (0, 0, 0, 1))


def node_matrix(node):
    if "matrix" in node:
        require(not any(key in node for key in ("translation", "rotation", "scale")),
                "node specifies both matrix and TRS")
        values = node["matrix"]
        require(len(values) == 16, "invalid node matrix")
        return tuple(tuple(values[col*4+row] for col in range(4))
                     for row in range(4))
    q = node.get("rotation", (0, 0, 0, 1))
    close(sum(value*value for value in q), 1, "rest quaternion squared length")
    rotation = quaternion_matrix(q)
    scale = node.get("scale", (1, 1, 1))
    position = node.get("translation", (0, 0, 0))
    return tuple(tuple(rotation[i][j] * scale[j] if j < 3 else position[i]
                       for j in range(4)) for i in range(3)) + ((0, 0, 0, 1),)


def bounds(points):
    require(bool(points), "empty geometry")
    low = [min(p[axis] for p in points) for axis in range(3)]
    high = [max(p[axis] for p in points) for axis in range(3)]
    return {"min": low, "max": high,
            "size": [high[i] - low[i] for i in range(3)]}


def slerp(a, b, amount):
    dot = sum(x*y for x, y in zip(a, b))
    if dot < 0:
        b, dot = [-x for x in b], -dot
    dot = max(-1, min(1, dot))
    if dot > .9995:
        q = [x + amount*(y-x) for x, y in zip(a, b)]
    else:
        angle = math.acos(dot)
        left = math.sin((1-amount)*angle) / math.sin(angle)
        right = math.sin(amount*angle) / math.sin(angle)
        q = [left*x + right*y for x, y in zip(a, b)]
    magnitude = math.sqrt(sum(x*x for x in q))
    return [x/magnitude for x in q]


def sample(times, values, time, rotation=False):
    if time <= times[0]:
        return values[0]
    if time >= times[-1]:
        return values[-1]
    end = next(i for i, t in enumerate(times) if t >= time)
    start = end-1
    u = (time-times[start]) / (times[end]-times[start])
    if rotation:
        return slerp(values[start], values[end], u)
    return [a + u*(b-a) for a, b in zip(values[start], values[end])]


def unwrapped_roll(rotations):
    """Recover roll from +Y yaw / +X pitch / +Z roll, away from gimbal lock."""
    values = []
    for q in rotations:
        m = quaternion_matrix(q)
        # The authored down pose stays below 90 degrees pitch. This decomposition
        # follows the nose independently of the aircraft's full axial roll.
        require(abs(m[1][2]) < .9999, "down spin crosses decomposition singularity")
        angle = math.atan2(m[1][0], m[1][1])
        if values:
            while angle-values[-1] > math.pi:
                angle -= 2*math.pi
            while angle-values[-1] < -math.pi:
                angle += 2*math.pi
        values.append(angle)
    return values[-1]-values[0]


class GLB:
    def __init__(self, path):
        self.path = path
        self.bytes = path.read_bytes()
        require(len(self.bytes) >= 28, "GLB is truncated")
        magic, version, length = struct.unpack_from("<4sII", self.bytes)
        require(magic == b"glTF" and version == 2, "expected GLB version 2")
        require(length == len(self.bytes), "GLB declared length mismatch")
        chunks, offset = [], 12
        while offset < length:
            require(offset+8 <= length, "truncated GLB chunk header")
            size, kind = struct.unpack_from("<I4s", self.bytes, offset)
            require(size % 4 == 0 and offset+8+size <= length, "invalid GLB chunk size")
            chunks.append((kind, self.bytes[offset+8:offset+8+size]))
            offset += size+8
        require([kind for kind, _ in chunks] == [b"JSON", b"BIN\x00"],
                "expected exactly an embedded JSON chunk and binary chunk")
        self.doc = json.loads(chunks[0][1])
        self.binary = chunks[1][1]
        require(self.doc["asset"]["version"] == "2.0", "wrong glTF asset version")
        buffers = self.doc.get("buffers", [])
        require(len(buffers) == 1 and "uri" not in buffers[0], "buffer must be embedded")
        require(0 <= len(self.binary)-buffers[0]["byteLength"] <= 3,
                "binary buffer length mismatch")
        self.cache = {}

    def view(self, index):
        view = self.doc["bufferViews"][index]
        require(view.get("buffer", 0) == 0, "invalid buffer reference")
        start = view.get("byteOffset", 0)
        require(start >= 0 and start+view["byteLength"] <= self.doc["buffers"][0]["byteLength"],
                "bufferView exceeds the embedded buffer")
        return view, start

    def read_values(self, view_index, offset, count, component, width, stride=None):
        code, size, _ = COMPONENTS[component]
        view, base = self.view(view_index)
        step = stride or size*width
        require(step >= size*width and step % size == 0, "invalid accessor byteStride")
        require(offset >= 0 and offset % size == 0, "invalid accessor byteOffset")
        end = offset+(count-1)*step+size*width if count else offset
        require(end <= view["byteLength"], "accessor exceeds its bufferView")
        return [tuple(struct.unpack_from("<"+code*width, self.binary, base+offset+i*step))
                for i in range(count)]

    def accessor(self, index):
        if index in self.cache:
            return self.cache[index]
        access = self.doc["accessors"][index]
        component, count = access["componentType"], access["count"]
        width = WIDTHS[access["type"]]
        require(component in COMPONENTS and count > 0, "invalid accessor type/count")
        require(not access["type"].startswith("MAT") or component == 5126,
                "validator requires floating-point matrix accessors")
        if "bufferView" in access:
            view, _ = self.view(access["bufferView"])
            values = self.read_values(access["bufferView"], access.get("byteOffset", 0),
                                      count, component, width, view.get("byteStride"))
        else:
            require("sparse" in access, "accessor has neither bufferView nor sparse data")
            values = [(0,)*width for _ in range(count)]
        if "sparse" in access:
            sparse = access["sparse"]
            ids = sparse["indices"]
            require(ids["componentType"] in (5121, 5123, 5125), "invalid sparse indices")
            indices = self.read_values(ids["bufferView"], ids.get("byteOffset", 0),
                                       sparse["count"], ids["componentType"], 1)
            data = sparse["values"]
            replacements = self.read_values(data["bufferView"], data.get("byteOffset", 0),
                                            sparse["count"], component, width)
            flat = [i[0] for i in indices]
            require(flat == sorted(set(flat)) and all(0 <= i < count for i in flat),
                    "sparse indices are not unique, ordered, or within range")
            for i, value in zip(flat, replacements):
                values[i] = value
        require(all(math.isfinite(v) for value in values for v in value),
                "nonfinite accessor value")
        for key, select in (("min", min), ("max", max)):
            if key in access:
                for axis, claimed in enumerate(access[key]):
                    actual = select(v[axis] for v in values)
                    close(actual, claimed, f"accessor {index} {key}[{axis}]", 1e-5*max(1, abs(actual)))
        if access.get("normalized"):
            require(component != 5126, "float accessor cannot be normalized")
            divisor = COMPONENTS[component][2]
            values = [tuple(max(-1, v/divisor) for v in value) for value in values]
        self.cache[index] = values
        return values


def inspect(path, kind):
    glb = GLB(path)
    doc = glb.doc

    def inspect_embedded(value):
        if isinstance(value, dict):
            require("uri" not in value, "external or data URI is forbidden")
            for key, nested in value.items():
                if key in ("extensions", "extensionsUsed", "extensionsRequired"):
                    names = nested if isinstance(nested, (dict, list)) else []
                    require(not any(any(term in name.lower() for term in
                                        ("draco", "meshopt", "compression")) for name in names),
                            "compressed geometry extension is forbidden")
                inspect_embedded(nested)
        elif isinstance(value, list):
            for nested in value:
                inspect_embedded(nested)

    inspect_embedded(doc)
    require(not doc.get("textures") and not doc.get("images") and not doc.get("samplers"),
            "package must have zero textures/images/texture samplers")
    require(len(doc.get("materials", [])) == 1, "model must contain exactly one material")
    for i in range(len(doc.get("accessors", []))):
        glb.accessor(i)
    for i in range(len(doc.get("bufferViews", []))):
        glb.view(i)

    nodes = doc["nodes"]
    names = [n.get("name") for n in nodes]
    require(len(names) == len(set(names)), "node names must be unique")
    require("motionRoot" in names, "missing motionRoot")
    root = names.index("motionRoot")
    require(doc.get("scene", 0) == 0 and len(doc["scenes"]) == 1,
            "expected one default scene")
    require(doc["scenes"][0]["nodes"] == [root], "scene must contain motionRoot only")
    require(node_matrix(nodes[root]) == IDENTITY, "motionRoot bind transform must be identity")
    require(nodes[root].get("children"), "motionRoot has no descendants")
    parents, world, active = {}, {}, set()

    def visit(index, matrix):
        require(0 <= index < len(nodes) and index not in active, "invalid or cyclic scene graph")
        require(index not in world, "node has more than one parent")
        active.add(index)
        world[index] = multiply(matrix, node_matrix(nodes[index]))
        for child in nodes[index].get("children", []):
            parents[child] = index
            visit(child, world[index])
        active.remove(index)

    visit(root, IDENTITY)
    require(len(world) == len(nodes), "orphaned nodes")
    expected_spinners = {"plane": {"propeller": "Z"},
                         "helicopter": {"rotor": "Y", "tailRotor": "X"}}[kind]
    for name in expected_spinners:
        require(name in names, f"missing named {name} node")
        require(parents.get(names.index(name)) == root, f"{name} must be under motionRoot")
    mesh_points, triangle_count, colors, primitives = {}, 0, set(), 0
    for mesh_index, mesh in enumerate(doc["meshes"]):
        points = []
        for primitive in mesh["primitives"]:
            primitives += 1
            require(primitive.get("material") == 0, "every primitive must share material zero")
            require(primitive.get("mode", 4) == 4, "expected triangle primitives")
            attributes = primitive["attributes"]
            require("COLOR_0" in attributes and "NORMAL" in attributes, "missing color/normal attribute")
            positions = glb.accessor(attributes["POSITION"])
            normals = glb.accessor(attributes["NORMAL"])
            palette = glb.accessor(attributes["COLOR_0"])
            require(len(positions) == len(normals) == len(palette), "attribute counts differ")
            require(all(len(p) == 3 for p in positions), "positions must be VEC3")
            require(all(abs(sum(v*v for v in n)-1) < 1e-4 for n in normals), "nonunit normal")
            require(all(len(c) in (3, 4) and all(0 <= v <= 1 for v in c) for c in palette),
                    "invalid vertex color")
            if "indices" in primitive:
                accessor = doc["accessors"][primitive["indices"]]
                require(accessor["type"] == "SCALAR" and accessor["componentType"] in (5121, 5123, 5125),
                        "invalid triangle indices")
                indices = [v[0] for v in glb.accessor(primitive["indices"])]
                require(all(0 <= i < len(positions) for i in indices), "index outside vertex array")
            else:
                indices = list(range(len(positions)))
            require(len(indices) % 3 == 0, "triangle vertex count is not divisible by three")
            for start in range(0, len(indices), 3):
                a, b, c = [positions[i] for i in indices[start:start+3]]
                ab, ac = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
                cross = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]]
                require(sum(v*v for v in cross) > 1e-18, "degenerate triangle")
            points.extend(positions[i] for i in indices)
            colors.update(tuple(round(v, 6) for v in c[:3]) for c in palette)
        mesh_points[mesh_index] = points

    # Count instantiated geometry, so reusing a mesh cannot hide a budget overrun.
    all_points, airframe_points = [], []
    excluded = set()
    if kind == "helicopter":
        def exclude(index):
            excluded.add(index)
            for child in nodes[index].get("children", []):
                exclude(child)
        exclude(names.index("rotor"))
    for index, matrix in world.items():
        if "mesh" not in nodes[index]:
            continue
        local_points = mesh_points[nodes[index]["mesh"]]
        triangle_count += len(local_points)//3
        transformed = [transform(matrix, point) for point in local_points]
        all_points.extend(transformed)
        if index not in excluded:
            airframe_points.extend(transformed)
    require(0 < triangle_count <= 1800, f"triangle budget exceeded: {triangle_count}")
    require(len(colors) >= 3, "vertex color palette is not varied")
    # Vertex RGB is linear, as required by glTF COLOR_0. Convert to sRGB for a
    # perceptual cyan-glass check without relying on the author's exact palette.
    def srgb(v):
        return 12.92*v if v <= .0031308 else 1.055*v**(1/2.4)-.055
    glass = [c for c in colors if .40 < srgb(c[0]) < .90 and
             .75 < srgb(c[1]) <= 1 and .80 < srgb(c[2]) <= 1 and c[2] > c[0]*1.25]
    require(glass, "no light-blue glass vertex colors found")
    rest_bounds, body_bounds = bounds(all_points), bounds(airframe_points)
    if kind == "plane":
        close(rest_bounds["size"][0], 8.6, "plane wingspan")
        close(rest_bounds["size"][2], 5.6, "plane overall length")
    else:
        close(body_bounds["size"][2], 4.4, "helicopter airframe length excluding main rotor")
    spinners = {}
    for name, axis in expected_spinners.items():
        index = names.index(name)
        node = nodes[index]
        require("mesh" in node, f"{name} must carry its own mesh")
        require(node.get("rotation", [0, 0, 0, 1]) == [0, 0, 0, 1]
                and node.get("scale", [1, 1, 1]) == [1, 1, 1], f"{name} rest axes must be identity")
        local = mesh_points[node["mesh"]]
        radial_axes = {"X": (1, 2), "Y": (0, 2), "Z": (0, 1)}[axis]
        center = [sum(p[i] for p in local)/len(local) for i in radial_axes]
        require(all(abs(value) < 1e-5 for value in center), f"{name} geometry is off its spin axis")
        radial = max(math.hypot(*(point[i] for i in radial_axes)) for point in local)
        if name == "rotor":
            close(radial, 3.8, "main rotor radius")
        spinners[name] = {"axis": axis, "pivot": transform(world[index], (0, 0, 0)),
                          "max_radius": radial, "radial_vertex_centroid": center}

    animations = doc.get("animations", [])
    require(sorted(a.get("name") for a in animations) == ["bank", "down", "fly"],
            "expected exactly fly, bank and down clips")
    clip_metrics = {}
    for animation in animations:
        name = animation["name"]
        tracks = {}
        for channel in animation["channels"]:
            require(channel["target"]["node"] == root, "animation targets a spin node or other child")
            path_name = channel["target"]["path"]
            require(path_name in ("translation", "rotation") and path_name not in tracks,
                    "unexpected or duplicated animation track")
            sampler = animation["samplers"][channel["sampler"]]
            require(sampler.get("interpolation", "LINEAR") == "LINEAR", "expected LINEAR animation")
            times = [value[0] for value in glb.accessor(sampler["input"])]
            values = glb.accessor(sampler["output"])
            require(len(times) == len(values) >= 3 and all(a < b for a, b in zip(times, times[1:])),
                    "animation samples are not ordered")
            close(times[0], 0, "animation start time")
            if path_name == "rotation":
                require(all(len(q) == 4 for q in values), "rotation accessor is not VEC4")
                for q in values:
                    close(sum(v*v for v in q), 1, "animation quaternion squared length", 1e-5)
                require(all(abs(sum(a*b for a, b in zip(q, r))) > .90
                            for q, r in zip(values, values[1:])), "rotation sample step is too large")
            else:
                require(all(len(v) == 3 for v in values), "translation accessor is not VEC3")
            tracks[path_name] = times, values
        require(set(tracks) == {"translation", "rotation"}, "clip requires translation and rotation")
        duration = max(t[-1] for t, _ in tracks.values())
        require(duration > 0, "empty clip duration")
        for times, _ in tracks.values():
            close(times[-1], duration, "track duration")
        if name == "down":
            close(duration, 1.6, "down duration")
        rotation_times, rotations = tracks["rotation"]
        samples = [sample(rotation_times, rotations, duration*i/256, rotation=True) for i in range(257)]
        for q in samples:
            close(sum(v*v for v in q), 1, "sampled quaternion squared length", 1e-5)
        final_nose = transform(quaternion_matrix(samples[-1]), (0, 0, 1))
        metric = {"duration": duration, "rotation_keys": len(rotations),
                  "quaternion_samples_checked": len(samples), "final_nose_direction": final_nose}
        if name == "down":
            require(final_nose[1] < -.8, "down does not pitch the nose downward")
            roll = unwrapped_roll(samples)
            require(abs(abs(roll)-2*math.pi) < .03, "down must make a complete axial spin")
            metric["axial_spin_radians"] = roll
            translation_times, translations = tracks["translation"]
            require(translations[-1][1] < translations[0][1], "down clip does not descend")
        else:
            for _, values in tracks.values():
                require(all(abs(a-b) < EPSILON for a, b in zip(values[0], values[-1])),
                        f"{name} loop endpoints differ")
            require(any(abs(v[i]-tracks["translation"][1][0][i]) > .01
                        for v in tracks["translation"][1] for i in range(3)), f"{name} is static")
        if name == "bank":
            require(max(abs(math.atan2(quaternion_matrix(q)[1][0], quaternion_matrix(q)[1][1]))
                        for q in samples) > .2, "bank clip has no visible bank")
        clip_metrics[name] = metric

    return {"status": "passed", "file": path.name, "bytes": len(glb.bytes),
            "sha256": hashlib.sha256(glb.bytes).hexdigest(), "triangles": triangle_count,
            "materials": 1, "textures": 0, "compression": "none", "external_uris": 0,
            "primitives": primitives, "vertex_palette_colors": len(colors),
            "light_blue_glass_colors": len(glass), "nodes": names,
            "bind_root": "identity at body origin", "rest_bounds": rest_bounds,
            "airframe_bounds_excluding_main_rotor": body_bounds,
            "spinners": spinners, "clips": clip_metrics}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", type=Path,
                        default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    package = args.directory.resolve()
    report = {"validator": "Independent standard-library GLB inspection", "models": []}
    for kind, filename in (("plane", "plane.glb"), ("helicopter", "helicopter.glb")):
        try:
            result = inspect(package/filename, kind)
        except (AssertionError, KeyError, ValueError, TypeError, IndexError, OSError, struct.error) as error:
            result = {"status": "failed", "file": filename, "error": str(error)}
        report["models"].append(result)
    report["status"] = "passed" if all(m["status"] == "passed" for m in report["models"]) else "failed"
    destination = package/"verification"/"asset-checks.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"Saved {destination}")
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
