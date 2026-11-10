import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {expandSoccerConfig,SOCCER_EXTRAS} from '../workout/island/minigames/soccer-squad.mjs';
import {applySoccerTeams,resolveSoccerTeams,SOCCER_TEAM_PRESETS} from '../workout/island/minigames/soccer-teams.mjs';
import {createSoccerTelemetry,SOCCER_TELEMETRY_KEY} from '../workout/island/minigames/soccer-telemetry.mjs';

const base=JSON.parse(readFileSync(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;

test('soccerTeams flag: option beats URL beats default 6; unknown values fall back',()=>{
  const had=Object.getOwnPropertyDescriptor(globalThis,'location');
  try{
    delete globalThis.location;
    assert.equal(resolveSoccerTeams(),'6');assert.equal(resolveSoccerTeams('8'),'8');assert.equal(resolveSoccerTeams(11),'11');assert.equal(resolveSoccerTeams('9'),'6');
    globalThis.location={search:'?soccerTeams=11'};assert.equal(resolveSoccerTeams(),'11');assert.equal(resolveSoccerTeams('8'),'8');
    globalThis.location={search:'?soccerTeams=off'};assert.equal(resolveSoccerTeams(),'6');
  }finally{if(had)Object.defineProperty(globalThis,'location',had);else delete globalThis.location;}
});

test('applySoccerTeams: the default is the very same config object; 8 and 11 grow the field without mutating the input',()=>{
  const before=structuredClone(base);
  assert.equal(applySoccerTeams(base,'6'),base);
  for(const key of ['8','11']){
    const preset=SOCCER_TEAM_PRESETS[key],c=applySoccerTeams(base,key);
    assert.deepEqual(base,before);
    assert.equal(c.pitch.length,preset.length);assert.equal(c.pitch.width,preset.width);assert.equal(c.squad.extraPlayersPerTeam,preset.extras);
    assert.ok(c.players.speed>base.players.speed&&c.players.speed<base.players.speed*preset.length/base.pitch.length,'speed grows, but less than the pitch');
    assert.ok(c.pitch.goalWidth>base.pitch.goalWidth&&c.pitch.goalWidth<8,'goal grows toward 7.32 m but not past it');
    assert.ok(c.pitch.penaltyDepth<=16.5&&c.pitch.penaltyWidth<=40.4&&c.pitch.penaltyDepth>base.pitch.penaltyDepth);
    assert.ok(c.ai.kickoffX.every((x,i)=>Math.abs(x)>=Math.abs(base.ai.kickoffX[i])));
    assert.ok(c.view.camera.nearDistance>base.view.camera.nearDistance&&c.view.camera.farPlane>=base.view.camera.farPlane);
  }
  assert.equal(applySoccerTeams(base,'11').pitch.length,105);assert.equal(applySoccerTeams(base,'11').pitch.width,68);
});

test('squads of 8 and 11: unique tactical roles, numbers, one keeper per side, saved four cards untouched',()=>{
  assert.equal(SOCCER_EXTRAS.length,7);
  for(const [extras,size] of [[2,6],[4,8],[7,11]]){
    const raw=structuredClone(base);raw.squad.extraPlayersPerTeam=extras;const c=expandSoccerConfig(raw);
    assert.equal(c.players.roster.length,size*2);assert.equal(c.team.players.length,4);
    for(const team of [0,1]){
      const members=c.players.roster.filter(p=>p.team===team);
      assert.equal(members.length,size);assert.equal(members.filter(p=>p.role==='keeper').length,1);
      assert.equal(new Set(members.map(p=>p.tacticalRole)).size,size);
    }
    assert.equal(new Set(SOCCER_EXTRAS.map(e=>e.matchNumber)).size,7);
    assert.ok(SOCCER_EXTRAS.every(e=>![9,8,1,7].includes(e.matchNumber)),'no clash with the four saved shirt numbers');
  }
});

for(const key of ['8','11'])test(`model ${key}-a-side: legal kickoff and a stable 40 s match with scripted input`,()=>{
  const c=applySoccerTeams(base,key),g=createSoccer({config:c,seed:5,stage:5,difficulty:'normal',role:'field'}),s=g.getState();
  const size=Number(key);assert.equal(s.players.length,size*2);
  const hx=c.pitch.length/2,hz=c.pitch.width/2;
  for(const p of s.players){assert.ok(Math.abs(p.x)<=hx&&Math.abs(p.z)<=hz,`player ${p.id} inside the pitch`);}
  for(let i=0;i<s.players.length;i++)for(let j=i+1;j<s.players.length;j++)assert.ok(Math.hypot(s.players[i].x-s.players[j].x,s.players[i].z-s.players[j].z)>.4,`kickoff spots ${i}/${j} do not overlap`);
  let n=7;const rnd=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};let mx=1,mz=0;
  for(let t=0;t<2400&&!g.result;t++){if(t%20===0){const a=rnd()*6.283;mx=Math.cos(a);mz=Math.sin(a);}g.update(1/60,{moveX:mx,moveZ:mz,kickHeld:rnd()<.04,passPressed:rnd()<.03,sprintHeld:rnd()<.3});g.drainEvents();}
  for(const p of s.players){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<=hx&&Math.abs(p.z)<=hz,`player ${p.id} finite and inside`);}
  assert.ok(Number.isFinite(s.ball.x)&&Number.isFinite(s.ball.z));
  const tm=g.tacticalMetrics();assert.equal(tm.teams[0].roles.length,size);assert.equal(new Set(tm.teams[0].roles.map(r=>r.role)).size,size);
});

test('telemetry: possession, shots, goals and frame times are summarised and saved locally (last 20 only)',()=>{
  const tel=createSoccerTelemetry({teams:'8',stage:3,difficulty:'normal',pitch:[68,42]});
  const state=(owner,team,phase='playing')=>({phase,ball:{owner,lastTeam:team},players:[{team:0},{team:1}],controlled:0});
  for(let i=0;i<60;i++)tel.frame(state(0,0),1/60,16+i%3);
  for(let i=0;i<20;i++)tel.frame(state(1,1),1/60,17);
  tel.frame(state(0,0,'goal'),1/60,16);
  tel.event({type:'shot',team:0});tel.event({type:'shot',team:1,punt:true});tel.event({type:'goal',team:0});tel.event({type:'pass',team:0});tel.event({type:'loft',team:0});tel.event({type:'restart',team:1});
  const sum=tel.summary({won:true,goalsFor:1,goalsAgainst:0});
  assert.equal(sum.teams,'8');assert.deepEqual(sum.shots,[1,0]);assert.deepEqual(sum.goals,[1,0]);assert.deepEqual(sum.passes,[2,0]);assert.equal(sum.restarts,1);
  assert.equal(sum.possessionHome,0.75);assert.equal(sum.seconds,1.3);assert.ok(sum.frameMsP95>=16&&sum.frameMsP95<=18);assert.deepEqual(sum.result,{won:true,goalsFor:1,goalsAgainst:0});
  const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  for(let i=0;i<25;i++)tel.save(storage,{...sum,seconds:i});
  const kept=JSON.parse(store.get(SOCCER_TELEMETRY_KEY));assert.equal(kept.length,20);assert.equal(kept[19].seconds,24);assert.equal(kept[0].seconds,5);
  assert.equal(tel.save({getItem(){throw Error('blocked');},setItem(){}},sum),0,'a blocked storage never throws');
  store.set(SOCCER_TELEMETRY_KEY,'not json');assert.equal(tel.save(storage,sum),0);
});

test('telemetry: defending duels (engaged, won, beaten) follow the same definition as the simulation tool',()=>{
  const tel=createSoccerTelemetry({teams:'6'});
  const players=(dx)=>[{team:0,x:0,z:0,role:'support'},{team:1,x:dx,z:0,role:'striker'}];
  const st=(dx,owner=1)=>({phase:'playing',ball:{owner,lastTeam:owner===null?1:owner},players:players(dx),controlled:0});
  // Engaged at 1.5 m, the carrier gets to 5 m inside 1.5 s: beaten.
  tel.frame(st(1.5),1/60);for(let i=0;i<30;i++)tel.frame(st(5),1/60);
  // Engaged again, then the home team takes the ball within 1.5 s: won.
  tel.frame(st(1.5),1/60);tel.frame({phase:'playing',ball:{owner:0,lastTeam:0},players:players(1.5),controlled:0},1/60);
  // Engaged, nothing happens for 2 s: counted as engaged only.
  tel.frame(st(1.5),1/60);for(let i=0;i<120;i++)tel.frame(st(2.5),1/60);
  assert.deepEqual(tel.summary().duels,{engaged:3,won:1,beaten:1});
});
