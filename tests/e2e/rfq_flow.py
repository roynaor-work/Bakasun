"""RFQ workflow using fictional records and reserved example contacts only.
Run a server on 8765, then: python3 tests/e2e/rfq_flow.py
BAKASUN_BROWSER overrides the system Chromium path. No external request is permitted.
"""
import asyncio
import os
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:8765/'
PHONE = '+1' + '202' + '555' + '0100'  # NANP reserved fictional number, never dialled.

async def modal(page):
    box = page.locator('.modal:visible').last
    await box.wait_for()
    return box

async def submit(page):
    await (await modal(page)).locator('button[type=submit]').click()

async def records(page):
    return await page.evaluate("async () => (await import('/js/store.js')).db.list('links')")

async def run_language(browser, language):
    context = await browser.new_context(viewport={'width': 400, 'height': 860}, service_workers='block')
    page = await context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    await context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(BASE) else route.abort())
    await page.goto(BASE)
    await page.evaluate("""async ({language, phone}) => {
        const {db} = await import('/js/store.js');
        db.setting('lang', language); db.setting('uiLang', language); db.setting('bizPhone', phone);
        db.put('cases', {id:'test-rfq', client:'ארגון בדיקה', kind:'סמינר', date:'2026-11-10', days:2, participants:10, status:'הצעה נשלחה'});
        for (const id of ['test-s1','test-s2']) db.put('suppliers', {id, name:id === 'test-s1' ? 'ספק בדיקה א' : 'ספק בדיקה ב', type:'מלונות', lang:language, email:id+'@example.invalid', phone, active:'כן'});
    }""", {'language': language, 'phone': PHONE})
    await page.goto(BASE + '#/case/test-rfq/suppliers')
    # Intercept opening external mail/WhatsApp; the test can never send a message.
    await page.evaluate("""() => { window.testOpened=[]; HTMLAnchorElement.prototype.click=function(){window.testOpened.push(this.href)}; }""")
    if language == 'he':
        await page.evaluate("async () => (await import('/js/store.js')).db.setting('bizPhone','')")
    await page.locator('#ask').click()
    if language == 'he':
        await (await modal(page)).locator('[name=bizPhone]').fill('invalid')
        await submit(page)
        assert await page.locator('.modal:visible [name=bizPhone]').count() == 1
        await (await modal(page)).locator('[name=bizPhone]').fill(PHONE)
        await submit(page)
    box = await modal(page)
    await box.locator('input[value=test-s1]').check()
    await box.locator('input[value=test-s2]').check()
    await submit(page)
    box = await modal(page)
    await box.locator('[name=singles]').fill('5')
    await submit(page)
    box = await modal(page)
    original = await box.locator('textarea').input_value()
    assert original.endswith(PHONE), original
    assert 'היי היי' not in original
    links = await records(page)
    assert len(links) == 2 and all(l['status'] == 'טיוטת בקשה' and not l['askedAt'] for l in links)
    # Opening email with no confirmation cannot set askedAt.
    await box.locator('[data-x=mail]').click()
    await (await modal(page)).locator('[data-x=cancel]').click()
    assert all(not l['askedAt'] for l in await records(page))
    assert (await page.evaluate('window.testOpened'))[0].startswith('mailto:')
    await (await modal(page)).locator('[data-x=skip]').click()
    box = await modal(page)
    await box.locator('textarea').fill('Edited draft\n' + PHONE)
    await box.locator('[data-x=stop]').click()
    links = await records(page)
    second = next(l for l in links if l['supplierId'] == 'test-s2')
    assert second['requestText'] == 'Edited draft\n' + PHONE and not second['askedAt']
    # The same supplier can be reselected as a draft without creating another link.
    await page.locator('#ask').click()
    await (await modal(page)).locator('input[value=test-s2]').check()
    await submit(page); await submit(page)
    await (await modal(page)).locator('[data-x=stop]').click()
    assert len(await records(page)) == 2
    assert next(l for l in await records(page) if l['supplierId'] == 'test-s2')['requestText'] == 'Edited draft\n' + PHONE
    # Resume the first draft and explicitly confirm a manual send.
    first = next(l for l in await records(page) if l['supplierId'] == 'test-s1')
    await page.locator(f'[data-l="{first["id"]}"] [data-send]').click()
    await (await modal(page)).locator('[data-x=manual]').click()
    await submit(page)
    first = next(l for l in await records(page) if l['supplierId'] == 'test-s1')
    assert first['status'] == 'ביקשנו הצעה' and first['askedAt'] and first['channel'] == 'manual'
    # Read a gross EUR quote and make sure its basis survives saving and reloading.
    await page.locator(f'[data-l="{first["id"]}"] [data-offer]').click()
    box = await modal(page)
    await box.locator('[name=text]').fill('Total 1 180,50 € TTC\nInclus: café\nAcompte: 20%')
    await box.locator('#readOffer').click()
    assert await box.locator('[name=total]').input_value() == '1180.5'
    assert await box.locator('[name=currency]').input_value() == 'EUR'
    assert await box.locator('[name=incl]').input_value() == 'true'
    await box.locator('[name=note]').fill('INTERNAL_TEST_NOTE')
    await box.locator('[name=total]').fill('-1')
    await submit(page)
    assert await page.locator('.modal:visible').count() == 1, 'invalid quote must stay open'
    await (await modal(page)).locator('[name=total]').fill('1180.5')
    await submit(page)
    await page.wait_for_timeout(250)
    await page.reload()
    first = next(l for l in await records(page) if l['supplierId'] == 'test-s1')
    assert first['cost'] == 1000.42, 'supplier cost is stored net for the existing money workflow'
    assert first['offer']['currency'] == 'EUR' and first['offer']['incl'] is True and first['answeredAt']
    assert '1,000.42 €' in await page.locator('table.cmp').inner_text()
    assert await page.locator('[data-share-cmp=fr]').count() == 1
    assert await page.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2')
    await page.locator('[data-choose]').click()
    await submit(page)
    assert next(l for l in await records(page) if l['supplierId'] == 'test-s1')['chosen'] == 'כן'
    # A client export contains EUR and no private price judgement or note.
    exported = await page.evaluate("""async () => {
        const {db}=await import('/js/store.js'), {compareRows,compareHtml}=await import('/js/logic/rfq.js');
        return compareHtml(db.get('cases','test-rfq'), compareRows(db.list('links'),db.list('suppliers'),10),'en');
    }""")
    assert '1,000.42 €' in exported and 'INTERNAL_TEST_NOTE' not in exported
    # WhatsApp opens only a draft; refusing confirmation must preserve the second draft.
    second = next(l for l in await records(page) if l['supplierId'] == 'test-s2')
    await page.evaluate("""() => {window.testOpened=[]; HTMLAnchorElement.prototype.click=function(){window.testOpened.push(this.href)};}""")
    await page.locator(f'[data-l="{second["id"]}"] [data-send]').click()
    original_draft = await (await modal(page)).locator('textarea').input_value()
    await (await modal(page)).locator('textarea').fill(chr(0x0627))
    await (await modal(page)).locator('[data-x=wa]').click()
    assert not await page.evaluate('window.testOpened')
    await (await modal(page)).locator('textarea').fill(original_draft)
    await (await modal(page)).locator('[data-x=wa]').click()
    await (await modal(page)).locator('[data-x=cancel]').click()
    await (await modal(page)).locator('[data-x=stop]').click()
    second = next(l for l in await records(page) if l['supplierId'] == 'test-s2')
    assert not second['askedAt'] and (await page.evaluate('window.testOpened'))[0].startswith('https://wa.me/')
    assert not errors, errors
    print(language, ': RFQ draft/send/refusal/resume/offer/currency/VAT/reload/export passed', flush=True)
    await context.close()

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get('BAKASUN_BROWSER', '/usr/bin/chromium'))
        for language in ['he', 'fr', 'en']:
            await run_language(browser, language)
        await browser.close()

asyncio.run(main())
