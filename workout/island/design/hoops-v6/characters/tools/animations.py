"""Canonical 18-joint basketball animation library, Blender 4.3.

Recorded CMU bases are retargeted with rest-aware world rotations; additions are
original analytic-IK mocap-style animation, not motion capture. Z up, -Y forward
inside Blender; the GLB exporter converts to metres, +Y up, +Z forward.
"""
from pathlib import Path
import math
import bpy
import numpy as np
from mathutils import Vector, Quaternion, Matrix

FPS = 30
NAMES = ('Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot')
SOURCE = Path(__file__).resolve().parents[4] / 'assets/models/hoops-anim.glb'
SOURCE_MAP = {n:'mixamorig:'+('Spine2' if n=='Chest' else n) for n in NAMES if n!='Root'}
_SOURCE_CACHE = None

# Durations retain the recorded timing; authored clips are sampled at 30 Hz.
CLIPS = [
 ('idle',None,2.0,True),
 ('dribble_stationary','dribble_stand',None,True),
 ('dribble_crossover','crossover',None,True),
 ('dribble_between_legs',None,1.2,True),
 ('dribble_behind_back',None,1.3,True),
 ('shoot_set','freethrow',None,False),
 ('shoot_jump','jumpshot',None,False),
 ('shoot_fadeaway','pullup',None,False),
 ('layup','layup',None,False),
 ('dunk',None,1.9,False),
 ('block',None,1.5,False),
 ('steal',None,1.1,False),
 ('eurostep',None,1.8,False),
 ('run','run',None,True),
 ('decelerate','stop',None,False),
 ('defensive_slide','slide_l',None,True),
 ('celebration',None,2.4,True),
]


def _frame(frame):
    whole = math.floor(frame)
    bpy.context.scene.frame_set(whole, subframe=frame-whole)
    bpy.context.view_layer.update()


def _reset(rig):
    for p in rig.pose.bones:
        p.rotation_mode = 'QUATERNION'
        p.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def _snapshot(rig):
    return {p.name:p.matrix_basis.copy() for p in rig.pose.bones}


def _restore(rig, pose):
    for p in rig.pose.bones:
        p.matrix_basis = pose[p.name]
    bpy.context.view_layer.update()


def _aim(bone, destination):
    current = bone.tail-bone.head
    desired = Vector(destination)-bone.head
    if min(current.length,desired.length)<1e-7:
        return
    loc,rot,scale=bone.matrix.decompose()
    bone.matrix=Matrix.LocRotScale(loc,current.rotation_difference(desired)@rot,scale)
    bpy.context.view_layer.update()


def _limb(rig, upper, lower, target, pole):
    a,b=rig.pose.bones[upper],rig.pose.bones[lower]
    # Rest head-to-head distance, rather than Blender display-bone length,
    # accounts for nonconnected MakeHuman joints.
    origin=a.head.copy()
    length1=(b.head-a.head).length
    length2=b.length
    target=Vector(target)
    direction=target-origin
    distance=max(1e-6,min(direction.length,(length1+length2)*.998))
    direction.normalize()
    p=Vector(pole)-direction*Vector(pole).dot(direction)
    if p.length<1e-5:
        p=Vector((0,-1,0))-direction*Vector((0,-1,0)).dot(direction)
    p.normalize()
    along=(length1*length1-length2*length2+distance*distance)/(2*distance)
    bend=math.sqrt(max(0.,length1*length1-along*along))
    elbow=origin+direction*along+p*bend
    _aim(a,elbow)
    _aim(b,origin+direction*distance)


def _set_world_rotation(bone, rotation):
    loc,_,scale=bone.matrix.decompose()
    bone.matrix=Matrix.LocRotScale(loc,rotation,scale)
    bpy.context.view_layer.update()


def _key(rig,frame):
    for p in rig.pose.bones:
        p.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=p.name)
        if p.name in ('Root','Hips'):
            p.keyframe_insert(data_path='location',frame=frame,group=p.name)


def _blend(rig,pose,weight):
    for p in rig.pose.bones:
        loc,rot,scale=p.matrix_basis.decompose()
        qloc,qrot,qscale=pose[p.name].decompose()
        p.matrix_basis=Matrix.LocRotScale(loc.lerp(qloc,weight),rot.slerp(qrot,weight),scale.lerp(qscale,weight))
    bpy.context.view_layer.update()


def _smooth(x):
    x=max(0.,min(1.,x))
    return x*x*(3-2*x)


def _pulse(t,start=.12,peak=.42,end=.90):
    return _smooth((t-start)/(peak-start)) if t<peak else 1-_smooth((t-peak)/(end-peak))


def _sources():
    global _SOURCE_CACHE
    if _SOURCE_CACHE is not None:
        try:
            if _SOURCE_CACHE['rig'].name in bpy.data.objects:
                return _SOURCE_CACHE
        except ReferenceError:
            pass
    before=set(bpy.data.objects)
    actions_before=set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    added=set(bpy.data.objects)-before
    source_rig=next(o for o in added if o.type=='ARMATURE')
    actions={a.name.split('_Human.rig')[0].split('.')[0]:a for a in set(bpy.data.actions)-actions_before}
    for key,action in actions.items():
        action.name='__CMU_SOURCE_'+key
    # Source armature retained for rest-aware evaluation, never selected/exported.
    for o in added:
        if o!=source_rig:
            bpy.data.objects.remove(o,do_unlink=True)
    for track in source_rig.animation_data.nla_tracks:
        track.mute=True
    source_rig.hide_render=True
    source_rig.name='__V6_CMU_REFERENCE_DO_NOT_EXPORT'
    _SOURCE_CACHE={'rig':source_rig,'actions':actions}
    return _SOURCE_CACHE


def _neutral(rig):
    _reset(rig)
    for side,sign in [('Left',1),('Right',-1)]:
        a=rig.pose.bones[side+'Arm']
        length=(rig.pose.bones[side+'ForeArm'].head-a.head).length+rig.pose.bones[side+'ForeArm'].length
        target=a.head+Vector((sign*.035,-.055,-length*.975))
        _limb(rig,side+'Arm',side+'ForeArm',target,(sign*.2,-1,-.3))
    return _snapshot(rig)


def _recorded_pose(rig,source_rig,action,frame,start,end,index,total,scale):
    source_rig.animation_data.action=action
    _frame(frame)
    _reset(rig)
    source_hips=source_rig.pose.bones['mixamorig:Hips']
    # Keep lateral body sway; remove recorded locomotion drift for in-place use.
    drift_start=action.get('_v6_hips_start')
    drift_end=action.get('_v6_hips_end')
    delta=source_hips.head-source_rig.data.bones['mixamorig:Hips'].head_local
    drift=Vector(drift_start).lerp(Vector(drift_end),index/max(1,total-1))
    delta.x-=drift.x
    delta.y-=drift.y
    h=rig.pose.bones['Hips'];matrix=h.matrix.copy()
    matrix.translation+=delta*scale
    h.matrix=matrix
    bpy.context.view_layer.update()
    for name in NAMES[1:]:
        source_name=SOURCE_MAP[name]
        src=source_rig.pose.bones[source_name]
        source_rest=source_rig.data.bones[source_name].matrix_local.to_quaternion()
        target_rest=rig.data.bones[name].matrix_local.to_quaternion()
        rotation=src.matrix.to_quaternion()@source_rest.inverted()@target_rest
        _set_world_rotation(rig.pose.bones[name],rotation)


def _authored_pose(rig,neutral,name,t):
    _restore(rig,neutral)
    hips=rig.pose.bones['Hips']
    height=rig.data.bones['Head'].head_local.z+.12
    s=height/1.95
    ankles={side:rig.pose.bones[side+'Leg'].tail.copy() for side in ['Left','Right']}
    feet={side:rig.pose.bones[side+'Foot'].matrix.to_quaternion() for side in ['Left','Right']}
    wrists={side:rig.pose.bones[side+'ForeArm'].tail.copy() for side in ['Left','Right']}
    lower=0.; jump=0.;lateral=0.;forward=0.;lean=0.;twist=0.
    arms={}
    feet_offset={'Left':Vector(), 'Right':Vector()}
    if name=='idle':
        lean=.008*math.sin(t*math.tau)
    elif name in ('dribble_between_legs','dribble_behind_back'):
        cycle=t*math.tau
        lower=.16+.012*math.sin(cycle*2)
        lateral=.035*math.sin(cycle)
        lean=.14
        if name=='dribble_between_legs':
            feet_offset['Left']=Vector((.10,-.08,0))*s
            feet_offset['Right']=Vector((-.10,.06,0))*s
            arms['Right']=Vector((-.28+.36*math.sin(cycle),-.18+.08*math.cos(cycle),.72+.16*math.cos(cycle*2)))*s
            arms['Left']=Vector((.28-.20*math.sin(cycle),-.25,1.01+.07*math.cos(cycle)))*s
            twist=.07*math.sin(cycle)
        else:
            twist=.16*math.sin(cycle)
            arms['Right']=Vector((-.34*math.cos(cycle),.05+.20*math.sin(cycle),.85+.12*math.cos(cycle)))*s
            arms['Left']=Vector((.32,-.10,1.03))*s
    elif name in ('dunk','block'):
        prep=_pulse(t,.0,.18,.33)
        flight=max(0.,math.sin(math.pi*max(0.,min(1.,(t-.25)/.48))))
        lower=.17*prep+.13*_pulse(t,.70,.80,1.)
        jump=(1.10 if name=='dunk' else .60)*flight
        lift=_pulse(t,.13,.39,.83)
        for side,sign in [('Left',1),('Right',-1)]:
            base=Vector((sign*.28,-.24,1.18))
            overhead=Vector((sign*(.17 if name=='block' else .12),-.10,2.40 if side=='Right' or name=='block' else 1.77))
            arms[side]=base.lerp(overhead,lift)*s+Vector((0,0,jump))*s
        feet_offset['Left']=Vector((.035,-.05*flight,.04*flight))*s
        feet_offset['Right']=Vector((-.035,.07*flight,.08*flight))*s
        lean=-.06*flight
    elif name=='steal':
        p=_pulse(t,.02,.43,.98)
        lower=.18*p;forward=-.08*p;lean=.19*p
        lateral=-.06*p
        arms['Right']=Vector((-.30,-.10-.62*p,1.03-.20*p))*s
        arms['Left']=Vector((.30,-.20,1.06))*s
        feet_offset['Right']=Vector((-.07,-.12*p,0))*s
    elif name=='eurostep':
        p=_pulse(t,0.,.42,1.)
        lateral=.17*math.sin(t*math.tau)*p
        lower=.13+.03*math.cos(t*math.tau*2)
        lean=.11;twist=.16*math.sin(t*math.tau)
        for side,phase,sign in [('Left',0.,1),('Right',.5,-1)]:
            gait=math.sin((t+phase)*math.tau)
            feet_offset[side]=Vector((sign*.13*p,-.12*gait,.15*max(0,gait)))*s
        arms['Right']=Vector((-.22+.22*math.sin(t*math.tau),-.29,1.18+.09*p))*s
        arms['Left']=Vector((.20+.18*math.sin(t*math.tau),-.31,1.22+.06*p))*s
    elif name=='celebration':
        lift=.5-.5*math.cos(t*math.tau)
        lower=.025*(1-math.cos(t*math.tau*2))
        twist=.06*math.sin(t*math.tau)
        for side,sign in [('Left',1),('Right',-1)]:
            arms[side]=Vector((sign*(.36-.13*lift),-.08,1.08+1.13*lift))*s
    # Pelvis weight transfer; leg IK restores ankle contacts in crouches.
    hmat=hips.matrix.copy()
    hmat.translation+=Vector((lateral,forward,jump-lower))*s
    hips.matrix=hmat
    bpy.context.view_layer.update()
    for name_bone,amount,axis in [('Spine',lean*.45,(1,0,0)),('Chest',lean*.55,(1,0,0)),('Chest',twist,(0,0,1))]:
        p=rig.pose.bones[name_bone]
        _set_world_rotation(p,Quaternion(axis,amount)@p.matrix.to_quaternion())
    for side,sign in [('Left',1),('Right',-1)]:
        target=ankles[side]+feet_offset[side]+Vector((0,0,jump*s))
        _limb(rig,side+'UpLeg',side+'Leg',target,(0,-1,0))
        _set_world_rotation(rig.pose.bones[side+'Foot'],feet[side])
        if side in arms:
            _limb(rig,side+'Arm',side+'ForeArm',arms[side],(sign*.35,-1,-.1))
    return {'jump':jump,'crouch':lower}


def ground_actions(rig,meshes,actions,margin=.008):
    """Bake conservative floor clearance from fully deformed vertices at 60 Hz.

    Both endpoints surrounding every half-frame inherit its required lift. A
    second pass measures interpolation after correction. An 8mm floor margin
    accommodates Draco quantization and browser skinning roundoff. True airborne
    phases remain airborne; only an entirely floating clip receives one constant
    baseline drop. No per-frame snapping down is performed.
    """
    original=rig.animation_data.action
    tracks=[(t,t.mute) for t in rig.animation_data.nla_tracks]
    for t,_ in tracks:t.mute=True
    report={}
    def minimum():
        deps=bpy.context.evaluated_depsgraph_get()
        minimum=float('inf')
        for o in meshes:
            e=o.evaluated_get(deps);mesh=e.to_mesh()
            co=np.empty(len(mesh.vertices)*3,dtype=np.float32)
            mesh.vertices.foreach_get('co',co)
            co=co.reshape((-1,3))
            world=e.matrix_world
            if len(co):
                z=co[:,0]*world[2][0]+co[:,1]*world[2][1]+co[:,2]*world[2][2]+world[2][3]
                minimum=min(minimum,float(z.min()))
            e.to_mesh_clear()
        return minimum
    for a in actions:
        rig.animation_data.action=a
        start,end=a.frame_range
        frames=int(round(end-start))+1
        base={}
        lifts={i:0. for i in range(frames)}
        before=float('inf')
        lows={}
        for i in range(frames):
            _frame(start+i)
            base[i]=rig.pose.bones['Root'].location.copy()
        for j in range(2*(frames-1)+1):
            index=j/2
            _frame(start+index)
            low=minimum();before=min(before,low);lows[j]=low
            required=max(0.,margin-low)
            for k in {math.floor(index),math.ceil(index)}:
                lifts[k]=max(lifts[k],required)
        # Rest-pose differences can leave an entire recorded gait above the
        # shoes. Remove one cycle-wide constant, preserving every flight arc.
        baseline_drop=max(0.,before-margin)
        lock_contact=a.name=='defensive_slide'
        if lock_contact:
            # Lateral defense maintains a sole contact throughout the cycle.
            # Start with exact integer contact; guard nonlinear half-frames by
            # raising both neighboring keys only when their interpolation
            # would undercut the required half-frame clearance.
            baseline_drop=0.
            lifts={i:margin-lows[2*i] for i in range(frames)}
            for i in range(frames-1):
                predicted=(lifts[i]+lifts[i+1])*.5
                required=margin-lows[2*i+1]
                extra_contact=max(0.,required-predicted)
                lifts[i]+=extra_contact;lifts[i+1]+=extra_contact
        if a.get('loop',False):
            endpoint=max(lifts[0],lifts[frames-1])
            lifts[0]=endpoint;lifts[frames-1]=endpoint
        for i in range(frames):
            _frame(start+i)
            root=rig.pose.bones['Root'];root.location=base[i]+Vector((0,0,lifts[i]-baseline_drop))
            root.keyframe_insert(data_path='location',frame=start+i,group='Root')
        for fc in a.fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'
        after=float('inf')
        for j in range(2*(frames-1)+1):
            _frame(start+j/2);after=min(after,minimum())
        # Conservative correction if a nonlinear skin interpolation extremum
        # changed because the root lift itself was interpolated.
        extra=max(0.,margin-after)
        if extra>1e-7:
            for i in range(frames):
                _frame(start+i)
                root=rig.pose.bones['Root'];root.location.z+=extra
                root.keyframe_insert(data_path='location',frame=start+i,group='Root')
            after+=extra
        report[a.name]={'sampleRateHz':60,'sampleCount':2*(frames-1)+1,'minBeforeMeters':before,'minAfterMeters':after,'maximumRootLiftMeters':max(0.,max(lifts.values())+extra),'constantBaselineDropMeters':baseline_drop,'contactLocked':lock_contact,'minimumRootCorrectionMeters':min(lifts.values())-baseline_drop,'clearanceMarginMeters':margin,'method':'Full deformed mesh at frame and half-frame; conservative neighboring-key lift.'}
    rig.animation_data.action=original
    for t,mute in tracks:t.mute=mute
    return report


def build_animations(rig,meshes,ground=True):
    """Return (actions, metadata), with all clips installed as NLA tracks.

    Target must have the canonical 18 names and identity object transform. Bone
    orientations can retain MakeHuman native rest axes. Exactly matching rest
    skeletons allow clip arrays to be shared across every role and both LODs.
    """
    missing=set(NAMES)-set(rig.pose.bones.keys())
    if missing or len(rig.pose.bones)!=18:
        raise ValueError('Expected exact canonical18 skeleton; missing='+str(missing))
    bpy.context.scene.render.fps=FPS
    rig.animation_data_create()
    for track in list(rig.animation_data.nla_tracks):rig.animation_data.nla_tracks.remove(track)
    rig.animation_data.action=None
    source=_sources();source_rig=source['rig']
    neutral=_neutral(rig)
    source_height=source_rig.data.bones['mixamorig:Head'].head_local.z+.12
    target_height=rig.data.bones['Head'].head_local.z+.12
    scale=target_height/source_height
    actions=[];metadata={}
    for name,source_name,duration,loop in CLIPS:
        src=source['actions'].get(source_name) if source_name else None
        if source_name and src is None:
            raise ValueError('CMU source action missing '+source_name)
        if src:
            start,end=src.frame_range
            duration=(end-start)/FPS
            source_rig.animation_data.action=src
            _frame(start);first=source_rig.pose.bones['mixamorig:Hips'].head-source_rig.data.bones['mixamorig:Hips'].head_local
            _frame(end);last=source_rig.pose.bones['mixamorig:Hips'].head-source_rig.data.bones['mixamorig:Hips'].head_local
            src['_v6_hips_start']=list(first);src['_v6_hips_end']=list(last)
        frames=max(2,round(duration*FPS)+1)
        action=bpy.data.actions.new(name)
        rig.animation_data.action=action
        first_pose=None
        for i in range(frames):
            # Keep target frame stable while source evaluates a separate action.
            if src:
                _recorded_pose(rig,source_rig,src,start+(end-start)*i/(frames-1),start,end,i,frames,scale)
            else:
                _authored_pose(rig,neutral,name,i/(frames-1))
            if first_pose is None:first_pose=_snapshot(rig)
            if loop and src:
                u=_smooth((i-(frames-5))/4)
                if u:_blend(rig,first_pose,u)
            _key(rig,i+1)
        action['loop']=loop;action['canonicalJoints']=18;action.use_fake_user=True
        for fc in action.fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'
        actions.append(action)
        meta={'durationSeconds':(frames-1)/FPS,'loop':loop,'sampleRateHz':FPS,'rootMotion':'in-place; horizontal recorded drift removed','sourceAction':source_name,'method':'CMU recorded base; rest-aware world-rotation retarget to canonical18' if src else 'Original analytic-IK mocap-style animation with weight shift, anticipation and recovery; not captured motion','transitionSeconds':.18}
        if name.startswith('dribble'):
            meta['events']=[{'name':'ball_bounce','atSeconds':meta['durationSeconds']*.5,'bone':'RightHand','presentationOnly':True}]
            meta['ball']={'mode':name,'radiusMeters':.12,'bouncePhase':.5}
        elif name.startswith('shoot') or name in ('layup','dunk'):
            release={'shoot_set':.57,'shoot_jump':.47,'shoot_fadeaway':.50,'layup':.54,'dunk':.53}[name]
            meta['events']=[{'name':'ball_release','atSeconds':meta['durationSeconds']*release,'bone':'RightHand','presentationOnly':True}]
            meta['ball']={'mode':'release','releasePhase':release,'radiusMeters':.12}
        if name=='dunk':meta['minimumPresentationRimMeters']=3.05
        if name in ('dunk','block','layup'):
            meta.setdefault('events',[]).append({'name':'takeoff','atSeconds':meta['durationSeconds']*.25,'bone':'Root'})
        if name=='run':meta['referenceSpeedMetersPerSecond']=4.5
        if name=='defensive_slide':meta['referenceSpeedMetersPerSecond']=1.8
        metadata[name]=meta
    source_rig.animation_data.action=None
    rig.animation_data.action=None
    if ground:
        floor=ground_actions(rig,meshes,actions)
        for name,entry in floor.items():metadata[name]['floorBake']=entry
    for action in actions:
        track=rig.animation_data.nla_tracks.new();track.name=action.name
        strip=track.strips.new(action.name,1,action);strip.name=action.name
        strip.action_frame_start=1;strip.action_frame_end=action.frame_range[1]
        strip.extrapolation='NOTHING';strip.blend_type='REPLACE'
    rig.animation_data.action=None
    # Source reference must never appear in exports; target remains in idle.
    for track in rig.animation_data.nla_tracks:track.mute=True
    _restore(rig,neutral)
    for track in rig.animation_data.nla_tracks:track.mute=False
    bpy.context.view_layer.objects.active=rig
    return actions,metadata
