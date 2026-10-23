import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTennis,predictLanding} from '../workout/island/minigames/tennis.mjs';

const base=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames.tennis;
const dt=base.simulation.step;
const advance=(m,seconds,input={})=>{for(let i=0;i<Math.ceil(seconds/dt);i++)m.update(dt,input);};
const tap=(m,extra={})=>{m.update(0,{...extra,swing:true});m.update(0,{});};
function incoming({config=base,x=0,z=6,y=config.ball.hitHeight,at=0,vx=0,vy=0,vz=0,bounces=1,serving=false}={}){
 const m=createTennis({config,difficulty:'normal',seed:17}),s=m.getState();s.phase='rally';s.phaseTime=0;
 Object.assign(s.players[0],{x:0,z:6,vx:0,vz:0});
 s.shot={side:1,serving};Object.assign(s.ball,{x,z,y,vx,vy,vz,lastHitter:1,bounces});
 s.contact={side:0,at,x,z,eta:at};return m;
}
const returned=m=>m.getState().shot?.side===0;

test('accessible tennis: physical return reach is radial, including diagonal and remote misses',()=>{
 for(const fraction of [.15,.6,.95]){
  const m=incoming(),s=m.getState(),r=s.attributes.reach;Object.assign(s.ball,{x:r*fraction/Math.SQRT2,z:6+r*fraction/Math.SQRT2});tap(m);assert.ok(returned(m),`inside radius ${fraction}`);
 }
 for(const [dx,dz]of [[.9,.9],[1.02,0],[0,1.02],[3,3]]){
  const m=incoming(),s=m.getState(),r=s.attributes.reach;Object.assign(s.ball,{x:r*dx,z:6+r*dz});tap(m);assert.equal(returned(m),false,`outside radius ${dx}/${dz}`);
 }
});

test('accessible tennis: an early press expires before a ball enters reach substantially later',()=>{
 const m=incoming({at:.30,y:1.5,z:8.8,vz:-5,serving:true});tap(m);advance(m,.32);assert.equal(returned(m),false,'the ball arrives after the short input buffer has expired');
});

test('accessible tennis: contact remains available at different physical heights after the predicted instant',()=>{
 for(const [late,y]of [[.05,.55],[.16,1.1],[.48,.65]]){
  const m=incoming({at:-late,y}),s=m.getState();tap(m);assert.ok(returned(m),`reachable late contact ${late}s at ${y}m`);assert.ok(s.event.type==='hit');
 }
});

test('accessible tennis: a normal hit changes velocity without moving ball position',()=>{
 for(const y of [.4,.55,base.ball.hitHeight,1.25]){
  const m=incoming({y}),s=m.getState(),before={x:s.ball.x,y:s.ball.y,z:s.ball.z};tap(m);assert.ok(returned(m),`height ${y}`);
  assert.deepEqual({x:s.ball.x,y:s.ball.y,z:s.ball.z},before,`hit preserves contact position at ${y}m`);
  assert.ok(s.ball.vz<0&&Number.isFinite(s.ball.vy));
 }
});

test('accessible tennis: releasing movement brakes smoothly and comes to rest without drift',()=>{
 const m=incoming({y:100}),s=m.getState();s.ball.lastHitter=0;s.contact.side=1;
 advance(m,.25,{move:1});const before={...s.players[0]};m.update(dt,{});const released={...s.players[0]};
 assert.ok(released.vx>0&&released.vx<before.vx,'a release decelerates rather than resetting velocity');
 assert.ok(released.x>before.x,'a small physical braking step is retained');advance(m,.75);
 assert.ok(Math.abs(s.players[0].vx)<.02);const stopped=s.players[0].x;advance(m,.3);assert.ok(Math.abs(s.players[0].x-stopped)<.01);
});

test('accessible tennis: manual motion respects its speed bound in every direction and finite-step subdivision',()=>{
 for(const [move,moveZ]of [[1,0],[0,-1],[1,-1],[-1,1]]){
  const m=incoming({y:100}),s=m.getState();s.ball.lastHitter=0;s.contact.side=1;
  for(let i=0;i<60;i++){const p={...s.players[0]};m.update(dt,{move,moveZ});assert.ok(Math.hypot(s.players[0].x-p.x,s.players[0].z-p.z)<=s.attributes.speed*dt+1e-7);}
 }
});

test('accessible tennis: acceleration and reversal change velocity continuously in both axes',()=>{
 const m=incoming({y:100}),s=m.getState();s.ball.lastHitter=0;s.contact.side=1;
 for(const input of [{move:1,moveZ:1},{move:-1,moveZ:-1}])for(let i=0;i<40;i++){
  const before={...s.players[0]};m.update(dt,input);const p=s.players[0];
  assert.ok(Math.hypot(p.vx-before.vx,p.vz-before.vz)<=base.player.acceleration*dt+1e-6,'velocity cannot snap even on diagonal reversal');
 }
});

test('accessible tennis: preparation assists a nearby ball continuously, never by teleporting',()=>{
 const m=incoming({x:.8,z:7.5,y:1.1,at:.12}),s=m.getState(),origin={...s.players[0]};
 for(let i=0;i<12;i++){
  const before={...s.players[0]};m.update(dt,{prepare:true});const p=s.players[0];
  assert.ok(Math.hypot(p.x-before.x,p.z-before.z)<=s.attributes.speed*dt+1e-7,'assist displacement is speed bounded per physics step');
 }
 const p=s.players[0];assert.ok(Math.hypot(p.x-origin.x,p.z-origin.z)>.005,'nearby preparation produces physical footwork');
 assert.ok(Math.hypot(p.x-.8,p.z-7.5)<Math.hypot(origin.x-.8,origin.z-7.5));
});

test('accessible tennis: manual direction overrides assist, and idle or remote preparation cannot pull the player',()=>{
 const manual=incoming({x:.8,z:7.5,y:1.1,at:.12}),p=manual.getState().players[0];
 advance(manual,.12,{prepare:true,move:-1,moveZ:-1});assert.ok(p.x<0&&p.z<6,'manual input wins over attraction toward the ball');
 for(const [x,z,prepare]of [[.8,7.5,false],[4,8,true]]){
  const m=incoming({x,z,y:1.1,at:.12}),s=m.getState(),start={...s.players[0]};advance(m,.12,{prepare});
  assert.equal(s.players[0].x,start.x);assert.equal(s.players[0].z,start.z);
 }
});

test('accessible tennis: a legal short buffer may return an arriving ball but a missed early swing does not repeat',()=>{
 const m=incoming({x:0,z:7.6,y:1.2,vz:-4,at:.12,serving:true});tap(m);let hits=0,last=0;
 for(let i=0;i<60;i++){m.update(dt);const e=m.getState().event;if(e.id!==last){last=e.id;if(e.type==='hit'&&e.side===0)hits++;}}
 assert.equal(hits,1,'one buffered input creates one physical return');
});

test('accessible tennis: service returns wait for a bounce, and contacts above the playable height are rejected',()=>{
 for(const fixture of [{y:1.1,bounces:0,serving:true},{y:3.5,bounces:1,serving:false}]){
  const m=incoming(fixture);tap(m);assert.equal(returned(m),false,JSON.stringify(fixture));
 }
});

test('accessible tennis: a clean central contact has more power than a stretched edge contact',()=>{
 const shots=[];
 for(const fraction of [0,.9]){const m=incoming({y:1}),s=m.getState();s.ball.x=s.attributes.reach*fraction;tap(m);assert.ok(returned(m));shots.push({...s.shot});}
 assert.ok(shots[0].quality>shots[1].quality);assert.ok(shots[0].power>shots[1].power,'edge quality produces a physical power tradeoff');
});

test('accessible tennis: neither server teleports the ball at racket contact',()=>{
 const human=createTennis({config:base,seed:42}),h=human.getState();human.update(0,{serve:true});human.update(0,{});
 for(let i=0;i<600&&h.serveZone!=='green';i++)human.update(dt);
 assert.equal(h.phase,'toss');assert.equal(h.serveZone,'green');const before={x:h.ball.x,y:h.ball.y,z:h.ball.z};human.update(0,{serve:true});
 assert.equal(h.phase,'rally');assert.deepEqual({x:h.ball.x,y:h.ball.y,z:h.ball.z},before,'human contact changes velocity only');
 for(const stage of [1,15,30])for(const seed of [17,129]){
  const ai=createTennis({config:base,stage,seed}),s=ai.getState();s.server=1;s.phase='point';let toss=false,hit=false;
  for(let i=0;i<800&&!hit;i++){
   const b={...s.ball};ai.update(dt);toss||=s.phase==='toss';
   if(s.event.type==='hit'&&s.event.serving&&s.event.side===1){hit=true;assert.ok(Math.hypot(s.ball.x-b.x,s.ball.y-b.y,s.ball.z-b.z)<.25,'AI contact advances by at most one short physics step');}
  }
  assert.ok(toss,'AI must visibly toss before serving');assert.ok(hit);
 }
});

test('accessible tennis: the opponent cannot return a ball outside radial reach',()=>{
 const config=structuredClone(base);config.levels[0].reaction=0;config.levels[0].missChance=0;
 for(const [x,z]of [[4,-6],[1.2,-7.2]]){
  const m=incoming({config,y:1}),s=m.getState();Object.assign(s.players[1],{x:0,z:-6,vx:0,vz:0});Object.assign(s.ball,{x,z,vx:0,vz:0,lastHitter:0,bounces:1});
  s.shot={side:0,serving:false};s.contact={side:1,at:-1,eta:-1,x,z};m.update(dt);assert.notEqual(s.shot.side,1,'no rectangular or distant AI catch');
 }
});

test('accessible tennis: spin-aware landing prediction matches flat, lob and drop flight without a hidden position jump',()=>{
 for(const shot of [{},{lob:true},{drop:true}]){
  const m=incoming({y:1}),s=m.getState();tap(m,shot);assert.ok(returned(m));const landing=predictLanding(s.ball,base);
  assert.ok(Math.abs(landing.x-s.shot.targetX)<1e-7);assert.ok(Math.abs(landing.z-s.shot.targetZ)<1e-7);
  assert.ok(Number.isFinite(s.ball.spin));let bounced=false;
  for(let i=0;i<600&&s.phase==='rally';i++){m.update(dt);assert.ok([s.ball.x,s.ball.y,s.ball.z,s.ball.vy].every(Number.isFinite));if(s.event.type==='bounce'){bounced=true;break;}}
  assert.ok(bounced,'the shot has a real legal ground contact');
 }
});

test('accessible tennis: the AI can intercept low drops legally while a well placed unreachable drop still wins',()=>{
 let defended=0,winners=0;
 for(const hz of [9,2.5])for(const hx of [-2,0,2]){
  const m=createTennis({config:base,stage:15,seed:42,difficulty:'easy',ranks:{speed:3,hit:3,serve:3}}),s=m.getState();s.phase='rally';
  Object.assign(s.players[0],{x:hx,z:hz,vx:0,vz:0});Object.assign(s.players[1],{x:0,z:hz===9?-3:-9,vx:0,vz:0});
  Object.assign(s.ball,{x:hx,y:1,z:hz,vx:0,vy:0,vz:0,bounces:1,lastHitter:1});s.shot={side:1,serving:false};s.contact={side:0,x:hx,z:hz,at:0,eta:0};
  tap(m,{drop:true,aim:{x:-.85,z:0,manual:true}});assert.ok(s.shot.drop);
  for(let i=0;i<800&&s.phase==='rally';i++){
   const before={...s.ball},a={...s.players[1]};m.update(dt);
   const speed=Math.max(base.levels[14].speed*base.difficulties.easy.speed,base.player.speedByRank[0]*base.opponent.minimumSpeedRatio);
   assert.ok(Math.hypot(s.players[1].x-a.x,s.players[1].z-a.z)<=speed*dt+1e-7,'interception uses ordinary bounded footwork');
   if(s.event.type==='hit'&&s.event.side===1){
    defended++;assert.equal(before.bounces,0,'this low bounce is defended by a legal descending volley');
    assert.ok(Math.hypot(s.players[1].x-s.ball.x,s.players[1].z-s.ball.z)<=base.player.reach*1.25+1e-7);
    assert.ok(s.ball.y>=base.player.volleyMinHeight);
    assert.ok(Math.abs(s.ball.x-(before.x+before.vx*dt))<1e-7,'AI contact does not reposition the ball');break;
   }
  }
  if(s.event.reason==='doubleBounce')winners++;
 }
 assert.ok(defended>0,'low drop trajectories have a physically reachable interception');
 assert.ok(winners>0,'a short drop against a distant opponent remains useful');
});

test('accessible tennis: a held swing input returns once rather than repeating after the opponent responds',()=>{
 const m=incoming(),s=m.getState();m.update(0,{swing:true});assert.ok(returned(m));let count=1,last=s.event.id;
 for(let i=0;i<1200;i++){m.update(dt,{swing:true});if(s.event.id!==last){last=s.event.id;if(s.event.type==='hit'&&s.event.side===0&&!s.event.serving)count++;}}
 assert.equal(count,1);
});

test('accessible tennis: even a pathological long flight awards a single bounded point',()=>{
 const m=incoming({y:1000,vy:1000,at:1000}),s=m.getState();s.ball.lastHitter=0;s.contact.side=1;
 advance(m,base.rules.rallyTimeout+dt);assert.ok(['point','game','complete'].includes(s.phase));assert.equal(s.pointNumber,1);assert.equal(s.event.reason,'timeout');
});

test('accessible tennis: all 30 stages produce finite, moving begin/middle/end traces across independent seeds',()=>{
 assert.equal(base.levels.length,30);
 let movement=0,returns=0;
 for(let stage=1;stage<=30;stage++)for(const seed of [17,129,627]){
  const m=createTennis({config:base,stage,seed,difficulty:'easy'}),s=m.getState();let served=-1,struck='',event=-1;
  const samples=[];
  for(let i=0;i<3600&&!m.result;i++){
   const input={},id=`${s.pointNumber}/${s.rallyHits}`;
   if(s.server===0&&s.phase==='serve'&&served!==s.pointNumber){input.serve=true;served=s.pointNumber;}
   else if(s.server===0&&s.phase==='toss'&&s.serveZone==='green')input.serve=true;
   if(s.phase==='rally'&&s.contact?.side===0){
    const error=Math.sin(seed*1.7+s.rallyHits)*.2;
    input.move=Math.max(-1,Math.min(1,(s.contact.x+error-s.players[0].x)*2));
    input.moveZ=Math.max(-1,Math.min(1,(s.contact.z+.45+error-s.players[0].z)*2));
    if(s.contact.eta<.24&&struck!==id)input.prepare=true;
    if(s.contact.eta<.08+error*.4&&struck!==id){input.swing=true;input.prepare=false;struck=id;}
   }
   const before={...s.players[0]},phase=s.phase,point=s.pointNumber;m.update(1/120,input);
   if(phase==='rally'&&s.phase==='rally'&&point===s.pointNumber){const distance=Math.hypot(s.players[0].x-before.x,s.players[0].z-before.z);movement+=distance;assert.ok(distance<=s.attributes.speed/120+1e-6,`${stage}/${seed}: continuous movement`);}
   if(s.event.id!==event){event=s.event.id;if(s.event.type==='hit'&&s.event.side===0&&!s.event.serving)returns++;}
   if(i%120===0){const numbers=[s.elapsed,s.ball.x,s.ball.y,s.ball.z,s.ball.vx,s.ball.vy,s.ball.vz,...s.players.flatMap(p=>[p.x,p.z,p.vx||0,p.vz||0])];assert.ok(numbers.every(Number.isFinite),`${stage}/${seed}: finite trace`);samples.push({t:s.elapsed,point:s.pointNumber});}
  }
  assert.equal(s.stage,stage);assert.ok(samples.length>=3);assert.ok(s.pointNumber>0,`${stage}/${seed}: a real point terminates`);assert.ok(s.score.games.every(n=>n>=0&&n<=base.rules.gamesToWin));
 }
 assert.ok(movement>50,'traces exercise actual movement');assert.ok(returns>20,'traces exercise real returns');
});
