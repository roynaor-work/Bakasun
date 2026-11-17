"""Resample the repository's CC0 anatomical profiles into a strict crowd budget.

Metres, +Y up, +Z face. No cube, capsule or Roblox character is used. The head
and torso sections come from the existing modeled characters2 human surfaces.
"""
import ast
import math
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DESIGN = ROOT.parent


def source_rows(file, function, variable):
    tree = ast.parse((DESIGN / file).read_text())
    fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == function)
    assignment = next(n for n in fn.body if isinstance(n, ast.Assign)
                      and any(isinstance(t, ast.Name) and t.id == variable for t in n.targets))
    return np.array(ast.literal_eval(assignment.value), dtype=float)


HEAD = source_rows('characters2/source/head_hands.py', '_face', 'rows')
TORSO = source_rows('characters2/source/body.py', 'add_body', 'torso')


def profile(rows, y):
    return [float(np.interp(y, rows[:, 0], rows[:, k])) for k in range(1, rows.shape[1])]


def proportions(look):
    h = look['heightM']
    head = .205 if look['age'] < 12 else (.226 if look['age'] < 18 else h / 7.45)
    return dict(h=h, head=head, chin=h-head, sx=look['build'],
                shoulder=h*.795, hip=h*.515, knee=h*.285, ankle=h*.052,
                halfShoulder=h*.112*look['shoulder'], upper=h*.160,
                fore=h*.148, hand=h*.057)


def make_rig(look):
    p = proportions(look); h = p['h']
    positions = {
        'Root': [0, 0, 0], 'Hips': [0, p['hip'], 0],
        'Spine': [0, h*.615, 0], 'Chest': [0, h*.715, -.004*h],
        'Neck': [0, p['chin']-.025*h, -.009*h],
        'Head': [0, p['chin']+p['head']*.34, 0],
    }
    for side, s in [('Left', 1), ('Right', -1)]:
        x = p['halfShoulder']
        positions.update({
            side+'Arm': [s*x, p['shoulder'], 0],
            side+'ForeArm': [s*(x+p['upper']), p['shoulder']-.007*h, 0],
            side+'Hand': [s*(x+p['upper']+p['fore']), p['shoulder']-.014*h, .005*h],
            side+'UpLeg': [s*h*.052, p['hip'], 0],
            side+'Leg': [s*h*.056, p['knee'], .008*h],
            side+'Foot': [s*h*.056, p['ankle'], -.008*h],
        })
    canonical = __import__('json').loads((DESIGN/'tennis-v7/rig.json').read_text())['joints']
    return [dict(name=j['name'], parent=j['parent'], world=positions[j['name']],
                 translation=(np.array(positions[j['name']])-np.array(positions[j['parent']]
                     if j['parent'] else [0, 0, 0])).tolist()) for j in canonical]


class Mesh:
    def __init__(self, rig):
        self.rig = rig; self.names = [j['name'] for j in rig]
        self.pos=[]; self.uv=[]; self.weights=[]; self.faces=[]; self.norm=[]

    def ground(self):
        # Every LOD has the same foot contact plane, including its actual sole.
        for side in ['Left','Right']:
            ids=[i for i,w in enumerate(self.weights) if w.get(side+'Foot',0)>.99]
            bottom=min(self.pos[i][1] for i in ids)
            for i in ids:self.pos[i][1]-=bottom
        return self

    def part(self, vertices, faces, uvs, weights, outward=None, smooth=True):
        v=np.array(vertices, dtype=float); offset=len(self.pos)
        f=np.array(faces, dtype=int)
        # Winding is checked geometrically, never assumed from a loft convention.
        if outward is not None:
            for i, (a,b,c) in enumerate(f):
                n=np.cross(v[b]-v[a],v[c]-v[a]); center=(v[a]+v[b]+v[c])/3
                if n@np.array(outward(center)) < 0: f[i]=[a,c,b]
        normals=np.zeros_like(v)
        for a,b,c in f:
            n=np.cross(v[b]-v[a],v[c]-v[a])
            assert np.linalg.norm(n)>1e-10, 'Degenerate triangle'
            normals[[a,b,c]]+=n
        # Smooth UV seam duplicates; atlas seams must not become lighting seams.
        groups={}
        for i,point in enumerate(v):groups.setdefault(tuple(np.round(point,8)),[]).append(i)
        for group in groups.values():normals[group]=normals[group].sum(axis=0)
        lens=np.linalg.norm(normals,axis=1)
        normals/=np.maximum(lens[:,None],1e-12)
        if not smooth:
            for tri in f:
                q=v[tri]; n=np.cross(q[1]-q[0],q[2]-q[0]);n/=np.linalg.norm(n)
                base=len(self.pos)
                for k in tri:
                    self.pos.append(v[k].tolist());self.uv.append(uvs[k]);self.weights.append(weights[k]);self.norm.append(n.tolist())
                self.faces.append([base,base+1,base+2])
            return
        self.pos.extend(v.tolist());self.uv.extend(uvs);self.weights.extend(weights);self.norm.extend(normals.tolist())
        self.faces.extend((f+offset).tolist())

    def loft(self, rings, segments, weight, uv, caps=True, phase=0):
        """Sections are (center, horizontal semi-axis, depth semi-axis)."""
        v=[];t=[];w=[];f=[]
        for i,(center,rx,rz) in enumerate(rings):
            for j in range(segments+1):
                a=-math.pi+math.tau*j/segments+phase
                point=np.array(center)+[rx*math.sin(a),0,rz*math.cos(a)]
                v.append(point);t.append(uv(point,j/segments));w.append(weight(i,point))
        step=segments+1
        for i in range(len(rings)-1):
            for j in range(segments):
                a=i*step+j;b=a+1;c=a+step;d=c+1
                f.extend([[a,b,c],[b,d,c]])
        cap_sides=[0,len(rings)-1] if caps is True else (caps if caps else [])
        for k in cap_sides:
            # n-2 cap triangles, sharing the actual boundary positions.
            for j in range(1,segments-1):f.append([k*step,k*step+j,k*step+j+1])
        def outward(point):
            # Upper/lower cap normals also need an outward Y component.
            idx=int(np.argmin([abs(point[1]-r[0][1]) for r in rings])); c=rings[idx][0]
            return [point[0]-c[0], (point[1]-np.mean([r[0][1] for r in rings]))*.15, point[2]-c[2]]
        self.part(v,f,t,w,outward)

    def tube(self, points, radii, segments, influences, uvfn, caps=True):
        v=[];f=[];uv=[];w=[];rings=[]
        points=np.array(points,dtype=float)
        for i,point in enumerate(points):
            d=points[min(i+1,len(points)-1)]-points[max(0,i-1)];d/=np.linalg.norm(d)
            u=np.cross(d,[0,0,1]);u/=np.linalg.norm(u);z=np.cross(u,d)
            for j in range(segments+1):
                a=math.tau*j/segments+math.pi/4
                vertex=point+u*radii[i][0]*math.cos(a)+z*radii[i][1]*math.sin(a)
                rings.append(vertex)
        step=segments+1
        for i in range(len(points)-1):
            base=len(v)
            # Each band owns its UV seam. Never interpolate through other atlas
            # swatches between a sleeve, skin, trousers and a shoe.
            for k in [i,i+1]:
                for j in range(step):
                    q=rings[k*step+j];v.append(q);uv.append(uvfn(q,i,j/segments));w.append(influences[k])
            for j in range(segments):
                a=base+j; b=a+1; c=a+step;f.extend([[a,b,c],[b,c+1,c]])
        capsides=[0,len(points)-1] if caps is True else (caps if caps else [])
        for k in capsides:
            base=0 if k==0 else (len(points)-2)*step*2+step
            for j in range(1,segments-1):f.append([base,base+j,base+j+1])
        def outward(point):
            # Project onto the polyline to orient each radial face and end cap.
            best=None
            for a,b in zip(points[:-1],points[1:]):
                d=b-a;t=float(np.clip((point-a)@d/(d@d),0,1));q=a+t*d
                dist=np.linalg.norm(point-q)
                if best is None or dist<best[0]:best=(dist,point-q)
            return best[1]
        self.part(v,f,uv,w,outward)


def tile(x,y,w=32,h=32):
    return lambda point, u=.5: [(x+w*(.08+.84*u))/256,(y+h*.5)/256]


def build(look,lod,rig):
    m=Mesh(rig);p=proportions(look);h=p['h'];s=h/1.8
    joints={j['name']:np.array(j['world']) for j in rig}
    skin=tile(192,128,64,64);hair=tile(128,192,64,32);shoe=tile(192,192,64,32);accent=tile(128,224,64,32)
    pants=tile(128,128,64,64)
    def headuv(point,u):return [u,(128*(1-(point[1]-p['chin'])/p['head']))/256]
    def torso_uv(point,u):
        # A front/back garment panel, with a narrow hem at its real height.
        v=float(np.clip((point[1]-h*.50)/(p['chin']-h*.50),0,1))
        return [(4+120*u)/256,(252-120*v)/256]
    def torso_w(i,point):
        t=float(np.clip((point[1]-h*.60)/(h*.14),0,1))
        return {'Hips':1-t,'Chest':t}
    # Human head sections retain the modeled jaw / cheek / cranium profiles.
    def section(source_y, y):
        rx,front,back=profile(HEAD,source_y)
        width=p['head']/.237*look['faceWidth']
        return ([0,y,(front+back)*.5*width],rx*width,(front-back)*.5*width)
    if lod==2:
        torso=[([0,h*.50,0],h*.092*p['sx'],h*.060*p['sx']),
               ([0,h*.79,0],h*.112*look['shoulder'],h*.061*p['sx'])]
        m.loft(torso,3,torso_w,torso_uv,True)
        # Four triangles make a tiny 3D head; limbs are double-sided silhouettes.
        v=[[0,h,0],[-p['head']*.34,p['chin']+.035,0],[p['head']*.34,p['chin']+.035,0],[0,p['chin']+.08,p['head']*.40]]
        m.part(v,[[0,1,2],[0,3,1],[0,2,3],[1,3,2]],[headuv(q,u) for q,u in zip(v,[.5,.28,.72,.5])],[{'Head':1}]*4,
               lambda q:np.array(q)-[0,p['chin']+p['head']*.35,0])
        for side,sign in [('Left',1),('Right',-1)]:
            a,b,c=[joints[side+n] for n in ['Arm','ForeArm','Hand']]
            a=a-[sign*h*.045,h*.025,0]
            v=[a+[0,.026*h,0],a-[0,.026*h,0],b+[0,-.022*h,0],c]
            m.part(v,[[0,1,2],[0,2,3]],[[.2,.70]]*4,
                   [{'Chest':1}]*2+[{side+'ForeArm':1},{side+'Hand':1}])
            a,b,c=[joints[side+n] for n in ['UpLeg','Leg','Foot']]
            v=[a+[h*.042,0,0],a-[h*.042,0,0],b+[h*.026,0,0],b-[h*.026,0,0],c+[h*.019,-h*.04,0],c-[h*.019,-h*.04,0]]
            m.part(v,[[0,1,2],[1,3,2],[2,3,4],[3,5,4]],[pants(q) for q in v],
                   [{side+'UpLeg':1}]*2+[{side+'Leg':1}]*2+[{side+'Foot':1}]*2)
        assert len(m.faces)==24
        return m.ground()

    # Reuse the existing waist and shoulder profiles, rather than primitive boxes.
    torso=[]
    rows=[(.640,h*.50),(.710,h*.625),(.994,p['shoulder']), (1.039,p['chin']+.008*h)] if lod==0 else [(.640,h*.50),(.994,p['shoulder']), (1.039,p['chin']+.008*h)]
    for sy, y in rows:
        rx,rz,cz=profile(TORSO,sy)
        factor=1.25*s*p['sx']
        if sy>.9:factor*=look['shoulder']
        if sy>1.03:factor=.98*s
        torso.append(([0,y,cz*s],rx*factor,rz*factor))
    extras=(4 if look['scarf'] else 0)+(4 if look['cap'] else 0)
    if look['hairStyle']=='bun':extras+=4
    # Optional details spend hidden cap triangles, keeping all accessories in 210.
    if lod==0:
        cap=[0,len(torso)-1]
        if extras>=4:cap.remove(0)
        if extras>=8:cap.remove(len(torso)-1)
        m.loft(torso,6,torso_w,torso_uv,caps=cap)
    else:m.loft(torso,4,torso_w,torso_uv)
    if lod==0:
        levels=[(1.111,.14),(1.220,.61),(1.283,.88)]
        rings=[section(sy,p['chin']+p['head']*t) for sy,t in levels]
        # N-sided fans at chin/crown, exactly 48 head triangles.
        n=8;v=[];uv=[];w=[];f=[]
        for center,rx,rz in rings:
            for j in range(n+1):
                a=-math.pi+math.tau*j/n
                q=np.array(center)+[rx*math.sin(a),0,rz*math.cos(a)]
                if look['hairStyle']=='curls' and q[1]>p['chin']+p['head']*.75:q[0]*=1.11;q[2]*=1.11
                v.append(q);uv.append(headuv(q,j/n));w.append({'Head':1})
        for i in range(2):
            for j in range(n):
                a=i*(n+1)+j;f.extend([[a,a+1,a+n+1],[a+1,a+n+2,a+n+1]])
        for k,y in [(0,p['chin']),(2,h)]:
            idx=len(v);q=[0,y,-.004*s];v.append(q);uv.append(headuv(q,.5));w.append({'Head':1})
            for j in range(n):f.append([idx,k*(n+1)+j,k*(n+1)+j+1])
        m.part(v,f,uv,w,lambda q:np.array(q)-[0,p['chin']+p['head']*.5,-.003*s])
        # A real nose profile and small ears, instead of a featureless ball.
        facez=profile(HEAD,1.20)[1]*p['head']/.237
        v=[[-.010*s,p['chin']+p['head']*.42,facez],[.010*s,p['chin']+p['head']*.42,facez],
           [0,p['chin']+p['head']*.65,facez*.98],[0,p['chin']+p['head']*.43,facez+.026*s*look['nose']]]
        m.part(v,[[0,3,2],[3,1,2]],[skin(q) for q in v],[{'Head':1}]*4,lambda q:[0,0,1])
        for sign in [-1,1]:
            x=sign*p['head']*.35*look['faceWidth'];y=p['chin']+p['head']*.51
            v=[[x,y-.022*s,0],[x+sign*.012*s,y,-.003*s],[x,y+.024*s,0],[x,y,.015*s]]
            m.part(v,[[0,1,3],[1,2,3]],[skin(q) for q in v],[{'Head':1}]*4,lambda q:[sign,0,1])
    else:
        rings=[section(1.128,p['chin']+p['head']*.18),section(1.267,p['chin']+p['head']*.84)]
        n=4;v=[];uv=[];f=[]
        for center,rx,rz in rings:
            for j in range(n+1):
                a=-math.pi+math.tau*j/n;q=np.array(center)+[rx*math.sin(a),0,rz*math.cos(a)]
                v.append(q);uv.append(headuv(q,j/n))
        for j in range(n):f.extend([[j,j+1,j+n+1],[j+1,j+n+2,j+n+1]])
        for k,y in [(0,p['chin']),(1,h)]:
            idx=len(v);v.append([0,y,0]);uv.append(headuv(v[-1],.5))
            for j in range(n):f.append([idx,k*(n+1)+j,k*(n+1)+j+1])
        m.part(v,f,uv,[{'Head':1}]*len(v),lambda q:np.array(q)-[0,p['chin']+p['head']*.5,0])

    for side,sign in [('Left',1),('Right',-1)]:
        shoulder,elbow,wrist=[joints[side+n] for n in ['Arm','ForeArm','Hand']]
        socket=shoulder-[sign*h*.045,0,0]
        end=wrist+[sign*p['hand'],0,0]
        if lod==0:
            pts=[socket,elbow,wrist,end]
            radius=[(.065*s*p['sx'],.063*s*p['sx']),(.046*s,.043*s),(.026*s,.022*s),(.035*s,.016*s)]
            infl=[{'Chest':1},{side+'Arm':.35,side+'ForeArm':.65},{side+'ForeArm':.20,side+'Hand':.80},{side+'Hand':1}]
            def armuv(q,i,u):
                return torso_uv([q[0],h*.75,q[2]],u) if i==0 or (i==1 and look['sleeve']=='long') else skin(q,u)
            m.tube(pts,radius,4,infl,armuv)
        else:
            m.tube([socket,elbow,end],[(.061*s,.060*s),(.042*s,.040*s),(.026*s,.016*s)],3,
                   [{'Chest':1},{side+'ForeArm':1},{side+'Hand':1}],lambda q,i,u:torso_uv(q,u) if i==0 else skin(q,u),caps=[2])
        hip,knee,ankle=[joints[side+n] for n in ['UpLeg','Leg','Foot']]
        top=hip+[0,.065*h,0];toe=ankle+[0,-.029*h,.091*h]
        if lod==0:
            pts=[top,knee,ankle,toe]
            radius=[(.089*s*p['sx'],.084*s*p['sx']),(.058*s*p['sx'],.061*s*p['sx']),(.034*s,.037*s),(.050*s,.035*s)]
            infl=[{'Hips':.25,side+'UpLeg':.75},{side+'UpLeg':.25,side+'Leg':.75},{side+'Foot':1},{side+'Foot':1}]
            def leguv(q,i,u):return shoe(q,u) if i>=2 else (skin(q,u) if i==1 and look['pants']=='shorts' else pants(q,u))
            m.tube(pts,radius,4,infl,leguv)
        else:
            m.tube([top,knee,toe],[(.086*s*p['sx'],.080*s*p['sx']),(.052*s,.054*s),(.042*s,.042*s)],3,
                   [{side+'UpLeg':1},{side+'Leg':1},{side+'Foot':1}],lambda q,i,u:pants(q,u) if i<2 else shoe(q,u))
    if lod==0:
        if look['scarf']:
            y=p['shoulder']+.015*h;z=.094*s
            v=[[-.045*s,y,z],[-.008*s,y,z+.012*s],[-.043*s,y-.24*s,z+.035*s],[-.005*s,y-.24*s,z+.035*s],
               [.012*s,y,z+.012*s],[.050*s,y,z],[.027*s,y-.18*s,z+.035*s],[.065*s,y-.18*s,z+.035*s]]
            m.part(v,[[0,1,2],[1,3,2],[4,5,6],[5,7,6]],[accent(q) for q in v],[{'Chest':1}]*8)
        if look['cap']:
            y=p['chin']+p['head']*.86;z=.058*s
            v=[[-.079*s,y,z],[0,y+.004*s,z+.025*s],[.079*s,y,z],[-.073*s,y-.008*s,z+.073*s],[0,y-.008*s,z+.09*s],[.073*s,y-.008*s,z+.073*s]]
            m.part(v,[[0,3,1],[1,3,4],[1,4,2],[2,4,5]],[accent(q) for q in v],[{'Head':1}]*6)
        if look['hairStyle']=='bun':
            c=np.array([0,p['chin']+p['head']*.83,-.091*s]);r=p['head']*.15
            v=[c+[0,r,0],c+[-r,-r*.5,0],c+[r,-r*.5,0],c+[0,0,-r]]
            m.part(v,[[0,1,2],[0,3,1],[0,2,3],[1,3,2]],[hair(q) for q in v],[{'Head':1}]*4,lambda q:q-c)
        # Two unobtrusive ear triangles are spent on fabric when three details
        # coincide; roster deliberately uses no more than two geometric add-ons.
        assert extras<=8
    assert len(m.faces)==[210,90][lod], (look['id'],lod,len(m.faces))
    return m.ground()
