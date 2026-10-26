"""Retargets CMU (cgspeed MotionBuilder-friendly BVH) clips onto the MPFB mixamo rig.

blender -b player.blend --python retarget.py -- clips.json out_anim.glb out_meta.json

Method: both skeletons are put in a T-pose (BVH frame 1 is a T-pose; the target is aligned
bone by bone to the source directions). For every frame the world rotation change of each
source bone since its T-pose is applied to the matching target bone. Hips height is scaled
by leg length. Horizontal root motion is removed (in place clips) and stored as speed.
"""
import bpy, sys, json, math, os
from mathutils import Matrix, Quaternion, Vector

args = sys.argv[sys.argv.index('--') + 1:]
clips = json.load(open(args[0]))
out_glb, out_meta = args[1], args[2]
BVH_DIR = os.environ.get('BVH_DIR', '/home/claude/pro/bvh')
FPS_OUT = 30

MAP = [('Hips', 'Hips'), ('Spine', 'LowerBack'), ('Spine1', 'Spine'), ('Spine2', 'Spine1'),
       ('Neck', 'Neck'), ('Head', 'Head'),
       ('LeftShoulder', 'LeftShoulder'), ('LeftArm', 'LeftArm'), ('LeftForeArm', 'LeftForeArm'), ('LeftHand', 'LeftHand'),
       ('RightShoulder', 'RightShoulder'), ('RightArm', 'RightArm'), ('RightForeArm', 'RightForeArm'), ('RightHand', 'RightHand'),
       ('LeftUpLeg', 'LeftUpLeg'), ('LeftLeg', 'LeftLeg'), ('LeftFoot', 'LeftFoot'), ('LeftToeBase', 'LeftToeBase'),
       ('RightUpLeg', 'RightUpLeg'), ('RightLeg', 'RightLeg'), ('RightFoot', 'RightFoot'), ('RightToeBase', 'RightToeBase')]
P = 'mixamorig:'
SKIP = set(os.environ.get('SKIP', 'LeftShoulder,RightShoulder').split(','))

rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in list(bpy.data.objects):
    if o.type == 'MESH':
        bpy.data.objects.remove(o)
rig.animation_data_create()
bones = rig.data.bones
order = []


def walk(b):
    order.append(b.name)
    for c in b.children:
        walk(c)


walk(next(b for b in bones if b.parent is None))
tmap = {P + t: s for t, s in MAP if t not in SKIP}
rest_arm = {b.name: b.matrix_local.copy() for b in bones}          # armature space rest
rest_rot = {n: m.to_quaternion() for n, m in rest_arm.items()}


def bone_dir_rest(name):
    b = bones[name]
    return (b.tail_local - b.head_local).normalized()


def facing_from(left_hip, right_hip):
    side = (left_hip - right_hip)
    side.z = 0
    side.normalize()
    fwd = Vector((0, 0, 1)).cross(side)    # z up
    return fwd


def yaw_between(a, b):
    a = Vector((a.x, a.y, 0)).normalized()
    b = Vector((b.x, b.y, 0)).normalized()
    ang = math.atan2(a.x * b.y - a.y * b.x, a.dot(b))
    return Quaternion((0, 0, 1), ang)


# target facing (MakeHuman faces -Y)
t_fwd = facing_from(rest_arm[P + 'LeftUpLeg'].to_translation(), rest_arm[P + 'RightUpLeg'].to_translation())
leg_t = (rest_arm[P + 'Hips'].to_translation().z)

bpy.context.scene.render.fps = FPS_OUT
bpy.context.scene.render.fps_base = 1.0
MIR = Matrix.Diagonal((-1, 1, 1, 1))


def swapname(n):
    if n.startswith('Left'):
        return 'Right' + n[4:]
    if n.startswith('Right'):
        return 'Left' + n[5:]
    if n.startswith('L') and n[1:2].isupper():
        return 'R' + n[1:]
    if n.startswith('R') and n[1:2].isupper():
        return 'L' + n[1:]
    return n


def mirror_state(S, ends):
    S2 = {n: MIR @ S[swapname(n)] @ MIR for n in S}
    E2 = {n: MIR @ ends[swapname(n)] for n in ends}
    return S2, E2


meta = {}
actions = []
for clip in clips:
    name, src, a, e_end = clip['name'], clip['src'], clip['start'], clip['end']
    bpy.ops.import_anim.bvh(filepath=os.path.join(BVH_DIR, src + '.bvh'), axis_forward='-Z', axis_up='Y',
                            rotate_mode='NATIVE', global_scale=1.0, use_fps_scale=False, update_scene_fps=False,
                            update_scene_duration=False)
    srig = bpy.context.object
    sb = srig.pose.bones
    scene = bpy.context.scene

    def src_state(f):
        scene.frame_set(f)
        return {n: (srig.matrix_world @ sb[n].matrix) for n in [s for _, s in MAP]}, \
               {n: (srig.matrix_world @ sb[n].tail) for n in ['LeftHand', 'RightHand', 'LeftToeBase', 'RightToeBase', 'Head']}

    T, _ = src_state(1)
    if clip.get('mirror'):
        T, _ = mirror_state(T, _)
    s_fwd = facing_from(T['LeftUpLeg'].to_translation(), T['RightUpLeg'].to_translation())
    yaw = yaw_between(s_fwd, t_fwd)
    yawm = yaw.to_matrix().to_4x4()
    T = {n: yawm @ m for n, m in T.items()}
    leg_s = T['Hips'].to_translation().z - min(T['LeftToeBase'].to_translation().z, T['RightToeBase'].to_translation().z)
    floor_s = min(T['LeftToeBase'].to_translation().z, T['RightToeBase'].to_translation().z)
    scale = leg_t / max(1e-6, leg_s)

    # target T-pose rotations (armature space), aligned bone by bone to the source T directions
    tgtT = {}
    for n in order:
        b = bones[n]
        if n in tmap:
            sm = T[tmap[n]]
            sdir = (sm.to_3x3() @ Vector((0, 1, 0))).normalized()
            rdir = bone_dir_rest(n)
            if b.parent is not None:
                # rest direction carried by the parent's T rotation
                par = b.parent.name
                prot = tgtT[par] @ rest_rot[par].inverted()
                rdir = (prot @ rdir).normalized()
                base = prot @ rest_rot[n]
            else:
                base = rest_rot[n]
            if n in (P + 'Hips',):
                tgtT[n] = base
            else:
                tgtT[n] = rdir.rotation_difference(sdir) @ base
        else:
            par = b.parent.name
            tgtT[n] = tgtT[par] @ rest_rot[par].inverted() @ rest_rot[n]
    srcT_inv = {n: m.to_quaternion().inverted() for n, m in T.items()}
    # clip facing: average hips facing over the clip, turned to the target facing
    fsum = Vector((0, 0, 0))
    for f in range(a, e_end + 1, 12):
        Sx, _ = src_state(f)
        if clip.get('mirror'):
            Sx, _ = mirror_state(Sx, _)
        fsum += facing_from(Sx['LeftUpLeg'].to_translation(), Sx['RightUpLeg'].to_translation())
    cyaw = yaw_between(fsum.normalized(), t_fwd) if not clip.get('noFace') else yaw
    yawm_clip = cyaw.to_matrix().to_4x4()
    hipsT = (yawm_clip @ (yawm.inverted() @ T['Hips'])).to_translation()

    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data.action = act
    step = 120 // FPS_OUT
    frames = list(range(a, e_end + 1, step))
    root_xy = []
    hand_track = []
    for k, f in enumerate(frames):
        S, ends = src_state(f)
        if clip.get('mirror'):
            S, ends = mirror_state(S, ends)
        S = {n: yawm_clip @ m for n, m in S.items()}
        ends = {n: yawm_clip @ v for n, v in ends.items()}
        want = {}
        for n in order:
            if n in tmap:
                s = tmap[n]
                delta = S[s].to_quaternion() @ srcT_inv[s]
                want[n] = delta @ tgtT[n]
        arm_rot = {}
        for n in order:
            b = bones[n]
            pb = rig.pose.bones[n]
            if b.parent is None:
                pr = Quaternion()
                rest_rel = rest_rot[n]
            else:
                pr = arm_rot[b.parent.name]
                rest_rel = rest_rot[b.parent.name].inverted() @ rest_rot[n]
            if n in want:
                basis = rest_rel.inverted() @ pr.inverted() @ want[n]
                arm_rot[n] = want[n]
            else:
                basis = Quaternion()
                arm_rot[n] = pr @ rest_rel
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = basis
            pb.keyframe_insert('rotation_quaternion', frame=k + 1)
        hp = S['Hips'].to_translation()
        d = (hp - hipsT) * scale
        root_xy.append((d.x, d.y))
        z = (hp.z - floor_s) * scale
        desired = Vector((rest_arm[P + 'Hips'].to_translation().x, rest_arm[P + 'Hips'].to_translation().y, z))
        if clip.get('keepRoot'):
            desired.x += d.x
            desired.y += d.y
        hb = rig.pose.bones[P + 'Hips']
        local = rest_arm[P + 'Hips'].inverted() @ desired
        hb.location = local
        hb.keyframe_insert('location', frame=k + 1)
        hand_track.append([round(z, 3)] + [round(((ends[h].z - floor_s) * scale), 3) for h in ('LeftHand', 'RightHand', 'LeftToeBase', 'RightToeBase', 'Head')] + [round(d.x, 3), round(d.y, 3)])
    n = len(frames)
    dist = sum(math.hypot(root_xy[i + 1][0] - root_xy[i][0], root_xy[i + 1][1] - root_xy[i][1]) for i in range(n - 1))
    dur = (n - 1) / FPS_OUT
    net = Vector((root_xy[-1][0] - root_xy[0][0], root_xy[-1][1] - root_xy[0][1], 0))
    meta[name] = {'src': src, 'start': a, 'end': e_end, 'frames': n, 'duration': round(dur, 3),
                  'pathSpeed': round(dist / max(dur, 1e-6), 3), 'netSpeed': round(net.length / max(dur, 1e-6), 3),
                  'netDir': [round(net.x, 3), round(net.y, 3)], 'loop': bool(clip.get('loop')),
                  'events': clip.get('events', {}), 'scale': round(scale, 4),
                  'track': hand_track if clip.get('track') else None}
    actions.append(act)
    bpy.data.objects.remove(srig)
    print('CLIP', name, meta[name])

# push every action to its own NLA track so the exporter writes them all
rig.animation_data.action = None
for act in actions:
    tr = rig.animation_data.nla_tracks.new()
    tr.name = act.name
    tr.strips.new(act.name, 1, act)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=out_glb, use_selection=True, export_format='GLB', export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_skins=True, export_def_bones=False,
                          export_optimize_animation_size=True, export_force_sampling=True, export_frame_step=1,
                          export_yup=True)
json.dump(meta, open(out_meta, 'w'), indent=1)
print('ANIM', out_glb, os.path.getsize(out_glb))
