// Verify asset contracts and the standalone preview; does not open the live game.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
const {chromium}=await import(process.env.HUD_PLAYWRIGHT_MODULE||'playwright');
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
const expected=['control-ring-small','control-ring-medium','control-ring-large','control-arrow','pass-direction-low','pass-direction-medium','pass-direction-high','receiver-open','ball-nearest','shot-power-track','shot-power-fill','ball-offscreen','scoreboard-plate'];
assert.deepEqual(manifest.assets.map(a=>a.id),expected);
assert.equal(manifest.radar,false);assert.equal(manifest.bakedText,false);
assert.deepEqual(manifest.canvasPx,[256,256]);
assert.equal(manifest.runtimeText.direction,'rtl');
for(const a of manifest.assets)for(const ext of ['svg','png']){
 const f=a.files[ext],data=await readFile(path.join(root,f.path));
 assert.equal(f.path,`${ext}/${a.id}.${ext}`);assert.equal(data.length,f.bytes);
 assert.equal(createHash('sha256').update(data).digest('hex'),f.sha256);
 assert.ok(data.length<=300000,f.path);
 if(ext==='svg'){
  const svg=data.toString();assert.match(svg,/viewBox="0 0 256 256"/);
  assert.doesNotMatch(svg,/<(?:text|image|foreignObject|script|filter)\b|href=|@import|url\(https?:|[\u0590-\u05ff]/i);
 }else{
  assert.equal(data.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(data.readUInt32BE(16),256);assert.equal(data.readUInt32BE(20),256);
  assert.equal(data[24],8);assert.equal(data[25],6,'RGBA PNG required');
 }
}
for(const ext of ['svg','png'])assert.equal((await readdir(path.join(root,ext))).length,13);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.txt':'text/plain','.md':'text/markdown'};
const server=createServer(async(req,res)=>{
 try{const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+requestPath);if(!file.startsWith(root)){res.writeHead(403);res.end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[],badRequests=[],externalRequests=[],screenshots=[],imageMetrics=[];
try{
 const page=await browser.newPage({viewport:{width:1000,height:950},deviceScaleFactor:1,reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>badRequests.push(r.url()));page.on('response',r=>{if(r.status()>=400)badRequests.push(r.url());});page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:'))externalRequests.push(r.url());});
 await page.goto(origin+'/preview.html');
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
 assert.equal(await page.locator('[data-player]').count(),22);
 assert.equal(await page.locator('[data-controlled=true]').count(),1);
 assert.equal(await page.locator('[data-nearest=true]').count(),1);
 assert.equal(await page.locator('#asset-grid article').count(),13);
 assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
 assert.equal(await page.locator('#clock').getAttribute('dir'),'ltr');
 assert.equal(await page.locator('.open-label').innerText(),'חופשי');assert.equal(await page.locator('.open-label').getAttribute('dir'),'rtl');
 assert.equal(await page.locator('#clock').innerText(),'34:28');
 // A normal user can operate all controls in the review page.
 for(const ring of ['small','medium','large']){
  await page.locator('#ring').selectOption(ring);assert.equal(await page.locator('#ground .sprite').first().getAttribute('data-asset'),'control-ring-'+ring);
 }
 for(const strength of ['low','medium','high']){
  await page.locator('#pass').selectOption(strength);assert.equal(await page.locator('#pass-guide img').getAttribute('data-asset'),'pass-direction-'+strength);
 }
 await page.locator('#controlled').selectOption('h7');assert.equal(await page.locator('#stage').getAttribute('data-open'),'false');assert.equal(await page.locator('#pass-guide img').count(),0);assert.equal(await page.locator('#heads [data-asset=receiver-open]').count(),0);
 await page.locator('#controlled').selectOption('h6');
 await page.locator('#open').uncheck();assert.equal(await page.locator('#pass-guide img').count(),0);await page.locator('#open').check();
 await page.locator('#charge').fill('0');assert.equal(await page.locator('#heads [data-asset=shot-power-fill]').count(),0);
 await page.locator('#charge').fill('100');assert.match(await page.locator('#heads [data-asset=shot-power-fill]').getAttribute('style'),/clip-path/);
 await page.locator('#format').click();assert.equal(await page.locator('#stage').getAttribute('data-format'),'png');
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
 // Compare actual decoded SVG and PNG pixels, alpha bounds and clear edges.
 for(const a of manifest.assets){
  const metric=await page.evaluate(async a=>{
   const decoded=[];for(const ext of ['svg','png']){const img=new Image();img.src=a.files[ext].path;await img.decode();const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);decoded.push(ctx.getImageData(0,0,256,256).data);}
   let visible=0,clear=0,partial=0,difference=0,border=0,l=256,t=256,r=0,b=0;
   for(let i=0;i<256*256;i++){const alpha=decoded[1][i*4+3],x=i%256,y=Math.floor(i/256);if(alpha){visible++;l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}else clear++;if(alpha>0&&alpha<255)partial++;if((x===0||x===255||y===0||y===255)&&alpha)border++;for(let c=0;c<4;c++)difference+=Math.abs(decoded[0][i*4+c]-decoded[1][i*4+c]);}
   return {id:a.id,visible,clear,partial,border,bounds:[l,t,r-l+1,b-t+1],meanChannelDifference:difference/(256*256*4)};
  },a);
  assert.ok(metric.clear>1000&&metric.visible>0&&metric.partial>0,`${a.id}: real transparency and antialiasing`);assert.equal(metric.border,0,`${a.id}: clipping at canvas edge`);assert.deepEqual(metric.bounds,a.contentBoundsPx);assert.ok(metric.meanChannelDifference<.6,`${a.id}: PNG differs from SVG`);imageMetrics.push(metric);
 }
 const initialClock=await page.locator('#clock').innerText();await page.waitForTimeout(1100);assert.equal(await page.locator('#clock').innerText(),initialClock);
 await page.locator('#play').click();await page.waitForFunction(previous=>document.querySelector('#clock').textContent!==previous,initialClock);await page.locator('#play').click();const pausedClock=await page.locator('#clock').innerText();await page.waitForTimeout(1100);assert.equal(await page.locator('#clock').innerText(),pausedClock);
 await page.reload();await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
 await page.setViewportSize({width:844,height:390});
 const box=await page.locator('#stage').boundingBox();assert.deepEqual(box,{x:0,y:0,width:844,height:390});
 const verification=path.join(root,'verification');await mkdir(verification,{recursive:true});
 const capture=async name=>{await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));const file=`verification/${name}-844x390.png`;await page.screenshot({path:path.join(root,file)});assert.ok((await stat(path.join(root,file))).size<=300000);screenshots.push(file);};
 await capture('preview');
 // Geometry checks in all octants, including the scoreboard and touch-safe areas.
 for(const scenario of ['right','left','up','down','nw','ne','sw','se']){
  await page.locator('#ball-position').selectOption(scenario,{force:true});
  assert.equal(await page.locator('#ball').isHidden(),true);assert.equal(await page.locator('#edge img').count(),1);
  const edge=await page.locator('#edge img').boundingBox();assert.ok(edge,'edge cue exists');
  const bounds=await page.evaluate(()=>{const sprite=document.querySelector('#edge img'),style=getComputedStyle(sprite),x=parseFloat(style.left)+40,y=parseFloat(style.top)+40;return {x,y,angle:style.transform};});
  assert.ok(bounds.x>=34&&bounds.x<=810&&bounds.y>=34&&bounds.y<=356);
  assert.ok(!(bounds.x>=6&&bounds.x<=266&&bounds.y<=78),'cue overlaps score');
  assert.ok(!(bounds.x<=148&&bounds.y>=290),'cue overlaps movement area');
  assert.ok(!(bounds.x>=644&&bounds.y>=278),'cue overlaps action area');
 }
 await page.locator('#ball-position').selectOption('loose',{force:true});assert.equal(await page.locator('#edge').isHidden(),true);assert.equal(await page.locator('#ground [data-asset=ball-nearest]').count(),1);assert.equal(await page.locator('#stage').getAttribute('data-nearest'),'a5');
 await capture('loose-ball');
 await page.locator('#ball-position').selectOption('nw',{force:true});
 await page.evaluate(()=>{document.querySelector('#format').click();document.querySelector('#lighting').click();});
 await capture('offscreen');
 // Portrait layout scales the 844x390 artboard without page overflow.
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>document.querySelector('#stage').getBoundingClientRect().width<=innerWidth);
 const portrait=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,stage:document.querySelector('#stage').getBoundingClientRect().width}));assert.equal(portrait.width,portrait.viewport);assert.ok(portrait.stage<=390);
 assert.deepEqual(errors,[]);assert.deepEqual(badRequests,[]);assert.deepEqual(externalRequests,[]);
 let fileCount=0,totalBytes=0,largest={path:'',bytes:0};
 async function audit(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(path.relative(root,full)==='verification/checks.json')continue;if(entry.isDirectory())await audit(full);else{const bytes=(await stat(full)).size;assert.ok(bytes<=300000,path.relative(root,full));fileCount++;totalBytes+=bytes;if(bytes>largest.bytes)largest={path:path.relative(root,full),bytes};}}}await audit(root);
 const result={passed:true,browser:browser.version(),viewport:[844,390],assets:13,assetFiles:26,octants:8,checks:['RGBA 256x256','transparent borders and partial alpha','SVG has no baked text or external resources','SHA-256 and byte sizes','PNG/SVG pixel comparison','22 player fixture','unique control/nearest markers','three ring sizes','three pass intensities','open receiver visibility','power zero/full clipping','PNG format switch','paused/running clock','eight edge directions and reserved areas','RTL text and LTR numeric isolation','portrait scaling','no page errors, missing or external requests','all files <=300000 bytes'],imageMetrics,screenshots,fileAudit:{excludes:['verification/checks.json'],fileCount,totalBytes,largest},errors,badRequests,externalRequests};
 await writeFile(path.join(verification,'checks.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({...result,imageMetrics:undefined},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
