"""20-minute actual-input modal lifecycle audit, complementary to the scroll/FPS audit.
Run after performance.py has completed, keeping the final runtime unchanged.
"""
from pathlib import Path
from urllib.parse import urlsplit,unquote
from datetime import datetime,timezone
import json,mimetypes,time,hashlib,argparse,statistics
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parent.parent
ORIGIN='http://127.0.0.1:8765/'

def utc():return datetime.now(timezone.utc).isoformat()
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--minutes',type=float,default=20);args=ap.parse_args();target=ROOT/'verification/memory-review.json'
 files=[*ROOT.glob('*.html'),*ROOT.glob('assets/*.css'),*ROOT.glob('assets/*.js')];hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
 report={'started_at':utc(),'requested_minutes':args.minutes,'runtime_sha256':hashes,'cpu_throttle':4,'DPR':2,'physical_phone':False,'checkpoints':[],'errors':[],'external_requests':[],'cycles':0,'runtime_changed':False}
 start=time.monotonic();deadline=start+args.minutes*60;latencies=[]
 def save():
  report['updated_at']=utc();report['elapsed_seconds']=round(time.monotonic()-start,2);report['summary']={'cycles':report['cycles'],'actions':report['cycles']*2,'checkpoints':len(report['checkpoints']),'errors':len(report['errors']),'external_requests':len(report['external_requests']),'open_close_median_ms':round(statistics.median(latencies)*1000,2) if latencies else None};target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage']);ctx=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,has_touch=True,is_mobile=True);ctx.set_offline(True)
  def fulfill(route):
   p=(ROOT/unquote(urlsplit(route.request.url).path).lstrip('/')).resolve()
   if not p.is_relative_to(ROOT) or not p.is_file():report['errors'].append('Missing local file');route.abort();return
   route.fulfill(status=200,content_type=mimetypes.guess_type(p.name)[0] or 'application/octet-stream',body=p.read_bytes())
  ctx.route(ORIGIN+'**',fulfill);ctx.on('request',lambda r:report['external_requests'].append(r.url) if not r.url.startswith((ORIGIN,'data:','blob:')) else None)
  page=ctx.new_page();page.on('pageerror',lambda e:report['errors'].append(str(e)));cdp=ctx.new_cdp_session(page);cdp.send('Emulation.setCPUThrottlingRate',{'rate':4});page.goto(ORIGIN+'suppliers.html?theme=light');page.evaluate('document.fonts.ready')
  buttons=page.locator('[data-detail]');i=0
  while time.monotonic()<deadline:
   if i%100==0 and any(hashlib.sha256((ROOT/k).read_bytes()).hexdigest()!=v for k,v in hashes.items()):report['runtime_changed']=True;report['errors'].append('Runtime changed during modal audit');break
   button=buttons.nth(i%buttons.count());before=time.monotonic();button.click();expect(page.locator('#main-dialog')).to_be_visible();page.keyboard.press('Escape');expect(page.locator('#main-dialog')).not_to_be_visible();expect(button).to_be_focused();latencies.append(time.monotonic()-before);i+=1;report['cycles']=i
   if i%100==0:
    cdp.send('HeapProfiler.collectGarbage');heap=cdp.send('Runtime.getHeapUsage');counters=cdp.send('Memory.getDOMCounters');nodes=page.evaluate('document.getElementsByTagName("*").length');report['checkpoints'].append({'cycle':i,'at':utc(),'elapsed_seconds':round(time.monotonic()-start,2),'document_elements':nodes,'heap_used_bytes':heap['usedSize'],**counters});save();print(json.dumps({'minutes':round(report['elapsed_seconds']/60,2),**report['checkpoints'][-1],**report['summary']}),flush=True)
   if i%500==0:page.locator('[data-theme-toggle]').click()
  browser.close()
 if len(report['checkpoints'])>=2:
  points=report['checkpoints'];first=points[0];last=points[-1];report['stability']={'DOM_element_range':max(x['document_elements'] for x in points)-min(x['document_elements'] for x in points),'listener_range':max(x['jsEventListeners'] for x in points)-min(x['jsEventListeners'] for x in points),'heap_first_bytes':first['heap_used_bytes'],'heap_last_bytes':last['heap_used_bytes'],'heap_delta_bytes':last['heap_used_bytes']-first['heap_used_bytes'],'pass':max(x['document_elements'] for x in points)==min(x['document_elements'] for x in points) and max(x['jsEventListeners'] for x in points)==min(x['jsEventListeners'] for x in points) and last['heap_used_bytes']-first['heap_used_bytes']<1_000_000}
 report['finished_at']=utc();save();print('FINISHED '+json.dumps(report['summary']),flush=True)
if __name__=='__main__':main()
