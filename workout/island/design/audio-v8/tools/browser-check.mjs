/** Optional browser verification: npm install --prefix /tmp/audio-tools playwright
 * AUDIO_V8_PLAYWRIGHT=/tmp/audio-tools/node_modules/playwright/index.mjs node tools/browser-check.mjs [report.md]
 * No browser dependency is required by the runtime or node --test.
 * Optional: AUDIO_V8_OUTPUT_RATE=44100; AUDIO_V8_CSP_FILE=../../index.html
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, writeFile, access} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, extname, sep} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const outputRate=Number(process.env.AUDIO_V8_OUTPUT_RATE??48000);
assert.ok([44100,48000].includes(outputRate),'AUDIO_V8_OUTPUT_RATE must be 44100 or 48000');

export async function serve() {
  let csp=null;
  if(process.env.AUDIO_V8_CSP_FILE) {
    const html=await readFile(resolve(process.env.AUDIO_V8_CSP_FILE),'utf8');
    const match=html.match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/i);
    assert.ok(match,'CSP source must contain the shipped meta policy');csp=match[1];
  }
  const server=createServer(async(request,response)=>{
    try {
      const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
      const path=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
      if(!path.startsWith(root.endsWith(sep)?root:root+sep))throw Error('outside root');
      const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.md':'text/plain; charset=utf-8'}[extname(path)]??'application/octet-stream';
      const headers={'Content-Type':mime,'Cache-Control':'no-store'};
      if(csp&&extname(path)==='.html')headers['Content-Security-Policy']=csp;
      response.writeHead(200,headers);response.end(await readFile(path));
    } catch { response.writeHead(404);response.end('Not found'); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,url:`http://127.0.0.1:${server.address().port}`,csp};
}
export async function launch() {
  const packageName=process.env.AUDIO_V8_PLAYWRIGHT;
  const {chromium}=await import(packageName?pathToFileURL(resolve(packageName)).href:'playwright');
  let executablePath=process.env.AUDIO_V8_CHROMIUM;
  if(!executablePath)try{await access('/usr/bin/chromium');executablePath='/usr/bin/chromium';}catch{}
  return chromium.launch({executablePath,headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--js-flags=--expose-gc']});
}

export async function verify() {
  const {server,url,csp}=await serve(),browser=await launch();
  const errors=[],requests=[];
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>requests.push(request.url()));
    await page.addInitScript(()=>{window.cspViolations=[];addEventListener('securitypolicyviolation',event=>window.cspViolations.push(event.effectiveDirective));});
    await page.goto(url);await page.waitForSelector('.card');
    assert.equal(await page.locator('.card').count(),36);
    const viewports=[];
    for(const viewport of [{width:320,height:640},{width:390,height:844},{width:844,height:390}]) {
      await page.setViewportSize(viewport);
      const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
        smallButtons:[...document.querySelectorAll('button')].filter(button=>!button.closest('[hidden]')&&button.getBoundingClientRect().height<44).length}));
      assert.ok(result.scroll<=result.width);assert.equal(result.smallButtons,0);viewports.push(`${viewport.width}×${viewport.height}`);
    }
    await page.locator('#enable').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('מוכן'));
    await page.locator('[data-sound="whistle"] button').click();await page.waitForFunction(()=>document.querySelector('#measurement').textContent.includes('0.190'));
    await page.locator('#stop').click();
    await page.locator('#group').selectOption('soccer');assert.equal(await page.locator('.card:visible').count(),5);
    await page.locator('#group').selectOption('all');
    await page.evaluate(()=>{
      window.sourceCreations=0;const original=AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource=function(...args){window.sourceCreations++;return original.apply(this,args);};
      document.querySelector('#audition').click();document.querySelector('#stop').click();
    });
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(()=>window.sourceCreations),0,'stop during preparation must prevent future playback');
    assert.equal(await page.locator('.playing').count(),0);
    await page.evaluate(()=>{document.querySelector('[data-sound="whistle"] button').click();document.querySelector('#stop').click();});
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.sourceCreations),0,'stop during async unlock must prevent playback');

    const rows=await page.evaluate(async outputRate=>{
      const {createSportsAudio,SOUND_CATALOG}=await import('./runtime/sports-audio.mjs');
      const results=[];
      for(const [name,spec] of Object.entries(SOUND_CATALOG)) {
        const rate=outputRate,offline=new OfflineAudioContext(1,Math.ceil((spec.maxDuration+.35)*rate),rate);
        // OfflineAudioContext is suspended before startRendering; expose only its
        // scheduling interface as running while retaining real browser DSP nodes.
        const context=new Proxy(offline,{get(target,key){if(key==='state')return'running';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
        const player=createSportsAudio({context,document:null,pageTarget:null,volume:1});
        if(!await player.unlock())throw Error(`unlock ${name}`);
        const handle=player[name]({duration:999,tone:.75,intensity:1});if(!handle)throw Error(`play ${name}`);
        const samples=(await offline.startRendering()).getChannelData(0);
        let peak=0,last=0,tailPeak=0;
        for(let i=0;i<samples.length;i++) {
          peak=Math.max(peak,Math.abs(samples[i]));
          if(Math.abs(samples[i])>1e-5)last=(i+1)/rate;
          if(i>(spec.maxDuration+.02)*rate)tailPeak=Math.max(tailPeak,Math.abs(samples[i]));
        }
        results.push({name,peak,last,tailPeak,cap:spec.maxDuration,active:player.metrics.activeVoices});
        await player.dispose();
      }
      return results;
    },outputRate);
    for(const row of rows) {
      assert.ok(row.peak>1e-4&&row.peak<.91,row.name);
      assert.ok(row.last<=row.cap,`${row.name}: ${row.last} > ${row.cap}`);
      assert.ok(row.tailPeak<1e-8,row.name);
      assert.equal(row.active,0,row.name);
    }
    const overlap=await page.evaluate(async outputRate=>{
      const {createSportsAudio}=await import('./runtime/sports-audio.mjs');
      const offline=new OfflineAudioContext(1,outputRate*4,outputRate);
      const context=new Proxy(offline,{get(target,key){if(key==='state')return'running';const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
      const player=createSportsAudio({context,document:null,pageTarget:null,volume:1,maxVoices:8});await player.unlock();
      for(const name of ['whistle','basketballBounce','rimHit','soccerKick','crowdCheer','engineBurst','goalpostHit','applause'])player[name]({intensity:1});
      const accepted=player.metrics.activeVoices,rejected=player.tennisHit()===null;
      const officialAccepted=Boolean(player.buzzer({duration:.2,intensity:1})),afterOfficial=player.metrics.activeVoices;
      const samples=(await offline.startRendering()).getChannelData(0);let peak=0,tailPeak=0;
      for(let i=0;i<samples.length;i++){peak=Math.max(peak,Math.abs(samples[i]));if(i>3.5*outputRate)tailPeak=Math.max(tailPeak,Math.abs(samples[i]));}
      const result={accepted,rejected,officialAccepted,afterOfficial,peak,tailPeak,active:player.metrics.activeVoices};await player.dispose();return result;
    },outputRate);
    assert.equal(overlap.accepted,8);assert.equal(overlap.rejected,true);assert.ok(overlap.peak<.91);assert.equal(overlap.tailPeak,0);assert.equal(overlap.active,0);
    assert.equal(overlap.officialAccepted,true);assert.equal(overlap.afterOfficial,8);
    const interruption=await page.evaluate(async()=>{
      const {createSportsAudio}=await import('./runtime/sports-audio.mjs');
      const context=new AudioContext(),player=createSportsAudio({context,document:null,pageTarget:null});await player.unlock();
      const handle=player.crowdCheer({delay:.2});await context.suspend();
      await new Promise(resolve=>setTimeout(resolve,30));
      const afterSuspend=player.metrics.activeVoices;await handle.ended;
      await context.resume();const afterResume=player.metrics.activeVoices;
      await player.dispose();const externalState=context.state;await context.close();
      return {afterSuspend,afterResume,externalState};
    });
    assert.deepEqual(interruption,{afterSuspend:0,afterResume:0,externalState:'running'});
    const timing=await page.evaluate(async()=>{
      const {SOUND_CATALOG,renderSound}=await import('./runtime/sports-audio.mjs');
      const times=[];
      for(const name of Object.keys(SOUND_CATALOG)) {
        const measurements=[];
        for(let run=0;run<7;run++){const start=performance.now();renderSound(name,{seed:run});measurements.push(performance.now()-start);}
        measurements.sort((a,b)=>a-b);times.push({name,median:measurements[3],max:Math.max(...measurements)});
      }
      return times;
    });
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    const preparedTiming=await page.evaluate(async()=>{
      const {createSportsAudio}=await import('./runtime/sports-audio.mjs');
      const player=createSportsAudio({document:null,pageTarget:null});await player.unlock();
      const names=['whistle','basketballBounce','netSwish','rimHit','crowdCheer'];
      const prepared=await player.prepare(names),times=[];
      for(let i=0;i<80;i++){
        const start=performance.now(),handle=player[names[i%names.length]]({intensity:.1+(i%9)*.1});
        times.push(performance.now()-start);if(handle)player.stopAll();
        await new Promise(resolve=>setTimeout(resolve,40));
      }
      const result={prepared:prepared.prepared,cache:player.metrics.cacheBytes,limit:player.metrics.cacheLimit,median:times.sort((a,b)=>a-b)[40],max:Math.max(...times)};
      await player.dispose();return result;
    });
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();
    assert.ok(preparedTiming.cache<=preparedTiming.limit);
    await page.evaluate(()=>{
      const volume=document.querySelector('#volume');volume.value='0';volume.dispatchEvent(new Event('input'));
      document.querySelector('#audition').click();
    });
    assert.match(await page.locator('#status').textContent(),/אפס/);
    await page.evaluate(()=>{
      const volume=document.querySelector('#volume');volume.value='.65';volume.dispatchEvent(new Event('input'));
      document.querySelector('#audition').click();
    });
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('הושמעו 36'),{},{timeout:90000});
    assert.equal(await page.locator('.playing').count(),0);
    if(process.env.AUDIO_V8_SCREENSHOT) {
      await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:process.env.AUDIO_V8_SCREENSHOT,type:'png'});
    }
    assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.cspViolations),[]);
    assert.ok(requests.every(request=>new URL(request).origin===url),'unexpected network dependency');
    const report=`# Browser verification · ${new Date().toISOString()}\n\nChromium ${await browser.version()}. Real OfflineAudioContext, ${outputRate} Hz output; runtime buffers at 24 kHz. All events requested at their maximum duration, tone 0.75, intensity 1. No external requests.\n\n`+
      `UI: 36 buttons, gesture unlock, play/stop, category filter, no overflow at ${viewports.join(', ')}; buttons ≥44 px. Page errors: ${errors.length}.\n\n`+
      `Eight-voice overlap: peak ${overlap.peak.toFixed(6)}, ordinary ninth rejected; official accepted by replacing a lower-priority voice, count stays ${overlap.afterOfficial}; active after rendering ${overlap.active}, late tail ${overlap.tailPeak}.\n\n`+
      `Prepared playback at Chromium CPU throttle 4×: ${preparedTiming.prepared} buffers prepared; 80 calls with varied intensity; median ${preparedTiming.median.toFixed(2)} ms, worst ${preparedTiming.max.toFixed(2)} ms; cache ${preparedTiming.cache}/${preparedTiming.limit} bytes. This is a CPU proxy, not a physical-phone measurement. UI cancellation during prepare/unlock: PASS.\n\n`+
      `Real AudioContext interruption: sources after suspend ${interruption.afterSuspend}, after resume ${interruption.afterResume}; caller-owned context remains ${interruption.externalState} after player disposal.\n\n`+
      'Listening page: all 36 events completed a real-time audition; zero volume does not report successful playback.\n\n'+
      `CSP: ${csp?'exact policy read from the supplied shipped HTML, enforced as an HTTP header':'no policy supplied'}; violations: 0.\n\n`+
      '| Sound | Last audible (s) | Cap (s) | Peak through graph | Late tail | Cold/warm median (ms) | Worst (ms) |\n|---|---:|---:|---:|---:|---:|---:|\n'+
      rows.map(row=>{const time=timing.find(t=>t.name===row.name);return`| ${row.name} | ${row.last.toFixed(5)} | ${row.cap.toFixed(2)} | ${row.peak.toFixed(5)} | ${row.tailPeak.toExponential(1)} | ${time.median.toFixed(2)} | ${time.max.toFixed(2)} |`;}).join('\n')+'\n';
    if(process.argv[2])await writeFile(process.argv[2],report);else process.stdout.write(report);
    return {rows,overlap,timing,preparedTiming,version:await browser.version()};
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await verify();
