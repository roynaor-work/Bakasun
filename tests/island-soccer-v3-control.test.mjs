import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {goalFrameContact,pitchCrossing} from '../workout/island/minigames/soccer-boundary.mjs';
import {chooseSlideKind,slideVariant,slideVelocityScale,sweptSlideContact,slideRecoverySeconds,SLIDE_KINDS} from '../workout/island/minigames/soccer-control-depth.mjs';
import {selectControlledPlayer,followDribbleBall} from '../workout/island/minigames/soccer-assistance.mjs';
import {rollBall} from '../workout/island/minigames/soccer-physics.mjs';

const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const dt=c.match.fixedStep,hx=c.pitch.length/2;
function fixture(direction=1,seed=19){
 const game=createSoccer({config:c,stage:1,difficulty:'normal',seed,random:()=>0}),s=game.getState();
 game.clearInput();s.attackDir=direction;s.controlled=0;s.switchCooldown=100;s.passTarget=null;
 for(const p of s.players)Object.assign(p,{x:p.team===0?-10:10,z:(p.id%3-1)*7,recover:100,cooldown:100,vx:0,vz:0,slideTime:0,hands:false});
 Object.assign(s.ball,{owner:null,y:c.physics.ballRadius,vx:0,vy:0,vz:0,curve:0,flight:null,thrower:null,grace:100,lastTeam:1,lastPlayer:3});
 const player=s.players[0];Object.assign(player,{recover:0,cooldown:0});
 const tick=(input={})=>{game.update(dt,input);return game.drainEvents();};
 return {game,s,player,tick};
}
function placeSlide(f,{x,z,ballX,ballZ,ballVX,side=1,kind='straight'}){
 const v=slideVariant(c,kind);
 Object.assign(f.player,{x,z,fx:0,fz:-side,slideX:0,slideZ:-side,slideKind:kind,slideTime:v.seconds,slideAttempted:false,slideWon:false,slideBehind:false,slideLate:false});
 Object.assign(f.s.ball,{x:ballX,z:ballZ,vx:ballVX});
}
function firstTickGeometry(f){
 const ballFrom={...f.s.ball},ballTo={...ballFrom};rollBall(ballTo,dt,c);
 const p=f.player,v=slideVariant(c,p.slideKind),speed=v.distance/v.seconds*slideVelocityScale(v.seconds-dt*.5,v.seconds);
 const endpoint={x:p.x+p.slideX*speed*dt,z:p.z+p.slideZ*speed*dt};
 return {ballFrom,ballTo,frame:goalFrameContact(ballFrom,ballTo,c),crossing:pitchCrossing(ballFrom,ballTo,c),slide:sweptSlideContact(p,endpoint,ballFrom,ballTo,c,v,{elapsed:0,dt})};
}

test('v3 control: three authored slide variants are chosen from visible speed and direction only',()=>{
 const still={vx:0,vz:0,fx:1,fz:0};
 assert.equal(chooseSlideKind(still,{x:1,z:0},c),'straight');
 assert.equal(chooseSlideKind({vx:c.players.speed*1.4,vz:0,fx:1,fz:0},{x:1,z:0},c),'fast','a sprinting tackler along its own direction');
 assert.equal(chooseSlideKind({vx:c.players.speed*.9,vz:0,fx:1,fz:0},{x:1,z:0},c),'straight','a jogging tackler is not fast');
 assert.equal(chooseSlideKind({vx:4,vz:0,fx:1,fz:0},{x:0,z:1},c),'lateral','a slide across the running direction');
 assert.equal(chooseSlideKind(still,{x:0,z:1},c),'lateral','a standing tackler sliding sideways to its facing');
 for(const kind of SLIDE_KINDS){const v=slideVariant(c,kind);assert.equal(v.kind,kind);assert.ok(v.seconds>0&&v.distance>0&&v.reach>0&&v.recoverSeconds>0);}
 assert.equal(slideVariant(c,'nonsense').kind,'straight');
 const fast=slideVariant(c,'fast'),straight=slideVariant(c,'straight');
 assert.ok(fast.distance>straight.distance&&fast.seconds<straight.seconds,'fast covers more ground in less time');
 assert.ok(slideVariant(c,'lateral').reach>straight.reach,'the lateral slide reaches across');
 // The velocity curve integrates to the configured distance.
 for(const kind of SLIDE_KINDS){const v=slideVariant(c,kind);let covered=0;for(let t=0;t<v.seconds-1e-9;t+=dt){const d=Math.min(dt,v.seconds-t);covered+=v.distance/v.seconds*slideVelocityScale(v.seconds-t-d*.5,v.seconds)*d;}assert.ok(Math.abs(covered-v.distance)<.03,`${kind}: ${covered} vs ${v.distance}`);}
 assert.ok(slideRecoverySeconds(straight,{won:true})<slideRecoverySeconds(straight,{won:false})&&slideRecoverySeconds(straight,{won:false,behind:true,late:true})>slideRecoverySeconds(straight,{won:false}));
});

test('v3 control: the real match applies the variant on the slide button and recovers by outcome',()=>{
 for(const kind of SLIDE_KINDS){
  const f=fixture();const owner=f.s.players[3];Object.assign(owner,{x:2,z:0,fx:-1,fz:0,recover:0,cooldown:0});Object.assign(f.s.ball,{owner:3,x:1.5,z:0,grace:0});
  const speed=kind==='fast'?c.players.speed*1.4:kind==='lateral'?4:0;
  Object.assign(f.player,{x:-3,z:kind==='lateral'?0:0,vx:kind==='lateral'?0:speed,vz:kind==='lateral'?speed:0,fx:kind==='lateral'?0:1,fz:kind==='lateral'?1:0});
  f.s.switchCooldown=100;
  const events=f.tick({moveX:1,moveZ:0,kickHeld:true}),slide=events.find(e=>e.type==='slide');
  assert.ok(slide,`${kind}: the shot button slides in defence`);assert.equal(slide.kind,kind);
  assert.equal(f.player.slideKind,kind);assert.ok(Math.abs(f.player.slideTime-(slideVariant(c,kind).seconds-dt))<1e-9);
  let guard=0;while(f.player.slideTime>0&&guard++<100)f.tick({kickHeld:false});
  assert.ok(f.player.recover>0,'recovery follows the slide');
  const won=f.player.slideWon,expected=slideRecoverySeconds(slideVariant(c,kind),{won,behind:f.player.slideBehind,late:f.player.slideLate});
  assert.ok(Math.abs(f.player.recover-expected)<1e-9,`${kind}: recovery matches the outcome (${f.player.recover} vs ${expected})`);
 }
});

test('v3 control: an earlier goal-post collision wins over a later swept tackle at either end and post',()=>{
 for(const direction of [-1,1])for(const side of [-1,1]){
  const f=fixture(direction);
  placeSlide(f,{x:(hx-.35)*direction,z:3.71*side,ballX:(hx-.2)*direction,ballZ:2.7*side,ballVX:12.6*direction,side});
  const geometry=firstTickGeometry(f);
  assert.ok(geometry.frame&&geometry.slide,'the fixture contains both possible contacts in the same fixed tick');
  assert.ok(geometry.frame.time<geometry.slide.time);assert.equal(geometry.crossing,null);
  const events=f.tick();
  assert.equal(events.filter(e=>e.type==='post').length,1);
  assert.equal(events.some(e=>e.type==='slide-contact'),false,'the tackler cannot win through a post that already changed the ball path');
  assert.equal(f.player.slideAttempted,false);assert.equal(f.s.ball.owner,null);assert.ok(f.s.ball.vx*direction<0);
 }
});

test('v3 control: a clean local slide before the pending post collision wins the ball at real contact',()=>{
 for(const direction of [-1,1])for(const side of [-1,1]){
  const f=fixture(direction);
  placeSlide(f,{x:(hx-.35)*direction,z:3.6*side,ballX:(hx-.31)*direction,ballZ:2.7*side,ballVX:12.6*direction,side});
  const geometry=firstTickGeometry(f);assert.ok(geometry.frame&&geometry.slide);assert.ok(geometry.slide.time<geometry.frame.time);
  const events=f.tick(),contacts=events.filter(e=>e.type==='slide-contact');
  assert.equal(contacts.length,1);assert.equal(contacts[0].won,true);assert.equal(contacts[0].kind,'straight');
  assert.equal(f.s.ball.owner,f.player.id);assert.equal(events.some(e=>e.type==='post'),false);
  assert.ok(f.s.ball.x*direction<hx-c.physics.ballRadius-c.pitch.postRadius);
 }
});

test('v3 control: a swept slide reaches a ball that crosses its path mid-tick, a high ball and the extended phase cannot be won',()=>{
 const v=slideVariant(c,'straight');
 const from={x:0,z:0},to={x:0,z:-.3};
 const hit=sweptSlideContact(from,to,{x:1.6,z:-.15,y:.11},{x:-1.6,z:-.15,y:.11},c,v,{elapsed:0,dt});
 assert.ok(hit&&hit.time>0&&hit.time<1&&!hit.late&&!hit.behind,'a fast ball crossing the sliding foot inside the tick');
 assert.equal(sweptSlideContact(from,to,{x:.2,z:-.1,y:1.6},{x:.2,z:-.1,y:1.6},c,v,{elapsed:0,dt}),null,'a high ball is not won by the body');
 assert.equal(sweptSlideContact(from,to,{x:.2,z:-.1,y:.11},{x:.2,z:-.1,y:.11},c,v,{elapsed:v.seconds*.9,dt}),null,'after the extended-foot phase');
 const late=sweptSlideContact(from,to,{x:.2,z:-.1,y:.11},{x:.2,z:-.1,y:.11},c,v,{elapsed:v.seconds*.7,dt});
 assert.ok(late&&late.late&&late.risk>0,'a late contact carries risk');
 const behind=sweptSlideContact(from,to,{x:.2,z:-.1,y:.11},{x:.2,z:-.1,y:.11},c,v,{elapsed:0,dt,owner:{x:.2,z:-.1,fx:0,fz:-1}});
 assert.ok(behind&&behind.behind&&behind.risk>late.risk,'a tackle from behind is the riskiest');
 assert.equal(sweptSlideContact(from,to,{x:NaN,z:0,y:.11},{x:0,z:0,y:.11},c,v,{elapsed:0,dt}),null);
});

test('v3 control: automatic selection follows the ball path and the stick intent, including a loose ball',()=>{
 const game=createSoccer({config:c,seed:5,stage:1,difficulty:'normal'}),s=game.getState();game.clearInput();
 for(const p of s.players)Object.assign(p,{x:p.team===0?-8:8,z:(p.id%3-1)*6,vx:0,vz:0,recover:0,slideTime:0});
 const a=s.players[0],b=s.players[1];Object.assign(a,{x:-2,z:0});Object.assign(b,{x:6,z:4});
 // A fast ball leaving the current player toward a team-mate further along its path.
 Object.assign(s.ball,{owner:null,x:0,z:1,vx:14,vz:4,vy:0,y:c.physics.ballRadius,flight:null,lastTeam:1});s.controlled=0;s.switchCooldown=0;s.passTarget=null;
 assert.equal(selectControlledPlayer(s,c,{path:true}),1,'the runner where the ball will be, not the player nearest its present spot');
 Object.assign(s.ball,{vx:-14,vz:0});assert.equal(selectControlledPlayer(s,c,{path:true}),0,'an incoming ball keeps the near player');
 const left=s.players.find(p=>p.team===0&&p.id!==0&&p.id!==1&&p.role!=='keeper');Object.assign(left,{x:-2,z:-6});Object.assign(b,{x:-2,z:6});Object.assign(a,{x:-9,z:0});
 Object.assign(s.ball,{x:-2,z:0,vx:0,vz:0});
 assert.equal(selectControlledPlayer(s,c,{manual:true,moveX:0,moveZ:1}),b.id,'the stick picks the candidate in its direction');
 assert.equal(selectControlledPlayer(s,c,{manual:true,moveX:0,moveZ:-1}),left.id);
 // In the running match a loose ball rolling to a team-mate transfers selection without input, after the stable interval.
 const match=createSoccer({config:c,seed:7,stage:1,difficulty:'normal'}),m=match.getState();match.clearInput();
 for(const p of m.players)Object.assign(p,{x:p.team===0?-10:12,z:(p.id%3-1)*6,vx:0,vz:0,recover:0,slideTime:0,cooldown:100});
 Object.assign(m.players[0],{x:-14,z:0});Object.assign(m.players[1],{x:-2,z:0,cooldown:0});
 Object.assign(m.ball,{owner:null,x:-9,z:0,vx:10,vz:0,vy:0,y:c.physics.ballRadius,flight:null,lastTeam:1,grace:100});m.controlled=0;m.switchCooldown=0;m.passTarget=null;
 for(let i=0;i<Math.ceil(c.autoSwitchSeconds/dt)*2+12;i++)match.update(dt,{moveX:.3,moveZ:0});
 assert.equal(m.controlled,1,'selection moved to the player who will meet the loose ball');
 const idle=createSoccer({config:c,seed:7,stage:1,difficulty:'normal'}),q=idle.getState();idle.clearInput();
 for(const p of q.players)Object.assign(p,{x:p.team===0?-10:12,z:(p.id%3-1)*6,vx:0,vz:0,recover:0,slideTime:0,cooldown:100});
 Object.assign(q.players[0],{x:-14,z:0});Object.assign(q.players[1],{x:-2,z:0,cooldown:0});
 Object.assign(q.ball,{owner:null,x:-9,z:0,vx:10,vz:0,vy:0,y:c.physics.ballRadius,flight:null,lastTeam:1,grace:100});q.controlled=0;q.switchCooldown=0;q.passTarget=null;
 for(let i=0;i<Math.ceil(c.autoSwitchSeconds/dt)*2+12&&q.ball.owner===null;i++){idle.update(dt,{});if(q.ball.owner===null)assert.equal(q.controlled,0,'an idle child keeps the original defence-only automatic switching');}
});

test('v3 control: a sprinting dribbler pushes the ball a little further ahead, inside the heavy-touch release',()=>{
 const slow={id:0,x:0,z:0,vx:1,vz:0,fx:1,fz:0,hands:false},fast={...slow,vx:c.players.speed*1.4};
 const ball={x:.45,z:0,y:c.physics.ballRadius,vx:0,vz:0,vy:0,owner:0};
 let a={...ball},b={...ball};for(let i=0;i<30;i++){a={...a,...followDribbleBall(slow,a,dt,c,{sprintLead:true})};b={...b,...followDribbleBall(fast,b,dt,c,{sprintLead:true})};slow.x+=slow.vx*dt;fast.x+=fast.vx*dt;}
 const slowLead=a.x-slow.x,fastLead=b.x-fast.x;
 assert.ok(fastLead>slowLead+.08,`sprint lead ${fastLead.toFixed(2)} > walk lead ${slowLead.toFixed(2)}`);
 assert.ok(fastLead<c.assistance.dribble.releaseDistance,'still owned');assert.equal(b.owner,0);
 const ai={...ball};let d={...ai};for(let i=0;i<30;i++)d={...d,...followDribbleBall(fast,d,dt,c)};
 assert.ok(d.x-fast.x<fastLead-.08,'without the sprint lead the same runner keeps the tuned close touch');
});
