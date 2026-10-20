import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const evidence=new URL('../verification/g6e/',import.meta.url);await mkdir(evidence,{recursive:true});
await verify('g6e',[{width:844,height:390}],async({page,context,tick,snap,tap,start,exit,assert})=>{
 const capture=name=>page.screenshot({path:new URL(name+'.jpg',evidence).pathname,type:'jpeg',quality:92});
 await page.evaluate(()=>window.__island.games.now=()=>0);await start('navalDuel');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(80);
 const initial=await snap();assert.equal(initial.renderMode,'three');assert.equal(initial.rangeState.inside,false);assert.deepEqual(initial.renderMetrics.playerMarkers,{flag:false,flame:false,flameY:.85});await capture('04-player-no-triangle');
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const fire=await page.locator('#shoot').boundingBox(),x=fire.x+fire.width/2,y=fire.y+fire.height/2;
 const down=()=>touch('touchStart',[{x,y}]),up=()=>touch('touchEnd');
 await down();await tick(750);const charged=await snap();assert.equal(charged.fired,0);assert.ok(charged.chargePower>.45&&charged.chargePower<.55);assert.ok(await page.locator('#shoot').evaluate(n=>getComputedStyle(n,':before').opacity==='1'));await capture('01-power-meter');await up();await tick(40);
 const outside=await snap();assert.equal(outside.fired,1);assert.ok(outside.ball.power>.45);assert.equal(outside.rangeState.inside,false);await capture('03-outside-ring-shot');await tick(1000);
 // Sail into the circle with the actual movement control.
 const stick=await page.locator('.soccer-stick-zone').boundingBox(),sx=stick.x+stick.width*.4,sy=stick.y+stick.height*.6;
 await touch('touchStart',[{x:sx,y:sy}]);await touch('touchMove',[{x:sx,y:sy-38}]);await tick(2800);await up();await tick(700);
 const inside=await snap();assert.ok(inside.rangeState.inside);assert.ok(inside.rangeState.spread<outside.rangeState.spread);assert.ok(inside.playerShip.x>initial.playerShip.x+50);await capture('02-ship-inside-ring');
 // Sea gestures choose a bearing only; idle frames and charging retain it.
 const aimAtEnemy=async()=>{
  const q=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;return m.screenPoint(m.enemyShip.x,m.enemyShip.z);});
  const box=await page.locator('.minigame-canvas').boundingBox();await touch('touchStart',[{x:box.x+q.x,y:box.y+q.y}]);await tick(32);await up();await tick(32);
 };
 let hit;
 for(let attempt=0;attempt<6;attempt++){
  await aimAtEnemy();const aimed=await snap(),yaw=aimed.yaw;await tick(60);assert.equal((await snap()).yaw,yaw);
  const hold=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,b=window.__island.data.config.minigames.navalDuel;return (Math.hypot(m.enemyShip.x-m.playerShip.x,m.enemyShip.z-m.playerShip.z)-b.charge.minRange)/(b.charge.maxRange-b.charge.minRange)*b.charge.seconds*1000;});
  const before=(await snap()).fired;await down();await tick(hold);assert.equal((await snap()).fired,before);await up();await tick(32);const launched=await snap();assert.equal(launched.fired,before+1);
  await tick(Math.ceil(launched.ball.duration*1000)+20);const landed=await snap();assert.equal(landed.blast.x,launched.ball.targetX);assert.equal(landed.blast.z,launched.ball.targetZ);
  if(landed.blast.hit){hit=landed;await capture('05-hit');break;}
 }
 assert.ok(hit?.hits>0,'real charged projectile must hit');assert.ok(hit.renderMetrics.effects.smokeInstances>=8);
 // A very short tap still produces a near shot, with exactly one ammunition debit.
 const beforeTap=await snap();await tap('#shoot');await tick(32);const short=await snap();assert.equal(short.fired,beforeTap.fired+1);assert.ok(short.ball.power<.1);assert.ok(Math.hypot(short.ball.targetX-short.playerShip.x,short.ball.targetZ-short.playerShip.z)<80);
 // Dragging the aim control selects the other side, without moving the boat.
 await down();await touch('touchMove',[{x:x-90,y:y-45}]);await tick(100);const manual=await snap();assert.notEqual(manual.yaw,beforeTap.yaw);assert.equal(manual.playerShip.x,beforeTap.playerShip.x);await touch('touchCancel');await tick(50);assert.equal((await snap()).fired,short.fired);
 await page.evaluate(()=>window.__island.games.current.session.debug.view.degrade(true));await tick(32);assert.equal((await snap()).renderMode,'perspective');await capture('06-canvas-fallback');await exit();
 return {initial:{range:initial.rangeState,markers:initial.renderMetrics.playerMarkers},charged:{power:charged.chargePower,fired:charged.fired},outsideShot:{range:outside.rangeState,ball:outside.ball},inside:{range:inside.rangeState,ship:inside.playerShip},hit:{hits:hit.hits,blast:hit.blast},short:{power:short.ball.power,ball:short.ball},checks:{releaseOnly:true,chargeMeter:true,persistentBearing:true,rangeRing:true,sailingImprovesAccuracy:true,outsideShot:true,shortTap:true,noPlayerTriangle:true,actualHit:true,fallback:true}};
});
