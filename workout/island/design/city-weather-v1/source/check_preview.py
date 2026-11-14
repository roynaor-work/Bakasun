"""Exercise actual review controls, images and CSP with system Chromium.

Starts its own loopback-only static server. No application data is touched.
CHROMIUM_PATH may override /usr/bin/chromium. Requires Python Playwright.
"""
import functools
import hashlib
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[3]
OUT=ROOT/"verification"
PATH="/workout/island/design/city-weather-v1/preview.html"


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass


def main():
    OUT.mkdir(exist_ok=True)
    server=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(Quiet,directory=str(REPO)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f"http://127.0.0.1:{server.server_port}{PATH}"
    result={"passed":False,"viewport":[844,390],"scenes":[],"rainIntensities":[],
            "fireworks":{},"celebrationColors":[],"errors":[],"externalRequests":[]}
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH","/usr/bin/chromium"),
                args=["--no-sandbox","--disable-dev-shm-usage"])
            context=browser.new_context(viewport={"width":844,"height":390},device_scale_factor=1,
                                        reduced_motion="no-preference",timezone_id="Asia/Jerusalem")
            page=context.new_page()
            page.on("pageerror",lambda e:result["errors"].append(str(e)))
            page.on("console",lambda m:result["errors"].append(m.text) if m.type=="error" else None)
            page.on("request",lambda r:result["externalRequests"].append(r.url) if not r.url.startswith(url.split(PATH)[0]+"/workout/island/design/city-weather-v1/") and not r.url.startswith("data:") else None)
            page.goto(url)
            page.evaluate("() => cityWeatherPreview.ready")
            assert page.locator('#scene').get_attribute('width')=='844'
            assert page.locator('#scene').get_attribute('height')=='390'
            for scene in ["clear","rain","snow","fog","sunset","night","celebration"]:
                page.locator(f'[data-scene="{scene}"]').click()
                page.evaluate("() => cityWeatherPreview.renderAt(.48)")
                assert page.locator(f'[data-scene="{scene}"]').get_attribute('aria-pressed')=='true'
                assert page.evaluate("() => cityWeatherPreview.getState().scene")==scene
                page.screenshot(animations="disabled",path=str(OUT/f"{scene}-844x390.png"))
                result["scenes"].append(scene)
            page.locator('#customize').click()
            assert page.locator('#settings').is_visible()
            for intensity in ['light','medium','heavy']:
                page.locator('#rain-intensity').select_option(intensity)
                page.evaluate("() => cityWeatherPreview.renderAt(.48)")
                assert page.evaluate("() => cityWeatherPreview.getState().scene")=='rain'
                page.locator('#close-settings').click()
                page.screenshot(animations="disabled",path=str(OUT/f"rain-{intensity}-844x390.png"))
                page.locator('#customize').click()
                result['rainIntensities'].append(intensity)
            for name in ['peony-gold','chrysanthemum-coral','ring-teal','willow-gold','heart-coral']:
                page.locator('#firework').select_option(name)
                assert page.evaluate("() => cityWeatherPreview.getState().firework")==name
                page.locator('#close-settings').click()
                page.evaluate("() => {cityWeatherPreview.setOptions({balloons:false,confetti:false});cityWeatherPreview.renderAt(.48);}")
                page.screenshot(animations="disabled",path=str(OUT/f"firework-{name}-844x390.png"))
                hashes=[]
                for n in range(12):
                    page.evaluate("t => cityWeatherPreview.renderAt(t)",(n+.5)/12)
                    pixels=page.locator('#scene').screenshot()
                    hashes.append(hashlib.sha256(pixels).hexdigest())
                assert len(set(hashes))==12,(name,"rendered frames repeat")
                result['fireworks'][name]={"framesRendered":12,"frameSha256":hashes}
                page.locator('#customize').click()
            for color in ['coral','gold','teal']:
                page.locator('#celebration-color').select_option(color)
                page.locator('#balloons').check();page.locator('#confetti').check()
                page.locator('#close-settings').click()
                page.evaluate("() => cityWeatherPreview.renderAt(.48)")
                page.screenshot(animations="disabled",path=str(OUT/f"celebration-{color}-844x390.png"))
                result['celebrationColors'].append(color)
                page.locator('#customize').click()
            # Every ambient layer can be switched on and off independently.
            for name in ['clouds','birds','butterflies','balloons','confetti']:
                page.locator('#'+name).uncheck()
                assert page.evaluate('(key) => cityWeatherPreview.getState()[key]',name) is False
                page.locator('#'+name).check()
                assert page.evaluate('(key) => cityWeatherPreview.getState()[key]',name) is True
            page.screenshot(animations="disabled",path=str(OUT/'controls-844x390.png'))
            page.keyboard.press('Escape')
            assert not page.locator('#settings').is_visible()
            assert page.locator('#customize').get_attribute('aria-expanded')=='false'
            page.evaluate("() => {cityWeatherPreview.setScene('snow');cityWeatherPreview.renderAt(.48);}")
            page.locator('#pause').click()
            assert not page.evaluate('() => cityWeatherPreview.getState().paused')
            page.wait_for_timeout(80)
            page.locator('#pause').click()
            page.wait_for_timeout(40)
            a=page.locator('#scene').screenshot();page.wait_for_timeout(120)
            assert a==page.locator('#scene').screenshot(),'Pause did not stop animation'
            assert page.evaluate('() => cityWeatherPreview.pendingAnimationFrame')==0
            result['pauseStopsAnimation']=True
            # A hidden tab cancels its RAF; bringing it back does not jump time.
            page.evaluate("() => cityWeatherPreview.play()")
            page.evaluate("() => {Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));}")
            assert page.evaluate('() => cityWeatherPreview.pendingAnimationFrame')==0
            page.evaluate("() => {delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));cityWeatherPreview.pause();}")
            result['hiddenTabStopsAnimation']=True
            for width,height in [(422,195),(390,844)]:
                page.set_viewport_size({"width":width,"height":height})
                page.wait_for_function("({w,h}) => {const r=document.querySelector('#viewport').getBoundingClientRect();return r.width<=w+.1&&r.height<=h+.1;}",arg={"w":width,"h":height})
                page.evaluate("() => {cityWeatherPreview.setScene('sunset');cityWeatherPreview.renderAt(.48);}")
                rect=page.locator('#viewport').bounding_box()
                assert rect['width']<=width+.1 and rect['height']<=height+.1
                assert abs(rect['width']/rect['height']-844/390)<.01
                page.screenshot(animations="disabled",path=str(OUT/f"fit-{width}x{height}.png"))
            result['responsiveFit']=[[422,195],[390,844]]
            # The package also opens locally without fetch, a server or a CDN.
            local=browser.new_page(viewport={"width":844,"height":390})
            local.on('pageerror',lambda e:result['errors'].append('file: '+str(e)))
            try:
                local.goto((ROOT/'preview.html').as_uri())
                local.evaluate('() => cityWeatherPreview.ready')
                local.evaluate('() => cityWeatherPreview.renderAt(.48)')
                local.screenshot(animations="disabled",path=str(OUT/'file-preview-844x390.png'))
                result['fileProtocolOpens']=True
            except Exception as error:
                if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):raise
                result['fileProtocolOpens']=None
                result['fileProtocolLimitation']='file:// navigation is blocked by the managed browser policy; HTTP verified; no policy bypass attempted.'
            reduce=browser.new_context(viewport={"width":844,"height":390},reduced_motion='reduce')
            still=reduce.new_page();still.goto(url);still.evaluate('() => cityWeatherPreview.ready')
            still.wait_for_timeout(60)
            assert still.evaluate('() => cityWeatherPreview.getState().paused')
            assert still.evaluate('() => cityWeatherPreview.getState().reducedMotion')
            still.locator('[data-scene="celebration"]').click()
            a=still.locator('#scene').screenshot();still.wait_for_timeout(180)
            assert a==still.locator('#scene').screenshot()
            assert still.evaluate('() => cityWeatherPreview.pendingAnimationFrame')==0
            still.screenshot(animations="disabled",path=str(OUT/'reduced-motion-844x390.png'))
            result['reducedMotionStatic']=True
            assert not result['errors'],result['errors']
            assert not result['externalRequests'],result['externalRequests']
            result['passed']=True
            result['browser']=browser.version
            browser.close()
    finally:
        server.shutdown()
        (OUT/'browser.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='fireworks'},indent=2))


if __name__=='__main__':main()
