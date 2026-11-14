"""Rebuild original, vertex-colored pit assets. Python/NumPy/SciPy; no Blender/Draco.
SPDX-License-Identifier: CC0-1.0
"""
import json
import math
from pathlib import Path

import numpy as np

from geometry import GLB, Mesh, linear
from motion import NAMES, PARENTS, REST, WORLD_REST, CLIPS, bake, metadata

BASE = Path(__file__).resolve().parent.parent
MODELS = BASE / 'models'
TEAM, DARK, WHITE, METAL, GOLD = '#18b6bd', '#152638', '#e8f2ee', '#95a7b5', '#d6aa3b'
ROLES = [
    ('wheel_front_left', 'wheel_changer', 'front_left', '#f2cb59'),
    ('wheel_front_right', 'wheel_changer', 'front_right', '#f2cb59'),
    ('wheel_rear_left', 'wheel_changer', 'rear_left', '#f4a569'),
    ('wheel_rear_right', 'wheel_changer', 'rear_right', '#f4a569'),
    ('jack_operator', 'jack_operator', 'nose', '#c5e585'),
    ('screen_cleaner', 'screen_cleaner', 'cockpit', '#b0c6f0'),
    ('light_controller', 'light_controller', 'exit', '#e4b2d7'),
]


def crew(role, accent):
    m = Mesh()
    index = {name: i for i, name in enumerate(NAMES)}
    def bone(name):
        return index[name]
    # The suit is shaped rather than a single cuboid, with separate articulated limbs.
    m.rings([(0, .83, 0, .15, .11), (0, .99, 0, .18, .12),
             (0, 1.22, 0, .218, .125), (0, 1.29, 0, .15, .10)], TEAM, bone('Spine'), 1, segments=8)
    m.rings([(0, .81, 0, .155, .112), (0, .86, 0, .163, .116)], DARK, bone('Hips'), segments=8)
    m.box((0, .855, .119), (.07, .038, .016), METAL, bone('Hips'))
    m.box((0, 1.105, .124), (.018, .22, .013), WHITE, bone('Spine'))
    for sign in (-1, 1):
        m.box((sign * .111, 1.155, .123), (.08, .034, .014), WHITE, bone('Spine'))
        m.box((sign * .135, .97, .106), (.060, .070, .023), DARK, bone('Spine'))
    m.rings([(0, 1.29, 0, .09, .085), (0, 1.36, 0, .085, .080)], DARK, bone('Neck'), segments=8)
    # Oversized safety helmet, dark curved visor and an unmarked crown stripe.
    m.ellipsoid((0, 1.49, 0), (.365, .355, .335), WHITE, bone('Head'), segments=12, levels=4)
    m.rings([(0, 1.335, 0, .139, .135), (0, 1.375, 0, .167, .153)], TEAM, bone('Head'), 1, segments=12)
    for i in range(8):
        a, b = math.pi * (.12 + .76 * i / 8), math.pi * (.12 + .76 * (i + 1) / 8)
        def visor(theta, y):
            return (.184 * math.cos(theta), y, .171 * math.sin(theta))
        m.quad(visor(a, 1.455), visor(a, 1.545), visor(b, 1.545), visor(b, 1.455), '#123647', bone('Head'))
        m.quad(visor(a, 1.526), visor(a, 1.538), visor(b, 1.538), visor(b, 1.526), '#6fa2b1', bone('Head'))
    m.box((0, 1.654, .005), (.066, .016, .185), TEAM, bone('Head'), 1)
    for sign in (-1, 1):
        m.cylinder((sign * .169, 1.49, -.015), (sign * .190, 1.49, -.015), .065, DARK, bone('Head'), 8)
        m.cylinder((sign * .191, 1.49, -.015), (sign * .196, 1.49, -.015), .042, accent, bone('Head'), 8)
    # Bent sleeves remain contiguous at the canonical shoulder and elbow pivots.
    for side, sign in [('Left', 1), ('Right', -1)]:
        x = sign * .16
        upper, lower, hand = [bone(side + suffix) for suffix in ('Arm', 'ForeArm', 'Hand')]
        m.rings([(x, 1.015, 0, .064, .065), (x, 1.27, 0, .089, .080),
                 (x, 1.315, 0, .07, .068)], TEAM, upper, 1, segments=8)
        m.rings([(x, .80, 0, .054, .058), (x, 1.035, 0, .064, .066)], TEAM, lower, 1, segments=8)
        m.rings([(x, .84, 0, .057, .061), (x, .875, 0, .059, .063)], WHITE, lower, segments=8)
        m.ellipsoid((x, .763, .005), (.111, .130, .105), DARK, hand, segments=8, levels=3)
        m.box((x - sign * .056, .776, .025), (.035, .070, .050), accent, hand)
        m.box((x, 1.025, -.063), (.092, .074, .018), DARK, lower)
        thigh, shin, foot = [bone(side + suffix) for suffix in ('UpLeg', 'Leg', 'Foot')]
        x = sign * .10
        m.rings([(x, .445, 0, .077, .080), (x, .78, 0, .092, .092),
                 (x, .855, 0, .084, .083)], TEAM, thigh, 1, segments=8)
        m.rings([(x, .12, 0, .066, .072), (x, .455, 0, .075, .080)], DARK, shin, segments=8)
        m.box((x, .44, .082), (.113, .125, .045), accent, shin)
        m.rings([(x, .235, 0, .073, .077), (x, .267, 0, .074, .078)], WHITE, shin, segments=8)
        m.box((x, .051, .045), (.16, .085, .255), DARK, foot)
        m.box((x, .009, .045), (.164, .018, .26), METAL, foot)
        m.box((x, .075, .14), (.13, .023, .060), accent, foot)
    # Distinct tool belt silhouettes, all without logos or text.
    if role.startswith('wheel'):
        m.box((.19, .90, -.04), (.075, .125, .085), DARK, bone('Hips'))
        m.cylinder((.19, .88, .008), (.19, .95, .008), .021, METAL, bone('Hips'), 8)
    elif role == 'jack_operator':
        m.box((0, 1.11, .136), (.145, .12, .025), accent, bone('Spine'))
    elif role == 'screen_cleaner':
        m.box((.19, .89, 0), (.075, .15, .075), accent, bone('Hips'))
        m.box((.19, .982, 0), (.055, .045, .055), DARK, bone('Hips'))
    else:
        m.box((-.18, .91, .08), (.085, .115, .038), DARK, bone('Hips'))
        m.cylinder((-.18, .967, .08), (-.18, 1.045, .08), .008, METAL, bone('Hips'), 6)
    return m


def make_crew(role, kind, station, accent):
    m = crew(role, accent)
    if m.triangles > 1500:
        raise ValueError(f'{role}: {m.triangles} triangles exceeds 1500')
    glb = GLB()
    actor = glb.node('Crew_' + role, extras={'role': kind, 'station': station,
                     'forward': '+Z', 'heightMeters': 1.6675, 'teamColorSRGB': TEAM,
                     'teamMaskSemantic': '_TEAM_MASK', 'license': 'CC0-1.0'})
    nodes = [glb.node(name, translation=REST[i].tolist()) for i, name in enumerate(NAMES)]
    for i, parent in enumerate(PARENTS):
        if parent is not None:
            glb.doc['nodes'][nodes[parent]].setdefault('children', []).append(nodes[i])
    matrices = []
    for p in WORLD_REST:
        inverse = np.eye(4)
        inverse[:3, 3] = -p
        matrices.append(inverse.T.flatten())
    glb.doc['skins'] = [{'name': 'Canonical18', 'joints': nodes, 'skeleton': nodes[0],
                         'inverseBindMatrices': glb.accessor(matrices, 'MAT4')}]
    mesh = glb.node('Suit_' + role, mesh=glb.mesh('CrewGeometry', m, skinned=True), skin=0)
    # A skinned mesh is a glTF scene root. Move the imported scene/group as a unit,
    # so both skeleton and mesh receive instance transforms without skin-parent warnings.
    glb.doc['nodes'][actor]['children'] = [nodes[0]]
    glb.doc['scenes'][0]['nodes'] = [actor, mesh]
    bake(glb, nodes, role)
    glb.save(MODELS / (role + '.glb'))
    return {'id': role, 'role': kind, 'station': station, 'file': 'models/' + role + '.glb',
            'triangles': m.triangles, 'joints': 18, 'clips': list(CLIPS), 'accent': accent,
            'heightMeters': 1.6675, 'teamColor': TEAM, 'vertexColor': True}


def save_prop(name, parts, extras=None, animations=None):
    glb = GLB()
    root = glb.node(name, extras={'license': 'CC0-1.0', 'units': 'meters', **(extras or {})})
    glb.doc['scenes'][0]['nodes'] = [root]
    nodes = {}
    for part_name, mesh, fields in parts:
        material = 0
        if part_name.startswith('Lamp'):
            color = {'LampRed': '#ef5753', 'LampAmber': '#ffc857', 'LampGreen': '#73e5a6'}[part_name]
            material = len(glb.doc['materials'])
            glb.doc['materials'].append({'name': part_name, 'pbrMetallicRoughness':
                                        {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': .3},
                                        'emissiveFactor': [v * .15 for v in linear(color)]})
        node = glb.node(part_name, mesh=glb.mesh(part_name, mesh, material=material), **fields)
        glb.doc['nodes'][root].setdefault('children', []).append(node)
        nodes[part_name] = node
    if animations:
        for clip, channels in animations.items():
            glb.animation(clip, [(nodes[n], p, t, v) for n, p, t, v in channels])
    glb.save(MODELS / (name + '.glb'))
    return {'id': name, 'file': 'models/' + name + '.glb',
            'triangles': sum(m.triangles for _, m, _ in parts), 'nodes': list(nodes), **(extras or {})}


def build_props():
    results = []
    tyre = Mesh()
    tyre.wheel([0, 0, 0])
    results.append(save_prop('spare_wheel', [('Wheel', tyre, {})],
                            {'radiusMeters': .34, 'widthMeters': .30, 'axle': '+X',
                             'origin': 'axle center; place Y=.34 at floor'}))
    stack = Mesh()
    for i in range(4):
        stack.wheel([.025 * (i % 2), .16 + i * .31, 0], segments=20, axle='y')
    results.append(save_prop('tire_stack', [('Tires', stack, {})], {'count': 4, 'origin': 'ground center'}))
    gun = Mesh()
    gun.cylinder((0, 0, -.075), (0, 0, .16), .059, TEAM, segments=12)
    gun.cylinder((0, 0, .16), (0, 0, .225), .040, METAL, segments=10)
    gun.cylinder((0, 0, .225), (0, 0, .28), .028, DARK, segments=8)
    gun.box((0, -.085, -.02), (.069, .15, .073), DARK)
    gun.box((0, -.034, .045), (.035, .050, .025), GOLD)
    gun.box((0, -.17, -.02), (.08, .035, .08), METAL)
    results.append(save_prop('wheel_gun', [('WheelGun', gun, {})],
                            {'gripLocalMeters': [0, -.07, -.02], 'socketLocalMeters': [0, 0, .28], 'forward': '+Z'}))
    base, arm, pad, handle = Mesh(), Mesh(), Mesh(), Mesh()
    base.box((0, .055, 0), (.50, .08, .66), DARK)
    for sign in (-1, 1):
        base.cylinder((sign * .23, .065, -.23), (sign * .29, .065, -.23), .065, METAL, segments=10)
        base.cylinder((sign * .23, .065, .23), (sign * .29, .065, .23), .065, METAL, segments=10)
        arm.box((sign * .13, .13, .01), (.065, .10, .42), TEAM)
    pad.cylinder((0, -.025, 0), (0, .025, 0), .12, DARK, segments=12)
    arm.cylinder((-.14, .16, .08), (.14, .16, .08), .040, METAL, segments=10)
    arm.cylinder((0, .12, .08), (0, .31, .08), .033, METAL, segments=10)
    handle.cylinder((0, 0, 0), (0, .88, -.23), .024, METAL, segments=10)
    handle.cylinder((-.16, .88, -.23), (.16, .88, -.23), .031, DARK, segments=10)
    times = [0, .2, 1., 1.2]
    animations = {}
    for name, heights, angles in [('jack_up', [.19, .19, .35, .35], [0, 0, -.70, -.70]),
                                  ('jack_down', [.35, .35, .19, .19], [-.70, -.70, 0, 0])]:
        animations[name] = [('LiftPad', 'translation', times, [[0, y, .08] for y in heights]),
                            ('Handle', 'rotation', times, [[math.sin(a / 2), 0, 0, math.cos(a / 2)] for a in angles])]
    results.append(save_prop('jack', [('Base', base, {}), ('LiftArm', arm, {}),
                                      ('LiftPad', pad, {'translation': [0, .19, .08]}),
                                      ('Handle', handle, {'translation': [0, .13, -.24]})],
                             {'liftRangeMeters': [.19, .35], 'liftNode': 'LiftPad', 'handleNode': 'Handle'}, animations))
    star = Mesh()
    star.cylinder((0, .04, 0), (0, 1.25, 0), .021, METAL, segments=10)
    star.box((0, .025, 0), (.42, .05, .34), DARK)
    outline = [(math.cos(i * math.pi / 8) * (.27 if i % 2 == 0 else .16),
                1.39 + math.sin(i * math.pi / 8) * (.27 if i % 2 == 0 else .16)) for i in range(16)]
    for i in range(16):
        j = (i + 1) % 16
        a, b = outline[i], outline[j]
        star.tri((0, 1.39, .027), (a[0], a[1], .027), (b[0], b[1], .027), GOLD)
        star.tri((0, 1.39, -.027), (b[0], b[1], -.027), (a[0], a[1], -.027), GOLD)
        star.quad((a[0], a[1], -.027), (b[0], b[1], -.027), (b[0], b[1], .027), (a[0], a[1], .027), DARK)
    results.append(save_prop('stop_star', [('StopStar', star, {})], {'meaning': 'stop at pit box; no lettering'}))
    for name in ['pit_light_entry', 'pit_light_exit']:
        housing = Mesh()
        housing.box((0, .04, 0), (.5, .08, .40), DARK)
        housing.cylinder((0, .08, 0), (0, 1.20, 0), .035, METAL, segments=10)
        housing.box((0, 1.50, 0), (.34, .86, .22), DARK)
        parts = [('Housing', housing, {})]
        for label, y, color in [('Red', 1.77, '#ef5753'), ('Amber', 1.50, '#ffc857'), ('Green', 1.23, '#73e5a6')]:
            lens = Mesh()
            housing.cylinder((0, y, .105), (0, y, .16), .126, '#090f1a', segments=16)
            lens.cylinder((0, y, .16), (0, y, .175), .098, color, segments=16)
            # Small hoods keep the three states legible in sunlight.
            housing.box((0, y + .127, .16), (.29, .027, .22), DARK)
            parts.append(('Lamp' + label, lens, {}))
        results.append(save_prop(name, parts, {'states': ['red', 'amber', 'green'], 'forward': '+Z',
                                               'lampNodes': ['LampRed', 'LampAmber', 'LampGreen']}))
    for name in ['pit_lane_arrows', 'speed_limit_symbol']:
        sign = Mesh()
        sign.box((0, .03, 0), (.45, .06, .34), DARK)
        sign.cylinder((0, .04, 0), (0, 1.25, 0), .025, METAL, segments=8)
        sign.box((0, 1.37, 0), (.66, .52, .055), DARK)
        sign.box((0, 1.37, .030), (.61, .47, .014), WHITE)
        if name == 'pit_lane_arrows':
            for x in [-.14, .12]:
                points = [(x - .12, 1.25, .043), (x + .01, 1.37, .043), (x - .12, 1.49, .043),
                          (x - .04, 1.49, .043), (x + .10, 1.37, .043), (x - .04, 1.25, .043)]
                for a, b, c in [(0, 1, 5), (1, 4, 5), (1, 2, 3), (1, 3, 4)]:
                    sign.tri(points[a], points[c], points[b], TEAM)
        else:
            # Original text-free speedometer with short needle: reduced speed.
            for i in range(14):
                a, b = math.pi * i / 14, math.pi * (i + 1) / 14
                sign.quad((.22 * math.cos(a), 1.29 + .22 * math.sin(a), .044),
                          (.22 * math.cos(b), 1.29 + .22 * math.sin(b), .044),
                          (.18 * math.cos(b), 1.29 + .18 * math.sin(b), .044),
                          (.18 * math.cos(a), 1.29 + .18 * math.sin(a), .044), '#ef5753')
            sign.tri((-.025, 1.28, .047), (.025, 1.30, .047), (-.12, 1.40, .047), DARK)
            sign.box((0, 1.24, .043), (.35, .025, .013), DARK)
        results.append(save_prop(name, [('Sign', sign, {})], {'lettering': False, 'forward': '+Z'}))
    cloth = Mesh()
    cloth.box((0, 0, 0), (.20, .025, .14), '#b0c6f0')
    cloth.box((.05, .017, -.005), (.11, .012, .15), WHITE)
    results.append(save_prop('cleaning_cloth', [('Cloth', cloth, {})], {'gripLocalMeters': [0, 0, 0]}))
    return results


def main():
    MODELS.mkdir(exist_ok=True)
    actors = [make_crew(*row) for row in ROLES]
    props = build_props()
    rig = {'units': 'meters', 'axes': {'up': '+Y', 'forward': '+Z', 'anatomicalLeft': '+X'},
           'rotationSpace': 'parent-local', 'rotationFormat': 'quaternion-xyzw',
           'bones': [{'name': n, 'parent': NAMES[PARENTS[i]] if PARENTS[i] is not None else None,
                      'restTranslationMeters': REST[i].tolist()} for i, n in enumerate(NAMES)]}
    (BASE / 'rig.json').write_text(json.dumps(rig, indent=2) + '\n')
    motion = {'schemaVersion': 1, 'kind': 'embedded-glb-motion-contract', 'rig': '../rig.json',
              'sampleRateHz': 30, 'clips': {name: {'duration': duration, **metadata(name)} for name, duration in CLIPS.items()},
              'integration': {'blendSeconds': .18, 'rootMotion': 'baked local +Z, consume exactly once',
                              'sequence': ['idle_wait', 'rush_in', 'jack_up', 'remove_wheel', 'mount_wheel',
                                           'jack_down', 'thumbs_up', 'step_back'],
                              'roleExtras': {'screen_cleaner': 'wipe_screen', 'light_controller': 'signal_release'}}}
    (BASE / 'motions' / 'clips.json').write_text(json.dumps(motion, indent=2) + '\n')
    (BASE / 'source' / 'model-catalog.json').write_text(json.dumps({'crew': actors, 'props': props}, indent=2) + '\n')
    print(json.dumps({'crew': [(a['id'], a['triangles']) for a in actors], 'props': len(props),
                      'clipsPerActor': len(CLIPS)}, indent=2))


if __name__ == '__main__':
    main()
