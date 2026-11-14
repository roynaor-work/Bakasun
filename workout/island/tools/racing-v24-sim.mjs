// racing-v24 measurements on the real race model (racing-physics.mjs), no browser. Each part compares v23 (the address flags) with v24 (the new defaults).
//  turbo    a child's corner: brake button held from the brake point through the corner, released at the exit: drift boosts, boost seconds, gear changes after corners
//  recover  N hard exits over the 30 stages with the v24 recovery: one roll windows, no flying back, landing on the centre line at speed 0, soft drop, no gate
//  offslow  a car stopped 2-9 m off the asphalt: the gas and the wheel towards the road bring it back (time); left alone it comes back softly (time, no flip)
//  corner   the turn itself: full lock without the brake at 38 m/s for 0.5 s (on the asphalt), speed lost (automatic slow-down) and the brake alone
//  bump     side and rear contact between two cars: separation speed (ricochet), sideways displacement, speed lost
//  pit      whole league-length races (3-4 laps, 12 cars) with tyre wear and stops: every car stops, stop length, pit lane speed, order changes, race time
// Usage: node workout/island/tools/racing-v24-sim.mjs [part|all] [out.json] [N]
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {createRacing}=await import('../minigames/racing-physics.mjs');
const {OFF_TRACK}=await import('../minigames/racing-offtrack.mjs');
const {v24PhysicsConfig,racingV24Flags,playerInput,RECOVER,PIT}=await import('../minigames/racing-v24.mjs');
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const V23=v24PhysicsConfig(racingV24Flags('?racingTurbo=v23&racingRecover=v23&racingOffSlow=0&racingPit=0&racingBrakeAuto=v23&racingBump=v23'));
export const V24=v24PhysicsConfig(racingV24Flags(''));
const finite=o=>Object.values(o).every(v=>typeof v!=='number'||Number.isFinite(v));
/** pure pursuit with a corner-speed brake point, as the browser pilot; brakeMode 'kid' holds the brake through the corner (until the speed is under the corner speed) */
export function pilot(race,p,st={},{aLat=15,aBrake=15,lane=0}={}){
 const tr=race.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),tx=tg.x+tg.normal.x*lane,tz=tg.z+tg.normal.z*lane,err=wrap(Math.atan2(tx-p.x,tz-p.z)-p.heading);
 let vmax=99;for(let d=4;d<=96;d+=6){const c=Math.abs(tr.headingAt(pr.s+d+6)-tr.headingAt(pr.s+d-2))/8;if(c<.002)continue;const vc=Math.sqrt(aLat/c),allowed=Math.sqrt(vc*vc+2*aBrake*Math.max(0,d-8));vmax=Math.min(vmax,allowed);}
 if(!st.braking&&p.speed>vmax+2)st.braking=true;else if(st.braking&&(p.speed<vmax-1||p.speed<9))st.braking=false;
 // the one button of the touch controls: brake + drift together (racing-controls); playerInput maps it per version
 return {steer:clamp(err*1.7,-1,1),throttle:st.braking?0:1,autoAccelerate:false,brake:!!st.braking,drift:!!st.braking,nitro:false,vmax};
}
function turbo(cfg,flags,{stages=[1,2,3,4,5,6],seconds=60}={}){
 const rows=[];
 for(const stage of stages){const race=createRacing({stage,seed:7,config:{countdown:0,extraRivals:7,walls:false,offTrack:true,...cfg}}),p=race.state.player,st={};
  let boosts=0,boostSteps=0,gears=0,afterCorner=0,lastBrakeEnd=-9,prevGear=p.gear,shiftsSteerOnly=0;
  for(let n=0;n<seconds*60&&race.state.phase!=='finished';n++){const raw=pilot(race,p,st),input=playerInput(raw,flags),wasBraking=input.brake;race.step(1/60,input);
   if(p.boosting)boostSteps++;for(const e of race.state.events)if(e.car==='player'&&e.type==='driftBoost')boosts++;
   if(p.gear!==prevGear){gears++;if(race.state.time-lastBrakeEnd<2.5)afterCorner++;if(!wasBraking&&Math.abs(p.steer)>.1)shiftsSteerOnly++;prevGear=p.gear;}
   if(st.lastBraking&&!st.braking)lastBrakeEnd=race.state.time;st.lastBraking=st.braking;}
  rows.push({stage,driftBoosts:boosts,boostSeconds:+(boostSteps/60).toFixed(2),gearChanges:gears,gearChangesWithin2_5sAfterBrake:afterCorner,crashes:p.crashes});race.dispose();}
 const sum=k=>+rows.reduce((n,r)=>n+r[k],0).toFixed(2);return {rows,driftBoosts:sum('driftBoosts'),boostSeconds:sum('boostSeconds'),gearChanges:sum('gearChanges'),afterCorner:sum('gearChangesWithin2_5sAfterBrake')};
}
/** one hard exit with the given recovery; v24 records the roll window, the sideways path while rolling and the soft drop */
export function recoverExit(stage,seed,{drive=4,side=1,lock=1,cfg=V24}={}){
 const race=createRacing({stage,seed,config:{countdown:0,extraRivals:5,walls:false,offTrack:true,...cfg}}),p=race.state.player,tr=race.track,half=tr.width/2,st={};
 let trigger=null,maxBeyond=0,nan=false;
 for(let n=0;n<drive*60;n++)race.step(1/60,playerInput(pilot(race,p,st),racingV24Flags('')));
 for(let k=0;k<20*60&&!trigger;k++){race.step(1/60,{steer:side*lock,throttle:1,autoAccelerate:true});maxBeyond=Math.max(maxBeyond,Math.abs(p.lateral)-half);if(!finite(p))nan=true;
  for(const e of race.state.events)if(e.car==='player'&&e.type==='crash'&&e.reason==='offtrack')trigger={...e,checkpoints:p.checkpoints,routeS:p.routeS,nextGate:p.nextCheckpoint*tr.length/tr.checkpoints.length,lat:p.lateral};}
 if(!trigger){race.dispose();return {stage,seed,trigger:null,maxBeyond:+maxBeyond.toFixed(2)};}
 let rollWindows=0,inRoll=true,minAbsLatRolling=Math.abs(p.lateral),hiddenSteps=0,dropMax=0,dropUp=0,lastDrop=null,landing=null,steps=0,rest=null,phases=[];
 for(let k=0;k<4*60&&!landing;k++){race.step(1/60,{steer:0,throttle:0,autoAccelerate:false});steps++;if(!finite(p))nan=true;maxBeyond=Math.max(maxBeyond,Math.abs(p.lateral)-half);
  const rolling=p.crashT>0;if(rolling&&!inRoll)rollWindows++;inRoll=rolling;if(rolling)minAbsLatRolling=Math.min(minAbsLatRolling,Math.abs(p.lateral));
  if(p.hidden)hiddenSteps++;const d=p.dropY||0;dropMax=Math.max(dropMax,d);if(lastDrop>0&&d>lastDrop+1e-9)dropUp++;lastDrop=d;   // a rise after the drop began (the set to 35 cm at its start is not one)
  const ph=p.offFlight?.phase||'done';if(phases.at(-1)!==ph)phases.push(ph);
  for(const e of race.state.events)if(e.car==='player'){if(e.type==='crashRest')rest={lat:p.lateral,t:race.state.time};if(e.type==='crashRecover')landing={speed:p.speed,lateral:p.lateral,heading:wrap(p.heading-tr.sample(p.s).heading),checkpoints:p.checkpoints,routeS:p.routeS,soft:!!e.soft};}}
 for(let k=0;k<3*60;k++)race.step(1/60,playerInput(pilot(race,p,st),racingV24Flags('')));
 const out={stage,seed,why:trigger.why,speedAtTrigger:+trigger.speed.toFixed(1),latAtTrigger:+Math.abs(trigger.lat).toFixed(2),maxBeyond:+maxBeyond.toFixed(2),nan,secondRolls:rollWindows,
  minAbsLatWhileRolling:+minAbsLatRolling.toFixed(2),restLat:rest?+Math.abs(rest.lat).toFixed(2):null,hidden:+(hiddenSteps/60).toFixed(2),dropMax:+dropMax.toFixed(2),dropRises:dropUp,phases:phases.join('>'),total:+(steps/60).toFixed(2),
  landing:landing&&{speed:+landing.speed.toFixed(2),lateral:+landing.lateral.toFixed(3),headingError:+landing.heading.toFixed(4),gateGranted:landing.checkpoints>trigger.checkpoints,beforeNextGate:landing.routeS<trigger.nextGate,soft:landing.soft},speedAfter3s:+p.speed.toFixed(1)};
 race.dispose();return out;
}
/** a car stopped `beyond` metres off the asphalt on a straight; mode 'drive' = gas + wheel to the road, 'alone' = nothing pressed */
export function offSlow(stage,beyond,{cfg=V24,mode='drive',seconds=10,side=1}={}){
 const race=createRacing({stage,seed:3,config:{countdown:0,extraRivals:0,walls:false,offTrack:true,...cfg}}),p=race.state.player,tr=race.track,half=tr.width/2,s=60,q=tr.sample(s),lat=side*(half+beyond);
 // racing on (the off-track rules only act after the start), then the car is placed standing on the grass, pointing along the road
 for(let n=0;n<5*60;n++)race.step(1/60,{steer:0,throttle:0,autoAccelerate:false,brake:true});
 Object.assign(p,{x:q.x+q.normal.x*lat,z:q.z+q.normal.z*lat,y:q.y,heading:q.heading,speed:0,s:q.s,routeS:s,previousS:s,progress:s,lateral:lat,offroad:true,offroadTime:0,farT:0,stuckT:0,gearInit:false,recoveryTime:0});
 let backAt=null,flip=null,soft=null,maxSpeed=0;const t0=race.state.time;
 for(let n=0;n<seconds*60&&!backAt&&!flip&&!soft;n++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+8),tx=tg.x+tg.normal.x*Math.sign(lat)*(half-2),tz=tg.z+tg.normal.z*Math.sign(lat)*(half-2),err=wrap(Math.atan2(tx-p.x,tz-p.z)-p.heading);
  race.step(1/60,mode==='drive'?{steer:clamp(err*1.6,-1,1),throttle:1,autoAccelerate:false}:{steer:0,throttle:0,autoAccelerate:false});maxSpeed=Math.max(maxSpeed,p.speed);
  if(mode==='drive'&&Math.abs(p.lateral)<half&&!p.offFlight)backAt=race.state.time-t0;
  for(const e of race.state.events)if(e.car==='player'){if(e.type==='crash')flip={why:e.why||e.reason,t:+(race.state.time-t0).toFixed(2)};if(e.type==='softReturn'||e.type==='recovery')soft={why:e.why||'recovery',t:+(race.state.time-t0).toFixed(2)};}}
 race.dispose();return {stage,beyond,mode,back:backAt!==null?+backAt.toFixed(2):null,flip,soft,maxSpeed:+maxSpeed.toFixed(1)};
}
export function cornerTest(cfg,{stage=1}={}){
 const race=createRacing({stage,seed:2,config:{countdown:0,extraRivals:0,walls:false,offTrack:true,...cfg}}),p=race.state.player,tr=race.track;
 for(let n=0;n<5*60;n++)race.step(1/60,{steer:0,throttle:0,autoAccelerate:false,brake:true});
 const s=60,q=tr.sample(s);Object.assign(p,{x:q.x,z:q.z,y:q.y,heading:q.heading,speed:38,s:q.s,routeS:s,previousS:s,progress:s,lateral:0,gearInit:false,recoveryTime:0,offroad:false});
 const v0=p.speed;let ers0=p.nitro,maxLat=0;for(let n=0;n<30;n++){race.step(1/60,{steer:.85,throttle:1,autoAccelerate:false});maxLat=Math.max(maxLat,Math.abs(p.lateral));}
 // half a second at full lock: the car stays on the asphalt (maxLateral under half the road), so the loss is the turn itself, not the grass
 const turn={from:v0,to:+p.speed.toFixed(2),loss:+(v0-p.speed).toFixed(2),ers:+(p.nitro-ers0).toFixed(2),seconds:.5,maxLateral:+maxLat.toFixed(2),half:tr.width/2};
 race.dispose();
 const r2=createRacing({stage,seed:2,config:{countdown:0,extraRivals:0,walls:false,offTrack:true,...cfg}}),p2=r2.state.player;for(let n=0;n<5*60;n++)r2.step(1/60,{brake:true,autoAccelerate:false});
 Object.assign(p2,{x:q.x,z:q.z,y:q.y,heading:q.heading,speed:38,s:q.s,routeS:s,previousS:s,progress:s,lateral:0,gearInit:false,recoveryTime:0,offroad:false});
 for(let n=0;n<36;n++)r2.step(1/60,{steer:0,throttle:0,autoAccelerate:false,brake:true});const brake={from:38,to:+p2.speed.toFixed(2),decel:+((38-p2.speed)/.6).toFixed(1)};r2.dispose();
 return {turn,brake};
}
/** two cars, side by side (gap 2.2 m sideways, the right one steering in) or nose to tail (the rear 6 m/s faster): what the contact does in 1 s */
export function bumpTest(cfg,{kind='side'}={}){
 const race=createRacing({stage:1,seed:5,config:{countdown:0,extraRivals:0,walls:false,offTrack:true,...cfg}}),[a,b]=race.state.cars,tr=race.track,s=60;
 for(let n=0;n<5*60;n++)race.step(1/60,{brake:true,autoAccelerate:false});
 const put=(c,ds,lat,speed)=>{const q=tr.sample(s+ds);Object.assign(c,{x:q.x+q.normal.x*lat,z:q.z+q.normal.z*lat,y:q.y,heading:q.heading,speed,s:q.s,routeS:s+ds,previousS:s+ds,progress:s+ds,lateral:lat,gearInit:false,recoveryTime:0,collisionCooldown:0,laneHold:5,targetLane:lat});};
 if(kind==='side'){put(a,0,1.2,30);put(b,0,-1.2,30);}else{put(a,-3.2,0,34);put(b,0,0,28);}
 const v0={a:a.speed,b:b.speed},lat0={a:a.lateral,b:b.lateral};let bumps=[],maxSep=0,hit=null,gapAfter=null;
 for(let n=0;n<60;n++){const before={a:a.speed,b:b.speed};race.step(1/60,{steer:kind==='side'?-.25:0,throttle:1,autoAccelerate:false});
  for(const e of race.state.events)if(e.type==='bump'){bumps.push({t:+race.state.time.toFixed(2),intensity:e.intensity,along:e.along!==undefined?+e.along.toFixed(2):null});if(!hit)hit={n,loss:{a:+(before.a-a.speed).toFixed(2),b:+(before.b-b.speed).toFixed(2)},lossPct:{a:+(100*(1-a.speed/before.a)).toFixed(1),b:+(100*(1-b.speed/before.b)).toFixed(1)}};}
  maxSep=Math.max(maxSep,Math.abs(a.lateral-b.lateral));if(hit&&n===hit.n+18)gapAfter=+Math.hypot(a.x-b.x,a.z-b.z).toFixed(2);}
 // the immediate loss at the contact (the step of the first bump) and the distance between the cars 0.3 s later: the ricochet
 const out={kind,bumps:bumps.length,first:bumps[0]||null,atContact:hit,gapAfter0_3s:gapAfter,speedLoss1s:{a:+(v0.a-a.speed).toFixed(2),b:+(v0.b-b.speed).toFixed(2)},lateralMove:{a:+(a.lateral-lat0.a).toFixed(2),b:+(b.lateral-lat0.b).toFixed(2)},maxSeparation:+maxSep.toFixed(2)};
 race.dispose();return out;
}
/** a whole race with pit stops: the player is the pursuit pilot (taps the pit button at tapAt seconds, or leaves it to the automatic stop) */
export function pitRace(stage,seed,{cfg=V24,laps=null,extra=7,tapAt=null,drivers=null}={}){
 const config={countdown:0,extraRivals:extra,walls:false,offTrack:true,...cfg};if(laps)config.stage={laps};
 const race=createRacing({stage,seed,config}),p=race.state.player,st={},flags=racingV24Flags(''),cars=race.state.cars;
 const stops=[],enter=new Map(),orderAt=[],speeds=[];let tapped=false,ranks0=null;
 for(let n=0;n<330*60&&race.state.phase!=='finished';n++){
  if(tapAt!==null&&!tapped&&race.state.time>=tapAt){tapped=race.requestPit?.()||false;}
  const inp=p.pit?{steer:0,throttle:0,autoAccelerate:false}:playerInput(pilot(race,p,st,{aLat:24,aBrake:20}),flags);if(p.pit?.phase==='stop'&&race.state.time>(enter.get('player')?.stopAt??1e9)+.3)race.pitTap?.();   // a regular driver's pace (the default pilot is a cautious child); the tyre-change tap 0.3 s after the stop
  race.step(1/60,inp);
  for(const c of cars)if(c.pit&&c.pit.phase==='lane'&&Math.abs(c.lateral)>race.track.width/2+4)speeds.push(c.speed);
  for(const e of race.state.events){
   if(e.type==='pitIn'){enter.set(e.car,{t:e.time,lap:e.lap,rank:cars.find(c=>c.id===e.car).rank});if(!ranks0)ranks0=cars.map(c=>[c.id,c.rank]);}
   if(e.type==='pitStop'){const r=enter.get(e.car);if(r)r.stopAt=e.time;}
   if(e.type==='pitDone'){const r=enter.get(e.car);if(r)r.doneAt=e.time;}
   if(e.type==='pitExit'){const r=enter.get(e.car);if(r){stops.push({car:e.car,lap:r.lap,stopped:+((r.doneAt??e.time)-(r.stopAt??e.time)).toFixed(2),inPit:+(e.time-r.t).toFixed(2),rankIn:r.rank,rankOut:cars.find(c=>c.id===e.car).rank});enter.delete(e.car);}}
  }
  if(n%(60*10)===0)orderAt.push(cars.slice().sort((x,y)=>x.rank-y.rank).map(c=>c.id).join(','));
 }
 const result={stage,seed,laps:race.stage.laps,phase:race.state.phase,time:+race.state.time.toFixed(1),playerRank:p.rank,pitOn:!!race.pit?.on,
  stops,carsStopped:new Set(stops.map(s=>s.car)).size,cars:cars.length,maxPitLaneSpeed:speeds.length?+Math.max(...speeds).toFixed(2):null,
  tyresAtEnd:cars.map(c=>+(c.tyre??1).toFixed(2)),pitLaps:cars.map(c=>c.pitLaps||[]),orderChanges:orderAt.reduce((n,o,i)=>n+(i&&o!==orderAt[i-1]?1:0),0)};
 race.dispose();return result;
}
/** the league-sim bots (casual = 11 frames late and brakes only in sharp corners, normal = 5 frames), no walls: race time, rank, flips, stops, v23 against v24 */
const BOTS={casual:{lag:11,brakeCurv:.62,brakeSpeed:24},normal:{lag:5,brakeCurv:.5,brakeSpeed:27}};
export function balanceRace(stage,seed,bot,cfg){
 const b=BOTS[bot],race=createRacing({stage,seed,config:{countdown:0,extraRivals:7,walls:false,offTrack:true,...cfg}}),tr=race.track,p=race.state.player,q=[],flags=racingV24Flags(cfg===V23?'?racingTurbo=v23':'');let flips=0,soft=0;
 for(let n=0;n<(race.stage.timeLimit+2)*60&&race.state.phase!=='finished';n++){
  const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);q.push(clamp(err*1.7,-1,1));const steer=q.length>b.lag?q.shift():0;
  const curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading)),brake=curv>b.brakeCurv&&p.speed>b.brakeSpeed;
  race.step(1/60,p.pit?{}:playerInput({steer,throttle:1,autoAccelerate:true,brake,drift:brake},flags));
  for(const e of race.state.events)if(e.car==='player'){if(e.type==='crash')flips++;if(e.type==='softReturn')soft++;}}
 const out={stage,seed,bot,laps:race.stage.laps,time:+race.state.time.toFixed(1),finished:p.finished,rank:race.state.result?.rank??null,gridRank:p.rank,flips,softReturns:soft,stops:p.pits||0};race.dispose();return out;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const part=process.argv[2]||'all',out=process.argv[3]||null,N=Number(process.argv[4])||200,res={generatedAt:new Date().toISOString()};
 if(part==='turbo'||part==='all')res.turbo={v23:turbo(V23,racingV24Flags('?racingTurbo=v23')),v24:turbo(V24,racingV24Flags(''))};
 if(part==='recover'||part==='all'){let w=99;const r=()=>((w=(Math.imul(w,1664525)+1013904223)>>>0)/4294967296);const rows=[];for(let i=0;i<N;i++)rows.push(recoverExit(1+(i%30),1+Math.floor(r()*9999),{drive:1+r()*4,side:r()<.5?-1:1,lock:.55+r()*.45}));
  const ok=rows.filter(x=>x.landing);res.recover={n:N,landed:ok.length,secondRolls:ok.reduce((n,x)=>n+x.secondRolls,0),maxBeyond:Math.max(...rows.map(x=>x.maxBeyond)),maxRollBackIn:+Math.max(...ok.map(x=>x.latAtTrigger-x.minAbsLatWhileRolling)).toFixed(2),
   maxDropRises:Math.max(...ok.map(x=>x.dropRises)),totals:[Math.min(...ok.map(x=>x.total)),Math.max(...ok.map(x=>x.total))],maxLandingLateral:Math.max(...ok.map(x=>Math.abs(x.landing.lateral))),maxHeadingError:Math.max(...ok.map(x=>Math.abs(x.landing.headingError))),
   maxLandingSpeed:Math.max(...ok.map(x=>x.landing.speed)),gatesGranted:ok.filter(x=>x.landing.gateGranted).length,pastNextGate:ok.filter(x=>!x.landing.beforeNextGate).length,nan:rows.filter(x=>x.nan).length,minSpeedAfter3s:Math.min(...ok.map(x=>x.speedAfter3s)),sample:rows.slice(0,3)};}
 if(part==='offslow'||part==='all'){const rows=[];for(const stage of [1,2,3,4,5,6])for(const b of [1.5,3,4.5,6,8])for(const [name,cfg] of [['v23',V23],['v24',V24]])for(const mode of ['drive','alone'])rows.push({version:name,...offSlow(stage,b,{cfg,mode})});res.offslow=rows;}
 if(part==='corner'||part==='all')res.corner={v23:cornerTest(V23),v24:cornerTest(V24)};
 if(part==='bump'||part==='all')res.bump={v23:{side:bumpTest(V23,{kind:'side'}),rear:bumpTest(V23,{kind:'rear'})},v24:{side:bumpTest(V24,{kind:'side'}),rear:bumpTest(V24,{kind:'rear'})}};
 if(part==='pit'||part==='all'){const rows=[];for(const stage of [13,14,15,16,17,18])for(const seed of [3,11])rows.push(pitRace(stage,seed,{extra:7}));res.pit=rows;res.pitOff=[13,14,15].map(stage=>pitRace(stage,3,{cfg:V23,extra:7}));}
 if(part==='balance'||part==='all'){const rows=[];for(const stage of [1,3,5,13,15,17])for(const bot of ['casual','normal'])for(const [name,cfg] of [['v23',V23],['v24',V24]])rows.push({version:name,...balanceRace(stage,5,bot,cfg)});
  const sum=(v,bot,k)=>{const r=rows.filter(x=>x.version===v&&x.bot===bot);return +(r.reduce((n,x)=>n+(x[k]??0),0)/r.length).toFixed(2);};
  res.balance={rows,mean:Object.fromEntries(['casual','normal'].flatMap(bot=>['v23','v24'].map(v=>[`${bot}-${v}`,{time:sum(v,bot,'time'),gridRank:sum(v,bot,'gridRank'),flips:sum(v,bot,'flips'),stops:sum(v,bot,'stops')}])))};}
 const text=JSON.stringify(res,null,1);if(out)await writeFile(out,text+'\n');console.log(text.length>20000?text.slice(0,20000)+'\n...':text);
}
