"""CC0. Deterministic 210 / 90 / 24 triangle fans; Python standard library only.

Reads the immutable parent CC0 generator for its palette, dimensions and GLB
writer. All output, including temporary writer output, stays below lod/.
"""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import struct
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT.parent
spec = importlib.util.spec_from_file_location('original_fans', PARENT/'source/build.py')
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)
original_make = original.make_fan
WIDTHS = [.42, .48, .39, .46, .43, .50, .40, .45, .49, .41, .44, .47]
TETRA = [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]]


def tetra(f, points, colors, target=None, head=False):
    # Orient each face outwards, including the morphed endpoint.
    center = [sum(p[k] for p in points)/4 for k in range(3)]
    for face in TETRA:
        a, b, c = [points[k] for k in face]
        u, v = [[p[k]-a[k] for k in range(3)] for p in [b, c]]
        n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        if sum(n[k]*(a[k]-center[k]) for k in range(3)) < 0:
            face = list(reversed(face))
        f.face([points[k] for k in face], colors if isinstance(colors, str) else colors[face[0]],
               [target[k] for k in face] if target else None, head)


def bent_limb(f, a, b, c, radius, color, target=None):
    # Three triangular rings, closed at both ends: 14 triangles. The shared
    # elbow/knee ring avoids the two internal caps of the original model.
    def rings(joints):
        return [[p[0]+math.cos(k*math.tau/3)*radius,
                 p[1]+math.sin(k*math.tau/3)*radius*.55,
                 p[2]+math.sin(k*math.tau/3)*radius*.65]
                for p in joints for k in range(3)]
    faces = [[2, 1, 0], [6, 7, 8]]
    faces += [[r*3+k, r*3+(k+1)%3, (r+1)*3+(k+1)%3, (r+1)*3+k]
              for r in range(2) for k in range(3)]
    points, up = rings([a, b, c]), rings(target) if target else None
    for j, face in enumerate(faces):
        tint = color[0] if j == 0 or 2 <= j < 5 else color[1]
        f.face([points[k] for k in face], tint, [up[k] for k in face] if up else None)


def make_fan(i, level):
    f = original.Fan()
    skin, hair, shirt = original.SKINS[i], original.HAIR[i], original.SHIRTS[i]
    width, h = WIDTHS[i], [.43, .46, .41, .48][i%4]
    neck, head_y = .67+h, .87+h
    pivot = [0, neck+.025, -.015]
    if level == 1:
        f.prism([0, (.46+neck)/2, -.015], [width, neck-.46, .25], shirt, top=1.1)
        # Same crown family and head extent, simplified to a six-face volume.
        crown = head_y+[.17, .22, .135, .18][i%4]
        p = [[sx*(.158 if sy else .145), crown if sy else head_y-.11,
              sz*(.125 if sy else .105)]
             for sy in [0, 1] for sz in [-1, 1] for sx in [-1, 1]]
        for face, tint in [([0, 1, 3, 2], skin), ([4, 6, 7, 5], hair),
                           ([0, 4, 5, 1], hair), ([2, 3, 7, 6], skin),
                           ([0, 2, 6, 4], hair if i%4 == 1 else skin),
                           ([1, 5, 7, 3], hair if i%4 == 1 else skin)]:
            f.face([p[k] for k in face], tint, head=True)
        # A continuous hair tint at the upper front keeps the palette readable
        # without spending separate triangles on a cap or tiny eyes.
        for k, point in enumerate(f.positions):
            if f.head[k] and point[1] == crown:
                shade = .8
                f.colors[k] = [round(v*shade*255) for v in original.rgb(hair)]+[255]
        tetra(f, [[-.07,neck-.02,0], [.07,neck-.02,0],
                  [0,neck+.12,-.06], [0,neck+.12,.075]], skin)
    else:
        # Hybrid 3D sprite: solid wedge torso + octahedral head, with two-sided
        # bent limb cards. It preserves breadth and a connected silhouette.
        p = [[x,y,z] for y,w in [(.50,width),(neck,width*1.1)]
             for x,z in [(-w/2,.12),(w/2,.12),(0,-.14)]]
        f.hull(p, [[2,1,0],[3,4,5],[0,1,4,3],[1,2,5,4],[2,0,3,5]], shirt)
        dy = [.17,.22,.135,.18][i%4]
        hp = [[-.158,head_y,0],[.158,head_y,0],[0,neck+.035,0],
              [0,head_y+dy,0],[0,head_y,-.125],[0,head_y,.125]]
        for face in [[4,2,0],[3,4,0],[5,3,0],[2,5,0],
                     [2,4,1],[4,3,1],[3,5,1],[5,2,1]]:
            f.face([hp[k] for k in face], hair if 3 in face or 4 in face else skin, head=True)
    for sign in [-1, 1]:
        shoulder = [sign*(width/2+.015), neck-.07, -.005]
        elbow, wrist = [shoulder[0]+sign*.045,.76,.12], [sign*.16,.59,.31]
        up_elbow, up_wrist = [sign*(width/2+.12),neck+.16,.015], [sign*(width/2+.17),neck+.51,.075]
        hip, knee, ankle = [sign*.115,.50,.04], [sign*.145,.45,.40], [sign*.145,.115,.43]
        if level == 1:
            bent_limb(f, shoulder, elbow, wrist, .085, [shirt, skin], [shoulder,up_elbow,up_wrist])
            bent_limb(f, hip, knee, ankle, .115, ['35465a','586478'])
            # Three visible shoe faces; omit its ground-facing sole.
            shoe = [[sign*.145-.08,.001,.37], [sign*.145+.08,.001,.37],
                    [sign*.145,.001,.63], [sign*.145,.121,.49]]
            f.hull(shoe, [[0,1,3],[1,2,3],[2,0,3]], ['ede6d4','293848','a4b6b9'][i%3])
        else:
            def card(a,b):
                return [[a[0]-.07,a[1],a[2]], [b[0]-.055,b[1],b[2]],
                        [b[0]+.055,b[1],b[2]+.025], [a[0]+.07,a[1],a[2]+.025]]
            f.face(card(shoulder,wrist),skin,card(shoulder,up_wrist))
            f.face([[hip[0]-.08,hip[1],hip[2]], [ankle[0]-.065,.001,.57],
                    [ankle[0]+.065,.001,.62], [knee[0]+.08,knee[1],knee[2]]], '35465a')
    assert len(f.indices)//3 == [0,90,24][level]
    return f, pivot


def build():
    assets = []
    staging = ROOT/'source/.staging'
    (staging/'runtime').mkdir(parents=True, exist_ok=True)
    original.ROOT = staging
    try:
        for level in range(3):
            directory = ROOT/f'runtime/lod{level}'
            directory.mkdir(parents=True, exist_ok=True)
            for i in range(12):
                path = directory/f'fan-{i+1:02}.glb'
                if level == 0:
                    shutil.copyfile(PARENT/f'runtime/{path.name}', path)
                    f, pivot = original_make(i)
                else:
                    original.make_fan = lambda index: make_fan(index, level)
                    original.write_glb(i)
                    shutil.move(staging/'runtime'/path.name, path)
                    f, pivot = make_fan(i, level)
                    raw = path.read_bytes()
                    length = struct.unpack_from('<I',raw,12)[0]
                    doc = json.loads(raw[20:20+length])
                    doc['asset']['generator'] = 'CC0 tennis crowd LOD v1'
                    if level == 2:
                        doc['materials'][0]['doubleSided'] = True
                    document = json.dumps(doc,separators=(',',':')).encode()
                    document += b' '*((-len(document))%4)
                    binary = raw[20+length:]
                    path.write_bytes(struct.pack('<III',0x46546c67,2,20+len(document)+len(binary))+
                                     struct.pack('<II',len(document),0x4e4f534a)+document+binary)
                data = path.read_bytes()
                assets.append({'file':path.relative_to(ROOT).as_posix(), 'level':level,
                               'variant':i, 'triangles':len(f.indices)//3,
                               'bytes':len(data), 'headPivot':pivot,
                               'sha256':hashlib.sha256(data).hexdigest()})
    finally:
        shutil.rmtree(staging)
    manifest = {'license':'CC0-1.0', 'units':'meters', 'up':'+Y', 'forward':'+Z',
                'compression':'none', 'assets':assets,
                'payloadBytes':sum(a['bytes'] for a in assets)}
    (ROOT/'assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'models':len(assets),'triangles':[210,90,24], 'bytes':manifest['payloadBytes']}))


if __name__ == '__main__':
    build()
