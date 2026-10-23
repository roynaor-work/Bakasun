import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {migrateSave,validateSave,CURRENT_VERSION} from '../workout/island/engine/persistence.mjs';
import {validProgress} from '../workout/island/activity/progress.mjs';
import {teamRank} from '../workout/island/activity/soccer-team.mjs';
import {createTennis} from '../workout/island/minigames/tennis.mjs';
import {tennisResult} from '../workout/island/minigames/tennis-result.mjs';
import {expandLegacyTennisProgress} from '../workout/island/minigames/tennis-tour.mjs';

const root=new URL('../workout/island/',import.meta.url);
const data=await loadData(root,async u=>({ok:true,json:async()=>JSON.parse(await readFile(u,'utf8'))}));
const config=data.config.minigames.tennis,strings=JSON.parse(await readFile(new URL('data/strings.he.json',root),'utf8'));
const makeEngine=(source=data)=>createEngine(source,{storage:{getItem:()=>null,setItem(){}},now:()=>1000000});
const envelope=r=>({outcome:r.won?'win':'lose',score:r.gamesFor,tennis:r});
const win=(stage,seed=42)=>({won:true,gamesFor:4,gamesAgainst:0,stage,stars:3,seed,durationSeconds:30,difficulty:'easy'});

test('tennis tour: all 30 stable stage IDs have graded opponents and translated tactical identities',()=>{
 assert.equal(config.levels.length,30);
 assert.deepEqual(config.levels.map(l=>l.stage),Array.from({length:30},(_,i)=>i+1));
 assert.deepEqual([...new Set(config.levels.map(l=>l.style))].sort(),['drop','lob','placement','pressure','rally']);
 assert.equal(new Set(config.levels.map(l=>l.titleId)).size,30);
 for(const level of config.levels){
  assert.ok(strings[level.feature]&&strings[level.titleId]&&strings[level.chapterId]);
  assert.ok(level.lobChance>=0&&level.dropChance>=0&&level.lobChance+level.dropChance<=1);
  assert.ok(level.shotDepth>0&&level.shotDepth<config.court.halfLength);
 }
 for(let i=1;i<config.levels.length;i++){
  assert.ok(config.levels[i].speed>config.levels[i-1].speed);
  assert.ok(config.levels[i].timingWindow<config.levels[i-1].timingWindow);
  assert.ok(config.levels[i].accuracy>=config.levels[i-1].accuracy);
 }
 assert.equal(config.levels[0].lobChance+config.levels[0].dropChance,0,'the opening opponent introduces no special strokes');
 assert.deepEqual(config.levels.slice(0,10).map(l=>l.winMoney),[35,47,59,71,83,95,107,119,131,143]);
 assert.deepEqual(config.levels.slice(0,10).map(l=>l.winParts),[0,0,0,1,1,1,2,2,2,2]);
});

for(let stage=1;stage<=10;stage++)test(`tennis tour: unfinished legacy stage ${stage} keeps its ID and earned stars`,()=>{
 const legacy=Object.freeze({stage,stars:Object.freeze(Array.from({length:10},(_,i)=>i<stage-1?i%3+1:0))});
 const expanded=expandLegacyTennisProgress(legacy,30);
 assert.equal(expanded.stage,stage);assert.equal(expanded.stars.length,30);
 assert.deepEqual(expanded.stars.slice(0,10),legacy.stars);assert.ok(expanded.stars.slice(10).every(n=>n===0));
 assert.equal(legacy.stars.length,10);assert.notEqual(expanded.stars,legacy.stars);
});

test('tennis tour: a won legacy final unlocks stage 11 exactly once without awarding new stars',()=>{
 const legacy={stage:10,stars:[1,2,3,1,2,3,1,2,3,2]},before=structuredClone(legacy),expanded=expandLegacyTennisProgress(legacy);
 assert.equal(expanded.stage,11);assert.deepEqual(expanded.stars.slice(0,10),legacy.stars);
 assert.equal(expanded.stars.reduce((a,n)=>a+n,0),legacy.stars.reduce((a,n)=>a+n,0));
 assert.deepEqual(legacy,before);assert.equal(expandLegacyTennisProgress(expanded),expanded);
});

test('tennis tour: malformed legacy progress remains malformed and still fails shared validation',()=>{
 const bad=[
  {stage:0,stars:Array(10).fill(0)},
  {stage:11,stars:Array(10).fill(1)},
  {stage:2,stars:[0,...Array(9).fill(0)]},
  {stage:2,stars:[1,1,...Array(8).fill(0)]},
  {stage:1,stars:[0,0,3,...Array(7).fill(0)]},
  {stage:10,stars:[1,1,1,1,1,1,1,1,1,4]},
  {stage:10,stars:[1,1,1,1,1,1,1,1,1,'2']},
  {stage:1,stars:Array(9).fill(0)}
 ];
 const e=makeEngine();
 for(const row of bad){const before=structuredClone(row);assert.equal(expandLegacyTennisProgress(row),row);assert.deepEqual(row,before);assert.equal(validProgress({...e.state.minigameProgress,tennis:row},data),false);}
});

test('tennis tour: existing v16 save keeps money, equipment, results and every other game during the narrow tennis expansion',()=>{
 const legacyData={...data,config:structuredClone(data.config)};legacyData.config.minigames.tennis.levels=legacyData.config.minigames.tennis.levels.slice(0,10);
 const oldEngine=makeEngine(legacyData),old=oldEngine.state;
 old.money=4567;old.minigameEquipment.tennis={speed:2,hit:3,serve:4};old.minigameLevels.tennis=3;
 old.minigameProgress.tennis={stage:10,stars:[1,2,3,1,2,3,1,2,3,2]};old.minigameWins.tennis=12;old.highScores.tennis=4;old.team.wins=12;old.team.rank=teamRank(12,data.config.minigames.soccer);old.team.sportWins.tennis=12;
 const saved=JSON.parse(oldEngine.exportJSON());saved.version=16;
 const before=structuredClone(saved),newEngine=makeEngine();
 assert.equal(saved.version,before.version);assert.equal(CURRENT_VERSION,17);
 assert.ok(validateSave({...saved,version:CURRENT_VERSION},legacyData,oldEngine.registry).ok);
 const adapted=saved;
 const loaded=migrateSave(adapted,data,newEngine.registry);assert.ok(loaded.ok);
 assert.deepEqual(saved,before,'the source save is never changed');
 for(const key of Object.keys(saved))if(key!=='minigameProgress'&&key!=='version')assert.deepEqual(loaded.state[key],saved[key],key+' is preserved');
 assert.equal(loaded.state.version,CURRENT_VERSION);
 for(const id of Object.keys(saved.minigameProgress))if(id!=='tennis')assert.deepEqual(loaded.state.minigameProgress[id],saved.minigameProgress[id]);
 assert.equal(loaded.state.minigameProgress.tennis.stage,11);
 assert.deepEqual(loaded.state.minigameProgress.tennis.stars.slice(0,10),saved.minigameProgress.tennis.stars);
 assert.ok(newEngine.importJSON(adapted).ok);assert.equal(newEngine.state.minigameProgress.tennis.stage,11);
 assert.deepEqual(newEngine.state.minigameEquipment.tennis,saved.minigameEquipment.tennis);
});

test('tennis tour: applying the tennis expansion cannot hide corrupt money, equipment or another game',()=>{
 const e=makeEngine(),legacy=JSON.parse(e.exportJSON());legacy.minigameProgress.tennis={stage:1,stars:Array(10).fill(0)};
 const corruptions=[s=>s.money=-1,s=>s.minigameEquipment.tennis.hit=999,s=>s.minigameProgress.tennis.stars[0]=4,s=>s.minigameProgress.tennis.stage=30,s=>s.minigameProgress.soccer.stars[0]=4];
 for(const corrupt of corruptions){
  const saved=structuredClone(legacy);corrupt(saved);const before=structuredClone(saved);
  const adapted={...saved,minigameProgress:{...saved.minigameProgress,tennis:expandLegacyTennisProgress(saved.minigameProgress.tennis,30)}};
  assert.equal(migrateSave(adapted,data,e.registry).ok,false);assert.deepEqual(saved,before);
 }
});

test('tennis tour: all 30 stages unlock sequentially through the real result contract, never through labels alone',()=>{
 const e=makeEngine(),equipment=structuredClone(e.state.minigameEquipment.tennis);
 e.state.buildings.push({id:'court-tour',typeId:'tennis',x:4,z:8,level:1});
 let finish,disposed=0;e.registry.minigames.set('tennis',{...e.registry.minigames.get('tennis'),start:ctx=>{finish=ctx.finish;return {dispose(){disposed++;}};}});
 for(let stage=1;stage<=30;stage++){
  if(stage<30)assert.equal(e.startMinigame('tennis',{level:stage+1,seed:42}).ok,false,'next stage stays locked');
  assert.ok(e.startMinigame('tennis',{level:stage,seed:42}).ok);
  const raw=envelope(win(stage)),paid=finish(raw);assert.ok(paid.ok,`stage ${stage}`);
  assert.equal(paid.result.stage,stage);assert.equal(paid.result.stars,3);
  assert.equal(e.state.minigameProgress.tennis.stage,Math.min(30,stage+1));
  assert.equal(finish(raw).ok,false,'results cannot settle twice');
 }
 assert.equal(disposed,30);assert.equal(e.state.minigameWins.tennis,30);assert.equal(e.state.team.sportWins.tennis,30);
 assert.deepEqual(e.state.minigameProgress.tennis.stars,Array(30).fill(3));assert.deepEqual(e.state.minigameEquipment.tennis,equipment);
 assert.ok(validateSave(e.state,data,e.registry).ok);
 assert.equal(e.startMinigame('tennis',{level:31,seed:42}).ok,false);
 assert.ok(e.startMinigame('tennis',{level:10,seed:42}).ok);assert.ok(finish(envelope(win(10))).ok);
 assert.equal(e.state.minigameProgress.tennis.stage,30,'replaying a legacy ID preserves the tour');
});

test('tennis tour: stage 30 validates normally and out-of-tour results cannot earn rewards',()=>{
 const c={level:30,seed:42,difficulty:'easy'},last=envelope(win(30));assert.ok(tennisResult(last,c,config));
 assert.equal(tennisResult(envelope(win(31)),{...c,level:31},config),null);
 assert.equal(tennisResult({...last,tennis:{...last.tennis,stage:10}},c,config),null);
 assert.equal(tennisResult({...last,tennis:{...last.tennis,stars:4}},c,config),null);
});

function opponentReturn(overrides){
 const cfg=structuredClone(config);cfg.levels[19]={...cfg.levels[19],reaction:0,...overrides};
 const game=createTennis({config:cfg,stage:20,seed:17}),s=game.getState();
 s.phase='rally';s.shot={side:0,serving:false};s.contact={side:1,x:0,z:-6,at:0,eta:0};
 Object.assign(s.players[1],{x:0,z:-6,vx:0,vz:0});Object.assign(s.ball,{x:0,z:-6,y:.9,vx:0,vy:0,vz:0,bounces:1,lastHitter:0});
 game.update(cfg.simulation.step);assert.equal(s.shot.side,1,'the opponent returns the real incoming ball');return s.shot;
}

test('tennis tour: lob and drop identities change the real opponent shot instead of only its title',()=>{
 const flat=opponentReturn({lobChance:0,dropChance:0,shotDepth:6.3,rallyPace:1});
 const lob=opponentReturn({lobChance:1,dropChance:0,shotDepth:7.2,rallyPace:1});
 const drop=opponentReturn({lobChance:0,dropChance:1,shotDepth:4.8,rallyPace:1});
 assert.equal(flat.lob,false);assert.equal(flat.drop,false);assert.equal(lob.lob,true);assert.equal(drop.drop,true);
 assert.ok(lob.flight>flat.flight);assert.ok(Math.abs(drop.targetZ)<Math.abs(flat.targetZ));
});

test('tennis tour: a mixed-shot upgraded player can win the final across independent seeded matches',()=>{
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),observedShots=new Set();
 // Only movement, aim and button inputs are sent to the public model API.
 // The player follows the landing cue after 120 ms, recovers manually toward
 // the centre, and reacts to physical contact rather than a nominal timestamp.
 for(const [rank,releaseDelay]of [[3,.08],[5,.14]]){
  const results=[17,42,129,627,981,4107].map(seed=>{
   const game=createTennis({config,stage:30,seed,difficulty:'easy',ranks:{speed:rank,hit:rank,serve:rank}});
   let lastSwing=-1,incomingAt=null,incomingSerial=-1,eligibleSince=null,event=-1;
   for(let i=0;i<144000&&!game.result;i++){
    const s=game.getState(),p=s.players[0],incoming=s.phase==='rally'&&s.contact?.side===0&&s.ball.lastHitter===1;
    if(s.event.id!==event){event=s.event.id;if(s.event.type==='hit'&&s.event.side===0&&!s.event.serving)observedShots.add(s.shot.drop?'drop':s.shot.lob?'lob':'flat');}
    if(incoming&&incomingSerial!==s.rallyHits){incomingSerial=s.rallyHits;incomingAt=s.elapsed;}if(!incoming){incomingAt=null;incomingSerial=-1;}
    let x=0,z=5.8;
    if(incoming&&s.elapsed-incomingAt>=.12){x=s.contact.x;z=s.contact.z;}
    if(incoming){x+=Math.sin(s.elapsed*1.7+seed)*.25;z+=Math.cos(s.elapsed*1.3+seed)*.25;}
    const move=clamp(((x-p.x)*4-(p.vx||0)*.55)/s.attributes.speed,-1,1),moveZ=clamp(((z-p.z)*4-(p.vz||0)*.55)/s.attributes.speed,-1,1);
    if(incoming&&s.contactWindow?.eligible){if(eligibleSince===null)eligibleSince=s.elapsed;}else eligibleSince=null;
    const swing=incoming&&Boolean(s.contactWindow?.eligible)&&s.elapsed-lastSwing>.29&&s.elapsed-eligibleSince>=releaseDelay;
    if(swing)lastSwing=s.elapsed;
    const ai=s.players[1],lob=ai.z>-5&&s.ball.z<6.5,drop=!lob&&ai.z<-6.3&&s.rallyHits%3!==0&&s.ball.z<7.2;
    const aim={manual:true,x:ai.x>=0?-1:1,z:-.8},serve=s.server===0&&(s.phase==='serve'||s.phase==='toss'&&s.serveMeter>=.49&&s.serveMeter<=.515);
    game.update(1/60,{serve,swing,lob,drop,aim,move,moveZ});
   }
   assert.ok(game.result,'the physical match always ends');assert.equal(game.result.stage,30);assert.ok(game.result.durationSeconds<config.maximumSeconds);return game.result;
  });
  assert.ok(results.some(r=>r.won),`rank ${rank} has a tactical winning path with 120 ms target latency and ${releaseDelay*1000} ms release delay`);
 }
 assert.ok(observedShots.size>=2,'the player uses distinct physical shot types');
});
