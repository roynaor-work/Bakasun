"""Original alpine v7 tailoring over the repository's CC0 detailed athlete.

Reads the detailed connected garment/head source without modifying it. New winter
equipment is authored here in the exact canonical bind frame; no scans or people.
Output is an intermediate JSON outside the repository plus one atlas per athlete.
"""
from __future__ import annotations
import json, math, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'characters2/source'
sys.path.insert(0, str(SOURCE))
from mesh import Mesh
from body import add_body, loft, torso_weight
from head_hands import _face, _hair, _hand
from gear import _sole, _ski_boot, _ski, _surface
import gear as source_gear

RIG = json.loads((ROOT.parent/'characters/rig.json').read_text())
NAMES = [j['name'] for j in RIG['joints']]
POINTS = {j['name']: np.linalg.inv(np.array(j['inverseBindMatrix']).reshape(4,4).T)[:3,3] for j in RIG['joints']}
OUT = Path('/tmp/alpine-v7-character-raw'); OUT.mkdir(exist_ok=True)
PALETTES = {
 'ski-male': dict(skin='#C49778',hair='#43352F',shirt='#366D72',shorts='#26313F',shoes='#283849',gloves='#253A43',helmet='#F0EEE5',equipment='#375767',accent='#BDC7C2',soles='#5E6870',gaiter='#344C50',board='#375767'),
 'ski-female': dict(skin='#D6AC91',hair='#694739',shirt='#D8D8CD',shorts='#4E6263',shoes='#3F5156',gloves='#6E4442',helmet='#4E6468',equipment='#C48765',accent='#A5B0AC',soles='#576367',gaiter='#475655',board='#C48765'),
 'snowboard-female': dict(skin='#9D6C55',hair='#332F2D',shirt='#AA5D43',shorts='#343E4A',shoes='#3C4144',gloves='#333E46',helmet='#DAD5C4',equipment='#D2AC82',accent='#D3AD87',soles='#5A6264',gaiter='#424A4A',board='#AA805A'),
}

class TailoredMesh(Mesh):
    skip_coat = False
    gear_context = None
    def add(self, vertices, faces, region, weights, color=None):
        # Material categories survive the authoring intermediate and are exported
        # as several PBR primitives sharing a single embedded texture atlas.
        if self.gear_context=='ski-boot':
            if region=='accent':region='rubber';color='#40575E'
            elif region=='preserve' and color=='#425464':region='metal'
        if not (self.skip_coat and region in ('shirt','accent')):
            super().add(vertices, faces, region, weights, color=color)

def connected_jacket(mesh, sex):
    """One sewn torso+sleeve surface with shared armhole vertices.

    The earlier source used separate sleeve tubes and spherical shoulder fillers.
    Here the torso grid has actual armholes; sleeve rings reuse the complete
    armhole boundary, so shoulder normals and deformation remain continuous.
    """
    female=sex=='female'; count=40
    rings=[(.640,.125,.091,.008),(.667,.123,.092,.006),(.706,.121,.094,.004),
           (.752,.130,.101,0),(.806,.149,.109,-.004),(.862,.166,.111,-.005),
           (.908,.177,.110,-.007),(.958,.179,.102,-.008),(1.012,.151,.075,-.010),
           (1.033,.085,.055,-.011),(1.043,.053,.047,-.011)]
    vertices=[];weights=[];faces=[]
    for y,rx,rz,cz in rings:
        for k in range(count):
            a=2*math.pi*k/count
            factor=(.97-.025*math.exp(-((y-.72)/.10)**2)) if female else 1
            ripple=1+.022*math.sin(7*a+y*31)+.012*math.sin(13*a-y*42)
            vertices.append([math.cos(a)*rx*factor*ripple,y,cz+math.sin(a)*rz*ripple])
            weights.append(torso_weight(y))
    def idx(row,col): return row*count+(col%count)
    for row in range(len(rings)-1):
        for k in range(count):
            in_hole=5<=row<8 and any((k-c)%count in (37,38,39,0,1,2) for c in (0,20))
            if in_hole: continue
            a=idx(row,k);b=idx(row+1,k);an=idx(row,k+1);bn=idx(row+1,k+1)
            faces += [(a,b,an),(an,b,bn)]
    for side,s,centre in [('Left',1,0),('Right',-1,20)]:
        arm=side+'Arm';fore=side+'ForeArm';hand=side+'Hand'
        boundary=[idx(8,c) for c in range(centre-3,centre+4)]
        boundary += [idx(r,centre+3) for r in (7,6)]
        boundary += [idx(5,c) for c in range(centre+3,centre-4,-1)]
        boundary += [idx(r,centre-3) for r in (6,7)]
        theta=[]
        for i in boundary:
            x,y,z=vertices[i]
            theta.append(math.atan2((z+.007)/.054,(y-.937)/.075))
            w=.12+.25*float(np.clip((y-.862)/.15,0,1))
            weights[i]={'Chest':1-w,arm:w}
        shoulder=POINTS[arm];wrist=POINTS[hand];elbow=POINTS[fore]
        def influence(d):
            if d<.25:
                t=float(np.clip((d-.135)/.10,0,1));t=t*t*(3-2*t)
                return {'Chest':1-t,arm:t}
            if d>.51:
                t=float(np.clip((d-.51)/.065,0,1));return {fore:1-t,hand:t}
            t=float(np.clip((d-abs(elbow[0])+.065)/.130,0,1));t=t*t*(3-2*t)
            return {arm:1-t,fore:t}
        previous=boundary
        for d,ry,rz in [(.185,.052,.055),(.210,.056,.058),(.240,.055,.056),(.272,.053,.053),
                        (.295,.050,.049),(.314,.048,.047),(.327,.047,.046),(.342,.046,.045),
                        (.355,.047,.045),(.368,.047,.045),(.385,.046,.044),
                        (.406,.045,.043),(.449,.041,.039),(.491,.036,.035),
                        (.532,.031,.030),(.554,.030,.029)]:
            x=d*s;t=(x-shoulder[0])/(wrist[0]-shoulder[0]);c=shoulder*(1-t)+wrist*t
            ring=[]
            for a in theta:
                ripple=1+.050*math.sin(a*6+d*47)
                ring.append(len(vertices));vertices.append([x,c[1]+ry*math.cos(a)*ripple,c[2]+rz*math.sin(a)*ripple]);weights.append(influence(d))
            for k in range(len(ring)):
                n=(k+1)%len(ring);a=previous[k];an=previous[n];b=ring[k];bn=ring[n]
                # The torso-side boundary already reverses its winding on -X.
                # Using the same face order keeps BOTH sleeves outward-facing.
                faces += [(a,an,b),(an,bn,b)]
            previous=ring
        # A double rolled cuff preserves a dense edge above the glove gauntlet.
        p=[vertices[i] for i in previous];p.append(p[0])
        tube(mesh,p,.0028,'rubber',influence(.554),color='#3D5052',seg=6)
    vertices,faces,weights=loop_coat(vertices,faces,weights)
    mesh.add(vertices,faces,'shirt',weights)

def tube(mesh, p, r, region, w, color=None, seg=8):
    mesh.tube(p, r, region, w, segments=seg, color=color)

def extruded_surface(mesh, rings, region, weights, axis):
    """Consistent winding for cambered/concave skis and twin-tip boards.

    The old generic centroid test fails on upturned tips because the middle deck
    sits below the volume centroid. Determine winding from the section order,
    independent of curvature, so every deck top points +Y and every base -Y.
    """
    n=len(rings[0]);vertices=[list(p) for ring in rings for p in ring];faces=[]
    for row in range(len(rings)-1):
        for j in range(n):
            k=(j+1)%n;a=row*n+j;an=row*n+k;b=(row+1)*n+j;bn=(row+1)*n+k
            faces += [(a,b,an),(an,b,bn)] if axis=='x' else [(a,an,b),(an,bn,b)]
    lo=len(vertices);hi=lo+1
    vertices += [np.mean(rings[0],axis=0).tolist(),np.mean(rings[-1],axis=0).tolist()]
    last=(len(rings)-1)*n
    for j in range(n):
        k=(j+1)%n
        faces += [(lo,j,k),(hi,last+k,last+j)] if axis=='x' else [(lo,k,j),(hi,last+j,last+k)]
    mesh.add(vertices,faces,region,weights)

# Reuse the original ski geometry and binding construction, correcting its
# concave deck winding locally. This changes no imported source file on disk.
def corrected_source_surface(mesh,rings,region,weights,color=None,cap=True):
    if region=='equipment': return extruded_surface(mesh,rings,region,weights,'z')
    return _surface(mesh,rings,region,weights,color=color,cap=cap)
source_gear._surface=corrected_source_surface

def loop_coat(vertices,faces,weights):
    """One controlled Loop pass on the sewn coat, including skin interpolation."""
    v=np.asarray(vertices,float);adj=[set() for _ in v];boundary=[set() for _ in v];edges={}
    for a,b,c in faces:
        for i,j,k in [(a,b,c),(b,c,a),(c,a,b)]:
            adj[i].add(j);adj[j].add(i);edges.setdefault(tuple(sorted((i,j))),[]).append(k)
    for (i,j),op in edges.items():
        if len(op)==1:boundary[i].add(j);boundary[j].add(i)
    def mix(entries):
        out={}
        for index,factor in entries:
            for bone,weight in weights[index].items():out[bone]=out.get(bone,0)+factor*weight
        ranked=sorted(out.items(),key=lambda x:-x[1])[:4];total=sum(x[1] for x in ranked)
        return {bone:value/total for bone,value in ranked if value>1e-9}
    out=[];ow=[]
    for i in range(len(v)):
        if len(boundary[i])==2:entries=[(i,.75)]+[(j,.125) for j in boundary[i]]
        elif adj[i]:
            n=len(adj[i]);beta=3/16 if n==3 else 3/(8*n);entries=[(i,1-n*beta)]+[(j,beta) for j in adj[i]]
        else:entries=[(i,1)]
        out.append(sum(v[j]*w for j,w in entries).tolist());ow.append(mix(entries))
    mid={}
    for edge,op in edges.items():
        i,j=edge;entries=[(i,.5),(j,.5)] if len(op)!=2 else [(i,.375),(j,.375),(op[0],.125),(op[1],.125)]
        mid[edge]=len(out);out.append(sum(v[k]*w for k,w in entries).tolist());ow.append(mix(entries))
    ff=[]
    for a,b,c in faces:
        ab=mid[tuple(sorted((a,b)))];bc=mid[tuple(sorted((b,c)))];ca=mid[tuple(sorted((c,a)))]
        ff += [(a,ab,ca),(b,bc,ab),(c,ca,bc),(ab,bc,ca)]
    for p in out:
        x,y,z=p
        if abs(x)<.18 and z>0:p[2]+=.0024*math.exp(-((y-.705)/.065)**2)*math.sin(y*108+x*20)
        if abs(x)>.24:p[2]+=.0025*math.exp(-((abs(x)-.342)/.048)**2)*math.sin(abs(x)*145)*max(0,z+.015)/.075
    return out,ff,ow

def head_and_gloves(mesh, snowboard):
    first=len(mesh.positions);_face(mesh,'skier');_hair(mesh,'skier')
    for p in mesh.positions[first:]:
        p[0]*=.95;p[1]=1.09+(p[1]-1.075)*.758;p[2]*=.95
    for side,sign in [('Left',1),('Right',-1)]:
        if snowboard:
            first=len(mesh.positions);_hand(mesh,'skier',sign,POINTS)
            # Relax the extended source fingers. Snowboarders do not hold poles.
            origin=POINTS[side+'Hand']
            for p in mesh.positions[first:]:
                d=(p[0]-origin[0])*sign
                if d>.046:
                    t=(d-.046)/.060
                    p[0]=origin[0]+sign*(.046+.060*math.sin(t*.75)/.75)
                    p[2]-=.022*(1-math.cos(t*.75))
            continue
        origin=POINTS[side+'Hand'];w={side+'Hand':1}
        def pt(x,y=0,z=0): return (origin+np.array([sign*x,y,z])).tolist()
        # One static closed insulated grip. The shaft runs through the enclosed
        # palm centre at (+/-48mm,-4mm,-15mm), exactly the pole node's grip offset.
        mesh.ellipsoid(pt(.027,0,-.001),(.031,.024,.018),'gloves',w,segments=20,rings=11)
        tube(mesh,[pt(-.013),pt(.001),pt(.014)],[(.018,.017),(.019,.018),(.022,.018)],'gloves',w,seg=14)
        for y,r in [(.017,.0066),(.003,.0068),(-.011,.0065),(-.023,.0059)]:
            pts=[pt(.042,y,.004),pt(.060,y,-.001),pt(.068,y,-.014),
                 pt(.060,y,-.029),pt(.043,y,-.034),pt(.034,y,-.026)]
            tube(mesh,pts,[r,r*1.03,r,r*.98,r*.87,r*.65],'gloves',w,seg=10)
            tube(mesh,[pt(.056,y-r*.6,.005),pt(.061,y,.003),pt(.056,y+r*.6,.005)],.00095,'seam',w,color='#526467',seg=5)
        tube(mesh,[pt(.009,.019,0),pt(.023,.031,-.005),pt(.043,.030,-.018),pt(.057,.022,-.025)],
             [.010,.010,.009,.006],'gloves',w,seg=12)
        mesh.ellipsoid(pt(.025,0,.015),(.025,.017,.0035),'gloves',w,segments=16,rings=7)
        tube(mesh,[pt(-.006,-.018,.009),pt(-.009,0,.019),pt(-.006,.018,.009)],.003,'rubber',w,color='#43595C',seg=8)

def helmet(mesh, female):
    w={'Head':1}
    # Open-bottom hard shell with a low occipital skirt and a real inner rim.
    rings=[]
    for t in np.linspace(.04, math.pi/2+.12, 13):
        ring=[]
        for a in np.linspace(0,2*math.pi,40,endpoint=False):
            # Lower at rear; small front brim clears the goggle frame.
            y=1.214+.093*math.cos(t)-.011*max(0,-math.sin(a))*math.sin(t)**3
            ring.append((.085*math.sin(t)*math.cos(a), y, -.006+.098*math.sin(t)*math.sin(a)))
        rings.append(ring)
    _surface(mesh,rings,'helmet',w,cap=False)
    tube(mesh,rings[-1]+rings[-1][:1],.0035,'rubber',w,color='#263338')
    # Shallow protective peak over the wrap-around lens.
    peak=[]
    for x in np.linspace(-.073,.073,25):
        peak.append((x,1.230+.005*(1-(x/.08)**2),.090+.014*(1-(x/.08)**2)))
    tube(mesh,peak,.004,'helmet',w)
    # Ventilation slots and protective ribbed ear pads.
    for sx in (-.038,0,.038):
        pts=[]
        for z in np.linspace(-.048,.027,10):
            y=1.214+.093*math.sqrt(max(.01,1-(sx/.085)**2-((z+.006)/.098)**2))+.0014
            pts.append((sx,y,z))
        tube(mesh,pts,.0027,'rubber',w,color='#29383B',seg=6)
    for s in [-1,1]:
        mesh.ellipsoid((s*.078,1.187,-.018),(.013,.031,.033),'rubber',w,segments=16,rings=10,color='#27383B')
        tube(mesh,[(s*.078,1.192,.013),(s*.057,1.139,.030),(s*.030,1.123,.047)],.0038,'rubber',w,color='#314043')
    # A continuous curved dual-radius lens, frame follows its actual perimeter.
    verts=[]; rows=9; cols=25
    def lens(x,v):
        xx=x*.083
        upper=1.222-.005*abs(x)
        lower=1.170+.014*math.exp(-(x/.23)**2)+.009*abs(x)**3
        yy=lower+(upper-lower)*v
        zz=.086+.013*(1-x*x)-.024*abs(x)**3
        return [xx,yy,zz]
    for iy in range(rows):
        for ix in range(cols): verts.append(lens(-1+2*ix/(cols-1),iy/(rows-1)))
    faces=[]
    for iy in range(rows-1):
        for ix in range(cols-1):
            a=iy*cols+ix; faces += [(a,a+1,a+cols),(a+1,a+cols+1,a+cols)]
    mesh.add(verts,faces,'goggle_lens',w,color='#F5F0E3')
    edge=[lens(-1+2*i/(cols-1),1) for i in range(cols)]
    edge += [lens(1,1-i/(rows-1)) for i in range(1,rows)]
    edge += [lens(1-2*i/(cols-1),0) for i in range(1,cols)]
    edge += [lens(-1,i/(rows-1)) for i in range(1,rows)]
    tube(mesh,edge,.0038,'rubber',w,color='#2C383C')
    # Tensioned strap wraps the shell; a small anonymous adjuster is geometric.
    for s in [-1,1]:
        p=[(s*.080,1.198,.063),(s*.089,1.196,.025),(s*.087,1.196,-.025),(s*.064,1.197,-.080)]
        tube(mesh,p,.0085,'rubber',w,color='#394A4B',seg=8)
        mesh.ellipsoid((s*.088,1.196,.005),(.004,.012,.017),'metal',w,segments=10,rings=6,color='#A0A6A0')
    # Knit neck gaiter reaches the chin and masks the exposed long-neck artefact.
    def gaiter_weight(y):
        h=float(np.clip((y-1.08)/.13,0,.50));return {'Head':h,'Neck':.65*(1-h),'Chest':.35*(1-h)}
    loft(mesh,[(1.019,.049,.045,-.009),(1.039,.050,.046,-.007),(1.063,.052,.047,-.005),
               (1.089,.064,.068,.001),(1.111,.071,.078,.007),(1.134,.074,.083,.012),
               (1.146,.075,.083,.015)],'gaiter',gaiter_weight,segments=36,folds=.015,caps=False)
    if female:
        # One compact tucked braid below the rear shell, safely above collar.
        p=[(0,1.180,-.091),(.012,1.151,-.100),(.017,1.121,-.092),(.012,1.095,-.079)]
        tube(mesh,p,[.013,.012,.010,.005],'hair',w,seg=10)

def tailoring(mesh, sex, snowboard):
    # Winter shell volume: modest shoulder padding, a shaped waist and dense cuffs.
    for i,(p,r) in enumerate(zip(mesh.positions,mesh.regions)):
        x,y,z=p
        if r=='shirt':
            if abs(x)<.18:
                waist=math.exp(-((y-.73)/.12)**2)
                factor=1.035 if sex=='male' else .97-.045*waist
                p[0]*=factor; p[2]=(z+.004)*1.055-.004
            else:
                # Retain joint centreline and arm length; change sleeve thickness.
                p[2]*=1.08
        if r=='shorts':
            p[0]*=1-(.11 if sex=='male' else .025)*math.exp(-((y-.56)/.09)**2)
        if r=='skin' and y>1.09 and sex=='female': p[0]*=.97
    # Flatten the original spherical chest-side shoulder filler into a smooth
    # deltoid transition. The collar/hood below supplies winter-coat volume.
    for part in mesh.parts:
        if part['region']=='shirt' and part['vertexCount']==254:
            for p in mesh.positions[part['firstVertex']:part['firstVertex']+part['vertexCount']]:
                sign=1 if p[0]>0 else -1
                p[0]=sign*.120+(p[0]-sign*.120)*.90
                p[1]=1.004+(p[1]-1.004)*.62
                p[2]=-.003+(p[2]+.003)*.88
    # Conforming seam helper for the new, connected coat (all coordinates after
    # tailoring). Stitching follows the actual ellipsoid instead of old surfaces.
    jacket_rows=np.array([(.640,.125,.091,.008),(.667,.123,.092,.006),(.706,.121,.094,.004),
        (.752,.130,.101,0),(.806,.149,.109,-.004),(.862,.166,.111,-.005),
        (.908,.177,.110,-.007),(.958,.179,.102,-.008),(1.012,.151,.075,-.010),
        (1.033,.085,.055,-.011),(1.043,.053,.047,-.011)])
    def front(x,y):
        rx,rz,cz=[float(np.interp(y,jacket_rows[:,0],jacket_rows[:,k])) for k in (1,2,3)]
        if sex=='female':rx*= (.97-.025*math.exp(-((y-.72)/.10)**2))*(.97-.045*math.exp(-((y-.73)/.12)**2))
        else:rx*=1.035
        rz*=1.055;cz=(cz+.004)*1.055-.004
        x=float(np.clip(x,-rx*.92,rx*.92));return [x,y,cz+rz*math.sqrt(max(0,1-(x/rx)**2))+.0025]
    # A padded high collar meets the neck gaiter; a folded hood sits behind it.
    rings=[]
    for t in [0,.35,.78,1]:
        ring=[]
        for a in np.linspace(0,2*math.pi,36,endpoint=False):
            front_amount=max(0,math.sin(a));y=1.014+t*(.090-.020*front_amount)
            rx=.066+.006*math.sin(t*math.pi);rz=.060+.006*math.sin(t*math.pi)
            ring.append((rx*math.cos(a),y,-.011+rz*math.sin(a)))
        rings.append(ring)
    _surface(mesh,rings,'shirt',{'Chest':.75,'Neck':.25},cap=False)
    tube(mesh,rings[-1]+rings[-1][:1],.002,'seam',{'Chest':.75,'Neck':.25},color='#52686A',seg=6)
    p=[(-.125,1.000,-.070),(-.083,1.015,-.094),(0,1.025,-.106),(.083,1.015,-.094),(.125,1.000,-.070)]
    tube(mesh,p,[.009,.016,.020,.016,.009],'shirt',{'Chest':1},seg=12)
    # Water-resistant diagonal hand pockets with raised zipper tapes and pulls.
    for s in [-1,1]:
        p=[front(s*x,y) for x,y in [(.046,.700),(.067,.727),(.088,.753)]]
        tube(mesh,p,.0031,'rubber', [torso_weight(q[1]) for q in p],color='#3A494B',seg=6)
        mesh.ellipsoid(front(s*.087,.752),(.004,.008,.002),'metal',torso_weight(.752),segments=8,rings=5,color='#B0B5AF')
        # Low contrast shoulder yoke, readable as tailoring rather than a logo.
        p=[front(s*x,y) for x,y in [(.037,.997),(.078,.991),(.119,.975),(.155,.955)]]
        tube(mesh,p,.0016,'seam',[torso_weight(q[1]) for q in p],color='#7B8F8D',seg=6)
        # Articulated elbow seam following the sleeve in the bind frame.
        e=POINTS['LeftForeArm' if s>0 else 'RightForeArm']
        pts=[]
        for a in np.linspace(-math.pi/2,math.pi/2,13):
            pts.append((float(e[0]),float(e[1])+.037*math.cos(a),float(e[2])+.043*math.sin(a)))
        tube(mesh,pts,.0016,'seam',{'LeftForeArm' if s>0 else 'RightForeArm':.5,'LeftArm' if s>0 else 'RightArm':.5},color='#647C7B',seg=6)
    # Weather flap and short, chunky slider at the centre-front zip.
    p=[front(0,y) for y in [.660,.706,.752,.806,.862,.908,.958,1.014]]
    tube(mesh,p,.0033,'rubber',[torso_weight(q[1]) for q in p],color='#63797A',seg=6)
    mesh.ellipsoid(front(0,.974),(.004,.011,.003),'metal',{'Chest':1},segments=8,rings=5,color='#C6C7BC')
    # Snow gaiters and padded knees have small real folds, not painted highlights.
    for side,s in [('Left',1),('Right',-1)]:
        knee=POINTS[side+'Leg']; ankle=POINTS[side+'Foot']
        for yy in (.19,.204):
            t=(knee[1]-yy)/(knee[1]-ankle[1]);center=knee*(1-t)+ankle*t
            rx=.050+(yy-.190)*.2;rz=.058+(yy-.190)*.2
            pts=[]
            for a in np.linspace(0,2*math.pi,25):
                pts.append((float(center[0])+rx*math.cos(a),yy,float(center[2])+rz*math.sin(a)))
            tube(mesh,pts,.0014,'seam',{side+'Leg':1},color='#536369',seg=6)

def snowboard_geometry(mesh):
    # Laminate sidewall; rounded twin-tip board along +X, all dimensions metres.
    # This is a separate Root-child mesh in export. No additional skeletal joint.
    w={'Root':1}; rings=[]
    for x,width,rise in [(-.64,.002,.062),(-.628,.063,.048),(-.594,.103,.029),(-.54,.113,.017),
                          (-.37,.108,.015),(0,.098,.014),(.37,.108,.015),(.54,.113,.017),
                          (.594,.103,.029),(.628,.063,.048),(.64,.002,.062)]:
        rings.append([(x,rise-.006,-width),(x,rise-.006,width),(x,rise+.006,width),(x,rise+.006,-width)])
    extruded_surface(mesh,rings,'board',w,'x')
    # Thin metal edge and restrained non-brand inlay follow each rail.
    for s in [-1,1]:
        p=[(r[0][0],r[0][1]+.003,s*abs(r[0][2])) for r in rings]
        tube(mesh,p,.0016,'metal',w,color='#72848A',seg=6)
        station_x=[ring[0][0] for ring in rings];station_top=[ring[2][1] for ring in rings]
        p=[(x,float(np.interp(x,station_x,station_top))+.0012,s*z) for x,z in [(-.56,.065),(-.39,.075),(0,.067),(.39,.075),(.56,.065)]]
        tube(mesh,p,.0020,'board_inlay',w,color='#3E6869',seg=6)

def snowboard_bindings(mesh):
    for side in ['Left','Right']:
        x=float(POINTS[side+'Foot'][0]);w={side+'Foot':1}
        # Heel cup, raised highback and two toe/instep ratchet straps.
        _surface(mesh,[[(x-.045,.012,-.115),(x+.045,.012,-.115),(x+.045,.012,.104),(x-.045,.012,.104)],
                       [(x-.042,.024,-.115),(x+.042,.024,-.115),(x+.042,.024,.104),(x-.042,.024,.104)]], 'rubber',w)
        mesh.ellipsoid((x,.115,-.108),(.047,.080,.010),'rubber',w,segments=16,rings=10,color='#2A3C41')
        for y,z in [(.073,.062),(.115,-.036)]:
            p=[(x-.045,y,z),(x-.025,y+.010,z+.006),(x+.025,y+.010,z+.006),(x+.045,y,z)]
            tube(mesh,p,.006,'rubber',w,color='#263B40',seg=8)
            mesh.ellipsoid((x+.042,y+.002,z+.003),(.008,.005,.009),'metal',w,segments=8,rings=5,color='#A6ACAB')

def snowboard_boot(mesh,x,w):
    # Soft padded boot, distinct from the skiers' rigid three-buckle shell.
    rows=[(.029,.049,.112,0),(.052,.051,.111,-.002),(.079,.048,.104,-.012),
          (.103,.044,.073,-.034),(.131,.042,.055,-.049),(.162,.041,.050,-.056),(.185,.039,.044,-.061)]
    rings=[]
    for y,rx,rz,cz in rows:
        rings.append([(x+rx*math.cos(a),y,cz+rz*math.sin(a)) for a in np.linspace(0,2*math.pi,24,endpoint=False)])
    _surface(mesh,rings,'shoes',w)
    def frontz(y):return float(np.interp(y,[r[0] for r in rows],[r[2]+r[3] for r in rows]))+.003
    # Padded tongue and five crossed lace runs; no brand or recognisable dial.
    tongue=[(x,y,frontz(y)) for y in [.075,.092,.111,.132,.153,.177]]
    tube(mesh,tongue,[(.021,.004)]*len(tongue),'rubber',w,color='#414A4D',seg=12)
    for y in [.085,.105,.125,.145,.165]:
        z=frontz(y)+.002;span=.026 if y<.12 else .022
        tube(mesh,[(x-span,y-.003,z-.003),(x,y,z+.003),(x+span,y+.003,z-.003)],.00165,'lace',w,color='#A3A59D',seg=6)
        for s in [-1,1]:mesh.ellipsoid((x+s*(span+.0015),y,z-.001),(.003,.0025,.003),'metal',w,segments=8,rings=4,color='#75817E')
    for s in [-1,1]:
        mesh.ellipsoid((x+s*.041,.115,-.052),(.006,.047,.035),'rubber',w,segments=14,rings=8,color='#303C40')
        p=[(x+s*.044,.050,-.098),(x+s*.048,.075,-.067),(x+s*.044,.119,-.038),(x+s*.038,.166,-.044)]
        tube(mesh,p,.0015,'seam',w,color='#697573',seg=6)
    rim=[(x+.039*math.cos(a),.185,-.061+.044*math.sin(a)) for a in np.linspace(0,2*math.pi,25)]
    tube(mesh,rim,.003,'rubber',w,color='#434E4F',seg=7)

def srgb(linear):
    a=np.array(linear); return np.where(a<=.0031308,a*12.92,1.055*np.maximum(a,0)**(1/2.4)-.055)

def make_atlas(model, mesh):
    # Allocate most texels to the coat and trousers; small hardware shares the
    # lower strip. One original 1024 atlas with a fine, irregular textile grain.
    keys=[]
    for part in mesh.parts:
        k=(part['region'],tuple(round(x,8) for x in part['linearRGB']))
        if k not in keys: keys.append(k)
        part['tile']=keys.index(k)
    if len(keys)>54: raise ValueError('Atlas tile budget exceeded')
    large={'shirt':(0,0,512,512),'shorts':(512,0,256,512),'skin':(768,0,256,256),'helmet':(768,256,256,256)}
    allocated=set();rects=[];small=0
    for region,color in keys:
        if region in large and region not in allocated:rects.append(large[region]);allocated.add(region)
        else:rects.append(((small%10)*96,512+(small//10)*96,96,96));small+=1
    for part in mesh.parts:part['atlasRect']=rects[part['tile']]
    atlas=np.zeros((1024,1024,3),dtype=np.uint8)
    rng=np.random.default_rng(711)
    for index,(region,color) in enumerate(keys):
        ox,oy,tw,th=rects[index];yy,xx=np.mgrid[0:th,0:tw]
        base=srgb(color)*255
        cloth=region in ('shirt','shorts','gaiter','gloves','hair','seam')
        noise=rng.normal(0,.55 if cloth else .3,(th,tw))
        if cloth:
            # Unequal thread spacing avoids the earlier waffle/checker look.
            noise+=.32*np.sin(xx*2.41+.12*np.sin(yy*.13))+.24*np.sin(yy*2.17+.15*np.sin(xx*.11))
            low=Image.fromarray(np.clip(128+rng.normal(0,16,(th,tw)),0,255).astype('uint8')).filter(ImageFilter.GaussianBlur(4))
            noise+=(np.asarray(low,dtype=float)-128)*.18
            macro=Image.fromarray(np.clip(128+rng.normal(0,30,(max(8,th//16),max(8,tw//16))),0,255).astype('uint8')).resize((tw,th),Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(12))
            noise+=(np.asarray(macro,dtype=float)-128)*.075
        tile=np.clip(base[None,None,:]+noise[:,:,None],0,255).astype('uint8')
        if region=='goggle_lens':
            # Reflected alpine skyline over a warm/cool mirrored lens. Actual
            # environment reflection also contributes through metallic PBR.
            for y in range(th):
                t=y/(th-1)
                sky=(np.array([85,145,169])*(1-t)+np.array([209,171,112])*t)
                tile[y]=sky
            for x in range(tw):
                ridge=int(th*(.54+.11*math.sin(x/tw*9)+.055*math.sin(x/tw*29)))
                tile[ridge:ridge+2,x]=[173,193,194]
                tile[ridge+2:,x]=np.array([87,115,125])+np.arange(th-ridge-2)[:,None]*.10
            tile[int(th*.15):int(th*.15)+2]=[182,205,207]
        if region=='board':
            for x in range(tw):
                t=(x%32)/32
                tile[:,x]=np.clip(base+5*math.sin(x*.37)+1.4*np.sin(xx[:,x]*.7+yy[:,x]*.07)[:,None],0,255)
        atlas[oy:oy+th,ox:ox+tw]=tile
    p=ROOT/'characters'/f'{model}-atlas.png'
    Image.fromarray(atlas).save(p,optimize=True)
    return keys

def main():
    (ROOT/'characters').mkdir(exist_ok=True)
    for model,palette in PALETTES.items():
        sex='male' if model=='ski-male' else 'female'; snow=model.startswith('snowboard')
        mesh=TailoredMesh(NAMES,palette)
        mesh.skip_coat=True;add_body(mesh,'skier',POINTS);mesh.skip_coat=False
        connected_jacket(mesh,sex);head_and_gloves(mesh,snow)
        tailoring(mesh,sex,snow)
        for side in ['Left','Right']:
            x=float(POINTS[side+'Foot'][0]);w={side+'Foot':1}
            _sole(mesh,x,w,'skier')
            if snow:snowboard_boot(mesh,x,w)
            else:
                mesh.gear_context='ski-boot';_ski_boot(mesh,x,w);mesh.gear_context=None
            if not snow:
                start=len(mesh.positions);_ski(mesh,x,w)
                # Full length all-mountain skis: retain exact boot/binding mount,
                # extend only the shovel/tail beyond the contact section.
                for p in mesh.positions[start:]:
                    if abs(p[2])>.13: p[2]=math.copysign(.13+(abs(p[2])-.13)*1.42,p[2])
        if snow: snowboard_bindings(mesh)
        helmet(mesh,sex=='female')
        # Shorten the exposed neck at the mesh level while preserving the exact
        # 18-joint contract. The skull/pads sit naturally into the padded collar.
        head_index=NAMES.index('Head')
        for p,ji,we in zip(mesh.positions,mesh.joints,mesh.weights):
            p[1]-=.020*sum(w for j,w in zip(ji,we) if j==head_index)
        board=None
        if snow:
            start=len(mesh.positions); tri=len(mesh.indices); partstart=len(mesh.parts)
            snowboard_geometry(mesh)
            for p in mesh.positions[start:]:p[0]*=1.10/1.28;p[2]*=.20/.226
            board={'firstVertex':start,'firstTriangle':tri,'firstPart':partstart}
        keys=make_atlas(model,mesh)
        data={'positions':mesh.positions,'normals':mesh.normals,'indices':mesh.indices,
              'colors':mesh.colors,'joints':mesh.joints,'weights':mesh.weights,'parts':mesh.parts}
        data['model']=model;data['sex']=sex;data['sport']='snowboard' if snow else 'ski';data['board']=board
        data['regions']=mesh.regions; data['atlasTiles']=[{'region':r,'linearRGB':c} for r,c in keys]
        (OUT/f'{model}.json').write_text(json.dumps(data,separators=(',',':')))
        print(f'{model}: {len(mesh.positions)} vertices / {len(mesh.indices)} triangles / {len(keys)} atlas tiles')

if __name__=='__main__': main()
