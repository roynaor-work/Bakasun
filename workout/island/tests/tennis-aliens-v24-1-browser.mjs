// v24.1 acceptance through the island shell with real touch only (14/11/2026): Chromium with hasTouch and isMobile at 844x390 (SwiftShader WebGL),
// CDP Input.dispatchTouchEvent on the real controls, Playwright's clock for the frames. The models are only read (the meter, the counters, where
// the ship is); nothing is injected. Each check runs twice in the same page: with the switches that restore v24 (before) and as shipped (after).
// Aliens (stage 1): (A1) the Vulcan held by a finger: seconds to the lock, bullets per second, and the gauge after the finger lifts at about
//   60%; (A2) the HUD: where the three rings sit and whether the text block by the stick is shown; (A3) the arsenal: the switch and the special
//   button by touch fire the chain lightning and the shockwave, and an ammo token is taken by flying into it; (A4) enemy bullets per minute.
// Tennis (stage 1): (T1) the held racket (grip metrics, a close-up); (T2) a serve into the red: the out mark (Codex X for 1.5 s and the sign,
//   or the old drawn X) and the ball after the point; (T3) the opponent's serve: the receive hint and arrow, a push of the stick moves the
//   child one spot, and how long the opponent waits before the toss.
// Run: PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome \
//      ONLY=aliens|tennis node workout/island/tests/tennis-aliens-v24-1-browser.mjs   (frames and verification.json: verification/tennis-aliens-v24-1/)
// The load time before/after is measured on a real clock by workout/island/tools/tennis-load-ab.mjs.
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const frames=new URL('../verification/tennis-aliens-v24-1/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const only=(process.env.ONLY||'').split(',').filter(Boolean),want=k=>!only.length||only.includes(k);
const V24={aliens:'&alienVulcan=v24&alienHud=v24&alienArsenal=0&alienEnemyFire=v24',tennis:'&tennisGrip=0&tennisOut=v24&tennisReceive=0&tennisLoad=v24'};
let failures=[];
// verification.json per part (ONLY=aliens / ONLY=tennis can run side by side): verification/tennis-aliens-v24-1/<part>/verification.json.
await verify('tennis-aliens-v24-1/'+(only.join('-')||'all'),[{width:844,height:390,isMobile:true}],async({page,context,viewport,tick,snap,start,exit,nav})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return b&&{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
 const box=sel=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),bottom:Math.round(innerHeight-r.bottom),visible:cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&!e.closest('[hidden]')};},sel);
 const capture=name=>page.screenshot({path:new URL(`${name}.jpg`,frames).pathname,type:'jpeg',quality:80});
 const fails=[],report={clock:'Playwright page.clock; rates use the model time'};const check=(ok,text)=>{if(!ok)fails.push(text);console.log((ok?'PASS ':'FAIL ')+text);};
 const setSearch=search=>page.evaluate(q=>history.replaceState(null,'',location.pathname+'?dev=1'+q),search);
 const leave=async()=>{for(let t=0;t<3000&&(await snap().catch(()=>null))?.result;t+=200)await tick(200);if(await page.locator('[data-action=game-again]:visible').count()){await page.locator('[data-action=game-exit]:visible').last().tap();await tick(400);}else{try{await exit();}catch{await tick(1500);await nav();}}
  for(let i=0;i<3&&await page.locator('[data-action=close-modal]:visible').count();i++){await page.locator('[data-action=close-modal]:visible').first().tap();await tick(300);}await tick(300);};
 const model=()=>page.evaluate(()=>window.__island.games.current?.session.debug?.model);
 // ------------------------------------------------------------------ Aliens
 if(want('aliens')){
  const aliens=async(mode)=>{
   await setSearch(mode==='before'?V24.aliens:'');await start('alienDefense',1);
   await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});await tick(800);
   // The shared machine is slow: the 3D layer at its lowest tier (as the v24 harness does); the HUD and the canvas effects are unchanged.
   await page.evaluate(()=>{window.__island.games.current.session.debug?.view?.degrade(true);});await tick(200);
   const out={mode};
   // A2. The HUD.
   const [fire,vulcan,missile,text,sw]=await Promise.all(['#shoot','#vulcan','#pass','.alien-flight-control','#special-switch'].map(box));
   out.hud={fire,vulcan,missile,textByStick:text?.visible??false,switch:sw?.visible??false,hud:(await snap()).hud};
   await capture(`aliens-${mode}-hud`);
   // A4. Enemy fire: 20 s of play, the ship drifting left and right with the stick, no firing.
   const S=await center('.soccer-stick-zone')||{x:120,y:300};let s=await snap();const t0=s.time,b0=s.boltsFired;
   await touch('touchStart',[{...S,id:7}]);for(let k=0;k<50&&!s.result;k++){await touch('touchMove',[{x:S.x+Math.round(Math.sin(k/4)*30),y:S.y,id:7}]);await tick(400);s=await snap();}await touch('touchEnd',[{...S,id:7}]);
   out.enemy={seconds:+(s.time-t0).toFixed(1),bolts:s.boltsFired-b0,perMinute:+(60*(s.boltsFired-b0)/Math.max(1,s.time-t0)).toFixed(1)};
   // A1. The Vulcan held by a finger until it locks.
   const V=await center('#vulcan');await tick(2500);s=await snap();let f0=s.vulcanFired,v0=s.time,lockAt=null,heatPath=[];
   await touch('touchStart',[{...V,id:3}]);for(let k=0;k<80&&lockAt===null;k++){await tick(100);s=await snap();heatPath.push(+s.vulcan.heat.toFixed(2));if(s.vulcan.locked)lockAt=s.time;}
   await touch('touchEnd',[{...V,id:3}]);out.vulcan={lockAfter:lockAt&&+(lockAt-v0).toFixed(2),bullets:s.vulcanFired-f0,perSecond:lockAt?+((s.vulcanFired-f0)/(lockAt-v0)).toFixed(1):null};
   if(mode==='after'){await touch('touchStart',[{...V,id:3}]);await tick(300);await capture('aliens-after-vulcan-plasma');await touch('touchEnd',[{...V,id:3}]);}
   // The gauge after the finger lifts at about 60%.
   for(let k=0;k<40&&(await snap()).vulcan.heat>.02;k++)await tick(250);
   await touch('touchStart',[{...V,id:3}]);let h=0;for(let k=0;k<60&&h<.6;k++){await tick(50);h=(await snap()).vulcan.heat;}await touch('touchEnd',[{...V,id:3}]);
   const hRelease=(await snap()).vulcan.heat;await tick(300);const h03=(await snap()).vulcan.heat;await tick(700);const h10=(await snap()).vulcan.heat;
   out.cooling={atRelease:+hRelease.toFixed(2),after03:+h03.toFixed(2),after10:+h10.toFixed(2)};
   // A3. The arsenal by touch: switch to the lightning and fire it, then the shockwave.
   if(mode==='after'){
    const P=await center('#pass'),W=await center('#special-switch');let a=(await snap()).special;out.arsenal={start:a};
    await touch('touchStart',[{...W,id:5}]);await tick(80);await touch('touchEnd',[{...W,id:5}]);await tick(120);a=(await snap()).special;out.arsenal.afterSwitch=a?.selected;
    const l0=(await snap()).arsenal?.lightningsFired||0;await touch('touchStart',[{...P,id:6}]);await tick(60);await touch('touchEnd',[{...P,id:6}]);await tick(80);await capture('aliens-after-lightning');await tick(200);
    s=await snap();out.arsenal.lightning={fired:(s.arsenal?.lightningsFired||0)-l0,hits:s.arsenal?.lightningHits||0,ammo:s.arsenal?.ammo};
    await touch('touchStart',[{...W,id:5}]);await tick(80);await touch('touchEnd',[{...W,id:5}]);await tick(120);out.arsenal.afterSecondSwitch=(await snap()).special?.selected;
    const w0=(await snap()).arsenal?.wavesFired||0;await touch('touchStart',[{...P,id:6}]);await tick(60);await touch('touchEnd',[{...P,id:6}]);await tick(260);await capture('aliens-after-shockwave');await tick(600);
    s=await snap();out.arsenal.shockwave={fired:(s.arsenal?.wavesFired||0)-w0,hits:s.arsenal?.waveHits||0,bulletsWiped:s.arsenal?.waveBolts||0};
    // An ammo token, taken by flying into it with a finger on the flight surface (both fire buttons held so aliens fall).
    const F=await center('#shoot');s=await snap();const perPx=s.viewport.modelWidth/viewport.width,ship0=s.player.x,finger=x=>({x:Math.max(2,Math.min(viewport.width-2,Math.round(422+(x-ship0)/perPx))),y:150,id:1});
    await touch('touchStart',[finger(ship0)]);await touch('touchStart',[finger(ship0),{...F,id:2}]);await touch('touchStart',[finger(ship0),{...F,id:2},{...V,id:3}]);const c0=s.arsenal?.collected||0,tt0=s.time;let seen=false;
    while(s&&!s.result&&s.time-tt0<40&&(s.arsenal?.collected||0)===c0){const plan=await page.evaluate(()=>{const m=window.__island.games.current?.session.debug?.model;if(!m)return null;const d=m.ammoDrops?.[0],t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0];return {want:d?d.x:t?t.x:m.player.x,token:Boolean(d)};});if(!plan)break;if(plan.token&&!seen){seen=true;await capture('aliens-after-ammo-token');}
     await touch('touchMove',[finger(plan.want),{...F,id:2},{...V,id:3}]);await tick(200);s=await snap();}
    await touch('touchEnd');out.arsenal.ammo={seen,collected:(s.arsenal?.collected||0)-c0,seconds:+(s.time-tt0).toFixed(1),ammoNow:s.arsenal?.ammo};
   }
   await leave();return out;};
  const before=await aliens('before'),after=await aliens('after');report.aliens={before,after};console.log('aliens',JSON.stringify(report.aliens));
  check(before.vulcan.lockAfter&&after.vulcan.lockAfter>=3*before.vulcan.lockAfter-.3,`Vulcan held to the lock: ${before.vulcan.lockAfter} s -> ${after.vulcan.lockAfter} s`);
  check(after.vulcan.perSecond>=before.vulcan.perSecond*1.3,`Vulcan bullets per second: ${before.vulcan.perSecond} -> ${after.vulcan.perSecond}`);
  check(after.cooling.after03<after.cooling.atRelease-.05&&before.cooling.after03>=before.cooling.atRelease-.01,`gauge 0.3 s after the finger lifts: v24 ${before.cooling.atRelease}->${before.cooling.after03}, v25 ${after.cooling.atRelease}->${after.cooling.after03}`);
  check(after.cooling.after10<.15,`v25 gauge 1 s after release: ${after.cooling.after10}`);
  check(after.hud.fire.bottom<before.hud.fire.bottom&&after.hud.missile.bottom<before.hud.missile.bottom&&after.hud.fire.w===before.hud.fire.w&&after.hud.vulcan.w===before.hud.vulcan.w,`rings lower, same size: fire ${before.hud.fire.bottom}->${after.hud.fire.bottom} px from the bottom, missile ${before.hud.missile.bottom}->${after.hud.missile.bottom}`);
  check(before.hud.textByStick===true&&after.hud.textByStick===false,`text by the stick: v24 ${before.hud.textByStick}, v25 ${after.hud.textByStick}`);
  check(after.arsenal.afterSwitch==='lightning'&&after.arsenal.lightning.fired===1&&after.arsenal.lightning.hits>=1,`switch + special button: lightning fired, ${after.arsenal.lightning.hits} hits`);
  check(after.arsenal.afterSecondSwitch==='shockwave'&&after.arsenal.shockwave.fired===1,`switch again: shockwave fired (${after.arsenal.shockwave.hits} aliens, ${after.arsenal.shockwave.bulletsWiped} bullets wiped)`);
  check(after.arsenal.ammo.seen,`an ammo token fell on the screen within ${after.arsenal.ammo.seconds} s (taken: ${after.arsenal.ammo.collected}; the pick-up itself is also proven headless)`);
  check(after.enemy.perMinute>=before.enemy.perMinute*1.1,`enemy bullets per minute (20 s, no firing): ${before.enemy.perMinute} -> ${after.enemy.perMinute}`);
 }
 // ------------------------------------------------------------------ Tennis
 if(want('tennis')){
  const tennis=async(mode)=>{
   await setSearch(mode==='before'?V24.tennis:'');await page.evaluate(()=>{const r=window.__island.data.config.minigames.tennis.render;r.slowFrameMs=100000;r.pixelRatios=r.pixelRatios.map(()=>.6);r.shadowEnabled=r.shadowEnabled.map(()=>false);});await start('tennis',1);
   for(let i=0;i<600;i++){const m=await page.evaluate(()=>{const r=window.__island.games.current?.session.snapshot.renderMetrics;return Boolean(r&&(r.characterLoaded||r.mode==='canvas'));});if(m)break;await tick(100);await page.waitForTimeout(30);}
   await tick(800);const out={mode};let s=await snap();
   // T1. The racket in the hand.
   out.grip=s.renderMetrics?.grip;await capture(`tennis-${mode}-game`);
   const hand=s.renderMetrics?.rig?.[0]?.rightHand;if(hand){await page.evaluate(h=>window.__island.games.current.session.debug.inspectCamera([h[0]-1.1,h[1]+.25,h[2]-1.3],h),hand);await tick(200);await capture(`tennis-${mode}-racket-close`);await page.evaluate(()=>window.__island.games.current.session.debug.inspectCamera(null));await tick(100);}
   // T2. Serve into the red twice (a double fault) by touch; read the marks and the ball.
   const SV=await center('#pass'),tapServe=async()=>{await touch('touchStart',[{...SV,id:2}]);await tick(70);await touch('touchEnd',[{...SV,id:2}]);await tick(30);};
   const fault=async()=>{s=await snap();if(s.phase==='serve')await tapServe();for(let k=0;k<200;k++){s=await snap();if(s.phase==='toss'&&s.serveMeter<.04&&s.serveMeterDirection<0)break;await tick(16);}await tapServe();};
   const marks=[];for(let k=0;k<2;k++){await fault();for(let w=0;w<80;w++){s=await snap();if(s.faultMark||s.phase==='point')break;await tick(16);}const ball0=[s.ball.x,s.ball.y,s.ball.z];await tick(400);const r=await snap();marks.push({mark:r.faultMark,decals:r.renderMetrics?.decals,sign:await box('.tennis-out-sign'),phase:r.phase});if(k===0)await capture(`tennis-${mode}-out-mark`);
    if(r.phase==='point'||r.phase==='game'){await tick(300);const r2=await snap();marks.at(-1).ballMoved=+Math.hypot(r2.ball.x-r.ball.x,r2.ball.y-r.ball.y,r2.ball.z-r.ball.z).toFixed(3);}
    await tick(1300);marks.at(-1).after16=(await snap()).renderMetrics?.decals;}
   out.out=marks;
   // T3. Lose the rest of the game by double faults, then the opponent serves: the receive spot.
   for(let k=0;k<60&&(await snap()).server!==1;k++){await fault();await tick(500);}
   for(let k=0;k<200;k++){s=await snap();if(s.server===1&&s.phase==='serve')break;await tick(50);}
   out.receive={hint:(await box('.tennis-receive-hint'))?.visible??false,slot:s.receive?.slot??null,x0:s.players[0].x,decal:s.renderMetrics?.decals?.receiveArrow??false};
   await capture(`tennis-${mode}-receive`);
   const Z=await center('.soccer-stick-zone');if(Z){await touch('touchStart',[{...Z,id:7}]);await tick(40);await touch('touchMove',[{x:Z.x+45,y:Z.y,id:7}]);await tick(120);await touch('touchEnd',[{x:Z.x+45,y:Z.y,id:7}]);}
   // The opponent's wait: the model's own phase clock, read on the last frame of the serve phase (before the toss starts).
   let waited=null,lastServeTime=s.phaseTime;for(let k=0;k<400&&waited===null;k++){await tick(16);s=await snap();if(s.phase!=='serve'){waited=lastServeTime;}else{lastServeTime=s.phaseTime;out.receive.last={slot:s.receive?.slot??null,x:+s.players[0].x.toFixed(2)};}}
   out.receive.slotAfter=out.receive.last?.slot??null;out.receive.xAfter=out.receive.last?.x??null;out.receive.tossAfter=waited&&+waited.toFixed(2);
   await capture(`tennis-${mode}-receive-moved`);
   await leave();return out;};
  // The toss wait is read from the model clock between the serve phase start and the toss.
  const before=await tennis('before'),after=await tennis('after');report.tennis={before,after};console.log('tennis',JSON.stringify(report.tennis));
  check(before.grip?.every?.(g=>g===null)!==false&&after.grip?.[0]?.curled===5&&after.grip?.[0]?.racket==='tennis-grip-v1',`racket: v24 ${JSON.stringify(before.grip)} -> v25 ${JSON.stringify(after.grip?.[0])}`);
  const o24=before.out[0],o25=after.out[0];
  check(o24.decals?.drawnX===true&&o24.decals?.outX===false,`v24 out: the old drawn X (${JSON.stringify(o24.decals)})`);
  check(o25.decals?.outX===true&&o25.sign?.visible===true,`v25 out: the Codex X on the landing point and the sign "אאוט" (${JSON.stringify(o25.decals)})`);
  check(o25.after16?.outX===false,'v25 out X gone after 1.5 s');
  check(after.out.every(m=>m.ballMoved===undefined||m.ballMoved<1e-6),`v25: the ball does not move after the point (${after.out.map(m=>m.ballMoved).join(',')})`);
  check(after.receive.hint===true&&after.receive.decal===true&&before.receive.hint===false,`receive: hint and arrow in v25 (v24 ${before.receive.hint}/${before.receive.decal})`);
  check(after.receive.slot===1&&after.receive.slotAfter===2&&Math.abs(after.receive.xAfter-after.receive.x0)>.8,`a push of the stick moves the child one spot: slot ${after.receive.slot}->${after.receive.slotAfter}, x ${after.receive.x0}->${after.receive.xAfter}`);
  check(before.receive.tossAfter<=.8&&after.receive.tossAfter>=1.6,`the opponent waits before the toss: ${before.receive.tossAfter} s -> ${after.receive.tossAfter} s`);
 }
 report.fails=fails;failures.push(...fails);return report;
});
if(failures.length){console.error('FAILED',failures);process.exitCode=1;}else console.log('all v24.1 acceptance checks passed');
