import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';
const full=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8'));
const cfg=full.minigames.streetSlam;
const input=(o={})=>({...NO_INPUT,move:{x:0,z:0},...o});
function setup(seed=811){
 const config=structuredClone(cfg),clubs=matchTeams(config,initialHoops(config),{stage:1});
 const e=createHoopsEngine({config,seed,teams:clubs.teams,userTeam:0,profile:'quick',difficulty:'easy'});
 const s=e.debug.state,a=e.debug.api;s.phase='live';s.phaseT=0;s.clock=80;s.shotClock=24;
 const mine=a.onCourt(0);
 for(const [i,p] of a.all().entries()){e.debug.place(p.id,-11+(i%5)*4,i<5?-6:6);p.act=null;p.air=-1;p.think=1e6;p.goal=null;p.intent.speed=0;}
 e.debug.give(mine[0].id);s.controlled=mine[0].id;e.drainEvents();
 return {e,s,a,mine};
}
const me=(e,p)=>e.snapshot().players.find(q=>q.id===p.id);
test('dribble, stop, dribble input: no dribble state after the stop, the ball stays held',()=>{
 const {e,s,mine}=setup(),p=mine[0];
 for(let i=0;i<30;i++)e.step(input({move:{x:1,z:0}}));
 assert.equal(me(e,p).dribbling,true);
 for(let i=0;i<3;i++)e.step(input({fakePress:true}));
 for(let i=0;i<60;i++)e.step(input());
 assert.equal(me(e,p).dribbling,false);
 const t0=s.ball.dribbleT;
 for(let i=0;i<60;i++){e.step(input());assert.equal(me(e,p).dribbling,false);}
 assert.equal(s.ball.dribbleT,t0,'dribble clock frozen while the dribble is dead');
 e.step(input({movePress:true}));e.drainEvents();
 assert.ok(s.lastViolation&&s.lastViolation.kind==='doubleDribble');
});
test('dead dribble resets only when the ball is released (pickup by another player)',()=>{
 const {e,a,mine}=setup(),p=mine[0],q=mine[1];
 for(let i=0;i<3;i++)e.step(input({fakePress:true}));
 assert.ok(p.dead);
 e.debug.give(q.id);
 assert.equal(q.dead,false);assert.equal(p.dead,false);
});
test('view and session do not animate a dribble for a dead dribble',async()=>{
 const v=await readFile(new URL('../workout/island/minigames/hoops-view.mjs',import.meta.url),'utf8');
 const ss=await readFile(new URL('../workout/island/minigames/hoops-session.mjs',import.meta.url),'utf8');
 assert.match(v,/dribbling:s\.phase==='live'&&p\.dribbling!==false/);
 assert.match(v,/handler\.dribbling===false/);
 assert.match(ss,/holder\.dribbling!==false/);
});

function passRun(kind,{faceAway=false}={}){
 const {e,s,a,mine}=setup(823),p=mine[0],q=mine[1];
 e.debug.place(p.id,-1.5,0);e.debug.place(q.id,4.2,1.2);
 for(const o of a.onCourt(1))e.debug.place(o.id,-12,-6+o.id.length%3);
 assert.ok(a.startPass(p,q,kind));
 const ys=[],faces=[];let released=null,bounces=0,caught=false;
 for(let i=0;i<120&&!caught;i++){
  e.step(input(faceAway?{move:{x:-1,z:0}}:{}));
  for(const ev of e.drainEvents()){if(ev.type==='pass')released={face:p.face,y:s.ball.y,kind:ev.kind};if(ev.type==='bounce')bounces++;if(ev.type==='catch')caught=true;}
  if(s.ball.state==='pass')ys.push(s.ball.y);
 }
 return {released,ys,bounces,caught,p,q,s};
}
test('chest pass: flat, from the chest, caught; overhead pass: high arc from above the head',()=>{
 const c=passRun('chest'),l=passRun('lob');
 assert.ok(c.caught&&l.caught);
 assert.ok(c.released.y>1.2&&c.released.y<1.45);
 assert.ok(l.released.y>2.0);
 assert.ok(Math.max(...l.ys)>Math.max(...c.ys)+1,'overhead apex clearly above the chest pass');
 assert.ok(Math.max(...c.ys)<1.8,'chest pass stays flat');
});
test('bounce pass hits the floor once on the way and arrives at waist height',()=>{
 const b=passRun('bounce');
 assert.equal(b.bounces,1);assert.ok(b.caught);
 assert.ok(Math.min(...b.ys)<0.2,'the ball reaches the floor');assert.ok(b.released.y<1.1);
});
test('jump pass: the passer leaves the floor and the ball is thrown from above chest height',()=>{
 const j=passRun('jump');
 assert.ok(j.caught);assert.ok(j.released.y>1.8,'released '+j.released.y);
});
test('the passer is turned to the receiver when the ball leaves, even with the stick pushed the other way',()=>{
 const r=passRun('chest',{faceAway:true}),want=Math.atan2(r.q.x-r.p.x,r.q.z-r.p.z);
 const d=Math.abs(((want-r.released.face+Math.PI*3)%(Math.PI*2))-Math.PI);
 assert.ok(d<0.45,'angle error '+d);
});
test('a pass is chosen by the situation: a defender on the passer gives a jump pass, a far target an overhead lob',()=>{
 const {e,a,mine}=setup(827),p=mine[0],q=mine[1];
 e.debug.place(p.id,0,0);e.debug.place(q.id,5,0);
 const d=a.onCourt(1)[0];e.debug.place(d.id,1.0,0.1);
 assert.ok(a.startPass(p,q));
 assert.equal(p.act2.kind,'jump');
 const far=setup(829);far.e.debug.place(far.mine[0].id,-8,0);far.e.debug.place(far.mine[1].id,6,0);
 assert.ok(far.a.startPass(far.mine[0],far.mine[1]));assert.equal(far.mine[0].act2.kind,'lob');
});
