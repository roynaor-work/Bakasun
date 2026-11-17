"""Blender 4.x: derive dressed crowd topology from the bundled CC0 hm08 body.

Run with blender -b --python source/build-geometry.py. No network or addons.
Intermediate geometry goes to /tmp, never to an existing repository directory.
"""
import bpy
import bmesh
import gzip
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
PEOPLE = json.loads((ROOT / 'source/people.json').read_text())
WORK = Path('/tmp/tennis-people-tools')
WORK.mkdir(exist_ok=True)
vertices, faces, groups = [], [], {}
group = ''
for line in gzip.decompress((ROOT / 'source/vendor/makehuman-base.obj.gz').read_bytes()).decode().splitlines():
    if line.startswith('v '):
        vertices.append(Vector(tuple(float(c) * .1 for c in line.split()[1:])))
    elif line.startswith('g '):
        group = line[2:]
        groups.setdefault(group, set())
    elif line.startswith('f '):
        f = [int(c.split('/')[0]) - 1 for c in line.split()[1:]]
        groups[group].update(f)
        if group == 'body':
            faces.append(f)
GROUND = min(vertices[i].y for i in groups['body'])
vertices = [v - Vector((0, GROUND, 0)) for v in vertices]
source_joints = {name[6:]: sum((vertices[i] for i in ids), Vector()) / len(ids)
                 for name, ids in groups.items() if name.startswith('joint-')}

def dist_segment(p, a, b):
    d = b - a
    t = max(0, min(1, (p-a).dot(d) / d.length_squared))
    return (p-a-d*t).length

def region(p):
    y = p.y
    if y > 1.395:
        return 'head'
    for s in ['l', 'r']:
        shoulder, elbow, wrist = [source_joints[f'{s}-{n}'] for n in ['shoulder','elbow','hand']]
        if dist_segment(p, elbow, wrist) < .09 or (p.x * (1 if s == 'l' else -1) > .38 and y > .9):
            return 'skin'
        if dist_segment(p, shoulder, elbow) < .092:
            return 'shirt' if (p-shoulder).length < .15 else 'skin'
    if y < .123:
        return 'shoe'
    if y < .68:
        return 'skin'
    if y < 1.015:
        return 'shorts'
    return 'shirt'

def shape(p, c):
    p = p.copy()
    height = c['height'] / 1.666
    female = c['gender'] == 'female'
    # Proportion changes are anatomical: head remains around 1/7.5 standing height.
    xscale = (1.0 if female else 1.08) * c['build'] ** .6
    if p.y < 1.08:
        xscale *= 1.035 if female else .98
    if p.y > 1.40:
        xscale = .96 if female else 1.025
    p.x *= xscale
    depth = c['build'] ** .8
    if p.y > 1.40:
        depth = .98 if female else 1.03
    p.z = (p.z - .012) * depth + .012
    r = region(p)
    if r in ['shirt','shorts']:
        # Ease the surface out into actual loose summer clothing, flattening the groin.
        p.z = (p.z-.01)*1.10+.01
        if r == 'shirt':
            p.x *= 1.035
            if p.y < 1.18:
                p.z += .007
        else:
            p.x *= 1.04
            if abs(p.x) < .095 and .78 < p.y < .97:
                p.z = min(p.z, .115)
    if p.y < .11:
        p.x *= 1.04
        p.y = max(.018, p.y)
    return p * height

def triangulate(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()

def decimate(obj, target):
    source = obj.data.copy()
    start = len(source.polygons)
    low, high, best = .00001, min(1, target/start*2), None
    for _ in range(20):
        obj.data = source.copy()
        mod = obj.modifiers.new('Anatomical silhouette reduction', 'DECIMATE')
        mod.ratio = (low+high)/2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
        triangulate(obj)
        count = len(obj.data.polygons)
        if count <= target and (best is None or count > len(best.polygons)):
            best = obj.data.copy()
        if count == target:
            break
        if count > target:
            high = (low+high)/2
        else:
            low = (low+high)/2
    assert best is not None
    obj.data = best
    # Split the longest face if the collapse happens to skip the exact even count.
    while len(obj.data.polygons) < target:
        bm = bmesh.new(); bm.from_mesh(obj.data)
        face = max(bm.faces, key=lambda f:f.calc_area())
        # Tri fan adds two triangles, preserving geometry and winding exactly.
        bmesh.ops.poke(bm, faces=[face])
        bm.to_mesh(obj.data); bm.free()
    assert len(obj.data.polygons) == target

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
ids = sorted(groups['body'])
mapping = {v:i for i,v in enumerate(ids)}
raw_faces = [[mapping[i] for i in f] for f in faces]
for c in PEOPLE:
    v = [shape(vertices[i], c) for i in ids]
    mesh = bpy.data.meshes.new(c['id'])
    mesh.from_pydata(v, [], raw_faces); mesh.update()
    obj = bpy.data.objects.new(c['id'], mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    # A 12mm voxel surface closes lips, eye sockets, toes and fingers before LODs.
    remesh = obj.modifiers.new('Watertight clothed anatomical surface', 'REMESH')
    remesh.mode = 'VOXEL'; remesh.voxel_size = .012 * c['height']/1.666
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    # Voxelization can leave tiny separate islands in lips and between fingers.
    # Keep the anatomical body component; do not spend LOD triangles on debris.
    bm=bmesh.new();bm.from_mesh(obj.data)
    pending=set(bm.verts);components=[]
    while pending:
        seed=pending.pop();connected={seed};stack=[seed]
        while stack:
            for edge in stack.pop().link_edges:
                for vertex in edge.verts:
                    if vertex in pending:
                        pending.remove(vertex);connected.add(vertex);stack.append(vertex)
        components.append(connected)
    keep=max(components,key=len)
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if v not in keep],context='VERTS')
    bm.to_mesh(obj.data);bm.free()
    smooth = obj.modifiers.new('Remove scan-scale surface noise', 'SMOOTH')
    smooth.factor = .55; smooth.iterations = 3
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    triangulate(obj)
    original = obj.data.copy()
    levels=[]
    for budget in [186,78]:
        obj.data = original.copy()
        decimate(obj, budget)
        levels.append({'positions':[list(v.co) for v in obj.data.vertices],
                       'triangles':[list(f.vertices) for f in obj.data.polygons]})
    # Joint centers follow identical body scaling, without garment offsets.
    j = {}
    for name,p in source_joints.items():
        q=shape(p,c)
        j[name]=list(q)
    data={'id':c['id'],'height':c['height'],'joints':j,'lods':levels}
    (WORK/(c['id']+'-geometry.json')).write_text(json.dumps(data,separators=(',',':')))
    print(c['id'],[len(x['triangles']) for x in levels], flush=True)
    bpy.data.objects.remove(obj, do_unlink=True)
print('Geometry complete', flush=True)
