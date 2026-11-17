"""Build the 16 x 3 self-contained, animated glTF 2.0 crowd assets.

Run: PYTHONDONTWRITEBYTECODE=1 python3 source/build.py
Authoring dependencies: Python 3, numpy, Pillow. No network or Blender required.
"""
import sys
sys.dont_write_bytecode=True
import hashlib
import io
import json
import math
import struct
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from geometry import build, make_rig, proportions, ROOT, DESIGN
from motions import bake, CLIPS

SPECS=[
    # age, height, presentation, skin, hair, shirt, trousers, accent, build,
    # shoulders, face width, hair style, cap, scarf, glasses, sleeve, trousers
    (8,1.24,'boy','#C88E68','#2B211D','#225D75','#343C49','#F2CB69',.86,.92,.97,'crop',True,False,False,'short','shorts'),
    (11,1.43,'girl','#79513D','#211D20','#BB674F','#344B56','#EED9A8',.90,.90,1.04,'bun',False,True,False,'short','trousers'),
    (15,1.67,'boy','#E3B994','#5E3B29','#C7A658','#334A48','#F5E7CC',.90,.96,.96,'crop',False,True,True,'long','trousers'),
    (17,1.64,'girl','#A87751','#262223','#316F66','#283B45','#E8D6AC',.92,.92,.99,'bun',False,False,False,'short','trousers'),
    (23,1.83,'man','#573A30','#211C1B','#34617C','#323746','#E9C774',1.04,1.05,1.05,'curls',False,True,False,'short','shorts'),
    (27,1.72,'woman','#DDA882','#42302A','#E0C785','#3B4854','#315B70',.97,.96,.96,'bun',False,False,True,'short','trousers'),
    (31,1.76,'man','#B47B51','#231F20','#B05C4B','#354647','#E9D8AC',1.12,1.03,1.03,'crop',True,False,True,'short','trousers'),
    (34,1.68,'woman','#8B5D43','#272023','#315D75','#D0B695','#EBD594',1.07,.96,1.06,'curls',False,True,False,'long','trousers'),
    (39,1.89,'man','#EAC5A4','#735441','#3C7268','#33404B','#E8CC86',.98,1.04,.98,'crop',False,False,True,'long','trousers'),
    (43,1.61,'woman','#684735','#282021','#B99A53','#3E4951','#F0E3BC',1.15,.98,1.07,'bun',False,True,False,'short','trousers'),
    (48,1.79,'man','#BE8A64','#54473F','#D2C5AC','#3E5361','#A75449',1.18,1.07,1.04,'crop',True,True,False,'long','trousers'),
    (54,1.65,'woman','#D3AB83','#6E5B4E','#A65D4E','#43464C','#E9D5A0',1.08,.97,1.00,'crop',False,False,True,'long','trousers'),
    (61,1.74,'man','#8F654B','#8A8177','#2F6370','#544D46','#E1C275',1.06,1.03,1.05,'crop',False,True,True,'long','trousers'),
    (67,1.58,'woman','#E2BA9B','#B7ADA0','#C4A761','#3B4D56','#376B68',1.13,.97,.98,'bun',False,False,True,'long','trousers'),
    (73,1.70,'man','#65493A','#AAA59A','#3C7063','#4C4B49','#EBDAB2',.99,.98,1.06,'crop',True,False,True,'long','trousers'),
    (79,1.56,'woman','#BA8E6B','#D5CEC0','#AF6554','#3B4853','#E8C96F',1.04,.94,1.01,'crop',False,True,True,'long','trousers'),
]


def roster():
    keys=['age','heightM','presentation','skin','hair','shirt','trouserColor','accent','build','shoulder','faceWidth','hairStyle','cap','scarf','glasses','sleeve','pants']
    heritage=['mixed European / West Asian','African diaspora','European','East Asian','African diaspora','West Asian',
              'South Asian','mixed Latin American','European','African diaspora','West Asian','East Asian','South Asian','European','African diaspora','mixed Latin American']
    records=[]
    for i,spec in enumerate(SPECS):
        look=dict(zip(keys,spec));look.update(id=f'fan-{i+1:02d}',label=f'אוהד/ת {i+1:02d}',
          designHeritage=heritage[i],nose=.84+(i%5)*.075,shirtPattern=['plain','stripes','chest_band','raglan'][i%4])
        records.append(look)
    return records


def atlas(look):
    """Original unbranded cloth, hair and restrained face detail; no portrait."""
    im=Image.new('RGB',(256,256),look['skin']);d=ImageDraw.Draw(im)
    skin=np.array([int(look['skin'][i:i+2],16) for i in [1,3,5]])
    hair=look['hair'];accent=look['accent'];shirt=look['shirt']
    # A cylindrical head texture: front at U=.5, back at U=0/1.
    for x in range(256):
        front=max(0,math.cos((x/256-.5)*math.tau))
        hairline=int(128*(.72-.52*front**2))
        if look['hairStyle']=='curls':hairline+=int(3*math.sin(x*.42)+2*math.sin(x*.9))
        if look['age']>60:hairline-=int(8*front)
        if look['cap']:hairline=int(128*(.35-.12*front))
        d.line((x,0,x,max(0,hairline)),fill=accent if look['cap'] else hair)
    # Ears, sockets, eyelids and a small mouth; eye whites never become dots.
    def mix(a,b,t):return tuple(int(v) for v in np.array(a)*(1-t)+np.array(b)*t)
    dark=mix(skin,[50,35,31],.63);socket=mix(skin,[78,48,41],.22)
    for x in [111,145]:
        d.ellipse((x-7,48,x+7,54),fill=socket)
        d.line((x-6,50,x+6,50),fill=dark,width=1)
        d.line((x-5,52,x+5,52),fill=mix(skin,[229,217,197],.5),width=1)
        d.ellipse((x-1,50,x+1,53),fill='#352E2A')
        d.line((x-7,45,x+6,44),fill=hair,width=2)
        if look['age']>=48:
            d.line((x-6,57,x+5,58),fill=mix(skin,[83,57,45],.18))
        if look['glasses']:
            d.rounded_rectangle((x-10,46,x+10,58),radius=3,outline='#343B3D',width=2)
    if look['glasses']:d.line((121,50,135,50),fill='#343B3D',width=2)
    d.line((128,59,126,72,131,73),fill=mix(skin,[76,46,35],.17),width=1)
    d.line((119,88,128,89,137,88),fill=mix(skin,[91,45,40],.48),width=1)
    d.line((123,92,133,92),fill=mix(skin,[227,187,153],.20),width=1)
    if look['age']>60:
        d.line((119,36,138,36),fill=mix(skin,[91,65,51],.13))
        d.line((118,40,139,40),fill=mix(skin,[91,65,51],.12))
    # Garment panel; the small fabric weave does not add runtime geometry.
    d.rectangle((0,128,127,255),fill=shirt)
    if look['shirtPattern']=='stripes':
        for x in range(9,128,22):d.rectangle((x,130,x+6,255),fill=accent)
    elif look['shirtPattern']=='chest_band':d.rectangle((0,170,127,187),fill=accent)
    elif look['shirtPattern']=='raglan':
        d.polygon([(0,128),(31,128),(13,186),(0,206)],fill=accent)
        d.polygon([(96,128),(127,128),(127,206),(113,186)],fill=accent)
    d.rectangle((0,232,127,255),fill=look['trouserColor'])
    d.line((0,232,127,232),fill=look['accent'],width=1)
    # Neck and a modest collar, plus scarf collar if present.
    d.rectangle((0,128,127,137),fill=look['skin'])
    d.line((0,138,127,138),fill=accent,width=4 if look['scarf'] else 2)
    d.rectangle((128,128,191,191),fill=look['trouserColor'])
    d.rectangle((192,128,255,191),fill=look['skin'])
    d.rectangle((128,192,191,223),fill=hair)
    d.rectangle((192,192,255,223),fill='#DFD9CC' if look['age']<50 else '#3B3935')
    d.line((192,218,255,218),fill='#B7AE9D',width=3)
    d.rectangle((128,224,191,255),fill=accent)
    for y in range(227,255,8):d.line((131,y,188,y),fill=shirt,width=2)
    d.rectangle((192,224,255,255),fill=shirt)
    # Quantization keeps the three copies of this embedded atlas inexpensive.
    out=io.BytesIO();im.quantize(colors=96).save(out,format='PNG',optimize=True)
    return out.getvalue()


class GLB:
    def __init__(self):
        self.bin=bytearray();self.cache={}
        self.j={'asset':{'version':'2.0','generator':'Bakasun crowd people v2 / CC0 profile resampling'},
                'scene':0,'scenes':[{'name':'Crowd supporter','nodes':[]}],
                'nodes':[],'meshes':[],'accessors':[],'bufferViews':[],'buffers':[],'animations':[]}

    def view(self,data,target=None):
        while len(self.bin)%4:self.bin.append(0)
        index=len(self.j['bufferViews']);v=dict(buffer=0,byteOffset=len(self.bin),byteLength=len(data))
        if target:v['target']=target
        self.j['bufferViews'].append(v);self.bin.extend(data);return index

    def acc(self,values,kind,dtype='f4',target=None,bounds=False):
        arr=np.array(values,dtype='<'+dtype);data=arr.tobytes();key=(data,kind,dtype,target,bounds)
        if key in self.cache:return self.cache[key]
        n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[kind]
        arr=arr.reshape(-1,n);a=dict(bufferView=self.view(data,target),componentType={'f4':5126,'u2':5123,'u1':5121}[dtype],count=len(arr),type=kind)
        if bounds:a.update(min=arr.min(axis=0).tolist(),max=arr.max(axis=0).tolist())
        index=len(self.j['accessors']);self.j['accessors'].append(a);self.cache[key]=index;return index

    def save(self,path):
        self.j['buffers']=[{'byteLength':len(self.bin)}]
        js=json.dumps(self.j,separators=(',',':'),ensure_ascii=False).encode()
        js+=b' '*((-len(js))%4);self.bin.extend(b'\0'*((-len(self.bin))%4))
        data=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(self.bin))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(self.bin),b'BIN\0')+self.bin
        path.write_bytes(data);return len(data),hashlib.sha256(data).hexdigest()


def export(look,lod,mesh,rig,clips,texture):
    g=GLB();j=g.j;names=[r['name'] for r in rig]
    for r in rig:j['nodes'].append(dict(name=r['name'],translation=r['translation']))
    for i,r in enumerate(rig):
        if r['parent']:j['nodes'][names.index(r['parent'])].setdefault('children',[]).append(i)
    inverse=[]
    for r in rig:
        mat=np.eye(4);mat[:3,3]=-np.array(r['world']);inverse.append(mat.T.flatten())
    j['skins']=[dict(name='CrowdCanonical18',skeleton=0,joints=list(range(len(rig))),inverseBindMatrices=g.acc(inverse,'MAT4'))]
    texture_view=g.view(texture)
    j['images']=[dict(name=look['id']+' / original face and fabric',bufferView=texture_view,mimeType='image/png')]
    j['samplers']=[dict(magFilter=9729,minFilter=9987,wrapS=33071,wrapT=33071)]
    j['textures']=[dict(source=0,sampler=0)]
    j['materials']=[dict(name='Unbranded cloth / skin / hair',doubleSided=True,pbrMetallicRoughness=dict(baseColorTexture={'index':0},metallicFactor=0,roughnessFactor=.88))]
    packed_j=[];packed_w=[]
    for weights in mesh.weights:
        ordered=sorted([(names.index(n),w) for n,w in weights.items() if w>1e-7],key=lambda x:-x[1])
        total=sum(w for _,w in ordered);ordered=[(n,w/total) for n,w in ordered]
        while len(ordered)<4:ordered.append((0,0))
        packed_j.append([n for n,w in ordered]);packed_w.append([w for n,w in ordered])
    attrs={
        'POSITION':g.acc(mesh.pos,'VEC3',target=34962,bounds=True),
        'NORMAL':g.acc(mesh.norm,'VEC3',target=34962),
        'TEXCOORD_0':g.acc(mesh.uv,'VEC2',target=34962),
        'JOINTS_0':g.acc(packed_j,'VEC4','u1',34962),
        'WEIGHTS_0':g.acc(packed_w,'VEC4',target=34962),
    }
    j['meshes']=[dict(name=look['id']+f'_LOD{lod}',primitives=[dict(attributes=attrs,indices=g.acc(mesh.faces,'SCALAR','u2',34963),material=0,mode=4)])]
    meshnode=len(j['nodes']);j['nodes'].append(dict(name='Supporter',mesh=0,skin=0))
    j['scenes'][0]['nodes']=[0,meshnode]
    j['extras']=dict(id=look['id'],lod=lod,triangles=len(mesh.faces),units='metres',up='+Y',forward='+Z',rootMotion=False,license='CC0-1.0',age=look['age'],heightM=look['heightM'])
    for clip in clips:
        animation=dict(name=clip['id'],samplers=[],channels=[],extras=dict(loop=True,duration=clip['duration'],label=clip['label'],rootMotion=False))
        times=g.acc(clip['times'],'SCALAR',bounds=True)
        for ni,name in enumerate(names):
            for prop in ['rotation','translation']:
                data=np.array([frame[name][prop] for frame in clip['frames']])
                bind=np.array([0,0,0,1] if prop=='rotation' else rig[ni]['translation'])
                if np.max(np.abs(data-bind))<1e-7:continue
                if prop=='rotation':
                    for k in range(1,len(data)):
                        if data[k]@data[k-1]<0:data[k]*=-1
                # Constant non-bind poses need two keys, not 33 duplicate keys.
                constant=np.max(np.abs(data-data[0]))<1e-7
                input_acc=g.acc([0,clip['duration']],'SCALAR',bounds=True) if constant else times
                output=g.acc(data[[0,-1]] if constant else data,'VEC4' if prop=='rotation' else 'VEC3')
                si=len(animation['samplers']);animation['samplers'].append(dict(input=input_acc,output=output,interpolation='LINEAR'))
                animation['channels'].append(dict(sampler=si,target=dict(node=ni,path=prop)))
        j['animations'].append(animation)
    path=ROOT/'models'/f"{look['id']}-lod{lod}.glb"
    size,sha=g.save(path)
    return dict(file=str(path.relative_to(ROOT)),lod=lod,triangles=len(mesh.faces),vertices=len(mesh.pos),bytes=size,sha256=sha,drawCalls=1)


def main():
    (ROOT/'models').mkdir(exist_ok=True)
    records=[]
    for look in roster():
        rig=make_rig(look);clips=bake(rig,look);texture=atlas(look);assets=[]
        for lod in range(3):assets.append(export(look,lod,build(look,lod,rig),rig,clips,texture))
        records.append(dict(**look,headToHeightRatio=round(look['heightM']/proportions(look)['head'],3),
          wardrobe=[look['shirtPattern']+' team shirt',look['pants']]+(['scarf'] if look['scarf'] else [])+(['cap'] if look['cap'] else [])+(['glasses'] if look['glasses'] else []),
          lods=assets,rig=rig))
        print(look['id'],[a['triangles'] for a in assets],sum(a['bytes'] for a in assets),flush=True)
    sources=['characters2/source/body.py','characters2/source/head_hands.py','tennis-v7/rig.json','characters2/LICENSES.md']
    manifest=dict(schemaVersion=1,id='soccer-crowd-people-v2',title='קהל כדורגל אנושי',license='CC0-1.0',
      generated='2026-11-17',units='metres',up='+Y',forward='+Z',modelCount=16,glbCount=48,
      triangleBudgets=[210,90,24],maxPackageBytes=6000000,glbBytes=sum(a['bytes'] for r in records for a in r['lods']),
      clipCount=7,clipCountNote='The brief says six but enumerates seven motions; all seven are delivered.',
      clips=[dict(id=c['id'],label=c['label'],duration=c['duration'],loop=True,rootMotion=False) for c in CLIPS],
      rig=dict(name='CrowdCanonical18',joints=18,bindPose='T-pose',rotations='parent-local XYZW',
               note='Per-person translations and inverse binds are embedded; do not replace with athlete bind matrices.'),
      lodPolicy=dict(mode='Separate GLBs; load one LOD per person',screenHeightPx=[48,16,0],
                     note='LOD0 >=48px, LOD1 16–47px, LOD2 below 16px. LOD2 uses two-sided limb silhouettes; no facial detail.'),
      wave=dict(clip='wave_clap',phaseDelaySeconds=.12,note='Offset each adjacent seat by 0.12s; keep the same phase when switching LOD.'),
      preview=dict(entry='preview.html',viewport=[844,390],network='Self-contained local modules; serve over HTTP.'),
      provenance=[dict(path='../'+f,sha256=hashlib.sha256((DESIGN/f).read_bytes()).hexdigest()) for f in sources],
      fans=records)
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':main()
