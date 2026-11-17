import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ownRoot=fileURLToPath(new URL('../../../../../',import.meta.url));
const base=process.env.PHONE_FIX_BASE_ROOT||ownRoot,target=process.env.PHONE_FIX_ROOT||ownRoot;
const output=process.env.PHONE_FIX_EVIDENCE||fileURLToPath(new URL('../evidence/',import.meta.url));
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright');
await mkdir(output,{recursive:true});
const html=await readFile(path.join(base,'workout/island/index.html'),'utf8');
const csp=html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i)?.[1];assert.ok(csp);
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary'};
async function serve(root){
 const server=createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://local').pathname);if(name.includes('..'))throw Error('path');let file=path.join(root,name);try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');}catch{file=path.join(base,name);if((await stat(file)).isDirectory())file=path.join(file,'index.html');}const body=await readFile(file),ext=path.extname(file);res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream','cache-control':'no-store',...(ext==='.html'?{'content-security-policy':csp}:{})});res.end(body);}catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));return {origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>{server.closeAllConnections();server.close(r);})};
}
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const reports=[];
const modes=(process.env.PHONE_FIX_BROWSER_MODES||'before,after,rollback,global-rollback').split(',');assert.ok(modes.every(m=>['before','after','rollback','global-rollback'].includes(m)));
try{for(const mode of modes){
 const server=await serve(mode==='before'?base:target),context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();
 const errors=[],wasm=[],violations=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\.wasm(?:\?|$)/.test(r.url()))wasm.push(r.url());});
 await page.addInitScript(()=>{Object.defineProperty(globalThis,'WebAssembly',{configurable:true,value:undefined});HTMLElement.prototype.requestFullscreen=undefined;globalThis.__phoneCViolations=[];addEventListener('securitypolicyviolation',e=>__phoneCViolations.push({blocked:e.blockedURI,directive:e.effectiveDirective}));});
 console.log('C browser '+mode);
 const flags=mode==='rollback'?'&phoneFixC=0':mode==='global-rollback'?'&phoneFixes=0':'';
 const tick=ms=>page.clock.runFor(ms),snap=()=>page.evaluate(()=>window.__island.games.current?.session.snapshot);
 try{
  page.setDefaultTimeout(120000);await page.clock.install();await page.goto(server.origin+'/workout/island/?dev=1&defenseV7=0'+flags,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__island?.view.metrics().avatarLoaded);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
  await page.locator('[data-action=avatar-start]').tap();await tick(32);
  await page.evaluate(()=>{const {engine:e,data}=__island;e.skipTutorial();e.tick=()=>({ok:true});data.featureFlags.events=false;e.state.money=100000;let done=false;for(let z=0;z<e.state.world.size&&!done;z++)for(let x=0;x<e.state.world.size&&!done;x++)if(e.place('airbase',x,z).ok)done=true;e.state.minigameEquipment.alienDefense.weapon=2;});
  await page.evaluate(()=>__island.games.start('alienDefense',undefined,1));await tick(32);
  if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').tap();
  for(let i=0;i<10&&await page.locator('.game-screen').getAttribute('data-starting')!=='false';i++)await page.clock.fastForward(1000);
  await page.waitForFunction(()=>__island.games.current?.session.debug?.model);await tick(160);
  await page.evaluate(()=>{const m=__island.games.current.session.debug.model;m.aliens.splice(2);Object.assign(m.behavior,{motion:'static',shoots:false,diveEverySeconds:0});for(const [a,y] of [[m.aliens[0],160],[m.aliens[1],280]])Object.assign(a,{x:180,y,baseX:180,baseY:y,originY:y,entry:0,entrySide:0,hp:100,maxHp:100,shield:0,diveAge:-1,launched:100});m.shots.length=0;m.player.x=180;m.player.vx=0;});
  await tick(32);await page.screenshot({path:path.join(output,`C-${mode}-aligned-844x390.png`)});
  const box=await page.locator('#shoot').boundingBox();assert.ok(box);const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});
  // Stop after the first real production shot; use the physical input gate, not an injected projectile.
  for(let i=0;i<10&&(await snap()).fired===0;i++)await tick(16);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await tick(16);
  const fired=await snap(),projectile=fired.shots.find(s=>!s.wing);assert.ok(projectile);assert.equal(projectile.kind,1,'equipment-rank-2 fixture projectile');assert.ok(projectile.hp>1,'reproduce the shipped piercing projectile');
  let contact=null;
  for(let i=0;i<70;i++){await tick(16);const s=await snap();if(s.hits&&!contact){contact=s;await page.screenshot({path:path.join(output,`C-${mode}-contact-844x390.png`)});}if(contact){await tick(600);break;}}
  const result=await snap(),front=result.aliens.find(a=>a.id===fired.aliens[1].id),rear=result.aliens.find(a=>a.id===fired.aliens[0].id);
  const expected=mode==='after',stops=rear.hp===100&&front.hp<100&&result.shots.length===0&&result.hits===1;
  const fx=(contact?.v25?.impacts||0)>0;
  assert.equal(stops,expected,`${mode}: first-hull stop regression`);assert.equal(fx,expected,`${mode}: regular impact regression`);
  if(expected)assert.ok(100-front.hp>2,'final C compensation must carry the equipped laser output into the first hull');
  else assert.equal(100-front.hp,1,'the old/rollback fixture retains the pre-compensation hull damage');
  violations.push(...await page.evaluate(()=>__phoneCViolations));assert.deepEqual(errors,[]);assert.deepEqual(wasm,[]);assert.deepEqual(violations,[]);
  await page.screenshot({path:path.join(output,`C-${mode}-after-flight-844x390.png`)});
  reports.push({mode,viewport:{width:844,height:390},hasTouch:true,isMobile:true,physicalPhone:false,artMode:'shipped ?defenseV7=0 disables pre-existing WASM Draco art; current v25 gameplay and v13 player stay active',fixture:'production game/session, two aligned static existing ships; equipment rank 2 fixture (state set before start, no purchase UI); real CDP touch fires production projectile',projectile:{kind:projectile.kind,hp:projectile.hp,vx:projectile.vx,vy:projectile.vy},frontDamage:100-front.hp,rearDamage:100-rear.hp,hits:result.hits,shotsRemaining:result.shots.length,impactCountAtContact:contact?.v25?.impacts||0,desiredAssertions:{stopsAtFirstHull:stops,regularImpactDrawn:fx},modelElapsed:result.time-fired.time,WebAssemblyAvailable:await page.evaluate(()=>typeof WebAssembly),wasmRequests:wasm,pageErrors:errors,cspViolations:violations});
 }finally{await context.close();await server.close();}
}}finally{await writeFile(path.join(output,'C-browser-results.json'),JSON.stringify({browser:browser.version(),clock:'Playwright deterministic RAF clock',reports},null,2)+'\n');await browser.close();}
console.log(JSON.stringify(reports,null,2));
