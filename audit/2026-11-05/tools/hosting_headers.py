"""Read public static document/worker responses; never run scripts or request app data."""
import concurrent.futures,hashlib,urllib.request
from common import *

PATHS=['index.html','workout/index.html','workout/island/index.html','north/index.html','workout/island/minigames/hoops-draco-worker.mjs','workout/island/minigames/alpine-draco-worker.mjs','workout/island/tools/perf-alpine.html']
HEADERS=['Content-Security-Policy','X-Content-Type-Options','Referrer-Policy','Permissions-Policy','X-Frame-Options','Cache-Control','Content-Encoding']
def inspect(path):
    r={'path':path,'at':stamp()}
    try:
        req=urllib.request.Request('https://roynaor-work.github.io/Bakasun/'+path,headers={'User-Agent':'Bakasun-readonly-audit','Cache-Control':'no-cache'})
        with urllib.request.urlopen(req,timeout=20) as response:
            body=response.read(2_000_001)
            r.update(status=response.status,bytes=len(body),matchesFrozenFile=body==(ROOT/path).read_bytes(),headers={key:response.headers.get(key) for key in HEADERS})
            if len(body)<=2_000_000:r['sha256']=hashlib.sha256(body).hexdigest()
    except Exception as e:r['error']=e.constructor.name if hasattr(e,'constructor') else type(e).__name__;r['reason']=str(e).split('\n')[0][:220]
    return r
def main():
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(inspect,PATHS))
    report={'started':min(x['at'] for x in rows),'finished':stamp(),'conditions':'Read-only GET of seven public static files. No JavaScript execution, cookies, form submissions, database/Storage data or response bodies saved. Only whitelisted headers, hashes and equality with frozen files retained.','responses':rows}
    write_json(OUT/'evidence/hosting-headers.json',report)
    for row in rows:print(json.dumps(row,ensure_ascii=False))
if __name__=='__main__':main()
