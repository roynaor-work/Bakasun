// Headless league season simulation: three seasons with a casual or pro bot and a greedy upgrade policy. Usage: node tools/racing-league-sim.mjs [out.json]
if(process.env.RACING_TRACKS)globalThis.location={search:'?racingTracks='+process.env.RACING_TRACKS+(process.env.V2Q||'')};
const {createRacing}=await import('../minigames/racing-physics.mjs');
//import {createRacing} from '../minigames/racing-physics.mjs';
const {createLeague,raceSetup,applyRace,nextSeason,buyUpgrade,standings,SEASONS,UPGRADES}=await import('../minigames/racing-league.mjs');
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function race(setup,bot,seed){
 const model=createRacing({stage:setup.stage,seed,config:{countdown:0,equipment:setup.equipment,drivers:setup.drivers,stage:setup.stageOverride}}),tr=model.track,p=model.state.player,q=[];
 const lag=bot==='casual'?11:0;
 for(let n=0;n<(model.stage.timeLimit+2)*60&&model.state.phase!=='finished';n++){
  const pr=tr.project(p.x,p.z,p.s),look=10+p.speed*.5,tg=tr.sample(pr.s+look),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);
  q.push(clamp(err*1.7,-1,1));const steer=q.length>lag?q.shift():0;
  const curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
  model.step(1/60,{steer,throttle:1,autoAccelerate:true,brake:bot==='casual'&&curv>.62&&p.speed>24,drift:bot==='pro'&&Math.abs(err)>.22&&p.speed>14,nitro:bot==='pro'&&p.nitro>70&&Math.abs(err)<.08});
 }
 const cars=[...model.state.cars].sort((a,b)=>a.rank-b.rank),laps=cars.filter(c=>c.lapTimes.length).map(c=>({id:c.id,best:Math.min(...c.lapTimes)})).sort((a,b)=>a.best-b.best);
 const out={order:cars.map(c=>c.id),fastest:laps[0]?.id||null,duration:model.state.time,finished:p.finished,walls:p.wallHits};model.dispose();return out;
}
function season(bot,upgrade=true){
 const L=createLeague(),log=[];
 for(let s=1;s<=SEASONS.length;s++){
  while(true){const setup=raceSetup(L);if(!setup)break;
   const r=race(setup,bot,s*100+L.race),res=applyRace(L,{order:r.order,fastestLapId:r.fastest});
   if(upgrade)for(const name of ['engine','tires','brakes','steering','aero']){}  // order below
   let bought=[];if(upgrade)for(let i=0;i<10;i++){const name=Object.keys(UPGRADES).sort((a,b)=>L.upgrades[a]-L.upgrades[b]||Object.keys(UPGRADES).indexOf(a)-Object.keys(UPGRADES).indexOf(b))[0];const b=buyUpgrade(L,name);if(!b.ok)break;bought.push(name+b.level);}
   log.push({season:s,race:L.race,place:res.place,points:res.points,coins:res.coins,duration:Math.round(r.duration),walls:r.walls,bought});
   if(res.seasonDone)break;}
  const rank=L.seasonRank[s],table=standings(L);log.push({season:s,final:table.map(t=>t.name+' '+t.points).join(' · '),rank});
  if(!nextSeason(L).ok)break;
 }
 return {bot,upgrade,log,upgrades:L.upgrades,coins:L.coins};
}
const results=[season('casual'),season('casual',false),season('pro'),season('pro',false)];
for(const r of results){console.log(`\n== ${r.bot} ${r.upgrade?'with upgrades':'no upgrades'} ==`);
 for(const l of r.log)console.log(l.final?`  season ${l.season}: ${l.final} | player rank ${l.rank}`:`  S${l.season} race ${l.race}: place ${l.place} pts ${l.points} coins ${l.coins} ${l.duration}s walls ${l.walls} ${l.bought.join(',')}`);
 console.log('  upgrades',JSON.stringify(r.upgrades));}
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify(results,null,1));
