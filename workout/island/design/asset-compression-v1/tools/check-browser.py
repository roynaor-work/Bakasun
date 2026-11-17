#!/usr/bin/env python3
"""Offline-only Chromium acceptance checks; uses the system Playwright/browser."""
import json
import functools
import threading
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

PACKAGE = Path(__file__).resolve().parents[1]
REPO = PACKAGE.parents[3]
OUT = PACKAGE / 'verification'
OUT.mkdir(exist_ok=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(REPO)))
threading.Thread(target=server.serve_forever, daemon=True).start()
origin = f'http://127.0.0.1:{server.server_port}'
url = origin + '/workout/island/design/asset-compression-v1/preview.html'
result = {'schema': 1, 'browser': 'system Chromium / SwiftShader', 'wasmDisabled': True, 'networkPolicy': 'only localhost allowed; all remote and WASM decoder requests blocked', 'errors': [], 'remoteRequests': [], 'forbiddenRequests': [], 'workers': [], 'models': [], 'images': [], 'jsonFiles': 0, 'audioFiles': 0}

def compare_canvases(page):
    return page.evaluate('''() => {
      window.assetPreview.renderFrame(.37);
      const pixels = id => { const c=document.getElementById(id),g=c.getContext('webgl2')||c.getContext('webgl'),v=new Uint8Array(g.drawingBufferWidth*g.drawingBufferHeight*4);g.readPixels(0,0,g.drawingBufferWidth,g.drawingBufferHeight,g.RGBA,g.UNSIGNED_BYTE,v);return v;};
      const a=pixels('before'),b=pixels('after');let max=0,sum=0,changed=0,nonBackground=0;
      for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);sum+=d;if(d)changed++;if(i%4<3&&Math.abs(a[i]-a[i%4])>3)nonBackground++;}
      return {maxChannelError:max,meanChannelError:sum/a.length,changedChannels:changed,nonBackgroundChannels:nonBackground};
    }''')

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--disable-dev-shm-usage'])
        context = browser.new_context(viewport={'width': 1280, 'height': 1000}, device_scale_factor=1)
        context.add_init_script("Object.defineProperty(globalThis,'WebAssembly',{value:undefined,writable:false,configurable:false});")
        def network(route):
            if any(word in route.request.url.lower() for word in ['.wasm', 'draco', 'meshopt_decoder', 'basis_transcoder']):
                result['forbiddenRequests'].append(route.request.url)
                route.abort()
            elif route.request.url.startswith(origin + '/'):
                route.continue_()
            else:
                result['remoteRequests'].append(route.request.url)
                route.abort()
        context.route('**/*', network)
        page = context.new_page()
        page.on('pageerror', lambda error: result['errors'].append(str(error)))
        page.on('worker', lambda worker: result['workers'].append(worker.url))
        page.goto(url)
        page.wait_for_function('()=>window.assetPreview?.ready', timeout=120000)
        assert page.evaluate("typeof WebAssembly === 'undefined'"), 'WASM was not disabled'
        sources = {a['source'] for a in page.evaluate('window.assetPreview.manifest.assets')}
        models = ['assets/models/adult-man-rigged-512.glb', 'assets/kid-full.glb', 'assets/hoops-tall/guard.glb', 'assets/hoops-v7/pg.glb', 'assets/athlete/athlete.glb', 'assets/soccer-v24/body/models/soccer.glb', 'design/models2/soccer-stadium.glb', 'assets/models/city/47-sedan-car.glb', 'assets/naval-v7/ships/destroyer-lod0.glb', 'assets/hoops-v241/body/models/guard.glb', 'assets/fire-v24/rooms/bedroom.glb', 'assets/racing-formula-cars-v1/formula-lod0.glb']
        for i, source in enumerate(models):
            if source not in sources:
                raise AssertionError('Missing representative model: ' + source)
            page.evaluate('(s)=>window.assetPreview.selectSource(s)', source)
            row = page.evaluate('window.assetPreview.stats')
            row['pixels'] = compare_canvases(page)
            assert row['pixels']['nonBackgroundChannels'] > 100, source + ': blank render'
            assert row['pixels']['meanChannelError'] < .5, source + ': visible render deviation'
            result['models'].append(row)
            if i in [2, 5, 11]:
                page.locator('.comparison').screenshot(path=str(OUT / f'model-{i}.png'))
            print('browser GLB', i + 1, '/', len(models), flush=True)
        image_sources = page.evaluate("window.assetPreview.manifest.assets.filter(a=>a.codec==='webp-lossless').slice(0,12).map(a=>a.source)")
        for source in image_sources:
            page.evaluate('(s)=>window.assetPreview.selectSource(s)', source)
            row = page.evaluate('''() => {const values=['before-image','after-image'].map(id=>{const image=document.getElementById(id),c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const g=c.getContext('2d');g.drawImage(image,0,0);return {w:c.width,h:c.height,bytes:g.getImageData(0,0,c.width,c.height).data};});let max=0,total=0;for(let i=0;i<values[0].bytes.length;i++){const alpha=Math.max(values[0].bytes[i-i%4+3],values[1].bytes[i-i%4+3])/255;const d=Math.abs(values[0].bytes[i]-values[1].bytes[i])*(i%4===3?1:alpha);max=Math.max(max,d);total+=d;}return {width:values[0].w,height:values[0].h,sameDimensions:values[0].w===values[1].w&&values[0].h===values[1].h,maxVisibleChannelError:max,meanVisibleChannelError:total/values[0].bytes.length};}''')
            # Native PNG and WebP Canvas paths round premultiplied alpha differently.
            assert row['sameDimensions'] and row['maxVisibleChannelError'] <= 2.1 and row['meanVisibleChannelError'] < .25, source + ': image difference'
            result['images'].append({'source': source, **row})
        result['jsonFiles'] = page.evaluate('''async()=>{const all=window.assetPreview.manifest.assets.filter(a=>a.source.endsWith('.json'));for(const a of all){const value=await window.assetPreview.loader.json(a.source);if(value===undefined)throw Error(a.source);}return all.length;}''')
        result['audioFiles'] = page.evaluate('''async()=>{const context=new AudioContext({sampleRate:48000});const all=window.assetPreview.manifest.assets.filter(a=>/\\.(ogg|mp3)$/.test(a.source));for(const a of all){const b=await window.assetPreview.loader.bytes(a.source);const decoded=await context.decodeAudioData(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));if(!decoded.length||decoded.numberOfChannels>2)throw Error(a.source);}await context.close();return all.length;}''')
        page.evaluate("window.assetPreview.selectSource('design/motion/hoops.json')")
        row = compare_canvases(page)
        assert row['meanChannelError'] < .5
        result['motionPixels'] = row
        page.locator('.comparison').screenshot(path=str(OUT / 'motion.png'))
        page.set_viewport_size({'width': 390, 'height': 844})
        page.evaluate("window.assetPreview.selectSource('assets/hoops-tall/guard.glb')")
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile horizontal overflow'
        page.screenshot(path=str(OUT / 'phone.png'), full_page=True)
        result['mobileViewport'] = '390x844; no horizontal overflow'
        assert not result['errors'], result['errors']
        assert not result['remoteRequests'], result['remoteRequests']
        assert not result['forbiddenRequests'], result['forbiddenRequests']
        assert not result['workers'], result['workers']
        result['pass'] = True
        browser.close()
except Exception as error:
    result['pass'] = False
    result['failure'] = str(error)
finally:
    server.shutdown()
    (OUT / 'browser.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'pass': result.get('pass'), 'models': len(result['models']), 'json': result['jsonFiles'], 'audio': result['audioFiles'], 'failure': result.get('failure')}))
if not result.get('pass'):
    raise SystemExit(1)
