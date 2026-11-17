/** Real tennis session, real engine/config, native Chromium touch input at 844x390.
 * PHONE_FIX_ROOT=/path/to/clean-or-patched-checkout PHONE_FIX_LABEL=before|after node tests/E-browser.mjs
 * Existing no-WASM fallback is exercised by removing WebAssembly before page code starts.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(process.env.PHONE_FIX_ROOT||fileURLToPath(new URL('../../../../../',import.meta.url))),island=resolve(root,'workout/island');
const evidence=resolve(process.env.PHONE_FIX_EVIDENCE||fileURLToPath(new URL('../evidence',import.meta.url))),label=process.env.PHONE_FIX_LABEL||'after';
await mkdir(evidence,{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE||'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'));
const index=await readFile(resolve(island,'index.html'),'utf8'),csp=index.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.ogg':'audio/ogg','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local'),file=resolve(island,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(island+sep))throw Error('outside island');const info=await stat(file);const target=info.isDirectory()?resolve(file,'index.html'):file;res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream','Content-Security-Policy':csp});res.end(await readFile(target));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const results={label,viewport:{width:844,height:390},hasTouch:true,wasmDisabled:true,existingPresentationFlag:'tennisV7=0',cases:[],assertions:[]};
function check(name,fn){try{fn();results.assertions.push({name,passed:true});}catch(e){results.assertions.push({name,passed:false,message:e.message});}}
try{
 for(const flag of ['',...(label==='after'?['phoneFixE=0','phoneFixes=0']:[])]){
  console.log('E browser context',label,flag||'default');
  const context=await browser.newContext({viewport:results.viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'}),page=await context.newPage();
  const errors=[],wasm=[],violations=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\.wasm(?:[?#]|$)/.test(r.url()))wasm.push(r.url());});
  await page.addInitScript(()=>{Object.defineProperty(globalThis,'WebAssembly',{value:undefined,configurable:true});globalThis.__Etouches=0;globalThis.__Ecsp=[];addEventListener('pointerdown',e=>{if(e.pointerType==='touch')__Etouches++;},true);addEventListener('securitypolicyviolation',e=>__Ecsp.push({directive:e.effectiveDirective,uri:e.blockedURI}));const raf=requestAnimationFrame.bind(window);window.__Eg={frozen:false,pending:[],when:null};window.requestAnimationFrame=cb=>raf(t=>{const g=__Eg;if(g.frozen){g.pending.push(()=>cb(t));return;}cb(t);if(g.when?.()){g.frozen=true;g.when=null;}});});
  await page.goto(`${origin}/tools/tennis-session.html?dev=1&tennisV7=0&${flag}`);await page.waitForFunction(()=>window.__ts?.session.ready,null,{timeout:120000});await page.waitForTimeout(600);
  // Observe each real update, including zero-time buffered touch edges. An early net may
  // finish within one 250ms frame; waiting only for phase=rally would miss that shot.
  await page.evaluate(()=>{window.__Eshots=[];let observed=-1;const model=__ts.model,update=model.update;model.update=function(...args){const result=update.apply(this,args),s=model.getState();if(s.event.id!==observed&&s.event.type==='hit'&&s.event.side===0&&s.event.serving){observed=s.event.id;__Eshots.push(structuredClone(s.shot));}return result;};});
  let gateKind='';const freeze=async kind=>{gateKind=kind;console.log('E gate',flag||'default',kind);await page.evaluate(kind=>{if(kind==='served')globalThis.__EwantedShot=__Eshots.length+1;__Eg.when=()=>{const s=__ts.model.getState();return kind==='green'?s.phase==='toss'&&Math.abs(s.serveMeter-.5)<.025:kind==='early'?s.phase==='toss'&&s.serveMeter>=.055&&s.serveMeter<=.13:kind==='late'?s.phase==='toss'&&s.serveMeter>=.9&&s.serveMeter<=.96:kind==='ready'?s.phase==='serve'&&s.server===0:kind==='fault'?s.event.type==='fault':kind==='doubleFault'?s.event.reason==='doubleFault':kind==='served'?__Eshots.length>=__EwantedShot:s.phase==='rally'&&s.hitMeter?.active;};},kind);};
  const frozen=async()=>{try{await page.waitForFunction(()=>__Eg.frozen,null,{timeout:120000,polling:20});}catch(error){console.log('E gate timeout',gateKind,await page.evaluate(()=>({frozen:__Eg.frozen,shots:__Eshots,state:__ts.model.snapshot(),touches:__Etouches,buttons:[...document.querySelectorAll('.soccer-actions button')].map(n=>({id:n.id,hidden:n.hidden,rect:n.getBoundingClientRect().toJSON()}))})));await page.screenshot({path:resolve(evidence,'E-'+label+'-timeout-'+gateKind+'.png')});throw error;}};
  const resume=()=>page.evaluate(()=>{const g=__Eg;g.frozen=false;g.pending.splice(0).forEach(f=>f());});
  const touch=async id=>{const b=await page.locator('#'+id).boundingBox();assert.ok(b,`${id} touch target visible`);await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);};
  const inspect=()=>page.evaluate(()=>{const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};},meter=document.querySelector('.tennis-serve-meter'),s=__ts.model.getState();return {phase:s.phase,event:structuredClone(s.event),faults:s.faults,shot:(s.shot||__Eshots.at(-1))?{quality:(s.shot||__Eshots.at(-1)).quality,power:(s.shot||__Eshots.at(-1)).power,serveFault:(s.shot||__Eshots.at(-1)).serveFault}:null,meter:{...rect(meter),hidden:meter.hidden,visible:getComputedStyle(meter).display!=='none',mode:meter.dataset.mode},buttons:[...document.querySelectorAll('.soccer-actions button')].map(n=>({id:n.id,...rect(n),hidden:n.hidden,visible:getComputedStyle(n).display!=='none'})),touches:__Etouches,maxTouchPoints:navigator.maxTouchPoints,wasmType:typeof WebAssembly,csp:__Ecsp};});
  await freeze('green');await touch('pass');await frozen();
  const toss=await inspect();await page.screenshot({path:resolve(evidence,`E-${label}${flag?'-'+flag:''}-toss-844x390.png`)});
  await freeze('served');await touch('pass');await resume();await frozen();const served=await inspect();
  await page.screenshot({path:resolve(evidence,`E-${label}${flag?'-'+flag:''}-served-844x390.png`)});
  await freeze('incoming');await resume();await frozen();const incoming=await inspect();
  await page.screenshot({path:resolve(evidence,`E-${label}${flag?'-'+flag:''}-incoming-844x390.png`)});
  let early=null,earlyFault=null,late=null,doubleFault=null;
  if(!flag){
   // Let the real opponent win this rally; then take two bad serves with native taps.
   await freeze('ready');await resume();await frozen();
   await freeze('early');await touch('pass');await resume();await frozen();
   await freeze('served');await touch('pass');await resume();await frozen();early=await inspect();
   await page.screenshot({path:resolve(evidence,'E-'+label+'-early-red-844x390.png')});
   await freeze('fault');await resume();await frozen();earlyFault=await inspect();
   await page.screenshot({path:resolve(evidence,'E-'+label+'-early-fault-844x390.png')});
   await freeze('late');await touch('pass');await resume();await frozen();
   await freeze('served');await touch('pass');await resume();await frozen();late=await inspect();
   await freeze('doubleFault');await resume();await frozen();doubleFault=await inspect();
   await page.screenshot({path:resolve(evidence,'E-'+label+'-double-fault-844x390.png')});
   check('E poor native-touch serves lose quality and physically net/out',()=>{assert.ok(early.shot.quality<served.shot.quality-.4);assert.equal(early.shot.serveFault,'net');assert.equal(earlyFault.event.reason,'net');assert.equal(late.shot.serveFault,'out');assert.equal(doubleFault.event.reason,'doubleFault');});
  }
  results.cases.push({flag:flag||'default',toss,served,incoming,early,earlyFault,late,doubleFault,errors,wasmRequests:wasm});
  check(`${flag||'default'} native touch/no WASM/no page errors`,()=>{assert.ok(served.touches>=2);assert.ok(served.maxTouchPoints>0);assert.equal(served.wasmType,'undefined');assert.deepEqual(wasm,[]);assert.deepEqual(errors,[]);assert.deepEqual(served.csp,[]);});
  if(!flag){
   check('E serve meter disappears immediately after contact',()=>assert.equal(served.meter.visible,false));
   check('E serve control disappears after contact',()=>assert.equal(served.buttons.find(b=>b.id==='pass').visible,false));
   check('E incoming quality bar is on outer right rail',()=>{assert.ok(incoming.meter.visible);assert.ok(incoming.meter.x>=844*.94);assert.ok(incoming.meter.right<=844);});
   check('E touch controls >=64px, separated and clear of meter',()=>{const buttons=toss.buttons.filter(b=>b.visible);for(const b of buttons){assert.ok(b.width>=64&&b.height>=64);assert.ok(b.right+8<=toss.meter.x);}for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i],b=buttons[j];assert.ok(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y);}});
  }else{
   check(`${flag} restores legacy idle bar and serve control`,()=>{assert.equal(served.meter.visible,true);assert.equal(served.buttons.find(b=>b.id==='pass').visible,true);assert.ok(toss.meter.x<844*.9);});
  }
  await context.close();
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
await writeFile(resolve(evidence,`E-${label}-browser.json`),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({label,cases:results.cases.length,assertions:results.assertions},null,2));
if(results.assertions.some(a=>!a.passed))process.exitCode=1;
