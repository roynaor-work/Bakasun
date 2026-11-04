"""Native Mixamo52 basketball actions for the v4 review assets.

Three motions reuse the repository's already licensed CMU retargeting. Steal is
an original two-bone-IK reach with planted ankle targets; block combines the CMU
jump with an original two-hand overhead reach. All coordinates here are Blender
Z-up, forward -Y. The exporter converts them to glTF +Y-up, +Z-forward.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector, Quaternion, Matrix

SOURCE = Path(__file__).resolve().parents[3] / 'assets/models/hoops-anim.glb'
PREFIX = 'mixamorig:'
FPS = 30


def _scene_frame(frame):
    f = int(math.floor(frame))
    bpy.context.scene.frame_set(f, subframe=frame-f)
    bpy.context.view_layer.update()


def _reset(rig):
    for p in rig.pose.bones:
        p.rotation_mode = 'QUATERNION'
        p.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def _aim(pbone, endpoint):
    """Rotate a bone in armature space without changing its length or twist."""
    bpy.context.view_layer.update()
    direction = Vector(endpoint) - pbone.head
    current = pbone.tail - pbone.head
    if direction.length < 1e-7 or current.length < 1e-7:
        return
    delta = current.normalized().rotation_difference(direction.normalized())
    matrix = pbone.matrix.copy()
    location, rotation, scale = matrix.decompose()
    pbone.matrix = Matrix.LocRotScale(location, delta @ rotation, scale)
    bpy.context.view_layer.update()


def _limb(rig, upper, lower, destination, pole):
    """Analytic two-bone IK using each athlete's actual rest segment lengths."""
    a, b = rig.pose.bones[PREFIX+upper], rig.pose.bones[PREFIX+lower]
    origin = a.head.copy()
    l1, l2 = a.length, b.length
    target = Vector(destination)
    delta = target-origin
    distance = max(1e-6, min(delta.length, (l1+l2)*.995))
    forward = delta.normalized()
    p = Vector(pole)-forward*Vector(pole).dot(forward)
    if p.length < 1e-5:
        p = Vector((0,0,-1))-forward*Vector((0,0,-1)).dot(forward)
    p.normalize()
    along = (l1*l1-l2*l2+distance*distance)/(2*distance)
    across = math.sqrt(max(0, l1*l1-along*along))
    elbow = origin+forward*along+p*across
    _aim(a, elbow)
    _aim(b, origin+forward*distance)


def _key(rig, frame):
    for p in rig.pose.bones:
        p.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=p.name)
        if p.name == PREFIX+'Hips':
            p.keyframe_insert(data_path='location', frame=frame, group=p.name)


def _snapshot(rig):
    return {p.name:p.matrix_basis.copy() for p in rig.pose.bones}


def _restore(rig, pose):
    for p in rig.pose.bones:
        p.matrix_basis = pose[p.name]
    bpy.context.view_layer.update()


def _make_idle(rig):
    _reset(rig)
    # Rest-pose legs are straight. Lower the wrists from the MakeHuman A-pose
    # so the five-athlete group photograph compares upright heights.
    hips = rig.pose.bones[PREFIX+'Hips'].head.z
    for side, sign in [('Left',1),('Right',-1)]:
        shoulder = rig.pose.bones[PREFIX+side+'Arm'].head.copy()
        arm_length = rig.pose.bones[PREFIX+side+'Arm'].length + rig.pose.bones[PREFIX+side+'ForeArm'].length
        target = Vector((shoulder.x + sign*.015, shoulder.y-.035, shoulder.z-arm_length*.965))
        _limb(rig, side+'Arm', side+'ForeArm', target, (0,-1,-.1))
    pose = _snapshot(rig)
    action = bpy.data.actions.new('idle')
    rig.animation_data.action = action
    _key(rig,1)
    _key(rig,31)
    action['loop'] = True
    return action, pose


def _curves_pose(rig, source_action, frame, translation_scale=1.):
    _reset(rig)
    for fc in source_action.fcurves:
        path = fc.data_path
        if not path.startswith('pose.bones['):
            continue
        name = path.split('"')[1]
        if name not in rig.pose.bones:
            continue
        p = rig.pose.bones[name]
        property_name = path.rsplit('.',1)[1]
        if property_name in ('rotation_quaternion','location','scale'):
            value = fc.evaluate(frame)
            if property_name == 'location':
                value *= translation_scale
            getattr(p,property_name)[fc.array_index] = value
    bpy.context.view_layer.update()


def _mix_pose(rig, first, weight):
    for p in rig.pose.bones:
        a_loc, a_rot, a_scale = p.matrix_basis.decompose()
        b_loc, b_rot, b_scale = first[p.name].decompose()
        p.matrix_basis = Matrix.LocRotScale(a_loc.lerp(b_loc,weight), a_rot.slerp(b_rot,weight),a_scale.lerp(b_scale,weight))
    bpy.context.view_layer.update()


def _bake_native(rig, source_action, name, height_scale, loop=False):
    start,end = source_action.frame_range
    duration=(end-start)/FPS
    # Add a short authored recovery to a single recorded dribble cycle, closing
    # the loop on the same pose instead of teleporting between unequal ends.
    tail = 5 if name=='dribble' else 0
    frames=int(round(end-start))+1+tail
    action=bpy.data.actions.new(name)
    rig.animation_data.action=action
    first=None
    for i in range(frames):
        f=min(end,start+i)
        _curves_pose(rig,source_action,f,height_scale)
        if first is None:first=_snapshot(rig)
        if loop:
            blend_start=frames-1-(tail or 3)
            u=max(0,min(1,(i-blend_start)/max(1,frames-1-blend_start)))
            _mix_pose(rig,first,u*u*(3-2*u))
        _key(rig,i+1)
    action['loop']=loop
    return action,(frames-1)/FPS


def _make_steal(rig, neutral):
    action=bpy.data.actions.new('steal');rig.animation_data.action=action
    _restore(rig,neutral)
    ankles={s:rig.pose.bones[PREFIX+s+'Leg'].tail.copy() for s in ['Left','Right']}
    wrists={s:rig.pose.bones[PREFIX+s+'ForeArm'].tail.copy() for s in ['Left','Right']}
    foot_rotations={s:rig.pose.bones[PREFIX+s+'Foot'].matrix.to_quaternion() for s in ['Left','Right']}
    hips_height=rig.pose.bones[PREFIX+'Hips'].head.z
    for i in range(31):
        _restore(rig,neutral)
        t=i/30
        # Anticipation, a fast right-hand poke, then controlled recovery.
        if t<.18: u=t/.18; pulse=.15*(u*u*(3-2*u))
        elif t<.48: u=(t-.18)/.30; pulse=.15+.85*(u*u*(3-2*u))
        else: u=(t-.48)/.52; pulse=1-u*u*(3-2*u)
        h=rig.pose.bones[PREFIX+'Hips'];m=h.matrix.copy()
        m.translation += Vector((-.025*pulse,-.10*pulse,-.115*pulse))*hips_height
        h.matrix=m
        bpy.context.view_layer.update()
        spine=rig.pose.bones[PREFIX+'Spine1'];loc,rot,scale=spine.matrix.decompose()
        spine.matrix=Matrix.LocRotScale(loc,Quaternion((1,0,0),.18*pulse)@rot,scale)
        bpy.context.view_layer.update()
        for side in ['Left','Right']:
            _limb(rig,side+'UpLeg',side+'Leg',ankles[side],(0,-1,0))
            # An ankle position alone does not lock a sole: preserve the foot's
            # neutral armature-space orientation after the shin rotates.
            foot=rig.pose.bones[PREFIX+side+'Foot']
            loc,rot,scale=foot.matrix.decompose()
            foot.matrix=Matrix.LocRotScale(loc,foot_rotations[side],scale)
            bpy.context.view_layer.update()
        shoulder=rig.pose.bones[PREFIX+'RightArm'].head.copy()
        length=rig.pose.bones[PREFIX+'RightArm'].length+rig.pose.bones[PREFIX+'RightForeArm'].length
        reach=shoulder+Vector((.07,-.96,-.15))*length
        _limb(rig,'RightArm','RightForeArm',wrists['Right'].lerp(reach,pulse),(0,0,-1))
        left=rig.pose.bones[PREFIX+'LeftArm'].head.copy()+Vector((.05,-.24,-.28))*hips_height
        _limb(rig,'LeftArm','LeftForeArm',wrists['Left'].lerp(left,pulse),(0,-1,0))
        _key(rig,i+1)
    action['loop']=False
    return action


def _make_block(rig, jump_source, height_scale):
    action=bpy.data.actions.new('block');rig.animation_data.action=action
    start,end=jump_source.frame_range
    frames=int(round(end-start))+1
    for i in range(frames):
        phase=i/(frames-1)
        _curves_pose(rig,jump_source,start+i,height_scale)
        if phase<.10: reach=0
        elif phase<.34: u=(phase-.10)/.24;reach=u*u*(3-2*u)
        elif phase<.64:reach=1
        else:u=min(1,(phase-.64)/.36);reach=1-u*u*(3-2*u)
        for side,sign in [('Left',1),('Right',-1)]:
            arm=rig.pose.bones[PREFIX+side+'Arm'];fore=rig.pose.bones[PREFIX+side+'ForeArm']
            current=fore.tail.copy();length=arm.length+fore.length
            target=arm.head+Vector((sign*.15,-.10,.97))*length
            _limb(rig,side+'Arm',side+'ForeArm',current.lerp(target,reach),(0,-1,0))
        _key(rig,i+1)
    action['loop']=False
    return action,(frames-1)/FPS


def _optimize(action):
    """Drop redundant static channels; keep endpoint values for static bones."""
    for fc in action.fcurves:
        for k in fc.keyframe_points:k.interpolation='LINEAR'
        pts=fc.keyframe_points
        if len(pts)>2 and max(p.co.y for p in pts)-min(p.co.y for p in pts)<1e-7:
            for index in range(len(pts)-2,0,-1):pts.remove(pts[index],fast=True)


def build_animations(rig, height_scale=1.0):
    """Return (six actions, metadata), and install identically named NLA tracks.

    ``rig`` must be an imported MakeHuman Mixamo52 armature with identity object
    transform. ``height_scale`` scales the CMU pelvis offsets after the builder's
    proportion edit. It never scales/restretches bone lengths during animation.
    """
    bpy.context.scene.render.fps=FPS
    rig.animation_data_create()
    before=set(bpy.data.objects)
    previous_actions=set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    added=set(bpy.data.objects)-before
    imported=list(set(bpy.data.actions)-previous_actions)
    source={a.name.split('_Human.rig')[0]:a for a in imported}
    # Only the imported source armature is deleted; the immutable source file
    # and all target meshes remain untouched.
    for obj in added:bpy.data.objects.remove(obj,do_unlink=True)
    for t in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(t)
    rig.animation_data.action=None
    actions=[];metadata={}
    idle,neutral=_make_idle(rig);actions.append(idle)
    metadata['idle']={'durationSeconds':1,'loop':True,'method':'Original upright neutral review pose; relaxed arms, straight legs.'}
    for src,name,loop in [('dribble_stand','dribble',True),('jumpshot','shoot',False),('run','run',True)]:
        a,duration=_bake_native(rig,source[src],name,height_scale,loop)
        actions.append(a)
        metadata[name]={'durationSeconds':duration,'loop':loop,'method':'CMU native retarget from repository hoops-anim.glb','sourceAction':src}
    actions.append(_make_steal(rig,neutral));metadata['steal']={'durationSeconds':1,'loop':False,'method':'Original planted-ankle IK lunge and right-hand poke','events':[{'name':'steal_reach','atSeconds':.48,'bone':'mixamorig:RightHand'}]}
    a,duration=_make_block(rig,source['jump'],height_scale);actions.append(a)
    metadata['block']={'durationSeconds':duration,'loop':False,'method':'CMU jump with original overhead two-hand block IK','sourceAction':'jump','events':[{'name':'block_apex','atSeconds':.5,'bone':'mixamorig:RightHand'}]}
    metadata['dribble']['events']=[{'name':'ball_bounce','atSeconds':.5,'presentationOnly':True}]
    metadata['shoot']['events']=[{'name':'ball_release','atSeconds':.7666666667,'bone':'mixamorig:RightHand','presentationOnly':True}]
    metadata['run']['referenceSpeedMetersPerSecond']=4.5
    for a in actions:
        _optimize(a)
        a.use_fake_user=True
        track=rig.animation_data.nla_tracks.new();track.name=a.name
        strip=track.strips.new(a.name,1,a);strip.name=a.name
        strip.action_frame_start=1
        strip.action_frame_end=a.frame_range[1]
        strip.extrapolation='NOTHING'
        strip.blend_type='REPLACE'
    rig.animation_data.action=None
    for a in imported:
        if a.users==0:bpy.data.actions.remove(a)
    _restore(rig,neutral)
    bpy.context.view_layer.objects.active=rig
    return actions,metadata


def ground_actions(rig, meshes, actions, floor_epsilon=.0005):
    """Bake pelvis corrections against actual deformed vertices at native 30 Hz.

    This preserves the authored airborne phases. The run receives one constant
    baseline shift to ground its cycle minimum; otherwise only existing floor
    penetration is lifted, with a 0.5 mm quantization margin. Native animation
    keys already occupy every sampled frame, so a later correction cannot
    change a previous sample through interpolation. The report is measured,
    not an assertion about unsampled times or another skin implementation.
    """
    original_action=rig.animation_data.action
    original_mutes=[(track,track.mute) for track in rig.animation_data.nla_tracks]
    for track,_ in original_mutes:track.mute=True
    report={}
    def minimum():
        deps=bpy.context.evaluated_depsgraph_get()
        value=float('inf')
        for obj in meshes:
            evaluated=obj.evaluated_get(deps)
            mesh=evaluated.to_mesh()
            if mesh.vertices:
                value=min(value,min((evaluated.matrix_world@v.co).z for v in mesh.vertices))
            evaluated.to_mesh_clear()
        return value
    for action in actions:
        rig.animation_data.action=action
        start,end=action.frame_range
        # The native CMU run has a constant vertical baseline above these
        # particular shoes. Remove only the cycle-wide minimum so a true
        # contact reaches the floor while flight height and gait stay intact.
        baseline_drop=0.
        if action.name=='run':
            poses=[]
            for i in range(int(round(end-start))+1):
                frame=min(end,start+i);_scene_frame(frame)
                poses.append((frame,rig.pose.bones[PREFIX+'Hips'].location.copy(),minimum()))
            baseline_drop=max(0.,min(p[2] for p in poses)-floor_epsilon)
            if baseline_drop:
                for frame,location,_ in poses:
                    _scene_frame(frame)
                    hips=rig.pose.bones[PREFIX+'Hips'];hips.location=location
                    bpy.context.view_layer.update()
                    matrix=hips.matrix.copy();matrix.translation.z-=baseline_drop;hips.matrix=matrix
                    hips.keyframe_insert(data_path='location',frame=frame,group=hips.name)
        before_min=float('inf');after_min=float('inf');maximum_lift=0.;corrected=0
        for i in range(int(round(end-start))+1):
            frame=min(end,start+i)
            _scene_frame(frame)
            before=minimum();before_min=min(before_min,before)
            if before < -1e-6:
                lift=floor_epsilon-before
                hips=rig.pose.bones[PREFIX+'Hips']
                matrix=hips.matrix.copy();matrix.translation.z+=lift
                hips.matrix=matrix
                bpy.context.view_layer.update()
                hips.keyframe_insert(data_path='location',frame=frame,group=hips.name)
                bpy.context.view_layer.update()
                maximum_lift=max(maximum_lift,lift);corrected+=1
            after_min=min(after_min,minimum())
        for fc in action.fcurves:
            for key in fc.keyframe_points:key.interpolation='LINEAR'
        report[action.name]={'sampleRateHz':FPS,'sampleCount':int(round(end-start))+1,
            'minBeforeMeters':before_min,'minAfterMeters':after_min,
            'maximumPelvisLiftMeters':maximum_lift,'correctedSamples':corrected,
            'constantRunBaselineDropMeters':baseline_drop,
            'method':'Evaluated deformed-mesh floor correction; airborne poses retained.'}
    rig.animation_data.action=original_action
    for track,mute in original_mutes:track.mute=mute
    return report
