import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const evidence=new URL('../verification/g6d/',import.meta.url);await mkdir(evidence,{recursive:true});
await verify('g6d',[{width:844,height:390}],async({page,context,tick,snap,tap,start,exit,assert})=>{
 const capture=async name=>page.screenshot({path:new URL(name+'.jpg',evidence).pathname,type:'jpeg',quality:90});
 await page.evaluate(()=>window.__island.games.now=()=>0);await start('navalDuel');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(80);
 const initial=await snap();assert.equal(initial.renderMode,'three');assert.equal(initial.wind.salvo,0);await capture('01-sea-waves');
 const stick=await page.locator('.soccer-stick-zone').boundingBox(),x=stick.x+stick.width*.4,y=stick.y+stick.height*.6,client=await context.newCDPSession(page);
 const touch=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await touch('touchStart',[{x,y}]);await touch('touchMove',[{x,y:y-34}]);await tick(2300);await touch('touchMove',[{x:x+23,y:y-34}]);await tick(400);const sailing=await snap();assert.ok(sailing.moving);assert.ok(sailing.rangeState.inside);assert.ok(sailing.renderMetrics.effects.foamInstances>=12);await capture('02-bow-foam-wake');
 await touch('touchEnd',[]);await tick(650);const stopped=await snap();assert.equal(stopped.moving,false);const e=stopped.enemyShip,p=stopped.playerShip,dx=e.x-p.x,dz=e.z-p.z;assert.ok(Math.abs((Math.cos(p.heading)*dx+Math.sin(p.heading)*dz)/Math.hypot(dx,dz))<.025);await capture('04-broadside-enemy');
 const fire=await page.locator('#shoot').boundingBox(),fx=fire.x+fire.width/2,fy=fire.y+fire.height/2;
 await touch('touchStart',[{x:fx,y:fy}]);await tick(700);const aimed=await snap();assert.ok(aimed.aiming);await capture('03-reticle-wind');await touch('touchCancel',[]);await tick(200);
 // Real normal shots, with visible wind compensation on the manual sea reticle.
 // The debug model only supplies input here, no health/impact/effect is injected.
 const fireAt=async hit=>{
  const point=await page.evaluate(hit=>{const {model:m}=window.__island.games.current.session.debug,b=window.__island.data.config.minigames.navalDuel,e=m.enemyShip;
   const flight=b.targeting.flightSeconds+Math.hypot(e.x-m.playerShip.x,e.z-m.playerShip.z)*b.targeting.secondsPerRange,scale=b.aim.wind.driftScale*b.aim.wind.difficultyMin*flight*flight;
   const tx=hit?e.x-m.wind.x*scale:240,tz=hit?e.z-m.wind.z*scale:-160,q=m.screenPoint(tx,tz),a=m.screenPoint(m.aim.x,m.aim.z),hold=(Math.hypot(tx-m.playerShip.x,tz-m.playerShip.z)-b.charge.minRange)/(b.charge.maxRange-b.charge.minRange)*b.charge.seconds*1000;return {x:q.x-a.x,y:q.y-a.y,hold};},hit);
  await touch('touchStart',[{x:fx,y:fy}]);await touch('touchMove',[{x:fx+point.x,y:fy+point.y}]);await tick(Math.max(0,point.hold));await touch('touchEnd',[]);
 };
 let hit;for(let attempt=0;attempt<6;attempt++){await fireAt(true);await tick(32);await capture('07-muzzle-flash');await tick(1100);hit=await snap();if(hit.hits>=1)break;}assert.ok(hit.hits>=1);assert.ok(hit.renderMetrics.effects.smokeInstances>=8);await touch('touchStart',[{x:fx,y:fy}]);await tick(600);await capture('05-hit-fire-smoke');await touch('touchCancel',[]);
 const windAfter={...hit.wind};await tick(200);await fireAt(false);await tick(750);await touch('touchStart',[{x:fx,y:fy}]);await tick(300);const miss=await snap();assert.equal(miss.blast.hit,false);assert.ok(miss.blast.life>0);assert.notDeepEqual(miss.wind,windAfter);await capture('06-miss-splash');await touch('touchCancel',[]);
 // Dedicated bank unlocks from real gestures, respects the existing pause toggle.
 await page.waitForFunction(()=>window.__island.games.current.session.debug.audio.metrics().loaded.length===8);
 let audio=await page.evaluate(()=>window.__island.games.current.session.debug.audio.metrics());assert.ok(audio.loops.includes('waves'));assert.ok(audio.counts.cannon>=1);assert.ok(audio.counts.whistle>=1);assert.ok(audio.counts.metal>=1);assert.ok(audio.counts.explosion>=1);assert.ok(audio.counts.splash>=1);
 await tap('[data-action=game-pause]');await tap('[data-action=game-pause-sound]');await tick(32);const muted=await page.evaluate(()=>({saved:localStorage.getItem('island.sound'),audio:window.__island.games.current.session.debug.audio.metrics()}));assert.equal(muted.saved,'off');assert.ok(muted.audio.paused);
 await tap('[data-action=game-pause-sound]');await tap('[data-action=game-resume]');await tick(64);assert.equal((await page.evaluate(()=>window.__island.games.current.session.debug.audio.metrics())).muted,false);
 await tap('[data-ammo-index="2"]');await tick(32);await tap('#shoot');await tick(100);assert.equal((await snap()).ball.ammo,2);audio=await page.evaluate(()=>window.__island.games.current.session.debug.audio.metrics());assert.ok(audio.counts.torpedo>=1);
 let worst=(await snap()).renderMetrics;await exit();await page.evaluate(()=>{window.__island.games.now=()=>3;window.__island.engine.state.minigameProgress.navalDuel.stage=10;});await start('navalDuel',10);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics.enemiesLoaded>=2);await tick(50);
 await page.evaluate(()=>window.__island.games.current.session.debug.model.enemies[1].hp=0);await tick(850);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics.enemiesLoaded>=3);await tap('[data-ammo-index="4"]');await tick(32);
 const fb=await page.locator('#shoot').boundingBox();await touch('touchStart',[{x:fb.x+fb.width/2,y:fb.y+fb.height/2}]);for(let i=0;i<20;i++){await tick(80);const metrics=(await snap()).renderMetrics;assert.ok(metrics.triangles<=90000&&metrics.drawCalls<=70,JSON.stringify(metrics));worst={triangles:Math.max(worst.triangles,metrics.triangles),drawCalls:Math.max(worst.drawCalls,metrics.drawCalls)};}await touch('touchEnd',[]);
 await page.evaluate(()=>window.__island.games.current.session.debug.view.degrade());await tick(32);assert.equal((await snap()).renderMetrics.quality,'low');await page.evaluate(()=>window.__island.games.current.session.debug.view.degrade(true));await tick(32);assert.equal((await snap()).renderMode,'perspective');await capture('08-canvas-fallback');await exit();
 return {initial:{wind:initial.wind},sailing:{player:sailing.playerShip,effects:sailing.renderMetrics.effects},stopped:{player:p,enemy:e,camera:stopped.camera,returnTime:stopped.returnTime},hit:{hits:hit.hits,effects:hit.renderMetrics.effects},miss:{blast:miss.blast,wind:miss.wind},audio,worst,checks:{waves:true,wake:true,wind:true,broadside:true,hitSmoke:true,missSplash:true,muzzle:true,audio:true,mute:true,torpedo:true,renderBudget:true,fallback:true}};
});
