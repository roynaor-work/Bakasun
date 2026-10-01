import asyncio
from playwright.async_api import async_playwright
import sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'e2e') if 'scratchpad' in os.path.abspath(__file__) else os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, '/home/user/bakasun/tests/e2e')
from fixture import seed
S='/tmp'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        pg = await b.new_page(viewport={'width':400,'height':900}); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8765/#/settings'); await pg.wait_for_timeout(600)
        await seed(pg)
        await pg.goto('http://localhost:8765/#/assist'); await pg.wait_for_timeout(600)
        txt='תוציא חשבונית לחברת אלפא בע״מ ח.פ. 514 572 312 על 5000 שקל עבור יום גיבוש שלח במייל לרועי'
        await pg.fill('#txt', txt); await pg.click('#go'); await pg.wait_for_timeout(1200)
        print('inv?', await pg.locator('#inv').count())
        print('client:', await pg.locator('#inv [name=client]').input_value(), '| taxId:', await pg.locator('#inv [name=taxId]').input_value(), '| desc:', await pg.locator('#inv [name=desc]').first.input_value(), '| amount:', await pg.locator('#inv [name=amount]').first.input_value())
        print('text:', (await pg.locator('#invText').input_value())[:200].replace('\n',' | '))
        await pg.click('#sendMail'); await pg.wait_for_timeout(700)
        print('modal:', (await pg.locator('.modal').last.inner_text())[:220].replace('\n',' | '))
        dlg = pg.locator('.modal').last
        await pg.screenshot(path=S+'/inv_new.png')
        await dlg.locator('button[type=submit]').first.click(); await pg.wait_for_timeout(600)
        print('alpha clients:', await pg.evaluate("JSON.parse(localStorage.getItem('bakasun.v1')).clients.filter(c=>/אלפא/.test(c.name)).map(c=>[c.name,c.taxId])"))
        print('payments:', await pg.evaluate("JSON.parse(localStorage.getItem('bakasun.v1')).payments.filter(c=>/אלפא/.test(c.client)).length"))
        print('errors', errs); await b.close()
asyncio.run(main())
