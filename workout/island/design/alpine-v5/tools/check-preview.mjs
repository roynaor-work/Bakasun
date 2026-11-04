import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const modulePath=process.argv[2];
if(!modulePath)throw new Error('Usage: node tools/check-preview.mjs /absolute/path/to/playwright-core/index.mjs');
const {chromium}=await import(pathToFileURL(path.resolve(modulePath)));
const packageRoot=new URL('../',import.meta.url),repo=path.resolve(fileURLToPath(new URL('../../../../../',import.meta.url)));
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.md':'text/plain'};
const policy="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'";
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost'),p=path.resolve(repo,'.'+decodeURIComponent(url.pathname));
    if(p!==repo&&!p.startsWith(repo+path.sep)){res.writeHead(403);res.end();return;}
    const f=(await stat(p)).isDirectory()?path.join(p,'index.html'):p;
    res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream','Content-Security-Policy':policy});
    res.end(await readFile(f));
  }catch(e){console.error('Static server:',req.url,e.code,e.message);res.writeHead(404);res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/workout/island/design/alpine-v5/preview.html';
const captures=[],errors=[],badResponses=[],externalRequests=[];
let browser;
try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  await mkdir(new URL('previews/',packageRoot),{recursive:true});
  for(const viewport of [{width:844,height:390},{width:390,height:844}]){
    const context=await browser.newContext({viewport,deviceScaleFactor:1,reducedMotion:'no-preference'}),page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()});});
    page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))externalRequests.push(r.url());});
    await page.goto(url);await page.waitForFunction(()=>window.alpineAssetPreview?.ready,{timeout:30000});
    for(const env of ['sunset','fog','night-floodlit']){
      await page.locator(`[data-environment="${env}"]`).click();
      await page.waitForFunction(id=>window.alpineAssetPreview.ready&&window.alpineAssetPreview.environment===id,env);
      await page.waitForFunction(()=>[...document.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');
      await page.locator('#landing').click();await page.waitForFunction(()=>window.alpineAssetPreview.activeEffects===1);
      await page.waitForFunction(()=>window.alpineAssetPreview.effectFrame>=5);await page.locator('#pause').click();
      const snapshot=await page.evaluate(()=>({...window.alpineAssetPreview}));assert.equal(snapshot.error,null);
      assert.equal(snapshot.loadedModels.length,env==='night-floodlit'?3:2);
      const filename=`${env}-${viewport.width}x${viewport.height}.png`;
      // Temporary PNGs are written outside delivery; convert to WebP after capture.
      await page.screenshot({path:`/tmp/alpine-v5-${filename}`,fullPage:false});
      captures.push({environment:env,viewport,temporaryPng:`/tmp/alpine-v5-${filename}`,
        output:`previews/${filename.replace('.png','.webp')}`,loadedModels:snapshot.loadedModels,noHorizontalOverflow:true});
      await page.locator('#pause').click();
      await page.waitForFunction(()=>window.alpineAssetPreview.activeEffects===0);
      await page.locator('#powder').click();await page.waitForFunction(()=>window.alpineAssetPreview.activeEffects===1);
      await page.waitForFunction(()=>window.alpineAssetPreview.activeEffects===0);
      await page.locator('#frame').fill('5');assert.equal(await page.locator('#frame-number').textContent(),'06 / 16');
    }
    // Exercise overlapping environment requests and an orientation change.
    await page.evaluate(()=>{document.querySelector('[data-environment="fog"]').click();document.querySelector('[data-environment="sunset"]').click();document.querySelector('[data-environment="night-floodlit"]').click();});
    await page.waitForFunction(()=>window.alpineAssetPreview.ready&&window.alpineAssetPreview.environment==='night-floodlit');
    await page.setViewportSize({width:viewport.height,height:viewport.width});await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  await page.waitForFunction(()=>window.alpineAssetPreview?.ready);
  assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
  await page.locator('#landing').click();await page.waitForFunction(()=>window.alpineAssetPreview.activeEffects===0);
  assert.equal(await page.evaluate(()=>window.alpineAssetPreview.frame),5);
  await context.close();
  const passed=!errors.length&&!badResponses.length&&!externalRequests.length;
  const report={passed,browser:browser.version(),renderer:'Chromium SwiftShader (software WebGL; not a phone benchmark)',
    csp:policy,checks:['three environments at 844x390 and 390x844','final GLBs loaded by GLTFLoader',
      'local PNG/WebP images decoded','landing/powder instances expire','manual atlas frame selection',
      'rapid switching and orientation change','reduced motion','no horizontal overflow',
      'no console/page errors','no failed responses','no external requests'],captures,errors,badResponses,externalRequests};
  await writeFile(new URL('verification/browser-report.json',packageRoot),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed,captures:captures.length,errors,badResponses,externalRequests},null,2));
  if(!passed)process.exitCode=1;
}finally{await browser?.close();await new Promise(r=>server.close(r));}
