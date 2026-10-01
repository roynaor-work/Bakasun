import asyncio, json
from playwright.async_api import async_playwright
ROUTES = ['#/today', '#/dashboard', '#/calendar', '#/board', '#/board/stats', '#/notifications', '#/notifications/settings', '#/budget', '#/files', '#/contracts', '#/cases', '#/tasks', '#/calls', '#/suppliers', '#/clients', '#/quotes', '#/money', '#/assist', '#/settings', '#/more', '#/help', '#/notes', '#/receipts', '#/search', '#/lead', '#/groups']
TABS = ['participants', 'contract', 'checklist', 'history', 'budget', 'runsheet', 'files']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        for W, H, label in [(400, 860, 'phone'), (1280, 800, 'desktop')]:
            ctx = await b.new_context(viewport={'width': W, 'height': H}); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:140]))
            await pg.goto('http://localhost:8765/#/settings'); await pg.wait_for_timeout(600); await pg.click('#seed'); await pg.wait_for_timeout(900)
            st = json.loads(await pg.evaluate("localStorage['bakasun.v1']")); cid = st['cases'][0]['id']
            for lang in ['he', 'fr', 'en']:
                await pg.evaluate(f"(()=>{{const s=JSON.parse(localStorage['bakasun.v1']); s.settings.uiLang='{lang}'; localStorage['bakasun.v1']=JSON.stringify(s);}})()")
                for r in ROUTES + [f'#/case/{cid}', f'#/runsheet/{cid}/live', f'#/participants/{cid}', f'#/files/{cid}', f'#/budget/{cid}', f'#/runsheet/{cid}']:
                    await pg.goto('http://localhost:8765/' + r); await pg.wait_for_timeout(350)
                    if await pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 2"): errs.append(f'hscroll {label} {lang} {r}')
                    if r == f'#/case/{cid}':
                        for tab in TABS:
                            ok = await pg.evaluate(f"(()=>{{const b=document.querySelector('[data-ctab={tab}]'); if(!b) return 'no-tab'; b.click(); return 'ok';}})()")
                            await pg.wait_for_timeout(350)
                            if ok != 'ok': errs.append(f'{label} {lang} tab {tab}: {ok}')
                            elif await pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 2"): errs.append(f'hscroll {label} {lang} tab {tab}')
            copies = await pg.evaluate("document.querySelectorAll('[data-copy],[data-copy-of]').length")
            print(label, '| errors:', errs[:10] if errs else 'none', '| copy buttons on last page:', copies)
            await pg.goto('http://localhost:8765/#/board'); await pg.wait_for_timeout(500); await pg.screenshot(path=f'r10_{label}_board.png', full_page=False)
            await pg.goto(f'http://localhost:8765/#/case/{cid}'); await pg.wait_for_timeout(400); await pg.evaluate("document.querySelector('[data-ctab=budget]').click()"); await pg.wait_for_timeout(500); await pg.screenshot(path=f'r10_{label}_budget.png', full_page=True)
            await pg.goto(f'http://localhost:8765/#/runsheet/{cid}/live'); await pg.wait_for_timeout(600); await pg.screenshot(path=f'r10_{label}_live.png', full_page=False)
            await ctx.close()
        await b.close()
asyncio.run(main())
