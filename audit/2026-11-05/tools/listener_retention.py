"""Causal check: retained voiceschanged handlers across repeated Settings visits."""
from playwright.sync_api import sync_playwright
from common import *
import sys

def main():
    r={'started':stamp(),'conditions':'fresh local workout context, 24 settings/home cycles, GC between samples; then dispatch standard voiceschanged event at home; no product code changes','samples':[]}
    bakasun='--bakasun' in sys.argv
    if bakasun:r['conditions']='fresh local Bakasun context, 24 today/calls cycles, GC between samples; then dispatch installable event at calls; no product code changes'
    output=OUT/'iterations/06'/('bakasun-listener-retention.json' if bakasun else 'listener-retention.json')
    with server() as base,sync_playwright() as pw:
        b=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        c=b.new_context(service_workers='block');block_external(c,base,[]);p=c.new_page();p.goto(base+('index.html#/calls' if bakasun else 'workout/index.html#/home'),wait_until='load');p.wait_for_timeout(1500)
        cdp=c.new_cdp_session(p);cdp.send('Performance.enable')
        def sample(label):
            cdp.send('HeapProfiler.collectGarbage');m={x['name']:x['value'] for x in cdp.send('Performance.getMetrics')['metrics']}
            row={'label':label,**{k:m[k] for k in ['JSHeapUsedSize','JSEventListeners','Nodes','Documents']}};r['samples'].append(row);write_json(output,r)
        sample('baseline')
        for i in range(24):
            p.evaluate("location.hash='#/today'" if bakasun else "location.hash='#/settings'");p.wait_for_timeout(250)
            p.evaluate("location.hash='#/calls'" if bakasun else "location.hash='#/home'");p.wait_for_timeout(250)
            if (i+1)%4==0:sample('cycles-'+str(i+1))
        p.evaluate("document.dispatchEvent(new Event('bakasun:installable'))" if bakasun else "speechSynthesis.dispatchEvent(new Event('voiceschanged'))");p.wait_for_timeout(200);sample('after-target-event')
        c.close();b.close()
    r['finished']=stamp();write_json(output,r);print(json.dumps(r,indent=2))

if __name__=='__main__':main()
