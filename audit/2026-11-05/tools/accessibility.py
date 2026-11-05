"""axe + keyboard observations on actual routes, including custom dialogs."""
import sys
from playwright.sync_api import sync_playwright
from common import *

BAKASUN=['today','dashboard','calendar','board','board/stats','calls','tasks','clients','suppliers','quotes','money','notes','receipts','search','lead','groups','contracts','budget','files','notifications','notifications/settings','templates','import','help','more','settings']
WORKOUT=['home','exercises','exercise/squats','history','settings','parent','minute','together']

def focus(page):
    return page.evaluate("""() => {const e=document.activeElement;return {tag:e?.tagName,id:e?.id,cls:e?.className,inDialog:!!e?.closest('.modal,.gate,#drawer.open'),inDrawer:!!e?.closest('#drawer'),inGate:!!e?.closest('.gate')}}""")

def main():
    folder=OUT/'iterations/03';folder.mkdir(parents=True,exist_ok=True)
    keyboard_only='--keyboard-only' in sys.argv
    r=json.loads((folder/'accessibility.json').read_text()) if keyboard_only else {'started':stamp(),'conditions':'axe 4.11.0, shipped CSS/CSP, no external network, no screen reader certification','routes':[],'keyboard':[]}
    if keyboard_only:r['keyboard']=[]
    def save():write_json(folder/'accessibility.json',r)
    with server() as base,sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=CHROMIUM,headless=True,args=FLAGS)
        for w,h in ([] if keyboard_only else [(390,844),(844,390)]):
            for app,routes,prefix in [('bakasun',BAKASUN,'index.html#/'),('workout',WORKOUT,'workout/index.html#/'),('north',['','checkout'],'north/index.html#/')]:
                blocked=[];ctx=browser.new_context(viewport={'width':w,'height':h},is_mobile=True,has_touch=True,locale='he-IL',timezone_id='Asia/Jerusalem',service_workers='block')
                block_external(ctx,base,blocked);ctx.add_init_script(OBSERVERS)
                ctx.add_init_script("localStorage.setItem('north.adult','1')")
                page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                for route in routes:
                    try:
                        page.goto(base+prefix+route,wait_until='load',timeout=90000)
                        page.wait_for_timeout(300)
                        if app=='north' and not route:
                            page.locator('[data-add]').first.click();page.keyboard.press('Escape')
                        snap=snapshot(page);resources=snap.pop('resources',[])
                        snap['resourceSummary']={'count':len(resources),'transferBytes':sum(x['bytes'] for x in resources)}
                        row={'app':app,'route':route,'size':[w,h],'axe':axe(page),'snapshot':snap,'pageErrors':errors[:]}
                        errors.clear();r['routes'].append(row);save()
                        print(json.dumps({'app':app,'route':route,'size':[w,h],'violations':[(v['id'],len(v['nodes'])) for v in row['axe']['violations']]}),flush=True)
                    except Exception as e:r['routes'].append({'app':app,'route':route,'size':[w,h],'harnessError':str(e)});save()
                ctx.close()
        # Keyboard behavior uses desktop semantics with the same phone viewport.
        ctx=browser.new_context(viewport={'width':390,'height':844},locale='he-IL',service_workers='block')
        block_external(ctx,base,[]);p=ctx.new_page();p.set_default_timeout(12000)
        p.goto(base+'index.html#/calls',wait_until='load');p.locator('#new').focus();p.keyboard.press('Enter');p.wait_for_timeout(200)
        inside=[]
        for _ in range(16):p.keyboard.press('Tab');inside.append(p.evaluate("() => !!document.activeElement.closest('.modal')"))
        before=focus(p);p.keyboard.press('Escape');p.wait_for_timeout(100)
        r['keyboard'].append({'name':'bakasun-shared-dialog-control','allTabsInside':all(inside),'beforeEscape':before,'closedByEscape':p.locator('.modal').count()==0,'focusReturned':focus(p)});save()
        # The board's bespoke action popup does not use the shared dialog helper.
        p.evaluate("""async () => {const {db}=await import('./js/store.js');const {default:Office}=await import('./js/logic/office.js');db.importJson(JSON.stringify({cases:[{id:'audit-case',client:'אירוע סינתטי',status:Office.STATUS.lead,date:'2026-11-05',updated:'2026-11-05'}]}))}""")
        p.goto(base+'index.html#/board',wait_until='load');p.locator('[data-menu]').first.focus();p.keyboard.press('Enter');p.wait_for_timeout(150)
        entries=[]
        for _ in range(16):p.keyboard.press('Tab');entries.append(focus(p))
        role=p.locator('.modal [role=dialog]').count();p.keyboard.press('Escape');p.wait_for_timeout(100)
        r['keyboard'].append({'name':'bakasun-board-dialog','dialogRoleCount':role,'tabs':entries,'closedByEscape':p.locator('.modal').count()==0});save();ctx.close()
        # Age gate must contain focus and expose its purpose. A visual overlay
        # alone leaves its background reachable to the keyboard and AT.
        ctx=browser.new_context(viewport={'width':390,'height':844},service_workers='block');block_external(ctx,base,[]);p=ctx.new_page()
        p.goto(base+'north/index.html',wait_until='load');p.wait_for_timeout(200)
        entries=[]
        for _ in range(10):p.keyboard.press('Tab');entries.append(focus(p))
        r['keyboard'].append({'name':'north-age-gate','hasRole':p.locator('.gate[role=dialog],.gate [role=dialog]').count()>0,'tabs':entries});save()
        p.locator('#g-yes').click();p.locator('[data-add]').first.click();p.keyboard.press('Escape');p.locator('#cartbtn').focus();p.keyboard.press('Enter');p.wait_for_timeout(100)
        entries=[]
        for _ in range(15):p.keyboard.press('Tab');entries.append(focus(p))
        p.keyboard.press('Escape');p.wait_for_timeout(100)
        r['keyboard'].append({'name':'north-cart-drawer','tabs':entries,'closedByEscape':not p.locator('#drawer').evaluate("e=>e.classList.contains('open')"),'afterEscape':focus(p)});save();ctx.close()
        # Root application languages: record exact applied lang/dir and overflow.
        for lang in ['he','fr','en']:
            ctx=browser.new_context(viewport={'width':390,'height':844},service_workers='block');block_external(ctx,base,[])
            ctx.add_init_script(f"localStorage.setItem('bakasun.v1',JSON.stringify({{settings:{{lang:{json.dumps(lang)}}}}}))")
            p=ctx.new_page();p.goto(base+'index.html#/calendar',wait_until='load');p.wait_for_timeout(200)
            r['keyboard'].append({'name':'bakasun-language-'+lang,'result':p.evaluate("() => ({lang:document.documentElement.lang,dir:document.documentElement.dir,overflow:document.documentElement.scrollWidth>innerWidth,focus:document.activeElement.tagName})")});save();ctx.close()
        browser.close()
    r['finished']=stamp();save()

if __name__=='__main__':main()
