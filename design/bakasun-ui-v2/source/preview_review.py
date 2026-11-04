"""Audit the outer local preview page in addition to the product-screen matrix."""
from pathlib import Path
from urllib.parse import urlsplit,unquote
import json,mimetypes,io
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent

def main():
 results=[];errors=[];requests=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=browser.new_context(device_scale_factor=1);ctx.set_offline(True)
  def route(r):
   p=(ROOT/unquote(urlsplit(r.request.url).path).lstrip('/')).resolve()
   if not p.is_relative_to(ROOT) or not p.is_file():errors.append('missing local file '+str(p.relative_to(ROOT)));r.abort();return
   r.fulfill(status=200,content_type=mimetypes.guess_type(p.name)[0] or 'application/octet-stream',body=p.read_bytes())
  ctx.route('http://127.0.0.1:8765/**',route);ctx.on('request',lambda r:requests.append(r.url) if not r.url.startswith(('http://127.0.0.1:8765/','data:','blob:')) else None);ctx.route('http://127.0.0.1:8765/review-axe.js',lambda r:r.fulfill(status=200,content_type='application/javascript',body=Path('/tmp/event-ui-review/node_modules/axe-core/axe.min.js').read_bytes()));page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  for w,h in [(390,844),(844,390),(1440,1000)]:
   page.set_viewport_size({'width':w,'height':h})
   for theme in ['light','dark']:
    page.goto('http://127.0.0.1:8765/preview.html');page.locator('#theme').select_option(theme);page.evaluate('document.fonts.ready');page.add_script_tag(url='http://127.0.0.1:8765/review-axe.js');r=page.evaluate('async()=>{const r=await axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa","wcag22aa"]}});return {violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),overflow:document.documentElement.scrollWidth>innerWidth}}');r.update(viewport=f'{w}x{h}',theme=theme);results.append(r)
    Image.open(io.BytesIO(page.screenshot())).convert('RGB').save(ROOT/'iterations/11'/f'preview-{theme}-{w}x{h}-near.webp','WEBP',lossless=True,method=6)
  # Every iteration and screen must point to actual documented images, never a stock thumbnail.
  page.locator('#theme').select_option('light')
  for round in ['01','02','03','04','05','06','07','08','09','10','11']:
   page.locator('#round').select_option(round)
   for name in ['index','events','event','clients','suppliers','invoices','finance','proposals','runsheet','calendar','budget','contract','settings','system']:
    page.locator('#screen').select_option(name)
    for distance in ['near','far']:
     page.locator('#shot-distance').select_option(distance)
     for target in ['portrait','landscape']:
      src=page.locator('#'+target+'-shot').get_attribute('src');assert (ROOT/src).is_file(),src
  browser.close()
 report={'renders':results,'errors':errors,'external_requests':requests,'summary':{'renders':len(results),'axe_violations':sum(len(x['violations']) for x in results),'overflow':sum(x['overflow'] for x in results),'gallery_file_checks':11*14*2*2,'errors':len(errors)}}
 (ROOT/'verification/preview.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report['summary']))
if __name__=='__main__':main()
