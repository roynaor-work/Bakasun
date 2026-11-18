"""Original CC0. Reproducible SwiftShader audit, screenshots, and crowd A/B benchmark.
Run from any directory: python3 browser-check.py [http://127.0.0.1:8765]
Requires playwright + Pillow in the tool environment; no dependencies are vendored.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from urllib.parse import urlparse

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
PAGE = '/workout/island/design/tennis-crowd-3d-v1/'


def main(origin):
    result = {'date':datetime.now(timezone.utc).isoformat(), 'browserErrors':[],
              'failedRequests':[], 'cameras':[], 'filesFetched':[]}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'])
        context = browser.new_context(viewport={'width':1440,'height':1100},device_scale_factor=1)
        page = context.new_page()
        page.on('pageerror',lambda e:result['browserErrors'].append(str(e)))
        page.on('console',lambda m:result['browserErrors'].append(m.text) if m.type=='error' else None)
        page.on('requestfailed',lambda r:result['failedRequests'].append({'url':r.url,'failure':r.failure}))
        page.goto(origin+PAGE+'preview.html')
        page.wait_for_function('() => window.crowdPreview?.status.ready || window.crowdPreview?.status.errors.length',timeout=45000)
        result['status'] = page.evaluate('() => crowdPreview.status')
        assert result['status']['ready'], result['status']
        assert result['status']['modelsLoaded'] == 12
        assert result['status']['metrics']['instances'] == 600
        result['wasmCompilationBlocked'] = page.evaluate('''async () => {
          try {await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));return false;}
          catch(e) {return e instanceof WebAssembly.CompileError && /Content Security Policy|Wasm code generation disallowed/i.test(e.message);}
        }''')
        assert result['wasmCompilationBlocked']
        result['models'] = page.evaluate("async () => (await import('./load-check.mjs')).checkModels()")
        assert len(result['models']) == 12
        # Real HTTP fetch, byte count and hash of every deliverable already present.
        # verification.json and preview.webp produced at the end are checked on reruns.
        for path in sorted(p for p in ROOT.rglob('*') if p.is_file() and '__pycache__' not in p.parts):
            relative = path.relative_to(ROOT).as_posix()
            response = context.request.get(origin+PAGE+relative)
            data = response.body()
            assert response.ok and data == path.read_bytes(), relative
            result['filesFetched'].append({'file':relative,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        page.evaluate('() => {crowdPreview.pause=true;document.getElementById("auto").checked=false;}')
        with tempfile.TemporaryDirectory(prefix='crowd-shots-') as tmp:
            images = []
            for name in ['landscape','portrait','side','rear','close','roster']:
                page.get_by_role('button',name={'landscape':'משחק · רוחב','portrait':'משחק · גובה','side':'צד','rear':'מאחור','close':'תקריב','roster':'12 דמויות'}[name],exact=True).click()
                for celebration in [0,1]:
                    page.evaluate('(v) => crowdPreview.frame({seconds:1.3,celebration:v})', celebration)
                    shot = page.locator('canvas').screenshot()
                    import io
                    im = Image.open(io.BytesIO(shot)).convert('RGB')
                    assert len(im.getcolors(im.width*im.height)) > 40, 'blank scene'
                    if celebration == 1:
                        im.thumbnail((600,300))
                        panel=Image.new('RGB',(600,324),'#101f24');panel.paste(im,((600-im.width)//2,24))
                        ImageDraw.Draw(panel).text((12,6),name,fill='#d7ed9d');images.append(panel)
                    result['cameras'].append({'camera':name,'celebration':celebration,'rendered':True})
            montage=Image.new('RGB',(1200,972),'#101f24')
            for i,im in enumerate(images):montage.paste(im,((i%2)*600,(i//2)*324))
            montage.save(ROOT/'preview.webp',quality=66,method=6)
            result['benchmark'] = page.evaluate('() => crowdPreview.benchmark({samples:120,warmup:30})')
            # Exercise real controls and a narrow portrait canvas as well.
            page.get_by_role('checkbox',name='השוואה: האטלס הקיים').check()
            assert page.locator('#triangles').inner_text().replace(',','') == '1200'
            page.get_by_role('checkbox',name='השוואה: האטלס הקיים').uncheck()
            page.get_by_role('button',name='חגיגה',exact=True).click()
            page.set_viewport_size({'width':390,'height':844})
            page.get_by_role('button',name='משחק · גובה',exact=True).click()
            page.evaluate('() => crowdPreview.frame({seconds:2,celebration:1})')
            assert page.locator('canvas').bounding_box()['width'] <= 390
            result['mobileLayout'] = {'viewport':[390,844],'rendered':True,'hardwareDeviceTest':False}
        assert not result['browserErrors'], result['browserErrors']
        assert not result['failedRequests'], result['failedRequests']
        requests = page.evaluate('() => performance.getEntriesByType("resource").map(r=>r.name)')
        result['externalRequests'] = [url for url in requests if urlparse(url).scheme in ('http','https') and not url.startswith(origin+'/')]
        assert not result['externalRequests']
        browser.close()
    # Summarize validation from a separately installed official glTF Validator, if provided.
    validator = Path('/tmp/crowd-gltf-validation.json')
    if validator.exists(): result['khronosValidator'] = json.loads(validator.read_text())
    (ROOT/'verification.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'models':len(result['models']),'cameras':len(result['cameras']),
        'wasmBlocked':result['wasmCompilationBlocked'],'runs':result['benchmark']['runs']}))


if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('origin',nargs='?',default='http://127.0.0.1:8765')
    main(parser.parse_args().origin.rstrip('/'))
