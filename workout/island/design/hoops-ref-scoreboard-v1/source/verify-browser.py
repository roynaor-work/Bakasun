"""Repeatable Chromium/WebGL acceptance checks and captured review frames.
Run with the repository served on http://127.0.0.1:8765 (Python http.server).
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'verification'
URL='http://127.0.0.1:8765/workout/island/design/hoops-ref-scoreboard-v1/preview.html'

def verify():
    report={'url':URL,'browser':'system Chromium; headless ANGLE/SwiftShader','viewports':[],'checks':[],'errors':[],'failedRequests':[]}
    def check(label,condition):
        report['checks'].append({'name':label,'pass':bool(condition)})
        assert condition,label
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('requestfailed',lambda r:report['failedRequests'].append({'url':r.url,'error':r.failure}))
        page.on('response',lambda r:report['failedRequests'].append({'url':r.url,'status':r.status}) if r.status>=400 else None)
        page.goto(URL,wait_until='networkidle')
        page.wait_for_function('window.hoopsReview?.ready',timeout=60000)
        check('six embedded clip IDs',page.evaluate("hoopsReview.clips.slice().sort().join(',')")=='direction,foul,idle,run,three_points,whistle')
        page.evaluate("hoopsReview.seek(.1)")
        page.screenshot(path=str(OUT/'preview-desktop.png'))
        report['viewports'].append({'width':1440,'height':1000,'horizontalOverflow':page.evaluate('document.documentElement.scrollWidth>innerWidth')})
        page.get_by_role('button',name='השופט',exact=True).click()
        keyframes={'idle':.3,'run':.22,'whistle':.5,'foul':.5,'three_points':.5,'direction':.5}
        for clip,phase in keyframes.items():
            page.locator('[data-clip="'+clip+'"]').click()
            page.evaluate('(phase)=>hoopsReview.seek(phase)',phase)
            page.wait_for_timeout(240)
            check('select and seek '+clip,page.evaluate('hoopsReview.currentClip')==clip)
            check('selected clip control '+clip,page.locator('[data-clip="'+clip+'"]').get_attribute('aria-pressed')=='true')
            page.screenshot(path=str(OUT/(clip+'.png')))
        # The host model clock is deterministic; tick explicit elapsed seconds.
        result=page.evaluate("""() => {
          const s=hoopsReview.scoreboard;
          s.setState({home:108,away:99,period:3,gameSeconds:65,shotSeconds:14});s.start();s.tick(1.25);s.pause();
          const playing=s.snapshot();const shown=s.display();s.tick(4);const paused=s.snapshot();
          s.resetShot(24);const reset=s.snapshot();
          s.setState({gameSeconds:9,shotSeconds:.01});s.start();s.tick(.02);const expired=s.snapshot();
          const lamps=[];hoopsReview.scene.traverse(n=>{if(n.name.startsWith('lamp_'))lamps.push(n.material.emissiveIntensity)});
          const fields=[];hoopsReview.scene.traverse(n=>{if(n.name.startsWith('digit_')&&n.name.includes('home0'))fields.push(n.geometry.getAttribute('uv').getX(0))});
          return {playing,shown,paused,reset,expired,lamps,fields,digits:s.digitCount};
        }""")
        check('game clock elapsed delta',abs(result['playing']['gameSeconds']-63.75)<1e-8)
        check('shot clock elapsed delta',abs(result['playing']['shotSeconds']-12.75)<1e-8)
        check('pause preserves both clocks',result['paused']['gameSeconds']==result['playing']['gameSeconds'] and result['paused']['shotSeconds']==result['playing']['shotSeconds'])
        check('24 second reset',result['reset']['shotSeconds']==24)
        check('expiration stops at zero with red lamp',result['expired']['shotSeconds']==0 and not result['expired']['running'] and result['expired']['redRemaining']>0 and len(result['lamps'])==16 and all(v==2 for v in result['lamps']))
        check('52 live atlas digit quads',result['digits']==52 and len(result['fields'])==4 and all(abs(v-1/16)<1e-8 for v in result['fields']))
        report['clockProbe']=result
        page.locator('[data-view="board"]').click()
        page.evaluate('hoopsReview.scoreboard.flashRed(20)')
        page.wait_for_timeout(50)
        page.screenshot(path=str(OUT/'scoreboard-red.png'))
        page.locator('#reset-game').click()
        check('UI game reset clears lamp and stops clock',page.evaluate('hoopsReview.scoreboard.snapshot().redRemaining===0 && !hoopsReview.scoreboard.snapshot().running'))
        page.locator('#shot-14').click()
        check('UI 14-second reset',page.evaluate('hoopsReview.scoreboard.snapshot().shotSeconds')==14)
        page.locator('#red-test').click()
        check('UI lamp test',page.evaluate('hoopsReview.scoreboard.snapshot().redRemaining')>0)
        for width,height in [(390,844),(844,390)]:
            page.set_viewport_size({'width':width,'height':height})
            page.locator('[data-view="court"]').click()
            page.evaluate("hoopsReview.scoreboard.resetGame(134);hoopsReview.scoreboard.resetShot(24);hoopsReview.scoreboard.setState({home:72,away:68,period:4});hoopsReview.playClip('idle');hoopsReview.seek(.1)")
            page.wait_for_timeout(150)
            overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth')
            check('no horizontal overflow '+str(width),not overflow)
            page.screenshot(path=str(OUT/('preview-'+str(width)+'x'+str(height)+'.png')),full_page=True)
            report['viewports'].append({'width':width,'height':height,'horizontalOverflow':overflow})
        check('no uncaught browser exceptions',not report['errors'])
        check('no failed resource requests',not report['failedRequests'])
        report['render']=page.evaluate('hoopsReview.snapshot().render')
        browser.close()
    report['pass']=all(c['pass'] for c in report['checks'])
    return report

if __name__=='__main__':
    OUT.mkdir(exist_ok=True)
    result=verify()
    (OUT/'browser.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'pass':result['pass'],'checks':len(result['checks']),'errors':result['errors'],'failedRequests':result['failedRequests']}))
