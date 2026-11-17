/* Asset-contract and browser verification. Requires sharp and playwright.
 * Run from any directory: node source/validate.cjs
 * Starts its own loopback server. Writes evidence only inside this package.
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const crypto=require('node:crypto');
const http=require('node:http');
const {pathToFileURL}=require('node:url');
const sharp=require('sharp');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'verification');
fs.mkdirSync(out,{recursive:true});
const checkNames=[];
const check=(name,test)=>{assert.ok(test,name);checkNames.push(name);};
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const median=a=>a.toSorted((x,y)=>x-y)[Math.floor(a.length/2)];
async function diffPixels(a,b){
  const x=await sharp(a).ensureAlpha().raw().toBuffer(),y=await sharp(b).ensureAlpha().raw().toBuffer();
  assert.equal(x.length,y.length);let n=0;
  for(let i=0;i<x.length;i+=4)if(Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2])>3)n++;
  return n;
}
(async()=>{
  const m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  const atlas=fs.readFileSync(path.join(root,m.atlas.image));
  const metadata=await sharp(atlas).metadata();
  check('1024×1024 WebP with alpha',metadata.width===1024&&metadata.height===1024&&metadata.format==='webp'&&metadata.hasAlpha);
  check('Atlas fits conservative decimal 700KB limit',atlas.length<=700000&&atlas.length===m.atlas.bytes);
  check('Manifest SHA-256 matches atlas',hash(atlas)===m.atlas.sha256);
  const sandbox={};vm.runInNewContext(fs.readFileSync(path.join(root,'atlas-data.js'),'utf8'),sandbox);
  check('file:// data matches manifest exactly',JSON.stringify(sandbox.FIRE_FX_MANIFEST)===JSON.stringify(m));
  check('Exactly 64 frames and 12 effects',Object.keys(m.frames).length===64&&Object.keys(m.animations).length===12);
  const expected={'flame-small':8,'flame-medium':8,'flame-large':8,'smoke-light':8,'smoke-heavy':8,steam:6,extinguish:6,ember:1,spark:1,soot:1,heat:8,ignition:1};
  const frameMetrics={},frameHashes=new Set(),cells=new Set();
  for(const [name,f] of Object.entries(m.frames)){
    const r=f.frame,c=f.content;
    check(`${name}: frame bounds and four-pixel gutter`,r.x>=0&&r.y>=0&&r.w===128&&r.h===128&&r.x+128<=1024&&r.y+128<=1024&&c.x>=4&&c.y>=4&&c.x+c.w<=124&&c.y+c.h<=124);
    const key=`${r.x},${r.y}`;assert.ok(!cells.has(key));cells.add(key);
    const pixels=await sharp(atlas).extract({left:r.x,top:r.y,width:r.w,height:r.h}).ensureAlpha().raw().toBuffer();
    let alphaSum=0,occupied=0,partial=0,gutterAlpha=0,minY=128,maxY=0,luminanceSum=0;
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const i=(y*128+x)*4,a=pixels[i+3];alphaSum+=a;
      if(a>8){occupied++;minY=Math.min(y,minY);maxY=Math.max(y,maxY);luminanceSum+=(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)*a;}
      if(a>0&&a<255)partial++;
      if(x<4||x>=124||y<4||y>=124)gutterAlpha+=a;
    }
    check(`${name}: visible content, soft alpha and isolated edges`,occupied>10&&partial>10&&gutterAlpha===0);
    frameHashes.add(hash(pixels));
    frameMetrics[name]={occupiedPixels:occupied,meanAlpha:alphaSum/(128*128*255),partialAlphaPixels:partial,minY,maxY,weightedLuminance:luminanceSum/Math.max(1,alphaSum)};
  }
  check('All 64 frames have different pixel data',frameHashes.size===64);
  const used=[];
  for(const [id,count] of Object.entries(expected)){
    const a=m.animations[id];check(`${id}: correct frame count`,a.frames.length===count);
    a.frames.forEach(n=>{assert.ok(m.frames[n]);used.push(n);});
    if(id.startsWith('flame-'))check(`${id}: stable pivot and all three attachments`,a.attachments.join(',')==='wall,window,roof'&&a.frames.every(n=>m.frames[n].pivot.y===.90625&&m.frames[n].content.y+m.frames[n].content.h===116));
  }
  check('Animations cover all frames once',new Set(used).size===64&&used.length===64);
  const areas=id=>m.animations[id].frames.map(n=>frameMetrics[n].occupiedPixels);
  const alphas=id=>m.animations[id].frames.map(n=>frameMetrics[n].meanAlpha);
  check('Three visibly distinct flame sizes',median(areas('flame-small'))<median(areas('flame-medium'))&&median(areas('flame-medium'))<median(areas('flame-large')));
  check('Heavy smoke is denser than light smoke',median(alphas('smoke-heavy'))>median(alphas('smoke-light')));
  check('Extinguish dissipates and steam final frame is below its peak',alphas('extinguish').at(-1)<alphas('extinguish')[0]&&alphas('steam').at(-1)<Math.max(...alphas('steam'))*.5);
  check('Heat is a transparent alpha mask with an actual displacement contract',median(alphas('heat'))>0&&median(alphas('heat'))<.2&&m.animations.heat.displacement.flow.includes('dx ='));
  check('One-shots end at zero opacity',m.animations.steam.opacityEnvelope.at(-1)[1]===0&&m.animations.extinguish.opacityEnvelope.at(-1)[1]===0&&m.animations.ignition.opacityEnvelope.at(-1)[1]===0);
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp'};
  const server=http.createServer((req,res)=>{
    const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'preview.html';
    const file=path.resolve(root,name);
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
    const browserVersion=browser.version();
    const p=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1});
    const errors=[],requests=[],failed=[];
    p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));p.on('requestfailed',r=>failed.push(r.url()));
    await p.goto(`${base}/preview.html`);await p.waitForFunction(()=>globalThis.__fireFX?.ready);
    await p.locator('#pause').click();await p.evaluate(()=>__fireFX.seek(.6));
    check('Pause freezes animation time',await p.evaluate(()=>__fireFX.state().paused));
    const before=await p.evaluate(()=>__fireFX.state().time);await p.waitForTimeout(120);
    check('Paused time remains stable',await p.evaluate(()=>__fireFX.state().time)===before);
    check('844×390 has no overflow',await p.evaluate(()=>document.documentElement.scrollWidth===844&&document.documentElement.scrollHeight===390));
    await p.screenshot({path:path.join(out,'preview-844x390.png')});
    const hot=await p.locator('#scene').screenshot();
    await p.locator('#heat').click();const noHeat=await p.locator('#scene').screenshot();
    const heatPixels=await diffPixels(hot,noHeat);
    check('Heat toggle changes rendered background pixels',heatPixels>20);
    await p.locator('#heat').click();
    const frameImages=[];
    for(let i=0;i<8;i++){
      await p.evaluate(t=>__fireFX.seek(t),i/14);frameImages.push(hash(await p.locator('#scene').screenshot()));
    }
    check('All eight sampled animation states visibly differ',new Set(frameImages).size===8);
    for(const id of Object.keys(expected)){
      await p.locator(`[data-effect="${id}"]`).click();
      check(`${id}: effect control responds`,await p.locator(`[data-effect="${id}"]`).getAttribute('aria-pressed')==='true');
    }
    await p.locator('[data-place="wall"]').click();await p.locator('#ignite').click();
    await p.evaluate(()=>__fireFX.seek(2));await p.locator('#quench').click();
    await p.evaluate(()=>__fireFX.seek(2.2));await p.screenshot({path:path.join(out,'quench-844x390.png')});
    await p.evaluate(()=>__fireFX.seek(2.7));
    let state=await p.evaluate(()=>__fireFX.state());
    check('Quench leaves soot and does not extinguish adjacent sources',state.spots.wall.soot&&state.spots.wall.water===2&&state.spots.window.water===null&&state.spots.roof.water===null);
    check('Finished one-shot shows its completed state',(await p.locator('#state').textContent()).includes('האש כבתה'));
    await p.locator('#ignite').click();state=await p.evaluate(()=>__fireFX.state());
    check('Ignition restarts flame and clears old soot',state.spots.wall.water===null&&!state.spots.wall.soot&&state.spots.wall.flash===2.7);
    for(const where of ['roof','window','wall']){
      await p.locator(`[data-place="${where}"]`).click();
      check(`${where}: attachment control works`,(await p.evaluate(()=>__fireFX.state())).place===where);
    }
    await p.locator('#background').click();await p.evaluate(()=>__fireFX.seek(3.4));
    await p.screenshot({path:path.join(out,'light-844x390.png')});
    check('Light background control works',(await p.evaluate(()=>__fireFX.state())).light);
    await p.locator('#pause').focus();await p.keyboard.press('Enter');await p.waitForTimeout(160);
    check('Keyboard resumes animation',!(await p.evaluate(()=>__fireFX.state())).paused&&(await p.evaluate(()=>__fireFX.state().time))>3.4);
    await p.locator('#pause').click();await p.setViewportSize({width:390,height:844});
    check('Portrait has no horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth===390));
    await p.screenshot({path:path.join(out,'preview-390x844.png')});
    check('No browser exceptions or failed requests',errors.length===0&&failed.length===0);
    check('Preview sends no external requests',requests.every(url=>url.startsWith(base)||url.startsWith('data:')));
    const reduced=await browser.newPage({viewport:{width:844,height:390},reducedMotion:'reduce'});
    await reduced.goto(`${base}/preview.html`);await reduced.waitForFunction(()=>__fireFX?.ready);await reduced.waitForTimeout(120);
    check('Reduced-motion preference starts paused at time zero',await reduced.evaluate(()=>__fireFX.state().paused&&__fireFX.state().time===0));await reduced.close();
    const touch=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});
    await touch.goto(`${base}/preview.html`);await touch.waitForFunction(()=>__fireFX?.ready);
    await touch.locator('[data-place="roof"]').tap();await touch.locator('#quench').tap();
    check('Touch selects and extinguishes a roof source',await touch.evaluate(()=>__fireFX.state().place==='roof'&&__fireFX.state().spots.roof.water!==null));await touch.close();
    const direct=await browser.newPage();let directFile;
    try{
      await direct.goto(pathToFileURL(path.join(root,'preview.html')).href);await direct.waitForFunction(()=>__fireFX?.ready);
      check('Direct file:// preview loads without a server',await direct.evaluate(()=>__fireFX.ready));
      directFile={status:'passed'};
    }catch(error){
      if(!error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR'))throw error;
      directFile={status:'blocked-by-environment-policy',reason:'Chromium rejects file:// navigation with ERR_BLOCKED_BY_ADMINISTRATOR. No browser policy was changed. Loopback HTTP is verified.'};
    }finally{await direct.close();}
    const broken=await browser.newPage();await broken.route('**/fire-fx.webp',route=>route.abort());
    await broken.goto(`${base}/preview.html`);await broken.locator('#error').waitFor({state:'visible'});
    check('Missing atlas gives a visible error',!!(await broken.locator('#error').textContent()));await broken.close();
    const summary={status:'passed',created:'2026-11-17',browser:browserVersion,checks:checkNames.length,checkNames,atlas:{bytes:atlas.length,width:1024,height:1024,sha256:hash(atlas)},heatChangedPixels:heatPixels,frames:frameMetrics,browserErrors:errors,failedRequests:failed,directFile,networkRequests:[...new Set(requests.map(url=>new URL(url).pathname))],screenshots:['preview-844x390.png','quench-844x390.png','light-844x390.png','preview-390x844.png'],limitations:['Headless Chromium on a cloud CPU; not a physical phone GPU performance measurement.']};
    fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(summary,null,2)+'\n');
    console.log(JSON.stringify({status:summary.status,checks:summary.checks,atlasBytes:atlas.length,heatChangedPixels:heatPixels,browser:browserVersion}));
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
