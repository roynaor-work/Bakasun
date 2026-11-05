"""Sustained offline mobile workload, reloads when the delivered HTML changes.

Every epoch records the exact offline SHA. Bounded journal, fixed asset cache,
scene/light/LOD/orientation switches and repeated impacts exercise resource reuse.
This is a software browser observation, never a claim about a physical handset.
"""
import argparse,hashlib,json,time
from pathlib import Path
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--seconds',type=int,default=8400);parser.add_argument('--output',default='soak');args=parser.parse_args()
DEST=ROOT/'verification'/Path(args.output).name;DEST.mkdir(exist_ok=True)
start=time.monotonic();errors=[];external=[];rows=[];epochs=[]
def utc():return datetime.now(timezone.utc).isoformat()
def wait_ready(page):
    deadline=time.monotonic()+90
    while time.monotonic()<deadline:
        status=page.evaluate('() => ({ready:window.defense?.state.ready,errors:window.defense?.state.errors})')
        if status.get('ready'):return
        if status.get('errors'):raise RuntimeError(status['errors'])
        page.wait_for_timeout(100)
    raise TimeoutError('Offline viewer did not become ready')
report={'startedUTC':utc(),'requestedSeconds':args.seconds,'renderer':'Chromium ANGLE SwiftShader; emulated mobile DPR 3, renderer caps DPR 1.5','epochs':epochs,'samples':rows,'errors':errors,'externalRequests':external}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True,offline=True)
    page=context.new_page();page.on('pageerror',lambda e:errors.append({'at':utc(),'message':str(e)}))
    page.on('request',lambda r:external.append(r.url) if r.url.startswith(('http:','https:')) else None)
    cdp=context.new_cdp_session(page);cdp.send('Performance.enable')
    current_sha=None;step=0
    while time.monotonic()-start<args.seconds:
        if Path('/tmp/defense-v7-profile.lock').exists():
            page.evaluate('window.defense?.configure({playing:false})');page.wait_for_timeout(500);continue
        sha=hashlib.sha256((ROOT/'offline.html').read_bytes()).hexdigest()
        if sha!=current_sha:
            page.goto('about:blank');page.set_content((ROOT/'offline.html').read_text(),wait_until='load',timeout=90000);wait_ready(page)
            current_sha=sha;epochs.append({'atUTC':utc(),'offlineSHA256':sha,'elapsedSeconds':round(time.monotonic()-start,1)})
            page.evaluate('window.defense.configure({playing:false})')
            for asset in page.evaluate('window.defense.catalog.map(a=>a.id)'):
                page.evaluate('async(id)=>{await window.defense.inspect(id);window.defense.renderFrame();}',asset)
            for quality in ['high','low','auto']:
                page.evaluate('(q)=>{window.defense.configure({scene:"farm",selected:null,quality:q,night:true});window.defense.renderFrame();}',quality)
            page.evaluate('window.defense.configure({selected:null,playing:true,quality:"auto"})')
        scene='farm' if step%2 else 'space';close=bool(step%3);night=bool(step%4>=2)
        width,height=(844,390) if step%5<2 else (390,844)
        page.set_viewport_size({'width':width,'height':height})
        page.evaluate('(o)=>window.defense.configure(o)',{'scene':scene,'selected':None,'close':close,'night':night,'playing':True,'quality':'auto','yaw':(step%7-3)*.08,'zoom':1})
        page.evaluate('window.defense.effect()')
        page.wait_for_timeout(1800)
        if step%17==0:
            asset=page.evaluate('(i)=>window.defense.catalog[i%window.defense.catalog.length].id',step//17)
            page.evaluate('(id)=>window.defense.inspect(id)',asset);page.wait_for_timeout(450)
        if step%15==0:
            if step%150==0:cdp.send('HeapProfiler.collectGarbage')
            metrics={m['name']:m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
            snap=page.evaluate('window.defense.snapshot()');samples=snap.pop('samples',[]);ordered=sorted(samples)
            row={'atUTC':utc(),'elapsedSeconds':round(time.monotonic()-start,1),'step':step,'epoch':len(epochs),'viewport':[width,height],**snap,'p50ms':ordered[len(ordered)//2] if ordered else None,'p95ms':ordered[min(len(ordered)-1,int(len(ordered)*.95))] if ordered else None,'jsHeapBytes':metrics.get('JSHeapUsedSize'),'domNodes':metrics.get('Nodes')}
            rows.append(row)
            (DEST/'progress.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
            print(json.dumps({k:row[k] for k in ['elapsedSeconds','step','epoch','triangles','calls','geometries','textures','p50ms','p95ms','jsHeapBytes']},ensure_ascii=False),flush=True)
        if step%300==0:page.screenshot(path=str(DEST/f'checkpoint-{step:05d}.png'))
        step+=1
    final_epoch=[r for r in rows if r['epoch']==len(epochs)]
    stable=final_epoch[len(final_epoch)//2:]
    geometry_range=max((r['geometries'] for r in stable),default=0)-min((r['geometries'] for r in stable),default=0)
    texture_range=max((r['textures'] for r in stable),default=0)-min((r['textures'] for r in stable),default=0)
    stability={'finalEpochSamples':len(final_epoch),'stableHalfSamples':len(stable),'geometryRange':geometry_range,'textureRange':texture_range,'limits':{'geometryRange':2,'textureRange':2}}
    report.update({'finishedUTC':utc(),'actualSeconds':round(time.monotonic()-start,2),'steps':step,'stability':stability,'pass':not errors and not external and geometry_range<=2 and texture_range<=2})
    (DEST/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));context.close();browser.close()
print(json.dumps({'finished':True,'seconds':report['actualSeconds'],'epochs':len(epochs),'samples':len(rows),'pass':report['pass']}),flush=True)
