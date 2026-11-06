import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import * as T from '../workout/island/vendor/three.module.js';
import {soccerCharacterSet,SOCCER_CHARACTER_SET_DEFAULT} from '../workout/island/minigames/soccer-v5.mjs';
import {SOCCER_V7_FILES,SOCCER_V7_FULL_DETAIL,soccerV7Map,soccerV7Variation,soccerV7FullDetail,concatSkinnedGeometries,joinSoccerV7Meshes} from '../workout/island/minigames/soccer-v7.mjs';
import {soccerV7Rung,SOCCER_V7_LADDER} from '../workout/island/minigames/soccer-design-character.mjs';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

const root=new URL('../workout/island/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('offline-manifest.json',root),'utf8'));
const NAMES=[...SOCCER_V7_FILES.outfield,SOCCER_V7_FILES.keeper];

test('v7 runtime files are light, offline-listed and not published from design/',async()=>{
 let total=0;
 for(const name of NAMES)for(const lod of ['near','far']){
  const file=`assets/soccer-v7/${name}-${lod}.glb`,{size}=await stat(new URL(file,root));total+=size;
  assert.ok(manifest.games.soccer.includes(file),file+' is in games.soccer');
 }
 const clips=await stat(new URL('assets/soccer-v7/clips.json',root));total+=clips.size;
 assert.ok(manifest.games.soccer.includes('assets/soccer-v7/clips.json'));assert.ok(manifest.shell.includes('minigames/soccer-v7.mjs'));
 assert.ok(total<2_500_000,`v7 runtime is ${total} bytes (the three GPT identities with LOD0 and LOD1 were 8.1 MB)`);
 assert.ok(!manifest.games.soccer.some(p=>p.startsWith('design/soccer-v7')),'nothing is loaded from design/soccer-v7');
 const pages=await readFile(new URL('../../.github/workflows/pages.yml',root),'utf8');
 assert.match(pages,/soccer-v7/,'design/soccer-v7 is excluded from the published site');
});

test('character set switch: v7 default, v6 and v5 are the previous cartoon set, v4 the authored set',()=>{
 assert.equal(SOCCER_CHARACTER_SET_DEFAULT,'v7');
 assert.equal(soccerCharacterSet(''),'v7');
 assert.equal(soccerCharacterSet('?soccerChars=v7'),'v7');
 assert.equal(soccerCharacterSet('?soccerChars=v6'),'v5');assert.equal(soccerCharacterSet('?soccerChars=v5'),'v5');
 assert.equal(soccerCharacterSet('?soccerChars=v4'),'v4');assert.equal(soccerCharacterSet('?soccerChars=zzz'),'v7');
});

test('v7 retarget map is the identity over the 18 canonical bones',async()=>{
 const map=JSON.parse(await readFile(new URL('design/viewer/retarget-map.json',root),'utf8')),library=JSON.parse(await readFile(new URL('design/motion/soccer.json',root),'utf8'));
 const v7=soccerV7Map(map);
 assert.equal(v7.bones.length,18);assert.equal(v7.motionScale,1);
 assert.ok(v7.bones.every(b=>b.source===b.target&&b.targetBasisWorldQuaternion.join()==='0,0,0,1'));
 assert.deepEqual(v7.bones.map(b=>b.source),library.skeleton.bones.map(b=>b.name),'same names and order as the motion library skeleton');
 assert.equal(map.bones.length,20,'the shared v4 map is not mutated');
});

test('v7 extra clips share the library skeleton, are unit quaternions and cover the ladder, dives and celebrations',async()=>{
 const library=JSON.parse(await readFile(new URL('design/motion/soccer.json',root),'utf8')),extra=JSON.parse(await readFile(new URL('assets/soccer-v7/clips.json',root),'utf8'));
 const names=library.skeleton.bones.map(b=>b.name);
 for(const [need] of SOCCER_V7_LADDER)assert.ok(extra.states[need],need);
 for(const need of ['keeper_dive_left','keeper_dive_right','keeper_dive_high','keeper_catch','celebrate_arms_up','celebrate_fist_pump','celebrate_victory_leap','celebrate_aeroplane'])assert.ok(extra.states[need],need);
 for(const [name,state] of Object.entries(extra.states)){
  assert.ok(state.durationSeconds>0&&state.keyframes.length>2,name);assert.equal(state.keyframes[0].time,0);assert.equal(state.keyframes.at(-1).time,1);
  for(const frame of state.keyframes){
   assert.deepEqual(Object.keys(frame.rotations),names,name+' bones');
   for(const q of Object.values(frame.rotations))assert.ok(Math.abs(Math.hypot(...q)-1)<2e-3,`${name} quaternion length`);
  }
 }
 for(const [name,speed] of SOCCER_V7_LADDER)if(name!=='run_1'||true)assert.ok(Math.abs(extra.states[name].speedMps-speed)<1e-6,name+' speed matches the ladder');
});

test('speed ladder picks the nearest rung and holds it near a boundary',()=>{
 assert.equal(SOCCER_V7_LADDER[soccerV7Rung(.5)][0],'run_1');assert.equal(SOCCER_V7_LADDER[soccerV7Rung(2.4)][0],'run_2');
 assert.equal(SOCCER_V7_LADDER[soccerV7Rung(4.5)][0],'run_4');assert.equal(SOCCER_V7_LADDER[soccerV7Rung(9)][0],'sprint');
 // boundary between run_3 (3.2) and run_4 (4.2) is 3.7: on run_3 at 3.8, a clear 4.1 moves up, and back down only below 3.45
 const run3=SOCCER_V7_LADDER.findIndex(r=>r[0]==='run_3');
 assert.equal(soccerV7Rung(3.8,run3),run3);assert.equal(soccerV7Rung(4.1,run3),run3+1);assert.equal(soccerV7Rung(3.6,run3+1),run3+1);assert.equal(soccerV7Rung(3.4,run3+1),run3);
});

test('full-detail selection never exceeds the cap, serves priority actors first, then the nearest',()=>{
 const players=Array.from({length:12},(_,id)=>({id,x:id*5,z:0}));
 const focus={x:0,z:0};
 const plain=soccerV7FullDetail(players,focus,[]);assert.equal(plain.size,SOCCER_V7_FULL_DETAIL);assert.deepEqual([...plain].sort((a,b)=>a-b),[0,1,2]);
 const priority=soccerV7FullDetail(players,focus,[11,null,undefined,10,9,8]);assert.deepEqual([...priority],[11,10,9]);
 const mixed=soccerV7FullDetail(players,focus,[7]);assert.ok(mixed.has(7)&&mixed.size===3&&mixed.has(0)&&mixed.has(1));
 assert.equal(soccerV7FullDetail(players,focus,[],1).size,1);assert.equal(soccerV7FullDetail(players,focus,[],0).size,0);
 const sticky=soccerV7FullDetail(players,{x:6.5,z:0},[],3,new Set([0,1,2]));assert.ok(sticky.has(1)&&sticky.size===3,'a member stays until it is clearly farther than the threshold');
});

test('variation is deterministic, small and free (scale and tint only)',()=>{
 const seen=new Set();
 for(let id=0;id<12;id++){const v=soccerV7Variation(id);assert.deepEqual(v,soccerV7Variation(id));assert.ok(Math.abs(v.scale-1)<=.031&&v.tint.every(c=>Math.abs(c-1)<=.037));seen.add(v.scale+'/'+v.tint[0]);}
 assert.ok(seen.size>=4,'a team does not look like twelve clones');
});

test('primitives join into one skinned geometry even when Draco decoded different integer widths',()=>{
 const make=(offset,index)=>{const g=new T.BufferGeometry();
  g.setAttribute('position',new T.BufferAttribute(new Float32Array([0,0,0,1,0,0,0,1,0].map(v=>v+offset)),3));g.setAttribute('normal',new T.BufferAttribute(new Float32Array([0,0,1,0,0,1,0,0,1]),3));
  g.setAttribute('uv',new T.BufferAttribute(new Float32Array([0,0,1,0,0,1]),2));g.setAttribute('skinIndex',new T.BufferAttribute(index,4));g.setAttribute('skinWeight',new T.BufferAttribute(new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0]),4));
  g.setIndex(new T.BufferAttribute(new Uint32Array([0,1,2]),1));return g;};
 const joined=concatSkinnedGeometries([make(0,new Uint8Array(12)),make(5,new Uint16Array(12).fill(3))]);
 assert.equal(joined.attributes.position.count,6);assert.equal(joined.index.count,6);assert.deepEqual([...joined.index.array],[0,1,2,3,4,5]);
 assert.ok(joined.attributes.skinIndex.array instanceof Uint16Array);assert.equal(joined.attributes.skinIndex.getX(3),3);assert.equal(joined.attributes.position.getX(3),5);
 const scene=new T.Group(),skeleton=new T.Skeleton([new T.Bone()]);
 for(const [i,g] of [make(0,new Uint8Array(12)),make(5,new Uint16Array(12))].entries()){const m=new T.SkinnedMesh(g,new T.MeshStandardMaterial({name:'m'+i}));m.add(skeleton.bones[0]);m.bind(skeleton);scene.add(m);}
 let count=0;const host=joinSoccerV7Meshes(scene);scene.traverse(o=>{if(o.isSkinnedMesh)count++;});
 assert.equal(count,1);assert.equal(host.geometry.attributes.position.count,6);assert.equal(host.material.alphaTest,.25);
});

test('soccer plays the v7 characters and falls back to v5, under the shipped CSP, within the triangle budget',{skip:process.env.ISLAND_SOCCER_BROWSER!=='1',timeout:600000},async()=>{
 const chromium=await islandChromium(),server=await serveIsland('/workout/island/'),config=JSON.parse(await readFile(new URL('data/config.json',root),'utf8')).minigames.soccer;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
 try{
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,serviceWorkers:'block'}),audit=await installIslandCspMonitor(context),page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  const play=async(search)=>{
   await page.goto(server.url+'?dev=1&soccerTier=0'+search,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
   await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקת שחקנים',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
   await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
   await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},null,{timeout:180000});
   await page.waitForTimeout(2500);
   return page.evaluate(()=>{const m=window.__island.games.current.session.snapshot.renderMetrics,v=window.__island.games.current.session.debug.view.metrics();return {set:m.assetStats.characterSet,source:m.assetStats.source,tri:v.triangles,calls:v.drawCalls,quality:v.quality};});
  };
  const v7=await play('');
  assert.equal(v7.set,'v7');assert.equal(v7.source,'assets/soccer-v7');assert.equal(v7.quality,0,'tier 0 holds');
  assert.ok(v7.tri<=config.view.maxTriangles,`${v7.tri} triangles within the ${config.view.maxTriangles} budget`);assert.ok(v7.calls<=config.view.maxDrawCalls,`${v7.calls} draw calls`);
  for(const name of NAMES)assert.ok(requests.some(u=>u.includes(`assets/soccer-v7/${name}-near.glb`))&&requests.some(u=>u.includes(`assets/soccer-v7/${name}-far.glb`)),name);
  assert.ok(!requests.some(u=>u.includes('/design/soccer-v7/')),'nothing is requested from design/');
  assert.equal((await play('&soccerChars=v6')).set,'v5');
  await context.route('**/assets/soccer-v7/player-04-far.glb',route=>route.abort());
  assert.equal((await play('')).set,'v5','one blocked v7 file falls back to the previous set');
  assert.deepEqual(errors.filter(e=>!/Failed to fetch|aborted|net::/i.test(e)),[]);await audit.assertClean();
  await context.close();
 }finally{await browser.close();await server.close();}
});
