// racing-deep-m7 browser proof, real session with touch at 844x390: the player is thrown into the fence at 40 m/s, the flip is an arc with rolls, debris, a tyre and a
// camera pull-back; six frames along the flight (0, .2, .4, .6, .8, landing) are saved to verification/racing-deep-fable/m7/shots/, the render budget during the flight
// is compared with the frame before it, and the race goes on afterwards (crashT 0, restart at 9 m/s, throttle works).
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium ISLAND_CSP_BROWSER=1 node workout/island/tests/racing-crash-browser.mjs
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verify} from './night-browser.mjs';
await mkdir(fileURLToPath(new URL('../verification/racing-deep-fable/m7/shots/',import.meta.url)),{recursive:true});
await verify('racing-deep-fable/m7',[{width:844,height:390}],async({page,tick,snap,shot,assert,ready,nav})=>{
 const report={frames:[]};
 await page.evaluate(()=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;});
 await page.evaluate(()=>window.__island.games.stages('islandRacing'));await tick(60);await page.waitForFunction(()=>document.querySelector('[data-action=racing-league-go]'));
 await page.evaluate(()=>window.__island.games.racingLeagueGo());await tick(100);
 if(await page.locator('[data-action=game-understood]').count()){await tick(32);await page.locator('[data-action=game-understood]').tap();}
 for(let i=0;i<400&&!await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>1);i++){await tick(100);await page.waitForTimeout(100);}
 await ready();await tick(100);await nav();
 // the broadcast intro card holds the model until it is tapped (or times out): close it so the session steps the model on every frame and the crash event is consumed once
 if(await page.locator('[data-action=racing-intro-go]').count()){await page.locator('[data-action=racing-intro-go]').tap();await tick(32);}
 await tick(3400);
 const s0=await snap();assert.equal(s0.cars.length,10,'ten cars');
 // drive 6 s with the real model (pure pursuit), then one frame for the "before" render budget
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track,w=a=>Math.atan2(Math.sin(a),Math.cos(a));
  for(let n=0;n<60*6;n++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),e=w(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);m.step(1/60,{steer:Math.max(-1,Math.min(1,e*1.7)),throttle:1,autoAccelerate:true});}});
 await tick(50);const before=await page.evaluate(()=>{const s=window.__island.games.current.session.snapshot,m=s.renderMetrics;return {drawCalls:m.drawCalls,triangles:m.triangles,effects:m.effects,speed:s.player.speed,fov:null};});
 report.before=before;
 // the flip: the player is turned into the fence at 40 m/s (a hard, nearly head-on hit, as in tools/racing-m2-shots.mjs); the model is stepped until the crash event fires
 // The session itself must produce the crash (step and render in the same frame, as in real play): the pose is set, the session's input is replaced by full throttle,
 // and the clock ticks one frame at a time until the player's crash count rises. A crash made by stepping the model from the test would be cleared before the view saw it.
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track,q=tr.sample(p.s+30),lane=tr.width/2-.6;
  Object.assign(p,{x:q.x+q.normal.x*lane,y:q.y,z:q.z+q.normal.z*lane,heading:q.heading+1.1,speed:40,lateral:lane,s:q.s});window.__crashLog=[];window.__crashBefore=p.crashes;
  window.__island.games.current.session.debug.input.sample=()=>({steer:0,throttle:1,autoAccelerate:true});
  const step=m.step;m.step=(dt,i)=>{const r=step(dt,i);for(const e of m.state.events)if(e.type==='crash'||e.type==='crashRecover')window.__crashLog.push({t:+m.state.time.toFixed(2),type:e.type,car:e.car,strength:e.strength,reason:e.reason});return r;};});
 let crash=null;for(let i=0;i<60*4&&!crash;i++){await tick(16);crash=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player;if(p.crashes===window.__crashBefore)return null;const e=window.__crashLog.find(x=>x.type==='crash'&&x.car==='player');
  return {crashT:p.crashT,crashDur:p.crashDur,crashSpin:p.crashSpin,crashPeak:p.crashPeak,strength:e?.strength,reason:e?.reason,others:window.__crashLog.filter(x=>x.type==='crash'&&x.car!=='player').map(x=>x.car),speed:p.speed,lateral:p.lateral,width:m.track.width};});}
 assert.ok(crash,'the session flipped the player');
 assert.ok(crash.crashT>0&&crash.crashDur>=.5&&crash.crashDur<=1.2,'a hard fence hit starts the arc: '+JSON.stringify(crash));assert.equal(crash.reason,'wall');assert.ok(crash.strength>=.5,'a hard hit: '+crash.strength);assert.equal(crash.crashSpin,2,'two rolls');report.crash=crash;
 const frame=()=>page.evaluate(()=>{const s=window.__island.games.current.session.snapshot,p=s.player,m=s.renderMetrics;return {u:p.crashDur?+(1-p.crashT/p.crashDur).toFixed(2):null,crashT:+p.crashT.toFixed(3),air:+(p.crashAir||0).toFixed(2),speed:+p.speed.toFixed(1),lateral:+p.lateral.toFixed(2),drawCalls:m.drawCalls,triangles:m.triangles,effects:m.effects};});
 // six frames along the flight: 0, .2, .4, .6, .8 and the landing frame (crashT back to 0)
 let f=await frame();report.frames.push({shot:'crash-0',...f});await shot('shots/crash-0');
 for(const target of [.2,.4,.6,.8]){for(let i=0;i<120;i++){f=await frame();if(f.u===null||f.u>=target)break;await tick(16);}report.frames.push({shot:`crash-${target}`,...f});await shot(`shots/crash-${String(target).slice(1)}`);}
 const during=report.frames.find(x=>x.shot==='crash-.4')||report.frames[2];
 for(let i=0;i<150;i++){f=await frame();if(f.crashT===0)break;await tick(16);}
 report.frames.push({shot:'crash-end',...f});await shot('shots/crash-end');
 assert.equal(f.crashT,0,'the flip ends by itself in the browser');
 // the budget during the flight (debris, tyre, trail, pulled-back camera) against the frame before it
 const peakCalls=Math.max(...report.frames.map(x=>x.drawCalls)),peakTris=Math.max(...report.frames.map(x=>x.triangles));
 report.budget={beforeCalls:before.drawCalls,peakCalls,callsPct:+((peakCalls/before.drawCalls-1)*100).toFixed(1),beforeTris:before.triangles,peakTris,trisPct:+((peakTris/before.triangles-1)*100).toFixed(1),duringEffects:during.effects};
 assert.ok(during.effects.debris>0||during.effects.tyres>0,'debris or the tyre are drawn mid-flight: '+JSON.stringify(during.effects));
 assert.ok(report.frames.some(x=>x.air>.5),'the car rose in the arc');
 // the race goes on: back on the road, 9 m/s, and the throttle accelerates it again
 const land=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track;return {speed:p.speed,lateral:p.lateral,crashT:p.crashT,heading:Math.atan2(Math.sin(p.heading-tr.sample(p.s).heading),Math.cos(p.heading-tr.sample(p.s).heading))};});
 await tick(1000);   // one more second of the session with the throttle on
 const after=await page.evaluate(land=>{const m=window.__island.games.current.session.debug.model,p=m.state.player;return {land,width:m.track.width,speedAfter1s:p.speed,phase:m.state.phase,crashT:p.crashT};},land);
 report.after=after;report.crashLog=await page.evaluate(()=>window.__crashLog);
 assert.ok(Math.abs(after.land.lateral)<after.width*.2,'landed within 0.2 of the width from the centre line: '+after.land.lateral);assert.ok(after.land.speed<=9.6&&after.land.speed>=8.5,'restart at 9 m/s (one frame of throttle at most): '+after.land.speed);
 assert.ok(Math.abs(after.land.heading)<.1,'pointing along the track');assert.equal(after.phase,'racing');assert.equal(after.crashT,0);assert.ok(after.speedAfter1s>after.land.speed+2,'the throttle works again: '+after.speedAfter1s);
 await tick(600);await shot('shots/after');
 return report;
});
