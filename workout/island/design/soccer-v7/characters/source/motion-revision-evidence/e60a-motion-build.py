#!/usr/bin/env python3
"""Build the v7 original / adapted authored motion library. No captured human data.

Canonical coordinates are Y-up, Z-forward, X anatomical left.  Quaternion
rotations are absolute in parent-local canonical space, not bind-pose deltas.
Every clip has an integral number of 1/30-second intervals.  Contact IK is
baked into those samples; a runtime must repeat IK *after* mixing clips.
"""
from __future__ import annotations

import bisect
import copy
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
DESIGN = OUT.parents[1]
FPS = 30
TAU = math.tau
IDENTITY = [0.0, 0.0, 0.0, 1.0]


def add(a, b): return [a[i] + b[i] for i in range(3)]
def sub(a, b): return [a[i] - b[i] for i in range(3)]
def mul(a, x): return [v * x for v in a]
def dot(a, b): return sum(x*y for x, y in zip(a, b))
def length(a): return math.sqrt(dot(a, a))
def unit(a): return mul(a, 1 / max(1e-12, length(a)))
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def lerp(a, b, t): return [x+(y-x)*t for x, y in zip(a, b)]
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def smooth(t): return (lambda x: x*x*(3-2*x))(clamp(t))


def qnorm(q):
    d = math.sqrt(sum(x*x for x in q))
    return [x/d for x in q]


def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return [aw*bx+ax*bw+ay*bz-az*by,
            aw*by-ax*bz+ay*bw+az*bx,
            aw*bz+ax*by-ay*bx+az*bw,
            aw*bw-ax*bx-ay*by-az*bz]


def qinv(q): return [-q[0], -q[1], -q[2], q[3]]


def qrot(q, v):
    xyz = q[:3]
    t = mul(cross(xyz, v), 2)
    return add(v, add(mul(t, q[3]), cross(xyz, t)))


def qaxis(axis, radians): return [*(mul(unit(axis), math.sin(radians/2))), math.cos(radians/2)]


def qeuler(x=0.0, y=0.0, z=0.0):
    x, y, z = (math.radians(a) for a in [x, y, z])
    return qmul(qmul(qaxis([1, 0, 0], x), qaxis([0, 1, 0], y)), qaxis([0, 0, 1], z))


def qbetween(a, b):
    a, b = unit(a), unit(b)
    w = 1 + dot(a, b)
    if w < 1e-9:
        axis = cross(a, [1, 0, 0] if abs(a[0]) < .8 else [0, 1, 0])
        return qaxis(axis, math.pi)
    return qnorm([*cross(a, b), w])


def slerp(a, b, t):
    c = sum(x*y for x, y in zip(a, b))
    if c < 0: b, c = [-v for v in b], -c
    if c > .9995: return qnorm(lerp(a, b, t))
    theta = math.acos(clamp(c, -1, 1))
    return [(x*math.sin((1-t)*theta)+y*math.sin(t*theta))/math.sin(theta) for x, y in zip(a, b)]


def sample_frame(keys, u):
    times = [k['time'] for k in keys]
    j = max(0, min(len(keys)-2, bisect.bisect_right(times, u)-1))
    a, b = keys[j:j+2]
    t = clamp((u-a['time']) / max(1e-12, b['time']-a['time']))
    return dict(
        rotations={n: slerp(a['rotations'][n], b['rotations'][n], t) for n in NAMES},
        hipsOffsetMeters=lerp(a['hipsOffsetMeters'], b['hipsOffsetMeters'], t),
        referenceRootTranslationMeters=lerp(a.get('referenceRootTranslationMeters', [0, 0, 0]), b.get('referenceRootTranslationMeters', [0, 0, 0]), t),
    )


base_path = DESIGN / 'motion/soccer.json'
extra_path = DESIGN / 'motion2/soccer.json'
throws_path = DESIGN / 'motion2/soccer/throws-receives.json'
BASE = json.loads(base_path.read_text())
EXTRA = json.loads(extra_path.read_text())
THROWS = json.loads(throws_path.read_text())
SKELETON = copy.deepcopy(EXTRA['skeleton'])
BONES = SKELETON['bones']
NAMES = [b['name'] for b in BONES]
PARENT = {b['name']: b['parent'] for b in BONES}
REST = {b['name']: b['restTranslationMeters'] for b in BONES}
SOURCES = [base_path, extra_path, throws_path]


def fk(frame):
    poses = {}
    path = frame.get('referenceRootTranslationMeters', [0, 0, 0])
    for b in BONES:
        n, parent = b['name'], b['parent']
        local = b['restTranslationMeters'][:]
        if n == 'Hips': local = add(local, frame['hipsOffsetMeters'])
        q = frame['rotations'][n]
        if parent:
            pp, pq = poses[parent]
            poses[n] = (add(pp, qrot(pq, local)), qmul(pq, q))
        else:
            poses[n] = (add(local, path), q)
    return poses


def solve_limb(frame, upper, middle, end, target, pole, end_q=IDENTITY):
    """Analytic two-link IK. Target, pole, and end orientation are world-space."""
    poses = fk(frame)
    p, _ = poses[upper]
    parent_q = poses[PARENT[upper]][1]
    a, b = length(REST[middle]), length(REST[end])
    delta = sub(target, p)
    actual_d = length(delta)
    d = clamp(actual_d, abs(a-b)+.0001, a+b-.0001)
    direction = unit(delta)
    pole_plane = sub(pole, mul(direction, dot(pole, direction)))
    if length(pole_plane) < 1e-6:
        pole_plane = cross(direction, [1, 0, 0])
    pole_plane = unit(pole_plane)
    along = (a*a-b*b+d*d) / (2*d)
    height = math.sqrt(max(0, a*a-along*along))
    knee = add(p, add(mul(direction, along), mul(pole_plane, height)))
    actual_target = add(p, mul(direction, d))
    uq = qbetween(REST[middle], sub(knee, p))
    lq = qbetween(REST[end], sub(actual_target, knee))
    frame['rotations'][upper] = qnorm(qmul(qinv(parent_q), uq))
    frame['rotations'][middle] = qnorm(qmul(qinv(uq), lq))
    frame['rotations'][end] = qnorm(qmul(qinv(lq), end_q))
    return max(0.0, actual_d-d)


def solve_foot(frame, side, ankle, foot_q=IDENTITY, pole=None):
    return solve_limb(frame, side+'UpLeg', side+'Leg', side+'Foot', ankle, pole or [0, 0, 1], foot_q)


def solve_hand(frame, side, target, hand_q=IDENTITY):
    sign = 1 if side == 'Left' else -1
    return solve_limb(frame, side+'Arm', side+'ForeArm', side+'Hand', target, [sign*.6, -.6, .7], hand_q)


BOOT_CORNERS = [[x, -.08, z] for x in [-.05, .05] for z in [-.055, .155]]


def sole_min(poses, side):
    p, q = poses[side+'Foot']
    return min(add(p, qrot(q, c))[1] for c in BOOT_CORNERS)


def fix_supports(frame, contacts, t):
    """Bake exact sole anchors. Contacts are in the reference locomotion world."""
    residual = 0.0
    for c in contacts:
        if c['mode'] == 'plant' and c['start']-1e-8 <= t <= c['end']+1e-8:
            yaw_q = qaxis([0, 1, 0], c.get('yawRadians', 0))
            residual = max(residual, solve_foot(frame, c['bone'][:-4], add(c['anchor'], [0, .08, 0]),
                                               yaw_q, qrot(yaw_q, [0, 0, 1])))
    return residual


def fix_swing_floor(frame, contacts, t):
    # Correct small boot-only penetration in unsupported feet. Body-ground
    # collisions in slides/dives need complete skinned-mesh runtime correction.
    for side in ['Left', 'Right']:
        if any(c['bone'] == side+'Foot' and c['mode'] == 'plant' and c['start']-1e-8 <= t <= c['end']+1e-8 for c in contacts):
            continue
        poses = fk(frame)
        p, q = poses[side+'Foot']
        lowest = sole_min(poses, side)
        if lowest < -1e-5:
            solve_foot(frame, side, add(p, [0, -lowest+.0001, 0]), q)


def quantize(obj):
    if isinstance(obj, float):
        return round(obj, 6) if abs(obj) >= .0000005 else 0
    if isinstance(obj, dict): return {k: quantize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)): return [quantize(v) for v in obj]
    return obj


CLIPS = []


def record(id, label, duration, loop, builder, contacts, events=None, **meta):
    count = round(duration*FPS)
    duration = count/FPS
    frames, max_reach = [], 0.0
    for i in range(count+1):
        t, u = i/FPS, i/count
        frame = builder(u, t, duration)
        frame['timeSeconds'] = t
        max_reach = max(max_reach, fix_supports(frame, contacts, t))
        fix_swing_floor(frame, contacts, t)
        for n in NAMES:
            frame['rotations'][n] = qnorm(frame['rotations'][n])
            if frames and dot(frame['rotations'][n], frames[-1]['rotations'][n]) < 0:
                frame['rotations'][n] = [-v for v in frame['rotations'][n]]
        frames.append(frame)
    clip = dict(id=id, label=label, duration=duration, fps=FPS, frameCount=count+1,
                loop=loop, rootMotion=False, frames=frames, contacts=contacts,
                events=events or [], authored=True, motionCapture=False,
                transition=dict(blendSeconds=.20, sourcePose='currently-displayed',
                    continueSource=True, curve='cubic-smoothstep',
                    phaseSync=bool(loop), footLock='carry-world-anchor-until-release',
                    lockRelease='earliest-source-or-phase-aligned-target-toeoff',
                    solveIK='after-blend', preventFloorPenetration='whole-skinned-mesh'),
                reachResidualMeters=max_reach, **meta)
    CLIPS.append(clip)
    return clip


def make_contact(bone, start, end, anchor, mode='plant', yaw=0):
    return dict(bone=bone, start=start, end=end, anchor=anchor, mode=mode,
                soleOffset=[0, -.08, 0], **({'yawRadians': yaw} if yaw else {}))


def adapt(source, name, label, new_id=None, pose_transform=None, **extra):
    original = source['states'][name]
    duration = round(original['durationSeconds']*FPS)/FPS
    contacts = []
    for c in original.get('supportContacts', []):
        contacts.append(make_contact(c['bone'], c['startTime']*duration, c['endTime']*duration,
                                     c['anchorMeters'], c.get('mode', 'plant')))
    events = [dict(timeSeconds=e.get('time', e.get('atSeconds', 0)/original['durationSeconds'])*duration,
                   name=e['name'], domain='presentation') for e in original.get('events', [])]
    ball_contacts = copy.deepcopy(original.get('ballContacts', []))
    for c in ball_contacts:
        normalized = c.get('time', c.get('atSeconds',0)/original['durationSeconds'])
        c['atSeconds'] = c['timeSeconds'] = normalized*duration
    def build(u,t,d):
        frame = sample_frame(original['keyframes'], u)
        return pose_transform(frame,u) if pose_transform else frame
    return record(new_id or name, label, duration, original['loop'],
                  build, contacts, events,
                  sourceClip=name, sourcePackage=next(str(p.relative_to(DESIGN)) for s,p in zip([BASE,EXTRA,THROWS],SOURCES) if s is source),
                  notes=original.get('notes', ''), ballContacts=ball_contacts,
                  floorPolicy='body-slide' if name in ['fall', 'recover', 'slide_tackle'] or name.startswith('keeper_dive') else 'boot-clearance', **extra)


def relaxed_idle(frame,u):
    breath = math.sin(TAU*u)
    frame['rotations']['Spine'] = qeuler(.7*breath)
    frame['rotations']['Chest'] = qeuler(-.35*breath)
    frame['rotations']['Head'] = qeuler(-.35*breath)
    for side,sign in [('Left',1),('Right',-1)]:
        frame['rotations'][side+'Arm'] = qeuler(-3,sign*3,sign*(10+.4*breath))
        frame['rotations'][side+'ForeArm'] = qeuler(-12)
        frame['rotations'][side+'Hand'] = qeuler(0,sign*5,-sign*3)
    return frame


# Neutral football stance keeps palms near thighs, with clearance from cloth.
adapt(BASE, 'idle', 'עמידה ונשימה', pose_transform=relaxed_idle)


def gait(id, label, speed, duration, duty, lift, lean, dribble=False):
    duration = round(duration*FPS)/FPS
    stride, sweep = speed*duration, speed*duration*duty
    # Compression peaks at mid-stance; the COM peaks during flight. Dense
    # continuous FK (200001 phases/leg) calibrated these small speed-specific
    # lowerings to keep the Hermite recovery target at least 4.9mm in reach.
    crouch_knots = [(1.6,0),(2.4,.010),(3.2,.018),(4.2,.015),(5.4,.036),(7.2,.052)]
    crouch = 0.0
    for (sa,ca),(sb,cb) in zip(crouch_knots,crouch_knots[1:]):
        if sa <= speed <= sb:
            crouch = ca+(cb-ca)*(speed-sa)/(sb-sa)
            break
    contacts = [make_contact('LeftFoot', 0, duty*duration, [.1, 0, sweep/2]),
                make_contact('RightFoot', duration/2, (.5+duty)*duration, [-.1, 0, stride/2+sweep/2])]
    events = [dict(timeSeconds=0, name='left_foot_strike', domain='presentation'),
              dict(timeSeconds=duration/2, name='right_foot_strike', domain='presentation')]
    if dribble:
        events += [dict(timeSeconds=.20*duration, name='left_ball_tap', domain='presentation'),
                   dict(timeSeconds=.70*duration, name='right_ball_tap', domain='presentation')]

    def build(u, t, d):
        # COM lowers at impact and rises in the aerial portion; pelvis/yaw and
        # counter-rotation avoid an identical hinged action at all six speeds.
        wave = math.sin(TAU*u)
        hip_y = .776 - .004*speed - crouch - .013*math.cos(2*TAU*(u-duty/2))
        frame = dict(rotations={n: IDENTITY[:] for n in NAMES},
                     hipsOffsetMeters=[.009*wave, hip_y-.86, .012*math.sin(2*TAU*u)],
                     referenceRootTranslationMeters=[0, 0, speed*t])
        frame['rotations']['Hips'] = qeuler(0, -4.5*wave, 2.1*wave)
        frame['rotations']['Spine'] = qeuler(lean*.6, 6*wave, -1.5*wave)
        frame['rotations']['Chest'] = qeuler(lean*.4, 4*wave, -1.7*wave)
        frame['rotations']['Head'] = qeuler(-lean*.45, -2*wave, .9*wave)
        for side, offset, sign in [('Left', 0, 1), ('Right', .5, -1)]:
            p = (u-offset) % 1
            if abs(u-1) < 1e-10 and side == 'Left': p = 0
            if p <= duty:
                z, y, pitch = sweep/2-speed*p*d, .08, 0
            else:
                s = (p-duty)/(1-duty)
                # Hermite recovery matches local velocity -speed at both
                # endpoints, so WORLD foot velocity is zero at toe-off/strike.
                # Slight claw-back is natural and avoids an instantaneous
                # speed-sized horizontal velocity jump at the contact edges.
                tangent = -speed*d*(1-duty)
                z = (-sweep/2)*(2*s**3-3*s*s+1)+(sweep/2)*(-2*s**3+3*s*s)+tangent*(2*s**3-3*s*s+s)
                y = .08+lift*math.sin(math.pi*s)**1.1
                pitch = -26*math.sin(math.pi*s) + 8*math.sin(TAU*s)
                if dribble and s > .65:
                    z += .075*math.sin(math.pi*(s-.65)/.35)
            ankle = [sign*.1, y, z+speed*t]
            solve_foot(frame, side, ankle, qeuler(pitch))
            # The ipsilateral arm moves backward at ipsilateral heel strike.
            # Cosine aligns the shoulder's backward peak with the forward foot
            # rather than producing a same-side arm/leg phase at sprint pace.
            swing = math.cos(TAU*(u-offset))
            frame['rotations'][side+'Arm'] = qeuler(-8 + (22+3.2*speed)*swing, 0, sign*(9+2*abs(wave)))
            frame['rotations'][side+'ForeArm'] = qeuler(-65-(12+speed)*swing, sign*5, 0)
            frame['rotations'][side+'Hand'] = qeuler(0, sign*7, 0)
        return frame

    return record(id, label, duration, True, build, contacts, events,
                  speedMps=speed, strideLengthMeters=stride, dutyFactor=duty,
                  locomotion=True, floorPolicy='boot-clearance',
                  notes='Original analytic gait with two-link IK, world-space stance anchors, flight, COM bounce, pelvic yaw and opposite shoulder swing. Treadmill display requires ground/camera tracking of the reference root path.')


for args in [
    ('run_1', 'ריצה · 1.6 מ׳/ש׳', 1.6, .90, .42, .15, 7),
    ('run_2', 'ריצה · 2.4 מ׳/ש׳', 2.4, .80, .36, .18, 9),
    ('run_3', 'ריצה · 3.2 מ׳/ש׳', 3.2, .70, .32, .21, 11),
    ('run_4', 'ריצה · 4.2 מ׳/ש׳', 4.2, .60, .28, .24, 13),
    ('run_5', 'ריצה · 5.4 מ׳/ש׳', 5.4, 16/30, .26, .27, 15),
    ('sprint', 'ספרינט · 7.2 מ׳/ש׳', 7.2, 14/30, .22, .29, 20),
]: gait(*args)

def braking():
    duration = 1.0
    path = lambda t: 2*(1-(1-clamp(t))**3)
    contacts = [
        make_contact('LeftFoot',2/30,5/30,[.1,0,path(2/30)+.25]),
        make_contact('RightFoot',7/30,12/30,[-.1,0,path(7/30)+.22]),
        make_contact('LeftFoot',14/30,1,[.1,0,2.04]),
        make_contact('RightFoot',20/30,1,[-.1,0,1.96]),
    ]

    def ankle(side,t):
        sign = 1 if side=='Left' else -1
        supports = [c for c in contacts if c['bone']==side+'Foot']
        for c in supports:
            if c['start'] <= t <= c['end']:
                return [sign*.1,.08,c['anchor'][2]], 0
        if t < supports[0]['start']:
            s = clamp(t/supports[0]['start'])
            initial_z = .38 if side=='Left' else -.22
            clearance = .06 if side=='Left' else .04
            lift = .04 if side=='Left' else .21
            z = initial_z+(supports[0]['anchor'][2]-initial_z)*smooth(s)
            y = .08+clearance*(1-smooth(s))+lift*math.sin(math.pi*s)**1.1
            return [sign*.1,y,z], -8*(1-smooth(s))
        prior = next(c for c in supports if c['end'] < t)
        following = next(c for c in supports if c['start'] > t)
        s = clamp((t-prior['end'])/(following['start']-prior['end']))
        z = prior['anchor'][2]+(following['anchor'][2]-prior['anchor'][2])*smooth(s)
        lift = .19 if side=='Left' else .13
        return [sign*.1,.08+lift*math.sin(math.pi*s)**1.1,z], -18*math.sin(math.pi*s)

    def build(u,t,d):
        f = relaxed_idle(dict(rotations={n:IDENTITY[:] for n in NAMES},
            hipsOffsetMeters=[0,-.015,0],referenceRootTranslationMeters=[0,0,0]),u)
        travel = path(t)
        energy = (1-u)**.7
        wave = math.sin(3*math.pi*u)*energy
        f['hipsOffsetMeters'] = [.012*wave,.715+.13*smooth((u-.4)/.6)-.86,0]
        f['referenceRootTranslationMeters'] = [0,0,travel]
        f['rotations']['Hips'] = qeuler(0,3*wave,1.4*wave)
        lean = 5*(1-smooth(u/.2))-12*math.sin(math.pi*clamp(u/.7))
        f['rotations']['Spine'] = qeuler(.65*lean,-3*wave,0)
        f['rotations']['Chest'] = qeuler(.35*lean,-2*wave,0)
        f['rotations']['Head'] = qeuler(-.6*lean,2*wave,0)
        for side,sign in [('Left',1),('Right',-1)]:
            target,pitch = ankle(side,t)
            solve_foot(f,side,target,qeuler(pitch))
            arm = clamp((target[2]-travel)/.35,-1,1)*25*energy
            f['rotations'][side+'Arm'] = qeuler(-3+arm,sign*3,sign*10)
            f['rotations'][side+'ForeArm'] = qeuler(-12-50*energy)
        return f

    record('decelerate','בלימה מריצה',duration,False,build,contacts,
        [dict(timeSeconds=c['start'],name=c['bone'].lower()+'_braking_plant',domain='presentation') for c in contacts]+
        [dict(timeSeconds=1,name='braking_stopped',domain='presentation')],
        entrySpeedMps=6,exitSpeedMps=0,referenceDistanceMeters=2.0,locomotion=True,
        floorPolicy='boot-clearance',notes='Original sprint braking over one second: initial speed6m/s, v=6(1-t)^2, two metres travel. Three staggered braking plants and a final right-foot settle; no immediate support on clip entry. Align incoming root velocity and admit new plants only after the displayed foot lands.')


braking()


def turning(side):
    """Two-step 60-degree turn; foot headings change only in swing."""
    sign = 1 if side == 'left' else -1
    duration, heading = .8, sign*math.pi/3
    leading = 'Left' if sign == 1 else 'Right'
    trailing = 'Right' if sign == 1 else 'Left'
    center = [sign*.20, 0, .18]
    final_q = qaxis([0, 1, 0], heading)
    final_anchors = {leg: add(center, qrot(final_q, [.1 if leg == 'Left' else -.1, 0, 0]))
                     for leg in ['Left', 'Right']}
    contacts = [make_contact(leading+'Foot',0,2/30,[sign*.1,0,0]),
                make_contact(trailing+'Foot',0,11/30,[-sign*.1,0,0]),
                make_contact(leading+'Foot',11/30,duration,final_anchors[leading],yaw=heading),
                make_contact(trailing+'Foot',21/30,duration,final_anchors[trailing],yaw=heading)]

    def build(u,t,d):
        f = relaxed_idle(dict(rotations={n: IDENTITY[:] for n in NAMES},
            hipsOffsetMeters=[0,-.015,0],referenceRootTranslationMeters=[0,0,0]),u)
        advance = smooth((u-.05)/.85)
        rotation_phase = smooth((u-.08)/.73)
        yaw = heading*rotation_phase
        crouch = math.sin(math.pi*u)**1.2
        f['referenceRootTranslationMeters'] = mul(center, advance)
        f['hipsOffsetMeters'] = [sign*.025*math.sin(TAU*u),-.015-.095*crouch,0]
        f['rotations']['Hips'] = qeuler(0,math.degrees(yaw),-sign*5*crouch)
        anticipation = sign*13*math.sin(math.pi*u)
        f['rotations']['Spine'] = qeuler(3*crouch,anticipation,-sign*2*crouch)
        f['rotations']['Chest'] = qeuler(0,-anticipation*.45,sign*2*crouch)
        f['rotations']['Head'] = qeuler(-2*crouch,-anticipation*.4,0)
        for leg in ['Left','Right']:
            start, end = (2/30,11/30) if leg == leading else (11/30,21/30)
            phase = clamp((t-start)/(end-start))
            leg_sign = 1 if leg == 'Left' else -1
            initial = [leg_sign*.1,0,0]
            target = lerp(initial,final_anchors[leg],smooth(phase))
            target[1] = .08+.14*math.sin(math.pi*phase)**1.1
            foot_yaw = heading*smooth(phase)
            flat_q = qaxis([0,1,0],foot_yaw)
            foot_q = qmul(flat_q,qeuler(-12*math.sin(math.pi*phase)))
            solve_foot(f,leg,target,foot_q,qrot(flat_q,[0,0,1]))
            swing = math.sin(math.pi*phase)
            f['rotations'][leg+'Arm'] = qeuler(-8-leg_sign*sign*20*swing,leg_sign*4,leg_sign*(12+8*crouch))
            f['rotations'][leg+'ForeArm'] = qeuler(-25-20*crouch)
        return f

    record('turn_'+side,'פנייה '+('שמאלה' if side=='left' else 'ימינה'),duration,False,build,contacts,
        [dict(timeSeconds=11/30,name='turn_leading_foot_plant',domain='presentation'),
         dict(timeSeconds=21/30,name='turn_trailing_foot_plant',domain='presentation')],
        headingDeltaRadians=heading,locomotion=True,floorPolicy='boot-clearance',
        notes='Original two-step 60-degree turn with low COM, torso anticipation, opposite arm balance and world-space sole anchors. Root rotation remains identity; Hips and foot orientations carry heading. Contact yawRadians preserves planted foot heading after runtime IK.')


turning('left')
turning('right')
adapt(BASE, 'kick', 'בעיטה לשער')
adapt(EXTRA, 'short_pass', 'מסירה קצרה')
adapt(EXTRA, 'long_pass', 'מסירה ארוכה')
header_clip = adapt(EXTRA, 'header', 'נגיחה בקפיצה')
for contact in header_clip['ballContacts']:
    if contact['bone'] == 'Head':
        # Canonical Head is the lower skull joint; the original cue landed
        # at the nose on the v7 human mesh. Contact now meets the forehead.
        contact['localPointMeters'] = [0,.18,.095]
        keys = [dict(**frame,time=frame['timeSeconds']/header_clip['duration']) for frame in header_clip['frames']]
        pose = sample_frame(keys,contact['timeSeconds']/header_clip['duration'])
        head_position,head_q = fk(pose)['Head']
        contact['pointMeters'] = add(head_position,qrot(head_q,contact['localPointMeters']))
        contact['ballCenterMeters'] = add(contact['pointMeters'],[0,0,.11])
gait('dribble', 'כדרור בריצה', 2.4, .8, .36, .17, 10, True)


def limb_pole(poses, upper, middle, end):
    axis = unit(sub(poses[end][0],poses[upper][0]))
    elbow = sub(poses[middle][0],poses[upper][0])
    plane = sub(elbow,mul(axis,dot(elbow,axis)))
    return unit(plane) if length(plane)>1e-7 else [0,0,1]


def blend_pole(a,b,t):
    return qrot(slerp(IDENTITY,qbetween(a,b),t),a)


slide_reach = []
# Extremal hand-local skin points from all 16 authored character/LOD meshes.
# They constrain the finger envelope without the excessive height of an AABB.
SLIDE_HAND_SUPPORT_POINTS = [
    [.01868143320083618,-.12469563722610477,-.05174390599131584],
    [-.06402413904666901,-.09648416280746464,.05252142250537872],
    [.014363672733306881,-.16035471200942997,-.031290289014577866],
    [-.0068109369277954135,-.17331335783004764,.0015445342287421227],
    [.00435599327087402,-.15795157194137577,-.027114087715744972],
    [.020678427219390866,-.12036637306213382,-.05167149379849434],
    [.008922230601310727,-.1267368578910828,-.05069628730416298],
    [-.0657571217417717,-.09291843414306644,.05506821349263191],
    [-.027390215396881107,-.15473762989044193,.034834153950214386],
]
SLIDE_WRIST_END_Y = .002-min(qrot(qeuler(-100),point)[1] for point in SLIDE_HAND_SUPPORT_POINTS)


def seated_slide_finish(frame,u):
    """Keep entry/ball strike, then settle on the side of the pelvis."""
    amount = smooth((u-.45)/.35)
    if amount <= 0: return frame
    # Match the existing baked, unsupported boot pose before retaining its
    # trajectory. The standard recorder repeats this after the new limb solve.
    fix_swing_floor(frame,[],u)
    before = fk(frame)
    target = dict(rotations={name:IDENTITY[:] for name in NAMES},
                  hipsOffsetMeters=[0,.083-.86,.32],referenceRootTranslationMeters=[0,0,0])
    target['rotations']['Hips'] = qeuler(-30,0,-25)
    target['rotations']['Head'] = qeuler(10)
    target['rotations']['RightArm'] = qeuler(-10,0,-30)
    target['rotations']['RightForeArm'] = qeuler(-25)
    result = dict(rotations={name:slerp(frame['rotations'][name],target['rotations'][name],amount) for name in NAMES},
                  hipsOffsetMeters=lerp(frame['hipsOffsetMeters'],target['hipsOffsetMeters'],amount),
                  referenceRootTranslationMeters=frame['referenceRootTranslationMeters'][:])
    residual = 0
    for side,ankle in [('Right',[-.12,.08,1.06]),('Left',[.20,.08,.15])]:
        upper,middle,end = side+'UpLeg',side+'Leg',side+'Foot'
        pole = blend_pole(limb_pole(before,upper,middle,end),unit([0,1,.2]),amount)
        residual = max(residual,solve_foot(result,side,lerp(before[end][0],ankle,amount),
                       slerp(before[end][1],IDENTITY,amount),pole))
    hand_target = lerp(before['LeftHand'][0],[.30,.0275,.05],amount)
    hand_q = slerp(before['LeftHand'][1],qeuler(-100),amount)
    # Local quaternion interpolation can dip the world-space fingers between
    # 30Hz keys. A phase-shaped 7mm margin protects that blend and fades out
    # at the supported endpoint, where the actual hand envelope rests at 2mm.
    hand_phase = max(0,min(1,(u-.45)/.35))
    clearance = .002+.007*math.sin(math.pi*hand_phase)**2
    hand_target[1] = max(hand_target[1],clearance-min(qrot(hand_q,point)[1] for point in SLIDE_HAND_SUPPORT_POINTS))
    hand_pole = blend_pole(limb_pole(before,'LeftArm','LeftForeArm','LeftHand'),unit([.6,-.6,.7]),amount)
    residual = max(residual,solve_limb(result,'LeftArm','LeftForeArm','LeftHand',hand_target,hand_pole,
                                     hand_q))
    slide_reach.append(residual)
    return result


slide_clip = adapt(EXTRA,'slide_tackle','גלישה לכדור',pose_transform=seated_slide_finish)
slide_clip['authoredLimbReachResidualMeters'] = max(slide_reach,default=0)
slide_clip['contacts'].append(dict(bone='LeftHand',start=.8*slide_clip['duration'],end=slide_clip['duration'],
    anchor=[.30,0,.05],mode='hand-support',contactPointOffsetMeters=qrot(qinv(qeuler(-100)),[0,-SLIDE_WRIST_END_Y,0]),
    solve='authored-world-hand-target'))
for event in slide_clip['events']:
    if event['name']=='visual_palm_ground': event['timeSeconds']=.8*slide_clip['duration']
slide_clip['notes'] += ' Post-strike finish reauthored as a low pelvis-supported side slide, extended right leg, tucked left knee, upward knee poles and flat left palm behind the hip; no finger-tripod support.'
adapt(BASE, 'fall', 'נפילה לצד')


def neutral():
    return dict(rotations={n: IDENTITY[:] for n in NAMES}, hipsOffsetMeters=[0, -.025, 0],
                referenceRootTranslationMeters=[0, 0, 0])


def blend_knots(knots, u):
    j = max(0, min(len(knots)-2, bisect.bisect_right([k[0] for k in knots], u)-1))
    ta, a = knots[j]; tb, b = knots[j+1]
    return lerp(a, b, smooth((u-ta)/(tb-ta)))


def two_plants(duration, z=.0):
    return [make_contact('LeftFoot', 0, duration, [.1, 0, z]),
            make_contact('RightFoot', 0, duration, [-.1, 0, -z])]


def recovery():
    """Roll off the side, support on open palms, unfold knees, then stand."""
    duration = 1.6
    support_hand_q = qeuler(-100)
    support_hand_offset = qrot(qinv(support_hand_q),[0,-.03,0])
    entry = copy.deepcopy(next(c for c in CLIPS if c['id'] == 'fall')['frames'][-1])
    contacts = [make_contact('RightFoot',15/30,duration,[-.1,0,0]),
                make_contact('LeftFoot',17/30,duration,[.1,0,0])]
    contacts += [dict(bone=leg+'Hand',start=15/30,end=20/30,
                     anchor=[sign*.24,0,.45],mode='hand-support',
                     contactPointOffsetMeters=support_hand_offset[:],solve='authored-world-hand-target')
                 for leg,sign in [('Left',1),('Right',-1)]]

    def build(u,t,d):
        f = relaxed_idle(neutral(),u)
        rise = smooth((u-.4)/.55)
        hip_y = blend_knots([(0,[.34]),(.42,[.34]),(.65,[.57]),(.85,[.76]),(1,[.845])],u)[0]
        f['hipsOffsetMeters'] = [0,hip_y-.86,-.05*(1-rise)]
        f['rotations']['Hips'] = qeuler(40*(1-rise))
        f['rotations']['Spine'] = qeuler(40*(1-rise))
        f['rotations']['Chest'] = qeuler(20*(1-rise))
        f['rotations']['Head'] = qeuler(-20*(1-rise))
        release = smooth((u-.42)/.28)
        for leg,sign in [('Left',1),('Right',-1)]:
            solve_foot(f,leg,[sign*.1,.08,0])
            natural_hand = fk(f)[leg+'Hand'][0]
            target = lerp([sign*.24,.03,.45],natural_hand,release)
            solve_hand(f,leg,target,slerp(support_hand_q,fk(f)[leg+'Hand'][1],release))
        # Exact entry matches the fall's authored final pose. The first roll
        # tucks the feet and brings the palms down before the supported rise.
        roll = smooth(u/.30)
        if roll < 1:
            f['hipsOffsetMeters'] = lerp(entry['hipsOffsetMeters'],f['hipsOffsetMeters'],roll)
            for name in NAMES:
                f['rotations'][name] = slerp(entry['rotations'][name],f['rotations'][name],roll)
        return f

    record('get_up','קימה בתמיכת יד וברכיים',duration,False,build,contacts,
        [dict(timeSeconds=15/30,name='palms_support_ground',domain='presentation'),
         dict(timeSeconds=20/30,name='palms_release_ground',domain='presentation'),
         dict(timeSeconds=duration,name='recovered_standing',domain='presentation')],
        floorPolicy='body-slide',notes='Original recovery from the exact fall final pose: side roll into a deeply flexed crouch, two open palms support on the ground, feet settle and knees unfold before standing. Hand-support contacts are authored metadata, not foot IK targets; complete skinned-mesh floor correction remains required.')


recovery()


def celebrate(kind, label, duration):
    duration = round(duration*FPS)/FPS
    contact = two_plants(duration)
    if kind == 'victory_leap':
        contact = [make_contact(side+'Foot', a*duration, b*duration, [s*.1, 0, 0])
                   for side,s in [('Left',1),('Right',-1)] for a,b in [(0,.27),(.72,1)]]

    def build(u,t,d):
        frame = neutral()
        a = smooth(u/.25)*(1-smooth((u-.80)/.20))
        small = math.sin(TAU*u)
        frame['rotations']['Spine'] = qeuler(-4*a, 3*small*a, 0)
        if kind == 'arms_up':
            for side,s in [('Left',1),('Right',-1)]:
                frame['rotations'][side+'Arm'] = qeuler(-12*a, 0, s*158*a)
                frame['rotations'][side+'ForeArm'] = qeuler(-30*a)
            frame['rotations']['Head'] = qeuler(-8*a)
        elif kind == 'fist_pump':
            pump = math.sin(3*math.pi*clamp((u-.16)/.66))**2
            frame['rotations']['RightArm'] = qeuler(-8*a, 0, -145*a+25*pump*a)
            frame['rotations']['RightForeArm'] = qeuler((-88+52*pump)*a)
            frame['rotations']['LeftArm'] = qeuler(-10*a, 0, 24*a)
            frame['rotations']['LeftForeArm'] = qeuler(-60*a)
            frame['rotations']['Chest'] = qeuler(0, -8*pump*a, 0)
        elif kind == 'victory_leap':
            h = .35*math.sin(math.pi*clamp((u-.27)/.45))
            load = -.065*math.sin(math.pi*clamp(u/.27)) if u < .27 else 0
            land = -.06*math.sin(math.pi*clamp((u-.72)/.28)) if u > .72 else 0
            frame['hipsOffsetMeters'][1] += h+load+land
            for side,s in [('Left',1),('Right',-1)]:
                frame['rotations'][side+'Arm'] = qeuler(-10*a, 0, s*150*a)
                frame['rotations'][side+'ForeArm'] = qeuler(-40*a)
                frame['rotations'][side+'UpLeg'] = qeuler(-12*a)
                frame['rotations'][side+'Leg'] = qeuler(28*a)
                frame['rotations'][side+'Foot'] = qeuler(-16*a)
        elif kind == 'aeroplane':
            frame['rotations']['Hips'] = qeuler(0, 0, 8*small*a)
            for side,s in [('Left',1),('Right',-1)]:
                frame['rotations'][side+'Arm'] = qeuler(0, 0, s*92*a)
                frame['rotations'][side+'ForeArm'] = qeuler(-6*a)
            frame['rotations']['Head'] = qeuler(0, -10*small*a, 0)
        elif kind == 'applause':
            clap = .5-.5*math.cos(8*math.pi*clamp((u-.2)/.6))
            for side,s in [('Left',1),('Right',-1)]:
                target = [s*(.015+.115*clap), 1.25, .34]
                base = fk(frame)[side+'Hand'][0]
                solve_hand(frame, side, lerp(base, target, a), slerp(IDENTITY,qeuler(180,-s*90,0),a))
            frame['rotations']['Head'] = qeuler(4*small*a)
        return frame

    record('celebrate_'+kind, label, duration, False, build, contact,
           [dict(timeSeconds=duration*.48, name='celebration_peak', domain='presentation')],
           floorPolicy='boot-clearance', notes='Original generic celebration; no named athlete or signature copied.')


for kind,label,duration in [('arms_up','חגיגה · ידיים למעלה',2.0),('fist_pump','חגיגה · יד באוויר',1.8),
                            ('victory_leap','חגיגה · ניתור',1.8),('aeroplane','חגיגה · כנפיים',2.2),
                            ('applause','חגיגה · מחיאות כפיים',2.2)]:
    celebrate(kind,label,duration)

dive_reach = []


def protected_dive_settle(frame,u):
    """Let the pelvis settle while boots/hands retain their parry trajectories."""
    amount = smooth((u-.62)/.32)
    if amount <= 0: return frame
    fix_swing_floor(frame,[],u)
    before = fk(frame)
    result = copy.deepcopy(frame)
    result['hipsOffsetMeters'][1] -= .044245*amount
    low_side = 'Left' if before['LeftArm'][0][1] < before['RightArm'][0][1] else 'Right'
    residual = 0
    for side in ['Left','Right']:
        upper,middle,end = side+'UpLeg',side+'Leg',side+'Foot'
        residual = max(residual,solve_limb(result,upper,middle,end,before[end][0],
            limb_pole(before,upper,middle,end),before[end][1]))
        upper,middle,end = side+'Arm',side+'ForeArm',side+'Hand'
        pole = limb_pole(before,upper,middle,end)
        if side == low_side:
            pole = blend_pole(pole,unit([.6 if side=='Left' else -.6,1,.1]),amount)
        target = add(before[end][0],[0,.003*amount,0])
        residual = max(residual,solve_limb(result,upper,middle,end,target,pole,before[end][1]))
    dive_reach.append(residual)
    return result


for source_id,id,label in [
    ('keeper_dive_side_left','keeper_dive_left','שוער · זינוק שמאלה'),
    ('keeper_dive_side_right','keeper_dive_right','שוער · זינוק ימינה'),
    ('keeper_dive_corner_left','keeper_dive_high','שוער · זינוק לפינה')]:
    start = len(dive_reach)
    clip = adapt(EXTRA,source_id,label,new_id=id,role='keeper',pose_transform=protected_dive_settle)
    clip['authoredLimbReachResidualMeters'] = max(dive_reach[start:],default=0)
    clip['endpointPelvisDropMeters'] = .044245
    clip['notes'] += ' Post-parry settle reauthored against the goalkeeper skin: pelvis descends44.245mm, boots retain world paths, hands rise3mm, low elbow bends upward/outward. The pelvis supports the settled body instead of a low finger propping it above the ground.'


def catch_build(u,t,d):
    f = neutral()
    absorb = math.sin(math.pi*clamp((u-.28)/.65))
    f['hipsOffsetMeters'][1] -= .055*absorb
    f['rotations']['Spine'] = qeuler(6*absorb)
    for side,s in [('Left',1),('Right',-1)]:
        reach = blend_knots([(0,[s*.15,1.07,.20]),(.32,[s*.11,1.24,.40]),(.58,[s*.09,1.08,.27]),(1,[s*.11,1.10,.25])], u)
        solve_hand(f, side, reach, qeuler(-155,s*20,0))
    return f


record('keeper_catch','שוער · תפיסה וריכוך',1.2,False,catch_build,two_plants(1.2),
       [dict(timeSeconds=.4,name='glove_ball_catch',domain='presentation')],role='keeper',floorPolicy='boot-clearance')
def natural_throw_wrists(frame,u):
    # The adapted source fixed both hands in world-down orientation while
    # elbows were raised. Neutral local wrists follow the forearm naturally.
    frame['rotations']['LeftHand'] = IDENTITY[:]
    frame['rotations']['RightHand'] = IDENTITY[:]
    return frame


adapt(THROWS,'goalkeeper_throw','שוער · הוצאה ביד',new_id='keeper_throw',role='keeper',
      pose_transform=natural_throw_wrists)
adapt(EXTRA,'keeper_punt','שוער · הוצאה ברגל',role='keeper')


def referee(kind,label,duration):
    duration=round(duration*FPS)/FPS
    def build(u,t,d):
        f=neutral()
        a=smooth(u/.28)*(1-smooth((u-.75)/.25))
        if kind=='whistle':
            poses=fk(f)
            wrist = [-.035,1.435,.24]
            fingertip_direction = sub([0,1.50,.08],wrist)
            hand_q = qbetween([0,-1,0],fingertip_direction)
            solve_hand(f,'Right',lerp(poses['RightHand'][0],wrist,a),slerp(IDENTITY,hand_q,a))
            f['rotations']['Head']=qeuler(3*a,0,0)
            f['rotations']['LeftForeArm']=qeuler(-12*a)
        else:
            f['rotations']['RightArm']=qeuler(-10*a,0,-96*a)
            f['rotations']['RightForeArm']=qeuler(-4*a)
            f['rotations']['RightHand']=qeuler(0,0,8*a)
            f['rotations']['Head']=qeuler(0,-26*a,0)
            f['rotations']['Chest']=qeuler(0,-8*a,0)
        return f
    record('referee_'+kind,label,duration,False,build,two_plants(duration),
           [dict(timeSeconds=duration*.4,name='referee_'+kind,domain='presentation')],role='referee',floorPolicy='boot-clearance')


referee('whistle','שופט · שריקה',1.6)
referee('signal','שופט · הושטת יד',1.8)


def metrics():
    reports=[]
    for clip in CLIPS:
        minimum=1e9; max_slip=0; max_ground_error=0; previous={}
        support_samples=0; min_unsupported=1e9
        for frame in clip['frames']:
            poses=fk(frame); t=frame['timeSeconds']
            for side in ['Left','Right']:
                y=sole_min(poses,side); minimum=min(minimum,y)
                if not any(c['bone']==side+'Foot' and c['start']-1e-8<=t<=c['end']+1e-8 for c in clip['contacts']):
                    min_unsupported=min(min_unsupported,y)
            for i,c in enumerate(clip['contacts']):
                if c['mode']!='plant' or not c['start']-1e-8<=t<=c['end']+1e-8: continue
                p,q=poses[c['bone']]; sole=add(p,qrot(q,[0,-.08,0])); support_samples+=1
                max_ground_error=max(max_ground_error,abs(sole[1]))
                if i in previous: max_slip=max(max_slip,length(sub(sole,previous[i])))
                previous[i]=sole
        first,last=clip['frames'][0],clip['frames'][-1]
        seam=max(2*math.acos(clamp(abs(dot(first['rotations'][n],last['rotations'][n])),-1,1)) for n in NAMES) if clip['loop'] else None
        reports.append(dict(id=clip['id'],frames=len(clip['frames']),duration=clip['duration'],
            maxSupportFrameSlipMeters=max_slip,maxSupportHeightErrorMeters=max_ground_error,
            supportedFootSamples=support_samples,minApproximateBootCornerMeters=minimum,
            minUnsupportedBootCornerMeters=None if min_unsupported==1e9 else min_unsupported,
            maxReachResidualMeters=clip['reachResidualMeters'],loopSeamRadians=seam,
            wholeSkinnedMeshFloorCheck='required-in-viewer',
            passCanonicalContacts=max_slip<.003 and max_ground_error<.003))
    return reports


for clip in CLIPS:
    if clip['id'].startswith('keeper_dive_'):
        for event in clip['events']:
            if event['name'] == 'visual_side_land':
                # The adapted 82%-phase marker fired while the v7 skin was
                # still ~9.5cm airborne. Contact occurs at the final descent;
                # a half-frame lead is within the 30Hz event timing interval.
                event['timeSeconds'] = clip['duration']-1/(2*FPS)
    # Eliminate quaternion-sign seam ambiguities without changing orientation.
    if clip['loop']:
        for n in NAMES:
            if dot(clip['frames'][0]['rotations'][n],clip['frames'][-1]['rotations'][n]) < 0:
                clip['frames'][-1]['rotations'][n]=[-v for v in clip['frames'][-1]['rotations'][n]]
    # Adaptation, contact IK and wrist refinements change the actual contact
    # geometry. Portable event metadata must follow the final sampled pose.
    keys = [dict(**frame,time=frame['timeSeconds']/clip['duration']) for frame in clip['frames']]
    groups = {}
    for contact in clip.get('ballContacts', []):
        if not contact.get('localPointMeters') or contact['bone'] not in NAMES:
            continue
        time = contact['timeSeconds']
        pose = sample_frame(keys,time/clip['duration'])
        position,orientation = fk(pose)[contact['bone']]
        point = add(position,qrot(orientation,contact['localPointMeters']))
        normal = unit(sub(contact['ballCenterMeters'],contact['pointMeters']))
        contact['pointMeters'] = point
        contact['ballCenterMeters'] = add(point,mul(normal,contact.get('ballRadiusMeters',.11)))
        groups.setdefault(round(time,6),[]).append(contact)
    for group in groups.values():
        hands = [contact for contact in group if contact['bone'].endswith('Hand')]
        if len(hands) == 2 and hands[0]['bone'] != hands[1]['bone']:
            a,b = [contact['pointMeters'] for contact in hands]
            chord = sub(b,a)
            axis = unit(chord)
            forward = unit(sub([0,0,1],mul(axis,dot([0,0,1],axis))))
            radius = hands[0].get('ballRadiusMeters',.11)
            center = add(mul(add(a,b),.5),mul(forward,math.sqrt(max(0,radius*radius-length(chord)**2/4))))
            for contact in hands:
                contact['ballCenterMeters'] = center[:]
    if clip.get('ballContacts'):
        clip['contactGeometryRecomputedFromBakedPose'] = True

library=dict(schemaVersion=1,name='Soccer v7 · canonical authored motion',fps=FPS,
    authorship=dict(kind='original-and-adapted-authored',motionCapture=False,license='CC0-1.0',
        description='Mocap-style design goal. No recordings, performer data, or claim of captured motion.'),
    skeleton=SKELETON,clips=CLIPS,
    playback=dict(rotation='shortest-arc-slerp',translation='linear',
        rootMotion=False,referencePath='validation and preview camera tracking only; simulation owns position',
        contactSpace='reference root world; anchor + actor-cycle offset',
        transition='continue current displayed source, smoothstep blend for .20s, phase-sync locomotion, carry anchors until earliest source/target toe-off, IK after blend',
        floor='require complete skinned mesh bounds/collision; canonical foot checks are insufficient for falls and dives'))

rig=dict(schemaVersion=1,name='Motion2Canonical18',boneCount=18,units='meters',up='+Y',forward='+Z',
    rotations='absolute-parent-local-xyzw',bindPose='arms down; all canonical rest rotations identity',
    bones=BONES,soleOffsetMeters=[0,-.08,0],
    retargetNote='If a skin uses a different bind pose, apply target bind and canonical inverse-bind conversion. Do not apply these absolute quaternions as arbitrary additive deltas.')

OUT.mkdir(parents=True,exist_ok=True)
(OUT/'animations.json').write_text(json.dumps(quantize(library),ensure_ascii=False,separators=(',',':'))+'\n')
(OUT/'rig.json').write_text(json.dumps(rig,ensure_ascii=False,indent=2)+'\n')
report=dict(schemaVersion=1,fps=FPS,clipCount=len(CLIPS),reports=metrics(),
    limits=['Metrics operate on canonical FK and approximate boot corners, not skinned character geometry.',
            'Frame-slip is measured in the reference locomotion world, never on a stationary treadmill floor.',
            'Transition contact preservation requires post-mix runtime IK. A generic AnimationMixer crossfade alone does not provide foot locking.'])
(HERE/'motion-metrics.json').write_text(json.dumps(quantize(report),ensure_ascii=False,indent=2)+'\n')
manifest=dict(schemaVersion=1,fps=FPS,clipCount=len(CLIPS),file='animations.json',rig='rig.json',
    animationBytes=(OUT/'animations.json').stat().st_size,
    animationSha256=hashlib.sha256((OUT/'animations.json').read_bytes()).hexdigest(),
    authored=True,motionCapture=False,
    sources=[dict(path=str(p.relative_to(DESIGN)),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in SOURCES],
    clips=[{k:c[k] for k in ['id','label','duration','fps','frameCount','loop','rootMotion']} for c in CLIPS],
    canonicalContactMetrics='source/motion-metrics.json')
(OUT/'motion-manifest.json').write_text(json.dumps(quantize(manifest),ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(clips=len(CLIPS),bytes=manifest['animationBytes'],samples=sum(len(c['frames']) for c in CLIPS),
    maxSlip=max(r['maxSupportFrameSlipMeters'] for r in report['reports']),
    contactFailures=[r['id'] for r in report['reports'] if not r['passCanonicalContacts']]),indent=2))
