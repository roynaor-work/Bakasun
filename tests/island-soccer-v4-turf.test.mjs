import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

const base=new URL('../workout/island/assets/soccer-v4/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('../workout/island/offline-manifest.json',import.meta.url),'utf8'));
const files=['turf-color-512.jpg','turf-normal-512.jpg'];

test('v4 turf runtime copies are 512px, small, offline-listed, and keep the fallback set listed',async()=>{
 let total=0;
 for(const file of files){
  const bytes=await readFile(new URL(file,base));total+=bytes.length;
  assert.ok(manifest.games.soccer.includes('assets/soccer-v4/'+file),file+' is in games.soccer');
  assert.match((await readFile(new URL('README.md',base),'utf8')),new RegExp(createHash('sha256').update(bytes).digest('hex')),'README records the sha256 of '+file);
  // SOF marker: 512x512, 3 channels.
  let at=2;while(at<bytes.length){const m=bytes[at+1],len=bytes.readUInt16BE(at+2);if(m>=0xc0&&m<=0xc2){assert.equal(bytes.readUInt16BE(at+5),512);assert.equal(bytes.readUInt16BE(at+7),512);assert.equal(bytes[at+9],3);break;}at+=2+len;}
 }
 assert.ok(total<150_000,`v4 turf payload is ${total} bytes`);
 for(const f of ['assets/soccer-realism/turf-albedo-1k.jpg','assets/soccer-realism/turf-normal-gl-1k.jpg'])assert.ok(manifest.games.soccer.includes(f),'fallback '+f+' stays offline-listed');
});

test('soccer uses the v4 turf, and falls back to the 1k pair when a v4 file fails, under the shipped CSP',{skip:process.env.ISLAND_SOCCER_BROWSER!=='1',timeout:360000},async t=>{
 const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
 const out=process.env.ISLAND_SOCCER_AUDIT_DIR;
 try{for(const viewport of [{width:844,height:390},{width:390,height:844}])await t.test(`${viewport.width}x${viewport.height}`,async()=>{
  const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),audit=await installIslandCspMonitor(context),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  const start=async()=>{await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();};
  const ready=async()=>{await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},null,{timeout:90000});return page.evaluate(()=>window.__island.games.current.session.snapshot.renderMetrics);};
  const exit=async()=>{await page.locator('[data-action=game-pause]').click();await page.locator('[data-action=game-exit]').click();};
  try{
   await page.goto(server.url+'?dev=1',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
   await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקת דשא',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
   await start();const normal=await ready();
   assert.equal(normal.turfSet,'v4');assert.ok(requests.some(u=>u.includes('assets/soccer-v4/turf-color-512.jpg')));assert.ok(!requests.some(u=>u.includes('turf-albedo-1k')),'the 1k set is not downloaded when v4 loads');
   if(out){await mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,`turf-v4-${viewport.width}x${viewport.height}.png`)});}
   await exit();requests.length=0;
   await context.route('**/assets/soccer-v4/turf-normal-512.jpg',route=>route.abort());
   await start();const fallback=await ready();
   assert.equal(fallback.turfSet,'1k');assert.ok(requests.some(u=>u.includes('turf-albedo-1k')));
   if(out)await page.screenshot({path:path.join(out,`turf-fallback-${viewport.width}x${viewport.height}.png`)});
   assert.deepEqual(errors,[]);await audit.assertClean();
  }finally{await audit.dispose();await context.close();}
 });}finally{await browser.close();await server.close();}
});
