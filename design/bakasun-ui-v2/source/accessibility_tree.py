"""Read the actual Chromium accessibility tree, including mobile table header associations."""
from pathlib import Path
from urllib.parse import urlsplit,unquote
from collections import Counter
import json,mimetypes
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
PAGES=['clients','suppliers','invoices','finance','proposals','budget','system']
def main():
 rows=[]
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=browser.new_context();ctx.set_offline(True)
  def fulfill(r):
   p=(ROOT/unquote(urlsplit(r.request.url).path).lstrip('/')).resolve();r.fulfill(status=200,content_type=mimetypes.guess_type(p.name)[0] or 'application/octet-stream',body=p.read_bytes())
  ctx.route('http://127.0.0.1:8765/**',fulfill);page=ctx.new_page();cdp=ctx.new_cdp_session(page)
  for width,height in [(320,740),(390,844),(844,390),(1440,1000)]:
   page.set_viewport_size({'width':width,'height':height})
   for theme in ['light','dark']:
    for name in PAGES+['event']:
     page.goto(f'http://127.0.0.1:8765/{name}.html?theme={theme}');page.evaluate('document.fonts.ready')
     for tab in (['suppliers','money','participants','budget','files'] if name=='event' else [None]):
      if tab:
       if width<=600:page.locator('[data-tab-select]').select_option(tab)
       else:page.locator('[data-tab="'+tab+'"]').click()
      expected=page.locator('table').evaluate_all('els=>els.filter(t=>t.getBoundingClientRect().width>0).flatMap(t=>[...t.querySelectorAll("th")].map(e=>e.textContent.trim()))')
      nodes=cdp.send('Accessibility.getFullAXTree')['nodes'];headers=[n.get('name',{}).get('value') for n in nodes if not n.get('ignored') and n.get('role',{}).get('value')=='columnheader'];cells=[n.get('name',{}).get('value') for n in nodes if not n.get('ignored') and n.get('role',{}).get('value')=='cell']
      row={'page':name,'tab':tab,'viewport':f'{width}x{height}','theme':theme,'expected_headers':expected,'actual_headers':headers,'cell_count':len(cells),'pass':Counter(expected)==Counter(headers)};rows.append(row)
  browser.close()
 report={'method':'CDP Accessibility.getFullAXTree; match visible-table th names against actual columnheader nodes','checks':rows,'summary':{'checks':len(rows),'failures':sum(not r['pass'] for r in rows)}};(ROOT/'verification/accessibility-tree.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report['summary']));print(json.dumps([r for r in rows if not r['pass']],ensure_ascii=False)[:3000])
if __name__=='__main__':main()
