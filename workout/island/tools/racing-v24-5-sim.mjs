// racing-v24.5 measurements on the real race model (racing-physics.mjs, racing-tracks.mjs), no browser. v24.4 = the address values (?racingTyreFeel=v244 ...),
// v24.5 = the new defaults. The circuits are read at import time, so each version runs in its own process:
//   node workout/island/tools/racing-v24-5-sim.mjs [v244|v245] [out.json]
//  tyre     yaw rate after 0.6 s of full lock at 34 m/s and the time the wheel needs to reach 63% of a step, by tyre state (1 new .. 0.35)
//  shoulder a car at 38 m/s, straight, 1 / 2.5 / 3.5 / 5 m beyond the asphalt edge: speed after 2 s
//  race     a "kid" (auto gas, steers a pursuit line, never brakes) and a "driver" (brakes for corners) on the six circuits, 2 laps, no rivals: gear changes and
//           downshifts per race, lifts, seconds off-road, flips, lap time, the largest slip angle and how far the inertia carried the car wide in long corners
const which=process.argv[2]==='v244'?'v244':'v245',out=process.argv[3];
const Q=which==='v244'?'?racingRound=v244&racingTyreFeel=v244&racingCarry=v244&racingShoulder=v244&racingGears=v244&racingAir=v244':'';
globalThis.location={search:Q};
const {writeFile}=await import('node:fs/promises');
const {createRacing}=await import('../minigames/racing-physics.mjs');
const {TRACKS}=await import('../minigames/racing-tracks.mjs');
const {v24PhysicsConfig,racingV24Flags,playerInput}=await import('../minigames/racing-v24.mjs');
const {v245PhysicsConfig,racingV245Flags}=await import('../minigames/racing-v24-5.mjs');
const {pilot}=await import('./racing-v24-sim.mjs');
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const flags24=racingV24Flags(''),CFG={countdown:0,extraRivals:0,walls:false,offTrack:true,...v24PhysicsConfig(flags24),pitAuto:true,pitSeq:true,...v245PhysicsConfig(racingV245Flags(Q))};
const race=(stage,extra={})=>createRacing({stage,seed:5,config:{...CFG,...extra,stage:{opponents:0,...(extra.stage||{})}}});
const place=(r,car,s,lane,speed)=>{const p=r.track.sample(s),k=Math.floor(s/(r.track.length/16));Object.assign(car,{x:p.x+p.normal.x*lane,y:p.y,z:p.z+p.normal.z*lane,heading:p.heading,speed,s:p.s,routeS:s,previousS:s,progress:s,lateral:lane,checkpoints:k,nextCheckpoint:k+1,gearInit:false});};

function tyre(){
 const rows=[];
 for(const t of [1,.8,.6,.35]){
  const r=race(1),p=r.state.player,m=r.track.mainStraight;place(r,p,m.from+20,0,34);p.gearInit=true;p.tyre=t;r.state.time=10;
  const h0=p.heading;let n=0,t63=null;for(;n<36;n++){r.step(1/60,{steer:1,throttle:1,autoAccelerate:true});p.speed=34;if(t63===null&&p.steer>=.63)t63=(n+1)/60;}
  rows.push({tyre:t,yawDeg06s:+((wrap(p.heading-h0))*180/Math.PI).toFixed(1),steer63ms:t63===null?null:Math.round(t63*1000)});r.dispose();
 }
 return rows;
}
function shoulder(){
 const rows=[];
 for(const beyond of [1,2.5,3.5,5]){
  const r=race(1),p=r.state.player,m=r.track.mainStraight,lane=r.track.width/2+beyond;place(r,p,m.from+15,lane,38);r.state.time=10;
  for(let n=0;n<120;n++){const pr=r.track.project(p.x,p.z,p.s);p.heading=pr.heading;r.step(1/60,{steer:0,throttle:1,autoAccelerate:true});}
  rows.push({beyond,speedAfter2s:+p.speed.toFixed(1),offroad:p.offroad});r.dispose();
 }
 return rows;
}
function kidInput(r,p){const tr=r.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);return {steer:clamp(err*1.7,-1,1),throttle:1,autoAccelerate:true,brake:false,drift:false,nitro:false};}
function raceRow(stage,mode){
 const r=race(stage,{stage:{laps:2,timeLimit:400}}),p=r.state.player,st={},flags=racingV24Flags('');let prev=p.gear,changes=0,downs=0,lifts=0,off=0,maxSlip=0,carryWide=0;
 for(let n=0;n<400*60&&r.state.phase!=='finished';n++){
  const input=p.pit?{steer:0,throttle:0,autoAccelerate:false}:mode==='kid'?kidInput(r,p):playerInput(pilot(r,p,st,{aLat:22,aBrake:20}),flags);r.step(1/60,input);
  if(p.gear!==prev){changes++;if(p.gear<prev)downs++;prev=p.gear;}
  for(const e of r.state.events)if(e.car==='player'&&e.type==='lift')lifts++;
  if(p.offroad)off+=1/60;if(!p.pit&&!p.drifting){maxSlip=Math.max(maxSlip,Math.abs(p.slipAngle));carryWide+=Math.abs(p.speed*Math.sin(p.slipAngle))/60;}
 }
 const out={stage,track:r.track.id,mode,finished:p.finished,time:+r.state.time.toFixed(1),lap1:p.lapTimes[0]?+p.lapTimes[0].toFixed(1):null,gearChanges:changes,downshifts:downs,lifts,offroadS:+off.toFixed(1),flips:p.offTracks,crashes:p.crashes,maxSlipDeg:+(maxSlip*180/Math.PI).toFixed(2),carriedWideM:+carryWide.toFixed(1),tyreEnd:+(p.tyre??1).toFixed(2),pits:p.pits||0};
 r.dispose();return out;
}
/** the kid and the driver in a full field (10 cars, the session's grid) on stages 1-6: finishing rank and the computer drivers' lost gates (recoveries) */
function field(stage,mode){
 const r=createRacing({stage,seed:9,config:{...CFG,extraRivals:5}}),p=r.state.player,st={},flags=racingV24Flags('');
 for(let n=0;n<400*60&&r.state.phase!=='finished';n++){const input=p.pit?{steer:0,throttle:0,autoAccelerate:false}:mode==='kid'?kidInput(r,p):playerInput(pilot(r,p,st,{aLat:22,aBrake:20}),flags);r.step(1/60,input);}
 const out={stage,mode,rank:r.state.result?.rank??null,won:!!r.state.result?.won,time:+r.state.time.toFixed(1),aiRecoveries:r.state.cars.slice(1).reduce((n,c)=>n+c.recoveries,0),aiFlips:r.state.cars.slice(1).reduce((n,c)=>n+c.offTracks,0)};r.dispose();return out;
}
const result={version:which,query:Q,tyre:tyre(),shoulder:shoulder(),race:[],field:[]};
for(const mode of ['kid','driver'])for(let stage=1;stage<=6;stage++)result.field.push(field(stage,mode));
for(const mode of ['kid','driver'])for(let stage=1;stage<=TRACKS.length;stage++)result.race.push(raceRow(stage,mode));
const sum=(mode,k)=>+result.race.filter(x=>x.mode===mode).reduce((n,x)=>n+x[k],0).toFixed(1);
result.totals=Object.fromEntries(['kid','driver'].map(m=>[m,{gearChanges:sum(m,'gearChanges'),downshifts:sum(m,'downshifts'),lifts:sum(m,'lifts'),offroadS:sum(m,'offroadS'),flips:sum(m,'flips'),time:sum(m,'time'),finished:result.race.filter(x=>x.mode===m&&x.finished).length}]));
console.log(JSON.stringify({version:which,tyre:result.tyre,shoulder:result.shoulder,totals:result.totals}));
for(const x of result.field)console.log(JSON.stringify(x));
for(const x of result.race)console.log(JSON.stringify(x));
if(out)await writeFile(out,JSON.stringify(result,null,1));
