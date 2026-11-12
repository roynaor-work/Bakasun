// CC0-1.0 browser verification. Requires externally installed Playwright.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(process.env.ALIEN_V16_PLAYWRIGHT_PACKAGE||'/tmp/alien-v16-tools/package.json');
const {chromium}=require('playwright');
const root=new URL('../',import.meta.url),errors=[],failed=[];
const browser=await chromium.launch({executablePath:process.env.ALIEN_V16_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:980},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>failed.push(`${r.url()}: ${r.failure()?.errorText}`));
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))failed.push(`${r.status()}: ${r.url()}`);});
 await page.goto(process.env.ALIEN_V16_PREVIEW_URL||'http://127.0.0.1:8765/workout/island/design/alien-v16/preview.html');
 await page.waitForFunction(()=>window.assetReview?.loaded.length===6&&window.assetReview.frames>5);
 await page.locator('#bosses button').first().click();
 const before=await page.locator('#bosses canvas').first().screenshot();
 await page.waitForTimeout(300);
 const after=await page.locator('#bosses canvas').first().screenshot();
 if(before.equals(after))throw Error('Rotate control did not change the rendered ship');
 await page.locator('#bosses button').first().click();
 await page.locator('#timer-step').fill('11');
 const result=await page.evaluate(async()=>{
  const images=[...document.images];await Promise.all(images.map(im=>im.decode()));
  const context=new AudioContext({sampleRate:48000}),sounds=[];
  for(const [name,duration] of [['laser-zap',.15],['laser-hum-loop',1],['plasma-shot',.2],['boss-alarm',1]]){
   const b=await context.decodeAudioData(await(await fetch(`audio/${name}.ogg`)).arrayBuffer());
   const x=b.getChannelData(0);let delta=0;
   for(let i=1;i<x.length;i++)delta=Math.max(delta,Math.abs(x[i]-x[i-1]));
   sounds.push({name,duration:b.duration,expectedDuration:duration,samples:b.length,sampleRate:b.sampleRate,
    seamDelta:Math.abs(x[0]-x.at(-1)),maxAdjacentDelta:delta});
  }
  await context.close();
  return {fleet:window.assetReview.loaded,errors:window.assetReview.errors,images:images.length,
   timer:document.querySelector('#timer-label').textContent,sounds};
 });
 if(result.sounds.some(s=>Math.abs(s.duration-s.expectedDuration)>1/48000))throw Error('Decoded duration mismatch');
 const hum=result.sounds.find(s=>s.name==='laser-hum-loop');
 if(hum.seamDelta>hum.maxAdjacentDelta*1.25)throw Error('Hum loop seam is louder than adjacent samples');
 if(result.fleet.some(m=>m.nodes.some(n=>!n)))throw Error('Missing boss pivot node');
 if(errors.length||failed.length||result.errors.length)throw Error(JSON.stringify({errors,failed,result}));
 await page.screenshot({path:new URL('verification/desktop.png',root).pathname,fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:new URL('verification/mobile.png',root).pathname,fullPage:true});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(overflow)throw Error('Horizontal overflow at 390px');
 await fs.writeFile(new URL('verification/browser-results.json',root),JSON.stringify({license:'CC0-1.0',status:'pass',desktop:[1200,980],mobile:[390,844],overflow,errors,failed,...result},null,2)+'\n');
 console.log(JSON.stringify({status:'pass',models:result.fleet.length,sounds:result.sounds,images:result.images},null,2));
}finally{await browser.close();}
