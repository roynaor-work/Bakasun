// Ships v24.8 "harder" (21/11/2026) through the island shell with real touch only: Chromium with hasTouch and isMobile (SwiftShader
// WebGL), 844x390, CDP Input.dispatchTouchEvent on the real controls, Playwright's fake clock (times are model time). Stages 1 and 30 are
// opened twice, on the default game and with ?navalHarder=0 (v24.7). Reads only (nothing is injected into the model):
//  - moving enemy hulls on the water at the opening and in the whole fleet;
//  - the lock: a tap on the Lock button with the ship standing still, seconds until the lock;
//  - the same tap while the left thumb sails the ship in a tight circle at full throttle (30 s window) and Fire is tapped at every lock
//    (one lock a shell, as on the phone): locks made, seconds per lock, locks lost by the tracker, shells fired;
//  - enemy shots in that window.
// Run: PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node workout/island/tests/naval-harder-v248-browser.mjs
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const frames=new URL((process.env.ISLAND_CSP_AUDIT_DIR?'file://'+process.env.ISLAND_CSP_AUDIT_DIR.replace(/\/?$/,'/'):'../verification/')+'naval-harder-v248/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const WINDOW=Number(process.env.WINDOW||30),STAGES=(process.env.STAGES||'1,30').split(',').map(Number);
await verify('naval-harder-v248',[{width:844,height:390,isMobile:true}],async({page,context,tick,snap,start,exit,nav,assert})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return b&&{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
 const capture=name=>page.screenshot({path:new URL(`844x390-${name}.jpg`,frames).pathname,type:'jpeg',quality:80});
 const tap=async(p,id=3)=>{await touch('touchStart',[{...p,id}]);await tick(70);await touch('touchEnd',[{...p,id}]);await tick(40);};
 await page.evaluate(()=>{const {engine,data}=window.__island;engine.state.minigameProgress.navalDuel.stage=30;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;});
 const leave=async()=>{const s=await snap().catch(()=>null);if(s?.result)for(let t=0;t<5000&&!(await page.locator('[data-action=game-again]:visible').count());t+=200)await tick(200);
  if(await page.locator('[data-action=game-again]:visible').count()){await page.locator('[data-action=game-exit]:visible').last().tap();await tick(400);}else if(await page.evaluate(()=>Boolean(window.__island.games.current)))await exit();else{await tick(1500);await nav();}
  for(let i=0;i<3&&await page.locator('[data-action=close-modal]:visible').count();i++){await page.locator('[data-action=close-modal]:visible').first().tap();await tick(300);}await tick(300);};
 const open=async(stage,search)=>{await page.evaluate(q=>{history.replaceState(null,'',location.pathname+'?dev=1'+q);},search);await start('navalDuel',stage);
  await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded,{timeout:120000}).catch(()=>{});await tick(400);};
 const moving=s=>s.enemies.filter(e=>e.active&&e.hp>0&&e.behavior!=='base').length;
 const play=async(stage,search)=>{
  const mode=search?'?navalHarder=0':'default',name=`stage${stage}-${search?'v247':'harder'}`;
  // 1. Opening, and one lock with the ship standing still.
  await open(stage,search);let s=await snap();
  const harder=await page.evaluate(()=>Boolean(window.__island.games.current?.session.debug.model.harder));
  const r={stage,mode,harder,renderMode:s.renderMode,openingMovingShips:moving(s),fleetShips:s.enemies.filter(e=>e.behavior!=='base').length,clockSeconds:Math.round(s.remaining+s.time)};
  const L=await center('.naval-lock-btn');assert.ok(L,'the Lock button is on the screen');
  await tap(L);s=await snap();const t0=s.time;r.radarNeedSeconds=s.v241?.radar?+s.v241.radar.need.toFixed(2):null;
  for(let k=0;k<200&&!s.homing&&(s.v241?.radar||k<4);k++){await tick(50);s=await snap();}
  r.stillLockSeconds=s.homing?+(s.time-t0).toFixed(2):null;await capture(`${name}-locked`);
  await leave();
  // 2. The same stage again: the left thumb sails a tight circle at full throttle, the Lock button is tapped whenever nothing is locked or acquiring, Fire at every lock.
  await open(stage,search);s=await snap();const w0=s.time,e0=s.enemyFired;let maxMoving=moving(s),angle=0,taps=0,lockedFrames=0,samples=0;
  const zone=await page.locator('.naval-stick-zone').boundingBox(),S={x:zone.x+zone.width*.45,y:zone.y+zone.height*.6},F=await center('#shoot');
  let stick={x:S.x,y:S.y,id:7};await touch('touchStart',[stick]);
  while(s&&!s.result&&s.time-w0<WINDOW){
   angle+=.16;stick={x:S.x+Math.sin(angle)*46,y:S.y-Math.cos(angle)*46,id:7};await touch('touchMove',[stick]);
   if(!s.homing&&!s.v241?.radar){await touch('touchStart',[stick,{...L,id:2}]);await tick(60);await touch('touchEnd',[{...L,id:2}]);taps++;}
   else if(s.homing){await touch('touchStart',[stick,{...F,id:2}]);await tick(60);await touch('touchEnd',[{...F,id:2}]);}
   await tick(100);const now=await snap().catch(()=>null);if(!now)break;s=now;maxMoving=Math.max(maxMoving,moving(s));samples++;if(s.homing)lockedFrames++;
  }
  await touch('touchEnd');
  const seconds=s.time-w0;
  Object.assign(r,{weaveSeconds:+seconds.toFixed(1),maxMovingShips:maxMoving,lockTaps:taps,locks:s.v241.radarLocks,secondsPerLock:s.v241.radarLocks?+(seconds/s.v241.radarLocks).toFixed(2):null,lostByTracker:s.harder?.trackBreaks??0,lostAll:s.v241.radarBreaks,refused:s.v241.radarRefused,lockedShare:+(lockedFrames/Math.max(1,samples)).toFixed(2),enemyShots:s.enemyFired-e0,playerShells:s.fired,hpLeft:+(s.lives/s.maxLives).toFixed(2),outcome:s.result?.outcome||'running'});
  console.log('naval',JSON.stringify(r));await leave();return r;
 };
 const out={};
 for(const stage of STAGES){
  const on=await play(stage,''),off=await play(stage,'&navalHarder=0');out[stage]={harder:on,v247:off};
  assert.equal(on.harder,true);assert.equal(off.harder,false);
  assert.ok(on.openingMovingShips>off.openingMovingShips,`stage ${stage} opening hulls ${off.openingMovingShips} -> ${on.openingMovingShips}`);
  assert.ok(on.fleetShips>off.fleetShips,`stage ${stage} fleet ${off.fleetShips} -> ${on.fleetShips}`);
  assert.ok(on.stillLockSeconds!==null&&off.stillLockSeconds!==null,`stage ${stage}: a still ship locks (${off.stillLockSeconds} s, ${on.stillLockSeconds} s)`);
  assert.ok(on.stillLockSeconds>off.stillLockSeconds,`stage ${stage} lock time ${off.stillLockSeconds} s -> ${on.stillLockSeconds} s`);
  assert.equal(off.lostByTracker,0);
 }
 return out;
});
