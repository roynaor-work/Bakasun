from playwright.sync_api import sync_playwright
from pathlib import Path
import json
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page();page.goto('http://127.0.0.1:8766/workout/island/design/external-review-v241/repro/hoops-dispose-probe.html');page.wait_for_function('()=>window.ready',timeout=240000)
 results=page.evaluate('results');print(json.dumps(results,indent=2));Path('/tmp/v241-hoops-dispose-evidence.json').write_text(json.dumps(results,indent=2));b.close()
