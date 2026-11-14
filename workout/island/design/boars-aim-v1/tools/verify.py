#!/usr/bin/env python3
"""Validate the delivered graphics and exercise the isolated mobile preview."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import threading
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
PREFIX = str(ROOT.relative_to(REPO))+'/'
OUT = ROOT/'verification'


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def save_shot(page, name):
    img = Image.open(BytesIO(page.screenshot())).convert('RGB')
    dest = OUT/f'{name}.webp'
    img.save(dest, format='WEBP', quality=88, method=6)
    assert dest.stat().st_size <= 500_000
    return {'path': str(dest.relative_to(ROOT)), 'width': img.width, 'height': img.height, 'bytes': dest.stat().st_size}


def contact_sheet(manifest):
    sheet = Image.new('RGB', (1000, 600), '#0d2630')
    draw = ImageDraw.Draw(sheet)
    for i, asset in enumerate(manifest['assets']):
        x, y = (i%6)*166, (i//6)*200
        draw.rounded_rectangle((x+4,y+4,x+162,y+194),radius=9,fill='#193740')
        tile = Image.open(ROOT/asset['formats']['png256']).resize((148,148),Image.Resampling.LANCZOS)
        sheet.paste(tile,(x+9,y+10),tile)
        draw.text((x+12,y+169),asset['id'],fill='#fff8e8')
    sheet.save(OUT/'contact-sheet.webp',quality=92,method=6)


def main():
    OUT.mkdir(exist_ok=True)
    manifest=json.loads((ROOT/'manifest.json').read_text())
    assert len(manifest['assets']) == 17
    checked=[]
    for asset in manifest['assets']:
        for file in asset['files']:
            path=ROOT/file['path']
            raw=path.read_bytes()
            assert len(raw)==file['bytes'] and hashlib.sha256(raw).hexdigest()==file['sha256'], path
            assert len(raw)<=500_000
            if path.suffix=='.png':
                img=Image.open(path)
                assert img.mode=='RGBA' and img.size==(file['width'],file['height'])
                assert img.getchannel('A').getextrema()==(0,255)
                box=img.getchannel('A').getbbox()
                assert list(box)==file['visibleBoundsPx']
                assert 0<box[0]<box[2]<img.width and 0<box[1]<box[3]<img.height
            else:
                svg=ET.fromstring(raw)
                assert svg.attrib['viewBox']=='0 0 512 512'
                assert not any(n.tag.split('}')[-1] in ['image','script','foreignObject','filter'] for n in svg.iter())
                assert b'href=' not in raw and b'http:' not in raw.replace(b'http://www.w3.org/2000/svg',b'')
            checked.append(file['path'])
    # The three reaction poses must actually differ, while using one anchor.
    frames=[a for a in manifest['assets'] if a['category']=='boar']
    assert len({a['files'][0]['sha256'] for a in frames})==3
    assert all(a['anchorPx']==[256,436] for a in frames)
    contact_sheet(manifest)

    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{server.server_port}/preview.html'
    errors=[]; external=[]; http_errors=[]; layouts=[]; screenshots=[]; interactions=[]
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
            version=browser.version
            for width,height,scale in [(844,390,1),(844,390,2),(740,360,1),(390,844,1),(320,740,1),(1440,900,1)]:
                context=browser.new_context(viewport={'width':width,'height':height},device_scale_factor=scale,has_touch=width<1000)
                page=context.new_page()
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
                page.on('response',lambda r:http_errors.append(r.url) if r.status>=400 else None)
                page.on('request',lambda r:external.append(r.url) if r.url.startswith('http') and not r.url.startswith(f'http://127.0.0.1:{server.server_port}/') else None)
                page.goto(url,wait_until='networkidle')
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                assert page.evaluate('Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)')
                controls={}
                for key in ['fire','miss','variation','surprise','distance','power']:
                    rect=page.locator('#'+key).bounding_box(); controls[key]=rect
                    assert rect['x']>=0 and rect['y']>=0 and rect['x']+rect['width']<=width and rect['y']+rect['height']<=height
                # Check the visible power frame, not the transparent square canvas.
                meter=page.locator('#meter-stack').bounding_box()
                assert meter['x']+204/512*meter['width']>=0
                assert meter['x']+308/512*meter['width']<=width
                assert meter['y']+476/512*meter['height']<controls['fire']['y']
                assert page.locator('.asset-card').count()==17
                if width==844 and scale==1:
                    screenshots.append(save_shot(page,'aim-green-844x390'))
                    for value,color in [(4,'green'),(24,'green'),(25,'yellow'),(40,'yellow'),(41,'red'),(60,'red')]:
                        page.locator('#distance').fill(str(value)); page.locator('#distance').dispatch_event('input')
                        assert page.locator('#reticle').get_attribute('data-state')==color
                        assert str(value) in page.locator('#distance-value').inner_text()
                        interactions.append(f'distance {value}m → {color}')
                        if value in [40,60]:screenshots.append(save_shot(page,f'aim-{color}-844x390'))
                    for power in [0,65,100]:
                        page.locator('#power').fill(str(power));page.locator('#power').dispatch_event('input')
                        assert page.locator('#power-value').inner_text()==str(power)
                        clip=page.locator('#meter-fill').evaluate('e=>parseFloat(e.style.clipPath.slice(6))')
                        assert abs(clip-(434-power/100*364)/512*100)<.0001
                        interactions.append(f'power {power}% → matching clip and readout')
                    point_before=page.locator('#reticle').evaluate('e=>[e.style.left,e.style.top]')
                    page.mouse.move(430,190);page.mouse.down();page.mouse.move(598,218);page.mouse.up()
                    assert page.locator('#reticle').evaluate('e=>[e.style.left,e.style.top]')!=point_before
                    interactions.append('pointer drag moves trajectory, endpoint and reticle together')
                    page.touchscreen.tap(540,201)
                    assert page.locator('#reticle').evaluate('e=>[e.style.left,e.style.top]')==page.locator('#landing').evaluate('e=>[e.style.left,e.style.top]')
                    interactions.append('native touch tap keeps reticle and predicted endpoint aligned')
                    # Observe actual reaction frames rather than checking only the final still.
                    page.evaluate('''() => { window.reactionFrames=[]; new MutationObserver(ms=>{for(const m of ms) if(m.attributeName==='src')reactionFrames.push(document.getElementById('boar').getAttribute('src'));}).observe(document.getElementById('boar'),{attributes:true}); }''')
                    page.locator('#surprise').click();page.wait_for_timeout(470)
                    sequence=page.evaluate('window.reactionFrames')
                    assert sequence==['svg/boar-surprise-01.svg','svg/boar-surprise-02.svg','svg/boar-surprise-03.svg','svg/boar-surprise-01.svg'],sequence
                    interactions.append('surprise sequence 01 → 02 → 03 → restore')
                    for variant in ['hit-spark','hit-ring','hit-shards']:
                        page.locator('#fire').click()
                        assert page.locator('#effect').get_attribute('data-kind')==variant
                        assert not page.locator('#effect').is_hidden()
                        page.wait_for_timeout(420)
                        assert page.locator('#effect').is_hidden()
                        page.locator('#variation').click()
                        interactions.append(variant+' plays once and disappears')
                    page.locator('#miss').click()
                    assert page.locator('#effect').get_attribute('src')=='svg/miss-dust.svg'
                    page.wait_for_timeout(460);assert page.locator('#effect').is_hidden()
                    interactions.append('miss sand puff plays and disappears')
                    # Confirm all export links resolve; they must stay inside the pack.
                    page.locator('#assets-tab').click()
                    assert page.locator('#gallery').is_visible()
                    for bg in ['light','checker','dark']:
                        page.locator(f'button[data-bg={bg}]').click()
                        assert page.locator('#asset-grid').get_attribute('data-bg')==bg
                    screenshots.append(save_shot(page,'gallery-844x390'))
                    for href in page.locator('.asset-links a').evaluate_all('xs=>xs.map(a=>a.getAttribute("href"))'):
                        assert not href.startswith(('http','/','..')) and (ROOT/href).is_file()
                        assert context.request.get(url.rsplit('/',1)[0]+'/'+href).status==200
                    interactions.append('51 download links resolve; dark/light/checker gallery backgrounds')
                    page.keyboard.press('Escape');assert page.locator('#gallery').is_hidden()
                    # Keyboard sliders and buttons remain accessible.
                    page.locator('#power').focus();page.keyboard.press('ArrowLeft');assert page.locator('#power-value').inner_text()=='99'
                    page.locator('#assets-tab').focus();page.keyboard.press('Enter');assert page.locator('#gallery').is_visible()
                    page.keyboard.press('Escape');interactions.append('keyboard slider, Enter and Escape')
                if width==390:screenshots.append(save_shot(page,'aim-390x844'))
                layouts.append({'width':width,'height':height,'deviceScaleFactor':scale,'horizontalOverflow':False,'allControlsVisible':True,'visiblePowerFrameInsideViewport':True})
                context.close()

            context=browser.new_context(viewport={'width':844,'height':390},reduced_motion='reduce')
            page=context.new_page();page.goto(url,wait_until='networkidle')
            page.locator('#surprise').click()
            assert page.locator('#boar').get_attribute('src')=='svg/boar-surprise-02.svg'
            assert page.evaluate('document.getAnimations().length')==0
            page.wait_for_timeout(450)
            assert page.locator('#boar').get_attribute('src')=='svg/boar-surprise-01.svg'
            page.locator('#fire').click();assert page.evaluate('document.getAnimations().length')==0
            page.wait_for_timeout(450);assert page.locator('#effect').is_hidden()
            interactions.append('reduced motion: static confirmation and one held reaction frame')
            context.close();browser.close()
    finally:
        server.shutdown()
    assert not errors and not external and not http_errors, (errors,external,http_errors)
    # Include staged, unstaged and untracked files. User asked for new paths only.
    changed=subprocess.check_output(['git','diff','--name-status',manifest['baseCommit']],cwd=REPO,text=True).splitlines()
    assert all(line.startswith('A\t'+PREFIX) for line in changed),changed
    untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=REPO,text=True).splitlines()
    assert all(name.startswith(PREFIX) for name in untracked),untracked
    tracked_edits=subprocess.check_output(['git','diff','--name-only'],cwd=REPO,text=True).splitlines()
    assert all(name.startswith(PREFIX) for name in tracked_edits)
    all_files=[p for p in ROOT.rglob('*') if p.is_file()]
    assert all(p.stat().st_size<=500_000 for p in all_files)
    report={'status':'passed','date':'2026-11-14','baseCommit':manifest['baseCommit'],'browser':'Chromium '+version,
            'logicalAssets':17,'svgMasters':17,'rgbaPngExports':34,'assetFilesChecked':len(checked),
            'maxAssetBytes':max(f['bytes'] for a in manifest['assets'] for f in a['files']),
            'checks':['dimensions','RGBA alpha range and transparent margins','SHA-256','editable SVG paths without raster embeds or remote links','fixed reaction anchors','three distinct reaction frames','every file under 500000 bytes','only new paths in requested directory'],
            'layouts':layouts,'interactions':interactions,'screenshots':screenshots,
            'pageErrors':errors,'externalRequests':external,'httpErrors':http_errors,
            'limits':['Browser viewport checks use Chromium emulation, not a physical phone.','Prediction curve and 40m effective range are illustrative; game integration is outside this pack.']}
    (OUT/'validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':'passed','assetFiles':len(checked),'layouts':len(layouts),'interactions':len(interactions),'maxAssetBytes':report['maxAssetBytes']}))


if __name__=='__main__':
    main()
