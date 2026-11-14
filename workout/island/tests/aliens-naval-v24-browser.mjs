// v24 acceptance through the island shell with real touch only (14/11/2026): Chromium with hasTouch and isMobile (SwiftShader WebGL),
// CDP Input.dispatchTouchEvent on the screen and on the real controls, real frames (Playwright's fake clock). The models are only read
// (where the ship, a hull or a magazine is, the counters); nothing is injected. The only data change is the one final-naval-browser makes:
// the first aircraft of stage 3 comes at 2 s (part N5), and stages are unlocked.
// Aliens (844x390, 390x844 portrait, 1280x720): (A1) the v24 HUD: three thin rings of 56-64 px in one column at the right edge, above the
//   ship's lane, clear of the stick, the captions fade; the v23 row with ?alienHud=v23 (its global switch); (A2) the fire buttons by touch
//   (regular rate, the Vulcan heats and locks); (A3) a Vulcan magazine through a finger on the flight surface: it falls, the ship takes it,
//   the ring turns cyan "cold", the lock is gone and the gauge is empty. Portrait shows the rotate screen and the column after rotating.
// Ships (844x390): (N1) a short tap on a hull locks it (no shell), (N2) the Lock button: a tap locks the top of the order, a swipe moves
//   back; (N3) accuracy, SHOTS per mode (default 20): v24 (Lock button, then Fire taps while sailing in a circle with the left thumb) and
//   v23 (?navalAim=v23, the same child: a short tap on the nearest hull, then Fire taps, no long press); (N4) enemy fire per minute v24
//   against ?navalEnemyFire=v23 and the red decals on the screen; (N5) the Vulcan held with no drag at a helicopter: v24 locks the crosshair
//   on and downs it, v23 misses; (N6) stage 11: a diving submarine shows sonar rings, the Torpedo button appears, a tap launches a torpedo
//   that hits it under water. Frames and verification.json go to verification/aliens-naval-v24/.
// Run: PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node workout/island/tests/aliens-naval-v24-browser.mjs
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const frames=new URL('../verification/aliens-naval-v24/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const SHOTS=Number(process.env.SHOTS||20),only=(process.env.ONLY||'').split(',').filter(Boolean),want=k=>!only.length||only.includes(k);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
let failures=[];
await verify('aliens-naval-v24',[{width:844,height:390,isMobile:true},{width:390,height:844,isMobile:true},{width:1280,height:720,isMobile:false}],async({page,context,viewport,tick,snap,start,exit,nav})=>{
 const tag=`${viewport.width}x${viewport.height}`,phone=viewport.width===844,portrait=viewport.height>viewport.width;
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return b&&{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
 const capture=name=>page.screenshot({path:new URL(`${tag}-${name}.jpg`,frames).pathname,type:'jpeg',quality:80});
 const fails=[];const check=(ok,text)=>{if(!ok)fails.push(`${tag}: ${text}`);console.log((ok?'PASS ':'FAIL ')+tag+' '+text);};
 const report={viewport:tag,clock:'fake page.clock; rates use model time'};
 const alive=()=>page.evaluate(()=>Boolean(window.__island.games.current));
 const leave=async()=>{const s=await snap().catch(()=>null);if(s?.result)for(let t=0;t<5000&&!(await page.locator('[data-action=game-again]:visible').count());t+=200)await tick(200);
  if(await page.locator('[data-action=game-again]:visible').count()){await page.locator('[data-action=game-exit]:visible').last().tap();await tick(400);}else if(await alive())await exit();else{await tick(1500);await nav();}
  for(let i=0;i<3&&await page.locator('[data-action=close-modal]:visible').count();i++){await page.locator('[data-action=close-modal]:visible').first().tap();await tick(300);}await tick(300);};
 const box=sel=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();if(!r.width)return null;const cs=getComputedStyle(e);return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),r:Math.round(r.right),b:Math.round(r.bottom),border:parseFloat(cs.borderTopWidth)};},sel);
 const overlap=(a,b)=>a&&b&&a.x<b.r&&b.x<a.r&&a.y<b.b&&b.y<a.b;
 await page.evaluate(()=>{const {engine,data}=window.__island;engine.state.minigameProgress.navalDuel.stage=30;engine.state.minigameProgress.alienDefense&&(engine.state.minigameProgress.alienDefense.stage=Math.max(engine.state.minigameProgress.alienDefense.stage||1,3));data.config.minigames.navalDuel.render.fallbackFrameMs=10000;data.config.minigames.alienDefense.render.fallbackFrameMs=10000;});

 // ------------------------------------------------------------------ Aliens
 if(want('aliens')){
  const startAliens=async(stage=1)=>{await start('alienDefense',stage);await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});await tick(800);};
  await startAliens(1);
  if(portrait){const rotate=await page.locator('.soccer-rotate').isVisible();check(rotate,'portrait: the rotate screen covers the game (landscape game)');await capture('aliens-portrait-rotate');await page.setViewportSize({width:844,height:390});await tick(600);}
  const W=portrait?844:viewport.width,H=portrait?390:viewport.height;
  // A1. Layout.
  {const [fire,vulcan,missile,stick,zone]=await Promise.all(['#shoot','#vulcan','#pass','#joystick','.soccer-stick-zone'].map(box));const s=await snap();const shipTop=(s.player.y-40)*s.viewport.scaleY;
   const hud=await page.evaluate(()=>document.querySelector('.alien-controls')?.dataset.alienHud);report.aliensLayout={hud,fire,vulcan,missile,stick,shipTop:Math.round(shipTop),area:[fire,vulcan,missile].reduce((n,b)=>n+b.w*b.h,0)};console.log('aliens layout',JSON.stringify(report.aliensLayout));
   check(hud==='v24','HUD v24 on by default');check([fire,vulcan,missile].every(b=>b&&b.w>=56&&b.h>=56&&b.w<=66),`thin rings 56-66 px (fire ${fire?.w}, Vulcan ${vulcan?.w}, missile ${missile?.w})`);
   check([fire,vulcan,missile].every(b=>b.border<=2),'thin ring borders (<= 2 px)');check([fire,vulcan,missile].every(b=>b.r>=W-26&&b.r<=W),'at the right edge');
   check(Math.abs((fire.x+fire.w/2)-(vulcan.x+vulcan.w/2))<=4&&Math.abs((vulcan.x+vulcan.w/2)-(missile.x+missile.w/2))<=4&&fire.y>vulcan.y&&vulcan.y>missile.y,'one column: missile, Vulcan, cannon from top to bottom');
   check(!overlap(fire,vulcan)&&!overlap(vulcan,missile)&&!overlap(fire,missile),'no overlap between the rings');check(![fire,vulcan,missile].some(b=>overlap(b,stick)||overlap(b,zone)),'clear of the stick and its zone');
   check([fire,vulcan,missile].every(b=>b.b<shipTop),`above the ship's lane (ship top ${Math.round(shipTop)} px)`);check([fire,vulcan,missile].every(b=>b.x>=0&&b.y>=0&&b.r<=W&&b.b<=H),'inside the screen');
   const caps0=await page.evaluate(()=>document.querySelector('.alien-controls').dataset.alienCaptions);await capture('aliens-1-hud');
   for(let i=0;i<40&&(await snap()).time<6.5;i++)await tick(250);const caps1=await page.evaluate(()=>document.querySelector('.alien-controls').dataset.alienCaptions);check(caps0==='on'&&caps1==='off',`captions show first, then fade (${caps0} -> ${caps1})`);}
  // A2. The buttons by touch.
  if(!portrait&&viewport.isMobile!==false){const F=await center('#shoot'),V=await center('#vulcan');let s0=await snap();await touch('touchStart',[{...F,id:2}]);for(let i=0;i<20;i++)await tick(100);let s1=await snap();await touch('touchEnd');
   const rate=(s1.regularFired-s0.regularFired)/(s1.time-s0.time);check(rate>=4.6&&rate<=6.6,`regular button: ${rate.toFixed(2)} shots/s`);
   await tick(1200);s0=await snap();await touch('touchStart',[{...V,id:3}]);let level=null,locked=false;for(let i=0;i<30;i++){await tick(100);const lv=await page.evaluate(()=>document.querySelector('#vulcan').dataset.level);if(lv==='lock'){locked=true;level=lv;await capture('aliens-2-vulcan-locked-thin-arc');break;}}
   await touch('touchEnd');s1=await snap();check(s1.vulcanFired>s0.vulcanFired&&locked,`Vulcan button fires and locks (${s1.vulcanFired-s0.vulcanFired} bullets, ring ${level})`);}
  await leave();
  // ?alienHud=v23: the v23 row.
  if(!portrait){await page.evaluate(()=>{window.__alienHud='v23';});await startAliens(1);const fire=await box('#shoot'),hud=await page.evaluate(()=>document.querySelector('.alien-controls')?.dataset.alienHud??null);check(hud===null&&fire.w>=100,`?alienHud=v23: the v23 buttons (fire ${fire.w} px)`);report.aliensV23Layout={fire,vulcan:await box('#vulcan'),missile:await box('#pass')};await capture('aliens-3-flag-v23');await leave();await page.evaluate(()=>{window.__alienHud=undefined;});}
  // A3. A Vulcan magazine through a finger on the flight surface (phone only): stage 2 has heavy ships.
  if(phone&&!portrait){await startAliens(2);await page.evaluate(()=>{window.__island.games.current.session.debug.view?.degrade(true);});await tick(200);
   const F=await center('#shoot'),V=await center('#vulcan');let s=await snap();const ship0=s.player.x,perPx=s.viewport.modelWidth/844,startX=422,fingerY=150,finger=x=>({x:Math.max(2,Math.min(842,Math.round(startX+(x-ship0)/perPx))),y:fingerY,id:1});
   await touch('touchStart',[finger(ship0)]);await touch('touchStart',[finger(ship0),{...F,id:2}]);await touch('touchStart',[finger(ship0),{...F,id:2},{...V,id:3}]);
   let falling=false,picked=null,after=null;const t0=s.time;
   while(s&&!s.result&&s.time-t0<150&&!after){
    const plan=await page.evaluate(()=>{const g=window.__island.games.current;if(!g)return null;const m=g.session.debug.model;const r=m.refills?.[0],t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0];return {want:r?r.x:t?t.x:m.player.x,px:m.player.x,refill:Boolean(r),picked:m.refillPicked};});
    if(!plan)break;if(plan.refill&&!falling){falling=s.time;}if(falling&&falling!==true&&s.time-falling>=.6&&plan.refill){falling=true;await capture('aliens-4-magazine-falling');}
    await touch('touchMove',[finger(plan.want),{...F,id:2},{...V,id:3}]);await tick(100);s=await snap();
    if(plan.picked&&!picked){picked=plan.picked;await tick(80);after=await page.evaluate(()=>{const g=window.__island.games.current,m=g.session.debug.model,v=document.querySelector('#vulcan');return {level:v.dataset.level,heat:v.style.getPropertyValue('--heat'),locked:m.vulcanLocked,cold:m.refillCold,gauge:m.vulcanHeat,snapshot:m.snapshot().refill};});await capture('aliens-5-magazine-taken-cold');}}
   await touch('touchEnd');report.aliensRefill={falling,picked,after,seconds:+(s?.time-t0).toFixed(1)};console.log('aliens refill',JSON.stringify(report.aliensRefill));
   check(Boolean(falling),'a magazine fell (seen on the screen)');check(Boolean(after&&after.snapshot.collected>=1),'the ship took it through the real controls');
   check(after?.level==='cold'&&after.locked===false&&after.gauge<.01&&after.cold>3,`after the pick-up: cyan ring (${after?.level}), no lock, empty gauge, cold ${after?.cold?.toFixed?.(1)} s`);
   await leave();}
  if(portrait)await page.setViewportSize({width:viewport.width,height:viewport.height});
 }

 // ------------------------------------------------------------------ Ships (phone landscape only)
 if(phone&&!portrait&&want('naval')){
  // v24.1 (14/11/2026): the lock now waits for a radar acquisition and the submarine never surfaces (naval-v241.mjs); these v24 checks run
  // with the return switches (the v24.1 behaviour is proven by naval-v241-browser.mjs).
  const ready=async(stage,search='')=>{search='&navalRadar=v24&navalSub=v24&navalHint=v24'+search;await page.evaluate(q=>{history.replaceState(null,'',location.pathname+'?dev=1'+q);},search);await start('navalDuel',stage);await page.waitForFunction(()=>window.__island.games.current.session.snapshot.renderMetrics?.playerLoaded,{timeout:120000}).catch(()=>{});await tick(400);};
  const screenOf=index=>page.evaluate(i=>{const s=window.__island.games.current.session,e=s.debug.model.enemies.find(e=>e.index===i);if(!e)return null;const q=s.debug.view.projectTarget(e.x,e.z,1.5);return q&&{x:q.x,y:q.y,depth:q.depth};},index);
  const visible=q=>q&&q.depth>0&&q.x>=40&&q.x<=viewport.width-40&&q.y>=75&&q.y<=viewport.height-30;
  const nearestVisible=async()=>{const s=await snap().catch(()=>null);if(!s?.enemies)return null;const live=s.enemies.filter(e=>e.active&&e.hp>0).sort((a,b)=>Math.hypot(a.x-s.playerShip.x,a.z-s.playerShip.z)-Math.hypot(b.x-s.playerShip.x,b.z-s.playerShip.z));for(const e of live){const q=await screenOf(e.index);if(visible(q))return {index:e.index,q};}return null;};
  const tapAt=async(q,id=1,ms=90)=>{await touch('touchStart',[{x:q.x,y:q.y,id}]);await tick(ms);await touch('touchEnd');await tick(60);};
  const stickPoint=async()=>{const z=await page.locator('.naval-stick-zone').boundingBox();return {x:z.x+z.width*.45,y:z.y+z.height*.6};};
  // N1. A short tap on a hull locks it.
  if(want('n1')){await ready(10);let t=await nearestVisible();for(let i=0;i<10&&!t;i++){await tick(300);t=await nearestVisible();}const f0=(await snap()).fired;await tapAt(t.q);await tick(200);const s=await snap();
   check(s.homing?.index===t.index&&s.fired===f0,`a short tap (90 ms) on hull ${t.index} locks it and fires nothing (lock ${s.homing?.index}, shells ${s.fired-f0})`);await tick(500);await capture('naval-1-tap-lock');
   // N2. The Lock button.
   const L=await center('.naval-lock-btn');await tapAt(L,4,80);let a=await snap();await tapAt(L,4,80);let b=await snap();
   await touch('touchStart',[{...L,id:4}]);await tick(40);await touch('touchMove',[{x:L.x-50,y:L.y,id:4}]);await tick(40);await touch('touchEnd');await tick(80);const c=await snap();
   report.lockButton={first:a.homing?.index,second:b.homing?.index,swipe:c.homing?.index,data:await page.evaluate(()=>document.querySelector('.naval-lock-btn')?.dataset.locked)};console.log('lock button',JSON.stringify(report.lockButton));
   check(Number.isInteger(a.homing?.index)&&Number.isInteger(b.homing?.index)&&a.homing.index!==b.homing.index,'Lock button: a tap locks, the next tap moves to the next hull');check(c.homing?.index===a.homing.index,'a swipe goes back');await capture('naval-2-lock-button');await leave();}
  // N3/N4. Accuracy while sailing in a circle, 20 shells per mode, and the enemy fire per minute.
  const accuracy=async(mode)=>{const v24=mode==='v24';await ready(10,v24?'':'&navalAim=v23&navalEnemyFire=v23&navalSub=v23');await page.evaluate(()=>{window.__island.games.current.session.debug.view?.degrade(true);});
   // This Chrome's CDP lifts the points a touchEnd lists, so each tap lifts only its own finger and the left thumb keeps the floating stick.
   const S=await stickPoint(),F=await center('#shoot'),L=v24?await center('.naval-lock-btn'):null;let s=await snap();const t0=s.time,f0=s.fired,h0=s.hits,e0=s.enemyFired;let angle=0,decals=0,lastFire=-9,lastTap=-9,stick={x:S.x,y:S.y,id:7};
   await touch('touchStart',[stick]);
   while(s&&!s.result&&s.fired-f0<SHOTS&&s.time-t0<150){
    angle+=.12;stick={x:S.x+Math.sin(angle)*42,y:S.y-Math.cos(angle)*42,id:7};await touch('touchMove',[stick]);
    if(v24&&!s.homing&&s.time-lastTap>1){await touch('touchStart',[stick,{...L,id:4}]);await tick(70);await touch('touchEnd',[{...L,id:4}]);lastTap=s.time;}
    if(!v24&&s.time-lastTap>2.5){const t=await nearestVisible();if(t){await touch('touchStart',[stick,{x:t.q.x,y:t.q.y,id:5}]);await tick(70);await touch('touchEnd',[{x:t.q.x,y:t.q.y,id:5}]);lastTap=s.time;}}
    if(s.time-lastFire>.75){await touch('touchStart',[stick,{...F,id:2}]);await tick(60);await touch('touchEnd',[{...F,id:2}]);lastFire=s.time;}
    await tick(120);const now=await snap().catch(()=>null);if(!now)break;s=now;const d=s.hud?.v24?.decals||0;if(d>decals){decals=d;if(v24&&d>=2)await capture('naval-4-red-decals');}
   }
   await touch('touchEnd');for(let t=0;t<3000&&(s.ball?.active||s.extraShots?.length);t+=100){await tick(100);const now=await snap().catch(()=>null);if(!now)break;s=now;}
   const shells=s.fired-f0,hits=s.hits-h0,r={mode,shells,hits,hitPercent:shells?Math.round(100*hits/shells):null,seconds:+(s.time-t0).toFixed(1),enemyShots:s.enemyFired-e0,enemyPerMinute:+(60*(s.enemyFired-e0)/Math.max(1,s.time-t0)).toFixed(1),maxDecals:decals,hpLeft:+(s.lives/s.maxLives).toFixed(2),outcome:s.result?.outcome||'running'};
   if(v24)await capture('naval-3-sailing-locked');await leave();return r;};
  if(want('n3')){const v23=await accuracy('v23'),v24=await accuracy('v24');report.accuracy={v23,v24};console.log('accuracy',JSON.stringify(report.accuracy));
   check(v24.shells>=Math.min(SHOTS,10)&&v24.hitPercent>=85,`v24 while sailing: ${v24.hits}/${v24.shells} hits (${v24.hitPercent}%)`);check(v24.hitPercent>v23.hitPercent,`v23 (tap on the ship, no long press): ${v23.hits}/${v23.shells} (${v23.hitPercent}%)`);
   check(v24.maxDecals>=1,`red decals on the water (up to ${v24.maxDecals} at once)`);}
  // N4. Enemy fire over a fixed 45 s window, sailing in a circle and never firing (the accuracy runs end after about 16 s, too short for a rate).
  if(want('n4')){const fire=async v24=>{await ready(10,v24?'':'&navalAim=v23&navalEnemyFire=v23&navalSub=v23');await page.evaluate(()=>{window.__island.games.current.session.debug.view?.degrade(true);});const S=await stickPoint();let s=await snap();const t0=s.time,e0=s.enemyFired,hp0=s.lives;let angle=0,decals=0;
    await touch('touchStart',[{x:S.x,y:S.y,id:7}]);while(s&&!s.result&&s.time-t0<45){angle+=.1;await touch('touchMove',[{x:S.x+Math.sin(angle)*42,y:S.y-Math.cos(angle)*42,id:7}]);await tick(150);const now=await snap().catch(()=>null);if(!now)break;s=now;decals=Math.max(decals,s.hud?.v24?.decals||0);}
    await touch('touchEnd');const r={seconds:+(s.time-t0).toFixed(1),enemyShots:s.enemyFired-e0,perMinute:+(60*(s.enemyFired-e0)/Math.max(1,s.time-t0)).toFixed(1),hpLost:+(hp0-s.lives).toFixed(2),maxDecals:decals};await leave();return r;};
   const v23=await fire(false),v24=await fire(true);report.enemyFire={v23,v24};console.log('enemy fire',JSON.stringify(report.enemyFire));check(v24.perMinute>=1.5*v23.perMinute,`enemy shots per minute over 45 s: ${v23.perMinute} -> ${v24.perMinute}`);check(v24.maxDecals>=1,`red decals while sailing (up to ${v24.maxDecals})`);}
  // N5. The Vulcan held with no drag at a helicopter.
  if(want('n5')){const vulcanRun=async search=>{await page.evaluate(()=>{const a=window.__island.data.config.minigames.navalDuel.levels[2].air;a.from=2;a.kinds=['heli','plane'];});await ready(3,search);
    for(let t=0;t<9000;t+=200){await tick(200);const s=await snap();if(s.air?.some(a=>a.state!=='down'))break;}
    const B=await center('.naval-vulcan');let s=await snap();const v0=s.vulcan||{shots:0,hits:0,kills:0};if(!B)return {shown:false};await touch('touchStart',[{...B,id:6}]);for(let i=0;i<30;i++){await tick(100);s=await snap();if(i===8&&!search)await capture('naval-5-vulcan-locked');if((s.vulcan?.kills||0)>(v0.kills||0))break;}await touch('touchEnd');await tick(200);s=await snap();
    const r={shown:true,shots:s.vulcan.shots-v0.shots,hits:s.vulcan.hits-v0.hits,kills:s.vulcan.kills-v0.kills,skyLock:s.v24?.skyLock??null};await leave();return r;};
   const v24=await vulcanRun(''),v23=await vulcanRun('&navalAim=v23');report.vulcan={v23,v24};console.log('vulcan',JSON.stringify(report.vulcan));
   check(v24.shown&&v24.hits>0&&v24.kills>=1,`v24: the Vulcan held with no drag locks on and downs the aircraft (${v24.hits} hits, ${v24.kills} down)`);check(v23.shown&&v24.hits>v23.hits,`v23 with the same thumb: ${v23.hits} hits`);}
  // N6. Stage 11: the diving submarine and the Torpedo button.
  if(want('n6')){await ready(11);let s=await snap(),sonar=false,shown=false;for(let t=0;t<9000;t+=200){await tick(200);s=await snap();sonar=(s.hud?.v24?.sonar||0)>0;shown=await page.locator('.naval-torpedo-btn:visible').count()>0;if(sonar&&shown)break;}
   await capture('naval-6-sonar-torpedo-button');const sub=s.enemies.find(e=>e.subMode==='v24'&&e.active&&e.hp>0),hp=sub?.hp??0,T=await center('.naval-torpedo-btn'),t0=s.v24?.torpedoesFired??0;
   let hit=false,blast=false;for(let k=0;k<4&&!hit;k++){s=await snap();const e=s.enemies.find(x=>x.index===sub.index);if(!(e?.depth>0)){await tick(600);continue;}await tapAt(T,8,60);for(let t=0;t<5000&&!hit;t+=100){await tick(100);s=await snap().catch(()=>null)||s;const x=s.enemies.find(y=>y.index===sub.index);if(s.hud?.v24?.underwaterBlast&&!blast){blast=true;await capture('naval-7-torpedo-underwater-blast');}if(!x||x.hp<hp)hit=true;}}
   report.submarine={sonar,torpedoButton:shown,torpedoesFired:(s.v24?.torpedoesFired??0)-t0,hit,blast,torpedoesLeft:s.v24?.torpedoes};console.log('submarine',JSON.stringify(report.submarine));
   check(sonar&&shown,'a diving submarine: sonar rings and the Torpedo button');check(report.submarine.torpedoesFired>=1&&hit,'a tap on the Torpedo button hits the diving submarine');await leave();}
 }
 report.fails=fails;failures.push(...fails);return report;
});
if(failures.length){console.error('FAILED',failures);process.exitCode=1;}else console.log('all v24 acceptance checks passed');
