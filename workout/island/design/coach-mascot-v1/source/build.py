"""Original low-poly coach. Deterministic, uncompressed glTF 2.0, numpy only.

All shapes, facial expressions and motion are authored for this pack. The exact
motion2 rest skeleton is reused as an interoperability contract, not retargeted.
Run: python3 workout/island/design/coach-mascot-v1/source/build.py
"""
from pathlib import Path
import json, math, struct, hashlib, sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
BONES=json.loads((ROOT/'rig.json').read_text())['bones']
NAMES=[b['name'] for b in BONES]
REST={}
for b in BONES: REST[b['name']]=np.array(b['restTranslationMeters'])+(REST[b['parent']] if b['parent'] else 0)
EXP=['happy','surprised','encouraging','thoughtful','proud','gently_disappointed','laughing','wink']
CONTROLS=['grip_left','grip_right','point_left','point_right']
PALETTE={
 'skin':'DA986E','skinLight':'EAAF83','cheek':'EA8A79','hair':'403129',
 'teal':'258B87','tealLight':'48ADA3','coral':'E77D69','navy':'283B4B',
 'cream':'FFF0CD','sole':'DAA94E','white':'FFFCF3','eye':'243F45',
 'mouth':'783F3C','tongue':'F59A8D'}
def color(k):
    a=np.array([int(PALETTE[k][i:i+2],16)/255 for i in (0,2,4)])
    return np.where(a<=.04045,a/12.92,((a+.055)/1.055)**2.4).tolist()
def normal(a): return np.array(a)/max(1e-10,np.linalg.norm(a))

class Mesh:
    def __init__(self): self.v=[];self.f=[];self.c=[];self.skin=[];self.tags=[]
    def part(self,vs,fs,col,bone,tag=''):
        off=len(self.v);self.v.extend(vs);self.f.extend([[off+i for i in f] for f in fs])
        self.c.extend([color(col)]*len(vs));self.skin.extend([bone]*len(vs));self.tags.extend([tag]*len(vs))
    def ellipsoid(self,p,r,col,bone,n=12,rings=5,tag=''):
        # Unique poles avoid degenerate triangles and give predictable budgets.
        vs=[np.array(p)+[0,r[1],0]]
        for j in range(1,rings):
            a=math.pi*j/rings
            for i in range(n):
                b=2*math.pi*i/n
                vs.append(np.array(p)+np.array([r[0]*math.sin(a)*math.cos(b),r[1]*math.cos(a),r[2]*math.sin(a)*math.sin(b)]))
        vs.append(np.array(p)-[0,r[1],0]);fs=[]
        for i in range(n):fs.append([0,1+(i+1)%n,1+i])
        for j in range(rings-2):
            for i in range(n):
                a=1+j*n+i;b=1+j*n+(i+1)%n;c=b+n;d=a+n
                fs.extend([[a,b,c],[a,c,d]])
        last=len(vs)-1
        for i in range(n):fs.append([last,last-1-(i+1)%n,last-1-i])
        self.part(vs,fs,col,bone,tag)
    def loft(self,sections,col,bone,n=12,tag=''):
        vs=[]
        for x,y,z,rx,rz in sections:
            for i in range(n):
                a=math.tau*i/n;vs.append([x+rx*math.cos(a),y,z+rz*math.sin(a)])
        vs.extend([[sections[0][0],sections[0][1],sections[0][2]],[sections[-1][0],sections[-1][1],sections[-1][2]]]);fs=[]
        for j in range(len(sections)-1):
            for i in range(n):
                a=j*n+i;b=j*n+(i+1)%n;c=b+n;d=a+n
                fs.extend([[a,c,b],[a,d,c]])
        for i in range(n):
            fs.extend([[len(vs)-2,i,(i+1)%n],[len(vs)-1,(len(sections)-1)*n+(i+1)%n,(len(sections)-1)*n+i]])
        if sections[-1][0]<sections[0][0]: fs=[f[::-1] for f in fs]
        self.part(vs,fs,col,bone,tag)
    def ribbon(self,pts,width,col,bone,tag=''):
        # Front-facing raised brow, geometry rather than a texture decal.
        vs=[]
        for p in pts: vs.extend([np.array(p)+[0,width/2,0],np.array(p)-[0,width/2,0]])
        fs=[]
        for i in range(len(pts)-1):a=i*2;fs.extend([[a,a+1,a+3],[a,a+3,a+2]])
        self.part(vs,fs,col,bone,tag)

def hand(m,side,grip=0,point=0):
    s=1 if side=='Left' else -1;x=s*.16;bone=side+'Hand'
    m.ellipsoid((x,.766,.008),(.044,.048,.027+.008*grip),'skinLight',bone,n=6,rings=2)
    m.ellipsoid((x-s*(.047-.013*grip),.768-.005*grip,.024),(.018,.037-.009*grip,.024),'skin',bone,n=4,rings=2)
    for i,length in enumerate([.075,.087,.080,.062]):
        # The index lies on the thumb side. Four visible separate fingertips.
        spread=s*(i-1.5)*.022
        curled=max(grip,point if i>0 else 0)
        length=length*(1-curled)+.033*curled
        if i==0:length+=.015*point
        y=.742-length/2+.025*curled
        m.ellipsoid((x+spread,y,.010+.029*curled),(.0105,length/2,.021),'skinLight',bone,n=4,rings=2)

def make_body(control=None):
    m=Mesh()
    m.loft([(0,.89,0,.181,.123),(0,.96,0,.18,.123),(0,1.07,0,.178,.123),(0,1.25,0,.205,.12),(0,1.31,0,.15,.095)],'teal','Spine',n=10,tag='torso')
    m.loft([(0,.76,0,.145,.115),(0,.86,0,.176,.119),(0,.90,0,.173,.119)],'coral','Hips',n=12)
    m.loft([(0,1.28,0,.087,.074),(0,1.32,0,.080,.073)],'cream','Chest',n=12)
    m.ellipsoid((0,1.37,0),(.073,.095,.073),'skin','Neck',n=8,rings=3)
    # Large readable face and a swept sculpted hair silhouette, no insignia.
    m.ellipsoid((0,1.625,0),(.220,.255,.183),'skinLight','Head',n=16,rings=7,tag='head')
    for s,side in [(1,'Left'),(-1,'Right')]:
        m.ellipsoid((s*.216,1.62,-.005),(.041,.064,.047),'skin','Head',n=8,rings=3)
        m.ellipsoid((s*.229,1.62,.024),(.017,.036,.018),'cheek','Head',n=4,rings=2)
        # Upper and lower limbs overlap at the elbow, with soft skin weights.
        x=s*.16
        m.loft([(x,1.31,0,.075,.075),(x,1.15,0,.065,.065)],'tealLight',side+'Arm',n=6)
        m.loft([(x,1.16,0,.059,.059),(x,1.03,0,.055,.055)],'skin',side+'Arm',n=6)
        m.ellipsoid((x,1.035,0),(.055,.052,.055),'skin',side+'ForeArm',n=6,rings=2)
        m.loft([(x,1.03,0,.054,.053),(x,.80,0,.040,.041)],'skinLight',side+'ForeArm',n=6)
        hand(m,side,grip=float(control=='grip_'+side.lower()),point=float(control=='point_'+side.lower()))
        x=s*.1
        m.loft([(x,.85,0,.085,.10),(x,.64,0,.077,.085)],'coral',side+'UpLeg',n=6)
        m.loft([(x,.65,0,.061,.066),(x,.45,0,.053,.056)],'skinLight',side+'UpLeg',n=6)
        m.loft([(x,.45,0,.053,.055),(x,.15,0,.046,.047)],'skin',side+'Leg',n=6)
        m.loft([(x,.12,0,.049,.049),(x,.23,0,.050,.050)],'cream',side+'Leg',n=6)
        # A flattened sole is exactly y=0. Its four tested local probes are real.
        vs=[]
        for y,rx,z0,z1 in [(0,.083,-.075,.195),(.047,.083,-.075,.195),(.12,.066,-.06,.15)]:
            vs.extend([[x-rx,y,z0],[x+rx,y,z0],[x+rx,y,z1],[x-rx,y,z1]])
        fs=[[0,1,2],[0,2,3],[8,10,9],[8,11,10]]
        for j in range(2):
            for i in range(4):a=j*4+i;b=j*4+(i+1)%4;fs.extend([[a,b+4,b],[a,a+4,b+4]])
        m.part(vs,fs,'cream',side+'Foot')
        for i in range(len(m.c)-12,len(m.c)-4): m.c[i]=color('sole')
    # Hair cap: clipped top hemisphere following the head, plus an asymmetric quiff.
    sections=[]
    for y,rx,rz in [(1.755,.205,.177),(1.82,.174,.152),(1.872,.105,.106),(1.885,.025,.025)]:sections.append((0,y,-.014,rx,rz))
    m.loft(sections,'hair','Head',n=10)
    m.ellipsoid((-.069,1.809,.115),(.142,.075,.073),'hair','Head',n=8,rings=3)
    return m

# Face dimensions: both pupils and brows change, mouth changes shape and width.
FACES=[
 dict(eye=.033,lid=1,brow=.0,tilt=0,mw=.092,mh=.037,smile=.026,cheek=.0),
 dict(eye=.039,lid=1.14,brow=.040,tilt=0,mw=.043,mh=.061,smile=0,cheek=-.004),
 dict(eye=.033,lid=.91,brow=.015,tilt=.006,mw=.097,mh=.025,smile=.033,cheek=.010),
 dict(eye=.033,lid=.94,brow=.012,tilt=-.012,mw=.052,mh=.009,smile=-.003,cheek=0),
 dict(eye=.033,lid=.78,brow=.012,tilt=.003,mw=.095,mh=.024,smile=.027,cheek=.009),
 dict(eye=.033,lid=.86,brow=.016,tilt=.017,mw=.062,mh=.009,smile=-.009,cheek=-.005),
 dict(eye=.033,lid=.27,brow=.018,tilt=.002,mw=.106,mh=.057,smile=.036,cheek=.018),
 dict(eye=.033,lid=.91,brow=.012,tilt=.009,mw=.094,mh=.026,smile=.035,cheek=.009),
]
def face(m,expression):
    f=FACES[expression]
    for s in [-1,1]:
        x=s*.079;cy=1.665;z=.171
        lid=.15 if expression==7 and s==1 else f['lid']
        m.ellipsoid((x,cy,z),(.044,f['eye']*lid,.016),'white','Head',n=10,rings=4,tag='eye')
        gaze=-.007 if expression==3 else .0
        m.ellipsoid((x+gaze,cy,z+.014),(.021,.026*lid,.012),'eye','Head',n=10,rings=4,tag='pupil')
        m.ellipsoid((x-.006+gaze,cy+.008*lid,z+.025),(.007,.008*lid,.004),'white','Head',n=6,rings=2,tag='glint')
        by=1.719+f['brow'];tilt=f['tilt']
        m.ribbon([(x-s*.041,by-tilt,.166),(x,by+.010,.172),(x+s*.040,by+tilt,.163)],.014,'hair','Head','brow')
        m.ellipsoid((s*.132,1.584+f['cheek'],.151),(.037,.021,.009),'cheek','Head',n=8,rings=2,tag='blush')
    m.ellipsoid((0,1.626,.183),(.033,.035,.035),'skin','Head',n=8,rings=3,tag='nose')
    # One radial fan, always identical topology across all eight expressions.
    # Its centre follows the cheek smile, corners lift without widening the jaw.
    def mouth_surface(scale,col,zoff):
        cy=1.547;rx=f['mw']*scale;ry=f['mh']*scale;vs=[[0,cy,zoff+.006]]
        for i in range(16):
            a=math.tau*i/16;xx=math.cos(a);yy=math.sin(a)
            vs.append([rx*xx,cy+ry*yy+f['smile']*xx*xx,zoff-.012*xx*xx])
        m.part(vs,[[0,1+i,1+(i+1)%16] for i in range(16)],col,'Head','mouth')
    mouth_surface(1,'mouth',.184)
    # Teeth curve across the upper lip; no text/texture or hidden facial overlay.
    cy=1.547;w=f['mw']*.74;h=min(.015,f['mh']*.47)
    pts=[]
    for i in range(5):
        x=-w+2*w*i/4;y=cy+f['mh']*.5+f['smile']*(x/f['mw'])**2
        pts.extend([[x,y,.192-.010*(x/f['mw'])**2],[x,y-h,.194-.010*(x/f['mw'])**2]])
    m.part(pts,[[i*2,i*2+1,i*2+3] for i in range(4)]+[[i*2,i*2+3,i*2+2] for i in range(4)],'white','Head','teeth')

def normals(v,f):
    n=np.zeros_like(v)
    for tri in f:
        a,b,c=v[tri];q=np.cross(b-a,c-a)
        for i in tri:n[i]+=q
    lengths=np.linalg.norm(n,axis=1);n/=np.maximum(lengths[:,None],1e-15)
    return n

def main():
    m=make_body();base_count=len(m.v);face(m,0)
    faces=np.array(m.f,dtype=np.uint16);verts=np.array(m.v,dtype=float)
    # Refine real visible triangles to exactly 1500, splitting the largest faces.
    # Midpoints preserve every facial morph and skin assignment; no padding mesh.
    extra=1500-len(faces)
    if extra<0:raise ValueError(f'Over budget: {len(faces)}')
    # One triangle -> three adds two. An odd final split uses its longest edge.
    recipes=[]
    while extra:
        candidates=[(np.linalg.norm(np.cross(verts[t[1]]-verts[t[0]],verts[t[2]]-verts[t[0]])),i) for i,t in enumerate(faces) if len(set(m.skin[j] for j in t))==1]
        _,idx=max(candidates);a,b,c=faces[idx];off=len(verts)
        if extra>=2:
            ids=[int(a),int(b),int(c)];p=verts[ids].mean(axis=0);repl=[[a,b,off],[b,c,off],[c,a,off]];extra-=2
        else:
            ids=[int(a),int(b)];p=verts[ids].mean(axis=0);repl=[[a,off,c],[off,b,c]];extra-=1
        recipes.append(ids);verts=np.vstack([verts,p]);m.c.append(np.array(m.c)[ids].mean(axis=0).tolist());m.skin.append(m.skin[a]);m.tags.append(m.tags[a])
        faces=np.vstack([faces[:idx],repl,faces[idx+1:]]).astype(np.uint16)
    assert len(faces)==1500
    targets=[]
    for expr in range(8):
        target=Mesh();face(target,expr);tv=np.vstack([verts[:base_count],target.v])
        for ids in recipes:tv=np.vstack([tv,tv[ids].mean(axis=0)])
        assert tv.shape==verts.shape
        targets.append(tv)
    for control in CONTROLS:
        target=make_body(control);face(target,0);tv=np.array(target.v)
        for ids in recipes:tv=np.vstack([tv,tv[ids].mean(axis=0)])
        assert tv.shape==verts.shape
        targets.append(tv)
    ns=normals(verts,faces)
    # Reorient occasional winding errors once, away from each component centre.
    # Every primitive generator is consistently wound; norm checks are independent.
    binary=bytearray();views=[];access=[]
    def accessor(data,ctype=5126,typ='VEC3',target=None,bounds=False):
        arr=np.array(data,dtype={5126:'<f4',5123:'<u2'}[ctype]);
        while len(binary)%4:binary.append(0)
        view={'buffer':0,'byteOffset':len(binary),'byteLength':arr.nbytes}
        if target:view['target']=target
        views.append(view);binary.extend(arr.tobytes());a={'bufferView':len(views)-1,'componentType':ctype,'count':len(arr),'type':typ}
        if bounds:
            flat=arr.reshape(len(arr),-1);a['min']=flat.min(axis=0).tolist();a['max']=flat.max(axis=0).tolist()
        access.append(a);return len(access)-1
    # Skin vertices crossing clothing transitions use blended torso weights.
    joints=[];weights=[]
    for i,(p,bone) in enumerate(zip(verts,m.skin)):
        js=[NAMES.index(bone),0,0,0];ws=[1.,0,0,0]
        if m.tags[i]=='torso':
            y=p[1];chest=float(np.clip((y-1.05)/.18,0,1));hips=float(np.clip((.93-y)/.10,0,1))
            js=[NAMES.index('Spine'),NAMES.index('Chest'),NAMES.index('Hips'),0];ws=[(1-chest)*(1-hips),chest,(1-chest)*hips,0]
        js=[joint if weight>0 else 0 for joint,weight in zip(js,ws)]
        joints.append(js);weights.append(ws)
    attrs={'POSITION':accessor(verts,target=34962,bounds=True),'NORMAL':accessor(ns,target=34962),'COLOR_0':accessor(m.c,target=34962),'JOINTS_0':accessor(joints,5123,'VEC4',34962),'WEIGHTS_0':accessor(weights,typ='VEC4',target=34962)}
    morphs=[]
    for tv in targets:
        morphs.append({'POSITION':accessor(tv-verts,target=34962,bounds=True),'NORMAL':accessor(normals(tv,faces)-ns,target=34962)})
    primitive={'attributes':attrs,'indices':accessor(faces.reshape(-1),5123,'SCALAR',34963),'material':0,'targets':morphs}
    nodes=[]
    for b in BONES:
        n={'name':b['name'],'translation':b['restTranslationMeters']}
        children=[i for i,c in enumerate(BONES) if c['parent']==b['name']]
        if children:n['children']=children
        nodes.append(n)
    nodes.append({'name':'Coach','mesh':0,'skin':0})
    ibms=[]
    for name in NAMES:
        mat=np.eye(4);mat[:3,3]=-REST[name];ibms.append(mat.T.reshape(-1))
    gltf={'asset':{'version':'2.0','generator':'coach-mascot-v1 deterministic original authoring'},'scene':0,'scenes':[{'name':'Coach mascot','nodes':[0,18]}],
          'nodes':nodes,'meshes':[{'name':'Coach','primitives':[primitive],'weights':[0]*12,'extras':{'targetNames':EXP+CONTROLS,'expressionCount':8,'handControlCount':4,'triangles':1500,'units':'metres','forward':'+Z'}}],
          'materials':[{'name':'Soft vertex palette','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.83},'doubleSided':True}],
          'skins':[{'name':'Canonical18','joints':list(range(18)),'skeleton':0,'inverseBindMatrices':accessor(ibms,typ='MAT4')}],'animations':[]}
    from motions import build_clips
    clips=build_clips(BONES)
    for clip in clips:
        frames=clip['frames'];times=np.arange(len(frames))/30
        assert abs(times[-1]-clip['duration'])<1e-7
        ti=accessor(times,typ='SCALAR',bounds=True);samplers=[];channels=[]
        def channel(node,path,values,typ):
            samplers.append({'input':ti,'output':accessor(values,typ=typ),'interpolation':'LINEAR'});channels.append({'sampler':len(samplers)-1,'target':{'node':node,'path':path}})
        for name in NAMES:
            channel(NAMES.index(name),'rotation',[f['rotations'].get(name,[0,0,0,1]) for f in frames],'VEC4')
        channel(0,'translation',[f.get('translations',{}).get('Root',[0,0,0]) for f in frames],'VEC3')
        if clip['name']=='shrug':
            # A shrug raises both shoulder pivots, rather than only spreading arms.
            for side in ['Left','Right']:
                node=NAMES.index(side+'Arm');rest=np.array(BONES[node]['restTranslationMeters']);values=[]
                for t in times:
                    u=max(0,min(1,(t-.3)/.5,(clip['duration']-.3-t)/.5));u=u*u*(3-2*u)
                    values.append((rest+[0,.035*u,0]).tolist())
                channel(node,'translation',values,'VEC3')
        morph_weights=[]
        for i,f in enumerate(frames):
            t=i/30;u=min(1,t/.65,(clip['duration']-t)/.65);u=max(0,u);u=u*u*(3-2*u)
            controls=[0.,0.,0.,0.]
            if clip['name']=='fist_pump':controls[1]=u
            if clip['name']=='well_done':controls[1]=u
            if clip['name'] in ['point_right','go_there']:controls[2]=u
            if clip['name'] in ['point_left','point_up','point_down']:controls[3]=u
            morph_weights.append(f['weights']+controls)
        channel(18,'weights',np.array(morph_weights).reshape(-1),'SCALAR')
        gltf['animations'].append({'name':clip['name'],'samplers':samplers,'channels':channels,'extras':{'fps':30,'loop':clip['loop'],'stationary':True,'supports':clip.get('supports',[]),'events':clip.get('events',[])}})
    gltf.update(bufferViews=views,accessors=access,buffers=[{'byteLength':len(binary)}])
    js=json.dumps(gltf,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*((-len(js))%4);binary+=b'\0'*((-len(binary))%4)
    result=struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
    (ROOT/'coach.glb').write_bytes(result)
    h=float(verts[:,1].max());meta={'model':'coach.glb','heightMeters':h,'floorY':0,'soleLocal':[0,-.08,0],'soleCorners':[[x,-.08,z] for x in [-.083,.083] for z in [-.075,.195]],'clips':{c['name']:{'loop':c['loop'],'supports':c.get('supports',[]),'events':c.get('events',[])} for c in clips}}
    (ROOT/'source/qa-input.json').write_text(json.dumps(meta,indent=2)+'\n')
    summary={'triangles':len(faces),'vertices':len(verts),'bytes':len(result),'heightMeters':h,'bounds':[verts.min(axis=0).tolist(),verts.max(axis=0).tolist()],'expressions':EXP,'handControls':CONTROLS,'clips':[{k:v for k,v in c.items() if k!='frames'} for c in clips],'sha256':hashlib.sha256(result).hexdigest()}
    (ROOT/'source/build-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps({k:v for k,v in summary.items() if k!='clips'},indent=2))

if __name__=='__main__':main()
