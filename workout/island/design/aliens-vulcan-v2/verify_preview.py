#!/usr/bin/env python3
"""Exercise actual preview controls, codec decoding, animation and source cleanup.

Serve the repo: python3 -m http.server 8765
Run: python3 verify_preview.py [--base-url http://127.0.0.1:8765]
Requires playwright and system Chromium; no changes outside this directory.
"""
import argparse
import json
from pathlib import Path
import shutil
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url',default='http://127.0.0.1:8765')
args=parser.parse_args()
url=args.base_url.rstrip('/')+'/workout/island/design/aliens-vulcan-v2/preview.html'
checks=[]
def require(condition,name):
    checks.append({'check':name,'pass':bool(condition)})
    if not condition:
        print('FAIL:',name)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,
        args=['--no-sandbox','--autoplay-policy=user-gesture-required'])
    page=browser.new_page(viewport={'width':844,'height':390},device_scale_factor=1)
    errors=[]; requests=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('response',lambda r:requests.append({'url':r.url,'status':r.status}))
    page.goto(url+'?step=1')
    page.wait_for_function('window.vulcanPreview?.ready')
    snap=lambda:page.evaluate('vulcanPreview.snapshot()')
    step=lambda t:page.evaluate('(t)=>vulcanPreview.step(t)',t)
    require(page.evaluate('document.documentElement.scrollWidth===844 && document.documentElement.scrollHeight===390'),
            '844x390: complete preview without overflow')
    require(not snap()['audioEnabled'] and snap()['audioState'] is None,'no audio context or sound before user gesture')
    first=step(.65)
    page.screenshot(path=str(ROOT/'preview-844x390.webp'))
    require(first['state']=='hot' and first['shots']>=10,'dense Vulcan stream and hot state rendered')
    near=step(.35)
    require(near['state']=='near-lock','near-lock state reached')
    page.screenshot(path=str(ROOT/'preview-near-lock.webp'))
    locked=step(.19)
    require(locked['state']=='locked' and locked['locks']==1 and locked['vents']>0,'lock stops Vulcan and starts steam once')
    page.screenshot(path=str(ROOT/'preview-locked.webp'))
    before=locked['emitted']
    cooling=step(1)
    require(cooling['emitted']==before and cooling['lock']>0 and cooling['heat']<locked['heat'],
            'lock prevents new rounds while heat drains')
    cold=step(1.2)
    require(cold['state']=='cold' and cold['lock']==0 and cold['heat']==0,'unlocks after two seconds')
    require(set(cold['stateHistory'])=={'cold','hot','near-lock','locked'},'all four heat states visited')
    page.click('#demo')
    require(not snap()['auto'],'automatic demo can be disabled')
    page.mouse.move(625,337);page.mouse.down()
    manual=step(.45)
    require(manual['held'] and manual['firing'],'pointer hold starts manual Vulcan')
    page.mouse.move(5,5);page.mouse.up()
    require(not snap()['held'],'pointer capture releases outside the fire button')
    partial=snap()['heat'];step(2.5)
    require(partial>0 and snap()['heat']==0,'early release cools gradually to cold')
    page.click('#pause')
    frozen=snap()['time'];step(.5)
    require(snap()['time']==frozen and snap()['paused'],'pause freezes simulation')
    page.click('#pause')
    page.locator('body').click(position={'x':416,'y':307})
    page.keyboard.down('Space');step(.22)
    require(snap()['held'],'Space keyboard control fires')
    page.keyboard.up('Space')
    require(not snap()['held'],'Space release stops firing')
    page.select_option('#size','2');page.select_option('#resolution','256')
    require(snap()['size']==2 and snap()['resolution']=='256','large plasma and 256 atlas selectable')
    page.click('#gallery')
    require(snap()['gallery'],'all frame atlas gallery opens')
    page.screenshot(path=str(ROOT/'preview-all-frames.webp'))
    page.click('#gallery');page.select_option('#resolution','512')
    # decode both formats explicitly, regardless of the platform's preferred codec
    decoded=page.evaluate('''async()=>{
      const m=await(await fetch('manifest.json')).json();
      const ctx=new OfflineAudioContext(1,44100,44100), result={};
      for(const [name,cue] of Object.entries(m.audio))for(const [codec,path]of Object.entries(cue.sources)){
        const b=await ctx.decodeAudioData(await(await fetch(path)).arrayBuffer());
        const pcm=b.getChannelData(0), energy=pcm.reduce((a,x)=>a+x*x,0)/pcm.length;
        const out={samples:b.length,seconds:b.duration,seam:Math.abs(pcm[0]-pcm[pcm.length-1]),
          peak:pcm.reduce((a,x)=>Math.max(a,Math.abs(x)),0),rms:Math.sqrt(energy)};
        if(name==='fire-loop'){
          const off=new OfflineAudioContext(1,44100*4.5,44100), s=off.createBufferSource();
          s.buffer=b;s.loop=true;s.loopStart=0;s.loopEnd=b.duration;s.connect(off.destination);s.start();
          const repeated=(await off.startRendering()).getChannelData(0);
          out.renderedSeams=[Math.abs(repeated[66150]-repeated[66149]),Math.abs(repeated[132300]-repeated[132299])];
        }
        result[path]=out;
      }
      return result;
    }''')
    manifest=json.loads((ROOT/'manifest.json').read_text())
    for name,cue in manifest['audio'].items():
        for path in cue['sources'].values():
            stat=decoded[path]
            require(stat['samples']==cue['samples'],f'{path}: browser decodes exact requested duration')
            require(stat['peak']<1,f'{path}: browser decoding does not clip')
            if cue['loop']:
                require(all(s<.001 for s in stat['renderedSeams']),f'{path}: two actual rendered loop joins below -60 dBFS')
            else:
                require(stat['seam']<.005,f'{path}: browser decoded endpoints faded')
    page.click('#sound')
    page.wait_for_function('vulcanPreview.snapshot().audioEnabled')
    require(snap()['audioState']=='running','explicit gesture unlocks audio')
    page.mouse.move(625,337);page.mouse.down();step(.5)
    require(snap()['audioRunning'],'manual hold starts spin-up and loop')
    page.mouse.up();step(.01)
    require(not snap()['audioRunning'],'release fades loop and starts spin-down')
    page.wait_for_timeout(700)
    require(snap()['audioVoices']==0,'release disposes all audio sources')
    # Rapid release during a scheduled future loop must cancel that loop as well.
    for _ in range(6):
        page.mouse.move(625,337);page.mouse.down();step(.025);page.mouse.up();step(.005)
    # Taps may cross the 12-round lock: its cooldown ends at 0.12 + 0.72 s.
    page.wait_for_timeout(950)
    require(snap()['audioVoices']==0,'rapid taps leave no future or orphan audio sources after the thermal cue')
    page.click('#audio-menu');page.click('[data-cue="fire-loop"]')
    page.wait_for_timeout(150)
    require(snap()['audioVoices']>0,'soundboard plays the three-repeat seam audition')
    page.click('#stop-audio');page.wait_for_timeout(100)
    require(snap()['audioVoices']==0,'soundboard stop disposes sources')
    page.click('#audio-menu');page.mouse.move(625,337);page.mouse.down();step(.05)
    page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide'))")
    page.mouse.up();page.wait_for_timeout(100)
    require(not snap()['audioRunning'] and not snap()['held'] and snap()['audioState']=='suspended',
            'pagehide releases input and suspends sound')
    # Mobile touch path at the requested landscape viewport.
    touch=browser.new_page(viewport={'width':844,'height':390},has_touch=True,is_mobile=True)
    touch.goto(url+'?step=1');touch.wait_for_function('vulcanPreview?.ready')
    touch.click('#demo')
    box=touch.locator('#trigger').bounding_box()
    session=touch.context.new_cdp_session(touch)
    point={'x':box['x']+box['width']/2,'y':box['y']+box['height']/2}
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[point]})
    touch.evaluate('vulcanPreview.step(.3)')
    require(touch.evaluate('vulcanPreview.snapshot().held'),'landscape touch hold fires')
    session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    require(not touch.evaluate('vulcanPreview.snapshot().held'),'touch release clears trigger')
    touch.close()
    # Reduced motion begins paused but remains manually usable.
    reduced=browser.new_page(viewport={'width':844,'height':390},reduced_motion='reduce')
    reduced.goto(url);reduced.wait_for_function('vulcanPreview?.ready')
    require(reduced.evaluate('vulcanPreview.snapshot().paused'),'reduced motion starts paused')
    reduced.close()
    live=browser.new_page(viewport={'width':844,'height':390})
    live.goto(url);live.wait_for_function('vulcanPreview?.ready');live.wait_for_timeout(3550)
    require(live.evaluate("vulcanPreview.snapshot().stateHistory.includes('locked')"),'real animation clock reaches thermal lock')
    live.close()
    require(not errors,'no JavaScript errors')
    require(all(r['status']==200 for r in requests),'all preview and media HTTP requests succeed')
    require(all(r['url'].startswith(args.base_url) for r in requests),'no outside runtime requests')
    browser.close()

report={'viewport':[844,390],'checks':checks,'passed':sum(c['pass'] for c in checks),
        'failed':sum(not c['pass'] for c in checks),'browserAudio':decoded,'errors':errors}
(ROOT/'browser-verification.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'errors':errors},ensure_ascii=False))
raise SystemExit(bool(report['failed']))
