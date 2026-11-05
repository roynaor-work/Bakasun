"""Capture actual local main with network blocked. python tools/capture.py 01"""
import sys, json, fcntl
from pathlib import Path
from playwright.sync_api import sync_playwright
from common import *

ROUTES = [('bakasun','index.html#/today'),('workout','workout/index.html'),('island','workout/island/index.html'),('north','north/index.html')]

def prepare(page,app,iteration,base):
    if iteration=='01':return
    if app=='bakasun':
        if iteration=='02':
            page.goto(base+'index.html#/calls',wait_until='load');page.locator('#new').click()
        elif iteration=='03':
            page.evaluate("""async () => {const {db}=await import('./js/store.js');const {default:Office}=await import('./js/logic/office.js');db.importJson(JSON.stringify({settings:{bizLegal:'עסק סינתטי',bizId:'',bizAddress:'',bizPhone:'',bizEmail:'',signer:'חתימה סינתטית',invoiceEmail:'',invoiceName:'בדיקה'},clients:[{id:'audit-client',name:'לקוח סינתטי',contact:'בדיקה',phone:'',email:'',updated:'2026-11-05'}],cases:[{id:'audit-case',clientId:'audit-client',client:'אירוע סינתטי',status:Office.STATUS.lead,date:'2026-11-05',kind:'',updated:'2026-11-05'}]}))}""")
            page.goto(base+'index.html#/case/audit-case',wait_until='load')
        elif iteration=='04':page.goto(base+'index.html#/dashboard',wait_until='load')
        else:page.goto(base+'index.html#/calendar',wait_until='load')
    elif app=='workout':
        page.goto(base+'workout/index.html#/'+({'02':'settings','03':'parent','04':'exercises','05':'history'}.get(iteration,'home')),wait_until='load')
    elif app=='island':
        page.wait_for_function('() => !!window.__island',timeout=90000)
        if page.locator('[data-action=avatar-start]').count():page.locator('[data-action=avatar-start]').click()
        page.evaluate('window.__island.engine.skipTutorial()')
        if iteration=='03':page.evaluate('window.__island.ui.activityInterface.menu()')
        elif iteration=='04':
            page.goto(base+'workout/island/tools/perf-hoops.html?dev=1&dur=3600&hoopsAuto=1&hoopsQuality=1&seed=4242',wait_until='load')
            page.wait_for_function('() => window.__session?.snapshot?.renderMetrics?.calls>0',timeout=120000)
    elif app=='north':
        if page.locator('#g-yes').count():page.locator('#g-yes').click()
        page.locator('[data-add]').first.click()
        if iteration in ['03','05']:page.goto(base+'north/index.html#/checkout',wait_until='load')
        elif iteration=='04':
            href=page.locator('#grid a[href^="#/p/"]').first.get_attribute('href')
            page.goto(base+'north/index.html'+href,wait_until='load')
        else:page.locator('#cartbtn').click()
    page.wait_for_timeout(500)

def main():
    iteration = sys.argv[1]
    lock=open('/tmp/bakasun-audit-capture-'+iteration+'.lock','w')
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    dest = OUT/'iterations'/iteration; dest.mkdir(parents=True, exist_ok=True)
    result = {'started':stamp(),'baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
      'conditions':{'externalNetwork':'blocked','deviceScaleFactor':1,'cpuThrottle':1,'far':'screenshot-only CSS page zoom 67%; near 100%','csp':'shipped HTML unchanged; no injected response headers','privacyMasks':MASKS},'pages':[]}
    with server() as base, sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROMIUM, headless=True, args=FLAGS)
        result['chromium'] = browser.version
        for w,h in [(390,844),(844,390)]:
            for app,path in ROUTES:
                blocked=[]; errors=[]
                ctx=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,is_mobile=True,has_touch=True,locale='he-IL',timezone_id='Asia/Jerusalem',service_workers='block')
                block_external(ctx,base,blocked); ctx.add_init_script(OBSERVERS)
                page=ctx.new_page(); page.on('pageerror',lambda e:errors.append(str(e)))
                entry={'app':app,'path':path,'size':[w,h]}
                try:
                    initialPath=path+('?dev=1' if app=='island' and iteration!='01' else '')
                    page.goto(base+initialPath,wait_until='load',timeout=90000)
                    page.wait_for_timeout(5000 if app=='island' else 1200)
                    prepare(page,app,iteration,base)
                    entry['actualPath']=page.url.split('/Bakasun/')[-1]
                    entry['snapshot']=snapshot(page)
                    entry['axe']=axe(page)
                    shots(page,dest,f'{app}-{w}x{h}',app)
                    entry['screenshots']=[f'{app}-{w}x{h}-{z}.jpg' for z in ['near','far']]
                except Exception as e: entry['harnessError']=str(e)
                entry['pageErrors']=errors; entry['externalBlocked']=blocked
                result['pages'].append(entry); write_json(dest/'capture.json',result)
                print(json.dumps({'app':app,'size':[w,h],'axe':[(v['id'],len(v['nodes'])) for v in entry.get('axe',{}).get('violations',[])],'errors':errors,'harnessError':entry.get('harnessError')},ensure_ascii=False),flush=True)
                ctx.close()
        browser.close()
    result['finished']=stamp();write_json(dest/'capture.json',result)

if __name__=='__main__': main()
