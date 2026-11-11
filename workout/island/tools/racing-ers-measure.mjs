// Energy recovery (ERS) per lap with and without the recovery. The bot spends the meter on straights once it holds 35 units, brakes into sharp corners.
// Usage: node tools/racing-ers-measure.mjs [out.json]
import {createRacing} from '../minigames/racing-physics.mjs';
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function run(trackStage,ers,bot){
 const race=createRacing({stage:trackStage,seed:3,config:{countdown:0,ers,stage:{laps:4,opponents:0,timeLimit:900,grid:1}}}),tr=race.track,p=race.state.player,q=[],lag=bot==='casual'?11:0;
 let activations=0,boostingBefore=false,lapStart=0;const laps=[];let usedAt=0,harvestedAt=0;
 for(let t=0;t<900*60&&p.lapTimes.length<4;t++){
  const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading)),straight=curv<.15&&Math.abs(err)<.08;
  q.push(clamp(err*1.7,-1,1));const steer=q.length>lag?q.shift():0;
  const wantBoost=straight&&p.nitro>=(boostingBefore?4:35);
  const before=p.lapTimes.length;
  race.step(1/60,{steer,throttle:1,autoAccelerate:true,brake:curv>(bot==='casual'?.62:.9)&&p.speed>24,drift:bot==='pro'&&Math.abs(err)>.22&&p.speed>14,nitro:wantBoost});
  if(p.boosting&&p.nitro>0&&wantBoost&&!boostingBefore)activations++;boostingBefore=wantBoost&&p.nitro>0;
  if(p.lapTimes.length>before)laps.push({time:+p.lapTimes[p.lapTimes.length-1].toFixed(1),activations,harvested:+(p.ersHarvested-harvestedAt).toFixed(0),used:+(p.ersUsed-usedAt).toFixed(0)}),activations=0,harvestedAt=p.ersHarvested,usedAt=p.ersUsed;
 }
 race.dispose();return laps;
}
// racing-deep-m3: does the meter FILL during an ordinary lap when the driver never spends it (a casual bot that brakes for the corners), and how long a
// full charge gives the +12 m/s nitro push (the model spends 29 units per second).
function fill(trackStage,bot){
 const race=createRacing({stage:trackStage,seed:3,config:{countdown:0,ers:true,stage:{laps:3,opponents:0,timeLimit:900,grid:1}}}),tr=race.track,p=race.state.player,q=[],lag=bot==='casual'?11:0;
 p.nitro=0;let fills=0,full=false,firstFullAt=null,lapStart=0;const perLap=[];
 for(let t=0;t<900*60&&p.lapTimes.length<3;t++){
  const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
  q.push(clamp(err*1.7,-1,1));const steer=q.length>lag?q.shift():0;const before=p.lapTimes.length;
  race.step(1/60,{steer,throttle:1,autoAccelerate:true,brake:curv>(bot==='casual'?.62:.9)&&p.speed>24,drift:bot==='pro'&&Math.abs(err)>.22&&p.speed>14,nitro:false});
  if(p.nitro>=99.5&&!full){full=true;fills++;if(firstFullAt===null)firstFullAt=+(race.state.time-lapStart).toFixed(1);p.nitro=0;}else if(p.nitro<99.5)full=false;
  if(p.lapTimes.length>before){perLap.push({lap:p.lapTimes.length,time:+p.lapTimes.at(-1).toFixed(1),fills,firstFullAtS:firstFullAt});fills=0;firstFullAt=null;lapStart=race.state.time;}
 }
 race.dispose();return perLap;
}
function push(){
 const race=createRacing({stage:1,seed:3,config:{countdown:0,ers:true,walls:false,scrub:false,stage:{opponents:0,grid:1}}}),tr=race.track,p=race.state.player;
 for(let t=0;t<60*40;t++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);race.step(1/60,{steer:clamp(err*1.7,-1,1),autoAccelerate:true});}
 const base=p.speed;p.nitro=100;let seconds=0,peak=base;
 for(let t=0;t<60*8;t++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);race.step(1/60,{steer:clamp(err*1.7,-1,1),autoAccelerate:true,nitro:true});if(p.boosting)seconds+=1/60;peak=Math.max(peak,p.speed);}
 race.dispose();return {cruise:+base.toFixed(1),peakWithNitro:+peak.toFixed(1),gain:+(peak-base).toFixed(1),boostSeconds:+seconds.toFixed(1)};
}
const out={fillsPerLap:{},nitroPush:push()};
for(const [stage,name] of [[1,'coast'],[4,'harbor'],[6,'ruins'],[2,'jungle']])for(const bot of ['pro','casual'])out.fillsPerLap[`${name}-${bot}`]=fill(stage,bot);
for(const [k,v] of Object.entries(out.fillsPerLap))console.log(k.padEnd(16),'fills per lap',v.map(l=>l.fills).join('/'),'| first full after',v.map(l=>l.firstFullAtS).join('/'),'s of',v.map(l=>l.time).join('/'),'s');
console.log('nitro push: cruise',out.nitroPush.cruise,'m/s, peak with a full meter',out.nitroPush.peakWithNitro,'m/s (+'+out.nitroPush.gain+'), boost lasts',out.nitroPush.boostSeconds,'s');
for(const [stage,name] of [[1,'coast'],[4,'harbor'],[6,'ruins'],[2,'jungle']])for(const bot of ['pro','casual']){
 for(const ers of [false,true]){const laps=run(stage,ers,bot);const flying=laps.slice(1);out[`${name}-${bot}-${ers?'ers':'noers'}`]={laps,avgFlying:+(flying.reduce((a,l)=>a+l.time,0)/flying.length).toFixed(1),avgActivations:+(flying.reduce((a,l)=>a+l.activations,0)/flying.length).toFixed(1),avgHarvest:+(flying.reduce((a,l)=>a+l.harvested,0)/flying.length).toFixed(0),avgUsed:+(flying.reduce((a,l)=>a+l.used,0)/flying.length).toFixed(0)};}
}
for(const [k,v] of Object.entries(out))if(v.laps)console.log(k.padEnd(20),'lap',v.avgFlying,'boosts/lap',v.avgActivations,'harvested/lap',v.avgHarvest,'used/lap',v.avgUsed);
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(out,null,1));
