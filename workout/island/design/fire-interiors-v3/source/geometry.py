"""CC0-1.0. Shared authoring tools for the Fire Interiors v3 assets."""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent / "fire-multifloor-v2"
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("fire_v2_geometry", BASE / "source/build_building.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

Geometry = base.Geometry
table = base.table
translated = base.translated

for name, color in {
    "chalk": "EDE9D8", "grout": "726F69", "wheat": "ECCBA0", "oak": "BA8D64",
    "oak_light": "D1A574", "clay": "B1644C", "brick": "884B3E",
    "faded_red": "C76453", "mustard_light": "F2C273", "olive": "6C856A",
    "moss": "385F56", "mint": "A9CDB4", "aqua": "76BEB8",
    "denim": "3C6577", "petrol": "25454E", "glass": "A1CCD8",
    "ice": "CAE3E5", "ink": "263137", "graphite": "414747",
    "concrete": "9F9F91", "shale": "686C63", "rubber": "2D3738",
    "steel": "A6B4B6", "silver": "D8DDD9", "card": "B79260",
    "kraft": "9F7850", "tape": "E5BF83", "cream_pink": "F8DED4",
    "lavender": "BCAEC4", "berry": "98425C", "lamp": "FDF4CE",
    "poppy": "C34235", "salmon": "ED9A85", "road": "CCC4AC",
}.items():
    base.COLOR[name] = len(base.PALETTE)
    base.PALETTE.append((name, color))


def rotation_y(angle):
    return [0, math.sin(angle / 2), 0, math.cos(angle / 2)]


def span(g, x0, x1, y0, y1, z0, z1, color):
    g.box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
          (x1 - x0, y1 - y0, z1 - z0), color)


def arrow(g, x, y, z, angle=0, color="moss", size=0.44):
    marker = Geometry()
    marker.face([(-size, 0, -0.036), (0, 0, -0.036), (0, 0, 0.036),
                 (-size, 0, 0.036)], color, (0, 1, 0))
    marker.face([(-0.08, 0, -0.16), (0.18, 0, 0), (-0.08, 0, 0.16)], color, (0, 1, 0))
    g.faces.extend(translated(marker, (x, y, z), angle).faces)


def cabinet(width, depth, height, color="oak", doors=2, metal=False):
    g = Geometry()
    g.box((0, height / 2 + 0.04, 0), (width, height - 0.08, depth), color, .025)
    g.box((0, 0.052, 0), (width - .08, .104, depth - .10), "graphite")
    g.box((0, height - 0.022, 0), (width + .024, .044, depth + .04),
          "silver" if metal else "oak_light", .012)
    for i in range(doors):
        panel = width / doors
        x = (i + 0.5 - doors / 2) * panel
        g.box((x, height / 2 + .044, depth / 2 + .013),
              (panel - .044, height - .15, .027), color, .009)
        g.box((x + panel * .22, height - .15, depth / 2 + .042),
              (.11, .023, .044), "steel" if metal else "wood_dark", .006)
    return g


def lock_badge(g, x, y, z, warning=True):
    g.box((x, y, z), (.31, .29, .044), "poppy" if warning else "petrol", .012)
    g.box((x, y - .029, z + .027), (.117, .082, .012), "ivory", .005)
    for a, b in [((-.048, -.012), (-.048, .058)), ((-.048, .058), (0, .085)),
                 ((0, .085), (.048, .058)), ((.048, .058), (.048, -.012))]:
        g.rod((x + a[0], y + a[1], z + .031), (x + b[0], y + b[1], z + .031),
              .011, "ivory", 4)
    g.box((x, y - .027, z + .036), (.017, .025, .008), "petrol")


def door_leaf(width=1.08, height=2.30, color="teal", window=False):
    """Leaf extends toward -X from its hinge at the model origin."""
    g = Geometry()
    x = -width / 2
    g.box((x, height / 2 + .02, 0), (width, height, .066), color, .018)
    for front in (-1, 1):
        g.box((x, .37, front * .037), (width - .09, .53, .014), "mint" if window else "oak")
        g.box((x, 1.54, front * .037), (width - .15, 1.02, .014), "petrol" if window else "moss", .013)
        g.box((x, 1.54, front * .047), (width - .24, .92, .012), "glass" if window else color, .007)
        g.box((-width + .17, 1.03, front * .068), (.18, .046, .065), "gold", .01)
    for y in (.32, 1.93):
        g.cylinder((.014, y, .005), .027, .13, "steel", sides=8)
    return g


def damaged(g, category):
    out = Geometry()
    crush = {"fabric": .51, "paper": .60, "electrical": .82, "metal": .92,
             "electrical_fabric": .69, "cooking_oil": .88}.get(category, .69)
    ash = ("soot", "ash", "soot", "char", "char", "ink", "soot")
    for i, (points, color) in enumerate(g.faces):
        out.face([
            (x * .95 + .08 * max(y, 0) + .021 * math.sin(y * 6 + z * 4),
             y * crush + .026 * math.sin(x * 7 + z * 8) * min(1, max(y, 0)),
             z + .035 * math.sin(y * 7 - x * 6) * min(1, max(y, 0)))
            for x, y, z in points
        ], ash[(i + (1 if color in ("metal", "silver", "steel") else 0)) % len(ash)])
    if category not in ("metal", "cooking_oil"):
        for x, z, turn in ((-.14, .27, .25), (.19, .12, 1.03), (.28, -.13, 2.5)):
            out.box((x, .024, z), (.13, .048, .078), "soot", rotation=turn)
    return out


class Model(base.GLB):
    def __init__(self, name):
        super().__init__(name)
        self.cameras = []
        self.materials = [{
            "name": "matte architectural palette",
            "pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": .85},
        }]

    def part(self, name, g, parent=None, **properties):
        mesh = self.mesh(name, g)
        return self.node(name, self.root if parent is None else parent, mesh=mesh, **properties)

    def anchor(self, name, translation, **extras):
        self.node(name, self.root, translation=translation, extras=extras)
        return name

    def burnable(self, name, title, at, fire, g, category, angle=0, door=False, closed_angle=0):
        intact, burnt, fire_node = (f"{prefix}_{name}" for prefix in ("intact", "burnt", "fire"))
        extras = {"label": title, "category": category, "defaultState": "intact",
                  "intactNode": intact, "burntNode": burnt, "fireNode": fire_node}
        if door:
            extras["door"] = {"closedRadians": closed_angle, "openRadians": angle}
        parent = self.node(f"burn_{name}", self.root, translation=at, rotation=rotation_y(angle),
                           extras=extras)
        self.part(intact, g, parent, extras={"state": "intact"})
        char = damaged(g, category)
        self.part(burnt, char, parent, scale=[0, 0, 0],
                  extras={"state": "burnt", "restScale": [1, 1, 1]})
        self.node(fire_node, parent, translation=fire, extras={"role": "fire_origin"})
        fx, fy, fz = fire
        fire_room = [
            round(at[0] + fx * math.cos(angle) + fz * math.sin(angle), 4),
            round(at[1] + fy, 4),
            round(at[2] - fx * math.sin(angle) + fz * math.cos(angle), 4),
        ]
        self.items.append({"id": name, "label": title, "category": category,
                           "parent": f"burn_{name}", "intact": intact, "burnt": burnt, "fire": fire_node,
                           "fireLocal": fire, "fireRoom": fire_room,
                           "triangles": {"intact": g.triangles, "burnt": char.triangles}})

    def camera(self, position, target, ymag):
        dx, dy, dz = (p - t for p, t in zip(position, target))
        yaw = math.atan2(dx, dz)
        pitch = -math.atan2(dy, math.hypot(dx, dz))
        cy, sy, cx, sx = math.cos(yaw / 2), math.sin(yaw / 2), math.cos(pitch / 2), math.sin(pitch / 2)
        self.cameras.append({"name": "camera_game", "type": "orthographic",
                             "orthographic": {"xmag": ymag * 4 / 3, "ymag": ymag, "znear": .1, "zfar": 60}})
        self.node("camera_game", self.root, camera=0, translation=position, rotation=[cy * sx, sy * cx, -sy * sx, cy * cx])

    def save(self):
        doc = {"asset": {"version": "2.0", "generator": "Bakasun Fire Interiors v3",
                         "copyright": "CC0-1.0"},
               "scene": 0, "scenes": [{"name": self.name, "nodes": [self.root]}],
               "nodes": self.nodes, "meshes": self.meshes, "materials": self.materials,
               "buffers": [{"byteLength": len(self.binary)}], "bufferViews": self.views,
               "accessors": self.accessors}
        if self.cameras:
            doc["cameras"] = self.cameras
        json_bytes = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
        json_bytes += b" " * (-len(json_bytes) % 4)
        binary = bytes(self.binary) + b"\0" * (-len(self.binary) % 4)
        glb = (struct.pack("<4sII", b"glTF", 2, 28 + len(json_bytes) + len(binary))
               + struct.pack("<I4s", len(json_bytes), b"JSON") + json_bytes
               + struct.pack("<I4s", len(binary), b"BIN\0") + binary)
        filename = f"models/{self.name}.glb"
        (ROOT / filename).write_bytes(glb)
        triangles = [
            self.accessors[mesh["primitives"][0]["indices"]]["count"] // 3
            for mesh in self.meshes
        ]
        return {"id": self.name, "path": filename, "bytes": len(glb),
                "sha256": hashlib.sha256(glb).hexdigest(), "nodeCount": len(self.nodes),
                "storedTriangles": sum(triangles),
                "sceneTriangles": sum(triangles[node["mesh"]] for node in self.nodes if "mesh" in node),
                "intactTriangles": sum(triangles[node["mesh"]] for node in self.nodes
                                       if "mesh" in node and node.get("scale") != [0, 0, 0])}
