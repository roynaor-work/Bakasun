// racing-v24.7 measurements on the real race model (racing-physics.mjs, racing-tracks.mjs), no browser. The circuits and flags are read at import time, so each
// variant runs in its own process:
//   node workout/island/tools/racing-v24-7-sim.mjs "<address query>" [out.json] [stages, e.g. 1-12]
//  corners  every corner of the circuit (curvature above 1/150 per metre): its tightest radius and its angle
//  solo     a "kid" (gas always on, steers at the centre line, never brakes) and a "driver" (brakes before the corners his tyres cannot take), 2 laps, no rivals:
//           race time, seconds beyond the asphalt, seconds on the gravel, flips, automatic lifts, and per corner how far beyond the asphalt edge the car ran
//  field    the same two in the session's grid of 10: finishing rank, and the computer drivers: all finished, their time, lost gates, flips
const Q=process.argv[2]||'',out=process.argv[3],range=(process.argv[4]||'1-12').split('-').map(Number);
globalThis.location={search:Q};
const {writeFile}=await import('node:fs/promises');
const {createRacing}=await import('../minigames/racing-physics.mjs');
const {v24PhysicsConfig,racingV24Flags,playerInput}=await import('../minigames/racing-v24.mjs');
const {v245PhysicsConfig,racingV245Flags}=await import('../minigames/racing-v24-5.mjs');
const {v247PhysicsConfig,racingV247Flags}=await import('../minigames/racing-v24-7.mjs');
const {pilot}=await import('./racing-v24-sim.mjs');
const ALAT=Number(process.env.DRIVER_ALAT)||30,ABRAKE=Number(process.env.DRIVER_ABRAKE)||25;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const f24=racingV24Flags(Q),f245=racingV245Flags(Q),f247=racingV247Flags(Q);
const CFG={countdown:0,extraRivals:0,walls:false,offTrack:true,...v24PhysicsConfig(f24),pitAuto:true,pitSeq:true,...v245PhysicsConfig(f245),...v247PhysicsConfig(f247,f245.gears)};
export function corners(tr){
 const list=[];let cur=null;
 for(let s=0;s<tr.length;s+=4){const c=Math.abs(tr.headingAt(s+6)-tr.headingAt(s-6))/12;
  if(c>1/150){if(!cur)cur={from:s,max:0};cur.max=Math.max(cur.max,c);cur.to=s;}else if(cur){list.push(cur);cur=null;}}
 if(cur)list.push(cur);
 return list.map((c,i)=>({n:i+1,from:c.from,to:c.to,radius:+(1/c.max).toFixed(1),angle:+Math.abs((tr.headingAt(c.to+6)-tr.headingAt(c.from-6))*180/Math.PI).toFixed(0)}));
}
function kidInput(r,p){const tr=r.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);return {steer:clamp(err*1.7,-1,1),throttle:1,autoAccelerate:true,brake:false,drift:false,nitro:false};}
const drive=(r,p,st,mode)=>p.pit?{steer:0,throttle:0,autoAccelerate:false}:mode==='kid'?kidInput(r,p):playerInput(pilot(r,p,st,{aLat:ALAT,aBrake:ABRAKE}),f24);
function solo(stage,mode){
 const r=createRacing({stage,seed:5,config:{...CFG,stage:{opponents:0,laps:2,timeLimit:400}}}),p=r.state.player,tr=r.track,half=tr.width/2,cs=corners(tr),wide=cs.map(()=>0),vIn=cs.map(()=>0),st={};
 let off=0,gravel=0,lifts=0,autoSlow=0,minSpeed=99,scrub=0;
 for(let n=0;n<400*60&&r.state.phase!=='finished';n++){
  const input=drive(r,p,st,mode),v0=p.speed,was=p.offroad;r.step(1/60,input);
  // "the game lowered my speed": the speed fell on the asphalt with the gas on and no brake, no contact, no pit
  if(!input.brake&&!p.pit&&!was&&!p.offroad&&p.crashT<=0&&p.recoveryTime<=0&&p.speed<v0-.02&&v0>15)autoSlow+=1/60;
  for(const e of r.state.events)if(e.car==='player'&&e.type==='lift')lifts++;
  const beyond=Math.abs(p.lateral)-half;if(beyond>0&&!p.pit)off+=1/60;if(p.offroad&&!p.pit)gravel+=1/60;if(p.wide>.5)scrub+=1/60;
  if(r.state.time>6&&!p.pit&&p.crashT<=0&&p.recoveryTime<=0)minSpeed=Math.min(minSpeed,p.speed);
  cs.forEach((c,i)=>{const d=((p.s-c.from)%tr.length+tr.length)%tr.length;if(d<c.to-c.from+45&&!p.pit&&p.crashT<=0&&p.recoveryTime<=0)wide[i]=Math.max(wide[i],beyond);const dIn=((c.from-p.s)%tr.length+tr.length)%tr.length;if(dIn<3)vIn[i]=Math.max(vIn[i],p.speed);});
 }
 const row={stage,track:tr.id,mode,finished:p.finished,time:+r.state.time.toFixed(1),laps:p.lapTimes.map(t=>+t.toFixed(1)),beyondAsphaltS:+off.toFixed(1),gravelS:+gravel.toFixed(1),flips:p.offTracks,crashes:p.crashes,lifts,autoSlowS:+autoSlow.toFixed(2),scrubS:+scrub.toFixed(1),minSpeed:+minSpeed.toFixed(1),
  corners:cs.map((c,i)=>({...c,vIn:+vIn[i].toFixed(1),wideM:+Math.max(0,wide[i]).toFixed(1)}))};
 row.cornersWide=row.corners.filter(c=>c.wideM>0).length;row.cornersGravel=row.corners.filter(c=>c.wideM>(tr.f1?3.9:1.4)).length;row.cornersTotal=cs.length;
 r.dispose();return row;
}
function field(stage,mode){
 const r=createRacing({stage,seed:9,config:{...CFG,extraRivals:5}}),p=r.state.player,st={};
 for(let n=0;n<400*60&&r.state.phase!=='finished';n++)r.step(1/60,drive(r,p,st,mode));
 const ai=r.state.cars.slice(1),done=ai.filter(c=>c.finished);
 const row={stage,track:r.track.id,mode,rank:r.state.result?.rank??null,won:!!r.state.result?.won,time:+r.state.time.toFixed(1),playerFlips:p.offTracks,aiFinished:done.length+'/'+ai.length,aiRecoveries:ai.reduce((n,c)=>n+c.recoveries,0),aiFlips:ai.reduce((n,c)=>n+c.offTracks,0),aiCrashes:ai.reduce((n,c)=>n+c.crashes,0),aiLaps:ai.reduce((n,c)=>n+c.lapTimes.length,0)};
 r.dispose();return row;
}
if(import.meta.url===`file://${process.argv[1]}`){
 const result={query:Q,flags:{...f247,gears245:f245.gears},solo:[],field:[]};
 for(let stage=range[0];stage<=(range[1]||range[0]);stage++){
  for(const mode of ['kid','driver']){const s=solo(stage,mode);result.solo.push(s);
   console.log(`solo  ${String(stage).padStart(2)} ${s.track.padEnd(14)} ${mode.padEnd(6)} time ${s.time} beyond ${s.beyondAsphaltS}s gravel ${s.gravelS}s flips ${s.flips} lifts ${s.lifts} autoSlow ${s.autoSlowS}s scrub ${s.scrubS}s corners wide ${s.cornersWide}/${s.cornersTotal} gravel ${s.cornersGravel} finished ${s.finished}`);}
  for(const mode of ['kid','driver']){const f=field(stage,mode);result.field.push(f);
   console.log(`field ${String(stage).padStart(2)} ${f.track.padEnd(14)} ${mode.padEnd(6)} rank ${f.rank} time ${f.time} flips ${f.playerFlips} ai finished ${f.aiFinished} recoveries ${f.aiRecoveries} flips ${f.aiFlips} crashes ${f.aiCrashes}`);}
 }
 if(out)await writeFile(out,JSON.stringify(result,null,1));
}
