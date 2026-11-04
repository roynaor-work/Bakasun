"""Capture the delivered viewer at exact CSS pixel sizes; inspect live behavior.

The software renderer is deliberately identified. These timings do not certify a
physical mid-range phone. Uses only localhost and the repository's local assets.
"""
import json, statistics, time
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageStat

ROOT=Path(__file__).resolve().parents[1]
URL='http://127.0.0.1:8765/workout/island/design/soccer-v6/stadium/preview.html'
OUT=ROOT/'previews'
report={'pass':True,'browserErrors':[],'failedRequests':[],'httpErrors':[],
        'captures':[],'layouts':[],'behavior':{},'performance':[],
        'phone30fps':'Physical mid-range phone not available; target remains unverified.'}

def pixel_difference(a,b):
    diff=ImageChops.difference(Image.open(a).convert('RGB'),Image.open(b).convert('RGB'))
    return sum(ImageStat.Stat(diff).mean)/3

def snap(page,name):
    page.wait_for_timeout(240)
    page.screenshot(path=str(OUT/name),full_page=True)
    p=OUT/name
    report['captures'].append({'path':'previews/'+name,'size':list(Image.open(p).size),'bytes':p.stat().st_size})

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader'])
    context=browser.new_context(viewport={'width':844,'height':390},device_scale_factor=1)
    page=context.new_page()
    page.on('pageerror',lambda e:report['browserErrors'].append(str(e)))
    page.on('console',lambda m:report['browserErrors'].append(m.text) if m.type=='error' else None)
    page.on('requestfailed',lambda r:report['failedRequests'].append({'url':r.url,'failure':r.failure}))
    page.on('response',lambda r:report['httpErrors'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
    page.goto(URL+'?capture=1');page.evaluate('async()=>await stadiumV6.ready');page.evaluate('document.fonts.ready')
    for w,h in [(390,844),(844,390)]:
        page.set_viewport_size({'width':w,'height':h})
        for mode in ['evening','day']:
            page.evaluate('(m)=>{stadiumV6.setMode(m);stadiumV6.setView("broadcast",true);stadiumV6.sample(12)}',mode)
            snap(page,f'{mode}-{w}x{h}.png')
            layout=page.evaluate('''()=>({viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],buttons:[...document.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {text:b.textContent.trim(),x:r.x,y:r.y,w:r.width,h:r.height,visible:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}})})''')
            layout['mode']=mode;layout['snapshot']=page.evaluate('stadiumV6.snapshot()');layout['snapshot'].pop('frameTimes')
            report['layouts'].append(layout)
            report['pass'] &= layout['scroll']==[w,h] and all(b['visible'] for b in layout['buttons'])
        report['behavior'][f'lightingPixelDifference-{w}x{h}']=pixel_difference(OUT/f'evening-{w}x{h}.png',OUT/f'day-{w}x{h}.png')
    page.evaluate('stadiumV6.setMode("evening")')
    for view in ['goal','turf','stands']:
        page.evaluate('(v)=>stadiumV6.setView(v,true)',view);snap(page,f'{view}-844x390.png')
    # Actual GPU animation at two sampled times, fixed camera and UI.
    page.evaluate('stadiumV6.sample(12)');snap(page,'crowd-phase-a-844x390.png')
    page.evaluate('stadiumV6.sample(12.48)');snap(page,'crowd-phase-b-844x390.png')
    report['behavior']['crowdJumpPixelDifference']=pixel_difference(OUT/'crowd-phase-a-844x390.png',OUT/'crowd-phase-b-844x390.png')
    page.evaluate('stadiumV6.setView("turf",true);stadiumV6.sample(12);stadiumV6.setWet(true);stadiumV6.burst();stadiumV6.sample(12.35)')
    snap(page,'wet-turf-844x390.png')
    report['behavior']['wetSnapshot']=page.evaluate('stadiumV6.snapshot()');report['behavior']['wetSnapshot'].pop('frameTimes')
    page.set_viewport_size({'width':390,'height':844});snap(page,'wet-turf-390x844.png')
    # High-resolution full-frame review of the physical net and materials.
    page.set_viewport_size({'width':1600,'height':900});page.evaluate('stadiumV6.setView("turf",true)');snap(page,'wet-turf-1600x900.png')
    page.evaluate('stadiumV6.setWet(false);stadiumV6.setView("goal",true)');snap(page,'goal-1600x900.png')
    page.evaluate('stadiumV6.setView("broadcast",true)');snap(page,'evening-1600x900.png')
    # Button paths (including toggles), camera drag, orientation and pause.
    page.set_viewport_size({'width':844,'height':390})
    page.click('[data-mode=day]');assert page.evaluate('stadiumV6.snapshot().mode')=='day'
    page.click('[data-mode=evening]');page.click('#wet');assert page.evaluate('stadiumV6.snapshot().wet')
    page.click('#wet');page.click('#burst');page.click('[data-view=goal]');page.wait_for_timeout(400)
    assert page.evaluate('stadiumV6.snapshot().view')=='goal'
    page.click('#pause');assert page.evaluate('stadiumV6.snapshot().paused')
    page.click('#pause');assert not page.evaluate('stadiumV6.snapshot().paused')
    before=page.evaluate('stadiumV6.snapshot().camera')
    page.mouse.move(400,185);page.mouse.down();page.mouse.move(445,175,steps=5);page.mouse.up();page.wait_for_timeout(700)
    after=page.evaluate('stadiumV6.snapshot().camera');assert before!=after
    report['behavior']['controls']='day/evening, four cameras, wet/dry, dust/water burst, pause/play, drag, orientation passed'
    report['behavior']['cameraDrag']={'before':before,'after':after}
    # Separate live page: no capture mode, DPR 2 clamped to 1.5 by the viewer.
    context.close()
    for w,h in [(390,844),(844,390)]:
        c=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=2)
        live=c.new_page();live.on('pageerror',lambda e:report['browserErrors'].append(str(e)))
        live.on('console',lambda m:report['browserErrors'].append(m.text) if m.type=='error' else None)
        live.goto(URL);live.evaluate('async()=>await stadiumV6.ready');live.wait_for_timeout(2200)
        for mode in ['evening','day']:
            live.evaluate('(m)=>stadiumV6.setMode(m)',mode);live.wait_for_timeout(600)
            live.evaluate('stadiumV6.resetFrameStats()');live.wait_for_function('stadiumV6.snapshot().frameTimes.length>=12',timeout=60000)
            data=live.evaluate('stadiumV6.snapshot()');intervals=data.pop('frameTimes')[-90:]
            if intervals:
                data['renderedFramesSampled']=len(intervals);data['medianFrameMs']=round(statistics.median(intervals),3)
                data['p95FrameMs']=round(sorted(intervals)[int((len(intervals)-1)*.95)],3)
                data['medianFPS']=round(1000/statistics.median(intervals),2)
            report['performance'].append(data)
            assert data['players']==12 and data['crowd']==6530 and data['pixelRatio']==1.5 and data['threeRevision']=='160'
        # Live pause genuinely freezes animation time.
        live.evaluate('stadiumV6.setPaused(true)');t=live.evaluate('stadiumV6.snapshot().time');live.wait_for_timeout(220)
        assert live.evaluate('stadiumV6.snapshot().time')==t
        c.close()
    c=browser.new_context(reduced_motion='reduce');p=c.new_page();p.goto(URL);p.evaluate('async()=>await stadiumV6.ready')
    report['behavior']['reducedMotionPaused']=p.evaluate('stadiumV6.snapshot().paused');assert report['behavior']['reducedMotionPaused'];c.close()
    browser.close()

report['pass'] &= not report['browserErrors'] and not report['failedRequests'] and not report['httpErrors']
report['pass'] &= report['behavior']['crowdJumpPixelDifference']>.01
report['pass'] &= all(v>1 for k,v in report['behavior'].items() if k.startswith('lightingPixelDifference'))
(ROOT/'verification/browser.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'pass':report['pass'],'captures':len(report['captures']),'errors':report['browserErrors'],'performance':[{k:d[k] for k in ['viewport','mode','calls','triangles','medianFPS','p95FrameMs']}for d in report['performance']]},indent=2))
if not report['pass']:raise SystemExit(1)
