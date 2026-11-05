"""Signature scan of locally available main history. Never emits matched values."""
import subprocess,re,base64,json
from common import *

def main():
    base='5d1fca7d11c6f4ed3a7e1cf8b92517fa63d0c275'
    shallow=subprocess.check_output(['git','rev-parse','--is-shallow-repository'],cwd=ROOT,text=True).strip()
    revs=subprocess.check_output(['git','rev-list','--objects',base],cwd=ROOT,text=True).splitlines()
    candidates={}
    for line in revs:
        p=line.split(' ',1)
        if len(p)==2 and Path(p[1]).suffix.lower() in {'.js','.mjs','.ts','.json','.html','.sql','.yml','.yaml','.md','.py','.txt','.env','.config'}:candidates[p[0]]=p[1]
    signatures={
      'private-key':re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
      'github-token':re.compile(rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})'),
      'openai-token':re.compile(rb'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}'),
      'aws-access-id':re.compile(rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
      'jwt':re.compile(rb'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}')}
    r={'started':stamp(),'base':base,'shallow':shallow=='true','scope':'all reachable local main text blobs; not other branches, unreachable objects, deployed secrets or external systems','candidateBlobs':len(candidates),'scannedBlobs':0,'scannedBytes':0,'matches':[]}
    proc=subprocess.Popen(['git','cat-file','--batch'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
    for sha,rel in candidates.items():
        proc.stdin.write((sha+'\n').encode());proc.stdin.flush()
        header=proc.stdout.readline().split()
        if len(header)!=3:continue
        n=int(header[2]);body=proc.stdout.read(n);proc.stdout.read(1)
        if header[1]!=b'blob':continue
        r['scannedBlobs']+=1;r['scannedBytes']+=n
        for kind,pattern in signatures.items():
            for m in pattern.finditer(body):
                match={'blob':sha,'pathHint':rel,'line':body.count(b'\n',0,m.start())+1,'kind':kind}
                if kind=='jwt':
                    try:
                        part=m.group().split(b'.')[1];payload=json.loads(base64.urlsafe_b64decode(part+b'='*(-len(part)%4)));match['role']=payload.get('role','unclassified')
                    except:match['role']='unclassified'
                r['matches'].append(match)
        if r['scannedBlobs']%500==0:print(r['scannedBlobs'],'blobs',r['scannedBytes'],'bytes',flush=True)
    proc.stdin.close();proc.wait();r['finished']=stamp()
    write_json(OUT/'evidence/history-scan.json',r)
    print('complete',r['scannedBlobs'],'blobs, matches',len(r['matches']))

if __name__=='__main__':main()
