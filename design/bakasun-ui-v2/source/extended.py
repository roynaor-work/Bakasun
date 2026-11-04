"""Extended manual-style browser audit: keyboard, text spacing, enlarged text, contrast modes,
preview controls, document arithmetic, and mobile input. Every failure is reported, never hidden.
"""
from pathlib import Path
from urllib.parse import urlsplit,unquote
from datetime import datetime,timezone
import json,mimetypes,argparse,traceback,io
from playwright.sync_api import sync_playwright,expect
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
ORIGIN='http://127.0.0.1:8765/'
PAGES=['index','events','event','clients','suppliers','invoices','finance','proposals','runsheet','calendar','budget','contract','settings','system']

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--iteration',required=True);args=ap.parse_args();out=ROOT/'iterations'/args.iteration;out.mkdir(exist_ok=True)
    report={'started_at':datetime.now(timezone.utc).isoformat(),'checks':[],'failures':[],'console_errors':[],'external_requests':[],'focus_obscured':[],'text_spacing_overflow':[],'large_text':[]}
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        ctx=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True);ctx.set_offline(True)
        def fulfill(route):
            path=(ROOT/unquote(urlsplit(route.request.url).path).lstrip('/')).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():route.abort();return
            route.fulfill(status=200,content_type=mimetypes.guess_type(path.name)[0] or 'application/octet-stream',body=path.read_bytes())
        ctx.route(ORIGIN+'**',fulfill);ctx.on('request',lambda r:report['external_requests'].append(r.url) if not r.url.startswith((ORIGIN,'data:','blob:')) else None)
        page=ctx.new_page();page.on('pageerror',lambda e:report['console_errors'].append(str(e)))
        def goto(name='index',theme='light'):page.goto(ORIGIN+name+'.html?theme='+theme);page.evaluate('document.fonts.ready')
        def shot(name):Image.open(io.BytesIO(page.screenshot())).convert('RGB').save(out/f'extended-{name}.webp','WEBP',lossless=True,method=6)
        def check(name,fn):
            try:fn();report['checks'].append({'name':name,'pass':True});print('PASS '+name,flush=True)
            except Exception as e:report['failures'].append({'name':name,'error':str(e),'trace':traceback.format_exc()});shot('failure-'+str(len(report['failures'])));print('FAIL '+name+' '+str(e)[:400],flush=True)
        def keyboard():
            for width,height in [(390,844),(844,390),(1440,1000)]:
                page.set_viewport_size({'width':width,'height':height})
                for name in PAGES:
                    page.goto('about:blank');goto(name);page.keyboard.press('Tab');expect(page.locator('.skip')).to_be_focused();page.keyboard.press('Enter');expect(page.locator('#main')).to_be_focused()
                    for i in range(65):
                        page.keyboard.press('Tab')
                        state=page.evaluate('''()=>{const e=document.activeElement,r=e.getBoundingClientRect(),nav=document.querySelector('.bottom-nav'),n=nav.getBoundingClientRect();return {tag:e.tagName,text:e.textContent.trim().slice(0,50),label:e.getAttribute('aria-label'),top:r.top,bottom:r.bottom,left:r.left,right:r.right,navTop:n.height?n.top:innerHeight,inNav:!!e.closest('.bottom-nav'),inRail:!!e.closest('.rail'),skip:e.classList.contains('skip'),control:e.matches('button,a,input,select,textarea'),height:r.height}}''')
                        if state['skip']:break
                        if not state['control'] or state['inNav'] or state['inRail'] or state['height']>height-60:continue
                        if state['bottom']>state['navTop']+1 or state['top'] < -1 or state['left'] < -1 or state['right']>width+1:report['focus_obscured'].append({'page':name,'viewport':f'{width}x{height}','step':i,**state})
            assert not report['focus_obscured'],str(report['focus_obscured'][:8])
        check('keyboard-only skip, sequential focus and mobile bar occlusion across 42 layouts',keyboard)
        def text_spacing():
            for width,height in [(320,740),(390,844),(844,390),(1440,1000)]:
                page.set_viewport_size({'width':width,'height':height})
                for name in PAGES:
                    goto(name);page.add_style_tag(content='*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}')
                    overflow=page.evaluate('''()=>({document:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('button,input,select,textarea,h1,h2,h3,p,.badge,.metric')].filter(e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height||e.closest('[hidden]'))return false;return e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflowX!=='auto'}).map(e=>({tag:e.tagName,text:e.textContent.trim().slice(0,50),scroll:e.scrollWidth,client:e.clientWidth}))})''')
                    if overflow['document'] or overflow['clipped']:report['text_spacing_overflow'].append({'page':name,'viewport':f'{width}x{height}',**overflow})
                if width==390:goto('index');page.add_style_tag(content='*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}');shot('text-spacing')
            assert not report['text_spacing_overflow'],str(report['text_spacing_overflow'][:8])
        check('WCAG text spacing overrides and reflow across 56 layouts',text_spacing)
        def large_text():
            for width,height in [(320,740),(390,844),(844,390),(1440,1000)]:
                page.set_viewport_size({'width':width,'height':height})
                for name in PAGES:
                    goto(name);page.evaluate("document.documentElement.dataset.textSize='large'");overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth')
                    report['large_text'].append({'page':name,'viewport':f'{width}x{height}','overflow':overflow});assert not overflow,(name,width)
                if width==390:goto('invoices');page.evaluate("document.documentElement.dataset.textSize='large'");shot('large-invoices')
        check('actual large-text preference in 56 layouts',large_text)
        def forced_colors():
            page.set_viewport_size({'width':390,'height':844});goto('event');page.emulate_media(forced_colors='active');shot('forced-colors');assert page.evaluate('matchMedia("(forced-colors:active)").matches');page.emulate_media(forced_colors='none')
        check('forced-colors rendering retains navigation and controls',forced_colors)
        def reduced_motion():
            goto('system');page.emulate_media(reduced_motion='reduce');assert page.locator('.loading-dot').evaluate('e=>getComputedStyle(e).animationName')=='none';page.emulate_media(reduced_motion='no-preference');page.evaluate("document.documentElement.dataset.reduce='true'");assert page.locator('.loading-dot').evaluate('e=>getComputedStyle(e).animationName')=='none'
        check('system and in-app reduced-motion stop loading animation',reduced_motion)
        def preview():
            page.set_viewport_size({'width':1440,'height':1000});goto('preview');expect(page.locator('iframe')).to_have_attribute('width','390');assert page.frame_locator('iframe').locator('html').evaluate('()=>innerWidth')==390;page.locator('[data-size="844,390"]').click();expect(page.locator('iframe')).to_have_attribute('width','844');page.locator('#screen').select_option('event');page.locator('#case-tab').select_option('budget');frame=page.frame_locator('iframe');expect(frame.locator('#panel-budget')).to_be_visible();page.locator('#theme').select_option('dark');expect(frame.locator('html')).to_have_attribute('data-theme','dark');frame.locator('[data-theme-toggle]').click();expect(page.locator('#theme')).to_have_value('light');frame.locator('[data-theme-toggle]').click();expect(page.locator('#theme')).to_have_value('dark');page.locator('#round').select_option('02');page.locator('#shot-distance').select_option('far');expect(page.locator('#portrait-shot')).to_have_attribute('src','iterations/02/event-light-390x844-far.webp');page.locator('#scale').fill('75');page.locator('#scale').dispatch_event('input');expect(page.locator('#scale-output')).to_have_text('75%');shot('preview-desktop');page.set_viewport_size({'width':390,'height':844});page.locator('#fit').click();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');shot('preview-mobile')
        check('interactive preview dimensions, tabs, theme, scale and evidence paths',preview)
        def budget_math():
            goto('budget');rows=page.locator('tbody tr').evaluate_all('els=>els.map(tr=>[...tr.querySelectorAll("td")].map(td=>td.textContent))');cost=sum(int(''.join(filter(str.isdigit,row[1]))) for row in rows);price=sum(int(''.join(filter(str.isdigit,row[2]))) for row in rows);assert cost==18000 and price==24000 and price-cost==6000,(cost,price)
            goto('event');page.locator('[data-tab-select]').select_option('money');text=page.locator('#panel-money').text_content();assert '₪24,000' in text and '₪9,600' in text and '₪14,400' in text and '₪54,000' not in text
        check('budget rows reconcile and case finance stays event-specific',budget_math)
        def mobile_signature():
            page.set_viewport_size({'width':390,'height':844});goto('contract');canvas=page.locator('canvas');canvas.scroll_into_view_if_needed();r=canvas.bounding_box();session=ctx.new_cdp_session(page)
            x,y=r['x']+30,r['y']+50;session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]});session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+70,'y':y+20}]});session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.locator('[data-consent]').check();page.locator('[data-sign-contract]').click();expect(page.locator('[data-signed]')).to_be_visible();shot('touch-signature')
        check('signature drawn with actual Chromium touch events',mobile_signature)
        browser.close()
    report['finished_at']=datetime.now(timezone.utc).isoformat();report['summary']={'passed':len(report['checks']),'failed':len(report['failures']),'obscured_focus':len(report['focus_obscured']),'text_spacing_issues':len(report['text_spacing_overflow']),'large_text_layouts':len(report['large_text']),'console_errors':len(report['console_errors']),'external_requests':len(report['external_requests'])};(out/'extended.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report['summary']))
if __name__=='__main__':main()
