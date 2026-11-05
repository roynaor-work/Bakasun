"""Compare rendered budget proportions with the independent numerical rows below them."""
from pathlib import Path
from urllib.parse import urlsplit,unquote
import json,mimetypes,argparse,io,re
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--iteration',required=True);args=ap.parse_args();out=ROOT/'iterations'/args.iteration;out.mkdir(exist_ok=True);rows=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=browser.new_context();ctx.set_offline(True)
  def route(r):
   p=ROOT/unquote(urlsplit(r.request.url).path).lstrip('/');r.fulfill(status=200,content_type=mimetypes.guess_type(p.name)[0] or 'application/octet-stream',body=p.read_bytes())
  ctx.route('http://127.0.0.1:8765/**',route);page=ctx.new_page()
  for w,h in [(390,844),(844,390),(1440,1000)]:
   page.set_viewport_size({'width':w,'height':h})
   for theme in ['light','dark']:
    for name in ['budget','event']:
     page.goto(f'http://127.0.0.1:8765/{name}.html?theme={theme}'+('#budget' if name=='event' else ''));page.evaluate('document.fonts.ready')
     card=page.locator('.card:has(.allocation):visible');values=[int(re.sub(r'\D','',x)) for x in card.locator('.cost-row strong bdi').all_text_contents()];expected=[x/sum(values) for x in values];actual=card.locator('.allocation i').evaluate_all('els=>{const a=els.map(e=>e.getBoundingClientRect().width),s=a.reduce((x,y)=>x+y,0);return a.map(x=>x/s)}');ok=len(actual)==len(expected)==3 and all(abs(a-b)<.01 for a,b in zip(actual,expected));rows.append({'page':name,'viewport':f'{w}x{h}','theme':theme,'row_values':values,'expected':expected,'actual':actual,'pass':ok})
     if name=='budget':Image.open(io.BytesIO(card.screenshot())).convert('RGB').save(out/f'budget-allocation-{theme}-{w}x{h}.webp','WEBP',lossless=True,method=6)
  browser.close()
 report={'checks':rows,'summary':{'checks':len(rows),'failures':sum(not r['pass'] for r in rows)}};(out/'budget-chart.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report['summary']))
if __name__=='__main__':main()
