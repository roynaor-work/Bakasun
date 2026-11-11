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
 await ready();await tick(100);await nav();await tick(3400);
 const s0=await snap();assert.equal(s0.cars.length,10,'ten cars');
 // drive 6 s with the real model (pure pursuit), then one frame for the "before" render budget
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track,w=a=>Math.atan2(Math.sin(a),Math.cos(a));
  for(let n=0;n<60*6;n++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),e=w(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);m.step(1/60,{steer:Math.max(-1,Math.min(1,e*1.7)),throttle:1,autoAccelerate:true});}});
 await tick(50);const before=await page.evaluate(()=>{const s=window.__island.games.current.session.snapshot,m=s.renderMetrics;return {drawCalls:m.drawCalls,triangles:m.triangles,effects:m.effects,speed:s.player.speed,fov:null};});
 report.before=before;
 // the flip: the player is turned into the fence at 40 m/s (a hard, nearly head-on hit, as in tools/racing-m2-shots.mjs); the model is stepped until the crash event fires
 const crash=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track,q=tr.sample(p.s+30),lane=tr.width/2-.6;
  Object.assign(p,{x:q.x+q.normal.x*lane,y:q.y,z:q.z+q.normal.z*lane,heading:q.heading+1.1,speed:40,lateral:lane,s:q.s});const before=p.crashes;let steps=0,strength=null,reason=null,others=[];
  while(steps<60*4&&p.crashes===before){m.step(1/60,{steer:0,throttle:1,autoAccelerate:true});steps++;for(const e of m.state.events)if(e.type==='crash'){if(e.car==='player'){strength=e.strength;reason=e.reason;}else others.push(e.car);}}
  return {crashT:p.crashT,crashDur:p.crashDur,crashSpin:p.crashSpin,crashPeak:p.crashPeak,strength,reason,others,speed:p.speed,lateral:p.lateral,width:m.track.width,steps};});
 assert.ok(crash.crashT>0&&crash.crashDur>=.5&&crash.crashDur<=1.2,'a hard fence hit starts the arc: '+JSON.stringify(crash));assert.equal(crash.reason,'wall');assert.ok(crash.strength>=.5,'a hard hit: '+crash.strength);assert.equal(crash.crashSpin,2,'two rolls');report.crash=crash;
 // every crash event of any car while the frames are taken (the effects spawn 5 debris and 1 tyre per crash within 70 m)
 await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model;window.__crashLog=[];const step=m.step;m.step=(dt,i)=>{const r=step(dt,i);for(const e of m.state.events)if(e.type==='crash'||e.type==='crashRecover')window.__crashLog.push({t:+m.state.time.toFixed(2),type:e.type,car:e.car});return r;};});
 const frame=()=>page.evaluate(()=>{const s=window.__island.games.current.session.snapshot,p=s.player,m=s.renderMetrics;return {u:p.crashDur?+(1-p.crashT/p.crashDur).toFixed(2):null,crashT:+p.crashT.toFixed(3),air:+(p.crashAir||0).toFixed(2),speed:+p.speed.toFixed(1),lateral:+p.lateral.toFixed(2),drawCalls:m.drawCalls,triangles:m.triangles,effects:m.effects};});
 // six frames along the flight: 0, .2, .4, .6, .8 and the landing frame (crashT back to 0)
 await tick(16);let f=await frame();report.frames.push({shot:'crash-0',...f});await shot('shots/crash-0');
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
 const after=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track,land={speed:p.speed,lateral:p.lateral,crashT:p.crashT,heading:Math.atan2(Math.sin(p.heading-tr.sample(p.s).heading),Math.cos(p.heading-tr.sample(p.s).heading))};
  for(let n=0;n<60;n++)m.step(1/60,{steer:0,throttle:1,autoAccelerate:true});return {land,width:tr.width,speedAfter1s:p.speed,phase:m.state.phase,crashT:p.crashT};});
 report.after=after;report.crashLog=await page.evaluate(()=>window.__crashLog);
 assert.ok(Math.abs(after.land.lateral)<after.width*.2,'landed within 0.2 of the width from the centre line: '+after.land.lateral);assert.ok(after.land.speed<=9.5&&after.land.speed>=8.5,'restart at 9 m/s: '+after.land.speed);
 assert.ok(Math.abs(after.land.heading)<.1,'pointing along the track');assert.equal(after.phase,'racing');assert.equal(after.crashT,0);assert.ok(after.speedAfter1s>after.land.speed+2,'the throttle works again: '+after.speedAfter1s);
 await tick(600);await shot('shots/after');
 return report;
});
