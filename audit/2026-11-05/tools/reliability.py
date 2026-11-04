"""Local storage/cache fault injection; all data belongs to fresh audit contexts."""
from playwright.sync_api import sync_playwright
from common import *

def main():
    folder=OUT/'iterations/05';folder.mkdir(parents=True,exist_ok=True)
    report={'started':stamp(),'cases':[],'conditions':'fresh browser storage only; no remote calls, no real data; actual service worker source'}
    faults={}
    with server(faults) as base,sync_playwright() as pw:
        b=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        def new(sw='block'):
            c=b.new_context(viewport={'width':390,'height':844},locale='he-IL',timezone_id='Asia/Jerusalem',service_workers=sw)
            block_external(c,base,[]);c.add_init_script(OBSERVERS)
            return c,c.new_page()
        # A root worker update must not delete another application's offline data
        # or a pending share. Every marker here is created by this probe.
        c,p=new('allow');p.goto(base+'index.html',wait_until='load')
        before=p.evaluate("""async () => {for(const name of ['bakasun-share','island-assets-audit','workout-royiki-v1','audit-unrelated']){const c=await caches.open(name);await c.put('audit-marker',new Response('synthetic'))}return await caches.keys()}""")
        r=p.evaluate("""async () => {const r=await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;return {scope:r.scope.split('/').slice(-2).join('/')}}""")
        p.wait_for_function('() => !!navigator.serviceWorker.controller',timeout=90000)
        after=p.evaluate('async () => await caches.keys()')
        report['cases'].append({'name':'root-worker-cross-app-cache-deletion','before':before,'after':after,'deleted':[k for k in before if k not in after],**r})
        # The root worker writes an HTTP 503 response over a healthy cached module.
        p.evaluate('async () => {await fetch("./js/screens/tasks.js")}');p.wait_for_timeout(350)
        faults['/Bakasun/js/screens/tasks.js']=503
        response=p.evaluate('async () => (await fetch("./js/screens/tasks.js")).status');p.wait_for_timeout(350)
        statuses=p.evaluate("""async () => {const c=await caches.open('bakasun-v60');return {module:(await c.match('./js/screens/tasks.js'))?.status,index:(await c.match('./index.html'))?.status}}""")
        faults.clear();c.set_offline(True)
        p.reload(wait_until='load');p.wait_for_timeout(1000)
        report['cases'].append({'name':'root-worker-caches-error-response','networkStatus':response,'cachedStatus':statuses,'offlineHasHeading':p.locator('#app h1').count()>0})
        for w,h in [(390,844),(844,390)]:p.set_viewport_size({'width':w,'height':h});shots(p,folder,f'bakasun-error-cache-{w}x{h}','bakasun')
        c.close()
        # Corrupt local JSON: recovery copy and original-preservation controls.
        for app,key,route in [('bakasun','bakasun.v1','index.html'),('workout','kidfit.v1','workout/index.html'),('north','north.cart.v1','north/index.html'),('island','island.v1','workout/island/index.html?dev=1')]:
            c,p=new();c.add_init_script(f"localStorage.setItem({json.dumps(key)},'{{synthetic-corrupt');localStorage.setItem('north.adult','1');")
            p.goto(base+route,wait_until='load');p.wait_for_timeout(1800 if app!='island' else 5000)
            if app=='north':p.locator('[data-add]').first.click()
            elif app=='bakasun':p.evaluate("async () => {const {db}=await import('./js/store.js');db.setting('auditSetting','synthetic')}")
            p.wait_for_timeout(400)
            result=p.evaluate("""key => ({originalPreserved:localStorage.getItem(key)==='{synthetic-corrupt',backupKeys:Object.keys(localStorage).filter(k=>k.includes('corrupt')),bodyWarning:!!document.querySelector('#savebar,.storage-warning,[data-storage-warning]')})""",key)
            report['cases'].append({'name':app+'-corrupt-local-state','result':result});c.close()
        # Quota failure must be visible and must not pretend to persist changes.
        for app,key,route in [('bakasun','bakasun.v1','index.html'),('workout','kidfit.v1','workout/index.html'),('north','north.cart.v1','north/index.html')]:
            c,p=new();p.goto(base+route,wait_until='load');p.wait_for_timeout(300)
            if app=='north' and p.locator('#g-yes').count():p.locator('#g-yes').click()
            before=p.evaluate('(key)=>localStorage.getItem(key)',key)
            p.evaluate("""key => {const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('synthetic quota','QuotaExceededError');return old.call(this,k,v)}}""",key)
            if app=='bakasun':p.evaluate("async () => {const {db}=await import('./js/store.js');db.put('clients',{id:'audit-quota',name:'בדיקה סינתטית'})}")
            elif app=='workout':p.evaluate("async () => {const {store}=await import('./js/store.js?v=20261014-w2g-1');store.setProfile({name:'בדיקה סינתטית'})}")
            else:p.locator('[data-add]').first.click()
            p.wait_for_timeout(500)
            result=p.evaluate("""key => ({unchanged:localStorage.getItem(key),errorBar:!!document.querySelector('#savebar'),roleAlerts:[...document.querySelectorAll('[role=alert]')].filter(e=>e.getBoundingClientRect().height>0).length,cartCount:document.getElementById('cartn')?.textContent})""",key)
            result['storageUnchanged']=result.pop('unchanged')==before
            report['cases'].append({'name':app+'-quota-error','result':result});c.close()
        # Unknown order numbers must not claim that an order was received.
        c,p=new();p.goto(base+'north/index.html#/thanks/audit-nonexistent',wait_until='load')
        if p.locator('#g-yes').count():p.locator('#g-yes').click()
        report['cases'].append({'name':'north-fabricated-thanks-route','claimsReceived':'ההזמנה נקלטה' in p.locator('#view').inner_text()})
        c.close();b.close()
    report['finished']=stamp();write_json(folder/'reliability.json',report)
    for c in report['cases']:print(json.dumps(c,ensure_ascii=False))

if __name__=='__main__':main()
