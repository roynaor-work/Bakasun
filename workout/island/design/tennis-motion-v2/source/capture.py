#!/usr/bin/env python3
# SPDX-License-Identifier: CC0-1.0
"""Render eight decoded GLB frames per clip and verify the 844x390 preview.

Run from any directory: python3 source/capture.py
Uses only the bundled preview; no network assets, mocap, or synthetic screenshots.
"""
import argparse
import base64
import functools
import hashlib
import http.server
import io
import json
from pathlib import Path
import threading
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

def font(size):
    candidates = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']
    for file in candidates:
        if Path(file).exists():
            return ImageFont.truetype(file, size)
    return ImageFont.load_default()

def sample_times(clip):
    duration = clip['duration']
    count = clip.get('frameCount', round(duration * 30) + 1) - 1
    times = [round(count * i / 7) / 30 for i in range(8)]
    contact = clip.get('contactTime')
    if contact is not None:
        index = min(range(1, 7), key=lambda i: abs(times[i] - contact))
        times[index] = contact
        times.sort()
    return times

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--browser', default='/usr/bin/chromium')
    parser.add_argument('--only-preview', action='store_true')
    args=parser.parse_args()
    server=http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(REPO)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    url=origin+'/workout/island/design/tennis-motion-v2/preview.html'
    (ROOT/'sheets').mkdir(exist_ok=True)
    (ROOT/'verification').mkdir(exist_ok=True)
    errors=[]; failed=[]; external=[]; clips=[]; controls=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=args.browser,headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page=browser.new_page(viewport={'width':844,'height':390},device_scale_factor=1)
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('response',lambda response: failed.append({'url':response.url,'status':response.status}) if response.status>=400 else None)
        page.on('request',lambda request: external.append(request.url) if not request.url.startswith((origin,'data:','blob:')) else None)
        page.goto(url)
        page.wait_for_function('window.tennisMotion?.ready',timeout=90000)
        page.evaluate('tennisMotion.pause()')
        catalog=page.evaluate('tennisMotion.catalog')
        assets={catalog.get('asset','tennis-motion-v2.glb')}
        if catalog.get('referenceAsset'):
            assets.add(catalog['referenceAsset'])
        for clip in catalog['clips']:
            assets.update(v['asset'] for v in (clip.get('heightVariants') or {}).values() if isinstance(v,dict) and v.get('asset'))
        asset_hashes={asset:hashlib.sha256((ROOT/asset).read_bytes()).hexdigest() for asset in sorted(assets)}
        if not args.only_preview:
            for clip in catalog['clips']:
                page.evaluate('(id)=>{tennisMotion.setClip(id);tennisMotion.setView("three");}',clip['id'])
                samples=[]
                sheet=Image.new('RGB',(1280,824),'#f7f3e8')
                draw=ImageDraw.Draw(sheet)
                draw.text((20,15),clip['id'].upper().replace('_',' '),font=font(22),fill='#244e3d')
                draw.text((1050,20),'8 FRAMES / 30Hz',font=font(13),fill='#60765b')
                for index,t in enumerate(sample_times(clip)):
                    result=page.evaluate('(t)=>{tennisMotion.setTime(t);return {image:tennisMotion.renderAsset(320,350),snapshot:tennisMotion.snapshot()};}',t)
                    frame=Image.open(io.BytesIO(base64.b64decode(result['image'].split(',')[1]))).convert('RGB')
                    x=index%4*320; y=55+index//4*380
                    sheet.paste(frame,(x,y))
                    hit=clip.get('contactTime') is not None and abs(t-clip['contactTime'])<1e-5
                    draw.rectangle((x,y+350,x+320,y+380),fill='#e4e8d6' if hit else '#f7f3e8')
                    draw.text((x+14,y+358),f'{index+1:02d}   {t:.2f}s   F{round(t*30):03d}'+('   CONTACT' if hit else ''),font=font(12),fill='#426342')
                    samples.append({'time':t,'nativeFrame':round(t*30),'contact':hit,**result['snapshot']})
                path=ROOT/'sheets'/f"{clip['id']}.webp"
                sheet.save(path,'WEBP',quality=88,method=6)
                clips.append({'id':clip['id'],'sheet':str(path.relative_to(ROOT)),'bytes':path.stat().st_size,'samples':samples})
                print(f"Rendered {clip['id']}: 8 GLB frames",flush=True)
        page.evaluate('()=>{tennisMotion.setClip("forehand");tennisMotion.setView("three");tennisMotion.setTime(tennisMotion.catalog.clips.find(c=>c.id==="forehand").contactTime??1);}')
        page.screenshot(path=str(ROOT/'verification/preview-844x390.png'))
        for viewport in [{'width':844,'height':390},{'width':390,'height':844}]:
            page.set_viewport_size(viewport)
            page.locator('[data-id="serve_whip"]').click()
            page.locator('#time').evaluate("e=>{e.value='0.4';e.dispatchEvent(new Event('input',{bubbles:true}));}")
            scrub=page.evaluate('tennisMotion.snapshot().time')
            duration=page.evaluate('tennisMotion.catalog.clips.find(c=>c.id==="serve_whip").duration')
            page.locator('#speed').select_option('0.5')
            page.locator('[data-view="front"]').click()
            frame=page.evaluate('tennisMotion.snapshot()')
            bridge=page.evaluate('tennisMotion.playBridge()')
            page.wait_for_function('!tennisMotion.snapshot().bridging', timeout=15000)
            bridge_check=page.evaluate('!tennisMotion.snapshot().bridging')
            page.evaluate('tennisMotion.pause()')
            layout=page.evaluate('({horizontal:document.documentElement.scrollWidth<=innerWidth,vertical:document.documentElement.scrollHeight<=innerHeight,canvas:document.querySelector("canvas").getBoundingClientRect().toJSON()})')
            controls.append({'viewport':viewport,'clipSelection':frame['clip']=='serve_whip','scrub':abs(scrub-.4*duration)<1e-4,'speedSelection':page.locator('#speed').input_value()=='0.5','bridgePlayback':bridge_check,'layout':layout})
            if viewport['width']==390:
                page.screenshot(path=str(ROOT/'verification/preview-390x844.png'))
        height_clips=[c for c in catalog['clips'] if (c.get('heightVariants') or {}).get('low') and (c.get('heightVariants') or {}).get('high')]
        height_checks=[]
        for clip in height_clips:
            page.evaluate('(id)=>tennisMotion.setClip(id)',clip['id'])
            for height in ['low','high','medium']:
                page.evaluate('(value)=>tennisMotion.setHeight(value)',height)
                page.evaluate('(t)=>tennisMotion.setTime(t)',clip.get('contactTime') or 0)
                state=page.evaluate('tennisMotion.snapshot()')
                expected_height=next((v['heightMeters'] for v in clip.get('contactHeightVariants',[]) if v['height']==height),None)
                height_checks.append({'clip':clip['id'],'height':height,'head':state['head'],'heightErrorMeters':None if expected_height is None else abs(state['head'][1]-expected_height),'loaded':state['height']==height})
        browser.close()
    server.shutdown()
    expected=catalog.get('grip',{}).get('headInRightHand')
    sampled=[s for c in clips for s in c['samples']]
    max_head=max((sum((v-expected[i])**2 for i,v in enumerate(s['headInHand']))**.5 for s in sampled),default=0) if expected else None
    max_scale=max((max(abs(v-1) for v in s['racketScale']) for s in sampled),default=0)
    height_ordering=all((lambda by_height: by_height['low']+1e-4<by_height['medium']<by_height['high']-1e-4)({c['height']:c['head'][1] for c in height_checks if c['clip']==clip['id']}) for clip in height_clips)
    assets_unchanged=all(hashlib.sha256((ROOT/asset).read_bytes()).hexdigest()==digest for asset,digest in asset_hashes.items())
    report={'assetSha256':asset_hashes,'assetsUnchangedDuringCapture':assets_unchanged,'browser':'Chromium + SwiftShader','viewport':{'width':844,'height':390},'clipCount':len(catalog['clips']),'sheetCount':len(clips),'renderedFrames':8*len(clips),'clips':clips,'controls':controls,'heightControls':height_checks,'heightOrderingPass':height_ordering,'errors':errors,'badResponses':failed,'externalRequests':external,'maxHeadInHandErrorMeters':max_head,'maxRacketScaleError':max_scale}
    report['pass']=assets_unchanged and height_ordering and not errors and not failed and not external and max_scale<1e-6 and (max_head is None or max_head<1e-6) and all(c['clipSelection'] and c['scrub'] and c['speedSelection'] and c['bridgePlayback'] and c['layout']['horizontal'] and c['layout']['vertical'] for c in controls) and all(c['loaded'] and (c['heightErrorMeters'] is None or c['heightErrorMeters']<1e-5) for c in height_checks) and (args.only_preview or len(clips)==24)
    target=ROOT/'verification'/('browser-preview.json' if args.only_preview else 'browser.json')
    target.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({**{k:report[k] for k in ['pass','clipCount','sheetCount','renderedFrames','assetsUnchangedDuringCapture','heightOrderingPass','maxHeadInHandErrorMeters','maxRacketScaleError','errors','badResponses','externalRequests']},'heightChecks':len(height_checks)},indent=2))
    if not report['pass']:
        raise SystemExit(1)

if __name__=='__main__':
    main()
