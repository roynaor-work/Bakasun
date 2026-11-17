"""Read-only runtime loader probe, with manifest omissions modeled as failed requests."""
from playwright.sync_api import sync_playwright
import json
from pathlib import Path
base='http://127.0.0.1:8766/workout/island/design/external-review-v241/repro/hoops-assets-probe.html'
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 results={}
 for label,query,deny in [('online-default','',False),('online-rollback','?hoopsV241=0',False),('cached-manifest-rollback','?hoopsV241=0',True)]:
  c=b.new_context(service_workers='block');page=c.new_page()
  if deny:page.route('**/assets/athlete-body-v22/models/*.glb',lambda route:route.abort('internetdisconnected') if route.request.url.rsplit('/',1)[-1] in ['guard.glb','wing.glb','center.glb'] else route.continue_())
  page.goto(base+query);page.wait_for_function('()=>window.probeReady');results[label]=page.evaluate('()=>runAssetsProbe()');c.close()
 print(json.dumps(results,ensure_ascii=False,indent=2))
 Path('/tmp/v241-hoops-assets-evidence.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
 b.close()
