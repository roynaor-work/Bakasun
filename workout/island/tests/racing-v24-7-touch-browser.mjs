// racing-v24.7 browser proof: Chromium/SwiftShader, phone viewport 844x390, hasTouch + isMobile, REAL touch through CDP Input.dispatchTouchEvent (the harness of
// racing-v24-5-touch-browser.mjs); the race state is only READ.
//  look    (default) every stage in RV247_STAGES (default 7-12 and 19: the six Codex v3 circuits and one of them reversed): the race opens, the v3 sky and the
//          eight trackside models are in the scene (renderMetrics.envV3), nothing failed to load, the v6 sounds decoded; the gas finger is held for RV247_SECONDS
//          of race with the wheel finger following the road: no automatic lift, a screenshot on the grid and one at speed
//  kid     one stage (RV247_STAGE, default 10): gas down, wheel follows the road, never the brake, RV247_SECONDS (default 45): where it left the asphalt, flips
//  braker  the same stage with the brake finger before the corners the tyres cannot take: clean
// Usage: CHROMIUM_PATH=... PLAYWRIGHT_MODULE=... [RV247_SCENARIO=look|kid|braker] [RV247_QUERY=...] node workout/island/tests/racing-v24-7-touch-browser.mjs
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verify} from './night-browser.mjs';
const scenario=process.env.RV247_SCENARIO||'look',extra=process.env.RV247_QUERY||'',part=process.env.RV247_PART||'racing-v24-7/'+scenario,FPS=30,FRAME=Math.round(1000/FPS);
const stages=scenario==='look'?(process.env.RV247_STAGES||'7,8,9,10,11,12,19').split(',').map(Number):[Number(process.env.RV247_STAGE)||10],seconds=Number(process.env.RV247_SECONDS)||(scenario==='look'?9:45);
const dir=fileURLToPath(new URL(`../verification/${part}/`,import.meta.url));await mkdir(dir,{recursive:true});

const T0=Date.now(),say=m=>console.error(`[${Math.round((Date.now()-T0)/1000)}s] ${m}`);
await verify(part,[{width:844,height:390,isMobile:true}],async({page,context,tick,snap,assert,ready,nav,shot})=>{
 say('island open');page.on('console',m=>{if(m.type()!=='log')say('console '+m.type()+': '+m.text().slice(0,300));});const report={scenario,query:extra,viewport:'844x390 touch mobile',stages:[]};
 await page.evaluate(q=>{history.replaceState(null,'',location.pathname+'?dev=1'+(q?'&'+q:''));},extra);
 await page.evaluate(()=>{const {engine,data,games}=window.__island;engine.tick=()=>({ok:true});data.featureFlags.events=false;games.now=()=>0;try{localStorage.setItem('island.sound','on');}catch{}});
 const cdp=await context.newCDPSession(page);
 for(const stage of stages){
  await page.evaluate(n=>{const e=window.__island.engine;e.state.money=Math.max(e.state.money||0,100000);const pr=e.state.minigameProgress.islandRacing;if(pr)pr.stage=Math.max(pr.stage||1,30);   /* every stage open (a fresh save has only stage 1) */window.__island.games.start('islandRacing',undefined,n);},stage);await tick(100);
  if(await page.locator('[data-action=game-understood]').count()){await tick(32);await page.locator('[data-action=game-understood]').tap();}
  for(let i=0;i<600&&!await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.renderMetrics?.frames>1);i++){await tick(100);await page.waitForTimeout(100);const err=await page.evaluate(()=>window.__island.games.current?.session?.snapshot?.error||null);if(i%50===49)say('stage '+stage+': still loading');}
  say('stage '+stage+': first frames');await ready();await tick(100);await nav();
  if(await page.locator('[data-action=racing-intro-go]').count()){await page.locator('[data-action=racing-intro-go]').tap();await tick(32);}
  await shot(`stage-${stage}-grid`);
  await page.evaluate(ms=>{if(!window.__rv247raf){window.__rv247raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>setTimeout(()=>cb(performance.now()),ms);}},FRAME);
  await page.evaluate(()=>{const m=window.__island.games.current.session.debug.model,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));window.__log=[];const step=m.step;m.step=(dt,i)=>{const r=step(dt,i);for(const e of m.state.events)if(e.car==='player'&&['lift','crash','crashRecover','wall','post'].includes(e.type))window.__log.push({t:+m.state.time.toFixed(2),type:e.type,reason:e.reason});return r;};
   window.__pilot=()=>{const p=m.state.player,tr=m.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);
    let vmax=99;for(let d=4;d<=96;d+=6){const c=Math.abs(tr.headingAt(pr.s+d+6)-tr.headingAt(pr.s+d-2))/8;if(c<.002)continue;const vc=Math.sqrt(26/c);vmax=Math.min(vmax,Math.sqrt(vc*vc+2*22*Math.max(0,d-8)));}
    return {steer:Math.max(-1,Math.min(1,err*1.7)),vmax,speed:p.speed,t:m.state.time,phase:m.state.phase,beyond:Math.abs(p.lateral)-tr.width/2,offroad:!!p.offroad,wide:p.wide||0,lifting:!!p.lifting,gear:p.gear,flips:p.offTracks,pit:!!p.pit,crash:p.crashT>0||p.recoveryTime>0,s:p.s};};});
  for(let i=0;i<200&&(await snap()).phase!=='racing';i++)await tick(100);
  assert.equal((await snap()).phase,'racing','stage '+stage+': the race started');say('stage '+stage+': racing');
  const touches=new Map(),send=async type=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...touches.values()]});};
  const down=async(id,x,y)=>{touches.set(id,{x,y,id,radiusX:6,radiusY:6,force:1});await send('touchStart');},move=async(id,x,y)=>{touches.set(id,{x,y,id,radiusX:6,radiusY:6,force:1});await send('touchMove');};
  const up=async id=>{if(!touches.has(id))return;const t=touches.get(id);touches.delete(id);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[t]});};
  const box=async sel=>(await page.locator(sel).count())?await page.locator(sel).first().boundingBox():null;
  const gas=await box('.racing-accelerate'),pad=await box('.racing-pad'),brakeBtn=await box('.racing-drift');assert.ok(gas&&pad&&brakeBtn,'gas, wheel pad and brake on screen');
  const travel=Math.max(44,Math.min(70,pad.width*.14)),cx=pad.x+pad.width*.45,cy=pad.y+pad.height*.62,fingerX=m=>{const a=Math.min(1,Math.abs(m));return a<.01?cx:cx-Math.sign(m)*(.04+.96*Math.pow(a,1/1.2))*travel;};
  let gasOn=false,brakeOn=false,wheelOn=false,braking=false;
  const setGas=async on=>{if(on===gasOn)return;gasOn=on;if(on)await down(1,gas.x+gas.width/2,gas.y+gas.height/2);else await up(1);};
  const setBrake=async on=>{if(on===brakeOn)return;brakeOn=on;if(on)await down(3,brakeBtn.x+brakeBtn.width/2,brakeBtn.y+brakeBtn.height/2);else await up(3);};
  const rows=[];let autoSlow=0,prev=null,brakePresses=0,shotAt=false;
  for(let k=0;k<seconds*FPS*3;k++){
   const q=await page.evaluate(()=>window.__pilot());
   if(!wheelOn){wheelOn=true;await down(2,cx,cy);}await move(2,fingerX(q.steer),cy);
   if(scenario==='braker'){if(!braking&&q.speed>q.vmax+2){braking=true;brakePresses++;}else if(braking&&(q.speed<q.vmax-1||q.speed<9))braking=false;}
   await setBrake(braking);await setGas(!braking);await tick(FRAME);
   // "the game lowered my speed": on the asphalt, gas finger down, no brake finger, no contact, and the speed fell
   if(prev&&gasOn&&!brakeOn&&!q.offroad&&!prev.offroad&&!q.pit&&!q.crash&&!prev.crash&&prev.speed>15&&q.speed<prev.speed-.05)autoSlow+=1/FPS;
   rows.push(q);prev=q;
   if(!shotAt&&q.t>Math.min(6,seconds*.6)){shotAt=true;await shot(`stage-${stage}-drive`);}
   if(q.t>seconds||q.phase!=='racing')break;
  }
  await setGas(false);await setBrake(false);await up(2);
  const info=await page.evaluate(()=>{const s=window.__island.games.current.session,m=s.debug.model,rm=s.snapshot.renderMetrics,a=s.debug.audio.engine();return {track:m.track.id,name:m.track.name,length:Math.round(m.track.length),reverse:!!m.stage.reverse,envV3:rm.envV3,failures:rm.failures,drawCalls:rm.drawCalls,triangles:rm.triangles,quality:rm.quality,v6:a.v6,v6Ready:a.v6Ready,v246:a.v246,rec:a.rec,noise:a.noise,levels:a.samples,events:window.__log.slice(0,60)};});
  const row={stage,...info,raceSeconds:+(rows.at(-1)?.t||0).toFixed(1),maxSpeed:+Math.max(...rows.map(r=>r.speed)).toFixed(1),autoSlowSeconds:+autoSlow.toFixed(2),lifts:info.events.filter(e=>e.type==='lift').length,liftingFrames:rows.filter(r=>r.lifting).length,
   beyondAsphaltSeconds:+(rows.filter(r=>r.beyond>0&&!r.pit).length/FPS).toFixed(1),gravelSeconds:+(rows.filter(r=>r.offroad).length/FPS).toFixed(1),scrubSeconds:+(rows.filter(r=>r.wide>.5).length/FPS).toFixed(1),flips:rows.at(-1)?.flips||0,brakePresses,gears:[...new Set(rows.map(r=>r.gear))].sort()};
  report.stages.push(row);console.log(JSON.stringify({...row,events:undefined,levels:undefined}));
  if(extra.includes('racingTracksV3=0'))assert.equal(row.envV3,null,'no v3 look with the flag off');
  else if([7,8,9,10,11,12,19,20,21,22,23,24].includes(stage)){assert.equal(row.envV3?.models,8,'stage '+stage+': eight v3 models');assert.equal(row.envV3?.sky,true);}
  assert.deepEqual(row.failures,[],'stage '+stage+': nothing failed to load');
  if(!extra.includes('racingAutoLift=1')){assert.equal(row.lifts,0,'no automatic lift');assert.equal(row.liftingFrames,0);}
  assert.ok(row.maxSpeed>25,'stage '+stage+': the car drove ('+row.maxSpeed+' m/s)');
  // leave the race
  await page.evaluate(()=>{window.requestAnimationFrame=window.__rv247raf;window.__rv247raf=null;});
  if(!await page.locator('.game-pause-sheet').count())await page.locator('[data-action=game-pause]').tap();await tick(100);await page.locator('[data-action=game-exit]').tap();await tick(200);await nav();
 }
 await writeFile(dir+'report.json',JSON.stringify(report,null,1)+'\n');
 return {stages:report.stages.map(r=>({stage:r.stage,track:r.track,envV3:r.envV3,lifts:r.lifts,flips:r.flips}))};
});
