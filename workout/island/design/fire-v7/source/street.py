"""Street, reusable perimeter props and a small instanced crowd source mesh."""
import math,random
from mesh import Mesh, rotation


def street():
    m=Mesh('street-block');rng=random.Random(7105)
    # A finite diorama with a chamfered kerb and dark cut edge.
    m.box((0,-.40,0),(42,.75,22),'navy',bevel=.32,part='district base')
    m.box((0,-.045,1.1),(41.7,.12,11.2),'asphalt',bevel=.09)
    for z in [-5.0,7.2]:
        m.box((0,.08,z),(41.65,.26,1.45),'concrete',bevel=.055)
        m.box((0,.23,z),(41.5,.08,1.35),'stone',bevel=.035)
        for x in range(-20,21,2):m.box((x,.278,z),(.015,.006,1.30),'concrete')
    m.box((0,.04,-8.4),(41.5,.16,5.2),'concrete',bevel=.045)
    for x in range(-19,20,4):m.box((x,.022,.45),(1.8,.009,.09),'cream')
    for x in [-18.3,17.3]:
        for z in [-2.8,-1.95,-1.1,-.25,.60,1.45,2.30,3.15,4.0,4.85]:
            m.box((x,.025,z),(2.3,.012,.43),'cream',bevel=.008)
        m.box((x-1.8,.027,1.1),(.11,.011,8.6),'cream')
    for x in [-14,-6,5,14]:
        for z in [-4.10,6.35]:
            m.box((x,.023,z),(.64,.028,.29),'metalDark',bevel=.015,surface='metal')
            for j in range(6):m.box((x-.25+j*.1,.043,z),(.024,.01,.24),'black')
    for x,z in [(-11,1.5),(7,3.9)]:
        m.cylinder((x,.018,z),(x,.035,z),.44,'metalDark',segments=20,surface='metal')
        m.torus((x,.041,z),.35,.014,'black',major=20,minor=4)
        for k in range(5):m.box((x,.044,z+(k-2)*.1),(.51,.01,.025),'black')
    # Irregular asphalt patches and narrow crack chains.
    for i in range(16):
        x=rng.uniform(-19,19);z=rng.uniform(-3.7,5.8)
        m.box((x,.021,z),(rng.uniform(.16,.65),.008,rng.uniform(.12,.4)),'roof',bevel=.025,matrix=rotation((0,1,0),rng.random()))
    for x,z in [(-8,4.2),(4,-2.8),(15,2.0)]:
        m.tube([(x,.029,z),(x+.45,.029,z+.14),(x+.79,.029,z+.07),(x+1.13,.029,z+.36)],.014,'black',segments=4)
    m.anchors={'crewStart':[1,.016,3.2],'engineStart':[-8,.016,2.0],'crowdLine':[0,.271,7.5]}
    m.save('/tmp/fire-v7-raw',{'category':'street','lod':0,'dimensions':[42,.8,22]})


def hydrant():
    m=Mesh('hydrant')
    m.cylinder((0,0,0),(0,.70,0),.13,'red',segments=12)
    m.ellipsoid((0,.72,0),(.17,.13,.17),'redLight',segments=12,rings=6)
    for y in [.08,.58]:m.cylinder((0,y-.03,0),(0,y+.03,0),.19,'redDark',segments=12)
    for side in [-1,1]:
        m.cylinder((0,.46,0),(side*.26,.46,0),.089,'red',segments=10)
        m.cylinder((side*.25,.46,0),(side*.31,.46,0),.10,'steel',segments=8,surface='metal')
    m.cylinder((0,.67,.02),(0,.67,.25),.07,'metalDark',segments=8,surface='metal')
    m.anchors={'outlet':[.31,.46,0]}
    m.save('/tmp/fire-v7-raw',{'category':'prop','lod':0})


def barrier():
    m=Mesh('street-barrier')
    for s in [-1,1]:
        m.box((s*.71,.43,0),(.10,.86,.10),'metalDark',bevel=.015,surface='metal')
        m.box((s*.71,.055,0),(.38,.11,.68),'black',bevel=.035)
    m.box((0,.74,0),(1.95,.28,.08),'cream',bevel=.025)
    for i in range(6):m.box((-.80+i*.31,.74,.046),(.21,.25,.013),'orange',matrix=rotation((0,0,1),-.34))
    m.save('/tmp/fire-v7-raw',{'category':'prop','lod':0})


def cone():
    m=Mesh('traffic-cone')
    m.box((0,.03,0),(.40,.06,.40),'rubber',bevel=.035)
    m.cylinder((0,.06,0),(0,.53,0),.15,'orange',r2=.034,segments=12)
    m.cylinder((0,.26,0),(0,.35,0),.098,'cream',r2=.075,segments=12)
    m.save('/tmp/fire-v7-raw',{'category':'prop','lod':0})


def lamp():
    m=Mesh('street-lamp')
    m.cylinder((0,0,0),(0,4.8,0),.065,'metalDark',r2=.045,segments=10)
    m.cylinder((0,0,0),(0,.38,0),.15,'metalDark',r2=.11,segments=10)
    m.tube([(0,4.7,0),(0,4.9,.32),(0,4.9,1.04)],.05,'metalDark',segments=8)
    m.box((0,4.88,1.04),(.35,.14,.65),'navy',bevel=.055)
    m.box((0,4.795,1.04),(.29,.025,.53),'lamp',bevel=.02,surface='light')
    m.save('/tmp/fire-v7-raw',{'category':'prop','lod':0})


def crowd(lod=False):
    # One atlas primitive. Runtime instances carry colour, yaw and seeded phase.
    m=Mesh('bystander'+('-lod' if lod else ''))
    if lod:
        m.ellipsoid((0,.91,0),(.215,.34,.14),'teal',segments=8,rings=4)
        m.ellipsoid((0,1.39,0),(.135,.17,.128),'skin',segments=8,rings=4)
        m.ellipsoid((0,1.51,-.018),(.139,.075,.131),'navy',segments=8,rings=4)
        for s in [-1,1]:m.box((s*.10,.31,0),(.15,.58,.17),'navy',bevel=.035)
        for s in [-1,1]:m.cylinder((s*.20,1.10,0),(s*.27,.74,.02),.061,'teal',segments=6)
    else:
        m.ellipsoid((0,.93,0),(.22,.34,.15),'teal',segments=10,rings=6)
        m.ellipsoid((0,1.39,0),(.135,.17,.128),'skin',segments=10,rings=6)
        m.ellipsoid((0,1.51,-.018),(.139,.078,.131),'navy',segments=10,rings=4)
        for s in [-1,1]:
            m.cylinder((s*.12,.66,0),(s*.12,.12,0),.083,'navy',segments=8)
            m.box((s*.12,.068,.045),(.16,.11,.27),'black',bevel=.025)
            m.cylinder((s*.20,1.10,0),(s*.28,.71,.02),.063,'teal',segments=8)
            m.ellipsoid((s*.28,.70,.02),(.061,.067,.058),'skin',segments=8,rings=4)
    # Crowd uses a single matte primitive, including shoes and skin.
    m.groups['solid']+=m.groups['metal']+m.groups['glass']+m.groups['light']
    m.groups.update(metal=[],glass=[],light=[])
    ground=min(p[1] for p in m.p)
    for p in m.p:p[1]-=ground
    m.save('/tmp/fire-v7-raw',{'category':'crowd','lod':int(lod),'instanced':True,'originShiftMeters':ground})


if __name__=='__main__':
    street();hydrant();barrier();cone();lamp();crowd();crowd(True)
