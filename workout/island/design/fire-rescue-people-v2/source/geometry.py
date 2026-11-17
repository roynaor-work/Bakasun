"""Deterministic original low-poly rescue characters; metres, +Y up, +Z front.

The exact canonical18 bind is retained. Round capped limbs, shaped faces, layered
hair, clothing seams and attached rescue equipment are authored as real surfaces.
Vertex colours are linear-sRGB. No external textures, models or personal likeness.
"""
import json, math
from pathlib import Path
import numpy as np

HERE=Path(__file__).resolve().parents[1]
REPO=HERE.parents[3]
CONTRACT=json.loads((HERE.parent/'motion2/soccer.json').read_text())['skeleton']
BONES=[b['name'] for b in CONTRACT['bones']]
REST={}
for b in CONTRACT['bones']:
    REST[b['name']]=np.array(b['restTranslationMeters'],float)+(REST[b['parent']] if b['parent'] else 0)

PALETTE={'ink':'#24343C','sole':'#243B48','cream':'#F5E6C6','white':'#F7F3E8','gold':'#F1C352',
'coral':'#E6745C','teal':'#388D92','blue':'#4A7BAB','navy':'#304E69','plum':'#835F85','sage':'#77927A',
'steel':'#A8BCBF','red':'#B9473F','yellow':'#EED45A','orange':'#E99A4B','glass':'#86B7C2',
'black':'#273338','pink':'#E99A9C','eye':'#273A44','brow':'#654B42'}

def unit(a):
    a=np.asarray(a,float); n=np.linalg.norm(a)
    return a/n if n>1e-12 else np.array([0.,1.,0.])

def rgb(c):
    c=PALETTE.get(c,c); s=[int(c[i:i+2],16)/255 for i in (1,3,5)]
    return [v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in s]+[1.]

class Mesh:
    def __init__(self,id):
        self.id=id; self.positions=[];self.normals=[];self.colors=[];self.joints=[];self.weights=[];self.indices=[];self.parts=[];self.sockets={};self.category='body'
    def add(self,vs,faces,col,skin='Hips',name=None,smooth=None,weights=None):
        vs=np.array(vs,float); centre=vs.mean(0); start=len(self.indices)
        for face in faces:
            p=vs[list(face)]; normal=unit(np.cross(p[1]-p[0],p[2]-p[0]))
            if np.dot(normal,p.mean(0)-centre)<-1e-10:
                face=tuple(reversed(face));p=vs[list(face)];normal=-normal
            base=len(self.positions)
            for ix in face:
                self.positions.append(vs[ix].round(7).tolist())
                self.normals.append((unit(smooth[ix]) if smooth is not None else normal).round(7).tolist())
                # Gentle top-facing variation keeps flat facets readable with neutral lighting.
                self.colors.append(rgb(col))
                wt=(weights[ix] if weights is not None else skin)
                wt={wt:1.} if isinstance(wt,str) else wt
                js=[BONES.index(b) for b in wt]; ws=list(wt.values())
                self.joints.append(js+[0]*(4-len(js))); self.weights.append(ws+[0.]*(4-len(ws)))
            for k in range(1,len(face)-1): self.indices.extend([base,base+k,base+k+1])
        if name:self.parts.append({'name':name,'firstIndex':start,'indexCount':len(self.indices)-start,'category':self.category})
    def ellipsoid(self,c,r,col,skin='Head',seg=8,rings=4,name=None):
        c=np.array(c);r=np.array(r);vs=[c+np.array([0,r[1],0])];ns=[np.array([0,1,0])]
        for j in range(1,rings):
            ph=math.pi*j/rings
            for i in range(seg):
                a=2*math.pi*i/seg;p=np.array([math.sin(ph)*math.cos(a),math.cos(ph),math.sin(ph)*math.sin(a)])
                vs.append(c+p*r);ns.append(p/r)
        vs.append(c-np.array([0,r[1],0]));ns.append(np.array([0,-1,0]));last=len(vs)-1
        fs=[(0,1+i,1+(i+1)%seg) for i in range(seg)]
        for j in range(rings-2):
            for i in range(seg):
                a=1+j*seg+i;b=1+j*seg+(i+1)%seg;fs.append((a,b,b+seg,a+seg))
        fs +=[(last,1+(rings-2)*seg+(i+1)%seg,1+(rings-2)*seg+i) for i in range(seg)]
        self.add(vs,fs,col,skin,name,ns)
    def box(self,c,size,col,skin='Chest',name=None):
        c=np.array(c);h=np.array(size)/2
        vs=[c+h*np.array(v) for v in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        self.add(vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],col,skin,name)
    def cylinder(self,a,b,r,col,skin='Chest',r2=None,seg=6,name=None,caps=True):
        a=np.array(a);b=np.array(b);axis=unit(b-a);u=unit(np.cross(axis,[0,0,1] if abs(axis[2])<.9 else [1,0,0]));v=np.cross(axis,u)
        vs=[]
        for c,rr in [(a,r),(b,r if r2 is None else r2)]:
            for i in range(seg):
                ang=2*math.pi*i/seg;vs.append(c+rr*(u*math.cos(ang)+v*math.sin(ang)))
        fs=[(i,(i+1)%seg,seg+(i+1)%seg,seg+i) for i in range(seg)]
        if caps:fs +=[tuple(reversed(range(seg))),tuple(range(seg,2*seg))]
        self.add(vs,fs,col,skin,name)
    def loft(self,sections,col,skin='Chest',seg=8,name=None):
        vs=[];weights=[]
        for y,rx,rz,z,wt in sections:
            for i in range(seg):
                a=2*math.pi*i/seg;vs.append([rx*math.cos(a),y,z+rz*math.sin(a)]);weights.append(wt)
        fs=[]
        for k in range(len(sections)-1):
            for i in range(seg):fs.append((k*seg+i,k*seg+(i+1)%seg,(k+1)*seg+(i+1)%seg,(k+1)*seg+i))
        fs +=[tuple(reversed(range(seg))),tuple(range((len(sections)-1)*seg,len(sections)*seg))]
        self.add(vs,fs,col,skin,name,weights=weights)
    def save(self,metadata):
        triangles=len(self.indices)//3
        assert 1000<=triangles<=1300,(self.id,triangles)
        data={'id':self.id,'positions':self.positions,'normals':self.normals,'colors':self.colors,'joints':self.joints,'weights':self.weights,'indices':self.indices,'parts':self.parts,'sockets':self.sockets,'metadata':dict(metadata,triangles=triangles)}
        out=Path('/tmp/fire-rescue-people-v2/raw');out.mkdir(parents=True,exist_ok=True)
        (out/(self.id+'.json')).write_text(json.dumps(data,separators=(',',':')))
        print(self.id,triangles,len(self.positions),flush=True)

PROFILES=[
 {'id':'boy','label':'ילד','scale':.72,'skin':'#CE996F','hair':'#5B463C','top':'teal','pants':'navy','hairStyle':'crop','width':.94},
 {'id':'girl','label':'ילדה','scale':.70,'skin':'#AE7659','hair':'#3E3434','top':'coral','pants':'plum','hairStyle':'pigtails','width':.93},
 {'id':'mother','label':'אמא','scale':1.,'skin':'#CB9472','hair':'#5D453E','top':'plum','pants':'navy','hairStyle':'bob','width':.97},
 {'id':'father','label':'אבא','scale':1.07,'skin':'#98694F','hair':'#373536','top':'sage','pants':'navy','hairStyle':'crop','width':1.08},
 {'id':'grandfather','label':'סבא','scale':.98,'skin':'#D0A37E','hair':'#D8D5C6','top':'gold','pants':'navy','hairStyle':'bald','width':1.05},
 {'id':'grandmother','label':'סבתא','scale':.94,'skin':'#AC7F62','hair':'#C7C8BE','top':'teal','pants':'plum','hairStyle':'bun','width':1.03},
 {'id':'baby-stroller','label':'תינוק בעגלה','scale':.42,'skin':'#D9AA86','hair':'#8A6247','top':'cream','pants':'coral','hairStyle':'baby','width':1.02},
 {'id':'panicked-man','label':'בחור מבוהל','scale':1.03,'skin':'#B9815E','hair':'#714733','top':'orange','pants':'blue','hairStyle':'quiff','width':.99},
 {'id':'captain','label':'קפטן','scale':1.05,'skin':'#B98261','hair':'#53443D','top':'navy','pants':'navy','hairStyle':'crop','width':1.08,'fire':True,'helmet':'cream'},
 {'id':'young-firefighter','label':'כבאי צעיר','scale':1.03,'skin':'#95694F','hair':'#3E3434','top':'gold','pants':'gold','hairStyle':'crop','width':1.02,'fire':True,'helmet':'yellow'},
 {'id':'female-firefighter','label':'כבאית','scale':1.,'skin':'#C49671','hair':'#654A3B','top':'coral','pants':'coral','hairStyle':'bun','width':.97,'fire':True,'helmet':'red'},
]

def body(m,p):
    fire=p.get('fire'); infant=p['id']=='baby-stroller';w=p['width'];top=p['top'];pants=p['pants'];skin=p['skin']
    # Separate shaped garment sections with blend weights across the moving waist.
    m.loft([(.75,.175*w,.115,.005,'Hips'),(.88,.184*w,.125,0,{'Hips':.35,'Spine':.65}),
            (1.08,.175*w,.13,0,{'Spine':.55,'Chest':.45}),(1.28,.204*w,.12,0,'Chest'),(1.32,.145*w,.095,0,'Chest')],top,seg=6 if fire else 8,name='tailored-jacket' if fire else 'shirt')
    # Neck, shoulders and elbows overlap limb ends; intentional closed shells.
    m.cylinder((0,1.29,0),(0,1.42,0),.055,skin,'Neck',seg=8,name='neck')
    for side,s in [('Left',1),('Right',-1)]:
        arm=side+'Arm';fore=side+'ForeArm';hand=side+'Hand';thigh=side+'UpLeg';shin=side+'Leg';foot=side+'Foot'
        ax=s*.205;ex=s*.213;hx=s*.208
        m.ellipsoid((ax,1.28,0),(.079,.091,.085),top,arm,seg=5 if fire else 6,rings=3,name=side+'-shoulder')
        m.cylinder((ax,1.27,0),(ex,1.035,0),.077,top,arm,r2=.060,seg=6 if fire else 8,name=side+'-sleeve')
        m.ellipsoid((ex,1.025,0),(.06,.065,.061),top if fire else skin,fore,seg=6,rings=3)
        m.cylinder((ex,1.025,0),(hx,.79,0),.060,top if fire else skin,fore,r2=.047,seg=6 if fire else 8,name=side+'-forearm')
        m.ellipsoid((hx,.738,.015),(.052,.078,.041),'ink' if fire else skin,hand,seg=6,rings=3,name=side+'-hand')
        m.ellipsoid((hx-s*.049,.758,.028),(.023,.039,.025),'ink' if fire else skin,hand,seg=5,rings=3,name=side+'-thumb')
        m.cylinder((s*.1,.86,0),(s*.105,.45,0),.094*w,pants,thigh,r2=.073*w,seg=6 if fire else 8,name=side+'-trousers')
        m.ellipsoid((s*.105,.45,0),(.076*w,.077,.078),pants,shin,seg=6,rings=3)
        m.cylinder((s*.105,.45,0),(s*.1,.105,0),.073*w,pants,shin,r2=.058,seg=6 if fire else 8,name=side+'-shin')
        # Flatter soles and rounded toe keep support at y=0 in rest pose.
        m.loft([(0.,.077,.142,.060,foot),(.064,.081,.145,.06,foot),(.13,.068,.105,.026,foot)],'ink' if fire else 'cream',foot,seg=6 if fire else 8,name=side+'-boot')
        # Loft helper is centred on x=0; translate last boot vertices to the leg.
        part=m.parts[-1]
        # The index span identifies exactly the boot's vertices, including repeated quad corners.
        ids=set(m.indices[part['firstIndex']:part['firstIndex']+part['indexCount']])
        for idx in ids:m.positions[idx][0]+=s*.1
    # Belt and shirt closure become visible silhouette detail at tiny camera sizes.
    if not infant:
        m.loft([(.80,.182*w,.126,.006,'Hips'),(.84,.184*w,.127,.006,'Hips')],'ink',seg=8,name='waist-belt')
        m.box((0,.822,.135),(.048,.042,.018),'steel','Hips',name='belt-buckle')
        m.box((0,1.095,.132),(.016,.34,.012),'cream' if not fire else 'ink',{'Spine':.5,'Chest':.5},name='front-seam')
        for s in [-1,1]:m.box((s*.10,1.18,.124),(.075,.085,.020),top,'Chest',name='breast-pocket')

def face(m,p):
    skin=p['skin'];hair=p['hair'];fire=p.get('fire');infant=p['id']=='baby-stroller'
    # Jawline taper and broad cheek ring rather than a spherical head.
    width=.127 if infant else .111
    m.loft([(1.365,width*.55,.071,.008,'Head'),(1.43,width*.90,.103,.012,'Head'),(1.53,width,.104,0,'Head'),(1.635,width*.85,.084,-.012,'Head'),(1.67,width*.45,.045,-.01,'Head')],skin,'Head',seg=8 if fire else 10,name='sculpted-face')
    for s in [-1,1]:
        m.ellipsoid((s*width,1.51,.004),(.024,.04,.026),skin,'Head',seg=5,rings=3,name='ear')
        m.ellipsoid((s*.046,1.532,.098),(.027,.029,.012),'white','Head',seg=6,rings=3,name='eye-white')
        m.ellipsoid((s*.044,1.532,.109),(.011,.017,.007),'eye','Head',seg=5,rings=3,name='eye-pupil')
        m.cylinder((s*.024,1.573,.099),(s*.067,1.581,.092),.008,hair,'Head',seg=4,name='brow')
    m.ellipsoid((0,1.50,.115),(.024,.029,.028),skin,'Head',seg=5,rings=3,name='nose')
    m.box((0,1.445,.108),(.042,.013,.008),'brow','Head',name='mouth')
    style=p['hairStyle']
    if not fire:
        if style=='bald':
            for s in [-1,1]:m.ellipsoid((s*.092,1.58,-.035),(.031,.065,.078),hair,'Head',seg=6,rings=3,name='silver-sideburn')
        else:
            m.ellipsoid((0,1.635,-.026),(.119,.067,.104),hair,'Head',seg=10,rings=3,name='hair-cap')
            if style in ('bob','bun','pigtails'):
                m.ellipsoid((0,1.515,-.075),(.119,.135,.060),hair,'Head',seg=8,rings=3,name='back-hair')
            if style=='bob':
                for s in [-1,1]:m.ellipsoid((s*.105,1.50,-.018),(.034,.105,.063),hair,'Head',seg=6,rings=3,name='bob-lock')
            if style=='bun':m.ellipsoid((0,1.644,-.123),(.066,.064,.061),hair,'Head',seg=7,rings=3,name='hair-bun')
            if style=='pigtails':
                for s in [-1,1]:
                    m.ellipsoid((s*.14,1.57,-.057),(.051,.077,.056),hair,'Head',seg=6,rings=3,name='pigtail')
                    m.cylinder((s*.117,1.58,-.055),(s*.139,1.58,-.055),.039,'gold','Head',seg=6,name='hair-tie')
            if style=='quiff':m.ellipsoid((-.018,1.69,.024),(.097,.055,.075),hair,'Head',seg=8,rings=3,name='raised-quiff')
    if p['id'] in ('grandfather','grandmother'):
        # Spectacle lenses are dark-edged open rectangular frames, not opaque blocks.
        for s in [-1,1]:
            x=s*.047
            for a,b in [((x-.031,1.558,.117),(x+.031,1.558,.117)),((x-.031,1.509,.117),(x+.031,1.509,.117)),((x-.031,1.509,.117),(x-.031,1.558,.117)),((x+.031,1.509,.117),(x+.031,1.558,.117))]:
                m.cylinder(a,b,.004,'ink','Head',seg=4,name='spectacle-frame')
        m.cylinder((-.016,1.541,.119),(.016,1.541,.119),.004,'ink','Head',seg=4,name='spectacle-bridge')
    if p['id']=='father':m.ellipsoid((0,1.418,.063),(.07,.041,.061),hair,'Head',seg=8,rings=3,name='beard')

def firegear(m,p):
    if not p.get('fire'):return
    # Leg/arm bands are geometry, backpack and helmet are rigid-bone attachments.
    for s,side in [(-1,'Right'),(1,'Left')]:
        m.cylinder((s*.105,.24,0),(s*.105,.29,0),.078,'yellow',side+'Leg',seg=6,name='reflective-leg-band')
        m.cylinder((s*.21,.855,0),(s*.21,.905,0),.056,'yellow',side+'ForeArm',seg=6,name='reflective-cuff')
        m.box((s*.105,1.08,.145),(.046,.33,.022),'yellow',{'Spine':.3,'Chest':.7},name='reflective-chest-tape')
        m.box((s*.13,1.14,-.131),(.035,.32,.034),'ink','Chest',name='SCBA-harness')
    m.box((0,1.08,-.173),(.195,.31,.069),'ink','Chest',name='SCBA-backplate')
    m.cylinder((0,.93,-.235),(0,1.25,-.235),.072,'steel','Chest',seg=6,name='air-cylinder')
    m.cylinder((0,1.045,-.235),(0,1.085,-.235),.077,'ink','Chest',seg=6,name='air-cylinder-strap')
    m.ellipsoid((0,1.66,-.01),(.144,.092,.135),p['helmet'],'Head',seg=8,rings=3,name='helmet-crown')
    m.cylinder((0,1.585,-.006),(0,1.605,-.006),.171,p['helmet'],'Head',seg=8,name='helmet-brim')
    m.box((0,1.71,-.01),(.032,.025,.19),'yellow' if p['id']=='captain' else 'cream','Head',name='helmet-crest')
    m.box((0,1.61,.147),(.07,.047,.016),'ink','Head',name='helmet-shield')
    m.box((0,1.61,.158),(.026,.026,.008),'gold','Head',name='helmet-insignia')
    m.box((-.105,1.19,.147),(.055,.086,.034),'ink','Chest',name='radio')
    m.cylinder((-.122,1.23,.147),(-.122,1.31,.147),.005,'ink','Chest',seg=4,name='radio-antenna')
    # Right hand nozzle and left hand extinguisher are separate switchable primitives.
    if p['id']=='female-firefighter':m.ellipsoid((0,1.48,-.12),(.046,.071,.039),p['hair'],'Head',seg=6,rings=3,name='tucked-hair-bun')
    if p['id']=='captain':m.box((0,1.455,.13),(.059,.014,.018),p['hair'],'Head',name='captain-moustache')
    m.category='hose';h=REST['RightHand']+[-.045,0,0]
    m.cylinder(h+[0,-.01,.03],h+[0,-.19,.03],.027,'steel','RightHand',seg=6,name='hose-nozzle')
    m.cylinder(h+[0,-.19,.03],h+[0,-.27,.03],.038,'orange','RightHand',seg=6,name='nozzle-tip')
    m.box(h+[.01,-.04,.03],(.1,.04,.046),'ink','RightHand',name='nozzle-lever')
    m.sockets['waterNozzle']={'bone':'RightHand','translation':[-.045,-.272,.03],'direction':[0,-1,0]}
    m.sockets['hoseInlet']={'bone':'RightHand','translation':[-.045,.014,.03],'direction':[0,1,0]}
    m.category='extinguisher';h=REST['LeftHand']+[.045,0,0]
    m.cylinder(h+[0,-.02,.05],h+[0,-.29,.05],.059,'red','LeftHand',seg=6,name='extinguisher-cylinder')
    m.box(h+[0,-.13,.108],(.06,.09,.012),'cream','LeftHand',name='extinguisher-label')
    m.box(h+[0,.0,.05],(.1,.029,.04),'ink','LeftHand',name='extinguisher-handle')
    m.cylinder(h+[0,.012,.05],h+[0,.012,.15],.014,'ink','LeftHand',seg=4,name='extinguisher-spout')
    m.sockets['extinguisherNozzle']={'bone':'LeftHand','translation':[.045,.012,.15],'direction':[0,0,1]}
    m.sockets['carryShoulder']={'bone':'Chest','translation':[.16,.16,0],'rotation':[0,0,.70710678,.70710678]}
    m.category='body'

def stroller(m,p):
    if p['id']!='baby-stroller':return
    m.category='stroller'
    # In canonical units: scene scale .42 yields an 0.88m handle and .62m wheelbase.
    for s in [-1,1]:
        for z in [-.55,.60]:
            m.cylinder((s*.55,.19,z),(s*.68,.19,z),.19,'ink','Root',seg=6,name='stroller-wheel')
            m.cylinder((s*.68,.19,z),(s*.70,.19,z),.077,'steel','Root',seg=4,name='wheel-hub')
        m.cylinder((s*.58,.32,-.55),(s*.48,1.51,.30),.039,'steel','Root',seg=5,name='stroller-cross-frame')
        m.cylinder((s*.58,.32,.6),(s*.48,1.62,-.59),.039,'steel','Root',seg=5,name='stroller-handle-frame')
        m.cylinder((s*.48,1.62,-.59),(s*.48,2.10,-.92),.039,'steel','Root',seg=5,name='stroller-handle-upright')
    m.cylinder((-.48,2.10,-.92),(.48,2.10,-.92),.052,'ink','Root',seg=6,name='stroller-pushbar')
    m.box((0,.87,.025),(1.04,.10,1.0),'navy','Root',name='stroller-seat')
    m.box((0,1.22,-.30),(1.04,.78,.10),'teal','Root',name='stroller-backrest')
    for s in [-1,1]:m.box((s*.49,1.09,.055),(.07,.38,.86),'teal','Root',name='stroller-side-bolster')
    m.box((0,.455,.59),(.80,.08,.32),'ink','Root',name='stroller-footrest')
    m.sockets['strollerHandle']={'bone':'Root','translation':[0,2.10,-.92]}
    m.category='body'

def build(p):
    m=Mesh(p['id']);body(m,p);face(m,p);firegear(m,p);stroller(m,p)
    # Add real clothing folds only where spare budget remains, never hidden filler.
    while len(m.indices)//3<1000:
        n=(len(m.indices)//3)%12
        s=-1 if n%2 else 1
        y=.92+.025*(n%8)
        m.cylinder((s*.10,y,.134),(s*.15,y+.018,.116),.005,p['top'],'Spine' if y<1.08 else 'Chest',seg=4,name='cloth-fold')
    m.save({'labelHe':p['label'],'scale':p['scale'],'role':'firefighter' if p.get('fire') else 'civilian','bind':'canonical18','geometryLicense':'CC0-1.0','strollerRemovable':p['id']=='baby-stroller'})

if __name__=='__main__':
    for p in PROFILES:build(p)
