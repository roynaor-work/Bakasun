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
  const fine=await drag(`s${stage} fire right 15px (fine), hold 1s`,fire,15,0,1000);
  const up=await drag(`s${stage} fire up 90px (reach), hold .5s`,fire,0,-90,500);
  // Reach: at least 120 degrees to each side from the Fire button inside the screen; smooth (no step above 12 degrees in 50 ms); feedback kept.
  assert.ok(right.yawDeg>=120,`turn right from the Fire button reaches 120 degrees (got ${right.yawDeg})`);
  assert.ok(left.yawDeg<=-120,`turn left reaches 120 degrees (got ${left.yawDeg})`);
  for(const row of [right,left])assert.ok(row.maxStepDeg<=12,`smooth turn: largest step ${row.maxStepDeg} deg per sample`);
  assert.ok(Math.abs(fine.yawDeg)<=4&&Math.abs(fine.yawDeg)>=.8,`a small drag is a fine aim (${fine.yawDeg} deg)`);
  assert.equal(Math.abs(up.yawDeg)<1,true,'a vertical drag does not turn the turret');
  assert.ok(right.stopDriftDeg<1,`bringing the thumb back stops the turn (drift ${right.stopDriftDeg} deg in .5 s)`);
  for(const row of [right,left])assert.ok(row.landingOffscreen===0||row.arrowWhenOffscreen===row.landingOffscreen,`landing mark visible or an edge arrow (${row.landingOffscreen} off, ${row.arrowWhenOffscreen} arrows)`);
  assert.equal(left.fired,1,'release fires once');
  await exit();await tick(300);
 }
 // Air stage: stage 3 names helicopters and planes; bring the first one forward so the run stays short. The player sits still (the ship still sails on the stick).
 await page.evaluate(()=>{const l=window.__island.data.config.minigames.navalDuel.levels[2];l.air={...l.air,from:2,every:22};});
 await start('navalDuel',3);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);
 const air={aircraftSeen:0,tracersSeen:0,hudTarget:0,peakDrawCalls:0,peakTriangles:0,kills:0,shots:0,hits:0,splashes:0,frames:[]};let framed=false,killed=false;
 for(let t=0;t<45000&&!(killed&&framed&&air.splashes>0);t+=100){await tick(100);const s=await snap();const v=s.vulcan||{},m=s.renderMetrics;air.aircraftSeen=Math.max(air.aircraftSeen,s.air?.length||0);air.tracersSeen=Math.max(air.tracersSeen,m.air?.tracers||0);air.peakDrawCalls=Math.max(air.peakDrawCalls,m.drawCalls||0);air.peakTriangles=Math.max(air.peakTriangles,m.triangles||0);air.kills=v.kills||0;air.shots=v.shots||0;air.hits=v.hits||0;air.splashes=v.splashes||0;if(s.hud?.air?.target)air.hudTarget++;
  if(!framed&&m.air?.tracers>0&&s.hud?.air?.target){framed=true;await capture('s3-air-vulcan');air.frames.push('s3-air-vulcan');}
  if(!killed&&v.kills>0){killed=true;await tick(250);await capture('s3-air-down');air.frames.push('s3-air-down');}
  if(s.result)break;}
 report.air=air;report.airAudio=await page.evaluate(()=>window.__island.games.current.session.debug?.airAudio?.metrics?.()||null);report.sounds=await page.evaluate(()=>{const log=window.__island.games.current.session.debug?.sounds||[];const c={};for(const e of log)c[e.name]=(c[e.name]||0)+1;return c;});
 console.log('AIR',JSON.stringify(air),JSON.stringify(report.sounds),JSON.stringify(report.airAudio));
 assert.ok(air.aircraftSeen>=1,'aircraft appear on stage 3');assert.ok(air.tracersSeen>=3,'the Vulcan fires visible tracers');assert.ok(air.kills>=1,'the Vulcan brings an aircraft down');assert.ok(air.splashes>=1,'the aircraft falls into the sea');assert.ok(air.hudTarget>0,'the HUD rings the gun target');
 assert.ok(air.peakDrawCalls<=70&&air.peakTriangles<=90000,`render budget with aircraft (${air.peakDrawCalls} calls, ${air.peakTriangles} triangles)`);
 assert.ok((report.sounds.vulcanStart||0)>=1&&(report.sounds.vulcanStop||0)>=1,'Vulcan start and stop sounds are requested');
 await exit();
 return report;
});
