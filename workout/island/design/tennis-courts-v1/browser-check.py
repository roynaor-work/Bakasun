#!/usr/bin/env python3
"""Real browser matrix. Start a repository HTTP server before running this script."""
from pathlib import Path
import json
import sys
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent
URL=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765').rstrip('/')+'/workout/island/design/tennis-courts-v1/preview.html'
OUT=ROOT/'verification';OUT.mkdir(exist_ok=True)
results=[]; errors=[];external=[];failures=[];shots=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
        args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page(viewport={'width':844,'height':390},device_scale_factor=1)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:external.append(r.url) if not r.url.startswith(URL.split('/workout/')[0]) and not r.url.startswith('data:') else None)
    page.on('response',lambda r:failures.append({'url':r.url,'status':r.status}) if r.status>=400 else None)
    page.goto(URL)
    page.wait_for_function('() => window.courtsPreview?.state.ready')
    page.evaluate('() => {courtsPreview.state.paused=true}')
    # All actual UI selections, including both geometry levels, not just factory calls.
    for surface in ['clay','grass','hard']:
        page.locator(f'[data-surface={surface}]').click()
        page.wait_for_function('(s) => courtsPreview.state.ready && courtsPreview.state.surface===s',arg=surface)
        for time in ['day','sunset','night']:
            for lod in ['high','low']:
                page.select_option('#time',time)
                page.wait_for_function('(t) => courtsPreview.state.ready && courtsPreview.state.time===t',arg=time)
                page.select_option('#lod',lod)
                page.wait_for_function('(l) => courtsPreview.state.ready && courtsPreview.state.lod===l',arg=lod)
                page.evaluate('() => {courtsPreview.render(10);courtsPreview.impact();courtsPreview.render(10.12)}')
                data=page.evaluate('() => courtsPreview.metrics()')
                assert data['ready'] and data['seats']==600 and not data['errors'],data
                assert data['drawCalls']<=70,data
                assert data['triangles']<=18000,data
                assert data['viewport']==[844,390],data
                results.append(data)
                if lod=='high':
                    path=Path('/tmp')/f'tennis-courts-{surface}-{time}.png';page.screenshot(path=str(path));shots.append((surface,time,path))
                    if time=={'clay':'day','grass':'sunset','hard':'night'}[surface]:
                        Image.open(path).convert('RGB').save(OUT/f'{surface}-{time}-844x390.webp',quality=86,method=6)
    # Camera selectors, keyboard interaction and a paused impact remain usable.
    for view in ['game','court','side']:
        page.select_option('#camera',view)
        assert page.evaluate('() => courtsPreview.state.camera')==view
        page.evaluate('() => courtsPreview.render(11.1)')
    page.locator('[data-surface=clay]').focus();page.keyboard.press('Enter')
    page.wait_for_function('() => courtsPreview.state.ready && courtsPreview.state.surface==="clay"')
    page.locator('#impact').click()
    # Verify the original crowd adapter actually loads all 600 matching seat transforms.
    page.check('#crowd')
    page.wait_for_function('() => document.querySelector("#status").textContent.includes("CC0")')
    page.evaluate('() => courtsPreview.render(12.1)')
    crowd=page.evaluate('() => courtsPreview.metrics()')
    assert crowd['crowd'] and crowd['triangles']>=126000,crowd
    page.select_option('#camera','side');page.evaluate('() => courtsPreview.render(12.1)')
    page.screenshot(path='/tmp/tennis-courts-crowd.png')
    Image.open('/tmp/tennis-courts-crowd.png').convert('RGB').save(OUT/'crowd-compatible.webp',quality=86,method=6)
    page.uncheck('#crowd')
    # Rebuild/dispose repeatedly; GPU allocations must settle to the same count.
    stable=[]
    for _ in range(4):
        for surface in ['clay','grass','hard']:
            page.evaluate('(surface) => courtsPreview.select({surface,time:"day",lod:"high"})',surface)
        page.evaluate('() => courtsPreview.render(15.1)');stable.append(page.evaluate('() => courtsPreview.metrics()'))
    assert len({(m['geometries'],m['textures']) for m in stable})==1,stable
    # Match every coordinate of the original crowd placement contract.
    seats=page.evaluate('() => courtsPreview.seats()')
    expected=[]
    import math
    placements=[{'x':s*10.4,'z':z,'yaw':-s*math.pi/2} for s in [-1,1] for z in [-10,0,10]]+[
        {'x':x,'z':s*19.5,'yaw':math.pi if s<0 else 0} for s in [-1,1] for x in [-5,5]]
    for pos in placements:
        for row in range(5):
            for col in range(12):
                x=-4.5+col*.7 if col<6 else .95+(col-6)*.7;z=.48+row*.88-.06;yaw=pos['yaw']
                fit=math.copysign(abs(pos['z'])-2.885,pos['z']) if abs(pos['z'])>=5 else pos['z']
                expected.append([pos['x']+math.cos(yaw)*x+math.sin(yaw)*z,.28+row*.42-.025,fit-math.sin(yaw)*x+math.cos(yaw)*z,yaw+math.pi])
    for seat,ref in zip(seats,expected,strict=True):
        assert all(abs(seat[k]-v)<1e-8 for k,v in zip(['x','y','z','yaw'],ref))
    # Portrait and reduced motion: no overflow, legible controls, no automatic clock advance.
    page.set_viewport_size({'width':390,'height':844})
    page.select_option('#camera','game');page.evaluate('() => courtsPreview.render(15.1)')
    assert page.evaluate('() => document.documentElement.scrollWidth<=innerWidth')
    for selector in ['#time','#camera','#lod','#pause','#impact','[data-surface=clay]']:
        rect=page.locator(selector).bounding_box();assert rect['height']>=44 and rect['x']>=0 and rect['x']+rect['width']<=390,rect
    page.screenshot(path='/tmp/tennis-courts-portrait.png')
    Image.open('/tmp/tennis-courts-portrait.png').convert('RGB').save(OUT/'portrait-390x844.webp',quality=84,method=6)
    reduced=browser.new_page(viewport={'width':844,'height':390},reduced_motion='reduce')
    reduced.goto(URL);reduced.wait_for_function('() => window.courtsPreview?.state.ready')
    assert reduced.evaluate('() => courtsPreview.state.paused')
    reduced.close()
    # Partial texture failure must show the readable error state, without a ready claim.
    broken=browser.new_page(viewport={'width':844,'height':390})
    broken.route('**/runtime/textures/clay/court.png',lambda route:route.abort())
    broken.goto(URL);broken.locator('#error').wait_for(state='visible')
    assert not broken.evaluate('() => courtsPreview.state.ready');broken.close()
    assert not errors and not failures and not external,dict(errors=errors,failures=failures,external=external)
    version=browser.version;browser.close()

sheet=Image.new('RGB',(1266,645),'#142f37');draw=ImageDraw.Draw(sheet)
for i,(surface,time,path) in enumerate(shots):
    x=(i%3)*422;y=(i//3)*215
    shot=Image.open(path).convert('RGB').resize((422,195),Image.Resampling.LANCZOS)
    sheet.paste(shot,(x,y));draw.text((x+10,y+199),f'{surface.upper()} / {time.upper()}',fill='#eadfb9')
sheet.save(ROOT/'preview.webp',quality=86,method=6)
result={'passed':True,'browser':version,'renderer':'ANGLE/SwiftShader, software rendering; no physical-device performance claim',
    'viewport':[844,390],'matrix':results,'crowd':crowd,'stableResources':stable,'matchedCrowdSeats':len(seats),
    'portrait':[390,844],'reducedMotion':True,'readableLoadFailure':True,'consoleErrors':errors,'failedResponses':failures,'externalRequests':external}
(OUT/'browser.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'passed':True,'combinations':len(results),'crowdSeats':len(seats),'maxCalls':max(r['drawCalls'] for r in results),'maxTriangles':max(r['triangles'] for r in results),'browser':version}))
