// Racing grid measurements without a browser: physics cost per step for 5 and 10 cars, crashes and stuck events per race, overtakes, and shifts per lap with and without the shift map.
// Usage: node tools/racing-grid-measure.mjs [out.json]
import {createRacing} from '../minigames/racing-physics.mjs';
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function drive(stage,config,seed,bot='pro'){
 const race=createRacing({stage,seed,config:{countdown:0,...config}}),tr=race.track,p=race.state.player,q=[],lag=bot==='casual'?11:0;
 let t0=performance.now(),steps=0,crashes={wall:0,stuck:0},rivalCrashes=0,overtakes=0,shifts=0,g=p.gear;
 for(let n=0;n<400*60&&race.state.phase!=='finished';n++){
  const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
  q.push(clamp(err*1.7,-1,1));const steer=q.length>lag?q.shift():0;
  race.step(1/60,{steer,throttle:1,autoAccelerate:true,brake:curv>(bot==='casual'?.62:.9)&&p.speed>24,drift:bot==='pro'&&Math.abs(err)>.22&&p.speed>14,nitro:bot==='pro'&&p.nitro>70&&Math.abs(err)<.08});steps++;
  for(const e of race.state.events){if(e.type==='crash'){if(e.car==='player')crashes[e.reason]++;else rivalCrashes++;}if(e.type==='overtake')overtakes++;}
  if(p.gear!==g){shifts++;g=p.gear;}
 }
 const ms=performance.now()-t0,laps=Math.max(1,p.lapTimes.length);race.dispose();
 return {msPerStep:+(ms/steps).toFixed(3),playerCrashes:crashes,rivalCrashes,overtakes,shiftsPerLap:+(shifts/laps).toFixed(1),time:+race.state.time.toFixed(0),rank:p.rank};
}
const out={};
for(const [label,config] of [['5 cars',{}],['10 cars',{extraRivals:5}],['12 cars',{extraRivals:7}]]){
 const runs=[[2,11],[4,12],[6,13],[16,14]].map(([stage,seed])=>drive(stage,config,seed));
 out[label]={avgMsPerStep:+(runs.reduce((a,r)=>a+r.msPerStep,0)/runs.length).toFixed(3),playerCrashesPerRace:+(runs.reduce((a,r)=>a+r.playerCrashes.wall+r.playerCrashes.stuck,0)/runs.length).toFixed(2),rivalCrashesPerRace:+(runs.reduce((a,r)=>a+r.rivalCrashes,0)/runs.length).toFixed(1),overtakesPerRace:+(runs.reduce((a,r)=>a+r.overtakes,0)/runs.length).toFixed(0),runs};
}
for(const [label,config] of [['shiftMap on',{extraRivals:5}],['shiftMap off',{extraRivals:5,shiftMap:false}]]){
 const runs=[[2,21],[4,22],[6,23],[3,24]].map(([stage,seed])=>drive(stage,config,seed));out[label]={shiftsPerLap:+(runs.reduce((a,r)=>a+r.shiftsPerLap,0)/runs.length).toFixed(1),runs:runs.map(r=>r.shiftsPerLap)};
}
for(const [k,v] of Object.entries(out))console.log(k.padEnd(14),JSON.stringify({...v,runs:undefined}));
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(out,null,1));
