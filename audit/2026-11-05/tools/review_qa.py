"""Validate the local review; managed-policy fallback fulfils files without network."""
import sys
from PIL import Image
from playwright.sync_api import sync_playwright
from common import *

def main():
    iteration=sys.argv[1] if len(sys.argv)>1 else '06';folder=OUT/'iterations'/iteration;folder.mkdir(parents=True,exist_ok=True)
    virtual='--virtual-offline' in sys.argv
    r={'started':stamp(),'conditions':('offline=true; all URL requests fulfilled from audit files in memory, no HTTP server or network continuation; file:// remains blocked by managed browser policy' if virtual else 'file://, context offline=true, no HTTP server; original local review CSP; keyboard, axe and screenshots'),'pages':[],'sourceAnchors':[],'imageDimensions':[]}
    findings=json.loads((OUT/'findings.json').read_text())
    for f in findings:
        for s in f['sources']:
            p=ROOT/s['file'];r['sourceAnchors'].append({'finding':f['id'],'path':s['file'],'line':s['line'],'valid':p.is_file() and 0<s['line']<=len(p.read_text().splitlines())})
        for rel in f['evidence']:
            r['sourceAnchors'].append({'finding':f['id'],'evidence':rel,'valid':(OUT/rel).is_file()})
    for p in (OUT/'iterations').rglob('*.jpg'):
        import re
        m=re.search(r'(390x844|844x390)',p.name)
        if m:
            wanted=tuple(map(int,m.group(1).split('x')))
            with Image.open(p) as im:r['imageDimensions'].append({'path':str(p.relative_to(OUT)),'size':list(im.size),'valid':im.size==wanted})
    with sync_playwright() as pw:
        b=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        for w,h in [(390,844),(844,390)]:
            errors=[];requests=[];fulfilled=[];blocked=[];c=b.new_context(viewport={'width':w,'height':h},locale='he-IL',service_workers='block');c.set_offline(True);c.add_init_script(OBSERVERS)
            if virtual:
                import mimetypes
                def local_only(route):
                    u=urlsplit(route.request.url)
                    target=(ROOT/unquote(u.path).removeprefix('/Bakasun/')).resolve()
                    if u.netloc=='audit.invalid' and target.is_relative_to(OUT) and target.is_file():
                        fulfilled.append(str(target.relative_to(OUT)));route.fulfill(body=target.read_bytes(),content_type=mimetypes.guess_type(target.name)[0] or 'application/octet-stream')
                    else:blocked.append(route.request.url);route.abort('blockedbyclient')
                c.route('**/*',local_only)
            p=c.new_page();p.on('pageerror',lambda e:errors.append(str(e)));p.on('request',lambda req:requests.append(req.url))
            row={'size':[w,h],'checks':[]}
            def check(name,value):row['checks'].append({'name':name,'pass':bool(value)})
            try:
                p.goto('http://audit.invalid/Bakasun/audit/2026-11-05/index.html' if virtual else (OUT/'index.html').as_uri(),wait_until='load');p.wait_for_timeout(250)
                p.keyboard.press('Tab');check('skip-link-first',p.evaluate('() => document.activeElement.classList.contains("skip")'))
                p.keyboard.press('Enter');check('skip-link-focuses-main',p.evaluate('() => document.activeElement.id==="main"'))
                check('all-finding-cards',p.locator('details.finding').count()==len(findings))
                check('no-document-overflow',p.evaluate('()=>document.documentElement.scrollWidth<=innerWidth'))
                p.locator('#search').fill('A01');check('search-exact-id',p.locator('.finding:not([hidden])').count()==1)
                p.locator('#A01 summary').focus();p.keyboard.press('Enter');check('keyboard-opens-finding',p.locator('#A01').get_attribute('open') is not None)
                p.locator('#search').fill('')
                for app in ['bakasun','workout','island','north']:
                    present=p.locator('#app-filter option[value="'+app+'"]').count()==1
                    check('app-option-'+app,present)
                    if present:
                        p.locator('#app-filter').select_option(app)
                        check('app-filter-'+app,p.locator('.finding:not([hidden])').count()==sum(app in f['apps'] for f in findings))
                p.locator('#app-filter').select_option('')
                areas=sorted({f['area'] for f in findings})
                for area in areas:
                    p.locator('#area-filter').select_option(area)
                    check('area-filter-'+area,p.locator('.finding:not([hidden])').count()==sum(f['area']==area for f in findings))
                p.locator('#area-filter').select_option('')
                has_priority=p.locator('#priority-filter option[value="1"]').count()>0
                check('priority-option-present',has_priority)
                if has_priority:
                    p.locator('#priority-filter').select_option('1');check('priority-filter',p.locator('.finding:not([hidden])').count()==sum(f['priority']==1 for f in findings));p.locator('#priority-filter').select_option('')
                row['findingsAxe']=axe(p);shots(p,folder,f'review-findings-{w}x{h}','review')
                p.locator('[data-panel=gallery]').click();p.wait_for_timeout(100)
                check('gallery-populated',p.locator('.shot-pair').count()>0)
                for option in p.locator('#iteration-filter option').all():
                    round_id=option.get_attribute('value')
                    p.locator('#iteration-filter').select_option(round_id)
                    check('gallery-round-'+round_id+'-has-images',p.locator('.shot-pair').count()>0)
                review_round=p.evaluate('() => window.AUDIT.iterations.findLast(i=>i.shots.some(s=>s.app==="review"))?.id')
                check('review-round-available',review_round is not None)
                if review_round:p.locator('#iteration-filter').select_option(review_round)
                p.locator('#gallery-app').select_option('review')
                check('review-screenshots-filter',p.locator('.shot-pair').count()>0)
                p.locator('#orientation').select_option('844x390')
                check('review-landscape-filter',p.locator('.shot-pair').count()>0)
                p.locator('#gallery-app').select_option('');p.locator('#orientation').select_option('')
                p.locator('.shot-frames button').first.click();check('image-dialog-open',p.locator('#image-dialog').is_visible())
                for _ in range(8):p.keyboard.press('Tab');check('image-focus-stays-in-dialog',p.evaluate('()=>!!document.activeElement.closest("dialog")'))
                for _ in range(8):p.keyboard.press('Shift+Tab');check('image-reverse-focus-stays-in-dialog',p.evaluate('()=>!!document.activeElement.closest("dialog")'))
                p.keyboard.press('Escape');check('image-escape-closes',not p.locator('#image-dialog').is_visible())
                check('image-focus-returns',p.evaluate('() => !!document.activeElement.closest(".shot-frames")'))
                row['galleryAxe']=axe(p);shots(p,folder,f'review-gallery-{w}x{h}','review')
                p.locator('[data-panel=weights]').click();p.wait_for_timeout(100)
                check('GLB-table-complete',p.locator('#asset-table tbody tr').count()==236)
                check('platform-table-present',p.locator('#platform-table tbody tr').count()>=7)
                p.locator('#asset-search').fill('skier3');check('asset-filter',p.locator('#asset-table tbody tr').count()==1);p.locator('#asset-search').fill('')
                row['weightsAxe']=axe(p);shots(p,folder,f'review-weights-{w}x{h}','review')
                p.locator('[data-panel=coverage]').click();check('scores-table',p.locator('#coverage-table tbody tr').count()>=9)
                row['coverageAxe']=axe(p);shots(p,folder,f'review-coverage-{w}x{h}','review')
                row['csp']=p.evaluate('()=>window.__audit.csp')
                check('no-CSP-violations',not row['csp'])
                check('zero-outbound-network',not blocked and (virtual or not any(u.startswith(('http:','https:','ws:','wss:')) for u in requests)))
                check('no-page-errors',not errors)
            except Exception as e:row['harnessError']=str(e)
            row['pageErrors']=errors;row['locallyFulfilled']=fulfilled;row['blocked']=blocked;row['requests']=[u for u in requests if not u.startswith('file:')];r['pages'].append(row);write_json(folder/'review-qa.json',r);c.close()
        b.close()
    r['finished']=stamp();r['pass']=all(x['valid'] for x in r['sourceAnchors']+r['imageDimensions']) and all(not p.get('harnessError') and all(c['pass'] for c in p['checks']) and all(not p.get(k,{}).get('violations',[]) for k in ['findingsAxe','galleryAxe','weightsAxe','coverageAxe']) for p in r['pages'])
    write_json(folder/'review-qa.json',r);print('review QA pass:',r['pass'])
    for p in r['pages']:print(json.dumps({'size':p['size'],'failedChecks':[c['name'] for c in p['checks'] if not c['pass']],'harnessError':p.get('harnessError'),'axe':{k:[v['id'] for v in p.get(k,{}).get('violations',[])] for k in ['findingsAxe','galleryAxe','weightsAxe','coverageAxe']}},ensure_ascii=False))

if __name__=='__main__':main()
