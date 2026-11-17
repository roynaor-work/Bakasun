"""Original 30 Hz canonical18 motion. Metres, Y up, Z forward, xyzw quaternions.

Walking/running are in-place clips with virtual +Z travel in metres/second.
Flat sole two-bone IK uses canonical .41/.37 metre leg segments. A Hermite
swing trajectory matches stance velocity at toe-off/heel-strike; sine-squared
foot clearance has zero vertical velocity at contact. No recorded mocap.
"""
import math

FPS = 30
TAU = math.tau
NAMES = ['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']


def quat(x=0., y=0., z=0.):
    """XYZ Euler to normalized xyzw, matching glTF/THREE Euler order XYZ."""
    sx,cx=math.sin(x/2),math.cos(x/2)
    sy,cy=math.sin(y/2),math.cos(y/2)
    sz,cz=math.sin(z/2),math.cos(z/2)
    return [sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz]


def leg_ik(hip_y, ankle_y, ankle_z):
    """Sagittal 2-bone IK; knee always bends toward +Z; sole stays horizontal."""
    l1,l2=.41,.37
    dy,dz=ankle_y-hip_y,ankle_z
    d=min(l1+l2-1e-7,max(abs(l1-l2)+1e-7,math.hypot(dy,dz)))
    aim=math.atan2(-dz,-dy)
    upper=aim-math.acos(max(-1.,min(1.,(l1*l1+d*d-l2*l2)/(2*l1*d))))
    knee=math.pi-math.acos(max(-1.,min(1.,(l1*l1+l2*l2-d*d)/(2*l1*l2))))
    return upper,knee,-upper-knee


def foot_cycle(c,duty,stride,clearance):
    c=c%1.
    if c<duty:
        return .08, stride*(.5-c/duty), True
    u=(c-duty)/(1-duty)
    h=3*u*u-2*u*u*u
    m=-stride*(1-duty)/duty
    z=-stride/2+stride*h+m*(2*u*u*u-3*u*u+u)
    return .08+clearance*math.sin(math.pi*u)**2,z,False


def motion_profile(raw):
    age=raw.get('age','adult')
    elder=age in ('elder','senior','elderly') or raw['id'].startswith('elder')
    child=age in ('child','kid') or raw['id'] in ('boy','girl')
    return {'elder':elder,'child':child,'walkDuration':1.4 if elder else 1.2,'runDuration':.8,'stride':.28 if elder else .34,'walkClearance':.06 if elder else .075,'breath':.009 if elder else .006}


def humanoid_animations(raw):
    p=motion_profile(raw)
    clips=[]
    for name,duration in [('idle',2.4),('walk',p['walkDuration']),('wave',2.4),('sit',4.0),('talk',2.4),('run',p['runDuration'])]:
        count=round(duration*FPS)+1
        times=[i/FPS for i in range(count)]
        values={n:[] for n in NAMES[1:]}
        hips=[]
        contacts=[]
        duty=.64 if name=='walk' else .42
        stride=p['stride'] if name=='walk' else .58
        for frame,t in enumerate(times):
            # Explicit final copy eliminates binary endpoint drift in loop assets.
            phase=TAU*(0 if frame==count-1 else t/duration)
            s,c=math.sin(phase),math.cos(phase)
            breath=math.sin(phase)*p['breath']
            e={n:[0.,0.,0.] for n in NAMES[1:]}
            hy=.855
            hz=0.
            e['Spine']=[breath*.7,0.,0.]
            e['Chest']=[breath*.35,0.,0.]
            e['Neck']=[-breath*.5,0.,0.]
            e['Head']=[-breath*.4,.025*s,0.]
            for side,sign in [('Left',1),('Right',-1)]:
                e[side+'Arm']=[-.035,0.,sign*.085]
                e[side+'ForeArm']=[-.13,0.,0.]
            if name in ('walk','run'):
                run=name=='run'
                # Running includes a real flight phase; stance soles remain flat.
                hy=(.765+.025*math.cos(phase*2)) if run else (.815+.006*math.cos(phase*2))
                e['Spine']=[.11 if run else .015,0.,0.]
                e['Chest']=[0.,.025*s,0.]
                e['Head']=[-.07 if run else 0.,0.,0.]
                for side,offset,sign in [('Left',0.,1),('Right',.5,-1)]:
                    cy=(t/duration+offset)%1 if frame<count-1 else offset
                    ay,az,stance=foot_cycle(cy,duty,stride,.17 if run else p['walkClearance'])
                    a,k,f=leg_ik(hy,ay,az)
                    e[side+'UpLeg']=[a,0.,0.]
                    e[side+'Leg']=[k,0.,0.]
                    e[side+'Foot']=[f,0.,0.]
                    arm=(.62 if run else .32)*math.sin(phase+offset*TAU)
                    e[side+'Arm']=[arm-.13 if run else arm,0.,sign*.08]
                    e[side+'ForeArm']=[-1.08+(.15 if run else .10)*math.cos(phase+offset*TAU) if run else -.23-.12*math.sin(phase+offset*TAU),0.,0.]
                    if frame<count-1:
                        contacts.append({'frame':frame,'bone':side+'Foot','active':stance})
            elif name=='sit':
                def smooth5(v):
                    v=max(0.,min(1.,v))
                    return v*v*v*(10+v*(-15+6*v))
                seat=smooth5(t/.9)*smooth5((duration-t)/.9)
                hy=.855+(.45-.855)*seat
                hz=-.41*seat
                e['Spine']=[.035+breath,0.,0.]
                e['Chest']=[-.02,0.,0.]
                e['Head']=[-.02,.028*s,0.]
                for side,sign in [('Left',1),('Right',-1)]:
                    # The feet remain planted through the whole transition.
                    # Knee flexion follows a reachable ankle trajectory; hips
                    # move backward as the thighs lower onto the seat.
                    a,k,f=leg_ik(hy,.08,-hz)
                    e[side+'UpLeg']=[a,0.,0.]
                    e[side+'Leg']=[k,0.,0.]
                    e[side+'Foot']=[f,0.,0.]
                    e[side+'Arm']=[-.37,0.,sign*.08]
                    e[side+'ForeArm']=[-1.02,0.,0.]
                    e[side+'Hand']=[.25,0.,0.]
            else:
                for side in ('Left','Right'):
                    a,k,f=leg_ik(hy,.08,0.)
                    e[side+'UpLeg']=[a,0.,0.]
                    e[side+'Leg']=[k,0.,0.]
                    e[side+'Foot']=[f,0.,0.]
                if name=='wave':
                    e['RightArm']=[-.12,.12,-1.95+.055*s]
                    e['RightForeArm']=[0.,.16,-.77+.22*math.sin(phase*3)]
                    e['RightHand']=[.09*math.sin(phase*3),0.,.16*math.sin(phase*3)]
                    e['Head']=[-.025,-.10+.025*s,-.025]
                    e['Chest']=[breath*.3,-.025,0.]
                if name=='talk':
                    e['LeftArm']=[-.36+.10*s,0.,.12]
                    e['RightArm']=[-.29+.10*math.sin(phase+.8),0.,-.13]
                    e['LeftForeArm']=[-.94+.20*math.sin(phase+.5),.24,.05]
                    e['RightForeArm']=[-.86+.20*math.sin(phase+2),-.24,-.05]
                    e['LeftHand']=[.05,.12*math.sin(phase+.5),.10]
                    e['RightHand']=[.04,-.12*math.sin(phase+2),-.10]
                    e['Head']=[.045*math.sin(phase*2),.07*s,0.]
                    e['Chest']=[breath,.025*s,0.]
            if name in ('wave','talk','sit'):
                # Rest-matched entrance/exit, with a C2-smooth anticipation.
                u=min(t/.55,(duration-t)/.55,1.)
                u=max(0.,u); envelope=u*u*u*(10+u*(-15+6*u))
                for side,sign in [('Left',1),('Right',-1)]:
                    for part,rest in [('Arm',[-.035,0.,sign*.085]),('ForeArm',[-.13,0.,0.]),('Hand',[0.,0.,0.])]:
                        n=side+part
                        e[n]=[r+(v-r)*envelope for r,v in zip(rest,e[n])]
                if name=='sit':
                    e['Spine']=[breath*.7+(e['Spine'][0]-breath*.7)*seat,0.,0.]
                    e['Chest']=[breath*.35+(e['Chest'][0]-breath*.35)*seat,0.,0.]
            # A 3mm numerical clearance keeps the actual deformed shoe
            # surface above the floor between the authored30Hz keys. The
            # periodic cubic export also makes loop velocity continuous.
            hips.append([0.,hy+(.003 if name=='run' else 0.),hz])
            for n in NAMES[1:]:
                values[n].append(quat(*e[n]))
        tracks=[]
        for n,vs in values.items():
            # glTF identity-rest means identically identity rotations need no track.
            if all(abs(x-y)<1e-10 for v in vs for x,y in zip(v,[0,0,0,1])):
                continue
            tracks.append({'bone':n,'path':'rotation','times':times,'values':vs})
        tracks.append({'bone':'Hips','path':'translation','times':times,'values':hips})
        clip={'name':name,'labelHe':{'idle':'עמידה','walk':'הליכה','wave':'הנפת יד','sit':'ישיבה','talk':'שיחה','run':'ריצה'}[name],'duration':duration,'fps':FPS,'loop':True,'samples':count,'rootMotion':False,'tracks':tracks,'authored':True,'capturedMocap':False}
        if name in ('walk','run'):
            clip.update({'speed':stride/(duration*duty),'dutyFactor':duty,'strideMeters':stride,'contacts':contacts,'virtualTravelAxis':'+Z','interpolationFloorClearance':.003 if name=='run' else 0.})
        elif name=='sit':
            clip.update({'seatHeight':.395,'seatDepth':-.41,'support':'seat-and-feet','feetZ':0.,'seatedHold':[.9,3.1],'includesTransitions':True})
        else:
            clip.update({'support':'both-feet'})
        if name=='run':
            # Preserve 30Hz authored inputkeys, with matched periodic glTF
            # Hermite tangents so the exported loop has continuous velocity.
            clip['interpolation']='CUBICSPLINE'
        clips.append(clip)
    return clips
