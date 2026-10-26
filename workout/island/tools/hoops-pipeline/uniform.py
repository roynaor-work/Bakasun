"""Basketball uniform built from the player's own body surface.

The jersey and the shorts are cut out of a copy of the body along smooth contour lines
(neckline, armholes, hems), so their skin weights match the body exactly. The jersey hangs
straight down from the chest (drape) and is tucked under the shorts' waistband; the shorts are
baggy and widen to the hem. Each piece gets a turned-in hem, a front/back UV layout for team
colours and numbers, and a vertex colour: R = trim band strength (continuous distance to the
edge, the shader sharpens it), G = waistband. Body faces hidden under the uniform are removed.
"""
import bpy, bmesh, heapq
from mathutils import Vector


def _bone(rig, name):
    b = rig.data.bones[name]
    return rig.matrix_world @ b.head_local


def _group_weight(obj, v, pred):
    s = 0.0
    for g in v.groups:
        if pred(obj.vertex_groups[g.group].name):
            s += g.weight
    return s


def _is_arm(n):
    return ('Arm' in n or 'Hand' in n) and 'Shoulder' not in n


def _cut(bm, field):
    val = {v: field(v.co) for v in bm.verts}
    new_verts = set()
    for e in list(bm.edges):
        a, b = e.verts
        fa, fb = val[a], val[b]
        if (fa > 0) != (fb > 0) and abs(fa - fb) > 1e-9:
            t = min(0.97, max(0.03, fa / (fa - fb)))
            ne, nv = bmesh.utils.edge_split(e, a, t)
            val[nv] = 0.0
            new_verts.add(nv)
    stats = {'ok': 0, 'fail': 0, 'other': 0}
    for f in list(bm.faces):
        cut = [v for v in f.verts if v in new_verts]
        if len(cut) == 2:
            try:
                bmesh.utils.face_split(f, cut[0], cut[1])
                stats['ok'] += 1
            except ValueError:
                stats['fail'] += 1
        elif len(cut) > 2:
            stats['other'] += 1
    return val


def _largest_island(bm):
    islands, seen = [], set()
    for f in bm.faces:
        if f in seen:
            continue
        stack, isl = [f], []
        seen.add(f)
        while stack:
            g = stack.pop()
            isl.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen:
                        seen.add(h)
                        stack.append(h)
        islands.append(isl)
    islands.sort(key=len, reverse=True)
    for isl in islands[1:]:
        if len(isl) < 0.05 * len(islands[0]):
            bmesh.ops.delete(bm, geom=isl, context='FACES')


def _edge_distance(bm, sources):
    dist = {v: 1e9 for v in bm.verts}
    heap = []
    for v in sources:
        dist[v] = 0.0
        heapq.heappush(heap, (0.0, id(v), v))
    while heap:
        d, _, v = heapq.heappop(heap)
        if d > dist[v]:
            continue
        for e in v.link_edges:
            o = e.other_vert(v)
            nd = d + e.calc_length()
            if nd < dist[o]:
                dist[o] = nd
                heapq.heappush(heap, (nd, id(o), o))
    return dist


def _make_piece(body, name, field, offset_fn, uv_fn, exclude, drape=None, band=None, smooth=0):
    me = body.data.copy()
    for attr in list(me.color_attributes):
        me.color_attributes.remove(attr)
    ob = body.copy()
    ob.data = me
    ob.name = name
    bpy.context.collection.objects.link(ob)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    drop = [f for f in bm.faces if any(exclude[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    val = _cut(bm, field)
    out = [f for f in bm.faces if sum(val.get(v, field(v.co)) for v in f.verts) / len(f.verts) < 0]
    bmesh.ops.delete(bm, geom=out, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    _largest_island(bm)
    bm.normal_update()
    rest = {v: v.co.copy() for v in bm.verts}
    for v in bm.verts:
        v.co = v.co + v.normal * offset_fn(rest[v])
    if drape:
        drape(bm, rest)
    inner = [v for v in bm.verts if not v.is_boundary]
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    edge_verts = [v for v in bm.verts if v.is_boundary]
    dist = _edge_distance(bm, edge_verts)
    bedges = [e for e in bm.edges if e.is_boundary]
    bset = set(edge_verts)
    bnorm = {v: v.normal.copy() for v in edge_verts}
    res = bmesh.ops.extrude_edge_only(bm, edges=bedges)
    hem = set(g for g in res['geom'] if isinstance(g, bmesh.types.BMVert))
    for v in hem:
        orig = next((e.other_vert(v) for e in v.link_edges if e.other_vert(v) in bset), None)
        n = bnorm.get(orig) if orig is not None else None
        if n is None or n.length == 0:
            n = Vector((0, 0, 1))
        v.co = (orig.co if orig is not None else v.co) - n.normalized() * 0.012
        dist[v] = 0.0
        rest[v] = v.co.copy()
    bm.normal_update()
    uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new()
    col = bm.loops.layers.color.new('Trim')
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = uv_fn(rest[l.vert], f.normal)
            r, g = band(rest[l.vert], dist[l.vert]) if band else (0.0, 0.0)
            l[col] = (r, g, 0.0, 1.0)
    bm.to_mesh(me)
    bm.free()
    while len(me.uv_layers) > 1:
        me.uv_layers.remove(me.uv_layers[1])
    me.materials.clear()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    me.materials.append(mat)
    return ob


def build(body, rig):
    me = body.data
    W = body.matrix_world
    hips = _bone(rig, 'mixamorig:Hips')
    neck = _bone(rig, 'mixamorig:Neck')
    chest = _bone(rig, 'mixamorig:Spine2')
    knee_z = (_bone(rig, 'mixamorig:LeftLeg').z + _bone(rig, 'mixamorig:RightLeg').z) / 2
    torso = neck.z - hips.z
    waist_z = hips.z + torso * 0.22              # shorts waistband top
    jersey_bottom = waist_z - torso * 0.16       # tucked under the waistband
    shorts_bottom = knee_z + (hips.z - knee_z) * 0.02
    neck_back = neck.z - torso * 0.02
    neck_front = neck.z - torso * 0.15
    chest_z = chest.z + torso * 0.04
    sh_l, sh_r = _bone(rig, 'mixamorig:LeftArm'), _bone(rig, 'mixamorig:RightArm')
    axis_y = hips.y

    def armhole(co, sh):
        side = 1.0 if sh.x > 0 else -1.0
        n = Vector((side, 0.0, 0.42)).normalized()
        p = Vector((sh.x - side * torso * 0.09, 0.0, sh.z - torso * 0.035))
        return -(co - p).dot(n)

    def neckline(co):
        r = min(1.0, abs(co.x) / (torso * 0.30))
        base = neck_front if co.y < axis_y else neck_back
        h = base + (neck.z - torso * 0.03 - base) * (r ** 1.6)
        return h - co.z

    def jersey_field(local):
        co = W @ local
        return min(co.z - jersey_bottom, neckline(co), armhole(co, sh_l), armhole(co, sh_r))

    def shorts_field(local):
        co = W @ local
        return min(co.z - shorts_bottom, waist_z - co.z)

    arm_w = [_group_weight(body, v, _is_arm) for v in me.vertices]
    excl_j = [w > 0.9 for w in arm_w]
    hand_w = [_group_weight(body, v, lambda n: 'Hand' in n or 'ForeArm' in n) for v in me.vertices]
    excl_s = [w > 0.05 for w in hand_w]

    jx = max(abs((W @ v.co).x) for i, v in enumerate(me.vertices) if not excl_j[i] and jersey_field(v.co) > 0)
    sx = max(abs((W @ v.co).x) for i, v in enumerate(me.vertices) if not excl_s[i] and shorts_field(v.co) > 0)

    def uv_fn(lo, hi, half):
        def f(local, n):
            co = W @ local
            u = 0.5 + co.x / (2.1 * half)
            v = (co.z - lo) / (hi - lo)
            front = co.y < axis_y if abs(n.y) < 0.2 else n.y <= 0
            u = u * 0.5 if front else 0.5 + (1 - u) * 0.5
            return (max(0.0, min(1.0, u)), max(0.0, min(1.0, v)))
        return f

    def jersey_off(local):
        co = W @ local
        return 0.010 if co.z > chest_z else 0.014

    def jersey_drape(bm, rest):
        # front and back fall straight down from the chest instead of following the belly
        bins_f, bins_b = {}, {}
        for v in bm.verts:
            co = v.co
            if abs(co.z - chest_z) < 0.05:
                k = round(co.x / 0.03)
                if co.y < axis_y:
                    bins_f[k] = min(bins_f.get(k, 9), co.y)
                else:
                    bins_b[k] = max(bins_b.get(k, -9), co.y)
        for v in bm.verts:
            co = v.co
            if co.z >= chest_z:
                continue
            t = min(1.0, (chest_z - co.z) / max(0.05, chest_z - jersey_bottom))
            tuck = max(0.0, min(1.0, (co.z - (jersey_bottom + 0.03)) / 0.10))
            k = round(co.x / 0.03)
            if co.y < axis_y and k in bins_f:
                target = bins_f[k] - 0.006
                if target < co.y:
                    co.y = co.y + (target - co.y) * min(1.0, 0.35 + 0.65 * t) * tuck
            elif co.y >= axis_y and k in bins_b:
                target = bins_b[k] + 0.004
                if target > co.y:
                    co.y = co.y + (target - co.y) * min(1.0, 0.25 + 0.5 * t) * tuck
            # a little extra room at the sides lower down
            co.x *= 1.0 + 0.05 * t * tuck

    def shorts_off(local):
        co = W @ local
        t = max(0.0, min(1.0, (waist_z - co.z) / (waist_z - shorts_bottom)))
        return 0.03 + 0.04 * t

    crotch_z = hips.z - torso * 0.16

    def shorts_drape(bm, rest):
        # loose fabric bridges the crotch instead of following it
        bins_f, bins_b = {}, {}
        for v in bm.verts:
            co = v.co
            if abs(co.z - (hips.z - torso * 0.02)) < 0.04:
                k = round(co.x / 0.03)
                if co.y < axis_y:
                    bins_f[k] = min(bins_f.get(k, 9), co.y)
                else:
                    bins_b[k] = max(bins_b.get(k, -9), co.y)
        for v in bm.verts:
            co = v.co
            if co.z > hips.z or co.z < crotch_z - 0.06 or abs(co.x) > 0.11:
                continue
            k = round(co.x / 0.03)
            w = max(0.0, 1.0 - abs(co.x) / 0.11) * max(0.0, min(1.0, (co.z - (crotch_z - 0.06)) / 0.08))
            if co.y < axis_y and k in bins_f:
                co.y = co.y + (bins_f[k] - co.y) * w * 0.8
            elif co.y >= axis_y and k in bins_b:
                co.y = co.y + (bins_b[k] - co.y) * w * 0.6

    def jersey_band(local, d):
        co = W @ local
        if co.z < chest_z - torso * 0.25:
            return (0.0, 0.0)          # the tucked hem stays plain
        return (max(0.0, 1.0 - d / 0.03), 0.0)

    def shorts_band(local, d):
        co = W @ local
        top = waist_z - co.z
        hem = max(0.0, 1.0 - d / 0.04) if top > 0.08 else 0.0
        waist = 1.0 if top < 0.05 else max(0.0, 1.0 - (top - 0.05) / 0.01)
        return (hem, waist)

    jersey = _make_piece(body, 'Jersey', jersey_field, jersey_off, uv_fn(jersey_bottom, neck.z + 0.02, jx),
                         excl_j, drape=jersey_drape, band=jersey_band, smooth=6)
    shorts = _make_piece(body, 'Shorts', shorts_field, shorts_off, uv_fn(shorts_bottom, waist_z, sx),
                         excl_s, drape=shorts_drape, band=shorts_band, smooth=5)

    bm = bmesh.new()
    bm.from_mesh(me)
    hidden = []
    for f in bm.faces:
        if any(excl_s[v.index] for v in f.verts):
            continue
        fj = min(jersey_field(v.co) for v in f.verts)
        fs = min(shorts_field(v.co) for v in f.verts)
        aw = max(arm_w[v.index] for v in f.verts)
        if aw < 0.15 and (fj > 0.045 or fs > 0.04):
            hidden.append(f)
    bmesh.ops.delete(bm, geom=hidden, context='FACES')
    bm.to_mesh(me)
    bm.free()
    return jersey, shorts
