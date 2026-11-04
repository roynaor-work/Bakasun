import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nearDetailPlayers} from '../workout/island/minigames/soccer-presentation.mjs';
import {SURROUND,terraceSlope,createSoccerSurround} from '../workout/island/minigames/soccer-surround.mjs';
import {serveIsland,islandChromium,installIslandCspMonitor} from './helpers/island-browser.mjs';

const root=new URL('../workout/island/',import.meta.url);
const config=JSON.parse(await readFile(new URL('data/config.json',root),'utf8')).minigames.soccer;
const manifest=JSON.parse(await readFile(new URL('offline-manifest.json',root),'utf8'));

test('near-detail players: the nearest N, sticky on the border',()=>{
 const players=[0,1,2,3,4,5].map(id=>({id,x:id*3,z:0}));
 const first=nearDetailPlayers(players,{x:0,z:0},3);
 assert.deepEqual([...first].sort(),[0,1,2]);
 // Player 3 becomes slightly nearer than player 2: 2 stays (hysteresis), no flicker.
 const moved=players.map(p=>p.id===3?{...p,x:5.5}:p.id===2?{...p,x:6.2}:p);
 assert.ok(nearDetailPlayers(moved,{x:0,z:0},3,first).has(2),'member inside the margin keeps the detailed mesh');
 assert.ok(!nearDetailPlayers(moved,{x:0,z:0},3,null).has(2),'without history the strict ranking applies');
 // Clearly farther: replaced.
 const far=players.map(p=>p.id===2?{...p,x:20}:p);
 assert.ok(!nearDetailPlayers(far,{x:0,z:0},3,first).has(2));
 assert.equal(nearDetailPlayers(players,{x:0,z:0},0).size,0);
 assert.equal(nearDetailPlayers(players,{x:0,z:0},99).size,6);
});

test('the camera-side terrace never hides a touchline player (rise/run below the camera slope)',()=>{
 const landscape=Math.tan(config.view.camera.elevationDegrees*Math.PI/180);
 assert.ok(terraceSlope()<landscape*.85,`terrace slope ${terraceSlope().toFixed(2)} vs camera slope ${landscape.toFixed(2)}`);
 assert.ok(SURROUND.terrace.start>2.4,'starts beyond the barrier and advertising boards');
});

test('surround is a small, bounded addition and is offline-listed',async()=>{
 const T=await import('../workout/island/vendor/three.module.js');
 const scene=new T.Scene();
 // Node has no canvas: the crowd texture is a DataTexture, so building works headless.
 const surround=createSoccerSurround(scene,config.pitch?config:{pitch:config.pitch},x=>x);
 const tri=surround.metrics().triangles;
 assert.ok(tri>0&&tri<8000,`surround is ${tri} triangles`);
 surround.update(-1);assert.equal(surround.terrace.scale.z,-1);surround.update(1);assert.equal(surround.terrace.scale.z,1);
 surround.dispose();
 assert.ok(manifest.shell.includes('minigames/soccer-surround.mjs'));
 assert.ok(config.view.nearDetailPlayers>=2&&config.view.nearDetailPlayers<=6);
});

test('no sky inside the match camera at pitch corners, goal ends and sidelines, both orientations; budget stays at tier 0',{skip:process.env.ISLAND_SOCCER_BROWSER!=='1',timeout:600000},async t=>{
 const chromium=await islandChromium(),server=await serveIsland('/workout/island/');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
 const spots=[['corner NW',-20,-12],['corner SE',20,12],['goal east',23,0],['south touchline',0,13],['centre',0,0]];
 try{for(const viewport of [{width:844,height:390},{width:390,height:844}])await t.test(`${viewport.width}x${viewport.height}`,async()=>{
  const context=await browser.newContext({viewport,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'}),audit=await installIslandCspMonitor(context),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(server.url+'?dev=1&soccerTier=0',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.__island);
   await page.evaluate(()=>{const {engine:e}=window.__island;e.setAvatar({name:'בדיקת שמיים',created:true});e.skipTutorial();e.state.money=100000;e.state.learning.required=false;if(!e.state.buildings.some(b=>b.typeId==='soccer'))e.state.buildings.push({id:'t-soccer',typeId:'soccer',x:0,y:0,level:1});});
   await page.evaluate(()=>window.__island.games.start('soccer',undefined,1));if(await page.locator('[data-action=game-understood]').count())await page.locator('[data-action=game-understood]').click();
   await page.waitForFunction(()=>{const s=window.__island.games.current?.session.snapshot;return s?.contractsStatus==='ready'&&s.renderMetrics?.assetStatus==='ready';},null,{timeout:180000});
   const magentaShare=async()=>{const png=(await page.screenshot()).toString('base64');return page.evaluate(async b64=>{const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>200&&d[i+2]>200&&d[i+1]<80)n++;return n/(c.width*c.height);},png);};
   const moveTo=(x,z)=>page.evaluate(([x,z])=>{const s=window.__island.games.current.session.debug.model.getState();s.ball.x=x;s.ball.z=z;s.ball.vx=s.ball.vz=0;s.ball.owner=null;const p=s.players[s.controlled];p.x=x;p.z=z;},[x,z]);
   await page.evaluate(()=>window.__island.games.current.session.debug.view.skyProbe(true));
   for(const [name,x,z] of spots){await moveTo(x,z);await page.waitForTimeout(2200);assert.equal(await magentaShare(),0,`${name}: backdrop visible`);}
   // Negative control: without the surround the same probe finds uncovered pixels, so the check can fail.
   await page.evaluate(()=>window.__island.games.current.session.debug.view.skyProbe(true,false));
   let worst=0;for(const [name,x,z] of spots.slice(0,2)){await moveTo(x,z);await page.waitForTimeout(2200);worst=Math.max(worst,await magentaShare());}
   assert.ok(worst>0,'the probe detects a missing surround');
   await page.evaluate(()=>window.__island.games.current.session.debug.view.skyProbe(false));
   await moveTo(0,0);await page.waitForTimeout(2000);
   const m=await page.evaluate(()=>{const v=window.__island.games.current.session.debug.view.metrics();return {tri:v.triangles,quality:v.quality};});
   assert.equal(m.quality,0,'tier 0 holds');assert.ok(m.tri<=config.view.maxTriangles,`${m.tri} triangles within the ${config.view.maxTriangles} budget`);
   assert.deepEqual(errors,[]);await audit.assertClean();
  }finally{await context.close();}
 });}finally{await browser.close();await server.close();}
});
