import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTennis,createScore,awardPoint,pointLabels,buildResult,predictLanding} from '../codex-lab/island-tennis/tennis.mjs';
import {config,simulate} from '../codex-lab/island-tennis/verification/simulate.mjs';
const dt=1/60;
function nextReturn(game,offset=0){
  let served=-1;
  for(let n=0;n<60*40;n++){
    const s=game.getState();
    if(s.contact?.side===0&&s.contact.eta<=offset&&s.phase==='rally'){
      game.update(dt,{swing:true});game.update(dt,{swing:false});
      for(let j=0;j<60;j++){if(game.getState().shot?.side===0&&!game.getState().shot.serving)return structuredClone(game.getState().shot);game.update(dt);}
      throw Error('Human shot was not returned');
    }
    const swing=s.phase==='serve'&&s.server===0&&served!==s.pointNumber;
    if(swing)served=s.pointNumber;
    game.update(dt,{swing});
  }
  throw Error('No incoming return');
}
for(let stage=1;stage<=10;stage++)test(`tennis stage ${stage}: seeded complete simulation and result contract`,()=>{
  const {result}=simulate(stage,4107);
  assert.deepEqual(Object.keys(result).sort(),['won','gamesFor','gamesAgainst','stage','stars','seed','durationSeconds'].sort());
  assert.equal(result.stage,stage);assert.equal(result.seed,4107);assert.ok(result.durationSeconds>0);
  assert.equal(Math.max(result.gamesFor,result.gamesAgainst),4);assert.ok(result.stars>=1&&result.stars<=3);
  if(stage<=3)assert.equal(result.won,true);
  if(stage>=8)assert.equal(result.won,false);
});
test('tennis: same seed and input replay yield exactly the same state and result',()=>{
  for(const stage of [1,5,10])assert.deepEqual(simulate(stage,627).result,simulate(stage,627).result);
  const a=createTennis({config,seed:981}),b=createTennis({config,seed:981});
  for(let i=0;i<2400;i++){const input={swing:i%89===0,targetX:Math.sin(i/50)*3};a.update(dt,input);b.update(dt,input);assert.deepEqual(a.getState(),b.getState());}
});
test('tennis: difficulty holds across independent seeds, not one lucky match',()=>{
  for(const seed of [17,42,129]){
    for(const stage of [1,2,3])assert.equal(simulate(stage,seed).result.won,true,`${stage}/${seed}`);
  }
  for(const stage of [8,9,10])assert.ok([17,42,129].some(seed=>!simulate(stage,seed).result.won),`stage ${stage} sometimes beats the simple controller`);
});
test('tennis: 0, 15, 30, 40, deuce, advantage, deuce and two-point game',()=>{
  const score=createScore();assert.deepEqual(pointLabels(score,config.rules),[0,0]);
  for(const points of [15,30,40]){awardPoint(score,0,config.rules);assert.equal(pointLabels(score,config.rules)[0],points);}
  for(let n=0;n<3;n++)awardPoint(score,1,config.rules);
  assert.deepEqual(pointLabels(score,config.rules),['deuce','deuce']);
  awardPoint(score,0,config.rules);assert.deepEqual(pointLabels(score,config.rules),['advantage',40]);
  awardPoint(score,1,config.rules);assert.deepEqual(pointLabels(score,config.rules),['deuce','deuce']);
  awardPoint(score,1,config.rules);const change=awardPoint(score,1,config.rules);assert.equal(change.game,true);assert.deepEqual(score.games,[0,1]);assert.deepEqual(score.points,[0,0]);
});
test('tennis: first to four, no two-game margin, final score cannot change',()=>{
  const score=createScore();for(let game=0;game<7;game++)for(let point=0;point<4;point++)awardPoint(score,game%2,config.rules);
  assert.deepEqual(score.games,[4,3]);assert.equal(score.finished,true);assert.equal(score.winner,0);
  const before=structuredClone(score);awardPoint(score,1,config.rules);assert.deepEqual(score,before);
});
test('tennis: exact star thresholds, including encouragement star for a lab loss',()=>{
  for(const [against,stars]of [[0,3],[1,2],[2,1],[3,1]])assert.equal(buildResult({finished:true,winner:0,games:[4,against]},4,1,3,config.rules).stars,stars);
  assert.equal(buildResult({finished:true,winner:1,games:[2,4]},4,1,3,config.rules).stars,1);
  assert.equal(buildResult(createScore(),1,1,0,config.rules),null);
});
test('tennis: full timing window strictly narrows from 0.5 to 0.18 seconds',()=>{
  const windows=config.levels.map((_,i)=>createTennis({config,stage:i+1}).getState().timingWindow);
  assert.equal(windows[0],.5);assert.equal(windows.at(-1),.18);for(let n=1;n<windows.length;n++)assert.ok(windows[n]<windows[n-1]);
});
test('tennis: timing steers early left, on time deep centre and late right',()=>{
  const cfg=structuredClone(config);cfg.levels[0].missChance=0;cfg.levels[0].accuracy=1;
  const early=nextReturn(createTennis({config:cfg,seed:7}),.16);
  const centre=nextReturn(createTennis({config:cfg,seed:7}),0);
  const late=nextReturn(createTennis({config:cfg,seed:7}),-.14);
  assert.ok(early.targetX<0);assert.equal(centre.targetX,0);assert.ok(late.targetX>0);assert.equal(centre.targetZ,-config.ball.depth);
});
test('tennis: stage 1–3 auto running covers placement without manual motion',()=>{
  for(const stage of [1,2,3])assert.equal(simulate(stage,42,config.player.defaults,{center:true}).result.won,true);
});
test('tennis: all three ranks change movement, return flight and serve speed',()=>{
  const low=createTennis({config}),high=createTennis({config,ranks:{speed:5,hit:5,serve:5}});
  low.update(.25,{move:1});high.update(.25,{move:1});assert.ok(high.getState().players[0].x>low.getState().players[0].x);
  low.update(dt,{swing:true});high.update(dt,{swing:true});assert.ok(high.getState().shot.flight<low.getState().shot.flight);
  const cfg=structuredClone(config);cfg.levels[0].missChance=0;cfg.levels[0].accuracy=1;
  const weak=nextReturn(createTennis({config:cfg})),strong=nextReturn(createTennis({config:cfg,ranks:{speed:1,hit:5,serve:1}}));assert.ok(strong.flight<weak.flight);
});
test('tennis: holding serve charges power and held swing does not repeat',()=>{
  const weak=createTennis({config}),charged=createTennis({config});
  for(let i=0;i<80;i++)charged.update(dt,{charge:true});assert.equal(charged.getState().charge,1);
  weak.update(dt,{swing:true});charged.update(dt,{swing:true});assert.ok(charged.getState().shot.power>weak.getState().shot.power);assert.ok(charged.getState().shot.flight<weak.getState().shot.flight);
  const initial=charged.getState().event.id;for(let i=0;i<5;i++)charged.update(dt,{swing:true});assert.equal(charged.getState().event.id,initial);
});
test('tennis: analytic landing agrees with gravity and legal line tolerance',()=>{
  const b={x:1,y:2,z:3,vx:2,vy:1,vz:-4};const p=predictLanding(b,config);
  assert.ok(Math.abs(b.y+b.vy*p.seconds-.5*config.ball.gravity*p.seconds**2-config.ball.radius)<1e-9);
  assert.equal(p.x,b.x+b.vx*p.seconds);assert.equal(p.z,b.z+b.vz*p.seconds);
});
test('tennis: swept net, out, second bounce and idle serve all award one point',()=>{
  for(const reason of ['net','out','doubleBounce','timeout']){
    const cfg=structuredClone(config);if(reason==='net')cfg.court.netHeight=20;if(reason==='out')cfg.court.serviceLength=-2;
    const game=createTennis({config:cfg});if(reason!=='timeout')game.update(dt,{swing:true});
    for(let n=0;n<60*12&&game.getState().pointNumber===0;n++)game.update(dt);
    const s=game.getState();assert.equal(s.pointNumber,1,reason);assert.equal(s.event.reason,reason);assert.equal(s.score.points.reduce((a,b)=>a+b,0),1);
  }
});
test('tennis: every rally terminates, including an indefinitely accurate exchange',()=>{
  const cfg=structuredClone(config);cfg.levels[0].missChance=0;cfg.levels[0].accuracy=1;cfg.opponent.fatigueMissPerHit=0;
  const game=createTennis({config:cfg});let contact=-1;
  for(let n=0;n<60*(cfg.rules.rallyTimeout+10)&&game.getState().pointNumber===0;n++){
    const s=game.getState(),ready=s.phase==='serve'&&s.server===0;const incoming=s.contact?.side===0&&s.contact.eta<.02&&contact!==s.contact.at;
    if(incoming)contact=s.contact.at;game.update(dt,{swing:ready||incoming});
  }
  assert.equal(game.getState().pointNumber,1);
});
test('tennis: invalid deltas do not poison the model and completed update is inert',()=>{
  const g=createTennis({config});const before=g.snapshot();for(const dt of [-1,NaN,Infinity])g.update(dt,{swing:true});assert.deepEqual(g.getState(),before);
  const idle=createTennis({config});for(let n=0;n<60*300&&!idle.result;n++)idle.update(dt);assert.equal(idle.result.won,false);const end=idle.snapshot();idle.update(1,{swing:true});assert.deepEqual(idle.getState(),end);
});
test('tennis: vendor is byte-identical, asset stays relative, storage is isolated',async()=>{
  for(const name of ['three.module.js','GLTFLoader.js','BufferGeometryUtils.js','LICENSE.three'])assert.deepEqual(await readFile(new URL(`../codex-lab/island-tennis/vendor/${name}`,import.meta.url)),await readFile(new URL(`../codex-lab/kid-full/vendor/${name}`,import.meta.url)));
  const view=await readFile(new URL('../codex-lab/island-tennis/tennis-view.mjs',import.meta.url),'utf8');assert.match(view,/\.\.\/kid-full\/kid-full\.glb/);
  const app=await readFile(new URL('../codex-lab/island-tennis/app.mjs',import.meta.url),'utf8');assert.match(app,/setItem\('tennis-lab'/);assert.doesNotMatch(app,/island\.v1/);
});

test('tennis: accurate upgraded play can beat stages 8–10; late taps are not an automatic loss rule',()=>{
  for(const stage of [8,9,10])assert.equal(simulate(stage,17,{speed:5,hit:5,serve:5},{early:.03}).result.won,true);
});
test('tennis: opponent serves from baseline even when it sometimes approaches the net',()=>{
  const game=createTennis({config,stage:10});
  for(let n=0;n<60*200;n++){
    const s=game.getState();if(s.phase==='serve'&&s.server===1){for(let j=0;j<60;j++)game.update(dt);assert.equal(game.getState().players[1].z,-config.player.readyZ);return;}
    game.update(dt);
  }assert.fail('Opponent serve not reached');
});
