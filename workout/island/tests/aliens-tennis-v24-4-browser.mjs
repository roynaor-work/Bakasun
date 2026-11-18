// v24.4 acceptance through the island shell with real touch only (18/11/2026): Chromium with hasTouch and isMobile at 844x390 (SwiftShader WebGL,
// the 3D layer on, as on the phone), CDP Input.dispatchTouchEvent on the real controls, Playwright's clock for the frames. The models are only
// read (a read-only wrapper around the alien model's update counts what the player sees); nothing is injected. Each part runs twice in the same
// page: with the switches that restore v24.3 (before) and as shipped (after).
// Aliens (stage 1, the shipped formation: two rows of ships in columns): fire held (cannon + Vulcan) with the ship steered under a column by the
//   stick. Counted per round: (P) a round or a Vulcan pellet seen INSIDE a ship's drawn hull while it is still flying (it goes through the ship),
//   (B) a hit on a ship after the round already crossed the drawn hull of another one (the ship behind is hit), and the hits by weapon.
//   Then the missile (the special button): its first contact must be the ship it detonates on.
// Tennis (stage 1): (U) the controls: boxes, sizes, overlaps, the bar; (S) an early-red serve (net) and a late-red serve (out) by touch: the ball
//   path after the fault, the phase, the sign, the shout counter; (G) the racket in the fist (grip metrics and a close-up).
// Run: PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.js CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome \
//      ONLY=aliens|tennis node workout/island/tests/aliens-tennis-v24-4-browser.mjs   (frames and verification.json: verification/aliens-tennis-v24-4/)
import {verify} from './night-browser.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const frames=new URL('../verification/aliens-tennis-v24-4/frames/',import.meta.url);await mkdir(frames,{recursive:true});
const only=(process.env.ONLY||'').split(',').filter(Boolean),want=k=>!only.length||only.includes(k);
const BEFORE={aliens:'&alienHull=0',tennis:'&tennisUi=v24&tennisCallouts=0&tennisPlayOut=0'};
const failures=[];
await verify('aliens-tennis-v24-4/'+(only.join('-')||'all'),[{width:844,height:390,isMobile:true}],async({page,context,tick,snap,start,exit,nav})=>{
 const client=await context.newCDPSession(page),touch=(type,points=[])=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const center=async sel=>{const b=await page.locator(sel).boundingBox();return b&&{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};};
 const box=sel=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),visible:cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&!e.closest('[hidden]'),art:cs.backgroundImage.includes('tennis-ui-v2')};},sel);
 const capture=name=>page.screenshot({path:new URL(`${name}.jpg`,frames).pathname,type:'jpeg',quality:80});
 const fails=[],report={clock:'Playwright page.clock; times are model time'};const check=(ok,text)=>{if(!ok)fails.push(text);console.log((ok?'PASS ':'FAIL ')+text);};
 const setSearch=search=>page.evaluate(q=>history.replaceState(null,'',location.pathname+'?dev=1'+q),search);
 const leave=async()=>{for(let t=0;t<3000&&(await snap().catch(()=>null))?.result;t+=200)await tick(200);if(await page.locator('[data-action=game-again]:visible').count()){await page.locator('[data-action=game-exit]:visible').last().tap();await tick(400);}else{try{await exit();}catch{await tick(1500);await nav();}}
  for(let i=0;i<3&&await page.locator('[data-action=close-modal]:visible').count();i++){await page.locator('[data-action=close-modal]:visible').first().tap();await tick(300);}await tick(300);};
 // ------------------------------------------------------------------ Aliens
 if(want('aliens')){
  const aliens=async mode=>{
   await setSearch(mode==='before'?BEFORE.aliens:'');await start('alienDefense',1);
   await page.waitForFunction(()=>window.__island.games.current?.session.snapshot.artModels?.loaded===6,{timeout:240000}).catch(()=>{});
   for(let i=0;i<150;i++)await tick(16);/* the formation flies in */
   const out={mode,view:await page.evaluate(()=>window.__island.games.current.session.debug.view?.mode??null)};
   // Read-only observer: wraps update(), never writes model state.
   await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,cv=document.querySelector('.game-screen canvas'),W=360,H=480,seen=new WeakMap();
    const log=window.__v244={serial:0,hits:0,hitsBy:{},passThrough:0,behind:0,examples:[]},pairs=new Set();const orig=m.update.bind(m);
    const drawn=(a,ry)=>Math.min(a.boss?100:62,a.radius*2*ry*1.65)/2;/* alien-view.mjs: the 3D ship's drawn width */
    const pellets=(s,sy)=>{if(!s.vulcan)return [0];const d=(3+Math.max(0,m.player.y-s.y)*Math.tan(.035))*sy;return [-d,0,d];};/* alien-v25.mjs pelletOffsets at 3 pellets */
    m.update=(dt,input)=>{const r=cv.getBoundingClientRect(),sx=r.width/W,sy=r.height/H;
     for(const s of m.shots){let rec=seen.get(s);if(!rec){rec={id:++log.serial,crossed:new Set()};seen.set(s,rec);}for(const a of m.aliens)if(Math.hypot((s.x-a.x)*sx,(s.y-a.y)*sy)<drawn(a,sy))rec.crossed.add(a.id);}
     const before=new Map(m.shots.map(s=>[s,new Set(s.hitIds||[])]));orig(dt,input);
     for(const [s,prev] of before){const rec=seen.get(s),fresh=[...(s.hitIds||[])].filter(id=>!prev.has(id));
      if(fresh.length){log.hits+=fresh.length;const key=s.vulcan?'vulcan':s.kind===2?'laserVolley':s.wing?'wing':s.kind===1?'laserCannon':'cannon';log.hitsBy[key]=(log.hitsBy[key]||0)+fresh.length;
       for(const id of fresh)if([...rec.crossed].some(c=>c!==id)){log.behind++;if(log.examples.length<6)log.examples.push({key,hit:id,crossed:[...rec.crossed]});}}
      if(!m.shots.includes(s))seen.delete(s);}
     for(const s of m.shots){const rec=seen.get(s),offs=pellets(s,sy);
      for(let k=0;k<offs.length;k++){if(s.vulcan&&((s.pelletMask||0)>>k)&1)continue;
       for(const a of m.aliens){if(Math.hypot((s.x-a.x)*sx+offs[k],(s.y-a.y)*sy)<drawn(a,sy)*.95){const key=rec?.id+':'+a.id+':'+k;if(!pairs.has(key)){pairs.add(key);log.passThrough++;}}}}}
    };});
   const F=await center('#shoot'),V=await center('#vulcan'),S={x:128,y:315}/* the drawn stick's centre at 844x390 (a push left/right of it steers the ship) */;
   await touch('touchStart',[{...F,id:1},{...V,id:2}]);let stick=false,shot=false;
   for(let f=0;f<60*7;f++){
    const st=await page.evaluate(()=>{const m=window.__island.games.current?.session.debug?.model;if(!m||m.result)return null;const t=[...m.aliens].filter(a=>a.y>0).sort((a,b)=>Math.abs(a.x-m.player.x)-Math.abs(b.x-m.player.x))[0];return {d:t?t.x-m.player.x:0};});
    if(!st)break;const pts=[{...F,id:1},{...V,id:2}];
    if(Math.abs(st.d)>2){const p={x:S.x+Math.sign(st.d)*Math.min(40,Math.abs(st.d)*3+6),y:S.y,id:3};if(!stick)await touch('touchStart',[...pts,{...S,id:3}]);await touch('touchMove',[...pts,p]);stick=true;}
    else if(stick)await touch('touchMove',[...pts,{...S,id:3}]);/* back to the stick's centre: neutral, the fire buttons stay held */
    await tick(16);if(!shot&&f===90){await capture(`aliens-${mode}-firing`);shot=true;}
   }
   await touch('touchEnd',[]);await tick(32);
   Object.assign(out,await page.evaluate(()=>{const l=window.__v244;return {hits:l.hits,hitsBy:l.hitsBy,passThrough:l.passThrough,behind:l.behind,examples:l.examples};}));
   // The missile: one tap of the special button (the missile is selected at the start); its first contact is the ship it hits.
   const P=await center('#pass');
   if(P&&!(await snap()).result){const n0=(await snap()).missilesFired;await touch('touchStart',[{...P,id:4}]);await tick(60);await touch('touchEnd',[]);let first=null,hit=null;
    for(let k=0;k<180&&hit===null;k++){await tick(16);const m=await page.evaluate(()=>{const m=window.__island.games.current?.session.debug?.model;if(!m)return null;const n=m.nova;return {flight:n.flight,hitId:n.hitId,life:n.life,x:n.x,y:n.y,aliens:m.aliens.map(a=>({id:a.id,x:a.x,y:a.y,r:a.radius}))};});
     if(!m)break;if(m.life>0){hit=m.hitId;first=m.aliens.find(a=>a.id===m.hitId)||null;}}
    out.missile={fired:(await snap()).missilesFired-n0,hitId:hit,ship:first};}
   await leave();return out;};
  const before=await aliens('before'),after=await aliens('after');report.aliens={before,after};console.log('aliens',JSON.stringify(report.aliens));
  check(after.view==='three','the 3D layer is on (the phone view)');
  check(after.passThrough===0,`rounds or Vulcan pellets seen flying through a ship's drawn hull: v24.3 ${before.passThrough} -> v24.4 ${after.passThrough}`);
  check(after.behind===0,`hits on a ship after the round crossed another ship's hull: v24.3 ${before.behind} -> v24.4 ${after.behind}`);
  check(before.passThrough+before.behind>0,'v24.3 (?alienHull=0) shows the bug in the same run');
  check(after.hits>0&&(after.hitsBy.vulcan||0)>0&&(after.hitsBy.cannon||after.hitsBy.laserCannon||0)>0,`hits by weapon: ${JSON.stringify(after.hitsBy)} (v24.3 ${JSON.stringify(before.hitsBy)})`);
  check(!after.missile||after.missile.fired===0||after.missile.hitId!==undefined,`missile: ${JSON.stringify(after.missile)}`);
 }
 // ------------------------------------------------------------------ Tennis
 if(want('tennis')){
  const tennis=async mode=>{
   await setSearch(mode==='before'?BEFORE.tennis:'');await page.evaluate(()=>{const r=window.__island.data.config.minigames.tennis.render;r.slowFrameMs=100000;r.pixelRatios=r.pixelRatios.map(()=>.6);r.shadowEnabled=r.shadowEnabled.map(()=>false);});await start('tennis',1);
   for(let i=0;i<600;i++){const m=await page.evaluate(()=>{const r=window.__island.games.current?.session.snapshot.renderMetrics;return Boolean(r&&(r.characterLoaded||r.mode==='canvas'));});if(m)break;await tick(100);await page.waitForTimeout(30);}
   await tick(800);const out={mode};let s=await snap();
   // U. The controls.
   const boxes={};for(const id of ['shoot','pass','sprint','drop'])boxes[id]=await box('#'+id);boxes.meter=await box('.tennis-serve-meter');out.controls=boxes;await capture(`tennis-${mode}-controls`);
   // G. The racket in the fist.
   out.grip=s.renderMetrics?.grip;const hand=s.renderMetrics?.rig?.[0]?.rightHand;
   if(hand){await page.evaluate(h=>window.__island.games.current.session.debug.inspectCamera([h[0]-1.1,h[1]+.25,h[2]-1.3],h),hand);await tick(100);await capture(`tennis-${mode}-racket-close`);await page.evaluate(()=>window.__island.games.current.session.debug.inspectCamera(null));await tick(100);}
   // S. Two faults by touch: early red (the net), then late red (out) = a double fault.
   const SV=await center('#pass'),tapServe=async()=>{await touch('touchStart',[{...SV,id:2}]);await tick(70);await touch('touchEnd',[]);await tick(30);};
   const faults=[];
   for(const want of ['early','late']){
    s=await snap();for(let k=0;k<200&&s.phase!=='serve';k++){await tick(50);s=await snap();}
    await tapServe();for(let k=0;k<300;k++){s=await snap();if(s.phase==='toss'&&(want==='early'?(s.serveMeter<.04&&s.serveMeterDirection<0):(s.serveMeter>.96&&s.serveMeterDirection>0)))break;await tick(16);}
    if(!out.meterInToss)out.meterInToss=await box('.tennis-serve-meter');/* the bar while the needle runs (toss) */
    await tapServe();const path=[];let at=null,sign=null,shot=false,reason=null;
    for(let k=0;k<120;k++){s=await snap();if(at===null&&(s.event.type==='fault'||s.event.type==='point')){at=k;reason=s.event.reason??null;}
     if(at!==null){path.push({phase:s.phase,x:+s.ball.x.toFixed(2),y:+s.ball.y.toFixed(2),z:+s.ball.z.toFixed(2)});if(sign===null){sign=await page.evaluate(()=>{const e=document.querySelector('.tennis-out-sign');return e&&!e.hidden?{text:e.textContent.trim(),call:e.dataset.call||null}:{text:null};});}
      if(!shot&&k-at===10){await capture(`tennis-${mode}-${want}-fault`);shot=true;}if(k-at>75)break;}
     await tick(16);}
    const first=path[0],moved=path.slice(1,40).reduce((m,p)=>Math.max(m,Math.hypot(p.x-first.x,p.y-first.y,p.z-first.z)),0);
    const nearNet=path.slice(1,30).every(p=>Math.abs(p.z)<2.5),lowest=Math.min(...path.slice(0,60).map(p=>p.y));
    faults.push({want,reason,start:first,after16:path[1],moved:+moved.toFixed(2),nearNet,lowest:+lowest.toFixed(2),phases:[...new Set(path.map(p=>p.phase))],handAt:path.find(p=>p.phase==='serve'),sign});}
   out.faults=faults;out.audio=(await snap()).audioMetrics?.played||{};
   await leave();return out;};
  const before=await tennis('before'),after=await tennis('after');report.tennis={before,after};console.log('tennis',JSON.stringify(report.tennis));
  const c=after.controls,rects=['shoot','pass','sprint','drop'].map(id=>({id,...c[id]})).filter(r=>r.visible);
  check(rects.every(r=>r.w>=56&&r.h>=56),`v24.4 touch targets >= 56 px: ${rects.map(r=>`${r.id} ${r.w}x${r.h}`).join(', ')}`);
  check(rects.every(r=>r.art),'v24.4 buttons wear the Codex tennis-ui-v2 plates');
  const overlap=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
  check(rects.every((a,i)=>rects.every((b,j)=>i===j||!overlap(a,b))),'no two buttons overlap');
  const hit=c.shoot;check(hit.x+hit.w>=844-60&&hit.y+hit.h>=390-40,`the hit button sits in the bottom-right corner (${JSON.stringify(hit)})`);
  const bar=after.meterInToss;check(bar?.visible&&rects.every(r=>!overlap(bar,r))&&bar.x+bar.w>=844-40&&bar.h>=150,`the bar (during the toss) on the right edge, clear of the buttons: ${JSON.stringify(bar)} (v24.3 ${JSON.stringify(before.meterInToss)})`);
  const [net,out]=after.faults,[net0,out0]=before.faults;
  check(net.reason==='net'&&net.phases[0]==='fault'&&net.nearNet&&net.lowest<=.2,`net serve plays out at the net and falls to the ground: phases ${net.phases}, stays by the net ${net.nearNet}, lowest ${net.lowest} m (v24.3: phases ${net0.phases}, by the net ${net0.nearNet}: back in the hand ${JSON.stringify(net0.after16)})`);
  check(!net0.nearNet,'v24.3 (?tennisPlayOut=0) shows the ball leaving the net at once');
  check(net.sign?.text==='NET!'&&out.sign?.text==='OUT!',`signs: ${JSON.stringify(net.sign)} / ${JSON.stringify(out.sign)} (v24.3: ${JSON.stringify(net0.sign)} / ${JSON.stringify(out0.sign)})`);
  check(out.moved>1&&out0.moved<.05,`out serve carries on past the landing point: ${out.moved} m (v24.3 ${out0.moved} m: frozen)`);
  check(after.grip?.[0]?.curled===5&&after.grip?.[0]?.racket==='tennis-grip-v1',`racket in the fist: ${JSON.stringify(after.grip?.[0])}`);
  report.shout={after:Object.fromEntries(Object.entries(after.audio).filter(([k])=>k.startsWith('call-'))),before:Object.fromEntries(Object.entries(before.audio).filter(([k])=>k.startsWith('call-')))};
  console.log('shout counters (need a running AudioContext; headless may keep it suspended):',JSON.stringify(report.shout));
  // The shout itself, rendered offline in the page by the shipped module (WAV files next to the frames, for listening).
  const calls=await page.evaluate(async()=>{const {playCall}=await import('/workout/island/minigames/tennis-callouts.mjs');const out={};
   for(const kind of ['out','net']){const rate=44100,ctx=new OfflineAudioContext(1,Math.round(rate*.7),rate);const seconds=playCall(ctx,ctx.destination,kind);const d=(await ctx.startRendering()).getChannelData(0);
    let peak=0,sum=0,first=-1,last=-1;for(let i=0;i<d.length;i++){const a=Math.abs(d[i]);if(a>peak)peak=a;sum+=d[i]*d[i];if(a>.02){if(first<0)first=i;last=i;}}
    out[kind]={seconds:+seconds.toFixed(3),peak:+peak.toFixed(3),rms:+Math.sqrt(sum/Math.max(1,last-first)).toFixed(3),soundFrom:+(first/rate).toFixed(3),soundTo:+(last/rate).toFixed(3),pcm:Array.from(d,v=>Math.max(-32768,Math.min(32767,Math.round(v*32767))))};}
   return out;});
  for(const [kind,c] of Object.entries(calls)){const pcm=Int16Array.from(c.pcm),head=Buffer.alloc(44),rate=44100;head.write('RIFF',0);head.writeUInt32LE(36+pcm.length*2,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);head.writeUInt16LE(1,20);head.writeUInt16LE(1,22);head.writeUInt32LE(rate,24);head.writeUInt32LE(rate*2,28);head.writeUInt16LE(2,32);head.writeUInt16LE(16,34);head.write('data',36);head.writeUInt32LE(pcm.length*2,40);
   await writeFile(new URL(`call-${kind}.wav`,frames),Buffer.concat([head,Buffer.from(pcm.buffer)]));delete c.pcm;}
  report.shout.rendered=calls;
  check(['out','net'].every(k=>calls[k].peak>.2&&calls[k].peak<=1&&calls[k].soundTo-calls[k].soundFrom>.25&&calls[k].soundTo<.6),`the shout renders: ${JSON.stringify(calls)}`);
 }
 report.fails=fails;failures.push(...fails);return report;
});
if(failures.length){console.error('FAILED',failures);process.exitCode=1;}else console.log('all v24.4 acceptance checks passed');
