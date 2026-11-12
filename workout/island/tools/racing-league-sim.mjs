// Headless league season simulation on the real race model. Usage: node tools/racing-league-sim.mjs [out.json]
// Env: RACING_SIM_SEASONS=n (seasons per scenario, default all), RACING_SIM_BOTS=casual,normal,pro, RACING_SIM_UPGRADES=1,0, RACING_TRACKS=v2|v1.
// racing-deep-m6: three bot levels (casual = a child, normal = a practised child, pro = near perfect), with and without buying upgrades, the long league's
// full calendar (twelve scoring cars), a missed gate replays the season once (as the app offers) and then the scenario stops; the JSON `summary` has one row
// per scenario: place per season, coins earned, upgrade levels bought, average race length, races cut at the time cap.
if(process.env.RACING_TRACKS)globalThis.location={search:'?racingTracks='+process.env.RACING_TRACKS+(process.env.V2Q||'')};
const {createRacing}=await import('../minigames/racing-physics.mjs');
const {createLeague,raceSetup,applyRace,nextSeason,restartSeason,buyUpgrade,standings,teamStandings,SEASONS,UPGRADES,racesIn,LONG}=await import('../minigames/racing-league.mjs');
import {writeFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
/** Bot levels: steering lag in frames (a child reacts late), braking threshold, and whether drift/nitro are used. */
const BOTS={casual:{lag:11,brakeCurv:.62,brakeSpeed:24,drift:false,nitro:false},normal:{lag:5,brakeCurv:.5,brakeSpeed:27,drift:false,nitro:true},pro:{lag:0,brakeCurv:9,brakeSpeed:99,drift:true,nitro:true}};
function race(setup,bot,seed){
 const b=BOTS[bot];
 const model=createRacing({stage:setup.stage,seed,config:{countdown:0,equipment:setup.equipment,drivers:setup.drivers,extraRivals:setup.extraRivals??5,stage:setup.stageOverride}}),tr=model.track,p=model.state.player,q=[];
 for(let n=0;n<(model.stage.timeLimit+2)*60&&model.state.phase!=='finished';n++){
  const pr=tr.project(p.x,p.z,p.s),look=10+p.speed*.5,tg=tr.sample(pr.s+look),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);
  q.push(clamp(err*1.7,-1,1));const steer=q.length>b.lag?q.shift():0;
  const curv=Math.abs(wrap(tr.sample(pr.s+26).heading-tr.sample(pr.s+6).heading));
  model.step(1/60,{steer,throttle:1,autoAccelerate:true,brake:curv>b.brakeCurv&&p.speed>b.brakeSpeed,drift:b.drift&&Math.abs(err)>.22&&p.speed>14,nitro:b.nitro&&p.nitro>70&&Math.abs(err)<.08});
 }
 const cars=[...model.state.cars].filter(c=>c.scoring!==false).sort((a,b)=>a.rank-b.rank),laps=cars.filter(c=>c.lapTimes.length).map(c=>({id:c.id,best:Math.min(...c.lapTimes)})).sort((a,b)=>a.best-b.best);
 const out={order:cars.map(c=>c.id),fastest:laps[0]?.id||null,duration:model.state.time,finished:p.finished,walls:p.wallHits,field:cars.length};model.dispose();return out;
}
const maxSeasons=Number(process.env.RACING_SIM_SEASONS)||SEASONS.length;
function season(bot,upgrade=true){
 const L=createLeague(),log=[];let earned=0,replays=0,stuck=false;
 for(let s=1;s<=Math.min(maxSeasons,SEASONS.length);){
  while(true){const setup=raceSetup(L);if(!setup)break;
   const r=race(setup,bot,s*1000+L.race*7+replays),res=applyRace(L,{order:r.order,fastestLapId:r.fastest});earned+=res.coins+(res.seasonPrize||0);
   let bought=[];if(upgrade)for(let i=0;i<10;i++){const name=Object.keys(UPGRADES).sort((a,b)=>L.upgrades[a]-L.upgrades[b]||Object.keys(UPGRADES).indexOf(a)-Object.keys(UPGRADES).indexOf(b))[0];const b=buyUpgrade(L,name);if(!b.ok)break;bought.push(name+b.level);}
   log.push({season:s,race:L.race,stage:setup.stage,laps:setup.laps,variant:setup.variant,place:res.place,points:res.points,coins:res.coins,duration:Math.round(r.duration),walls:r.walls,bought,cut:!r.finished,limit:setup.stageOverride.timeLimit,field:r.field});
   if(res.seasonDone)break;}
  const rank=L.seasonRank[s],table=standings(L),teams=teamStandings(L);
  log.push({season:s,final:table.map(t=>t.name+' '+t.points).join(' · '),rank,champion:L.champion[s],teamChampion:teams[0]?.name,prize:L.seasonPrize?.[s]||0,replay:replays>0});
  const next=nextSeason(L);
  if(next.ok){s++;replays=0;continue;}
  if(next.reason==='last season')break;
  // the gate was missed: the app offers the season again; the simulation takes it once, then records the scenario as stuck
  if(replays===0&&restartSeason(L).ok){replays=1;continue;}
  stuck=true;break;
 }
 return {bot,upgrade,log,upgrades:L.upgrades,coins:L.coins,earned,stuck,seasonsReached:L.season};
}
const bots=(process.env.RACING_SIM_BOTS||'casual,normal,pro').split(','),ups=(process.env.RACING_SIM_UPGRADES||'1,0').split(',').map(v=>v==='1');
const results=[];for(const bot of bots)for(const up of ups){const t0=Date.now();const r=season(bot,up);r.wallSeconds=Math.round((Date.now()-t0)/1000);results.push(r);console.error(`done ${bot} ${up?'upgrades':'stock'} in ${r.wallSeconds}s`);}
// one line per scenario for the report (places per season, race length, races cut at the time cap, upgrades, titles), written into the JSON as `summary`.
const summary=results.map(r=>{const races=r.log.filter(l=>!l.final),d=races.map(l=>l.duration),finals=r.log.filter(l=>l.final);
 return {bot:r.bot,upgrade:r.upgrade,seasonRank:finals.map(l=>l.rank),titles:finals.filter(l=>l.champion==='player').length,firstTitle:finals.find(l=>l.champion==='player')?.season??null,teamTitles:finals.filter(l=>l.teamChampion==='להבה').length,
  races:races.length,avgDuration:Math.round(d.reduce((a,b)=>a+b,0)/Math.max(1,d.length)),avgMinutes:+(d.reduce((a,b)=>a+b,0)/Math.max(1,d.length)/60).toFixed(2),minDuration:Math.min(...d),maxDuration:Math.max(...d),cut:races.filter(l=>l.cut).length,wins:races.filter(l=>l.place===1).length,podiums:races.filter(l=>l.place<=3).length,
  upgrades:r.upgrades,upgradeLevels:Object.values(r.upgrades).reduce((a,b)=>a+b,0),earned:r.earned,coinsLeft:r.coins,stuck:r.stuck,seasonsReached:r.seasonsReached,replays:finals.filter(l=>l.replay).length,wallSeconds:r.wallSeconds};});
for(const r of results){console.log(`\n== ${r.bot} ${r.upgrade?'with upgrades':'no upgrades'} ==`);
 for(const l of r.log)console.log(l.final?`  season ${l.season}${l.replay?' (replay)':''}: ${l.final} | player rank ${l.rank} | champion ${l.champion} | team ${l.teamChampion} | prize ${l.prize}`:`  S${l.season} race ${l.race} st${l.stage} ${l.laps}L ${l.variant}: place ${l.place}/${l.field} pts ${l.points} coins ${l.coins} ${l.duration}s${l.cut?' CUT':''} walls ${l.walls} ${l.bought.join(',')}`);
 console.log('  upgrades',JSON.stringify(r.upgrades),'earned',r.earned,'left',r.coins,r.stuck?'STUCK':'');}
console.log('\n== summary ==');for(const s of summary)console.log(`  ${s.bot} ${s.upgrade?'upgrades':'stock'}: seasons ${s.seasonRank.join('/')} | titles ${s.titles} (first S${s.firstTitle}) | avg ${s.avgDuration}s = ${s.avgMinutes} min (${s.minDuration}-${s.maxDuration}) | cut ${s.cut}/${s.races} | wins ${s.wins} | levels ${s.upgradeLevels} | earned ${s.earned}${s.stuck?' | STUCK':''}`);
if(process.argv[2])await writeFile(fileURLToPath(new URL('../'+process.argv[2],import.meta.url)),JSON.stringify({generated:new Date().toISOString(),tracks:process.env.RACING_TRACKS||'default',long:LONG,seasons:maxSeasons,summary,results},null,1));
