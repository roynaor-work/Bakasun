// Acceleration and gearbox measurements. Usage: node tools/racing-engine-measure.mjs [out.json]; ENGINE=0 uses the previous model.
import {createRacing} from '../minigames/racing-physics.mjs';
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const on=process.env.ENGINE!=='0',wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function accel(engineMul=1){
 const race=createRacing({stage:1,seed:3,config:{countdown:0,engine:on,walls:false,equipment:{engine:engineMul},stage:{opponents:0,grid:1}}}),tr=race.track,p=race.state.player,out={};
 const top=race.stage.playerSpeed*Math.min(1.16,engineMul);let shifts=0,g=p.gear;
 for(let t=0;t<60*60;t++){const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);
  race.step(1/60,{steer:clamp(err*1.7,-1,1),autoAccelerate:true});const time=(t+1)/60;
  if(p.gear!==g){shifts++;g=p.gear;}
  if(out.t100===undefined&&p.speed*3.6>=100)out.t100=+time.toFixed(1);if(out.t90===undefined&&p.speed>=.9*top)out.t90=+time.toFixed(1);if(out.t98===undefined&&p.speed>=.98*top)out.t98=+time.toFixed(1);
  if(out.t98!==undefined)break;}
 out.top=+top.toFixed(1);out.shifts=shifts;race.dispose();return out;
}
function lap(bot){
 const race=createRacing({stage:1,seed:3,config:{countdown:0,engine:on,stage:{laps:3,opponents:0,timeLimit:900,grid:1}}}),tr=race.track,p=race.state.player,q=[],lag=bot==='casual'?11:0;let g=p.gear,shifts=0,lastLapShifts=0;const laps=[];
 for(let t=0;t<900*60&&race.state.phase!=='finished'&&p.lapTimes.length<3;t++){
  const pr=tr.project(p.x,p.z,p.s),tgt=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tgt.x-p.x,tgt.z-p.z)-p.heading),curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
  q.push(clamp(err*1.7,-1,1));const steer=q.length>lag?q.shift():0;
  const before=p.lapTimes.length;race.step(1/60,{steer,throttle:1,autoAccelerate:true,brake:curv>(bot==='casual'?.62:.9)&&p.speed>24,drift:bot==='pro'&&Math.abs(err)>.22&&p.speed>14,nitro:bot==='pro'&&p.nitro>70&&Math.abs(err)<.08});
  if(p.gear!==g){shifts++;g=p.gear;}if(p.lapTimes.length>before){laps.push({time:+p.lapTimes[p.lapTimes.length-1].toFixed(1),shifts:shifts-lastLapShifts});lastLapShifts=shifts;}}
 race.dispose();return laps;
}
const res={engineModel:on,accelStock:accel(1),accelEngine5:accel(1.15),lapPro:lap('pro'),lapCasual:lap('casual')};
console.log(JSON.stringify(res));
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(res,null,1));
