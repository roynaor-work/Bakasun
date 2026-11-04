"""Two-hour local stability run, fresh data, no external services.
Usage: python tools/soak.py [seconds=7200] [segmentSeconds=600].
Navigation stays in one context for each segment; three cycles over four apps.
Heap is measured after an explicit CDP garbage collection, never a phone benchmark.
"""
import sys, time
from playwright.sync_api import sync_playwright
from common import *

def main():
    duration=int(sys.argv[1]) if len(sys.argv)>1 else 7200
    segment=int(sys.argv[2]) if len(sys.argv)>2 else 600
    report={'started':stamp(),'requestedSeconds':duration,'segmentSeconds':segment,'externalNetwork':'blocked','samples':[],'segments':[],'finished':None}
    output=OUT/'evidence/soak.json'
    start=time.monotonic()
    apps=['bakasun','workout','north','island']
    routes={'bakasun':['index.html#/today','index.html#/calls','index.html#/tasks','index.html#/calendar','index.html#/search'],
      'workout':['workout/index.html#/home','workout/index.html#/exercises','workout/index.html#/history','workout/index.html#/settings'],
      'north':['north/index.html','north/index.html#/#catalog','north/index.html#/#build'],
      'island':['workout/island/index.html?dev=1']}
    with server() as base,sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        report['chromium']=browser.version;idx=0
        while time.monotonic()-start<duration:
            app=apps[idx%4];blocked=[];errors=[]
            ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1,locale='he-IL',timezone_id='Asia/Jerusalem',service_workers='block')
            block_external(ctx,base,blocked)
            ctx.add_init_script("localStorage.setItem('north.adult','1');Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true});")
            page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(base+routes[app][0],wait_until='load',timeout=90000)
            if app=='island':
                page.wait_for_function('() => !!window.__island',timeout=90000)
                if page.locator('[data-action=avatar-start]').count():page.locator('[data-action=avatar-start]').click()
                page.evaluate('window.__island.engine.skipTutorial()')
            cdp=ctx.new_cdp_session(page);cdp.send('Performance.enable')
            segment_start=time.monotonic();step=0
            report['segments'].append({'index':idx,'app':app,'started':stamp(),'size':[390,844]})
            while time.monotonic()-segment_start<segment and time.monotonic()-start<duration:
                row={'at':stamp(),'elapsedSeconds':round(time.monotonic()-start,2),'segment':idx,'app':app,'step':step}
                try:
                    if app!='island':
                        target=base+routes[app][step%len(routes[app])]
                        if page.url!=target:page.evaluate('(u)=>location.href=u',target)
                        page.wait_for_timeout(500)
                    else:
                        # Exercise zoom and canvas input without changing a real save.
                        page.mouse.move(180,250);page.mouse.wheel(0,40 if step%2 else -40)
                    cdp.send('HeapProfiler.collectGarbage')
                    metrics={m['name']:m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
                    row['metrics']={k:metrics.get(k) for k in ['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','JSEventListeners','TaskDuration','LayoutCount','RecalcStyleCount']}
                    row['dom']=page.evaluate("() => ({elements:document.getElementsByTagName('*').length,canvas:document.querySelectorAll('canvas').length,bodyEmpty:!document.body.innerText.trim(),storedKeys:localStorage.length})")
                    row['newErrors']=errors[:];errors.clear();row['externalBlockedCount']=len(blocked)
                except Exception as e:row['harnessError']=str(e)
                report['samples'].append(row);write_json(output,report)
                print(json.dumps({k:row.get(k) for k in ['at','elapsedSeconds','app','step','newErrors','harnessError']}),flush=True)
                step+=1
                # Tool invocation yields immediately; the worker remains active.
                page.wait_for_timeout(min(10000,max(0,int((duration-(time.monotonic()-start))*1000))))
            report['segments'][-1]['finished']=stamp();ctx.close();idx+=1
        browser.close()
    report['finished']=stamp();report['elapsedSeconds']=round(time.monotonic()-start,2);write_json(output,report)

if __name__=='__main__':main()
