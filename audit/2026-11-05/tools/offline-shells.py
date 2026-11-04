"""Standalone warm-then-offline capability matrix, bypassing HTTP cache only."""
from playwright.sync_api import sync_playwright
from common import *

def main():
    r={'started':stamp(),'conditions':'fresh context per application; browser HTTP cache disabled; Service Worker Cache API remains enabled; root SW manually registered on trusted localhost because product registration is HTTPS-only','apps':[]}
    with server() as base,sync_playwright() as pw:
        b=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        for app,route in [('bakasun','index.html#/today'),('workout','workout/index.html'),('island','workout/island/index.html?dev=1'),('north','north/index.html')]:
            c=b.new_context(viewport={'width':390,'height':844},service_workers='allow');block_external(c,base,[])
            c.add_init_script("Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true})")
            p=c.new_page();p.goto(base+route,wait_until='load');p.wait_for_timeout(4000)
            if app=='bakasun':p.evaluate("async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready}")
            if app in ['bakasun','island']:p.wait_for_function('()=>!!navigator.serviceWorker.controller',timeout=60000)
            before=p.evaluate("async()=>({controller:navigator.serviceWorker.controller?.scriptURL.split('/').slice(-1)[0]||null,caches:await caches.keys()})")
            cdp=c.new_cdp_session(p);cdp.send('Network.enable');cdp.send('Network.setCacheDisabled',{'cacheDisabled':True});c.set_offline(True)
            row={'app':app,'before':before}
            try:
                p.reload(wait_until='load',timeout=45000);p.wait_for_timeout(2000)
                row['loadedOffline']=p.evaluate("() => {const e=document.querySelector('#app,#interface,#view');return !!e&&e.innerText.length>20&&!e.classList.contains('load-error')}")
            except Exception as e:row['loadedOffline']=False;row['navigationError']=str(e).split('\n')[0]
            r['apps'].append(row);write_json(OUT/'iterations/05/offline-shells.json',r);print(json.dumps(row,ensure_ascii=False),flush=True);c.close()
        b.close()
    r['finished']=stamp();write_json(OUT/'iterations/05/offline-shells.json',r)

if __name__=='__main__':main()
