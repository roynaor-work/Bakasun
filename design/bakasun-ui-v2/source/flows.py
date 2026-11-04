"""Interaction review of the static prototype, with assertions and screenshots on failures.
No existing repository test file is changed. Uses locally installed Playwright and Chromium.
"""
from pathlib import Path
from datetime import datetime,timezone
from urllib.parse import urlsplit,unquote
import argparse,json,mimetypes,traceback,io
from PIL import Image
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent
ORIGIN='http://127.0.0.1:8765/'

def run():
    ap=argparse.ArgumentParser();ap.add_argument('--iteration',required=True);args=ap.parse_args();out=ROOT/'iterations'/args.iteration;out.mkdir(exist_ok=True)
    report={'started_at':datetime.now(timezone.utc).isoformat(),'checks':[],'failures':[],'console_errors':[],'external_requests':[]}
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1,accept_downloads=True);ctx.set_offline(True)
        def fulfill(route):
            path=(ROOT/unquote(urlsplit(route.request.url).path).lstrip('/')).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():route.abort();return
            route.fulfill(status=200,content_type=mimetypes.guess_type(path.name)[0] or 'application/octet-stream',body=path.read_bytes())
        ctx.route(ORIGIN+'**',fulfill);ctx.on('request',lambda r:report['external_requests'].append(r.url) if not r.url.startswith((ORIGIN,'data:','blob:')) else None)
        page=ctx.new_page();page.on('pageerror',lambda e:report['console_errors'].append(str(e)))
        def goto(name='index',theme='light',hash=''):
            page.goto(ORIGIN+name+'.html?theme='+theme+hash);page.evaluate('document.fonts.ready')
        def shot(name):
            data=page.screenshot();im=Image.open(io.BytesIO(data)).convert('RGB');im.save(out/f'flow-{name}.webp','WEBP',lossless=True,method=6)
        def check(name,fn):
            try:fn();report['checks'].append({'name':name,'pass':True});print('PASS '+name,flush=True)
            except Exception as e:
                report['failures'].append({'name':name,'error':str(e),'trace':traceback.format_exc()});page.screenshot(path=str(out/f'flow-failure-{len(report["failures"]):02}.png'),full_page=True);print('FAIL '+name+' '+str(e)[:200],flush=True)
        def theme_flow():
            goto();page.locator('[data-theme-toggle]').click();expect(page.locator('html')).to_have_attribute('data-theme','dark');page.locator('.bottom-nav a').nth(1).click();expect(page.locator('html')).to_have_attribute('data-theme','dark');expect(page.locator('body')).to_have_attribute('data-page','events')
        check('theme toggle and local navigation persistence',theme_flow)
        def system_theme():
            page.evaluate("localStorage.clear()");page.emulate_media(color_scheme='dark');page.goto(ORIGIN+'index.html');expect(page.locator('html')).to_have_attribute('data-theme','dark');page.emulate_media(color_scheme='light')
        check('system color-scheme fallback',system_theme)
        def menu_flow():
            goto();button=page.locator('.bottom-nav [data-menu]');button.click();expect(page.locator('#menu-dialog')).to_be_visible();expect(page.locator('#menu-dialog a')).to_have_count(14);page.keyboard.press('Tab');page.keyboard.press('Shift+Tab');assert page.evaluate("document.activeElement.closest('#menu-dialog')!==null");page.keyboard.press('Escape');expect(button).to_be_focused();expect(button).to_have_attribute('aria-expanded','false')
        check('complete mobile menu, focus containment and Escape return',menu_flow)
        def command_flow():
            goto();page.keyboard.press('/');expect(page.locator('#main-dialog')).to_be_visible();page.locator('[data-command-search]').fill('תקציב');expect(page.locator('[data-command-item]:visible')).to_have_count(1);page.locator('[data-command-item]:visible a').click();expect(page.locator('body')).to_have_attribute('data-page','budget');page.keyboard.press('/');page.locator('[data-command-search]').fill('איןמסךכזה');expect(page.locator('[data-command-empty]')).to_be_visible();shot('command-empty');page.keyboard.press('Escape')
        check('global screen search and no-results state',command_flow)
        def filter_flow():
            goto('events');expect(page.locator('[data-item]:visible')).to_have_count(6);page.locator('[data-filter="quoted"]').click();expect(page.locator('[data-column]:visible')).to_have_count(1);expect(page.locator('[data-item]:visible')).to_have_count(2);page.locator('select[data-kind]').select_option('כנס');expect(page.locator('[data-item]:visible')).to_have_count(1);page.locator('[data-search]').fill('איןכזה');expect(page.locator('[data-empty]')).to_be_visible();shot('board-empty');page.locator('[data-reset-filter]').click();expect(page.locator('[data-item]:visible')).to_have_count(6);expect(page.locator('[data-search]')).to_be_focused()
        check('event board combined status, kind, text and reset',filter_flow)
        def invoices_flow():
            goto('invoices')
            for state in ['open','late','draft','paid']:
                page.locator('[data-filter="'+state+'"]').click();expect(page.locator('tbody tr:visible')).to_have_count(1)
            page.locator('[data-filter="all"]').click();page.locator('[data-search]').fill('0262');expect(page.locator('tbody tr:visible')).to_have_count(1);page.locator('[data-detail]').filter(visible=True).first.click();expect(page.locator('#dialog-title')).to_have_text('DEMO-I-0262');expect(page.locator('[data-dialog-content]')).to_contain_text('₪8,200');page.keyboard.press('Escape')
        check('invoice statuses, ID search and accurate detail sheet',invoices_flow)
        def other_filters():
            for name,filter_key,count in [('clients','new',2),('suppliers','waiting',1),('proposals','waiting',2)]:
                goto(name);page.locator('[data-filter="'+filter_key+'"]').click();expect(page.locator('[data-item]:visible')).to_have_count(count);page.locator('[data-search]').fill('zzzz');expect(page.locator('[data-empty]')).to_be_visible();page.locator('[data-reset-filter]').click();assert page.locator('[data-item]:visible').count()>count
        check('clients, suppliers and proposals filters and empty recovery',other_filters)
        def tabs_flow():
            goto('event');tabs=page.locator('[data-tab]').evaluate_all('els=>els.map(x=>x.dataset.tab)');assert len(tabs)==13
            for tab in tabs:
                page.locator('[data-tab-select]').select_option(tab);expect(page.locator('#panel-'+tab)).to_be_visible();expect(page.locator('[role=tabpanel]:visible')).to_have_count(1)
            goto('event',hash='#budget');expect(page.locator('#panel-budget')).to_be_visible();expect(page.locator('[data-tab-select]')).to_have_value('budget')
            page.set_viewport_size({'width':1440,'height':1000});page.locator('#tab-details').click();page.locator('#tab-details').focus();page.keyboard.press('ArrowLeft');expect(page.locator('#tab-suppliers')).to_be_focused();expect(page.locator('#panel-suppliers')).to_be_visible();page.keyboard.press('End');expect(page.locator('#tab-history')).to_be_focused();page.keyboard.press('Home');expect(page.locator('#tab-details')).to_be_focused();page.set_viewport_size({'width':390,'height':844})
        check('all 13 case tabs, mobile selector, direct hash and RTL keyboard',tabs_flow)
        def task_flow():
            goto();button=page.locator('[data-check]').first;button.click();expect(button).to_have_attribute('aria-pressed','true');page.locator('[data-undo]').click();expect(button).to_have_attribute('aria-pressed','false');button.click();button.click();expect(button).to_have_attribute('aria-pressed','false')
        check('task completion and actual undo',task_flow)
        def form_flow():
            for name,type in [('index','event'),('clients','client'),('suppliers','supplier'),('invoices','invoice'),('proposals','proposal'),('calendar','calendar')]:
                goto(name);opener=page.locator('[data-create="'+type+'"]').first;opener.click();page.locator('[type=submit]').click();expect(page.locator('#new-name')).to_have_attribute('aria-invalid','true');expect(page.locator('#new-name-error')).to_be_visible();expect(page.locator('#new-name')).to_be_focused();shot('invalid-'+type);page.locator('#new-name').fill('רשומת דמה לבדיקת קלט <script>');page.locator('[type=submit]').click();expect(page.locator('#main-dialog')).not_to_be_visible();expect(page.locator('[data-added-records]')).to_contain_text('רשומת דמה לבדיקת קלט <script>');assert page.locator('[data-added-records] script').count()==0;page.locator('[data-undo]').click();expect(page.locator('[data-added-records]')).to_have_count(0)
        check('six creation forms, validation, escaped input and undo',form_flow)
        def edit_flow():
            goto('event');original=page.locator('h1').text_content();page.locator('[data-edit-event]').click();page.locator('#edit-title').fill('מפגש דמה מעודכן');page.locator('[type=submit]').click();expect(page.locator('h1')).to_have_text('מפגש דמה מעודכן');page.locator('[data-undo]').click();expect(page.locator('h1')).to_have_text(original)
        check('event edit preview and undo',edit_flow)
        def signature_flow():
            goto('contract');button=page.locator('[data-sign-contract]');button.click();expect(page.locator('[data-signature-error]')).to_be_visible();page.locator('[data-signature-name]').fill('תפקיד חתימת דמה');button.click();expect(page.locator('[data-signature-error]')).to_contain_text('קריאת');page.locator('[data-consent]').check();button.click();expect(page.locator('[data-signed]')).to_be_visible();expect(page.locator('[data-signature-summary]')).to_contain_text('תפקיד חתימת דמה');page.locator('[data-clear-signature]').click();expect(page.locator('[data-signed]')).not_to_be_visible();expect(page.locator('[data-signature-name]')).to_have_value('');assert not page.locator('[data-consent]').is_checked()
            canvas=page.locator('canvas');canvas.scroll_into_view_if_needed();r=canvas.bounding_box();page.mouse.move(r['x']+30,r['y']+60);page.mouse.down();page.mouse.move(r['x']+90,r['y']+30,steps=6);page.mouse.move(r['x']+140,r['y']+80,steps=6);page.mouse.up();page.locator('[data-consent]').check();button.click();expect(page.locator('[data-signed]')).to_be_visible();expect(page.locator('[data-signature-summary]')).to_contain_text('חתימה מצוירת');shot('signature-ink');assert page.locator('canvas').evaluate('c=>c.getContext("2d").getImageData(0,0,c.width,c.height).data.some(x=>x>0)')
        check('contract required fields, typed signature, ink signature and clear',signature_flow)
        def calendar_flow():
            goto('calendar');page.locator('[data-day="2026-11-06"]').click();expect(page.locator('[data-day-agenda]')).to_contain_text('פתיחת האירוע');page.locator('[data-day="2026-11-07"]').click();expect(page.locator('[data-day-agenda]')).to_contain_text('יום פנוי');page.locator('[data-calendar-next]').click();expect(page.locator('[data-month-title]')).to_contain_text('דצמבר');page.locator('[data-calendar-prev]').click();expect(page.locator('[data-month-title]')).to_contain_text('נובמבר');page.locator('[data-calendar-today]').click();expect(page.locator('[data-day="2026-11-05"]')).to_have_attribute('aria-pressed','true');expect(page.locator('[data-day-agenda]')).to_contain_text('סגירת תפריט')
        check('calendar day, empty day, next/previous and return to demo date',calendar_flow)
        def settings_flow():
            goto('settings');p=page.locator('[data-setting-size]');p.click();expect(page.locator('html')).to_have_attribute('data-text-size','large');page.locator('[data-setting-motion]').click();page.locator('[data-start-page]').select_option('events');page.locator('[data-save-settings]').click();page.reload();expect(page.locator('[data-setting-size]')).to_have_attribute('aria-checked','true');expect(page.locator('[data-start-page]')).to_have_value('events');assert page.evaluate('document.documentElement.scrollWidth===innerWidth');page.locator('[data-setting-size]').click();page.locator('[data-open-workspace]').click();expect(page.locator('body')).to_have_attribute('data-page','events')
        check('settings actual text enlargement and persistence',settings_flow)
        def csv_flow():
            goto('finance')
            with page.expect_download() as info:page.locator('[data-export]').first.click()
            download=info.value;assert download.suggested_filename=='demo-finance.csv';content=Path(download.path()).read_text(encoding='utf-8-sig');assert '₪12,000' in content and 'שבוע 4' in content;assert '"שבוע 1","₪12,000","₪8,000","₪4,000"' in content
        check('CSV download with actual chart data',csv_flow)
        def system_flow():
            goto('system');page.locator('[data-retry]').click();expect(page.locator('#states')).to_contain_text('התוכן זמין שוב');page.locator('#sample-tab-b').click();expect(page.locator('#sample-panel-b')).to_be_visible();page.locator('#sample-tab-b').focus();page.keyboard.press('ArrowRight');expect(page.locator('#sample-tab-a')).to_be_focused()
        check('component error recovery and keyboard tabs',system_flow)
        def links_flow():
            goto();page.set_viewport_size({'width':1440,'height':1000})
            for i in range(14):
                page.locator('.rail nav a').nth(i).click();expect(page.locator('.rail nav a[aria-current=page]')).to_have_count(1);assert page.locator('h1').count()==1
            page.set_viewport_size({'width':390,'height':844})
        check('all static screen links and navigation state',links_flow)
        def print_flow():
            goto('contract');page.emulate_media(media='print');assert not page.locator('.bottom-nav').is_visible();assert not page.locator('.topbar').is_visible();assert page.locator('.contract-document').is_visible();page.emulate_media(media='screen')
        check('print media hides navigation and preserves contract',print_flow)
        browser.close()
    report['finished_at']=datetime.now(timezone.utc).isoformat();report['summary']={'passed':len(report['checks']),'failed':len(report['failures']),'console_errors':len(report['console_errors']),'external_requests':len(report['external_requests'])};(out/'flows.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report['summary']))
if __name__=='__main__':run()
