import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        errs=[]
        pg = await b.new_page(viewport={'width':400,'height':900})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8765/#/settings'); await pg.wait_for_timeout(700)
        try:
            await pg.locator('#seed').click(timeout=1500); await pg.wait_for_timeout(500); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
        except Exception as e: print('seed', str(e)[:50])
        for txt in ['שלח בבקשה את מסמכי הביטוח למייל של רועי', 'שלחי את הלוגו לרועי', 'שלחי את תעודת ההתאגדות למייל של רועי']:
            await pg.goto('http://localhost:8765/#/assist'); await pg.wait_for_timeout(600)
            await pg.locator('#txt').first.fill(txt); await pg.locator('#go').click(); await pg.wait_for_timeout(900)
            print('>>', txt); print((await pg.locator('#out').inner_text())[:300].replace('\n',' | '))
            print('mail btn:', await pg.locator('#out #mail').count(), 'share:', await pg.locator('#out #share').count())
        await pg.screenshot(path=S+'/send_missing.png', full_page=True)
        print('errors:', errs); await b.close()
S='/tmp'
asyncio.run(main())
