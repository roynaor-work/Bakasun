"""Original, 30 Hz coach performances for the canonical Y-up, +Z-forward rig.

Hand positions are authored in metres in the chest's unrotated frame. A small
analytic two-link solve creates local arm rotations; the rest of the rig stays
in its canonical local space. Every performance shares the same neutral ends.
"""
import math
import numpy as np

FPS = 30
BONES = ('Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LeftArm',
         'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
         'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot')
I = np.array([0., 0., 0., 1.])
# Absolute model-space wrist positions; +X is the character's left.
REST_L = np.array([.26, .85, .045])
REST_R = np.array([-.26, .85, .045])
HAPPY = np.array([1., 0., 0., 0., 0., 0., 0., 0.])
EXPRESSIONS = {
    'happy': HAPPY, 'surprised': [0, 1, 0, 0, 0, 0, 0, 0],
    'encouraging': [0, 0, 1, 0, 0, 0, 0, 0],
    'thoughtful': [0, 0, 0, 1, 0, 0, 0, 0],
    'proud': [0, 0, 0, 0, 1, 0, 0, 0],
    'gently_disappointed': [0, 0, 0, 0, 0, 1, 0, 0],
    'laughing': [0, 0, 0, 0, 0, 0, 1, 0],
    'wink': [0, 0, 0, 0, 0, 0, 0, 1],
}


def _unit(v):
    v = np.asarray(v, dtype=float)
    n = np.linalg.norm(v)
    return v / n if n > 1e-10 else np.array([0., 0., 1.])


def _mul(a, b):
    av, aw, bv, bw = a[:3], a[3], b[:3], b[3]
    return np.r_[aw * bv + bw * av + np.cross(av, bv), aw * bw - np.dot(av, bv)]


def _rotate(q, v):
    return _mul(_mul(q, np.r_[v, 0.]), np.r_[-q[:3], q[3]])[:3]


def _between(a, b):
    a, b = _unit(a), _unit(b)
    dot = float(np.clip(np.dot(a, b), -1., 1.))
    if dot < -.999999:
        axis = _unit(np.cross(a, [1., 0., 0.] if abs(a[0]) < .9 else [0., 0., 1.]))
        return np.r_[axis, 0.]
    q = np.r_[np.cross(a, b), 1. + dot]
    return q / np.linalg.norm(q)


def _axis(axis, angle):
    return np.r_[_unit(axis) * math.sin(angle / 2), math.cos(angle / 2)]


def _euler(x, y, z):
    return _mul(_mul(_axis([0, 0, 1], z), _axis([0, 1, 0], y)), _axis([1, 0, 0], x))


def _arm(side, wrist):
    """Solve shoulder and elbow rotations with an outward/forward elbow pole."""
    sign = 1 if side == 'Left' else -1
    shoulder = np.array([sign * .16, 1.30, 0.])
    delta = np.asarray(wrist) - shoulder
    distance = float(np.linalg.norm(delta))
    direction = _unit(delta)
    # Keep a definite bend, even for targets just outside the arm's reach.
    d = min(.487, max(.08, distance))
    upper, lower = .27, .24
    along = (upper * upper - lower * lower + d * d) / (2 * d)
    height = math.sqrt(max(0., upper * upper - along * along))
    pole = np.array([sign * .35, 0., -1.])
    bend = pole - direction * np.dot(pole, direction)
    if np.linalg.norm(bend) < .00001:
        bend = np.cross(direction, [0., 1., 0.])
    elbow = direction * along + _unit(bend) * height
    fore = direction * d - elbow
    upper_q = _between([0., -1., 0.], elbow)
    lower_local = _rotate(np.r_[-upper_q[:3], upper_q[3]], fore)
    return upper_q, _between([0., -1., 0.], lower_local)


def _pose(l=None, r=None, head=(0, 0, 0), chest=(0, 0, 0), expression='happy', root=0.):
    return {'l': np.array(REST_L if l is None else l, dtype=float),
            'r': np.array(REST_R if r is None else r, dtype=float),
            'head': np.array(head, dtype=float), 'chest': np.array(chest, dtype=float),
            'weights': np.array(EXPRESSIONS[expression], dtype=float), 'root': float(root)}


def _mix(a, b, u):
    # Quintic easing has zero velocity and acceleration at authored poses.
    u = u * u * u * (u * (u * 6 - 15) + 10)
    return {k: a[k] * (1 - u) + b[k] * u for k in a}


def _frame(p):
    rotations = {name: I.tolist() for name in BONES}
    rotations['Head'] = _euler(*p['head']).tolist()
    rotations['Chest'] = _euler(*p['chest']).tolist()
    for side, wrist in [('Left', p['l']), ('Right', p['r'])]:
        arm, fore = _arm(side, wrist)
        rotations[side + 'Arm'] = arm.tolist()
        rotations[side + 'ForeArm'] = fore.tolist()
    return {'rotations': rotations, 'translations': {'Root': [0., float(p['root']), 0.]},
            'weights': p['weights'].tolist()}


def _clip(name, duration, middle, loop=False, events=(), jump=False):
    neutral = _pose()
    keys = [(0., neutral)] + middle + [(duration, neutral)]
    frames = []
    key_frames = [_frame(pose) for _, pose in keys]
    for i in range(round(duration * FPS) + 1):
        t = i / FPS
        for k in range(len(keys) - 1):
            t0, a = keys[k]
            t1, b = keys[k + 1]
            if t <= t1 + 1e-9:
                p = _mix(a, b, max(0., min(1., (t - t0) / (t1 - t0))))
                break
        # Interpolate solved rotations instead of solving along a straight wrist
        # line. The latter can pass through the shoulder and flip an elbow.
        u = max(0., min(1., (t - t0) / (t1 - t0)))
        u = u * u * u * (u * (u * 6 - 15) + 10)
        frame = {'rotations': {}, 'translations': {'Root': [0., float(p['root']), 0.]},
                 'weights': p['weights'].tolist()}
        for bone in BONES:
            qa = np.asarray(key_frames[k]['rotations'][bone])
            qb = np.asarray(key_frames[k + 1]['rotations'][bone])
            if np.dot(qa, qb) < 0:
                qb = -qb
            q = (1 - u) * qa + u * qb
            frame['rotations'][bone] = (q / np.linalg.norm(q)).tolist()
        if jump and .9 < t < 1.7:
            frame['translations']['Root'][1] = .18 * math.sin(math.pi * (t - .9) / .8) ** 2
        frames.append(frame)
    intervals = [(0., .9), (1.7, duration)] if jump else [(0., duration)]
    supports = [{'bone': foot, 'start': start, 'end': end, 'local': [0., -.08, 0.]}
                for foot in ('LeftFoot', 'RightFoot') for start, end in intervals]
    return {'name': name, 'duration': duration, 'loop': loop, 'frames': frames,
            'supports': supports, 'events': list(events)}


def build_clips(bones):
    """Return 18 original animation clips. ``bones`` is accepted for integration."""
    del bones  # Canonical names and proportions are intentionally fixed above.
    P = _pose
    clips = []
    clips.append(_clip('stand', 3., [(1.5, P(head=(.025, .015, .02), chest=(.015, 0, 0)))], True))
    clips.append(_clip('wave', 3.6, [
        (.8, P(r=(-.39, 1.62, .12), head=(0, -.08, -.05), expression='encouraging')),
        (1.2, P(r=(-.48, 1.56, .12), head=(0, -.08, -.05), expression='encouraging')),
        (1.6, P(r=(-.32, 1.65, .12), head=(0, -.08, -.05), expression='encouraging')),
        (2., P(r=(-.48, 1.56, .12), head=(0, -.08, -.05), expression='encouraging')),
        (2.4, P(r=(-.32, 1.65, .12), head=(0, -.08, -.05), expression='encouraging')),
        (2.8, P(r=(-.39, 1.62, .12), head=(0, -.08, -.05), expression='encouraging'))]))
    clips.append(_clip('point_right', 2.8, [(.8, P(l=(.59, 1.32, .11), head=(0, .22, 0), expression='encouraging')), (2., P(l=(.59, 1.32, .11), head=(0, .22, 0), expression='encouraging'))]))
    clips.append(_clip('point_left', 2.8, [(.8, P(r=(-.59, 1.32, .11), head=(0, -.22, 0), expression='encouraging')), (2., P(r=(-.59, 1.32, .11), head=(0, -.22, 0), expression='encouraging'))]))
    clips.append(_clip('point_up', 2.8, [(.8, P(r=(-.34, 1.70, .10), head=(-.15, -.08, 0), expression='surprised')), (2., P(r=(-.34, 1.70, .10), head=(-.15, -.08, 0), expression='surprised'))]))
    clips.append(_clip('point_down', 2.8, [(.8, P(r=(-.35, .91, .28), head=(.20, -.08, 0), expression='thoughtful')), (2., P(r=(-.35, .91, .28), head=(.20, -.08, 0), expression='thoughtful'))]))
    clips.append(_clip('fist_pump', 3., [(.7, P(r=(-.29, 1.14, .30), expression='proud')), (1.15, P(r=(-.33, 1.59, .14), head=(-.06, 0, -.05), expression='proud')), (1.65, P(r=(-.29, 1.30, .27), expression='proud')), (2.2, P(r=(-.33, 1.58, .14), expression='proud'))]))
    clips.append(_clip('clap', 3.6, [(.8, P(l=(.28, 1.18, .32), r=(-.28, 1.18, .32), expression='happy')), (1.2, P(l=(.07, 1.18, .39), r=(-.07, 1.18, .39), expression='happy')), (1.55, P(l=(.25, 1.18, .32), r=(-.25, 1.18, .32), expression='happy')), (1.9, P(l=(.07, 1.18, .39), r=(-.07, 1.18, .39), expression='happy')), (2.25, P(l=(.25, 1.18, .32), r=(-.25, 1.18, .32), expression='happy')), (2.6, P(l=(.07, 1.18, .39), r=(-.07, 1.18, .39), expression='happy')), (2.85, P(l=(.21, 1.17, .32), r=(-.21, 1.17, .32)))], events=[{'time': 1.2, 'type': 'clap'}, {'time': 1.9, 'type': 'clap'}, {'time': 2.6, 'type': 'clap'}]))
    clips.append(_clip('joy_jump', 3., [(.7, P(l=(.42, 1.24, .22), r=(-.42, 1.24, .22), expression='laughing')), (1.25, P(l=(.42, 1.61, .12), r=(-.42, 1.61, .12), head=(-.08, 0, 0), expression='laughing')), (1.7, P(l=(.42, 1.47, .16), r=(-.42, 1.47, .16), expression='laughing')), (2.2, P(l=(.36, 1.15, .18), r=(-.36, 1.15, .18), expression='happy'))], events=[{'time': .9, 'type': 'takeoff'}, {'time': 1.7, 'type': 'land'}], jump=True))
    clips.append(_clip('shrug', 2.8, [(.8, P(l=(.47, 1.13, .20), r=(-.47, 1.13, .20), head=(0, 0, .16), expression='thoughtful')), (2., P(l=(.47, 1.13, .20), r=(-.47, 1.13, .20), head=(0, 0, .16), expression='thoughtful'))]))
    clips.append(_clip('nod', 3., [(.7, P(head=(-.12, 0, 0), expression='encouraging')), (1.15, P(head=(.20, 0, 0), expression='encouraging')), (1.6, P(head=(-.10, 0, 0), expression='encouraging')), (2.1, P(head=(.18, 0, 0), expression='encouraging')), (2.4, P(head=(.04, 0, 0), expression='encouraging'))]))
    clips.append(_clip('shake_head', 3., [(.7, P(head=(0, .23, 0), expression='gently_disappointed')), (1.2, P(head=(0, -.25, 0), expression='gently_disappointed')), (1.7, P(head=(0, .23, 0), expression='gently_disappointed')), (2.2, P(head=(0, -.18, 0), expression='gently_disappointed'))]))
    clips.append(_clip('air_hug', 3.2, [(.8, P(l=(.48, 1.25, .22), r=(-.48, 1.25, .22), expression='encouraging')), (1.45, P(l=(.14, 1.20, .40), r=(-.14, 1.20, .40), head=(.06, 0, .06), expression='encouraging')), (2.35, P(l=(.14, 1.20, .40), r=(-.14, 1.20, .40), head=(.06, 0, .06), expression='encouraging'))]))
    clips.append(_clip('go_there', 3.2, [(.8, P(l=(.22, 1.22, .35), head=(0, .12, 0), expression='encouraging')), (1.6, P(l=(.59, 1.32, .10), head=(0, .22, 0), expression='encouraging')), (2.4, P(l=(.59, 1.32, .10), head=(0, .22, 0), expression='encouraging'))]))
    clips.append(_clip('well_done', 3., [(.8, P(l=(.34, 1.17, .27), r=(-.34, 1.40, .24), head=(0, 0, -.08), expression='proud')), (1.65, P(l=(.34, 1.17, .27), r=(-.34, 1.47, .22), head=(-.06, 0, -.08), expression='wink')), (2.2, P(l=(.34, 1.17, .27), r=(-.34, 1.40, .24), expression='proud'))]))
    clips.append(_clip('try_again', 3.2, [(.8, P(l=(.30, 1.12, .25), r=(-.30, 1.12, .25), head=(.12, 0, .08), expression='gently_disappointed')), (1.6, P(l=(.35, 1.22, .29), r=(-.35, 1.22, .29), head=(-.06, 0, 0), expression='encouraging')), (2.4, P(l=(.35, 1.22, .29), r=(-.35, 1.22, .29), expression='encouraging'))]))
    clips.append(_clip('ready', 3., [(1.5, P(l=(.34, 1.06, .18), r=(-.34, 1.06, .18), head=(-.035, 0, 0), expression='encouraging'))], True))
    clips.append(_clip('rest_idle', 4., [(1., P(head=(.02, .055, .025), chest=(.012, .015, 0))), (2., P(head=(-.025, 0, -.02), chest=(-.01, 0, 0))), (3., P(head=(.015, -.055, .02), chest=(.01, -.015, 0)))], True))
    return clips
