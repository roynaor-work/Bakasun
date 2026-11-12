// Acceptance for the ships game through the island shell with real touch only (CDP Input.dispatchTouchEvent on the on-screen controls,
// 844x390, Chromium with hasTouch and isMobile) and real frames (Playwright's clock); the model is read like a child reads the screen, never driven.
// PART=1 (11/11/2026 round): the turret reaches at least 120 degrees to each side with a thumb drag that stays inside the screen, the turn is
// smooth, the landing mark stays visible or an edge arrow points at it, release fires once; on an air stage aircraft arrive, get their brackets,
// attack with a landing mark, and nothing fires by itself.
// PART=2 (12/11/2026, Roy's notes on v20): (A) ammo: the shell magazine runs out, a supply buoy appears, a ship that stays put gets it drifted
// to it and the next one is reached by sailing with the left thumb; (B) the Vulcan fires only while its button is held, the thumb puts the sky
// crosshair on the helicopter and brings it down, releasing stops it, the brackets sit outside the aircraft; (C) stage 5's shore base: the
// ship sails in, the right thumb aims by dragging from Fire and lifts to fire; a gun falls, the depot's blast damages its neighbours, the base
// bar counts down, the shore guns telegraph, the stage is not won while main targets stand, the render budget holds.
// PART=all (default) runs both. MODE=before applies the kill switches: with PART=1 or all `navalAim=v20` (fails on the yaw reach, exit 1);
// with PART=2 `navalAmmo=0&navalAirAim=auto&navalBase=0`: every scenario must fail (exit 1 and the list), exit 3 if one passes on the old code.
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const before=process.env.MODE==='before',PART=process.env.PART||'all',phase1=PART!=='2',phase2=PART!=='1';
const flag=before?(phase1?'&navalAim=v20':'&navalAmmo=0&navalAirAim=auto&navalBase=0'):'',prefix=before?(phase1?'naval-v20':'naval2-v20'):'naval-after';
const frames=new URL('../verification/final-fix-fable/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const DEG=180/Math.PI,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
try{
await verify(before?(phase1?'final-naval-before':'final-naval2-before'):(phase1?'final-naval':'final-naval2'),[{width:844,height:390,isMobile:true}],async({page,context,viewport,tick,snap,start,exit,assert})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await page.evaluate(flag=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;engine.state.minigameProgress.navalDuel.stage=30;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;history.replaceState(null,'',location.pathname+'?dev=1'+flag);},flag);
 const capture=name=>page.screenshot({path:new URL(`${prefix}-${name}.jpg`,frames).pathname,type:'jpeg',quality:82});
 const center=async selector=>{const b=await page.locator(selector).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2,box:b};};
 const landing=()=>page.evaluate(()=>{const s=window.__island.games.current.session,p=s.snapshot.prediction,at=p?.contact||p?.landing;return at?{q:s.debug?.view?.projectTarget?.(at.x,at.z,0)||null,arrow:s.snapshot.hud?.landingArrow||null}:null;});
 const onScreen=q=>q&&q.depth>0&&q.x>=0&&q.x<=viewport.width&&q.y>=0&&q.y<=viewport.height;
 const report={mode:before?`before (${flag.slice(1)})`:'after',part:PART,search:await page.evaluate(()=>location.search),drags:[]};
 /** Hold on the Fire control, drag by (dx,dy) in 8 px steps, hold for `holdMs`, sampling the yaw every 50 ms; cancel (no shot) unless `fire`. */
 const drag=async(label,from,dx,dy,holdMs,{fire=false,shot=null,back=false}={})=>{
  await touch('touchStart',[from]);await tick(120);const s0=await snap();const steps=Math.max(1,Math.round(Math.hypot(dx,dy)/8)),samples=[];
  for(let i=1;i<=steps;i++){await touch('touchMove',[{x:from.x+dx*i/steps,y:from.y+dy*i/steps}]);await tick(16);samples.push((await snap()).turret.yaw);}
  let seen=0,offscreen=0,arrows=0;for(let t=0;t<holdMs;t+=50){await tick(50);const s=await snap();samples.push(s.turret.yaw);const l=await landing();if(l){seen++;if(!onScreen(l.q)){offscreen++;if(l.arrow)arrows++;}}}
  const s=await snap(),total=samples.reduce((acc,y,i)=>i?acc+wrap(y-samples[i-1]):0,0);let jump=0;for(let i=1;i<samples.length;i++)jump=Math.max(jump,Math.abs(wrap(samples[i]-samples[i-1])));
  if(shot)await capture(shot);
  let stop=null;if(back){await touch('touchMove',[from]);await tick(60);const y1=(await snap()).turret.yaw;await tick(500);stop=Math.abs(wrap((await snap()).turret.yaw-y1))*DEG;}
  let fired=null;if(fire){const f0=s.fired;await touch('touchEnd');await tick(60);fired=(await snap()).fired-f0;await tick(1200);}else{await touch('touchCancel');await tick(300);}
  const row={label,from:{x:Math.round(from.x),y:Math.round(from.y)},dx,dy,holdMs,yawDeg:+(total*DEG).toFixed(1),endDeg:+(wrap(s.turret.yaw-s0.turret.yaw)*DEG).toFixed(1),maxStepDeg:+(jump*DEG).toFixed(2),samples:samples.length,landingSeen:seen,landingOffscreen:offscreen,arrowWhenOffscreen:arrows,aiming:s.aiming,stopDriftDeg:stop,fired};
  report.drags.push(row);console.log('DRAG',JSON.stringify(row));return row;};
 if(phase1){
  for(const stage of [3,10]){
   await start('navalDuel',stage);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(500);
   const fire=await center('#shoot');report['fireBox'+stage]=fire.box;const edge=viewport.width-4-fire.x;
   const right=await drag(`s${stage} fire right to edge ${Math.round(edge)}px, hold 1.5s`,fire,edge,0,1500,{shot:`s${stage}-right-edge`,back:true});
   const left=await drag(`s${stage} fire left 100px, hold 1.5s`,fire,-100,0,1500,{shot:`s${stage}-left-100`,fire:true});
   // The fine and vertical drags do not depend on the stage: once, on stage 3 (SwiftShader renders every sampled frame, so the run stays short).
   const fine=stage===3?await drag(`s${stage} fire right 15px (fine), hold 1s`,fire,15,0,1000):null;
   const up=stage===3?await drag(`s${stage} fire up 90px (reach), hold .5s`,fire,0,-90,500):null;
   // Reach: at least 120 degrees to each side from the Fire button inside the screen; smooth (no step above 12 degrees in 50 ms); feedback kept.
   assert.ok(right.yawDeg>=120,`turn right from the Fire button reaches 120 degrees (got ${right.yawDeg})`);
   assert.ok(left.yawDeg<=-120,`turn left reaches 120 degrees (got ${left.yawDeg})`);
   for(const row of [right,left])assert.ok(row.maxStepDeg<=12,`smooth turn: largest step ${row.maxStepDeg} deg per sample`);
   if(fine)assert.ok(Math.abs(fine.yawDeg)<=4&&Math.abs(fine.yawDeg)>=.8,`a small drag is a fine aim (${fine.yawDeg} deg)`);
   if(up)assert.equal(Math.abs(up.yawDeg)<1,true,'a vertical drag does not turn the turret');
   assert.ok(right.stopDriftDeg<1,`bringing the thumb back stops the turn (drift ${right.stopDriftDeg} deg in .5 s)`);
   for(const row of [right,left])assert.ok(row.landingOffscreen===0||row.arrowWhenOffscreen===row.landingOffscreen,`landing mark visible or an edge arrow (${row.landingOffscreen} off, ${row.arrowWhenOffscreen} arrows)`);
   assert.equal(left.fired,1,'release fires once');
   await exit();await tick(300);
  }
  // Air stage (real frames): stage 3 names helicopters and planes; the first one is brought forward in the stage data so the run stays short.
  // The player sits still; aircraft arrive, get their brackets and attack with a landing mark, and nothing fires by itself (the on-screen
  // controls declare the manual Vulcan). Shooting them down by touch is phase 2 (B).
  await page.evaluate(()=>{const l=window.__island.data.config.minigames.navalDuel.levels[2];l.air={...l.air,from:2,every:22};});
  await start('navalDuel',3);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);
  // One tap on the sea (a target pick, no shot) unlocks the audio contexts the way a finger would.
  await touch('touchStart',[{x:300,y:150}]);await tick(40);await touch('touchEnd');await tick(200);
  const air={aircraftSeen:0,tracersSeen:0,hudTarget:0,peakDrawCalls:0,peakTriangles:0,kills:0,shots:0,hits:0,splashes:0,frames:[]};let framed=false;
  for(let t=0;t<20000&&!(framed&&air.marks>0);t+=250){await tick(250);const s=await snap();const v=s.vulcan||{},m=s.renderMetrics;air.aircraftSeen=Math.max(air.aircraftSeen,s.air?.length||0);air.tracersSeen=Math.max(air.tracersSeen,m.air?.tracers||0);air.peakDrawCalls=Math.max(air.peakDrawCalls,m.peak?.drawCalls||m.drawCalls||0);air.peakTriangles=Math.max(air.peakTriangles,m.peak?.triangles||m.triangles||0);air.kills=v.kills||0;air.shots=v.shots||0;air.hits=v.hits||0;air.splashes=v.splashes||0;if(s.hud?.air?.aircraft>0)air.hudTarget++;air.marks=(air.marks||0)+(s.hud?.marks||0);
   if(!framed&&s.hud?.air?.aircraft>0&&!s.hud.air.arrows){framed=true;await capture('s3-air-arrives');air.frames.push('s3-air-arrives');}
   if(s.result)break;}
  air.gameSeconds=+(await snap()).time.toFixed(1);
  report.air=air;report.airAudio=await page.evaluate(()=>window.__island.games.current.session.debug?.airAudio?.metrics?.()||null);report.sounds=await page.evaluate(()=>{const log=window.__island.games.current.session.debug?.sounds||[];const c={};for(const e of log)c[e.name]=(c[e.name]||0)+1;return c;});
  console.log('AIR',JSON.stringify(air),JSON.stringify(report.sounds),JSON.stringify(report.airAudio));
  assert.ok(air.aircraftSeen>=1,'aircraft appear on stage 3');assert.ok(air.hudTarget>0,'the HUD brackets the aircraft');assert.equal(air.shots,0,'the Vulcan never fires by itself (manual)');assert.ok(air.marks>0,'the attack is telegraphed by a landing mark');
  assert.ok(air.peakDrawCalls<=70&&air.peakTriangles<=90000,`render budget with aircraft (${air.peakDrawCalls} calls, ${air.peakTriangles} triangles)`);
  assert.ok(report.airAudio&&report.airAudio.loaded.length===3,`the three Vulcan samples decode (${JSON.stringify(report.airAudio)})`);
  await exit();await tick(300);
 }
 if(phase2){
  // ---- 11/11/2026 phase 2 (Roy, phone). Every input is touch on the real controls and every step is real frames; the model is only read
  // (the way a child reads the arc, the mark and the gauges), never driven. ----
  const reproduced=[],passedOld=[];
  const scenario=async(name,fn)=>{
   try{await fn();if(before)passedOld.push(name);}
   catch(e){if(!before)throw e;const message=String(e.message).split('\n')[0];reproduced.push({name,message});console.log('OLD',name,message);try{if(await page.locator('.game-screen').count())await exit();await tick(300);}catch{}}
  };
  const budget=async label=>{const p=(await snap()).renderMetrics.peak;assert.ok(p.drawCalls<=70&&p.triangles<=90000,`${label} render budget (${p.drawCalls} calls, ${p.triangles} triangles)`);return p;};
  const stickPoint=async()=>{const z=await page.locator('.naval-stick-zone').boundingBox();return {x:z.x+z.width*.45,y:z.y+z.height*.6};};
  /** Left thumb: push the stick toward a model point (the stick is relative to the camera) until `near` or `until(s)`; lift. */
  const sailTo=async(point,{near=8,ms=15000,radius=46,until=null}={})=>{
   const c=await stickPoint();let s=await snap();const t0=s.time,path=[];await touch('touchStart',[{...c,id:7}]);await tick(40);
   for(;;){s=await snap();const p=s.playerShip,d=Math.hypot(point.x-p.x,point.z-p.z);if(path.length%4===0)path.push([+s.time.toFixed(1),+p.x.toFixed(1),+p.z.toFixed(1)]);
    if(d<=near||s.time-t0>ms/1000||s.result||until?.(s))break;
    const rel=wrap(Math.atan2(point.z-p.z,point.x-p.x)-(s.camera?.heading||0)),k=Math.min(1,.4+d/50);
    await touch('touchMove',[{x:c.x+Math.sin(rel)*radius*k,y:c.y-Math.cos(rel)*radius*k,id:7}]);await tick(100);}
   await touch('touchEnd');await tick(150);s=await snap();
   return {distance:+Math.hypot(point.x-s.playerShip.x,point.z-s.playerShip.z).toFixed(1),seconds:+(s.time-t0).toFixed(1),path};};
  /** Right thumb on Fire: drag (sideways = fine turn, then the held turn past 22 px; up = farther) until the arc's landing point sits on the
   * target or the arc meets its hull, then lift: one shot. Waits for the shell and reports the target's hull before and after. */
  const aimShot=async(index,{ms=7000}={})=>{
   const F=await center('#shoot');let dx=0,dy=0,good=0,steps=0,last=null,s=await snap();const t0=s.time,e0=s.enemies.find(e=>e.index===index),hp0=e0?.hp??0;
   await touch('touchStart',[{x:F.x,y:F.y,id:3}]);await tick(80);
   for(;;){s=await snap();steps++;const e=s.enemies.find(e=>e.index===index);if(!e||e.hp<=0||s.result)break;
    const P=s.playerShip,L=s.prediction?.landing,C=s.prediction?.contact;if(!L){await tick(50);continue;}
    const eb=wrap(Math.atan2(e.z-P.z,e.x-P.x)-Math.atan2(L.z-P.z,L.x-P.x))*DEG,er=Math.hypot(e.x-P.x,e.z-P.z)-Math.hypot(L.x-P.x,L.z-P.z);
    last={eb:+eb.toFixed(2),er:+er.toFixed(1),contact:C?.index??null};good=(C?.index===index||(Math.abs(eb)<.7&&Math.abs(er)<3))?good+1:0;
    if(good>=2||s.time-t0>ms/1000)break;
    if(Math.abs(eb)>2.4)dx=Math.sign(eb)*Math.min(78,26+Math.abs(eb)*.8);else dx=Math.max(-22,Math.min(22,Math.max(-22,Math.min(22,dx))+eb/.12));
    dy=Math.max(-170,Math.min(50,dy-Math.max(-14,Math.min(14,er*.35))));
    await touch('touchMove',[{x:F.x+dx,y:F.y+dy,id:3}]);await tick(50);}
   const fired0=s.fired;await touch('touchEnd');await tick(60);s=await snap();const fired=s.fired-fired0;
   for(let t=0;t<3500&&s.ball?.active;t+=100){await tick(100);s=await snap();}await tick(200);s=await snap();
   const e1=s.enemies.find(e=>e.index===index),hp1=e1?.hp??0;
   return {index,structure:e0?.structure||null,aimed:good>=2,steps,seconds:+(s.time-t0).toFixed(1),fired,hp0:+hp0.toFixed(2),hp1:+hp1.toFixed(2),hit:hp1<hp0,last};};
  /** Weapon picker by touch (the same buttons a child taps). */
  const pick=async ammoIndex=>{const target=page.locator(`[data-ammo-index="${ammoIndex}"]`);if(!await target.isVisible()&&await page.locator('.naval-weapon-picker').count()){await page.locator('.naval-weapon-picker').tap();await tick(200);}await target.tap();await tick(150);};
  const ready=async stage=>{await start('navalDuel',stage);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);};

  // (A) Ammo limit, stage 1: quick taps on Fire spend the loaded shells (the turret first swung away from the fleet with a cancelled drag,
  // so the taps do not end the stage); at 3 a supply buoy appears (gauge orange), at 0 the message (red) and Fire is dead; a ship that
  // stays put gets the buoy drifted to it; the next buoy is reached by sailing into it with the left thumb.
  await scenario('ammo',async()=>{
   await ready(1);
   const fire1=await center('#shoot');let s=await snap();const ammo={magazine:s.magazines?.ammo?.[0]??null,loadedStart:s.loaded,stock:s.ammo?.[0],gauge:s.hud?.ammo||null,taps:0};
   assert.ok(ammo.magazine>0&&ammo.loadedStart===ammo.magazine,'a shell magazine is loaded at the start');assert.ok(ammo.gauge&&ammo.gauge.level==='ok','the ammo gauge is drawn');
   // Swing the turret toward empty sea and lift over the cancel chip (no shot).
   await touch('touchStart',[{x:fire1.x,y:fire1.y,id:4}]);await tick(80);await touch('touchMove',[{x:fire1.x-30,y:fire1.y,id:4}]);await tick(16);await touch('touchMove',[{x:fire1.x-60,y:fire1.y,id:4}]);await tick(900);
   const chip=await page.locator('.naval-aim-cancel').boundingBox();await touch('touchMove',[{x:chip.x+chip.width/2,y:chip.y+chip.height/2,id:4}]);await tick(60);await touch('touchEnd');await tick(300);
   s=await snap();ammo.turnedAway={yawDeg:+(s.turret.yaw*DEG).toFixed(1),fired:s.fired};assert.equal(s.fired,0,'lifting over the cancel chip does not fire');
   const tapFire=async()=>{await touch('touchStart',[fire1]);await tick(60);await touch('touchEnd');await tick(420);ammo.taps++;};
   for(let i=0;i<30&&(await snap()).loaded>3;i++)await tapFire();await tick(100);s=await snap();
   ammo.atLow={loaded:s.loaded,level:s.hud?.ammo?.level,buoys:s.buoys?.length,dataset:await page.evaluate(()=>document.querySelector('.game-controls')?.dataset.ammoLevel)};await capture('ammo-low');
   assert.equal(s.loaded,3);assert.equal(ammo.atLow.level,'low');assert.equal(s.buoys.length,1,'a buoy appears at the low mark');assert.equal(ammo.atLow.dataset,'low');
   for(let i=0;i<10&&(await snap()).loaded>0;i++)await tapFire();await tick(100);s=await snap();
   ammo.atEmpty={loaded:s.loaded,level:s.hud?.ammo?.level,message:s.hud?.ammo?.message,fired:s.fired,stock:s.ammo[0]};await capture('ammo-empty');
   assert.equal(s.loaded,0);assert.equal(ammo.atEmpty.message,'נגמרה התחמושת, אוספים אספקה');const firedEmpty=s.fired;await tapFire();assert.equal((await snap()).fired,firedEmpty,'nothing loaded, the tap does not fire');
   let overlap=0,labelled=0;for(let t=0;t<12000&&(await snap()).supplies<1;t+=250){await tick(250);const h=(await snap()).hud?.ammo;if(h?.buoyLabel&&h?.messageBox){labelled++;const a=h.buoyLabel,b=h.messageBox;if(a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h)overlap++;}}s=await snap();
   ammo.labelFrames={labelled,overlap};assert.ok(labelled>0,'the drifting buoy is labelled on screen while the message shows');assert.equal(overlap,0,'the buoy label never hides under the empty message');
   ammo.afterDrift={loaded:s.loaded,supplies:s.supplies,level:s.hud?.ammo?.level,seconds:+s.time.toFixed(1)};await capture('ammo-refill');
   assert.equal(s.supplies,1,'the buoy reached the stranded ship');assert.ok(s.loaded>0&&s.hud?.ammo?.level!=='empty','reloaded from the stock');
   for(let i=0;i<30&&(await snap()).loaded>3;i++)await tapFire();await tick(100);s=await snap();
   assert.equal(s.buoys.length,1,'the next buoy appears at the low mark');const buoy={...s.buoys[0]},loadedBefore=s.loaded;
   const sail=await sailTo(buoy,{near:4,ms:12000,until:x=>x.supplies>=2});s=await snap();
   ammo.sailed={...sail,from:{x:+buoy.x.toFixed(1),z:+buoy.z.toFixed(1)},supplies:s.supplies,loaded:s.loaded,drifted:Boolean(s.buoys?.[0]?.drifting)};await capture('ammo-sail-refill');
   assert.equal(s.supplies,2,'sailing into the buoy reloads');assert.equal(s.loaded,ammo.magazine,`a full magazine after the buoy (${loadedBefore} → ${s.loaded})`);
   ammo.peak=await budget('ammo stage');report.ammo=ammo;console.log('AMMO',JSON.stringify(ammo));await exit();await tick(300);
  });

  // (B) Manual Vulcan, stage 3: real frames until the helicopter is in range; nothing fires by itself; the Vulcan button is on screen; the
  // brackets sit outside the aircraft; holding the button and dragging puts the crosshair on it, the gun fires and brings it down; releasing stops it.
  await scenario('vulcan',async()=>{
   await page.evaluate(()=>{const l=window.__island.data.config.minigames.navalDuel.levels[2];l.air={...l.air,from:2,every:22};});
   await ready(3);await touch('touchStart',[{x:300,y:150}]);await tick(40);await touch('touchEnd');await tick(200);
   let s,inRange=0;for(let t=0;t<20000&&inRange<10;t+=100){await tick(100);s=await snap();if(s.air?.some(a=>a.state!=='down'&&Math.hypot(a.x-s.playerShip.x,a.z-s.playerShip.z)<=135))inRange++;}
   s=await snap();const sky={inRangeFrames:inRange,seconds:+s.time.toFixed(1),shotsBeforeHold:s.vulcan?.shots??null,button:await page.locator('.naval-vulcan').isVisible(),manual:s.vulcan?.manual??null};
   // The projected half wingspan of an aircraft (the HUD sizes its brackets from it).
   const wingPx=a=>page.evaluate(a=>{const s=window.__island.games.current.session,b=window.__island.data.config.minigames.navalDuel,p=(x,z,y)=>s.debug.view.projectTarget(x,z,y),h=Math.max(0,a.h)*.32,q=p(a.x,a.z,h),w=p(a.x,a.z+4.3*b.combat.laneSpacing/b.render.enemySpacing,h);return q&&w?+Math.hypot(w.x-q.x,w.y-q.y).toFixed(1):null;},a);
   await capture('vulcan-button');
   assert.ok(inRange>=10,'an aircraft stayed in gun range for a second of game time');assert.equal(sky.shotsBeforeHold,0,'no Vulcan shot without the button');assert.equal(sky.button,true,'the Vulcan button is on screen');
   const vb=await center('.naval-vulcan');await touch('touchStart',[{x:vb.x,y:vb.y,id:5}]);await tick(60);s=await snap();assert.ok(s.sky?.held,'holding the button opens the sky crosshair');
   const K=await page.evaluate(()=>{const b=window.__island.data.config.minigames.navalDuel;return {ws:b.render.worldScale,sp:b.render.enemySpacing/b.combat.laneSpacing};});
   const angles=(p,a)=>({yaw:Math.atan2(a.z-p.z,a.x-p.x),pitch:Math.atan2(Math.max(0,a.h)*.32,Math.max(.01,Math.hypot((a.x-p.x)*K.ws,(a.z-p.z)*K.sp)))});
   let dx=0,dy=0,onTargetFrames=0,firstOn=null;const trace=[];
   for(let i=0;i<200;i++){const a=s.air?.find(a=>a.state!=='down');if(!a)break;const want=angles(s.playerShip,a),yawErr=wrap(want.yaw-s.sky.yaw)*DEG,pitchErr=(want.pitch-s.sky.pitch)*DEG;
    // A thumb: past 2.4 degrees the held turn (beyond the 22 px band), then the fine zone pixel for pixel; up and down is the pitch.
    if(Math.abs(yawErr)>2.4)dx=Math.sign(yawErr)*Math.min(78,26+Math.abs(yawErr)*.8);else dx=Math.max(-22,Math.min(22,Math.max(-22,Math.min(22,dx))+yawErr/.12));
    dy=Math.max(-150,Math.min(60,dy-pitchErr/.16));
    await touch('touchMove',[{x:vb.x+dx,y:vb.y+dy,id:5}]);await tick(50);s=await snap();
    if(s.vulcan.onTarget){onTargetFrames++;firstOn??=s.time;if(!sky.brackets&&s.hud?.air?.target){sky.brackets=s.hud.air.target;sky.wingPx=await wingPx(s.air.find(x=>x.id===a.id)||a);}}if(i%10===0)trace.push({t:+s.time.toFixed(2),yawErr:+yawErr.toFixed(1),pitchErr:+pitchErr.toFixed(1),on:s.vulcan.onTarget,shots:s.vulcan.shots,hits:s.vulcan.hits});
    if(onTargetFrames===4)await capture('vulcan-aim');if(s.vulcan.kills>0)break;}
   s=await snap();Object.assign(sky,{onTargetFrames,shotsHeld:s.vulcan.shots,hits:s.vulcan.hits,kills:s.vulcan.kills,belt:s.belt,secondsToDown:s.vulcan.kills?+(s.time-firstOn).toFixed(1):null,crosshair:s.hud?.sky||null,trace});
   if(s.vulcan.kills)await capture('vulcan-down');
   await touch('touchEnd');await tick(60);const shotsAtRelease=(await snap()).vulcan.shots;await tick(600);s=await snap();sky.shotsAfterRelease=s.vulcan.shots-shotsAtRelease;sky.heldAfter=Boolean(s.sky);
   // The falling helicopter meets the water within about 2 s of game time (real frames).
   for(let t=0;t<4000&&!(s.vulcan.splashes>0);t+=250){await tick(250);s=await snap();}
   sky.splashes=s.vulcan.splashes;sky.sounds=await page.evaluate(()=>{const log=window.__island.games.current.session.debug?.sounds||[];const c={};for(const e of log)c[e.name]=(c[e.name]||0)+1;return c;});
   report.sky=sky;console.log('SKY',JSON.stringify(sky));
   assert.ok(sky.onTargetFrames>0,'the crosshair reached the helicopter');assert.ok(sky.brackets&&sky.brackets.half>=20&&sky.wingPx>0&&sky.brackets.half>=sky.wingPx,`brackets outside the aircraft (half ${sky.brackets?.half}, wing ${sky.wingPx} px)`);assert.ok(sky.shotsHeld>0&&sky.hits>0,'held on target: shots and hits');assert.equal(sky.kills,1,'the helicopter is shot down');
   assert.equal(sky.shotsAfterRelease,0,'releasing the button stops the gun');assert.equal(sky.heldAfter,false);assert.ok((sky.sounds.vulcanStart||0)>=1&&(sky.sounds.vulcanStop||0)>=1&&(sky.sounds.splash||0)>=1,'Vulcan start/stop and the splash were requested');
   sky.peak=await budget('vulcan stage');await exit();await tick(300);
  });

  // (C) Enemy base, stage 5: the ship sails in with the left thumb until the base is within reach, the right thumb aims and fires at a shore
  // gun until it falls, then at the depot (its blast damages the structures around it); the base bar counts down; the shore guns telegraph;
  // the stage is not won while main targets stand; the repair kit is used by touch if the hull runs low; the render budget holds.
  await scenario('base',async()=>{
   await ready(5);let s=await snap();
   const base={variant:s.baseHealth?.variant??null,start:s.baseHealth,hud:s.hud?.base||null,structures:s.renderMetrics?.structures,plate:s.renderMetrics?.base,mission:s.mission&&{base:s.mission.base,fleet:s.mission.fleet},shots:[],telegraphs:0,repairs:0};
   await capture('base-after');
   base.water=s.renderMetrics?.environment?.water;
   assert.ok(s.baseHealth&&s.baseHealth.total>=3,'a base with main targets');assert.ok(base.structures>=4,'structures are drawn');assert.ok(base.hud&&base.hud.left===base.hud.total,'the base bar is on the HUD');assert.equal(base.water,'light','the base stage draws the light sea (render budget)');
   // Firing spots chosen by eye: south of the line to the first gun, then north so the flagship does not stand between the ship and the depot.
   const spot={gun:{x:185,z:-20},depot:{x:200,z:55}};base.sail=await sailTo(spot.gun,{near:10,ms:12000});
   const watch=async()=>{const x=await snap();if(x.enemies.some(e=>e.structure&&e.attack))base.telegraphs++;return x;};
   const keepAfloat=async()=>{const x=await snap();if(x.lives<x.maxLives*.4&&x.ammo[5]>0){await pick(5);const f=await center('#shoot');await touch('touchStart',[f]);await tick(60);await touch('touchEnd');await tick(500);await pick(0);base.repairs++;}};
   const targetOf=kind=>s.enemies.find(e=>e.structure===kind&&e.hp>0&&e.main!==false);
   // One shore gun, then the depot (fleet ships that cross the arc take the hit instead, as they would for a child).
   for(const kind of ['gun','depot']){let tries=0;if(kind==='depot')base.sailDepot=await sailTo(spot.depot,{near:10,ms:12000});for(;;){s=await watch();const t=targetOf(kind);if(!t||s.result||tries>=12)break;
    if(s.loaded<=0){const b=s.buoys?.[0];if(b)await sailTo(b,{near:4,ms:8000,until:x=>x.loaded>0});else await tick(500);await sailTo(spot[kind],{near:10,ms:8000});continue;}
    if(kind==='depot'&&tries===0)base.beforeDepot=s.enemies.filter(e=>e.structure&&e.hp>0).map(e=>({index:e.index,s:e.structure,hp:+e.hp.toFixed(2)}));
    const shot=await aimShot(t.index);base.shots.push(shot);tries++;await keepAfloat();
    s=await snap();if(!s.enemies.find(e=>e.index===t.index&&e.hp>0)){await capture(kind==='gun'?'base-gun-down':'base-depot-chain');break;}}}
   s=await snap();base.end={baseHealth:s.baseHealth,hud:s.hud?.base,chainBlast:s.chainBlast,mission:s.mission&&{complete:s.mission.complete,base:s.mission.base,fleet:s.mission.fleet},result:s.result?.outcome||null,lives:s.lives,maxLives:s.maxLives,time:+s.time.toFixed(1)};
   if(base.beforeDepot)base.afterDepot=s.enemies.filter(e=>e.structure).map(e=>({index:e.index,s:e.structure,hp:+e.hp.toFixed(2)}));
   const hits=base.shots.filter(x=>x.hit).length,guns=s.enemies.filter(e=>e.structure==='gun'),gunsDown=guns.filter(e=>e.hp<=0).length,depot=s.enemies.find(e=>e.structure==='depot');
   Object.assign(base,{hits,gunsDown,depotDown:Boolean(depot&&depot.hp<=0)});
   base.peak=await budget('base stage');report.base=base;console.log('BASE',JSON.stringify(base));
   assert.ok(base.sail.distance<=12,'the ship sailed in on the stick');assert.ok(hits>=3,`shells aimed by touch hit the base (${hits} of ${base.shots.length})`);
   assert.ok(gunsDown>=1,'a shore gun is destroyed');assert.ok(s.baseHealth.left<s.baseHealth.total&&s.hud?.base?.left===s.baseHealth.left,'the base bar counts down');
   assert.ok(base.depotDown&&s.chainBlast,'the depot exploded');
   const neighbour=base.beforeDepot?.filter(b=>b.s!=='depot').some(b=>{const a=base.afterDepot.find(x=>x.index===b.index);return a&&a.hp<b.hp;});assert.ok(neighbour,'the depot blast damaged a neighbouring structure');
   assert.ok(base.telegraphs>0,'the shore guns telegraph before they fire');
   assert.ok(!s.result||s.result.outcome!=='win'||s.baseHealth.left===0,'no win while main targets of the base stand');
   if(s.baseHealth.left>0)assert.equal(s.mission.complete,false,'the mission is not complete while the base stands');
   await exit();
  });
  // (D) Render budget on the bigger bases (stages 15 and 25): quick shots and their impacts over a few seconds of real frames; the base stages
  // draw the light sea (no reflection pass) and stay within 70 calls and 90,000 triangles. A budget guard, not an old-code check.
  if(!before)for(const stage of [15,25]){
   await ready(stage);const f=await center('#shoot');let s=await snap();const row={stage,water:s.renderMetrics?.environment?.water,structures:s.renderMetrics?.structures};
   for(let i=0;i<6;i++){await touch('touchStart',[f]);await tick(60);await touch('touchEnd');await tick(640);}await tick(1500);s=await snap();
   Object.assign(row,{fired:s.fired,peak:s.renderMetrics.peak,captures:s.renderMetrics.environment?.reflectionCaptures});(report.budget||(report.budget=[])).push(row);console.log('BUDGET',JSON.stringify(row));
   assert.equal(row.water,'light',`stage ${stage} draws the light sea`);assert.ok(row.structures>=6,`stage ${stage} base drawn`);assert.ok(row.fired>=4,'quick shots fired');
   await budget(`stage ${stage}`);await exit();await tick(300);}
  if(before){report.reproduced=reproduced;report.passedOnOldCode=passedOld;console.log('BEFORE2',JSON.stringify({reproduced,passedOld}));
   if(passedOld.length){const e=new Error(`PART=2 before: these scenarios passed on the old code (the test cannot see the change): ${passedOld.join(', ')}`);e.exitCode=3;throw e;}
   const e=new Error(`PART=2 before: the old code fails every scenario, as required: ${reproduced.map(r=>`${r.name} (${r.message})`).join('; ')}`);e.exitCode=1;throw e;}
 }
 return report;
});
}catch(e){console.error(e.message);process.exitCode=e.exitCode||1;}
