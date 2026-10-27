// Naval gameplay round, stage A (27/10/2026): measured aim feel and enemy patrol
// in the real page with real touch events. Slow and fast corrections are
// measured as degrees per CSS pixel; latency is measured on the real clock
// from the touch event to the first frame that shows the new turret angle.
// NAVAL_FEEL_HAND=left swaps the controls. Writes verification/naval-feel/.
import {verify} from './night-browser.mjs';
const left=process.env.NAVAL_FEEL_HAND==='left';
await verify('naval-feel',[{width:844,height:390}],async({page,context,viewport,tick,snap,start,assert})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points}),DEG=180/Math.PI;
 await page.evaluate(left=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;engine.state.minigameProgress.navalDuel.stage=10;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;if(left)localStorage.setItem('island.naval.hand','left');else localStorage.removeItem('island.naval.hand');},left);
 await start('navalDuel',3);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);
 const b=await page.locator('#shoot').boundingBox(),pad={x:b.x+b.width/2+(left?1:-1)*viewport.width*.27,y:b.y+b.height/2-40},report={left};
 // Enemy patrol over eight seconds of game time, read from the running page.
 {const s0=await snap(),e0=s0.enemies.filter(e=>e.active).map(e=>({i:e.index,x:e.x,z:e.z}));let path=0,last=e0[0],minZ=0,maxZ=0,headings=new Set();const cz=e0[0].z;
  for(let i=0;i<160;i++){await tick(50);const s=await snap(),e=s.enemies.find(x=>x.index===e0[0].i);path+=Math.hypot(e.x-last.x,e.z-last.z);last={x:e.x,z:e.z};minZ=Math.min(minZ,e.z-cz);maxZ=Math.max(maxZ,e.z-cz);headings.add(Math.round(e.heading*4));}
  const s=await snap();report.patrol={seconds:8,distance:+path.toFixed(1),speed:+(path/8).toFixed(2),lateral:[+minZ.toFixed(1),+maxZ.toFixed(1)],headingSteps:headings.size,trails:s.renderMetrics.dressing?.trails??0};
  assert.ok(report.patrol.speed>7&&report.patrol.speed<=8.05,'stage 3 sails at about 8 units per second');assert.ok(Math.max(-minZ,maxZ)<=24.01,'inside the stage 3 patrol width');assert.ok(report.patrol.trails>0,'the enemy leaves a wake');}
 // Slow correction: one pixel every 40 ms, then a fast swing of 16 pixels every 16 ms.
 await touch('touchStart',[pad]);await tick(120);let s=await snap();const startYaw=s.turret.yaw;let x=pad.x;
 const dir=left?-1:1;for(let i=0;i<40;i++){x+=dir;await touch('touchMove',[{x,y:pad.y}]);await tick(40);}
 s=await snap();const slow=Math.abs(s.turret.yaw-startYaw)*DEG/40;
 const fastStart=s.turret.yaw;for(let i=0;i<15;i++){x+=16*dir;await touch('touchMove',[{x,y:pad.y}]);await tick(16);}
 s=await snap();const fast=Math.abs(s.turret.yaw-fastStart)*DEG/240;
 const elevStart=s.turret.elevation;let y=pad.y;for(let i=0;i<30;i++){y-=1;await touch('touchMove',[{x,y}]);await tick(40);}s=await snap();const slowUp=(s.turret.elevation-elevStart)/30;
 report.gain={slowYaw:+slow.toFixed(4),fastYaw:+fast.toFixed(4),slowElevation:+slowUp.toFixed(4),elevation:[+elevStart.toFixed(2),+s.turret.elevation.toFixed(2)]};
 assert.ok(Math.abs(slow-.08)<.004,'slow horizontal gain near 0.08°/px');assert.ok(fast>.17&&fast<=.2001,'fast horizontal gain near 0.20°/px');assert.ok(Math.abs(slowUp-.06)<.004,'slow vertical gain near 0.06°/px');
 // Two pixels start the aim; one more pixel after that still moves it.
 await touch('touchEnd');await tick(60);await tick(2600);
 await touch('touchStart',[pad]);await tick(120);s=await snap();const y0=s.turret.yaw;await touch('touchMove',[{x:pad.x+dir,y:pad.y}]);await tick(40);const y1=(await snap()).turret.yaw;await touch('touchMove',[{x:pad.x+2*dir,y:pad.y}]);await tick(40);const y2=(await snap()).turret.yaw;await touch('touchMove',[{x:pad.x+3*dir,y:pad.y}]);await tick(40);const y3=(await snap()).turret.yaw;
 report.start={afterOne:+(Math.abs(y1-y0)*DEG).toFixed(4),afterTwo:+(Math.abs(y2-y0)*DEG).toFixed(4),afterThree:+(Math.abs(y3-y0)*DEG).toFixed(4)};assert.equal(y1,y0,'one pixel does not start a drag');assert.ok(Math.abs(y2-y0)>0&&Math.abs(y3-y0)>Math.abs(y2-y0),'from two pixels every pixel moves the aim');
 // Latency on the real clock: touch event to the first frame that shows the new angle.
 await page.clock.resume();
 await page.evaluate(()=>{const s=window.__island.games.current.session,feel=window.__feel={samples:[],frames:[]};let pending=null,last=s.snapshot.turret.yaw,prev=performance.now();
  window.addEventListener('pointermove',e=>{if(pending===null)pending=e.timeStamp;},{capture:true});
  const loop=t=>{feel.frames.push(t-prev);prev=t;const yaw=s.snapshot.turret.yaw;if(pending!==null&&yaw!==last){feel.samples.push(t-pending);pending=null;}last=yaw;if(feel.samples.length<20&&feel.frames.length<2000)requestAnimationFrame(loop);};requestAnimationFrame(loop);});
 for(let i=1;i<=24;i++){await touch('touchMove',[{x:pad.x+(3+i*3)*dir,y:pad.y}]);await new Promise(r=>setTimeout(r,120));}
 const feel=await page.evaluate(()=>window.__feel),sorted=[...feel.samples].sort((a,b)=>a-b),frames=[...feel.frames.slice(5)].sort((a,b)=>a-b);
 report.latency={samples:sorted.length,medianMs:+sorted[Math.floor(sorted.length/2)].toFixed(1),maxMs:+sorted.at(-1).toFixed(1),medianFrameMs:+frames[Math.floor(frames.length/2)].toFixed(1),note:'headless Chromium with software WebGL; the phone has to be measured on the phone'};
 assert.ok(sorted.length>=10,'latency samples were collected');assert.ok(report.latency.maxMs<=50,'the new angle shows within 50 ms');
 await touch('touchEnd');
 return report;
});
