#!/usr/bin/env python3
"""CC0-1.0. Audit the local preview with Playwright; start HTTP on port 8765 first.
Screenshots go to /tmp; the JSON evidence stays beside this script.
"""
import asyncio, json, hashlib, shutil
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent
URL='http://127.0.0.1:8765/workout/island/design/sirens-vulcan-audio-v1/preview.html'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--autoplay-policy=no-user-gesture-required'])
  page=await browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
  errors=[];external=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('request',lambda r:external.append(r.url) if not r.url.startswith('http://127.0.0.1:8765/') else None)
  await page.goto(URL)
  await page.wait_for_function("document.querySelectorAll('article').length===12")
  results=[]
  for fmt in ['ogg','mp3']:
   await page.select_option('#format',fmt)
   for i in range(12):
    b=page.locator('article button').nth(i)
    await b.click()
    await page.wait_for_function("document.querySelector('#status').textContent.startsWith('מנגן:')")
    info=await page.evaluate('''() => ({id:playing, sampleRate:context.sampleRate,frames:voices[0].source.buffer.length,duration:voices[0].source.buffer.duration,loop:voices[0].source.loop,channels:voices[0].source.buffer.numberOfChannels})''')
    results.append({'format':fmt,**info})
    await page.locator('#stop').click()
    assert await page.evaluate('voices.length===0 && playing===null')
  await page.locator('article button').first.click()
  await page.wait_for_function('voices.length===1')
  await page.locator('#volume').fill('17')
  await page.wait_for_timeout(80)
  assert await page.evaluate('Math.abs(master.gain.value-.17)<.005')
  await page.locator('#volume').fill('0')
  await page.wait_for_timeout(100)
  assert await page.evaluate('master.gain.value<.001')
  await page.locator('#stop').click()
  for fmt in ['ogg','mp3']:
   await page.select_option('#format',fmt)
   await page.locator('#burst').click()
   await page.wait_for_function('voices.length===3')
   await page.wait_for_timeout(4200)
   assert await page.evaluate('voices.length===0')
  for width,height in [(390,844),(844,390),(1280,800)]:
   await page.set_viewport_size({'width':width,'height':height})
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  await page.set_viewport_size({'width':390,'height':844})
  await page.locator('#volume').fill('35')
  await page.screenshot(path='/tmp/sirens-preview-mobile.png',full_page=True)
  await page.set_viewport_size({'width':1280,'height':800})
  await page.screenshot(path='/tmp/sirens-preview-desktop.png',full_page=True)
  decoded=await page.evaluate('''async()=>{
   const results=[];
   for(const rate of [44100,48000]){
    const c=new OfflineAudioContext(2,rate,rate);
    for(const a of manifest.assets.filter(a=>a.loop))for(const [format,path] of Object.entries(a.files)){
     const b=await c.decodeAudioData(await(await fetch(path)).arrayBuffer());
     const chans=[];
     for(let ch=0;ch<b.numberOfChannels;ch++){
      const x=b.getChannelData(ch),d=[];
      for(let i=1;i<x.length;i++)d.push(Math.abs(x[i]-x[i-1]));
      d.sort((a,b)=>a-b);
      const jump=Math.abs(x[0]-x[x.length-1]);
      chans.push({jump_vs_internal_p999:jump/Math.max(d[Math.floor(d.length*.999)],1e-9)});
     }
     results.push({id:a.id,format,rate,frames:b.length,expected_frames:Math.round(a.duration*rate),channels:chans});
    }
   }
   return results;
  }''')
  assert not errors,errors
  assert not external,external
  assert all(r['frames']==r['expected_frames'] and max(c['jump_vs_internal_p999'] for c in r['channels'])<=1.1 for r in decoded),decoded
  report={'audit_script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'browser':browser.version,'preview_sha256':hashlib.sha256((ROOT/'preview.html').read_bytes()).hexdigest(),'playback':results,'loop_decodes':decoded,'responsive_viewports':['390x844','844x390','1280x800'],'master_volume_and_mute':'pass','vulcan_sequence_both_formats':'pass','stop_all':'pass','page_errors':errors,'external_requests':external,'pass':True}
  (ROOT/'browser-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps({'pass':True,'playbacks':len(results),'loop_decodes':len(decoded),'browser':browser.version}))
  await browser.close()
asyncio.run(main())
