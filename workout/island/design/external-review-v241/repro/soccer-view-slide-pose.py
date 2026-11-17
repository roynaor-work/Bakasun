"""Extends the isolated motion probe in memory to show the actual skinned pose.
No existing source file is changed. Requires the review server on port 8766.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
url='http://127.0.0.1:8766/workout/island/design/external-review-v241/repro/soccer-view-browser.html'
body=Path(__file__).with_name('soccer-view-browser.html').read_text()
body=body.replace('tick<5','tick<21').replace('nonfiniteBones:nonfinite,','nonfiniteBones:nonfinite,hipsQuaternion:c.root.getObjectByName("Hips").quaternion.toArray(),hipsPosition:c.root.getObjectByName("Hips").position.toArray(),')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 try:
  for query in ['', '?soccerV241=0']:
   page=browser.new_page()
   page.route('**/soccer-view-browser.html*',lambda route:route.fulfill(status=200,content_type='text/html',body=body))
   page.goto(url+query)
   page.wait_for_function('typeof window.probe === "function"',timeout=180000)
   result=page.evaluate('window.probe()')
   print(json.dumps({'query':query,'slide':result['slide']},indent=2),flush=True)
   page.close()
 finally:browser.close()
