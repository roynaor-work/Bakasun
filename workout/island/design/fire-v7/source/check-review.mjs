import{chromium}from'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs';
import fs from'node:fs/promises';import path from'node:path';import{fileURLToPath}from'node:url';import{createServer}from'node:http';import assert from'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),server=createServer(async(req,res)=>{try{const p=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.webp':'image/webp'})[path.extname(p)]||'application/octet-stream');res.end(await fs.readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const report={startedAt:new Date().toISOString(),errors:[],externalRequests:[],views:[],passed:false};
try{
 for(const viewport of[{width:390,height:844},{width:844,height:390}]){
  const context=await browser.newContext({viewport}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin))report.externalRequests.push(r.url());});
  await context.route(/^https?:/,r=>r.request().url().startsWith(origin)?r.continue():r.abort());await page.goto(origin+'/review.html');
  const count=await page.locator('#round-b option').count();assert.ok(count>=6);
  for(const orientation of['390x844','844x390'])for(const camera of['near','far']){
   await page.locator('#orientation').selectOption(orientation);await page.locator('#camera').selectOption(camera);
   for(let n=1;n<=count;n++){
    await page.locator('#round-b').selectOption(String(n).padStart(2,'0'));await page.waitForFunction(()=>['image-a','image-b'].every(id=>{const e=document.getElementById(id);return e.complete&&e.naturalWidth>0;}));
    const dimensions=await page.locator('#image-b').evaluate(e=>[e.naturalWidth,e.naturalHeight]);assert.deepEqual(dimensions,orientation.split('x').map(Number));
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);report.views.push({viewport,orientation,camera,rounds:count,allImagesDecoded:true,noHorizontalOverflow:true});
  }
  await page.locator('#slider').fill('25');await page.locator('#slider').dispatchEvent('input');assert.equal(await page.locator('#divider').evaluate(e=>e.style.left),'25%');
  await context.close();
 }
 report.passed=!report.errors.length&&!report.externalRequests.length;
}catch(e){report.failure=e.stack||String(e);process.exitCode=1;
}finally{report.completedAt=new Date().toISOString();await fs.writeFile(path.join(root,'verification/review-page.json'),JSON.stringify(report,null,2)+'\n');await browser.close();await new Promise(r=>server.close(r));console.log(JSON.stringify(report));}
