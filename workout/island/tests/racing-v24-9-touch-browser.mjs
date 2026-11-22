// racing-v24.9 browser proof: Chromium/SwiftShader, phone viewport 844x390, hasTouch + isMobile, REAL touch through CDP Input.dispatchTouchEvent (the harness of
// racing-v24-7-touch-browser.mjs); the race state is only READ.
//  drift  (default) stage RV249_STAGE (default 10, fourteen tight corners): gas finger down, the wheel finger follows the road, the drift finger goes down on the
//         "דריפט" button whenever the car pushes wide in a corner (and the brake finger only when the car is too fast even for a slide). Checked every frame of
//         the race: no element with text lies over the road (ROAD, the middle of the screen), nothing about tyres is on the screen outside the pit lane, and the
//         drift button is on the screen clear of the other controls. Checked once: the car really drifted from the finger (player.drifting), with tyre smoke and
//         skid marks in the scene (renderMetrics.effects), the one-time tip showed and left, a corner chip showed. Screenshots: grid, a drift, a chip.
//  pit    the same drive for PIT_AFTER seconds (the automatic stop of this lap is armed by then: the moment v24.8 showed its caption; screenshot "armed"), then
//         the car is SET DOWN 330 m before the end of the lap (the only write to the race state, so the check does not need a whole lap of software rendering)
//         and drives into the pit lane by itself: the tyre meter and every tyre text are hidden up to the pit entry and shown in the pit lane (screenshot "pit")
//  old    the pit flow with ?racingText=old&racingTyreHud=old&racingDrift=0: the v24.8 screen for the comparison screenshots (the checks are counted, not asserted)
// Usage: CHROMIUM_PATH=... PLAYWRIGHT_MODULE=... [RV249_SCENARIO=drift|pit|old] [RV249_QUERY=...] node workout/island/tests/racing-v24-9-touch-browser.mjs
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verify} from './night-browser.mjs';
const scenario=process.env.RV249_SCENARIO||'drift',old=scenario==='old',extra=[old?'racingText=old&racingTyreHud=old&racingDrift=0':'',process.env.RV249_QUERY||''].filter(Boolean).join('&');
const part=process.env.RV249_PART||'racing-v24-9/'+scenario,FPS=30,FRAME=Math.round(1000/FPS),stage=Number(process.env.RV249_STAGE)||10,seconds=Number(process.env.RV249_SECONDS)||(scenario==='drift'?24:45),PIT_AFTER=7,pitFlow=scenario!=='drift';
const dir=fileURLToPath(new URL(`../verification/${part}/`,import.meta.url));await mkdir(dir,{recursive:true});
// the road in the 844x390 picture: the middle of the screen between the timing tower on the left and the minimap and buttons on the right, under the top HUD row
const ROAD={x0:.27,x1:.66,y0:.2,y1:1};
const T0=Date.now(),say=m=>console.error(`[${Math.round((Date.now()-T0)/1000)}s] ${m}`);
await verify(part,[{width:844,height:390,isMobile:true}],async({page,context,tick,snap,assert,ready,nav,shot})=>{
 say('island open');page.on('console',m=>{if(m.type()!=='log')say('console '+m.type()+': '+m.text().slice(0,300));});
 await page.evaluate(q=>{history.replaceState(null,'',location.pathname+'?dev=1'+(q?'&'+q:''));},extra);
 await page.evaluate(()=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;try{localStorage.setItem('island.sound','on');localStorage.removeItem('island.racing.driftTip');}catch{}});
 const cdp=await context.newCDPSession(page);
 await page.evaluate(n=>{const e=window.__island.engine;e.state.money=Math.max(e.state.money||0,100000);const pr=e.state.minigameProgress.islandRacing;if(pr)pr.stage=Math.max(pr.stage||1,30);window.__island.games.start('islandRacing',undefined,n);},stage);await tick(100);
 if(await page.locator('[data-action=game-understood]').count()){await tick(32);await page.locator('[data-action=game-understood]').tap();}
 for(let i=0;i<600&&!await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>1);i++){await tick(100);await page.waitForTimeout(100);if(i%50===49)say('still loading');}
 say('first frames');await ready();await tick(100);await nav();
 if(await page.locator('[data-action=racing-intro-go]').count()){await page.locator('[data-action=racing-intro-go]').tap();await tick(32);}
 await shot('grid');
 await page.evaluate(ms=>{if(!window.__rv249raf){window.__rv249raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),ms);}},FRAME);
 await page.evaluate(road=>{const s=window.__island.games.current.session,m=s.debug.model,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));window.__log=[];const step=m.step;m.step=(dt,i)=>{const r=step(dt,i);for(const e of m.state.events)if(e.car==='player'&&['driftEnd','crash','crashRecover','pitIn','pitDone','ersFull','lap'].includes(e.type))window.__log.push({t:+m.state.time.toFixed(2),type:e.type,gain:e.gain,seconds:e.seconds,clean:e.clean});return r;};
  const screen=document.querySelector('.game-screen[data-game=islandRacing]');
  const visible=el=>{if(!el.checkVisibility({opacityProperty:true,visibilityProperty:true}))return false;const r=el.getBoundingClientRect();return r.width>1&&r.height>1&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;};
  const ownText=el=>[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim();
  // every visible element that carries its own text (sr-only status lines of 1 px are not visible). The instruments are not messages: the speedometer, the gear
  // dial and the ERS meter with its label stay where they were, at the bottom beside the buttons (gauge:true; reported, not asserted)
  window.__texts=()=>{const out=[];for(const el of screen.querySelectorAll('*')){const text=ownText(el);if(!text||!visible(el))continue;const gauge=!!el.closest('.racing-readout,.racing-gearbox,.racing-gear-dial,.racing-energy');const r=el.getBoundingClientRect();out.push({gauge,cls:String(el.className||el.tagName).slice(0,40),text:text.slice(0,40),x0:r.left,x1:r.right,y0:r.top,y1:r.bottom});}return out;};
  window.__pilot=()=>{const p=m.state.player,tr=m.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);
   let vmax=99;for(let d=4;d<=96;d+=6){const c=Math.abs(tr.headingAt(pr.s+d+6)-tr.headingAt(pr.s+d-2))/8;if(c<.002)continue;const vc=Math.sqrt(38/c);vmax=Math.min(vmax,Math.sqrt(vc*vc+2*22*Math.max(0,d-8)));}
   let c=0;for(let d=0;d<=14;d+=7)c=Math.max(c,Math.abs(tr.headingAt(pr.s+d+6)-tr.headingAt(pr.s+d-2))/8);
   const W=innerWidth,H=innerHeight,texts=(window.__n=(window.__n||0)+1)%2&&window.__last?window.__last:(window.__last=window.__texts()),inPit=!!p.pit,racing=m.state.phase==='racing';
   const inRoad=racing&&!inPit?texts.filter(t=>t.x1>road.x0*W&&t.x0<road.x1*W&&t.y1>road.y0*H&&t.y0<road.y1*H):[],over=inRoad.filter(t=>!t.gauge),gauges=inRoad.filter(t=>t.gauge);
   const tyre=texts.filter(t=>/צמיג/.test(t.text)&&!/rt-/.test(t.cls)),meter=document.querySelector('.racing-tyres'),toast=document.querySelector('.racing-toast'),tip=document.querySelector('.racing-drift-tip');
   const fx=s.snapshot.renderMetrics?.effects||{};
   return {steer:Math.max(-1,Math.min(1,err*1.7)),vmax,vGrip:c>.004?Math.sqrt(25/c):99,speed:p.speed,t:m.state.time,phase:m.state.phase,lap:p.lap,beyond:Math.abs(p.lateral)-tr.width/2,offroad:!!p.offroad,wide:p.wide||0,drifting:!!p.drifting,charge:p.driftCharge||0,nitro:p.nitro,flips:p.offTracks,pit:inPit,pitPhase:p.pit?.phase||'',crash:p.crashT>0||p.recoveryTime>0,
    over,gauges,tyre,meter:!!meter&&visible(meter),chip:toast&&visible(toast)?toast.textContent:'',chipBox:toast&&visible(toast)?(r=>[r.left,r.top,r.right,r.bottom].map(Math.round))(toast.getBoundingClientRect()):null,tip:!!tip&&visible(tip),smoke:fx.driftSmoke||0,skid:fx.skidMarks||0};};},ROAD);
 for(let i=0;i<200&&(await snap()).phase!=='racing';i++)await tick(100);
 assert.equal((await snap()).phase,'racing','the race started');say('racing');
 const touches=new Map(),send=async type=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...touches.values()]});};
 const down=async(id,x,y)=>{touches.set(id,{x,y,id,radiusX:6,radiusY:6,force:1});await send('touchStart');},move=async(id,x,y)=>{touches.set(id,{x,y,id,radiusX:6,radiusY:6,force:1});await send('touchMove');};
 const up=async id=>{if(!touches.has(id))return;const t=touches.get(id);touches.delete(id);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[t]});};
 const box=async sel=>(await page.locator(sel).count())&&await page.locator(sel).first().isVisible()?await page.locator(sel).first().boundingBox():null;
 const gas=await box('.racing-accelerate'),pad=await box('.racing-pad'),brakeBtn=await box('.racing-drift'),slideBtn=await box('.racing-slide');assert.ok(gas&&pad&&brakeBtn,'gas, wheel pad and brake on screen');
 // the layout of the right hand: the drift button on the screen, at least 44 px, clear of every other control and of the speedometer
 const others={gas,brake:brakeBtn,nitro:await box('.racing-nitro'),auto:await box('.racing-auto'),speedometer:await box('.racing-readout'),energy:await box('.racing-energy'),pause:await box('.game-pause'),minimap:await box('.racing-minimap')};
 const hit=(a,b)=>a&&b&&a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
 const layout={slide:slideBtn,...others,overlaps:slideBtn?Object.entries(others).filter(([,b])=>hit(slideBtn,b)).map(([k])=>k):[]};
 if(!old){assert.ok(slideBtn,'the drift button is on the screen');assert.ok(slideBtn.width>=44&&slideBtn.height>=44,'the drift button is at least 44 px');assert.ok(slideBtn.x>=0&&slideBtn.y>=0&&slideBtn.x+slideBtn.width<=844&&slideBtn.y+slideBtn.height<=390,'the drift button is inside 844x390');assert.deepEqual(layout.overlaps,[],'the drift button overlaps no other control');
  assert.ok(slideBtn.x>844*ROAD.x1,'the drift button is right of the road');}
 else assert.equal(slideBtn,null,'?racingDrift=0: no drift button');
 const travel=Math.max(44,Math.min(70,pad.width*.14)),cx=pad.x+pad.width*.45,cy=pad.y+pad.height*.62,fingerX=m=>{const a=Math.min(1,Math.abs(m));return a<.01?cx:cx-Math.sign(m)*(.04+.96*Math.pow(a,1/1.2))*travel;};
 let gasOn=false,brakeOn=false,slideOn=false,wheelOn=false,braking=false,sliding=false,hold=0;
 const setGas=async on=>{if(on===gasOn)return;gasOn=on;if(on)await down(1,gas.x+gas.width/2,gas.y+gas.height/2);else await up(1);};
 const setBrake=async on=>{if(on===brakeOn)return;brakeOn=on;if(on)await down(3,brakeBtn.x+brakeBtn.width/2,brakeBtn.y+brakeBtn.height/2);else await up(3);};
 const setSlide=async on=>{if(!slideBtn||on===slideOn)return;slideOn=on;if(on)await down(4,slideBtn.x+slideBtn.width/2,slideBtn.y+slideBtn.height/2);else await up(4);};
 const rows=[],chips=new Map();let pitOverAt=0,moved=false,armed=null,shotDrift=false,shotChip=false,shotPit=false,tipSeen=false,tipGone=false,slidePresses=0,brakePresses=0,pitSeen=false,pitOver=false;
 for(let k=0;k<seconds*FPS*3;k++){
  const q=await page.evaluate(()=>window.__pilot()),fingerWas=slideOn;   // q is the race after the last frame: the finger as it was during that frame
  if(!wheelOn){wheelOn=true;await down(2,cx,cy);}await move(2,fingerX(q.steer),cy);
  if(!braking&&q.speed>q.vmax+2){braking=true;brakePresses++;}else if(braking&&(q.speed<q.vmax-1||q.speed<9))braking=false;
  // the drift finger: down when the car pushes wide (or is faster than the grip takes) with the wheel turned; held about a second, as a child holds a button,
  // and up when the wheel is nearly straight again
  hold+=1/FPS;
  if(!old&&!pitFlow&&!q.pit){if(!sliding&&hold>.25&&Math.abs(q.steer)>.3&&(q.wide>.15||q.speed>q.vGrip+1)){sliding=true;hold=0;slidePresses++;}else if(sliding&&(Math.abs(q.steer)<.18||hold>2.2||(hold>.95&&q.speed<q.vGrip-1.5))){sliding=false;hold=0;}}else sliding=false;
  await setBrake(braking&&!q.pit);await setSlide(sliding&&!braking);await setGas(!braking&&!sliding);await tick(FRAME);
  rows.push({...q,finger:fingerWas});
  if(q.chip){const key=q.chip.replace(/[\d:.+/ ]+/g,' ').trim();if(!chips.has(key))chips.set(key,{text:q.chip,box:q.chipBox,t:+q.t.toFixed(1)});}
  if(q.tip)tipSeen=true;else if(tipSeen)tipGone=true;
  if(q.pit)pitSeen=true;else if(pitSeen)pitOver=true;
  if(!shotDrift&&q.drifting&&q.smoke>=12&&q.charge>.5){shotDrift=true;await shot('drift');}
  if(!shotChip&&q.chip&&q.t>3&&!q.pit){shotChip=true;await shot('chip');}
  if(!shotPit&&q.pitPhase==='change'){shotPit=true;await shot('pit');}
  if(pitFlow&&!moved&&q.t>PIT_AFTER){moved=true;await shot('armed');
   armed=await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,p=m.state.player,tr=m.track,s=tr.length-330,q=tr.sample(s),k=Math.floor(s/(tr.length/tr.checkpoints.length));const was={pitRequest:!!p.pitRequest,pitAuto:!!p.pitAuto,lap:p.lap,laps:m.state.laps,tyre:+p.tyre.toFixed(3)};
    Object.assign(p,{x:q.x,y:q.y,z:q.z,heading:q.heading,s:q.s,routeS:s,previousS:s,progress:s,lateral:0,checkpoints:k,nextCheckpoint:k+1,slipAngle:0,steer:0});return was;});say('set down 330 m before the end of the lap: '+JSON.stringify(armed));}
  if(pitOver&&!pitOverAt)pitOverAt=q.t;
  if(q.t>seconds||q.phase!=='racing'||(pitFlow&&pitOverAt&&q.t>pitOverAt+2))break;
 }
 await setGas(false);await setBrake(false);await setSlide(false);await up(2);
 const events=await page.evaluate(()=>window.__log.slice(0,200)),racing=rows.filter(r=>r.phase==='racing'),out=racing.filter(r=>!r.pit),driftRows=racing.filter(r=>r.drifting);
 const overRoad=new Map();for(const r of out)for(const t of r.over){const key=t.cls+' | '+t.text.replace(/[\d:.]+/g,'#');if(!overRoad.has(key))overRoad.set(key,{...t,t:+r.t.toFixed(1),frames:0});overRoad.get(key).frames++;}
 const gaugeSeen=new Map();for(const r of out)for(const t of r.gauges){const key=t.cls;if(!gaugeSeen.has(key))gaugeSeen.set(key,{cls:t.cls,text:t.text,box:[t.x0,t.y0,t.x1,t.y1].map(Math.round)});}
 const tyreOut=new Map();for(const r of out)for(const t of r.tyre){if(!tyreOut.has(t.text))tyreOut.set(t.text,{cls:t.cls,t:+r.t.toFixed(1),frames:0});tyreOut.get(t.text).frames++;}
 const ends=events.filter(e=>e.type==='driftEnd');
 const report={scenario,query:extra,armedBeforeTheMove:armed,viewport:'844x390 touch mobile',stage,raceSeconds:+(rows.at(-1)?.t||0).toFixed(1),frames:racing.length,road:ROAD,layout,
  textOverRoad:{frames:out.filter(r=>r.over.length).length,of:out.length,items:[...overRoad.values()].slice(0,20),instrumentsInThatArea:[...gaugeSeen.values()]},
  tyreTextOutsidePit:{frames:out.filter(r=>r.tyre.length).length,items:Object.fromEntries(tyreOut)},tyreMeterOutsidePitFrames:out.filter(r=>r.meter).length,tyreMeterInPitFrames:racing.filter(r=>r.pit&&r.meter).length,pitFrames:racing.filter(r=>r.pit).length,
  drift:{fingerPresses:slidePresses,brakePresses,driftingSeconds:+(driftRows.length/FPS).toFixed(1),driftingWithFingerFrames:driftRows.filter(r=>r.finger).length,driftingWithoutFingerFrames:driftRows.filter(r=>!r.finger).length,maxSmoke:Math.max(0,...racing.map(r=>r.smoke)),maxSkidMarks:Math.max(0,...racing.map(r=>r.skid)),smokeLongAfterDrift:Math.max(0,...racing.filter((r,i)=>i>=FPS&&racing.slice(i-FPS,i+1).every(x=>!x.drifting)).map(r=>r.smoke)),
   drifts:ends.length,cleanDrifts:ends.filter(e=>e.gain>0).length,ersFromDrifts:+ends.reduce((n,e)=>n+(e.gain||0),0).toFixed(1),longest:Math.max(0,...ends.map(e=>e.seconds||0))},
  tip:{seen:tipSeen,gone:tipGone,stored:await page.evaluate(()=>{try{return localStorage.getItem('island.racing.driftTip');}catch{return null;}})},chips:[...chips.values()],
  maxSpeed:+Math.max(...rows.map(r=>r.speed)).toFixed(1),gravelSeconds:+(rows.filter(r=>r.offroad).length/FPS).toFixed(1),flips:rows.at(-1)?.flips||0,laps:events.filter(e=>e.type==='lap').length,events:events.slice(0,60)};
 say(JSON.stringify({over:report.textOverRoad.frames,tyre:report.tyreTextOutsidePit.frames,meterOut:report.tyreMeterOutsidePitFrames,drift:report.drift,tip:report.tip,chips:report.chips.map(c=>c.text)}));
 await writeFile(dir+'report.json',JSON.stringify(report,null,1));
 if(!old){
  assert.equal(report.textOverRoad.frames,0,'no text over the road while racing: '+JSON.stringify(report.textOverRoad.items.slice(0,4)));
  assert.equal(report.tyreTextOutsidePit.frames,0,'nothing about tyres on the screen outside the pit lane: '+JSON.stringify(report.tyreTextOutsidePit.items));
  assert.equal(report.tyreMeterOutsidePitFrames,0,'the tyre meter is hidden outside the pit lane');
  if(scenario==='pit'){assert.ok(armed?.pitRequest&&armed?.pitAuto,'the automatic stop was armed while nothing about tyres was on the screen');assert.ok(report.pitFrames>30,'the car went through the pit lane');assert.ok(report.tyreMeterInPitFrames>30,'the tyre meter shows in the pit lane');}
  else{assert.ok(report.drift.driftingWithFingerFrames>FPS,'the car drifted from the drift finger');assert.ok(report.drift.driftingWithoutFingerFrames<=report.drift.drifts+1,'the car drifts only while the finger is down (a frame at most after each release): '+report.drift.driftingWithoutFingerFrames);
   assert.ok(report.drift.maxSmoke>=12,'tyre smoke in the scene while drifting (renderMetrics.effects.driftSmoke)');assert.equal(report.drift.smokeLongAfterDrift,0,'no drift smoke when the car has not drifted for a second');assert.ok(report.drift.maxSkidMarks>=8,'skid marks in the scene');
   assert.ok(report.tip.seen&&report.tip.gone&&report.tip.stored==='1','the one-time tip showed, left and is remembered');assert.ok(report.chips.length>=1,'a corner chip showed');
   for(const c of report.chips)assert.ok(c.box[2]<=844*ROAD.x0||c.box[3]<=390*ROAD.y0,'the chip is in the corner: '+JSON.stringify(c));}
 }
 return report;
});
