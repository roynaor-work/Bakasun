import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer,canHead} from '../workout/island/minigames/soccer.mjs';
import {restartActionProfile,restartBallPose} from '../workout/island/minigames/soccer-restarts.mjs';
import {crossArc,soccerShotIcon,playerAnimation} from '../workout/island/minigames/soccer-presentation.mjs';
import {createG3hAudio,soccerAudioCues} from '../workout/island/minigames/g3h-audio.mjs';
const c=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames.soccer,dt=c.match.fixedStep;
const advance=(g,seconds,input={})=>{for(let i=0;i<Math.round(seconds/dt);i++)g.update(dt,input);};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function finishRestart(g,input={}){
 const s=g.getState(),r={...s.restart},taker=s.players[r.player],budget=Math.max(r.walkSeconds??c.restarts.walkSeconds,r.organizeSeconds||0)+c.match.restartSeconds+Math.max(c.restarts.idleReleaseSeconds,c.restarts.aiReleaseSeconds)+restartActionProfile(r.type).contact+2*dt;
 let elapsed=0,previous={x:taker.x,z:taker.z};
 while(s.phase.startsWith('restart')&&elapsed<budget){
  assert.equal(s.restart.player,r.player,'restart reserves one taker throughout the walk');g.update(dt,input);elapsed+=dt;
  assert.ok(distance(previous,taker)<=c.players.speed*1.15*dt+1e-6,'taker walks continuously at bounded speed');previous={x:taker.x,z:taker.z};
  if(s.phase.startsWith('restart')){assert.equal(s.ball.owner,taker.id);if(r.type==='throwIn'&&taker.restartMotion){const pose=restartBallPose('throwIn',taker.restartMotion.elapsed);near(s.ball.x,taker.x+taker.fx*pose.forward-taker.fz*pose.side);near(s.ball.z,taker.z+taker.fz*pose.forward+taker.fx*pose.side);near(s.ball.y,pose.height);}else{near(s.ball.x,r.x);near(s.ball.z,r.z);}}
 }
 assert.equal(s.phase,'playing','a completed walk eventually releases without waiting forever');return elapsed;
}
function setup(){
 const g=createSoccer({config:c,seed:81}),s=g.getState();
 for(const p of s.players)Object.assign(p,{x:p.team?14:-14,z:p.id%2?8:-8,vx:0,vz:0,recover:100,cooldown:100,think:100});
 Object.assign(s.players[0],{x:-5,z:0,fx:1,fz:0,recover:0,cooldown:0});
 Object.assign(s.players[1],{x:6,z:1,recover:0,cooldown:0});
 Object.assign(s.ball,{owner:0,x:-5+c.physics.dribbleOffset,z:0,grace:100});return g;
}
for(const seconds of [.1,.45,.9])test(`G3j pass held ${seconds}s: short pass or exact dotted cross preview`,()=>{
 const g=setup(),s=g.getState();advance(g,seconds,{passHeld:true,passAim:{x:1,z:0,manual:false}});
 const arc=crossArc(s,c);assert.equal(Boolean(arc),seconds>=c.passing.loftThresholdSeconds);
 g.update(dt,{passAim:{x:1,z:0,manual:false}});
 assert.equal(s.event.type,arc?'loft':'pass');assert.equal(s.ball.owner,null);
 if(s.event.target===null)assert.equal(s.controlled,0,'open-space pass keeps a valid field selection');else assert.equal(s.controlled,s.event.target);
 if(arc){near(s.ball.flight.x,arc.x);near(s.ball.flight.z,arc.z);near(s.ball.flight.height,arc.height);}
});
for(const aimed of [false,true])test(`G3j head button strikes immediately ${aimed?'along joystick':'towards goal'}`,()=>{
 const g=setup(),s=g.getState(),p=s.players[0];p.fx=0;p.fz=-1;
 Object.assign(s.ball,{owner:null,x:p.x+.3,z:0,y:1.8,vx:0,vz:0,vy:0,lastTeam:1});
 assert.ok(canHead(p,s.ball,c));assert.equal(soccerShotIcon(s,c),'header');
 g.update(dt,{kickHeld:true,...(aimed?{moveZ:1}:{})});
 assert.equal(s.event.type,'header');assert.ok(p.headerTime>0);assert.equal(s.ball.owner,null);assert.equal(s.ball.flight,null);
 if(aimed){near(s.ball.vx,0);assert.ok(s.ball.vz>0);}else{assert.ok(s.ball.vx>0);near(s.ball.vz,0);}
 assert.equal(playerAnimation(p,s,c).mode,'header');
});
test('G3j unattended cross receiver in the box heads automatically',()=>{
 const g=setup(),s=g.getState(),p=s.players[1],x=c.pitch.length/2-3;Object.assign(p,{x,z:0});s.controlled=1;
 Object.assign(s.ball,{owner:null,x:x-.5,z:0,y:2,vx:1,vz:0,vy:-1,lastTeam:0,lastPlayer:0,flight:{fromX:x-7,fromZ:0,x,z:0,age:.8,duration:1,height:3}});
 s.passTarget={player:1,x,z:0,time:1,kind:'loft'};
 for(let i=0;i<20&&!g.drainEvents().some(e=>e.type==='header');i++)g.update(dt);
 assert.ok(p.headerTime>0);assert.equal(s.ball.lastPlayer,1);assert.equal(s.ball.flight,null);assert.ok(s.ball.vx>0);
});
for(const end of [-1,1])for(const side of [-1,1])for(const dir of [-1,1])test(`G3j goal kick from five-metre line: end ${end}, exit side ${side}, direction ${dir}`,()=>{
 const g=setup(),s=g.getState();s.attackDir=dir;
 Object.assign(s.ball,{owner:null,x:end*(c.pitch.length/2-.05),z:side*6,y:.22,vx:end*30,vz:0,vy:0,lastTeam:end*dir>0?0:1});g.update(dt);
 assert.equal(s.restart.type,'goalKick');near(s.ball.x,end*(c.pitch.length/2-c.pitch.goalAreaDepth));near(s.ball.z,side*c.pitch.goalAreaWidth/2);
 assert.equal(s.players[s.restart.player].role,'keeper');
});
for(const kind of ['throwIn','corner','goalKick'])for(const team of [0,1])test(`G3j ${kind}, team ${team}: reserved taker walks continuously while controlled and AI players move freely`,()=>{
 const g=setup(),s=g.getState();for(const p of s.players){p.recover=0;p.cooldown=0;}
 const end=team===0?-1:1;
 Object.assign(s.ball,{owner:null,x:kind==='throwIn'?0:end*(c.pitch.length/2-.05),z:kind==='throwIn'?c.pitch.width/2-.05:6,vx:kind==='throwIn'?0:end*30,vz:kind==='throwIn'?30:0,lastTeam:kind==='throwIn'?1-team:kind==='corner'?1-team:1-team});
 // A home corner is at the right goal; a home goal kick is at the left goal.
 if(kind==='corner'){s.ball.x=-s.ball.x;s.ball.vx=-s.ball.vx;}
 g.update(dt);assert.equal(s.restart.type,kind);assert.equal(s.restart.team,team);
 const taker=s.restart.player,controlled=s.controlled,before=s.players.map(p=>({x:p.x,z:p.z})),spot={x:s.ball.x,z:s.ball.z},stance={...s.restart.stance};
 let previous={...s.players[taker]};for(let i=0;i<Math.round(.5/dt);i++){g.update(dt,{moveX:1});assert.ok(distance(previous,s.players[taker])<=c.players.speed*1.15*dt+1e-6);previous={...s.players[taker]};}assert.ok(s.players[controlled].x>before[controlled].x+.1);
 assert.ok(s.players.some(p=>p.id!==taker&&p.id!==controlled&&Math.hypot(p.x-before[p.id].x,p.z-before[p.id].z)>.1));
 near(s.ball.x,spot.x);near(s.ball.z,spot.z);finishRestart(g);
 near(s.players[taker].x,stance.x);near(s.players[taker].z,stance.z);assert.ok(g.drainEvents().some(e=>['throw','pass','loft'].includes(e.type)));
});
test('G3j predictive defense chooses an eligible outfielder; directional manual switching holds through cooldown',()=>{
 const g=setup(),s=g.getState();Object.assign(s.players[0],{x:-8,z:0});Object.assign(s.players[1],{x:-3,z:0});Object.assign(s.players[6],{x:-5,z:0});Object.assign(s.players[2],{x:0,z:0});
 Object.assign(s.players[3],{x:0,z:0});Object.assign(s.ball,{owner:3,x:-c.physics.dribbleOffset,z:0,lastTeam:1,grace:100});
 for(const p of s.players){p.recover=0;p.cooldown=100;p.think=100;}
 advance(g,c.autoSwitchSeconds+.05);assert.equal(s.controlled,1);
 Object.assign(s.players[0],{x:-5,z:-4,vx:0,vz:0});Object.assign(s.players[6],{x:-5,z:4,vx:0,vz:0});Object.assign(s.players[1],{x:-2,z:0,vx:0,vz:0});
 g.update(dt,{switchPlayer:true,moveZ:1});assert.equal(s.controlled,6,'joystick chooses the upper field option among similar intercept distances');
 const cooldown=s.switchCooldown;assert.ok(cooldown>0);advance(g,Math.min(.3,cooldown*.7));assert.equal(s.controlled,6);assert.notEqual(s.controlled,2);
});
test('G3j a local ground pass transfers control on departure and no auto-switch steals receiver control',()=>{
 const g=setup(),s=g.getState();Object.assign(s.players[1],{x:1,z:.2});g.update(dt,{passPressed:true});const receiver=s.event.target;assert.equal(receiver,1,'receiver is within the bounded assistance cone and range');
 assert.equal(s.controlled,receiver);assert.equal(s.ball.owner,null);advance(g,.2);assert.equal(s.controlled,receiver);
});
test('G3j goal delivers whistle, net rustle and 2-second cheer through actual Web Audio sources',async()=>{
 const voices=[],param=()=>({value:0,setValueAtTime(){},setTargetAtTime(){},exponentialRampToValueAtTime(){}});
 class Audio{
  constructor(){this.sampleRate=8000;this.currentTime=10;this.state='running';this.destination={};}
  createGain(){return {gain:param(),connect(){},disconnect(){}};}
  createBiquadFilter(){return {frequency:param(),connect(){}};}
  createBuffer(ch,n,rate){return {duration:n/rate,getChannelData:()=>new Float32Array(n)};}
  createBufferSource(){const s={playbackRate:param(),connect(){},disconnect(){},start(at){voices.push({at,source:s});},stop(at){s.stopAt=at;}};return s;}
  async decodeAudioData(){return {duration:5};}async close(){}async resume(){}
 }
 const audio=createG3hAudio({AudioContext:Audio,storage:{getItem:()=>null},fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)})});await audio.unlock();await audio.ready;
 const g=setup(),s=g.getState();Object.assign(s.ball,{owner:null,x:c.pitch.length/2-.05,z:0,y:c.physics.ballRadius,vx:30,vz:0,vy:0,lastTeam:0,lastPlayer:0});g.update(dt);
 const goal=g.drainEvents().find(e=>e.type==='goal');assert.ok(goal);assert.deepEqual(soccerAudioCues(goal),['whistle','net','cheer']);audio.event(goal);
 assert.deepEqual(audio.snapshot.counts,{whistle:1,net:1,cheer:1});assert.equal(voices.length,4);near(voices.at(-1).source.stopAt-voices.at(-1).at,2.08);
 assert.equal(playerAnimation(s.players[goal.player],s,c).mode,'celebrate');
 assert.deepEqual(soccerAudioCues({type:'restart',restart:'throwIn'}),['whistle']);audio.dispose();
});

for(const kind of ['goalKick','corner'])test(`G3j ${kind} automatic aim belongs to the taker, independent of the controlled teammate`,()=>{
 const g=setup(),s=g.getState(),side=kind==='corner'?1:-1;
 Object.assign(s.ball,{owner:null,x:side*(c.pitch.length/2-.05),z:6,vx:side*30,vz:0,vy:0,lastTeam:1});g.update(dt);assert.equal(s.restart.type,kind);
 finishRestart(g,{passAim:{x:1,z:0,manual:false}});
 if(kind==='goalKick')assert.ok(s.ball.vx>0);else{assert.ok(s.ball.flight);assert.ok(s.ball.flight.x<c.pitch.length/2);assert.ok(Math.abs(s.ball.flight.z)<c.pitch.width/2);}
});
