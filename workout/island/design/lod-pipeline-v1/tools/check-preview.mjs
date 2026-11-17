#!/usr/bin/env node
// Optional browser QA. The build, preview and native validator need no packages.
// LOD_PLAYWRIGHT_MODULE may name an installed Playwright ESM entry point.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
const {chromium}=await import(process.env.LOD_PLAYWRIGHT_MODULE||'playwright');
const server=spawn(process.execPath,[path.join(root,'tools/serve.mjs')],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
const url=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',d=>{text+=d;const m=text.match(/http:\/\/127\.0\.0\.1:\d+\/preview\.html/);if(m)resolve(m[0]);});server.on('error',reject);server.on('exit',code=>reject(Error('Preview server exited '+code)));});
let browser;
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.LOD_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1}),errors=[],external=[],badResponses=[],results=[];
  await page.addInitScript(()=>{globalThis.WebAssembly=undefined;});
  const origin=new URL(url).origin;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.type()+': '+m.text());});
  page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
  page.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()});});
  await page.goto(url);
  await page.waitForFunction(()=>window.lodPreview?.state().loaded||window.lodPreview?.state().error,{},{timeout:60000});
  const assertState=state=>{assert.equal(state.loaded,true);assert.equal(state.error,null);assert.equal(state.maxBoneMatrixDrift,0);assert.equal(state.maxMorphWeightDrift,0);};
  let clips=0,scenes=0;
  for(const [i,a] of manifest.assets.entries()) {
    await page.evaluate(id=>window.lodPreview.setAsset(id),a.id);
    for(const s of a.variants[0].scenes) {
      const state=await page.evaluate(index=>{window.lodPreview.setScene(index);window.lodPreview.setTime(0);return window.lodPreview.state();},s.scene);
      assertState(state);assert.deepEqual(state.triangles,[s.sourceTriangles,a.variants[0].scenes[s.scene].triangles,a.variants[1].scenes[s.scene].triangles]);scenes++;
    }
    await page.evaluate(()=>window.lodPreview.setScene(0));
    for(const clip of a.source.clips) {
      const state=await page.evaluate(c=>{window.lodPreview.setClip(c.name);window.lodPreview.setTime(c.duration*.37);return window.lodPreview.state();},clip);
      assertState(state);assert.equal(state.clip,clip.name);clips++;
    }
    results.push({asset:a.id,scenes:a.variants[0].scenes.length,clips:a.source.clips.length,loaded:true,trianglesMatch:true,boneMatrixDrift:0,morphWeightDrift:0});
    if((i+1)%20===0||i===manifest.assets.length-1)console.log(`Browser ${i+1}/${manifest.assets.length}`);
  }
  const screenshots=[];
  for(const [id,file] of [
    ['hoops-realism-v2/players/guard','hoops-athlete'],
    ['soccer-crowd-people-v2/fan-01','soccer-crowd'],
    ['tennis-crowd-people-v2/fan-01','tennis-crowd'],
    ['city-citizens-v1/people/adult-man-a','city-citizen'],
    ['catch-vehicles-v2/police-sedan','vehicle-damage'],
    ['fire-rescue-people-v2/captain','fire-rescue']
  ]) {
    await page.evaluate(id=>window.lodPreview.setAsset(id),id);
    const a=manifest.assets.find(a=>a.id===id);
    if(a.source.clips.length)await page.evaluate(duration=>window.lodPreview.setTime(duration*.37),a.source.clips[0].duration);
    if(file==='vehicle-damage')await page.evaluate(()=>window.lodPreview.setScene(1));
    const relative=`verification/${file}-844x390.png`;await page.screenshot({path:path.join(root,relative)});screenshots.push(relative);
  }
  await page.locator('#wire').click();assert.equal((await page.evaluate(()=>window.lodPreview.state())).view.wire,true);await page.locator('#wire').click();
  await page.locator('#bones').click();assert.equal((await page.evaluate(()=>window.lodPreview.state())).view.bones,true);await page.locator('#bones').click();
  await page.evaluate(()=>{const e=document.getElementById('distance');e.value='0';e.dispatchEvent(new Event('input'));});assert.equal((await page.evaluate(()=>window.lodPreview.state())).selectedLevel,0);
  await page.evaluate(()=>{const e=document.getElementById('distance');e.value=e.max;e.dispatchEvent(new Event('input'));});assert.equal((await page.evaluate(()=>window.lodPreview.state())).selectedLevel,2);
  const before=(await page.evaluate(()=>window.lodPreview.state())).view.yaw;
  await page.mouse.move(400,190);await page.mouse.down();await page.mouse.move(450,190);await page.mouse.up();assert.notEqual((await page.evaluate(()=>window.lodPreview.state())).view.yaw,before);
  const layout=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
  assert.equal(layout.scrollWidth,844);assert.equal(layout.scrollHeight,390);
  assert.equal(external.length,0);assert.equal(badResponses.length,0);assert.equal(errors.length,0,errors.join('\n'));
  const report={browser:await browser.version(),renderer:'Chromium headless / ANGLE SwiftShader',webAssemblyDisabled:true,viewport:[844,390],models:results.length,glbs:results.length*3,scenes,clips,errors,externalRequests:external,badResponses,layout,screenshots,results,passed:true};
  await fs.writeFile(path.join(root,'verification/browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({models:report.models,glbs:report.glbs,scenes,clips,errors:errors.length,externalRequests:external.length,screenshots:screenshots.length,passed:true},null,2));
} finally {await browser?.close();server.kill('SIGTERM');}
