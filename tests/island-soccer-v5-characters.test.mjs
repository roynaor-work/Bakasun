import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {soccerCharacterSet,soccerV5Map,assignSoccerV5Regions,SOCCER_V5_REGIONS,SOCCER_V5_FILES} from '../workout/island/minigames/soccer-v5.mjs';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

const root=new URL('../workout/island/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('offline-manifest.json',root),'utf8'));

test('v5 runtime copies are light, offline-listed and have region rules',async()=>{
 let total=0;
 for(const file of [...SOCCER_V5_FILES.outfield,SOCCER_V5_FILES.keeper]){
  const {size}=await stat(new URL('assets/soccer-v5/'+file,root));total+=size;
  assert.ok(manifest.games.soccer.includes('assets/soccer-v5/'+file),file+' is in games.soccer');
  assert.ok(SOCCER_V5_REGIONS[file].some(r=>r.region==='shirt'),file+' has a shirt rule');
 }
 assert.ok(total<250_000,`v5 characters are ${total} bytes (v4 pair was 202 KB)`);
 assert.ok(manifest.games.soccer.includes('design/soccer-v5/rig.json'));assert.ok(manifest.shell.includes('minigames/soccer-v5.mjs'));
});

test('character set switch and the shoulder-less retarget map',async()=>{
 assert.equal(soccerCharacterSet('?soccerChars=v4'),'v4');assert.equal(soccerCharacterSet('?soccerChars=v5'),'v5');assert.equal(soccerCharacterSet('?soccerChars=x'),soccerCharacterSet(''));
 const map=JSON.parse(await readFile(new URL('design/viewer/retarget-map.json',root),'utf8')),rig=JSON.parse(await readFile(new URL('design/soccer-v5/rig.json',root),'utf8'));
 const v5=soccerV5Map(map);
 assert.equal(v5.bones.length,rig.joints.length);assert.deepEqual(v5.bones.map(b=>b.target),rig.joints.map(j=>j.name));
 assert.equal(map.bones.length,20,'the shared v4 map is not mutated');
});

test('v5 regions: colour plus height pick shirt, shorts and socks',()=>{
 const rules=SOCCER_V5_REGIONS['teal-quiff.glb'],g=new T.BufferGeometry(),pos=[],col=[];
 const tri=(y,rgb)=>{for(let k=0;k<3;k++){pos.push(k*.01,y,0);col.push(...rgb);}};
 tri(.8,[.019,.491,.418]);tri(.5,[.009,.027,.067]);tri(.2,[.847,.888,.723]);tri(1.0,[.009,.036,.070]);tri(1.25,[.018,.033,.053]);
 g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));
 const counts=assignSoccerV5Regions(g,rules);
 assert.deepEqual(counts,{shirt:1,shorts:1,socks:1,preserve:1,hair:1});
});

test('soccer falls back to the v4 characters when a v5 file fails, under the shipped CSP',{skip:process.env.ISLAND_SOCCER_BROWSER!=='1',timeout:360000},async()=>{
 const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,serviceWorkers:'block'}),audit=await installIslandCspMonitor(context),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  const play=async()=>{
   await page.goto(server.url+'?dev=1&soccerChars=v5',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
   await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקת שחקנים',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
   await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
   await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},null,{timeout:120000});
   return page.evaluate(()=>window.__island.games.current.session.snapshot.renderMetrics.assetStats.characterSet);
  };
  assert.equal(await play(),'v5');assert.ok(requests.some(u=>u.includes('assets/soccer-v5/teal-quiff.glb')));
  await context.route('**/assets/soccer-v5/teal-knot.glb',route=>route.abort());requests.length=0;
  assert.equal(await play(),'v4');
  assert.deepEqual(errors.filter(e=>!/Failed to fetch|aborted|net::/i.test(e)),[]);await audit.assertClean();
  await context.close();
 }finally{await browser.close();await server.close();}
});
