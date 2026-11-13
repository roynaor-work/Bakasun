// Aliens v23 (13/11/2026): proof through the real phone path that the two fire buttons each do one predictable thing.
// Island shell (index.html?dev=1 -> games.start), Chromium with hasTouch + isMobile at 844x390 (SwiftShader WebGL), CDP
// Input.dispatchTouchEvent on the real #shoot and #vulcan buttons (and a finger on the flight surface for the bot). No model
// injection: the page is only read (model getters, snapshot, button attributes). Rates are bullets divided by the model's own
// time (the harness runs a fake page.clock). A desktop viewport (1280x720) checks the layout and the keys (Space, Z).
// ?alienFire=v15 is checked through its global switch (the same function reads the URL): one button, the v22 gate.
// Run: PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node workout/island/tests/aliens-v23-browser.mjs
// Exit code non-zero on any failed check; numbers in verification/aliens-v23/browser/verification.json, frames in verification/aliens-v23/frames/.
import {verify} from './night-browser.mjs';
import {mkdir} from 'node:fs/promises';
const frames=new URL('../verification/aliens-v23/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const BOT_CAP_SECONDS=Number(process.env.ALIENS_V23_BOT_CAP||200),SKIP_BOT=process.env.ALIENS_V23_SKIP_BOT==='1';
let failures=[];
await verify('aliens-v23/browser',[{width:844,height:390,isMobile:true},{width:1280,height:720,isMobile:false}],async({page,context,viewport,tick,snap,start,exit,nav})=>{
 const phone=viewport.width===844,tag=phone?'':'desktop-';
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
 const capture=name=>page.screenshot({path:new URL(`v23-${tag}${name}.jpg`,frames).pathname,type:'jpeg',quality:82});
 const fails=[];const check=(ok,text)=>{if(!ok)fails.push(`${viewport.width}: ${text}`);console.log((ok?'PASS ':'FAIL ')+viewport.width+' '+text);};
 const report={viewport:`${viewport.width}x${viewport.height}`,clock:'fake page.clock; rates use model time'};
 const alive=()=>page.evaluate(()=>Boolean(window.__island.games.current));
 const leave=async()=>{if(await alive()){await exit();return;}await tick(1500);await nav();};
 const fresh=async()=>{await start('alienDefense');await page.waitForFunction(()=>window.__island.games.current.session.snapshot.artModels?.loaded===6,{timeout:120000}).catch(()=>{});await tick(1500);};
 /** Read-only probe of the live round: model getters, fire counters and the two buttons as the child sees them. */
 const peek=()=>page.evaluate(()=>{const g=window.__island.games.current;if(!g)return null;const m=g.session.debug.model,s=m.snapshot(),v=document.querySelector('#vulcan'),f=document.querySelector('#shoot');
  return {t:m.time,heat:m.vulcanHeat,locked:m.vulcanLocked,mode:m.fireMode,v23:m.v23,rf:s.regularFired??null,vf:s.vulcanFired??null,pulls:s.steadyShots+s.burstShots,steady:s.steadyShots,burst:s.burstShots,fired:s.fired,overheats:s.overheats,lives:s.lives,
   button:v?{level:v.dataset.level,blink:v.dataset.blink,heat:v.style.getPropertyValue('--heat'),aria:v.getAttribute('aria-label'),held:v.classList.contains('held')}:null,shootHeld:f?.classList.contains('held')??null};});
 const box=sel=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,r:r.x+r.width,b:r.y+r.height};},sel);
 const overlap=(a,b)=>a&&b&&a.x<b.r&&b.x<a.r&&a.y<b.b&&b.y<a.b;

 // A. Layout: two thumb-sized fire buttons in one row, clear of the stick, the missile and the ship's lane, inside the screen.
 await fresh();
 {const [fire,vulcan,missile,stick,zone]=await Promise.all(['#shoot','#vulcan','#pass','#joystick','.soccer-stick-zone'].map(box));const s=await snap();
  const shipTop=(s.player.y-40)*s.viewport.scaleY,captions=await page.evaluate(()=>[...document.querySelectorAll('.alien-fire-caption')].map(n=>({text:n.textContent,size:getComputedStyle(n).fontSize,visible:n.getBoundingClientRect().height>0,b:n.getBoundingClientRect().bottom})));
  report.layout={fire,vulcan,missile,stick,shipTop:+shipTop.toFixed(1),captions};console.log('layout',JSON.stringify(report.layout));
  check(vulcan&&vulcan.w>=56&&vulcan.h>=56&&fire.w>=56,`buttons thumb-sized: fire ${fire?.w}x${fire?.h}, Vulcan ${vulcan?.w}x${vulcan?.h} (>= 56)`);
  check(!overlap(fire,vulcan)&&!overlap(vulcan,missile)&&!overlap(fire,missile),'fire, Vulcan and missile do not overlap');
  check(!overlap(vulcan,stick)&&!overlap(fire,stick)&&!overlap(vulcan,zone),'no fire button over the stick or its touch zone');
  check([fire,vulcan,missile].every(b=>b.b<shipTop)&&captions.every(c=>c.b<=shipTop+1),`all buttons and their captions above the ship's lane (ship top ${shipTop.toFixed(0)} px)`);
  check([fire,vulcan,missile].every(b=>b.x>=0&&b.y>=0&&b.r<=viewport.width&&b.b<=viewport.height),'all buttons inside the screen');
  check(captions.length===2&&captions.every(c=>c.visible&&c.size==='11px'),`captions under the two fire buttons: ${captions.map(c=>c.text).join(', ')}`);
  await capture('1-layout');}

 if(phone){
 // B. Regular button held 8 s: a constant rate every second, from the first one; no heat, no burst, no pause.
 {const fire=await center('#shoot'),s0=await peek();await touch('touchStart',[{...fire,id:1}]);const marks=[];
  for(let sec=1;sec<=8;sec++){await tick(1000);marks.push(await peek());if(sec===4)await capture('2-regular-hold');}
  await touch('touchEnd');
  const per=[];let prev=s0;let maxGap=0;for(const m of marks){per.push(+((m.rf-prev.rf)/(m.t-prev.t)).toFixed(2));prev=m;}
  const r={perSecond:per,overall:+((marks.at(-1).rf-s0.rf)/(marks.at(-1).t-s0.t)).toFixed(2),overheats:marks.at(-1).overheats-s0.overheats,vulcanFired:marks.at(-1).vf-s0.vf,mode:marks[3].mode,heat:marks[3].heat};void maxGap;
  report.regularHold=r;console.log('regular-hold',JSON.stringify(r));
  check(per.every(x=>x>=4.8&&x<=6.4),`regular button, shots per second for 8 s: ${per.join(' ')} (constant 5-6, first second included)`);
  check(r.overheats===0&&r.vulcanFired===0&&r.heat===0,`regular button: no heat, no overheat, no Vulcan (overheats ${r.overheats}, Vulcan ${r.vulcanFired})`);
  await tick(1200);}

 await leave();await fresh();
 // C. Vulcan held 6 s: the gauge climbs green, yellow, red, the Vulcan locks 2 s with a red blink, then opens and fires again.
 {const vul=await center('#vulcan'),rows=[];const shots={};await touch('touchStart',[{...vul,id:2}]);
  for(let i=0;i<190;i++){await tick(32);const p=await peek();if(!p)break;rows.push(p);
   const lvl=p.button.level;if(lvl==='yellow'&&!shots.yellow){shots.yellow=1;await capture('3-vulcan-yellow');}if(lvl==='red'&&!shots.red){shots.red=1;await capture('4-vulcan-red');}
   if(lvl==='lock'&&p.button.blink==='on'&&!shots.on){shots.on=1;await capture('5-vulcan-locked-blink-on');}if(lvl==='lock'&&p.button.blink==='off'&&!shots.off){shots.off=1;await capture('6-vulcan-locked-blink-off');}
   if(shots.on&&!p.locked&&p.vf>rows.find(r=>r.locked).vf&&!shots.reopen){shots.reopen=1;await capture('7-vulcan-open-again');}}
  await touch('touchEnd');
  const first=rows.findIndex(r=>r.locked),lockRows=first>=0?rows.slice(first,rows.findIndex((r,i)=>i>first&&!r.locked)):[],seq=[];for(const r of rows)if(seq.at(-1)!==r.button.level)seq.push(r.button.level);
  const lockSeconds=lockRows.length?+(lockRows.at(-1).t-lockRows[0].t+.032).toFixed(2):null,openRows=rows.slice(0,first),rate=first>0?+((rows[first].vf-rows[0].vf)/(rows[first].t-rows[0].t)).toFixed(2):null;
  const r={levels:seq,lockSeconds,vulcanRate:rate,firedAtLock:first>=0?rows[first].vf:null,blinkStates:[...new Set(lockRows.map(x=>x.button.blink))],ariaLocked:lockRows[0]?.button.aria,heatCss:openRows.map(x=>x.button.heat).filter((x,i,a)=>a.indexOf(x)===i).slice(0,6),vulcanAfter:rows.at(-1).vf,regularFired:rows.at(-1).rf-rows[0].rf,firedDuringLock:lockRows.length?lockRows.at(-1).vf-lockRows[0].vf:null};
  report.vulcanHold=r;console.log('vulcan-hold',JSON.stringify(r));
  check(seq.join(',').startsWith('green,yellow,red,lock,green'),`Vulcan gauge on the button: ${seq.join(' > ')}`);
  check(rate!==null&&rate>=8.5&&rate<=11,`Vulcan rate while open: ${rate}/s`);
  check(lockSeconds!==null&&Math.abs(lockSeconds-2)<=.12,`locked ${lockSeconds} s after the gauge filled`);
  check(r.firedDuringLock===0,'no Vulcan bullet while locked');
  check(r.blinkStates.includes('on')&&r.blinkStates.includes('off'),`red blink while locked (${r.blinkStates})`);
  check(/מתקרר/.test(r.ariaLocked||''),`the button says it is cooling: ${r.ariaLocked}`);
  check(r.vulcanAfter>r.firedAtLock,'the Vulcan opens and fires again');check(r.regularFired===0,'the Vulcan button never fires the regular cannon');
  await tick(2500);}

 await leave();await fresh();
 // D. Two fingers, two buttons: both work; the regular keeps its rate through the Vulcan's stream and its lock.
 {const fire=await center('#shoot'),vul=await center('#vulcan'),rows=[];await touch('touchStart',[{...fire,id:1}]);await touch('touchStart',[{...fire,id:1},{...vul,id:2}]);
  for(let i=0;i<200;i++){await tick(32);const p=await peek();if(!p)break;rows.push(p);if(i===20)await capture('8-both-fingers');if(p.locked&&!rows.some((r,k)=>k<rows.length-1&&r.locked))await capture('9-both-vulcan-locked');}
  const held=await peek();
  // Lift only the Vulcan finger (CDP touchEnd lists the points that are lifted): the regular finger keeps firing.
  await touch('touchEnd',[{...vul,id:2}]);await tick(32);const afterLift=await peek();await tick(1000);const later=await peek();await touch('touchEnd');
  let lockShots=0,lockTime=0,openPulls=0,openTime=0;for(let i=1;i<rows.length;i++){const dt=rows[i].t-rows[i-1].t;if(rows[i].locked){lockShots+=rows[i].rf-rows[i-1].rf;lockTime+=dt;}else{openPulls+=rows[i].pulls-rows[i-1].pulls;openTime+=dt;}}
  const span=rows.at(-1).t-rows[0].t,r={seconds:+span.toFixed(2),regularRate:+((rows.at(-1).rf-rows[0].rf)/span).toFixed(2),vulcanFired:rows.at(-1).vf-rows[0].vf,overheats:rows.at(-1).overheats-rows[0].overheats,regularRateDuringLock:lockTime?+(lockShots/lockTime).toFixed(2):null,lockTime:+lockTime.toFixed(2),streamRate:openTime?+(openPulls/openTime).toFixed(2):null,bothHeld:held.shootHeld&&held.button.held,afterLift:{shootHeld:afterLift.shootHeld,vulcanHeld:afterLift.button.held},regularAfterLift:+((later.rf-afterLift.rf)/(later.t-afterLift.t)).toFixed(2)};
  report.bothFingers=r;console.log('both-fingers',JSON.stringify(r));
  check(r.bothHeld===true,'both buttons held at once (two fingers)');
  check(Math.abs(r.regularRate-5.56)<=.6,`regular rate with the Vulcan also held: ${r.regularRate}/s (alone 5.56)`);
  check(r.vulcanFired>0&&r.overheats>=1,`the Vulcan fires and overheats meanwhile (${r.vulcanFired} bullets, ${r.overheats} locks)`);
  check(r.regularRateDuringLock!==null&&Math.abs(r.regularRateDuringLock-5.56)<=.8,`regular fire during the Vulcan lock: ${r.regularRateDuringLock}/s over ${r.lockTime} s`);
  check(r.streamRate!==null&&r.streamRate<=10.6,`both together never beat the Vulcan alone: ${r.streamRate} trigger pulls/s while it runs`);
  check(r.afterLift.shootHeld===true&&r.afterLift.vulcanHeld===false&&r.regularAfterLift>=4.5,`lifting the Vulcan finger keeps the regular finger firing (${r.regularAfterLift}/s)`);
  await tick(2500);}

 // E. Fast taps on the Vulcan (40 ms down, 60 up) cannot dodge the heat.
 await leave();await fresh();
 {const vul=await center('#vulcan'),s0=await peek();let lockAt=null,elapsed=0;
  while(elapsed<4000&&await alive()){await touch('touchStart',[{...vul,id:3}]);await tick(40);await touch('touchEnd');await tick(60);elapsed+=100;const p=await peek();if(lockAt===null&&p.locked){lockAt=+(p.t-s0.t).toFixed(2);await capture('10-vulcan-taps-locked');}}
  const s1=await peek(),r={pattern:'40/60 ms',lockAfter:lockAt,vulcanRate:+((s1.vf-s0.vf)/(s1.t-s0.t)).toFixed(2),overheats:s1.overheats-s0.overheats};report.vulcanTaps=r;console.log('vulcan-taps',JSON.stringify(r));
  check(lockAt!==null&&lockAt<=2,`taps on the Vulcan still fill the gauge and lock it (after ${lockAt} s)`);check(r.vulcanRate<=10.2,`taps never beat 10/s (${r.vulcanRate}/s)`);
  await tick(2500);}

 // F. ?alienFire=v15 restores v22: no second button, and one button bursts, cools and settles.
 await leave();await page.evaluate(()=>{globalThis.__alienFire='v15';});await fresh();
 {const exists=await page.locator('#vulcan').count(),fire=await center('#shoot'),s0=await snap();await touch('touchStart',[{...fire,id:1}]);await tick(900);const burst=await snap();await capture('11-flag-v15-burst');await tick(2600);const cool=await snap();await tick(2500);const steady=await snap();await touch('touchEnd');
  const r={vulcanButtons:exists,v23:'v23' in steady,overheats:steady.overheats-s0.overheats,burstPhase:+((burst.fired-s0.fired)/(burst.time-s0.time)).toFixed(2),steady:+((steady.fired-cool.fired)/(steady.time-cool.time)).toFixed(2)};
  report.flagV15=r;console.log('flag-v15',JSON.stringify(r));
  check(r.vulcanButtons===0&&r.v23===false,'?alienFire=v15: no Vulcan button, no v23 state');check(r.overheats===1&&r.burstPhase>=8&&r.steady>=4.5&&r.steady<=6.5,`?alienFire=v15: the v22 burst, cool-down and steady fire (overheats ${r.overheats}, burst ${r.burstPhase}/s, then ${r.steady}/s)`);}
 await leave();await page.evaluate(()=>{globalThis.__alienFire=undefined;});

 // G. A good player through the real controls, both buttons: a finger on the flight surface, the regular button held all the time,
 //    the Vulcan held whenever it is open. Stage 1 should still take about 90-100 s (not "in a second").
 if(!SKIP_BOT){await fresh();await page.evaluate(()=>{window.__island.games.current.session.debug.view?.degrade(true);});await tick(200);
  const fire=await center('#shoot'),vul=await center('#vulcan');let s=await snap();const t0=s.time,ship0=s.player.x,perPx=s.viewport.modelWidth/844,startX=422,fingerY=150,finger=x=>({x:Math.max(2,Math.min(842,Math.round(startX+(x-ship0)/perPx))),y:fingerY,id:1});let last=s,steps=0;
  await touch('touchStart',[finger(ship0)]);await touch('touchStart',[finger(ship0),{...fire,id:2}]);await touch('touchStart',[finger(ship0),{...fire,id:2},{...vul,id:3}]);
  while(s&&!s.result&&s.time-t0<BOT_CAP_SECONDS){
   const plan=await page.evaluate(()=>{const g=window.__island.games.current;if(!g)return null;const m=g.session.debug.model;const t=m.aliens.filter(a=>a.entry<=0).sort((a,b)=>b.y-a.y)[0]||m.aliens[0];const py=m.player.y,cross=[];for(const b of m.bolts){const vy=b.vy||1,tt=(py-b.y)/vy;if(tt>0&&tt<1.4)cross.push(b.x+(b.vx||0)*tt);}for(const a of m.aliens)if(a.diveAge>=0&&a.y<py)cross.push(a.x);let want=t?t.x:m.player.x;const safe=x=>cross.every(c=>Math.abs(c-x)>36);if(!safe(want)){out:for(let d=0;d<=844;d+=8)for(const sg of[1,-1]){const x=m.player.x+sg*d;if(x>20&&x<824&&safe(x)){want=x;break out;}}}return {dx:want-m.player.x,px:m.player.x};});
   if(!plan)break;await touch('touchMove',[finger(plan.px+plan.dx),{...fire,id:2},{...vul,id:3}]);await tick(100);last=s;s=await snap();steps++;
  }
  await touch('touchEnd');const end=s||last;
  const won=end.result?.outcome==='win'||(!s&&await page.evaluate(()=>(window.__island.engine.state.minigameWins.alienDefense||0)>0));
  const r={stageSeconds:+(end.time-t0).toFixed(1),outcome:won?'win':end.result?.outcome||(s?'running':'ended'),fired:end.fired,regularFired:end.regularFired,vulcanFired:end.vulcanFired,overheats:end.overheats,kills:end.kills,livesLeft:end.lives,maxLives:end.maxLives,steps,shotsPerSecond:+(end.fired/Math.max(1,end.time-t0)).toFixed(2)};
  report.botBoth=r;console.log('bot-both-buttons',JSON.stringify(r));
  check(r.outcome==='win',`bot with both buttons wins stage 1 (${r.outcome})`);check(r.stageSeconds>=85&&r.stageSeconds<=130,`stage 1 with both buttons lasts ${r.stageSeconds} s (85-130: the Vulcan helps, it does not end the stage in a second)`);
  check(r.vulcanFired>0&&r.overheats>=5,`the bot really used the Vulcan (${r.vulcanFired} bullets, ${r.overheats} locks)`);
  await tick(300);await capture('12-bot-stage-end');await leave();}
 }else{
 // Desktop: Space = regular cannon, Z = Vulcan, both at once.
 await page.locator('canvas.minigame-canvas').focus();
 {const s0=await peek();await page.keyboard.down('Space');await tick(3000);const a=await peek();await page.keyboard.up('Space');await tick(1500);
  const b0=await peek();await page.keyboard.down('KeyZ');await tick(900);const b=await peek();await capture('2-keyboard-z');await page.keyboard.up('KeyZ');await tick(2500);
  const c0=await peek();await page.keyboard.down('Space');await page.keyboard.down('KeyZ');await tick(3000);const c=await peek();await page.keyboard.up('KeyZ');await page.keyboard.up('Space');
  const r={spaceRegular:+((a.rf-s0.rf)/(a.t-s0.t)).toFixed(2),spaceVulcan:a.vf-s0.vf,zVulcan:b.vf-b0.vf,zRegular:b.rf-b0.rf,zHeat:+b.heat.toFixed(2),bothRegular:+((c.rf-c0.rf)/(c.t-c0.t)).toFixed(2),bothVulcan:c.vf-c0.vf};
  report.keyboard=r;console.log('keyboard',JSON.stringify(r));
  check(Math.abs(r.spaceRegular-5.56)<=.6&&r.spaceVulcan===0,`Space = regular cannon only (${r.spaceRegular}/s)`);check(r.zVulcan>=7&&r.zRegular===0&&r.zHeat>0,`Z = Vulcan only (${r.zVulcan} bullets, heat ${r.zHeat})`);
  check(Math.abs(r.bothRegular-5.56)<=.6&&r.bothVulcan>0,`Space + Z together: regular ${r.bothRegular}/s and the Vulcan`);}
 await leave();
 }
 report.fails=fails;failures.push(...fails);
 return report;
});
if(failures.length){console.error('FAILED',failures);process.exitCode=1;}else console.log('all v23 acceptance checks passed');
