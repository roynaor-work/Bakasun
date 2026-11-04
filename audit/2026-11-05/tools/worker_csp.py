"""Show the CSP boundary between a document and an external same-origin worker."""
from playwright.sync_api import sync_playwright
from common import *

def main():
    r={'started':stamp(),'conditions':'synthetic same-origin worker; real island HTML policy; response headers varied deliberately; not a remote exploit or a statement about live hosting','cases':[]}
    with server() as base,sync_playwright() as pw:
        b=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        for add_policy in [False,True]:
            c=b.new_context(service_workers='block');block_external(c,base,[]);p=c.new_page();p.goto(base+'workout/island/index.html',wait_until='load')
            policy=p.locator('meta[http-equiv="Content-Security-Policy"]').get_attribute('content')
            headers={'Content-Type':'text/javascript'}
            if add_policy:headers['Content-Security-Policy']=policy
            p.route('**/audit-worker-probe.js',lambda route:route.fulfill(headers=headers,body="let ran=false;try{eval('ran=true')}catch{}postMessage({evalRan:ran});"))
            value=p.evaluate("""() => new Promise((resolve,reject)=>{const w=new Worker('./audit-worker-probe.js');w.onmessage=e=>{resolve(e.data);w.terminate()};w.onerror=e=>{reject(Error(e.message));w.terminate()}})""")
            r['cases'].append({'workerResponseHasPolicy':add_policy,**value});c.close()
        b.close()
    r['finished']=stamp();write_json(OUT/'iterations/06/worker-csp-boundary.json',r);print(r)

if __name__=='__main__':main()
