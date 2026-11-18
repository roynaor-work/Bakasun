// SPDX-License-Identifier: CC0-1.0
// Browser verification and actual rendered 8-frame sheets. Start a static server first.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const base=new URL('../',import.meta.url),url=(process.env.TENNIS_PREVIEW_ORIGIN??'http://127.0.0.1:8765')+'/workout/island/design/tennis-grip-v1/preview.html';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await fs.mkdir(new URL('frames/',base),{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1}),errors=[],external=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(new URL(url).origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))external.push(r.url());});
await page.addInitScript(()=>Object.defineProperty(window,'WebAssembly',{value:undefined}));
await page.goto(url);await page.waitForFunction(()=>window.tennisGrip?.ready);await page.evaluate(()=>tennisGrip.pause());
const catalog=await page.evaluate(()=>tennisGrip.catalog),clips=[];
for(const clip of catalog.clips){
 await page.evaluate(id=>{tennisGrip.setClip(id);tennisGrip.setView('three');},clip.id);
 const snapshots=[];
 for(let i=0;i<8;i++){
  const result=await page.evaluate(({t})=>{tennisGrip.seek(t);return {image:tennisGrip.renderAsset(288,330),snapshot:tennisGrip.snapshot()};},{t:clip.duration*i/7});
  await fs.writeFile(new URL('frames/'+clip.id+'-'+i+'.webp',base),Buffer.from(result.image.split(',')[1],'base64'));snapshots.push(result.snapshot);
 }
 await page.evaluate(t=>{tennisGrip.seek(t);tennisGrip.setView('grip');},clip.contactTime??clip.duration*.5);
 const close=await page.evaluate(()=>tennisGrip.renderAsset(768,550));await fs.writeFile(new URL('frames/'+clip.id+'-grip.webp',base),Buffer.from(close.split(',')[1],'base64'));
 clips.push({id:clip.id,snapshots});
}
// A fresh page must resolve every generated asset and every control.
const badResponses=[];page.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()});});
await page.reload();await page.waitForFunction(()=>window.tennisGrip?.ready);await page.evaluate(()=>{tennisGrip.pause();tennisGrip.setClip('forehand');tennisGrip.seek(1.30);});
await page.screenshot({path:new URL('verification/desktop.png',base).pathname,fullPage:true});
const controls=[];
for(const viewport of [{width:390,height:844},{width:844,height:390}]){
 await page.setViewportSize(viewport);await page.evaluate(()=>{tennisGrip.setClip('idle');tennisGrip.seek(0);});
 await page.screenshot({path:new URL(`verification/preview-${viewport.width}x${viewport.height}.png`,base).pathname,fullPage:true});
 const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
 await page.locator('[data-id="serve"]').click();const serveSelected=await page.evaluate(()=>tennisGrip.snapshot().clip==='serve');
 await page.locator('[data-view="grip"]').click();await page.locator('#filmstrip button').nth(3).click();
 const seekWorked=await page.evaluate(()=>Math.abs(tennisGrip.snapshot().time-4*3/7)<1e-5);
 controls.push({viewport,noOverflow,serveSelected,seekWorked});
}
const attachmentHelper=await page.evaluate(async()=>{
 const T=await import('../soccer-motion-v8/runtime/vendor/three.module.js'),{GLTFLoader}=await import('../soccer-motion-v8/runtime/vendor/GLTFLoader.js'),{attachRacket}=await import('./runtime/attach.mjs');
 const hand=new T.Group();hand.name='RightHand';const asset=await new GLTFLoader().loadAsync('runtime/racket.glb'),mask=await fetch('runtime/pose-mask.json').then(r=>r.json());
 attachRacket(T,hand,asset.scene,mask);const actual=hand.worldToLocal(asset.scene.getObjectByName('head').getWorldPosition(new T.Vector3())),expected=tennisGrip.catalog.grip.headInRightHand;
 return {headErrorMeters:actual.distanceTo(new T.Vector3(...expected)),pass:actual.distanceTo(new T.Vector3(...expected))<1e-6};
});
await page.goto(new URL('verification/qa/report.html',url).href);await page.locator('#search').fill('serve');
const qaFilter=await page.locator('#clipTable tbody tr:visible').count()===1;
await page.locator('#clipTable tbody tr:visible a').first().click();
await page.getByRole('link',{name:'תצוגת שלד בתלת־ממד'}).click();await page.waitForFunction(()=>window.tennisGrip?.ready);
const qaNavigation={filterWorks:qaFilter,returnsToNativePreview:await page.evaluate(()=>tennisGrip.snapshot().clip==='serve')};
await browser.close();
const expected=catalog.grip.headInRightHand;let maxHeadError=0,maxScaleError=0;
for(const c of clips)for(const s of c.snapshots){maxHeadError=Math.max(maxHeadError,Math.hypot(...s.headInHand.map((v,i)=>v-expected[i])));maxScaleError=Math.max(maxScaleError,Math.hypot(...s.racketScale.map(v=>v-1)));}
const report={browser:'Chromium + SwiftShader',webAssemblyDisabled:true,clips,controls,attachmentHelper,qaNavigation,externalRequests:external,errors,badResponses,maxHeadErrorMeters:maxHeadError,maxRacketScaleError:maxScaleError,pass:errors.length===0&&badResponses.length===0&&external.length===0&&maxHeadError<1e-6&&maxScaleError<1e-6&&controls.every(c=>c.noOverflow&&c.serveSelected&&c.seekWorked)&&attachmentHelper.pass&&Object.values(qaNavigation).every(Boolean)};
await fs.writeFile(new URL('verification/browser.json',base),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,frames:clips.length*8,closeups:clips.length,controls,errors,badResponses,maxHeadError,maxScaleError}));if(!report.pass)process.exitCode=1;
