// Headless racing baseline: drives every stage with a pure-pursuit bot (no browser) and reports lap time, off-road, recoveries and rank.
// Usage: node tools/racing-sim.mjs [out.json] [stages=1-30] ; bots: "pro" (no lag), "casual" (0.18 s reaction lag, noisy steering, no drift/nitro)
import {createRacing} from '../minigames/racing-physics.mjs';
import {createTrack,getRacingStage} from '../minigames/racing-tracks.mjs';
import {writeFile} from 'node:fs/promises';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const range=(process.argv[3]||'1-30').split('-').map(Number),from=range[0],to=range[1]??range[0];
function rng(seed){let v=seed>>>0;return()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};}
function drive(stageId,bot,seed){
 const race=createRacing({stage:stageId,seed,config:{countdown:0}}),track=race.track,p=race.state.player,r=rng(seed*7+stageId);
 const queue=[];let t=0,offroad=0,offroadEvents=0,wasOff=false,maxLat=0,sumLat=0,n=0,speedSum=0,minSpeed=99;
 const lag=bot==='casual'?Math.round(.18*60):0,noise=bot==='casual'?.12:0;
 while(race.state.phase!=='finished'&&t<400){
  const pr=track.project(p.x,p.z,p.s),look=10+p.speed*.5,tg=track.sample(pr.s+look);
  const err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);let steer=clamp(err*1.7+(r()-.5)*noise,-1,1);
  queue.push(steer);steer=queue.length>lag?queue.shift():0;
  // curve ahead: casual bot brakes for sharp corners the way a person lifts
  const curv=Math.abs(wrap(track.sample(pr.s+26).heading-track.sample(pr.s+6).heading));
  const drift=bot==='pro'&&Math.abs(err)>.22&&p.speed>14,nitro=bot==='pro'&&p.nitro>70&&Math.abs(err)<.08;
  race.step(1/60,{steer,throttle:1,autoAccelerate:true,brake:bot==='casual'&&curv>.62&&p.speed>24,drift,nitro});t+=1/60;
  if(race.state.phase==='countdown')continue;
  if(p.offroad){offroad+=1/60;if(!wasOff)offroadEvents++;}wasOff=p.offroad;
  const lat=Math.abs(p.lateral);maxLat=Math.max(maxLat,lat);sumLat+=lat;n++;speedSum+=p.speed;minSpeed=Math.min(minSpeed,p.speed);
 }
 const rivals=race.state.cars.slice(1),gap=+(p.progress-Math.max(...rivals.map(c=>c.progress))).toFixed(0);
 const res=race.state.result,ai=race.state.cars.slice(1).filter(c=>c.finished).map(c=>c.finishTime);
 const out={bot,time:+race.state.time.toFixed(1),limit:race.stage.timeLimit,rank:res?.rank,won:res?.won,finished:p.finished,offroadSec:+offroad.toFixed(2),offroadEvents,recoveries:p.recoveries,avgLat:+(sumLat/Math.max(1,n)).toFixed(2),maxLat:+maxLat.toFixed(2),avgSpeed:+(speedSum/Math.max(1,n)).toFixed(1),minSpeed:+minSpeed.toFixed(1),gapM:gap,bestAI:ai.length?+Math.min(...ai).toFixed(1):null,aiFinished:ai.length};
 race.dispose();return out;
}
function geometry(stageId){
 const tr=createTrack(stageId),pts=[];const step=4;for(let s=0;s<tr.length;s+=step)pts.push(tr.sample(s));
 let maxTurn=0,sumTurn=0,sharp=0,maxGrade=0,roughY=0;
 for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],d=Math.abs(wrap(b.heading-a.heading));const k=d/step;maxTurn=Math.max(maxTurn,k);sumTurn+=d;if(k>1/20)sharp++;maxGrade=Math.max(maxGrade,Math.abs(b.y-a.y)/step);}
 // sample spacing of the 40-point Catmull-Rom segments is the smallest curve radius resolvable: radius = 1/curvature
 return {length:Math.round(tr.length),width:+tr.width.toFixed(1),minRadius:+(1/maxTurn).toFixed(1),sharpPct:+(sharp/pts.length*100).toFixed(1),maxGradePct:+(maxGrade*100).toFixed(1),wholeTurnDeg:Math.round(sumTurn*180/Math.PI)};
}
const SEEDS=(process.env.SEEDS||'1,2,3').split(',').map(Number),STAGES=process.env.STAGES?process.env.STAGES.split(',').map(Number):null;
const rows=[];
for(let id=from;id<=to;id++){
 if(STAGES&&!STAGES.includes(id))continue;
 const st=getRacingStage(id),g=geometry(id),runs={};
 for(const bot of ['pro','casual']){const list=SEEDS.map(seed=>drive(id,bot,seed));runs[bot]=list;}
 const avg=(bot,k)=>+(runs[bot].reduce((a,r)=>a+(r[k]??0),0)/runs[bot].length).toFixed(2);
 const row={stage:id,track:st.trackId,tier:st.tier,laps:st.laps,geometry:g,
  pro:{gap:avg('pro','gapM'),time:avg('pro','time'),offSec:avg('pro','offroadSec'),recov:avg('pro','recoveries'),rank:avg('pro','rank'),won:runs.pro.filter(r=>r.won).length+'/'+SEEDS.length,minSpeed:avg('pro','minSpeed')},
  casual:{gap:avg('casual','gapM'),time:avg('casual','time'),offSec:avg('casual','offroadSec'),offEv:avg('casual','offroadEvents'),recov:avg('casual','recoveries'),rank:avg('casual','rank'),won:runs.casual.filter(r=>r.won).length+'/'+SEEDS.length,limit:st.timeLimit,minSpeed:avg('casual','minSpeed'),maxLat:avg('casual','maxLat')},bestAI:avg('pro','bestAI')};
 rows.push(row);
 console.log(String(id).padStart(2),st.trackId.padEnd(8),'T'+st.tier,'len',g.length,'w',g.width,'rMin',g.minRadius,'sharp%',g.sharpPct,'| pro',row.pro.time+'s','off',row.pro.offSec,'rec',row.pro.recov,'rank',row.pro.rank,row.pro.won,'gap',row.pro.gap+'m','| casual',row.casual.time+'s/'+st.timeLimit,'off',row.casual.offSec,'ev',row.casual.offEv,'rec',row.casual.recov,'rank',row.casual.rank,row.casual.won,'gap',row.casual.gap+'m','| aiBest',row.bestAI);
}
if(process.argv[2]&&process.argv[2]!=='-')await writeFile(process.argv[2],JSON.stringify(rows,null,1));
