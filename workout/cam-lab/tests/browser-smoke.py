from playwright.sync_api import sync_playwright
# Optional browser check. Start the documented HTTP server first.
# Requires Python Playwright and /usr/bin/chromium; uses a fake camera, never a child video.
import json, re
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-gl=angle','--use-angle=swiftshader'])
 context=browser.new_context(permissions=['camera'],viewport={'width':390,'height':844})
 page=context.new_page(); errors=[]; requests=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:requests.append(r.url))
 page.goto('http://127.0.0.1:8765/workout/cam-lab/')
 page.get_by_role('button',name='פתיחת המצלמה והצבה').click()
 page.locator('#metrics').filter(has_text=re.compile('FPS:')).wait_for(state='attached',timeout=45000)
 page.locator('summary').click()
 assert not page.locator('#error').inner_text()
 assert not errors
 assert all(u.startswith('http://127.0.0.1:8765/') for u in requests)
 print(json.dumps({'status':page.locator('#status').inner_text(),'error':page.locator('#error').inner_text(),'metrics':page.locator('#metrics').inner_text(),'pageerrors':errors,'external_requests':[u for u in requests if not u.startswith('http://127.0.0.1:8765/')],'requests':requests},ensure_ascii=False))

 page.get_by_role('button',name='סגירת המצלמה').click()
 assert page.locator('#settings').is_visible()
 assert page.evaluate('document.querySelector("video").srcObject===null')
 browser.close()
