// Archery-style naval aiming in the live game: touch at 844x390 and 740x360,
// mouse and keyboard at 1366x768. Synthetic island, no personal save data.
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const evidence=new URL('../verification/naval-aim/',import.meta.url);await mkdir(evidence,{recursive:true});
const sizes=[{width:844,height:390},{width:740,height:360},{width:1366,height:768}].filter(v=>!process.env.NAVAL_AIM_ONLY||String(v.width)===process.env.NAVAL_AIM_ONLY);
await verify('naval-aim',sizes,async({page,context,viewport,tick,snap,start,exit,assert})=>{
 const tag=`${viewport.width}x${viewport.height}`,capture=name=>page.screenshot({path:new URL(`${tag}-${name}.jpg`,evidence).pathname,type:'jpeg',quality:90});
 const phone=viewport.width<1000,client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await page.evaluate(()=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;engine.state.minigameProgress.navalDuel.stage=10;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;});
 const drive=input=>page.evaluate(input=>window.__island.games.current.session.debug.drive(.02,input),input);
 const fresh=async(stage=3)=>{await start('navalDuel',stage);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);};
 const center=async selector=>{const b=await page.locator(selector).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
 const report={};
 await fresh();let s=await snap();assert.equal(s.renderMode,'three');assert.equal(s.aiming,false);assert.equal(s.renderMetrics.aimArc.points,0);
 report.models=s.renderMetrics.models;assert.equal(s.renderMetrics.models.failed,0);assert.ok(s.renderMetrics.playerLoaded);
 assert.equal(await page.locator('.naval-weapon-hint').isVisible(),false,'no explanatory line in battle');
 await capture('1-sea');
 if(phone){
  // Hold, drag right and up: turret turns right, barrel rises, ring charges, arc appears.
  const fire=await center('#shoot');await touch('touchStart',[fire]);await tick(120);const held=await snap();assert.ok(held.aiming);assert.equal(held.fired,0);
  const before=held.turret,aimBefore=held.aimScreen;
  // 28/10/2026: distance is now set by the vertical drag at full power from the start, so a longer drag up pulls the far landing toward the horizon; drag mostly sideways to check the turn.
  for(let i=1;i<=6;i++){await touch('touchMove',[{x:fire.x+i*12,y:fire.y-i*4}]);await tick(50);}await tick(800);
  const aimed=await snap();assert.ok(aimed.turret.yaw>before.yaw,'drag right turns the turret right');assert.ok(aimed.turret.elevation>before.elevation,'drag up raises the barrel');assert.ok(aimed.turret.power>.99,'the ring charges to full');
  assert.ok(aimed.prediction.end.z>held.prediction.end.z,'the landing moves to the right of the bow (the camera turns with the turret, so its screen x stays near the centre)');void aimBefore;assert.ok(aimed.camera.zoom>.9,'the camera zooms behind the turret');assert.ok(aimed.renderMetrics.aimArc.points>10&&aimed.renderMetrics.aimArc.visible);assert.equal(aimed.fired,0);
  assert.equal(await page.locator('.naval-aim-cancel').isVisible(),true);
  await capture('2-aim');
  await touch('touchEnd');await tick(40);const launched=await snap();assert.equal(launched.fired,1,'release fires once');assert.deepEqual(launched.ball.predicted.end,{x:aimed.prediction.end.x,z:aimed.prediction.end.z,t:aimed.prediction.end.t});
  await tick(Math.round(launched.ball.duration*450));await capture('3-shot');await tick(2000);s=await snap();assert.equal(s.fired,1,'no double shot after release');assert.ok(s.camera.zoom<.2,'the camera returns after the shot');
  report.manual={turret:aimed.turret,predicted:launched.ball.predicted.end,actual:s.lastShot.actual,targetMoved:s.lastShot.targetMoved};
  // Release on the cancel chip: nothing fires.
  await touch('touchStart',[fire]);await tick(300);const chip=await center('.naval-aim-cancel');await touch('touchMove',[chip]);await tick(60);await touch('touchEnd');await tick(400);s=await snap();assert.equal(s.fired,1,'cancel chip never fires');assert.equal(s.aiming,false);
  // A cancelled touch and a lost window focus never fire.
  await touch('touchStart',[fire]);await tick(300);await touch('touchCancel');await tick(400);assert.equal((await snap()).fired,1,'touchcancel never fires');
  await touch('touchStart',[fire]);await tick(300);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await touch('touchEnd');await tick(400);assert.equal((await snap()).fired,1,'blur never fires');
  // Two thumbs: sail with the stick while aiming with the other thumb.
  const zone=await page.locator('.naval-stick-zone').boundingBox(),stick={x:zone.x+zone.width*.45,y:zone.y+zone.height*.6};const x0=(await snap()).playerShip;
  await touch('touchStart',[{...stick,id:1}]);await touch('touchMove',[{x:stick.x,y:stick.y-40,id:1}]);await tick(200);await touch('touchStart',[{x:stick.x,y:stick.y-40,id:1},{...fire,id:2}]);await tick(500);const both=await snap();
  assert.ok(both.aiming,'aiming with the second thumb');assert.ok(Math.hypot(both.playerShip.x-x0.x,both.playerShip.z-x0.z)>3,'the ship keeps sailing');
  await touch('touchMove',[{x:stick.x,y:stick.y-40,id:1},{x:fire.x-20,y:fire.y-10,id:2}]);await tick(300);await touch('touchEnd');await tick(40);s=await snap();assert.equal(s.fired,2,'lifting both thumbs fires the aim once');await tick(1500);
  report.twoThumbs={moved:Math.hypot(both.playerShip.x-x0.x,both.playerShip.z-x0.z),fired:s.fired};
  // A quick tap fires once.
  await touch('touchStart',[fire]);await tick(60);await touch('touchEnd');await tick(40);s=await snap();assert.equal(s.fired,3,'tap is a quick shot');assert.equal(s.ball.ammo,0);await tick(1600);
  // Torpedo: water path along the turret bearing.
  await page.locator('.naval-weapon-picker').tap();await tick(200);await page.locator('[data-ammo-index="2"]').tap();await tick(100);await touch('touchStart',[fire]);await tick(600);await touch('touchEnd');await tick(60);s=await snap();assert.equal(s.ball.launch.kind,'water');assert.equal(s.ball.launch.origin.h,0);await tick(2500);
 }else{
  // Mouse: press, drag, release. Keyboard: Space hold and release.
  const fire=await center('#shoot');await page.mouse.move(fire.x,fire.y);await page.mouse.down();await tick(150);await page.mouse.move(fire.x+30,fire.y-60,{steps:6});await tick(800);const aimed=await snap();assert.ok(aimed.aiming&&aimed.camera.zoom>.9&&aimed.renderMetrics.aimArc.points>10);await capture('2-aim');
  await page.mouse.up();await tick(40);let fired=(await snap()).fired;assert.equal(fired,1);await tick(Math.round(aimed.prediction.flight*450));await capture('3-shot');await tick(2000);
  await page.locator('canvas.minigame-canvas').focus();await page.keyboard.down('Space');await tick(500);assert.ok((await snap()).aiming);await page.keyboard.up('Space');await tick(40);assert.equal((await snap()).fired,2,'Space release fires once');await tick(1500);
  await page.keyboard.down('Space');await tick(300);await page.keyboard.press('Escape');await page.keyboard.up('Space');await tick(300);assert.equal((await snap()).fired,2,'Escape cancels the keyboard aim');assert.equal((await snap()).paused,false,'Escape while aiming does not open the pause sheet');
 }
 // Hit and critical frames: the same model update path with a solved, honest launch.
 await tick(500);
 await drive({ammoIndex:0,autoAim:true,fireRelease:true});s=await snap();const hitAt=s.ball.predicted.contact?.t??s.ball.duration;
 await tick(Math.round(hitAt*1000)+40);await capture('4-impact');await tick(1200);s=await snap();report.hit=s.lastShot;if(s.lastShot.actual.victim===null)console.log('LEDSHOT',JSON.stringify({last:s.lastShot,enemies:s.enemies.map(e=>({i:e.index,a:e.active,hp:e.hp,x:e.x,z:e.z,vx:e.vx,vz:e.vz})),sel:s.selectedTargetIndex,ship:s.playerShip}));assert.ok(s.lastShot.actual.victim!==null,'the led shot hits the moving hull');
 // Performance at a larger fleet, then light quality keeps aiming.
 await exit();await fresh(10);await tick(600);s=await snap();report.peak=s.renderMetrics.peak;report.dressing=s.renderMetrics.dressing;assert.ok(s.renderMetrics.peak.triangles<=90000,'triangle budget');assert.ok(s.renderMetrics.peak.drawCalls<=70,'draw-call budget');
  // 26/10/2026 (round 3): stage 10 at its busiest moment, aiming with the arc and marks, then a real hit with flash, sparks, smoke and the lost-health trail.
  {const aimAt=await center('#shoot');if(phone)await touch('touchStart',[aimAt]);else{await page.mouse.move(aimAt.x,aimAt.y);await page.mouse.down();}await tick(700);s=await snap();const aimedPeak={...s.renderMetrics.peak},aimArc=s.renderMetrics.aimArc;if(phone)await touch('touchEnd');else await page.mouse.up();await tick(1600);
   await drive({ammoIndex:0,autoAim:true,fireRelease:true});s=await snap();const t10=s.ball.predicted?.contact?.t??s.ball.duration;await tick(Math.round(t10*1000)+250);s=await snap();
   // 27/10/2026 (gameplay round): enemies now patrol, so keep firing solved shots until one lands on the weak centre.
   const first=s.lastShot?.actual;let attempts=1;while(!s.lastShot?.actual?.critical&&attempts<8&&!s.result){await tick(900);await drive({ammoIndex:0,autoAim:true,fireRelease:true});s=await snap();const tn=s.ball.predicted?.contact?.t??s.ball.duration;await tick(Math.round(tn*1000)+250);s=await snap();attempts++;}
   report.stage10={aimArc,aimedPeak,first,shot:s.lastShot?.actual,attempts,hit:s.hud?.lastHit,peak:s.renderMetrics.peak,moving:s.enemies.filter(e=>e.active&&e.hp>0).map(e=>+Math.hypot(e.vx,e.vz).toFixed(1))};assert.ok(aimArc.points>0,'stage 10 aim draws the arc');assert.ok(first?.victim!==null&&first?.victim!==undefined,'stage 10 solved shot hits');assert.ok(s.lastShot?.actual?.critical,'stage 10 reaches a weak-centre hit on a moving enemy');assert.ok(report.stage10.moving.every(v=>v>1),'stage 10 enemies are under way');assert.ok(s.renderMetrics.peak.triangles<=90000&&s.renderMetrics.peak.drawCalls<=70,'stage 10 budget through aim and impact');}
 await page.evaluate(()=>window.__island.games.current.session.debug.view.degrade());await tick(200);s=await snap();assert.equal(s.renderMetrics.quality,'low');const lowFire=await center('#shoot');if(phone)await touch('touchStart',[lowFire]);else{await page.mouse.move(lowFire.x,lowFire.y);await page.mouse.down();}await tick(400);s=await snap();assert.ok(s.aiming&&s.renderMetrics.aimArc.points>0,'light quality keeps the arc');await capture('6-light-quality');if(phone)await touch('touchEnd');else await page.mouse.up();await tick(1500);
 await exit();
 // Exit keeps the save valid and unchanged in shape.
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('island.v1')));assert.equal(saved.version,18);report.saveVersion=saved.version;
 if(viewport.width===844){
  // Swapped sides: the aim button and pad move under the left thumb.
  await page.evaluate(()=>localStorage.setItem('island.naval.hand','left'));await fresh();const fire=await page.locator('#shoot').boundingBox(),pad=await page.locator('.naval-aim-zone').boundingBox(),stickZone=await page.locator('.naval-stick-zone').boundingBox();
  assert.ok(fire.x<viewport.width/2&&pad.x<viewport.width/2&&stickZone.x>viewport.width/3,'left-handed layout');await capture('5-left-handed');
  const point={x:fire.x+fire.width/2,y:fire.y+fire.height/2};await touch('touchStart',[point]);await tick(500);await touch('touchEnd');await tick(40);assert.equal((await snap()).fired,1);await exit();await page.evaluate(()=>localStorage.removeItem('island.naval.hand'));report.leftHanded=true;
 }
 return report;
});
