"""Exercise all 48 delivered GLBs in offline Chromium and inspect posed vertices.

Python dependency: playwright. Set CHROMIUM to override /usr/bin/chromium.
No HTTP server is needed: only this package's files are fulfilled by the route.
"""
import os,json,mimetypes,time,io
from pathlib import Path
from urllib.parse import urlparse,unquote
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'verification'
checks=[];errors=[];external=[];pose_records=[]
def check(name,passed,details=None):
    checks.append(dict(name=name,passed=bool(passed),details=details))
    print(name,'PASS' if passed else 'FAIL',flush=True)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,
      args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    def route(r):
        u=urlparse(r.request.url)
        if u.scheme in ['data','blob']:r.continue_();return
        if u.netloc!='127.0.0.1:8765':external.append(r.request.url);r.abort();return
        file=(ROOT/unquote(u.path).lstrip('/')).resolve()
        if not file.is_relative_to(ROOT) or not file.is_file():external.append(str(file));r.abort();return
        r.fulfill(body=file.read_bytes(),content_type=mimetypes.guess_type(file)[0] or 'application/octet-stream')
    ctx=browser.new_context(viewport={'width':844,'height':390},device_scale_factor=1,offline=True,reduced_motion='reduce')
    ctx.route('**/*',route);page=ctx.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    start=time.monotonic();page.goto('http://127.0.0.1:8765/preview.html');page.wait_for_function('window.crowd&&crowd.ready',timeout=60000)
    check('offline-startup',True,dict(seconds=round(time.monotonic()-start,3)))
    check('reduced-motion-starts-paused',not page.evaluate('crowd.state.playing'))
    clips=['sit','stand','clap','jump_cheer','disappointed','shout','wave_clap']
    for lod in range(3):
        previous_time=page.evaluate('crowd.state.time')
        page.locator('#lod').select_option(str(lod));page.wait_for_function(f'crowd.ready&&crowd.state.lod==={lod}')
        check(f'lod{lod}-preserves-phase',abs(page.evaluate('crowd.state.time')-previous_time)<.001)
        for clip in clips:
            page.locator('#motion').select_option(clip)
            samples=[]
            # Most times lie between authored keys, exercising actual glTF
            # quaternion interpolation as well as the loop/contact keyframes.
            for u in [0,.07,.19,.31,.5,.63,.77,.91,1]:
                page.evaluate('(u)=>crowd.seek(u)',u)
                samples.append(dict(time=u,fans=page.evaluate('crowd.poseMetrics()')))
            all_fans=[f for s in samples for f in s['fans']]
            low=min(f['footMinimumY'] for f in all_fans);high=max(f['footMinimumY'] for f in all_fans)
            check(f'lod{lod}-{clip}-finite-and-grounded',all(f['finite'] for f in all_fans) and low>-.001,dict(minimumSoleY=low,maximumSoleY=high))
            if clip=='jump_cheer':check(f'lod{lod}-airborne-jump',high>.15)
            else:check(f'lod{lod}-{clip}-feet-planted',high<.001)
            if clip=='clap':
                distances=[f['palmDistance'] for s in samples if s['time'] in [0,.5,1] for f in s['fans']]
                check(f'lod{lod}-clap-contact',max(distances)<.04,dict(maximumPalmCenterSeparationM=max(distances)))
            pose_records.append(dict(lod=lod,clip=clip,samples=samples))
            if lod==0:
                page.evaluate('crowd.setState({time:.38,fan:4,yaw:.20,face:false})')
                page.screenshot(path=str(OUT/f'{clip}-844x390.png'))
        page.evaluate('crowd.setState({clip:"stand",time:.25,yaw:.20})')
        page.screenshot(path=str(OUT/f'lod{lod}-844x390.png'))
    check('all-48-assets-loaded',page.evaluate('crowd.diagnostics().loaded')==48)
    page.locator('#lod').select_option('0');page.wait_for_function('crowd.ready&&crowd.state.lod===0')
    portraits=Image.new('RGB',(262*4,244*4),'#e8e7df')
    for fan in range(16):
        page.locator(f'#fans button:nth-child({fan+1})').click()
        check(f'fan-{fan+1:02d}-selection',page.evaluate('crowd.state.fan')==fan)
        page.evaluate('crowd.setState({face:true,clip:"stand",time:.25,yaw:0})')
        crop=Image.open(io.BytesIO(page.screenshot(clip=dict(x=0,y=42,width=262,height=244))))
        portraits.paste(crop,((fan%4)*262,(fan//4)*244))
    portraits.save(OUT/'portraits-16.png',optimize=True)
    page.evaluate('crowd.setState({fan:4,face:true,yaw:0,clip:"stand",time:.25})')
    page.screenshot(path=str(OUT/'face-844x390.png'))
    page.locator('#focus').click();check('body-face-control',not page.evaluate('crowd.state.face'))
    canvas=page.locator('canvas');box=canvas.bounding_box()
    page.mouse.move(box['x']+60,box['y']+120);page.mouse.down();page.mouse.move(box['x']+100,box['y']+120,steps=3);page.mouse.up()
    check('pointer-turn',abs(page.evaluate('crowd.state.yaw'))>.1)
    canvas.focus();page.keyboard.press('Home');check('keyboard-reset',page.evaluate('crowd.state.yaw')==0)
    page.locator('#time').evaluate("e=>{e.value='.6';e.dispatchEvent(new Event('input',{bubbles:true}));}")
    check('timeline',abs(page.evaluate('crowd.state.time')-.6)<.001)
    page.locator('#play').click();page.wait_for_timeout(350);check('play-advances',page.evaluate('crowd.state.playing') and page.evaluate('crowd.state.time')!=.6)
    page.locator('#play').click();page.wait_for_timeout(100);before=page.evaluate('crowd.diagnostics()');page.wait_for_timeout(200);after=page.evaluate('crowd.diagnostics()')
    check('pause-stops-render-loop',before['state']['time']==after['state']['time'] and before['renderCount']==after['renderCount'])
    for w,h in [(844,390),(390,844)]:
        page.set_viewport_size(dict(width=w,height=h));page.wait_for_timeout(100)
        layout=page.evaluate('''()=>({overflow:document.documentElement.scrollWidth>innerWidth,small:[...document.querySelectorAll('button,select,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<43.9||r.height<43.9)}).map(e=>e.id||e.textContent)})''')
        check(f'layout-{w}x{h}',not layout['overflow'] and not layout['small'],layout)
    page.evaluate('crowd.setState({clip:"stand",time:.25,fan:4})');page.screenshot(path=str(OUT/'portrait-390x844.png'))
    page.set_viewport_size(dict(width=844,height=390));page.evaluate('crowd.setState({clip:"stand",time:.25,yaw:.2})');page.screenshot(path=str(OUT/'preview-844x390.png'))
    page.evaluate("window.loss= document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context');loss.loseContext()")
    page.wait_for_timeout(200);lost=page.locator('#error').is_visible();page.evaluate('loss.restoreContext()');page.wait_for_function('document.querySelector("#error").hidden',timeout=10000)
    check('webgl-context-recovery',lost)
    check('no-external-requests',not external,external);check('no-browser-errors',not errors,errors)
    browser.close()

(OUT/'browser.json').write_text(json.dumps(dict(passAll=all(c['passed'] for c in checks),checks=checks,errors=errors,externalRequests=external),ensure_ascii=False,indent=2)+'\n')
(OUT/'poses.json').write_text(json.dumps(pose_records,separators=(',',':'))+'\n')
if not all(c['passed'] for c in checks):raise SystemExit('Browser checks failed; inspect verification/browser.json')
