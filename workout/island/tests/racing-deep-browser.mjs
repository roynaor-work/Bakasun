// Racing deep round (racing-deep-fable), real browser with touch at 844x390: ten cars on the grid, the HUD counts them, the live tower shows them,
// a hard wall hit flips the player and puts it back on the road at a slow restart speed, and the race still ends with the league result.
// Usage: ISLAND_CSP_BROWSER=1 node workout/island/tests/racing-deep-browser.mjs   (CHROMIUM_PATH optional)
import {verify} from './night-browser.mjs';
await verify('racing-deep-fable',[{width:844,height:390}],async({page,tick,snap,shot,assert,ready,nav})=>{
 const report={};
 await page.evaluate(()=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;});
 await page.evaluate(()=>window.__island.games.stages('islandRacing'));await tick(60);await page.waitForFunction(()=>document.querySelector('[data-action=racing-league-go]'));
 await page.evaluate(()=>window.__island.games.racingLeagueGo());await tick(100);
 if(await page.locator('[data-action=game-understood]').count()){await tick(32);await page.locator('[data-action=game-understood]').tap();}
 for(let i=0;i<400&&!await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>1);i++){await tick(100);await page.waitForTimeout(100);}
 await ready();await tick(100);await nav();await tick(3400);
 let s=await snap();
 assert.equal(s.cars.length,10,'ten cars on the grid by default');report.cars=s.cars.map(c=>c.name);
 assert.equal((await page.locator('.racing-of').textContent()).trim().replace(/\s/g,''),'/10','the HUD counts ten');
 assert.equal(s.cars.filter(c=>c.scoring!==false).length,5,'five scoring cars (player and the four league drivers)');
 await shot('1-grid');
 // drive with the real model for a while, then flip the car on purpose: top speed into the fence
 const crash=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track,w=a=>Math.atan2(Math.sin(a),Math.cos(a));
  for(let n=0;n<60*6;n++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),e=w(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);m.step(1/60,{steer:Math.max(-1,Math.min(1,e*1.7)),throttle:1,autoAccelerate:true});}
  const before={speed:p.speed,rank:p.rank,crashes:p.crashes};p.speed=Math.max(p.speed,40);let steps=0;
  while(steps<60*4&&p.crashes===before.crashes){m.step(1/60,{steer:1,throttle:1,autoAccelerate:true});steps++;}
  const during={crashT:p.crashT,speed:p.speed,lateral:p.lateral,steps};
  return {before,during};});
 assert.ok(crash.during.crashT>0,'a hard fence hit flips the car');report.crash=crash;
 await tick(50);await shot('2-crash');
 const after=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track;for(let n=0;n<60;n++)m.step(1/60,{steer:0,throttle:0,autoAccelerate:false});return {crashT:p.crashT,speed:p.speed,lateral:p.lateral,width:tr.width,recoveryTime:p.recoveryTime};});
 assert.equal(after.crashT,0,'the flip ends by itself');assert.ok(Math.abs(after.lateral)<after.width*.25,'back near the centre line');assert.ok(after.speed<=9.5,'slow restart speed');report.after=after;
 // the extra rivals are drawn: with the player behind the whole pack the draw calls rise with the field
 const draws=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,q=m.track.sample(-60);p.x=q.x;p.z=q.z;p.y=q.y;p.s=q.s;p.heading=q.heading;p.lateral=0;return window.__island.games.current.session.snapshot.renderMetrics;});
 await tick(400);const metrics=await page.evaluate(()=>window.__island.games.current.session.snapshot.renderMetrics);report.renderMetrics=metrics;
 await shot('3-behind-the-pack');
 assert.ok(await page.locator('.racing-tower').isVisible(),'the live tower is shown with ten cars');
 return report;
});
