"""Capture actual local Chromium renders, preserving independent iteration evidence.
Usage: python3 design/bakasun-ui-v2/source/review.py --iteration 01 [--axe /path/to/axe.min.js]
The browser is offline. Every asset is loaded from the delivered folder using file://.
Near = native viewport. Far = full document scaled 50%. Close = 150% CSS zoom detail.
"""
from pathlib import Path
from datetime import datetime,timezone
import argparse,json,hashlib,io,tarfile,time,sys,mimetypes
from urllib.parse import urlsplit,unquote
from playwright.sync_api import sync_playwright
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parent.parent
PAGES=['index','events','event','clients','suppliers','invoices','finance','proposals','runsheet','calendar','budget','contract','settings','system']
VIEWPORTS=[(390,844),(844,390),(1440,1000)]
FONT=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
def utc():return datetime.now(timezone.utc).isoformat()
def image_save(data,path,scale=1):
    im=Image.open(io.BytesIO(data)).convert('RGB')
    if scale!=1:im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
    im.save(path,'WEBP',lossless=True,method=6)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def run():
    ap=argparse.ArgumentParser();ap.add_argument('--iteration',required=True);ap.add_argument('--axe',default='/tmp/event-ui-review/node_modules/axe-core/axe.min.js');ap.add_argument('--extra-widths',action='store_true');args=ap.parse_args()
    out=ROOT/'iterations'/args.iteration
    if (out/'browser.json').exists():raise SystemExit('Iteration already exists; preserve evidence and use a new NN.')
    out.mkdir(parents=True,exist_ok=True)
    start=utc();report={'iteration':args.iteration,'started_at':start,'browser':'local Chromium','network':'offline; local disk responses fulfilled in memory; no sockets to origin', 'file_scheme_limitation':'Managed Chromium blocks file URLs by enterprise policy; HTTP-shaped requests are intercepted before networking','reference':'../bakasun-ui/screenshots','renders':[],'errors':[],'external_requests':[],'axe':[],'tabs':[],'captures':{'near':'native viewport, 100%','far':'full page scaled 50%','close':'150% CSS zoom, same viewport','content':'full-page overview; bottom navigation and skip link hidden only for this labeled documentation image'}}
    files=sorted([*ROOT.glob('*.html'),*ROOT.glob('assets/**/*')]);files=[p for p in files if p.is_file()]
    (out/'source.sha256.json').write_text(json.dumps({str(p.relative_to(ROOT)):sha(p) for p in files},indent=2)+'\n')
    with tarfile.open(out/'runtime-snapshot.tar.gz','w:gz') as tf:
        for p in files:tf.add(p,arcname=str(p.relative_to(ROOT)))
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,has_touch=True,is_mobile=True)
        context.set_offline(True)
        origin='http://127.0.0.1:8765/'
        def fulfill(route):
            name=unquote(urlsplit(route.request.url).path).lstrip('/')
            path=(ROOT/name).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():
                report['errors'].append('Missing local dependency: '+name);route.abort();return
            route.fulfill(status=200,content_type=mimetypes.guess_type(path.name)[0] or 'application/octet-stream',body=path.read_bytes())
        context.route(origin+'**',fulfill)
        context.on('request',lambda r:report['external_requests'].append(r.url) if not r.url.startswith((origin,'data:','blob:')) else None)
        page=context.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)))
        axe=Path(args.axe)
        viewports=VIEWPORTS+([(320,740),(360,800),(768,1024),(1024,768)] if args.extra_widths else [])
        for width,height in viewports:
            page.set_viewport_size({'width':width,'height':height})
            for theme in ['light','dark']:
                for name in PAGES:
                    page.goto(origin+name+'.html?theme='+theme);page.evaluate('document.fonts.ready');page.emulate_media(reduced_motion='reduce')
                    # Keep the initial viewport stable; author scripts may focus/scoll tabs.
                    page.evaluate('scrollTo(0,0)')
                    record=page.evaluate('''() => ({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
                    h1:document.querySelectorAll('h1').length,theme:document.documentElement.dataset.theme,
                    fontReady:document.fonts.check('14px "Event Hebrew"'),rtl:document.documentElement.dir==='rtl',
                    smallTargets:[...document.querySelectorAll('button,a,input,select,textarea')].filter(e=>{
                    let r=e.getBoundingClientRect();if(!r.width||!r.height||e.closest('[hidden]')||e.classList.contains('skip'))return false;
                    if(e.type==='checkbox'&&e.closest('label'))r=e.closest('label').getBoundingClientRect();
                    return r.height<43||r.width<43}).map(e=>({text:(e.textContent||e.getAttribute('aria-label')||e.tagName).trim().slice(0,60),height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width})),
                    clipped:[...document.querySelectorAll('button,a,input,select,textarea')].filter(e=>{
                    const r=e.getBoundingClientRect();if(!r.width||!r.height||e.closest('[hidden]')||e.classList.contains('skip'))return false;
                    if(e.closest('.tabs,.calendar-scroll'))return false;return r.left < -1||r.right>innerWidth+1}).map(e=>(e.textContent||e.tagName).trim().slice(0,60))})''')
                    record.update(page=name,viewport=f'{width}x{height}');report['renders'].append(record)
                    if width in [390,844]:
                        stem=f'{name}-{theme}-{width}x{height}'
                        image_save(page.screenshot(),out/f'{stem}-near.webp')
                        image_save(page.screenshot(full_page=True),out/f'{stem}-far.webp',.5)
                        if name in ['index','invoices','contract','budget']:
                            image_save(page.screenshot(full_page=True,style='.bottom-nav,.skip{display:none!important}'),out/f'{stem}-content.webp',.5)
                        if name in ['index','event','contract']:
                            page.evaluate("document.body.style.zoom='1.5'")
                            image_save(page.screenshot(),out/f'{stem}-close.webp')
                            page.evaluate("document.body.style.zoom=''")
                    if width==1440 and theme=='light':image_save(page.screenshot(full_page=True),out/f'{name}-desktop.webp')
                    if axe.exists() and width in [390,1440]:
                        page.add_script_tag(path=str(axe))
                        result=page.evaluate('''async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.length})),passes:r.passes.length}}''')
                        report['axe'].append({'page':name,'viewport':f'{width}x{height}','theme':theme,**result})
                if width in [390,844]:
                    page.goto(origin+'event.html?theme='+theme);page.evaluate('document.fonts.ready')
                    tabids=page.locator('[data-tab]').evaluate_all('els=>els.map(e=>e.dataset.tab)')
                    for tab in tabids:
                        if width==390:page.locator('[data-tab-select]').select_option(tab)
                        else:page.locator('[data-tab="'+tab+'"]').click()
                        panel=page.locator('#panel-'+tab);panel.scroll_into_view_if_needed()
                        info={'tab':tab,'theme':theme,'viewport':f'{width}x{height}','visible':panel.is_visible(),'scrollWidth':page.evaluate('document.documentElement.scrollWidth')}
                        if axe.exists():
                            page.add_script_tag(path=str(axe));info['violations']=page.evaluate('async()=>{const r=await axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa","wcag22aa"]}});return r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}')
                        report['tabs'].append(info)
                        image_save(page.screenshot(),out/f'tab-{tab}-{theme}-{width}x{height}-near.webp')
                        image_save(page.screenshot(full_page=True),out/f'tab-{tab}-{theme}-{width}x{height}-far.webp',.5)
                print(f'Rendered {width}x{height} {theme}',flush=True)
        browser.close()
    for theme in ['light','dark']:
        bg='#f7f5f0' if theme=='light' else '#181e1a';ink='#2c302e' if theme=='light' else '#f2f2e9'
        sheet=Image.new('RGB',(4*219+5*18,4*500+5*18),bg);draw=ImageDraw.Draw(sheet)
        for idx,name in enumerate(PAGES):
            im=Image.open(out/f'{name}-{theme}-390x844-near.webp');im.thumbnail((219,474),Image.Resampling.LANCZOS)
            col=3-idx%4;row=idx//4;x=18+col*237;y=18+row*518
            draw.text((x,y),name,font=FONT,fill=ink);sheet.paste(im,(x,y+25))
        sheet.save(out/f'contact-sheet-{theme}.webp','WEBP',lossless=True,method=6)
    issues=[r for r in report['renders'] if r['scrollWidth']>r['width'] or r['h1']!=1 or not r['fontReady'] or r['smallTargets'] or r['clipped']]
    report['summary']={'render_count':len(report['renders']),'layout_issues':len(issues),'axe_runs':len(report['axe']),'axe_violations':sum(len(r['violations']) for r in report['axe']),'tab_checks':len(report['tabs']),'tab_axe_violations':sum(len(t.get('violations',[])) for t in report['tabs']),'external_requests':len(report['external_requests']),'console_errors':len(report['errors'])}
    report['finished_at']=utc();(out/'browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report['summary']));print('LAYOUT ISSUES',json.dumps(issues,ensure_ascii=False)[:12000]);print('AXE ISSUES',json.dumps([r for r in report['axe'] if r['violations']],ensure_ascii=False)[:16000])
if __name__=='__main__':run()
