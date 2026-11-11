// Share of lap time spent above 95% of top speed (hands-off autopilot bots, headless). Usage: node tools/racing-topspeed.mjs [out.json]; env RACING_TRACKS=v1 selects old circuits
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
if(process.env.RACING_TRACKS)globalThis.location={search:'?racingTracks='+process.env.RACING_TRACKS+(process.env.V2Q||'')};
const {TRACKS}=await import('../minigames/racing-tracks.mjs');const {createRacing}=await import('../minigames/racing-physics.mjs');
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function run(id,bot){
 const race=createRacing({stage:TRACKS.findIndex(t=>t.id===id)+1,seed:3,config:{countdown:0,stage:{laps:3,opponents:0,timeLimit:900,grid:1}}}),tr=race.track,p=race.state.player,q=[],lag=bot==='casual'?11:0,speeds=[];
 for(let t=0;t<900*60&&race.state.phase!=='finished'&&p.lapTimes.length<3;t++){
  const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
  q.push(clamp(err*1.7,-1,1));const steer=q.length>lag?q.shift():0;
  race.step(1/60,{steer,throttle:1,autoAccelerate:true,brake:curv>(bot==='casual'?.62:.9)&&p.speed>24,drift:bot==='pro'&&Math.abs(err)>.22&&p.speed>14,nitro:false});
  if(p.lapTimes.length>=1)speeds.push(p.speed);}
 race.dispose();const top=40.5,over=speeds.filter(v=>v>=.95*top).length/speeds.length,mean=speeds.reduce((a,b)=>a+b,0)/speeds.length;
 return {top:+top.toFixed(1),mean:+mean.toFixed(1),over95:+(over*100).toFixed(1),under85:+(speeds.filter(v=>v<.85*top).length/speeds.length*100).toFixed(1),lap:p.lapTimes[0]?+p.lapTimes[0].toFixed(1):null};
}
const rows=TRACKS.map(t=>({id:t.id,plain:run(t.id,'plain'),pro:run(t.id,'pro'),casual:run(t.id,'casual')}));
for(const r of rows)console.log(r.id.padEnd(8),'plain',JSON.stringify(r.plain),'pro',JSON.stringify(r.pro),'casual',JSON.stringify(r.casual));
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(rows,null,1));
