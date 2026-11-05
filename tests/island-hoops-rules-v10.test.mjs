import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';
import {createHoopsAudio} from '../workout/island/minigames/hoops-audio.mjs';
import {measure} from '../workout/island/verification/hoops-rules-v10/measure.mjs';
const full=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8'));
const cfg=full.minigames.streetSlam;
const input=(o={})=>({...NO_INPUT,move:{x:0,z:0},...o});
function setup(seed=719){
 const config=structuredClone(cfg),clubs=matchTeams(config,initialHoops(config),{stage:1});
 const e=createHoopsEngine({config,seed,teams:clubs.teams,userTeam:0,profile:'quick',difficulty:'easy'});
 const s=e.debug.state,a=e.debug.api;s.phase='live';s.phaseT=0;s.clock=80;s.shotClock=24;
 const mine=a.onCourt(0),theirs=a.onCourt(1);
 for(const [i,p] of a.all().entries()){e.debug.place(p.id,-11+(i%5)*4,i<5?-6:6);p.act=null;p.air=-1;p.think=1e6;p.goal=null;p.intent.speed=0;}
 e.debug.give(mine[0].id);s.controlled=mine[0].id;e.drainEvents();
 return {e,s,a,mine,theirs};
}
function ticks(e,n,inp=input()){const ev=[];for(let i=0;i<n;i++){e.step(inp);ev.push(...e.drainEvents());}return ev;}
const kinds=ev=>ev.filter(x=>x.type==='violation').map(x=>x.kind);

test('a fake ends the dribble: the ball is held, no dribble button, no cross move',()=>{
 const {e,mine}=setup(),p=mine[0];
 assert.equal(e.snapshot().players.find(q=>q.id===p.id).dribbling,true);
 const ev=ticks(e,3,input({fakePress:true}));
 assert.ok(ev.some(x=>x.type==='gather'));
 assert.equal(e.snapshot().players.find(q=>q.id===p.id).dribbling,false);
 assert.equal(e.debug.api.startMove(p,'cross'),false);
});

test('dribbling again after the dribble ended is a double dribble: turnover and a call',()=>{
 const {e,s,mine}=setup(),p=mine[0];
 ticks(e,3,input({fakePress:true}));ticks(e,40);
 assert.ok(p.dead);
 const ev=ticks(e,2,input({movePress:true}));
 assert.deepEqual(kinds(ev),['doubleDribble']);
 assert.equal(s.lastViolation.team,0);
});

test('without a dribble: two steps are legal, the third is travelling',()=>{
 const {e,s,mine}=setup(),p=mine[0];
 ticks(e,3,input({fakePress:true}));ticks(e,40);
 const steps=[],all=[];
 for(let i=0;i<400&&!kinds(all).length;i++){e.step(input({move:{x:1,z:0}}));const ev=e.drainEvents();all.push(...ev);for(const x of ev)if(x.type==='step')steps.push(x.n);}
 assert.deepEqual(steps.slice(0,3),[1,2,3]);
 assert.deepEqual(kinds(all),['travel']);
 assert.ok(s.lastViolation&&s.lastViolation.kind==='travel');
});

test('standing still or pivoting without a dribble is free; two steps then a shot is legal',()=>{
 const {e,mine}=setup(),p=mine[0];
 ticks(e,3,input({fakePress:true}));
 assert.deepEqual(kinds(ticks(e,200)),[]);
 // walk about two steps then shoot: no violation while the shot is in motion
 const all=[];
 for(let i=0;i<14;i++){e.step(input({move:{x:1,z:0}}));all.push(...e.drainEvents());}
 assert.ok(p.steps<=2,'steps '+p.steps);
 all.push(...ticks(e,60,input({shootDown:true})));
 assert.deepEqual(kinds(all),[]);
});

test('the dribble returns after the ball is released (pass) and caught',()=>{
 const {e,mine}=setup(),p=mine[0],q=mine[1];
 ticks(e,3,input({fakePress:true}));ticks(e,60);e.debug.place(q.id,-6,0);
 e.debug.api.startPass(p,q,'chest');ticks(e,120);
 assert.equal(e.debug.api.holder()?.id,q.id);
 assert.equal(q.dead,false);assert.equal(p.dead,false);
});

test('AI handler with a dead dribble shoots or passes instead of walking',()=>{
 const {e,a,mine}=setup(),p=mine[0];
 e.debug.state.autopilot=true;p.think=0;e.debug.api.gatherBall(p);e.debug.place(p.id,-7,0);
 const all=ticks(e,180,NO_INPUT);
 assert.deepEqual(kinds(all).filter(k=>k==='travel'||k==='doubleDribble'),[]);
 assert.ok(all.some(x=>x.type==='shotStart'||x.type==='pass'));
});

test('AI offence: few purposeful passes, mostly forward, no collapse in shooting',{timeout:240000},async()=>{
 const m=await measure({games:12});
 assert.ok(m.passesPerPossession<=2.5,'passes per possession '+m.passesPerPossession);
 assert.ok(m.lateralPct<=30,'lateral/back share '+m.lateralPct);
 assert.ok(m.fgPct>=44,'fg% '+m.fgPct);
 assert.equal(m.turnovers.travel||0,0);assert.equal(m.turnovers.doubleDribble||0,0);
});

test('audio: no continuous loop or tone is active during normal play; whistle only on a call',async()=>{
 const mixText=await readFile(new URL('../workout/island/design/audio/mix.json',import.meta.url),'utf8');
 const nodes=[];let ctx;
 class Param{constructor(v=0){this.value=v;}cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
 class Node{constructor(kind){this.kind=kind;this.gain=new Param(1);this.frequency=new Param();this.Q=new Param();this.threshold=new Param();this.knee=new Param();this.ratio=new Param();this.attack=new Param();this.release=new Param();this.playbackRate=new Param(1);nodes.push(this);}connect(n){return n;}disconnect(){}start(){this.started=true;}stop(){this.stopped=true;setTimeout(()=>this.onended?.(),0);}}
 class Ctx{constructor(){ctx=this;this.state='running';this.currentTime=1;this.destination=new Node('dest');}
  createGain(){return new Node('gain');}createBiquadFilter(){return new Node('filter');}createDynamicsCompressor(){return new Node('comp');}
  createBufferSource(){return new Node('source');}createOscillator(){return new Node('osc');}
  async decodeAudioData(){return {duration:1};}resume(){return Promise.resolve();}suspend(){return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}}
 const fetcher=async url=>{const u=String(url);return u.endsWith('mix.json')?{ok:true,json:async()=>JSON.parse(mixText)}:{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};};
 const audio=createHoopsAudio({config:full.minigames.streetSlam.audio,storage:null,AudioContext:Ctx,fetcher});
 audio.unlock();await new Promise(r=>setTimeout(r,60));
 const active=()=>{const m=audio.metrics();return m;};
 await new Promise(r=>setTimeout(r,60));
 for(let i=0;i<30;i++){ctx.currentTime+=1;audio.dribble(2);}
 ctx.currentTime+=10;await new Promise(r=>setTimeout(r,30));
 const m=audio.metrics();
 assert.equal(m.loops,0,'no looping voice');assert.equal(m.bed,null);
 assert.equal(nodes.filter(n=>n.kind==='osc').length,0,'no oscillators');
 assert.equal(nodes.filter(n=>n.kind==='source'&&n.loop).length,0,'no looping source');
 assert.ok(!m.played.ambience,'ambience bed never started');
 for(const n of nodes)if(n.kind==='source')n.onended?.();
 audio.events([{type:'violation',kind:'travel'}]);
 assert.ok(audio.metrics().played.whistle>=1,'whistle plays on a call '+JSON.stringify(audio.metrics()));
 audio.dispose();
});
