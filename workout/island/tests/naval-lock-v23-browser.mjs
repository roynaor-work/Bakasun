// v23 lock-on acceptance for the ships, through the island shell with real touch only: CDP Input.dispatchTouchEvent on the screen and on
// the on-screen controls (844x390, Chromium with hasTouch and isMobile, SwiftShader), real frames (Playwright's clock). The model is only
// read, the way a child reads the screen (where a hull is, the arc, the marks, the gauges); it is never driven and no state is injected.
// The harness setup is the one of final-naval-browser.mjs (stages unlocked, the 3D view kept on at SwiftShader speed).
// MODE=after (default): (A) a long press on an enemy hull locks it (the ring fills, the brackets and the green Fire), the turret follows the
//   moving hull by itself, a tap on Fire hits, a second long press unlocks; (B) accuracy: SHOTS (default 20) locked shots at moving hulls
//   (stage 10) and SHOTS at the fixed shore base (stage 15, after sailing in with the left thumb); both modes pick targets the same way
//   (a hull on screen with a clear line of fire first, then the nearest; with lock-on a hull whose lock reads "another target in the way"
//   is left for three seconds, as the word asks); (C) a hull behind the bow: the ship turns
//   away on the stick, the hull is locked, the turret swings round and the tap hits.
// MODE=before (`?navalLock=0`, v22): the long press does nothing (no lock, no ring, no data-lock); the same accuracy cells are measured with
//   the thumb of the earlier acceptance (drag from Fire until the arc's end sits on the hull, then lift).
// ONLY=a,b,c (after) or ONLY=b (before) runs a subset. Frames and verification.json go to verification/naval-lock-v23[-before]/.
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const before=process.env.MODE==='before',SHOTS=Number(process.env.SHOTS||20),only=(process.env.ONLY||'').split(',').filter(Boolean),want=k=>!only.length||only.includes(k);
const part=before?'naval-lock-v23-before':'naval-lock-v23',flag=before?'&navalLock=0':'';
const frames=new URL(`../verification/${part}/`,import.meta.url);await mkdir(frames,{recursive:true});
const DEG=180/Math.PI,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
try{
await verify(part,[{width:844,height:390,isMobile:true}],async({page,context,viewport,tick,snap,start,exit,assert})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await page.evaluate(flag=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;engine.state.minigameProgress.navalDuel.stage=30;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;history.replaceState(null,'',location.pathname+'?dev=1'+flag);},flag);
 const capture=name=>page.screenshot({path:new URL(`${name}.jpg`,frames).pathname,type:'jpeg',quality:78});
 const center=async selector=>{const b=await page.locator(selector).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
 const ready=async stage=>{await start('navalDuel',stage);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);};
 /** Back to the island from wherever the game is: the result card after a won or lost stage (its exit button), or the pause menu. */
 const leave=async()=>{
  const s=await snap().catch(()=>null);if(s?.result)for(let t=0;t<5000&&!(await page.locator('[data-action=game-again]:visible').count());t+=200)await tick(200);
  if(await page.locator('[data-action=game-again]:visible').count()){await page.locator('[data-action=game-exit]:visible').last().tap();await tick(400);}
  else if(await page.locator('[data-action=game-pause]:visible').count())await exit();
  for(let i=0;i<3&&await page.locator('[data-action=close-modal]:visible').count();i++){await page.locator('[data-action=close-modal]:visible').first().tap();await tick(300);}
  await tick(300);};
 /** Where a hull is on the screen (what the child sees). */
 const screenOf=index=>page.evaluate(i=>{const s=window.__island.games.current.session,e=s.debug.model.enemies.find(e=>e.index===i);if(!e)return null;const q=s.debug.view.projectTarget(e.x,e.z,1.5);return q&&{x:q.x,y:q.y,depth:q.depth};},index);
 const visible=q=>q&&q.depth>0&&q.x>=40&&q.x<=viewport.width-40&&q.y>=75&&q.y<=viewport.height-30;
 const report={mode:before?'before (?navalLock=0, v22)':'after (v23 lock-on)',search:await page.evaluate(()=>location.search),shots:SHOTS};
 /** A finger resting on a hull for `ms` of game time, then lifted; the ring progress seen on the way. */
 const longPress=async(index,ms=650,id=1)=>{
  const q=await screenOf(index);if(!visible(q))return {pressed:false};const t0=(await snap()).time,progress=[];
  await touch('touchStart',[{x:q.x,y:q.y,id}]);for(let t=0;t<ms;t+=50){await tick(50);const s=await snap();progress.push(s.hud?.lock?.press?.progress??0);}
  await touch('touchEnd',[]);await tick(60);const s=await snap();
  return {pressed:true,at:{x:Math.round(q.x),y:Math.round(q.y)},seconds:+(s.time-t0).toFixed(2),progress,homing:s.homing?.index??null,status:s.homing?.status??null,hud:s.hud?.lock||null,fire:await page.evaluate(()=>document.querySelector('.game-controls')?.dataset.lock??null)};};
 const tapFire=async()=>{const F=await center('#shoot');await touch('touchStart',[{x:F.x,y:F.y,id:2}]);await tick(50);await touch('touchEnd',[]);await tick(40);};
 /** After a shot: wait until it is fired (a tap may wait for the turret) and has landed; did it hit the hull? */
 // The stage can end while a shell flies (the last hull sinks, or our ship): the last snapshot that existed is the one read.
 const live=async last=>(await snap().catch(()=>null))||last;
 const settle=async(index,fired0,hp0)=>{let s=await live(null);if(!s)return {fired:0,hit:false,victim:null,predicted:null,critical:false};for(let t=0;t<2400&&s.fired===fired0&&!s.result;t+=60){await tick(60);s=await live(s);}const fired=s.fired-fired0;
  for(let t=0;t<4000&&(s.ball?.active||s.extraShots?.length)&&!s.result;t+=100){await tick(100);s=await live(s);}await tick(120);s=await live(s);
  const e=s.enemies.find(e=>e.index===index),victim=s.lastShot?.actual?.victim??null,predicted=s.lastShot?.predicted?.contact?.index??null;
  return {fired,hit:fired>0&&(victim===index||(e?.hp??0)<hp0),victim,predicted,critical:Boolean(s.lastShot?.actual?.critical)};};
 /** The earlier acceptance's thumb (final-naval-browser aimShot): drag from Fire until the arc's end sits on the hull or meets it, lift. */
 const thumbShot=async(index,{ms=7000}={})=>{
  const F=await center('#shoot');let dx=0,dy=0,good=0,moves=0,s=await live(null);if(!s)return {fired:0,hit:false,victim:null,predicted:null,critical:false,aimSeconds:0,touches:0};const t0=s.time,e0=s.enemies.find(e=>e.index===index),hp0=e0?.hp??0,fired0=s.fired;
  await touch('touchStart',[{x:F.x,y:F.y,id:3}]);await tick(80);
  for(;;){const now=await snap().catch(()=>null);if(!now)break;s=now;const e=s.enemies.find(e=>e.index===index);if(!e||e.hp<=0||s.result)break;
   const P=s.playerShip,L=s.prediction?.landing,C=s.prediction?.contact;if(!L){await tick(50);continue;}
   const eb=wrap(Math.atan2(e.z-P.z,e.x-P.x)-Math.atan2(L.z-P.z,L.x-P.x))*DEG,er=Math.hypot(e.x-P.x,e.z-P.z)-Math.hypot(L.x-P.x,L.z-P.z);
   good=(C?.index===index||(Math.abs(eb)<.7&&Math.abs(er)<3))?good+1:0;if(good>=2||s.time-t0>ms/1000)break;
   if(Math.abs(eb)>2.4)dx=Math.sign(eb)*Math.min(78,26+Math.abs(eb)*.8);else dx=Math.max(-22,Math.min(22,Math.max(-22,Math.min(22,dx))+eb/.12));
   dy=Math.max(-170,Math.min(50,dy-Math.max(-14,Math.min(14,er*.35))));
   await touch('touchMove',[{x:F.x+dx,y:F.y+dy,id:3}]);moves++;await tick(50);}
  const aimSeconds=+((await live(s)).time-t0).toFixed(2);await touch('touchEnd',[]);await tick(60);
  return {...await settle(index,fired0,hp0),aimSeconds,touches:moves+2};};
 const lockShot=async index=>{let s=await live(null);if(!s)return {fired:0,hit:false,victim:null,predicted:null,critical:false,status:null,aimSeconds:null,touches:0};const t0=s.time,hp0=s.enemies.find(e=>e.index===index)?.hp??0,fired0=s.fired,status=s.homing?.status;await tapFire();const r=await settle(index,fired0,hp0);return {...r,status,aimSeconds:null,touches:2,tapToFire:null,t:+t0.toFixed(1)};};
 const stickPoint=async()=>{const z=await page.locator('.naval-stick-zone').boundingBox();return {x:z.x+z.width*.45,y:z.y+z.height*.6};};
 /** Left thumb: push the stick toward a model point (relative to the camera) until `near`; lift. */
 const sailTo=async(point,{near=8,ms=15000,radius=46,until=null}={})=>{
  const c=await stickPoint();let s=await snap();const t0=s.time;await touch('touchStart',[{...c,id:7}]);await tick(40);
  for(;;){s=await snap();const p=s.playerShip,d=Math.hypot(point.x-p.x,point.z-p.z);if(d<=near||s.time-t0>ms/1000||s.result||until?.(s))break;
   const rel=wrap(Math.atan2(point.z-p.z,point.x-p.x)-(s.camera?.heading||0)),k=Math.min(1,.4+d/50);
   await touch('touchMove',[{x:c.x+Math.sin(rel)*radius*k,y:c.y-Math.cos(rel)*radius*k,id:7}]);await tick(100);}
  await touch('touchEnd',[]);await tick(150);s=await snap();return {distance:+Math.hypot(point.x-s.playerShip.x,point.z-s.playerShip.z).toFixed(1),seconds:+(s.time-t0).toFixed(1)};};
 const pick=async ammoIndex=>{const target=page.locator(`[data-ammo-index="${ammoIndex}"]`);if(!await target.isVisible()&&await page.locator('.naval-weapon-picker').count()){await page.locator('.naval-weapon-picker').tap();await tick(200);}await target.tap();await tick(150);};
 const keepAfloat=async()=>{const s=await snap();if(s.lives<s.maxLives*.45&&s.ammo[5]>0){await pick(5);await tapFire();await tick(400);await pick(0);return true;}return false;};
 const waitLoaded=async()=>{let s=await snap();for(let t=0;t<12000&&s.loaded<=0&&!s.result;t+=250){await tick(250);s=await snap();}return s.loaded>0;};
 const summary=rows=>{const n=rows.length,hits=rows.filter(r=>r.hit).length,any=rows.filter(r=>r.victim!==null&&r.victim!=='player').length,aim=rows.filter(r=>Number.isFinite(r.aimSeconds));
  return {shots:n,hits,hitPercent:+(100*hits/Math.max(1,n)).toFixed(1),anyHullPercent:+(100*any/Math.max(1,n)).toFixed(1),criticals:rows.filter(r=>r.critical).length,meanAimSeconds:aim.length?+(aim.reduce((a,r)=>a+r.aimSeconds,0)/aim.length).toFixed(2):null,meanTouches:+(rows.reduce((a,r)=>a+r.touches,0)/Math.max(1,n)).toFixed(1),predictedMatches:rows.filter(r=>r.fired&&r.predicted===r.victim).length};};

 // (A) Lock, follow, hit, unlock (stage 3: one hull at a time, moving). Before: the same long press does nothing.
 if(want('a')){
  await ready(3);await capture('a0-start');let s=await snap();const target=s.enemies.find(e=>e.active&&e.hp>0);
  const lock=await longPress(target.index,650);report.lock={...lock};s=await snap();
  if(before){
   assert.equal(lock.homing,null,'v22: a long press does not lock');assert.equal(lock.fire,null,'v22: no data-lock on the controls');assert.ok(lock.progress.every(p=>p===0),'v22: no ring');assert.equal(s.hud?.lock,undefined,'v22: no lock HUD');
   await capture('a1-v22-long-press');
  }else{
   assert.equal(lock.homing,target.index,'the long press locked the hull');assert.ok(lock.progress.some(p=>p>0&&p<1),'the ring filled while the finger rested');
   await capture('a1-locked');
   // The turret follows the moving hull by itself: three seconds of real frames, no finger on the screen.
   const follow=[];let readyAt=null;const t0=s.time,b0=Math.atan2(target.z-s.playerShip.z,target.x-s.playerShip.x);
   for(let t=0;t<3000;t+=100){await tick(100);s=await snap();const h=s.homing,e=s.enemies.find(e=>e.index===target.index);if(!h)break;if(h.status==='ready'&&readyAt===null)readyAt=+(s.time-t0).toFixed(2);
    follow.push({t:+(s.time-t0).toFixed(1),status:h.status,errorDeg:+(Math.abs(wrap(h.solution.yaw-s.turret.yaw))*DEG).toFixed(3),turretDeg:+(s.turret.yaw*DEG).toFixed(2),bearingDeg:+(Math.atan2(e.z-s.playerShip.z,e.x-s.playerShip.x)*DEG).toFixed(2),fire:await page.evaluate(()=>document.querySelector('.game-controls')?.dataset.lock)});}
   const readyRows=follow.filter(r=>r.status==='ready'),span=k=>Math.max(...follow.map(r=>r[k]))-Math.min(...follow.map(r=>r[k])),turned=span('turretDeg'),bearingMoved=span('bearingDeg');void b0;
   report.follow={readyAfterSeconds:readyAt,maxErrorWhenReadyDeg:Math.max(...readyRows.map(r=>r.errorDeg)),turretSwingDeg:+turned.toFixed(2),hullBearingSwingDeg:+bearingMoved.toFixed(2),samples:follow};
   assert.ok(readyAt!==null&&readyAt<=1,`ready within a second (${readyAt})`);assert.ok(readyRows.length>=10&&report.follow.maxErrorWhenReadyDeg<=.6,`the turret stays on the solution (${report.follow.maxErrorWhenReadyDeg} deg)`);
   assert.ok(turned>.3,`the turret turned with the hull by itself (${turned.toFixed(2)} deg)`);assert.ok(readyRows.every(r=>r.fire==='ready'),'Fire shows ready');
   const shot=await lockShot(target.index);report.lockShot=shot;await capture('a2-hit');assert.equal(shot.fired,1,'one tap, one shell');assert.ok(shot.hit,'the tap hit the locked hull');
   s=await snap();if(s.homing){const un=await longPress(target.index,650,5);report.unlock=un;assert.equal(un.homing,null,'a second long press unlocks');assert.equal(un.fire,'none');await capture('a3-unlocked');}
  }
  await leave();
 }

 // (B) Accuracy. Moving hulls: stage 10 (four hulls, three at a time, about 14 units/s). Fixed: the shore base of stage 15 after sailing in.
 if(want('b')){
  /** Is another hull standing on the line from our ship to this one (what a child sees: a ship parked in front of the bunker)? */
  const clearLine=(s,e)=>{const P=s.playerShip,dx=e.x-P.x,dz=e.z-P.z,L2=dx*dx+dz*dz||1;
   return !s.enemies.some(o=>{if(o.index===e.index||!o.active||!(o.hp>0)||o.depth>0)return false;const u=((o.x-P.x)*dx+(o.z-P.z)*dz)/L2;if(u<.05||u>1.02)return false;return Math.hypot(o.x-(P.x+dx*u),o.z-(P.z+dz*u))<(o.hullScale||1)*30+6;});};
  const cell=async(label,stage,{fixed=false}={})=>{
   const rows=[],locks=[],avoid=new Map();let runs=0,skipped=0;
   const begin=async()=>{runs++;avoid.clear();await ready(stage);if(fixed){const sail=await sailTo({x:200,z:0},{near:10,ms:12000});(report.sails||(report.sails=[])).push(sail);}};
   await begin();
   for(let guard=0;rows.length<SHOTS&&guard<400;guard++){
    let s=await snap();if(!s||s.result){await leave();await begin();continue;}
    await keepAfloat();if(s.loaded<=0&&!(await waitLoaded())){await tick(300);continue;}
    s=await snap();
    // The same choice in both modes: a hull on screen with a clear line of fire first (main base targets first on the base), then the nearest.
    const pool=s.enemies.filter(e=>e.active&&e.hp>0&&(fixed?e.structure:!e.structure)&&!(e.depth>0));
    const scored=[];for(const e of pool){if((avoid.get(e.index)??-1)>s.time)continue;const q=await screenOf(e.index);if(visible(q))scored.push({e,d:Math.hypot(e.x-s.playerShip.x,e.z-s.playerShip.z),clear:clearLine(s,e)});}
    scored.sort((a,b)=>Number(!a.clear)-Number(!b.clear)||(fixed?Number(a.e.main===false)-Number(b.e.main===false):0)||a.d-b.d);const target=scored[0]?.e;
    if(!target){if(fixed&&!pool.length){await leave();await begin();continue;}avoid.clear();await tick(300);continue;}
    if(before){const r=await thumbShot(target.index);if(!r.fired)continue;rows.push({index:target.index,kind:target.structure||'ship',clear:scored[0].clear,...r});console.log('SHOT',label,rows.length,r.hit?'hit':'miss',r.aimSeconds);continue;}
    if(s.homing?.index!==target.index){const lp=await longPress(target.index,600,1);locks.push({index:target.index,locked:lp.homing===target.index,status:lp.status});if(lp.homing!==target.index){await tick(200);continue;}
     if(locks.length===1)await capture(fixed?'b-fixed-locked':'b-moving-locked');}
    // Wait for the turret (as a child waits for the green Fire), at most a second and a half.
    let waited=0;s=await snap();while(s.homing&&s.homing.status==='turning'&&waited<1500){await tick(100);waited+=100;s=await snap();}
    if(!s.homing)continue;
    // The lock says another hull is in the way (or the submarine is under water): a child picks another target, as the word asks.
    if(['blocked','dive'].includes(s.homing.status)&&scored.length>1){avoid.set(target.index,s.time+3);skipped++;continue;}
    const r=await lockShot(target.index);if(!r.fired)continue;rows.push({index:target.index,kind:target.structure||'ship',clear:scored[0].clear,waitedMs:waited,...r});console.log('SHOT',label,rows.length,r.hit?'hit':'miss',r.status);
   }
   const out={stage,runs,...summary(rows),clearLineShots:rows.filter(r=>r.clear).length,skippedBlockedLocks:skipped,locks:locks.length,locked:locks.filter(l=>l.locked).length,statuses:rows.reduce((a,r)=>{if(r.status)a[r.status]=(a[r.status]||0)+1;return a;},{}),rows};
   console.log('CELL',label,JSON.stringify({...out,rows:undefined}));await leave();return out;};
  report.moving=await cell('moving',10);
  report.fixed=await cell('fixed',15,{fixed:true});
  assert.ok(report.moving.shots>=SHOTS&&report.fixed.shots>=SHOTS,'enough shots per cell');
  if(!before){assert.ok(report.moving.hitPercent>=90,`locked shots at moving hulls hit (${report.moving.hitPercent}%)`);assert.ok(report.fixed.hitPercent>=80,`locked shots at the base hit (${report.fixed.hitPercent}%)`);}
 }

 // (C) A hull behind the bow (after only): the ship turns away from the fleet on the stick, the hull is locked, the turret swings round, the tap hits.
 if(want('c')&&!before){
  await ready(3);let s=await snap();const target=s.enemies.find(e=>e.active&&e.hp>0);
  // First the right thumb turns the turret away by hand (drag from Fire, hold, lift on the X: no shot), so the lock has to swing it back.
  const F=await center('#shoot');await touch('touchStart',[{x:F.x,y:F.y,id:4}]);await tick(80);await touch('touchMove',[{x:F.x-30,y:F.y,id:4}]);await tick(16);await touch('touchMove',[{x:F.x-60,y:F.y,id:4}]);await tick(900);
  const chip=await center('.naval-aim-cancel');await touch('touchMove',[{x:chip.x,y:chip.y,id:4}]);await tick(60);await touch('touchEnd',[]);await tick(300);s=await snap();assert.equal(s.fired,0,'the hand turn was cancelled, no shot');
  // Then the left thumb pushes the stick down and to the left (toward the camera): the ship turns its stern to the fleet and sails off.
  const c=await stickPoint();await touch('touchStart',[{...c,id:7}]);await tick(40);for(let t=0;t<1600;t+=100){await touch('touchMove',[{x:c.x-23,y:c.y+40,id:7}]);await tick(100);}await touch('touchEnd',[]);await tick(600);
  s=await snap();const e=s.enemies.find(x=>x.index===target.index),offBow=()=>Math.abs(wrap(Math.atan2(e.z-s.playerShip.z,e.x-s.playerShip.x)-s.playerShip.heading))*DEG;
  const behind={bowToHullDeg:+offBow().toFixed(1),turretOffBowBeforeDeg:+(Math.abs(wrap(s.turret.yaw-s.playerShip.heading))*DEG).toFixed(1),turretOffHullBeforeDeg:+(Math.abs(wrap(s.turret.yaw-Math.atan2(e.z-s.playerShip.z,e.x-s.playerShip.x)))*DEG).toFixed(1),distance:+Math.hypot(e.x-s.playerShip.x,e.z-s.playerShip.z).toFixed(0)};await capture('c0-sailed-away');
  const lock=await longPress(target.index,650);behind.locked=lock.homing===target.index;s=await snap();const t0=s.time;let readyAt=null;
  for(let t=0;t<2000&&s.homing?.status!=='ready';t+=100){await tick(100);s=await snap();}readyAt=s.homing?.status==='ready'?+(s.time-t0).toFixed(2):null;
  behind.readyAfterSeconds=readyAt;behind.turretOffBowDeg=+(Math.abs(wrap(s.turret.yaw-s.playerShip.heading))*DEG).toFixed(1);behind.bowToHullAtFireDeg=+(Math.abs(wrap(Math.atan2(e.z-s.playerShip.z,e.x-s.playerShip.x)-s.playerShip.heading))*DEG).toFixed(1);
  await capture('c1-behind-locked');const shot=await lockShot(target.index);behind.shot=shot;await capture('c2-behind-hit');report.behind=behind;console.log('BEHIND',JSON.stringify(behind));
  assert.ok(behind.turretOffHullBeforeDeg>=30,`the turret pointed away from the hull before the lock (${behind.turretOffHullBeforeDeg} deg)`);assert.ok(behind.locked,'the hull behind the bow locked');assert.ok(behind.bowToHullAtFireDeg>=120,`the hull is behind the bow (${behind.bowToHullAtFireDeg} deg)`);assert.ok(behind.turretOffBowDeg>=120,`the turret swung round (${behind.turretOffBowDeg} deg off the bow)`);
  assert.ok(readyAt!==null&&readyAt<=1.6,`ready after the swing (${readyAt} s)`);assert.equal(shot.fired,1);assert.ok(shot.hit,'hit behind the bow');
  await leave();
 }
 console.log('REPORT',JSON.stringify({...report,moving:report.moving&&{...report.moving,rows:undefined},fixed:report.fixed&&{...report.fixed,rows:undefined},follow:report.follow&&{...report.follow,samples:report.follow.samples.length}}));
 return report;
});
}catch(e){console.error(e.message);process.exitCode=e.exitCode||1;}
