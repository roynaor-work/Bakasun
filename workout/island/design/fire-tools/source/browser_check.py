"""Capture final GLBs under strict CSP. Start a repository-root HTTP server first."""
import asyncio
import json
import os
from pathlib import Path
import sys
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
URL=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8765/workout/island/design/fire-tools/preview.html'


async def main():
    manifest=json.loads((ROOT/'manifest.json').read_text())
    async with async_playwright() as p:
        executable=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium')
        browser=await p.chromium.launch(executable_path=executable,headless=True,args=[
            '--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page=await browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1)
        errors=[]
        failures=[]
        requests=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('requestfailed',lambda request:failures.append(request.url))
        page.on('request',lambda request:requests.append(request.url))
        page.on('response',lambda response:failures.append(f'{response.status}: {response.url}') if response.status>=400 else None)
        await page.goto(URL)
        await page.get_by_text('כל ארבעת הכלים נטענו בהצלחה.').wait_for(timeout=60000)
        state=await page.evaluate('() => window.fireTools')
        assert state['ready'] and len(state['models'])==4
        expected={m['file'].removesuffix('.glb'):m for m in manifest['models']}
        for actual in state['models']:
            model=expected[actual['id']]
            assert actual['triangles']==model['triangles']
            assert all(abs(a-b)<1e-6 for a,b in zip(actual['nozzle'],model['nozzle_m']))
        await page.screenshot(path=str(ROOT/'overview.png'),full_page=True)
        await page.get_by_role('button',name='הצגת נקודות יציאה').click()
        assert await page.get_by_role('button',name='הצגת נקודות יציאה').get_attribute('aria-pressed')=='true'
        await page.screenshot(path=str(ROOT/'nozzles.png'),full_page=True)
        await page.get_by_role('button',name='הצגת נקודות יציאה').click()
        await page.get_by_role('button',name='סיבוב',exact=True).click()
        assert await page.get_by_role('button',name='סיבוב',exact=True).get_attribute('aria-pressed')=='true'
        await page.get_by_role('button',name='סיבוב',exact=True).click()
        # The models rendered first; this deliberate probe proves CSP blocks a Wasm decoder.
        wasm=await page.evaluate('''async () => {
          try { await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0])); return 'allowed'; }
          catch (error) { return String(error); }
        }''')
        assert 'Content Security Policy' in wasm or 'unsafe-eval' in wasm
        await page.set_viewport_size({'width':390,'height':844})
        await page.get_by_role('heading',name='גלגל צינור חירום',exact=True).wait_for()
        # An animation frame lets ResizeObserver reframe each independent camera.
        await page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        assert await page.evaluate('() => document.documentElement.scrollWidth <= innerWidth')
        await page.screenshot(path=str(ROOT/'mobile.png'),full_page=True)
        assert not errors and not failures,(errors,failures)
        assert not any('draco' in url.lower() or '.wasm' in url.lower() for url in requests)
        from urllib.parse import urlparse
        assert all(urlparse(url).scheme in ('data','blob') or urlparse(url).netloc==urlparse(URL).netloc for url in requests)
        report={'passed':True,'browser':browser.version,
                'viewports':[[1600,1000],[390,844]],'models':state['models'],
                'page_errors':errors,'failed_requests':failures,'requests':requests,
                'wasm_blocked_by_csp':True,'wasm_probe':wasm,'no_decoder_requests':True,
                'rotate_button':True,'anchors_button':True,'mobile_no_horizontal_overflow':True}
        (ROOT/'browser-validation.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report,indent=2))
        await browser.close()


if __name__=='__main__':
    asyncio.run(main())
