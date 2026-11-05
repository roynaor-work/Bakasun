"""Original fictional fleet: four silhouettes, three deliberately authored LODs."""
import bpy, math, sys, json, random
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import geometry as g

CONFIG = {
    'corvette': dict(length=32,beam=6.3,deck=1.85,bridge=-.1,mast=9.0,turrets=[(-10,1)],label='שחף'),
    'destroyer':dict(length=50,beam=8.4,deck=2.45,bridge=-3,mast=13.5,turrets=[(-16,1),(16,1)],label='סער'),
    'cruiser':dict(length=66,beam=10.6,deck=3.0,bridge=-1,mast=17,turrets=[(-22,2),(-13,2),(22,2)],label='צור'),
    'carrier':dict(length=82,beam=18.6,deck=4.2,bridge=5,mast=18,turrets=[],label='אופק'),
}

def hull(c):
    L,W,D=c['length'],c['beam'],c['deck']
    # The sheer rises at the bow; a V-shaped lower hull sits below the sea.
    sections=[(-.5,0),(-.46,.24),(-.36,.79),(-.18,1),(.12,1),(.35,.93),(.49,.76),(.5,.68)]
    if g.LOD==2:sections=[sections[i] for i in [0,2,3,5,7]]
    for side in (-1,1):
        for i in range(len(sections)-1):
            (a,wa),(b,wb)=sections[i:i+2]
            za=D+max(0,-a-.28)*3;zb=D+max(0,-b-.28)*3
            # A dark waterline band is genuine geometry, visible in close view.
            rows=[(-1.5,.43,3),(-.05,.82,3),(.35,.91,0),(None,1,0)]
            for j in range(3):
                z0,r0,_=rows[j];z1,r1,tile=rows[j+1]
                z1a,z1b=(za,zb) if z1 is None else (z1,z1)
                g.mesh('Hull plates',[(side*wa*W/2*r0,a*L,z0),(side*wb*W/2*r0,b*L,z0),(side*wb*W/2*r1,b*L,z1b),(side*wa*W/2*r1,a*L,z1a)],[(0,1,2,3)] if side==1 else [(3,2,1,0)],tile)
    outline=[(-w*W/2,y*L,D+max(0,-y-.28)*3+.035) for y,w in sections]+[(w*W/2,y*L,D+max(0,-y-.28)*3+.035) for y,w in reversed(sections)]
    # Fan triangulation follows the pointed hull without overhanging box corners.
    v=[(0,0,D+.035)]+outline
    g.mesh('Steel deck',v,[(0,i+1,(i+1)%len(outline)+1) for i in range(len(outline))],2)
    g.mesh('Transom',[(-W*.34,L*.5,-1.5),(W*.34,L*.5,-1.5),(W*.34,L*.5,D),(-W*.34,L*.5,D)],[(0,1,2,3)],0)
    g.tube('Bow stem',(0,-L*.5,-1),(0,-L*.5,D+.75),.12,4)
    # Tapering cap rails reinforce the ship silhouette at any distance.
    for side in (-1,1):
        pts=[(side*w*W*.49,y*L) for y,w in sections]
        for (x,y),(xx,yy) in zip(pts,pts[1:]):
            g.tube('Gunwale',(x,y,D+.10),(xx,yy,D+.10),.11,4,n=6)
        if g.LOD<2:
            pts=[(side*w*W*.48,y*L) for y,w in sections[1:]]
            g.rail(pts,D+.12)

def turret(y,z,barrels=1,scale=1,name='turret_bow'):
    start=len(g.PARTS);s=scale
    g.cyl('Barbette',(0,y,z+.23*s),1.15*s,.46*s,5,vertices=12)
    g.wedge('Angular gun shield',(0,y,z+1.02*s),2.3*s,2.5*s,1.35*s,1,.28)
    if g.LOD<2:
        g.box('Shield roof',(0,y+.15*s,z+1.78*s),(1.5*s,1.8*s,.08*s),0,.02)
        g.box('Range finder',(.85*s,y+.2*s,z+1.6*s),(.4*s,1.15*s,.35*s),5)
        g.box('Optical sight',(.85*s,y-.39*s,z+1.62*s),(.23*s,.03*s,.14*s),7,0)
        g.box('Turret hatch',(-.35*s,y+.4*s,z+1.85*s),(.65*s,.65*s,.05*s),3,.03)
    for k in range(barrels):
        x=(k-(barrels-1)/2)*.72*s
        a=(x,y-.75*s,z+1.23*s);b=(x,y-4.35*s,z+1.75*s)
        g.tube('Gun barrel',a,b,.15*s if barrels>1 else .18*s,5)
        if g.LOD<2:
            g.tube('Recoil sleeve',a,(x,y-2*s,z+1.41*s),.24*s,4)
            # A black recessed muzzle and machined ring show that this is a tube.
            muzzle=g.ring('Muzzle ring',b,.15*s,.045*s,5,rotation=(math.pi/2-.14,0,0))
            g.cyl('Muzzle bore',(x,y-4.365*s,z+1.75*s),.121*s,.025*s,6,direction=(0,-1,.14))
    o=g.group_since(start,name,(0,y,z));o['role']='yaw turret';o['barrels']=barrels
    if g.LOD==0:
        for k in range(barrels):
            anchor=bpy.data.objects.new(f'muzzle_{name}_{k}',None);bpy.context.collection.objects.link(anchor);anchor.parent=o
            anchor.location=((k-(barrels-1)/2)*.72*s,-4.35*s,1.75*s)
    return o

def bridge(c,carrier=False):
    L,W,D,Y=c['length'],c['beam'],c['deck'],c['bridge']
    X=W*.3 if carrier else 0
    bw=W*.26 if carrier else W*.58;bd=L*.19
    g.wedge('Lower superstructure',(X,Y,D+1.15),(bw if not carrier else bw*1.25),bd,2.3,0,.07)
    g.wedge('Command bridge',(X,Y-bd*.18,D+3.12),bw*.98,bd*.67,1.65,1,.16)
    g.box('Bridge overhang',(X,Y-bd*.18,D+4.04),(bw*1.18,bd*.76,.25),4,.06)
    g.box('Bridge roof',(X,Y-bd*.12,D+4.35),(bw*.76,bd*.56,.4),0,.07)
    if g.LOD<2:
        for side in (-1,1):
            for k in range(3):
                g.box('Side bridge glazing',(X+side*bw*.46,Y-bd*.38+k*bd*.2,D+3.45),(.035,bd*.14,.55),7,.01)
            for k in range(2):
                g.box('Access hatch',(X+side*bw*.503,Y+bd*.27+k*.83,D+.95),(.045,.65,1.35),3,.03)
                g.tube('Hatch handle',(X+side*bw*.54,Y+bd*.27+k*.83-.16,D+1),(X+side*bw*.54,Y+bd*.27+k*.83+.08,D+1),.025,4,n=5)
        for k in range(4):
            g.box('Forward bridge glazing',(X+(k-1.5)*bw*.21,Y-bd*.51,D+3.44),(bw*.16,.035,.5),7,.01)
        g.rail([(X-bw*.58,Y-bd*.56),(X-bw*.58,Y+bd*.2)],D+4.2)
        g.rail([(X+bw*.58,Y-bd*.56),(X+bw*.58,Y+bd*.2)],D+4.2)
        for k in range(8 if g.LOD==0 else 4):
            stepZ=D+.2+k*.27
            g.box('External stair',(X-bw*.59,Y+bd*.15+k*.23,stepZ),(.7,.32,.12),4,.015)
    mast_z=c['mast'];my=Y+bd*.05
    g.wedge('Sensor mast base',(X,my,D+5.5),1.45,1.6,2.4,0,.32)
    for sx in (-1,1):
        g.tube('Tripod antenna',(X+sx*.7,my+.5,D+5),(X,my,mast_z),.10,5,n=6)
    g.tube('Foremast',(X,my,D+4.8),(X,my,mast_z+1.6),.1,4,n=6)
    g.tube('Yard arm',(X-1.8,my,mast_z-.6),(X+1.8,my,mast_z-.6),.08,4,n=6)
    if g.LOD<2:
        for xx in (-1.65,0,1.65):g.tube('Whip aerial',(X+xx,my,mast_z-.55),(X+xx,my,mast_z+1),.035,5,n=5)
        g.sphere('Satcom dome',(X+.9,my+1.1,D+5.2),(.65,.65,.7),4,2 if g.LOD==0 else 1)
        # Separate origin allows radar rotation without moving the whole mast.
    start=len(g.PARTS)
    g.box('Radar array',(X,my,mast_z+.3),(2.7,.2,.65),5,.07)
    g.box('Radar face',(X,my-.115,mast_z+.3),(2.45,.025,.44),15,0)
    o=g.group_since(start,'radar',(X,my,mast_z+.3));o['role']='rotating radar'
    flag(c,X,my+.08,mast_z-.35)

def flag(c,x,y,z):
    # Solid pennant, no state/country insignia. More segments at close LOD.
    start=len(g.PARTS);n=8 if g.LOD==0 else 4
    vs=[]
    for i in range(n+1):
        u=i/n
        for h in (0,1):vs.append((x+u*2.4,y+math.sin(u*7)*u*.22,z-h*(1.15-u*.25)))
    o=g.mesh('Pennant',vs,[(i*2,i*2+2,i*2+3,i*2+1) for i in range(n)],14)
    # Preserve continuous UV across all cloth segments.
    uv=o.data.uv_layers.active
    for p in o.data.polygons:
        for li in p.loop_indices:
            vi=o.data.loops[li].vertex_index;u=(vi//2)/n;v=vi%2
            uv.data[li].uv=((2+u*.94+.03)/4,1-(3+v*.94+.03)/4)
    o=g.group_since(start,'flag',(x,y,z));o['role']='wind cloth'

def funnel(c,y,scale=1):
    d=c['deck'];s=scale
    g.wedge('Exhaust housing',(0,y,d+2.7*s),2.1*s,2.6*s,3.8*s,0,.18)
    g.box('Exhaust black cap',(0,y,d+4.65*s),(1.8*s,2.15*s,.4*s),3)
    if g.LOD<2:
        for side in (-1,1):g.box('Exhaust grilles',(side*.99*s,y,d+3.6*s),(.035,1.8*s,.75*s),15,0)
        for yy in (-.57,.57):g.cyl('Exhaust duct',(0,y+yy*s,d+4.9*s),.47*s,.3*s,6)

def deck_fittings(c,kind):
    L,W,D=c['length'],c['beam'],c['deck']
    if g.LOD==2:return
    for side in (-1,1):
        # Recessed portholes, mooring bollards and weathered hull rubbing strakes.
        for i in range(8 if g.LOD==0 else 4):
            y=L*(-.27+i*.068 if g.LOD==0 else -.2+i*.13)
            g.cyl('Porthole rim',(side*(W*.48),y,D-.55),.15,.05,4,vertices=8,direction=(side,0,0))
            g.cyl('Porthole glass',(side*(W*.485),y,D-.55),.105,.055,7,vertices=8,direction=(side,0,0))
        for yy in (-L*.32,L*.36):
            g.box('Bollard foot',(side*W*.32,yy,D+.14),(.7,1.1,.18),3)
            for off in (-.3,.3):g.cyl('Mooring bollard',(side*W*.32,yy+off,D+.45),.13,.52,5)
        for yy in (L*.12,L*.28):
            g.cyl('Liferaft canister',(side*W*.37,yy,D+.7),.39,1.45,4,direction=(0,1,0))
            for dy in (-.5,.5):g.box('Raft strap',(side*W*.37,yy+dy,D+.7),(.8,.08,.8),3,.02)
        g.ring('Lifebuoy',(side*W*.497,L*.17,D-.05),.33,.095,12,rotation=(0,math.pi/2,0))
        if g.LOD==0:
            for yy in (-L*.2,0,L*.2):
                g.box('Deck locker',(side*W*.32,yy,D+.36),(.8,1.1,.65),1)
                g.box('Locker slats',(side*W*.38,yy,D+.4),(.025,.8,.4),15,0)
            for yy in (-L*.29,L*.31):
                g.tube('Capstan chain',(side*W*.2,yy,D+.18),(side*W*.19,yy-2.7,D+.18),.085,5,n=5)
            # Fire main pipe: long horizontal section and raised elbow.
            g.tube('Fire main',(side*W*.27,-L*.04,D+.22),(side*W*.27,L*.2,D+.22),.075,12,n=6)
            g.tube('Pipe riser',(side*W*.27,L*.2,D+.22),(side*W*.27,L*.2,D+.7),.075,12,n=6)
    for yy in (-L*.28,L*.3):
        g.box('Armoured deck hatch',(0,yy,D+.1),(1.6,1.5,.16),3)
        for side in (-1,1):g.box('Hatch dog',(side*.6,yy,D+.23),(.12,.7,.1),4,.01)
    # Fictional numeral is assembled from simple strokes, never a club insignia.
    for side in (-1,1):
        for yy in (-L*.33,-L*.30):g.box('Hull recognition stripe',(side*W*.43,yy,D-.48),(.025,.22,.65),4,0)

def missiles(c,y):
    D,W=c['deck'],c['beam']
    for side in (-1,1):
        g.wedge('Missile rack plinth',(side*W*.26,y,D+.4),1.5,2.6,.7,3,.1)
        for i in range(2 if g.LOD<2 else 1):
            o=g.box('Sealed angled launcher',(side*W*.28,y+(i-.5)*1.2,D+1.25),(1.7,.83,1.5),0,.07);o.rotation_euler[1]=side*.43
            g.box('Launcher end cap',(side*W*.28,y+(i-.5)*1.2-.44,D+1.25),(1.55,.05,1.35),9,.015)

def ciws(c,x,y):
    d=c['deck'];g.cyl('CIWS pedestal',(x,y,d+.65),.48,1.2,5)
    g.box('Close defence mount',(x,y,d+1.45),(1,1.2,.8),4)
    g.sphere('CIWS radar',(x,y+.25,d+2.05),(.45,.45,.45),4)
    g.tube('CIWS barrel cluster',(x,y-.4,d+1.45),(x,y-1.8,d+1.58),.16,5)

def helicopter(x,y,z,scale=1):
    s=scale
    g.sphere('Deck helicopter fuselage',(x,y,z+.85*s),(.7*s,1.65*s,.65*s),0,2 if g.LOD==0 else 1)
    g.sphere('Cockpit',(x,y-.9*s,z+1*s),(.6*s,.9*s,.5*s),7,1)
    g.tube('Tail boom',(x,y+.9*s,z+.85*s),(x,y+3.6*s,z+1.2*s),.2*s,5)
    g.box('Tail fin',(x,y+3.3*s,z+1.6*s),(.1*s,.85*s,1.2*s),0)
    g.box('Main rotor',(x,y,z+1.7*s),(6.3*s,.16*s,.055*s),3,.01)
    g.box('Main rotor',(x,y,z+1.71*s),(.16*s,6.3*s,.055*s),3,.01)
    for side in (-1,1):
        g.tube('Landing skid',(x+side*.65*s,y-1.1*s,z+.15*s),(x+side*.65*s,y+1.1*s,z+.15*s),.065*s,5)
        g.tube('Skid strut',(x+side*.65*s,y-.4*s,z+.15*s),(x+side*.45*s,y-.4*s,z+.7*s),.05*s,5)

def carrier_deck(c):
    L,W,D=c['length'],c['beam'],c['deck']
    g.box('Overhanging flight deck',(0,0,D+.2),(W*.98,L*.88,.35),2,.35)
    for side in (-1,1):
        g.box('Flight deck edge',(side*W*.493,0,D+.36),(.18,L*.85,.18),9,.03)
        for yy in (-L*.25,0,L*.25):g.box('Sponson',(side*W*.49,yy,D-.8),(2.2,6.2,1.7),0,.15)
    for yy in (-L*.23,L*.28):
        g.box('Landing pad',(0,yy,D+.4),(8.2,8.2,.035),10,0)
    if g.LOD<2:
        for yy in range(-29,31,5):g.box('Flight deck centreline',(-W*.17,yy,D+.43),(.18,2.5,.025),11,0)
        for yy in (L*.12,L*.2,L*.28):g.box('Arrestor line',(-1.6,yy,D+.44),(W*.68,.065,.025),4,0)
        for yy in (-L*.12,L*.12):
            g.box('Aircraft elevator',(-W*.38,yy,D+.44),(4.6,7.2,.04),3,.08)
            for offset in (-2.25,2.25):g.box('Elevator caution stripe',(-W*.38+offset,yy,D+.47),(.16,7,.02),9,0)
        for yy in (-L*.19,L*.26):helicopter(-W*.05,yy,D+.5,.92)
        g.box('Hangar recess',(0,L*.442,D-1),(W*.58,.04,2.1),6,.1)
        g.box('Hangar shutter',(W*.2,L*.445,D-1),(W*.13,.07,1.9),15,.02)
    ciws(c,-W*.48,-L*.26);ciws(c,W*.48,L*.28)

def author(kind,lod):
    c=CONFIG[kind];g.reset(lod);hull(c)
    if kind=='carrier':
        carrier_deck(c);bridge(c,True)
        # Carrier guns occupy side sponsons so the flight path stays readable.
        for index,(xx,yy) in enumerate([(-c['beam']*.48,c['length']*.2),(c['beam']*.48,-c['length']*.23)]):
            start=len(g.PARTS);ciws(c,xx,yy);o=g.group_since(start,f'turret_defence_{yy}',(xx,yy,c['deck']))
            if lod==0:
                anchor=bpy.data.objects.new(f'muzzle_defence_{index}',None);bpy.context.collection.objects.link(anchor);anchor.parent=o;anchor.location=(0,-1.8,1.58)
    else:
        bridge(c);funnel(c,c['length']*.12,1 if kind!='cruiser' else 1.2)
        if kind in ('destroyer','cruiser'):funnel(c,c['length']*.26,.8 if kind=='destroyer' else 1)
        missiles(c,c['length']*.04 if kind=='corvette' else -c['length']*.05)
        if kind!='corvette':
            ciws(c,-c['beam']*.3,c['length']*.29)
            ciws(c,c['beam']*.3,c['length']*.29)
            g.box('Aft landing deck',(0,c['length']*.38,c['deck']+.045),(c['beam']*.68,c['length']*.17,.04),10,0)
        for i,(yy,n) in enumerate(c['turrets']):turret(yy,c['deck']+(.8 if kind=='cruiser' and i==1 else .05),n,1.24 if kind=='cruiser' else .9 if kind=='corvette' else 1,f'turret_{i}')
        if kind=='cruiser' and lod<2:
            # Hull-side secondary armament separates the cruiser from the destroyer.
            for side in (-1,1):
                for yy in (-5,7,15):
                    g.cyl('Secondary battery',(side*c['beam']*.39,yy,c['deck']+1),.55,1.1,1)
                    g.tube('Secondary barrel',(side*c['beam']*.39,yy-.4,c['deck']+1.3),(side*c['beam']*.48,yy-2,c['deck']+1.4),.09,5)
    deck_fittings(c,kind)
    body=g.merge(g.PARTS,'body');g.PARTS.clear()
    if lod==1:
        bpy.context.view_layer.objects.active=body
        dec=body.modifiers.new('Medium distance static reduction','DECIMATE');dec.ratio=.48;dec.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=dec.name)
    if lod>=1:
        # At distance, articulation is sub-pixel. Bake it into one atlas draw.
        others=[o for o in bpy.context.scene.objects if o.type=='MESH' and o!=body]
        g.merge([body]+others,'body')
    # Anchor points are stable through LOD and are explicitly named for integration.
    for name,loc in [('wake_anchor',(0,c['length']*.48,0)),('impact_anchor',(0,-c['length']*.12,c['deck']+1)),('crew_anchor',(0,c['length']*.22,c['deck']+.15))]:
        o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=loc
    meta={'type':kind,'lod':lod,'lengthMeters':c['length'],'beamMeters':c['beam'],'deckHeightMeters':c['deck'],'forward':'+Z','waterlineMeters':0,'fictional':True}
    g.export(g.ROOT/f'assets/ships/{kind}-lod{lod}.glb',meta)
    return meta

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if args:
    author(args[0],int(args[1]) if len(args)>1 else 0)
else:
    for kind in CONFIG:
        for lod in range(3):author(kind,lod)
print('Original naval fleet exported.')
