#!/usr/bin/env python3
"""athlete-body-v3 builder (CC0-1.0, original procedural geometry, no external asset).

Builds the new shared athlete on the canonical 18-bone rig (same joint names, order, parents and rest translations as athlete-body-v2 / v22),
so every existing clip plays on it with the identity map. Two meshes are written: `soccer` (short sleeves, shorts, socks, boots with studs) and
`hoops` (sleeveless jersey, long shorts, high-top sneakers, bare shins), plus eight hair caps in Head-local space.

Output, relative to the repository root (needs only Python 3 and NumPy):
  workout/island/assets/athlete-body-v3/models/{soccer,hoops}.glb, hair/*.glb, body-manifest.json
Run:  python3 workout/island/design/athlete-body-v3/tools/build.py
"""
import hashlib, json, math, os, struct, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '..', '..', '..', 'assets', 'athlete-body-v3'))
REPO = os.path.abspath(os.path.join(HERE, '../../../../..'))
TEMPLATE = os.path.join(REPO, 'workout/island/assets/athlete-body-v22/models/soccer.glb')

BONES = ['Root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
         'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot']
BI = {n: i for i, n in enumerate(BONES)}

# regions (vertex colour is painted per region by the game; the baked colour is used for regions the game does not paint)
R_SKIN, R_SHIRT, R_SHORTS, R_TRIM, R_SHOE, R_SOLE, R_EYE, R_HAIR, R_SOCK, R_IRIS, R_MOUTH, R_PUPIL, R_LIGHT, R_LACE = range(14)
BAKED = {R_SKIN: '#c38d69', R_SHIRT: '#187e83', R_SHORTS: '#16363b', R_TRIM: '#e7dbb9', R_SHOE: '#253540', R_SOLE: '#d4d5cb', R_EYE: '#f3f0ea',
         R_HAIR: '#442d22', R_SOCK: '#e7dbb9', R_IRIS: '#3a2a20', R_MOUTH: '#8a4545', R_PUPIL: '#0b0b0d', R_LIGHT: '#ffffff', R_LACE: '#eeeee8'}
HAND_SEG = 100


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def pchip(xs, ys, x):
    """Monotone cubic interpolation of the keys (xs ascending) at x (scalar or array)."""
    xs = np.asarray(xs, float); ys = np.asarray(ys, float); x = np.asarray(x, float)
    h = np.diff(xs); d = np.diff(ys) / h
    m = np.zeros_like(ys)
    for i in range(1, len(xs) - 1):
        if d[i - 1] * d[i] > 0:
            w1 = 2 * h[i] + h[i - 1]; w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    m[0] = d[0]; m[-1] = d[-1]
    i = np.clip(np.searchsorted(xs, x) - 1, 0, len(xs) - 2)
    t = (x - xs[i]) / h[i]
    h00 = 2 * t ** 3 - 3 * t ** 2 + 1; h10 = t ** 3 - 2 * t ** 2 + t; h01 = -2 * t ** 3 + 3 * t ** 2; h11 = t ** 3 - t ** 2
    r = h00 * ys[i] + h10 * h[i] * m[i] + h01 * ys[i + 1] + h11 * h[i] * m[i + 1]
    return np.where((x < xs[0]), ys[0], np.where(x > xs[-1], ys[-1], r))


def interp_table(table, y):
    """table: list of (y, v0, v1, ...) -> tuple of values at y"""
    t = np.array(table, float)
    return [float(pchip(t[:, 0], t[:, k], y)) for k in range(1, t.shape[1])]


def smooth01(t):
    t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)


def gauss(t):
    return math.exp(-t * t)


# ---------------------------------------------------------------------------------------------------------------------------------
# skin weights
# ---------------------------------------------------------------------------------------------------------------------------------
def wkeys(y, keys):
    """keys: list of (y, {bone: w}) ascending; linear blend of the weight dicts."""
    if y <= keys[0][0]: return dict(keys[0][1])
    if y >= keys[-1][0]: return dict(keys[-1][1])
    for (y0, a), (y1, b) in zip(keys, keys[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0) if y1 > y0 else 0
            out = {}
            for k in set(a) | set(b): out[k] = a.get(k, 0) * (1 - t) + b.get(k, 0) * t
            return out
    return {}


W_SPINE = [(0.84, {'Hips': 1}), (0.90, {'Hips': 1}), (1.07, {'Spine': 1}), (1.22, {'Chest': 1}), (1.36, {'Chest': 1}), (1.42, {'Neck': 1}),
           (1.47, {'Neck': 1}), (1.55, {'Head': 1})]


def w_leg(side, y):
    U, L, F = side + 'UpLeg', side + 'Leg', side + 'Foot'
    return wkeys(y, [(0.05, {F: 1}), (0.12, {L: 1}), (0.38, {L: 1}), (0.52, {U: 1}), (0.80, {U: 1}), (0.96, {'Hips': 1})])


def w_arm(side, y):
    A, Fa = side + 'Arm', side + 'ForeArm'
    return wkeys(y, [(0.77, {side + 'Hand': 1}), (0.84, {Fa: 1}), (0.98, {Fa: 1}), (1.09, {A: 1}), (1.26, {A: 1}), (1.36, {'Chest': 1})])


def w_head(y):
    return wkeys(y, [(1.50, {'Neck': 0.55, 'Head': 0.45}), (1.55, {'Head': 1})])


# ---------------------------------------------------------------------------------------------------------------------------------
# mesh container
# ---------------------------------------------------------------------------------------------------------------------------------
class Mesh:
    def __init__(self):
        self.P = []; self.W = []; self.S = []; self.T = []; self.N = None; self.PN = {}

    def vert(self, p, w, seg=0):
        self.P.append(np.asarray(p, float)); self.W.append(w); self.S.append(seg)
        return len(self.P) - 1

    def tri(self, a, b, c, region):
        self.T.append((a, b, c, region))

    def normals(self):
        P = np.array(self.P); N = np.zeros_like(P)
        for a, b, c, _ in self.T:
            n = np.cross(P[b] - P[a], P[c] - P[a])
            N[a] += n; N[b] += n; N[c] += n
        L = np.linalg.norm(N, axis=1); L[L == 0] = 1
        return N / L[:, None]


def ring_pts(c, a, b, n, N, phase=0.0):
    pts = []
    for k in range(N):
        th = 2 * math.pi * k / N + phase
        s, co = math.sin(th), math.cos(th)
        sx = math.copysign(abs(s) ** (2 / n), s); sz = math.copysign(abs(co) ** (2 / n), co)
        pts.append((c[0] + a * sx, c[1], c[2] + b * sz))
    return pts


def add_lofts(mesh, rings, N, region_of, wfun, seg=0, ring_hint=None, cap_end=None, cap_start=None, flip=None):
    """rings: list of dict(c=(x,y,z), a, b, n). Faces between ring i and i+1 get region_of(i, k, centroid). Winding is made outward."""
    idx = []
    for r in rings:
        pts = ring_pts(r['c'], r['a'], r['b'], r.get('n', 2.0), N)
        idx.append([mesh.vert(p, wfun(p), seg) for p in pts])
    center = np.mean([r['c'] for r in rings], axis=0)
    first = len(mesh.T)
    for i in range(len(rings) - 1):
        for k in range(N):
            k2 = (k + 1) % N
            A, B, C, D = idx[i][k], idx[i][k2], idx[i + 1][k2], idx[i + 1][k]
            cen = (mesh.P[A] + mesh.P[B] + mesh.P[C] + mesh.P[D]) / 4
            reg = region_of(i, k, cen)
            mesh.tri(A, B, C, reg); mesh.tri(A, C, D, reg)
    # outward check on the first quad ring
    t = mesh.T[first]
    n = np.cross(mesh.P[t[1]] - mesh.P[t[0]], mesh.P[t[2]] - mesh.P[t[0]])
    out = mesh.P[t[0]] - np.array(rings[0]['c'])
    out[1] = 0
    bad = np.dot(n, out) < 0 if flip is None else flip
    if bad:
        for j in range(first, len(mesh.T)):
            a, b, c, r = mesh.T[j]; mesh.T[j] = (a, c, b, r)
    for cap, ring_i, up in ((cap_start, 0, False), (cap_end, len(rings) - 1, True)):
        if cap is None: continue
        r = rings[ring_i]
        cv = mesh.vert(r['c'], wfun(r['c']), seg)
        # duplicate ring for a flat cap
        dup = [mesh.vert(mesh.P[i], wfun(mesh.P[i]), seg) for i in idx[ring_i]]
        for k in range(N):
            k2 = (k + 1) % N
            if up != bad: mesh.tri(cv, dup[k2], dup[k], cap)
            else: mesh.tri(cv, dup[k], dup[k2], cap)
    return idx


def orient_tris(mesh, first, ref):
    """make the triangles from `first` face away from point ref on average"""
    P = np.array(mesh.P); s = 0
    for a, b, c, _ in mesh.T[first:]:
        n = np.cross(P[b] - P[a], P[c] - P[a]); cen = (P[a] + P[b] + P[c]) / 3
        s += np.dot(n, cen - ref)
    if s < 0:
        for j in range(first, len(mesh.T)):
            a, b, c, r = mesh.T[j]; mesh.T[j] = (a, c, b, r)


# ---------------------------------------------------------------------------------------------------------------------------------
# head
# ---------------------------------------------------------------------------------------------------------------------------------
HD = dict(cy=1.6096, cz=0.010, rx=0.0850, ry=0.1260, rzf=0.097, rzb=0.106)


def head_pt(th, v, k=1.0):
    """surface of the head; th 0 = front (+z), pi/2 = +x (left); v 0 = chin pole, 1 = crown pole. k scales the head (1.0)."""
    phi = v * math.pi; s = math.sin(phi); c = math.cos(phi)
    y = HD['cy'] - HD['ry'] * c
    jaw = smooth01(v / 0.60)
    taper = 1 - 0.32 * (1 - jaw) ** 1.6
    taperz = 1 - 0.20 * (1 - jaw) ** 1.4
    cth = math.cos(th); sth = math.sin(th)
    x = HD['rx'] * s * taper * sth
    zr = HD['rzf'] if cth >= 0 else HD['rzb']
    z = HD['cz'] + zr * s * taperz * cth
    front = max(0.0, cth)
    # features (front only)
    dz = 0.0; dx = 0.0
    ta = th if th <= math.pi else th - 2 * math.pi
    dz += 0.016 * gauss(ta / 0.14) * gauss((v - 0.435) / 0.075)           # nose bridge + body
    dz += 0.009 * gauss(ta / 0.075) * gauss((v - 0.385) / 0.038)          # tip
    dx += math.copysign(0.0035, ta) * gauss((abs(ta) - 0.17) / 0.07) * gauss((v - 0.40) / 0.05)  # nostril wings
    dz += 0.008 * gauss(ta / 0.55) * gauss((v - 0.585) / 0.05)           # brow ridge
    dz -= 0.0045 * gauss((abs(ta) - 0.42) / 0.16) * gauss((v - 0.545) / 0.045)  # eye sockets
    dz += 0.011 * gauss(ta / 0.34) * gauss((v - 0.075) / 0.06)           # chin
    dz += 0.0035 * gauss((abs(ta) - 0.62) / 0.20) * gauss((v - 0.45) / 0.07)  # cheeks
    dx += math.copysign(0.004, sth) * gauss((v - 0.42) / 0.12) * gauss((abs(th - math.pi / 2) if sth > 0 else abs(th - 3 * math.pi / 2)) / 0.5)
    dz -= 0.0030 * gauss(ta / 0.28) * gauss((v - 0.255) / 0.028)         # mouth line recess
    dz += 0.0030 * gauss(ta / 0.22) * gauss((v - 0.205) / 0.030)         # lower lip / chin fold
    dz += 0.0022 * gauss(ta / 0.22) * gauss((v - 0.295) / 0.030)         # upper lip
    return np.array([x + dx * front, y, z + dz * front])


def head_normal(th, v, k=1.0):
    e = 1e-3
    a = (head_pt(th + e, v) - head_pt(th - e, v)); b = (head_pt(th, min(1, v + e)) - head_pt(th, max(0, v - e)))
    n = np.cross(b, a)
    L = np.linalg.norm(n) or 1
    n = n / L
    c = head_pt(th, v) - np.array([0, HD['cy'], HD['cz']])
    return n if np.dot(n, c) >= 0 else -n


def v_for_y(y):
    c = -(y - HD['cy']) / HD['ry']
    return math.acos(max(-1, min(1, c))) / math.pi


def th_for_x(x, v):
    jaw = smooth01(v / 0.60); taper = 1 - 0.32 * (1 - jaw) ** 1.6
    s = math.sin(v * math.pi) * taper * HD['rx']
    return math.asin(max(-1, min(1, x / s)))


def head_surface(mesh, hw, cols=26, vs=None):
    if vs is None:
        vs = [0.035, 0.08, 0.13, 0.19, 0.25, 0.30, 0.345, 0.385, 0.43, 0.475, 0.52, 0.565, 0.61, 0.66, 0.72, 0.79, 0.86, 0.93, 0.975]
    rings = []
    for v in vs:
        row = []
        for k in range(cols):
            th = 2 * math.pi * k / cols
            p = head_pt(th, v); row.append(mesh.vert(p, hw(p), 0))
        rings.append(row)
    first = len(mesh.T)
    for i in range(len(rings) - 1):
        for k in range(cols):
            k2 = (k + 1) % cols
            A, B, C, D = rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]
            mesh.tri(A, B, C, R_SKIN); mesh.tri(A, C, D, R_SKIN)
    p0 = np.array([0, HD['cy'] - HD['ry'], HD['cz']]); p1 = np.array([0, HD['cy'] + HD['ry'], HD['cz']])
    c0 = mesh.vert(p0, hw(p0), 0); c1 = mesh.vert(p1, hw(p1), 0)
    for k in range(cols):
        k2 = (k + 1) % cols
        mesh.tri(c0, rings[0][k], rings[0][k2], R_SKIN)
        mesh.tri(c1, rings[-1][k2], rings[-1][k], R_SKIN)
    orient_tris(mesh, first, np.array([0, HD['cy'], HD['cz']]))


def decal_poly(mesh, pts_xy, region, hw, off=0.0013, center=None):
    """flat decal on the face: pts_xy are (x, y) outline points; projected on the head surface, fan from the centre."""
    def surf(x, y):
        v = v_for_y(y); th = th_for_x(x, v)
        for _ in range(3):                       # refine so that the surface point has the wanted x
            p = head_pt(th, v); th += (x - p[0]) / (HD['rx'] * 0.9) * 0.9
        p = head_pt(th, v); n = head_normal(th, v)
        return p + n * off
    cx = sum(p[0] for p in pts_xy) / len(pts_xy); cy = sum(p[1] for p in pts_xy) / len(pts_xy)
    c = surf(cx, cy) if center is None else surf(*center)
    ci = mesh.vert(c, hw(c), 0)
    ids = []
    for (x, y) in pts_xy:
        p = surf(x, y); ids.append(mesh.vert(p, hw(p), 0))
    first = len(mesh.T)
    for k in range(len(ids)):
        mesh.tri(ci, ids[k], ids[(k + 1) % len(ids)], region)
    orient_tris(mesh, first, np.array([0, HD['cy'], HD['cz']]))


def ellipse_pts(cx, cy, rx, ry, n=10, rot=0.0):
    out = []
    for k in range(n):
        t = 2 * math.pi * k / n
        x = rx * math.cos(t); y = ry * math.sin(t)
        out.append((cx + x * math.cos(rot) - y * math.sin(rot), cy + x * math.sin(rot) + y * math.cos(rot)))
    return out


def stroke_pts(path, width):
    """outline polygon of a polyline stroke (2D)"""
    left = []; right = []
    for i, (x, y) in enumerate(path):
        if i == 0: dx, dy = path[1][0] - x, path[1][1] - y
        elif i == len(path) - 1: dx, dy = x - path[i - 1][0], y - path[i - 1][1]
        else: dx, dy = path[i + 1][0] - path[i - 1][0], path[i + 1][1] - path[i - 1][1]
        L = math.hypot(dx, dy) or 1; nx, ny = -dy / L, dx / L
        w = width[i] if isinstance(width, (list, tuple)) else width
        left.append((x + nx * w / 2, y + ny * w / 2)); right.append((x - nx * w / 2, y - ny * w / 2))
    return left + right[::-1]


def face_features(mesh, hw, look):
    cy = HD['cy']; eye_y = cy + 0.0030; ex = 0.0350
    for sx in (1, -1):
        cx = sx * ex
        decal_poly(mesh, ellipse_pts(cx, eye_y, 0.0140, 0.0102, 12), R_EYE, hw, 0.0014)
        decal_poly(mesh, ellipse_pts(cx + sx * 0.0008, eye_y - 0.0004, 0.0068, 0.0068, 10), R_IRIS, hw, 0.0019)
        decal_poly(mesh, ellipse_pts(cx + sx * 0.0008, eye_y - 0.0004, 0.0036, 0.0036, 8), R_PUPIL, hw, 0.0024)
        decal_poly(mesh, ellipse_pts(cx + sx * 0.0030, eye_y + 0.0026, 0.0017, 0.0017, 6), R_LIGHT, hw, 0.0029)
        # eyebrow: slight arch, thicker toward the nose
        by = cy + 0.0290
        path = [(sx * 0.0165, by - 0.0006), (sx * 0.0270, by + 0.0016), (sx * 0.0385, by + 0.0024), (sx * 0.0500, by + 0.0000)]
        decal_poly(mesh, stroke_pts(path, [0.0062, 0.0066, 0.0060, 0.0042]), R_HAIR, hw, 0.0016)
    # mouth: a gentle smile
    my = cy - 0.0740
    path = [(-0.0165, my + 0.0030), (-0.0085, my + 0.0002), (0.0, my - 0.0006), (0.0085, my + 0.0002), (0.0165, my + 0.0030)]
    decal_poly(mesh, stroke_pts(path, [0.0026, 0.0034, 0.0038, 0.0034, 0.0026]), R_MOUTH, hw, 0.0014)
    # nostrils: two small dark marks under the nose
    for sx in (1, -1):
        decal_poly(mesh, ellipse_pts(sx * 0.0090, cy - 0.0540, 0.0035, 0.0022, 6), R_MOUTH, hw, 0.0009)


def ears(mesh, hw):
    for sx in (1, -1):
        c = np.array([sx * 0.0835, HD['cy'] - 0.0105, 0.004])
        rings = []
        ys = [-0.030, -0.018, -0.004, 0.012, 0.026, 0.034]
        rr = [0.4, 0.85, 1.0, 1.0, 0.8, 0.35]
        for dy, r in zip(ys, rr):
            rings.append(dict(c=(c[0] + sx * 0.002 * r, c[1] + dy, c[2] - 0.002 * dy * 20), a=0.0115 * r, b=0.020 * r, n=2.0))
        add_lofts(mesh, rings, 8, lambda i, k, cen: R_SKIN, hw, cap_start=R_SKIN, cap_end=R_SKIN)


# ---------------------------------------------------------------------------------------------------------------------------------
# hands
# ---------------------------------------------------------------------------------------------------------------------------------
def frame_from(t):
    t = t / np.linalg.norm(t)
    ref = np.array([0, 0, 1.0])
    if abs(np.dot(t, ref)) > 0.9: ref = np.array([1.0, 0, 0])
    u = np.cross(t, ref); u /= np.linalg.norm(u); v = np.cross(t, u)
    return u, v


def tube(mesh, pts, radii, N, region, wfun, seg=0, tip=True, flatness=(1.0, 1.0)):
    pts = [np.asarray(p, float) for p in pts]
    idx = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)])
        u, v = frame_from(t)
        row = []
        for k in range(N):
            a = 2 * math.pi * k / N
            q = p + u * math.cos(a) * radii[i] * flatness[0] + v * math.sin(a) * radii[i] * flatness[1]
            row.append(mesh.vert(q, wfun(q), seg))
        idx.append(row)
    first = len(mesh.T)
    for i in range(len(pts) - 1):
        for k in range(N):
            k2 = (k + 1) % N
            mesh.tri(idx[i][k], idx[i][k2], idx[i + 1][k2], region); mesh.tri(idx[i][k], idx[i + 1][k2], idx[i + 1][k], region)
    if tip:
        t = pts[-1] - pts[-2]; t = t / np.linalg.norm(t)
        tp = pts[-1] + t * radii[-1] * 0.8
        cv = mesh.vert(tp, wfun(tp), seg)
        for k in range(N):
            mesh.tri(cv, idx[-1][(k + 1) % N], idx[-1][k], region) if False else mesh.tri(idx[-1][k], idx[-1][(k + 1) % N], cv, region)
    orient_tris(mesh, first, np.mean(pts, axis=0))


def hand(mesh, side, glove_seg=HAND_SEG):
    """one hand (side +1 = left, x > 0), built around the wrist joint at (0.16 * side, 0.79, 0); palm faces the thigh, thumb forward."""
    sx = side; X0 = 0.16 * sx; bone = 'LeftHand' if side > 0 else 'RightHand'
    wf = lambda p: {bone: 1.0}
    # palm: wrist to knuckles
    rings = [dict(c=(X0, 0.800, 0.0), a=0.0235, b=0.029, n=2.6), dict(c=(X0 - sx * 0.0005, 0.765, 0.002), a=0.0185, b=0.0385, n=3.0),
             dict(c=(X0 - sx * 0.002, 0.722, 0.0025), a=0.0160, b=0.0415, n=3.2), dict(c=(X0 - sx * 0.003, 0.708, 0.0025), a=0.0128, b=0.0385, n=3.0)]
    add_lofts(mesh, rings, 10, lambda i, k, c: R_SKIN, wf, seg=glove_seg, cap_end=R_SKIN)
    # fingers: relaxed curl toward the palm (towards the body: -x for the left hand)
    specs = [(0.0305, [0.034, 0.022, 0.018], 0.0088), (0.0105, [0.038, 0.025, 0.019], 0.0092), (-0.0095, [0.035, 0.023, 0.018], 0.0088), (-0.0285, [0.028, 0.018, 0.016], 0.0078)]
    for z, lens, r in specs:
        p = np.array([X0 - sx * 0.003, 0.707, z]); pts = [p.copy()]; ang = 0.12
        for L, da in zip(lens, [0.10, 0.45, 0.45]):
            ang += da
            p = p + np.array([-sx * math.sin(ang), -math.cos(ang), 0.0]) * L; pts.append(p.copy())
        radii = [r, r * 0.95, r * 0.86, r * 0.76]
        tube(mesh, pts, radii, 6, R_SKIN, wf, seg=glove_seg)
    # thumb: from the side of the palm, forward and down
    p0 = np.array([X0 - sx * 0.0035, 0.758, 0.031]); pts = [p0, p0 + np.array([-sx * 0.0045, -0.020, 0.0145]), p0 + np.array([-sx * 0.009, -0.039, 0.0275]),
                                                              p0 + np.array([-sx * 0.0125, -0.0555, 0.0365])]
    tube(mesh, pts, [0.0120, 0.0100, 0.0086, 0.0074], 7, R_SKIN, wf, seg=glove_seg)


# ---------------------------------------------------------------------------------------------------------------------------------
# the body
# ---------------------------------------------------------------------------------------------------------------------------------
TORSO = [(0.78, .152, .102, -.004, 2.4), (0.84, .164, .108, -.002, 2.4), (0.90, .168, .112, 0.0, 2.4), (0.98, .152, .106, 0.0, 2.3), (1.06, .146, .102, 0.0, 2.3),
         (1.14, .162, .108, .004, 2.3), (1.22, .184, .122, .008, 2.4), (1.29, .198, .116, .004, 2.4), (1.34, .172, .100, -.002, 2.2), (1.38, .112, .082, -.004, 2.1),
         (1.41, .072, .067, -.002, 2.0), (1.435, .066, .063, 0.0, 2.0)]
LEG = [(0.96, .098, .100, 0.0), (0.86, .096, .099, .002), (0.74, .092, .094, .002), (0.62, .081, .085, .003), (0.52, .066, .070, .004), (0.47, .056, .062, .005),
       (0.435, .056, .062, .006), (0.40, .057, .064, .002), (0.34, .062, .072, -.010), (0.27, .052, .060, -.006), (0.18, .040, .045, -.002), (0.11, .033, .038, 0.0), (0.06, .033, .038, 0.0)]
ARM = [(1.405, .020, .022, 0.0), (1.395, .033, .036, 0.0), (1.385, .043, .046, 0.0), (1.31, .053, .056, 0.0), (1.25, .049, .052, .002), (1.18, .045, .048, .002), (1.10, .041, .044, .001), (1.04, .037, .041, 0.0),
       (0.98, .039, .041, .002), (0.90, .034, .037, .001), (0.83, .028, .032, 0.0), (0.785, .0255, .030, 0.0)]
ARM = [(y, rx * (1.08 if y < 1.39 else 1.0), rz * (1.08 if y < 1.39 else 1.0), zc) for (y, rx, rz, zc) in ARM]


class Sport:
    def __init__(self, name):
        self.name = name
        if name == 'soccer':
            self.shorts_hem, self.shorts_flare = 0.615, 0.020
            self.sleeve_hem = 1.135
            self.sock_top = 0.395
            self.shoe_top = 0.092; self.sole_h = 0.011; self.studs = True
            self.num_front_h = 0.0; self.num_back_h = 0.115
        else:
            self.shorts_hem, self.shorts_flare = 0.53, 0.022
            self.sleeve_hem = None
            self.sock_top = None
            self.shoe_top = 0.142; self.sole_h = 0.028; self.studs = False
            self.num_front_h = 0.105; self.num_back_h = 0.125


def build_body(sport_name, broad=0.0, quality=1.0):
    sp = Sport(sport_name)
    m = Mesh()
    kb = 1 + 0.07 * broad            # limb thickness
    ka = 1.02 + 0.05 * broad         # torso width
    kd = 1.07 + 0.07 * broad         # torso depth

    # ---- torso (pelvis, waist, chest, shoulders), shorts up to the jersey hem, jersey above ----
    NT = 24
    hem = 0.905
    ys = [0.78, 0.82, 0.86, 0.895, 'lip', 0.95, 1.00, 1.06, 1.12, 1.17, 1.20, 1.23, 1.26, 1.29, 1.32, 1.35, 1.375, 1.40, 1.432]
    rings = []; hints = []
    for y in ys:
        if y == 'lip':
            yy = hem; a, b, zc, n = interp_table(TORSO, yy); fl = 0.011
            rings.append(dict(c=(0, yy, zc), a=(a + fl) * ka, b=(b + fl) * kd, n=n)); hints.append(R_SHIRT); continue
        a, b, zc, n = interp_table(TORSO, y)
        if y <= 0.895:
            a -= 0.006; b -= 0.006
            hints.append(R_SHORTS)
        else:
            a += 0.004; b += 0.004
            hints.append(R_SHIRT)
        rings.append(dict(c=(0, y, zc), a=a * ka, b=b * kd, n=n))
    torso_first = len(m.T)

    def sleeveless_margin(x, y, z):
        """> 0 inside the jersey: the armholes cut in from the side seam, the straps are 4 cm wide; the top of the torso loft is the neckline."""
        xe = float(pchip([1.15, 1.22, 1.28, 1.33, 1.37, 1.41], [0.205, 0.178, 0.160, 0.146, 0.132, 0.120], y)) if y > 1.15 else 1
        return xe - abs(x)

    def torso_region(i, k, cen):
        base = hints[i + 1]
        x, y, z = cen
        if base == R_SHORTS: return R_SHORTS
        if y > 1.388 and sp.name == 'soccer': return R_TRIM  # collar
        if sp.name == 'hoops':
            mg = sleeveless_margin(x, y, z)
            return R_SHIRT
        if abs(x) > 0.150 and y < 1.18 and False: return R_TRIM
        return R_SHIRT
    add_lofts(m, rings, NT, torso_region, lambda p: wkeys(p[1], W_SPINE), cap_start=R_SHORTS)
    m.torso_end = len(m.T)

    # ---- neck ----
    nrings = []
    for y in [1.385, 1.43, 1.47, 1.51, 1.555]:
        nrings.append(dict(c=(0, y, 0.004 + (y - 1.385) * 0.03), a=0.057 * kb, b=0.059 * kb, n=2.0))
    add_lofts(m, nrings, 12, lambda i, k, c: R_SKIN, lambda p: wkeys(p[1], [(1.385, {'Chest': 0.5, 'Neck': 0.5}), (1.43, {'Neck': 1}), (1.47, {'Neck': 1}), (1.55, {'Head': 1})]))

    # ---- head, ears, face ----
    hw = lambda p: w_head(p[1])
    head_surface(m, hw)
    ears(m, lambda p: {'Head': 1.0})
    face_features(m, lambda p: {'Head': 1.0}, sport_name)

    # ---- legs ----
    for side, sgn in (('Left', 1), ('Right', -1)):
        cx = 0.10 * sgn
        yk = []
        ys_leg = [0.96, 0.90, 0.84, 0.78, 0.70, 0.62, 0.55, 0.50, 0.47, 0.44, 0.405, 0.37, 0.33, 0.28, 0.23, 0.18, 0.14, 0.11, 0.085, 0.065]
        hem_y = sp.shorts_hem
        # build ring list with the hem lip
        rl = []
        for y in sorted(set(ys_leg + [hem_y + 0.0]), reverse=True):
            rx, rz, zc = interp_table([(t[0], t[1], t[2], t[3]) for t in LEG], y)
            rx *= kb * (1.07 if y > 0.2 else 1.0); rz *= kb * (1.07 if y > 0.2 else 1.0)
            if y > hem_y:
                g = 0.010 + (sp.shorts_flare - 0.010) * smooth01((0.92 - y) / (0.92 - hem_y))
                rl.append(dict(c=(cx, y, zc), a=rx + g, b=rz + g, n=2.0, kind='shorts'))
            elif y == hem_y:
                g = sp.shorts_flare
                rl.append(dict(c=(cx, y, zc), a=rx + g, b=rz + g, n=2.0, kind='shorts'))
                rl.append(dict(c=(cx, y - 0.003, zc), a=rx + g * 0.45, b=rz + g * 0.45, n=2.0, kind='hemlip'))
                rl.append(dict(c=(cx, y - 0.003, zc), a=rx, b=rz, n=2.0, kind='skin'))
            else:
                if sp.sock_top and y <= sp.sock_top:
                    rl.append(dict(c=(cx, y, zc), a=rx + 0.0035, b=rz + 0.004, n=2.0, kind='sock'))
                else:
                    rl.append(dict(c=(cx, y, zc), a=rx, b=rz, n=2.0, kind='skin'))
        # keep order top -> bottom
        def region_leg(i, k, cen, rl=rl, sgn=sgn):
            kind = rl[i + 1]['kind']
            if kind == 'shorts': return R_SHORTS
            if kind == 'hemlip': return R_SHORTS
            if kind == 'sock':
                y = cen[1]
                return R_TRIM if y > sp.sock_top - 0.034 else R_SOCK
            return R_SKIN
        add_lofts(m, rl, 16, region_leg, lambda p, s=side: w_leg(s, p[1]))
        # side stripe on the shorts: the outer column of faces
        # (regions are per face: recolour the faces whose centroid is on the outer side and above the hem)
    # ---- arms ----
    for side, sgn in (('Left', 1), ('Right', -1)):
        cx = 0.162 * sgn
        rl = []
        for (y, rx, rz, zc) in ARM:
            rl.append(dict(c=(cx, y, zc), a=rx * kb, b=rz * kb, n=2.0, kind='skin'))
        if sp.sleeve_hem is not None:
            rl = []
            yh = sp.sleeve_hem
            for y in [1.405, 1.395, 1.385, 1.31, 1.25, 1.19, yh]:
                rx, rz, zc = interp_table(ARM, y)
                rl.append(dict(c=(cx, y, zc), a=(rx + 0.012) * kb, b=(rz + 0.012) * kb, n=2.0, kind='shirt'))
            rl[-1]['kind'] = 'shirt'
            rx, rz, zc = interp_table(ARM, yh)
            rl.append(dict(c=(cx, yh - 0.0025, zc), a=(rx + 0.008) * kb, b=(rz + 0.008) * kb, n=2.0, kind='trim'))
            rl.append(dict(c=(cx, yh - 0.0025, zc), a=rx * kb, b=rz * kb, n=2.0, kind='lip'))
            for y in [1.10, 1.04, 0.98, 0.90, 0.83, 0.785]:
                rx, rz, zc = interp_table(ARM, y)
                rl.append(dict(c=(cx, y, zc), a=rx * kb, b=rz * kb, n=2.0, kind='skin'))
        # smooth shoulder cap: add the top ring above the shoulder as a rounded dome
        def region_arm(i, k, cen, rl=rl):
            kind = rl[i + 1]['kind']
            return {'shirt': R_SHIRT, 'trim': R_TRIM, 'lip': R_TRIM, 'skin': R_SKIN}[kind]
        add_lofts(m, rl, 14, region_arm, lambda p, s=side: w_arm(s, p[1]), cap_start=R_SKIN if sp.sleeve_hem is None else R_SHIRT)
        hand(m, sgn)
    # shoes
    for side, sgn in (('Left', 1), ('Right', -1)):
        shoe(m, side, sgn, sp)
    return m, sp


# ---------------------------------------------------------------------------------------------------------------------------------
# shoes
# ---------------------------------------------------------------------------------------------------------------------------------
def shoe(m, side, sgn, sp):
    bone = side + 'Foot'; cx = 0.10 * sgn
    wf = lambda p: {bone: 1.0}
    top = sp.shoe_top; hi = sp.name == 'hoops'
    base = 0.0051 + (0.0115 if sp.studs else 0.0)
    ytop_ball = 0.040 if not hi else 0.062
    # stations: z, top y, half width, width centre offset
    st = [(-0.072, 0.056 + (top - 0.092) * .5, 0.026), (-0.062, top - 0.012, 0.034), (-0.040, top, 0.040), (-0.012, top, 0.044), (0.016, top - 0.010 - (0.010 if hi else 0), 0.046),
          (0.050, 0.066 if not hi else 0.095, 0.054), (0.090, 0.050 if not hi else 0.074, 0.056), (0.135, ytop_ball, 0.0505 if not hi else 0.056), (0.175, 0.034 if not hi else 0.040, 0.047),
          (0.205, 0.027 if not hi else 0.032, 0.038), (0.224, 0.020, 0.026)]
    N = 14
    rows = []
    ids = []
    sole_y = base + sp.sole_h
    for z, yt, hw_ in st:
        row = []
        yb = base
        for k in range(N):
            th = 2 * math.pi * k / N
            s, co = math.sin(th), math.cos(th)
            nn = 3.2
            sx = math.copysign(abs(s) ** (2 / nn), s); sy = math.copysign(abs(co) ** (2 / nn), co)
            yc = (yt + yb) / 2; hh = (yt - yb) / 2
            p = np.array([cx + hw_ * sx, yc + hh * sy, z])
            row.append(m.vert(p, wf(p), 0))
        ids.append(row)
    first = len(m.T)
    lower = {k for k in range(N) if math.cos(2 * math.pi * (k + 0.5) / N) < -0.15}
    for i in range(len(st) - 1):
        for k in range(N):
            k2 = (k + 1) % N
            A, B, C, D = ids[i][k], ids[i][k2], ids[i + 1][k2], ids[i + 1][k]
            cen = (m.P[A] + m.P[B] + m.P[C] + m.P[D]) / 4
            if cen[1] < sole_y and (k % N) in lower: reg = R_SOLE
            elif hi and cen[1] > top - 0.017 and cen[2] < 0.02: reg = R_TRIM
            else: reg = R_SHOE
            m.tri(A, B, C, reg); m.tri(A, C, D, reg)
    # caps: heel and toe
    for ri, up in ((0, False), (len(st) - 1, True)):
        r = ids[ri]; c = np.mean([m.P[i] for i in r], axis=0)
        dup = [m.vert(m.P[i], wf(m.P[i]), 0) for i in r]; cv = m.vert(c, wf(c), 0)
        for k in range(N):
            m.tri(cv, dup[k], dup[(k + 1) % N], R_SHOE)
    orient_tris(m, first, np.array([cx, 0.05, 0.08]))
    # laces: small light bars across the instep
    zlist = [0.012, 0.034, 0.056, 0.078, 0.100]
    for z in zlist:
        # top surface height of the shoe at z
        zs = [s[0] for s in st]; yt = float(pchip(zs, [s[1] for s in st], z)); hw_ = float(pchip(zs, [s[2] for s in st], z))
        yb = base; yc = (yt + yb) / 2; hh = (yt - yb) / 2
        for sg in (0,):
            pts = []
            for x in (-0.017, 0.017):
                u = x / hw_; sy = (1 - min(0.999, abs(u) ** 3.2)) ** (1 / 3.2)
                pts.append((cx + x, yc + hh * sy + 0.0014, z))
            a = m.vert((pts[0][0], pts[0][1], z - 0.0045), wf(pts[0]), 0); b = m.vert((pts[1][0], pts[1][1], z - 0.0045), wf(pts[1]), 0)
            c = m.vert((pts[1][0], pts[1][1], z + 0.0045), wf(pts[1]), 0); d = m.vert((pts[0][0], pts[0][1], z + 0.0045), wf(pts[0]), 0)
            f0 = len(m.T)
            m.tri(a, b, c, R_LACE); m.tri(a, c, d, R_LACE)
            orient_tris(m, f0, np.array([cx, yb, z]))
    # studs under the sole (boots)
    if sp.studs:
        for z, dx in ((-0.045, -0.02), (-0.045, 0.02), (0.030, -0.025), (0.030, 0.025), (0.095, -0.028), (0.095, 0.028)):
            x = cx + dx
            top_ = base + 0.0006; bot = 0.0051
            f0 = len(m.T)
            tops = []; bots = []
            for k in range(4):
                a = 2 * math.pi * k / 4
                tops.append(m.vert((x + 0.0085 * math.cos(a), top_, z + 0.0085 * math.sin(a)), wf((0, 0, 0)), 0))
                bots.append(m.vert((x + 0.0050 * math.cos(a), bot, z + 0.0050 * math.sin(a)), wf((0, 0, 0)), 0))
            for k in range(4):
                k2 = (k + 1) % 4
                m.tri(tops[k], tops[k2], bots[k2], R_SOLE); m.tri(tops[k], bots[k2], bots[k], R_SOLE)
            cb = m.vert((x, bot, z), wf((0, 0, 0)), 0)
            for k in range(4): m.tri(cb, bots[k], bots[(k + 1) % 4], R_SOLE)
            orient_tris(m, f0, np.array([x, base + 0.02, z]) * np.array([1, 1, 1]) * 1.0 + np.array([0, 0.0, 0]))


# ---------------------------------------------------------------------------------------------------------------------------------
# numbers: seven-segment digits on the jersey as geometry (painted per player)
# ---------------------------------------------------------------------------------------------------------------------------------
SEGS = {'a': (0, 1, 1, 1), 'b': (1, 1, 1, 0), 'c': (1, 0, 0, 0), 'd': (0, 0, 1, 0)}   # unused (kept for readability)


def segment_rects(w, h, t):
    """segment name -> (x0, x1, y0, y1) in the cell of a digit (x right, y up), a..g"""
    return [(0, w, h - t, h), (w - t, w, h / 2, h), (w - t, w, 0, h / 2), (0, w, 0, t), (0, t, 0, h / 2), (0, t, h / 2, h), (0, w, h / 2 - t / 2, h / 2 + t / 2)]


def raycast_z(P, tris, x, y, front):
    best = None
    for a, b, c in tris:
        pa, pb, pc = P[a], P[b], P[c]
        d = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1])
        if abs(d) < 1e-12: continue
        u = ((x - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (y - pa[1])) / d
        v = ((pb[0] - pa[0]) * (y - pa[1]) - (x - pa[0]) * (pb[1] - pa[1])) / d
        if u < -1e-9 or v < -1e-9 or u + v > 1 + 1e-9: continue
        z = pa[2] + u * (pb[2] - pa[2]) + v * (pc[2] - pa[2]); w = (1 - u - v, u, v)
        if best is None or (front and z > best[0]) or (not front and z < best[0]): best = (z, (a, b, c), w)
    return best


def add_numbers(m, sp, N, torso_range):
    """adds 2 placements (front, back) x 3 slots (single, tens, ones) x 7 segments. Vertices carry seg = placement*21 + slot*7 + seg + 1, region shirt (the game switches them to trim)."""
    P = np.array(m.P)
    tris = [(a, b, c) for a, b, c, r in m.T[torso_range[0]:torso_range[1]] if r != R_SKIN]
    # only shirt faces around the chest
    tris = [t for t in tris if 0.95 < (P[t[0]][1] + P[t[1]][1] + P[t[2]][1]) / 3 < 1.40 and abs((P[t[0]][0] + P[t[1]][0] + P[t[2]][0]) / 3) < 0.19]
    placements = []
    if sp.num_front_h > 0: placements.append(('front', sp.num_front_h, 1.20))
    placements.append(('back', sp.num_back_h, 1.185))
    for pi, (name, h, yc) in enumerate(placements):
        front = name == 'front'
        w = h * 0.56; t = h * 0.15; gap = h * 0.14
        layouts = {0: [-w / 2], 1: [-(w + gap / 2)], 2: [gap / 2]}  # x of the cell's left edge, in reading order
        for slot, (x0,) in ((0, layouts[0]), (1, layouts[1]), (2, layouts[2])):
            for si, (ax0, ax1, ay0, ay1) in enumerate(segment_rects(w, h, t)):
                seg = (0 if front else 1) * 21 + slot * 7 + si + 1
                nx = max(1, round((ax1 - ax0) / 0.026)); ny = max(1, round((ay1 - ay0) / 0.026))
                gid = {}
                def corner(i, j):
                    if (i, j) in gid: return gid[(i, j)]
                    xr = x0 + ax0 + (ax1 - ax0) * i / nx
                    X = xr if front else -xr
                    Y = yc - h / 2 + ay0 + (ay1 - ay0) * j / ny
                    hit = raycast_z(P, tris, X, Y, front)
                    if hit is None: hit = raycast_z(P, tris, X * 0.9, Y, front)
                    if hit is None: gid[(i, j)] = None; return None
                    z, (a, b, c), bw = hit
                    nn = (m.PN[a] * bw[0] + m.PN[b] * bw[1] + m.PN[c] * bw[2]); nn = nn / (np.linalg.norm(nn) or 1)
                    v = m.vert(np.array([X, Y, z]) + nn * 0.0032, wkeys(Y, W_SPINE), seg); m.PN[v] = nn
                    gid[(i, j)] = v; return v
                for i in range(nx):
                    for j in range(ny):
                        q = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)]
                        if None in q: continue
                        f0 = len(m.T)
                        m.tri(q[0], q[1], q[2], R_SHIRT); m.tri(q[0], q[2], q[3], R_SHIRT)
                        tt = m.T[f0]; nn_ = np.cross(m.P[tt[1]] - m.P[tt[0]], m.P[tt[2]] - m.P[tt[0]])
                        if np.dot(nn_, m.PN[q[0]]) < 0:
                            for k in range(f0, len(m.T)):
                                a, b, c, r = m.T[k]; m.T[k] = (a, c, b, r)


def add_crest(m, sp, torso_range):
    """small generic team mark on the left chest (soccer): a plain shield placeholder in the trim colour, no brand."""
    if sp.name != 'soccer': return
    P = np.array(m.P)
    tris = [(a, b, c) for a, b, c, r in m.T[torso_range[0]:torso_range[1]] if r == R_SHIRT and 0.95 < P[a][1] < 1.40]
    cx, cy = 0.072, 1.225; w = 0.020; h = 0.026
    outline = [(-w, h * .5), (w, h * .5), (w, -h * .1), (0, -h * .6), (-w, -h * .1)]
    ids = []
    for (x, y) in outline + [(0, 0)]:
        hit = raycast_z(P, tris, cx + x, cy + y, True)
        if hit is None: return
        z, (a, b, c), bw = hit
        nn = m.PN[a] * bw[0] + m.PN[b] * bw[1] + m.PN[c] * bw[2]; nn = nn / np.linalg.norm(nn)
        p = np.array([cx + x, cy + y, z]) + nn * 0.0022
        i = m.vert(p, wkeys(p[1], W_SPINE), 0); m.PN[i] = nn; ids.append(i)
    f0 = len(m.T)
    for k in range(5): m.tri(ids[5], ids[k], ids[(k + 1) % 5], R_TRIM)
    for j in range(f0, len(m.T)):
        a, b, c, r = m.T[j]
        n_ = np.cross(m.P[b] - m.P[a], m.P[c] - m.P[a])
        if n_[2] < 0: m.T[j] = (a, c, b, r)


# ---------------------------------------------------------------------------------------------------------------------------------
# hair
# ---------------------------------------------------------------------------------------------------------------------------------
HAIR_STYLES = ['buzz', 'crop', 'side-part', 'quiff', 'curls', 'afro', 'swept-back', 'bun']


def hair_mesh(style):
    m = Mesh()
    hw = lambda p: {'Head': 1.0}
    cols = 30 if style != 'curls' else 36
    rows = 9
    # per style: hairline (v) as a function of th (0 front, pi back), thickness, extra
    def hairline(th):
        a = abs(((th + math.pi) % (2 * math.pi)) - math.pi)   # 0 front .. pi back
        front, side, back = {'buzz': (0.74, 0.62, 0.50), 'crop': (0.69, 0.62, 0.48), 'side-part': (0.70, 0.60, 0.48), 'quiff': (0.73, 0.62, 0.48),
                             'curls': (0.69, 0.58, 0.42), 'afro': (0.68, 0.50, 0.30), 'swept-back': (0.77, 0.60, 0.40), 'bun': (0.76, 0.62, 0.50)}[style]
        t = a / math.pi
        if t < 0.5: return front + (side - front) * smooth01(t / 0.5)
        return side + (back - side) * smooth01((t - 0.5) / 0.5)
    T = {'buzz': 0.0045, 'crop': 0.010, 'side-part': 0.013, 'quiff': 0.012, 'curls': 0.014, 'afro': 0.040, 'swept-back': 0.012, 'bun': 0.011}[style]
    cen = np.array([0, HD['cy'], HD['cz']])
    grid = []
    for k in range(cols):
        th = 2 * math.pi * k / cols
        col = []
        v0 = hairline(th)
        for j in range(rows + 1):
            t = j / rows
            v = v0 + (0.985 - v0) * t
            p = head_pt(th, v); n = head_normal(th, v)
            thick = 0.0016 + (T - 0.0016) * smooth01(t * 1.6)
            extra = np.zeros(3)
            ta = th if th <= math.pi else th - 2 * math.pi
            if style == 'quiff': extra += np.array([0, 0.020, 0.024]) * gauss(ta / 0.55) * smooth01((v - 0.74) / 0.12) * max(0, 1 - (v - 0.95) * 6)
            if style == 'side-part': extra += np.array([0.010 * (1 if ta > 0 else -1) * 0, 0.0, 0.0]) + np.array([0, 0.008, 0.012]) * gauss((ta - 0.5) / 0.6) * smooth01((v - 0.72) / 0.12)
            if style == 'swept-back': extra += np.array([0, 0.004, -0.014]) * smooth01((abs(ta) - 1.2) / 0.8) * smooth01((v - 0.35) / 0.2)
            if style == 'curls': thick += 0.007 * math.sin(7 * th + 2) * math.sin(11 * v) * smooth01(t * 2)
            if style == 'afro':
                q = p - cen; thick += 0.012 * math.sin(6 * th) * math.sin(9 * v) * smooth01(t * 2)
                extra += q * 0.0 + (q / (np.linalg.norm(q) or 1)) * 0.018 * smooth01(t * 1.5)
            q = p + n * thick + extra
            col.append(m.vert(q, hw(q), 0))
        grid.append(col)
    first = len(m.T)
    for k in range(cols):
        k2 = (k + 1) % cols
        for j in range(rows):
            A, B, C, D = grid[k][j], grid[k2][j], grid[k2][j + 1], grid[k][j + 1]
            m.tri(A, B, C, R_HAIR); m.tri(A, C, D, R_HAIR)
    # crown fan
    top = np.array([0, HD['cy'] + HD['ry'] + T + (0.02 if style == 'quiff' else 0.0) + (0.020 if style == 'afro' else 0), HD['cz']])
    cv = m.vert(top, hw(top), 0)
    for k in range(cols):
        k2 = (k + 1) % cols
        m.tri(cv, grid[k2][rows], grid[k][rows], R_HAIR)
    orient_tris(m, first, cen)
    if style == 'bun':
        bc = np.array([0, 1.742, -0.064]); rings = []
        for dy, r in [(-0.026, 0.020), (-0.012, 0.031), (0.004, 0.036), (0.020, 0.031), (0.032, 0.018), (0.038, 0.006)]:
            rings.append(dict(c=(bc[0], bc[1] + dy, bc[2]), a=r, b=r, n=2.0))
        add_lofts(m, rings, 12, lambda i, k, c: R_HAIR, hw, cap_start=R_HAIR, cap_end=R_HAIR)
    return m


# ---------------------------------------------------------------------------------------------------------------------------------
# glb writer
# ---------------------------------------------------------------------------------------------------------------------------------
def read_template():
    b = open(TEMPLATE, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl]); bl = struct.unpack('<I', b[20 + jl:24 + jl])[0]
    binary = b[28 + jl:28 + jl + bl]
    a = j['accessors'][j['skins'][0]['inverseBindMatrices']]; bv = j['bufferViews'][a['bufferView']]
    ibm = binary[bv['byteOffset']:bv['byteOffset'] + 18 * 64]
    return j, ibm


def pack_glb(json_obj, binary):
    js = json.dumps(json_obj, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    binary += b'\0' * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    return struct.pack('<4sII', b'glTF', 2, total) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binary), b'BIN\0') + binary


class Bin:
    def __init__(self): self.data = bytearray(); self.views = []; self.acc = []
    def view(self, raw, stride=None, target=None):
        while len(self.data) % 4: self.data.append(0)
        off = len(self.data); self.data += raw
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(raw)}
        if stride: v['byteStride'] = stride
        if target: v['target'] = target
        self.views.append(v); return len(self.views) - 1
    def accessor(self, view, ctype, count, typ, minmax=None, normalized=False):
        a = {'bufferView': view, 'componentType': ctype, 'count': count, 'type': typ}
        if normalized: a['normalized'] = True
        if minmax: a['min'], a['max'] = minmax
        self.acc.append(a); return len(self.acc) - 1


def finalize(m, sp, shape_delta=None, kind='body'):
    """expand to (vertex, region) pairs; returns the arrays"""
    N = m.PN_all if hasattr(m, 'PN_all') else None
    nrm = m.normals()
    for i, n in m.PN.items(): nrm[i] = n
    keys = {}; order = []
    for a, b, c, r in m.T:
        for v in (a, b, c):
            if (v, r) not in keys: keys[(v, r)] = len(order); order.append((v, r))
    idx = np.array([[keys[(a, r)], keys[(b, r)], keys[(c, r)]] for a, b, c, r in m.T], dtype=np.uint32)
    P = np.array(m.P)
    pos = np.array([P[v] for v, r in order], np.float32)
    nor = np.array([nrm[v] for v, r in order], np.float32)
    reg = np.array([r for v, r in order], np.uint8)
    seg = np.array([m.S[v] for v, r in order], np.uint8)
    col = np.array([lin(BAKED[r]) for v, r in order], np.float32)
    joints = np.zeros((len(order), 4), np.uint8); weights = np.zeros((len(order), 4), np.float32)
    for i, (v, r) in enumerate(order):
        w = m.W[v]; items = sorted(((BI[k], x) for k, x in w.items() if x > 1e-4), key=lambda t: -t[1])[:4]
        s = sum(x for _, x in items) or 1
        for j, (b, x) in enumerate(items): joints[i, j] = b; weights[i, j] = x / s
    return dict(pos=pos, nor=nor, reg=reg, seg=seg, col=col, joints=joints, weights=weights, idx=idx, order=order)


def q8w(weights):
    q = np.round(weights * 255).astype(np.int32)
    for i in range(len(q)):
        d = 255 - q[i].sum()
        q[i, int(np.argmax(weights[i]))] += d
    return q.astype(np.uint8)


def q8n(n):
    out = np.zeros((len(n), 4), np.int8); out[:, :3] = np.clip(np.round(n * 127), -127, 127).astype(np.int8); return out


def write_body_glb(path, data, tmpl, ibm, height_m, name, morph=None, extras=None):
    pos = data['pos']
    ymin = float(pos[:, 1].min()); ymax = float(pos[:, 1].max()); canon_h = ymax - ymin
    scale = height_m / canon_h
    b = Bin()
    j = {'asset': {'version': '2.0', 'generator': 'athlete-body-v3 CC0 procedural builder', 'copyright': 'CC0-1.0; original fictional anatomy and sportswear, no brand marks'}}
    nodes = json.loads(json.dumps(tmpl['nodes']))
    nodes[0]['scale'] = [scale] * 3; nodes[0]['translation'] = [0, -ymin * scale, 0]
    nodes[0]['extras'] = {'profile': name, 'statureMeters': height_m, 'canonicalBindUnchanged': True}
    attrs = {}
    n = len(pos)
    attrs['POSITION'] = b.accessor(b.view(pos.tobytes(), target=34962), 5126, n, 'VEC3', [pos.min(axis=0).tolist(), pos.max(axis=0).tolist()])
    attrs['NORMAL'] = b.accessor(b.view(q8n(data['nor']).tobytes(), stride=4, target=34962), 5120, n, 'VEC3', normalized=True)
    attrs['COLOR_0'] = b.accessor(b.view(data['col'].tobytes(), target=34962), 5126, n, 'VEC3')
    attrs['JOINTS_0'] = b.accessor(b.view(data['joints'].tobytes(), target=34962), 5121, n, 'VEC4')
    attrs['WEIGHTS_0'] = b.accessor(b.view(q8w(data['weights']).tobytes(), target=34962), 5121, n, 'VEC4', normalized=True)
    pad = lambda arr: np.stack([arr, np.zeros_like(arr), np.zeros_like(arr), np.zeros_like(arr)], axis=1).astype(np.uint8)
    attrs['_REGION'] = b.accessor(b.view(pad(data['reg']).tobytes(), stride=4, target=34962), 5121, n, 'SCALAR')
    attrs['_SEG'] = b.accessor(b.view(pad(data['seg']).tobytes(), stride=4, target=34962), 5121, n, 'SCALAR')
    ia = b.accessor(b.view(data['idx'].astype(np.uint16).tobytes(), target=34963), 5123, data['idx'].size, 'SCALAR')
    prim = {'attributes': attrs, 'indices': ia, 'material': 0, 'mode': 4}
    mesh = {'name': 'athlete-body-v3', 'primitives': [prim], 'extras': {'regions': {'skin': 0, 'shirt': 1, 'shorts': 2, 'trim': 3, 'shoe_upper': 4, 'shoe_sole': 5, 'eyes': 6, 'hair': 7, 'sock': 8, 'iris': 9, 'mouth': 10, 'pupil': 11, 'highlight': 12, 'laces': 13}}}
    if morph is not None:
        d = morph.astype(np.float32)
        mt = b.accessor(b.view(d.tobytes(), target=34962), 5126, n, 'VEC3', [d.min(axis=0).tolist(), d.max(axis=0).tolist()])
        prim['targets'] = [{'POSITION': mt}]
        mesh['weights'] = [0]; mesh['extras']['targetNames'] = ['broad']
    ibma = b.accessor(b.view(ibm), 5126, 18, 'MAT4')
    nodes.append({'name': 'athlete-body', 'mesh': 0, 'skin': 0})
    j.update({'scene': 0, 'scenes': [{'nodes': [0, len(nodes) - 1]}], 'nodes': nodes, 'meshes': [mesh],
              'skins': [{'name': 'canonical18', 'skeleton': 1, 'joints': list(range(1, 19)), 'inverseBindMatrices': ibma}],
              'materials': [{'name': 'athlete_shared', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 0.88}}],
              'accessors': b.acc, 'bufferViews': b.views, 'buffers': [{'byteLength': len(b.data) + (4 - len(b.data) % 4) % 4}]})
    j['extras'] = {'license': 'CC0-1.0', 'profile': name, 'statureMeters': height_m, 'canonicalHeightMeters': canon_h, 'canonicalFloorY': ymin, **(extras or {})}
    open(path, 'wb').write(pack_glb(j, bytes(b.data)))
    return dict(canonicalHeightMeters=canon_h, canonicalFloorY=ymin, scale=scale, vertices=n, triangles=len(data['idx']), bytes=os.path.getsize(path))


def write_hair_glb(path, data, style):
    b = Bin(); n = len(data['pos']); pos = data['pos'].copy(); pos[:, 1] -= 1.47   # Head-local: the Head joint is at y = 1.47
    attrs = {'POSITION': b.accessor(b.view(pos.tobytes(), target=34962), 5126, n, 'VEC3', [pos.min(axis=0).tolist(), pos.max(axis=0).tolist()]),
             'NORMAL': b.accessor(b.view(q8n(data['nor']).tobytes(), stride=4, target=34962), 5120, n, 'VEC3', normalized=True),
             'COLOR_0': b.accessor(b.view(data['col'].tobytes(), target=34962), 5126, n, 'VEC3')}
    pad = lambda arr: np.stack([arr, np.zeros_like(arr), np.zeros_like(arr), np.zeros_like(arr)], axis=1).astype(np.uint8)
    attrs['_REGION'] = b.accessor(b.view(pad(data['reg']).tobytes(), stride=4, target=34962), 5121, n, 'SCALAR')
    ia = b.accessor(b.view(data['idx'].astype(np.uint16).tobytes(), target=34963), 5123, data['idx'].size, 'SCALAR')
    j = {'asset': {'version': '2.0', 'generator': 'athlete-body-v3 CC0 procedural builder', 'copyright': 'CC0-1.0; original fictional hairstyle geometry'},
         'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'hair-' + style, 'mesh': 0, 'extras': {'attachmentBone': 'Head', 'localSpace': 'canonical Head joint (world minus 1.47 m up)'}}],
         'meshes': [{'name': 'hair-' + style, 'primitives': [{'attributes': attrs, 'indices': ia, 'material': 0}]}],
         'materials': [{'name': 'athlete_shared', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 0.88}}],
         'accessors': b.acc, 'bufferViews': b.views, 'buffers': [{'byteLength': len(b.data) + (4 - len(b.data) % 4) % 4}]}
    open(path, 'wb').write(pack_glb(j, bytes(b.data)))
    return os.path.getsize(path)


def full_body(sport, broad):
    m, sp = build_body(sport, broad)
    nrm = m.normals()
    for i in range(len(nrm)): m.PN[i] = nrm[i]
    add_numbers(m, sp, 24, (0, m.torso_end))
    add_crest(m, sp, (0, m.torso_end))
    return m, sp


def main():
    os.makedirs(os.path.join(OUT, 'models'), exist_ok=True); os.makedirs(os.path.join(OUT, 'hair'), exist_ok=True)
    tmpl, ibm = read_template()
    manifest = {'schemaVersion': 1, 'version': 'athlete-body-v3', 'license': 'CC0-1.0', 'models': [], 'hair': [],
                'regions': {'skin': 0, 'shirt': 1, 'shorts': 2, 'trim': 3, 'shoe_upper': 4, 'shoe_sole': 5, 'eyes': 6, 'hair': 7, 'sock': 8, 'iris': 9, 'mouth': 10, 'pupil': 11, 'highlight': 12, 'laces': 13},
                'segEncoding': '_SEG uint8: 0 none; 1..42 = placement(0 front, 1 back)*21 + slot(0 single, 1 tens, 2 ones)*7 + segment(a..g) + 1; 100 = hand (keeper gloves)'}
    for name, sport, h in (('soccer', 'soccer', 1.8), ('hoops', 'hoops', 1.94)):
        m, sp = full_body(sport, 0.0)
        data = finalize(m, sp)
        morph = None
        if sport == 'hoops':
            m2, _ = full_body('hoops', 1.0)
            assert len(m2.T) == len(m.T)
            m2.T = [(a, b, c, r0) for (a, b, c, _), (_, _, _, r0) in zip(m2.T, m.T)]   # same faces, same colour regions: the morph is a pure position delta
            d2 = finalize(m2, sp)
            assert len(d2['pos']) == len(data['pos']), (len(d2['pos']), len(data['pos']))
            morph = d2['pos'] - data['pos']
        info = write_body_glb(os.path.join(OUT, 'models', name + '.glb'), data, tmpl, ibm, h, name, morph)
        info.update(sha256=hashlib.sha256(open(os.path.join(OUT, 'models', name + '.glb'), 'rb').read()).hexdigest(), id=name, path='models/' + name + '.glb', heightMeters=h, morphs=['broad'] if morph is not None else [])
        manifest['models'].append(info); print(name, info)
    for style in HAIR_STYLES:
        hm = hair_mesh(style)
        d = finalize(hm, None)
        size = write_hair_glb(os.path.join(OUT, 'hair', style + '.glb'), d, style)
        manifest['hair'].append(dict(id=style, path='hair/' + style + '.glb', triangles=len(d['idx']), vertices=len(d['pos']), bytes=size, sha256=hashlib.sha256(open(os.path.join(OUT, 'hair', style + '.glb'), 'rb').read()).hexdigest())); print('hair', style, size, len(d['idx']))
    json.dump(manifest, open(os.path.join(OUT, 'body-manifest.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
