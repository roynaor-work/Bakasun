#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(process.env.LOD_PLAYWRIGHT_MODULE||'playwright');
const server=spawn(process.execPath,[path.join(root,'tools/serve.mjs')],{env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});
const url=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',d=>{text+=d;const m=text.match(/http:\/\/127\.0\.0\.1:\d+\/preview\.html/);if(m)resolve(m[0]);});server.on('error',reject);server.on('exit',code=>reject(Error('Preview server exited '+code)));});
let browser;
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.LOD_CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1});
  await context.addInitScript(()=>{globalThis.WebAssembly=undefined;});
  const page=await context.newPage(),errors=[],network=[];let disconnected=false;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(disconnected&&/^https?:/.test(r.url()))network.push(r.url());});
  await page.goto(url+'?local-folder=1');await page.waitForSelector('#folder-button:visible');
  await context.setOffline(true);disconnected=true;
  await page.setInputFiles('#folder-input',root);
  await page.waitForFunction(()=>window.lodPreview?.state().loaded||window.lodPreview?.state().error,{},{timeout:60000});
  const assets=['hoops-realism-v2/players/guard','soccer-crowd-people-v2/fan-01','tennis-crowd-people-v2/fan-14','city-citizens-v1/people/adult-man-a','catch-vehicles-v2/police-sedan','fire-rescue-people-v2/captain'];
  const results=[];
  for(const id of assets) {
    await page.evaluate(id=>window.lodPreview.setAsset(id),id);
    await page.evaluate(()=>window.lodPreview.setTime(.37));
    const state=await page.evaluate(()=>window.lodPreview.state());
    assert.equal(state.loaded,true);assert.equal(state.error,null);assert.equal(state.maxBoneMatrixDrift,0);assert.equal(state.maxMorphWeightDrift,0);
    results.push({id,triangles:state.triangles});
  }
  await page.screenshot({path:path.join(root,'verification/offline-844x390.png')});
  assert.equal(network.length,0);assert.equal(errors.length,0,errors.join('\n'));
  const report={passed:true,webAssemblyDisabled:true,networkDisabledBeforeFolderSelection:true,networkRequestsAfterDisconnect:network,errors,models:results.length,glbs:results.length*3,viewport:[844,390],results,directFileNavigation:'Managed Chromium blocks file:// navigation (ERR_BLOCKED_BY_ADMINISTRATOR). The identical folder-selection flow was exercised from local HTML with browser networking disabled before file selection.'};
  await fs.writeFile(path.join(root,'verification/offline.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();server.kill('SIGTERM');}
