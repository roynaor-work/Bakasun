"""Original canonical 18-joint pit-stop choreography. SPDX-License-Identifier: CC0-1.0."""
import math

import numpy as np
from scipy.spatial.transform import Rotation

from geometry import unit

NAMES = ['Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head',
         'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
         'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']
PARENTS = [None, 0, 1, 2, 3, 4, 3, 6, 7, 3, 9, 10, 1, 12, 13, 1, 15, 16]
REST = np.array([[0, 0, 0], [0, .86, 0], [0, .20, 0], [0, .18, 0], [0, .10, 0], [0, .13, 0],
                 [.16, .06, 0], [0, -.27, 0], [0, -.24, 0], [-.16, .06, 0], [0, -.27, 0], [0, -.24, 0],
                 [.10, 0, 0], [0, -.41, 0], [0, -.37, 0], [-.10, 0, 0], [0, -.41, 0], [0, -.37, 0]], dtype=float)
WORLD_REST = []
for i, local in enumerate(REST):
    WORLD_REST.append(local + (WORLD_REST[PARENTS[i]] if PARENTS[i] is not None else 0))
WORLD_REST = np.array(WORLD_REST)
CLIPS = {'idle_wait': 2.4, 'rush_in': 2.8, 'remove_wheel': 3.2, 'mount_wheel': 3.2,
         'jack_up': 2.8, 'jack_down': 2.8, 'thumbs_up': 2.4, 'step_back': 2.4,
         'wipe_screen': 3.2, 'signal_release': 2.4}


def smooth(t):
    t = float(np.clip(t, 0, 1))
    return t * t * t * (10 - 15 * t + 6 * t * t)


def envelope(u):
    return smooth(u / .25) * smooth((1 - u) / .25)


def q_euler(x=0, y=0, z=0):
    return Rotation.from_euler('xyz', [x, y, z]).as_quat()


def q_direction(v):
    a, b = np.array([0., -1., 0.]), unit(v)
    if np.dot(a, b) < -.99999:
        return q_euler(math.pi)
    q = np.append(np.cross(a, b), 1 + np.dot(a, b))
    return q / np.linalg.norm(q)


def world_pose(rotations, translations):
    positions, orientation = [], []
    for i, parent in enumerate(PARENTS):
        if parent is None:
            positions.append(translations[i].copy())
            orientation.append(Rotation.from_quat(rotations[i]))
        else:
            positions.append(positions[parent] + orientation[parent].apply(translations[i]))
            orientation.append(orientation[parent] * Rotation.from_quat(rotations[i]))
    return np.array(positions), orientation


def solve_arm(side, target, rotations, translations, wrist=None):
    upper = 6 if side == 'Left' else 9
    sign = 1 if side == 'Left' else -1
    positions, orientations = world_pose(rotations, translations)
    shoulder = positions[upper]
    delta = target - shoulder
    distance = np.clip(np.linalg.norm(delta), .055, .509)
    direction = unit(delta)
    pole = np.array([sign * .8, -.15, -.55])
    perpendicular = unit(pole - np.dot(pole, direction) * direction)
    along = (.27 ** 2 - .24 ** 2 + distance ** 2) / (2 * distance)
    elbow = shoulder + direction * along + perpendicular * math.sqrt(max(0, .27 ** 2 - along ** 2))
    actual_target = shoulder + direction * distance
    upper_world = Rotation.from_quat(q_direction(elbow - shoulder))
    lower_world = Rotation.from_quat(q_direction(actual_target - elbow))
    rotations[upper] = (orientations[3].inv() * upper_world).as_quat()
    rotations[upper + 1] = (upper_world.inv() * lower_world).as_quat()
    if wrist is not None:
        rotations[upper + 2] = (lower_world.inv() * Rotation.from_quat(wrist)).as_quat()


def leg(side, target, rotations, translations):
    index, x = (12, .1) if side == 'Left' else (15, -.1)
    hip = translations[0] + translations[1] + np.array([x, 0, 0])
    dy, dz = target[1] - hip[1], target[2] - hip[2]
    length = min(.77999999, math.hypot(dy, dz))
    knee = math.acos(np.clip((length ** 2 - .41 ** 2 - .37 ** 2) / (2 * .41 * .37), -1, 1))
    thigh = math.atan2(-dz, -dy) - math.atan2(.37 * math.sin(knee), .41 + .37 * math.cos(knee))
    rotations[index] = q_euler(thigh)
    rotations[index + 1] = q_euler(knee)
    rotations[index + 2] = q_euler(-thigh - knee)


def travel_pose(u, backwards=False):
    """Six/four alternating steps; support soles remain in world coordinates."""
    count, distance = (4, -.32) if backwards else (6, .32)
    phase = np.clip((u - .08) / .84 * count, 0, count)
    active = min(count - 1, int(phase))
    weight = smooth(phase - active)
    if phase >= count:
        weight = 1.
    anchors = [0., 0.]
    for i in range(active):
        anchors[i % 2] += distance
    start = anchors[active % 2]
    anchors[active % 2] = start + distance * weight
    root = sum(anchors) / 2
    lift = .09 * math.sin(math.pi * weight) ** 2
    foot_y = [.08, .08]
    foot_y[active % 2] += lift
    return root, anchors, foot_y


def pose(clip, u, role='wheel_front_left'):
    rotations = np.tile([0., 0., 0., 1.], (18, 1))
    translations = REST.copy()
    work = envelope(u)
    lean = 0.
    left_target, right_target = np.array([.27, .86, .12]), np.array([-.27, .86, .12])
    left_foot, right_foot = np.array([.1, .08, 0.]), np.array([-.1, .08, 0.])
    if clip == 'idle_wait':
        breath = math.sin(2 * math.pi * u) ** 2
        lean = .012 * breath
        left_target += [0, .006 * breath, 0]
        right_target += [0, .006 * breath, 0]
    elif clip in ('rush_in', 'step_back'):
        root_z, feet_z, foot_y = travel_pose(u, clip == 'step_back')
        translations[0, 2] = root_z
        translations[1, 1] -= .055 * smooth(u / .08) * smooth((1 - u) / .08)
        left_foot[1:], right_foot[1:] = [foot_y[0], feet_z[0]], [foot_y[1], feet_z[1]]
        phase = (u - .08) / .84 * (4 if clip == 'step_back' else 6)
        swing = math.sin(phase * math.pi) * .10 * work
        left_target[2] += swing
        right_target[2] -= swing
        lean = .10 * work * (-.4 if clip == 'step_back' else 1)
    elif clip in ('remove_wheel', 'mount_wheel'):
        translations[1] += np.array([0, -.34, -.10]) * work
        lean = .30 * work
        pull = smooth((u - .38) / .22) * smooth((.80 - u) / .18)
        if clip == 'mount_wheel':
            pull = 1 - pull
        operation = np.array([.20, .48, .31 - .14 * pull])
        left_target = left_target * (1 - work) + operation * work
        right_target = right_target * (1 - work) + (operation * [-1, 1, 1]) * work
        if 'rear' in role:
            left_target[2] += .02 * work
            right_target[2] += .02 * work
    elif clip in ('jack_up', 'jack_down'):
        translations[1] += np.array([0, -.22, -.08]) * work
        lean = .32 * work
        phase = smooth((u - .30) / .40)
        lever_y = .80 - .30 * (phase if clip == 'jack_up' else 1 - phase)
        for target, sign in [(left_target, 1), (right_target, -1)]:
            target[:] = target * (1 - work) + np.array([sign * .14, lever_y, .29]) * work
    elif clip == 'thumbs_up':
        right_target = right_target * (1 - work) + np.array([-.24, 1.24, .30]) * work
        rotations[5] = q_euler(-.04 * work)
    elif clip == 'wipe_screen':
        translations[1] += np.array([0, -.06, 0]) * work
        lean = .18 * work
        wipe = math.sin(2 * math.pi * (u - .25) / .5) * .16 * work
        right_target = right_target * (1 - work) + np.array([wipe, 1.03, .43]) * work
        left_target = left_target * (1 - work) + np.array([.21, .99, .33]) * work
    elif clip == 'signal_release':
        left_target = left_target * (1 - work) + np.array([.31, 1.25, .25]) * work
        right_target = right_target * (1 - work) + np.array([-.13, .99, .28]) * work
    rotations[2] = q_euler(lean * .60)
    rotations[3] = q_euler(lean * .40)
    rotations[4] = q_euler(-lean * .3)
    # All desired hand points are in actor coordinates, before root translation.
    root = translations[0]
    wrist = q_euler(z=math.pi / 2 * work) if clip == 'thumbs_up' else None
    solve_arm('Left', left_target + root, rotations, translations)
    solve_arm('Right', right_target + root, rotations, translations, wrist)
    leg('Left', left_foot, rotations, translations)
    leg('Right', right_foot, rotations, translations)
    return rotations, translations


def metadata(clip):
    duration = CLIPS[clip]
    travelling = clip in ('rush_in', 'step_back')
    supports = []
    if travelling:
        count = 4 if clip == 'step_back' else 6
        for foot, name in enumerate(['LeftFoot', 'RightFoot']):
            start = 0
            for i in range(count):
                if i % 2 != foot:
                    continue
                lift, land = duration * (.08 + .84 * i / count), duration * (.08 + .84 * (i + 1) / count)
                if lift - start > .02:
                    supports.append({'bone': name, 'start': start, 'end': lift, 'local': [0, -.08, 0]})
                start = land
            if duration - start > .02:
                supports.append({'bone': name, 'start': start, 'end': duration, 'local': [0, -.08, 0]})
    else:
        supports = [{'bone': side + 'Foot', 'start': 0, 'end': duration, 'local': [0, -.08, 0]} for side in ['Left', 'Right']]
    events = {
        'remove_wheel': [('gun_loosen', .37), ('wheel_detach', .58)],
        'mount_wheel': [('wheel_attach', .46), ('gun_tighten', .60)],
        'jack_up': [('lift_start', .30), ('car_raised', .70)],
        'jack_down': [('lower_start', .30), ('car_grounded', .70)],
        'thumbs_up': [('ready', .50)], 'wipe_screen': [('screen_clean', .70)],
        'signal_release': [('release', .55)],
    }.get(clip, [])
    return {'loop': clip == 'idle_wait', 'locomotion': travelling, 'floorY': 0,
            'soleLocal': [0, -.08, 0], 'supports': supports, 'ballVisible': False,
            'checkHingeDirection': True, 'symmetryMode': 'structural',
            'rootMotion': 'baked translation; consume once; do not add reference travel',
            'rootDeltaMeters': [0, 0, .96 if clip == 'rush_in' else -.64 if clip == 'step_back' else 0],
            'events': [{'type': event, 'time': round(phase * duration, 6)} for event, phase in events],
            'intent': 'intentional bilateral work / asymmetric role gestures; structural symmetry only'}


def bake(glb, nodes, role):
    for clip, duration in CLIPS.items():
        # Include the exact support boundaries, then regularly sample the same analytic IK.
        meta = metadata(clip)
        times = sorted(set([round(x, 7) for x in np.linspace(0, duration, round(duration * 30) + 1)]
                           + [round(t, 7) for w in meta['supports'] for t in [w['start'], w['end']]]))
        poses = [pose(clip, time / duration, role) for time in times]
        channels = []
        for i, node in enumerate(nodes):
            quaternions = np.array([p[0][i] for p in poses])
            for j in range(1, len(quaternions)):
                if np.dot(quaternions[j - 1], quaternions[j]) < 0:
                    quaternions[j] *= -1
            if np.max(np.abs(quaternions - [0, 0, 0, 1])) > 1e-7:
                channels.append((node, 'rotation', times, quaternions))
            translations = np.array([p[1][i] for p in poses])
            if np.max(np.abs(translations - REST[i])) > 1e-7:
                channels.append((node, 'translation', times, translations))
        # The idle always has changing arm channels; every clip has a positive duration.
        glb.animation(clip, channels, meta)
