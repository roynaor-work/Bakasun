// Naval render budget while aiming the next shot over a live hit effect
// (Codex audit, 28/10/2026). Stage 10, patrolling enemies: fire a solved shot,
// and at the moment it lands start holding the aim pad, so the aim arc and
// marks overlap the flash, sparks, smoke and (for a weak-centre hit) the gold
// ring. The peak is reset just before each overlap window and sampled every
// 10 ms through it. Both an ordinary hit and a weak-centre hit are measured.
// Budget: 90,000 triangles and 70 draw calls in any frame, reflection pass included.
import {verify} from './night-browser.mjs';
const sizes=[{width:844,height:390},{width:740,height:360},{width:1366,height:768}].filter(v=>!process.env.NAVAL_OVERLAP_ONLY||String(v.width)===process.env.NAVAL_OVERLAP_ONLY);
await verify('naval-overlap',sizes,async({page,context,viewport,tick,snap,start,assert})=>{
 const phone=viewport.width<1000,client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 await page.evaluate(()=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;engine.state.minigameProgress.navalDuel.stage=10;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;localStorage.removeItem('island.naval.hand');});
 await start('navalDuel',10);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded);await tick(400);
 const drive=input=>page.evaluate(input=>window.__island.games.current.session.debug.drive(.02,input),input);
 const resetPeak=()=>page.evaluate(()=>window.__island.games.current.session.debug.view.resetPeak());
 const b=await page.locator('#shoot').boundingBox(),pad={x:b.x+b.width/2-viewport.width*.27,y:b.y+b.height/2-40};
 const hold=async()=>{if(phone)await touch('touchStart',[pad]);else{await page.mouse.move(pad.x,pad.y);await page.mouse.down();}};
 const release=async()=>{if(phone)await touch('touchEnd');else await page.mouse.up();};
 const windows={};let attempts=0;
 while((!windows.normal||!windows.critical)&&attempts<12){
  attempts++;await tick(900);await drive({ammoIndex:0,autoAim:true,fireRelease:true});let s=await snap();const t=s.ball.predicted?.contact?.t??s.ball.duration;
  // Run to just before contact, then step until the hit lands.
  await tick(Math.max(0,Math.round(t*1000)-60));let landed=null;for(let i=0;i<30&&!landed;i++){await tick(10);s=await snap();if(s.hud?.hit?.flash)landed=s.hud.lastHit||s.hud.hit;}
  if(!landed)continue;const kind=landed.critical?'critical':'normal';if(windows[kind]){continue;}
  await resetPeak();await hold();let worst={triangles:0,drawCalls:0},mirror={calls:0,triangles:0},aimSeen=false,ringSeen=false;
  for(let i=0;i<120;i++){await tick(10);s=await snap();const m=s.renderMetrics;aimSeen||=m.aimArc?.visible&&m.aimArc.points>0;ringSeen||=Boolean(m.dressing?.critical);
   if(m.environment?.mirror){mirror.calls=Math.max(mirror.calls,m.environment.mirror.calls);mirror.triangles=Math.max(mirror.triangles,m.environment.mirror.triangles);}}
  s=await snap();worst={...s.renderMetrics.peak};await release();await tick(200);
  windows[kind]={peak:worst,mirrorPeak:mirror,aimArcSeen:aimSeen,criticalRingSeen:ringSeen,moving:s.enemies.filter(e=>e.active&&e.hp>0).map(e=>+Math.hypot(e.vx,e.vz).toFixed(1))};
 }
 assert.ok(windows.normal,'an ordinary hit was overlapped by aiming');assert.ok(windows.critical,'a weak-centre hit was overlapped by aiming');
 for(const [kind,w] of Object.entries(windows)){assert.ok(w.aimArcSeen,`${kind}: the aim arc was on screen during the effect`);assert.ok(w.peak.triangles<=90000,`${kind}: ${w.peak.triangles} triangles`);assert.ok(w.peak.drawCalls<=70,`${kind}: ${w.peak.drawCalls} draw calls`);assert.ok(w.moving.every(v=>v>1),`${kind}: enemies under way`);}
 assert.ok(windows.critical.criticalRingSeen,'the gold ring of the centre hit was live during the overlap');
 return {attempts,windows};
});
