// Computer-driver pace against the measurement bots, per league stage (tiers 0, 2, 4 = seasons 1-3): best lap of the computer leader (league drivers, rating + season
// bonus, 10 cars, the player idle) next to the lap of the casual and the pro player bot driving alone on the same stage. Usage: node tools/racing-ai-pace.mjs [out.json]
// env RACING_AI=0 measures the previous drivers, RACING_TRACKS=f1 the old circuits; tuning: AI_CORNER_MULT, AI_SPEED_MULT (scale the stage's aiCorner / aiSpeed), SEASONS=1,2 (subset).
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
if(process.env.RACING_TRACKS)globalThis.location={search:'?racingTracks='+process.env.RACING_TRACKS+(process.env.V2Q||'')};
const {createRacing}=await import('../minigames/racing-physics.mjs');
const {DRIVERS,SEASONS,seasonStages}=await import('../minigames/racing-league-core.mjs');const {getRacingStage}=await import('../minigames/racing-tracks.mjs');
const AI=process.env.RACING_AI!=='0',CM=Number(process.env.AI_CORNER_MULT||1),SM=Number(process.env.AI_SPEED_MULT||1),ONLY=(process.env.SEASONS||'1,2,3').split(',').map(Number),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function botLap(stage,kind){
 const race=createRacing({stage,seed:3,config:{countdown:0,stage:{laps:3,opponents:0,timeLimit:900,grid:1}}}),tr=race.track,p=race.state.player,q=[],lag=kind==='casual'?11:0;
 for(let t=0;t<900*60&&p.lapTimes.length<2;t++){
  const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading),curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
  q.push(clamp(err*1.7,-1,1));const steer=q.length>lag?q.shift():0;
  race.step(1/60,{steer,throttle:1,autoAccelerate:true,brake:curv>(kind==='casual'?.62:.9)&&p.speed>24,drift:kind==='pro'&&Math.abs(err)>.22&&p.speed>14,nitro:kind==='pro'&&p.nitro>70&&Math.abs(err)<.08});}
 race.dispose();return p.lapTimes[1]||null;
}
function aiLaps(stage,season){
 const drivers=DRIVERS.map(d=>({name:d.name,rating:d.rating+season.rating})),base=getRacingStage(stage);
 const race=createRacing({stage,seed:5,config:{countdown:0,drivers,extraRivals:5,ai:AI,stage:{laps:3,timeLimit:900,aiCorner:base.aiCorner*CM,aiSpeed:base.aiSpeed*SM}}}),cars=race.state.cars.slice(1);
 for(let t=0;t<900*60&&!cars.some(c=>c.lapTimes.length>=2);t++)race.step(1/60,{autoAccelerate:false});
 const best=Math.min(...cars.flatMap(c=>c.lapTimes)),scoring=cars.filter(c=>c.scoring).flatMap(c=>c.lapTimes);race.dispose();
 return {best:+best.toFixed(1),scoringBest:+Math.min(...scoring).toFixed(1),scoringMean:+(scoring.reduce((a,b)=>a+b,0)/scoring.length).toFixed(1),maxSpeed:+Math.max(...cars.map(c=>c.maxSpeed)).toFixed(1)};
}
const rows=[];
for(const season of SEASONS.filter(x=>ONLY.includes(x.id)))for(const stage of seasonStages(season.id)){
 const ai=aiLaps(stage,season),casual=botLap(stage,'casual'),pro=botLap(stage,'pro');
 rows.push({season:season.id,stage,aiBest:ai.best,aiScoringBest:ai.scoringBest,aiScoringMean:ai.scoringMean,aiMaxSpeed:ai.maxSpeed,casual:+casual.toFixed(1),pro:+pro.toFixed(1),aiVsCasual:+(ai.scoringBest/casual).toFixed(3),aiVsPro:+(ai.scoringBest/pro).toFixed(3)});
 console.log(JSON.stringify(rows.at(-1)));
}
for(const season of SEASONS.filter(x=>ONLY.includes(x.id))){const r=rows.filter(x=>x.season===season.id),m=k=>+(r.reduce((a,x)=>a+x[k],0)/r.length).toFixed(2);console.log(`season ${season.id}: ai scoring best/casual ${m('aiVsCasual')}  ai/pro ${m('aiVsPro')}`);}
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(rows,null,1));
