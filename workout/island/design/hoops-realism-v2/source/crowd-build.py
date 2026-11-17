"""Original crowd retopology, small painted faces, and looping skin animation.

Reference audit: existing CC0 characters2 body.py/head_hands.py, existing crowd
models in hoops-v5/tennis-v7. Their anatomical landmarks inform new topology;
no downloaded person, photo, external binary, or source mutation is required.
Run: python3 workout/island/design/hoops-realism-v2/source/crowd-build.py
Requires Python, NumPy and Pillow. Outputs only the sibling crowd directory.
"""
from pathlib import Path
import io,json,math,struct
import numpy as np
from PIL import Image,ImageDraw

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'crowd';OUT.mkdir(exist_ok=True)
NAMES=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot']
PARENTS=[None,0,1,2,3,4,3,6,7,3,9,10,1,12,13,1,15,16]
BASE=np.array([[0,0,0],[0,.92,0],[0,1.10,0],[0,1.36,0],[0,1.50,0],[0,1.64,0],[.205,1.435,0],[.25,1.15,.015],[.26,.91,.04],[-.205,1.435,0],[-.25,1.15,.015],[-.26,.91,.04],[.105,.885,0],[.105,.49,.015],[.105,.09,.01],[-.105,.885,0],[-.105,.49,.015],[-.105,.09,.01]],dtype=float)
CLIPS=[('sit',3.2),('stand',3.2),('clap',1.2),('jump',1.6),('disappointed',2.8),('shout',2.)]
SPECS=[
 ('ילד · גופיית ענבר','child',1.18,'#A66D47','#241A15','#E3AB35','team-jersey','curls',[],.88),
 ('ילדה · ג׳קט מנטה','child',1.26,'#E5B997','#593D2B','#4C9C96','jacket','pony',[],.84),
 ('נער · כובע כחול','child',1.38,'#68452F','#211B17','#366A9D','team-jersey','cap',['cap'],.91),
 ('נערה · חולצה אלמוגית','child',1.43,'#BF8B60','#30231D','#CC6552','t-shirt','bob',['glasses'],.90),
 ('אוהד · חולצת קבוצה סגולה','adult',1.78,'#784E36','#1D1716','#74559A','team-jersey','crop',[],1.00),
 ('אוהדת · ג׳קט כהה','adult',1.69,'#D9AC85','#3A241B','#3C5666','jacket','bun',[],.94),
 ('אוהד · ג׳קט זית','adult',1.84,'#E4C2A4','#49352B','#7E8851','jacket','crop',['glasses'],1.12),
 ('אוהדת · גופיית ענבר','adult',1.72,'#563A2B','#191615','#DB9D2E','team-jersey','curls',[],.96),
 ('אוהד · כובע אדום','adult',1.76,'#AE7650','#2C201A','#AF4F4C','t-shirt','cap',['cap'],1.04),
 ('אוהדת · חולצה טורקיז','adult',1.66,'#B28760','#211A17','#39968D','t-shirt','pony',[],.95),
 ('אוהד · גופייה כחולה','adult',1.81,'#C38A5D','#241D19','#3D70A4','team-jersey','bald',[],1.10),
 ('אוהדת · ג׳קט שזיף','adult',1.74,'#E7BD9A','#5A3522','#865269','jacket','bob',['glasses'],1.03),
 ('סבא · סריג שנהב','senior',1.70,'#DAB18B','#B9B6AB','#D7C9AA','sweater','silver',['glasses'],1.00),
 ('סבתא · ג׳קט כחול','senior',1.59,'#996D4C','#C7C3B8','#4F7692','jacket','bun',['glasses'],1.10),
 ('סבא · גופיית ענבר','senior',1.75,'#694A36','#B5AEA0','#D2A437','team-jersey','bald',[],1.04),
 ('סבתא · סריג מרווה','senior',1.63,'#D5A47B','#C7B6A0','#91A18A','sweater','bob',[],1.02),
]

def rgb(s):return np.array([int(s[i:i+2],16)/255 for i in (1,3,5)],float)
def linear(c):
 c=np.asarray(c);return np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4)
def norm(a):
 a=np.asarray(a,float);return a/max(np.linalg.norm(a),1e-10)
def mul(a,b):
 x,y,z,w=a;X,Y,Z,W=b
 return np.array([w*X+x*W+y*Z-z*Y,w*Y-x*Z+y*W+z*X,w*Z+x*Y-y*X+z*W,w*W-x*X-y*Y-z*Z])
def inv(q):return np.array([-q[0],-q[1],-q[2],q[3]])
def quat(x=0,y=0,z=0):
 qx=[math.sin(x/2),0,0,math.cos(x/2)];qy=[0,math.sin(y/2),0,math.cos(y/2)];qz=[0,0,math.sin(z/2),math.cos(z/2)]
 return mul(mul(qz,qy),qx)
def aim(a,b):
 a,b=norm(a),norm(b);d=float(np.dot(a,b))
 if d<-.9999:return quat(math.pi)
 q=np.r_[np.cross(a,b),1+d];return q/np.linalg.norm(q)

def arm_ik(index,target,pole,build):
 """Analytic two-bone solve; both segment lengths and the hand goal are exact."""
 rest=BASE[index:index+3].copy();rest[:,0]*=build
 shoulder=rest[0];u=rest[1]-rest[0];v=rest[2]-rest[1];target=np.array(target,float);pole=np.array(pole,float)
 delta=target-shoulder;distance=float(np.linalg.norm(delta));direction=norm(delta);l1=float(np.linalg.norm(u));l2=float(np.linalg.norm(v))
 distance=float(np.clip(distance,abs(l1-l2)+1e-5,l1+l2-1e-5));hint=pole-shoulder;bend=norm(hint-direction*np.dot(hint,direction))
 a=(l1*l1-l2*l2+distance*distance)/(2*distance);elbow=shoulder+direction*a+bend*math.sqrt(max(0,l1*l1-a*a))
 upper=aim(u,elbow-shoulder);lower=aim(v,shoulder+direction*distance-elbow)
 return upper,mul(inv(upper),lower)

class Mesh:
 def __init__(self,look):self.p=[];self.c=[];self.j=[];self.uv=[];self.f=[];self.look=look
 def add(self,p,faces,colors,joints,uv=None):
  start=len(self.p);self.p.extend(p);self.f.extend([[start+x for x in f] for f in faces]);self.c.extend(colors);self.j.extend(joints);self.uv.extend(uv or [[.01,.01]]*len(p))
 def tube(self,points,radii,segs,color,joints,cap=False):
  points=np.array(points,float);p=[];f=[];cols=[];js=[]
  direction=norm(points[-1]-points[0]);side=norm(np.cross(direction,[0,0,1]));depth=norm(np.cross(side,direction))
  if segs==2:
   # Far LOD crossed ribbons: two intersecting planes, never coincident backs.
   for i,center in enumerate(points):
    rr=radii[i];rx,rz=(rr,rr) if np.isscalar(rr) else rr
    for offset in [side*rx,-side*rx,depth*rz,-depth*rz]:p.append(center+offset);cols.append(color);js.append(joints[i] if isinstance(joints,list) else joints)
   for i in range(len(points)-1):
    for a,b in [(0,1),(2,3)]:
     a+=i*4;b+=i*4;c=a+4;d=b+4;f.extend([[a,c,b],[b,c,d]])
   self.add(p,f,cols,js);return
  for i,center in enumerate(points):
   rr=radii[i];rx,rz=(rr,rr) if np.isscalar(rr) else rr
   for k in range(segs):
    a=math.tau*k/segs;p.append(center+side*math.cos(a)*rx+depth*math.sin(a)*rz);cols.append(color);js.append(joints[i] if isinstance(joints,list) else joints)
  for i in range(len(points)-1):
   for k in range(segs):
    a=i*segs+k;b=i*segs+(k+1)%segs;c=(i+1)*segs+k;d=(i+1)*segs+(k+1)%segs;f.extend([[a,c,b],[b,c,d]])
  if cap:
   for r,reverse in [(0,False),(len(points)-1,True)]:
    center=len(p);p.append(points[r]);cols.append(color);js.append(joints[r] if isinstance(joints,list) else joints)
    for k in range(segs):
     tri=[center,r*segs+k,r*segs+(k+1)%segs];f.append(tri[::-1] if reverse else tri)
  self.add(p,f,cols,js)
 def rings(self,rings,segs,color,joint,cap_bottom=False,cap_top=False,head=False,torso=False):
  p=[];f=[];uv=[];cols=[];js=[]
  for ri,(y,rx,rz,cz) in enumerate(rings):
   for k in range(segs+1):
    a=-math.pi+math.tau*k/segs;p.append([rx*math.sin(a),y,cz+rz*math.cos(a)])
    uv.append([k/segs*.5,1-(y-1.55)/.23] if head else [.5+k/segs*.5,1-(y-.91)/.60] if torso else [.005,.01]);cols.append([1,1,1] if head or torso else color);js.append(joint if not isinstance(joint,list) else joint[ri])
  for r in range(len(rings)-1):
   for k in range(segs):
    a=r*(segs+1)+k;b=a+1;c=a+segs+1;d=c+1;f.extend([[a,b,c],[b,d,c]])
  for r,yes in [(0,cap_bottom),(len(rings)-1,cap_top)]:
   if not yes:continue
   y,rx,rz,cz=rings[r];center=len(p);p.append([0,y+(.035 if head and r else 0),cz]);cols.append([1,1,1] if head else color);uv.append([.25,.025] if head else [.005,.01]);js.append(joint if not isinstance(joint,list) else joint[r])
   for k in range(segs):
    tri=[center,r*(segs+1)+k,r*(segs+1)+k+1];f.append(tri if r else tri[::-1])
  self.add(p,f,cols,js,uv)
 def tetra(self,center,size,color,joint):
  c=np.array(center);sx,sy,sz=size;p=[c+[-sx,-sy,-sz],c+[sx,-sy,-sz],c+[0,sy,0],c+[0,-sy,sz]]
  self.add(p,[[0,2,1],[0,1,3],[0,3,2],[1,2,3]],[color]*4,[joint]*4)
 def flat(self,p,j,color):
  self.add(p,[[0,i,i+1] for i in range(1,len(p)-1)],[color]*len(p),j if isinstance(j,list) else [j]*len(p))

def texture(look):
 skin=tuple(int(x*255) for x in rgb(look['skin']));hair=tuple(int(x*255) for x in rgb(look['hairColor']));im=Image.new('RGB',(128,128),skin);d=ImageDraw.Draw(im)
 # Ears and shaded temples, eyes, eyelids, nose, lips, cheek plane, and brows.
 shade=tuple(max(0,int(x*.82)) for x in skin);light=tuple(min(255,int(x*1.06)) for x in skin)
 d.rectangle((0,40,27,127),fill=shade);d.rectangle((101,40,127,127),fill=shade)
 d.polygon([(56,66),(64,54),(71,67),(66,79)],fill=light);d.line((64,58,61,78,67,79),fill=shade,width=2)
 for x in (55,73):
  d.ellipse((x-5,55,x+5,60),fill=(226,219,204));d.ellipse((x-2,55,x+1,60),fill=(39,31,28));d.line((x-5,54,x+4,53),fill=hair,width=2)
 d.arc((55,75,74,91),0,170,fill=shade,width=2);d.line((59,85,69,85),fill=(99,57,47),width=1)
 if look['ageGroup']=='senior':
  for x in [48,77]:d.line((x,62,x+4,65),fill=shade,width=1)
  d.line((51,43,77,43),fill=shade,width=1);d.line((54,47,75,47),fill=shade,width=1)
 if look['hair']!='bald':
  d.polygon([(0,0),(128,0),(128,68),(96,65),(86,43),(81,30),(70,36),(55,29),(43,39),(34,64),(0,68)],fill=hair)
 if look['hair']=='bald':d.rectangle((0,23,28,67),fill=hair);d.rectangle((100,23,128,67),fill=hair)
 if 'glasses' in look['accessories']:
  for x in (55,73):d.rounded_rectangle((x-6,52,x+6,63),radius=2,outline=(36,40,40),width=2)
  d.line((61,56,67,56),fill=(36,40,40),width=2);d.line((39,56,49,57),fill=(36,40,40),width=2);d.line((79,57,90,56),fill=(36,40,40),width=2)
 face=im;im=Image.new('RGB',(256,128),'white');im.paste(face,(0,0));d=ImageDraw.Draw(im)
 d.rectangle((128,0,255,127),fill=look['shirt'])
 if look['outfit']=='jacket':
  d.polygon([(182,0),(194,48),(184,127),(205,127),(198,48),(208,0)],fill='#DFD8C9')
  d.line((194,0,194,127),fill='#343A3A',width=2)
 elif look['outfit']=='team-jersey':
  from PIL import ImageFont
  font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',30)
  d.text((179,35),str(7+int(look['id'][-2:])),font=font,fill='#F4E8D4',stroke_width=1,stroke_fill='#25303A')
  d.line((178,0,184,13,201,13,207,0),fill='#F4E8D4',width=4)
 else:
  d.arc((181,-15,207,14),0,180,fill='#DFD8C9',width=3)
 d.rectangle((0,0,4,4),fill=(255,255,255))
 out=io.BytesIO();im.save(out,format='PNG',optimize=True);return out.getvalue()

def shape(look,lod):
 m=Mesh(look);skin=rgb(look['skin']);shirt=rgb(look['shirt']);pants=rgb('#39414C' if look['outfit']!='team-jersey' else '#333343');shoe=rgb('#D6D2C7');hair=rgb(look['hairColor']);wide=look['build'];child=look['ageGroup']=='child'
 if lod==0:
  # 36 torso + 16 pelvis + 30 head + 8 neck + 40 arms + 64 legs + 12 hair + 4 ears/tail = 210.
  m.rings([(.91,.157*wide,.104,0),(1.25,.217*wide,.118,0),(1.435,.221*wide,.095,0),(1.505,.052,.044,0)],6,shirt,[1,2,3,3],torso=True)
  pelvis_start=len(m.p)
  m.rings([(.815,.150*wide,.103,0),(.96,.164*wide,.106,0)],6,pants,1)
  # Four triangles close the pelvis underside over the moving thigh sockets.
  m.f.extend([[pelvis_start,pelvis_start+i+1,pelvis_start+i] for i in range(1,5)])
  m.rings([(1.55,.052,.057,.008),(1.660,.081,.079,0),(1.745,.064,.065,-.007)],6,skin,5,cap_top=True,head=True)
  m.tube([[0,1.462,0],[0,1.575,0]],[(.048,.046),(.044,.043)],4,skin,4)
  for side,sign in [(6,1),(9,-1)]:
   a=BASE[side].copy();b=BASE[side+1].copy();c=BASE[side+2].copy();a[0]*=wide;b[0]*=wide;c[0]*=wide;a[1]-=.025
   sleeve=skin if look['outfit']=='team-jersey' else shirt
   # One continuous loft shares the elbow ring; no exposed cylinder ends.
   first=len(m.c)
   m.tube([a,b,c],[(.067,.061),(.043,.040),(.027,.025)],4,sleeve,[side,side+1,side+1])
   if look['outfit']=='t-shirt':m.c[first+4:first+12]=[skin]*8
   m.tetra(c+[sign*.003,-.046,.006],[.031,.054,.022],skin,side+2)
  for side,sign in [(12,1),(15,-1)]:
   a=BASE[side].copy();b=BASE[side+1].copy();c=BASE[side+2].copy();a[0]*=wide;b[0]*=wide;c[0]*=wide
   m.tube([a,(a+b)/2,b,c],[(.089,.091),(.073,.078),(.052,.055),(.032,.032)],4,pants,[side,side,side+1,side+1])
   x=c[0];p=[[x-.037,.012,-.052],[x+.037,.012,-.052],[x+.043,.012,.125],[x-.043,.012,.125],[x,.094,-.026],[x,.066,.102]]
   m.add(p,[[0,2,1],[0,3,2],[0,1,4],[2,3,5],[0,4,3],[3,4,5],[1,2,4],[2,5,4]],[shoe,shoe,shoe,shoe,rgb('#687177'),rgb('#899194')],[side+2]*6)
  # Hair volume: geometry silhouette separates crops, caps, bobs, curls and updos.
  y0=1.643 if look['hair']=='bob' else 1.707
  lower=.077 if look['hair']!='bald' else .074;top=.065
  if look['hair']=='cap':lower=.091;top=.063;y0=1.710
  if look['hair']=='curls':lower=.094;top=.072;y0=1.685
  if look['hair']=='bob':lower=.086
  # Scalp-hugging lower edge follows the forehead instead of a horizontal bucket.
  start=len(m.p);m.rings([(y0,lower,.082 if look['hair']=='cap' else lower,-.008),(1.750 if look['hair']!='cap' else 1.77,top,.067,-.011)],6,hair if look['hair']!='cap' else shirt,5)
  for k in range(7):
   a=-math.pi+math.tau*k/6
   if look['hair'] not in ['cap','bald']:m.p[start+k][1]+=max(math.cos(a),0)*(.045 if look['hair']=='bob' else .016)-max(-math.cos(a),0)*.020
   if look['hair']=='cap' and math.cos(a)>.4:m.p[start+k][2]+=.045
  if look['hair'] in ['pony','bun']:
   m.tetra([0,1.665 if look['hair']=='pony' else 1.742,-.108],[.035,.11 if look['hair']=='pony' else .037,.049],hair,5)
  else:
   for s in [-1,1]:m.flat([[s*.078,1.642,.005],[s*.091,1.622,-.006],[s*.079,1.598,.001],[s*.076,1.621,.018]],5,skin)
 elif lod==1:
  # 24 torso + 6 pelvis + 12 head + 4 neck + 24 arms + 16 legs + 4 shoes = 90.
  m.rings([(.91,.157*wide,.104,0),(1.25,.217*wide,.118,0),(1.435,.221*wide,.095,0),(1.505,.052,.044,0)],4,shirt,[1,2,3,3],torso=True)
  m.rings([(.815,.150*wide,.103,0),(.96,.164*wide,.106,0)],3,pants,1)
  m.rings([(1.55,.058,.063,.007),(1.770,.075,.076,0)],4,skin,5,cap_top=True,head=True)
  m.tube([[0,1.462,0],[0,1.575,0]],[(.048,.046),(.044,.043)],2,skin,4)
  for side,sign in [(6,1),(9,-1)]:
   a,b,c=BASE[side:side+3].copy();a[0]*=wide;b[0]*=wide;c[0]*=wide;c[1]-=.065
   m.tube([a,b,c],[(.064,.059),(.043,.040),(.029,.027)],3,skin if look['outfit']=='team-jersey' else shirt,[side,side+1,side+1])
  for side,sign in [(12,1),(15,-1)]:
   a,b,c=BASE[side:side+3].copy();a[0]*=wide;b[0]*=wide;c[0]*=wide;c[1]=.025;c[2]=.07
   m.tube([a,b,c],[(.089,.091),(.053,.055),(.035,.06)],2,pants,[side,side+1,side+1])
   x=c[0];m.flat([[x-.041,.014,-.05],[x+.041,.014,-.05],[x+.042,.014,.14],[x-.042,.014,.14]],side+2,shoe)
 else:
  # 24-triangle skinned silhouette for far stands; not an unanimated card.
  m.flat([[-.16*wide,.92,0],[.16*wide,.92,0],[.23*wide,1.40,0],[.052,1.51,0],[-.052,1.51,0],[-.23*wide,1.40,0]],3,shirt)
  m.flat([[-.15*wide,.85,0],[.15*wide,.85,0],[.16*wide,.96,0],[-.16*wide,.96,0]],1,pants)
  m.flat([[-.052,1.55,0],[.052,1.55,0],[.081,1.66,0],[.052,1.77,0],[-.052,1.77,0],[-.081,1.66,0]],5,skin)
  m.flat([[-.045,1.49,0],[.045,1.49,0],[.045,1.575,0],[-.045,1.575,0]],4,skin)
  for side,sign in [(6,1),(9,-1)]:
   a,b,c=BASE[side:side+3].copy();a[0]*=wide;b[0]*=wide;c[0]*=wide
   m.flat([a+[sign*.045,0,0],a+[-sign*.045,0,0],b],side,shirt if look['outfit']!='team-jersey' else skin)
   m.flat([b+[sign*.036,0,0],b+[-sign*.036,0,0],c+[0,-.07,0]],side+1,skin)
  for side,sign in [(12,1),(15,-1)]:
   x=sign*.105*wide
   m.flat([[x-.067,.89,0],[x+.067,.89,0],[x+.045,.49,0],[x-.045,.49,0]],side,pants)
   m.flat([[x-.045,.50,0],[x+.045,.50,0],[x,.06,.01]],side+1,pants)
   m.flat([[x-.042,.012,.0],[x+.042,.012,.0],[x,.08,.12]],side+2,shoe)
 # Age-specific head proportion and body build applied in mesh and skin bind.
 p=np.array(m.p);head=p[:,1]>1.49
 if child:p[head,0]*=1.13;p[head,1]=1.49+(p[head,1]-1.49)*1.11;p[head,2]*=1.13
 p*=look['height']/(1.815 if child else 1.786)
 if look['ageGroup']=='senior':p[:,2]+=.035*np.clip((p[:,1]/look['height']-.50)/.50,0,1)
 m.p=p.tolist()
 assert len(m.f)==[210,90,24][lod],(look['id'],lod,len(m.f))
 return m

def animation(look,positions):
 result=[];s=look['height']/(1.815 if look['ageGroup']=='child' else 1.786)
 for name,duration in CLIPS:
  times=np.linspace(0,duration,9,dtype=np.float32);rots={i:[] for i in range(18)};hip=[]
  for frame,t in enumerate(times):
   f=frame/8;phase=math.tau*f;wave=math.sin(phase);pulse=math.sin(math.pi*f)**2
   q={i:np.array([0.,0,0,1]) for i in range(18)};hp=positions[1]-positions[0]
   if name=='stand':q[2]=quat(.015*wave);q[5]=quat(0,.035*wave);hp=hp+[0,.004*s*wave,0]
   if name=='sit':
    hp=hp+[0,-.407*s,.015*s];q[12]=quat(-math.pi/2,0,-.03);q[15]=quat(-math.pi/2,0,.03);q[13]=quat(math.pi/2);q[16]=quat(math.pi/2);q[2]=quat(.025+.010*wave)
    for i,sign in [(6,1),(9,-1)]:q[i]=quat(-.60,0,sign*.10);q[i+1]=quat(.15)
   if name=='clap':
    for i,sign in [(6,1),(9,-1)]:
     hand=[sign*(.010+.080*(.5+.5*math.cos(phase*2))),1.285,.35]
     q[i],q[i+1]=arm_ik(i,hand,[sign*.33,1.16,.17],look['build'])
    q[5]=quat(-.035+.02*wave)
   if name=='jump':
    hp=hp+[0,.215*s*pulse,0];q[2]=quat(-.04*pulse)
    for i,sign in [(6,1),(9,-1)]:q[i]=quat(-2.45-.25*pulse,0,sign*.20);q[i+1]=quat(-.25+.13*wave)
    for i in [12,15]:q[i]=quat(-.20*pulse);q[i+1]=quat(.35*pulse)
   if name=='disappointed':
    q[2]=quat(.13+.035*pulse);q[5]=quat(.24+.07*pulse)
    # One hand on the brow, the other hanging, with slumped head and chest.
    q[6],q[7]=arm_ik(6,[.035,1.69,.095],[.36,1.48,.15],look['build']);q[9]=quat(.08,0,.03);q[10]=quat(-.10)
   if name=='shout':
    for i,sign in [(6,1),(9,-1)]:
     q[i],q[i+1]=arm_ik(i,[sign*.060,1.615,.13],[sign*.40,1.30,.10],look['build'])
    q[5]=quat(-.035,0,.035*wave);q[2]=quat(-.035+.017*wave)
   for i in range(18):rots[i].append(q[i].tolist())
   hip.append(hp.tolist())
  # Explicit identical boundary samples, no seam and no accumulated root motion.
  for i in rots:rots[i][-1]=rots[i][0]
  hip[-1]=hip[0]
  result.append((name,times,rots,hip))
 return result

class GLB:
 def __init__(self):self.data=bytearray();self.doc={'asset':{'version':'2.0','generator':'Hoops realism v2 original crowd retopology'},'buffers':[{}],'bufferViews':[],'accessors':[]}
 def view(self,data,target=None):
  while len(self.data)%4:self.data.append(0)
  v={'buffer':0,'byteOffset':len(self.data),'byteLength':len(data)}
  if target:v['target']=target
  self.data.extend(data);self.doc['bufferViews'].append(v);return len(self.doc['bufferViews'])-1
 def acc(self,array,typ,component=5126,target=None,bounds=False):
  dt={5126:'<f4',5123:'<u2'}[component];a=np.array(array,dtype=dt);v=self.view(a.tobytes(),target);entry={'bufferView':v,'componentType':component,'count':len(a),'type':typ}
  if bounds:entry['min']=np.atleast_1d(a.min(axis=0)).astype(float).tolist();entry['max']=np.atleast_1d(a.max(axis=0)).astype(float).tolist()
  self.doc['accessors'].append(entry);return len(self.doc['accessors'])-1
 def write(self,path):
  while len(self.data)%4:self.data.append(0)
  self.doc['buffers'][0]['byteLength']=len(self.data);s=json.dumps(self.doc,separators=(',',':'),ensure_ascii=False).encode();s+=b' '*((-len(s))%4)
  path.write_bytes(struct.pack('<III',0x46546c67,2,12+8+len(s)+8+len(self.data))+struct.pack('<II',len(s),0x4e4f534a)+s+struct.pack('<II',len(self.data),0x004e4942)+self.data)

def export(look,lod):
 m=shape(look,lod);g=GLB();d=g.doc;p=np.array(m.p);normal=np.zeros_like(p)
 for face in m.f:
  a,b,c=p[face];n=norm(np.cross(b-a,c-a))
  for i in face:normal[i]+=n
 normal=np.array([norm(n) for n in normal]);joints=np.zeros((len(p),4),np.uint16);joints[:,0]=m.j;weights=np.zeros((len(p),4));weights[:,0]=1
 attrs={'POSITION':g.acc(p,'VEC3',target=34962,bounds=True),'NORMAL':g.acc(normal,'VEC3',target=34962),'COLOR_0':g.acc(linear(m.c),'VEC3',target=34962),'TEXCOORD_0':g.acc(m.uv,'VEC2',target=34962),'JOINTS_0':g.acc(joints,'VEC4',5123,34962),'WEIGHTS_0':g.acc(weights,'VEC4',target=34962)}
 indices=g.acc(np.array(m.f).reshape(-1),'SCALAR',5123,34963)
 image=g.view(texture(look));d['images']=[{'bufferView':image,'mimeType':'image/png'}];d['samplers']=[{'magFilter':9729,'minFilter':9729,'wrapS':33071,'wrapT':33071}];d['textures']=[{'sampler':0,'source':0}]
 d['materials']=[{'name':'Painted skin and casual clothing','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.88},'doubleSided':True}]
 d['meshes']=[{'name':look['id']+'-human-lod'+str(lod),'primitives':[{'attributes':attrs,'indices':indices,'material':0}],'extras':{'triangles':[210,90,24][lod],'ageGroup':look['ageGroup'],'outfit':look['outfit'],'hair':look['hair']}}]
 scale=look['height']/(1.815 if look['ageGroup']=='child' else 1.786);pos=BASE.copy();pos[:,0]*=look['build'];pos*=scale
 d['nodes']=[]
 for i,name in enumerate(NAMES):
  node={'name':name,'translation':(pos[i]-(pos[PARENTS[i]] if PARENTS[i] is not None else 0)).tolist()};children=[k for k,v in enumerate(PARENTS) if v==i]
  if children:node['children']=children
  d['nodes'].append(node)
 d['nodes'].append({'name':look['id'],'mesh':0,'skin':0});d['scenes']=[{'nodes':[0,18]}];d['scene']=0
 ib=[]
 for v in pos:
  mat=np.eye(4);mat[:3,3]=-v;ib.append(mat.T.reshape(-1))
 d['skins']=[{'name':'CrowdHuman18','joints':list(range(18)),'skeleton':0,'inverseBindMatrices':g.acc(ib,'MAT4')}]
 d['animations']=[]
 for name,times,rots,hips in animation(look,pos):
  inputs=g.acc(times,'SCALAR',bounds=True);samplers=[];channels=[]
  for i in range(1,18):
   values=rots[i]
   if all(np.max(np.abs(np.array(v)-[0,0,0,1]))<1e-8 for v in values):continue
   si=len(samplers);samplers.append({'input':inputs,'output':g.acc(values,'VEC4'),'interpolation':'LINEAR'});channels.append({'sampler':si,'target':{'node':i,'path':'rotation'}})
  si=len(samplers);samplers.append({'input':inputs,'output':g.acc(hips,'VEC3'),'interpolation':'LINEAR'});channels.append({'sampler':si,'target':{'node':1,'path':'translation'}})
  d['animations'].append({'name':name,'samplers':samplers,'channels':channels,'extras':{'loop':True,'duration':float(times[-1]),'rootMotion':False}})
 d['extras']={'license':'CC0-1.0','units':'metres','forward':'+Z','up':'+Y','lod':lod,'id':look['id'],'farLod':lod==2}
 path=OUT/(look['id']+'-lod'+str(lod)+'.glb');g.write(path)
 return {'level':lod,'path':'crowd/'+path.name,'triangles':len(m.f),'vertices':len(p),'bytes':path.stat().st_size}

def main():
 fans=[]
 for i,(label,age,height,skin,hair,shirt,outfit,style,accessories,build) in enumerate(SPECS):
  look={'id':f'fan-{i+1:02d}','label':label,'ageGroup':age,'height':height,'skin':skin,'hairColor':hair,'shirt':shirt,'outfit':outfit,'hair':style,'accessories':accessories,'build':build}
  look['lods']=[export(look,lod) for lod in range(3)];fans.append(look);print(look['id'],sum(x['bytes'] for x in look['lods']))
 catalog={'schemaVersion':1,'rig':'CrowdHuman18','units':'metres','up':'+Y','forward':'+Z','bindPose':'natural standing, arms lowered','clips':[{'name':name,'duration':duration,'loop':True} for name,duration in CLIPS],'lodPolicy':{'thresholdsMetres':[0,12,25],'triangles':[210,90,24],'lod1':'Volumetric head/torso with continuous triangular arm lofts and crossed leg/neck ribbons; intended for medium-distance stands','lod2':'24-triangle double-sided skinned silhouette for distant stands; no texture impostor'},'provenance':{'geometry':'Original anatomical retopology informed by existing CC0 characters2 body and head surfaces; no copied geometry','textures':'Original 256x128 painted face and garment atlas per fan, embedded in GLB','numeralGlyphs':'Rasterized system DejaVu Sans Bold; font software is not included','license':'CC0-1.0 for original artwork; DejaVu glyph design retains its upstream license'},'fans':fans,'totalGlbBytes':sum(l['bytes'] for f in fans for l in f['lods'])}
 (OUT/'catalog.json').write_text(json.dumps(catalog,indent=2,ensure_ascii=False)+'\n');print('TOTAL',catalog['totalGlbBytes'])

if __name__=='__main__':main()
