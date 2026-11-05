import assert from 'node:assert/strict';
import test from 'node:test';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

// Opt-in browser integration (real Chromium + SwiftShader, the production CSP, the real racing session on the perf page):
// ISLAND_CSP_BROWSER=1 node --test tests/island-racing-v7-browser.test.mjs
// Racing v7 (05/11): the v7 cars, props, spectators, asphalt and smoke load from assets/racing-v7 under the CSP with no request leaving
// the island; ?racingV7=0, the config switch and a blocked or partly missing bundle all fall back silently to the previous coupe.
const enabled=process.env.ISLAND_CSP_BROWSER==='1'||process.env.ISLAND_RACING_BROWSER==='1';
const gpuArgs=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'];
const url=(server,query='')=>server.url+`tools/perf-racing.html?dev=1&hold=1&at=0.01&shot=1&dpr=0.2${query?'&'+query:''}`;

test('racing v7: default, kill flag, config switch, blocked bundle and one missing file, both orientations',{skip:!enabled,timeout:900000},async()=>{
 const server=await serveIsland(),chromium=await islandChromium();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:gpuArgs});
 async function run(name,{viewport,query='',setup}){
  const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1}),csp=await installIslandCspMonitor(context),page=await context.newPage();
  page.setDefaultTimeout(180000);await csp.attachPage(page);
  const requests=[],errors=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  if(setup)await setup(page);
  try{
   await page.goto(url(server,query),{waitUntil:'load'});
   const result=await page.waitForFunction(()=>window.__perf,null,{timeout:300000}).then(h=>h.jsonValue());
   await csp.assertClean();
   assert.ok(requests.every(u=>u.startsWith(server.url)||/^(data|blob):/.test(u)),name+': no request leaves the island origin');
   return {m:result.render,error:result.error,requests,errors};
  }finally{await csp.dispose();await context.close();}
 }
 const v7Requests=r=>r.requests.filter(u=>u.includes('/assets/racing-v7/')).map(u=>new URL(u).pathname.replace(/^.*\/assets\/racing-v7\//,''));
 const previous=r=>r.requests.some(u=>/assets\/racing\/sport-coupe/.test(u));
 try{
  for(const [label,viewport] of [['844x390',{width:844,height:390}],['390x844',{width:390,height:844}]]){
   const live=await run('default '+label,{viewport});
   assert.equal(live.error,undefined);assert.equal(live.m.v7.active,true);assert.equal(live.m.carAsset,'racing-v7');assert.deepEqual(live.m.failures,[]);
   assert.equal(live.m.modelLoaded,true);assert.ok(live.m.v7.lods[0]>=0&&live.m.v7.lods.filter(l=>l>=0).length>=3,'the cars in view show a LOD (cars behind the camera are not framed): '+live.m.v7.lods);
   assert.ok(live.m.v7.lods[0]<=1,'the player car is near');assert.ok(live.m.v7.lods.slice(1).every(l=>l===-1||l>=1),'opponents never use lod0');
   assert.ok(live.m.v7.spectators.capacity>=100,'the crowd is built');
   const files=v7Requests(live);
   for(const must of ['cars/apex-lod0.glb','cars/apex-lod1.glb','cars/apex-lod2.glb','cars/velour-lod1.glb','cars/vector-lod2.glb','crowd/spectator.glb','props/props.glb','textures/asphalt-color.webp','textures/tire-smoke.png'])assert.ok(files.includes(must),must+' requested');
   for(const never of ['cars/velour-lod0.glb','cars/prism-lod0.glb','cars/solis-lod0.glb','cars/vector-lod0.glb'])assert.ok(!files.includes(never),never+' (opponent lod0) is not downloaded');
   assert.ok(!files.some(f=>/^tracks\//.test(f)||/\.json$/.test(f)),'the package tracks are not used');
   assert.ok(!previous(live),'the previous coupe is not downloaded when v7 loads');
   assert.ok(!live.requests.some(u=>/\/design\/racing-v7\//.test(u)),'the game never reads design/');
  }
  const killed=await run('kill flag',{viewport:{width:844,height:390},query:'racingV7=0'});
  assert.equal(killed.m.v7.active,false);assert.equal(killed.m.v7.reason,'off');assert.equal(killed.m.carAsset,'sport-coupe');assert.equal(v7Requests(killed).length,0,'nothing from v7 is requested');assert.ok(previous(killed));
  const configOff=await run('config switch',{viewport:{width:390,height:844},setup:page=>page.route('**/data/config.json',async route=>{const response=await route.fetch(),json=await response.json();json.minigames.islandRacing.v7.enabled=false;await route.fulfill({response,json});})});
  assert.equal(configOff.m.v7.active,false);assert.equal(configOff.m.carAsset,'sport-coupe');assert.equal(v7Requests(configOff).length,0);
  const blocked=await run('bundle blocked',{viewport:{width:390,height:844},setup:page=>page.route(/\/assets\/racing-v7\//,route=>route.abort())});
  assert.equal(blocked.error,undefined,'a missing v7 asset never stops the game');assert.equal(blocked.m.v7.active,false);assert.deepEqual(blocked.m.failures,['v7']);
  assert.equal(blocked.m.carAsset,'sport-coupe');assert.equal(blocked.m.modelLoaded,true);assert.ok(previous(blocked),'the previous coupe is loaded instead');
  assert.equal(blocked.m.v7.spectators,null);
  const partial=await run('one car file missing',{viewport:{width:844,height:390},setup:page=>page.route(/racing-v7\/cars\/solis-lod2\.glb/,route=>route.fulfill({status:404,body:'missing'}))});
  assert.equal(partial.m.v7.active,false,'all or nothing: one missing file keeps the previous assets whole');assert.deepEqual(partial.m.failures,['v7']);assert.equal(partial.m.carAsset,'sport-coupe');assert.ok(partial.m.v7.lods.every(l=>l===-1));
  const broken=await run('file without the wheel nodes',{viewport:{width:844,height:390},setup:page=>page.route(/racing-v7\/cars\/prism-lod1\.glb/,route=>route.fulfill({status:200,contentType:'model/gltf-binary',body:Buffer.from('not a glb')}))});
  assert.equal(broken.m.v7.active,false);assert.deepEqual(broken.m.failures,['v7']);assert.equal(broken.m.carAsset,'sport-coupe');
 }finally{await browser.close();await server.close();}
});
