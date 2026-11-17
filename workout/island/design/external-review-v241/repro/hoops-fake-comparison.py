from review_support import out_path
from playwright.sync_api import sync_playwright
import json
from pathlib import Path
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':844,'height':690});page.goto('http://127.0.0.1:8766/workout/island/design/external-review-v241/repro/hoops-fake-comparison.html');page.wait_for_function('()=>window.ready',timeout=180000)
 observations=page.evaluate('observations');print(json.dumps(observations,indent=2));Path('/tmp/v241-hoops-fake-evidence.json').write_text(json.dumps(observations,indent=2));page.screenshot(path=out_path('hoops-fake-comparison.png'));b.close()
