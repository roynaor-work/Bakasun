import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../engine/load-data.mjs';
import {createEngine} from '../engine/engine.mjs';
import {createInitialState,migrateSave,validateSave,CURRENT_VERSION} from '../engine/persistence.mjs';
import {createLeague,validLeague,mergeLeague,leagueEnabled,applyRace,leagueSummary,PRIZE,SEASONS,DRIVERS,seasonStages,racesIn,LEAGUE_IDS,HISTORY_CAP} from '../minigames/racing-league-core.mjs';
import {raceSetup} from '../minigames/racing-league.mjs';
import {racingLeagueResult} from '../minigames/racing-league-result.mjs';
import {racingResult} from '../minigames/racing-result.mjs';
import {getRacingStage} from '../minigames/racing-tracks.mjs';
import {createRacing} from '../minigames/racing-physics.mjs';

const root=new URL('../',import.meta.url);
const data=await loadData(root,async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))}));
const balance=data.config.minigames.islandRacing;
const fresh=()=>createEngine(data,{storage:{getItem:()=>null,setItem(){}},now:()=>1000000});
// racing-deep-m6: the scoring grid of the long league is twelve car ids ('player', 'ai-1'..'ai-11')
const GRID=['player',...Array.from({length:LEAGUE_IDS.length-1},(_,i)=>'ai-'+(i+1))],N=GRID.length;
/** Runs the real engine path with a stand-in session that only captures the context, then finishes with a hand-made but contract-correct result. */
function startLeague(engine,seed=77){
  let captured;const original=engine.registry.minigames.get('islandRacing');
  engine.registry.minigames.set('islandRacing',{...original,start:ctx=>{captured=ctx;return {dispose(){}};}});
  const run=engine.startMinigame('islandRacing',{seed,league:true});
  return {run,get ctx(){return captured;}};
}
function leagueRaw(ctx,place=1,order=null){
  const grid=order||[...GRID.filter(id=>id!=='player')];if(!order)grid.splice(place-1,0,'player');
  const stage={...getRacingStage(ctx.level),...ctx.league.stageOverride},required=stage.laps*16,won=place<=stage.targetRank;
  return {outcome:won?'win':'lose',score:N+1-place,racing:{won,stars:won?4-place:0,rank:place,stage:ctx.level,seed:ctx.seed,durationSeconds:150,laps:stage.laps,checkpoints:required,requiredCheckpoints:required,finished:true},
    league:{order:grid,fastestLapId:grid[0]}};
}

test('a save from version 18 gains only the league: every other field is untouched',()=>{
  const engine=fresh(),old=structuredClone(engine.state);
  delete old.islandRacingLeague;old.version=18;old.money=1943;old.buildings.push({id:'synthetic-house',typeId:'house',x:4,z:5,level:2});
  old.minigameEquipment.islandRacing.engine=2;old.minigameProgress.islandRacing={stage:3,stars:[3,2,...Array(28).fill(0)]};old.highScores.islandRacing=5;
  const before=structuredClone(old),loaded=migrateSave(old,data,engine.registry);
  assert.ok(loaded.ok);assert.deepEqual(old,before,'loading never mutates the supplied save');
  assert.equal(CURRENT_VERSION,19);assert.equal(loaded.state.version,19);assert.deepEqual(loaded.state.islandRacingLeague,createLeague());
  for(const key of Object.keys(before)){if(key==='version')continue;assert.deepEqual(loaded.state[key],before[key],key+' remains intact');}
});
test('older chain: a version-17 save arrives at 19 with the league and the 18 content',()=>{
  const engine=fresh(),old=structuredClone(engine.state);delete old.islandRacingLeague;old.version=17;delete old.hoops;delete old.city;delete old.cityManagement;delete old.cityDepthVersion;
  const loaded=migrateSave(old,data,engine.registry);assert.ok(loaded.ok,JSON.stringify(loaded));assert.equal(loaded.state.version,19);assert.ok(validLeague(loaded.state.islandRacingLeague));
});
test('league progress survives a save round trip; a damaged league is rejected, a missing one starts fresh',()=>{
  const engine=fresh();engine.state.islandRacingLeague.coins=345;engine.state.islandRacingLeague.upgrades.engine=3;
  const copy=JSON.parse(engine.exportJSON()),again=migrateSave(copy,data,engine.registry);assert.ok(again.ok);assert.equal(again.state.islandRacingLeague.coins,345);assert.equal(again.state.islandRacingLeague.upgrades.engine,3);
  for(const damage of [l=>{l.coins=-1;},l=>{l.upgrades.engine=9;},l=>{l.season=7;},l=>{l.table.stranger=1;},l=>{l.history=Array(HISTORY_CAP+1).fill({season:1,race:0,place:1,points:1,coins:1});}]){
    const bad=structuredClone(copy);damage(bad.islandRacingLeague);assert.equal(migrateSave(bad,data,engine.registry).ok,false);}
  const missing=structuredClone(copy);delete missing.islandRacingLeague;const repaired=migrateSave(missing,data,engine.registry);assert.ok(repaired.ok);assert.deepEqual(repaired.state.islandRacingLeague,createLeague());
  assert.ok(validateSave(engine.state,data,engine.registry).ok);
});
test('a league race uses the season circuit, league equipment and named drivers, and leaves the regular path alone',()=>{
  const engine=fresh();engine.state.islandRacingLeague.upgrades.engine=2;const progress=structuredClone(engine.state.minigameProgress),equipment=structuredClone(engine.state.minigameEquipment);
  const h=startLeague(engine);assert.ok(h.run.ok);const ctx=h.ctx;
  assert.equal(ctx.level,1);assert.equal(ctx.league.stage,1);assert.equal(ctx.league.laps,SEASONS[0].laps);assert.ok(ctx.equipment.engine>1);assert.deepEqual(ctx.league.drivers.map(d=>d.name),DRIVERS.map(d=>d.name));assert.equal(ctx.league.stageOverride.opponents,N-1);
  const money=engine.state.money,done=ctx.finish(leagueRaw(ctx,2));
  assert.ok(done.ok);assert.equal(done.result.money,0);assert.equal(done.result.stars,0);assert.equal(done.result.league.place,2);assert.equal(done.result.league.coins,PRIZE[1]);
  const l=engine.state.islandRacingLeague;assert.equal(l.race,1);assert.equal(l.coins,PRIZE[1]);assert.equal(l.table.player,18);
  assert.equal(engine.state.money,money);assert.deepEqual(engine.state.minigameProgress,progress);assert.deepEqual(engine.state.minigameEquipment,equipment);
  assert.equal(engine.state.highScores.islandRacing||0,0);assert.equal(engine.state.minigameWins.islandRacing||0,0);assert.ok(validateSave(engine.state,data,engine.registry).ok);
  assert.equal(ctx.finish(leagueRaw(ctx,1)).ok,false,'a second finish is refused');assert.equal(engine.state.islandRacingLeague.race,1);
});
test('league races ignore the regular stage lock: season 2 starts on a tier-1 circuit with only stage 1 open',()=>{
  const engine=fresh(),l=engine.state.islandRacingLeague;for(let i=0;i<racesIn(1);i++)applyRace(l,{order:GRID});engine.racingLeague.nextSeason();
  assert.equal(l.season,2);const h=startLeague(engine);assert.ok(h.run.ok);const first=seasonStages(2)[0];assert.ok(first>6,'season 2 never starts on a tier-0 circuit');assert.equal(h.ctx.level,first);assert.equal(engine.state.minigameProgress.islandRacing.stage,1);
  assert.equal(h.ctx.league.laps,SEASONS[1].laps);h.run.cancel();
  assert.equal(engine.startMinigame('islandRacing',{seed:1,level:first}).ok,false,'the regular route to that stage is still locked');
});
test('forged league results are refused and change nothing',()=>{
  const engine=fresh(),h=startLeague(engine),ctx=h.ctx,before=structuredClone(engine.state.islandRacingLeague);
  const bad=[raw=>{raw.league.order=['player','player',...GRID.slice(2)];},raw=>{raw.league.order=['ai-1','player',...GRID.slice(2)];},raw=>{raw.league.order=GRID.slice(0,5);},raw=>{raw.league.order=[...GRID,'ai-12'];},raw=>{raw.racing.seed=1;},raw=>{raw.racing.checkpoints-=1;raw.racing.laps-=1;},
    raw=>{raw.racing.durationSeconds=999;},raw=>{raw.league=undefined;},raw=>{raw.racing.extra=1;},raw=>{raw.score=3;},raw=>{raw.league.fastestLapId='ai-13';}];
  for(const forge of bad){const raw=leagueRaw(ctx,1);forge(raw);assert.equal(racingLeagueResult(raw,ctx,balance),null);assert.equal(ctx.finish(raw).ok,false);}
  assert.deepEqual(engine.state.islandRacingLeague,before);assert.equal(engine.isMinigameActive(),true,'the race stays open after a refused result');
  assert.ok(ctx.finish(leagueRaw(ctx,3)).ok);
});
test('the regular result contract does not accept a league result, and the league contract does not accept a regular one',()=>{
  const engine=fresh(),h=startLeague(engine),raw=leagueRaw(h.ctx,1);
  assert.equal(racingResult(raw,{seed:h.ctx.seed,level:1},balance),null);
  const stage=getRacingStage(1),regular={won:true,stars:3,rank:1,stage:1,seed:42,durationSeconds:70,laps:stage.laps,checkpoints:stage.laps*16,requiredCheckpoints:stage.laps*16,finished:true};
  assert.ok(racingResult({outcome:'win',score:5,racing:regular},{seed:42,level:1},balance));
  assert.equal(racingLeagueResult({outcome:'win',score:5,racing:regular},{seed:42,level:1,league:h.ctx.league},balance),null);
});
test('cancelling a league race changes nothing; a regular race afterwards still pays island money and stars, and leaves the league alone',()=>{
  const engine=fresh(),before=structuredClone(engine.state.islandRacingLeague),h=startLeague(engine);h.run.cancel();assert.deepEqual(engine.state.islandRacingLeague,before);
  let ctx;const original=engine.registry.minigames.get('islandRacing');engine.registry.minigames.set('islandRacing',{...original,start:c=>{ctx=c;return {dispose(){}};}});
  const run=engine.startMinigame('islandRacing',{seed:42,level:1});assert.ok(run.ok);assert.equal(ctx.league,undefined,'a regular race carries no league');
  const stage=getRacingStage(1),money=engine.state.money,done=ctx.finish({outcome:'win',score:5,racing:{won:true,stars:3,rank:1,stage:1,seed:42,durationSeconds:70,laps:stage.laps,checkpoints:stage.laps*16,requiredCheckpoints:stage.laps*16,finished:true}});
  assert.ok(done.ok);assert.ok(engine.state.money>money);assert.equal(engine.state.minigameProgress.islandRacing.stars[0],3);assert.deepEqual(engine.state.islandRacingLeague,before);
});
test('the upgrade shop spends league coins only, refuses while a race runs, and saves',()=>{
  const engine=fresh(),l=engine.state.islandRacingLeague;l.coins=130;const money=engine.state.money;
  assert.equal(engine.racingLeague.buy('engine').ok,true);assert.equal(l.coins,30);assert.equal(l.upgrades.engine,1);assert.equal(engine.racingLeague.buy('engine').reason,'coins');assert.equal(engine.state.money,money);
  const h=startLeague(engine);assert.equal(engine.racingLeague.buy('tires').reason,'reason.gameBusy');h.run.cancel();
});
test('the off flag hides the league everywhere',()=>{
  assert.equal(leagueEnabled('?racingLeague=0'),false);assert.equal(leagueEnabled('?x=1'),true);assert.equal(leagueEnabled(''),true);
  const engine=fresh(),saved=globalThis.location;globalThis.location={search:'?racingLeague=0'};
  try{assert.equal(engine.racingLeague.enabled(),false);assert.equal(engine.racingLeague.next(),null);assert.equal(engine.startMinigame('islandRacing',{seed:1,league:true}).ok,false);}
  finally{if(saved===undefined)delete globalThis.location;else globalThis.location=saved;}
});
test('importing a backup never lowers league progress',()=>{
  const a=createLeague(),b=createLeague();for(let i=0;i<3;i++)applyRace(b,{order:GRID});b.upgrades.engine=2;a.coins=900;a.upgrades.tires=4;
  const merged=mergeLeague(a,b);assert.equal(merged.race,3);assert.equal(merged.coins,900);assert.equal(merged.upgrades.engine,2);assert.equal(merged.upgrades.tires,4);assert.ok(validLeague(merged));
  const engine=fresh();engine.state.islandRacingLeague=b;const target=fresh();target.state.islandRacingLeague.coins=5000;
  assert.ok(target.importJSON(engine.exportJSON()).ok);assert.equal(target.state.islandRacingLeague.race,3);assert.equal(target.state.islandRacingLeague.coins,5000);
});
test('season summary: standings, gate for the next season and the career total',()=>{
  const l=createLeague(),last=[...GRID.slice(1),'player'];for(let i=0;i<racesIn(1);i++)applyRace(l,{order:last});
  const sum=leagueSummary(l);assert.equal(sum.done,true);assert.equal(sum.place,N);assert.equal(sum.gate.ok,false);assert.equal(sum.gate.minRank,10);assert.equal(sum.career,0);assert.equal(sum.total,racesIn(1));assert.equal(sum.canRestart,true);assert.equal(sum.teams.length,6);assert.ok(sum.podium.length===3&&!sum.podium.includes('player'));
  assert.equal(raceSetup(l),null);assert.equal(seasonStages(2).length,racesIn(2));assert.ok(seasonStages(2).every(id=>id>=7&&id<=18),'season 2 runs tiers 1 and 2');
});
test('a full league race on the real model produces an order the result contract accepts',()=>{
  const engine=fresh(),setup=raceSetup(engine.state.islandRacingLeague),model=createRacing({stage:setup.stage,seed:5,config:{countdown:0,equipment:setup.equipment,drivers:setup.drivers,extraRivals:setup.extraRivals,stage:setup.stageOverride}});
  const p=model.state.player,tr=model.track,wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  for(let n=0;n<(model.stage.timeLimit+2)*60&&model.state.phase!=='finished';n++){
    const pr=tr.project(p.x,p.z,p.s),tg=tr.sample(pr.s+10+p.speed*.5),err=wrap(Math.atan2(tg.x-p.x,tg.z-p.z)-p.heading);model.step(1/60,{steer:Math.max(-1,Math.min(1,err*1.7)),throttle:1,autoAccelerate:true});}
  assert.equal(model.state.phase,'finished');
  const cars=[...model.state.cars].sort((x,y)=>x.rank-y.rank),order=cars.map(c=>c.id);
  assert.equal(cars.length,N,'the whole scoring grid of twelve');const raw={outcome:model.state.result.won?'win':'lose',score:model.state.result.checkpoints===model.state.result.requiredCheckpoints?model.stage.opponents+2-model.state.result.rank:0,racing:model.state.result,league:{order,fastestLapId:null}};
  const ctx={seed:5,level:setup.stage,league:setup};assert.ok(racingLeagueResult(raw,ctx,balance),JSON.stringify(raw.racing));model.dispose();
});
