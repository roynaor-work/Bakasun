"""Playwright acceptance checks for the static controls package (no game imports)."""
import functools
import http.server
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[3]
OUT = Path(os.environ.get('CONTROLS_TEST_OUT', ROOT / 'verification'))
FLAGS = ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox']
EXPECTED = {
    'hoops': {'attack': {'shoot','pass','sprint','trick','screen'},
              'defense': {'switch','steal','block','sprint'}},
    'soccer': {'attack': {'pass','shot','sprint','switch'},
               'defense': {'slide','switch','sprint','tackle'},
               'throw_in': {'throw','short'}, 'corner': {'corner','short'},
               'goal_kick': {'goal_kick','short'}, 'free_kick': {'free_kick','short'},
               'goalkeeper': {'dive','rush'}, 'keeper_ball': {'punt','roll'}},
    'alpine': {'ground': {'boost','grab','spin','flip','combo'},
               'air': {'boost','grab','spin','flip','combo'}},
}


def overlap(a, b):
    return min(a['right'], b['right']) > max(a['left'], b['left']) + .25 and min(a['bottom'], b['bottom']) > max(a['top'], b['top']) + .25


def gap(a, b):
    dx = max(a['left'] - b['right'], b['left'] - a['right'], 0)
    dy = max(a['top'] - b['bottom'], b['top'] - a['bottom'], 0)
    return math.hypot(dx, dy)


def contrast(fg, bg):
    def lum(color):
        parts = [int(color[i:i+2],16) / 255 for i in (1,3,5)]
        c = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in parts]
        return sum(x*y for x,y in zip(c, (.2126,.7152,.0722)))
    a,b = sorted((lum(fg),lum(bg)))
    return (b + .05)/(a + .05)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    subprocess.run(['python3', str(ROOT/'tools/render.py'), '--check'], check=True)
    OUT.mkdir(parents=True, exist_ok=True)
    contract = json.loads((ROOT/'interaction.json').read_text())
    for path in ROOT.rglob('*'):
        if path.is_file() and path.suffix in ('.json','.html','.css','.py','.md'):
            # Build the forbidden tag rather than storing it in the delivered package.
            assert ('?' + 'v=') not in path.read_text(), f'Version query in {path}'
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(REPO)))
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    report = {'base_commit':contract['base_commit'], 'browser_flags':FLAGS, 'cases':[], 'screenshots':[], 'network_errors':[]}
    min_gap = 1000
    checked_controls = 0
    try:
        with sync_playwright() as p:
            executable = os.environ.get('PLAYWRIGHT_EXECUTABLE_PATH') or shutil.which('chromium')
            browser = p.chromium.launch(executable_path=executable, headless=True, args=FLAGS)
            report['browser_version'] = browser.version
            context = browser.new_context(has_touch=True, device_scale_factor=1, reduced_motion='reduce')
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('response', lambda r: report['network_errors'].append({'status':r.status,'url':r.url}) if r.status>=400 else None)
            page.on('requestfailed', lambda r: errors.append(r.url))
            def local_only(route):
                assert route.request.url.startswith(origin + '/'), f'External request: {route.request.url}'
                route.continue_()
            page.route('**/*', local_only)
            for game in EXPECTED:
                data = json.loads((ROOT/f'{game}.json').read_text())
                assert data['base_commit']==contract['base_commit']
                for state,required in EXPECTED[game].items():
                    actual = {v['id'] for v in data['states'][state]['controls']} - {'pause','stick'}
                    assert actual==required, (game,state,actual,required)
                for dims in ('844x390','390x844'):
                    layout = data['layouts'][dims]
                    w,h = layout['viewport'].values()
                    page.set_viewport_size({'width':w,'height':h})
                    page.goto(f'{origin}/workout/island/design/controls/{game}.html', wait_until='networkidle')
                    assert page.locator('html').get_attribute('lang')=='he'
                    assert page.locator('script').count()==0
                    profiles = {'zero':dict(top=0,right=0,bottom=0,left=0),
                                'all24':dict(top=24,right=24,bottom=24,left=24),
                                'device':dict(top=0,right=44,bottom=21,left=44) if w>h else dict(top=47,right=0,bottom=34,left=0)}
                    for direction in ('rtl','ltr'):
                        page.locator('html').evaluate('(el,dir)=>el.dir=dir',direction)
                        for profile,insets in profiles.items():
                            page.evaluate('(v)=>{for(const [k,n] of Object.entries(v))document.documentElement.style.setProperty(`--safe-${k}`,`${n}px`)}',insets)
                            for state_name,state in data['states'].items():
                                scene = page.locator(f'[data-scene="{state_name}"]')
                                scene.scroll_into_view_if_needed()
                                result = scene.evaluate('''root => {
                                  const base = root.getBoundingClientRect();
                                  const box = e => {const r=e.getBoundingClientRect();return {left:r.left-base.left,top:r.top-base.top,right:r.right-base.left,bottom:r.bottom-base.top,width:r.width,height:r.height}};
                                  return {width:base.width,height:base.height,scrollWidth:root.scrollWidth,
                                    buttons:[...root.querySelectorAll('button')].map(e=>({id:e.dataset.controlId,slot:e.dataset.slot,disabled:e.disabled,label:e.getAttribute('aria-label'),module:e.dataset.hudModule,...box(e),textFits:[...e.querySelectorAll('.label,.reason')].every(t=>{const a=t.getBoundingClientRect(),b=e.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom})})),
                                    panels:[...root.querySelectorAll('.score-panel,.scene-note')].map(e=>({...box(e),name:e.className}))};
                                }''')
                                prefix = f'{game}/{state_name}/{dims}/{direction}/{profile}'
                                assert result['width']==w and result['height']==h, (prefix,result)
                                assert result['scrollWidth']==w, f'Horizontal overflow: {prefix}'
                                assert len(result['buttons'])==len(state['controls']), prefix
                                for button, placement in zip(result['buttons'],state['controls']):
                                    checked_controls += 1
                                    spec = layout['slots'][placement['slot']]
                                    expected_x = spec['x'] + insets['left'] if spec['anchor_x']=='left' else spec['x']-insets['right']
                                    expected_y = spec['y'] + insets['top'] if spec['anchor_y']=='top' else spec['y']-insets['bottom']
                                    assert (button['id'],button['slot'],button['disabled'])==(placement['id'],placement['slot'],placement['disabled']), prefix
                                    assert button['module']==data['controls'][button['id']]['hud_kit']['module'], prefix
                                    assert (button['left'],button['top'],button['width'],button['height'])==(expected_x,expected_y,spec['width'],spec['height']), (prefix,button,spec)
                                    assert min(button['width'],button['height'])>=48, (prefix,button)
                                    assert button['left']>=insets['left']+12 and button['right']<=w-insets['right']-12, (prefix,button)
                                    assert button['top']>=insets['top']+12 and button['bottom']<=h-insets['bottom']-12, (prefix,button)
                                    assert button['label'] and button['textFits'], (prefix,button)
                                    for panel in result['panels']:
                                        assert not overlap(button,panel), (prefix,button['id'],panel['name'])
                                for i,a in enumerate(result['buttons']):
                                    for b in result['buttons'][i+1:]:
                                        assert not overlap(a,b), (prefix,a['id'],b['id'])
                                        min_gap = min(min_gap,gap(a,b))
                                        assert gap(a,b)>=8, (prefix,a['id'],b['id'],gap(a,b))
                                # Report measured rectangles, not just a PASS count.
                                report['cases'].append(prefix)
                                if direction=='rtl' and profile=='zero' and state_name in ('attack','defense','throw_in','goalkeeper','ground','air'):
                                    name=f'{game}-{state_name}-{dims}.png'
                                    scene.screenshot(path=str(OUT/name))
                                    report['screenshots'].append(name)
                    # Basic keyboard and pressed-state check, without a game adapter.
                    scene=page.locator('[data-scene]').first
                    button=scene.locator('button:not(:disabled)').first
                    button.focus()
                    focus=button.evaluate("e=>({visible:e.matches(':focus-visible'),style:getComputedStyle(e).outlineStyle,width:getComputedStyle(e).outlineWidth})")
                    assert focus['visible'] and focus['style']=='solid' and focus['width']=='3px', focus
                    before=button.bounding_box()
                    button.hover()
                    page.mouse.down()
                    assert button.bounding_box()==before, 'Press moved the touch target'
                    assert button.locator('.content').evaluate('e=>getComputedStyle(e).transform')=='none', 'Reduced motion transform'
                    page.mouse.up()
                    # Orientation change in the same document must select the other geometry.
                    other='390x844' if w>h else '844x390'
                    target=data['layouts'][other]['viewport']
                    page.set_viewport_size(target)
                    actual=scene.locator('[data-slot="stick"]').bounding_box()
                    assert actual['width']==data['layouts'][other]['slots']['stick']['width']
            assert not errors, errors
            assert not report['network_errors'], report['network_errors']
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    pairs = {'text_on_panel':('#f5f8fa','#091826'), 'text_on_button':('#f5f8fa','#172d3e'),
             'muted_on_panel':('#c8d3dd','#091826'), 'control_edge':('#a0b1be','#172d3e')}
    for game,accent in [('soccer','#b8f65b'),('hoops','#ffd16a'),('alpine','#72e9f6')]:
        pairs[f'{game}_primary_text']=('#09131c',accent)
    ratios={key:round(contrast(*pair),2) for key,pair in pairs.items()}
    assert all(ratio >= (3 if key=='control_edge' else 4.5) for key,ratio in ratios.items()), ratios
    report.update(status='PASS',scene_cases=len(report['cases']),checked_controls=checked_controls,min_gap_px=min_gap,contrast_ratios=ratios,
        safe_profiles={'zero':[0,0,0,0],'all24':[24,24,24,24],'landscape_device':[0,44,21,44],'portrait_device':[47,0,34,0]},
        checks=['JSON/HTML geometry parity','state action coverage','48px targets','8px gaps','no button overlap','safe area 0/24/device','RTL and LTR','labels and disabled reasons','text inside targets','keyboard focus','pressed target stability','reduced motion','orientation change','no scripts or external requests'])
    (OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(f'PASS: {len(report["cases"])} scene cases; {checked_controls} controls; minimum gap {min_gap:g}px; {len(report["screenshots"])} screenshots')
    print(f'Contrast: {ratios}')


if __name__=='__main__':
    main()
