#!/usr/bin/env python3
"""Real WebGL, all presets, rendered pixels, controls, extracted ZIP and cold offline."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
import hashlib
import json
import mimetypes
import os
import shutil
import tempfile
import threading
import zipfile

from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'verification'


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass


def ready(page,url):
    page.goto(url)
    page.wait_for_function('()=>!!window.lightingPreview?.snapshot().ready',timeout=30000)
    page.evaluate('lightingPreview.render()')


def select(page,ident):
    page.locator(f'[data-preset="{ident}"]').click()
    page.wait_for_function('(id)=>lightingPreview.snapshot().selected===id',arg=ident)
    page.evaluate('lightingPreview.render()')
    assert page.locator('.preset[aria-pressed="true"]').count()==1
    return page.evaluate('lightingPreview.snapshot()')


def webp(image,name):
    image.convert('RGB').save(OUT/name,'WEBP',quality=83,method=6)


def layout(page,width,height):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,height,'horizontal overflow')
    if (width,height)==(844,390):
        assert page.evaluate('document.documentElement.scrollHeight<=innerHeight'), 'Target needs vertical scrolling'
    targets=page.locator('button,a').evaluate_all('''nodes=>nodes.filter(n=>{
      const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<44||r.height<44);
    }).map(n=>n.textContent.trim())''')
    assert not targets, ('Touch target under 44px',targets)
    assert page.locator('.pane').count()==3
    return dict(width=width,height=height,horizontalOverflow=False,minTouchPx=44)


def main():
    OUT.mkdir(exist_ok=True)
    pack=json.loads((ROOT/'presets.json').read_text())
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    errors=[];external=[];responses=[];snapshots=[];layouts=[];signatures={}
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=os.environ.get('LIGHTING_CHROMIUM') or shutil.which('chromium'),
                headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            context=browser.new_context(viewport={'width':844,'height':390},device_scale_factor=1,accept_downloads=True,
                permissions=['clipboard-read','clipboard-write'])
            def restrict(route):
                if route.request.url.startswith(origin+'/'):route.continue_()
                else:
                    external.append(route.request.url);route.abort()
            context.route('**/*',restrict)
            page=context.new_page()
            page.on('pageerror',lambda error:errors.append(str(error)))
            page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' else None)
            page.on('response',lambda response:responses.append(response.status) if response.status>=400 else None)
            ready(page,origin+'/preview.html')
            for preset in pack['presets']:
                state=select(page,preset['id'])
                assert state['renderer']['revision']=='160' and state['ready']
                assert len(state['scenes'])==3
                for scene in state['scenes']:
                    assert scene['preset']==preset['id']
                    assert scene['sunColor']==preset['sun']['color'][1:]
                    assert scene['intensity']==preset['sun']['intensity']
                    assert scene['ambient']==preset['ambient']['color'][1:]
                    assert scene['fog']==[preset['fog']['start'],preset['fog']['end']]
                    assert scene['stars']==preset['stars']['count']
                    assert scene['visibleClouds']==preset['clouds']['count']
                    assert scene['rain']==(preset['weather']['type']=='rain')
                    assert scene['snow']==(preset['weather']['type']=='snow')
                    assert scene['spots']==len(preset['spotlights'])
                image=Image.open(BytesIO(page.screenshot())).convert('RGB')
                name='preset-'+preset['id']+'-844x390.webp';webp(image,name)
                snapshots.append(dict(preset=preset['id'],image=name,state=state))
                signatures[preset['id']]={}
                for pane in page.locator('.pane').all():
                    rect=pane.bounding_box();ident=pane.get_attribute('data-scene')
                    region=image.crop((round(rect['x']+8),round(rect['y']+rect['height']*.4),
                        round(rect['x']+rect['width']-8),round(rect['y']+rect['height']-20)))
                    assert sum(ImageStat.Stat(region).var)>30, (preset['id'],ident,'empty 3D image')
                    signatures[preset['id']][ident]=hashlib.sha256(region.tobytes()).hexdigest()
                layout(page,844,390)
            for scene in ['coast','stadium','alpine']:
                assert len({signatures[p['id']][scene] for p in pack['presets']})==10,('Identical preset renders',scene)
            layouts.append(layout(page,844,390))
            sheet=Image.new('RGB',(1688,1950),'#101719')
            for index,preset in enumerate(pack['presets']):
                sheet.paste(Image.open(OUT/('preset-'+preset['id']+'-844x390.webp')),
                    ((index%2)*844,(index//2)*390))
            webp(sheet,'all-presets-contact-sheet.webp')

            # The buttons, camera and copy/download paths are exercised through the UI.
            page.locator('[data-preset="noon"]').focus();page.keyboard.press('Space')
            assert page.evaluate('lightingPreview.snapshot().selected')=='noon'
            pane=page.locator('[data-scene="coast"]');pane.focus()
            before=page.evaluate('lightingPreview.snapshot().scenes[0].camera')
            page.keyboard.press('ArrowLeft');page.evaluate('lightingPreview.render()')
            assert page.evaluate('lightingPreview.snapshot().scenes[0].camera')!=before
            page.keyboard.press('Home');page.evaluate('lightingPreview.render()')
            assert page.evaluate('lightingPreview.snapshot().scenes[0].camera')==before
            rect=pane.bounding_box();x=rect['x']+rect['width']/2;y=rect['y']+rect['height']/2
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+35,y,steps=4);page.mouse.up()
            assert page.evaluate('lightingPreview.snapshot().scenes[0].camera')!=before
            pane.focus();page.keyboard.press('Home')
            page.locator('#copy').click()
            copied=page.evaluate('navigator.clipboard.readText()')
            assert json.loads(copied)==pack['presets'][1]
            with page.expect_download() as download_info:page.locator('#download').click()
            download=download_info.value
            assert json.loads(Path(download.path()).read_text())==pack
            select(page,'rain')
            still=page.locator('#views').screenshot()
            page.locator('#motion').click()
            page.wait_for_function('()=>lightingPreview.snapshot().time>.3')
            assert page.locator('#views').screenshot()!=still,'No rendered weather movement'
            page.locator('#motion').click()
            paused=page.evaluate('lightingPreview.snapshot().time')
            page.wait_for_timeout(180)
            assert page.evaluate('lightingPreview.snapshot().time')==paused
            page.locator('#motion').click()
            page.emulate_media(reduced_motion='reduce')
            page.wait_for_function('()=>!lightingPreview.snapshot().playing')
            assert page.locator('#motion').get_attribute('aria-pressed')=='false'

            # Multiple unit scales and cleanup: a reused game engine need not import our vendor.
            adapter=page.evaluate('''()=>{
              const scene=new THREE.Scene(),oldFog=new THREE.Fog('#123456',2,5);scene.fog=oldFog;
              const texture={skyTile:new THREE.Texture(),clouds:new THREE.Texture(),halo:new THREE.Texture()};
              const rig=IslandLighting.create(THREE,scene,texture,{worldUnitsPerMeter:94});
              rig.apply(LIGHTING_PACK.presets.find(p=>p.id==='stadium'));
              const result={near:scene.fog.near,far:scene.fog.far,intensity:rig.spots[0].light.intensity,
                scale:rig.root.scale.x,spotDistance:rig.spots[0].light.distance};
              rig.apply(LIGHTING_PACK.presets[1]);result.staleSpots=rig.spots.filter(p=>p.light.visible).length;
              rig.dispose();rig.dispose();result.clean=scene.children.length===0&&scene.fog===oldFog;
              Object.values(texture).forEach(t=>t.dispose());return result;
            }''')
            assert adapter==dict(near=48*94,far=190*94,intensity=3800*94*94,scale=94,spotDistance=100*94,staleSpots=0,clean=True)
            # Measure actual GPU pixels with each effect toggled off, including a
            # night sky at the same camera angle as the coastal example.
            effect_pixels=page.evaluate('''async()=>{
              const width=640,height=400;
              const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(width,height);
              renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
              const scene=new THREE.Scene();
              const maps=await IslandLighting.loadTextures(THREE,LIGHTING_PACK,LIGHTING_TEXTURES);
              const rig=IslandLighting.create(THREE,scene,maps);
              const camera=new THREE.PerspectiveCamera(52,width/height,.1,800);
              camera.position.set(26.954592,13.447,35.457032);camera.lookAt(0,1.8,0);
              const gl=renderer.getContext();
              function pixels(){rig.update(0,camera);renderer.render(scene,camera);
                const data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;}
              function difference(a,b){let channels=0,max=0;
                for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)channels++;max=Math.max(max,d);}
                return {channels,max};}
              rig.apply(LIGHTING_PACK.presets.find(p=>p.id==='night'));
              let before=pixels();rig.stars.visible=false;const stars=difference(before,pixels());
              rig.apply(LIGHTING_PACK.presets.find(p=>p.id==='noon'));
              before=pixels();rig.clouds.visible=false;const clouds=difference(before,pixels());rig.clouds.visible=true;
              const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshLambertMaterial({color:'#eeeeee'}));
              floor.rotation.x=-Math.PI/2;scene.add(floor);camera.position.set(32,20,38);camera.lookAt(0,0,0);
              rig.apply(LIGHTING_PACK.presets.find(p=>p.id==='stadium'));
              before=pixels();rig.spots.forEach(s=>s.light.visible=false);const spotIllumination=difference(before,pixels());
              rig.dispose();floor.geometry.dispose();floor.material.dispose();
              Object.values(maps).forEach(t=>t.dispose());renderer.dispose();
              return {stars,clouds,spotIllumination};
            }''')
            assert effect_pixels['stars']['channels']>12 and effect_pixels['stars']['max']>60,effect_pixels
            assert effect_pixels['clouds']['channels']>100,effect_pixels
            assert effect_pixels['spotIllumination']['channels']>10000,effect_pixels
            for width,height in [(1280,720),(390,844),(320,740)]:
                page.set_viewport_size(dict(width=width,height=height))
                select(page,'stadium');page.evaluate('lightingPreview.render()')
                layouts.append(layout(page,width,height))
                page.evaluate('window.scrollTo(0,0)')
                webp(Image.open(BytesIO(page.screenshot(full_page=True))),f'layout-{width}x{height}.webp')
            page.set_viewport_size(dict(width=844,height=390))
            select(page,'noon');page.emulate_media(reduced_motion='no-preference')

            # Extract to an unrelated directory. With offline=True, fulfill from disk only;
            # no browser cache, HTTP server, repository siblings or network are involved.
            with tempfile.TemporaryDirectory(prefix='island-lighting-') as temp:
                with zipfile.ZipFile(ROOT/'lighting-presets-v1.zip') as z:z.extractall(temp)
                extracted=Path(temp)/'lighting-presets-v1'
                offline=browser.new_context(offline=True,viewport=dict(width=844,height=390))
                offline_requests=[]
                def disk(route):
                    from urllib.parse import urlparse,unquote
                    request=route.request.url;parts=urlparse(request)
                    offline_requests.append(request)
                    assert parts.netloc=='lighting.local',request
                    path=(extracted/unquote(parts.path).lstrip('/')).resolve();path.relative_to(extracted)
                    assert path.is_file(),path
                    route.fulfill(status=200,content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream',body=path.read_bytes())
                offline.route('**/*',disk)
                offpage=offline.new_page()
                offpage.on('pageerror',lambda error:errors.append(str(error)))
                offpage.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' else None)
                ready(offpage,'http://lighting.local/preview.html')
                for preset in pack['presets']:
                    assert all(s['preset']==preset['id'] for s in select(offpage,preset['id'])['scenes'])
                offline.close()
                file_context=browser.new_context(offline=True,viewport=dict(width=844,height=390))
                file_page=file_context.new_page()
                try:
                    ready(file_page,(extracted/'preview.html').as_uri())
                    file_result='passed, cold file:// in offline context'
                except Exception as error:
                    assert 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(error),str(error)
                    file_result='not verified: managed Chromium blocks file:// (ERR_BLOCKED_BY_ADMINISTRATOR)'
                file_context.close()
            nojs=browser.new_context(java_script_enabled=False)
            nojs_page=nojs.new_page();nojs_page.goto(origin+'/preview.html')
            assert nojs_page.locator('noscript a[href="presets.json"]').is_visible()
            nojs.close()
            fallback=browser.new_context()
            fallback.add_init_script('''const original=HTMLCanvasElement.prototype.getContext;
              HTMLCanvasElement.prototype.getContext=function(type,...args){
                return /webgl/i.test(type)?null:original.call(this,type,...args);};''')
            fallback_page=fallback.new_page();fallback_page.goto(origin+'/preview.html')
            fallback_page.wait_for_function('()=>document.getElementById("loading").textContent.includes("WebGL")')
            assert fallback_page.locator('#download').is_visible()
            fallback.close()
            page.evaluate('lightingPreview.dispose()')
            assert not page.evaluate('lightingPreview.snapshot().ready')
            version=browser.version
            context.close();browser.close()
        assert not errors,errors
        assert not external,external
        assert not responses,responses
        result=dict(status='passed',date='2026-11-17',browser='Chromium '+version,gpu='ANGLE / SwiftShader (software)',
            target=dict(width=844,height=390,presets=10,scenes=3,renderedCombinations=30,verticalOverflow=False),
            layouts=layouts,distinctImageSignatures=signatures,
            controls=dict(keyboardPreset=True,keyboardOrbitAndReset=True,pointerOrbit=True,copyJSON=True,downloadCanonicalJSON=True,
                animatedWeatherPixels=True,pause=True,reducedMotion=True,dispose=True),
            adapterScaling=adapter,effectPixels=effect_pixels,externalRequests=0,pageErrors=0,httpErrors=0,
            coldOfflineZIP=dict(presets=10,scenes=3,cache=False,network=False,diskFulfilledRequests=len(offline_requests)),
            fileScheme=file_result,withoutJavaScript='JSON download available',withoutWebGL='explicit message and JSON download',
            screenshots=[s['image'] for s in snapshots]+['all-presets-contact-sheet.webp'])
        (OUT/'browser-report.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps({k:v for k,v in result.items() if k not in ['distinctImageSignatures','screenshots']},indent=2))
    finally:
        server.shutdown();server.server_close()


if __name__=='__main__':main()
