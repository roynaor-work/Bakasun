import test from 'node:test';
import assert from 'node:assert/strict';
import {createLeague,raceSetup,applyRace,nextSeason,buyUpgrade,equipmentFor,standings,seasonStages,isRaceUnlocked,POINTS,PRIZE,SEASONS,DRIVERS,UPGRADES,MAX_LEVEL} from '../minigames/racing-league.mjs';
import {createRacing} from '../minigames/racing-physics.mjs';

const order=(...ids)=>ids;
test('three seasons of six races, 25-18-15-12-10 points, fixed named drivers',()=>{
  assert.equal(SEASONS.length,3);for(const s of SEASONS)assert.equal(seasonStages(s.id).length,6);
  assert.deepEqual([...POINTS],[25,18,15,12,10]);assert.equal(DRIVERS.length,4);assert.equal(new Set(DRIVERS.map(d=>d.name)).size,4);
  const L=createLeague(),r=applyRace(L,{order:order('player','ai-1','ai-2','ai-3','ai-4')});
  assert.equal(r.points,25);assert.equal(r.place,1);assert.equal(L.coins,PRIZE[0]);assert.equal(L.table[DRIVERS[0].id],18);assert.equal(L.race,1);
});
test('fastest lap adds a point and coins; bad orders are rejected',()=>{
  const L=createLeague();const r=applyRace(L,{order:order('ai-4','player','ai-1','ai-2','ai-3'),fastestLapId:'player'});
  assert.equal(r.points,18+1);assert.ok(L.coins>PRIZE[1]);
  assert.throws(()=>applyRace(createLeague(),{order:order('player','player','ai-1','ai-2','ai-3')}));
});
test('a season ends after six races; next season needs a top-3 finish and resets the table',()=>{
  const L=createLeague();for(let i=0;i<6;i++)applyRace(L,{order:order('player','ai-1','ai-2','ai-3','ai-4')});
  assert.equal(L.seasonRank[1],1);const n=nextSeason(L);assert.equal(n.ok,true);assert.equal(L.season,2);assert.equal(L.race,0);assert.equal(L.table.player,0);
  const M=createLeague();for(let i=0;i<6;i++)applyRace(M,{order:order('ai-4','ai-3','ai-2','ai-1','player')});
  assert.equal(M.seasonRank[1],5);assert.equal(nextSeason(M).ok,false,'season 2 needs a top-3 finish in season 1');
  const K=createLeague();K.season=2;for(let i=0;i<6;i++)applyRace(K,{order:order('ai-4','ai-3','ai-2','ai-1','player')});
  assert.equal(nextSeason(K).ok,false,'season 3 needs a top-3 finish in season 2');
});
test('upgrades cost coins, stop at level 5 and map to physics equipment within the engine caps',()=>{
  const L=createLeague();assert.equal(buyUpgrade(L,'engine').ok,false);L.coins=100000;
  for(let i=0;i<MAX_LEVEL;i++)assert.equal(buyUpgrade(L,'engine').ok,true);assert.equal(buyUpgrade(L,'engine').reason,'max');
  assert.equal(buyUpgrade(L,'nope').ok,false);
  for(const name of Object.keys(UPGRADES))L.upgrades[name]=MAX_LEVEL;
  const eq=equipmentFor(L.upgrades);assert.ok(eq.engine<=1.16&&eq.grip<=1.16&&eq.steer<=1.12&&eq.brakes<=1.3&&eq.aero<=1.25);assert.ok(eq.engine>1.1);
});
test('race setup uses the season circuits, laps, named drivers and upgrades; the model accepts them',()=>{
  const L=createLeague();L.upgrades.engine=3;const s=raceSetup(L);
  assert.equal(s.stage,1);assert.equal(s.laps,SEASONS[0].laps);assert.ok(s.equipment.engine>1);
  const race=createRacing({stage:s.stage,seed:1,config:{countdown:0,equipment:s.equipment,drivers:s.drivers,stage:s.stageOverride}});
  assert.equal(race.state.laps,s.laps);assert.deepEqual(race.state.cars.slice(1).map(c=>c.name),DRIVERS.map(d=>d.name));race.dispose();
  assert.equal(isRaceUnlocked(L,1,0),true);assert.equal(isRaceUnlocked(L,1,1),false);assert.equal(isRaceUnlocked(L,2,0),false);
  assert.equal(standings(createLeague()).length,5);
});
test('equipment defaults leave the physics unchanged',()=>{
  const run=cfg=>{const r=createRacing({stage:3,seed:5,config:{countdown:0,walls:false,stage:{opponents:0},...cfg}});for(let n=0;n<300;n++)r.step(1/60,{autoAccelerate:true,steer:0});const v=r.state.player.distanceDriven;r.dispose();return v;};
  assert.equal(run({}),run({equipment:{brakes:1,steer:1,aero:1}}));
  assert.ok(run({equipment:{engine:1.15}})>run({}));
});
