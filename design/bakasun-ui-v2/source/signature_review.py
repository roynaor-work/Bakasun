"""Check that an in-memory signature remains visible across theme changes and edits invalidate approval."""
from pathlib import Path
from urllib.parse import urlsplit,unquote
import json,argparse,mimetypes,io
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--iteration',required=True);args=ap.parse_args();out=ROOT/'iterations'/args.iteration;out.mkdir(exist_ok=True)
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':390,'height':844});ctx.set_offline(True)
  def route(r):
   p=ROOT/unquote(urlsplit(r.request.url).path).lstrip('/');r.fulfill(status=200,content_type=mimetypes.guess_type(p.name)[0] or 'application/octet-stream',body=p.read_bytes())
  ctx.route('http://127.0.0.1:8765/**',route);page=ctx.new_page();page.goto('http://127.0.0.1:8765/contract.html?theme=light');page.evaluate('document.fonts.ready');canvas=page.locator('canvas');canvas.scroll_into_view_if_needed();r=canvas.bounding_box();page.mouse.move(r['x']+30,r['y']+80);page.mouse.down();page.mouse.move(r['x']+150,r['y']+30,steps=12);page.mouse.up()
  page.locator('[data-signature-name]').fill('תפקיד חתימה בדוי');page.locator('[data-consent]').check();page.locator('[data-sign-contract]').click()
  page.locator('[data-theme-toggle]').click();canvas.scroll_into_view_if_needed()
  pixels=canvas.evaluate('''c=>{const ctx=c.getContext('2d'),data=ctx.getImageData(0,0,c.width,c.height).data;let sum=[0,0,0],n=0;for(let i=0;i<data.length;i+=4){if(data[i+3]>200){sum[0]+=data[i];sum[1]+=data[i+1];sum[2]+=data[i+2];n++}}return {mean:sum.map(x=>Math.round(x/n)),pixels:n,expected:getComputedStyle(c).color}}''')
  expected=[242,242,233];visible=all(abs(pixels['mean'][i]-expected[i])<5 for i in range(3))
  Image.open(io.BytesIO(page.screenshot())).save(out/'signature-theme-change.webp','WEBP',lossless=True,method=6)
  page.locator('[data-signature-name]').fill('תפקיד אחר בדוי');invalidated=not page.locator('[data-signed]').is_visible()
  result={'theme_change':{'pass':visible,'pixels':pixels,'expected_dark_ink':expected},'approval_invalidated_after_edit':{'pass':invalidated},'summary':{'passed':int(visible)+int(invalidated),'failed':2-int(visible)-int(invalidated)}}
  (out/'signature-review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False));browser.close()
if __name__=='__main__':main()
