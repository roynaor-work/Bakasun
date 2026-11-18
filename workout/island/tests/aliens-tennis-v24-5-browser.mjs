// v24.5 acceptance through the island shell with real touch (18/11/2026): Chromium with hasTouch and isMobile at 844x390 (SwiftShader WebGL,
// the 3D layer on, as on the phone), CDP Input.dispatchTouchEvent on the real controls, Playwright's clock for the frames. Each part runs twice in
// the same page: with the switches that restore v24.4 (before) and as shipped (after). The game models are only read, never written.
// Aliens: the laser upgrade is bought the way the shop buys it (activity.upgrade('alienDefense','weapon') twice: the hangar's weapon 2 = "escort
//   ships and a permanent laser"; the save is given the money and the 6 stars that rank asks for, like the other setup the harness does). Stage 1,
//   cannon held and the ship steered under a column by the stick for 8 s. Counted per laser round of the cannon: the ships it hits (L), and for
//   every other round (plain cannon, wings without the laser, Vulcan) a round or pellet seen inside a ship's drawn hull while still flying (P) and a
//   hit after the round crossed another ship's hull (B): the v24.3/v24.4 "fire goes through the ship" bug must stay at 0.
// Tennis: (T) the serve toss: the racket head in the player's own frame and on screen against the head bone, sampled through the toss;
//   (K) a rally ball steered to the backhand side by the stick: the racket head's side offset while the ball comes; (C) the recorded-call hook:
//   takes.json requested once, no 404, the synthesised call kept while it lists no takes. Frames: verification/aliens-tennis-v24-5/frames.
// Run: PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome \
//      ONLY=aliens|tennis node workout/island/tests/aliens-tennis-v24-5-browser.mjs
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const frames=new URL('../verification/aliens-tennis-v24-5/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const only=(process.env.ONLY||'').split(',').filter(Boolean),want=k=>!only.length||only.includes(k);
const BEFORE={aliens:'&alienLaser=0',tennis:'&tennisPose=0&tennisCalloutRec=0'};
const failures=[];
await verify('aliens-tennis-v24-5/'+(only.join('-')||'all'),[{width:844,height:390,isMobile:true}],async({page,context,tick,snap,start,exit,nav})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return b&&{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
 const capture=(name,clip)=>page.screenshot({path:new URL(`${name}.jpg`,frames).pathname,type:'jpeg',quality:80,...(clip?{clip}:{})});
 const fails=[],report={clock:'Playwright page.clock; times are model time'};const check=(ok,text)=>{if(!ok)fails.push(text);console.log((ok?'PASS ':'FAIL ')+text);};
 const setSearch=search=>page.evaluate(q=>history.replaceState(null,'',location.pathname+'?dev=1'+q),search);
 const requests=[];page.on('response',r=>{const u=new URL(r.url());if(u.pathname.includes('tennis-callouts-rec'))requests.push({path:u.pathname.replace(/^.*\/workout\/island\//,''),status:r.status()});});
 const leave=async()=>{for(let t=0;t<3000&&(await snap().catch(()=>null))?.result;t+=200)await tick(200);if(await page.locator('[data-action=game-again]:visible').count()){await page.locator('[data-action=game-exit]:visible').last().tap();await tick(400);}else{try{await exit();}catch{await tick(1500);await nav();}}
  for(let i=0;i<3&&await page.locator('[data-action=close-modal]:visible').count();i++){await page.locator('[data-action=close-modal]:visible').first().tap();await tick(300);}await tick(300);};
 // ------------------------------------------------------------------ Aliens
 if(want('aliens')){
  report.purchase=await page.evaluate(()=>{const {engine:e,activity}=window.__island,p=e.state.minigameProgress.alienDefense;p.stars=p.stars.map((s,i)=>i<3?Math.max(s,3):s);e.state.money=Math.max(e.state.money,100000);
   const r=[activity.upgrade('alienDefense','weapon'),activity.upgrade('alienDefense','weapon')];return {results:r,weapon:e.state.minigameEquipment.alienDefense.weapon};});
  console.log('purchase',JSON.stringify(report.purchase));
  const aliens=async mode=>{
   await setSearch(mode==='before'?BEFORE.aliens:'');await start('alienDefense',1);
   await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.artModels?.loaded===6,{timeout:240000}).catch(()=>{});
   for(let i=0;i<150;i++)await tick(16);
   const out={mode,view:await page.evaluate(()=>window.__island.games.current.session.debug.view?.mode??null),weapon:await page.evaluate(()=>window.__island.games.current.session.debug.model.equipment.weapon)};
   // Read-only observer around update(): what each round crossed on screen and which ships it hit.
   await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,cv=document.querySelector('.game-screen canvas'),W=360,H=480,seen=new WeakMap();
    const log=window.__v245={serial:0,laserRounds:0,laserHitsPerRound:[],laserBeams:0,hitsBy:{},passThrough:0,behind:0,examples:[]},pairs=new Set();const orig=m.update.bind(m);
    const drawn=(a,ry)=>Math.min(a.boss?100:62,a.radius*2*ry*1.65)/2;
    const pellets=(s,sy)=>{if(!s.vulcan)return [0];const d=(3+Math.max(0,m.player.y-s.y)*Math.tan(.035))*sy;return [-d,0,d];};
    const isLaser=s=>s.kind===1&&!s.vulcan;
    const close=rec=>{if(rec.laser){log.laserRounds++;log.laserHitsPerRound.push(rec.hit.size);}};
    m.update=(dt,input)=>{const r=cv.getBoundingClientRect(),sx=r.width/W,sy=r.height/H;
     for(const s of m.shots){let rec=seen.get(s);if(!rec){rec={obj:++log.serial,crossed:new Set(),hit:new Set(),laser:isLaser(s),beam:Boolean(s.beam25)};seen.set(s,rec);if(rec.beam)log.laserBeams++;}for(const a of m.aliens)if(Math.hypot((s.x-a.x)*sx,(s.y-a.y)*sy)<drawn(a,sy))rec.crossed.add(a.id);}
     const before=new Map(m.shots.map(s=>[s,new Set(s.hitIds||[])]));orig(dt,input);
     for(const [s,prev] of before){const rec=seen.get(s),fresh=[...(s.hitIds||[])].filter(id=>!prev.has(id));
      if(fresh.length){const key=s.vulcan?'vulcan':s.kind===2?'laserVolley':isLaser(s)?(s.wing?'laserWing':'laserCannon'):s.wing?'wing':'cannon';log.hitsBy[key]=(log.hitsBy[key]||0)+fresh.length;
       for(const id of fresh){rec.hit.add(id);if(!rec.laser&&[...rec.crossed].some(c=>c!==id)){log.behind++;if(log.examples.length<6)log.examples.push({key,hit:id,crossed:[...rec.crossed]});}}}
      if(!m.shots.includes(s)){close(rec);seen.delete(s);}}
     for(const s of m.shots){const rec=seen.get(s);if(rec?.laser)continue;const offs=pellets(s,sy);
      for(let k=0;k<offs.length;k++){if(s.vulcan&&((s.pelletMask||0)>>k)&1)continue;
       for(const a of m.aliens){if(Math.hypot((s.x-a.x)*sx+offs[k],(s.y-a.y)*sy)<drawn(a,sy)*.95){const key=rec?.obj+':'+a.id+':'+k;if(!pairs.has(key)){pairs.add(key);log.passThrough++;}}}}}
    };});
   const F=await center('#shoot'),S={x:128,y:315};
   await touch('touchStart',[{...F,id:1}]);let stick=false,shot=0;
   for(let f=0;f<60*8;f++){
    const st=await page.evaluate(()=>{const m=window.__island.games.current?.session.debug?.model;if(!m||m.result)return null;
     // the column with the most ships in it, nearest first: the laser's natural target
     const cols=new Map();for(const a of m.aliens)if(a.y>0){const k=Math.round(a.x/20);cols.set(k,(cols.get(k)||[]).concat(a));}
     let best=null;for(const list of cols.values()){const x=list.reduce((s,a)=>s+a.x,0)/list.length,score=list.length*100-Math.abs(x-m.player.x);if(!best||score>best.score)best={x,score};}
     return {d:best?best.x-m.player.x:0};});
    if(!st)break;const pts=[{...F,id:1}];
    if(Math.abs(st.d)>2){const p={x:S.x+Math.sign(st.d)*Math.min(40,Math.abs(st.d)*3+6),y:S.y,id:3};if(!stick)await touch('touchStart',[...pts,{...S,id:3}]);await touch('touchMove',[...pts,p]);stick=true;}
    else if(stick)await touch('touchMove',[...pts,{...S,id:3}]);
    await tick(16);if(f===120||f===300){await capture(`aliens-${mode}-laser-${++shot}`);}
   }
   await touch('touchEnd',[]);await tick(400);
   Object.assign(out,await page.evaluate(()=>{const l=window.__v245,h=l.laserHitsPerRound;return {laserRounds:l.laserRounds,laserBeams:l.laserBeams,laserMultiHit:h.filter(n=>n>=2).length,laserMaxShips:Math.max(0,...h),laserShipsHit:h.reduce((a,b)=>a+b,0),hitsBy:l.hitsBy,passThrough:l.passThrough,behind:l.behind,examples:l.examples};}));
   await leave();return out;};
  const before=await aliens('before'),after=await aliens('after');report.aliens={before,after};console.log('aliens',JSON.stringify(report.aliens));
  check(report.purchase.weapon>=2,`the laser upgrade bought through the shop (weapon rank ${report.purchase.weapon})`);
  check(after.view==='three','the 3D layer is on (the phone view)');
  check(after.laserBeams>0&&after.laserMultiHit>=5,`laser rounds that hit 2+ ships in a row in 8 s: v24.4 ${before.laserMultiHit} -> v24.5 ${after.laserMultiHit} (most ships by one round: ${before.laserMaxShips} -> ${after.laserMaxShips}; ships hit per round ${(before.laserShipsHit/Math.max(1,before.laserRounds)).toFixed(2)} -> ${(after.laserShipsHit/Math.max(1,after.laserRounds)).toFixed(2)})`);
  check(before.laserMultiHit===0,'v24.4 (?alienLaser=0) shows the laser stopping at the first ship in the same run');
  check(after.laserMaxShips<=4,'a beam stops after 4 ships');
  check(after.passThrough===0&&after.behind===0,`non-laser rounds seen through a ship / hits behind a ship: ${after.passThrough} / ${after.behind} (v24.4 ${before.passThrough} / ${before.behind})`);
 }
 // ------------------------------------------------------------------ Tennis
 if(want('tennis')){
  const tennis=async mode=>{
   requests.length=0;await setSearch(mode==='before'?BEFORE.tennis:'');await page.evaluate(()=>{const r=window.__island.data.config.minigames.tennis.render;r.slowFrameMs=100000;r.pixelRatios=r.pixelRatios.map(()=>.6);r.shadowEnabled=r.shadowEnabled.map(()=>false);});await start('tennis',1);
   for(let i=0;i<600;i++){const m=await page.evaluate(()=>{const r=window.__island.games.current?.session.snapshot.renderMetrics;return Boolean(r&&(r.characterLoaded||r.mode==='canvas'));});if(m)break;await tick(100);await page.waitForTimeout(30);}
   await tick(800);const out={mode};let s=await snap();
   const pose=async()=>{const s=await snap(),r=s.renderMetrics.pose25?.[0];return r&&{phase:s.phase,mode:r.mode,w:r.w,racket:r.racket,hand:r.hand,screen:r.screen,dx:r.screen.racket[0]-r.screen.head[0],dy:r.screen.head[1]-r.screen.racket[1]};};
   const clipAt=sc=>({x:Math.max(0,sc.hips[0]-90),y:Math.max(0,sc.hips[1]-95),width:180,height:125});
   const SV=await center('#pass'),tap=async el=>{await touch('touchStart',[{...el,id:2}]);await tick(60);await touch('touchEnd',[]);};
   for(let k=0;k<200&&s.phase!=='serve';k++){await tick(50);s=await snap();}
   const wait=await pose();await capture(`tennis-${mode}-serve-wait`,clipAt(wait.screen));
   // T. The toss: sample every 50 ms up to 600 ms.
   await tap(SV);const toss=[];for(let t=0;t<12;t++){await tick(50);const p=await pose();if(p.phase!=='toss')break;toss.push(p);if(t===3||t===9)await capture(`tennis-${mode}-toss-${(t+1)*50}ms`,clipAt(p.screen));}
   out.serve={wait,toss:toss.map(p=>({mode:p.mode,w:p.w,racket:p.racket,dx:p.dx,dy:p.dy}))};
   for(let k=0;k<200;k++){s=await snap();if(s.phase==='toss'&&s.serveZone==='green')break;await tick(16);}await tap(SV);
   // K. Rally balls steered to the backhand side (player 0: contact.x above his own x) with the stick; record the hold, then hit.
   const H=await center('#shoot'),ST={x:111,y:310};let shots=0,stick=false,caps=0;const holds=[];
   for(let k=0;k<1600&&shots<5;k++){s=await snap();
    if(s.phase==='rally'&&s.contact?.side===0&&s.ball.lastHitter===1){const dx=s.contact.x-s.players[0].x;
     if(dx<.5){const p={x:ST.x-40,y:ST.y,id:3};if(!stick)await touch('touchStart',[{...ST,id:3}]);await touch('touchMove',[p]);stick=true;}else if(stick){await touch('touchEnd',[]);stick=false;}
     if(dx>=.5&&s.contact.eta<.45&&holds.length<=shots){const p=await pose();holds.push({dx:+dx.toFixed(2),...p});if(caps++<2)await capture(`tennis-${mode}-backhand-${caps}`,clipAt(p.screen));}
     if(s.contactWindow?.eligible){if(stick){await touch('touchEnd',[]);stick=false;}await tap(H);await tick(120);shots++;}}
    else if(stick){await touch('touchEnd',[]);stick=false;}
    if(s.phase==='serve'&&s.server===0){await tap(SV);await tick(500);await tap(SV);}
    await tick(16);}
   out.backhand=holds.map(p=>({dx:p.dx,mode:p.mode,w:p.w,racket:p.racket,screenDx:p.dx===undefined?null:p.screen.racket[0]-p.screen.head[0]}));
   out.audio=(await snap()).audioMetrics||{};out.requests=[...requests];
   await leave();return out;};
  const before=await tennis('before'),after=await tennis('after');report.tennis={before,after};console.log('tennis',JSON.stringify(report.tennis));
  const top=t=>t.reduce((m,p)=>Math.max(m,p.racket[1]),0),side=t=>t.reduce((m,p)=>Math.max(m,p.racket[0]),-9),scr=t=>t.reduce((m,p)=>Math.max(m,Math.abs(p.dx)),0);
  const tb=before.serve.toss,ta=after.serve.toss;
  check(ta.some(p=>p.mode==='trophy'&&p.w>.95),`the toss eases into the trophy hold: ${ta.map(p=>p.mode+':'+p.w).join(' ')}`);
  check(top(ta)>=after.serve.wait.racket[1]+.6,`the racket head rises in the toss: ${after.serve.wait.racket[1]} -> ${top(ta)} m (v24.4 ${before.serve.wait.racket[1]} -> ${top(tb)} m)`);
  check(side(ta)>=.7&&scr(ta)>=scr(tb)+8,`out beside the head, clear of the hair: racket ${side(ta)} m to the side, ${scr(ta)} px from the head on screen (v24.4 ${side(tb)} m, ${scr(tb)} px)`);
  const bh=after.backhand.filter(p=>p.mode==='backhand'),bb=before.backhand;
  check(bh.length>=2&&bh.every(p=>p.racket[0]<=-.5),`backhand balls: racket held to the other side ${bh.map(p=>p.racket[0]).join(', ')} m (v24.4 in front: ${bb.map(p=>p.racket?.[0]).join(', ')} m)`);
  check(bb.length>0&&bb.every(p=>Math.abs(p.racket[0])<.2),'v24.4 (?tennisPose=0) keeps the racket in front for those balls');
  const call=after.audio.callouts||{};
  check(call.recorded===true&&after.requests.filter(r=>r.path.endsWith('takes.json')).length>=1&&after.requests.every(r=>r.status<400),`recorded-call hook: takes.json read (${JSON.stringify(after.requests)}), takes ${JSON.stringify(call.takes)} -> the synthesised call stays`);
  check(before.requests.length===0&&before.audio.callouts?.recorded===false,'?tennisCalloutRec=0: the list is not even requested');
 }
 report.fails=fails;failures.push(...fails);return report;
});
if(failures.length){console.error('FAILED',failures);process.exitCode=1;}else console.log('all v24.5 acceptance checks passed');
