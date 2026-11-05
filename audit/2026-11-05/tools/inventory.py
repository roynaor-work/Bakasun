"""Read tracked bytes only. Asset/credential summaries contain no matched secrets."""
import io, re, struct, gzip, hashlib, base64
from collections import Counter
from PIL import Image
from common import *

def glb(path):
    b=path.read_bytes();magic,version,total=struct.unpack_from('<III',b)
    if magic!=0x46546c67 or version!=2 or total!=len(b):return {'error':'invalid GLB header'}
    n,t=struct.unpack_from('<II',b,12);g=json.loads(b[20:20+n]); binary=None
    cursor=20+n
    while cursor<len(b):
        length,kind=struct.unpack_from('<II',b,cursor)
        if kind==0x004e4942:binary=b[cursor+8:cursor+8+length]
        cursor+=8+length
    prims=[p for m in g.get('meshes',[]) for p in m.get('primitives',[])]
    tris=0
    for p in prims:
        a=p.get('indices',p.get('attributes',{}).get('POSITION'))
        if a is not None:
            count=g['accessors'][a]['count'];mode=p.get('mode',4)
            tris+=count//3 if mode==4 else max(0,count-2) if mode in (5,6) else 0
    tex=[]
    for im in g.get('images',[]):
        row={'mime':im.get('mimeType'),'external':bool(im.get('uri'))}
        try:
            if 'bufferView' in im and binary is not None:
                view=g['bufferViews'][im['bufferView']];start=view.get('byteOffset',0)
                buf=binary[start:start+view['byteLength']]
                with Image.open(io.BytesIO(buf)) as img:row.update(width=img.width,height=img.height,bytes=len(buf))
            elif im.get('uri','').startswith('data:'):
                with Image.open(io.BytesIO(base64.b64decode(im['uri'].split(',',1)[1]))) as img:row.update(width=img.width,height=img.height)
            elif im.get('uri'):
                uri=urlsplit(im['uri'])
                if not uri.scheme and not uri.netloc:
                    target=(path.parent/unquote(uri.path)).resolve()
                    if target.is_relative_to(ROOT):
                        row['externalPath']=str(target.relative_to(ROOT));row['exists']=target.is_file()
                        if target.is_file():
                            with Image.open(target) as img:row.update(width=img.width,height=img.height,bytes=target.stat().st_size)
                    else:row['unresolvedReason']='outside repository'
                else:row['unresolvedReason']='external URL not fetched or copied'
        except Exception as e:row['decodeError']=type(e).__name__
        tex.append(row)
    return {'trianglesUniqueMeshes':tris,'primitives':len(prims),'dracoPrimitives':sum('KHR_draco_mesh_compression' in p.get('extensions',{}) for p in prims),
      'skinJoints':[len(s.get('joints',[])) for s in g.get('skins',[])],
      'boneNames':[[g['nodes'][i].get('name','') for i in s.get('joints',[])] for s in g.get('skins',[])],
      'animations':len(g.get('animations',[])),'textures':tex,'imageCount':len(tex),
      'extensionsRequired':g.get('extensionsRequired',[])}

def main():
    files=baseline_files()
    rows=[];secrets=[];personal=[];sources=[]
    signatures={
      'private-key':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
      'github-token':re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})'),
      'openai-token':re.compile(r'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}'),
      'aws-access-id':re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
      'jwt':re.compile(r'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}')}
    text_suffix={'.js','.mjs','.ts','.json','.html','.sql','.yml','.yaml','.md','.py','.css','.txt'}
    for rel in files:
        if not rel:continue
        path=ROOT/rel
        if not path.is_file():continue
        b=path.read_bytes();suffix=path.suffix.lower();row={'path':rel,'bytes':len(b),'MB':round(len(b)/1_000_000,5)}
        if suffix=='.glb':
            try:row['glb']=glb(path)
            except Exception as e:row['glb']={'error':type(e).__name__}
        if suffix in {'.png','.jpg','.jpeg','.webp'}:
            try:
                with Image.open(path) as im:row['image']={'width':im.width,'height':im.height,'format':im.format}
            except Exception as e:row['image']={'error':type(e).__name__}
        if suffix in {'.js','.mjs','.css','.html','.json'}:
            row['gzipBytes']=len(gzip.compress(b,mtime=0))
        if suffix in text_suffix:
            s=b.decode('utf8',errors='replace');sources.append(rel)
            for kind,pattern in signatures.items():
                for m in pattern.finditer(s):
                    hit={'path':rel,'line':s.count('\n',0,m.start())+1,'kind':kind}
                    if kind=='jwt':
                        try:
                            part=m.group().split('.')[1];payload=json.loads(base64.urlsafe_b64decode(part+'='*(-len(part)%4)))
                            hit['role']=payload.get('role','unclassified')
                        except:hit['role']='unclassified'
                    secrets.append(hit)
            # Locations only. Do not reproduce the contact values in new files.
            if not any(x in rel for x in ['/vendor/','/source/','/sources/','/verification/']) and suffix in {'.js','.mjs','.json','.py','.sql','.html'}:
                for i,line in enumerate(s.splitlines(),1):
                    if re.search(r'(?<![\d.])0[2-9][\d-]{7,10}(?![\d.])',line) and re.search(r'phone|טלפון|whatsapp|bizPhone|contact',line,re.I):
                        personal.append({'path':rel,'line':i,'kind':'possible-contact-number; verify source privately'})
        rows.append(row)
    write_json(OUT/'evidence/assets.json',{'at':stamp(),'decimalMB':True,'triangleMethod':'sum unique mesh primitive accessor index counts / 3; instances multiply runtime cost; Draco count available without decoding', 'files':rows})
    write_json(OUT/'evidence/source-scan.json',{'at':stamp(),'trackedFiles':len(rows),'textFiles':len(sources),'scope':'current tracked tree only, not history; heuristic signatures, no cloud access','secretSignatures':secrets,'possibleContactLocations':personal})
    groups={}
    for app,prefix in [('bakasun',None),('north','north/'),('workout','workout/'),('island','workout/island/')]:
        subset=[r for r in rows if (r['path'].startswith(prefix) if prefix else r['path'].split('/')[0] in {'js','css','icons'} or r['path'] in {'index.html','sw.js','manifest.json'})]
        if app=='workout':subset=[r for r in subset if not r['path'].startswith('workout/island/')]
        groups[app]={'files':len(subset),'bytes':sum(r['bytes'] for r in subset),'glb':sum('glb' in r for r in subset),'largest':sorted(subset,key=lambda r:r['bytes'],reverse=True)[:12]}
    write_json(OUT/'evidence/weights-summary.json',groups)
    print(json.dumps({k:{x:v[x] for x in ['files','bytes','glb']} for k,v in groups.items()}))
    print('credential signature classifications:',Counter((h['kind'],h.get('role','')) for h in secrets))

if __name__=='__main__':main()
