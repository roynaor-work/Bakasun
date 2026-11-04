#!/usr/bin/env python3
"""Build deterministic, original authored soccer motion; no captured mocap.

Only writes soccer-v6/characters/motion/ outputs. Uses Python standard library.
The 18-joint skeleton and selected CC0 authored actions come from this repo.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve()
CHARACTERS = HERE.parents[1]
DESIGN = CHARACTERS.parents[1]
OUT = CHARACTERS / "motion"
FPS = 30
IDENTITY = [0.0, 0.0, 0.0, 1.0]
SOURCE_FILES = [
    "motion/soccer.json",
    "motion2/soccer.json",
    "motion2/soccer/kicks-locomotion.json",
    "motion2/soccer/tackles-reactions.json",
]
SOURCES = {p: json.loads((DESIGN / p).read_text()) for p in SOURCE_FILES}
SKELETON = copy.deepcopy(SOURCES[SOURCE_FILES[0]]["skeleton"])
SKELETON["bindRotationMeaning"] = "identity parent-local rotations, arms hanging down"
NAMES = [b["name"] for b in SKELETON["bones"]]


def add(a, b): return [x+y for x, y in zip(a, b)]
def sub(a, b): return [x-y for x, y in zip(a, b)]
def scale(a, k): return [x*k for x in a]
def dot(a, b): return sum(x*y for x, y in zip(a, b))
def length(a): return math.sqrt(dot(a, a))
def unit(a): return scale(a, 1/max(length(a), 1e-14))
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def mix(a, b, t): return add(scale(a, 1-t), scale(b, t))
def smooth(t): return max(0, min(1, t))**2*(3-2*max(0, min(1, t)))
def conjugate(q): return [-q[0], -q[1], -q[2], q[3]]


def multiply(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [aw*bx+ax*bw+ay*bz-az*by,
            aw*by-ax*bz+ay*bw+az*bx,
            aw*bz+ax*by-ay*bx+az*bw,
            aw*bw-ax*bx-ay*by-az*bz]


def rotate(q, v):
    return multiply(multiply(q, [*v, 0]), conjugate(q))[:3]


def euler(x=0, y=0, z=0):
    """Degrees, XYZ composition, matching Three.Euler(..., 'XYZ')."""
    x, y, z = (math.radians(a)/2 for a in (x, y, z))
    return unit(multiply(multiply([math.sin(x), 0, 0, math.cos(x)],
                                  [0, math.sin(y), 0, math.cos(y)]),
                         [0, 0, math.sin(z), math.cos(z)]))


def between(a, b):
    a, b = unit(a), unit(b)
    d = dot(a, b)
    if d < -.999999:
        axis = unit(cross(a, [1, 0, 0] if abs(a[0]) < .9 else [0, 1, 0]))
        return [*axis, 0]
    return unit([*cross(a, b), 1+d])


def basis_quaternion(x, y, z):
    """Quaternion for an orthonormal matrix whose columns are x, y, z."""
    m00, m01, m02 = x[0], y[0], z[0]
    m10, m11, m12 = x[1], y[1], z[1]
    m20, m21, m22 = x[2], y[2], z[2]
    trace = m00+m11+m22
    if trace > 0:
        s = math.sqrt(trace+1)*2
        q = [(m21-m12)/s, (m02-m20)/s, (m10-m01)/s, .25*s]
    elif m00 > m11 and m00 > m22:
        s = math.sqrt(1+m00-m11-m22)*2
        q = [.25*s, (m01+m10)/s, (m02+m20)/s, (m21-m12)/s]
    elif m11 > m22:
        s = math.sqrt(1+m11-m00-m22)*2
        q = [(m01+m10)/s, .25*s, (m12+m21)/s, (m02-m20)/s]
    else:
        s = math.sqrt(1+m22-m00-m11)*2
        q = [(m02+m20)/s, (m12+m21)/s, .25*s, (m10-m01)/s]
    return unit(q)


def slerp(a, b, t):
    a, b = unit(a), unit(b)
    d = dot(a, b)
    if d < 0:
        b, d = scale(b, -1), -d
    if d > .9995:
        return unit(mix(a, b, t))
    th = math.acos(max(-1, min(1, d)))
    return add(scale(a, math.sin((1-t)*th)/math.sin(th)),
               scale(b, math.sin(t*th)/math.sin(th)))


def pose():
    return {"rotations": {n: IDENTITY[:] for n in NAMES},
            "hipsOffsetMeters": [0, 0, 0],
            "referenceRootTranslationMeters": [0, 0, 0]}


def sample(clip, t):
    ks = clip["keyframes"]
    t = max(0, min(1, t))
    if t <= ks[0]["time"]:
        return copy.deepcopy(ks[0])
    if t >= ks[-1]["time"]:
        return copy.deepcopy(ks[-1])
    i = next(i for i, k in enumerate(ks) if k["time"] >= t)
    a, b = ks[i-1], ks[i]
    u = (t-a["time"])/(b["time"]-a["time"])
    # Dense authored source samples already bake their smooth phase curves.
    # Linear temporal interpolation avoids stopping at every baked sample.
    return {"rotations": {n: slerp(a["rotations"][n], b["rotations"][n], u) for n in NAMES},
            "hipsOffsetMeters": mix(a["hipsOffsetMeters"], b["hipsOffsetMeters"], u),
            "referenceRootTranslationMeters": mix(a["referenceRootTranslationMeters"], b["referenceRootTranslationMeters"], u)}


def forward(p):
    world = {}
    for b in SKELETON["bones"]:
        par = world.get(b["parent"], {"position": [0, 0, 0], "rotation": IDENTITY})
        off = b["restTranslationMeters"]
        if b["name"] == "Hips":
            off = add(off, p["hipsOffsetMeters"])
        world[b["name"]] = {
            "position": add(par["position"], rotate(par["rotation"], off)),
            "rotation": unit(multiply(par["rotation"], p["rotations"][b["name"]]))}
    return world


def point(p, bone, local):
    b = forward(p)[bone]
    return add(b["position"], rotate(b["rotation"], local))


def solve_chain(start, end, a, b, pole):
    """Two-link analytic IK, with an explicit anatomical pole vector."""
    d = sub(end, start)
    raw = length(d)
    dist = min(a+b-.0001, max(abs(a-b)+.0001, raw))
    direction = unit(d)
    side = sub(pole, scale(direction, dot(pole, direction)))
    side = unit(side)
    along = (a*a-b*b+dist*dist)/(2*dist)
    height = math.sqrt(max(0, a*a-along*along))
    middle = add(start, add(scale(direction, along), scale(side, height)))
    # Keep exact reach for numerical safety if a target is unreachable.
    reachable_end = add(start, scale(direction, dist))
    return between([0, -1, 0], sub(middle, start)), between([0, -1, 0], sub(reachable_end, middle))


def leg(p, side, ankle, foot_rotation=None):
    world = forward(p)
    hip = world[side+"UpLeg"]["position"]
    q1, q2 = solve_chain(hip, ankle, .41, .37, [0, 0, 1])
    parent = world["Hips"]["rotation"]
    p["rotations"][side+"UpLeg"] = unit(multiply(conjugate(parent), q1))
    p["rotations"][side+"Leg"] = unit(multiply(conjugate(q1), q2))
    p["rotations"][side+"Foot"] = unit(multiply(conjugate(q2), foot_rotation or IDENTITY))


def arm(p, side, wrist, hand_rotation=None):
    world = forward(p)
    sign = 1 if side == "Left" else -1
    shoulder = world[side+"Arm"]["position"]
    q1, q2 = solve_chain(shoulder, wrist, .27, .24, [sign*.8, -.35, .15])
    parent = world["Chest"]["rotation"]
    p["rotations"][side+"Arm"] = unit(multiply(conjugate(parent), q1))
    p["rotations"][side+"ForeArm"] = unit(multiply(conjugate(q1), q2))
    p["rotations"][side+"Hand"] = unit(multiply(conjugate(q2), hand_rotation or euler(-80, sign*-20, 0)))


def neutral(t, keeper=False):
    p = pose()
    wave = math.sin(t*2*math.pi)
    breathe = (1-math.cos(t*2*math.pi))/2
    p["hipsOffsetMeters"] = [wave*.003, -.105 if keeper else -.025+breathe*.0025, 0]
    p["rotations"]["Hips"] = euler(4 if keeper else 1, wave*1.0, wave*.5)
    p["rotations"]["Spine"] = euler(4 if keeper else 1+breathe*.6, -wave*.6, 0)
    p["rotations"]["Chest"] = euler(-2, 0, 0)
    p["rotations"]["Head"] = euler(-3 if keeper else -1, wave*.6, 0)
    for side, sign in [("Left", 1), ("Right", -1)]:
        x = sign*(.175 if keeper else .11)
        leg(p, side, [x, .08, .035 if side == "Left" else -.025])
        if keeper:
            arm(p, side, [sign*.255, .97+breathe*.004, .275])
        else:
            p["rotations"][side+"Arm"] = euler(-2+wave*.7, sign*2, sign*(7+breathe*.8))
            p["rotations"][side+"ForeArm"] = euler(-11-breathe*1.5, 0, 0)
            p["rotations"][side+"Hand"] = euler(3, sign*3, sign*-2)
    return p


def locomotion_arms(p, t, sprint=False, dribble=False):
    phase = t*2*math.pi
    swing = math.cos(phase)
    for side, sign in [("Left", 1), ("Right", -1)]:
        opposing = swing*sign
        amp = 46 if sprint else 26 if dribble else 33
        p["rotations"][side+"Arm"] = euler(amp*opposing-4, -sign*3, sign*(8 if sprint else 7))
        p["rotations"][side+"ForeArm"] = euler(-(77+13*opposing) if sprint else -(66+11*opposing), 0, 0)
        p["rotations"][side+"Hand"] = euler(3, sign*2, sign*-3)


def running(t, sprint=False):
    base = SOURCES["motion/soccer.json"]["states"]["run"]
    p = sample(base, t)
    if sprint:
        old_world = forward(p)
        p["hipsOffsetMeters"] = [math.sin(2*math.pi*t)*.008,
                                  -.10+.036*math.sin(2*math.pi*t)**2, .012]
        p["rotations"]["Hips"] = euler(10, 5*math.sin(2*math.pi*t), -2*math.sin(2*math.pi*t))
        p["rotations"]["Spine"] = euler(5, -3*math.sin(2*math.pi*t), 0)
        p["rotations"]["Chest"] = euler(-3, -3*math.sin(2*math.pi*t), 0)
        p["rotations"]["Head"] = euler(-11, 0, 0)
        for side, sign in [("Left", 1), ("Right", -1)]:
            foot = old_world[side+"Foot"]
            ankle = [sign*.105, .08+max(0, foot["position"][1]-.08)*1.65, foot["position"][2]*1.28]
            leg(p, side, ankle, foot["rotation"])
        p["referenceRootTranslationMeters"] = [0, 0, 2.02752*t]
    locomotion_arms(p, t, sprint=sprint)
    return p


def keeper_catching(t):
    # Reach to a central chest-height ball; absorb into chest, retain hold.
    p = neutral(0, keeper=True)
    if t < .32:
        a = smooth(t/.32)
        wrist_y, wrist_z = 1.005+.12*a, .275+.12*a
        crouch = .105+.018*a
    elif t < .68:
        a = smooth((t-.32)/.36)
        wrist_y, wrist_z = 1.125-.10*a, .395-.155*a
        crouch = .123+.035*a
    else:
        a = smooth((t-.68)/.32)
        wrist_y, wrist_z = 1.025+.035*a, .24-.015*a
        crouch = .158-.055*a
    p["hipsOffsetMeters"] = [0, -crouch, 0]
    p["rotations"]["Spine"] = euler(3+6*math.sin(t*math.pi)**2, 0, 0)
    p["rotations"]["Head"] = euler(-4, 0, 0)
    for side, sign in [("Left", 1), ("Right", -1)]:
        leg(p, side, [sign*.175, .08, .035 if side == "Left" else -.025])
        arm(p, side, [sign*.106, wrist_y, wrist_z])
    return p


def sharp_turn(t, direction):
    """Outside-foot cut with a visibly banked torso and a free inside step."""
    p = pose()
    pulse = math.sin(math.pi*t)**2
    advance = smooth(t)
    p["hipsOffsetMeters"] = [direction*.065*pulse, -.04-.065*pulse, .015*pulse]
    p["rotations"]["Hips"] = euler(6+4*pulse, direction*(12*advance+22*pulse), -direction*15*pulse)
    p["rotations"]["Spine"] = euler(2, -direction*8*pulse, -direction*5*pulse)
    p["rotations"]["Chest"] = euler(-2, -direction*11*pulse, direction*3*pulse)
    p["rotations"]["Head"] = euler(-4, direction*15*pulse, direction*5*pulse)
    for side, sign in [("Left", 1), ("Right", -1)]:
        inside = sign == direction
        if inside:
            # Lift the cutting foot; the outer foot carries the body weight.
            ankle = [sign*.17, .08+.13*pulse, -.08+.20*advance]
        else:
            ankle = [sign*.15, .08, .06]
        leg(p, side, ankle, euler(0, direction*15*advance, 0))
        p["rotations"][side+"Arm"] = euler(-10-sign*direction*23*pulse, -sign*4, sign*(10+13*pulse))
        p["rotations"][side+"ForeArm"] = euler(-(55+23*pulse), 0, 0)
        p["rotations"][side+"Hand"] = euler(3, sign*3, 0)
    return p


def timing(records, duration):
    records = copy.deepcopy(records)
    for r in records:
        for normalized, seconds in [("time", "atSeconds"), ("startTime", "startSeconds"), ("endTime", "endSeconds")]:
            if normalized in r:
                r[seconds] = r[normalized]*duration
    return records


def planted(side, x, z, start=0, end=1):
    return {"bone": side+"Foot", "startTime": start, "endTime": end,
            "anchorMeters": [x, 0, z], "effectorOffsetMeters": [0, -.08, 0], "mode": "plant"}


def custom(name, duration, loop, fn, notes, support=None, events=None):
    frames = round(duration*FPS)
    duration = frames/FPS
    ks = []
    for i in range(frames+1):
        p = fn(i/frames)
        p.pop("time", None)
        p.pop("atSeconds", None)
        ks.append({"time": i/frames, "atSeconds": i/FPS, **p})
    if loop:
        # Explicit closing pose. Translation of the reference root is retained.
        ks[-1]["rotations"] = copy.deepcopy(ks[0]["rotations"])
        ks[-1]["hipsOffsetMeters"] = ks[0]["hipsOffsetMeters"][:]
    return {"clip": name, "durationSeconds": duration, "loop": loop,
            "rootMotion": False, "sampleRateHz": FPS,
            "notes": notes, "interpolation": {"rotation": "shortest-arc-slerp", "translation": "linear", "easing": "linear"},
            "authorship": {"method": "Original authored analytic phase curves and two-link IK, sampled at exactly 30 Hz", "license": "CC0-1.0", "capturedMocap": False},
            "events": timing(events or [], duration),
            "supportContacts": timing(support or [], duration),
            "groundContacts": timing([{"bone": r["bone"], "startTime": r["startTime"], "endTime": r["endTime"], "mode": r["mode"]} for r in support or []], duration),
            "ballContactStatus": "none", "ballContacts": [],
            "ballContactReason": "This clip has no authored ball contact.",
            "keyframes": ks}


def reused(name, path, source_clip, transform=None):
    src = SOURCES[path]["states"][source_clip]
    c = custom(name, src["durationSeconds"], src["loop"],
               lambda t: transform(sample(src, t), t) if transform else sample(src, t),
               src.get("notes", ""))
    c["authorship"] = {"method": "Resampled original CC0 authored repository clip; no captured mocap", "license": "CC0-1.0", "capturedMocap": False,
                       "sourcePath": "workout/island/design/"+path, "sourceClip": source_clip,
                       "sourceSha256": hashlib.sha256((DESIGN/path).read_bytes()).hexdigest(),
                       "sourceDurationSeconds": src["durationSeconds"], "timeScale": c["durationSeconds"]/src["durationSeconds"]}
    if transform:
        c["authorship"]["adaptation"] = (
            "Authored support-palm grounding: smooth arm IK raises the left wrist 3cm and flattens fingers parallel to turf; lower-body source remains canonical."
            if transform.__name__ == "grounded_slide_hand" else
            "Natural, restrained arm swings authored for soccer-v6; lower-body source remains canonical.")
    for field in ["supportContacts", "groundContacts", "events", "ballContacts", "ballContactWindows", "equipmentContacts"]:
        if field in src:
            c[field] = timing(src[field], c["durationSeconds"])
    for field in ["referenceLocomotion", "ballContactStatus", "ballContactReason", "equipmentContactStatus", "equipmentContactReason"]:
        if field in src:
            c[field] = copy.deepcopy(src[field])
    return c


def restrained_dribble(p, t):
    locomotion_arms(p, t, dribble=True)
    return p


def grounded_slide_hand(p, t):
    """Place the supporting palm flat instead of aiming fingers into turf."""
    influence = smooth((t-.25)/.20)
    if influence <= 0:
        return p
    world = forward(p)
    hand = world["LeftHand"]
    fingers = rotate(hand["rotation"], [0, -1, 0])
    flat_fingers = unit([fingers[0], 0, fingers[2]])
    if length(flat_fingers) < .5:
        flat_fingers = [0, 0, 1]
    # Hand local -Y follows fingers; local +Z is the palm normal, facing turf.
    y_axis, z_axis = scale(flat_fingers, -1), [0, -1, 0]
    x_axis = unit(cross(y_axis, z_axis))
    hand_world = basis_quaternion(x_axis, y_axis, z_axis)
    wrist = hand["position"][:]
    wrist[1] = max(.055, wrist[1]+.03)
    target = copy.deepcopy(p)
    arm(target, "Left", wrist, hand_world)
    for name in ["LeftArm", "LeftForeArm", "LeftHand"]:
        p["rotations"][name] = slerp(p["rotations"][name], target["rotations"][name], influence)
    return p


def relax_return(p, t):
    # Preserve the braking legs; blend arms naturally to the new relaxed idle.
    target = neutral(0)
    a = smooth(t)
    for name in ["LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand"]:
        p["rotations"][name] = slerp(p["rotations"][name], target["rotations"][name], a)
    return p


def refresh_ball_contacts(c):
    # Contacts are evaluated from the delivered 30Hz interpolation, so authored
    # marker points remain exact even after the source duration is quantized.
    for b in c["ballContacts"]:
        old_point = b["pointMeters"]
        delta = sub(b["ballCenterMeters"], old_point)
        b["pointMeters"] = point(sample(c, b["time"]), b["bone"], b["localPointMeters"])
        b["ballCenterMeters"] = add(b["pointMeters"], delta)


def tidy(value):
    if isinstance(value, float):
        return 0 if abs(value) < 5e-10 else round(value, 9)
    if isinstance(value, list): return [tidy(v) for v in value]
    if isinstance(value, dict): return {k: tidy(v) for k, v in value.items()}
    return value


def validate(data):
    report = {"schemaVersion": 1, "kind": "authored-motion-validation", "sampleRateHz": FPS,
              "capturedMocap": False, "checks": {"complete18BonePoses": True, "normalizedQuaternions": True,
              "uniform30Hz": True, "identityRoot": True, "closedLoops": True, "exactFallGetupSeam": True}, "clips": {}}
    for name, c in data["states"].items():
        frames = round(c["durationSeconds"]*FPS)
        assert len(c["keyframes"]) == frames+1, name
        angular_max = 0
        support_max = 0
        floor_min = 10
        prev = None
        for i, k in enumerate(c["keyframes"]):
            assert abs(k["atSeconds"]-i/FPS) < 1e-8, (name, i, "30hz")
            assert abs(k["time"]-i/frames) < 1e-8, (name, i, "normalized time")
            assert set(k["rotations"]) == set(NAMES), name
            for bn, q in k["rotations"].items():
                assert all(math.isfinite(v) for v in q) and abs(length(q)-1) < 1e-7, (name, bn)
                if prev:
                    ang = 2*math.acos(min(1, abs(dot(unit(q), unit(prev["rotations"][bn])))))
                    angular_max = max(angular_max, ang*FPS)
            assert k["rotations"]["Root"] == IDENTITY, name
            w = forward(k)
            for side in ["Left", "Right"]:
                sole = point(k, side+"Foot", [0, -.08, 0])
                floor_min = min(floor_min, sole[1])
            for s in c["supportContacts"]:
                if s["startTime"]-1e-7 <= k["time"] <= s["endTime"]+1e-7:
                    sole = add(point(k, s["bone"], s["effectorOffsetMeters"]), k["referenceRootTranslationMeters"])
                    support_max = max(support_max, length(sub(sole, s["anchorMeters"])))
            prev = k
        loop_error = 0
        if c["loop"]:
            a, b = c["keyframes"][0], c["keyframes"][-1]
            loop_error = max(2*math.acos(min(1, abs(dot(unit(a["rotations"][n]), unit(b["rotations"][n]))))) for n in NAMES)
            assert loop_error < 1e-6, name
            assert length(sub(a["hipsOffsetMeters"], b["hipsOffsetMeters"])) < 1e-8, name
        assert angular_max < 40, (name, "implausible angular discontinuity", angular_max)
        assert support_max < .025, (name, "support drift", support_max)
        report["clips"][name] = {"durationSeconds": c["durationSeconds"], "framesIncludingEnd": frames+1,
                                    "loop": c["loop"], "maxAngularSpeedRadiansPerSecond": angular_max,
                                    "maxCanonicalPlantedSoleDriftMeters": support_max,
                                    "minimumCanonicalSoleHeightMeters": floor_min,
                                    "loopAngularErrorRadians": loop_error,
                                    "floorClearanceScope": "Canonical sole point only; whole skinned-mesh audit is separate."}
    fall = data["states"]["fall"]["keyframes"][-1]
    getup = data["states"]["getup"]["keyframes"][0]
    assert fall["rotations"] == getup["rotations"]
    assert fall["hipsOffsetMeters"] == getup["hipsOffsetMeters"]
    report["clipCount"] = len(data["states"])
    report["totalKeyframes"] = sum(len(c["keyframes"]) for c in data["states"].values())
    report["pass"] = True
    return tidy(report)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    support_idle = [planted("Left", .11, .035), planted("Right", -.11, -.025)]
    support_keeper = [planted("Left", .175, .035), planted("Right", -.175, -.025)]
    states = {}
    states["idle"] = custom("idle", 2.4, True, neutral,
        "Relaxed athletic ready stance, arms close to body, mild breathing and weight shift; soles held by analytic IK.", support_idle)
    states["run"] = custom("run", 22/FPS, True, running,
        "Two-step running cycle with restrained opposing arm swing; original CC0 analytic grounded leg motion resampled at 30Hz.",
        SOURCES["motion/soccer.json"]["states"]["run"]["supportContacts"])
    states["run"]["referenceLocomotion"] = {"speedMetersPerSecond": 1.584/(22/FPS), "cycleDistanceMeters": 1.584, "cycleAnchorTranslationMeters": [0, 0, 1.584]}
    states["run"]["authorship"]["sourcePath"] = "workout/island/design/motion/soccer.json"
    states["run"]["authorship"]["sourceClip"] = "run"
    states["run"]["events"] = timing(SOURCES["motion/soccer.json"]["states"]["run"]["events"], 22/FPS)
    sprint_support = [planted("Left", .105, .22*1.28, 0, .24), planted("Right", -.105, 1.012*1.28, .5, .74)]
    states["sprint"] = custom("sprint", 17/FPS, True, lambda t: running(t, sprint=True),
        "Faster two-step cycle: longer reach, high recovery heel, forward torso lean and stronger opposing arms. Based on original authored run phase targets; no captured mocap.", sprint_support)
    states["sprint"]["referenceLocomotion"] = {"speedMetersPerSecond": 2.02752/(17/FPS), "cycleDistanceMeters": 2.02752, "cycleAnchorTranslationMeters": [0, 0, 2.02752]}
    states["sprint"]["events"] = timing([{"name": "presentation_left_plant", "time": 0},
        {"name": "presentation_left_release", "time": .24}, {"name": "presentation_right_plant", "time": .5},
        {"name": "presentation_right_release", "time": .74}], 17/FPS)
    for direction, side_name in [(1, "left"), (-1, "right")]:
        outer = "Right" if direction == 1 else "Left"
        inner = "Left" if direction == 1 else "Right"
        contacts = [planted(outer, -direction*.15, .06),
                    planted(inner, direction*.17, -.08, 0, 0),
                    planted(inner, direction*.17, .12, 1, 1)]
        states["turn_"+side_name] = custom("turn_"+side_name, .5, False,
            lambda t, d=direction: sharp_turn(t, d),
            "Sharp "+side_name+" cut: bank over the outside planted boot, turn hips against counter-rotating shoulders, lift and replace the inside foot. Simulation owns world yaw.",
            contacts, [{"name": "presentation_cut_load", "time": .25}, {"name": "presentation_cut_push", "time": .65}])
    choices = [
        ("decelerate", "motion/soccer.json", "decelerate", relax_return),
        ("kick_straight", "motion2/soccer/kicks-locomotion.json", "kick_power", None),
        ("kick_curve", "motion2/soccer/kicks-locomotion.json", "corner_kick", None),
        ("pass_short", "motion2/soccer/kicks-locomotion.json", "pass_short", None),
        ("pass_long", "motion2/soccer/kicks-locomotion.json", "pass_long", None),
        ("header", "motion2/soccer.json", "header", None),
        ("dribble", "motion2/soccer.json", "dribble", restrained_dribble),
        ("slide", "motion2/soccer.json", "slide_tackle", grounded_slide_hand),
        ("fall", "motion/soccer.json", "fall", None),
        ("getup", "motion/soccer.json", "recover", None),
        ("celebrate", "motion2/soccer/tackles-reactions.json", "goal_celebration", None),
        ("keeper_dive_left", "motion2/soccer.json", "keeper_dive_side_left", None),
        ("keeper_dive_right", "motion2/soccer.json", "keeper_dive_side_right", None),
    ]
    for name, path, src_name, transform in choices:
        states[name] = reused(name, path, src_name, transform)
    states["keeper_ready"] = custom("keeper_ready", 2, True, lambda t: neutral(t, keeper=True),
        "Low goalkeeper ready stance, open elbows, forward palms and quiet breathing; balanced two-foot support.", support_keeper)
    states["keeper_catch"] = custom("keeper_catch", .9, False, keeper_catching,
        "Two-hand chest-height catch: reach, visual glove contact, absorb toward sternum, rise retaining the ball. Holds final pose until simulation releases ball.",
        support_keeper, [{"name": "presentation_glove_contact", "time": .32}, {"name": "presentation_ball_secured", "time": .68}])
    states["keeper_catch"]["ballContacts"] = []
    catch_t = .32
    catch_pose = sample(states["keeper_catch"], catch_t)
    glove_center = [0, 1.125, .395]
    for side in ["Left", "Right"]:
        wrist = forward(catch_pose)[side+"Hand"]
        toward_center = unit(sub(glove_center, wrist["position"]))
        contact = add(glove_center, scale(toward_center, -.11))
        local = rotate(conjugate(wrist["rotation"]), sub(contact, wrist["position"]))
        states["keeper_catch"]["ballContacts"].append({"time": catch_t, "atSeconds": catch_t*.9,
            "event": "presentation_glove_contact", "bone": side+"Hand", "localPointMeters": local,
            "pointMeters": contact, "ballCenterMeters": glove_center, "ballRadiusMeters": .11})
    states["keeper_catch"]["ballContactStatus"] = "authored"
    states["keeper_catch"].pop("ballContactReason", None)
    states["keeper_catch"]["ballContactWindows"] = [{"startTime": .32, "endTime": 1, "startSeconds": .288, "endSeconds": .9,
        "bones": ["LeftHand", "RightHand"], "mode": "two-hand-hold", "note": "Presentation hold follows the midpoint between glove contact points. Simulation owns possession."}]
    for c in states.values():
        refresh_ball_contacts(c)
        c["presentationPolicy"] = "Markers describe visuals only; simulation owns ball physics, possession, action success, scoring, world movement and heading."
    transitions = []
    def transition(src, dst, seconds, reason):
        transitions.append({"from": src, "to": dst, "visualBlendSeconds": seconds,
            "blendCurve": "smoothstep", "sourcePose": "current-displayed", "sourceContinuation": "velocity-extrapolation",
            "targetTime": 0, "footLock": "carry-until-release", "reason": reason})
    for a, b, duration in [("idle", "run", .2), ("run", "idle", .2), ("run", "sprint", .16), ("sprint", "run", .18),
                           ("run", "decelerate", .14), ("sprint", "decelerate", .16), ("decelerate", "idle", .18),
                           ("run", "dribble", .18), ("dribble", "run", .18), ("fall", "getup", .16),
                           ("getup", "idle", .2), ("slide", "fall", .22), ("keeper_ready", "keeper_catch", .14),
                           ("keeper_catch", "keeper_ready", .2), ("keeper_ready", "keeper_dive_left", .14),
                           ("keeper_ready", "keeper_dive_right", .14), ("keeper_dive_left", "fall", .25),
                           ("keeper_dive_right", "fall", .25)]:
        transition(a, b, duration, "Simulation chooses the actual state change; preserve displayed pose and support anchors.")
    for action in ["turn_left", "turn_right", "kick_straight", "kick_curve", "pass_short", "pass_long", "header", "slide", "fall", "celebrate"]:
        transition("*", action, .14 if action.startswith(("kick", "pass", "turn")) else .2, "Interrupt from the currently displayed pose; never snap to the first keyframe.")
        if action not in ["fall", "slide"]:
            transition(action, "idle", .2, "After completion, settle through a visual crossfade.")
    data = {"schemaVersion": 1, "kind": "authored-skeletal-motion", "game": "soccer", "assetVersion": "soccer-v6-characters",
            "sampleRateHz": FPS, "authorship": {"method": "Original authored and repository CC0 authored animation, baked at 30Hz; not actual motion capture", "capturedMocap": False, "license": "CC0-1.0"},
            "skeleton": SKELETON, "initialState": "idle", "states": states, "transitions": transitions,
            "semantics": {"time": "keyframes.time and contact window times are normalized 0..1; atSeconds/startSeconds/endSeconds are seconds",
                "rotation": "All 18 bones have absolute parent-local xyzw unit quaternions. Canonical bind rotations are identity, arms down.",
                "root": "Root local rotation remains identity; rootMotion=false. referenceRootTranslationMeters is a test trajectory and must not be applied to the character in the viewer or game.",
                "sampling": "30 intervals/second, including one end keyframe. Frame interpolation uses shortest-arc slerp and linear translations. Smooth authored phase curves are already baked; do not ease each 1/30-second interval.",
                "presentation": "Contact and event metadata is visual only. No animation event changes gameplay state.",
                "ground": "Apply skinning-aware ground clearance after mixing and skinning. Support contact windows are not a substitute for a whole-mesh floor audit."},
            "blendPolicy": {"minimumSeconds": .12, "defaultSeconds": .18, "curve": "smoothstep", "sourcePose": "current-displayed",
                "sourceContinuation": "velocity-extrapolation", "rotation": "shortest-arc-slerp", "interruption": "Snapshot the currently displayed blended pose, including residual velocities.",
                "locomotionPhase": "Match alternating support phase when changing run/sprint/dribble speed.", "footLock": "Solve support IK after blending; carry outgoing world anchor to release, then smoothly reduce weight."}}
    report = validate(data)
    cleaned = tidy(data)
    output = OUT / "soccer-v6.json"
    output.write_text(json.dumps(cleaned, ensure_ascii=False, separators=(",", ":"))+"\n")
    sources = [{"path": "workout/island/design/"+p, "sha256": hashlib.sha256((DESIGN/p).read_bytes()).hexdigest(),
                "license": "CC0-1.0", "type": "original authored repository motion, not captured mocap"} for p in SOURCE_FILES]
    manifest = {"schemaVersion": 1, "kind": "authored-motion-manifest", "license": "CC0-1.0", "capturedMocap": False,
                "file": "soccer-v6.json", "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "bytes": output.stat().st_size,
                "sampleRateHz": FPS, "skeletonBoneCount": len(NAMES), "clipCount": len(states), "totalKeyframes": report["totalKeyframes"],
                "sources": sources, "clips": [{"id": n, "durationSeconds": c["durationSeconds"], "loop": c["loop"], "keyframeCount": len(c["keyframes"]),
                    "events": c["events"], "ballContactSeconds": [b["atSeconds"] for b in c["ballContacts"]],
                    "source": c["authorship"]} for n, c in cleaned["states"].items()]}
    (OUT/"manifest.json").write_text(json.dumps(tidy(manifest), ensure_ascii=False, indent=2)+"\n")
    (OUT/"validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"pass": True, "file": str(output), "clips": len(states), "frames": report["totalKeyframes"], "bytes": output.stat().st_size}))


if __name__ == "__main__":
    main()
