"""Bake the repository's CC0 Kenney character as a static 1.75 m reference.

Run: blender --background --factory-startup --python source/prepare_reference.py
Uses the original FBX embedded in workout/3d/model/character.js, not a codec.
Only facial UVs survive; the kit is plain blue, slate and white. No text.
See ../LICENSES.md for the Kenney source and CC0 dedication of modifications.
"""
import base64
from hashlib import sha256
import json
from pathlib import Path
import re
import sys
import tempfile

import bpy
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import Model, ROOT, FACE, SIZE

REPO = ROOT.parents[3]
SOURCE = REPO / "workout/3d/model/character.js"
TEXTURE = REPO / "workout/3d/model/skaterMaleA.png"

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
with tempfile.TemporaryDirectory(prefix="soccer-reference-") as temp:
    fbx = Path(temp) / "character.fbx"
    fbx.write_bytes(base64.b64decode(re.search(r"FBX_B64\s*=\s*'([^']+)'", SOURCE.read_text())[1]))
    bpy.ops.import_scene.fbx(filepath=str(fbx))

armature = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
character = next(o for o in bpy.context.scene.objects if o.type == "MESH")
armature.animation_data_clear()
for bone in armature.pose.bones:
    for constraint in list(bone.constraints):
        bone.constraints.remove(constraint)
    bone.rotation_mode = "QUATERNION"
    bone.matrix_basis.identity()
bpy.context.view_layer.update()


def aim(name, world_direction):
    bone = armature.pose.bones[name]
    direction = armature.matrix_world.to_3x3().inverted() @ Vector(world_direction)
    rotation = (bone.tail-bone.head).normalized().rotation_difference(direction.normalized())
    matrix = bone.matrix.copy()
    result = rotation.to_matrix().to_4x4() @ matrix
    result.translation = matrix.translation
    bone.matrix = result
    bpy.context.view_layer.update()


aim("LeftArm", (.16, 0, -1))
aim("RightArm", (-.16, 0, -1))
aim("LeftForeArm", (.08, -.04, -1))
aim("RightForeArm", (-.08, -.04, -1))
evaluated = character.evaluated_get(bpy.context.evaluated_depsgraph_get())
mesh = evaluated.to_mesh()
mesh.calc_loop_triangles()
positions = [evaluated.matrix_world @ v.co for v in mesh.vertices]
minimum, maximum = min(v.z for v in positions), max(v.z for v in positions)
scale = 1.75/(maximum-minimum)
center_x = (min(v.x for v in positions)+max(v.x for v in positions))/2
center_y = (min(v.y for v in positions)+max(v.y for v in positions))/2
positions = [((p.x-center_x)*scale,(p.z-minimum)*scale,-(p.y-center_y)*scale) for p in positions]

model = Model("reference_player", {"height":1.75,"purpose":"preview scale reference only",
                                    "source":"Kenney Animated Characters Protagonists 1.1",
                                    "pose":"standing, arms lowered","sourceTriangles":1604})
for triangle in mesh.loop_triangles:
    points = [positions[i] for i in triangle.vertices]
    height = sum(p[1] for p in points)/3
    weights = {}
    for index in triangle.vertices:
        for group in character.data.vertices[index].groups:
            name = character.vertex_groups[group.group].name
            weights[name] = weights.get(name,0)+group.weight
    group = max(weights, key=weights.get) if weights else ""
    if "Head" in group or "Neck" in group:
        source_uvs = [mesh.uv_layers.active.data[i].uv for i in triangle.loops]
        if all(-.001 <= u <= .626 and .52 <= v <= 1.001 for u,v in source_uvs):
            uvs = [((FACE[0]+u*1024/640*(FACE[2]-FACE[0]))/SIZE,
                    (FACE[1]+(1-v)*1024/490*(FACE[3]-FACE[1]))/SIZE) for u,v in source_uvs]
            model.mesh("player","face").face(points,"face",uvs)
        else:
            model.mesh("player","skin").face(points,"skin")
        continue
    if any(s in group for s in ("Hand","ForeArm")):
        material = "skin"
    elif "Arm" in group or "Shoulder" in group or height > .87:
        material = "blue"
    elif height < .14:
        material = "slate"
    elif height < .48:
        material = "white"
    elif height < .72:
        material = "skin"
    else:
        material = "slate"
    model.mesh("player",material).face(points,material)

result = model.write()
result["height"] = 1.75
result["sourceSha256"] = {str(path.relative_to(REPO)):sha256(path.read_bytes()).hexdigest() for path in [SOURCE,TEXTURE]}
manifest_path = ROOT / "manifest.json"
manifest = json.loads(manifest_path.read_text())
manifest["referencePlayer"] = result
manifest["fullPreviewTriangles"] = manifest["fullSceneTriangles"] + result["triangles"] + 2
manifest_path.write_text(json.dumps(manifest,indent=2)+"\n")
print("REFERENCE_PLAYER", json.dumps(result))
evaluated.to_mesh_clear()
