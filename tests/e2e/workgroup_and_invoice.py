import asyncio
from playwright.async_api import async_playwright
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'e2e') if 'scratchpad' in os.path.abspath(__file__) else os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, '/home/user/bakasun/tests/e2e')
from fixture import seed
S='/tmp'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        errs=[]
        pg = await b.new_page(viewport={'width':400,'height':900})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: d.accept())
        await pg.goto('http://localhost:8765/#/settings'); await pg.wait_for_timeout(700)
        await seed(pg)
        await pg.goto('http://localhost:8765/#/assist'); await pg.wait_for_timeout(600)
        await pg.locator('#txt').first.fill('פתח לי בבקשה קבוצת עבודה לשובל עם חמש אנשים מרינה רותם ענת דוד ומרינה'); await pg.locator('#go').click(); await pg.wait_for_timeout(900)
        print('CARD:', (await pg.locator('#out').inner_text())[:600].replace('\n',' | '))
        await pg.screenshot(path=S+'/wg1.png', full_page=True)
        # voice answer
        await pg.locator('#txt').first.fill('וואטסאפ'); await pg.locator('#go').click(); await pg.wait_for_timeout(600)
        print('WA:', (await pg.locator('#wgOut').inner_text())[:400].replace('\n',' | '))
        await pg.locator('#txt').first.fill('תוסיפי את עופר לקבוצה'); await pg.locator('#go').click(); await pg.wait_for_timeout(600)
        print('MEMBERS:', await pg.locator('.wg .list .row').count())
        await pg.locator('#txt').first.fill('משימות לכולם'); await pg.locator('#go').click(); await pg.wait_for_timeout(600)
        print('TASKS:', (await pg.locator('#wgOut').inner_text())[:200].replace('\n',' | '))
        await pg.screenshot(path=S+'/wg2.png', full_page=True)
        n = await pg.evaluate("JSON.parse(localStorage.getItem('bakasun.v1')||'{}').workgroups?.length")
        print('saved groups:', n)
        # case tab
        cid = await pg.evaluate("(JSON.parse(localStorage.getItem('bakasun.v1')||'{}').workgroups||[])[0]?.caseId")
        await pg.goto(f'http://localhost:8765/#/case/{cid}'); await pg.wait_for_timeout(700)
        tabs = await pg.locator('.tabs button').all_inner_texts(); print('case tabs:', tabs)
        await pg.locator('.tabs button:has-text("קבוצת עבודה")').first.click(); await pg.wait_for_timeout(500)
        print('TAB:', (await pg.locator('#app').inner_text())[:300].replace('\n',' | '))
        # invoice: new client question
        await pg.goto('http://localhost:8765/#/assist'); await pg.wait_for_timeout(500)
        await pg.locator('#txt').first.fill('תוציא חשבונית לחברת אלפא בע״מ ח.פ. 514 572 312 על 5000 שקל עבור יום גיבוש שלח במייל לרועי'); await pg.locator('#go').click(); await pg.wait_for_timeout(1000)
        print('INV client:', await pg.locator('#inv [name=client]').input_value(), '| taxId:', await pg.locator('#inv [name=taxId]').input_value())
        print('INV text:', (await pg.locator('#invText').input_value())[:160].replace('\n',' | '))
        await pg.locator('#sendMail').click(); await pg.wait_for_timeout(700)
        dlg = pg.locator('.modal').last
        print('DIALOG:', (await dlg.inner_text())[:200].replace('\n',' | '))
        await pg.screenshot(path=S+'/inv_new.png', full_page=False)
        await dlg.locator('button[type=submit]').click(); await pg.wait_for_timeout(600)
        print('clients with alpha:', await pg.evaluate("JSON.parse(localStorage.getItem('bakasun.v1')||'{}').clients.filter(c=>/אלפא/.test(c.name)).length"))
        print('errors:', errs); await b.close()
asyncio.run(main())
