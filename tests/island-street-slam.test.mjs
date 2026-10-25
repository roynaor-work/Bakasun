import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSlamEngine,mulberry32} from '../workout/island/minigames/slam-engine.mjs';
import {createFixedLoop} from '../workout/island/minigames/slam-loop.mjs';
import {streetSlamResult} from '../workout/island/minigames/slam-result.mjs';
import {slamCourt} from '../workout/island/minigames/slam-court.mjs';

const root=new URL('../workout/island/',import.meta.url);
const json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
const config=await json('data/config.json'),cfg=config.minigames.streetSlam;
const NONE=Object.freeze({move:{x:0,z:0},primaryPressed:false,primaryReleased:false,secondaryPressed:false});
const input=(o={})=>({...NONE,move:{x:0,z:0},...o});

/** A live match with only the given player active (others parked, inactive). */
function solo(team='home',{seed=7,place,phase='playing',energy=0}={}){
 const e=createSlamEngine({config:cfg,seed,stage:1}),s=e.debugState;s.phase=phase;
 const shooter=s.players.find(p=>p.team===team&&p.index===0);
 for(const p of s.players)if(p!==shooter){p.inactive=true;p.x=6.2;p.z=p.index*2-1;}
 s.ball.ownerId=shooter.id;s.controlledId=shooter.id;shooter.energy=energy;
 if(place)place(shooter,s);
 return {e,s,shooter};
}
function shoot(e,hold){e.step(input({primaryPressed:true}));for(let i=0;i<Math.round(hold*60)-1;i++)e.step(NONE);e.step(input({primaryReleased:true}));}
function untilResolved(e,max=400){for(let i=0;i<max;i++){e.step(NONE);const b=e.snapshot().ball.shot;if(b?.resolved)return b;}return null;}
function events(e){return e.drainEvents();}

/** Black-box player through InputFrames only; used for long fuzz runs. */
function bot(rand){
 let hold=-1,want=0;
 return s=>{
  const me=s.players.find(p=>p.id===s.controlledPlayerId),out=input(),owner=s.players.find(p=>p.id===s.ball.ownerId);
  const go=t=>{const dx=t.x-me.position.x,dz=t.z-me.position.z,d=Math.hypot(dx,dz);if(d>.2)out.move={x:dx/d,z:dz/d};};
  if(hold>=0){hold+=1/60;if(hold>=want){out.primaryReleased=true;hold=-1;}return out;}
  if(s.availableActions.primary==='shoot'){const d=Math.hypot(me.position.x,me.position.z+7.6);if(s.dunkReady&&rand()<.5){out.primaryPressed=true;return out;}
   if(d<5.2||rand()<.01){out.primaryPressed=true;hold=0;want=.1+rand()*.7;return out;}if(rand()<.02)out.secondaryPressed=true;go({x:0,z:-6});return out;}
  if(owner&&owner.team==='away'){go(owner.position);if(rand()<.03)out.secondaryPressed=true;if(rand()<.02)out.primaryPressed=out.primaryReleased=true;return out;}
  go(s.ball.position);if(rand()<.02)out.primaryPressed=true;if(rand()<.02)out.primaryReleased=true;if(rand()<.01)out.secondaryPressed=true;return out;
 };
}

test('street slam is registered at the basketball court with data, flag, strings and stage map',async()=>{
 const ext=await json('data/extensions.json'),flags=await json('data/featureFlags.json'),strings=await json('data/strings.he.json');
 assert.ok(ext.modules.includes('extensions/street-slam.mjs'));
 assert.equal(ext.records.streetSlam.featureFlag,'streetSlam');assert.equal(flags.streetSlam,true);
 assert.equal(cfg.requiresBuilding,'basketball');assert.equal(config.gameShell.games.streetSlam.orientation,'any');
 assert.equal(cfg.levels.length,10);assert.equal(config.minigameLevels.streetSlam.length,3);
 for(const key of ['minigame.streetSlam.title','minigame.streetSlam.locked','minigame.streetSlam.help.1','minigame.streetSlam.help.2','minigame.streetSlam.help.3',...cfg.levels.map(l=>l.feature)])assert.ok(strings[key],key);
 for(const level of cfg.levels)assert.ok(level.ai.speed<=1,'AI never exceeds the shared speed limit');
 const {install}=await import('../workout/island/extensions/street-slam.mjs');const seen=[];
 install({registerMinigame:r=>seen.push(r)},{config,extensions:ext.records});
 assert.equal(seen[0].id,'streetSlam');assert.equal(typeof seen[0].start,'function');assert.equal(typeof seen[0].onResult,'function');
});

test('1. same seed and input sequence replay identically; frame rate does not change the steps',()=>{
 const run=()=>{const e=createSlamEngine({config:cfg,seed:4242,stage:6}),r=mulberry32(9),b=bot(r.next),log=[];
  for(let i=0;i<60*40;i++){e.step(b(e.snapshot()));for(const ev of e.drainEvents())log.push(ev.type+ev.seq);}
  return {snap:JSON.stringify(e.snapshot()),log:log.join(',')};};
 const a=run(),b=run();assert.equal(a.snap,b.snap);assert.equal(a.log,b.log);
 // Same held stick for one simulated second at 30/60/120 Hz frames.
 const positions=[30,60,120].map(hz=>{const e=createSlamEngine({config:cfg,seed:5,stage:1}),loop=createFixedLoop();let steps=0;
  for(let f=0;f<hz*3;f++)loop.advance(1/hz,()=>{e.step(input({move:{x:.6,z:-.8}}));steps++;});
  const p=e.snapshot().players[0];return {steps,x:p.position.x.toFixed(6),z:p.position.z.toFixed(6),tick:e.snapshot().tick,ms:e.snapshot().remainingMs};});
 assert.equal(positions[0].steps,180);assert.deepEqual(positions[1],positions[0]);assert.deepEqual(positions[2],positions[0]);
 // A slow 4 fps frame is capped and never jumps more than the step budget.
 const loop=createFixedLoop({maxFrame:.25,maxSteps:8});let n=0;loop.advance(2,()=>{n++;});assert.equal(n,8);
});

test('2. a basket counts once per shotId and never from below',()=>{
 const {e,s}=solo('home',{place:p=>{p.x=0;p.z=-5.6;}});
 shoot(e,.56);const r=untilResolved(e);events(e);
 // Force a deterministic make: drop the live ball straight through the ring.
 const t=solo('home',{seed:3,place:p=>{p.x=0;p.z=-5;}});shoot(t.e,.56);for(let i=0;i<20;i++)t.e.step(NONE);
 const b=t.s.ball;assert.ok(b.shot&&!b.shot.resolved);Object.assign(b,{x:0,y:3.9,z:-7.6,vx:0,vy:-1,vz:0});
 for(let i=0;i<40;i++)t.e.step(NONE);let ev=events(t.e);
 assert.equal(ev.filter(x=>x.type==='score').length,1);assert.equal(t.s.score.home,2);
 // Same ball pushed back up and dropped again: that shot is already judged.
 t.s.phase='playing';Object.assign(b,{x:0,y:3.9,z:-7.6,vx:0,vy:-1,vz:0,ownerId:null});for(let i=0;i<40;i++)t.e.step(NONE);
 assert.equal(events(t.e).filter(x=>x.type==='score').length,0);assert.equal(t.s.score.home,2);
 // From below: a fresh unresolved shot rising through the ring scores nothing.
 const u=solo('home',{seed:4,place:p=>{p.x=0;p.z=-5;}});shoot(u.e,.56);for(let i=0;i<20;i++)u.e.step(NONE);
 Object.assign(u.s.ball,{x:0,y:2.4,z:-7.6,vx:0,vy:6,vz:0});for(let i=0;i<14;i++)u.e.step(NONE);
 assert.equal(u.s.score.home,0);assert.ok(u.s.ball.y>3.22);
 assert.ok(r,'a real jump shot is always judged');
});

test('3. two or three points follow the release spot, not the landing spot',()=>{
 const court=slamCourt(cfg);
 assert.equal(court.points('home',0,-7.3+5.7),3);assert.equal(court.points('home',0,-7.3+5.5),2);assert.equal(court.points('away',0,7.3-5.8),3);
 const far=solo('home',{place:p=>{p.x=0;p.z=-7.3+6.2;}});shoot(far.e,.56);for(let i=0;i<30;i++)far.e.step(NONE);
 const rel=events(far.e).find(x=>x.type==='shotReleased');assert.equal(rel.points,3);
 // Wherever it lands or scores, the shot keeps its value.
 Object.assign(far.s.ball,{x:0,y:3.9,z:-7.6,vx:0,vy:-1,vz:0});for(let i=0;i<40;i++)far.e.step(NONE);
 assert.equal(far.s.score.home,3);
 const near=solo('home',{place:p=>{p.x=1;p.z=-4;}});shoot(near.e,.56);for(let i=0;i<30;i++)near.e.step(NONE);
 assert.equal(events(near.e).find(x=>x.type==='shotReleased').points,2);
});

test('4. steals, blocks, interceptions and passes never leave two ball owners (fuzz)',()=>{
 for(let seed=1;seed<=12;seed++){
  const e=createSlamEngine({config:cfg,seed,stage:1+seed%10}),r=mulberry32(seed*31),b=bot(r.next),seen=new Set();
  for(let i=0;i<60*120;i++){e.step(b(e.snapshot()));const inv=e.invariants();assert.ok(inv.owners<=1&&inv.ownerValid,'seed '+seed);
   const s=e.snapshot();if(s.ball.ownerId)assert.equal(s.ball.shot,null);for(const ev of e.drainEvents())seen.add(ev.type);}
  if(seed===3)for(const type of ['pass','steal','shotReleased','possession'])assert.ok(seen.has(type),type);
 }
});

test('4b. a successful steal transfers the ball; a pass reaches the teammate',()=>{
 const e=createSlamEngine({config:cfg,seed:11,stage:1}),s=e.debugState;s.phase='playing';
 const [h1,h2,a1,a2]=s.players;Object.assign(a1,{x:0,z:0});Object.assign(h1,{x:0,z:.9,yaw:Math.PI});a2.inactive=true;a2.x=6;
 s.ball.ownerId='a1';s.controlledId='h1';a1.yaw=0;
 let stole=false;for(let i=0;i<20&&!stole;i++){h1.cd.steal=0;h1.stumble=0;e.step(input({secondaryPressed:true}));stole=s.ball.ownerId==='h1';for(let k=0;k<3;k++)e.step(NONE);}
 assert.ok(stole,'steal succeeds within a few tries at the configured chance');
 assert.ok(e.drainEvents().some(x=>x.type==='steal'&&x.playerId==='h1'));
 Object.assign(h2,{x:-3,z:-2});a1.inactive=true;a1.x=6;
 for(let i=0;i<30;i++)e.step(NONE);e.step(input({secondaryPressed:true}));for(let i=0;i<90&&s.ball.ownerId!=='h2';i++)e.step(NONE);
 assert.equal(s.ball.ownerId,'h2');assert.equal(s.controlledId,'h2','control follows the ball to the catcher');
});

test('4c. a block deflects the shot, resolves it once and leaves a loose ball',()=>{
 const t=solo('home',{seed:21,place:(p,s)=>{p.x=0;p.z=-3;p.yaw=Math.PI;const q=s.players.find(x=>x.id==='a1');q.inactive=false;q.x=0;q.z=-3.9;q.yaw=0;}});
 const q=t.s.players.find(x=>x.id==='a1');q.think=99;q.plan=null;
 t.e.step(input({primaryPressed:true}));for(let i=0;i<30;i++)t.e.step(NONE);t.e.step(input({primaryReleased:true}));
 for(let i=0;i<8;i++){t.e.step(NONE);q.think=99;q.plan=null;}
 q.jumpT=0;q.jumpDur=.56;q.jumpHeight=.7;q.state='block';
 for(let i=0;i<40;i++){t.e.step(NONE);q.think=99;q.plan=null;}
 const ev=events(t.e);const block=ev.filter(x=>x.type==='block');assert.equal(block.length,1);
 assert.equal(ev.filter(x=>x.type==='miss'&&x.reason==='blocked').length,1);assert.equal(t.s.score.home,0);
});

test('5. a ball stuck on the rim is released in bounded time and the match still ends',()=>{
 const t=solo('home',{seed:8,place:p=>{p.x=0;p.z=-5;}});shoot(t.e,.56);for(let i=0;i<20;i++)t.e.step(NONE);
 const b=t.s.ball,ring={x:0,y:cfg.court.hoopHeight,z:-cfg.court.hoopZ};
 // Rest it on the back of the rim with no speed.
 Object.assign(b,{x:0,y:ring.y+cfg.court.ballRadius+cfg.court.ringTube-.005,z:ring.z-cfg.court.ringRadius,vx:0,vy:0,vz:0});
 const before=t.s.remainingTicks;let freed=false,ticks=0;
 const rest=()=>{Object.assign(b,{x:0,y:ring.y+cfg.court.ballRadius+cfg.court.ringTube-.005,z:ring.z-cfg.court.ringRadius,vx:0,vy:0,vz:0});};
 // Wedged: the ball is held in place every step until the engine frees it.
 for(;ticks<Math.ceil((cfg.physics.stuckSeconds+1)*60)&&!freed;ticks++){rest();t.e.step(NONE);freed=t.e.drainEvents().some(ev=>ev.type==='stuck');}
 assert.ok(ticks<=Math.ceil(cfg.physics.stuckSeconds*60)+2,'freed after '+ticks);assert.ok(Math.hypot(b.vx,b.vz)>1,'pushed off the rim');
 assert.ok(freed,'stuck event');assert.ok(t.s.remainingTicks<before,'clock kept running');assert.equal(b.shot.resolved,true);
 assert.notEqual(b.shot.result,'made');
 // The physics geometry is real: rim, board and floor all produce contacts.
 const g=solo('home',{seed:9});const types=new Set();g.s.ball.ownerId=null;
 for(const [x,y,z,vx,vy,vz] of [[0,4.2,-7.6+0.43,0,-2,0],[0,3.8,-6.2,0,0,-6],[0,1,-2,0,-3,0]]){Object.assign(g.s.ball,{x,y,z,vx,vy,vz});for(let i=0;i<40;i++){g.e.step(NONE);for(const ev of g.e.drainEvents())types.add(ev.type);}}
 for(const type of ['rim','board','floor'])assert.ok(types.has(type),type);
 // A whole match with a passive child still reaches the end.
 const m=createSlamEngine({config:cfg,seed:77,stage:1});let n=0;while(m.snapshot().phase!=='finished'&&n<60*600){m.step(NONE);n++;}
 assert.equal(m.snapshot().phase,'finished');
});

test('6. buzzer: a release before it counts, after it cannot happen; overtime waits for the live shot',()=>{
 const t=solo('home',{seed:13,place:p=>{p.x=0;p.z=-5;}});t.s.remainingTicks=40;t.s.score.away=2;
 shoot(t.e,.5);// released at ~tick 30+windup 16 -> after the buzzer at tick 40
 for(let i=0;i<200;i++)t.e.step(NONE);let ev=events(t.e);
 assert.ok(ev.some(x=>x.type==='buzzer'));assert.equal(ev.filter(x=>x.type==='shotReleased').length,0);assert.equal(t.s.phase,'finished');
 // Released in time, scores after the buzzer and forces overtime from a 0-2 deficit? No: make it a tie-breaker.
 const u=solo('home',{seed:14,place:p=>{p.x=0;p.z=-4.6;}});u.s.remainingTicks=50;u.s.score.away=2;
 shoot(u.e,.2);for(let i=0;i<20;i++)u.e.step(NONE);
 ev=events(u.e);assert.equal(ev.filter(x=>x.type==='shotReleased').length,1);assert.equal(u.s.buzzer,false);
 // Hold the flight until after the clock: the decision must wait for the result.
 for(let i=0;i<20&&!u.s.buzzer;i++)u.e.step(NONE);assert.equal(u.s.buzzer,true);assert.equal(u.s.ball.shot.resolved,false,'shot still in the air at the buzzer');assert.notEqual(u.s.phase,'finished');assert.notEqual(u.s.phase,'ready');
 Object.assign(u.s.ball,{x:0,y:3.9,z:-7.6,vx:0,vy:-1,vz:0});for(let i=0;i<30;i++)u.e.step(NONE);ev=events(u.e);
 assert.ok(ev.some(x=>x.type==='score'));assert.equal(u.s.score.home,2);
 for(let i=0;i<Math.ceil(cfg.match.scoreResetSeconds*60)+5;i++)u.e.step(NONE);ev=events(u.e);
 assert.ok(ev.some(x=>x.type==='overtime'));assert.equal(u.s.overtimes,1);assert.equal(u.s.remainingTicks,cfg.match.overtimeSeconds*60);
});

test('7. pause freezes time and input; resume neither jumps nor leaves a charge stuck',()=>{
 const t=solo('home',{seed:15,place:p=>{p.x=0;p.z=-3;}});
 t.e.step(input({primaryPressed:true}));for(let i=0;i<10;i++)t.e.step(NONE);
 const before=t.e.snapshot();assert.ok(before.players[0].charge>0);
 t.e.pause();for(let i=0;i<300;i++)t.e.step(input({move:{x:1,z:0},primaryReleased:true}));
 const paused=t.e.snapshot();assert.equal(paused.phase,'paused');assert.equal(paused.tick,before.tick);assert.equal(paused.remainingMs,before.remainingMs);assert.equal(paused.players[0].position.x,before.players[0].position.x);
 t.e.resume();t.e.step(NONE);const after=t.e.snapshot();assert.equal(after.tick,before.tick+1);assert.equal(after.players[0].charge,-1,'charge cancelled');
 assert.equal(t.s.ball.ownerId,'h1');assert.equal(events(t.e).filter(x=>x.type==='shotReleased').length,0);
});

test('a dunk is a bounded jump to the rim, scores through the hoop rule and costs energy',()=>{
 const t=solo('home',{seed:16,energy:1,place:p=>{p.x=0;p.z=-5.4;p.yaw=Math.PI;}});
 const e0=t.shooter.energy;assert.equal(t.e.snapshot().dunkReady,true);
 const path=[];t.e.step(input({primaryPressed:true}));assert.equal(t.shooter.state,'dunk');
 for(let i=0;i<120;i++){t.e.step(NONE);path.push({x:t.shooter.x,z:t.shooter.z});}
 for(let i=1;i<path.length;i++)assert.ok(Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z)<6.5/60,'no teleport');
 const ev=events(t.e);assert.ok(ev.some(x=>x.type==='dunk'));assert.ok(ev.some(x=>x.type==='score'&&x.kind==='dunk'&&x.points===2));
 assert.ok(t.shooter.energy<e0);
 // Lane blocked by a defender: the same press becomes a normal shot charge.
 const u=solo('home',{seed:17,energy:1,place:(p,s)=>{p.x=0;p.z=-5.4;p.yaw=Math.PI;const q=s.players.find(x=>x.id==='a1');q.inactive=false;q.x=0;q.z=-6.4;}});
 assert.equal(u.e.snapshot().dunkReady,false);u.e.step(input({primaryPressed:true}));assert.notEqual(u.shooter.state,'dunk');assert.ok(u.shooter.charge>=0);
});

test('available actions follow possession and role',()=>{
 const e=createSlamEngine({config:cfg,seed:2,stage:1}),s=e.debugState;s.phase='playing';
 assert.deepEqual(e.snapshot().availableActions,{primary:'shoot',secondary:'pass'});
 s.ball.ownerId='h2';assert.deepEqual(e.snapshot().availableActions,{primary:'rebound',secondary:'switch'});
 s.ball.ownerId='a1';assert.deepEqual(e.snapshot().availableActions,{primary:'block',secondary:'steal'});
 s.ball.ownerId=null;assert.deepEqual(e.snapshot().availableActions,{primary:'rebound',secondary:'switch'});
});

test('practice teaches move, pass and shot without a clock and ends cleanly',()=>{
 const e=createSlamEngine({config:cfg,seed:3,stage:1,mode:'practice'}),s=e.debugState;
 assert.equal(e.snapshot().phase,'practice');const t0=e.snapshot().remainingMs;
 for(let i=0;i<600&&s.practice.step===0;i++){const h=s.players[0],d=s.practice.target;e.step(input({move:{x:d.x-h.x,z:d.z-h.z}}));}
 assert.equal(s.practice.step,1);e.step(input({secondaryPressed:true}));assert.equal(s.practice.step,2);
 for(let i=0;i<240&&s.ball.ownerId!=='h1';i++)e.step(NONE);assert.equal(s.ball.ownerId,'h1','the teammate passes back');
 shoot(e,.56);for(let i=0;i<300&&e.snapshot().phase!=='finished';i++)e.step(NONE);
 assert.equal(e.snapshot().phase,'finished');assert.equal(e.snapshot().remainingMs,t0);assert.deepEqual(e.result,{practice:true});
});

test('difficulty ladder: a steady player beats stage 1 and finds stage 10 harder',()=>{
 const play=(stage,seed)=>{const e=createSlamEngine({config:cfg,seed,stage}),r=mulberry32(seed),b=bot(r.next);let n=0;while(e.snapshot().phase!=='finished'&&n<60*700){e.step(b(e.snapshot()));n++;}return e.result;};
 const margin=stage=>{let m=0;for(let s=1;s<=3;s++){const r=play(stage,s*101);m+=r.scoreFor-r.scoreAgainst;}return m/3;};
 const easy=margin(1),hard=margin(10);
 assert.ok(easy>0,'stage 1 is winnable: '+easy);assert.ok(hard<easy,'stage 10 is harder: '+hard+' vs '+easy);
});

test('result validation accepts the engine result once and refuses forged rounds',()=>{
 const e=createSlamEngine({config:cfg,seed:99,stage:2}),r=mulberry32(5),b=bot(r.next);let n=0;
 while(e.snapshot().phase!=='finished'&&n<60*700){e.step(b(e.snapshot()));n++;}
 const result=e.result,raw={outcome:result.won?'win':'lose',score:result.scoreFor,streetSlam:result},ctx={level:2,seed:99};
 const ok=streetSlamResult(raw,ctx,cfg);assert.ok(ok);assert.equal(ok.score,result.scoreFor);assert.equal(ok.stars,result.stars);
 assert.equal(ok.money,result.won?cfg.levels[1].winMoney+Math.floor(result.scoreFor/4):0);
 for(const forged of [{...result,stars:3,won:true,scoreFor:result.scoreAgainst+20},{...result,stage:3},{...result,seed:1},{...result,durationSeconds:20},{...result,scoreFor:result.scoreAgainst},{...result,extra:1}])
  assert.equal(streetSlamResult({...raw,streetSlam:forged},ctx,cfg),null);
});

test('saves from before Street Slam load without reset and gain only its defaults',async()=>{
 const {createRegistry}=await import('../workout/island/engine/registry.mjs');
 const {createInitialState,migrateSave,CURRENT_VERSION}=await import('../workout/island/engine/persistence.mjs');
 const files=['config','buildings','world','avatar','team','players','tutorial'];
 const data=Object.fromEntries(await Promise.all(files.map(async id=>[id,await json(`data/${id}.json`)])));
 // The world as main shipped it: same schema version, no streetSlam anywhere.
 const before=structuredClone(data);delete before.config.minigames.streetSlam;delete before.config.minigameLevels.streetSlam;
 const old=createInitialState(before,1000);old.money=4321;old.minigameLevels.tennis=2;old.minigameProgress.soccer.stage=4;old.minigameProgress.soccer.stars.fill(3,0,3);
 assert.equal(old.version,CURRENT_VERSION);assert.ok(!('streetSlam' in old.minigameLevels));
 const loaded=migrateSave(structuredClone(old),data,createRegistry(data));
 assert.equal(loaded.ok,true,JSON.stringify(loaded).slice(0,300));const s=loaded.state;
 assert.equal(s.money,4321);assert.equal(s.minigameLevels.tennis,2);assert.equal(s.minigameProgress.soccer.stage,4);assert.equal(s.minigameProgress.soccer.stars[0],3);
 assert.equal(s.minigameLevels.streetSlam,1);assert.deepEqual(s.minigameProgress.streetSlam,{stage:1,stars:Array(10).fill(0)});assert.deepEqual(s.minigameEquipment.streetSlam,{});
 for(const id of Object.keys(old.minigameEquipment))assert.deepEqual(s.minigameEquipment[id],old.minigameEquipment[id]);
 // Older fixtures still migrate through the existing chain.
 for(const v of [7,9,10,11]){const fixture=JSON.parse(await readFile(new URL(`tests/fixtures/save-v${v}.json`,root),'utf8'));const r=migrateSave(fixture,data,createRegistry(data));assert.equal(r.ok,true,'v'+v);assert.equal(r.state.minigameLevels.streetSlam,1);}
});
