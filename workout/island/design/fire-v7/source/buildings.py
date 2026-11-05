"""Five silhouettes, four permanent geometric damage stages, two real LODs."""
import math, random
from mesh import Mesh, rotation

TYPES={
 'row-house':dict(w=5.1,d=4.5,h=5.0,floors=2,cols=3,wall='brick',roof='wood'),
 'corner-store':dict(w=6.2,d=4.8,h=4.2,floors=2,cols=3,wall='teal',roof='roof'),
 'warehouse':dict(w=7.0,d=5.5,h=4.0,floors=1,cols=3,wall='stone',roof='metalDark'),
 'apartment':dict(w=5.4,d=4.7,h=8.3,floors=4,cols=3,wall='plaster',roof='roof'),
 'workshop':dict(w=5.7,d=4.9,h=4.1,floors=1,cols=2,wall='brick',roof='roof'),
}
STAGES=['intact','scorched','burning','ruined']


def jagged_wall(m,start,end,thickness,heights,color):
    """Extruded broken wall with an uneven upper silhouette and solid cut edge."""
    import numpy as np
    start,end=np.array(start,float),np.array(end,float);direction=end-start
    side=np.array([-direction[2],0,direction[0]]);side=side/(np.linalg.norm(side) or 1)*thickness/2
    verts=[]
    for i,height in enumerate(heights):
        p=start+direction*(i/(len(heights)-1))
        verts.extend([p-side,p+side,p+side+[0,height,0],p-side+[0,height,0]])
    faces=[]
    for i in range(len(heights)-1):
        a=i*4;b=(i+1)*4
        faces.extend([(a,b,b+3,a+3),(a+1,a+2,b+2,b+1),(a+3,b+3,b+2,a+2),(a,a+1,b+1,b)])
    faces.extend([(0,3,2,1),tuple(range(len(verts)-4,len(verts)))])
    m.add(verts,[f[::-1] for f in faces],color,part='irregular broken wall')


def shard(m,x,y,z,size,rng,color):
    w,h,d=size
    verts=[[-w*.48,0,-d*.5],[w*.5,.02,-d*.42],[w*.42,0,d*.5],[-w*.5,.015,d*.4],
           [-w*.23,h,-d*.22],[w*.31,h*.69,d*.17]]
    faces=[(0,3,2,1),(0,1,4),(1,5,4),(1,2,5),(2,3,5),(3,4,5),(3,0,4)]
    m.add(verts,[f[::-1] for f in faces],color,center=(x,y,z),matrix=rotation((0,1,0),rng.random()*math.tau),part='outward rubble shard')


def window(m,x,y,z,w,h,damage=0,lod=False,balcony=False):
    m.box((x,y,z),(w+.18,h+.18,.13),'cream' if damage<2 else 'soot',bevel=.025)
    broken=damage>=2 and ((int((x+10)*13+y*7))%3!=0)
    if broken:
        # Opaque recessed interior plus surviving shards; never a flat sticker.
        m.box((x,y,z+.075),(w,h,.035),'black')
        m.box((x-w*.28,y+h*.20,z+.098),(w*.38,h*.52,.027),'glass',surface='glass')
        if not lod:
            for side in [-1,1]:m.box((x+side*w*.42,y-h*.16,z+.11),(.065,h*.30,.027),'steel',matrix=rotation((0,0,1),side*.32))
    else:
        m.box((x,y,z+.078),(w,h,.04),'glass',bevel=.008,surface='glass')
        m.box((x,y,z+.11),(.045,h,.025),'cream' if damage<2 else 'char')
        m.box((x,y-.04,z+.113),(w,.042,.025),'cream' if damage<2 else 'char')
        # Warm interior sliver remains visible on a small phone screen.
        if int((x+4)*6+y*5)%3==0:m.box((x,y-h*.26,z+.12),(w*.80,.09,.01),'lamp',surface='light')
    m.box((x,y-h/2-.09,z+.12),(w+.35,.09,.26),'stone',bevel=.02)
    if damage>=1:
        # Spatially uneven burnt lintel; the underlying facade is still readable.
        m.box((x,y+h*.68,z-.03),(w*1.16,.28,.025),'soot' if damage==1 else 'char',bevel=.035)
    if balcony and not lod:
        m.box((x,y-h*.57,z+.40),(w+.53,.12,.85),'stone',bevel=.025)
        m.box((x,y-h*.20,z+.78),(w+.48,.047,.04),'metalDark',surface='metal')
        for xx in [-.48,-.24,0,.24,.48]:m.box((x+xx,y-h*.37,z+.78),(.027,h*.43,.027),'metalDark',surface='metal')


def build(kind,stage,lod=False):
    spec=TYPES[kind];w,d,h=spec['w'],spec['d'],spec['h'];level=STAGES.index(stage)
    m=Mesh(f'{kind}-{stage}'+('-lod' if lod else ''))
    rng=random.Random(705+list(TYPES).index(kind)*19+level)
    front=d/2
    wall=spec['wall'] if level<3 else 'soot'
    m.box((0,.14,0),(w+.28,.28,d+.28),'concrete',bevel=.035,part='foundation plinth')
    if level<3:
        m.box((0,h/2+.24,0),(w,h,d),wall,bevel=.055,part='load bearing shell')
    else:
        # Real missing upper volumes, a hole through the roof and broken walls.
        m.box((0,h*.20,0),(w,h*.36,d),'char',bevel=.035,part='standing ground floor')
        for side in [-1,1]:
            profile=[h*((.68 if side<0 else .47)-i*.045+rng.uniform(-.08,.07)) for i in range(8)]
            jagged_wall(m,(side*(w/2-.18),.2,-d/2+.16),(side*(w/2-.18),.2,front-.18),.36,profile,'soot')
        jagged_wall(m,(-w/2+.18,.2,-d/2+.18),(.12,.2,-d/2+.18),.36,
                    [h*v for v in [.81,.79,.83,.69,.73,.58,.63]],'char')
        jagged_wall(m,(-w/2+.18,h*.36,front-.18),(-w*.10,h*.36,front-.18),.35,
                    [h*v for v in [.22,.17,.20,.11,.13,.04]],'soot')
        jagged_wall(m,(w*.20,h*.36,front-.18),(w/2-.18,h*.36,front-.18),.35,
                    [h*v for v in [.04,.12,.08,.15,.18,.14]],'soot')
        for i in range(4):
            m.box((-.9+i*.55,h*.35+(i%2)*.15,-.2),(.15,.18,d-.9),'char',matrix=rotation((0,0,1),.18*(i-1)))
        for i in range(3):
            m.box((-.8+i*.65,h*.17,-.2+i*.28),(.14,.18,d-.6),'char',matrix=rotation((0,0,1),.35*(i-1)))
    # Corner ashlar bands and horizontal cornices are real geometry.
    for side in [-1,1]:
        trimh=min(h,3.0) if level<3 else min(h*.36,2.4)
        m.box((side*(w/2-.13),trimh/2+.2,front+.055),(.26,trimh,.14),'stone' if level<2 else 'char')
        if not lod and level<3:
            for y in range(1,int(h/.35)):
                m.box((side*(w/2-.13),y*.35,front+.14),(.30,.035,.035),'concrete' if level<2 else 'soot')
    for floor in range(spec['floors']):
        y=(floor+1)*h/spec['floors']-.18
        if level==3:continue
        m.box((0,y,front+.07),(w+.15,.13,.21),'cream' if level<2 else 'char',bevel=.015)
    if kind in ['row-house','warehouse','workshop'] and level<3:
        # A pitched roof with a hollow-looking overhang and a pronounced ridge.
        rise=.85 if kind!='workshop' else .64
        verts=[[-w/2-.20,h+.28,-d/2-.2],[w/2+.20,h+.28,-d/2-.2],
               [w/2+.20,h+.28,d/2+.2],[-w/2-.20,h+.28,d/2+.2],
               [-w/2-.20,h+rise+.28,0],[w/2+.20,h+rise+.28,0]]
        faces=[(0,4,5,1),(4,3,2,5),(0,3,4),(1,5,2),(0,1,2,3)]
        m.add(verts,faces,spec['roof'] if level<2 else 'char',part='pitched roof')
        m.box((0,h+rise+.30,0),(w+.44,.10,.15),'metalDark',bevel=.02)
        if not lod:
            for s in [-1,1]:
                for i in range(1,7):
                    z=s*i*d/14;y=h+.28+rise*(1-abs(z)/(d/2+.2))+.02
                    m.box((0,y,z),(w+.35,.032,.032),'wood' if level<2 else 'soot')
        if kind=='row-house':
            m.box((-w*.27,h+.73,-.70),(.62,1.32,.62),'brick' if level<2 else 'char',bevel=.03)
            m.box((-w*.27,h+1.39,-.70),(.78,.14,.78),'stone',bevel=.02)
    elif level<3:
        m.box((0,h+.35,0),(w+.34,.23,d+.34),'cream' if level<2 else 'char',bevel=.025)
        m.box((0,h+.48,0),(w-.30,.08,d-.28),'roof')
        if not lod:
            for side in [-1,1]:m.box((side*(w/2-.08),h+.65,0),(.16,.35,d),'stone' if level<2 else 'char')
            m.box((w*.25,h+.81,-d*.18),(1.1,.61,.90),'metalDark',bevel=.04)
            for i in range(4):m.box((w*.25,h+.83,-d*.18-.46),(.85,.035,.025),'black')
    for floor in range(spec['floors']):
        if level==3 and floor>0:continue
        y=.24+(floor+.52)*h/spec['floors']
        if kind in ['warehouse','workshop']:y=2.65
        for col in range(spec['cols']):
            x=-w/2+(col+.5)*w/spec['cols']
            if floor==0 and (col==1 or kind in ['corner-store','warehouse','workshop']):continue
            window(m,x,y,front+.045,.83 if kind!='warehouse' else 1.25,1.12 if kind!='warehouse' else .62,level,lod,kind=='apartment' and floor>0)
    # A side window makes free orbit useful and avoids a theatre-flat facade.
    if level<3:
        for side in [-1,1]:
            for z in [-d*.24,d*.20]:
                m.box((side*(w/2+.025),h*.57,z),(.07,1.05,.88),'cream' if level<2 else 'char',bevel=.018)
                m.box((side*(w/2+.068),h*.57,z),(.023,.87,.72),'glass',surface='glass')
    doorwidth=1.13
    if kind in ['warehouse','workshop']:doorwidth=2.95
    elif kind=='corner-store':doorwidth=3.60
    m.box((0,1.27,front+.07),(doorwidth+.20,2.13,.12),'cream' if level<2 else 'char',bevel=.03)
    m.box((0,1.22,front+.145),(doorwidth,2.0,.045),'glass' if kind=='corner-store' and level<2 else 'metalDark' if kind in ['warehouse','workshop'] and level<2 else 'black',surface='glass' if kind=='corner-store' else 'solid')
    if kind in ['warehouse','workshop']:
        for i in range(4 if lod else 12):m.box((0,.30+(i+.5)*1.85/(4 if lod else 12),front+.175),(doorwidth-.06,.022,.022),'steel' if level<2 else 'soot')
    else:
        m.box((0,1.24,front+.185),(.055,1.95,.04),'cream' if level<2 else 'char')
        m.box((.20,1.24,front+.22),(.035,.25,.035),'steel',surface='metal')
    m.box((0,.22,front+.38),(doorwidth+.45,.18,.69),'concrete',bevel=.025)
    if kind=='corner-store':
        # No business name: a blank shaped enamel fascia and scalloped canopy.
        m.box((0,2.72,front+.24),(w-.52,.52,.22),'navy' if level<2 else 'char',bevel=.055)
        m.box((0,2.36,front+.60),(w-.35,.12,1.05),'teal' if level<2 else 'soot',matrix=rotation((1,0,0),-.08))
        for i in range(10):m.box((-w/2+.45+i*(w-.9)/9,2.29,front+1.11),(.24,.20,.08),'cream' if level<2 else 'char',bevel=.035)
    if kind=='workshop':
        m.box((w*.31,1.08,front+.55),(.67,1.23,.43),'navy',bevel=.04)
        m.torus((w*.31,1.33,front+.79),.21,.04,'orange',axis=(0,0,1),major=12,minor=4)
    # Drain pipe and service access on every type.
    if not lod:
        m.cylinder((w/2-.16,.25,front+.25),(w/2-.16,min(h+.2,h*(.5 if level==3 else 1)),front+.25),.055,'metalDark',segments=8)
        for y in [1,2.4,3.6]:
            if y<h and level<3:m.box((w/2-.16,y,front+.24),(.20,.08,.10),'steel')
    if level>=1:
        if level<3:
            # Local smoke staining preserves the original architecture's colour.
            for col in range(2 if lod else 3):
                cx=(col-1)*w*.27;cy=h*(.32+col*.14);rw=w*.19;rh=h*.22
                patch=[(cx,cy+rh*.22,front+.009),(cx-rw,cy-rh*.25,front+.009),(cx-rw*.82,cy+rh*.55,front+.009),
                       (cx-rw*.35,cy+rh,front+.007),(cx+rw*.10,cy+rh*.73,front+.007),
                       (cx+rw*.64,cy+rh*.96,front+.007),(cx+rw,cy-rh*.20,front+.007)]
                faces=[(0,i+1,i) for i in range(1,len(patch)-1)]+[(0,1,len(patch)-1)]
                m.add(patch,faces,'char',surface='decal',vertex_alpha=[.68 if level==1 else .93]+[0]*(len(patch)-1))
        # Crack chains and burnt-out slabs create visible damage without VFX.
        count=2 if lod else 5
        for i in range(count):
            x=(rng.random()-.5)*w*.82;yy=.45+rng.random()*(max(.2,h*.36-1.3) if level==3 else h*.6)
            pts=[(x,yy,front+.082),(x+.16,yy+.31,front+.087),(x+.05,yy+.57,front+.084),(x+.21,yy+.84,front+.084)]
            m.tube(pts,.022 if level<2 else .034,'char',segments=4)
    if level>=2:
        for i in range(4 if lod else 11):
            x=(rng.random()-.5)*w*1.15;z=front+.45+rng.random()*.85
            shard(m,x,.23+rng.random()*.14,z,(.20+rng.random()*.5,.12+rng.random()*.25,.16+rng.random()*.35),rng,'brick' if i%3 else 'char')
        if level==2:
            m.box((w*.18,h+.39,front*.25),(w*.43,.14,d*.50),'char',matrix=rotation((0,0,1),.12))
    if level==3:
        for i in range(3 if lod else 8):
            shard(m,(rng.random()-.5)*w,.32+rng.random()*.35,(rng.random()-.5)*d,(.5+rng.random(),.3+rng.random()*.2,.4+rng.random()),rng,'stone' if i%2 else 'char')
    m.anchors={'frontDoor':[0,.25,front+.6],'fireLower':[-w*.22,1.5,front+.22],
               'fireUpper':[w*.22,h*.72,front+.22],'fireRoof':[0,h+.45,0]}
    m.save('/tmp/fire-v7-raw',{'category':'building','type':kind,'stage':stage,'damageLevel':level,
                              'lod':int(lod),'dimensions':[w,h,d]})


if __name__=='__main__':
    for kind in TYPES:
        for stage in STAGES:
            build(kind,stage);build(kind,stage,True)
