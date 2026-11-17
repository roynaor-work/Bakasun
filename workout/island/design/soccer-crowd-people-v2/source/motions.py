"""Original periodic crowd keyframes, with two-bone IK for actual hand contacts."""
import math
import numpy as np

CLIPS=[
    dict(id='sit',label='ישיבה',duration=4.0,samples=17),
    dict(id='stand',label='עמידה',duration=4.0,samples=17),
    dict(id='clap',label='מחיאות כפיים',duration=1.2,samples=17),
    dict(id='jump_cheer',label='קפיצה בשמחה',duration=1.8,samples=25),
    dict(id='disappointed',label='אכזבה',duration=3.2,samples=25),
    dict(id='shout',label='צעקה',duration=2.4,samples=25),
    dict(id='wave_clap',label='מחיאה בגל',duration=3.2,samples=33),
]


def qmul(a,b):
    x,y,z,w=a;X,Y,Z,W=b
    return np.array([w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z])


def inv(q):return np.array([-q[0],-q[1],-q[2],q[3]])


def rot(q,v):return np.array(v)+2*np.cross(q[:3],np.cross(q[:3],v)+q[3]*np.array(v))


def axis(a,t):
    a=np.array(a,dtype=float);a/=np.linalg.norm(a)
    return np.r_[a*math.sin(t/2),math.cos(t/2)]


def aim(a,b):
    a=np.array(a,dtype=float);b=np.array(b,dtype=float);a/=np.linalg.norm(a);b/=np.linalg.norm(b)
    dot=float(np.clip(a@b,-1,1))
    if dot<-.999999:
        n=np.cross(a,[0,0,1])
        if np.linalg.norm(n)<.01:n=np.cross(a,[0,1,0])
        return axis(n,math.pi)
    q=np.r_[np.cross(a,b),1+dot];return q/np.linalg.norm(q)


def forward(rig,values):
    worlds={}
    for j in rig:
        v=values[j['name']];parent=worlds.get(j['parent'])
        if parent:
            pq,pp=parent;worlds[j['name']]=(qmul(pq,v['rotation']),pp+rot(pq,v['translation']))
        else:worlds[j['name']]=(v['rotation'],np.array(v['translation']))
    return worlds


def pose(rig,look,clip,u):
    h=look['heightM'];tau=math.tau*u;breath=math.sin(tau);pulse=(1-math.cos(tau))/2
    values={j['name']:dict(translation=np.array(j['translation']),rotation=np.array([0.,0.,0.,1.])) for j in rig}
    byname={j['name']:j for j in rig}
    lean=.018*breath+(max(0,look['age']-55)/600 if clip=='stand' else 0)
    if clip=='disappointed':lean+=.20+.055*pulse
    if clip=='shout':lean+=.06+.025*pulse
    values['Spine']['rotation']=axis([1,0,0],lean)
    values['Chest']['rotation']=axis([0,1,0],.025*breath if clip in ['stand','sit'] else .012*breath)
    values['Head']['rotation']=qmul(axis([1,0,0],.20+.045*pulse if clip=='disappointed' else -.015*breath),axis([0,1,0],.05*breath))
    if clip=='sit':
        values['Hips']['translation'][1]-=h*.230
    for side in ['Left','Right']:
        worlds=forward(rig,values)
        # Set global thigh/calf orientations; the seated feet remain planted.
        thigh=axis([1,0,0],-math.pi/2 if clip=='sit' else (-.16*(1-pulse) if clip=='jump_cheer' else 0))
        calf=axis([1,0,0],.12*(1-pulse) if clip=='jump_cheer' else 0)
        values[side+'UpLeg']['rotation']=qmul(inv(worlds['Hips'][0]),thigh)
        values[side+'Leg']['rotation']=qmul(inv(thigh),calf)
        values[side+'Foot']['rotation']=inv(calf)
    worlds=forward(rig,values)
    # One-time foot grounding also offsets the actual sole, including child sizes.
    sole=[]
    for side in ['Left','Right']:
        q,point=worlds[side+'Foot'];sole.append((point+rot(q,[0,-h*.052,0]))[1])
    lift=h*.15*(math.sin(math.pi*u)**4) if clip=='jump_cheer' else 0
    values['Hips']['translation'][1]+=lift-min(sole)
    worlds=forward(rig,values)
    hips_delta=worlds['Hips'][1]-np.array(byname['Hips']['world'])
    contacts=[]
    for side,sgn in [('Left',1),('Right',-1)]:
        shoulder=worlds[side+'Arm'][1];chestq=worlds['Chest'][0]
        # Targets are normalized by stature, so young and tall people share clips.
        target=np.array([sgn*.160,h*.49,.025*h])
        hand_dir=np.array([0,-1,0]);hand_q=None
        if clip=='sit':target=np.array([sgn*.092,h*.52,.21*h]);hand_dir=np.array([0,-.8,.6])
        if clip=='clap':
            opening=(1-math.cos(2*tau))/2
            target=np.array([sgn*(h*.0075+h*.115*opening),h*.695,h*.175])
            # Fingers point upward, palms face each other, thickness lies on X.
            hand_q=axis([1,1,1],2*math.pi/3) if sgn==1 else qmul(axis([0,0,1],math.pi),axis([1,1,1],2*math.pi/3))
            hand_dir=np.array([0,1,0])
        if clip=='jump_cheer':
            target=np.array([sgn*h*(.18+.045*pulse),h*(1.015+.035*pulse),h*.035]);hand_dir=np.array([sgn*.35,1,0])
        if clip=='disappointed':
            target=np.array([sgn*h*.072,h*.877,h*.107]);hand_dir=np.array([-sgn*.32,.7,-.3])
        if clip=='shout':
            target=np.array([sgn*h*.066,h*.845,h*.13]);hand_dir=np.array([-sgn*.5,.9,.1])
        if clip=='wave_clap':
            rise=(1-math.cos(tau))/2
            opening=.032*(1-math.cos(4*tau))/2
            target=np.array([sgn*h*(.008+opening),h*(.67+.405*rise),h*(.17-.11*rise)])
            hand_q=axis([1,1,1],2*math.pi/3) if sgn==1 else qmul(axis([0,0,1],math.pi),axis([1,1,1],2*math.pi/3))
            hand_dir=np.array([0,1,0])
        # Sitting already contains a vertical displacement; only move hand targets
        # with the torso for airborne clips, never down into the knees for sitting.
        if clip=='sit':
            target[1]=worlds['Hips'][1][1]+h*.075
        else:target+=hips_delta
        pole=np.array([sgn*h*.36,shoulder[1]-h*.12,h*.03])
        if clip in ['jump_cheer','wave_clap']:pole[1]=shoulder[1]+h*.06
        upper=np.array(byname[side+'ForeArm']['translation']);lower=np.array(byname[side+'Hand']['translation'])
        l1=np.linalg.norm(upper);l2=np.linalg.norm(lower)
        d=target-shoulder;distance=np.linalg.norm(d);n=d/distance
        distance=float(np.clip(distance,abs(l1-l2)+1e-5,l1+l2-1e-5));target=shoulder+n*distance
        a=(l1*l1-l2*l2+distance*distance)/(2*distance)
        perp=pole-shoulder-n*((pole-shoulder)@n);perp/=np.linalg.norm(perp)
        elbow=shoulder+n*a+perp*math.sqrt(max(0,l1*l1-a*a))
        uq=aim(upper,elbow-shoulder);fq=aim(lower,target-elbow)
        if hand_q is None:hand_q=aim([sgn,0,0],hand_dir)
        values[side+'Arm']['rotation']=qmul(inv(chestq),uq)
        values[side+'ForeArm']['rotation']=qmul(inv(uq),fq)
        values[side+'Hand']['rotation']=qmul(inv(fq),hand_q)
        contacts.append((target+rot(hand_q,[sgn*h*.029,0,0])).tolist())
    return values,dict(palmCenters=contacts,jumpLiftM=lift)


def bake(rig,look):
    baked=[]
    for info in CLIPS:
        frames=[];meta=[]
        for u in np.linspace(0,1,info['samples']):
            v,m=pose(rig,look,info['id'],float(u));frames.append(v);meta.append(m)
        # Identical endpoints, including quaternion signs, guarantee an exact seam.
        frames[-1]={n:{k:np.array(v) for k,v in d.items()} for n,d in frames[0].items()}
        baked.append(dict(**info,times=np.linspace(0,info['duration'],info['samples']),frames=frames,meta=meta))
    return baked
