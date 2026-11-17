"""Loads the shipped character rig and motion packs, compares default with rollback.
Run: python3 workout/island/design/external-review-v241/repro/soccer-view-browser.py
Requires the review HTTP server on 127.0.0.1:8766.
"""
import json
from playwright.sync_api import sync_playwright
url='http://127.0.0.1:8766/workout/island/design/external-review-v241/repro/soccer-view-browser.html'
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 try:
  for query in ['', '?soccerV241=0']:
   page=browser.new_page(viewport={'width':844,'height':390})
   page.set_default_timeout(180000)
   page.goto(url+query)
   page.wait_for_function('typeof window.probe === "function"')
   print(json.dumps(page.evaluate('window.probe()'),ensure_ascii=False,indent=2),flush=True)
   page.close()
 finally:browser.close()
