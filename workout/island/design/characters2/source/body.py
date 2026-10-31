"""Original connected limb lofts, sports clothing and restrained anatomical forms.

The exact twenty-joint bind pose is supplied by the existing rig contract. Geometry
uses metre-space loft rings; joints blend across a finite zone rather than at a
single rigid cut. Deltoids, calves and cloth folds are sculpted into the surfaces.
"""
import math
import numpy as np


def blend(a, b, t):
    t = float(np.clip(t, 0, 1))
    t = t * t * (3 - 2 * t)
    return {a: 1 - t, b: t}


def torso_weight(y):
    if y < .75:
        return blend('Hips', 'Spine', (y - .642) / .11)
    return blend('Spine', 'Chest', (y - .75) / .15)


def loft(mesh, rings, region, weights, segments=40, folds=0., caps=True):
    """Y-axis elliptical rings: (height, half_width, depth, center_z)."""
    vertices, vw = [], []
    for row, (y, rx, rz, cz) in enumerate(rings):
        for column in range(segments):
            t = column * 2 * math.pi / segments
            ripple = folds * (math.sin(t * 7 + y * 31) + .45 * math.sin(t * 13 - y * 42))
            # Subtle folded volume, strongest towards hem and side seams.
            amount = 1 + ripple
            vertices.append([math.cos(t) * rx * amount, y, cz + math.sin(t) * rz * amount])
            vw.append(weights(y) if callable(weights) else weights)
    faces = []
    for row in range(len(rings) - 1):
        a, b = row * segments, (row + 1) * segments
        for k in range(segments):
            n = (k + 1) % segments
            faces.extend([(a + k, b + k, a + n), (a + n, b + k, b + n)])
    if caps:
        first, last = len(vertices), len(vertices) + 1
        vertices.extend([[0, rings[0][0], rings[0][3]], [0, rings[-1][0], rings[-1][3]]])
        vw.extend([weights(rings[0][0]) if callable(weights) else weights,
                   weights(rings[-1][0]) if callable(weights) else weights])
        for k in range(segments):
            n = (k + 1) % segments
            faces.extend([(first, k, n), (last, (len(rings) - 1) * segments + n,
                                         (len(rings) - 1) * segments + k)])
    mesh.add(vertices, faces, region, vw)


def pants(mesh, model, rig):
    """One connected pair-of-pants surface: waist, saddle and two leg openings.

    The final pelvis ring is a figure eight sharing one crotch vertex. Each loop
    continues into its own leg, so no cylinder caps or overlapping pelvis flap
    can appear as an underwear shape at rest or when the thighs rotate.
    """
    skiing = model == 'skier'
    basketball = model == 'basketball-player'
    count = 28
    vertices, faces, weights = [], [], []

    def smooth(t):
        t = float(np.clip(t, 0, 1))
        return t * t * (3 - 2 * t)

    def weight(p, side=None):
        x, y, _ = p
        # The saddle center follows the pelvis, independently of which leg loop
        # created a shared vertex. Narrow the central zone towards the hems so
        # the leg openings follow their own thigh without an opposite-leg pull.
        center_width = .025 + .020 * smooth((y - .420) / .220)
        amount = smooth((.610 - y) / .240) * smooth(abs(x) / center_width)
        return {'Hips': 1 - amount, 'LeftUpLeg': amount if x > 0 else 0,
                'RightUpLeg': amount if x < 0 else 0}

    def vertex(p, side=None):
        index = len(vertices)
        vertices.append(p); weights.append(weight(p, side))
        return index

    def connect(a, b):
        for k in range(len(a)):
            n = (k + 1) % len(a)
            faces.extend([(a[k], b[k], a[n]), (a[n], b[k], b[n])])

    previous = None
    for y, rx, rz in [(.654, .123, .085), (.640, .128, .087),
                      (.619, .145, .093), (.595, .163, .097),
                      (.570, .176, .098)]:
        ring = []
        for k in range(count * 2):
            a = k * math.pi / count
            ripple = 1 + .008 * math.sin(a * 7 + y * 29)
            ring.append(vertex([math.sin(a) * rx * ripple, y, .008 + math.cos(a) * rz * ripple]))
        if previous is not None:
            connect(previous, ring)
        previous = ring

    branch, crotch = [], None
    for half, side in [(0, 'Left'), (1, 'Right')]:
        sign = 1 if half == 0 else -1
        for k in range(count):
            if k == 0 and half == 1:
                branch.append(crotch)
                continue
            a = math.pi - 2 * math.pi * k / count
            p = [sign * (.090 + .090 * math.cos(a)),
                 .535 - .045 * (.5 - .5 * math.cos(a)),
                 .008 + sign * .095 * math.sin(a)]
            index = vertex(p, side)
            if k == 0:
                crotch = index
            branch.append(index)
    connect(previous, branch)

    for half, side in [(0, 'Left'), (1, 'Right')]:
        sign = 1 if half == 0 else -1
        previous = branch[half * count:(half + 1) * count]
        hip = np.asarray(rig[side + 'UpLeg'])
        knee = np.asarray(rig[side + 'Leg'])
        ankle = np.asarray(rig[side + 'Foot'])
        hem = .365 if basketball else .404
        rows = [(.474, .086, .090), (.449, .083, .086)]
        if skiing:
            rows += [(.420,.070,.075),(.385,.060,.066),(.353,.052,.058),
                     (.329,.049,.055),(.307,.050,.055),(.280,.057,.059),
                     (.250,.059,.063),(.220,.057,.062),(.190,.050,.058),
                     (.160,.045,.052),(.130,.039,.047),(.104,.038,.045),
                     (.084,.038,.043)]
        else:
            if basketball:
                rows += [(.418,.077,.080),(.389,.070,.074),(.372,.068,.071),(.365,.067,.070)]
            else:
                rows += [(.420,.079,.081),(.410,.078,.079),(.404,.077,.078)]
        for y, rx, rz in rows:
            if y >= knee[1]:
                t = float(np.clip((hip[1] - y) / (hip[1] - knee[1]), 0, 1))
                center = hip * (1 - t) + knee * t
            else:
                t = float(np.clip((knee[1] - y) / (knee[1] - ankle[1]), 0, 1))
                center = knee * (1 - t) + ankle * t
            ring = []
            for k in range(count):
                a = math.pi - 2 * math.pi * k / count
                fold = 1 + .010 * math.sin(a * 6 + y * 47)
                p = [center[0] + sign * rx * math.cos(a) * fold, y,
                     center[2] + sign * rz * math.sin(a) * fold]
                i = vertex(p, side)
                if skiing and y < .375:
                    weights[i] = blend(side + 'Leg', side + 'UpLeg', (y - knee[1] + .041) / .082)
                    if y < .124:
                        weights[i] = blend(side + 'Leg', side + 'Foot', (.124 - y) / .070)
                ring.append(i)
            connect(previous, ring)
            previous = ring
        if not skiing:
            # The garment is open at the hem; the narrow trim follows its final loop.
            points = [vertices[i] for i in previous] + [vertices[previous[0]]]
            influences = [weights[i] for i in previous] + [weights[previous[0]]]
            mesh.tube(points, .0012, 'accent', influences, segments=6, caps=False)
    mesh.add(vertices, faces, 'shorts', weights)


def add_body(mesh, model, rig):
    basketball = model == 'basketball-player'
    skiing = model == 'skier'
    keeper = model == 'goalkeeper'
    # A six-to-seven-head silhouette with a narrow waist and broad athletic chest.
    # Existing bone lengths remain entirely unchanged.
    bulk = 1.035 if keeper else .97 if basketball else 1.
    torso = [
        (.640, .119, .081, .008), (.651, .120, .082, .008),
        (.665, .118, .082, .008), (.686, .113, .081, .006),
        (.710, .115, .082, .004), (.728, .120, .085, .001),
        (.745, .124, .087, -.002), (.790, .139, .093, -.004),
        (.839, .151, .098, -.004), (.883, .160, .099, -.004),
        (.925, .166, .095, -.006), (.963, .171, .086, -.008),
        (.994, .166, .076, -.009), (1.012, .143, .068, -.010),
        (1.030, .084, .055, -.011), (1.039, .047, .044, -.011),
    ]
    torso = [(y, x * bulk, z * (1.075 if skiing else 1), cz) for y, x, z, cz in torso]
    loft(mesh, torso, 'shirt', torso_weight, folds=.018 if skiing else .012)
    # A collar with thickness frames the base of the neck. Its weights follow chest.
    collar = [(1.032, .052, .047, -.011), (1.041, .052, .047, -.011),
              (1.045, .046, .042, -.011)]
    loft(mesh, collar, 'accent', {'Chest': 1}, segments=32, folds=0, caps=False)
    # Natural neck narrows at the skull, rather than using a visible cylinder.
    loft(mesh, [(1.027, .043, .038, -.011), (1.049, .041, .037, -.009),
                (1.077, .038, .036, -.004), (1.102, .040, .038, .002),
                (1.124, .047, .043, .005)], 'skin',
         lambda y: blend('Neck', 'Head', (y - 1.075) / .05), segments=28)

    # Waistband has a raised edge; each short leg has continuous volume down to hem.
    pants(mesh, model, rig)
    loft(mesh, [(.644, .125, .086, .008), (.653, .123, .085, .008)],
         'accent', {'Hips': 1}, segments=40, caps=False)

    for side, sign in [('Left', 1), ('Right', -1)]:
        shoulder = np.asarray(rig[side + 'Arm'])
        elbow = np.asarray(rig[side + 'ForeArm'])
        wrist = np.asarray(rig[side + 'Hand'])
        arm_name, fore_name, hand_name = side + 'Arm', side + 'ForeArm', side + 'Hand'
        # Continuous chest-side shoulder volume seals the sleeve/armhole during
        # arm elevation. The shared clavicle surface stays with Chest.
        mesh.ellipsoid([sign * .120, 1.004, -.003], [.066, .034, .063],
                       'skin' if basketball else 'shirt', {'Chest': 1}, segments=28, rings=10)

        def arm_point(distance):
            # Side is +X on anatomical left. The original T-pose has a shallow slope.
            x = distance * sign
            t = (x - shoulder[0]) / (wrist[0] - shoulder[0])
            return np.array([x, shoulder[1] * (1 - t) + wrist[1] * t,
                             shoulder[2] * (1 - t) + wrist[2] * t])

        def arm_weight(distance):
            elbow_x = abs(elbow[0])
            wrist_x = abs(wrist[0])
            if distance < .245:
                # Deltoid belongs predominantly to upper arm. A broad, low-amplitude
                # clavicle blend avoids stretching the outer shoulder into a wedge.
                t = float(np.clip((distance - .14) / .105, 0, 1))
                arm = .80 + .20 * (t * t * (3 - 2 * t))
                return {side + 'Shoulder': 1 - arm, arm_name: arm}
            if distance > wrist_x - .042:
                return blend(fore_name, hand_name, (distance - wrist_x + .042) / .060)
            return blend(arm_name, fore_name, (distance - elbow_x + .043) / .086)

        arm_rings = [(.140, (.034, .044)), (.159, (.037, .049)),
                     (.183, (.041, .048)), (.208, (.044, .046)),
                     (.235, (.050, .044)), (.268, (.045, .041)),
                     (.298, (.038, .035)), (.321, (.031, .031)),
                     (.3418, (.029, .029)), (.359, (.030, .030)),
                     (.382, (.035, .033)), (.409, (.037, .034)),
                     (.438, (.034, .031)), (.469, (.030, .028)),
                     (.501, (.026, .025)), (.532, (.023, .024)),
                     (.565, (.022, .024))]
        # Covered skin is omitted: coincident shoulder cap planes would otherwise
        # intersect the sleeve when arms rotate through extreme motion poses.
        sleeve_end = .553 if keeper or skiing else .281
        if basketball:
            skin_rings = [(.105, (.026, .040)), (.123, (.031, .045))] + arm_rings
        else:
            start = sleeve_end - .008
            before = max((d, r) for d, r in arm_rings if d <= start)
            after = min((d, r) for d, r in arm_rings if d >= start)
            factor = (start - before[0]) / max(1e-9, after[0] - before[0])
            radius = tuple(before[1][k] * (1 - factor) + after[1][k] * factor for k in range(2))
            skin_rings = [(start, radius)] + [(d, r) for d, r in arm_rings if d > start]
        skin_weights = []
        for d, _ in skin_rings:
            if basketball and d < .225:
                amount = float(np.clip((d - .105) / .12, 0, 1))
                amount = amount * amount * (3 - 2 * amount)
                skin_weights.append({'Chest': 1 - amount, arm_name: amount})
            else:
                skin_weights.append(arm_weight(d))
        mesh.tube([arm_point(d) for d, _ in skin_rings], [r for _, r in skin_rings],
                  'skin', skin_weights, segments=24, caps=False)
        if not basketball:
            end = sleeve_end
            sleeve_rings = [(.105, (.026, .040)), (.123, (.031, .045))]
            sleeve_rings += [(d, (r[0] + (.008 if skiing else .004), r[1] + (.008 if skiing else .004)))
                            for d, r in arm_rings if d < end]
            sleeve_rings.extend([(end - .006, (.029, .031) if end > .5 else (.048, .045)),
                                 (end, (.029, .031) if end > .5 else (.048, .045))])
            sleeve_weights = []
            for d, _ in sleeve_rings:
                arm_amount = float(np.clip((d - .105) / .12, 0, 1))
                arm_amount = arm_amount * arm_amount * (3 - 2 * arm_amount)
                sleeve_weights.append({'Chest': 1 - arm_amount, arm_name: arm_amount} if d < .225 else arm_weight(d))
            mesh.tube([arm_point(d) for d, _ in sleeve_rings], [r for _, r in sleeve_rings],
                      'shirt', sleeve_weights, segments=24, caps=False)
            cuff = sleeve_rings[-1][1]
            mesh.tube([arm_point(end - .006), arm_point(end + .002)],
                      [(cuff[0] + .001, cuff[1] + .001)] * 2,
                      'accent', arm_weight(end), segments=24)

        hip = np.asarray(rig[side + 'UpLeg'])
        knee = np.asarray(rig[side + 'Leg'])
        ankle = np.asarray(rig[side + 'Foot'])
        upper, lower, foot = side + 'UpLeg', side + 'Leg', side + 'Foot'

        def leg_center(y):
            if y >= knee[1]:
                t = float(np.clip((hip[1] - y) / (hip[1] - knee[1]), 0, 1))
                p = hip * (1 - t) + knee * t
            else:
                t = float(np.clip((knee[1] - y) / (knee[1] - ankle[1]), 0, 1))
                p = knee * (1 - t) + ankle * t
            return [p[0], y, p[2]]

        def leg_weight(y):
            if y > .47:
                # Hip rotation is distributed from waistband into upper thigh;
                # a narrow Hips/UpLeg boundary would elongate cloth during kicks.
                return blend('Hips', upper, (.630 - y) / .160)
            if y < .124:
                return blend(lower, foot, (.124 - y) / .070)
            return blend(lower, upper, (y - knee[1] + .041) / .082)

        # Quadriceps taper into patella; calf bulges rearwards below knee.
        leg_rings = [(.558, (.074, .076)), (.535, (.077, .078)),
                     (.510, (.074, .075)), (.479, (.070, .072)),
                     (.447, (.064, .066)), (.414, (.057, .060)),
                     (.384, (.048, .052)), (.355, (.040, .044)),
                     (.333, (.037, .041)), (.312, (.037, .039)),
                     (.288, (.042, .043)), (.260, (.046, .047)),
                     (.231, (.045, .047)), (.202, (.039, .043)),
                     (.173, (.032, .037)), (.143, (.027, .032)),
                     (.113, (.024, .028)), (.085, (.024, .027))]
        # Omit hidden thigh skin, whose independent joint envelope could pierce
        # the connected crotch during a kick. A small cuff overlap seals the hem.
        skin_top = .378 if basketball else .418
        visible_leg_rings = [(y, r) for y, r in leg_rings if y <= skin_top]
        for (upper_y, upper_r), (lower_y, lower_r) in zip(leg_rings, leg_rings[1:]):
            if upper_y >= skin_top >= lower_y:
                t = (upper_y - skin_top) / (upper_y - lower_y)
                visible_leg_rings.insert(0, (skin_top, tuple(upper_r[k] * (1 - t) + lower_r[k] * t for k in range(2))))
                break
        leg_points = [leg_center(y) for y, _ in visible_leg_rings]
        for i, (y, _) in enumerate(visible_leg_rings):
            leg_points[i][2] -= .007 * math.exp(-((y - .245) / .065) ** 2)
        if not skiing:
            mesh.tube(leg_points, [r for _, r in visible_leg_rings], 'skin',
                      [leg_weight(y) for y, _ in visible_leg_rings], segments=28, caps=False)

        if not skiing:
            sock_top = .185 if basketball else .307
            sock_rings = [(y, (r[0] + .002, r[1] + .0025)) for y, r in leg_rings
                          if .084 <= y < sock_top]
            top_radius = (.039 if basketball else .040, .044 if basketball else .043)
            sock_rings.insert(0, (sock_top, top_radius))
            def sock_center(y):
                point = leg_center(y)
                point[2] -= .007 * math.exp(-((y - .245) / .065) ** 2)
                return point
            mesh.tube([sock_center(y) for y, _ in sock_rings], [r for _, r in sock_rings],
                      'socks', [leg_weight(y) for y, _ in sock_rings], segments=28)
            mesh.tube([sock_center(sock_top - .005), sock_center(sock_top + .005)],
                      [(top_radius[0] + .001, top_radius[1] + .001)] * 2,
                      'accent', leg_weight(sock_top), segments=28)

    # Front and back shoulder/side seams conform to the garment surface.
    for sign in [-1, 1]:
        angle = .20 if sign > 0 else math.pi - .20
        seam_points = []
        for y, x, z, cz in torso[2:13]:
            fold = 1 + (.018 if skiing else .012) * (math.sin(angle * 7 + y * 31) + .45 * math.sin(angle * 13 - y * 42))
            seam_points.append([math.cos(angle) * (x * fold + .0006), y,
                                cz + math.sin(angle) * (z * fold + .0006)])
        mesh.tube(seam_points, .0008, 'accent', [torso_weight(p[1]) for p in seam_points], segments=6)
    # Raised hem stitching reads at close range and survives outfit replacement.
    points = []
    for k in range(49):
        t = 2 * math.pi * k / 48
        points.append([math.cos(t) * .1204 * bulk, .652, .008 + math.sin(t) * .0825])
    mesh.tube(points, .0008, 'accent', {'Hips': 1}, segments=6)
    if skiing:
        # Zipper line follows the front depth of every torso ring.
        zipper = [[0., y, cz + depth + .0009] for y, _, depth, cz in torso[1:-1]]
        mesh.tube(zipper, .0013, 'accent', [torso_weight(p[1]) for p in zipper], segments=6)
