"""Three original fictional rescue vehicles; front is +Z, metre scale."""
import math
from mesh import Mesh, rotation


def wheel(m,x,z,r=.49,lod=False):
    seg=12 if lod else 20
    side=1 if x>0 else -1
    # The smooth LOD includes the tread's outer envelope so the vehicle does
    # not rise/fall when geometry changes.
    m.cylinder((x-.20,.63,z),(x+.20,.63,z),r+(.0175 if lod else 0),'rubber',segments=seg,part='all-terrain tyre')
    outside=x+side*.205
    m.cylinder((outside,.63,z),(outside+side*.035,.63,z),r*.62,'steel',segments=seg,surface='metal')
    m.cylinder((outside+side*.038,.63,z),(outside+side*.07,.63,z),r*.30,'metalDark',segments=12,surface='metal')
    if not lod:
        for a in range(6):
            angle=a*math.tau/6
            y=.63+math.sin(angle)*r*.44;zz=z+math.cos(angle)*r*.44
            m.cylinder((outside+side*.04,y,zz),(outside+side*.065,y,zz),.026,'black',segments=6)
        # Tread is a geometry edge, not a texture painted on a smooth cylinder.
        for a in range(16):
            angle=a*math.tau/16
            m.box((x,.63+math.cos(angle)*r,z+math.sin(angle)*r),(.37,.035,.10),'rubber',
                  matrix=rotation((1,0,0),angle),bevel=.008)


def handle(m,x,y,z,lod=False):
    side=1 if x>0 else -1
    m.box((x,y,z),(.035,.055,.23),'metalDark',bevel=.012,surface='metal')
    if not lod:m.box((x+side*.025,y+.012,z),(.035,.025,.14),'steel',bevel=.008,surface='metal')


def cab(m,width,front,length,lod=False,rapid=False):
    w=width/2;rear=front-length
    m.box((0,1.58,(front+rear)/2),(width,1.75,length),'red',bevel=.16,part='crew cab')
    m.box((0,2.43,(front+rear)/2),(width+.05,.17,length+.04),'redDark',bevel=.07)
    # Split windscreen, black seals and a slight backwards rake.
    tilt=rotation((1,0,0),-.12)
    m.box((0,1.99,front+.035),(width-.18,.75,.05),'black',bevel=.07,matrix=tilt)
    for side in [-1,1]:
        m.box((side*(w/2-.045),2.01,front+.078),(w-.15,.62,.024),'glass',bevel=.035,matrix=tilt,surface='glass')
        m.box((side*(w-.025),2.02,front-length*.53),(.028,.64,length*.65),'glass',bevel=.04,surface='glass')
        m.box((side*(w+.027),1.49,front-length*.46),(.035,.17,length*.85),'cream',bevel=.012)
        m.box((side*(w+.024),1.04,front-length*.46),(.032,.09,length*.85),'yellow')
        handle(m,side*(w+.05),1.64,front-length*.77,lod)
        # A mirror assembly attached to a visible metal arm.
        m.cylinder((side*w,1.98,front-.30),(side*(w+.27),1.98,front-.18),.025,'metalDark',segments=6)
        m.box((side*(w+.28),2.01,front-.16),(.15,.28,.16),'black',bevel=.025)
        m.box((side*(w+.29),2.015,front-.07),(.11,.20,.025),'steel',surface='metal')
        for y in [.58,.80]:m.box((side*(w+.08),y,rear+.34),(.32,.065,.64),'metalDark',bevel=.015,surface='metal')
        # Headlight inset, paired lamp lenses and corner turn signals.
        m.box((side*(w-.26),1.23,front+.062),(.41,.30,.09),'black',bevel=.045)
        for dx in [-.10,.10]:m.box((side*(w-.26)+dx,1.25,front+.12),(.14,.16,.03),'lamp',bevel=.025,surface='light')
        m.box((side*(w-.07),1.57,front+.06),(.09,.13,.045),'orange',bevel=.02,surface='light')
        if not lod:
            # Window pillars and door perimeter remain geometric at close range.
            m.box((side*(w+.02),1.96,rear+.35),(.034,.78,.04),'redDark')
            m.box((side*(w+.03),1.24,rear+.08),(.035,.93,.028),'redDark')
            m.tube([(side*w,1.80,front+.12),(side*.12,1.82,front+.14)],.012,'metalDark',segments=6)
    m.box((0,.89,front+.12),(width+.13,.23,.23),'metalDark',bevel=.055,surface='metal')
    m.box((0,1.32,front+.065),(width*.42,.32,.055),'black',bevel=.04)
    for y in [1.24,1.32,1.40]:m.box((0,y,front+.10),(width*.38,.022,.02),'steel',surface='metal')
    # Fictional unit panel has no jurisdiction, insignia, phone or brand.
    m.box((0,.88,front+.245),(.37,.105,.02),'cream',bevel=.01)
    m.box((0,2.59,front-length*.65),(width*.64,.085,.23),'metalDark',bevel=.025,surface='metal')
    for side in [-1,1]:
        m.box((side*width*.25,2.67,front-length*.65),(width*.19,.17,.24),'beacon',bevel=.045,surface='light',part='emergency light lens')


def lockers(m,width,z0,z1,height,lod=False):
    w=width/2
    for side in [-1,1]:
        for i in range(3):
            z=z0+(z1-z0)*(i+.5)/3;depth=(z1-z0)/3-.055
            m.box((side*(w+.016),1.39,z),(.035,height*.68,depth),'metalDark',bevel=.02,surface='metal')
            m.box((side*(w+.04),1.41,z),(.026,height*.63,depth-.07),'steel',bevel=.015,surface='metal')
            count=3 if lod else 9
            for j in range(count):
                y=1.41-height*.31+(j+.5)*height*.62/count
                m.box((side*(w+.06),y,z),(.015,.014,depth-.09),'metalDark')
            handle(m,side*(w+.085),1.05,z,lod)
        for y,h,c in [(1.96,.13,'cream'),(1.75,.07,'yellow')]:
            m.box((side*(w+.045),y,(z0+z1)/2),(.032,h,z1-z0),'%s'%c)
    for z in [z0-.02,z1+.02]:m.box((0,1.88,z),(width,.12,.10),'redDark',bevel=.02)


def hose_reel(m,x,y,z,side=1,lod=False):
    m.cylinder((x-side*.13,y,z),(x+side*.13,y,z),.33,'redDark',segments=12)
    for t in range(3 if lod else 5):
        m.torus((x+side*(t-2)*.042,y,z),.25,.036,'hose',axis=(1,0,0),major=16,minor=4)
    m.cylinder((x+side*.15,y,z),(x+side*.24,y,z),.08,'steel',segments=8,surface='metal')


def ladder(m,length=5.1,lod=False):
    # Two nested sections with open rungs, no solid fake ladder slab.
    for level in range(2):
        yy=2.82+level*.13;z0=-2.3+level*.48
        for side in [-1,1]:m.box((side*(.42-level*.085),yy,z0+length/2),(.075,.10,length),'steel',bevel=.012,surface='metal')
        for i in range(10 if lod else 16):
            z=z0+.12+i*(length-.24)/(9 if lod else 15)
            m.box((0,yy,z),(.81-level*.17,.065,.065),'metalDark',bevel=.008,surface='metal')
    m.box((0,2.64,-1.8),(1.30,.25,1.25),'redDark',bevel=.08)
    m.cylinder((0,2.65,-1.8),(0,2.87,-1.8),.52,'metalDark',segments=16,surface='metal')


def build(kind,lod=False):
    m=Mesh(kind+('-lod' if lod else ''),'vehicle')
    if kind=='engine-pumper':
        width=2.34;front=3.18;rear=-3.25
        m.box((0,.75,0),(2.1,.40,6.1),'black',bevel=.07,part='ladder frame chassis')
        cab(m,width,front,2.15,lod)
        m.box((0,1.47,-1.15),(2.32,1.76,4.15),'red',bevel=.10)
        lockers(m,width,-3.16,.92,1.70,lod)
        m.box((0,2.41,-1.2),(2.17,.12,4.05),'metalDark',bevel=.04,surface='metal')
        # Flat hose beds, a suction pipe and roof rails.
        for x in [-.61,-.25,.11,.47]:
            m.box((x,2.54,-1.55),(.24,.17,2.75),'hose',bevel=.045)
            if not lod:
                for z in [-2.55,-1.65,-.75]:m.box((x,2.635,z),(.25,.035,.07),'cream')
        for side in [-1,1]:m.cylinder((side*.99,2.64,-3.02),(side*.99,2.64,.63),.038,'steel',segments=8,surface='metal')
        m.cylinder((-.80,2.64,-2.9),(-.8,2.64,.34),.11,'black',segments=12)
        hose_reel(m,1.29,1.16,-.12,1,lod)
        # Dedicated pump panel with three pressure dials and valve outlets.
        m.box((-1.23,1.39,-.04),(.065,.76,.95),'navy',bevel=.035)
        for z in [-.31,-.04,.23]:
            m.cylinder((-1.285,1.59,z),(-1.31,1.59,z),.09,'cream',segments=12)
            m.cylinder((-1.31,1.29,z),(-1.42,1.29,z),.065,'steel',segments=10,surface='metal')
            if not lod:m.box((-1.335,1.61,z),(.013,.08,.013),'red',matrix=rotation((1,0,0),.5))
        axles=[(1.10,2.05),(1.10,-1.93)]
        m.anchors['waterOutlet']=[1.45,1.16,-.12]
        m.anchors['waterInlet']=[-1.42,1.29,-.04]
    elif kind=='engine-ladder':
        width=2.40;front=4.03;rear=-4.12
        m.box((0,.71,0),(2.13,.40,7.75),'black',bevel=.07)
        cab(m,width,front,2.28,lod)
        m.box((0,1.36,-1.22),(2.38,1.54,5.7),'redLight',bevel=.11)
        lockers(m,width,-3.97,1.64,1.42,lod)
        ladder(m,6.05,lod)
        # Stowed stabilizer arms and contrasting pads identify the aerial truck.
        for side in [-1,1]:
            for z in [-2.9,1.0]:
                m.box((side*1.10,.69,z),(.44,.27,.35),'metalDark',bevel=.025,surface='metal')
                m.box((side*1.34,.57,z),(.30,.44,.25),'redDark',bevel=.025)
                m.box((side*1.34,.30,z),(.42,.08,.42),'black',bevel=.015)
        # A vented rescue basket folded over the rear section.
        for side in [-1,1]:m.box((side*.69,3.06,-3.25),(.07,.55,.95),'cream',bevel=.015)
        m.box((0,2.80,-3.25),(1.43,.08,.95),'metalDark',bevel=.02,surface='metal')
        for z in [-3.69,-2.81]:m.box((0,3.31,z),(1.43,.08,.07),'cream',bevel=.01)
        axles=[(1.13,2.80),(1.13,-1.86),(1.13,-3.06)]
        m.anchors['ladderPivot']=[0,2.84,-1.8]
    else:
        width=2.02;front=2.39;rear=-2.46
        m.box((0,.68,0),(1.78,.35,4.52),'black',bevel=.06)
        cab(m,width,front,2.07,lod,True)
        m.box((0,1.34,-1.04),(2.0,1.49,2.71),'red',bevel=.12)
        lockers(m,width,-2.35,.30,1.30,lod)
        m.box((0,2.13,-1.05),(2.02,.15,2.71),'cream',bevel=.055)
        for x in [-.75,.75]:m.box((x,2.32,-1.08),(.065,.12,2.31),'metalDark',bevel=.014,surface='metal')
        # Coiled rescue rope, tool chest and two portable scene lights.
        m.box((0,2.34,-1.28),(1.10,.27,1.10),'navy',bevel=.06)
        for x in [-.34,.34]:m.box((x,2.50,-1.28),(.08,.035,1.12),'yellow')
        for side in [-1,1]:
            m.cylinder((side*.78,2.26,-2.06),(side*.78,2.77,-2.06),.022,'steel',segments=6,surface='metal')
            m.box((side*.78,2.81,-2.06),(.34,.23,.16),'black',bevel=.035)
            m.box((side*.78,2.81,-1.97),(.27,.15,.025),'lamp',bevel=.02,surface='light')
        axles=[(.94,1.38),(.94,-1.55)]
        m.anchors['toolRack']=[0,2.51,-1.28]
    for x,z in axles:
        for side in [-1,1]:wheel(m,side*x,z,r=.46 if kind=='response-unit' else .52,lod=lod)
    # Rear warning board, bumpers, running lights, and hose connector.
    m.box((0,.81,rear-.04),(width+.06,.21,.23),'metalDark',bevel=.04,surface='metal')
    for side in [-1,1]:
        for y,c in [(1.02,'beacon'),(1.24,'orange')]:m.box((side*(width/2-.20),y,rear-.085),(.19,.14,.03),c,bevel=.02,surface='light')
        for j in range(4):
            z=rear+.12+j*.33
            m.box((side*(width/2+.065),.85,z),(.025,.045,.10),'orange',surface='light')
        if not lod:
            for j in range(5):
                m.box((side*(.15+j*.17),1.65+(j*.075),rear-.075),(.24,.10,.025),'yellow',matrix=rotation((0,0,1),side*.55))
    m.anchors['front']=[0,1.2,front+.2];m.anchors['rear']=[0,.9,rear-.18]
    ground=min(p[1] for p in m.p)
    for p in m.p:p[1]-=ground
    for p in m.anchors.values():p[1]-=ground
    m.save('/tmp/fire-v7-raw',{'category':'vehicle','type':kind,'lod':1 if lod else 0,'front':'+Z','scale':'metres','originShiftMeters':ground})


if __name__=='__main__':
    for kind in ['engine-pumper','engine-ladder','response-unit']:
        build(kind);build(kind,True)
