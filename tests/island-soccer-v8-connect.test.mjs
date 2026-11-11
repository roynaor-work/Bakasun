import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {soccerV8Enabled,soccerV8States,soccerV8KickClip,soccerV8DiveClip,soccerV8DivePlan,soccerV8EventTime,SOCCER_V8_LONG_PASS_SPEED} from '../workout/island/minigames/soccer-v8.mjs';
import {SOCCER_V7_KITS,SOCCER_V7_KEEPER_HUE,withSoccerV7Kits,applySoccerV7HueShift} from '../workout/island/minigames/soccer-v7.mjs';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

const root=new URL('../workout/island/',import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const config=(await read('data/config.json')).minigames.soccer,manifest=await read('offline-manifest.json'),clipsJson=await read('assets/soccer-v8/clips.json');
const BONES=['Root','Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];

test('v8 switches: whole pack off with ?soccerV8=0, each part off in config',()=>{
 assert.equal(soccerV8Enabled(config,'stadium',''),true);
 assert.equal(soccerV8Enabled(config,'motion','?dev=1'),true);
 assert.equal(soccerV8Enabled(config,'stadium','?soccerV8=0'),false);
 assert.equal(soccerV8Enabled(config,'motion','?x=1&soccerV8=0'),false);
 assert.equal(soccerV8Enabled({v8:{stadium:false}},'stadium',''),false);
 assert.equal(soccerV8Enabled({v8:{stadium:false}},'motion',''),true);
});

test('v8 clips file: every state has all 18 bones in every key, ordered times, contacts inside the clip',()=>{
 const states=soccerV8States(clipsJson),names=Object.keys(states);
 assert.equal(names.length,14,'4 field actions + keeper stance + 9 dives');
 for(const [name,state] of Object.entries(states)){
  assert.ok(name.startsWith('v8_')&&state.clip===name);
  assert.ok(state.durationSeconds>0.5&&state.keyframes.length>=8,name);
  let previous=-1;
  for(const key of state.keyframes){
   assert.ok(key.time>previous,`${name}: key times increase`);previous=key.time;
   for(const bone of BONES){const q=key.rotations[bone];assert.ok(q&&q.length===4,`${name}/${bone}`);assert.ok(Math.abs(Math.hypot(...q)-1)<.01,`${name}/${bone}: unit quaternion`);}
   assert.equal(key.hipsOffsetMeters.length,3);assert.ok(key.hipsOffsetMeters.every(Number.isFinite));
  }
  assert.equal(state.keyframes[0].time,0);assert.ok(state.keyframes.at(-1).time>.995,`${name}: last key at the end`);
  for(const c of state.ballContacts)assert.ok(c.time>0&&c.time<1&&Math.abs(c.time*state.durationSeconds-c.atSeconds)<.01);
 }
 for(const n of ['v8_pass_short','v8_pass_long','v8_pass_loft','v8_shot'])assert.equal(states[n].ballContacts.length,1,n+' has one strike');
 assert.throws(()=>soccerV8States({schemaVersion:2,states:{}}));
});

test('kick clip choice follows the simulation: shot, loft, long/short ground pass; null when v8 is not loaded',()=>{
 const has=n=>true,ball=(vx=0,vz=0,flight=null)=>({vx,vz,flight});
 assert.equal(soccerV8KickClip({event:{type:'shot'},ball:ball(15,0)},has),'v8_shot');
 assert.equal(soccerV8KickClip({ball:ball(8,0,{height:3})},has),'v8_pass_loft');
 assert.equal(soccerV8KickClip({ball:ball(SOCCER_V8_LONG_PASS_SPEED+1,0)},has),'v8_pass_long');
 assert.equal(soccerV8KickClip({ball:ball(4,3)},has),'v8_pass_short');
 assert.equal(soccerV8KickClip({ball:ball(4,3)},()=>false),null);
});

test('dive clip: side from the keeper\'s own left, row from ball height; plan skips the crouch and reaches the glove contact in 0.5 s',()=>{
 const has=()=>true,states=soccerV8States(clipsJson);
 assert.equal(soccerV8DiveClip(true,.2,has),'v8_keeper_dive_low_left');
 assert.equal(soccerV8DiveClip(false,1,has),'v8_keeper_dive_middle_right');
 assert.equal(soccerV8DiveClip(true,1.9,has),'v8_keeper_dive_high_left');
 assert.equal(soccerV8DiveClip(false,1.9,has),'v8_keeper_dive_high_right','the pack has a high dive to both sides (v7 had only the left)');
 assert.equal(soccerV8DiveClip(true,1,()=>false),null);
 for(const name of Object.keys(states).filter(n=>n.includes('dive'))){
  const state=states[name],plan=soccerV8DivePlan(state),contact=soccerV8EventTime(state,'visual_contact');
  assert.ok(plan,name);assert.equal(plan.contact,contact);
  assert.ok(plan.at>=0&&plan.at<contact,`${name}: enters before the glove contact`);
  assert.ok(Math.abs((contact-plan.at)/plan.rate-.5)<.02||plan.rate===1,`${name}: contact after ~0.5 s of play`);
 }
 assert.equal(soccerV8DivePlan({events:[]}),null);
});

test('kits: the HUD and rings use what the v7 meshes wear; the two keepers differ and neither matches an outfield kit',()=>{
 const base={team:{colors:['#2868ee','#ffcf69']},opponent:{colors:['#e94d51','#fff4d9']}};
 const v7=withSoccerV7Kits(base,'?soccerChars=v7');
 assert.equal(withSoccerV7Kits(base,''),base,'the shared athlete body (default since 11/11) wears the configured colours');
 assert.deepEqual(v7.team.colors,SOCCER_V7_KITS[0].colors);assert.deepEqual(v7.opponent.colors,SOCCER_V7_KITS[1].colors);
 assert.equal(withSoccerV7Kits(base,'?soccerChars=v4'),base,'other sets keep the configured colours');
 assert.notEqual(SOCCER_V7_KITS[0].colors[0],SOCCER_V7_KITS[1].colors[0]);
 assert.equal(SOCCER_V7_KEEPER_HUE[0],0);assert.ok(Math.abs(SOCCER_V7_KEEPER_HUE[1])>2,'team B keeper is turned a long way round the colour wheel');
 const material={};applySoccerV7HueShift(material,SOCCER_V7_KEEPER_HUE[1]);
 const shader={fragmentShader:'a\n#include <map_fragment>\nb'};material.onBeforeCompile(shader);
 assert.ok(/soccerHue/.test(shader.fragmentShader)&&/smoothstep/.test(shader.fragmentShader),'masked rotation (skin, gloves, boots untouched)');
 assert.equal(applySoccerV7HueShift({},0).onBeforeCompile,undefined,'team A keeper is untouched');
});

test('v8 assets are offline-listed and only loaded files ship',async()=>{
 for(const file of ['minigames/soccer-v8.mjs','minigames/soccer-v8-stadium.mjs','minigames/soccer-v8-layout.mjs'])assert.ok(manifest.shell.includes(file),file);
 const listed=new Set(manifest.games.soccer);
 for(const file of ['stadium-lod0.glb','stadium-lod1.glb','stadium-lod2.glb','clips.json','pitch.webp','crowd-atlas.webp','crowd-bed.webp','goal-net.webp','perimeter-led.webp','evening-sky.webp','lamp-glow.webp','goal-shadow.webp','crowd-distant.webp'])assert.ok(listed.has('assets/soccer-v8/'+file),file);
 const code=await readFile(new URL('minigames/soccer-v8-stadium.mjs',root),'utf8');
 assert.ok(!/(?:new URL|import)\([^)]*design\//.test(code)&&!/from '[^']*design\//.test(code),'runtime code never points into design/');
 for(const text of [await readFile(new URL('minigames/soccer-v8.mjs',root),'utf8'),code])assert.ok(!/['"`]\.\.\/design\/soccer-(?:motion|stadium)-v8/.test(text));
});

const browserTest={skip:process.env.ISLAND_SOCCER_BROWSER!=='1',timeout:900000};
async function startMatch(browser,server,viewport,query){
 const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),audit=await installIslandCspMonitor(context),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url+'?dev=1&soccerTier=0'+(query?'&'+query:''),{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
 await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקת v8',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
 return {context,audit,page,errors};
}
const begin=async page=>{
 await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
 await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},null,{timeout:240000});
};
const moveTo=(page,x,z)=>page.evaluate(([x,z])=>{const s=window.__island.games.current.session.debug.model.getState();s.ball.x=x;s.ball.z=z;s.ball.vx=s.ball.vz=0;s.ball.owner=null;const p=s.players[s.controlled];p.x=x;p.z=z;},[x,z]);
const view=(page,fn,arg)=>page.evaluate(([fn,arg])=>{const v=window.__island.games.current.session.debug.view;return v[fn](arg);},[fn,arg]);

test('v8 stadium: no bare sky at the four corners, both goal ends, both touchlines and the centre in both orientations; tier 0 and the 130K budget hold',browserTest,async t=>{
 const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
 const spots=[['corner NW',-23,-14],['corner NE',23,-14],['corner SW',-23,14],['corner SE',23,14],['goal west',-23.5,0],['goal east',23.5,0],['north touchline',0,-14.5],['south touchline',0,14.5],['centre',0,0]];
 try{for(const viewport of [{width:844,height:390},{width:390,height:844}])await t.test(`${viewport.width}x${viewport.height}`,async()=>{
  const {context,audit,page,errors}=await startMatch(browser,server,viewport,'');
  try{
   await begin(page);
   const state=await page.evaluate(()=>window.__island.games.current.session.debug.view.metrics().v8);
   assert.equal(state.status,'ready',JSON.stringify(state));
   const magentaShare=async()=>{const png=(await page.screenshot()).toString('base64');return page.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>240&&d[i+1]<20&&d[i+2]>240)n++;return n/(d.length/4);},png);};
   await view(page,'skyProbe',true);
   for(const [name,x,z] of spots){await moveTo(page,x,z);await page.waitForTimeout(2200);assert.equal(await magentaShare(),0,`${name}: backdrop visible`);}
   await page.evaluate(()=>window.__island.games.current.session.debug.view.skyProbe(true,false));
   let worst=0;for(const [,x,z] of spots.slice(0,4)){await moveTo(page,x,z);await page.waitForTimeout(2200);worst=Math.max(worst,await magentaShare());}
   assert.ok(worst>0,'negative control: with the stadium hidden the probe finds backdrop');
   await view(page,'skyProbe',false);await moveTo(page,0,0);await page.waitForTimeout(2200);
   const m=await page.evaluate(()=>{const v=window.__island.games.current.session.debug.view.metrics();return {tri:v.triangles,calls:v.drawCalls,quality:v.quality,stadium:v.v8};});
   assert.equal(m.quality,0,'tier 0 holds');assert.ok(m.tri<=config.view.maxTriangles,`${m.tri} triangles within ${config.view.maxTriangles}`);assert.ok(m.calls<=config.view.maxDrawCalls,`${m.calls} draw calls`);
   assert.deepEqual(errors,[]);await audit.assertClean();
  }finally{await context.close();}
 });}finally{await browser.close();await server.close();}
});

test('v8 flags and fallback: ?soccerV8=0 keeps the old stadium; a failed v8 asset keeps the old stadium and the match still starts',browserTest,async t=>{
 const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
 const viewport={width:844,height:390};
 try{
  await t.test('flag off',async()=>{
   const {context,page,errors}=await startMatch(browser,server,viewport,'soccerV8=0');
   try{await begin(page);
    const v=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.view.metrics();return {v8:m.v8,stadium:m.stadium,clips:window.__island.games.current.session.debug.view.characters[0].motion.actions};});
    assert.equal(v.v8.status,'off');assert.equal(v.stadium,'Island Design Stadium','the stadium that shipped before is built');
    assert.ok(!Object.keys(v.clips).some(n=>n.startsWith('v8_')),'no v8 clips loaded');assert.deepEqual(errors,[]);
   }finally{await context.close();}
  });
  await t.test('a v8 stadium file fails to load',async()=>{
   const {context,page}=await startMatch(browser,server,viewport,'');
   await context.route('**/assets/soccer-v8/stadium-lod1.glb',route=>route.abort());
   try{await begin(page);
    const v=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.view.metrics();return {v8:m.v8,stadium:m.stadium,designScene:m.designScene.status};});
    assert.equal(v.v8.status,'fallback',JSON.stringify(v.v8));assert.match(v.v8.error||'',/./);
    assert.equal(v.stadium,'Island Design Stadium','the old stadium takes over');assert.equal(v.designScene,'ready');
   }finally{await context.close();}
  });
  await t.test('the v8 clips file fails to load',async()=>{
   const {context,page}=await startMatch(browser,server,viewport,'');
   await context.route('**/assets/soccer-v8/clips.json',route=>route.fulfill({status:404,body:'no'}));
   try{await begin(page);
    const names=await page.evaluate(()=>Object.keys(window.__island.games.current.session.debug.view.characters[0].motion.actions));
    assert.ok(names.includes('run_3')&&!names.some(n=>n.startsWith('v8_')),'v7 clips only');
   }finally{await context.close();}
  });
 }finally{await browser.close();await server.close();}
});
