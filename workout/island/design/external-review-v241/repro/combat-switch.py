# Read-only browser reproduction of native button activation on the real module.
from review_support import out_path
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
out=Path(out_path(''))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':844,'height':390})
    page.goto('http://127.0.0.1:8766/workout/island/design/external-review-v241/repro/combat-switch.html')
    page.wait_for_function('() => !!window.sw')
    switch=page.locator('#special-switch')
    switch.focus();page.keyboard.press('Enter');enter=page.evaluate('window.sw.sample()')
    page.keyboard.press('Space');space=page.evaluate('window.sw.sample()')
    page.keyboard.press('KeyC');key_c=page.evaluate('window.sw.sample()')
    switch.click();pointer=page.evaluate('window.sw.sample()')
    page.evaluate("document.querySelector('#special-switch').click()");semantic=page.evaluate('window.sw.sample()')
    result={'enter':enter,'space':space,'keyC':key_c,'pointerClick':pointer,'semanticClick':semantic}
    (out/'combat-switch.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
    browser.close()
