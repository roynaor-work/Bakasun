"""Render an honest iteration at both requested viewports and both distances.

Run: python3 source/capture.py --iteration 01. Existing iteration evidence is
never overwritten. Browser errors, requests and exact source hashes are saved.
"""
import argparse, hashlib, json, time
from pathlib import Path
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--iteration',required=True)
parser.add_argument('--port',type=int,default=8765)
parser.add_argument('--night',action='store_true')
parser.add_argument('--assets',action='store_true')
parser.add_argument('--all-views',action='store_true')
parser.add_argument('--profiles',action='store_true')
args=parser.parse_args()
destination=ROOT/'iterations'/args.iteration
destination.mkdir(parents=True,exist_ok=True)
if (destination/'render.json').exists(): raise SystemExit('Iteration already captured; use the next number.')
hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in ROOT.rglob('*') if p.is_file() and any(str(p.relative_to(ROOT)).startswith(s) for s in ['source/','models/','textures/','app.mjs','effects.mjs','theme.css','preview.html','catalog.mjs','farm-layout.json'])}
report={'iteration':args.iteration,'startedUTC':datetime.now(timezone.utc).isoformat(),'renderer':'Chromium / ANGLE SwiftShader (software, not physical phone)','sourceHashes':hashes,'views':[],'errors':[],'externalRequests':[]}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
    page=context.new_page()
    page.on('pageerror',lambda e:report['errors'].append(str(e)))
    page.on('console',lambda m:report['errors'].append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:report['externalRequests'].append(r.url) if not r.url.startswith(('http://127.0.0.1:','data:','blob:')) else None)
    page.goto(f'http://127.0.0.1:{args.port}/preview.html?capture&still',wait_until='networkidle')
    page.wait_for_function('window.defense?.state.ready || window.defense?.state.errors.length',timeout=90000)
    if not page.evaluate('window.defense.state.ready'):raise RuntimeError(page.evaluate('window.defense.state.errors'))
    for width,height in [(390,844),(844,390)]:
        page.set_viewport_size({'width':width,'height':height})
        for scene in ['space','farm']:
            for close in [False,True]:
                for night in ([False,True] if args.night else [False]):
                    config={'scene':scene,'close':close,'night':night,'playing':False,'time':.42,'selected':None,'yaw':0,'pitch':0,'zoom':1}
                    page.evaluate('(o)=>window.defense.configure(o)',config)
                    page.wait_for_timeout(300)
                    snapshot=page.evaluate('window.defense.renderFrame()')
                    name=f'{scene}-{width}x{height}-{"close" if close else "far"}-{"night" if night else "day"}'
                    page.screenshot(path=str(destination/(name+'.png')))
                    rects=page.evaluate('''()=>[...document.querySelectorAll('.controls button,.scene-tabs button,.masthead button')].map(e=>({id:e.id||e.textContent,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}}))''')
                    report['views'].append({'name':name,'viewport':[width,height],**snapshot,'controls':rects})
    if args.assets:
        report['assets']=[]
        for width,height in ([(390,844),(844,390)] if args.all_views else [(844,390)]):
            page.set_viewport_size({'width':width,'height':height})
            for asset in page.evaluate('window.defense.catalog.map(a=>a.id)'):
                page.evaluate('(id)=>window.defense.inspect(id)',asset)
                for close in ([False,True] if args.all_views else [True]):
                    page.evaluate('(close)=>window.defense.configure({playing:false,time:.27,night:false,close})',close)
                    page.wait_for_timeout(120)
                    snapshot=page.evaluate('window.defense.renderFrame()')
                    name='asset-'+asset+(f'-{width}x{height}-'+('close' if close else 'far') if args.all_views else '')
                    page.screenshot(path=str(destination/(name+'.png')))
                    report['assets'].append({'name':name,'viewport':[width,height],'framing':page.evaluate('window.defense.framing()'),**snapshot})
    if args.profiles:
        report['mobileProfiles']=[]
        for width,height in [(390,844),(844,390)]:
            page.set_viewport_size({'width':width,'height':height})
            for scene in ['space','farm']:
                for profile,dpr in [('mobile',.75),('stress',.5)]:
                    page.evaluate('(o)=>{window.defense.renderer.setPixelRatio(o.dpr);window.defense.configure({scene:o.scene,selected:null,playing:false,close:true,quality:"low",shadowMode:"contact",night:true,time:.42});window.defense.setMaterialMode("matte");}',{'scene':scene,'dpr':dpr})
                    page.wait_for_timeout(200);snapshot=page.evaluate('window.defense.renderFrame()')
                    name=f'{scene}-{width}x{height}-{profile}-profile';page.screenshot(path=str(destination/(name+'.png')))
                    report['mobileProfiles'].append({'name':name,'viewport':[width,height],**snapshot})
    report['finishedUTC']=datetime.now(timezone.utc).isoformat()
    (destination/'render.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({'iteration':args.iteration,'views':len(report['views']),'errors':report['errors'],'externalRequests':report['externalRequests']},ensure_ascii=False))
    context.close();browser.close()
