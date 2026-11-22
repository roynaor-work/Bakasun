// racing-v24.9 drift measurements on the real race model (racing-physics.mjs, racing-tracks.mjs), no browser. Built on tools/racing-v24-7-sim.mjs (its corners()).
//   node workout/island/tools/racing-v24-9-sim.mjs "<address query>" [out.json] [stages, e.g. 1-12]
// Five drivers, 2 laps, no rivals, the session's physics config:
//  kid      gas always on, steers at the centre line, never the brake, never the drift
//  braker   brakes before the corners the tyres cannot take (the best of BRAKER_ALAT corner speeds: a good braker, not a careless one)
//  drifter  slides through the corners that are too tight for the grip at his speed, and brakes only when he is too fast even for a slide
//  reactive never brakes, and presses the drift only once the car is already pushing wide (what a child does: the car runs out, he slides it back)
//  always   never brakes, and holds the drift in every bend he steers into (a bad drift: where no drift is needed)
// For each: race time, seconds on the gravel, flips, drifts, clean drifts, ERS gained by drifts. `field` puts the braker and the drifter in the grid of 10 and reads
// the computer drivers (the same seed: their race must not change with the drift flag unless the player's car is in their way).
const Q=process.argv[2]||'',out=process.argv[3],range=(process.argv[4]||'1-12').split('-').map(Number);
globalThis.location={search:Q};
const {writeFile}=await import('node:fs/promises');
const {createRacing}=await import('../minigames/racing-physics.mjs');
const {v24PhysicsConfig,racingV24Flags}=await import('../minigames/racing-v24.mjs');
const {v245PhysicsConfig,racingV245Flags}=await import('../minigames/racing-v24-5.mjs');
const {v247PhysicsConfig,racingV247Flags,TIGHT}=await import('../minigames/racing-v24-7.mjs');
const {v249PhysicsConfig,racingV249Flags,DRIFT}=await import('../minigames/racing-v24-9.mjs');
const {corners}=await import('./racing-v24-7-sim.mjs');
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const f24=racingV24Flags(Q),f245=racingV245Flags(Q),f247=racingV247Flags(Q),f249=racingV249Flags(Q);
export const CFG={countdown:0,extraRivals:0,walls:false,offTrack:true,...v24PhysicsConfig(f24),pitAuto:true,pitSeq:true,...v245PhysicsConfig(f245),...v247PhysicsConfig(f247,f245.gears),...v249PhysicsConfig(f249,f24.turbo)};
const BRAKER_ALAT=(process.env.BRAKER_ALAT||'22,24,26,28').split(',').map(Number),ABRAKE=Number(process.env.DRIVER_ABRAKE)||25;
const DRIFTER=(process.env.DRIFTER||'32,36,40').split(',').map(Number);   // the slide grip the drifter plans with (under DRIFT.aLat: the entry runs wide)
const TIGHT_R=Number(process.env.TIGHT_R)||45;
const curv=(tr,s)=>Math.abs(tr.headingAt(s+6)-tr.headingAt(s-2))/8;
function look(tr,s,aLat,aBrake){let v=99;for(let d=4;d<=96;d+=6){const c=curv(tr,s+d);if(c<.002)continue;v=Math.min(v,Math.sqrt(aLat/c+2*aBrake*Math.max(0,d-8)));}return v;}
/** One driver's input. st keeps the brake and drift latches. */
export function drive(r,p,st,mode,opt={}){
 if(p.pit)return {steer:0,throttle:0,autoAccelerate:false};
 const tr=r.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),steer=clamp(err*1.7,-1,1);
 const input={steer,throttle:1,autoAccelerate:true,brake:false,drift:false,nitro:false};
 if(mode==='kid')return input;
 if(mode==='braker'){const vmax=look(tr,pr.s,opt.aLat||26,ABRAKE);if(!st.braking&&p.speed>vmax+2)st.braking=true;else if(st.braking&&(p.speed<vmax-1||p.speed<9))st.braking=false;input.brake=!!st.braking;return input;}
 if(mode==='drifter'){
  const aD=opt.aDrift||34,vD=look(tr,pr.s,aD,ABRAKE);
  if(!st.braking&&p.speed>vD+2)st.braking=true;else if(st.braking&&(p.speed<vD-1||p.speed<9))st.braking=false;
  // the corner the car is in (the next 14 m): slide while the speed is above what the grip takes there
  let c=0;for(let d=0;d<=14;d+=7)c=Math.max(c,curv(tr,pr.s+d));const vGrip=c>.004?Math.sqrt((opt.aGrip||25)/c):99;
  st.hold=(st.hold||0)+1/60;
  if(!st.drift&&st.hold>.25&&Math.abs(steer)>.3&&(p.wide>.15||p.speed>vGrip+1)){st.drift=true;st.hold=0;}
  else if(st.drift&&st.hold>.3&&(Math.abs(steer)<.22||c<.003||p.speed<vGrip-1.5)){st.drift=false;st.hold=0;}
  input.brake=!!st.braking;input.drift=!st.braking&&!!st.drift;return input;}
 if(mode==='reactive'){if(!st.drift&&p.wide>.3)st.drift=true;else if(st.drift&&Math.abs(steer)<.2)st.drift=false;input.drift=!!st.drift;return input;}
 if(mode==='always'){input.drift=Math.abs(steer)>.2;return input;}
 return input;
}
export function solo(stage,mode,opt={},cfg=CFG){
 const r=createRacing({stage,seed:5,config:{...cfg,stage:{opponents:0,laps:2,timeLimit:400}}}),p=r.state.player,tr=r.track,st={};
 let gravel=0,drifts=0,clean=0,ers=0,driftS=0,brakeS=0,maxWide=0;
 // lap 2 through every tight corner (radius under TIGHT_R): seconds from 60 m before it to 120 m after it
 const L=tr.length,mod=v=>((v%L)+L)%L,secs=corners(tr).filter(c=>c.radius<TIGHT_R&&c.from-60>20&&c.to+120<L-20).map(c=>({n:c.n,radius:c.radius,angle:c.angle,a:c.from-60,b:c.to+120,tIn:null,t:null}));
 for(let n=0;n<400*60&&r.state.phase!=='finished';n++){
  const input=drive(r,p,st,mode,opt);r.step(1/60,input);
  for(const e of r.state.events)if(e.car==='player'&&e.type==='driftEnd'){drifts++;if(e.reward>0)clean++;ers+=e.gain;}
  if(p.lap===2&&!p.pit)for(const c of secs){if(c.tIn===null&&mod(p.s-c.a)<20)c.tIn=r.state.time;else if(c.tIn!==null&&c.t===null&&mod(p.s-c.b)<20)c.t=+(r.state.time-c.tIn).toFixed(2);}
  if(p.offroad&&!p.pit)gravel+=1/60;if(p.drifting)driftS+=1/60;if(input.brake&&!p.pit)brakeS+=1/60;if(!p.pit&&p.crashT<=0)maxWide=Math.max(maxWide,Math.abs(p.lateral)-tr.width/2);
 }
 const row={stage,track:tr.id,mode,...opt,finished:p.finished,time:+r.state.time.toFixed(2),laps:p.lapTimes.map(t=>+t.toFixed(2)),gravelS:+gravel.toFixed(1),flips:p.offTracks,drifts,cleanDrifts:clean,driftErs:+ers.toFixed(1),driftS:+driftS.toFixed(1),brakeS:+brakeS.toFixed(1),maxBeyondM:+maxWide.toFixed(1),sections:secs.map(({n,radius,angle,t})=>({n,radius,angle,t}))};
 r.dispose();return row;
}
const best=rows=>rows.filter(r=>r.finished).sort((a,b)=>a.time-b.time)[0]||rows[0];
export function field(stage,mode,opt={},cfg=CFG){
 const r=createRacing({stage,seed:9,config:{...cfg,extraRivals:5}}),p=r.state.player,st={};
 for(let n=0;n<400*60&&r.state.phase!=='finished';n++)r.step(1/60,drive(r,p,st,mode,opt));
 const ai=r.state.cars.slice(1),done=ai.filter(c=>c.finished);
 const row={stage,track:r.track.id,mode,rank:r.state.result?.rank??null,time:+r.state.time.toFixed(1),playerFlips:p.offTracks,aiFinished:done.length+'/'+ai.length,aiBestLap:+Math.min(...ai.flatMap(c=>c.lapTimes.length?c.lapTimes:[999])).toFixed(2),aiFlips:ai.reduce((n,c)=>n+c.offTracks,0),aiCrashes:ai.reduce((n,c)=>n+c.crashes,0),aiDrifting:ai.some(c=>c.drifting||c.driftT>0)};
 r.dispose();return row;
}
if(import.meta.url===`file://${process.argv[1]}`){
 const result={query:Q,flags:f249,DRIFT:{...DRIFT},tightALat:TIGHT.aLat,solo:[],tight:[],field:[]};
 for(let stage=range[0];stage<=(range[1]||range[0]);stage++){
  const tr=createRacing({stage,seed:5,config:{...CFG,stage:{opponents:0}}}),cs=corners(tr.track),tight=cs.filter(c=>c.radius<45).length;tr.dispose();
  const rows={kid:solo(stage,'kid'),braker:best(BRAKER_ALAT.map(aLat=>solo(stage,'braker',{aLat}))),drifter:f249.drift?best(DRIFTER.map(aDrift=>solo(stage,'drifter',{aDrift}))):null,reactive:f249.drift?solo(stage,'reactive'):null,always:f249.drift?solo(stage,'always'):null};
  for(const [mode,s] of Object.entries(rows)){if(!s)continue;s.tightCorners=tight;s.corners=cs.length;result.solo.push(s);
   console.log(`solo  ${String(stage).padStart(2)} ${s.track.padEnd(14)} ${mode.padEnd(7)} time ${String(s.time).padEnd(7)} gravel ${s.gravelS}s flips ${s.flips} brake ${s.brakeS}s drift ${s.driftS}s drifts ${s.drifts} clean ${s.cleanDrifts} ers +${s.driftErs} wide ${s.maxBeyondM}m${s.aLat?' aLat '+s.aLat:''}${s.aDrift?' aDrift '+s.aDrift:''} (tight corners ${tight}/${cs.length})`);}
  if(rows.drifter){const cmp=rows.braker.sections.map((b,i)=>({n:b.n,radius:b.radius,angle:b.angle,braker:b.t,drifter:rows.drifter.sections[i]?.t,always:rows.always.sections[i]?.t})).filter(c=>c.braker&&c.drifter);
   const won=cmp.filter(c=>c.drifter<c.braker).length,mean=cmp.length?cmp.reduce((n,c)=>n+c.braker-c.drifter,0)/cmp.length:0,bad=cmp.filter(c=>c.always&&c.always>c.braker).length,badN=cmp.filter(c=>c.always).length;
   result.tight.push({stage,corners:cmp});console.log(`tight ${String(stage).padStart(2)} lap 2, ${cmp.length} corners under ${TIGHT_R} m: the drifter is faster than the braker in ${won}, mean gain ${mean.toFixed(2)} s a corner; "always drifting" is slower than the braker in ${bad}/${badN}`);}
  if(process.env.FIELD!=='0')for(const mode of f249.drift?['braker','drifter']:['braker']){const f=field(stage,mode,mode==='braker'?{aLat:rows.braker.aLat}:{aDrift:rows.drifter.aDrift});result.field.push(f);
   console.log(`field ${String(stage).padStart(2)} ${f.track.padEnd(14)} ${mode.padEnd(7)} rank ${f.rank} time ${f.time} flips ${f.playerFlips} ai finished ${f.aiFinished} best lap ${f.aiBestLap} flips ${f.aiFlips} crashes ${f.aiCrashes} ai drifting ${f.aiDrifting}`);}
 }
 if(out)await writeFile(out,JSON.stringify(result,null,1));
}
