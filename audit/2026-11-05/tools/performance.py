"""Cold local HTTP/1 startup samples; measurements are not production RUM."""
import sys,time,statistics
from playwright.sync_api import sync_playwright
from common import *

def main():
    folder=OUT/'iterations/04';folder.mkdir(parents=True,exist_ok=True)
    r={'started':stamp(),'conditions':{'server':'local HTTP/1, no compression, Cache-Control:no-cache','externalNetwork':'blocked, including webfonts','serviceWorkers':'blocked for cold-start isolation','viewport':[390,844],'deviceScaleFactor':2,'mobile':{'cpuThrottle':4,'latencyMs':150,'downloadBytesPerSecond':200000,'uploadBytesPerSecond':93750},'warning':'Shared cloud CPU, SwiftShader software rendering; not a physical phone or live-host LCP benchmark. Local uncompressed transfer overestimates compressed hosting.'},'samples':[]}
    only=sys.argv[sys.argv.index('--only')+1] if '--only' in sys.argv else None
    if only:
        r=json.loads((folder/'startup-performance.json').read_text());r['samples']=[x for x in r['samples'] if x['app']!=only]
        r['supplementStarted']=stamp();r.pop('finished',None)
    paths=[('bakasun','index.html#/today'),('workout','workout/index.html#/home'),('island','workout/island/index.html?dev=1'),('north','north/index.html')]
    with server() as base,sync_playwright() as pw:
        b=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        r['chromium']=b.version
        for profile,repeats in [('local',1),('mobile',3)]:
            for app,path in paths:
                if only and app!=only:continue
                for repeat in range(repeats):
                    blocked=[];errors=[]
                    c=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,locale='he-IL',timezone_id='Asia/Jerusalem',service_workers='block')
                    block_external(c,base,blocked);c.add_init_script(OBSERVERS)
                    # No background asset download while measuring a cold shell.
                    c.add_init_script("Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true})")
                    p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));cdp=c.new_cdp_session(p)
                    cdp.send('Network.enable');cdp.send('Network.setCacheDisabled',{'cacheDisabled':True})
                    if profile=='mobile':
                        cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
                        cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':150,'downloadThroughput':200000,'uploadThroughput':93750,'connectionType':'cellular4g'})
                    start=time.monotonic();row={'app':app,'path':path,'profile':profile,'repeat':repeat+1,'at':stamp()}
                    try:
                        p.goto(base+path,wait_until='load',timeout=180000);p.bring_to_front()
                        if app=='island':
                            p.wait_for_function('() => !!window.__island?.view?.metrics().avatarLoaded',timeout=180000)
                            row['readyMs']=round((time.monotonic()-start)*1000)
                        p.evaluate('() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
                        p.wait_for_timeout(2000)
                        s=snapshot(p);row['snapshot']=s;row['wallMs']=round((time.monotonic()-start)*1000)
                        row['lcpMs']=(s.get('observations',{}).get('lcp') or {}).get('ms')
                        row['resourceCount']=len(s['resources']);row['transferBytes']=sum(x['bytes'] for x in s['resources']);row['decodedBytes']=sum(x['decoded'] for x in s['resources'])
                        row['longTasks']=len(s['observations']['longTasks']);row['longTaskMs']=sum(x['duration'] for x in s['observations']['longTasks'])
                    except Exception as e:row['harnessError']=str(e)
                    row['externalBlocked']=blocked;row['pageErrors']=errors;r['samples'].append(row)
                    write_json(folder/'startup-performance.json',r)
                    print(json.dumps({k:row.get(k) for k in ['app','profile','repeat','lcpMs','resourceCount','transferBytes','longTaskMs','harnessError']}),flush=True);c.close()
        b.close()
    r['finished']=stamp();r['summary']={}
    for app,_ in paths:
        rows=[x for x in r['samples'] if x['app']==app and x['profile']=='mobile' and x.get('lcpMs') is not None]
        r['summary'][app]={'validLcpSamples':len(rows),'medianLcpMs':statistics.median(x['lcpMs'] for x in rows) if rows else None,'lcpRangeMs':[min(x['lcpMs'] for x in rows),max(x['lcpMs'] for x in rows)] if rows else None,'maxTransferBytes':max((x['transferBytes'] for x in rows),default=None)}
    write_json(folder/'startup-performance.json',r)

if __name__=='__main__':main()
