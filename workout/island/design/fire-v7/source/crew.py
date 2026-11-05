"""Original masked rescue crew, built around the exact motion2 rest skeleton.

The down-arm bind is canonical; the GLBs ship with active equipment poses and
an idle. Each figure has a single skin, one 512 atlas and a genuinely smaller LOD.
"""
import json, math
from pathlib import Path
import numpy as np
from mesh import Mesh, rotation, normalize

ROOT=Path(__file__).resolve().parents[1]
CONTRACT=json.loads((ROOT.parent/'motion2/soccer.json').read_text())['skeleton']
BONES=[b['name'] for b in CONTRACT['bones']]
REST={}
for b in CONTRACT['bones']:
    REST[b['name']]=np.array(b['restTranslationMeters'])+(REST[b['parent']] if b['parent'] else 0)


def loft(m,sections,color,skin,lod=False):
    seg=8 if lod else 12;verts=[];normals=[]
    for y,rx,rz,z in sections:
        for i in range(seg):
            a=math.tau*i/seg
            verts.append([rx*math.cos(a),y,z+rz*math.sin(a)])
            normals.append(normalize([math.cos(a)/rx,.08,math.sin(a)/rz]))
    faces=[]
    for k in range(len(sections)-1):
        for i in range(seg):faces.append((k*seg+i,(k+1)*seg+i,(k+1)*seg+(i+1)%seg,k*seg+(i+1)%seg))
    faces += [tuple(range(seg)),tuple(range((len(sections)-1)*seg,len(sections)*seg))[::-1]]
    m.add(verts,faces,color,normals=normals,skin=skin)


def torso(m,lod=False):
    # A coat has a flared hem, shoulder panel, storm flap and real breast pockets.
    loft(m,[(.77,.193,.133,.008),(.83,.196,.143,0),(1.02,.177,.139,0),
            (1.24,.219,.128,0),(1.30,.173,.102,0)],'suit',{'Spine':.50,'Chest':.50},lod)
    for y,rx in [(.84,.199),(1.11,.193)]:
        loft(m,[(y-.034,rx,.144,0),(y+.034,rx,.144,0)],'stripe',{'Spine':.5,'Chest':.5},lod)
        if not lod:loft(m,[(y-.008,rx+.001,.146,0),(y+.008,rx+.001,.146,0)],'steel',{'Spine':.5,'Chest':.5},lod)
    m.box((0,1.05,.149),(.038,.46,.023),'navy',bevel=.009,skin={'Spine':.50,'Chest':.50})
    for sign in [-1,1]:
        m.box((sign*.105,1.18,.140),(.115,.125,.035),'suit',bevel=.018,skin={'Chest':1})
        m.box((sign*.105,1.24,.163),(.122,.035,.022),'navy',bevel=.01,skin={'Chest':1})
        m.box((sign*.125,.93,.15),(.105,.115,.024),'suit',bevel=.015,skin={'Spine':1})
        # SCBA harness runs over both shoulders and crosses the belt.
        m.tube([(sign*.14,.89,.16),(sign*.145,1.20,.153),(sign*.13,1.30,.04),
                (sign*.13,1.19,-.16),(sign*.13,.94,-.155)],.022,'navy',segments=4,skin={'Chest':.7,'Spine':.3})
    m.box((0,.94,.17),(.31,.048,.025),'navy',bevel=.005,skin={'Spine':1})
    m.box((0,.94,.19),(.059,.062,.02),'steel',bevel=.008,surface='metal',skin={'Spine':1})
    m.cylinder((0,1.30,0),(0,1.40,0),.081,'black',segments=12,skin={'Neck':1})
    # The main tank, cradle and regulator are weighted to Chest.
    m.box((0,1.09,-.185),(.22,.40,.09),'navy',bevel=.035,skin={'Chest':1})
    m.cylinder((0,.90,-.245),(0,1.28,-.245),.082,'yellow',r2=.077,segments=12,skin={'Chest':1},part='SCBA cylinder')
    for y in [.95,1.20]:m.cylinder((0,y-.024,-.245),(0,y+.024,-.245),.088,'navy',segments=12,skin={'Chest':1})
    m.ellipsoid((0,1.28,-.245),(.076,.047,.076),'steel',segments=12,rings=4,skin={'Chest':1},surface='metal')
    m.cylinder((0,.87,-.245),(0,.91,-.245),.041,'metalDark',segments=8,skin={'Chest':1})


def arms(m,lod=False):
    for side,sgn in [('Left',1),('Right',-1)]:
        shoulder=REST[side+'Arm'];elbow=REST[side+'ForeArm'];hand=REST[side+'Hand']
        upper={side+'Arm':1};lower={side+'ForeArm':1}
        m.ellipsoid(shoulder,(.111,.115,.111),'suit',segments=12,rings=6,skin=upper)
        m.cylinder(shoulder,elbow,.095,'suit',r2=.079,segments=10 if lod else 14,skin=upper)
        m.ellipsoid(elbow,(.083,.078,.082),'navy',segments=10,rings=5,skin={side+'Arm':.3,side+'ForeArm':.7})
        m.cylinder(elbow,hand,.082,'suit',r2=.064,segments=10 if lod else 14,skin=lower)
        # Reflective cuff is a real ring; gloves have a thumb and knuckle shell.
        for y,c,r in [(hand[1]+.068,'stripe',.071),(hand[1]+.014,'navy',.068)]:
            m.cylinder((hand[0],y-.018,0),(hand[0],y+.018,0),r,c,segments=12,skin=lower)
        m.box((hand[0],hand[1]-.047,.015),(.128,.135,.094),'black',bevel=.032,skin={side+'Hand':1},part='heat glove')
        m.ellipsoid((hand[0]-sgn*.065,hand[1]-.025,.035),(.026,.048,.030),'navy',segments=8,rings=4,skin={side+'Hand':1})
        if not lod:
            for i in range(3):m.box((hand[0]+(i-1)*.032,hand[1]-.054,.065),(.018,.065,.015),'metalDark',bevel=.007,skin={side+'Hand':1})


def legs(m,lod=False):
    m.ellipsoid((0,.84,0),(.177,.14,.118),'suit',segments=12,rings=6,skin={'Hips':1})
    for side,sgn in [('Left',1),('Right',-1)]:
        hip=REST[side+'UpLeg'];knee=REST[side+'Leg'];foot=REST[side+'Foot']
        m.cylinder(hip,knee,.109,'suit',r2=.083,segments=10 if lod else 14,skin={side+'UpLeg':1})
        m.ellipsoid(knee,(.093,.091,.098),'navy',segments=10,rings=5,skin={side+'UpLeg':.2,side+'Leg':.8})
        m.cylinder(knee,foot,.084,'suit',r2=.069,segments=10 if lod else 14,skin={side+'Leg':1})
        for y in [.24,.29]:m.cylinder((sgn*.1,y-.018,0),(sgn*.1,y+.018,0),.083,'stripe' if y==.29 else 'steel',segments=10,skin={side+'Leg':1})
        m.box((sgn*.1,.118,.048),(.168,.22,.24),'black',bevel=.025,skin={side+'Foot':1})
        m.box((sgn*.1,.041,.084),(.18,.08,.31),'rubber',bevel=.025,skin={side+'Foot':1},part='supported boot sole')
        m.box((sgn*.1,.087,.18),(.17,.10,.13),'navy',bevel=.03,skin={side+'Foot':1})
        if not lod:
            for z in [-.035,.04,.12,.19]:m.box((sgn*.1,.013,z),(.17,.023,.03),'metalDark',skin={side+'Foot':1})


def head(m,role,lod=False):
    hs={'Head':1};seg=12 if lod else 20
    m.ellipsoid((0,1.486,0),(.105,.137,.103),'skin',segments=seg,rings=8,skin=hs)
    # Broad brow, sloping crown and rear neck guard: readable helmet silhouette.
    helmet='redLight' if role=='crew-nozzle' else 'yellow' if role=='crew-tool' else 'cream'
    m.ellipsoid((0,1.612,-.008),(.146,.108,.145),helmet,segments=seg,rings=8,skin=hs,part='rescue helmet')
    m.ellipsoid((0,1.551,-.008),(.187,.024,.183),helmet,segments=seg,rings=4,skin=hs)
    m.box((0,1.682,-.011),(.032,.03,.187),'cream' if role!='crew-command' else 'red',bevel=.012,skin=hs)
    m.box((0,1.563,.161),(.079,.060,.021),'navy',bevel=.015,skin=hs)
    m.box((0,1.563,.175),(.030,.032,.01),'stripe',bevel=.006,skin=hs)
    m.box((0,1.419,-.106),(.20,.139,.045),'navy',bevel=.025,skin=hs)
    # Mask rims, two protected eye apertures and central exhalation canister.
    m.box((0,1.474,.102),(.206,.122,.080),'black',bevel=.033,skin=hs)
    for sign in [-1,1]:
        m.box((sign*.050,1.491,.148),(.075,.055,.018),'glass',bevel=.019,surface='glass',skin=hs)
        m.box((sign*.048,1.495,.159),(.016,.016,.007),'lamp',bevel=.005,skin=hs)
        m.tube([(sign*.098,1.494,.10),(sign*.111,1.491,-.062),(sign*.085,1.43,-.098)],.014,'navy',segments=5,skin=hs)
    m.cylinder((0,1.425,.139),(0,1.425,.182),.041,'metalDark',segments=12,surface='metal',skin=hs)
    m.cylinder((0,1.425,.181),(0,1.425,.194),.029,'black',segments=10,skin=hs)
    m.tube([(.071,1.43,.13),(.124,1.34,.06),(.145,1.18,-.13),(.085,1.02,-.24)],.013,'black',segments=6,skin={'Chest':.5,'Neck':.5})
    if not lod:
        m.box((-.142,1.59,.01),(.044,.048,.125),'navy',bevel=.012,skin=hs)
        m.box((-.142,1.586,.081),(.031,.031,.018),'lamp',bevel=.008,surface='light',skin=hs)


def equipment(m,role,lod=False):
    # Equipment is rigid-skinned to the hand, and every grip has a named anchor.
    hand=REST['RightHand'];x,y,z=hand
    if role=='crew-nozzle':
        m.cylinder((x,y-.02,.04),(x,y-.22,.04),.034,'metalDark',segments=10,skin={'RightHand':1},surface='metal')
        m.cylinder((x,y-.20,.04),(x,y-.30,.04),.046,'orange',r2=.035,segments=12,skin={'RightHand':1})
        m.torus((x,y-.09,.04),.045,.012,'black',major=12,minor=4,skin={'RightHand':1})
        m.box((x,y-.02,.04),(.12,.055,.055),'orange',bevel=.014,skin={'RightHand':1})
        m.anchors['waterNozzle']={'bone':'RightHand','translation':[0,-.303,.04],'direction':[0,-1,0]}
        m.anchors['hoseInlet']={'bone':'RightHand','translation':[0,.02,.04],'direction':[0,1,0]}
    elif role=='crew-tool':
        m.cylinder((x,y+.18,.07),(x,y-.42,.07),.019,'wood',segments=8,skin={'RightHand':1})
        m.box((x+.058,y+.18,.07),(.18,.13,.047),'steel',bevel=.013,surface='metal',skin={'RightHand':1},part='rescue axe blade')
        m.box((x-.058,y+.18,.07),(.08,.10,.055),'red',bevel=.016,skin={'RightHand':1})
        # Halligan-type pry tool is secured to the belt rather than floating.
        m.tube([(.20,.73,-.11),(.23,.81,-.11),(.23,1.13,-.11),(.26,1.17,-.11)],.017,'metalDark',segments=6,surface='metal',skin={'Spine':1})
        m.anchors['toolGrip']={'bone':'RightHand','translation':[0,-.05,.07]}
    else:
        m.box((x,y-.035,.075),(.077,.15,.055),'navy',bevel=.017,skin={'RightHand':1},part='hand radio')
        m.cylinder((x+.022,y+.04,.075),(x+.022,y+.18,.075),.007,'black',segments=6,skin={'RightHand':1})
        m.box((x,y-.02,.107),(.048,.046,.007),'teal',skin={'RightHand':1})
        m.box((.093,1.19,.176),(.06,.10,.029),'orange',bevel=.008,skin={'Chest':1})
        m.anchors['radioGrip']={'bone':'RightHand','translation':[0,-.02,.07]}
    m.anchors['headlamp']={'bone':'Head','translation':[-.142,.116,.081]}


def build(role,lod=False):
    m=Mesh(role+('-lod' if lod else ''),role,BONES)
    torso(m,lod);arms(m,lod);legs(m,lod);head(m,role,lod);equipment(m,role,lod)
    m.save('/tmp/fire-v7-raw',{'category':'crew','role':role,'lod':int(lod),'canonicalSkeleton':True,'atlasCount':1})


if __name__=='__main__':
    for role in ['crew-nozzle','crew-tool','crew-command']:
        build(role);build(role,True)
    (ROOT/'skeleton.json').write_text(json.dumps(CONTRACT,indent=2)+'\n')
