import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analogControl,slideVelocityScale,sweptSlideContact,slideRecoverySeconds} from '../workout/island/minigames/soccer-control-depth.mjs';
import {selectControlledPlayer,assistedPassDestination,followDribbleBall} from '../workout/island/minigames/soccer-assistance.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';

const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const p=(id,x,z,extra={})=>({id,x,z,team:0,role:'support',speed:1,vx:0,vz:0,fx:1,fz:0,recover:0,slideTime:0,...extra});
const ball=(extra={})=>({x:0,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,owner:null,...extra});
const state=(players,b=ball(),extra={})=>({players,ball:b,controlled:0,attackDir:1,aim:{x:1,z:0},...extra});
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} ~= ${b}`);

test('touch control has a continuous radial centre and preserves full-speed cardinal/diagonal caps',()=>{
 const dead=c.controls.deadzone;
 assert.deepEqual(analogControl(dead,0,c),{x:0,z:0,length:0});
 assert.ok(analogControl(dead+.0001,0,c).length<.001,'no jump as the thumb leaves the centre');
 let previous=0;
 for(let i=0;i<=100;i++){
  const raw=i/100,result=analogControl(raw,0,c);
  assert.ok(result.length>=previous);assert.ok(result.length<=1);previous=result.length;
 }
 assert.ok(analogControl(.3,0,c).length<.3,'short thumb movement gives a precise slow walk');
 near(analogControl(1,0,c).x,1);near(analogControl(1,1,c).length,1);
 near(Math.hypot(analogControl(1,1,c).x,analogControl(1,1,c).z),1);
 assert.deepEqual(analogControl(NaN,Infinity,c),{x:0,z:0,length:0});
});

test('portrait and landscape stick rotations have the same response and no directional dead zones',()=>{
 for(const magnitude of [.05,.2,.45,.8,1])for(let n=0;n<24;n++){
  const angle=n*Math.PI/12,x=Math.cos(angle)*magnitude,z=Math.sin(angle)*magnitude;
  const landscape=analogControl(x,z,c),portrait=analogControl(-z,x,c);
  near(landscape.length,portrait.length);near(portrait.x,-landscape.z);near(portrait.z,landscape.x);
 }
});

test('automatic selection anticipates an outgoing ball even when that player is farther from its current position',()=>{
 for(const direction of [-1,1]){
  const s=state([p(0,-6*direction,0),p(1,0,2),p(2,5*direction,0)],ball({vx:15*direction}));
  assert.equal(selectControlledPlayer(s,c),2);
  const reversed={...s,players:[...s.players].reverse()};assert.equal(selectControlledPlayer(reversed,c),2);
 }
});

test('incoming ball stays with the reachable receiver instead of selecting a player beyond it',()=>{
 const s=state([p(0,0,0),p(1,5,2),p(2,9,0)],ball({x:7,vx:-16}));
 assert.equal(selectControlledPlayer(s,c),0);
});

test('automatic intent chooses between similar intercepts and hysteresis ignores small jitter',()=>{
 const s=state([p(0,-8,0),p(1,3,2),p(2,3,-2)],ball({x:7}));
 assert.equal(selectControlledPlayer(s,c,{moveZ:1}),1);
 assert.equal(selectControlledPlayer(s,c,{moveZ:-1}),2);
 const tied=state([p(0,0,0),p(1,.1,0)],ball({x:6}));
 for(let i=0;i<30;i++){tied.players[1].z=Math.sin(i)*.08;assert.equal(selectControlledPlayer(tied,c),0);}
});

test('selection respects the actual flight landing, own possession, unavailable bodies and cooldown',()=>{
 const s=state([p(0,-8,0),p(1,0,2),p(2,8,0)],ball({y:3,flight:{age:.6,duration:1,fromX:0,fromZ:0,x:8,z:0,height:3}}));
 assert.equal(selectControlledPlayer(s,c,{manual:true}),2);
 s.players[2].recover=1;assert.equal(selectControlledPlayer(s,c,{manual:true}),1);
 s.players[2].recover=0;s.ball.owner=2;assert.equal(selectControlledPlayer(s,c),0);
 s.ball.owner=null;s.switchCooldown=.2;assert.equal(selectControlledPlayer(s,c),0);
});

test('an automatic pass prefers the open nearby corridor while an explicit drag keeps its exact ray',()=>{
 const s=state([p(0,0,0),p(1,6,-.8),p(2,6,.8),p(3,3,-.4,{team:1})]);
 assert.equal(assistedPassDestination(s,c).target,2);
 s.passAim={x:1,z:0,manual:true};const pass=assistedPassDestination(s,c);
 near(pass.z,0);near(pass.x,c.passing.minDistance);assert.equal(pass.assisted,false);
});

test('observed defender motion changes the assisted pass choice without altering the cone',()=>{
 const s=state([p(0,0,0),p(1,6,-.8),p(2,6,.8),p(3,3,-2,{team:1,vz:0})]);
 assert.equal(assistedPassDestination(s,c).target,1,'unmarked equal angles use a stable ID');
 s.players[3].vz=1.6/(c.passing.groundTravelSeconds/2);
 const pass=assistedPassDestination(s,c);
 assert.equal(pass.target,2);assert.ok(Math.abs(pass.correctionRadians)<=18*Math.PI/180);
});

test('dribble exposes the ball farther at sprint pace, while a sharp cut keeps the touch closer',()=>{
 const settle=(speed,fx=1)=>{
  const player=p(0,0,0,{vx:speed,fx}),b=ball({x:c.physics.dribbleOffset,owner:0});
  for(let i=0;i<100;i++){player.x+=speed/60;Object.assign(b,followDribbleBall(player,b,1/60,c));assert.equal(b.owner,0);}
  return Math.abs(b.x-player.x);
 };
 const walking=settle(1),sprinting=settle(c.players.speed*c.sprint.multiplier),cut=settle(4,-1);
 assert.ok(sprinting>walking+.08);assert.ok(sprinting<1.3);assert.ok(cut<sprinting);
});

test('slide catches a ball that crosses between fixed-tick endpoints without enlarging local reach',()=>{
 const from={x:0,z:0},to={x:.1,z:0},a=ball({x:-2}),b=ball({x:2});
 const contact=sweptSlideContact(from,to,a,b,c,{elapsed:.05,dt:1/60});
 assert.ok(contact);assert.ok(contact.time>0&&contact.time<1);
 const px=from.x+(to.x-from.x)*contact.time,bx=a.x+(b.x-a.x)*contact.time;
 near(Math.abs(px-bx),c.slide.reach);
 assert.equal(sweptSlideContact(from,to,{...a,z:c.slide.reach+.001},{...b,z:c.slide.reach+.001},c),null);
 assert.equal(sweptSlideContact(from,to,{...a,y:2},{...b,y:2},c),null);
});

test('slide timing uses an extended-foot window and rejects contact after it ends',()=>{
 const body={x:0,z:0},b=ball({x:.8});
 assert.ok(sweptSlideContact(body,body,b,b,c,{elapsed:c.slide.seconds*.6}).late);
 assert.equal(sweptSlideContact(body,body,b,b,c,{elapsed:c.slide.seconds*.83}),null);
 const reachesTooLate=sweptSlideContact(body,body,ball({x:2}),ball({x:.5}),c,{elapsed:c.slide.seconds*.8,dt:c.slide.seconds*.1});
 assert.equal(reachesTooLate,null);
});

test('descending ball contact is possible only while height and swept body overlap at the same instant',()=>{
 const body={x:0,z:0},high=ball({x:.5,y:c.rules.pickupHeight+.2}),low=ball({x:.5,y:c.rules.pickupHeight-.2});
 const contact=sweptSlideContact(body,body,high,low,c);
 assert.ok(contact);near(contact.time,.5);
 assert.equal(sweptSlideContact(body,body,ball({x:.5,y:2}),ball({x:4,y:.2}),c),null,'ball leaves reach before dropping to foot height');
});

test('slide slows into recovery, preserves its total configured distance, and punishes missed rear challenges',()=>{
 const slices=1000,dt=c.slide.seconds/slices;
 let distance=0;
 for(let i=0;i<slices;i++)distance+=slideVelocityScale(c.slide.seconds-(i+.5)*dt,c)*c.slide.distance/c.slide.seconds*dt;
 near(distance,c.slide.distance,1e-10);
 assert.ok(slideVelocityScale(c.slide.seconds,c)>slideVelocityScale(0,c));
 near(slideRecoverySeconds(c,{won:true}),c.slide.recoverSeconds);
 assert.ok(slideRecoverySeconds(c,{won:false,behind:true,late:true})>slideRecoverySeconds(c,{won:false}));
 const rear=sweptSlideContact({x:-.8,z:0},{x:-.7,z:0},ball(),ball(),c,{owner:p(3,0,0,{team:1}),elapsed:c.slide.seconds*.6});
 assert.equal(rear.behind,true);assert.equal(rear.late,true);near(rear.risk,1);
});

test('control helpers are deterministic and never mutate live positions, commands, possession or configuration',()=>{
 const s=state([p(0,0,0),p(1,6,1)],ball({owner:0})),before=structuredClone(s),config=structuredClone(c);
 for(let i=0;i<10;i++){
  selectControlledPlayer(s,c);assistedPassDestination(s,c);followDribbleBall(s.players[0],s.ball,1/60,c);
  analogControl(.3,-.2,c);slideVelocityScale(.2,c);slideRecoverySeconds(c);
  sweptSlideContact(s.players[0],s.players[1],s.ball,s.ball,c);
 }
 assert.deepEqual(s,before);assert.deepEqual(c,config);
});

function matchFixture({direction=1,random=()=>0}={}){
 const game=createSoccer({config:c,difficulty:'normal',stage:1,seed:27,random}),s=game.getState();
 game.clearInput();s.controlled=0;s.attackDir=direction;s.switchCooldown=100;s.passTarget=null;
 for(const player of s.players)Object.assign(player,{x:player.team===0?-12:12,z:(player.id%3-1)*7,recover:100,cooldown:0,slideTime:0,vx:0,vz:0,fx:direction,fz:0,hands:false});
 const player=s.players[0];Object.assign(player,{x:0,z:0,recover:0});
 Object.assign(s.ball,{owner:0,x:direction*c.physics.dribbleOffset,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,grace:10,lastTeam:0,lastPlayer:0,flight:null,thrower:null});
 const events=[];
 const tick=(input={})=>{game.update(c.match.fixedStep,input);events.push(...game.drainEvents());};
 return {game,s,player,events,tick};
}

test('real model uses feathered walking and a bounded faster sprint in either attack direction',()=>{
 for(const direction of [-1,1]){
  const run=(magnitude,sprinting=false,diagonal=false)=>{
   const f=matchFixture({direction});
   for(let i=0;i<60;i++)f.tick({moveX:magnitude*direction,moveZ:diagonal?magnitude:0,sprintHeld:sprinting});
   return {speed:Math.hypot(f.player.vx,f.player.vz),meter:f.s.sprint};
  };
  const full=run(1),walk=run(.3),sprint=run(1,true),diagonal=run(1,false,true);
  assert.ok(walk.speed>0&&walk.speed<full.speed*.5,'a short stick deflection remains a precise walk');
  near(sprint.speed/full.speed,c.sprint.multiplier,1e-8);
  assert.ok(diagonal.speed<=full.speed*1.001,'diagonal input must not add speed');
  assert.equal(sprint.meter.active,true);assert.ok(sprint.meter.value<sprint.meter.capacity);
 }
});

function beginSlide(f,{x=3,z=0,y=c.physics.ballRadius,vx=0,vy=0,vz=0,owned=true}={}){
 // The carrier stays put; only the real committed slide and ball integrator run.
 Object.assign(f.s.players[3],{x,z,recover:100,fx:-1,fz:0,hands:false});
 Object.assign(f.s.ball,{owner:owned?3:null,x,z,y,vx,vy,vz,grace:0,lastTeam:1,lastPlayer:3});
 f.s.mode='defense';f.tick({kickHeld:true,moveX:1});
}

test('real slide commits once, slows into the configured distance, and a missed tackle leaves recovery risk',()=>{
 const f=matchFixture();beginSlide(f,{x:6});
 const firstSpeed=f.player.vx;
 for(let i=0;i<Math.ceil(c.slide.seconds/c.match.fixedStep)+2;i++)f.tick({kickHeld:true,moveX:1});
 assert.equal(f.events.filter(e=>e.type==='slide').length,1,'holding the button cannot retrigger a slide');
 assert.equal(f.events.some(e=>e.type==='slide-contact'),false);
 near(f.player.x,c.slide.distance,1e-8);assert.ok(firstSpeed>c.slide.distance/c.slide.seconds);
 assert.ok(f.player.recover>c.slide.recoverSeconds*.9,'a failed commitment keeps the player recovering');
 const before=f.player.x;f.tick({moveX:1});near(f.player.x,before);
 assert.equal(f.s.ball.owner,3,'a missed slide does not acquire possession');
});

test('real local slide wins at most once and ignores high balls and contacts after extension',()=>{
 const success=matchFixture();beginSlide(success,{x:.9});
 assert.equal(success.events.filter(e=>e.type==='slide-contact').length,1);assert.equal(success.s.ball.owner,0);
 for(let i=0;i<10;i++)success.tick({kickHeld:true});
 assert.equal(success.events.filter(e=>e.type==='slide-contact').length,1,'a slide has one contact attempt');
 const high=matchFixture();beginSlide(high,{x:6});
 Object.assign(high.s.ball,{owner:null,x:high.player.x+.7,z:0,y:2.5,vx:0,vz:0,vy:0});high.tick();
 assert.equal(high.events.some(e=>e.type==='slide-contact'),false);assert.equal(high.s.ball.owner,null);
 const late=matchFixture();beginSlide(late,{x:6});
 while(late.player.slideTime>c.slide.seconds*.16)late.tick();
 Object.assign(late.s.players[3],{x:late.player.x+.5,z:0});Object.assign(late.s.ball,{x:late.player.x+.5,z:0});late.tick();
 assert.equal(late.events.some(e=>e.type==='slide-contact'),false,'body overlap after extension is not an extra tackle window');
});

test('real fast-ball swept slide deflects at actual contact without granting remote possession',()=>{
 const f=matchFixture();beginSlide(f,{x:6});
 // It crosses a metre-wide reach in a single fixed tick. Its contact point is
 // behind the tackler by the end of that tick, so the result must be a block.
 Object.assign(f.s.ball,{owner:null,x:f.player.x-3,z:0,y:c.physics.ballRadius,vx:360,vz:0,vy:0,grace:0,lastTeam:1,lastPlayer:3});
 f.tick();
 const contact=f.events.find(e=>e.type==='slide-contact');assert.ok(contact?.won);
 assert.equal(f.s.ball.owner,null,'a historical contact cannot attach the ball to a distant current foot');
 assert.equal(f.s.ball.lastPlayer,f.player.id);assert.ok(f.s.ball.vx>0&&f.s.ball.vx<10,'the real collision produces a bounded block');
 assert.ok(Math.hypot(f.s.ball.x-f.player.x,f.s.ball.z-f.player.z)<=c.slide.reach+.2,'the deflection starts at swept contact');
});
