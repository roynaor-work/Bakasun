"""Load the delivered bytes, exercise clips/colour/UI, and capture main camera."""
import hashlib
import io
import json
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[3]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def capture(page,name):
    data=page.locator('#stage').screenshot()
    image=Image.open(io.BytesIO(data)).convert('RGB')
    target=ROOT/'previews'/f'{name}.webp'
    image.save(target,quality=87,method=6)
    return {'path':str(target.relative_to(ROOT)),'size':image.size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}

def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(REPO)))
    Thread(target=server.serve_forever,daemon=True).start()
    errors=[];failed=[];external=[];captures=[];layouts=[];clips=[]
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader'])
            page=browser.new_page(viewport={'width':1280,'height':850},device_scale_factor=1)
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('requestfailed',lambda r:failed.append({'url':r.url,'error':r.failure}))
            page.on('request',lambda r:external.append(r.url) if not r.url.startswith(('http://127.0.0.1:','blob:','data:')) else None)
            page.on('response',lambda r:failed.append({'url':r.url,'status':r.status}) if r.status>=400 else None)
            page.goto(f'http://127.0.0.1:{server.server_port}/workout/island/design/soccer-v4/preview.html')
            page.evaluate('async()=>await soccerV4.ready')
            for view in ['main','stadium','turf','player','keeper']:
                page.locator(f'[data-view="{view}"]').click()
                captures.append(capture(page,view))
            for view in ['player','keeper']:
                page.evaluate('v=>soccerV4.setView(v)',view)
                names=page.locator('#clip option').evaluate_all('(ns)=>ns.map(n=>n.value)')
                sheet=Image.new('RGB',(256*len(names),340),'#111e25');draw=ImageDraw.Draw(sheet)
                for col,name in enumerate(names):
                    page.select_option('#clip',name)
                    duration=page.evaluate('()=>soccerV4.focus.action.getClip().duration')
                    probe=page.evaluate('''({name,duration})=>{
                      const a=soccerV4.focus,minimum=[];let finite=true,skinned=false;
                      soccerV4.playClip(name,0);
                      for(let i=0;i<=12;i++){
                        a.mixer.setTime(duration*i/12);a.model.updateMatrixWorld(true);
                        let min=Infinity;
                        a.model.traverse(o=>{if(!o.isSkinnedMesh)return;skinned=true;o.skeleton.update();const p=o.position.clone();for(let j=0;j<o.geometry.attributes.position.count;j++){o.getVertexPosition(j,p);finite=finite&&Number.isFinite(p.x+p.y+p.z);min=Math.min(min,p.y);}});
                        minimum.push(min);
                      }
                      return {finite,skinned,minLocalY:Math.min(...minimum)};
                    }''',{'name':name,'duration':duration})
                    assert probe['finite'] and probe['skinned'],probe
                    assert probe['minLocalY']>-.012,(view,name,probe)
                    clips.append({'model':view,'clip':name,'duration':duration,**probe})
                    print(view,name,probe,flush=True)
                    page.evaluate('({name,time})=>soccerV4.playClip(name,time)',{'name':name,'time':duration*.52})
                    im=Image.open(io.BytesIO(page.locator('#stage').screenshot())).convert('RGB')
                    # Fit the delivered canvas rather than redrawing an asset.
                    im.thumbnail((256,302));sheet.paste(im,((col*256)+(256-im.width)//2,(302-im.height)//2))
                    draw.text((col*256+12,316),name,fill='#edf1e8')
                sheet.save(ROOT/'previews'/f'{view}-clips.webp',quality=87,method=6)
            # Independent vertex-colour recolouring must not introduce a map.
            page.evaluate('()=>soccerV4.setView("player")')
            before=page.evaluate('()=>{let v;soccerV4.focus.model.traverse(o=>{if(o.isSkinnedMesh)v=Array.from(o.geometry.attributes.color.array)});return v}')
            page.locator('[data-kit="away"]').click()
            after=page.evaluate('()=>{let v;soccerV4.focus.model.traverse(o=>{if(o.isSkinnedMesh){if(o.material.map)throw Error("Unexpected character texture");v=Array.from(o.geometry.attributes.color.array)}});return v}')
            assert before!=after,'Kit did not change'
            # The decoded region attribute must recolour precisely the kit.
            recolour=page.evaluate('''()=>{let regions=0,preserved=0,wrong=0;const palette=soccerV4.manifest.palette.away;soccerV4.focus.model.traverse(o=>{if(!o.isSkinnedMesh)return;const a=o.geometry.attributes,names=o.userData.kitRegionNames;for(let i=0;i<a.color.count;i++){const key=names[a._kit_region.getX(i)];if(palette[key]){regions++;const hex=palette[key].slice(1);const rgb=hex.match(/../g).map(x=>{let v=parseInt(x,16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});if(rgb.some((v,k)=>Math.abs(v-a.color.getComponent(i,k))>1e-5))wrong++;}else preserved++;}});return {regions,preserved,wrong}}''')
            assert recolour['wrong']==0 and recolour['preserved']>100 and recolour['regions']>100,recolour
            captures.append(capture(page,'away-kit'))
            page.locator('[data-kit="home"]').click()
            # Native controls: scrub, pause, resume, reset and actual render change.
            page.select_option('#clip','run');page.locator('#play').click()
            # Software rendering can take longer than a fixed 250ms to present.
            page.wait_for_function('soccerV4.focus.action.time>0',timeout=15000)
            t1=page.evaluate('()=>soccerV4.focus.action.time');assert t1>0
            page.locator('#play').click();page.wait_for_timeout(100)
            t2=page.evaluate('()=>soccerV4.focus.action.time');page.wait_for_timeout(100)
            assert page.evaluate('()=>soccerV4.focus.action.time')==t2
            page.locator('#scrub').fill('0.6');assert abs(page.evaluate('()=>soccerV4.focus.action.time/soccerV4.focus.action.getClip().duration')-.6)<.001
            for width,height in [(844,390),(390,844)]:
                page.set_viewport_size({'width':width,'height':height});page.evaluate('()=>{soccerV4.setView("main");soccerV4.resize()}')
                page.wait_for_timeout(100)
                probe=page.evaluate('''()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().height).map(b=>({text:b.textContent.trim(),width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))})''')
                assert probe['scrollWidth']==width,probe
                for b in probe['buttons']:assert b['height']>=44 and b['width']>=44,b
                layouts.append({'viewport':[width,height],**probe})
                captures.append(capture(page,f'main-{width}x{height}'))
                page.screenshot(path=str(ROOT/'verification'/f'layout-{width}x{height}.png'))
            stats=page.evaluate('()=>({calls:soccerV4.renderer.info.render.calls,triangles:soccerV4.renderer.info.render.triangles,textures:soccerV4.renderer.info.memory.textures,actors:soccerV4.actors.length,errors:soccerV4.errors})')
            assert not errors and not failed and not external and not stats['errors'],(errors,failed,external,stats)
            page.evaluate('()=>soccerV4.dispose()')
            browser.close()
        report={'pass':True,'sourceSha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in ROOT.glob('*.glb')},'clips':clips,'layouts':layouts,'captures':captures,'renderSnapshot':stats,'kitChange':before!=after,'recolour':recolour,'pauseResumeScrub':True,'errors':errors,'failedRequests':failed,'externalRequests':external,'limits':'Software Chromium; no physical-phone FPS claim. Main camera is the package camera, not a live-game integration.'}
        (ROOT/'verification/browser.json').write_text(json.dumps(report,indent=2)+'\n')
        print(f'PASS: {len(clips)} clips; {len(captures)} captures; 2 mobile layouts; no external requests')
    finally:server.shutdown();server.server_close()

if __name__=='__main__': main()
