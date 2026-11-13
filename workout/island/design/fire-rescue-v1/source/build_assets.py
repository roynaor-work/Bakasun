#!/usr/bin/env python3
"""Original CC0 rescue friends. Python 3 standard library; no downloaded geometry.

Run from anywhere: python3 source/build_assets.py
Writes three uncompressed, Y-up, metre-scale glTF 2.0 binaries and manifest.json.
The small mesh parts are authored here and merged into one skinned primitive.
"""

import hashlib
import json
import math
from pathlib import Path
import struct

OUT = Path(__file__).resolve().parents[1]
TAU = math.tau
FPS = 24
CLIPS = {"idle": 2.4, "scared": 1.5, "wave": 2.0,
         "rescued": 2.4, "walk_out": 1.5}


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def mul(v, s):
    return tuple(x * s for x in v)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(v):
    return mul(v, 1 / max(1e-10, math.sqrt(dot(v, v))))


def quat(x=0, y=0, z=0):
    """XYZ Euler -> glTF xyzw quaternion."""
    a, b, c = x/2, y/2, z/2
    return (math.sin(a)*math.cos(b)*math.cos(c)+math.cos(a)*math.sin(b)*math.sin(c),
            math.cos(a)*math.sin(b)*math.cos(c)-math.sin(a)*math.cos(b)*math.sin(c),
            math.cos(a)*math.cos(b)*math.sin(c)+math.sin(a)*math.sin(b)*math.cos(c),
            math.cos(a)*math.cos(b)*math.cos(c)-math.sin(a)*math.sin(b)*math.sin(c))


def rotate(v, q):
    u, w = q[:3], q[3]
    return add(add(mul(v, 2*w*w-1), mul(u, 2*dot(u, v))), mul(cross(u, v), 2*w))


def linear(hex_color):
    channels = [int(hex_color[i:i+2], 16)/255 for i in (1, 3, 5)]
    return tuple(c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4 for c in channels)


def smooth(a, b, t):
    u = max(0, min(1, (t-a)/(b-a)))
    return u*u*(3-2*u)


class Friend:
    def __init__(self, name):
        self.name = name
        self.positions, self.normals, self.colors = [], [], []
        self.joints, self.indices, self.primary, self.secondary = [], [], [], []
        self.joy, self.blink = [], []
        self.bones, self.bone_ids = [], {}

    def bone(self, name, parent, position):
        self.bone_ids[name] = len(self.bones)
        self.bones.append((name, parent, position))

    def vertex(self, position, normal, color, bone, region=None, joy=None, blink=None):
        self.positions.append(position)
        self.normals.append(unit(normal))
        self.colors.append(linear(color))
        self.joints.append((self.bone_ids[bone], 0, 0, 0))
        self.primary.append((1.0 if region == "uniform_primary" else 0.0,))
        self.secondary.append((1.0 if region == "uniform_secondary" else 0.0,))
        self.joy.append(sub(joy, position) if joy is not None else (0., 0., 0.))
        self.blink.append(sub(blink, position) if blink is not None else (0., 0., 0.))

    def ellipsoid(self, center, radii, color, bone, segments=10, rings=6,
                  region=None, tilt=0, eye=False, happy=False):
        base = len(self.positions)
        q = quat(z=tilt)

        def point(theta, phi):
            v = (math.sin(theta)*math.cos(phi), math.cos(theta), math.sin(theta)*math.sin(phi))
            p = add(center, rotate(tuple(v[i]*radii[i] for i in range(3)), q))
            n = rotate(tuple(v[i]/radii[i] for i in range(3)), q)
            joy = (p[0], center[1]+(p[1]-center[1])*(.82 if eye else 1), p[2]) if happy else None
            blink = (p[0], center[1]+(p[1]-center[1])*.055, p[2]) if eye else None
            self.vertex(p, n, color, bone, region, joy, blink)

        point(0, 0)
        for j in range(1, rings):
            for i in range(segments):
                point(math.pi*j/rings, TAU*i/segments)
        point(math.pi, 0)
        bottom = len(self.positions)-1
        for i in range(segments):
            nxt = (i+1) % segments
            self.indices.extend((base, base+1+nxt, base+1+i))
            for j in range(rings-2):
                a, b = base+1+j*segments+i, base+1+j*segments+nxt
                self.indices.extend((a, b, a+segments, b, b+segments, a+segments))
            self.indices.extend((bottom, bottom-segments+i, bottom-segments+nxt))

    def loft(self, levels, color, bone, region=None, segments=12):
        """Rounded taper: levels are (y, x-radius, z-radius, z-center)."""
        base = len(self.positions)
        for y, rx, rz, cz in levels:
            for i in range(segments):
                phi = TAU*i/segments
                self.vertex((rx*math.cos(phi), y, cz+rz*math.sin(phi)),
                            (math.cos(phi)/rx, .10, math.sin(phi)/rz), color, bone, region)
        for j in range(len(levels)-1):
            for i in range(segments):
                a, b = base+j*segments+i, base+j*segments+(i+1) % segments
                self.indices.extend((a, a+segments, b, b, a+segments, b+segments))
        for j, up in [(0, False), (len(levels)-1, True)]:
            start = base+j*segments
            for i in range(1, segments-1):
                self.indices.extend((start, start+i+int(up), start+i+int(not up)))

    def tube(self, points, radius, color, bone, sides=5, joy_points=None):
        base = len(self.positions)
        for j, point in enumerate(points):
            tangent = unit(sub(points[min(j+1, len(points)-1)], points[max(j-1, 0)]))
            reference = (0, 0, 1) if abs(tangent[2]) < .9 else (1, 0, 0)
            u, v = unit(cross(tangent, reference)), unit(cross(tangent, cross(tangent, reference)))
            for i in range(sides):
                normal = add(mul(u, math.cos(TAU*i/sides)), mul(v, math.sin(TAU*i/sides)))
                p = add(point, mul(normal, radius))
                jp = add(joy_points[j], mul(normal, radius)) if joy_points else None
                self.vertex(p, normal, color, bone, joy=jp)
        for j in range(len(points)-1):
            for i in range(sides):
                a, b = base+j*sides+i, base+j*sides+(i+1) % sides
                self.indices.extend((a, b, a+sides, b, b+sides, a+sides))
        # Small caps; all tubes have nonzero length, so no degenerate triangles.
        for start, reverse in [(base, True), (base+(len(points)-1)*sides, False)]:
            for i in range(1, sides-1):
                self.indices.extend((start, start+i+int(reverse), start+i+int(not reverse)))

    def ear(self, side, color, inner):
        """Soft triangular cat ear, with a smaller inset front face."""
        verts = [(side*.11, .88, .18), (side*.285, .87, .14),
                 (side*.235, 1.075, .12), (side*.19, .91, -.025)]
        for ids in [(0, 1, 2), (0, 3, 1), (1, 3, 2), (2, 3, 0)]:
            a, b, c = [verts[i] for i in ids]
            n = cross(sub(b, a), sub(c, a))
            if side < 0:
                b, c, n = c, b, mul(n, -1)
            start = len(self.positions)
            for p in [a, b, c]:
                self.vertex(p, n, color, "Head")
            self.indices.extend((start, start+1, start+2))
        self.ellipsoid((side*.216, .939, .158), (.041, .071, .012),
                       inner, "Head", 7, 4, tilt=side*-.21)


def face(friend, center_y, center_z, eye_x, fur=False, mouth_z=None):
    """Kind eyes, raised inner brows, rosy cheeks; joy/blink are real morph targets."""
    for side in [-1, 1]:
        x = side*eye_x
        friend.ellipsoid((x, center_y, center_z), (.049, .059, .022),
                         "#FFF5DF", "Head", 10, 6, eye=True, happy=True)
        friend.ellipsoid((x-side*.004, center_y-.004, center_z+.020), (.026, .038, .009),
                         "#3B302D", "Head", 10, 5, eye=True, happy=True)
        friend.ellipsoid((x-.008, center_y+.010, center_z+.028), (.008, .010, .004),
                         "#FFFFFF", "Head", 6, 4, eye=True, happy=True)
        brow = [(x+v*.035, center_y+.083-side*v*.012, center_z-.005) for v in [-1, 0, 1]]
        joy = [(x+v*.035, center_y+.076+.005*(1-v*v), center_z-.005) for v in [-1, 0, 1]]
        friend.tube(brow, .006, "#71503B", "Head", 5, joy)
        friend.ellipsoid((side*(eye_x+.056), center_y-.063, center_z-.013),
                         (.032, .014, .008), "#E6A28B" if fur else "#D98976", "Head", 8, 4)
    mouth_y = center_y-.118 if not fur else center_y-.113
    points, joy = [], []
    for i in range(9):
        u = -1+i/4
        points.append((u*.043, mouth_y+.005*(1-u*u), mouth_z or center_z+.005))
        joy.append((u*.043, mouth_y-.020*(1-u*u), mouth_z or center_z+.005))
    friend.tube(points, .005, "#70483C", "Head", 5, joy)


def girl():
    f = Friend("girl")
    f.bone("Root", None, (0, 0, 0))
    f.bone("Hips", "Root", (0, .60, 0))
    f.bone("Spine", "Hips", (0, .76, 0))
    f.bone("Head", "Spine", (0, 1.005, 0))
    for side, s in [("L", 1), ("R", -1)]:
        for name, parent, p in [
            ("Arm", "Spine", (s*.205, .87, 0)),
            ("Forearm", f"Arm_{side}", (s*.235, .695, 0)),
            ("Hand", f"Forearm_{side}", (s*.24, .55, .015)),
            ("Thigh", "Hips", (s*.105, .60, 0)),
            ("Shin", f"Thigh_{side}", (s*.105, .35, 0)),
            ("Foot", f"Shin_{side}", (s*.105, .10, 0)),
        ]:
            f.bone(f"{name}_{side}", parent, p)
    skin, hair = "#E5AA80", "#654231"
    primary, secondary = "#EC805E", "#417E83"
    f.loft([(.59, .14, .105, 0), (.67, .175, .12, 0), (.84, .19, .12, 0),
            (.925, .14, .09, 0)], primary, "Spine", "uniform_primary")
    f.ellipsoid((0, .60, 0), (.158, .11, .11), secondary, "Hips", 12, 5, "uniform_secondary")
    f.ellipsoid((0, .96, 0), (.068, .09, .067), skin, "Head", 8, 4)
    f.ellipsoid((0, 1.105, -.015), (.24, .256, .213), skin, "Head", 14, 8)
    # Rear bob stays behind the face. An asymmetric fringe makes a distinct silhouette.
    f.ellipsoid((0, 1.13, -.094), (.255, .264, .174), hair, "Head", 12, 6)
    f.ellipsoid((-.071, 1.286, .088), (.181, .09, .121), hair, "Head", 12, 5, tilt=.19)
    f.ellipsoid((.07, 1.315, .015), (.11, .075, .10), hair, "Head", 8, 4)
    f.ellipsoid((.153, 1.216, .041), (.077, .144, .132), hair, "Head", 10, 5, tilt=.19)
    for side, s in [("L", 1), ("R", -1)]:
        f.ellipsoid((s*.227, 1.081, .012), (.043, .063, .043), skin, "Head", 8, 4)
        f.ellipsoid((s*.282, 1.12, -.055), (.093, .126, .10), hair, "Head", 10, 5, tilt=s*.35)
        f.ellipsoid((s*.25, 1.145, -.012), (.033, .05, .049), secondary, "Head", 8, 4, "uniform_secondary")
        f.ellipsoid((s*.216, .80, 0), (.066, .111, .067), primary, f"Arm_{side}", 8, 5, "uniform_primary", tilt=s*.13)
        f.ellipsoid((s*.24, .625, .006), (.044, .087, .044), skin, f"Forearm_{side}", 8, 5)
        f.ellipsoid((s*.24, .523, .02), (.051, .057, .034), skin, f"Hand_{side}", 7, 4)
        f.ellipsoid((s*.207, .539, .041), (.023, .030, .021), skin, f"Hand_{side}", 7, 4)
        f.ellipsoid((s*.105, .486, 0), (.083, .15, .082), secondary, f"Thigh_{side}", 8, 5, "uniform_secondary")
        f.ellipsoid((s*.105, .23, 0), (.063, .14, .061), secondary, f"Shin_{side}", 8, 5, "uniform_secondary")
        f.ellipsoid((s*.105, .073, .052), (.09, .073, .13), "#FFF0D7", f"Foot_{side}", 8, 5)
        f.ellipsoid((s*.105, .031, .055), (.091, .027, .133), "#345D62", f"Foot_{side}", 10, 4)
        f.tube([(s*.054, .913, .087), (s*.052, .885, .118), (s*.095, .872, .109)],
               .012, "#FFF0D7", "Spine")
    for y in [.815, .755]:
        f.ellipsoid((0, y, .12), (.011, .011, .005), "#FFE4AE", "Spine", 6, 4)
    face(f, 1.115, .193, .085)
    f.ellipsoid((0, 1.06, .211), (.028, .032, .028), skin, "Head", 8, 5)
    return f


def animal(kind):
    f = Friend(kind)
    dog = kind == "dog"
    f.bone("Root", None, (0, 0, 0))
    f.bone("Hips", "Root", (0, .37, -.17))
    f.bone("Spine", "Hips", (0, .44, .10))
    f.bone("Head", "Spine", (0, .63, .22))
    for side, s in [("L", 1), ("R", -1)]:
        for name, parent, p in [
            ("FrontLeg", "Spine", (s*.15, .46, .15)),
            ("FrontShin", f"FrontLeg_{side}", (s*.15, .27, .15)),
            ("FrontPaw", f"FrontShin_{side}", (s*.15, .08, .15)),
            ("BackLeg", "Hips", (s*.16, .37, -.20)),
            ("BackShin", f"BackLeg_{side}", (s*.16, .215, -.20)),
            ("BackPaw", f"BackShin_{side}", (s*.16, .06, -.20)),
        ]:
            f.bone(f"{name}_{side}", parent, p)
    f.bone("Tail", "Hips", (0, .43, -.36))
    if dog:
        f.bone("Ear_L", "Head", (.20, .85, .15))
        f.bone("Ear_R", "Head", (-.20, .85, .15))
    fur = "#C88A54" if dog else "#DE9A53"
    cream, dark = "#FFF0D2", "#8E583B"
    f.ellipsoid((0, .425, -.045), (.215, .228, .30), fur, "Spine", 14, 7)
    f.ellipsoid((0, .36, -.21), (.218, .19, .17), fur, "Hips", 12, 6)
    f.ellipsoid((0, .47, .244), (.141, .155, .039), cream, "Spine", 12, 5)
    f.ellipsoid((0, .755, .224), (.27 if dog else .264, .24, .22), fur, "Head", 16, 9)
    if dog:
        f.ellipsoid((-.086, .795, .396), (.092, .131, .038), dark, "Head", 10, 5, tilt=-.19)
        for side, s in [("L", 1), ("R", -1)]:
            f.ellipsoid((s*.266, .733, .103), (.095, .192, .09), dark,
                         f"Ear_{side}", 12, 6, tilt=s*-.16)
            f.ellipsoid((s*.271, .718, .174), (.047, .117, .017), "#BD7D62",
                         f"Ear_{side}", 8, 4, tilt=s*-.16)
        muzzle_y, muzzle_z = .669, .425
        f.ellipsoid((0, muzzle_y, muzzle_z), (.145, .091, .088), cream, "Head", 12, 6)
        f.ellipsoid((0, .707, .494), (.056, .039, .034), "#563E34", "Head", 10, 5)
        f.ellipsoid((-.014, .721, .521), (.016, .007, .004), "#A1846D", "Head", 7, 4)
        tail = [(0, .43, -.37), (.01, .49, -.46), (.025, .58, -.51), (.04, .65, -.50)]
        f.tube(tail, .044, fur, "Tail", 8)
        f.ellipsoid(tail[-1], (.044, .046, .044), cream, "Tail", 8, 4)
    else:
        for s in [-1, 1]:
            f.ear(s, fur, "#E8B2A0")
            f.ellipsoid((s*.052, .678, .424), (.068, .047, .035), cream, "Head", 10, 5)
        f.ellipsoid((0, .706, .451), (.028, .019, .017), "#BF7F76", "Head", 8, 4)
        tail = [(0, .43, -.37), (.04, .405, -.49), (.14, .365, -.55),
                (.25, .395, -.54), (.30, .485, -.49), (.29, .565, -.45)]
        f.tube(tail, .038, fur, "Tail", 7)
        f.ellipsoid(tail[-1], (.038, .040, .038), cream, "Tail", 8, 4)
        for s in [-1, 1]:
            for j in range(2):
                f.tube([(s*.105, .681-j*.023, .441), (s*.21, .686-j*.036, .433)],
                       .003, "#9C663E", "Head", 4)
            for j in range(2):
                f.ellipsoid((s*(.199+j*.012), .805-j*.057, .345), (.033, .016, .012),
                             dark, "Head", 7, 4, tilt=s*.35)
        f.ellipsoid((0, .919, .35), (.025, .045, .015), dark, "Head", 7, 4)
    for side, s in [("L", 1), ("R", -1)]:
        for prefix, z, top, mid, bottom in [("Front", .15, .46, .27, .08),
                                          ("Back", -.20, .37, .215, .06)]:
            x = s*(.15 if prefix == "Front" else .16)
            f.ellipsoid((x, (top+mid)/2, z), (.07, (top-mid)*.67, .071),
                         fur, f"{prefix}Leg_{side}", 10, 5)
            f.ellipsoid((x, (mid+bottom)/2, z), (.054, (mid-bottom)*.66, .053),
                         fur, f"{prefix}Shin_{side}", 8, 5)
            f.ellipsoid((x, .052, z+.033), (.081, .052, .098),
                         cream, f"{prefix}Paw_{side}", 10, 5)
    face(f, .787, .410, .093, True, .509 if dog else .460)
    return f


def ik(dy, dz, l1, l2):
    distance = min(l1+l2-.00001, max(abs(l1-l2)+.00001, math.hypot(dy, dz)))
    bend = math.acos(max(-1, min(1, (distance*distance-l1*l1-l2*l2)/(2*l1*l2))))
    aim = math.atan2(-dz, -dy)
    return aim-math.atan2(l2*math.sin(bend), l1+l2*math.cos(bend)), bend


def gait(t, side, stride, cycles=2):
    phase = (t*cycles+(0 if side == "L" else .5)) % 1
    lift = math.sin(math.pi*(phase-.5)*2)*.065 if phase > .5 else 0
    offset = stride*(smooth(.5, 1, phase)-phase+.25)
    return offset, lift


def pose(friend, clip, t):
    """Absolute local joint transforms, including floor-aware two-bone leg IK."""
    girl_model = friend.name == "girl"
    rotations = {name: [0., 0., 0.] for name, _, _ in friend.bones}
    root = [0., 0., 0.]
    sit, joy, hop, walk = 1., 0., 0., 0.
    if clip == "rescued":
        sit = 1-smooth(0, .45, t)
        joy = smooth(.10, .55, t)
        for start, end in [(.58, 1.13), (1.38, 1.93)]:
            if start < t < end:
                hop += .15*math.sin(math.pi*(t-start)/(end-start))
    elif clip == "walk_out":
        sit = 1-smooth(0, .32, t)
        joy = smooth(0, .32, t)*.85
        walk = smooth(.28, .45, t)
        root[2] = (.90 if girl_model else .76)*max(0, (t-.32)/1.18)
    loop_phase = t/CLIPS[clip]
    breath = .0022*math.sin(TAU*loop_phase)
    root[1] = (-.48 if girl_model else -.13)*sit+hop+breath*sit
    if clip == "scared":
        root[0] = .004*math.sin(TAU*t*8)
        rotations["Spine"][2] = .012*math.sin(TAU*t*8)
        rotations["Head"][1] = .023*math.sin(TAU*t*8)
    phase = max(0, (t-.32)/1.18)
    if girl_model:
        rotations["Spine"][0] = .12*sit
        rotations["Head"][0] = -.10*sit-.05*joy
        rotations["Head"][2] = .04*math.sin(TAU*loop_phase)*sit
        for side, sign in [("L", 1), ("R", -1)]:
            rotations[f"Arm_{side}"] = [-.60*sit, 0, -sign*.26*sit]
            rotations[f"Forearm_{side}"][0] = -.75*sit
            if clip == "wave" and side == "L":
                rotations[f"Arm_{side}"] = [-.10, 0, 2.45]
                rotations[f"Forearm_{side}"] = [0, 0, .20+.30*math.sin(TAU*t*2)]
                rotations[f"Hand_{side}"][2] = .18*math.sin(TAU*t*2)
            if clip == "rescued":
                rotations[f"Arm_{side}"] = [-.15, 0, sign*2.22*joy]
                rotations[f"Forearm_{side}"][2] = sign*.25*joy
            if clip == "walk_out":
                swing = .40*math.sin(TAU*phase*2+(0 if side == "L" else math.pi))*walk
                rotations[f"Arm_{side}"][0] += swing
                rotations[f"Forearm_{side}"][0] += -.20*walk
            z, lift = gait(phase, side, .45)
            target_z = .29*sit+z*walk
            hip_y = .60+root[1]
            a, b = ik(.10+hop+lift*walk-hip_y, target_z, .25, .25)
            rotations[f"Thigh_{side}"][0], rotations[f"Shin_{side}"][0] = a, b
            rotations[f"Foot_{side}"][0] = -a-b
    else:
        hips_angle = -.50*sit
        rotations["Hips"][0] = hips_angle
        rotations["Head"][0] = .50*sit-.04*joy
        tail_phase = loop_phase*(2 if clip == "idle" else 3) if clip in ["idle", "scared", "wave"] else t*(1.5+joy)
        rotations["Tail"][1] = (.12+.32*joy)*math.sin(TAU*tail_phase)
        for side, sign in [("L", 1), ("R", -1)]:
            if friend.name == "dog":
                rotations[f"Ear_{side}"][2] = sign*(.07*sit+.14*joy*math.sin(TAU*t*2))
            # IK target in the leg parent's local yz plane. Both paws stay flat.
            for prefix, top, z0, length, paw_y in [("Front", .46, .15, .19, .08),
                                                  ("Back", .37, -.20, .155, .06)]:
                pivot = (0, .37, -.17)
                local_top = (0, top-pivot[1], z0-pivot[2])
                top_world = add(add(pivot, rotate(local_top, quat(x=hips_angle))), root)
                leg_side = side if prefix == "Front" else ("R" if side == "L" else "L")
                z, lift = gait(phase, leg_side, .38)
                goal_z = z0+(.13 if prefix == "Front" else .11)*sit+root[2]+z*walk
                goal_y = paw_y+hop+lift*walk
                delta = rotate((0, goal_y-top_world[1], goal_z-top_world[2]), quat(x=-hips_angle))
                a, b = ik(delta[1], delta[2], length, length)
                rotations[f"{prefix}Leg_{side}"][0] = a
                rotations[f"{prefix}Shin_{side}"][0] = b
                rotations[f"{prefix}Paw_{side}"][0] = -hips_angle-a-b
            if clip == "wave" and side == "L":
                rotations[f"FrontLeg_{side}"] = [-.6, 0, 2.4]
                rotations[f"FrontShin_{side}"] = [0, 0, .25+.25*math.sin(TAU*t*2)]
                rotations[f"FrontPaw_{side}"] = [0, 0, .15*math.sin(TAU*t*2)]
            if clip == "rescued":
                rotations[f"FrontLeg_{side}"][2] = sign*.16*joy
        rotations["Head"][2] = .025*math.sin(TAU*loop_phase)*sit
    # One gentle blink in each loop. Joy slightly narrows the eyes independently.
    blink_center = .86 if clip == "walk_out" else 1.04
    blink = max(0, 1-abs(t-blink_center)/.09)
    return root, {k: quat(*v) for k, v in rotations.items()}, [joy, blink]


class BinaryGLTF:
    def __init__(self):
        self.binary = bytearray()
        self.document = {"asset": {"version": "2.0", "generator": "Fire rescue v1 original authoring script",
                                   "copyright": "Original work, CC0-1.0; see LICENSES.md"},
                         "bufferViews": [], "accessors": []}

    def accessor(self, rows, kind, component=5126, target=None, bounds=False, name=None):
        components = {"SCALAR": 1, "VEC3": 3, "VEC4": 4, "MAT4": 16}[kind]
        values = [v for row in rows for v in row]
        code = {5126: "f", 5123: "H", 5121: "B"}[component]
        while len(self.binary) % 4:
            self.binary.append(0)
        view = {"buffer": 0, "byteOffset": len(self.binary), "byteLength": len(values)*struct.calcsize(code)}
        if target:
            view["target"] = target
        self.document["bufferViews"].append(view)
        self.binary.extend(struct.pack("<"+code*len(values), *values))
        accessor = {"bufferView": len(self.document["bufferViews"])-1, "componentType": component,
                    "count": len(rows), "type": kind}
        if bounds:
            accessor["min"] = [min(row[j] for row in rows) for j in range(components)]
            accessor["max"] = [max(row[j] for row in rows) for j in range(components)]
        if name:
            accessor["name"] = name
        self.document["accessors"].append(accessor)
        return len(self.document["accessors"])-1

    def write(self, path):
        self.document["buffers"] = [{"byteLength": len(self.binary)}]
        payload = json.dumps(self.document, separators=(",", ":"), ensure_ascii=True).encode()
        payload += b" "*((-len(payload)) % 4)
        self.binary.extend(b"\0"*((-len(self.binary)) % 4))
        total = 12+8+len(payload)+8+len(self.binary)
        path.write_bytes(struct.pack("<III", 0x46546C67, 2, total)+struct.pack("<II", len(payload), 0x4E4F534A)
                         +payload+struct.pack("<II", len(self.binary), 0x004E4942)+self.binary)


def export(friend):
    if len(friend.indices)//3 > 3000:
        raise ValueError(f"{friend.name} exceeds the 3,000-triangle budget")
    g = BinaryGLTF()
    d = g.document
    attributes = {}
    for key, rows, kind, component in [
        ("POSITION", friend.positions, "VEC3", 5126), ("NORMAL", friend.normals, "VEC3", 5126),
        ("COLOR_0", friend.colors, "VEC3", 5126), ("JOINTS_0", friend.joints, "VEC4", 5123),
        ("WEIGHTS_0", [(1., 0., 0., 0.)]*len(friend.positions), "VEC4", 5126),
    ]:
        attributes[key] = g.accessor(rows, kind, component, 34962, key == "POSITION")
    regions = {}
    if friend.name == "girl":
        for key, mask, color in [("uniform_primary", friend.primary, "#EC805E"),
                                  ("uniform_secondary", friend.secondary, "#417E83")]:
            attribute = "_"+key.upper()
            attributes[attribute] = g.accessor(mask, "SCALAR", target=34962, name=key)
            regions[key] = {"attribute": attribute, "defaultSRGB": color,
                            "vertices": sum(int(v[0]) for v in mask)}
    targets = [{"POSITION": g.accessor(rows, "VEC3", target=34962, bounds=True)}
               for rows in [friend.joy, friend.blink]]
    primitive = {"attributes": attributes, "indices": g.accessor([(i,) for i in friend.indices], "SCALAR", 5123, 34963),
                 "material": 0, "mode": 4, "targets": targets}
    d["materials"] = [{"name": "friend_vertex_color", "pbrMetallicRoughness": {
        "baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": .86}}]
    d["meshes"] = [{"name": friend.name+"_mesh", "primitives": [primitive], "weights": [0, 0],
                    "extras": {"targetNames": ["joy", "blink"], "colorRegions": regions}}]
    nodes = []
    matrices = []
    for name, parent, position in friend.bones:
        parent_position = friend.bones[friend.bone_ids[parent]][2] if parent else (0, 0, 0)
        nodes.append({"name": name, "translation": sub(position, parent_position)})
        if parent:
            nodes[friend.bone_ids[parent]].setdefault("children", []).append(friend.bone_ids[name])
        x, y, z = position
        matrices.append((1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1))
    mesh_node = len(nodes)
    nodes.append({"name": friend.name, "mesh": 0, "skin": 0})
    d["nodes"] = nodes
    d["skins"] = [{"name": friend.name+"_simple_rig", "skeleton": 0,
                   "joints": list(range(len(friend.bones))),
                   "inverseBindMatrices": g.accessor(matrices, "MAT4")}]
    d["scenes"], d["scene"] = [{"name": friend.name, "nodes": [0, mesh_node]}], 0
    d["extras"] = {"units": "metres", "up": "+Y", "forward": "+Z", "license": "CC0-1.0",
                   "source": "source/build_assets.py", "rootMotion": {"walk_out": "+Z, baked on Root"}}
    animations = []
    for name, duration in CLIPS.items():
        frames = math.ceil(duration*FPS)
        times = [duration*i/frames for i in range(frames+1)]
        poses = [pose(friend, name, t) for t in times]
        time_accessor = g.accessor([(t,) for t in times], "SCALAR", bounds=True)
        anim = {"name": name, "samplers": [], "channels": []}

        def channel(node, path, rows, kind):
            sampler = len(anim["samplers"])
            anim["samplers"].append({"input": time_accessor, "output": g.accessor(rows, kind), "interpolation": "LINEAR"})
            anim["channels"].append({"sampler": sampler, "target": {"node": node, "path": path}})

        channel(0, "translation", [p[0] for p in poses], "VEC3")
        for bone_name, _, _ in friend.bones:
            channel(friend.bone_ids[bone_name], "rotation", [p[1][bone_name] for p in poses], "VEC4")
        channel(mesh_node, "weights", [(w,) for p in poses for w in p[2]], "SCALAR")
        animations.append(anim)
    d["animations"] = animations
    path = OUT / (friend.name+".glb")
    g.write(path)
    return {"id": friend.name, "file": path.name, "triangles": len(friend.indices)//3,
            "vertices": len(friend.positions), "materials": 1, "primitives": 1,
            "joints": len(friend.bones), "textures": 0, "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "colorRegions": regions,
            "clips": [{"name": name, "duration": seconds,
                       "loop": name in ["idle", "scared", "wave"],
                       "rootDistanceMetres": (.9 if friend.name == "girl" else .76) if name == "walk_out" else 0}
                      for name, seconds in CLIPS.items()]}


def main():
    assets = [export(f) for f in [girl(), animal("cat"), animal("dog")]]
    manifest = {"version": 1, "license": "CC0-1.0", "units": "metres", "up": "+Y", "forward": "+Z",
                "compression": "none", "sampleRate": FPS, "assets": assets}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
    for a in assets:
        print(f"{a['id']}: {a['triangles']} triangles, {a['joints']} joints, {a['bytes']} bytes")


if __name__ == "__main__":
    main()
