"""Harmless DOM execution markers and malformed synthetic backup probes."""
from playwright.sync_api import sync_playwright
from common import *

MARK = '<img src="audit-missing" onerror="window.__auditExecuted=(window.__auditExecuted||0)+1">'

def main():
    out=OUT/'iterations/02';out.mkdir(parents=True,exist_ok=True)
    report={'started':stamp(),'conditions':'fresh contexts, external requests blocked, original CSP, local markers only','cases':[]}
    with server() as base,sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        def new():
            c=browser.new_context(viewport={'width':390,'height':844},locale='he-IL',timezone_id='Asia/Jerusalem',service_workers='block')
            block_external(c,base,[]);c.add_init_script(OBSERVERS)
            p=c.new_page();p.set_default_timeout(15000)
            return c,p
        # The exact old calls/notes XSS paths, plus escaped labels in other screens.
        c,p=new();p.goto(base+'index.html#/today',wait_until='load')
        result=p.evaluate("""async marker => {
          const {db}=await import('./js/store.js');
          const count=db.importJson(JSON.stringify({
            calls:[{id:'audit-call',name:marker,status:'todo',attempts:marker,updated:'2999-01-01'}],
            notes:[{id:'audit-note',text:marker,about:'client',aboutLabel:marker,aboutId:'bad\" onclick=\"window.__auditExecuted=1',updated:'2999-01-01'}],
            clients:[{id:'audit-client',name:marker,updated:'2999-01-01'}],
            tasks:[{id:'audit-task',title:marker,status:'todo',priority:'normal',updated:'2999-01-01'}]}));
          return {count,badId:db.get('notes','audit-note').aboutId,attempts:db.get('calls','audit-call').attempts};
        }""",MARK)
        checks=[]
        for route in ['calls','notes','clients','tasks']:
            p.evaluate('(r)=>location.hash="#/"+r',route);p.wait_for_timeout(350)
            checks.append({'route':route,**p.evaluate("""() => ({executed:window.__auditExecuted||0,inlineHandlers:document.querySelectorAll('#app [onerror],#app [onclick]').length,markerImages:document.querySelectorAll('#app img[src="audit-missing"]').length,renderError:!!document.querySelector('#app > .warnbox')})""")})
        report['cases'].append({'name':'bakasun-old-XSS-controls','import':result,'routes':checks});c.close()
        # Import validates IDs but not the shape of a task priority. UI catches the
        # error and displays a warning; the malformed row remains persisted.
        c,p=new();p.goto(base+'index.html#/tasks',wait_until='load')
        r=p.evaluate("""async () => {const {db}=await import('./js/store.js');const count=db.importJson(JSON.stringify({tasks:[{id:'audit-poison',title:'בדיקה סינתטית',status:'todo',priority:{bad:true},updated:'2999-01-01'}]}));return {count,type:typeof db.get('tasks','audit-poison').priority}}""")
        p.wait_for_timeout(500);r['warning']=p.locator('#app > .warnbox').all_text_contents()
        p.reload(wait_until='load');p.wait_for_timeout(400);r['afterReloadWarning']=p.locator('#app > .warnbox').all_text_contents()
        shots(p,out,'bakasun-poison-390x844','bakasun')
        p.set_viewport_size({'width':844,'height':390});shots(p,out,'bakasun-poison-844x390','bakasun')
        report['cases'].append({'name':'bakasun-backup-type-confusion','result':r});c.close()
        # Test CSP enforcement directly. DevTools evaluation runs regardless of
        # CSP, so only the inserted script's marker is used as the outcome.
        for app,route in [('bakasun','index.html'),('workout','workout/index.html'),('island','workout/island/index.html'),('north','north/index.html')]:
            c,p=new();p.goto(base+route,wait_until='load')
            r=p.evaluate("""async () => {const s=document.createElement('script');s.textContent='window.__auditInlineRan=1';document.body.append(s);await new Promise(r=>setTimeout(r,100));return {metaPolicy:!!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),executed:window.__auditInlineRan||0,csp:window.__audit.csp}}""")
            report['cases'].append({'name':app+'-CSP-inline-marker','result':r});c.close()
        # Local-state sinks are explicitly NOT claimed as remote entry points.
        c,p=new();p.goto(base+'north/index.html',wait_until='load')
        p.evaluate("""() => {localStorage.setItem('north.adult','1');localStorage.setItem('north.cart.v1',JSON.stringify([{key:'audit-item',id:'audit-item',name:'בדיקה סינתטית',price:1,qty:1,img:'audit-missing\" onerror=\"window.__auditExecuted=1'}]));}""")
        p.reload(wait_until='load');p.locator('#cartbtn').click();p.wait_for_timeout(300)
        report['cases'].append({'name':'north-local-state-XSS','precondition':'attacker already controls same-origin localStorage; no remote delivery established','result':p.evaluate("() => ({executed:window.__auditExecuted||0,handlers:document.querySelectorAll('#drawer [onerror]').length})")});c.close()
        c,p=new();p.goto(base+'workout/index.html',wait_until='load')
        p.evaluate("""() => localStorage.setItem('kidfit.facePic','audit-missing\" onerror=\"window.__auditExecuted=1')""")
        p.goto(base+'workout/index.html#/settings',wait_until='load');p.wait_for_timeout(600)
        report['cases'].append({'name':'workout-local-state-XSS','precondition':'attacker already controls same-origin localStorage; no remote delivery established','result':p.evaluate("() => ({executed:window.__auditExecuted||0,handlers:document.querySelectorAll('#app [onerror]').length})")});c.close()
        # Header absence is observed locally only; static GitHub Pages cannot
        # be assumed to add an application-specific CSP to these documents.
        for route in ['index.html','workout/index.html','workout/island/index.html','north/index.html']:
            import urllib.request
            with urllib.request.urlopen(base+route) as response:
                report['cases'].append({'name':'response-security-headers','path':route,'headers':{k:response.headers.get(k) for k in ['Content-Security-Policy','X-Content-Type-Options','Referrer-Policy','Permissions-Policy','X-Frame-Options']}})
        browser.close()
    report['finished']=stamp();write_json(out/'security.json',report)
    for case in report['cases']:print(json.dumps(case,ensure_ascii=False))

if __name__=='__main__':main()
