"""Check the actual one-minute device-check UI with all network access disabled.

This verifies the tool in cloud Chromium. It is not a physical-phone result.
"""
import json,mimetypes
from pathlib import Path
from urllib.parse import urlparse,unquote
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];resources=[];errors=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,offline=True)
 def route(r):
  u=urlparse(r.request.url)
  if u.scheme in ['blob','data']:r.continue_();return
  file=(ROOT/unquote(u.path).lstrip('/')).resolve()
  if u.scheme!='http' or u.netloc!='127.0.0.1:8765' or not file.is_relative_to(ROOT) or not file.is_file():r.abort();return
  resources.append(str(file.relative_to(ROOT)));r.fulfill(status=200,body=file.read_bytes(),content_type=mimetypes.guess_type(file)[0] or 'application/octet-stream')
 context.route('**/*',route);page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto('http://127.0.0.1:8765/phone-check.html',wait_until='load');page.wait_for_function('window.phoneCheck&&phoneCheck.ready',timeout=120000)
 clickable=page.locator('.phone-panel').evaluate("e=>getComputedStyle(e).pointerEvents")=='auto'
 page.locator('button[data-view=close]').click();persists=page.locator('.phone-panel').is_visible();page.locator('button[data-view=wide]').click()
 page.locator('#phone-run').click();page.wait_for_function('window.phoneCheck.last!==null',timeout=120000)
 data=page.evaluate('phoneCheck.last');copy_visible=page.locator('#phone-copy').is_visible()
 result={'pass':clickable and persists and copy_visible and data['requestedSeconds']==60 and data['seconds']>=59 and set(resources)=={'phone-check.html'} and not errors,
  'environment':'Cloud Chromium SwiftShader; UI functional validation only, not a physical phone','physicalPhoneMeasured':False,'networkOffline':True,'resources':resources,'consoleErrors':errors,'copyButtonVisible':copy_visible,'measurement':data}
 (ROOT/'verification/phone-check.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
 page.screenshot(path=str(ROOT/'verification/phone-check.png'));browser.close()
 print('Device-check UI one-minute flow:',result['pass'],flush=True)
 if not result['pass']:raise SystemExit(1)
