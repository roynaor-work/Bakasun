// Racing grid measurements without a browser.
// Part A (racing-grid-v1): physics cost per step for 5/10/12 cars, player and rival crashes, overtake intents, shifts per lap with and without the shift map.
// Part B (racing-deep-m2): rival behaviour over 4 races x 6 circuits with 10 cars (the player is driven by the measurement bot): real passes among the computer cars
// (rank gained), rival flips in ordinary driving (target under 2 per race), seconds a rival spends under 5 m/s after the start (target under 3 s per car per race),
// the gap between the first and the last rival after 60 s (field spread) and the longest lock (two cars overlapping) in seconds.
// Usage: node tools/racing-grid-measure.mjs [out.json]   env RACING_TRACKS=f1|v1 selects the old circuits, RACING_AI=0 the previous drivers (config.ai=false)
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
if(process.env.RACING_TRACKS)globalThis.location={search:'?racingTracks='+process.env.RACING_TRACKS+(process.env.V2Q||'')};
const {createRacing}=await import('../minigames/racing-physics.mjs');
const AI=process.env.RACING_AI!=='0';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function bot(race,p,q,lag,kind){
 const tr=race.track,pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
 q.push(clamp(err*1.7,-1,1));const steer=q.length>lag?q.shift():0;
 return {steer,throttle:1,autoAccelerate:true,brake:curv>(kind==='casual'?.62:.9)&&p.speed>24,drift:kind==='pro'&&Math.abs(err)>.22&&p.speed>14,nitro:kind==='pro'&&p.nitro>70&&Math.abs(err)<.08};
}
function drive(stage,config,seed,kind='pro'){
 const race=createRacing({stage,seed,config:{countdown:0,ai:AI,...config}}),p=race.state.player,q=[],lag=kind==='casual'?11:0;
 let t0=performance.now(),steps=0,crashes={wall:0,stuck:0,grind:0},rivalCrashes=0,overtakes=0,shifts=0,g=p.gear;
 for(let n=0;n<400*60&&race.state.phase!=='finished';n++){
  race.step(1/60,bot(race,p,q,lag,kind));steps++;
  for(const e of race.state.events){if(e.type==='crash'){if(e.car==='player')crashes[e.reason]=(crashes[e.reason]||0)+1;else rivalCrashes++;}if(e.type==='overtake')overtakes++;}
  if(p.gear!==g){shifts++;g=p.gear;}
 }
 const ms=performance.now()-t0,laps=Math.max(1,p.lapTimes.length);race.dispose();
 return {msPerStep:+(ms/steps).toFixed(3),playerCrashes:crashes,rivalCrashes,overtakes,shiftsPerLap:+(shifts/laps).toFixed(1),time:+race.state.time.toFixed(0),rank:p.rank};
}
/** Part B: one race, rival behaviour. */
function behaviour(stage,seed,kind='casual'){
 const race=createRacing({stage,seed,config:{countdown:0,extraRivals:5,ai:AI}}),p=race.state.player,q=[],lag=kind==='casual'?11:0,rivals=race.state.cars.slice(1);
 const slow=new Map(rivals.map(c=>[c.id,0])),lock=new Map();let passes=0,rivalCrashes=0,spread60=null,longestLock=0,bumps=0;
 for(let n=0;n<300*60&&race.state.phase!=='finished';n++){
  race.step(1/60,bot(race,p,q,lag,kind));const t=race.state.time;
  for(const e of race.state.events){if(e.type==='pass'&&e.car!=='player')passes++;if(e.type==='crash'&&e.car!=='player')rivalCrashes++;if(e.type==='bump')bumps++;}
  if(t>6)for(const c of rivals)if(!c.finished&&c.speed<5&&c.crashT<=0)slow.set(c.id,slow.get(c.id)+1/60);
  // overlapping pairs: how long does a pair stay within 2.4 m of each other
  for(let a=0;a<rivals.length;a++)for(let b=a+1;b<rivals.length;b++){const x=rivals[a],y=rivals[b];if(x.finished||y.finished)continue;const key=a*16+b,d=Math.hypot(x.x-y.x,x.z-y.z);
   if(d<2.4){const v=(lock.get(key)||0)+1/60;lock.set(key,v);longestLock=Math.max(longestLock,v);}else lock.set(key,0);}
  if(spread60===null&&t>=60){const ps=rivals.map(c=>c.progress).sort((a,b)=>b-a);spread60=+(ps[0]-ps[ps.length-1]).toFixed(0);}
 }
 const slowTotal=[...slow.values()].reduce((a,b)=>a+b,0);race.dispose();
 return {stage,seed,passes,rivalCrashes,slowPerCar:+(slowTotal/rivals.length).toFixed(2),maxSlow:+Math.max(...slow.values()).toFixed(1),spread60,longestLock:+longestLock.toFixed(2),bumps,playerRank:p.rank,time:+race.state.time.toFixed(0)};
}
const out={ai:AI?'deep-m2':'v1',tracks:process.env.RACING_TRACKS||'default'};
for(const [label,config] of [['5 cars',{}],['10 cars',{extraRivals:5}],['12 cars',{extraRivals:7}]]){
 const runs=[[2,11],[4,12],[6,13],[16,14]].map(([stage,seed])=>drive(stage,config,seed));
 out[label]={avgMsPerStep:+(runs.reduce((a,r)=>a+r.msPerStep,0)/runs.length).toFixed(3),playerCrashesPerRace:+(runs.reduce((a,r)=>a+Object.values(r.playerCrashes).reduce((x,y)=>x+y,0),0)/runs.length).toFixed(2),rivalCrashesPerRace:+(runs.reduce((a,r)=>a+r.rivalCrashes,0)/runs.length).toFixed(1),overtakesPerRace:+(runs.reduce((a,r)=>a+r.overtakes,0)/runs.length).toFixed(0),runs};
}
for(const [label,config] of [['shiftMap on',{extraRivals:5}],['shiftMap off',{extraRivals:5,shiftMap:false}]]){
 const runs=[[2,21],[4,22],[6,23],[3,24]].map(([stage,seed])=>drive(stage,config,seed));out[label]={shiftsPerLap:+(runs.reduce((a,r)=>a+r.shiftsPerLap,0)/runs.length).toFixed(1),runs:runs.map(r=>r.shiftsPerLap)};
}
// Part B: 4 races per circuit (two seeds, casual and pro player), 10 cars
const b=[];for(let stage=1;stage<=6;stage++)for(const [seed,kind] of [[31,'casual'],[32,'pro'],[33,'casual'],[34,'pro']])b.push(behaviour(stage,seed,kind));
const avg=k=>+(b.reduce((a,r)=>a+r[k],0)/b.length).toFixed(2);
out.behaviour={races:b.length,passesPerRace:avg('passes'),rivalCrashesPerRace:avg('rivalCrashes'),slowSecondsPerCar:avg('slowPerCar'),worstSlowCar:Math.max(...b.map(r=>r.maxSlow)),spread60m:avg('spread60'),minSpread60m:Math.min(...b.map(r=>r.spread60)),longestLockS:Math.max(...b.map(r=>r.longestLock)),bumpsPerRace:avg('bumps'),races_detail:b};
for(const [k,v] of Object.entries(out))console.log(k.padEnd(14),typeof v==='object'?JSON.stringify({...v,runs:undefined,races_detail:undefined}):v);
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(out,null,1));
