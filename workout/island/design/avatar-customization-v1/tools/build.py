#!/usr/bin/env python3
"""CC0-1.0. Deterministic, uncompressed glTF 2 authoring; Python + NumPy.

Only writes inside this new package. Inputs are the shipped v22 bodies. All
customization geometry below is original. A full pair/set counts as ONE item.
"""
import copy
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parents[1] / 'assets/athlete-body-v22'
SOURCE_MANIFEST = json.loads((SOURCE / 'body-manifest.json').read_text())
BONES = SOURCE_MANIFEST['canonicalBones']
NAMES = [b['name'] for b in BONES]
WORLD = {}
for b in BONES:
    WORLD[b['name']] = np.array(b['rest']) + WORLD.get(b['parent'], np.zeros(3))
REGIONS = dict(skin=0, primary=1, secondary=2, trim=3, shoe=4, sole=5,
               eyeWhite=6, hair=7, sock=8, iris=9, brow=10, mouth=11,
               accessory=12, accent=13)
PALETTE = ['#d9a17b', '#4c9995', '#233f50', '#f2ddad', '#e8e6db',
           '#334650', '#fff8ed', '#362920', '#eee9db', '#68513b',
           '#362920', '#743d36', '#e7b76b', '#496f79']


def linear(hexcode):
    v = np.array([int(hexcode[i:i+2], 16) / 255 for i in (1, 3, 5)])
    return np.where(v <= .04045, v / 12.92, ((v + .055) / 1.055) ** 2.4)


def weight(bone):
    return {bone: 1.} if isinstance(bone, str) else bone


def body_weight(p):
    x, y, z = p
    if abs(x) > .13 and y > .80:
        side = 'Left' if x > 0 else 'Right'
        u = np.clip((y - .97) / .12, 0, 1)
        return {side+'Arm': float(u), side+'ForeArm': float(1-u)}
    if y < .89:
        side = 'Left' if x >= 0 else 'Right'
        u = np.clip((y - .40) / .12, 0, 1)
        return {side+'UpLeg': float(u), side+'Leg': float(1-u)}
    u = np.clip((y - 1.02) / .23, 0, 1)
    return {'Spine': float(1-u), 'Chest': float(u)}


class Mesh:
    def __init__(self):
        self.p, self.r, self.w, self.t = [], [], [], []

    def vertex(self, p, region, bone):
        self.p.append(list(p)); self.r.append(REGIONS[region])
        self.w.append(weight(bone(p) if callable(bone) else bone))
        return len(self.p)-1

    def tri(self, a, b, c):
        p = np.array([self.p[a], self.p[b], self.p[c]])
        if np.linalg.norm(np.cross(p[1]-p[0], p[2]-p[0])) > 1e-10:
            self.t.append([a, b, c])

    def quad(self, points, region, bone, flip=False):
        ids = [self.vertex(p, region, bone) for p in points]
        for a, b, c in [(0, 1, 2), (0, 2, 3)]:
            self.tri(ids[a], ids[c] if flip else ids[b], ids[b] if flip else ids[c])

    def rings(self, rings, n=8, region='primary', bone=body_weight, cap=True,
              shift=0., ripple=0.):
        """(y, rx, rz, cx, cz) sections. Front is +Z; counterclockwise outside."""
        rows = []
        for k, (y, rx, rz, cx, cz) in enumerate(rings):
            row = []
            for i in range(n):
                a = 2*math.pi*i/n + shift
                f = 1+ripple*math.sin(i*2.7+k*1.8)
                p = (cx+rx*math.cos(a)*f, y, cz+rz*math.sin(a)*f)
                row.append(self.vertex(p, region, bone))
            rows.append(row)
        for lo, hi in zip(rows, rows[1:]):
            for i in range(n):
                q = (i+1) % n
                self.tri(lo[i], hi[q], lo[q]); self.tri(lo[i], hi[i], hi[q])
        if cap:
            for row, spec, upper in [(rows[0], rings[0], False), (rows[-1], rings[-1], True)]:
                y, rx, rz, cx, cz = spec
                center = self.vertex((cx, y, cz), region, bone)
                for i in range(n):
                    a, b = row[i], row[(i+1) % n]
                    self.tri(center, b if upper else a, a if upper else b)

    def ellipsoid(self, center, size, n=8, levels=3, region='accessory', bone='Head'):
        cx, cy, cz = center; rx, ry, rz = size
        rows = []
        for j in range(1, levels+1):
            a = math.pi*j/(levels+1)
            rows.append((cy-ry*math.cos(a), rx*math.sin(a), rz*math.sin(a), cx, cz))
        start = len(self.p)
        self.rings(rows, n, region, bone, cap=False)
        low = self.vertex((cx, cy-ry, cz), region, bone)
        high = self.vertex((cx, cy+ry, cz), region, bone)
        for i in range(n):
            q = (i+1) % n
            self.tri(low, start+i, start+q)
            end = start+n*(levels-1)
            self.tri(high, end+q, end+i)

    def box(self, center, size, region='accessory', bone='Chest'):
        c, s = np.array(center), np.array(size)/2
        v = [c+s*np.array(a) for a in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                                       (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
        for ids in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(0,1,5,4),(3,7,6,2)]:
            self.quad([v[i] for i in ids], region, bone)

    def tube(self, points, radii, n=6, region='hair', bone='Head'):
        rows = []
        points = [np.array(p, float) for p in points]
        for i, (p, radius) in enumerate(zip(points, radii)):
            tangent = points[min(i+1,len(points)-1)]-points[max(0,i-1)]
            tangent /= np.linalg.norm(tangent)
            ref = np.array([1.,0,0]) if abs(tangent[0]) < .8 else np.array([0.,0,1])
            u = np.cross(tangent,ref);u /= np.linalg.norm(u);v = np.cross(tangent,u)
            rows.append([self.vertex(p+radius*(u*math.cos(2*math.pi*k/n)+v*math.sin(2*math.pi*k/n)),region,bone) for k in range(n)])
        for lo, hi in zip(rows,rows[1:]):
            for i in range(n):
                q=(i+1)%n;self.tri(lo[i],lo[q],hi[q]);self.tri(lo[i],hi[q],hi[i])
        for row, p, reverse in [(rows[0],points[0],True),(rows[-1],points[-1],False)]:
            center=self.vertex(p,region,bone)
            for i in range(n):
                a,b=row[i],row[(i+1)%n];self.tri(center,b if reverse else a,a if reverse else b)

    def disc(self, center, rx, ry, n=8, region='eyeWhite', bone='Head', tilt=0.):
        x,y,z = center; center_id=self.vertex(center,region,bone)
        ids=[]
        for i in range(n):
            a=2*math.pi*i/n;dx=rx*math.cos(a)
            ids.append(self.vertex((x+dx,y+ry*math.sin(a)+tilt*dx,z-abs(dx)*.12),region,bone))
        for i in range(n):self.tri(center_id,ids[i],ids[(i+1)%n])

    def ribbon(self, points, width, region='trim', bone='Head'):
        for a,b in zip(points,points[1:]):
            a=np.array(a);b=np.array(b);d=b-a
            u=np.array([-d[1],d[0],0]);u=u/np.linalg.norm(u)*width/2
            self.quad([a-u,b-u,b+u,a+u],region,bone)


def write_glb(mesh, path, item):
    path.parent.mkdir(parents=True,exist_ok=True)
    if not mesh.t:
        doc={'asset':{'version':'2.0','generator':'avatar-customization-v1 / original CC0'},
             'scene':0,'scenes':[{'nodes':[0]}],
             'nodes':[{'name':item['id'],'extras':{'action':'remove-hair'}}]}
        binary=b''
    else:
        pos=np.array(mesh.p,dtype='<f4'); normals=np.zeros_like(pos)
        for a,b,c in mesh.t:
            q=np.cross(pos[b]-pos[a],pos[c]-pos[a]);normals[[a,b,c]]+=q
        lens=np.linalg.norm(normals,axis=1);normals/=np.maximum(lens,1e-10)[:,None]
        # Unused vertices are not serialized, including collapsed tip sections.
        used=np.unique(np.array(mesh.t).reshape(-1));mapping={int(v):i for i,v in enumerate(used)}
        idx=np.array([[mapping[v] for v in t] for t in mesh.t],dtype='<u2')
        regions=np.array(mesh.r,dtype='u1')[used]
        joints=np.zeros((len(used),4),dtype='u1');weights=np.zeros((len(used),4),dtype='<f4')
        for i,v in enumerate(used):
            entries=[(NAMES.index(k),w) for k,w in mesh.w[v].items() if w>1e-7]
            for k,(joint,w) in enumerate(entries):joints[i,k]=joint;weights[i,k]=w
            weights[i]/=weights[i].sum()
        colors=np.array([list(linear(PALETTE[r]))+[1.] for r in regions],dtype='<f4')
        doc={'asset':{'version':'2.0','generator':'avatar-customization-v1 / original CC0'},
             'scene':0,'scenes':[{'nodes':[0,18]}], 'nodes':[], 'skins':[],
             'meshes':[{'name':item['id'],'primitives':[]}], 'materials':[{
                 'name':'color-masks','doubleSided':True,
                 'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.83}}],
             'accessors':[],'bufferViews':[],'buffers':[]}
        chunks=[];offset=0
        def acc(arr,ctype,kind,target=None,bounds=False,stride=None):
            nonlocal offset
            arr=np.ascontiguousarray(arr);raw=arr.tobytes();raw+=b'\0'*((-len(raw))%4)
            view={'buffer':0,'byteOffset':offset,'byteLength':len(arr.tobytes())}
            if target:view['target']=target
            if stride:view['byteStride']=stride
            doc['bufferViews'].append(view);a={'bufferView':len(doc['bufferViews'])-1,'componentType':ctype,'count':len(arr),'type':kind}
            if bounds:a.update(min=arr.min(0).tolist(),max=arr.max(0).tolist())
            doc['accessors'].append(a);chunks.append(raw);offset+=len(raw)
            return len(doc['accessors'])-1
        attrs={'POSITION':acc(pos[used],5126,'VEC3',34962,True),
               'NORMAL':acc(normals[used],5126,'VEC3',34962),
               'COLOR_0':acc(colors,5126,'VEC4',34962),
               'JOINTS_0':acc(joints,5121,'VEC4',34962),
               'WEIGHTS_0':acc(weights,5126,'VEC4',34962)}
        padded=np.zeros((len(regions),4),dtype='u1');padded[:,0]=regions
        attrs['_REGION']=acc(padded,5121,'SCALAR',34962,stride=4)
        indices=acc(idx.reshape(-1,1),5123,'SCALAR',34963)
        doc['meshes'][0]['primitives']=[{'attributes':attrs,'indices':indices,'material':0,'mode':4}]
        inverse=[]
        for b in BONES:
            mat=np.eye(4,dtype='<f4');mat[:3,3]=-WORLD[b['name']];inverse.append(mat.T.reshape(-1))
        ibm=acc(np.array(inverse,dtype='<f4'),5126,'MAT4')
        for b in BONES:
            node={'name':b['name'],'translation':b['rest']}
            children=[i for i,n in enumerate(BONES) if n['parent']==b['name']]
            if children:node['children']=children
            doc['nodes'].append(node)
        doc['nodes'].append({'name':item['id'],'mesh':0,'skin':0,'extras':{'category':item['category'],'colorMask':'_REGION','bodySpace':'canonical-v22'}})
        doc['skins']=[{'name':'canonical18','joints':list(range(18)),'skeleton':0,'inverseBindMatrices':ibm}]
        binary=b''.join(chunks);doc['buffers']=[{'byteLength':len(binary)}]
    js=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*((-len(js))%4)
    chunks=struct.pack('<II',len(js),0x4e4f534a)+js
    if binary:chunks+=struct.pack('<II',len(binary),0x004e4942)+binary
    blob=struct.pack('<III',0x46546c67,2,len(chunks)+12)+chunks
    path.write_bytes(blob)
    assert len(mesh.t)<=300,(item['id'],len(mesh.t))
    item.update(triangles=len(mesh.t),bytes=len(blob),sha256=hashlib.sha256(blob).hexdigest(),
                colorRegions=[k for k,v in REGIONS.items() if v in mesh.r],
                joints=18 if mesh.t else 0,license='CC0-1.0')
    return item


ITEMS=[]
def save(mesh,category,id,label,**extra):
    item=dict(id=id,label=label,category=category,path=f'assets/{category}/{id}.glb',
              thumbnail=f'thumbs/{id}.webp',compatibleBodies=['soccer','guard','wing','center'],**extra)
    write_glb(mesh,ROOT/item['path'],item);ITEMS.append(item)


def cap(mesh, style='short', n=12):
    long=style in ['long','bob']
    rows=[(1.627,.086,.106,0,.019),(1.695,.085,.111,0,.019),
          (1.749,.060,.082,0,.020),(1.766,.006,.009,0,.018)]
    if style=='afro':rows=[(1.620,.095,.114,0,.017),(1.70,.118,.134,0,.010),(1.79,.070,.090,0,.012),(1.812,.006,.008,0,.01)]
    if style=='buzz':rows=[(y-.022,rx*.99,rz*.98,cx,cz) for y,rx,rz,cx,cz in rows]
    if style=='cap':rows=[(1.658,.092,.119,0,.02),(1.714,.094,.120,0,.02),(1.764,.060,.090,0,.02),(1.784,.006,.008,0,.02)]
    start=len(mesh.p);mesh.rings(rows,n,'primary' if style=='cap' else 'hair','Head',cap=False,ripple=.035 if style=='afro' else 0)
    # Raise the front hairline. Long rear curtains stay clear of the face.
    for i in range(n):
        a=2*math.pi*i/n
        if math.sin(a)>.1:mesh.p[start+i][1]+=.050*math.sin(a)
    if long:
        # Open, rear-and-side curtain. 8 columns leave the face exposed.
        cols=9;rows=[]
        for y,rx,rz in [(1.40 if style=='long' else 1.51,.101,.125),(1.57,.096,.121),(1.674,.088,.113)]:
            rows.append([mesh.vertex((rx*math.cos(a),y,.014+rz*math.sin(a)),'hair','Head') for a in np.linspace(math.pi*.92,math.pi*2.08,cols)])
        for lo,hi in zip(rows,rows[1:]):
            for i in range(cols-1):mesh.tri(lo[i],hi[i],hi[i+1]);mesh.tri(lo[i],hi[i+1],lo[i+1])


def hair():
    specs=[('crop','קצר טבעי'),('side-part','שביל בצד'),('quiff','בלורית'),('long','ארוך'),
           ('bob','קארה'),('ponytail','קוקו'),('braid','צמה'),('curly','מתולתל'),
           ('afro','תלתלים נפוחים'),('bun','אסוף'),('bald','קרח'),('sport-cap','כובע מצחייה')]
    for id,label in specs:
        m=Mesh()
        if id!='bald':cap(m,{'crop':'buzz','sport-cap':'cap','curly':'short'}.get(id,id))
        if id in ['side-part','quiff']:
            m.ellipsoid((-.018,1.749,.087),(.073,.034 if id=='quiff' else .019,.044),8,2,'hair')
        if id=='ponytail':
            m.tube([(0,1.696,-.088),(.01,1.67,-.158),(.018,1.52,-.17)], [.032,.041,.013],6)
            m.rings([(1.671,.034,.032,0,-.107),(1.69,.034,.032,0,-.107)],8,'accent','Head',False)
        if id=='braid':
            for k in range(4):m.ellipsoid(((-1)**k*.010,1.65-k*.059,-.115-k*.005),(.031-k*.003,.043,.028),6,2,'hair')
            m.rings([(1.413,.017,.017,-.01,-.13),(1.43,.018,.018,-.01,-.13)],6,'accent','Head',False)
        if id=='curly':
            for k in range(7):
                a=k*2*math.pi/7;m.ellipsoid((.061*math.cos(a),1.727+.015*(k%2),.02+.079*math.sin(a)),(.033,.037,.033),6,2,'hair')
        if id=='bun':
            m.ellipsoid((0,1.755,-.087),(.052,.05,.044),8,2,'hair')
            m.rings([(1.724,.044,.037,0,-.075),(1.738,.045,.038,0,-.075)],8,'accent','Head',False)
        if id=='sport-cap':
            m.quad([(-.092,1.659,.072),(-.080,1.650,.199),(.080,1.650,.199),(.092,1.659,.072)],'secondary','Head')
            m.quad([(-.080,1.650,.199),(-.060,1.639,.213),(.060,1.639,.213),(.080,1.650,.199)],'secondary','Head')
        save(m,'hair',id,label,slot='hair',headwear=id=='sport-cap',empty=id=='bald')


def faces():
    specs=[('gentle','עדין',1,.010,0,.002),('round','עגול',1.07,.013,.12,.006),
           ('bright','חיוך רחב',1,.012,0,.012),('almond','עיני שקד',1,.007,.12,.005),
           ('bold','גבות מודגשות',1.02,.008,-.12,.003),('curious','סקרן',.99,.014,.10,.004),
           ('calm','רגוע',.98,.006,0,.001),('cheerful','שמח',1.04,.010,.15,.014)]
    for index,(id,label,width,eye_h,tilt,smile) in enumerate(specs):
        m=Mesh();rows=[(1.453,.039,.046,0,.049),(1.490,.058,.071,0,.043),
                      (1.554,.075*width,.090,0,.025),(1.624,.078*width,.102,0,.014),
                      (1.690,.068,.096,0,.015),(1.730,.035,.050,0,.017)]
        m.rings(rows,12,'skin','Head')
        for side in [-1,1]:
            x=.032*side;z=.115
            m.disc((x,1.609,z),.018,eye_h,8,'eyeWhite',tilt=tilt*side)
            m.disc((x,1.609,z+.0018),.007,.008 if eye_h>.008 else .0055,6,'iris')
            m.disc((x,1.609,z+.003),.0035,.0045 if eye_h>.008 else .003,6,'brow')
            m.disc((x-.002,1.612,z+.004),.0018,.002,4,'eyeWhite')
            m.ribbon([(x-.018,1.632+side*tilt*.008,.116),(x,1.636+(.004 if index==5 and side==1 else 0),.120),(x+.017,1.632-side*tilt*.008,.116)],.0045 if index==4 else .003,'brow')
            m.ellipsoid((side*.079,1.576,.013),(.010,.024,.018),6,1,'skin')
        # A projecting nose, with real silhouette variation.
        tip=(.002 if index==5 else 0,1.568,.147+(index%3)*.004)
        nose=[(-.010,1.56,.114),(.010,1.56,.114),(0,1.599,.116)]
        ids=[m.vertex(v,'skin','Head') for v in nose+[tip]]
        for a,b in [(0,1),(1,2),(2,0)]:m.tri(ids[a],ids[b],ids[3])
        mouth=[(x,1.525+smile*(abs(x)/.024)**2,.119-abs(x)*.05) for x in np.linspace(-.024,.024,7)]
        m.ribbon(mouth,.0045 if index!=2 else .010,'mouth')
        if index in [2,7]:m.ribbon([(x,y+.002,z+.001) for x,y,z in mouth[1:-1]],.0035,'eyeWhite')
        save(m,'faces','face-'+id,label,slot='face',replaceSourceHeadAboveY=1.448,
             features={'eyes':id,'brows':index,'nose':index%3,'mouth':index,'smile':smile})


def torso(m, bottom=.887, sleeveless=False, winter=False, robe=False):
    rows=[(bottom,.166 if not robe else .19,.133,0,.017),(1.06,.166,.139,0,.017),
          (1.255,.184,.136,0,.015),(1.365,.178,.108,0,.012),(1.435,.059,.062,0,.016)]
    if sleeveless:rows[-2]=(1.365,.130,.108,0,.012)
    m.rings(rows,8,'primary',lambda p:{'Hips':1.} if p[1]<1.0 else {'Spine':float(np.clip((1.25-p[1])/.2,0,1)),'Chest':float(np.clip((p[1]-1.05)/.2,0,1))},False)
    if winter:m.rings([(1.414,.066,.071,0,.017),(1.466,.067,.072,0,.017)],8,'trim','Neck',False)


def sleeves(m,long=False,region='primary',puffy=False):
    for side in [-1,1]:
        name='Left' if side==1 else 'Right'
        rows=[(.810 if long else 1.16,.045 if long else .057,.044 if long else .058,.16*side,.007),
              (1.052,.064,.062,.16*side,.002),(1.313,.062,.073,.164*side,.0)]
        if not long:rows=rows[0:1]+rows[2:]
        if puffy:rows=[(y,rx*1.12,rz*1.12,cx,cz) for y,rx,rz,cx,cz in rows]
        m.rings(rows,8,region,lambda p:{name+'Arm':float(np.clip((p[1]-.98)/.11,0,1)),name+'ForeArm':float(1-np.clip((p[1]-.98)/.11,0,1))},False)


def pants(m,long=False,region='secondary',wide=False):
    for side in [-1,1]:
        name='Left' if side==1 else 'Right'
        rows=[(.11 if long else .616,.064 if long else .086,.064 if long else .099,.102*side,.019),
              (.45,.070,.079,.105*side,.020),(.70,.088,.112,.087*side,.029),
              (.90,.083,.127,.087*side,.018)]
        if not long:rows=[rows[0]]+rows[2:]
        if wide:rows=[(y,rx*1.05,rz,cx,cz) for y,rx,rz,cx,cz in rows]
        def w(p):
            u=float(np.clip((p[1]-.4)/.12,0,1));return {name+'UpLeg':u,name+'Leg':1-u}
        m.rings(rows,8,region,w,False)


def outfits():
    specs=[('sport','ערכת ספורט'),('tracksuit','חליפת אימון'),('holiday','חגיגי'),
           ('summer','קיץ'),('winter','חורף'),('swim','שחייה'),('denim','ג׳ינס'),
           ('hoodie','קפוצ׳ון'),('polo','פולו'),('tunic','טוניקה לחג')]
    palettes={'sport':('#4c9995','#233f50'),'tracksuit':('#617a8c','#314958'),
              'holiday':('#f0e9d8','#34485c'),'summer':('#ce815e','#ddcf9b'),
              'winter':('#68766a','#3c4a46'),'swim':('#4c9995','#396578'),
              'denim':('#e3d8bc','#3b5c7a'),'hoodie':('#b38eaf','#3a4158'),
              'polo':('#d8cba8','#667768'),'tunic':('#cfc0a4','#475a60')}
    for id,label in specs:
        m=Mesh();long=id in ['tracksuit','holiday','winter','denim','tunic']
        if id!='swim':torso(m,sleeveless=id=='summer',winter=id=='winter',bottom=.68 if id=='tunic' else .887,robe=id=='tunic')
        if id not in ['swim','summer']:sleeves(m,id in ['tracksuit','holiday','winter','hoodie','tunic'],puffy=id=='winter')
        pants(m,long,wide=id=='winter')
        if id in ['sport','tracksuit','summer','swim']:
            for s in [-1,1]:m.quad([(s*.13,.645,.108),(s*.15,.645,.09),(s*.15,.85,.125),(s*.13,.85,.142)],'trim','LeftUpLeg' if s>0 else 'RightUpLeg',s<0)
        if id in ['holiday','polo','tunic']:
            for s in [-1,1]:m.quad([(s*.015,1.438,.08),(s*.066,1.416,.087),(s*.085,1.350,.129),(s*.035,1.376,.132)],'trim','Chest',s<0)
            m.ribbon([(0,1.40,.132),(0,1.15,.159)],.009,'trim','Chest')
        if id=='holiday':
            for s in [-1,1]:m.quad([(s*.035,1.401,.136),(s*.11,1.35,.146),(s*.085,1.17,.163),(s*.017,1.24,.163)],'secondary','Chest',s<0)
        if id=='hoodie':
            # Folded hood behind the neck, clear of the selected hairstyle.
            m.ellipsoid((0,1.377,-.085),(.093,.074,.054),8,2,'secondary','Chest')
            m.quad([(-.068,1.02,.161),(.068,1.02,.161),(.058,1.10,.163),(-.058,1.10,.163)],'secondary','Spine')
        if id=='winter':
            for y in [1.02,1.15,1.28]:m.ribbon([(-.115,y,.127),(0,y,.166),(.115,y,.127)],.005,'accent','Chest' if y>1.1 else 'Spine')
        if id=='denim':
            for s in [-1,1]:m.quad([(s*.04,.83,.148),(s*.13,.83,.144),(s*.13,.76,.147),(s*.05,.745,.153)],'accent','LeftUpLeg' if s>0 else 'RightUpLeg',s<0)
        save(m,'outfits',id,label,slot='outfit',underlay='neutral-skin-shell',
             defaults={'primary':palettes[id][0],'secondary':palettes[id][1]})


def shoes():
    for id,label,top in [('runners','נעלי ריצה',.12),('high-tops','סניקרס גבוהות',.20),
                        ('sandals','סנדלים',.05),('boots','מגפיים',.25),('loafers','מוקסינים',.10),
                        ('water-shoes','נעלי מים',.08),('snow-boots','מגפי חורף',.28),('cleats','נעלי כדורגל',.13)]:
        m=Mesh()
        for side in [-1,1]:
            x=.1*side;bone='LeftFoot' if side>0 else 'RightFoot'
            m.rings([(.009,.054,.154,x,.077),(.037,.056,.155,x,.077)],8,'sole',bone,True)
            if id=='sandals':
                for z in [.04,.15]:m.box((x,.066,z),(.108,.022,.036),'shoe',bone)
                m.box((x,.106,-.032),(.106,.025,.025),'trim',bone)
            else:
                rows=[(.037,.055,.154,x,.076),(.079,.051,.140,x,.068),
                      (top,.045,.073 if top>.14 else .105,x,.008 if top>.14 else .034)]
                m.rings(rows,8,'shoe',bone,True)
                for z in [.067,.096,.125]:
                    m.ribbon([(x-.030,.104-z*.18,z),(x+.030,.104-z*.18,z)],.007,'trim',bone)
            if id=='snow-boots':m.rings([(.231,.053,.08,x,0),(.28,.056,.082,x,0)],8,'trim',bone,False)
            if id=='cleats':
                for dx,z in [(-.035,.15),(.035,.15),(-.03,-.01),(.03,-.01)]:
                    m.ellipsoid((x+dx,.006,z),(.012,.006,.014),4,1,'accent',bone)
        save(m,'shoes',id,label,slot='shoes',pair=True)


def accessories():
    for id,label in [('glasses','משקפיים'),('bucket-hat','כובע טמבל'),('watch','שעון'),
                     ('backpack','תיק גב'),('hair-ties','גומיות'),('gloves','כפפות'),
                     ('bracelet','צמיד'),('scarf','מטפחת')]:
        m=Mesh()
        if id=='glasses':
            for side in [-1,1]:
                points=[(side*.032+.025*math.cos(a),1.609+.019*math.sin(a),.129) for a in np.linspace(0,2*math.pi,9)]
                m.tube(points,[.003]*9,4,'accessory')
                m.tube([(side*.056,1.613,.127),(side*.081,1.614,.04)], [.003,.003],4,'accessory')
            m.box((0,1.612,.13),(.018,.006,.007),'accessory','Head')
        if id=='bucket-hat':
            m.rings([(1.675,.103,.124,0,.018),(1.757,.088,.106,0,.018),(1.784,.068,.086,0,.018)],12,'accessory','Head')
            m.rings([(1.654,.145,.169,0,.018),(1.681,.104,.125,0,.018)],12,'accent','Head',False)
        if id in ['watch','bracelet']:
            bone='LeftForeArm';x=.16
            m.rings([(.802,.039,.040,x,.006),(.83,.039,.040,x,.006)],10,'accessory',bone,False)
            if id=='watch':
                m.box((x,.816,.051),(.045,.045,.012),'accent',bone)
                m.quad([(x-.017,.8,.058),(x+.017,.8,.058),(x+.017,.832,.058),(x-.017,.832,.058)],'secondary',bone)
                m.ribbon([(x,.816,.059),(x,.829,.059)],.003,'trim',bone)
                m.ribbon([(x,.816,.059),(x+.012,.812,.059)],.003,'trim',bone)
        if id=='backpack':
            m.box((0,1.16,-.172),(.22,.33,.115),'accessory','Chest')
            m.box((0,1.085,-.241),(.165,.13,.032),'accent','Chest')
            for s in [-1,1]:
                m.tube([(s*.09,1.02,-.137),(s*.13,1.37,-.056),(s*.12,1.37,.091),(s*.09,1.04,.148)],[.015]*4,4,'accent','Chest')
        if id=='hair-ties':
            for s in [-1,1]:
                m.rings([(1.684,.022,.025,s*.078,-.019),(1.703,.025,.026,s*.078,-.019)],8,'accessory','Head',False)
                m.ellipsoid((s*.095,1.695,-.003),(.015,.014,.013),6,1,'accent')
        if id=='gloves':
            for s in [-1,1]:
                bone='LeftHand' if s>0 else 'RightHand'
                m.ellipsoid((s*.152,.704,.004),(.044,.091,.044),8,3,'accessory',bone)
                m.ellipsoid((s*.107,.717,.035),(.028,.046,.026),6,2,'accent',bone)
                m.rings([(.768,.040,.043,s*.158,.004),(.796,.040,.043,s*.158,.004)],8,'accent',bone,False)
        if id=='scarf':
            m.rings([(1.383,.069,.071,0,.018),(1.441,.069,.071,0,.018)],10,'accessory','Neck',False)
            m.ellipsoid((.019,1.391,.088),(.027,.025,.021),6,1,'accent','Neck')
            m.quad([(.008,1.396,.105),(.043,1.39,.103),(.061,1.19,.172),(.019,1.219,.172)],'accessory','Chest')
        save(m,'accessories',id,label,slot=id,headwear=id=='bucket-hat',
             suppresses=['hair'] if id=='bucket-hat' else [],pair=id in ['gloves','hair-ties'])


def main():
    hair();faces();outfits();shoes();accessories()
    for model in SOURCE_MANIFEST['models']:
        shutil.copyfile(SOURCE/f"models/{model['id']}.glb", ROOT/f"references/models/{model['id']}.glb")
    shutil.copyfile(SOURCE/'textures/athlete-atlas.png',ROOT/'references/textures/athlete-atlas.png')
    bodies=[dict(id=m['id'],label=m['label'],path=f"references/models/{m['id']}.glb",
                 source=f"workout/island/assets/athlete-body-v22/models/{m['id']}.glb",
                 sourceSha256=m['sha256'],width=m['bodyShape']['width'],depth=m['bodyShape']['depth'],
                 height=m['height'],triangles=m['triangles']) for m in SOURCE_MANIFEST['models']]
    categories=[dict(id=id,label=label,count=count,selection='multiple' if id=='accessories' else 'single') for id,label,count in
                [('hair','שיער',12),('faces','פנים',8),('skin','עור',6),('outfits','בגדים',10),('shoes','נעליים',8),('accessories','אביזרים',8)]]
    manifest=dict(schemaVersion=1,id='avatar-customization-v1',version='1.0.0',
                  sourceCommit='43b27dc235387e3cb737aee9558cdf9d5fd5a262',
                  categories=categories,items=ITEMS,skinTones=SOURCE_MANIFEST['skinTones'],bodies=bodies,
                  colorRegions=[dict(id=i,name=k,default=PALETTE[i]) for k,i in REGIONS.items()],
                  maskEncoding=dict(attribute='_REGION',componentType=5121,byteStride=4,
                                    colorAttribute='COLOR_0',colorSpace='linear-sRGB',alpha=1,
                                    rule='Replace RGB of vertices with exact _REGION id; never multiply the authored color.'),
                  skeleton=dict(id='canonical18',units='meters',up='+Y',forward='+Z',bones=BONES,
                                bind='identity local quaternions; inverse canonical rest world matrices',
                                itemSpace='canonical world-space; skin onto v22 bones in NAMES order',
                                bodyFit='Scale item POSITION x by body.width, z by body.depth. Keep the canonical joints unchanged. Reuse v22 skeleton and bind matrix; its BodyScale supplies stature.'),
                  integration=dict(module='runtime/customization.mjs',
                                   sourceHeadCutY=1.448,underlay='Source shirt/shorts/socks become a neutral skin-colored shell. Source eye/head triangles above cut are replaced by selected face. No input file is modified.',
                                   garmentMorphs='Use all-zero v22 sport morphs; complete customization outfits replace sport styling.',
                                   headwear='Bucket hat suppresses the selected hairstyle while equipped; unequipping restores it. Hairstyle cap and accessory hat are mutually exclusive visually.',
                                   gloves='Hide source hand faces below y=.795 while gloves are worn.',
                                   scope='Asset-only review package; no live game wiring or release changes.'),
                  defaults=dict(body='soccer',hair='crop',face='face-gentle',skin=1,outfit='sport',shoes='runners',accessories=[],colors={k:PALETTE[v] for k,v in REGIONS.items()}),
                  budgets=dict(maxItemTriangles=300,maxPackageBytes=6_000_000,
                               referenceBodyException='Four unmodified existing v22 bodies, 5080 triangles each; these are preview inputs, not customization items.'),
                  runtime=dict(localOnly=True,wasm=False,compressionExtensions=[],externalRequests=0,
                               previewViewport=[844,390],offlineDownload='Self-contained HTML generated in browser; embeds local assets, code and CSS; opens via file:// without a server.'))
    manifest['offlineFiles']=sorted(['preview.html','preview.css','preview.bundle.js','manifest.json','REPORT.md','LICENSES.md',
                                     'references/textures/athlete-atlas.png']+
                                    [b['path'] for b in bodies]+[i[k] for i in ITEMS for k in ['path','thumbnail']])
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'items':len(ITEMS),'maxTriangles':max(i['triangles'] for i in ITEMS),
                      'itemBytes':sum(i['bytes'] for i in ITEMS),
                      'triangles':{i['id']:i['triangles'] for i in ITEMS}},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
