import asyncio, json
from playwright.async_api import async_playwright
S='/tmp'
BASE='http://localhost:8765/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        errs=[]
        for w in (400, 1280):
            pg = await b.new_page(viewport={'width':w,'height':900})
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(BASE+'#/settings'); await pg.wait_for_timeout(800)
            # load the seed (button exists in settings) so Shoval exists
            btn = pg.locator('button:has-text("טעני"), button:has-text("דוגמה"), #seed').first
            try:
                await btn.click(timeout=1500); await pg.wait_for_timeout(600)
                await pg.keyboard.press('Enter'); await pg.wait_for_timeout(600)
            except Exception as e: print('no seed btn', str(e)[:60])
            await pg.goto(BASE+'#/tasks'); await pg.wait_for_timeout(700)
            tabs = await pg.locator('.tabs button').all_inner_texts(); print(w, 'tabs:', tabs)
            await pg.screenshot(path=f'{S}/tasks_{w}.png', full_page=False)
            await pg.locator('#new').click(); await pg.wait_for_timeout(500)
            chips = await pg.locator('.tk-who .chip').all_inner_texts(); print(w, 'who chips:', chips)
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
            await pg.goto(BASE+'#/assist'); await pg.wait_for_timeout(700)
            ta = pg.locator('#txt').first
            await ta.fill('מה הרווח באירוע של שובל סיימתי מה חסר במסמכים של השובל')
            await pg.locator('#go').click(); await pg.wait_for_timeout(1200)
            out = await pg.locator('#out').inner_text(); print(w, 'OUT:', out[:500].replace('\n',' | '))
            await pg.screenshot(path=f'/tmp/assist_{w}.png', full_page=True)
            await pg.close()
        print('errors:', errs)
        await b.close()
asyncio.run(main())
