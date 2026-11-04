"""Sustained offline Chromium scroll and interaction audit.
This is browser emulation, not a claim of measurement on a physical phone.
--minutes controls real elapsed work: rAF-driven scrolling and repeated interactions run throughout.
"""
from pathlib import Path
from urllib.parse import urlsplit,unquote
from datetime import datetime,timezone
import argparse,json,mimetypes,time,statistics,hashlib,io
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
ORIGIN='http://127.0.0.1:8765/'
PAGES=['index','events','event','clients','suppliers','invoices','finance','proposals','runsheet','calendar','budget','contract','settings','system']

def utc():return datetime.now(timezone.utc).isoformat()
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--minutes',type=float,default=3);ap.add_argument('--output',default='verification/performance.json');ap.add_argument('--cpu',type=int,default=4);args=ap.parse_args();target=ROOT/args.output;target.parent.mkdir(exist_ok=True,parents=True)
    runtime=[*ROOT.glob('*.html'),*ROOT.glob('assets/*.js'),*ROOT.glob('assets/*.css')];hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in runtime}
    report={'started_at':utc(),'requested_minutes':args.minutes,'cpu_throttle':args.cpu,'DPR':2,'physical_phone':False,'network':'offline; local bytes fulfilled in memory','runtime_sha256':hashes,'runner_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'samples':[],'errors':[],'external_requests':[],'memory_checkpoints':[],'runtime_changed':False}
    start=time.monotonic();deadline=start+args.minutes*60
    def save():
        elapsed=time.monotonic()-start;fps=[x['fps'] for x in report['samples']];report['updated_at']=utc();report['elapsed_seconds']=round(elapsed,2);report['summary']={'samples':len(fps),'minimum_average_fps':round(min(fps),2) if fps else None,'median_average_fps':round(statistics.median(fps),2) if fps else None,'below_30fps':sum(x<30 for x in fps),'console_errors':len(report['errors']),'external_requests':len(report['external_requests'])};target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        ctx=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True);ctx.set_offline(True)
        def fulfill(route):
            path=(ROOT/unquote(urlsplit(route.request.url).path).lstrip('/')).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():report['errors'].append('Missing '+str(path));route.abort();return
            route.fulfill(status=200,content_type=mimetypes.guess_type(path.name)[0] or 'application/octet-stream',body=path.read_bytes())
        ctx.route(ORIGIN+'**',fulfill);ctx.on('request',lambda r:report['external_requests'].append(r.url) if not r.url.startswith((ORIGIN,'data:','blob:')) else None)
        page=ctx.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)));cdp=ctx.new_cdp_session(page);cdp.send('Emulation.setCPUThrottlingRate',{'rate':args.cpu});cdp.send('Performance.enable')
        i=0
        while time.monotonic()<deadline:
            if any(hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=digest for name,digest in hashes.items()):report['runtime_changed']=True;report['errors'].append('Runtime changed during sustained audit; run a fresh audit after final changes.');break
            name=PAGES[i%len(PAGES)];orientation=(i//len(PAGES))%2;theme='dark' if (i//(len(PAGES)*2))%2 else 'light';w,h=(844,390) if orientation else (390,844)
            page.set_viewport_size({'width':w,'height':h});page.goto(ORIGIN+name+'.html?theme='+theme);page.evaluate('document.fonts.ready');page.emulate_media(reduced_motion='reduce')
            dom_before=page.evaluate('document.getElementsByTagName("*").length');interaction_errors=[];actions=0
            try:
                if name=='event':
                    for tab in ['budget','suppliers','contract','files','history','details']:
                        if w==390:page.locator('[data-tab-select]').select_option(tab)
                        else:page.locator('[data-tab="'+tab+'"]').click()
                        actions+=1
                if name in ['events','clients','suppliers','invoices','proposals']:
                    for value in ['דמה','לאקיים','']:
                        page.locator('[data-search]').fill(value);actions+=1
                    filters=page.locator('[data-filter]');filters.last.click();filters.first.click();actions+=2
                if name=='index':
                    b=page.locator('[data-check]').first
                    for _ in range(6):b.click();actions+=1
                # Repeated modal mount/close catches retained DOM and broken focus return.
                modal=page.locator('[data-detail]:visible')
                if modal.count():
                    for _ in range(6):modal.first.click();page.keyboard.press('Escape');actions+=2
                elif page.locator('[data-menu]').count():
                    for _ in range(3):page.locator('[data-menu]').first.click();page.keyboard.press('Escape');actions+=2
            except Exception as e:interaction_errors.append(str(e));report['errors'].append(name+': '+str(e))
            sample=page.evaluate('''async()=>{const frames=[],start=performance.now();let last=start;const max=Math.max(0,document.documentElement.scrollHeight-innerHeight);const duration=5000;return await new Promise(resolve=>{function frame(now){if(now-last>0)frames.push(now-last);last=now;const phase=(now-start)/duration;window.scrollTo(0,max*(.5-.5*Math.cos(phase*4*Math.PI)));if(now-start<duration){requestAnimationFrame(frame);return}frames.sort((a,b)=>a-b);resolve({elapsed:now-start,frames:frames.length,fps:frames.length*1000/(now-start),p50_ms:frames[Math.floor(frames.length*.5)],p95_ms:frames[Math.floor(frames.length*.95)],p99_ms:frames[Math.floor(frames.length*.99)],max_ms:frames[frames.length-1],scrollHeight:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth>innerWidth})}requestAnimationFrame(frame)})}''')
            cdp.send('HeapProfiler.collectGarbage');heap=cdp.send('Runtime.getHeapUsage');dom=cdp.send('Memory.getDOMCounters');sample.update(page=name,viewport=f'{w}x{h}',theme=theme,sample=i+1,dom_before=dom_before,dom_after=page.evaluate('document.getElementsByTagName("*").length'),heap_used_bytes=heap['usedSize'],browser_documents=dom['documents'],browser_nodes=dom['nodes'],interaction_errors=interaction_errors,interaction_actions=actions,at=utc());report['samples'].append(sample)
            if (i+1)%14==0:report['memory_checkpoints'].append({'at':utc(),'samples':i+1,'heap_used_bytes':heap['usedSize'],**dom})
            if (i+1)%42==0:
                directory=target.parent/'endurance-shots';directory.mkdir(exist_ok=True);Image.open(io.BytesIO(page.screenshot())).convert('RGB').save(directory/f'checkpoint-{i+1:04}.webp','WEBP',lossless=True,method=6)
            if (i+1)%7==0:save();print(json.dumps({'elapsed_minutes':round((time.monotonic()-start)/60,2),'last_page':name,**report['summary']}),flush=True)
            i+=1
        browser.close()
    report['finished_at']=utc();save();print('FINISHED '+json.dumps(report['summary']),flush=True)
if __name__=='__main__':main()
