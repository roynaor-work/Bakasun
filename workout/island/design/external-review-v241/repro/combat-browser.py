from review_support import out_path
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
OUT=Path(out_path(''))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    context=browser.new_context(viewport={'width':844,'height':390},device_scale_factor=1,has_touch=True,is_mobile=True)
    page=context.new_page()
    page.set_default_timeout(120000)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('http://127.0.0.1:8766/workout/island/?dev=1',wait_until='networkidle')
    page.wait_for_function('() => window.__island?.view.metrics().avatarLoaded')
    page.locator('[data-action=avatar-start]').tap()
    page.evaluate('''() => {const {engine:e,data}=window.__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;for(const type of ['airbase']){let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place(type,x,z).ok)done=true;}}''')
    page.evaluate("window.__island.games.start('alienDefense',undefined,1)")
    if page.locator('[data-action=game-understood]').count():page.locator('[data-action=game-understood]').tap()
    page.wait_for_function("() => document.querySelector('.game-screen')?.dataset.starting==='false'")
    page.wait_for_function('() => window.__island.games.current?.session.snapshot?.special')
    page.evaluate('window.__island.games.current?.session.debug?.view?.degrade(true)')
    page.wait_for_timeout(500)
    def snap():return page.evaluate('window.__island.games.current.session.snapshot')
    def advance():
        at=page.evaluate('window.__island.games.current.session.snapshot.time')
        page.wait_for_function('(at) => window.__island.games.current.session.snapshot.time > at + .1',arg=at)
    advance()
    sw=page.locator('#special-switch')
    result={'errors':errors,'viewport':{'width':844,'height':390},'start':snap()['special'],'controls':page.locator('.alien-controls').evaluate("e=>[...e.querySelectorAll('button')].map(x=>({id:x.id,disabled:x.disabled,label:x.getAttribute('aria-label'),x:x.getBoundingClientRect().x,y:x.getBoundingClientRect().y,w:x.offsetWidth,h:x.offsetHeight}))")}
    sw.focus()
    page.keyboard.press('Enter')
    advance()
    result['afterEnter']=snap()['special']
    page.keyboard.press('Space')
    advance()
    result['afterSpace']=snap()['special']
    sw.click()
    advance()
    result['afterPointerClick']=snap()['special']
    page.screenshot(path=str(OUT/'combat-aliens-mobile.png'))
    (OUT/'combat-browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))
    browser.close()
