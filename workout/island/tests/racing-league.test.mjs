import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createLeague,raceSetup,applyRace,nextSeason,restartSeason,buyUpgrade,equipmentFor,standings,teamStandings,rivalOf,seasonStages,seasonCalendar,racesIn,lapVariant,isRaceUnlocked,
  normalizeLeague,validLeague,mergeLeague,leagueSummary,setShortRaces,describeRace,formOf,longLeagueEnabled,calendar,lapsForDistance,raceDistance,CIRCUIT_LENGTHS,MAX_DISTANCE,LONG,POINTS,PRIZE,SEASON_PRIZE,TEAM_PRIZE,SEASONS,DRIVERS,GRID_DRIVERS,TEAMS,LEAGUE_IDS,UPGRADES,MAX_LEVEL,HISTORY_CAP,MIN_LAPS,MAX_LAPS} from '../minigames/racing-league.mjs';
import {createRacing} from '../minigames/racing-physics.mjs';
import {getRacingStage} from '../minigames/racing-tracks.mjs';

const AI=Array.from({length:LEAGUE_IDS.length-1},(_,i)=>'ai-'+(i+1));   // car ids of the model, in grid order
/** Finishing order with the player at `place` (1-based) and the computer drivers in grid order around it. */
const finish=(place,rest=AI)=>{const o=[...rest];o.splice(place-1,0,'player');return o;};
const runSeason=(L,place=1)=>{let r;while(!(r=applyRace(L,{order:finish(place)})).seasonDone);return r;};

test('long league is the default: five seasons of 12-18 races, twelve scoring drivers in six teams of two, F1 points',()=>{
  assert.equal(LONG,true);assert.equal(longLeagueEnabled('?racingLongLeague=0'),false);assert.equal(longLeagueEnabled('?x=1'),true);
  assert.equal(SEASONS.length,5);assert.deepEqual(SEASONS.map(s=>racesIn(s.id)),[12,14,16,18,18]);for(const s of SEASONS)assert.ok(racesIn(s.id)>=12&&racesIn(s.id)<=24);
  assert.deepEqual([...POINTS],[25,18,15,12,10,8,6,4,2,1]);assert.equal(DRIVERS.length,11);assert.equal(LEAGUE_IDS.length,12);assert.equal(PRIZE.length,12);
  assert.equal(GRID_DRIVERS.filter(d=>d.scoring).length,12);assert.ok(GRID_DRIVERS.every(d=>d.rating>0.9&&d.rating<1.1&&d.teamId&&d.team));
  assert.equal(TEAMS.length,6);for(const t of TEAMS)assert.equal(t.drivers.length,2);assert.equal(new Set(TEAMS.flatMap(t=>t.drivers)).size,12);
  const names=new Set(GRID_DRIVERS.map(d=>d.name));for(const t of TEAMS)assert.ok(!names.has(t.name),'a team name is never a driver name: '+t.name);
  for(const d of GRID_DRIVERS)assert.ok(!/!/.test(d.name+d.team+d.style));for(const t of TEAMS)assert.ok(!/!/.test(t.name));
  const L=createLeague();assert.equal(Object.keys(L.table).length,12);assert.equal(standings(L).length,12);assert.equal(teamStandings(L).length,6);
});
test('calendar: every circuit visits every tier of the season before repeating, long and short races, laps in one place',()=>{
  for(const s of SEASONS){
    const cal=seasonCalendar(s.id);assert.equal(cal.length,s.races);assert.deepEqual(seasonStages(s.id),cal.map(c=>c.stage));
    const seen=new Set();cal.slice(0,6*s.tiers.length).forEach(c=>seen.add(c.circuit+':'+c.tier));assert.equal(seen.size,Math.min(cal.length,6*s.tiers.length),'a Latin square of circuits and tiers in season '+s.id);
    for(const c of cal){assert.ok(s.tiers.includes(c.tier));assert.equal(c.stage,c.tier*6+c.circuit+1);assert.equal(c.laps,Math.max(MIN_LAPS,Math.min(MAX_LAPS,s.laps+(c.variant==='long'?1:c.variant==='short'?-1:0))));assert.equal(c.variant,lapVariant(c.race));
      const d=describeRace(c);assert.equal(d.track,getRacingStage(c.stage).name);assert.ok(['יום','שעת זהב','שקיעה','לילה'].includes(d.time));assert.equal(d.reverse,getRacingStage(c.stage).reverse);}
    assert.ok(cal.some(c=>c.variant==='long')&&cal.some(c=>c.variant==='short'));
    // the six circuits in both directions and more than one time of day across the season
    assert.ok(new Set(cal.map(c=>getRacingStage(c.stage).timeOfDay)).size>=2,'time of day varies');
  }
  assert.ok(seasonCalendar(3).some(c=>getRacingStage(c.stage).reverse),'season 3 has reversed circuits');
  const short=seasonCalendar(1,{shortRaces:true});short.forEach((c,i)=>assert.equal(c.laps,Math.max(MIN_LAPS,seasonCalendar(1)[i].laps-1)));
  assert.deepEqual(seasonCalendar(9),[]);
});
test('applyRace with twelve: points, fastest lap only in the top ten, prizes, history with stage and order, season end with podium, team champion and prize',()=>{
  const L=createLeague(),r=applyRace(L,{order:finish(1),fastestLapId:'player'});
  assert.equal(r.points,26);assert.equal(r.place,1);assert.equal(L.coins,PRIZE[0]+40);assert.equal(L.table[DRIVERS[0].id],18);assert.equal(L.table[DRIVERS[9].id],0);assert.equal(L.race,1);
  const h=L.history[0];assert.equal(h.stage,seasonCalendar(1)[0].stage);assert.equal(h.order.length,12);assert.equal(h.order[0],0);assert.equal(h.fastest,0);
  const M=createLeague(),r2=applyRace(M,{order:finish(12),fastestLapId:'player'});assert.equal(r2.points,0,'no fastest-lap point outside the top ten');assert.equal(M.coins,PRIZE[11]+40,'the coin bonus still pays');
  const N=createLeague(),r3=applyRace(N,{order:finish(10),fastestLapId:'player'});assert.equal(r3.points,2);
  assert.throws(()=>applyRace(createLeague(),{order:finish(1).slice(0,5)}),/invalid/);assert.throws(()=>applyRace(createLeague(),{order:['player','player',...AI.slice(1)]}));
  const S=createLeague(),end=runSeason(S,1);
  assert.equal(end.seasonDone,true);assert.equal(S.race,12);assert.equal(S.seasonRank[1],1);assert.equal(S.champion[1],'player');assert.deepEqual(S.seasonPodium[1],['player',DRIVERS[0].id,DRIVERS[1].id]);
  assert.equal(S.teamChampion[1],'flame');assert.equal(S.seasonPrize[1],SEASON_PRIZE[0]+TEAM_PRIZE);assert.equal(end.seasonPrize,SEASON_PRIZE[0]+TEAM_PRIZE);
  assert.equal(S.coins,12*PRIZE[0]+SEASON_PRIZE[0]+TEAM_PRIZE);assert.deepEqual(end.podium,S.seasonPodium[1]);
  const W=createLeague();runSeason(W,12);assert.equal(W.seasonRank[1],12);assert.equal(W.seasonPrize[1],SEASON_PRIZE[11]);assert.notEqual(W.teamChampion[1],'flame');
});
test('teams table sums the pairs; the rival is the driver just above you with head-to-head numbers',()=>{
  const L=createLeague();applyRace(L,{order:finish(3)});
  const teams=teamStandings(L);assert.equal(teams.length,6);assert.equal(teams[0].points,25+12,'ocean: almog 25 (1st) + shemesh 12 (4th)');assert.ok(teams.find(t=>t.mine).points>=15);
  const rival=rivalOf(L);assert.equal(rival.id,DRIVERS[1].id,'the driver one place above');assert.equal(rival.diff,18-15);assert.equal(rival.myPlace,3);assert.equal(rival.place,2);assert.equal(rival.races,1);assert.equal(rival.ahead,0);assert.equal(rival.behind,1);
  applyRace(L,{order:finish(1)});const r1=rivalOf(L);assert.equal(r1.id,DRIVERS[0].id,'almog 43 is still ahead of 40');assert.equal(r1.diff,3);assert.equal(r1.ahead,1);assert.equal(r1.behind,1);assert.equal(r1.myWins,1);assert.equal(r1.wins,1);
  applyRace(L,{order:finish(1)});const r2=rivalOf(L);assert.equal(r2.myPlace,1);assert.equal(r2.place,2,'when leading, the rival is the one behind');assert.equal(r2.myWins,2);assert.equal(r2.id,DRIVERS[0].id);assert.ok(r2.diff<0);
  assert.equal(rivalOf(createLeague()).myPlace,1);
});
test('gates and replay: season 2 opens from 8th, the last season has no gate; a missed gate offers the season again without losing coins or upgrades',()=>{
  const L=createLeague();runSeason(L,8);assert.equal(nextSeason(L).ok,true);assert.equal(L.season,2);assert.equal(L.race,0);assert.equal(L.table.player,0);
  const M=createLeague();runSeason(M,9);const coins=M.coins;M.upgrades.engine=2;assert.equal(nextSeason(M).ok,false);assert.equal(nextSeason(M).need,8);
  assert.equal(restartSeason(M).ok,true);assert.equal(M.season,1);assert.equal(M.race,0);assert.equal(M.coins,coins);assert.equal(M.upgrades.engine,2);assert.ok(M.history.length>0);
  assert.equal(restartSeason(M).ok,false,'not finished');runSeason(M,1);assert.equal(restartSeason(M).reason,'gate open');assert.equal(nextSeason(M).ok,true);
  assert.deepEqual(SEASONS.map(s=>s.minRank),[0,8,6,5,4]);
  const Z=createLeague();Z.season=5;runSeason(Z,5);assert.equal(nextSeason(Z).reason,'last season');assert.equal(restartSeason(Z).ok,true,'the last season can be raced again');
});
test('race setup: twelve scoring cars through config only, season rating plus a deterministic form, long/short laps, tags, time cap',()=>{
  const L=createLeague();L.upgrades.engine=3;const s=raceSetup(L);
  assert.equal(s.stage,seasonCalendar(1)[0].stage);assert.equal(s.laps,3);assert.equal(s.stageOverride.opponents,11);assert.equal(s.extraRivals,0);assert.equal(s.field,12);assert.equal(s.total,12);assert.ok(s.stageOverride.timeLimit<=295);
  assert.deepEqual(s.drivers.map(d=>d.name),DRIVERS.map(d=>d.name));s.drivers.forEach((d,i)=>assert.ok(Math.abs(d.rating-(DRIVERS[i].rating+SEASONS[0].rating))<=0.012));
  assert.equal(formOf(1,0,1),formOf(1,0,1));assert.notEqual(formOf(1,0,1),formOf(1,1,1));assert.ok(Math.abs(formOf(3,7,5))<=0.012);
  const race=createRacing({stage:s.stage,seed:1,config:{countdown:0,equipment:s.equipment,drivers:s.drivers,extraRivals:s.extraRivals,stage:s.stageOverride}});
  assert.equal(race.state.cars.length,12);assert.equal(race.state.cars.filter(c=>c.scoring!==false).length,12);assert.deepEqual(race.state.cars.slice(1).map(c=>c.name),DRIVERS.map(d=>d.name));assert.equal(race.state.laps,3);race.dispose();
  // laps come from the race distance and the real circuit length: a long race on the 1.5 km jungle circuit is 5 laps (6 would pass MAX_DISTANCE), a sprint on the 1.46 km summit 3
  L.race=1;const long=raceSetup(L);assert.equal(long.variant,'long');assert.equal(long.laps,lapsForDistance(raceDistance(SEASONS[0],'long'),CIRCUIT_LENGTHS[1]));assert.equal(long.laps,5);assert.ok(long.laps*CIRCUIT_LENGTHS[1]<=MAX_DISTANCE);assert.ok(long.tags.includes('מרוץ ארוך'));
  assert.equal(long.stageOverride.aiCorner,+(getRacingStage(long.stage).aiCorner*SEASONS[0].corner).toFixed(3),'the season raises the computer drivers\' cornering');
  L.race=4;assert.equal(raceSetup(L).variant,'short');assert.equal(raceSetup(L).laps,3);setShortRaces(L,true);assert.equal(raceSetup(L).laps,MIN_LAPS);L.race=0;assert.equal(raceSetup(L).laps,2,'short races: 7400*0.7 on the 2.3 km grand prix = 2 laps');
  for(const sId of SEASONS.map(x=>x.id))for(const c of calendar(sId)){assert.ok(c.laps>=MIN_LAPS&&c.laps<=MAX_LAPS);assert.ok(c.laps*CIRCUIT_LENGTHS[c.circuit]<=MAX_DISTANCE,'under the 295 s clock budget');assert.ok(Math.abs(c.laps*CIRCUIT_LENGTHS[c.circuit]-c.distance)<=CIRCUIT_LENGTHS[c.circuit]*.5+1||c.laps*CIRCUIT_LENGTHS[c.circuit]<=MAX_DISTANCE);}
  assert.deepEqual(CIRCUIT_LENGTHS.map(Math.round),[2276,1513,1344,2299,1459,2264]);
  assert.equal(isRaceUnlocked(L,1,0),true);assert.equal(isRaceUnlocked(L,1,5),false);assert.equal(isRaceUnlocked(L,2,0),false);
  L.race=12;assert.equal(raceSetup(L),null);
});
test('upgrades: six parts including ERS, cost by level, stop at level 5, map to the physics equipment within the caps',()=>{
  const L=createLeague();assert.equal(Object.keys(L.upgrades).length,6);assert.equal(L.upgrades.ers,0);assert.equal(buyUpgrade(L,'ers').ok,false);L.coins=100000;
  for(let i=0;i<MAX_LEVEL;i++)assert.equal(buyUpgrade(L,'ers').ok,true);assert.equal(buyUpgrade(L,'ers').reason,'max');assert.equal(buyUpgrade(L,'nope').ok,false);
  for(const name of Object.keys(UPGRADES))L.upgrades[name]=MAX_LEVEL;
  const eq=equipmentFor(L.upgrades);assert.ok(eq.engine<=1.16&&eq.grip<=1.16&&eq.steer<=1.12&&eq.brakes<=1.3&&eq.aero<=1.25&&eq.nitro<=1.16);assert.ok(eq.nitro>1.1);
  const run=cfg=>{const r=createRacing({stage:3,seed:5,config:{countdown:0,walls:false,stage:{opponents:0},...cfg}});for(let n=0;n<300;n++)r.step(1/60,{autoAccelerate:true,steer:0});const v=r.state.player;const out={nitro:v.nitro,dist:v.distanceDriven};r.dispose();return out;};
  assert.ok(run({equipment:{nitro:1.15}}).nitro>run({}).nitro,'ERS raises the energy store');assert.equal(run({equipment:{nitro:1}}).dist,run({}).dist);
});
test('normalizeLeague: a version-19 save with five drivers, six races a season, mid season 2 continues without losing anything',()=>{
  const old={version:1,season:2,race:3,coins:415,upgrades:{engine:2,tires:1,steering:0,brakes:1,aero:0},table:{player:40,almog:33,turkiz:52,shemesh:18,barkat:25},
    history:[0,1,2,3,4,5].map(i=>({season:1,race:i,place:1+(i%5),points:[25,18,15,12,10][i%5],coins:[220,160,120,90,70][i%5]})).concat([0,1,2].map(i=>({season:2,race:i,place:2,points:18,coins:160}))),champion:{1:'player'},seasonRank:{1:1}};
  const before=structuredClone(old);assert.equal(validLeague(structuredClone(old)),true,'the old shape is accepted even before normalizing');
  const l=normalizeLeague(structuredClone(old));assert.equal(validLeague(l),true);
  assert.equal(l.season,2);assert.equal(l.race,3);assert.equal(l.coins,415);assert.equal(l.upgrades.engine,2);assert.equal(l.upgrades.ers,0);assert.equal(Object.keys(l.upgrades).length,6);
  for(const [id,v] of Object.entries(before.table))assert.equal(l.table[id],v);assert.equal(Object.keys(l.table).length,12);assert.equal(l.table.gal,0);
  assert.deepEqual(l.history,before.history);assert.deepEqual(l.champion,{1:'player'});assert.deepEqual(l.seasonRank,{1:1});assert.deepEqual(l.seasonPodium,{});
  // the season goes on from race 4 of the long calendar: 14 races, the three old results count
  const sum=leagueSummary(l);assert.equal(sum.race,3);assert.equal(sum.total,14);assert.equal(sum.done,false);assert.equal(sum.table.find(r=>r.id==='turkiz').points,52);assert.equal(sum.career,6*0+0+before.history.reduce((n,h)=>n+h.points,0));
  const setup=raceSetup(l);assert.equal(setup.race,3);assert.equal(setup.stage,seasonCalendar(2)[3].stage);
  applyRace(l,{order:finish(1)});assert.equal(l.race,4);assert.equal(l.table.player,65);assert.equal(l.history.length,10);assert.equal(validLeague(l),true);
  assert.equal(normalizeLeague(null),null);assert.equal(normalizeLeague(5),5);const fresh=createLeague();assert.deepEqual(normalizeLeague(structuredClone(fresh)),fresh,'a fresh league is unchanged');
});
test('validLeague accepts missing optional fields and rejects damage; HISTORY_CAP holds five seasons; mergeLeague weighs a season as 100 races',()=>{
  const l=createLeague();delete l.seasonPodium;delete l.teamChampion;delete l.seasonPrize;delete l.upgrades.ers;assert.equal(validLeague(l),true);
  for(const damage of [x=>{x.coins=-1;},x=>{x.upgrades.engine=9;},x=>{x.upgrades.wings=1;},x=>{x.season=6;},x=>{x.race=25;},x=>{x.table.stranger=1;},x=>{delete x.table.player;},x=>{x.history=Array(HISTORY_CAP+1).fill({season:1,race:0,place:1,points:1,coins:1});},
    x=>{x.history=[{season:1,race:0,place:13,points:1,coins:1}];},x=>{x.history=[{season:1,race:0,place:1,points:1,coins:1,order:[0,0,1,2,3]}];},x=>{x.history=[{season:1,race:0,place:1,points:1,coins:1,stage:31}];},x=>{x.seasonPodium={1:['nobody']};},x=>{x.teamChampion={1:'ferrari'};},x=>{x.seasonPrize={1:-5};},x=>{x.shortRaces='yes';},x=>{x.seasonRank={1:13};}]){
    const bad=createLeague();damage(bad);assert.equal(validLeague(bad),false);}
  assert.ok(HISTORY_CAP>=5*18+18,'five long seasons and a replay fit');
  const full=createLeague();for(let s=1;s<=5;s++){runSeason(full,1);if(s<5)nextSeason(full);}assert.equal(full.history.length,12+14+16+18+18);assert.equal(validLeague(full),true);assert.equal(full.season,5);assert.deepEqual(Object.keys(full.seasonPodium),['1','2','3','4','5']);
  assert.equal(leagueSummary(full).titles,5);assert.equal(leagueSummary(full).finalSeason,true);
  // merge: season 2 race 0 is further along than season 1 race 12 (the old season*10 formula got this wrong with 12+ races)
  const a=createLeague(),b=createLeague();runSeason(a,1);b.season=2;b.race=0;b.coins=5;const m=mergeLeague(a,b);assert.equal(m.season,2);assert.equal(m.coins,a.coins);assert.equal(validLeague(m),true);
  const c=createLeague();c.season=1;c.race=12;const d=createLeague();d.season=2;d.race=0;assert.equal(mergeLeague(c,d).season,2);assert.equal(mergeLeague(d,c).season,2);
  // merging an old five-driver league with a new one: both normalized, upgrades take the larger value, ers 0 when missing
  const oldShape={version:1,season:1,race:2,coins:50,upgrades:{engine:3,tires:0,steering:0,brakes:0,aero:0},table:{player:40,almog:33,turkiz:52,shemesh:18,barkat:25},history:[],champion:{},seasonRank:{}};
  const n=createLeague();n.upgrades.ers=2;n.race=1;const merged=mergeLeague(n,oldShape);assert.equal(merged.race,2);assert.equal(merged.upgrades.engine,3);assert.equal(merged.upgrades.ers,2);assert.equal(Object.keys(merged.table).length,12);assert.equal(validLeague(merged),true);
});
test('?racingLongLeague=0 keeps the short league of racing-v9 (three seasons of six, five scoring cars, 25-18-15-12-10) and still loads a long save',()=>{
  const code=`globalThis.location={search:'?racingLongLeague=0'};const m=await import(${JSON.stringify(new URL('../minigames/racing-league-core.mjs',import.meta.url).href)});
    const L=m.createLeague();const out={long:m.LONG,seasons:m.SEASONS.length,races:m.racesIn(1),points:[...m.POINTS],table:Object.keys(L.table).length,drivers:m.DRIVERS.length,stages2:m.seasonStages(2),scoring:m.GRID_DRIVERS.map(d=>d.scoring)};
    const r=m.applyRace(L,{order:['player','ai-1','ai-2','ai-3','ai-4']});out.points1=r.points;out.coins=L.coins;out.hist=L.history[0];
    const longSave={version:1,season:4,race:3,coins:9,upgrades:{engine:1,tires:0,steering:0,brakes:0,aero:0,ers:2},table:Object.fromEntries(m.GRID_DRIVERS.map(d=>[d.id,3])),history:[{season:3,race:15,place:11,points:0,coins:30,stage:20,order:[1,2,3,4,5,6,7,8,9,10,11,0],fastest:2}],champion:{1:'gal'},seasonRank:{1:9,2:4,3:3},seasonPodium:{1:['gal','or','player']},teamChampion:{1:'night'},seasonPrize:{1:80},shortRaces:true};
    out.longValid=m.validLeague(longSave);out.longSummary=m.leagueSummary(longSave).season.name;console.log(JSON.stringify(out));`;
  const out=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'}).trim());
  assert.equal(out.long,false);assert.equal(out.seasons,3);assert.equal(out.races,6);assert.deepEqual(out.points,[25,18,15,12,10]);assert.equal(out.table,5);assert.equal(out.drivers,4);assert.deepEqual(out.stages2,[13,14,15,16,17,18]);
  assert.deepEqual(out.scoring,[true,true,true,true,true,false,false,false,false,false,false,false]);assert.equal(out.points1,25);assert.equal(out.coins,220);assert.deepEqual(out.hist,{season:1,race:0,place:1,points:25,coins:220},'no new history fields in the short league');
  assert.equal(out.longValid,true,'a save made by the long league loads under the flag');assert.equal(typeof out.longSummary,'string');
});
test('equipment defaults leave the physics unchanged',()=>{
  const run=cfg=>{const r=createRacing({stage:3,seed:5,config:{countdown:0,walls:false,stage:{opponents:0},...cfg}});for(let n=0;n<300;n++)r.step(1/60,{autoAccelerate:true,steer:0});const v=r.state.player.distanceDriven;r.dispose();return v;};
  assert.equal(run({}),run({equipment:{brakes:1,steer:1,aero:1,nitro:1}}));
  assert.ok(run({equipment:{engine:1.15}})>run({}));
});
