"""Arm angles (degrees) from authored clips by forward kinematics. Evidence only.
Usage: python3 tools/soccer-arm-angles.py [clip ...]
abduction = angle of the upper arm away from the body's down axis in the frontal plane (0 hanging, 90 = T-pose);
flex = elbow flexion (0 straight); fwd = upper arm forward swing (+ forward) in the sagittal plane."""
import json,sys,math
import numpy as np
def q2m(q):
    x,y,z,w=q;n=math.sqrt(x*x+y*y+z*z+w*w);x,y,z,w=x/n,y/n,z/n,w/n
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
base='design/'
packs=[json.load(open(base+p)) for p in ['motion/soccer.json','motion2/soccer/throws-receives.json','motion2/soccer/kicks-locomotion.json','motion2/soccer/tackles-reactions.json']]
states={};
for p in packs: states.update(p['states'])
try:
    states.update(json.load(open('assets/soccer-v7/clips.json'))['states'])
except Exception as e: pass
bones={b['name']:b for b in packs[0]['skeleton']['bones']}
def fk(rot):
    W={}
    for name,b in bones.items():
        R=q2m(rot.get(name,[0,0,0,1])); par=b['parent']
        if par is None: W[name]=R
        else: W[name]=W[par]@R
    return W
def arm(rot,side):
    W=fk(rot);A=W[side+'Arm'];F=W[side+'ForeArm']
    up=A@np.array([0,-1,0]);fa=F@np.array([0,-1,0])
    sgn=1 if side=='Left' else -1
    abd=math.degrees(math.atan2(sgn*up[0],-up[1]));fwd=math.degrees(math.atan2(up[2],-up[1]))
    flex=math.degrees(math.acos(max(-1,min(1,float(up@fa)))))
    return abd,fwd,flex
for name in (sys.argv[1:] or ['idle','run','celebrate','goal_celebration','fall','slide_straight','slide_straight_fall','slide_straight_recover','recover']):
    s=states.get(name)
    if not s: print(name,'missing');continue
    ks=s['keyframes'];rows=[]
    for k in ks:
        l=arm(k['rotations'],'Left');r=arm(k['rotations'],'Right');rows.append((k['time'],l,r))
    ab=[max(a[1][0],a[2][0]) for a in rows];fl=[min(a[1][2],a[2][2]) for a in rows]
    print(f"{name:26s} dur={s['durationSeconds']:.2f} abduction max L/R {max(r[1][0] for r in rows):6.1f}/{max(r[2][0] for r in rows):6.1f}  elbow flex min/max {min(min(r[1][2],r[2][2]) for r in rows):5.1f}/{max(max(r[1][2],r[2][2]) for r in rows):5.1f}  fwd swing range {min(min(r[1][1],r[2][1]) for r in rows):6.1f}..{max(max(r[1][1],r[2][1]) for r in rows):6.1f}")
