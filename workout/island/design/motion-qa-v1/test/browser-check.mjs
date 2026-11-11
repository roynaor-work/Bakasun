// SPDX-License-Identifier: CC0-1.0 — original optional browser integration checks.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chrome node test/browser-check.mjs
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const specifier=process.env.PLAYWRIGHT_MODULE??'playwright';
const {chromium}=await import(path.isAbsolute(specifier)?pathToFileURL(specifier).href:specifier);
const qaRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=process.env.MOTION_QA_URL??'http://127.0.0.1:8766/workout/island/design/motion-qa-v1/';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const errors=[],failedRequests=[],remoteRequests=[];
await context.addInitScript(()=>{Object.defineProperty(globalThis,'WebAssembly',{value:new Proxy({},{get(){throw new Error('WebAssembly is disabled by motion QA browser test');}}),configurable:false});});
await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==new URL(base).origin){remoteRequests.push(url.href);return route.abort();}return route.continue();});
const page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
page.on('requestfailed',request=>failedRequests.push({url:request.url(),failure:request.failure()?.errorText}));
try {
  const reportResponse=await page.request.get(new URL('output/report.json',base).href);assert.equal(reportResponse.status(),200);
  const report=await reportResponse.json(),expected=report.libraries.reduce((sum,library)=>sum+library.clips.length,0);
  await page.goto(new URL('output/report.html',base).href);await page.waitForSelector('#clipTable tbody tr');
  const rows=page.locator('#clipTable tbody tr');assert.equal(await rows.count(),expected);
  const initialScores=await rows.evaluateAll(items=>items.map(row=>Number(row.dataset.score)));
  assert.ok(initialScores.every((score,index)=>index===0||score>=initialScores[index-1]));
  await page.locator('#sort').selectOption('score-desc');
  const sorted=await rows.evaluateAll(items=>items.map(row=>Number(row.dataset.score)));
  assert.ok(sorted.every((score,index)=>index===0||score<=sorted[index-1]));
  await page.locator('#libraryFilter').selectOption(report.libraries[0].id);
  assert.equal(await page.locator('#clipTable tbody tr:visible').count(),report.libraries[0].clips.length);
  await page.locator('#search').fill('___absent_motion_qa___');assert.equal(await page.locator('#clipTable tbody tr:visible').count(),0);assert.equal(await page.locator('#empty').isVisible(),true);
  await page.locator('#search').fill('');await page.locator('#libraryFilter').selectOption('');
  const comparisonCount=await page.locator('#compareTable tbody tr[data-delta]').count();
  if(comparisonCount){await page.locator('#regressionsOnly').check();assert.ok((await page.locator('#compareTable tbody tr:visible').evaluateAll(items=>items.map(row=>Number(row.dataset.delta)))).every(delta=>delta<0));}
  const library=report.libraries.find(l=>l.clips.length),clip=library.clips[0];
  await page.goto(new URL(`output/${clip.htmlPath}`,base).href);await page.waitForSelector('img.sheet');
  const image=page.locator('img.sheet');assert.equal(await image.evaluate(img=>img.complete&&img.naturalWidth>0),true);
  const svg=await page.request.get(new URL(`output/${clip.sheetPath}`,base).href);assert.equal(svg.status(),200);assert.equal(((await svg.text()).match(/\/ 8 ·/g)??[]).length,8);
  await page.goto(new URL(`preview.html?clip=${encodeURIComponent(`${library.id}--${clip.id}`)}`,base).href);
  await page.waitForFunction(()=>document.querySelector('#play')?.disabled===false,{timeout:30000});
  assert.equal(await page.locator('#stage canvas').count(),1);
  await page.locator('#viewerAngle').selectOption('side');
  await page.locator('#timeline').fill('7');
  assert.ok((await page.locator('#time').textContent()).includes('s'));
  await page.locator('#play').click();await page.waitForTimeout(100);await page.locator('#play').click();
  const cache=path.join(qaRoot,'.cache');await mkdir(cache,{recursive:true});
  await page.screenshot({path:path.join(cache,'preview-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(cache,'preview-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.goto(new URL('output/report.html',base).href);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(cache,'report-mobile.png'),fullPage:false});
  assert.deepEqual(errors,[]);assert.deepEqual(remoteRequests,[]);assert.deepEqual(failedRequests,[]);
  const evidence={passed:true,clipCount:expected,comparisonCount,viewportChecks:['1440x1000','390x844'],webAssemblyDisabled:true,remoteRequests,errors,failedRequests};
  await writeFile(path.join(cache,'browser-check.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
} finally {await browser.close();}
