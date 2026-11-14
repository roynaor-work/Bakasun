// Usage: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node verification/verify-preview.mjs
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.ogg':'audio/ogg','.mp3':'audio/mpeg'};
const policy="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'";
const server=createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root)){res.writeHead(403).end();return;}
  try{const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Security-Policy':policy});res.end(bytes);}
  catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true});
const errors=[],external=[],httpErrors=[],csp=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('request',r=>{if(r.url().startsWith('http')&&!r.url().startsWith(origin+'/'))external.push(r.url());});
page.on('response',r=>{if(r.status()>=400)httpErrors.push({url:r.url(),status:r.status()});});
await page.exposeFunction('recordCsp',entry=>csp.push(entry));
await page.addInitScript(()=>addEventListener('securitypolicyviolation',e=>window.recordCsp({directive:e.effectiveDirective,uri:e.blockedURI})));
const snapshot=()=>page.evaluate(()=>window.boarsFxPreview.snapshot);
try{
  await page.goto(origin+'/preview.html');
  await page.waitForFunction(()=>window.boarsFxPreview?.snapshot.ready);
  assert.equal((await snapshot()).loadedAtlases,3);assert.equal((await snapshot()).loadedSprites,45);
  assert.equal((await snapshot()).muted,true);assert.equal((await snapshot()).soundCount,0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const box=await page.locator('.lab').boundingBox();assert.equal(box.width,844);assert.equal(box.height,390);
  await page.screenshot({path:path.join(root,'verification/preview-844x390.png')});
  await page.locator('#fire').click();await page.waitForFunction(()=>window.boarsFxPreview.snapshot.shot?.arrived);
  assert.equal((await snapshot()).reaction.name,'boar-side-hit');
  await page.screenshot({path:path.join(root,'verification/hit-844x390.png')});
  await page.waitForTimeout(300);await page.locator('#fall').click();
  await page.waitForFunction(()=>window.boarsFxPreview.snapshot.reaction?.name==='boar-fall');
  await page.waitForTimeout(470);await page.screenshot({path:path.join(root,'verification/fall-844x390.png')});
  for(let i=0;i<3;i++){await page.locator('#miss').click();await page.waitForFunction(n=>window.boarsFxPreview.snapshot.misses===n,i+1);await page.waitForTimeout(90);}
  const art=[];
  await page.locator('[data-tab=art]').click();
  const animations=await page.locator('#animation option').evaluateAll(options=>options.map(o=>o.value));
  for(const id of animations){
    await page.selectOption('#animation',id);await page.waitForTimeout(50);
    const info=await page.locator('#frame-info').textContent();assert.ok(info.startsWith(id));art.push(id);
  }
  await page.selectOption('#animation','muzzle');await page.locator('#pause').click();
  const before=await page.locator('#frame-info').textContent();await page.locator('#step').click();
  await page.waitForFunction(text=>document.querySelector('#frame-info').textContent!==text,before);
  assert.notEqual(await page.locator('#frame-info').textContent(),before);
  await page.screenshot({path:path.join(root,'verification/atlas-844x390.png')});
  await page.locator('[data-tab=audio]').click();
  const cues=[];
  for(const format of ['ogg','mp3']){
    await page.selectOption('#format',format);
    for(const group of ['shot','hit','miss','fall','voice']){
      await page.selectOption('#sound-group',group);
      for(const button of await page.locator('[data-sound]').all()){
        const id=await button.getAttribute('data-sound'),count=(await snapshot()).soundCount;
        await button.click();await page.waitForFunction(n=>window.boarsFxPreview.snapshot.soundCount>n,count);
        cues.push(`${id}.${format}`);
      }
    }
  }
  assert.equal(cues.length,28);assert.equal((await snapshot()).audioState,'running');
  await page.locator('#mute').click();assert.equal((await snapshot()).activeAudio,0);
  // Exercise actual MP3 fallback when the preferred Ogg resource is unavailable.
  await page.selectOption('#sound-group','shot');await page.selectOption('#format','auto');
  await page.route('**/audio/shot-cork.ogg',route=>route.abort());
  await page.reload();await page.waitForFunction(()=>window.boarsFxPreview?.snapshot.ready);
  await page.locator('[data-tab=audio]').click();
  await page.locator('[data-sound=shot-cork]').click();
  await page.waitForFunction(()=>window.boarsFxPreview.snapshot.soundCount===1);
  await page.unroute('**/audio/shot-cork.ogg');
  // Failed preferred-format request is intentional for this single negative case.
  const expectedFallbackErrors=errors.filter(e=>e.includes('net::ERR_FAILED'));
  const unexpectedErrors=errors.filter(e=>!e.includes('net::ERR_FAILED'));
  await page.locator('[data-tab=play]').click();
  const stage=await page.locator('#scene').boundingBox();
  await page.touchscreen.tap(stage.x+stage.width*.75,stage.y+stage.height*.55);
  await page.waitForFunction(()=>window.boarsFxPreview.snapshot.shot?.arrived);
  assert.equal((await snapshot()).mode,'hit');
  await page.waitForTimeout(300);await page.locator('#scene').focus();await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.boarsFxPreview.snapshot.shot?.arrived);
  for(const size of [{width:740,height:360},{width:390,height:844}]){
    await page.setViewportSize(size);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  assert.deepEqual(unexpectedErrors,[]);assert.deepEqual(httpErrors,[]);assert.deepEqual(external,[]);assert.deepEqual(csp,[]);
  const report={passed:true,browser:await browser.version(),viewport:{width:844,height:390},sprites:45,atlases:3,
    animations:art,audioDecodedAndPlayed:cues,mp3FallbackVerified:true,expectedFallbackRequestErrors:expectedFallbackErrors.length,
    touch:true,keyboard:true,artFrameStep:true,mutedStartup:true,muteStopsActiveAudio:true,
    extraViewports:[{width:740,height:360},{width:390,height:844}],strictCsp:policy,
    errors:unexpectedErrors,httpErrors,external,csp,physicalPhone:false,subjectiveListening:false};
  await writeFile(path.join(root,'verification/browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,sprites:45,animations:art.length,audioPlayed:cues.length,mp3Fallback:true,errors:unexpectedErrors.length}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
