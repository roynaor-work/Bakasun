import json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=b.new_page(viewport={'width':844,'height':390})
 page.route('**/review-keyboard.html',lambda r:r.fulfill(status=200,content_type='text/html',body='<!doctype html><html><body><div id="stage"></div><div id="controls"></div></body></html>'))
 page.goto('http://127.0.0.1:8766/workout/island/review-keyboard.html')
 page.evaluate('''async()=>{const {createPitUi}=await import('./minigames/racing-pit-ui.mjs');window.calls=[];const ui=createPitUi({stage:document.querySelector('#stage'),controls:document.querySelector('#controls'),auto:true,onCancel:()=>calls.push('cancel'),onRequest:()=>calls.push('request'),onTap:()=>calls.push('change')});const p={tyre:.9,lap:1,pits:0,pit:null,pitRequest:true,pitAuto:true,pitGo:false};ui.update({player:p,laps:2,cars:[p]});window.ui=ui;}''')
 button=page.locator('[data-action=racing-pit]');button.focus();button.press('Enter');after_enter=page.evaluate('calls.slice()');button.press('Space');after_space=page.evaluate('calls.slice()');button.click();after_pointer=page.evaluate('calls.slice()')
 print(json.dumps({'ariaLabel':button.get_attribute('aria-label'),'afterEnter':after_enter,'afterSpace':after_space,'afterPointerClick':after_pointer},indent=2,ensure_ascii=False))
 b.close()
