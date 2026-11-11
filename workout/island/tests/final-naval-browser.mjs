// 11/11/2026 acceptance for the ships game through the island shell with real touch (CDP Input.dispatchTouchEvent on the
// on-screen Fire control, 844x390): the turret reaches at least 120 degrees to each side with a thumb drag that stays inside
// the screen, the turn is smooth, the landing mark stays visible or an edge arrow points at it, release fires once; and on an
// air stage aircraft appear, the Vulcan fires tracers and brings one down. MODE=before applies the kill switches
// (`navalAim=v20`) so the v20 code is measured: it fails on the yaw reach. Exits non-zero on failure.
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const before=process.env.MODE==='before',flag=before?'&navalAim=v20':'',prefix=before?'naval-v20':'naval-after';
const frames=new URL('../verification/final-fix-fable/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const DEG=180/Math.PI,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
await verify('final-naval',[{width:844,height:390}],async({page,context,viewport,tick,snap,start,exit,assert})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await page.evaluate(flag=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;engine.state.minigameProgress.navalDuel.stage=30;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;history.replaceState(null,'',location.pathname+'?dev=1'+flag);},flag);
 const capture=name=>page.screenshot({path:new URL(`${prefix}-${name}.jpg`,frames).pathname,type:'jpeg',quality:82});
 const center=async selector=>{const b=await page.locator(selector).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2,box:b};};
 const landing=()=>page.evaluate(()=>{const s=window.__island.games.current.session,p=s.snapshot.prediction,at=p?.contact||p?.landing;return at?{q:s.debug?.view?.projectTarget?.(at.x,at.z,0)||null,arrow:s.snapshot.hud?.landingArrow||null}:null;});
 const onScreen=q=>q&&q.depth>0&&q.x>=0&&q.x<=viewport.width&&q.y>=0&&q.y<=viewport.height;
 const report={mode:before?'before (navalAim=v20)':'after',search:await page.evaluate(()=>location.search),drags:[]};
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
 // Air stage: stage 3 names helicopters and planes; bring the first one forward so the run stays short. The player sits still (the ship still sails on the stick).
 await page.evaluate(()=>{const l=window.__island.data.config.minigames.navalDuel.levels[2];l.air={...l.air,from:2,every:22};});
 await start('navalDuel',3);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);
 // One tap on the sea (a target pick, no shot) unlocks the audio contexts the way a finger would.
 await touch('touchStart',[{x:300,y:150}]);await tick(40);await touch('touchEnd');await tick(200);
 const air={aircraftSeen:0,tracersSeen:0,hudTarget:0,peakDrawCalls:0,peakTriangles:0,kills:0,shots:0,hits:0,splashes:0,frames:[]};let framed=false,killed=false;
 // The model advances half a second per step through the session's own update (no input), then one real frame is rendered and read: 45 s of game time in about 90 frames.
 const advance=()=>page.evaluate(()=>{const s=window.__island.games.current.session;for(let i=0;i<25;i++)s.debug.drive(.02,{});});
 for(let t=0;t<45000&&!(killed&&framed&&air.splashes>0);t+=500){await advance();await tick(50);const s=await snap();const v=s.vulcan||{},m=s.renderMetrics;air.aircraftSeen=Math.max(air.aircraftSeen,s.air?.length||0);air.tracersSeen=Math.max(air.tracersSeen,m.air?.tracers||0);air.peakDrawCalls=Math.max(air.peakDrawCalls,m.drawCalls||0);air.peakTriangles=Math.max(air.peakTriangles,m.triangles||0);air.kills=v.kills||0;air.shots=v.shots||0;air.hits=v.hits||0;air.splashes=v.splashes||0;if(s.hud?.air?.target)air.hudTarget++;
  if(!framed&&m.air?.tracers>0&&s.hud?.air?.target){framed=true;await capture('s3-air-vulcan');air.frames.push('s3-air-vulcan');}
  if(!killed&&v.kills>0){killed=true;await tick(250);await capture('s3-air-down');air.frames.push('s3-air-down');}
  if(s.result)break;}
 report.air=air;report.airAudio=await page.evaluate(()=>window.__island.games.current.session.debug?.airAudio?.metrics?.()||null);report.sounds=await page.evaluate(()=>{const log=window.__island.games.current.session.debug?.sounds||[];const c={};for(const e of log)c[e.name]=(c[e.name]||0)+1;return c;});
 console.log('AIR',JSON.stringify(air),JSON.stringify(report.sounds),JSON.stringify(report.airAudio));
 assert.ok(air.aircraftSeen>=1,'aircraft appear on stage 3');assert.ok(air.tracersSeen>=3,'the Vulcan fires visible tracers');assert.ok(air.kills>=1,'the Vulcan brings an aircraft down');assert.ok(air.splashes>=1,'the aircraft falls into the sea');assert.ok(air.hudTarget>0,'the HUD rings the gun target');
 assert.ok(air.peakDrawCalls<=70&&air.peakTriangles<=90000,`render budget with aircraft (${air.peakDrawCalls} calls, ${air.peakTriangles} triangles)`);
 assert.ok((report.sounds.vulcanStart||0)>=1&&(report.sounds.vulcanStop||0)>=1,'Vulcan start and stop sounds are requested');
 assert.ok(report.airAudio&&report.airAudio.loaded.length===3,`the three Vulcan samples decode (${JSON.stringify(report.airAudio)})`);
 await exit();await tick(300);
 if(!before){
  // ---- 11/11/2026 phase 2 (Roy, phone) ----
  // (A) Ammo limit, stage 1: quick taps on Fire spend the loaded shells; at 3 a supply buoy appears (gauge turns orange), at 0 the message shows (red);
  // a ship that does not sail gets the buoy drifted to it and reloads from the stock. Sailing into the buoy is the same reach check.
  await start('navalDuel',1);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);
  const fire1=await center('#shoot');let s=await snap();const ammo={magazine:s.magazines?.ammo?.[0],loadedStart:s.loaded,stock:s.ammo?.[0],gauge:s.hud?.ammo||null,taps:0};
  assert.equal(ammo.loadedStart,ammo.magazine,'the magazine is loaded at the start');assert.ok(ammo.gauge&&ammo.gauge.level==='ok','the ammo gauge is drawn');
  const tapFire=async()=>{await touch('touchStart',[fire1]);await tick(60);await touch('touchEnd');await tick(420);ammo.taps++;};
  for(let i=0;i<30&&(await snap()).loaded>3;i++)await tapFire();await tick(100);s=await snap();
  ammo.atLow={loaded:s.loaded,level:s.hud?.ammo?.level,buoys:s.buoys?.length,dataset:await page.evaluate(()=>document.querySelector('.game-controls')?.dataset.ammoLevel)};await capture('ammo-low');
  assert.equal(s.loaded,3);assert.equal(ammo.atLow.level,'low');assert.equal(s.buoys.length,1,'a buoy appears at the low mark');assert.equal(ammo.atLow.dataset,'low');
  for(let i=0;i<10&&(await snap()).loaded>0;i++)await tapFire();await tick(100);s=await snap();
  ammo.atEmpty={loaded:s.loaded,level:s.hud?.ammo?.level,message:s.hud?.ammo?.message,fired:s.fired,stock:s.ammo[0]};await capture('ammo-empty');
  assert.equal(s.loaded,0);assert.equal(ammo.atEmpty.message,'נגמרה התחמושת, אוספים אספקה');const firedEmpty=s.fired;await tapFire();assert.equal((await snap()).fired,firedEmpty,'nothing loaded, the tap does not fire');
  for(let t=0;t<12000&&(await snap()).supplies<1;t+=250)await tick(250);s=await snap();
  ammo.afterBuoy={loaded:s.loaded,supplies:s.supplies,level:s.hud?.ammo?.level,seconds:+s.time.toFixed(1)};await capture('ammo-refill');
  assert.equal(s.supplies,1,'the buoy reached the stranded ship');assert.ok(s.loaded>0&&s.hud?.ammo?.level!=='empty','reloaded from the stock');
  report.ammo=ammo;console.log('AMMO',JSON.stringify(ammo));await exit();await tick(300);
  // (B) Manual Vulcan, stage 3: the aircraft arrives, nothing fires by itself, the Vulcan button appears; holding it and dragging the crosshair onto the
  // helicopter fires (hits, kill); releasing stops the gun.
  await start('navalDuel',3);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);
  await touch('touchStart',[{x:300,y:150}]);await tick(40);await touch('touchEnd');await tick(200);
  const K=await page.evaluate(()=>{const b=window.__island.data.config.minigames.navalDuel;return {ws:b.render.worldScale,sp:b.render.enemySpacing/b.combat.laneSpacing};});
  const angles=(p,a)=>({yaw:Math.atan2(a.z-p.z,a.x-p.x),pitch:Math.atan2(Math.max(0,a.h)*.32,Math.max(.01,Math.hypot((a.x-p.x)*K.ws,(a.z-p.z)*K.sp)))});
  const advanceManual=()=>page.evaluate(()=>{const s=window.__island.games.current.session;for(let i=0;i<10;i++)s.debug.drive(.02,{skyMode:'manual'});});
  let inRange=0;for(let t=0;t<40&&inRange<15;t++){await advanceManual();await tick(50);s=await snap();if(s.air?.some(a=>a.state!=='down'&&Math.hypot(a.x-s.playerShip.x,a.z-s.playerShip.z)<=135))inRange++;}
  s=await snap();const sky={shotsBeforeHold:s.vulcan?.shots,inRangeFrames:inRange,button:await page.locator('.naval-vulcan').isVisible(),manual:s.vulcan?.manual};await capture('vulcan-button');
  assert.ok(inRange>=15,'an aircraft stayed in range for 3 s of game time');assert.equal(sky.shotsBeforeHold,0,'no Vulcan shot without the button');assert.equal(sky.button,true,'the Vulcan button is on screen');
  const vb=await center('.naval-vulcan');await touch('touchStart',[vb]);await tick(60);s=await snap();assert.ok(s.sky?.held,'holding the button opens the sky crosshair');
  let dx=0,dy=0,onTargetFrames=0,firstOn=null,trace=[];const DEG=180/Math.PI;
  for(let i=0;i<160;i++){const a=s.air?.find(a=>a.state!=='down');if(!a)break;const want=angles(s.playerShip,a),yawErr=Math.atan2(Math.sin(want.yaw-s.sky.yaw),Math.cos(want.yaw-s.sky.yaw))*DEG,pitchErr=(want.pitch-s.sky.pitch)*DEG;
   // A thumb controller: big errors use the held turn (past the dead band), small ones the fine zone; up/down is pitch.
   dx=Math.abs(yawErr)>3?Math.sign(yawErr)*Math.min(70,24+Math.abs(yawErr)):yawErr/.12;dy=-Math.max(-70,Math.min(70,pitchErr/.16));
   await touch('touchMove',[{x:vb.x+dx,y:vb.y+dy}]);await tick(50);s=await snap();
   if(s.vulcan.onTarget){onTargetFrames++;firstOn??=s.time;}if(i%10===0)trace.push({t:+s.time.toFixed(2),yawErr:+yawErr.toFixed(1),pitchErr:+pitchErr.toFixed(1),on:s.vulcan.onTarget,shots:s.vulcan.shots,hits:s.vulcan.hits});
   if(onTargetFrames===4)await capture('vulcan-aim');if(s.vulcan.kills>0)break;}
  s=await snap();Object.assign(sky,{onTargetFrames,shotsHeld:s.vulcan.shots,hits:s.vulcan.hits,kills:s.vulcan.kills,belt:s.belt,secondsToDown:s.vulcan.kills?+(s.time-firstOn).toFixed(1):null,crosshair:s.hud?.sky||null,trace});
  if(s.vulcan.kills)await capture('vulcan-down');
  await touch('touchEnd');await tick(60);const shotsAtRelease=(await snap()).vulcan.shots;await tick(600);s=await snap();sky.shotsAfterRelease=s.vulcan.shots-shotsAtRelease;sky.heldAfter=Boolean(s.sky);
  report.sky=sky;console.log('SKY',JSON.stringify(sky));
  assert.ok(sky.onTargetFrames>0,'the crosshair reached the helicopter');assert.ok(sky.shotsHeld>0&&sky.hits>0,'held on target: shots and hits');assert.equal(sky.kills,1,'the helicopter is shot down');
  assert.equal(sky.shotsAfterRelease,0,'releasing the button stops the gun');assert.equal(sky.heldAfter,false);
  await exit();
 }
 return report;
});
