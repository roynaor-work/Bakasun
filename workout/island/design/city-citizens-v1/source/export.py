"""Reproducible, dependency-free glTF 2.0 GLB exporter for city-citizens-v1.

Run citizens.py and animals.py first, then this file. Only writes this new
package. Original uncompressed indexed geometry needs no decoder or extension.
"""
from pathlib import Path
import argparse
import hashlib
import json
import math
import struct
import sys
sys.dont_write_bytecode = True
from motion import humanoid_animations

ROOT=Path(__file__).resolve().parent.parent
REPO=ROOT.parents[3]
RAW=Path('/tmp/city-citizens')
CANONICAL=REPO/'workout/island/design/motion2/soccer.json'

def digest(data):
    return hashlib.sha256(data).hexdigest()


def byte_weights(ws):
    weights=[max(0.,float(w)) for w in ws]
    total=sum(weights)
    if total<=0:
        return [255,0,0,0]
    values=[w/total*255 for w in weights]
    out=[math.floor(v) for v in values]
    for i in sorted(range(4),key=lambda j:values[j]-out[j],reverse=True)[:255-sum(out)]:
        out[i]+=1
    return out


def contact_spans(clip):
    by_bone={}
    for c in clip.get('contacts',[]):
        by_bone.setdefault(c['bone'],[]).append(c)
    spans=[]
    for bone,rows in by_bone.items():
        active=None
        for c in rows:
            t=c['frame']/30
            if c['active'] and active is None:
                active=t
            elif not c['active'] and active is not None:
                spans.append({'bone':bone,'start':active,'end':max(active,t-1/30),'local':[0,-.08,0]})
                active=None
        if active is not None:
            spans.append({'bone':bone,'start':active,'end':clip['duration'],'local':[0,-.08,0]})
    return spans


def clip_metadata(clip):
    info={k:v for k,v in clip.items() if k not in ('tracks','contacts')}
    if clip.get('contacts'):
        info['supports']=contact_spans(clip)
        info['locomotion']=True
        info['expectedRootSpeed']=clip['speed']
        info['soleLocal']=[0,-.08,0]
    else:
        info['locomotion']=False
    return info


class GLB:
    def __init__(self):
        self.doc={'asset':{'version':'2.0','generator':'Bakasun city-citizens-v1 / source/export.py','copyright':'CC0-1.0. Original city assets; see LICENSES.md.'},'scene':0,'scenes':[],'nodes':[],'meshes':[],'materials':[],'skins':[],'animations':[],'accessors':[],'bufferViews':[],'buffers':[{'byteLength':0}]}
        self.binary=bytearray()
        self.cache={}

    def accessor(self,values,kind,component=5126,normalized=False,target=None,name=''):
        widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
        width=widths[kind]
        rows=values if width>1 else [[v] for v in values]
        flattened=[c for row in rows for c in row]
        formats={5126:'f',5123:'H',5121:'B'}
        binary=struct.pack('<'+formats[component]*len(flattened),*flattened)
        key=(digest(binary),kind,component,normalized,target)
        if key in self.cache:
            return self.cache[key]
        self.binary.extend(b'\0'*((-len(self.binary))%4))
        view={'buffer':0,'byteOffset':len(self.binary),'byteLength':len(binary)}
        if target:
            view['target']=target
        view_index=len(self.doc['bufferViews'])
        self.doc['bufferViews'].append(view)
        self.binary.extend(binary)
        acc={'bufferView':view_index,'componentType':component,'count':len(rows),'type':kind}
        if normalized:
            acc['normalized']=True
        if name:
            acc['name']=name
        if kind in ('SCALAR','VEC3'):
            acc['min']=[min(row[i] for row in rows) for i in range(width)]
            acc['max']=[max(row[i] for row in rows) for i in range(width)]
        index=len(self.doc['accessors'])
        self.doc['accessors'].append(acc)
        self.cache[key]=index
        return index

    def finish(self):
        self.binary.extend(b'\0'*((-len(self.binary))%4))
        self.doc['buffers'][0]['byteLength']=len(self.binary)
        data=json.dumps(self.doc,separators=(',',':'),ensure_ascii=True).encode()
        data+=b' '*((-len(data))%4)
        total=12+8+len(data)+8+len(self.binary)
        return struct.pack('<4sII',b'glTF',2,total)+struct.pack('<I4s',len(data),b'JSON')+data+struct.pack('<I4s',len(self.binary),b'BIN\0')+self.binary


def periodic_cubic_keys(values,times,quaternion=False):
    """Periodic C1 Hermite keys for glTF CUBICSPLINE.

    Values stay on the original exact30Hz timeline. Tangents are derivatives
    per second. First/last derivatives use the same wrapped neighbours; for
    rotations, project to the unit-quaternion tangent plane before packing.
    """
    n=len(values)-1
    assert n>=3
    assert max(abs(a-b) for a,b in zip(values[0],values[-1]))<1e-6
    tangents=[]
    for i in range(len(values)):
        j=0 if i==n else i
        before=values[(j-1)%n]
        after=values[(j+1)%n]
        dt=(times[1]-times[0]) if j==0 else (times[j+1]-times[j-1])/2
        tangent=[(b-a)/(2*dt) for a,b in zip(before,after)]
        if quaternion:
            q=values[i]
            dot=sum(a*b for a,b in zip(q,tangent))
            tangent=[a-dot*b for a,b in zip(tangent,q)]
        tangents.append(tangent)
    return [row for i,value in enumerate(values) for row in (tangents[i],value,tangents[i])]


def export(raw,skeleton,clips,palette=None):
    glb=GLB()
    doc=glb.doc
    positions=raw['positions']
    normals=[]
    for normal in raw['normals']:
        length=math.sqrt(sum(c*c for c in normal))
        normals.append([float(c)/length for c in normal] if length else [0.,1.,0.])
    colors=raw['colors']
    if palette:
        colors=[palette['colors'][slot] for slot in raw['colorSlots']]
    color_bytes=[[max(0,min(255,round(c*255))) for c in row] for row in colors]
    attributes={'POSITION':glb.accessor(positions,'VEC3',target=34962,name='positions'),'NORMAL':glb.accessor(normals,'VEC3',target=34962,name='normals'),'COLOR_0':glb.accessor(color_bytes,'VEC4',5121,True,34962,'palette vertex colour')}
    if raw.get('joints'):
        attributes.update({'JOINTS_0':glb.accessor(raw['joints'],'VEC4',5121,False,34962,'skin joints'),'WEIGHTS_0':glb.accessor([byte_weights(w) for w in raw['weights']],'VEC4',5121,True,34962,'normalized skin weights')})
    indices=glb.accessor(raw['indices'],'SCALAR',5123,False,34963,'triangle indices')
    doc['materials']=[{'name':'unbranded vertex palette','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.88},'doubleSided':bool(raw.get('metadata',{}).get('doubleSided',False))}]
    doc['meshes']=[{'name':raw['id'],'primitives':[{'attributes':attributes,'indices':indices,'material':0,'mode':4}]}]
    doc['nodes']=[{'name':raw['id'],'mesh':0,'extras':{'identity':raw['id'],'category':raw.get('category','citizen'),'recommendedScale':raw.get('scale',1),'fictional':True,'unbranded':True}}]
    roots=[0]
    bone_indices={}
    worlds={}
    for b in skeleton['bones']:
        index=len(doc['nodes'])
        bone_indices[b['name']]=index
        local=b['restTranslationMeters']
        doc['nodes'].append({'name':b['name'],'translation':local})
        parent=b.get('parent')
        if parent:
            doc['nodes'][bone_indices[parent]].setdefault('children',[]).append(index)
            worlds[b['name']]=[local[j]+worlds[parent][j] for j in range(3)]
        else:
            worlds[b['name']]=local[:]
            roots.append(index)
    matrices=[]
    for b in skeleton['bones']:
        x,y,z=worlds[b['name']]
        matrices.append([1.,0.,0.,0.,0.,1.,0.,0.,0.,0.,1.,0.,-x,-y,-z,1.])
    doc['skins']=[{'name':'canonical18' if len(skeleton['bones'])==18 else raw['id']+' articulated rig','inverseBindMatrices':glb.accessor(matrices,'MAT4',name='inverse bind matrices'),'joints':[bone_indices[b['name']] for b in skeleton['bones']],'skeleton':bone_indices[skeleton['bones'][0]['name']]}]
    doc['nodes'][0]['skin']=0
    doc['scenes']=[{'name':'city citizen asset','nodes':roots}]
    for clip in clips:
        anim={'name':clip['name'],'samplers':[],'channels':[],'extras':clip_metadata(clip)}
        for tr in clip['tracks']:
            assert len(tr['times'])==len(tr['values']), (raw['id'],clip['name'],tr['bone'])
            count=len(tr['times'])
            assert count>1
            for a,b in zip(tr['times'],tr['times'][1:]):
                assert b>a
            path=tr['path']
            out_kind='VEC4' if path=='rotation' else 'VEC3'
            values=tr['values']
            if path=='rotation':
                cleaned=[]
                for q in values:
                    length=math.sqrt(sum(x*x for x in q))
                    q=[x/length for x in q]
                    if cleaned and sum(x*y for x,y in zip(q,cleaned[-1]))<0:
                        q=[-x for x in q]
                    cleaned.append(q)
                values=cleaned
            interpolation=clip.get('interpolation','LINEAR')
            if interpolation=='CUBICSPLINE':
                values=periodic_cubic_keys(values,tr['times'],quaternion=(path=='rotation'))
            sam_index=len(anim['samplers'])
            anim['samplers'].append({'input':glb.accessor(tr['times'],'SCALAR',name='30 Hz time'),'output':glb.accessor(values,out_kind,name=path+' keys'),'interpolation':interpolation})
            anim['channels'].append({'sampler':sam_index,'target':{'node':bone_indices[tr['bone']],'path':path}})
        doc['animations'].append(anim)
    if not doc['animations']:
        del doc['animations']
    data=glb.finish()
    return bytes(data)


def write_asset(raw,skeleton,clips,relative,palette=None):
    data=export(raw,skeleton,clips,palette)
    file=ROOT/relative
    file.parent.mkdir(parents=True,exist_ok=True)
    file.write_bytes(data)
    mins=[min(v[j] for v in raw['positions']) for j in range(3)]
    maxs=[max(v[j] for v in raw['positions']) for j in range(3)]
    return {'path':relative,'file':relative,'triangles':len(raw['indices'])//3,'vertices':len(raw['positions']),'byteLength':len(data),'sha256':digest(data),'heightMeters':maxs[1]-mins[1],'runtimeHeightMeters':(maxs[1]-mins[1])*raw.get('scale',1),'bounds':{'min':mins,'max':maxs}}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--raw',type=Path,default=RAW)
    args=parser.parse_args()
    canonical=json.loads(CANONICAL.read_text())['skeleton']
    (ROOT/'skeleton.json').write_text(json.dumps({'source':'workout/island/design/motion2/soccer.json',**canonical},indent=2)+'\n')
    manifest={'schema':'city-citizens-v1','version':1,'title':'תושבי העיר שלי','preview':{'file':'preview.html','width':844,'height':390},'license':'CC0-1.0','units':'meters','axes':{'+Y':'up','+Z':'forward','+X':'anatomicalLeft'},'skeleton':'skeleton.json','canonicalSkeletonSource':'workout/island/design/motion2/soccer.json','fps':30,'budgetBytes':6000000,'people':[],'animals':[],'assets':[],'qa':{'khronos':'verification/khronos.json','motion':'verification/motion-qa.json'}}
    people_files=sorted(args.raw.glob('people-*.json'))
    animal_files=sorted(args.raw.glob('animals-*.json'))
    for filename in people_files:
        raw=json.loads(filename.read_text())
        clips=humanoid_animations(raw)
        person={k:raw[k] for k in ('id','name','labelHe','role','age','scale') if k in raw}
        person.update({'variants':[],'animations':[clip_metadata(c) for c in clips],'metadata':raw.get('metadata',{})})
        for palette in raw['palettes']:
            variant_id=palette['id']
            info=write_asset(raw,canonical,clips,'people/'+raw['id']+'-'+variant_id+'.glb',palette)
            info.update({'id':variant_id,'labelHe':palette.get('labelHe',variant_id)})
            person['variants'].append(info)
            manifest['assets'].append({**info,'id':raw['id']+'-'+variant_id,'identity':raw['id'],'variant':variant_id,'category':'citizen','scale':raw.get('scale',1)})
        manifest['people'].append(person)
    for filename in animal_files:
        raw=json.loads(filename.read_text())
        clips=raw['animations']
        info=write_asset(raw,raw['skeleton'],clips,'animals/'+raw['id']+'.glb')
        animal={k:raw[k] for k in ('id','name','labelHe') if k in raw}
        animal.update(info)
        animal.update({'animations':[clip_metadata(c) for c in clips],'metadata':raw.get('metadata',{})})
        manifest['animals'].append(animal)
        manifest['assets'].append({**info,'id':raw['id'],'identity':raw['id'],'category':'animal'})
    manifest['summary']={'identities':len(manifest['people']),'colorVariants':sum(len(p['variants']) for p in manifest['people']),'animals':len(manifest['animals']),'glbCount':len(manifest['assets']),'glbBytes':sum(a['byteLength'] for a in manifest['assets'])}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(manifest['summary']))
    if len(people_files)!=12 or len(animal_files)!=6:
        print('Partial raw set: complete raw authoring, then rerun export.py.',file=sys.stderr)

if __name__=='__main__':
    main()
