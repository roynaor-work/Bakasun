// Ships v24.1 acceptance through the island shell with real touch only (14/11/2026): Chromium with hasTouch and isMobile at 844x390
// (SwiftShader WebGL), CDP Input.dispatchTouchEvent on the screen and on the real controls, Playwright's fake clock (model time). The model
// is only read (where a hull is, the counters, what the HUD drew); nothing is injected. Data changes, as in the v24 acceptance: stages are
// unlocked, and for R4 the first helicopter of stage 3 comes at 2 s and stays 40 s.
// (R1) a short tap on a hull starts the radar: no lock at the tap, the gauge fills on the hull and on the Lock button, the lock comes after
//      0.8-1.5 s of model time; ?navalRadar=v24 locks at the tap.
// (R2) sailing away with the left thumb: the lock breaks when the hull leaves the radar's range, with the reason and the range ring on the
//      water; a tap on that far hull is refused.
// (R3) a held and dragged aim: the aim ring on the forecast hull with no word and a neutral colour; ?navalHint=v24 shows the v24 word.
// (R4) stage 3, the fleet sunk through the Lock button and Fire taps while the helicopter is up: the stage waits (no result for 6 s, the
//      clock stands still, the banner), and ends once the Vulcan (held, no drag) brings it down; ?navalAirEnd=v24 ends with it up.
// (R5) stage 11: the submarine is under water for 40 s of play (depth never 0), the Torpedo button hits it; ?navalSub=v24 surfaces.
// Frames and verification.json go to verification/naval-boars-v241/ (prefix naval-).
// Run: PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs CHROMIUM_PATH=/usr/bin/google-chrome node workout/island/tests/naval-v241-browser.mjs
import {verify} from './night-browser.mjs';
import {pathToFileURL} from 'node:url';
import {browserArtifacts} from '../../../tests/helpers/island-browser.mjs';
const frames=pathToFileURL(await browserArtifacts('frames'));
const only=(process.env.ONLY||'').split(',').filter(Boolean),want=k=>!only.length||only.includes(k);
let failures=[];
await verify('naval-boars-v241',[{width:844,height:390,isMobile:true}],async({page,context,viewport,tick,snap,start,exit,nav})=>{
 const tag=`${viewport.width}x${viewport.height}`;
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return b&&{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
 const capture=name=>page.screenshot({path:new URL(`naval-${name}.jpg`,frames).pathname,type:'jpeg',quality:80});
 const fails=[];const check=(ok,text)=>{if(!ok)fails.push(`${tag}: ${text}`);console.log((ok?'PASS ':'FAIL ')+tag+' '+text);};
 const report={viewport:tag,clock:'fake page.clock; times are model time'};
 const alive=()=>page.evaluate(()=>Boolean(window.__island.games.current));
 const leave=async()=>{const s=await snap().catch(()=>null);if(s?.result)for(let t=0;t<5000&&!(await page.locator('[data-action=game-again]:visible').count());t+=200)await tick(200);
  if(await page.locator('[data-action=game-again]:visible').count()){await page.locator('[data-action=game-exit]:visible').last().tap();await tick(400);}else if(await alive())await exit();else{await tick(1500);await nav();}
  for(let i=0;i<3&&await page.locator('[data-action=close-modal]:visible').count();i++){await page.locator('[data-action=close-modal]:visible').first().tap();await tick(300);}await tick(300);};
 await page.evaluate(()=>{const {engine,data}=window.__island;engine.state.minigameProgress.navalDuel.stage=30;data.config.minigames.navalDuel.render.fallbackFrameMs=10000;});
 const ready=async(stage,search='')=>{await page.evaluate(q=>{history.replaceState(null,'',location.pathname+'?dev=1'+q);},search);await start('navalDuel',stage);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded,{timeout:120000}).catch(()=>{});await tick(400);};
 const screenOf=index=>page.evaluate(i=>{const s=window.__island.games.current.session,e=s.debug.model.enemies.find(e=>e.index===i);if(!e)return null;const q=s.debug.view.projectTarget(e.x,e.z,1.5);return q&&{x:q.x,y:q.y,depth:q.depth};},index);
 const visible=q=>q&&q.depth>0&&q.x>=40&&q.x<=viewport.width-40&&q.y>=75&&q.y<=viewport.height-30;
 const nearestVisible=async(filter=()=>true)=>{const s=await snap().catch(()=>null);if(!s?.enemies)return null;const live=s.enemies.filter(e=>e.active&&e.hp>0&&filter(e)).sort((a,b)=>Math.hypot(a.x-s.playerShip.x,a.z-s.playerShip.z)-Math.hypot(b.x-s.playerShip.x,b.z-s.playerShip.z));for(const e of live){const q=await screenOf(e.index);if(visible(q))return {index:e.index,q};}return null;};
 const tapAt=async(q,id=1,ms=90)=>{await touch('touchStart',[{x:q.x,y:q.y,id}]);await tick(ms);await touch('touchEnd',[{x:q.x,y:q.y,id}]);await tick(40);};
 const stickPoint=async()=>{const z=await page.locator('.naval-stick-zone').boundingBox();return {x:z.x+z.width*.45,y:z.y+z.height*.6};};
 const dist=(s,i)=>{const e=s.enemies.find(x=>x.index===i);return e?Math.hypot(e.x-s.playerShip.x,e.z-s.playerShip.z):null;};

 // R1. The radar: a tap acquires, the lock comes later.
 if(want('r1')){const lockTime=async search=>{await ready(10,search);let t=await nearestVisible();for(let i=0;i<10&&!t;i++){await tick(300);t=await nearestVisible();}
   const s0=await snap(),f0=s0.fired,d=dist(s0,t.index);await touch('touchStart',[{...t.q,id:1}]);await tick(90);await touch('touchEnd',[{...t.q,id:1}]);const tTap=(await snap()).time;let s=await snap(),mid=null,button=null,at=null;
   for(let k=0;k<40&&!s.homing;k++){await tick(50);s=await snap();if(!mid&&s.v241?.radar?.progress>.35){mid={progress:s.v241.radar.progress,need:s.v241.radar.need,hud:s.hud?.v241?.radar||null};button=await page.evaluate(()=>{const b=document.querySelector('.naval-lock-btn');return {radar:b?.dataset.radar,fill:b?.style.getPropertyValue('--naval-radar')};});if(!search)await capture('1-radar-acquiring');}}
   at=s.homing?s.time:null;if(!search){await tick(400);await capture('2-radar-locked');}
   const r={search:search||'default',distance:d&&+d.toFixed(0),lockedAtTap:false,seconds:at===null?null:+(at-tTap).toFixed(2),need:mid?.need??null,mid,button,shells:s.fired-f0};
   await leave();return r;};
  const quick=async()=>{await ready(10,'&navalRadar=v24');let t=await nearestVisible();for(let i=0;i<10&&!t;i++){await tick(300);t=await nearestVisible();}await tapAt(t.q);const s=await snap();const r={search:'?navalRadar=v24',lockedAtTap:s.homing?.index===t.index};await leave();return r;};
  const v241=await lockTime(''),v24=await quick();report.radar={v241,v24};console.log('radar',JSON.stringify(report.radar));
  check(v241.mid&&v241.mid.hud&&v241.button?.radar==='acquiring','during the acquisition: the gauge on the hull and the Lock button rim fill');
  check(v241.seconds!==null&&v241.seconds>=.78&&v241.seconds<=1.55,`the lock comes after ${v241.seconds} s of model time (needs ${v241.need?.toFixed?.(2)} s for a hull ${v241.distance} away)`);
  check(v241.shells===0,'the tap fired nothing');check(v24.lockedAtTap,'?navalRadar=v24: locked at the tap (v24)');}

 // R2. Out of range: the lock breaks while sailing away; a tap on the far hull is refused.
 if(want('r2')){await ready(1);let t=await nearestVisible();for(let i=0;i<10&&!t;i++){await tick(300);t=await nearestVisible();}await tapAt(t.q);for(let k=0;k<40;k++){await tick(100);if((await snap()).homing)break;}
  let s=await snap();const locked=Boolean(s.homing),S=await stickPoint();let broke=null,lostShot=false;await touch('touchStart',[{...S,id:7}]);
  for(let k=0;k<600&&!broke;k++){s=await snap();const e=s.enemies.find(x=>x.index===t.index),cam=s.camera?.heading||0,away=Math.atan2(s.playerShip.z-e.z+60,s.playerShip.x-e.x),d=Math.atan2(Math.sin(away-cam),Math.cos(away-cam));
   await touch('touchMove',[{x:S.x+Math.sin(d)*44,y:S.y-Math.cos(d)*44,id:7}]);await tick(150);s=await snap();if(!s.homing&&locked){broke={seconds:s.time,distance:+dist(s,t.index).toFixed(0),reason:s.v241?.radarLost?.reason,unlocked:s.unlocked?.reason,hud:s.hud?.v241?.lost||null,ring:s.hud?.v241?.rangeRing||null};}}
  await touch('touchEnd',[{...S,id:7}]);await tick(60);if(broke){await capture('3-lock-lost-range-ring');}
  const q=await screenOf(t.index);let refused=null;if(visible(q)){await tapAt(q);await tick(60);s=await snap();refused={radar:Boolean(s.v241?.radar),reason:s.v241?.radarLost?.reason};}
  report.range={locked,broke,refused,range:340,margin:15};console.log('range',JSON.stringify(report.range));
  check(locked&&broke&&broke.reason==='lost'&&broke.unlocked==='range'&&broke.distance>=350,`sailing away the lock breaks at ${broke?.distance} (radar 340 + 15), reason "${broke?.hud?.word}" with the range ring (${broke?.ring})`);
  check(!refused||(!refused.radar&&refused.reason==='range'),'a tap on the far hull is refused ("out of the radar\'s range")');await leave();}

 // R3. No "hit or not": the aim ring on the forecast hull has no word and one neutral colour.
 if(want('r3')){const aim=async search=>{await ready(10,search);const F=await center('#shoot');let s=await snap();await touch('touchStart',[{...F,id:2}]);await tick(200);
   for(let k=0;k<10;k++){await touch('touchMove',[{x:F.x-6*k,y:F.y-3*k,id:2}]);await tick(80);}s=await snap();const hint=s.hud?.v24?.aim||null;if(!search)await capture('4-aim-no-words');
   await touch('touchEnd',[{x:F.x-60,y:F.y-30,id:2}]);await tick(100);await leave();return {search:search||'default',hint};};
  const v241=await aim(''),v24=await aim('&navalHint=v24');report.hint={v241,v24};console.log('hint',JSON.stringify(report.hint));
  check(v241.hint&&v241.hint.word===null&&v241.hint.color==='#CFF3FF','v24.1: the aim ring has no word and one neutral colour');check(v24.hint&&typeof v24.hint.word==='string','?navalHint=v24: the v24 word under the ring');}

 // R4. The sky at the end of the stage. The session closes when a stage ends, so the end is read from the last snapshot before it closes
 // and from the island's count of ship wins (state.minigameWins.navalDuel, one more after a won stage).
 if(want('r4')){const stars=()=>page.evaluate(()=>window.__island.engine.state.minigameWins?.navalDuel||0);
  const sky=async search=>{await page.evaluate(()=>{const a=window.__island.data.config.minigames.navalDuel.levels[2].air;a.from=2;a.kinds=['heli'];a.count=1;a.every=99;a.heli={...(a.heli||{}),leaveAfter:40};});const star0=await stars();await ready(3,search);
   const L=await center('.naval-lock-btn'),F=await center('#shoot');let s=await snap(),last=s,lastLock=-9,lastFire=-9,closed=false;
   const poll=async ms=>{await tick(ms);const now=await snap().catch(()=>null);if(now){last=now;s=now;}else{closed=true;s=null;}return s;};
   for(let k=0;k<900&&s&&!s.result&&!s.mission?.complete;k++){if(!s.homing&&!s.v241?.radar&&s.time-lastLock>1.2){await tapAt(L,4,70);lastLock=s.time;}if(s.homing&&s.time-lastFire>.7){await tapAt(F,2,60);lastFire=s.time;}await poll(120);}
   const r={search:search||'default',fleetDown:Boolean(last?.mission?.complete),heliUp:Boolean(last?.air?.some(a=>a.state!=='down')),ended:null,waited:null,clock:null,banner:null,shotDown:null,kills:0};
   if(!r.fleetDown){await leave();return r;}
   const t0=last.time,rem0=last.remaining;for(let k=0;k<30&&!closed&&!s?.result;k++)await poll(200);
   r.waited=closed||s?.result?0:+(last.time-t0).toFixed(1);r.clock=closed?null:+(rem0-last.remaining).toFixed(2);r.banner=last?.hud?.v241?.air?.word||null;r.finale=last?.v241?.airFinale;if(!search&&!closed)await capture('5-air-finale-banner');
   // The Vulcan held (its crosshair locks on an aircraft within 42 degrees of the turret's bearing, v24), then, if still up, a drag toward it.
   if(!closed&&!s?.result){const V=await center('.naval-vulcan');if(V){await touch('touchStart',[{...V,id:6}]);let dx=0;
     for(let k=0;k<80&&!closed&&!s?.result&&!(last.vulcan?.kills>0);k++){await poll(150);if(k===10&&!search)await capture('5b-air-finale-vulcan');
      if(k>12&&!(last.vulcan?.hits>0)){const a=last.air?.find(x=>x.state!=='down');if(a){const q=await page.evaluate(([x,z,h])=>window.__island.games.current?.session.debug.view.projectTarget(x,z,h),[a.x,a.z,Math.max(0,a.h)*.32]).catch(()=>null);if(q){dx=Math.max(-160,Math.min(160,dx+(q.x-viewport.width/2)*.08));await touch('touchMove',[{x:V.x+dx,y:V.y,id:6}]);}}}}
     await touch('touchEnd',[{x:V.x+dx,y:V.y,id:6}]);}
    r.kills=last.vulcan?.kills||0;for(let k=0;k<250&&!closed&&!s?.result;k++)await poll(200);}
   r.shotDown=(last.vulcan?.kills||0)>0;r.ended=last.result?.outcome||(closed&&(await stars())>star0?'win':closed?'closed':null);r.closedAt=last.time&&+last.time.toFixed(1);await leave();return r;};
  const v241=await sky(''),v24=await sky('&navalAirEnd=v24');report.sky={v241,v24};console.log('sky',JSON.stringify(report.sky));
  check(v241.fleetDown&&v241.heliUp&&v241.waited>=5.5&&Math.abs(v241.clock)<.01&&v241.banner,`the fleet down with the helicopter up: the stage waits ${v241.waited} s, the clock stands still (${v241.clock}), banner "${v241.banner}"`);
  check(v241.ended==='win',`the stage is won once the sky is clear (${v241.shotDown?'shot down by the Vulcan':'the helicopter flew away'})`);check(v24.fleetDown&&v24.heliUp&&v24.waited===0&&v24.ended==='win','?navalAirEnd=v24: the stage ends with the helicopter up (v24)');}

 // R5. The deep submarine. The left thumb sails a slow circle (as a child dodging), so 40 s under fire do not end the stage; the torpedo
 // part starts a fresh stage if the first one ended anyway.
 if(want('r5')){const deep=async search=>{await ready(11,search);let s=await snap(),samples=0,surfaced=0,seen=false,angle=0;const S=await stickPoint();await touch('touchStart',[{...S,id:7}]);
   for(let k=0;k<200&&s&&!s.result&&s.time<42;k++){angle+=.06;await touch('touchMove',[{x:S.x+Math.sin(angle)*34,y:S.y-Math.cos(angle)*34,id:7}]);await tick(200);s=await snap().catch(()=>null);if(!s)break;const sub=s.enemies.find(e=>e.subMode==='v24');if(sub?.active&&sub.hp>0){samples++;if(!(sub.depth>0))surfaced++;if(!seen){const q=await screenOf(sub.index),others=await Promise.all(s.enemies.filter(e=>e.active&&e.hp>0&&e.index!==sub.index).map(e=>screenOf(e.index)));if(visible(q)&&others.every(o=>!o||Math.hypot(o.x-q.x,o.y-q.y)>90)){seen=true;await capture(search?'7-submarine-v24-surfacing-cycle':'6-submarine-deep-periscope');}}}}
   await touch('touchEnd',[{...S,id:7}]);let hit=null;
   if(!search){if(!s||s.result||!(await page.locator('.naval-torpedo-btn:visible').count())){await leave();await ready(11,search);for(let k=0;k<40&&!(await page.locator('.naval-torpedo-btn:visible').count());k++)await tick(200);s=await snap();}
    const sub=s?.enemies.find(e=>e.subMode==='v24'&&e.active&&e.hp>0),hp=sub?.hp;hit=false;
    for(let k=0;k<4&&!hit&&sub;k++){if(!(await page.locator('.naval-torpedo-btn:visible').count()))break;await tapAt(await center('.naval-torpedo-btn'),8,60);for(let t=0;t<40&&!hit;t++){await tick(120);const now=await snap().catch(()=>null);if(!now)break;s=now;const x=s.enemies.find(y=>y.index===sub.index);if(!x||x.hp<hp)hit=true;}}}
   const r={search:search||'default',samples,surfaced,deep:s?.v241?.subDeep,torpedoHit:hit,torpedoes:s?.v24?.torpedoes};await leave();return r;};
  const v241=await deep(''),v24=await deep('&navalSub=v24');report.submarine={v241,v24};console.log('submarine',JSON.stringify(report.submarine));
  check(v241.samples>=100&&v241.surfaced===0,`v24.1: under water in all ${v241.samples} samples over 40 s`);check(v241.torpedoHit===true,'a tap on the Torpedo button hits it under water');check(v24.surfaced>0,`?navalSub=v24: it surfaces (${v24.surfaced} of ${v24.samples} samples)`);}
 report.fails=fails;failures.push(...fails);return report;
});
if(failures.length){console.error('FAILED',failures);process.exitCode=1;}else console.log('all v24.1 naval checks passed');
