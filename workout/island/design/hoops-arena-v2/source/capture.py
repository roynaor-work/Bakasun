"""Browser acceptance checks. Start an HTTP server at repo root, then run.
python3 workout/island/design/hoops-arena-v2/source/capture.py
Uses installed Playwright and /usr/bin/chromium (override CHROMIUM).
"""
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'verification'
URL = os.environ.get('ARENA_URL','http://127.0.0.1:8765/workout/island/design/hoops-arena-v2/preview.html')


async def main():
    errors=[];failed=[];external=[];results=[]
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,
            args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page=await browser.new_page(viewport={'width':844,'height':390},device_scale_factor=1)
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('console',lambda message:errors.append(message.text) if message.type=='error' else None)
        page.on('requestfailed',lambda request:failed.append({'url':request.url,'failure':request.failure}))
        page.on('request',lambda request:external.append(request.url) if not request.url.startswith(('http://127.0.0.1:8765/','blob:','data:')) else None)
        await page.goto(URL,wait_until='networkidle')
        await page.wait_for_function('window.__arenaV2?.stats.ready || window.__arenaV2?.stats.errors.length',timeout=120000)
        assert await page.evaluate('window.__arenaV2.stats.ready'), await page.evaluate('window.__arenaV2.stats.errors')
        for view in ('broadcast','court','hoop','ceiling'):
            await page.locator(f'[data-view="{view}"]').click()
            await page.wait_for_timeout(450)
            await page.screenshot(path=OUT/f'{view}-844x390.jpg',type='jpeg',quality=92)
            result=await page.evaluate('''() => ({...window.__arenaV2.stats,
                selected:document.querySelectorAll('[data-view][aria-pressed="true"]').length,
                canvas:[document.querySelector('canvas').clientWidth,document.querySelector('canvas').clientHeight],
                scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
                gl:window.__arenaV2.renderer.getContext().getError()})''')
            assert result['view']==view and result['selected']==1
            assert result['canvas']==[844,390] and result['scroll']==[844,390]
            assert result['gl']==0 and result['seats']>=1400
            results.append(result)
        # Compare real reflection enabled/disabled at an identical camera.
        await page.evaluate("window.__arenaV2.setView('court')")
        await page.evaluate('window.__arenaV2.setReflection(false)')
        await page.wait_for_timeout(250)
        await page.screenshot(path=OUT/'reflection-off-844x390.jpg',type='jpeg',quality=92)
        await page.evaluate('window.__arenaV2.setReflection(true)')
        await page.wait_for_timeout(250)
        await page.screenshot(path=OUT/'reflection-on-844x390.jpg',type='jpeg',quality=92)
        # Full bowl toggle, manual orbit, keyboard access and mobile layout.
        await page.evaluate("window.__arenaV2.setView('broadcast')")
        await page.locator('#roof').click()
        assert not await page.evaluate('window.__arenaV2.stats.cutaway')
        await page.locator('#roof').click()
        assert await page.evaluate('window.__arenaV2.stats.cutaway')
        target_before=await page.evaluate('window.__arenaV2.controls.target.toArray()')
        await page.locator('canvas').focus()
        await page.keyboard.press('ArrowRight')
        after=await page.evaluate('window.__arenaV2.controls.target.toArray()')
        assert target_before!=after
        before=await page.evaluate('window.__arenaV2.camera.position.toArray()')
        await page.mouse.move(370,190)
        await page.mouse.down()
        await page.mouse.move(430,200,steps=6)
        await page.mouse.up()
        assert before!=await page.evaluate('window.__arenaV2.camera.position.toArray()')
        await page.set_viewport_size({'width':390,'height':844})
        await page.evaluate("window.__arenaV2.setView('broadcast')")
        await page.wait_for_timeout(450)
        await page.screenshot(path=OUT/'broadcast-390x844.jpg',type='jpeg',quality=92)
        mobile=await page.evaluate('''() => ({viewport:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
            buttons:[...document.querySelectorAll('button')].map(b=>({text:b.textContent.trim(),width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))})''')
        assert mobile['scroll']==[390,844]
        assert all(b['height']>=42 for b in mobile['buttons'])
        await browser.close()
    report={'browser':'Chromium / SwiftShader software WebGL','desktopViewport':[844,390],
        'views':results,'mobile':mobile,'errors':errors,'failedRequests':failed,'externalRequests':external,
        'checks':['four camera controls','full bowl/cutaway toggle','mouse orbit','keyboard access','no overflow','reflection A/B','no external runtime requests']}
    (OUT/'browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    assert not errors and not failed and not external


if __name__=='__main__':asyncio.run(main())
