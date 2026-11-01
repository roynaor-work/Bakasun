import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SOCCER_CAMPAIGN_STAGES,campaignStage,campaignOpponent,campaignConfig,createCampaignStats,recordCampaignEvent,stageObjective} from '../workout/island/minigames/soccer-campaign.mjs';
import {createSoccer,matchResult} from '../workout/island/minigames/soccer.mjs';
import {soccerResult} from '../workout/island/minigames/soccer-result.mjs';
import {rosterCards} from '../workout/island/activity/soccer-roster.mjs';

const base=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames.soccer;
function freeze(value){if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
const profile=n=>campaignStage(n,base);
const eventState=()=>({stage:1,role:'field',phase:'playing',score:[0,0],players:[{team:0,role:'striker'},{team:0,role:'support'},{team:0,role:'keeper',hands:true},{team:1,role:'striker'}],campaignStats:createCampaignStats()});
function observe(state,events){for(const [i,event]of events.entries())recordCampaignEvent(state.campaignStats,{id:i+1,...event},state);return state;}

test('soccer campaign has six distinct five-fixture regions, bounded stage inputs and detached profiles',()=>{
  assert.equal(SOCCER_CAMPAIGN_STAGES,30);
  for(const [input,want]of [[0,1],[-1,1],[NaN,1],[Infinity,1],[31,30],[2.8,3]])assert.equal(profile(input).stage,want);
  const rows=Array.from({length:30},(_,i)=>profile(i+1));
  assert.deepEqual(rows.map(p=>p.stage),Array.from({length:30},(_,i)=>i+1));
  assert.deepEqual([...new Set(rows.map(p=>p.region))],[1,2,3,4,5,6]);
  for(let n=1;n<=6;n++)assert.equal(rows.filter(p=>p.region===n).length,5);
  assert.equal(new Set(rows.map(p=>p.formation)).size,6);
  assert.equal(new Set(rows.map(p=>p.objective.id)).size,7);
  const changed=profile(30);changed.objective.target=999;assert.equal(profile(30).objective.target,3);
  assert.equal(rows[29].region,6);assert.equal(rows[29].round,5);assert.equal(rows[29].difficulty,1);
});

test('soccer campaign keeps legacy stage rows and increases late opposition within physical bounds',()=>{
  for(let n=1;n<=Math.min(10,base.stages.length);n++)assert.deepEqual(campaignOpponent(base,n),base.stages[n-1]);
  const stages=Array.from({length:30},(_,i)=>campaignOpponent(base,i+1));
  for(const [i,row]of stages.entries()){
    for(const key of ['speed','pressure','stealRate','keeper','thinkSeconds','accuracy','tackleReach'])assert.ok(Number.isFinite(row[key])&&row[key]>0,`${i+1} ${key}`);
    assert.ok(row.keeper<1);assert.ok(row.accuracy<=1);assert.ok(row.tackleReach<1.7);
  }
  for(let i=10;i<30;i++){assert.ok(stages[i].speed>=stages[i-1].speed);assert.ok(stages[i].thinkSeconds<=stages[i-1].thinkSeconds);}
  assert.ok(stages[29].speed>stages[9].speed);assert.ok(stages[29].keeper>stages[9].keeper);
});

test('soccer campaign cloning leaves rewards, save-owned values, input config and duration untouched',()=>{
  const input=freeze(structuredClone(base)),before=JSON.stringify(input);
  for(const n of [1,5,10,11,20,30]){
    const tuned=campaignConfig(input,n);
    assert.equal(JSON.stringify(input),before);
    assert.notEqual(tuned,input);assert.notEqual(tuned.ai,input.ai);assert.notEqual(tuned.ai.attack,input.ai.attack);assert.notEqual(tuned.roster,input.roster);
    for(const key of ['levels','match','team','players','equipment','teamRanks','card','difficulties'])assert.deepEqual(tuned[key],input[key],key);
    assert.equal(tuned.match.halfSeconds*2,150);
    assert.equal(tuned.stages.length,30);assert.equal(tuned.campaign.stage,n);
    assert.equal(tuned.tactics.stageFormation,tuned.campaign.formation);
    for(const key of ['easy','normal','hard'])assert.notEqual(tuned.ai.attack[key],input.ai.attack[key]);
  }
});

test('soccer campaign reduces early AI floors and varies the actual passing pace',()=>{
  const first=campaignConfig(base,1),fifth=campaignConfig(base,5),tenth=campaignConfig(base,10),last=campaignConfig(base,30);
  for(const difficulty of ['easy','normal','hard']){
    assert.ok(first.ai.attack[difficulty].stealRate<tenth.ai.attack[difficulty].stealRate);
    assert.ok(first.ai.attack[difficulty].thinkSeconds>tenth.ai.attack[difficulty].thinkSeconds);
    assert.ok(first.ai.attack[difficulty].shotIntervalSeconds>last.ai.attack[difficulty].shotIntervalSeconds);
    assert.ok(fifth.ai.attack[difficulty].passHold<tenth.ai.attack[difficulty].passHold*1.4);
  }
  assert.ok(first.opponents.minSpeedRatio<tenth.opponents.minSpeedRatio);
  const holds=new Set(Array.from({length:30},(_,i)=>campaignConfig(base,i+1).ai.attack.normal.passHold));assert.ok(holds.size>=8);
});

test('soccer campaign opponent cards progress after ten without flattening every attribute at the cap',()=>{
  const means=[10,20,30].map(n=>{
    const c=campaignConfig(base,n),cards=rosterCards(c,c.team,undefined,n,'normal').filter(p=>p.team===1);
    assert.ok(cards.every(p=>p.pace<c.card.max||p.pass<c.card.max||p.defense<c.card.max));
    return cards.reduce((s,p)=>s+p.overall,0)/cards.length;
  });
  assert.ok(means[0]<means[1]);assert.ok(means[1]<means[2]);assert.ok(means[2]<=90);
  const early=campaignConfig(base,1);assert.deepEqual(rosterCards(early,early.team,undefined,1,'normal').filter(p=>!p.team),rosterCards(base,base.team,undefined,1,'normal').filter(p=>!p.team));
});

test('soccer campaign counts completed deliveries once and never counts an intercepted or self-recovered pass',()=>{
  const s=eventState();observe(s,[
    {type:'pass',team:0,player:0,target:1},{type:'possession',team:0,player:1},
    {type:'pass',team:0,player:1,target:0},{type:'possession',team:1,player:3},
    {type:'pass',team:0,player:0,target:1},{type:'possession',team:0,player:0}
  ]);
  assert.equal(s.campaignStats.completedPasses,1);
  recordCampaignEvent(s.campaignStats,{id:2,type:'possession',team:0,player:1},s);assert.equal(s.campaignStats.completedPasses,1);
  const o=stageObjective(s,profile(2));assert.equal(o.current,1);assert.equal(o.complete,false);assert.equal(o.optional,true);
});

test('soccer campaign side achievements measure real home actions without changing a lost result',()=>{
  const s=eventState();s.result={won:false,stars:1,goalsFor:0,goalsAgainst:1};const original=structuredClone(s.result);
  observe(s,[{type:'loft',team:0,player:0,target:1},{type:'header',team:0,player:1},{type:'steal',player:0,won:false},{type:'slide-contact',player:1,won:true},{type:'goal',team:1,player:3}]);
  assert.equal(stageObjective(s,profile(7)).complete,true,'one actual loft');
  assert.equal(stageObjective(s,profile(12)).complete,true,'one actual header');
  assert.equal(stageObjective(s,profile(4)).complete,true,'one successful tackle, no miss');
  assert.equal(s.campaignStats.shots,1);assert.equal(s.campaignStats.goals,0);assert.deepEqual(s.result,original);
  assert.equal(stageObjective({...s,phase:'playing',score:[0,0]},profile(5)).complete,false);
  assert.equal(stageObjective({...s,phase:'finished',score:[1,0]},profile(5)).complete,true);
});

test('soccer campaign keeper objectives distinguish shot saves from ordinary receptions',()=>{
  const s=eventState();s.role='keeper';observe(s,[
    {type:'pass',team:1,player:3,target:2},{type:'possession',team:0,player:2},
    {type:'shot',team:1,player:3},{type:'possession',team:0,player:2},
    {type:'shot',team:0,player:0},{type:'possession',team:0,player:2}
  ]);assert.equal(s.campaignStats.saves,1);assert.equal(stageObjective(s,profile(1)).current,1);
});

test('soccer campaign preserves the legacy eight-field win/star result contract at every stage',()=>{
  const config={...base,levels:Array.from({length:30},(_,i)=>base.levels[Math.min(i,9)])};
  for(const stage of [1,10,11,20,30])for(const [score,stars,won]of [[[1,0],3,true],[[3,1],2,true],[[2,1],1,true],[[0,0],1,false],[[1,2],1,false]]){
    const raw=matchResult({score,stage,seed:19,elapsed:150,difficulty:'normal'});
    assert.deepEqual(Object.keys(raw),['won','goalsFor','goalsAgainst','stage','stars','seed','difficulty','durationSeconds']);assert.equal(raw.stars,stars);assert.equal(raw.won,won);
    const result=soccerResult({soccer:raw,outcome:won?'win':'lose',score:score[0]},{level:stage,seed:19,difficulty:'normal'},config);
    assert.ok(result);assert.equal(result.stars,won?stars:0);assert.equal(result.outcome,won?'win':'lose');
  }
});

test('soccer campaign runtime tuning is idempotent and affects real late opposition movement',()=>{
  const first=campaignConfig(base,1),twice=campaignConfig(first,1);
  assert.deepEqual(twice,first);assert.deepEqual(campaignConfig(first,30),campaignConfig(base,30));
  function fixture(stage){const g=createSoccer({config:base,stage,seed:870});const s=g.getState();for(const p of s.players)p.cooldown=10;Object.assign(s.ball,{owner:3,x:s.players[3].x,z:s.players[3].z,lastTeam:1,lastPlayer:3});return g;}
  const early=fixture(1),late=fixture(30),twiceModel=createSoccer({config:first,stage:1,seed:870});
  assert.equal(late.getState().stage,30);assert.equal(late.getState().campaign.stage,30);
  const startEarly=early.getState().players[3].x,startLate=late.getState().players[3].x;
  for(let i=0;i<30;i++){early.update(base.match.fixedStep,{});late.update(base.match.fixedStep,{});}
  assert.ok(Math.abs(early.getState().players[3].x-startEarly)<Math.abs(late.getState().players[3].x-startLate));
  assert.deepEqual(twiceModel.getState().campaign,profile(1));
  assert.deepEqual(early.getState().players.filter(p=>p.team===0).map(p=>[p.speed,p.kick,p.guard]),late.getState().players.filter(p=>p.team===0).map(p=>[p.speed,p.kick,p.guard]));
});

for(const stage of [1,15,30])for(const seed of [4,71])test(`soccer campaign stage ${stage}, seed ${seed}: full match is playable and settles the requested stage`,()=>{
  const game=createSoccer({config:base,stage,seed,difficulty:stage===1?'easy':'normal'});let count=0,charge=0;
  while(!game.result&&count<3000){
    const s=game.getState(),p=s.players[s.controlled],b=s.ball,owns=b.owner===p.id;
    const dx=owns?s.attackDir:b.x-p.x,dz=owns?-p.z*.15:b.z-p.z;
    const shooting=owns&&p.x*s.attackDir>base.pitch.length/2-9;
    charge=shooting?charge+1:0;
    game.update(.1,{moveX:dx,moveZ:dz,sprintHeld:owns&&count%60<20,passPressed:owns&&!shooting&&count%39===0,kickHeld:shooting&&charge%9<6,switchPlayer:!owns&&count%15===0});
    count++;
    assert.ok(s.players.every(p=>[p.x,p.z,p.vx,p.vz].every(Number.isFinite)));
    assert.ok([b.x,b.y,b.z,b.vx,b.vy,b.vz].every(Number.isFinite));
    assert.ok(Math.abs(b.x)<=base.pitch.length/2+base.rules.netBallInset+.01);
    assert.ok(Math.abs(b.z)<=base.pitch.width/2+Math.max(base.rules.outMargin,base.physics.ballRadius)+.01);
  }
  assert.ok(game.result);assert.equal(game.result.stage,stage);assert.equal(game.result.seed,seed);assert.equal(game.result.durationSeconds,150);
  assert.equal(game.getState().phase,'finished');assert.equal(game.getState().campaign.stage,stage);
  const done=game.snapshot();game.update(2,{moveX:1,kickHeld:true});assert.deepEqual(game.snapshot(),done);
});

test('soccer campaign sidelines allow a partly overlapping ball and restart once the whole ball is outside',()=>{
  const hz=base.pitch.width/2,radius=base.physics.ballRadius,dt=base.match.fixedStep;
  const fixtureConfig={...base,rules:{...base.rules,outMargin:radius/2}};
  for(const stage of [1,30])for(const side of [-1,1]){
    const game=createSoccer({config:fixtureConfig,stage,seed:824}),s=game.getState();
    for(const player of s.players)player.cooldown=10;
    Object.assign(s.ball,{owner:null,x:0,z:side*(hz+radius-.001),y:radius,vx:0,vz:0,vy:0,grace:0,lastTeam:0,lastPlayer:0,flight:null,thrower:null});
    game.update(dt,{});
    assert.equal(s.phase,'playing',`stage ${stage}, side ${side}: some of the ball still overlaps the field`);
    assert.ok(Math.abs(s.ball.z)>hz+fixtureConfig.rules.outMargin,'the presentation margin is not the whole-ball boundary');
    s.ball.z=side*(hz+radius+.001);
    game.update(dt,{});
    assert.equal(s.phase,'restart');assert.equal(s.restart.type,'throwIn');assert.equal(s.restart.team,1);
    assert.ok(Math.abs(s.ball.z)<=hz+1e-8,'the throw-in is placed on or within the touchline');
    assert.deepEqual(s.score,[0,0]);
  }
});
