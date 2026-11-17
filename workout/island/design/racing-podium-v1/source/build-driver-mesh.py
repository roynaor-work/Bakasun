"""Adapt the repository's CC0 modeled athlete anatomy into two plain racing suits.

Read-only reuse of characters2 garment/anatomy lofts and tennis-v7 adult calibration,
five-finger grip, swept hair and shoe lasts. Never executes an existing generator.
Intermediate JSON is written only to /tmp/racing-podium-raw.
"""
import ast
import json
import math
import sys
from pathlib import Path
import numpy as np

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
DESIGN = ROOT.parent
sys.path.insert(0, str(DESIGN / 'characters2/source'))
from mesh import Mesh
from body import add_body, blend, loft
from head_hands import _face, _hair
from gear import _shoe_upper, _shoe_details, _surface

# Reuse the existing reviewed sculpt functions, without their top-level writes.
tennis_source = DESIGN / 'tennis-v7/source/characters.py'
tree = ast.parse(tennis_source.read_text())
source_rig = json.loads((DESIGN / 'characters/rig.json').read_text())
OLD = [j['name'] for j in source_rig['joints']]
RIG = {j['name']: np.linalg.inv(np.array(j['inverseBindMatrix']).reshape(4, 4).T)[:3, 3]
       for j in source_rig['joints']}
scope = dict(globals())
for function in tree.body:
    if isinstance(function, ast.FunctionDef) and function.name in ['adult', 'grip', 'hair', 'shoes']:
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(tennis_source), 'exec'), scope)

OUT = Path('/tmp/racing-podium-raw')
OUT.mkdir(exist_ok=True)
looks = [
    dict(id='male', gender='male', skin='#B77D59', hair='#292B33', shirt='#F06D58',
         shorts='#263844', accent='#EEE4CE', style='crop'),
    dict(id='female', gender='female', skin='#C99470', hair='#392C30', shirt='#38B9AC',
         shorts='#263844', accent='#EEE4CE', style='pony'),
]
for look in looks:
    mesh = Mesh(OLD, {**look, 'accent': '#182B35', 'shoes': '#263844', 'soles': '#E5DDC9', 'gloves': '#EEE4CE'})
    add_body(mesh, 'skier', RIG)
    # Small suit-specific garment details reuse the same continuous weighted
    # surface vocabulary. All fixed technical trim is outside the team mask.
    loft(mesh, [(1.032, .053, .048, -.011), (1.052, .053, .047, -.011),
                (1.058, .046, .042, -.011)], 'fixed_collar', {'Chest': 1}, segments=28, caps=False)
    loft(mesh, [(.635, .125, .087, .008), (.660, .124, .087, .008)],
         'fixed_belt', {'Hips': 1}, segments=40, caps=False)
    # A blank metal buckle, without marks or text.
    center = np.array([0, .650, .099])
    radii = np.array([.016, .010, .0035])
    vertices = [center + radii * [x,y,z] for x,y,z in
                [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                 (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    mesh.add(vertices, [(0,2,1),(0,3,2),(4,5,6),(4,6,7),(0,1,5),(0,5,4),
                        (3,7,6),(3,6,2),(0,4,7),(0,7,3),(1,2,6),(1,6,5)],
             'fixed_buckle', {'Hips': 1}, color='#CBB788')
    for sign in [-1, 1]:
        points = [[sign*.127,.704,.028],[sign*.139,.790,.034],
                  [sign*.158,.882,.037],[sign*.164,.967,.024]]
        mesh.tube(points, [.0045]*4, 'fixed_stripe',
                  [blend('Spine','Chest',(p[1]-.75)/.15) for p in points], segments=6,
                  color='#D5DED7')
    for i, region in enumerate(mesh.regions):
        if region in ['fixed_collar', 'fixed_belt']:
            from mesh import linear_rgb
            mesh.colors[i] = linear_rgb('#182B35')
    head_start = len(mesh.positions)
    _face(mesh, 'soccer-player')
    scope['hair'](mesh, look)
    for i in range(head_start, len(mesh.positions)):
        x, y, z = mesh.positions[i]
        region = mesh.regions[i]
        if region.startswith('preserve_eye') or region in ['preserve_iris', 'preserve_pupil']:
            cx = .031 if x > 0 else -.031
            x = cx + (x - cx) * 1.12
            y = 1.215 + (y - 1.215) * 1.3
        if abs(x) < .023 and 1.172 < y < 1.238 and z > .086:
            z = .077 + (z - .077) * .73
        if region in ['preserve_lip', 'preserve_mouth']:
            y += .003 * (abs(x) / .023) ** 1.4
        if look['gender'] == 'female':
            x *= 1 - .09 * math.exp(-((y - 1.112) / .04) ** 2)
        mesh.positions[i] = [x * 1.055, 1.097 + (y - 1.075) * .85, z]
    scope['grip'](mesh, 1)
    scope['grip'](mesh, -1)
    scope['shoes'](mesh)
    # A racing suit has reinforced knees and unbranded shoulder panels. Colors
    # are baked into vertices; the mask makes team recoloring deterministic.
    fixed_panels = set()
    for i, (p, region) in enumerate(zip(mesh.positions, mesh.regions)):
        if region == 'shirt' and .83 < p[1] < .99 and abs(p[0]) > .115:
            mesh.colors[i] = mesh.palette['shorts']
            fixed_panels.add(i)
        if region == 'shorts' and .306 < p[1] < .366:
            from mesh import linear_rgb
            mesh.colors[i] = linear_rgb('#344B58')
    # Above assignment kept palette entries as strings; normalize uniformly.
    from mesh import linear_rgb
    mesh.colors = [linear_rgb(c) for c in mesh.colors]
    mesh.positions = [scope['adult'](p, look['gender'] == 'female') for p in mesh.positions]
    raw = dict(positions=mesh.positions, indices=mesh.indices, normals=mesh.normals,
               colors=mesh.colors, joints=mesh.joints, weights=mesh.weights)
    raw['teamMask'] = [0 if i in fixed_panels else 1 if r == 'shirt' else 2 if r in ['shorts', 'shoes'] else 0 for i,r in enumerate(mesh.regions)]
    raw['gender'] = look['gender']
    raw['look'] = look
    raw['bounds'] = [np.min(mesh.positions, axis=0).tolist(), np.max(mesh.positions, axis=0).tolist()]
    (OUT / ('driver-' + look['id'] + '.json')).write_text(json.dumps(raw, separators=(',', ':')))
    print(look['id'], len(mesh.positions), 'vertices', len(mesh.indices), 'triangles', 'bounds', raw['bounds'])

canonical = json.loads((DESIGN / 'motion2/soccer.json').read_text())['skeleton']['bones']
bind = {b['name']: scope['adult'](RIG[b['name']]) for b in canonical}
rig = dict(name='RacingPodiumCanonical18', boneCount=18, units='metres', up='+Y', forward='+Z',
           canonicalSource='../motion2/soccer.json / skeleton.bones',
           geometrySource='characters2/source + tennis-v7/source/characters.py; CC0-1.0',
           bindPose='T-pose; identity local rotations; calibrated adult translations',
           rotationContract='Absolute parent-local xyzw; use supplied inverse bind matrices.',
           sockets={'RightHand': {'translation': [-.035, 0, -.014], 'rotation': [0, 0, 0, 1]},
                    'LeftHand': {'translation': [.035, 0, -.014], 'rotation': [0, 0, 0, 1]}},
           joints=[dict(name=b['name'], parent=b['parent'],
                        translation=(np.array(bind[b['name']]) - np.array(bind[b['parent']] if b['parent'] else [0, 0, 0])).tolist(),
                        worldPosition=bind[b['name']]) for b in canonical])
(ROOT / 'rig.json').write_text(json.dumps(rig, indent=2) + '\n')
