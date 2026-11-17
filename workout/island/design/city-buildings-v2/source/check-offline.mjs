import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

// Run against an extracted ZIP served by its own serve.py, outside the repository.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tools=path.resolve(process.env.CITY_V2_TOOLS || '/tmp/city-v2-tools');
const {chromium}=await import(pathToFileURL(path.join(tools,'node_modules/playwright/index.mjs')));
const origin=process.env.CITY_V2_OFFLINE_ORIGIN || 'http://127.0.0.1:8766';
const errors=[],external=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM || '/usr/bin/chromium',headless:true,
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:844,height:390},serviceWorkers:'block',acceptDownloads:true});
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin+'/')||url.startsWith('data:'))return route.continue();
    external.push(url);return route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(origin+'/preview.html');await page.waitForFunction(()=>window.cityPreview);await page.evaluate(()=>window.cityPreview.ready);
  const localManifest=await fs.readFile(path.join(root,'manifest.json'));
  const remoteManifest=await page.evaluate(async()=>await(await fetch('./manifest.json')).text());
  assert.equal(remoteManifest,localManifest.toString(),'Extracted manifest differs from delivered source');
  let renderedAssets=0;
  for(const palette of ['sunrise','seabreeze'])for(const stage of ['foundation','half-built','complete']){
    const count=await page.evaluate(async({stage,palette})=>{
      const v=window.cityPreview;await v.select({mode:'city',stage,palette});v.render();return v.meshes.length;
    },{stage,palette});assert.equal(count,20);renderedAssets+=count;
  }
  await page.locator('#celebrate').click();await page.waitForFunction(()=>window.cityPreview.effects.length===20&&window.cityPreview.effects.every(e=>e.active));
  await page.waitForFunction(()=>window.cityPreview.effects.every(e=>!e.active));
  const downloadReady=page.waitForEvent('download');await page.locator('.download').click();const download=await downloadReady;
  assert.equal(download.suggestedFilename(),'city-buildings-v2-offline.zip');
  const target='/tmp/city-v2-downloaded-offline.zip';await download.saveAs(target);assert.equal(await download.failure(),null);
  const zipCheck=spawnSync('python3',['-c',
    'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; names=z.namelist(); assert sum(n.endswith(".glb") for n in names)==120; assert "city-buildings-v2/LICENSES.md" in names; assert "city-buildings-v2/REPORT.md" in names; print(json.dumps({"entries":len(names),"glbs":120,"integrity":True}))',target],{encoding:'utf8'});
  assert.equal(zipCheck.status,0,zipCheck.stderr);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const result={browser:await browser.version(),extractedOutsideRepository:true,freshBrowserContext:true,externalNetworkBlocked:true,
    manifestSHA256:createHash('sha256').update(localManifest).digest('hex'),renderedAssets,confettiOnAll20Buildings:true,
    offlineDownloadButtonWorks:true,downloadedArchive:JSON.parse(zipCheck.stdout),externalRequests:external,pageErrors:errors};
  await fs.writeFile(path.join(root,'verification/offline-validation.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));await context.close();
}finally{await browser.close();}
