// Naval battle patch v1 (20/11/2026) through the island shell with real touch only: Chromium with hasTouch and isMobile (SwiftShader
// WebGL), 844x390, CDP Input.dispatchTouchEvent on the stick zone and the Fire button, real frames (Playwright's fake clock). Stage 1 is
// played twice by the same "child" (sail in a circle with the left thumb, tap Fire every 0.75 s) for a fixed 15 s window: once on the
// default game and once with ?navalBattle=0 (v24.5). Reads only: moving enemy hulls at the opening, enemy shots, shells fired, render mode.
// Run: PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node workout/island/tests/naval-battle-v1-browser.mjs
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const frames=new URL((process.env.ISLAND_CSP_AUDIT_DIR?'file://'+process.env.ISLAND_CSP_AUDIT_DIR.replace(/\/?$/,'/'):'../verification/')+'naval-battle-v1/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const WINDOW=Number(process.env.WINDOW||15);
await verify('naval-battle-v1',[{width:844,height:390,isMobile:true}],async({page,context,tick,snap,start,exit,assert})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return b&&{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
 const capture=name=>page.screenshot({path:new URL(`844x390-${name}.jpg`,frames).pathname,type:'jpeg',quality:80});
 await page.evaluate(()=>{window.__island.data.config.minigames.navalDuel.render.fallbackFrameMs=10000;});
 const play=async search=>{
  await page.evaluate(q=>{history.replaceState(null,'',location.pathname+'?dev=1'+q);},search);
  await start('navalDuel',1);
  await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded,{timeout:120000}).catch(()=>{});
  await tick(400);
  const moving=s=>s.enemies.filter(e=>e.active&&e.hp>0&&e.behavior!=='base').length;
  let s=await snap();const opening=moving(s),t0=s.time,e0=s.enemyFired,f0=s.fired;let maxMoving=opening,angle=0,lastFire=-9;
  const zone=await page.locator('.naval-stick-zone').boundingBox(),S={x:zone.x+zone.width*.45,y:zone.y+zone.height*.6},F=await center('#shoot');
  let stick={x:S.x,y:S.y,id:7};await touch('touchStart',[stick]);let shot=false;
  while(s&&!s.result&&s.time-t0<WINDOW){
   angle+=.12;stick={x:S.x+Math.sin(angle)*42,y:S.y-Math.cos(angle)*42,id:7};await touch('touchMove',[stick]);
   if(s.time-lastFire>.75){await touch('touchStart',[stick,{...F,id:2}]);await tick(60);await touch('touchEnd',[{...F,id:2}]);lastFire=s.time;}
   await tick(120);const now=await snap().catch(()=>null);if(!now)break;s=now;maxMoving=Math.max(maxMoving,moving(s));
   if(!shot&&s.time-t0>4){await capture(`naval-stage1-${search?'v245':'battle'}`);shot=true;}
  }
  await touch('touchEnd');
  const enabled=await page.evaluate(()=>window.__island.games.current?.session.debug.model.navalBattle??null);
  const r={mode:search?'?navalBattle=0':'default',navalBattle:enabled,renderMode:s.renderMode,openingMovingShips:opening,maxMovingShips:maxMoving,seconds:+(s.time-t0).toFixed(1),enemyShots:s.enemyFired-e0,playerShells:s.fired-f0,hpLeft:+(s.lives/s.maxLives).toFixed(2),outcome:s.result?.outcome||'running'};
  console.log('naval',JSON.stringify(r));
  if(!s.result)await exit();else{for(let t=0;t<5000&&!(await page.locator('[data-action=game-again]:visible').count());t+=200)await tick(200);await page.locator('[data-action=game-exit]:visible').last().tap();await tick(400);}
  return r;
 };
 const battle=await play(''),v245=await play('&navalBattle=0');
 assert.equal(battle.navalBattle,true);assert.equal(v245.navalBattle,false);
 assert.ok(battle.openingMovingShips>v245.openingMovingShips,`opening hulls ${v245.openingMovingShips} -> ${battle.openingMovingShips}`);
 assert.ok(battle.enemyShots>v245.enemyShots,`enemy shots in ${WINDOW} s ${v245.enemyShots} -> ${battle.enemyShots}`);
 return {battle,v245};
});
