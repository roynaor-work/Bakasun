"""Complete keyboard samples in the workout and island, using fresh synthetic contexts."""
from playwright.sync_api import sync_playwright
from common import *
def main():
    out=OUT/'iterations/15';out.mkdir(parents=True,exist_ok=True)
    r={'started':stamp(),'conditions':'Original application code; no source changes, synthetic fresh contexts, external requests blocked. Native link activation, exercise-card tab reachability and island modal focus behaviour.','cases':[]}
    with server() as base,sync_playwright() as pw:
        b=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        for w,h in [(390,844),(844,390)]:
            for app,path in [('workout','workout/index.html#/exercises'),('island','workout/island/index.html?dev=1')]:
                c=b.new_context(viewport={'width':w,'height':h},service_workers='block');block_external(c,base,[]);c.add_init_script(OBSERVERS);c.add_init_script("Object.defineProperty(navigator,'connection',{value:{saveData:true},configurable:true})")
                p=c.new_page();row={'app':app,'size':[w,h]};errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
                try:
                    p.goto(base+path,wait_until='load',timeout=90000)
                    if app=='workout':
                        p.wait_for_selector('.excard[data-go]')
                        row['cards']=p.locator('.excard[data-go]').evaluate_all("es=>es.map(e=>({tag:e.tagName,role:e.getAttribute('role'),tabIndex:e.tabIndex,route:e.dataset.go,nativeChildren:e.querySelectorAll('button,a[href],input,select,textarea').length}))")
                        row['programmaticFocusReachedCard']=p.locator('.excard[data-go]').first.evaluate('e=>{e.focus();return document.activeElement===e}')
                        row['tabReachedCard']=[]
                        for _ in range(40):p.keyboard.press('Tab');row['tabReachedCard'].append(p.evaluate('()=>!!document.activeElement.closest(".excard[data-go]")'))
                        row['nativeNavLinks']=p.locator('#nav a[href]').count()
                        if row['nativeNavLinks']:
                            p.locator('#nav a[href]').first.focus();dest=p.locator('#nav a[href]').first.get_attribute('href');p.keyboard.press('Enter');p.wait_for_timeout(150);row['nativeLinkEnterWorks']=p.evaluate('location.hash')==dest
                            p.goto(base+path,wait_until='load')
                    else:
                        p.wait_for_function('() => !!window.__island',timeout=90000)
                        if p.locator('[data-action=avatar-start]').count():p.locator('[data-action=avatar-start]').click()
                        p.evaluate('()=>{window.__island.engine.skipTutorial();const e=document.querySelector("button");e.focus();window.__auditFocusBefore=e;window.__island.ui.showParent()}');p.wait_for_timeout(150)
                        row['dialogCount']=p.locator('[role=dialog]').count();row['tabsInside']=[]
                        for key in ['Tab']*18+['Shift+Tab']*18:p.keyboard.press(key);row['tabsInside'].append(p.evaluate('()=>!!document.activeElement.closest("[role=dialog]")'))
                        shots(p,out,f'island-parent-{w}x{h}','island');p.keyboard.press('Escape');row['escapeCloses']=p.locator('[role=dialog]').count()==0;row['focusReturned']=p.evaluate('()=>document.activeElement===window.__auditFocusBefore')
                    if app=='workout':shots(p,out,f'workout-exercises-{w}x{h}','workout')
                except Exception as e:row['harnessError']=str(e)
                row['pageErrors']=errors;r['cases'].append(row);write_json(out/'keyboard-extra.json',r);print(json.dumps(row,ensure_ascii=False),flush=True);c.close()
        b.close()
    r['finished']=stamp();write_json(out/'keyboard-extra.json',r)
if __name__=='__main__':main()
