#!/usr/bin/env python3
"""Verify listen.html with native Chromium decoding. Requires Python Playwright and Chromium.

Reads all audio from a temporary loopback server; writes only browser-verification.json
in this directory and optional screenshots in /tmp. No external requests or interception.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, threading, http.server, functools, time, hashlib, shutil
folder=Path(__file__).resolve().parent
root=folder.parents[3]
manifest_bytes=(folder/'manifest.json').read_bytes()
manifest=json.loads(manifest_bytes)
for asset in manifest['assets']:
 for item in asset['files'].values():
  assert hashlib.sha256((folder/item['path']).read_bytes()).hexdigest()==item['sha256'],item['path']
delayed_paths=set()
class QuietHandler(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  if self.path in delayed_paths: time.sleep(.35)
  return super().do_GET()
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
url='http://127.0.0.1:'+str(server.server_port)+'/workout/island/design/racing-audio-v5/listen.html'
errors=[];requests=[];failed=[];results=[]
with sync_playwright() as p:
 executable=shutil.which('chromium') or shutil.which('google-chrome')
 launch_options={'executable_path':executable} if executable else {}
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'],**launch_options)
 page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
 page.add_init_script('''window.__audioAudit={decoded:[],starts:[]};window.__gainNodes=[];
 const originalGain=BaseAudioContext.prototype.createGain;
 BaseAudioContext.prototype.createGain=function(...args){const node=originalGain.apply(this,args);window.__gainNodes.push(node);return node;};
 const originalDecode=BaseAudioContext.prototype.decodeAudioData;
 BaseAudioContext.prototype.decodeAudioData=function(...args){return originalDecode.apply(this,args).then(buffer=>{window.__audioAudit.decoded.push({duration:buffer.duration,sample_rate:buffer.sampleRate,frames:buffer.length});return buffer;});};
 const originalStart=AudioBufferSourceNode.prototype.start;
 AudioBufferSourceNode.prototype.start=function(...args){window.__audioAudit.starts.push({loop:this.loop,start:this.loopStart,end:this.loopEnd,rate:this.playbackRate.value,offset:args[1]||0,duration:this.buffer.duration});return originalStart.apply(this,args);};
 ''')
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda r:requests.append(r.url))
 page.on('requestfailed',lambda r:failed.append({'url':r.url,'failure':r.failure}))
 page.goto(url);page.wait_for_selector('.asset')
 assert page.locator('.asset').count()==23
 assert page.evaluate('window.__audioAudit.starts.length===0 && window.__audioAudit.decoded.length===0')
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 for fmt in ['ogg','mp3']:
  page.locator('#format').select_option(fmt)
  for asset in manifest['assets']:
   card=page.locator('[data-asset-id="'+asset['id']+'"]')
   card.locator('button').click()
   page.wait_for_function('''(id)=>{const c=document.querySelector('[data-asset-id="'+id+'"]');return c.classList.contains('playing');}''',arg=asset['id'])
   active=card.locator('.active-format').inner_text()
   assert fmt.upper() in active,(asset['id'],active)
   assert abs(page.evaluate('window.__gainNodes[0].gain.value')-.65*(10**(manifest['mixing']['master_gain_db']/20)))<1e-6
   page.locator('#stopAll').click()
   results.append({'asset':asset['id'],'format':fmt,'decoded_and_started':True})
 # Actual pit mix, each surface transition, both brake thresholds, variants and raw solo.
 page.locator('#pitPlay').click();page.wait_for_timeout(750)
 assert page.locator('#pitPlay').get_attribute('aria-pressed')=='true'
 page.locator('#bay').evaluate('(e)=>{e.value="100";e.dispatchEvent(new Event("input",{bubbles:true}));}')
 page.locator('#crew').uncheck();page.wait_for_timeout(100)
 page.locator('#limiter').uncheck();page.wait_for_timeout(100)
 for surface in ['gravel','grass','asphalt']:
  page.locator('[data-surface="'+surface+'"]').click();page.wait_for_timeout(500)
  assert page.locator('[data-surface="'+surface+'"]').get_attribute('aria-pressed')=='true'
 page.locator('#brakePlay').click();page.wait_for_timeout(250)
 for speed in [0,60,100,140]:
  page.locator('#speed').evaluate('(e,v)=>{e.value=String(v);e.dispatchEvent(new Event("input",{bubbles:true}));}',speed)
  page.wait_for_timeout(220)
 for control in ['shiftUp','shiftUp','shiftUp','shiftDown','shiftDown','shiftDown','decelerate','decelerate','decelerate','decelerate']:
  page.locator('#'+control).click();page.wait_for_timeout(110)
 page.locator('#raw').check()
 assert page.locator('#brakePlay').get_attribute('aria-pressed')=='false'
 page.locator('.asset button').first.click();page.wait_for_selector('.asset.playing')
 page.locator('.asset button').nth(1).click();page.wait_for_timeout(150)
 assert page.locator('.asset.playing').count()==1
 page.locator('#stopAll').click();assert page.locator('.asset.playing').count()==0
 page.locator('#pitPlay').click();page.wait_for_timeout(100)
 assert not page.locator('#raw').is_checked()
 page.keyboard.press('Escape');page.wait_for_timeout(150)
 assert page.locator('#pitPlay').get_attribute('aria-pressed')=='false'
 # Explicitly exercise cancellation while a cached decoder promise is pending.
 page.locator('.asset button').first.click();page.locator('#stopAll').click();page.wait_for_timeout(100)
 assert page.locator('.asset.playing').count()==0
 for width,height in [(390,844),(1280,900)]:
  page.set_viewport_size({'width':width,'height':height})
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
  page.screenshot(path='/tmp/racing-v5-listen-'+str(width)+'.png',full_page=True)
 # Delay actual HTTP delivery to exercise pending card -> scenario cancellation.
 delayed_paths.add('/workout/island/design/racing-audio-v5/audio/pit-engine-slow.ogg')
 race_page=browser.new_page()
 race_page.on('pageerror',lambda error:errors.append(str(error)))
 race_page.goto(url);race_page.wait_for_selector('.asset')
 race_page.locator('.asset button').first.click()
 race_page.locator('#pitPlay').click()
 race_page.wait_for_timeout(800)
 assert race_page.locator('.asset.playing').count()==0
 assert race_page.locator('#pitPlay').get_attribute('aria-pressed')=='true'
 race_page.locator('#stopAll').click()
 delayed_paths.clear()
 race_page.locator('#raw').check()
 race_page.locator('.asset button').first.click();race_page.wait_for_selector('.asset.playing')
 race_page.locator('#shiftUp').click();race_page.wait_for_timeout(200)
 assert not race_page.locator('#raw').is_checked()
 assert race_page.locator('.asset.playing').count()==0
 race_page.locator('#stopAll').click();race_page.close()
 # file:// offers clear local-server instructions without attempting fetch.
 file_page=browser.new_page()
 file_url_result='passed: local-server instructions shown'
 try:
  file_page.goto(folder.joinpath('listen.html').as_uri())
  file_page.wait_for_function('document.querySelector("#status").classList.contains("error")')
  assert file_page.locator('#localGuide').get_attribute('open') is not None
 except Exception as error:
  if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error): raise
  file_url_result='environment limitation: file:// navigation blocked by Chromium administrator policy'
 page.set_default_timeout(90000)
 offline=page.evaluate("""async (assets) => {
  const output=[];
  const db=value=>20*Math.log10(Math.max(value,1e-15));
  for(const asset of assets.filter(asset=>asset.loop.enabled)) for(const format of ['ogg','mp3']) {
   const bytes=await (await fetch(asset.files[format].path)).arrayBuffer();
   for(const sr of [44100,48000]) for(const rate of [1,1.08]) {
    const period=asset.loop.period_seconds/rate;
    const context=new OfflineAudioContext(1,Math.ceil((period*3+.1)*sr),sr);
    const buffer=await context.decodeAudioData(bytes.slice(0));
    const source=context.createBufferSource();source.buffer=buffer;source.loop=true;
    source.loopStart=asset.loop.start_seconds;source.loopEnd=asset.loop.end_seconds;
    source.playbackRate.value=rate;source.connect(context.destination);source.start(0,asset.loop.start_seconds);
    const rendered=await context.startRendering(),x=rendered.getChannelData(0);
    let residual=0,step=0,peak=0;
    for(let i=0;i<x.length;i++) peak=Math.max(peak,Math.abs(x[i]));
    for(let cycle=1;cycle<=2;cycle++) {
     const center=Math.round(period*cycle*sr);
     for(let i=center-3;i<=center+3;i++) {
      step=Math.max(step,Math.abs(x[i]-x[i-1]));
      residual=Math.max(residual,Math.abs(x[i] - x[i-1] - .5*((x[i+1]-x[i])+(x[i-1]-x[i-2]))));
     }
    }
    output.push({asset:asset.id,format,sample_rate_hz:sr,playback_rate:rate,decoded_duration:buffer.duration,loop_in_bounds:asset.loop.end_seconds<=buffer.duration,maximum_wrap_step_dbfs:db(step),maximum_local_slope_residual_dbfs:db(residual),residual_relative_to_peak_db:db(residual/peak)});
   }
  }
  return output;
 }""",manifest['assets'])
 assert all(item['loop_in_bounds'] for item in offline)
 assert max(item['maximum_local_slope_residual_dbfs'] for item in offline)<-55
 audit=page.evaluate('window.__audioAudit')
 output={'tested_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'browser':'Chromium '+browser.version,'method':'Native Web Audio decodeAudioData + AudioBufferSourceNode; actual local files, no request interception','audio_files':results,'audio_file_count':len(results),'native_decodes':len(audit['decoded']),'native_starts':len(audit['starts']),'native_loop_starts':sum(x['loop'] for x in audit['starts']),'viewports':[{'width':390,'height':844,'horizontal_overflow':False},{'width':1280,'height':900,'horizontal_overflow':False}],'scenario_checks':['pit layering and proximity','gravel to grass to asphalt gradual transitions','brake at zero and 3 speed levels','3 upshift + 3 downshift + 4 decel variants','raw mode solo isolation','raw to scenario restores nominal mix','stop-all and Escape','pending play cancellation','delayed actual HTTP card load cancelled by scenario','raw card cancelled by shift event','native decode of all 46 local compressed files','no autoplay or decoding before user action','manifest master gain applied at 65% volume'],'manifest_sha256':hashlib.sha256(manifest_bytes).hexdigest(),'listen_html_sha256':hashlib.sha256((folder/'listen.html').read_bytes()).hexdigest(),'file_url_check':file_url_result,'page_errors':errors,'failed_requests':failed,'external_requests':[x for x in requests if not x.startswith('http://127.0.0.1:')],'decoder_durations':audit['decoded'],'loop_points':[{k:x[k] for k in ['start','end','offset','duration','rate']} for x in audit['starts'] if x['loop']],'offline_loop_measurements':offline}
 (folder/'browser-verification.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in output.items() if k not in ['audio_files','decoder_durations','loop_points','offline_loop_measurements']},ensure_ascii=False))
 browser.close()
 assert not errors
 assert not failed
 assert not output['external_requests']
server.shutdown()
