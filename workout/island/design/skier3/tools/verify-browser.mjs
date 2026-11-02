// Real local GLTFLoader + WASM Draco + WebGL skinning validation.
// node .../verify-browser.mjs --serve (localhost only, no build dependencies)
// PLAYWRIGHT_MODULE=/path/playwright node .../verify-browser.mjs --modules /tmp/alpine-tools
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),island=path.resolve(here,'../../..'),skier=path.resolve(here,'..'),out=path.resolve(skier,'verification');
const args=process.argv.slice(2),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.md':'text/plain; charset=utf-8','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp'};
const allowed=['/design/skier3/','/design/alpine-world/','/design/alpine-track/textures/','/design/viewer/draco/','/vendor/'];
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname);if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}if(!allowed.some(prefix=>name.startsWith(prefix)))throw Error('forbidden');const file=await fs.realpath(path.resolve(island,'.'+name));if(!file.startsWith(island+path.sep))throw Error('forbidden');const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store','Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404).end('Not found');}});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(option('--port',args.includes('--serve')?'8766':'0')),'127.0.0.1',resolve);});
const origin=`http://127.0.0.1:${server.address().port}`,url=origin+'/design/skier3/viewer.html';
if(args.includes('--serve')){console.log(url);process.on('SIGINT',()=>server.close(()=>process.exit()));process.on('SIGTERM',()=>server.close(()=>process.exit()));}else{
  let browser;const report={schemaVersion:1,kind:'alpine-browser-verification',engine:'Chromium / WebGL ANGLE SwiftShader',url:'/design/skier3/viewer.html',viewports:[],clips:[],network:{externalRequests:[],failedRequests:[],httpErrors:[]},consoleErrors:[],consoleWarnings:[],pageErrors:[],checks:[],assets:[],allPassed:false};
  const assert=(value,name,detail)=>{report.checks.push({name,pass:!!value,...detail});if(!value)throw Error(name);};
  const hash=b=>createHash('sha256').update(b).digest('hex');
  try{
    await fs.mkdir(out,{recursive:true});
    const modules=option('--modules','/tmp/alpine-tools'),require=createRequire(path.resolve(modules,'package.json'));
    const loadedPW=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE??require.resolve('playwright')).href),pw=loadedPW.default??loadedPW,sharp=require('sharp');
    browser=await pw.chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    const context=await browser.newContext({viewport:{width:1440,height:960},deviceScaleFactor:1});
    await context.route('**/*',route=>{const u=route.request().url();if(!u.startsWith(origin)&&!u.startsWith('blob:')&&!u.startsWith('data:')){report.network.externalRequests.push(u);return route.abort();}return route.continue();});
    const page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());if(m.type()==='warning')report.consoleWarnings.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.network.httpErrors.push({url:r.url(),status:r.status()});});page.on('requestfailed',r=>report.network.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
    await page.goto(url);const loaded=await page.evaluate(()=>window.alpineViewer.ready);await page.evaluate(()=>{window.alpineViewer.pause();window.alpineViewer.seek(.35);});
    assert(loaded.assets===13,'13 final GLBs decoded in the browser');
    report.assets=(await page.evaluate(()=>window.alpineViewer.snapshot())).assets;
    const manifest=JSON.parse(await fs.readFile(path.join(skier,'manifest.json'))),world=JSON.parse(await fs.readFile(path.resolve(skier,'../alpine-world/manifest.json')));
    for(const m of [{id:'skier',...manifest},...world.models]){const file=m.id==='skier'?path.join(skier,m.file):path.resolve(skier,'../alpine-world',m.file),bytes=await fs.readFile(file),actual=report.assets.find(a=>a.id===m.id);assert(actual&&actual.triangles===m.triangles&&actual.bytes===bytes.length,`${m.id}: browser triangle and byte counts match final manifest`);actual.sha256=hash(bytes);assert(actual.sha256===m.sha256,`${m.id}: final GLB hash matches manifest`);}
    // Exercise visible controls, not only the test API.
    await page.locator('[data-clip="boost"]').click();await page.locator('#play-toggle').click();await page.locator('#timeline').evaluate(el=>{el.value='.42';el.dispatchEvent(new Event('input',{bubbles:true}));});assert((await page.evaluate(()=>window.alpineViewer.snapshot())).clip==='boost','clip button selects embedded boost animation');
    await page.locator('#rig-toggle').click();await page.locator('#wire-toggle').click();assert(await page.locator('#rig-toggle').getAttribute('aria-pressed')==='true'&&await page.locator('#wire-toggle').getAttribute('aria-pressed')==='true','rig and wireframe controls work');await page.locator('#rig-toggle').click();await page.locator('#wire-toggle').click();
    const clipNames=['glide','crouch','boost','fall','get_up'];
    for(const name of clipNames){
      const result=await page.evaluate(name=>{const api=window.alpineViewer;api.playClip(name,{paused:true});const samples=[];for(let i=0;i<=32;i++){api.seek(i/32,{renderFrame:false});const s=api.snapshot();samples.push({normalized:i/32,minY:s.bounds.min[1],bounds:s.bounds,bones:s.bones});}return {name,duration:samples.length&&api.snapshot().duration,samples};},name);
      assert(result.samples.every(s=>s.bones.length===18),`${name}: 18 bones throughout playback`);
      const minimumY=Math.min(...result.samples.map(s=>s.minY));assert(minimumY>=-.001,`${name}: deformed mesh remains above snow tolerance`,{minimumY,toleranceMeters:.001});
      report.clips.push(result);console.log(`${name}: 33 poses checked, min Y ${minimumY.toFixed(6)}m`);
    }
    const fall=report.clips.find(c=>c.name==='fall').samples.at(-1),getUp=report.clips.find(c=>c.name==='get_up').samples[0];
    let maxJointGap=0;for(let i=0;i<18;i++)maxJointGap=Math.max(maxJointGap,Math.hypot(...fall.bones[i].position.map((v,k)=>v-getUp.bones[i].position[k])));assert(maxJointGap<1e-5,'fall end and get_up start match in loaded skeleton',{maxJointGapMeters:maxJointGap});
    const screenshots=[];
    for(const v of [{width:1440,height:960},{width:390,height:844},{width:844,height:390}]){
      await page.setViewportSize(v);await page.evaluate(()=>{const a=window.alpineViewer;a.setMode('scene');a.playClip('glide',{paused:true});a.seek(.35);a.resetView();});await page.waitForTimeout(100);
      const file=`scene-${v.width}x${v.height}.webp`;await sharp(await page.screenshot({type:'png'})).webp({quality:86}).toFile(path.join(out,file));screenshots.push(file);
      const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight);assert(fits,`${v.width}x${v.height}: viewer fits viewport`);report.viewports.push({...v,screenshot:file});
      await page.locator('[data-mode="library"]').click();
      for(const id of ['skier',...world.models.map(m=>m.id)]){await page.evaluate(id=>window.alpineViewer.showAsset(id),id);const s=await page.evaluate(()=>window.alpineViewer.snapshot());assert(s.selected===id&&s.render.triangles>0,`${v.width}x${v.height}: ${id} renders in library`);}
      await page.evaluate(()=>window.alpineViewer.showAsset('ice-wall'));const library=`library-${v.width}x${v.height}.webp`;await sharp(await page.screenshot({type:'png'})).webp({quality:86}).toFile(path.join(out,library));screenshots.push(library);
    }
    // Five time samples per embedded animation, rendered from the final GLB.
    await page.setViewportSize({width:420,height:420});await page.addStyleTag({content:'header,section,aside,.view-tools,footer,.loading{display:none!important}#app{min-height:0!important}'});
    await page.evaluate(()=>{const a=window.alpineViewer;a.setMode('library');a.showAsset('skier');a.frameSubject();});
    const tiles=[];let row=0;
    for(const name of clipNames){let col=0;for(const t of [0,.25,.5,.75,1]){await page.evaluate(({name,t})=>{window.alpineViewer.playClip(name,{paused:true});window.alpineViewer.seek(t);},{name,t});const png=await page.screenshot({type:'png'});const title=`${name} / ${Math.round(t*100)}%`;const label=Buffer.from(`<svg width="420" height="32"><rect width="420" height="32" fill="#edf4f6"/><text x="14" y="22" font-family="sans-serif" font-size="13" fill="#243943">${title}</text></svg>`);const tile=await sharp(png).composite([{input:label,top:0,left:0}]).webp({quality:86}).toBuffer();tiles.push({input:tile,left:col*420,top:row*420});col++;}row++;}
    await sharp({create:{width:2100,height:2100,channels:3,background:'#d8e6ec'}}).composite(tiles).webp({quality:87}).toFile(path.join(out,'motion-contact-sheet.webp'));screenshots.push('motion-contact-sheet.webp');
    report.screenshots=screenshots;
    for(const file of screenshots){report.evidence??=[];report.evidence.push({file,sha256:hash(await fs.readFile(path.join(out,file)))});}
    assert(report.consoleErrors.length===0&&report.pageErrors.length===0,'zero console errors and page errors');assert(report.consoleWarnings.length===0,'zero console warnings');assert(Object.values(report.network).every(a=>a.length===0),'all requests local; zero failed requests or HTTP errors');
    report.sources=[];for(const file of ['viewer.html','viewer.js','viewer.css','tools/verify-browser.mjs'])report.sources.push({file,sha256:hash(await fs.readFile(path.join(skier,file)))});report.allPassed=report.checks.every(c=>c.pass);
  }catch(e){report.failure=e.stack;process.exitCode=1;}finally{await browser?.close();await new Promise(r=>server.close(r));await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({allPassed:report.allPassed,checks:report.checks.length,failure:report.failure,consoleErrors:report.consoleErrors,pageErrors:report.pageErrors}));}
}
