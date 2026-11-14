import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sharp=require(process.env.SHARP_MODULE||'sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
 try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/preview.html`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],failedRequests=[],externalRequests=[],cases=[];
await mkdir(path.join(root,'verification'),{recursive:true});
try{
 for(const [width,height] of [[1440,1000],[390,844],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('requestfailed',r=>failedRequests.push(r.url()));
  page.on('request',r=>{if(!r.url().startsWith(`http://127.0.0.1:${server.address().port}/`))externalRequests.push(r.url());});
  await page.goto(url);await page.waitForFunction(()=>!!window.alpinePreview);
  await page.evaluate(()=>Promise.all(Array.from(document.images).map(i=>{i.loading='eager';return i.decode().catch(()=>{});})));
  const report={viewport:[width,height],states:[],overflow:false,rtl:true,sliderEndpoints:true};
  assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
  assert.equal(await page.locator('.asset-card').count(),27);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: horizontal overflow`);
  for(const [ms,phase,count,gate] of [[0,'red-1','3','closed'],[1000,'red-2','2','closed'],[2000,'red-3','1','closed'],[3000,'green','צאו!','closed'],[3250,'green','צאו!','opening-04'],[3500,'racing',null,'open'],[7000,'racing',null,'open'],[10700,'finish',null,'open'],[12000,'results',null,'open']]){
   await page.evaluate(t=>window.alpinePreview.setTime(t),ms);
   assert.equal((await page.evaluate(()=>window.alpinePreview.getState())).phase,phase);
   if(count)assert.equal(await page.locator('#countdown').textContent(),count);
   assert((await page.locator('#gate').getAttribute('src')).includes(`start-gate-${gate}.png`),`${ms}: wrong gate frame`);
   report.states.push({ms,phase,gate});
  }
  for(const phase of ['ready','red-1','red-2','red-3','green','racing','finish','results']){
   await page.selectOption('#state',phase);
   assert.equal((await page.evaluate(()=>window.alpinePreview.getState())).phase,phase);
  }
  const textBounds=await page.locator('#results-text .overlay').evaluateAll(nodes=>nodes.map(el=>{
   const r=el.getBoundingClientRect(),parent=el.closest('.sprite').getBoundingClientRect(),region=JSON.parse(el.dataset.region);
   return {correct:Math.abs(r.left-parent.left-region[0]/512*parent.width)<1&&Math.abs(r.top-parent.top-region[1]/512*parent.height)<1,text:el.textContent};
  }));
  assert(textBounds.every(t=>t.correct),`${width}: RTL moved text out of its assigned image region`);
  report.textRegionsAligned=true;
  await page.selectOption('#state','racing');
  for(const v of [0,100]){
   await page.locator('#progress').fill(String(v));
   assert.equal(await page.locator('.progress').getAttribute('aria-valuenow'),String(v));
   const marker=await page.locator('#progress-marker').evaluate(el=>getComputedStyle(el).transform);
   assert(marker.startsWith('matrix('));
  }
  for(const v of [0,70,140]){
   await page.locator('#speed').fill(String(v));assert.equal(await page.locator('#speed-value').textContent(),String(v));
  }
  await page.selectOption('#size','1024');
  await page.evaluate(()=>Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{}))));
  assert(await page.evaluate(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth===1024)));
  await page.selectOption('#size','512');
  for(const surface of ['checker','dark','snow']){
   await page.selectOption('#surface',surface);assert.equal(await page.locator('.scene').getAttribute('data-surface'),surface);
  }
  for(const [state,name] of [['ready','ready'],['red-3','countdown'],['green','green'],['racing','race'],['results','results']]){
   await page.selectOption('#state',state);
   await page.evaluate(()=>Promise.all(Array.from(document.images).map(i=>i.decode().catch(()=>{}))));
   await capture(page.locator('.scene'),`${width}x${height}-${name}.webp`);
  }
  if(width===1440)await capture(page.locator('.inventory'),'gallery.webp');
  await page.click('#reset');await page.click('#play');await page.waitForTimeout(80);
  assert.equal((await page.evaluate(()=>window.alpinePreview.getState())).phase,'red-1');
  await page.click('#play');const paused=await page.evaluate(()=>window.alpinePreview.getState());
  await page.waitForTimeout(120);assert.deepEqual(await page.evaluate(()=>window.alpinePreview.getState()),paused);
  await page.click('#reset');assert.equal((await page.evaluate(()=>window.alpinePreview.getState())).phase,'ready');
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.alpinePreview.setTime(3000));
  assert((await page.locator('#gate').getAttribute('src')).includes('start-gate-open.png'));
  await page.evaluate(()=>window.alpinePreview.setTime(10700));assert((await page.locator('#flag').getAttribute('src')).includes('finish-flag-01.png'));
  report.reducedMotion=true;report.pauseReset=true;report.allImagesLoadedAtBothSizes=true;cases.push(report);
  await context.close();
 }
 // Opening directly from disk must also work, including images and generated catalog.
 let fileProtocol='verified';const page=await browser.newPage();
 try{
  await page.goto('file://'+path.join(root,'preview.html'));
  await page.waitForFunction(()=>!!window.alpinePreview);await page.selectOption('#state','results');
  assert(await page.locator('#results').isVisible());
 }catch(error){
  if(!error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR'))throw error;
  fileProtocol='not verified: file:// navigation is blocked by managed browser policy; HTTP verified';
 }finally{await page.close();}
 assert.deepEqual(errors,[]);assert.deepEqual(failedRequests,[]);assert.deepEqual(externalRequests,[]);
 const report={passed:true,browser:await browser.version(),cases,fileProtocol,consoleErrors:errors,failedRequests,externalRequests};
 await writeFile(path.join(root,'verification','browser.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
async function capture(locator,name){const png=await locator.screenshot({animations:'disabled'});await sharp(png).webp({quality:87}).toFile(path.join(root,'verification',name));}
