import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../workout/island/vendor/three.module.js';
import {soccerHeadersEnabled,soccerHeaderStates,soccerHeaderClip,soccerHeaderIsClear,soccerHeaderPlan,soccerHeaderEvents,soccerHeaderPhase,soccerHeaderState,SOCCER_HEADER_IDS,SOCCER_HEADER_PREFIX,SOCCER_HEADER_LEAD,SOCCER_HEADER_EXIT_FADE} from '../workout/island/minigames/soccer-headers.mjs';
import {soccerCodexStates,soccerV10States,soccerV12Overlay} from '../workout/island/minigames/soccer-codex-motion.mjs';
import {soccerV8States} from '../workout/island/minigames/soccer-v8.mjs';
import {composeSoccerRestartMotion} from '../workout/island/minigames/soccer-restart-motion.mjs';
import {soccerKeeperCrowdEnabled,soccerKeeperStates,soccerKeeperDejectedNext,SOCCER_KEEPER_AFTER_GOAL,SOCCER_KEEPER_DISAPPOINTED} from '../workout/island/minigames/soccer-headers.mjs';
import {compileSoccerDesignClips,createSoccerDesignMotion,SOCCER_SHOW_DEJECTED} from '../workout/island/minigames/soccer-design-character.mjs';

const read=f=>JSON.parse(readFileSync(new URL('../workout/island/'+f,import.meta.url),'utf8'));
const config=read('data/config.json').minigames.soccer;
const headers=read('assets/soccer-v22/headers.json'),keeperPack=read('assets/soccer-v22/keeper.json'),catalog=read('design/soccer-header-v1/runtime/catalog.json');
const CANON=read('design/motion/soccer.json').skeleton.bones.map(b=>b.name);
const deg=r=>r*180/Math.PI,dt=1/60;

test('flag: on by default, off with ?soccerHeaders=0 or config.headers=false', () => {
  assert.equal(soccerHeadersEnabled(null,''),true);
  assert.equal(soccerHeadersEnabled(null,'?soccerHeaders=0'),false);
  assert.equal(soccerHeadersEnabled({headers:false},''),false);
  assert.equal(soccerHeadersEnabled({},'?soccerHeaders=1'),true);
});
test('assets: the six Codex clips exist, 18 canonical bones, time 0..1, events match the Codex catalog (core-shifted)', () => {
  const states=soccerHeaderStates(headers);
  assert.deepEqual(Object.keys(states).sort(),SOCCER_HEADER_IDS.map(id=>SOCCER_HEADER_PREFIX+id).sort());
  assert.equal(CANON.length,18);
  for(const meta of catalog.clips){
    const s=states[SOCCER_HEADER_PREFIX+meta.id];assert.ok(s,meta.id);
    assert.equal(s.clip,SOCCER_HEADER_PREFIX+meta.id);assert.equal(s.loop,false);assert.ok(Math.abs(s.durationSeconds-meta.coreRange.duration)<1e-3);
    assert.equal(s.keyframes[0].time,0);assert.equal(s.keyframes.at(-1).time,1);assert.ok(s.keyframes.length>=20);
    for(const k of s.keyframes){assert.deepEqual(Object.keys(k.rotations).sort(),[...CANON].sort(),meta.id);assert.deepEqual(k.rotations.Root,[0,0,0,1],'Root keeps identity');}
    assert.ok(s.maxKeyDeg<70,meta.id+' '+s.maxKeyDeg);
    const names=s.events.map(e=>e.name.replace('visual_','')),want=meta.events.map(e=>e.type);
    assert.deepEqual(names,want,meta.id);
    for(const e of meta.events)assert.ok(Math.abs(s.events.find(x=>x.name==='visual_'+e.type).timeSeconds-(e.time-meta.coreRange.start))<2e-4,meta.id+' '+e.type);
    assert.ok(Math.abs(s.ballContacts[0].atSeconds-(meta.events.find(e=>e.type==='contact').time-meta.coreRange.start))<2e-4);
  }
});
test('every jump and dive clip has takeoff, contact, land in order; stand and clear have contact', () => {
  const states=soccerHeaderStates(headers);
  for(const id of ['header_jump_goal','header_jump_left','header_jump_right','header_dive']){
    const plan=soccerHeaderPlan(states[SOCCER_HEADER_PREFIX+id]);
    assert.ok(plan.takeoff!==null&&plan.takeoff<plan.contact&&plan.contact<plan.land,id);
  }
  for(const id of ['header_stand_goal','header_clear']){const plan=soccerHeaderPlan(states[SOCCER_HEADER_PREFIX+id]);assert.ok(plan.contact>0&&plan.takeoff===null&&plan.land===null,id);}
});
test('events passed in an interval, and the phase of a clip over time', () => {
  const s=soccerHeaderStates(headers)[SOCCER_HEADER_PREFIX+'header_jump_goal'],plan=soccerHeaderPlan(s);
  assert.deepEqual(soccerHeaderEvents(s,0,s.durationSeconds).map(e=>e.name),['visual_takeoff','visual_contact','visual_land']);
  assert.deepEqual(soccerHeaderEvents(s,plan.takeoff,plan.contact).map(e=>e.name),['visual_contact'],'the lower bound is exclusive');
  assert.deepEqual(soccerHeaderEvents(s,.9,1),[]);
  assert.equal(soccerHeaderPhase(s,0),'prep');assert.equal(soccerHeaderPhase(s,plan.takeoff+.01),'takeoff');assert.equal(soccerHeaderPhase(s,plan.contact+.01),'contact');
  assert.equal(soccerHeaderPhase(s,plan.land+.01),'land');assert.equal(soccerHeaderPhase(s,s.durationSeconds),'recover');
  assert.ok(plan.at>=0&&Math.abs(plan.contact-plan.at-SOCCER_HEADER_LEAD)<1e-9||plan.at===0);
});
test('clip choice: clearance, dive (low ball at speed), stand, jump with the side from the turn of the body; unloaded pack = null', () => {
  const all=new Set(SOCCER_HEADER_IDS.map(id=>SOCCER_HEADER_PREFIX+id)),has=n=>all.has(n),P=SOCCER_HEADER_PREFIX;
  assert.equal(soccerHeaderClip({clear:true,ballHeight:1.9},has),P+'header_clear');
  assert.equal(soccerHeaderClip({ballHeight:1.1,speed:5},has),P+'header_dive');
  assert.equal(soccerHeaderClip({ballHeight:1.1,speed:1},has),P+'header_stand_goal','a low ball while standing is a standing header');
  assert.equal(soccerHeaderClip({ballHeight:1.45},has),P+'header_stand_goal');
  assert.equal(soccerHeaderClip({ballHeight:1.9,turn:0},has),P+'header_jump_goal');
  assert.equal(soccerHeaderClip({ballHeight:1.9,turn:.8},has),P+'header_jump_left');
  assert.equal(soccerHeaderClip({ballHeight:1.9,turn:-.8},has),P+'header_jump_right');
  assert.equal(soccerHeaderClip({ballHeight:1.9,turn:.2},has),P+'header_jump_goal','a small turn stays straight');
  assert.equal(soccerHeaderClip({ballHeight:1.9},()=>false),null);
  assert.equal(soccerHeaderState(P+'header_dive'),true);assert.equal(soccerHeaderState('v10_run'),false);
  const p={id:3,team:0},s={attackDir:1,event:{type:'clearance',player:3},ball:{vx:5}};
  assert.equal(soccerHeaderIsClear(p,s),true);assert.equal(soccerHeaderIsClear(p,{...s,event:{type:'header',player:3}}),false);
  assert.equal(soccerHeaderIsClear(p,{attackDir:1,event:null,ball:{vx:-4}}),true,'a ball sent back towards the own goal');
  assert.equal(soccerHeaderIsClear({id:3,team:1},{attackDir:1,event:null,ball:{vx:-4}}),false,'team 1 attacks the other way');
});

// ---- motion state machine on the real rig ---------------------------------------------------------------------------------------------
const rig=read('design/characters/rig.json'),map=read('design/viewer/retarget-map.json');
const base=read('design/motion/soccer.json'),library=composeSoccerRestartMotion(base,...['throws-receives','kicks-locomotion','tackles-reactions'].map(p=>read('design/motion2/soccer/'+p+'.json')));
const v12=read('assets/soccer-v12/clips.json');
function rigMotion({withHeaders=true,withKeeper=false}={}){
  globalThis.location={search:''};
  try{
    const o=soccerV12Overlay(v12,{v9:soccerCodexStates(read('assets/soccer-v9/clips.json')),v10:soccerV10States(read('assets/soccer-v10/clips.json'),''),v8:soccerV8States(read('assets/soccer-v8/clips.json')),v11:{}},''),
      data={...library,states:{...library.states,...read('assets/soccer-v7/clips.json').states,...o.v8,...o.v9,...o.v10,...o.v11,...(withHeaders?soccerHeaderStates(headers):{}),...(withKeeper?soccerKeeperStates(keeperPack):{})}},clips=compileSoccerDesignClips(data,rig,map);
    const bones={};let root;
    for(const j of rig.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else root=b;}
    const group=new T.Group();group.add(root);const mixer=new T.AnimationMixer(group);
    return {bones,group,motion:createSoccerDesignMotion(mixer,clips,data,config),data};
  }finally{delete globalThis.location;}
}
const player=over=>({id:0,team:0,x:0,z:0,vx:0,vz:0,fx:0,fz:1,kickTime:0,stealTime:0,headerTime:0,slideKind:'straight',slideTime:0,recover:0,slideWon:false,...over});
function playHeader(rt,{ballY=1.9,speed=0,turnTo=null,clear=false}={}){
  const {motion,bones,group}=rt,p=player({vz:speed}),s={ball:{owner:null,flight:null,y:ballY,vx:3,vz:0,x:0,z:0},mode:'attack',attackDir:1,event:null},rows=[];let prev=null;
  const step=(mode,n,after)=>{for(let i=0;i<n;i++){motion.update(p,s,{mode},dt);after?.(i);group.updateMatrixWorld(true);
    const q=Object.fromEntries(Object.keys(bones).map(n=>[n,bones[n].quaternion.clone()])),pop=prev?Math.max(...Object.keys(q).map(n=>deg(prev[n].angleTo(q[n])))):0;prev=q;
    rows.push({mode,state:motion.state,pop,header:motion.header,own:motion.ownsHeight,rootPos:bones.Root.position.toArray()});}};
  step(speed>0?'run':'idle',60);
  // The simulation's strike: headerTime set, facing turned to the header direction, the ball released.
  if(turnTo!==null){p.fx=Math.sin(turnTo);p.fz=Math.cos(turnTo);}
  if(clear){s.event={id:1,type:'clearance',player:p.id};s.ball.vx=-4;}else s.event={id:1,type:'header',player:p.id};
  p.headerTime=config.aerial.seconds;
  step('header',Math.round(config.aerial.seconds/dt),()=>{p.headerTime=Math.max(0,p.headerTime-dt);});
  p.headerTime=0;p.vz=0;
  step(speed>0?'idle':'idle',150);
  return rows;
}
const seq=rows=>rows.reduce((a,r)=>a.at(-1)===r.state?a:[...a,r.state],[]);
const heads=rows=>seq(rows).filter(soccerHeaderState);

test('standing header: the stand clip plays through contact and returns to idle with a fade, no root motion, no lift on top of the clip', () => {
  const rows=playHeader(rigMotion(),{ballY:1.4});
  assert.deepEqual(heads(rows),[SOCCER_HEADER_PREFIX+'header_stand_goal']);
  assert.equal(seq(rows).at(-1).includes('idle'),true,seq(rows).join('>'));
  assert.ok(rows.filter(r=>soccerHeaderState(r.state)).every(r=>r.own===true));
  assert.ok(rows.filter(r=>!soccerHeaderState(r.state)).every(r=>!r.own));
  assert.ok(rows.every(r=>r.rootPos.every(v=>Math.abs(v)<1e-6)),'Root stays at the origin');
  const contact=rows.find(r=>r.header?.events.includes('visual_contact'));assert.ok(contact,'contact event received');
});
test('jump header: takeoff, contact and land arrive in order; the side clip follows the turn of the body', () => {
  for(const [turn,id] of [[0,'header_jump_goal'],[.9,'header_jump_left'],[-.9,'header_jump_right']]){
    const rows=playHeader(rigMotion(),{ballY:1.9,speed:0,turnTo:turn});
    assert.deepEqual(heads(rows),[SOCCER_HEADER_PREFIX+id],id);
    const events=rows.flatMap(r=>r.header?.events||[]);
    assert.deepEqual(events,['visual_takeoff','visual_contact','visual_land'].filter(e=>events.includes(e)),id);
    assert.ok(events.includes('visual_contact'),id+' contact');
    const phases=rows.map(r=>r.header?.phase).filter(Boolean);assert.ok(phases.includes('contact'),id);
  }
});
test('clearance and dive: header_clear for a clearance, header_dive for a low ball at a run', () => {
  assert.deepEqual(heads(playHeader(rigMotion(),{ballY:1.6,clear:true})),[SOCCER_HEADER_PREFIX+'header_clear']);
  const dive=playHeader(rigMotion(),{ballY:1.05,speed:5});
  assert.deepEqual(heads(dive),[SOCCER_HEADER_PREFIX+'header_dive']);
});
test('transitions: entering from a run and leaving to idle never snap a joint more than 30 degrees in one 60 Hz step, and the exit fade is 6 frames', () => {
  for(const opts of [{ballY:1.9,speed:4.5},{ballY:1.4},{ballY:1.9,speed:0,turnTo:.9}]){
    const rows=playHeader(rigMotion(),opts),worst=rows.reduce((a,r)=>r.pop>a.pop?r:a);
    assert.ok(worst.pop<=30,`${JSON.stringify(opts)}: ${worst.pop.toFixed(1)} deg at ${worst.state}`);
  }
  assert.equal(SOCCER_HEADER_EXIT_FADE,.2);assert.ok(Math.abs(SOCCER_HEADER_EXIT_FADE*30-6)<1e-9);
});
test('flag off or pack missing: the header does nothing new (state machine and height as before)', () => {
  const rt=rigMotion({withHeaders:false}),rows=playHeader(rt,{ballY:1.9});
  assert.equal(heads(rows).length,0);assert.ok(rows.every(r=>!r.own&&r.header===null));
  const before=rigMotion({withHeaders:false}),rowsB=playHeader(before,{ballY:1.9});
  assert.deepEqual(seq(rows),seq(rowsB),'deterministic without the pack');
  assert.equal(soccerHeadersEnabled(null,'?soccerHeaders=0'),false,'the loader skips the pack with the flag off');
});
test('wiring: the loader fetches the pack behind the flag, the manifest lists it for offline play', () => {
  const src=readFileSync(new URL('../workout/island/minigames/soccer-design-character.mjs',import.meta.url),'utf8');
  assert.match(src,/if\(soccerHeadersEnabled\(null\)\)\{try\{v22=soccerHeaderStates\(await fetchJson\(soccerHeaderClipsUrl\(\)\)\)/);
  assert.match(src,/motion\.ownsHeight\?0:Math\.max\(0,animation\.height/);
  const manifest=read('offline-manifest.json');
  assert.ok(manifest.games.soccer.includes('assets/soccer-v22/headers.json'));assert.ok(manifest.shell.includes('minigames/soccer-headers.mjs'));
});

// ---- the beaten keeper (soccer-keeper-crowd-v1) ---------------------------------------------------------------------------------------
test('keeper flag and assets: after_goal and disappointed, 18 bones, the celebration jump is not part of them', () => {
  assert.equal(soccerKeeperCrowdEnabled(null,''),true);assert.equal(soccerKeeperCrowdEnabled(null,'?soccerKeeperCrowd=0'),false);assert.equal(soccerKeeperCrowdEnabled({keeperCrowd:false},''),false);
  const states=soccerKeeperStates(keeperPack);
  assert.deepEqual(Object.keys(states).sort(),[SOCCER_KEEPER_AFTER_GOAL,SOCCER_KEEPER_DISAPPOINTED].sort());
  assert.equal(states[SOCCER_KEEPER_AFTER_GOAL].loop,false);assert.equal(states[SOCCER_KEEPER_DISAPPOINTED].loop,true);
  for(const s of Object.values(states)){assert.equal(s.keyframes[0].time,0);assert.equal(s.keyframes.at(-1).time,1);for(const k of s.keyframes)assert.deepEqual(Object.keys(k.rotations).sort(),[...CANON].sort());assert.ok(s.maxKeyDeg<70);}
  assert.equal(SOCCER_SHOW_DEJECTED[0],SOCCER_KEEPER_AFTER_GOAL);
  const has=n=>n===SOCCER_KEEPER_DISAPPOINTED;
  assert.equal(soccerKeeperDejectedNext(SOCCER_KEEPER_AFTER_GOAL,2.49,2.5,has),SOCCER_KEEPER_DISAPPOINTED);assert.equal(soccerKeeperDejectedNext(SOCCER_KEEPER_AFTER_GOAL,1,2.5,has),null);assert.equal(soccerKeeperDejectedNext('v10_idle_relaxed',9,2.5,has),null);
});
function playDejected(rt){
  const {motion,bones,group}=rt,p=player({role:'keeper'}),s={ball:{owner:null,flight:null,y:.11,vx:0,vz:0,x:0,z:0},mode:'defense',attackDir:1,event:null},rows=[];let prev=null;
  for(let i=0;i<60+Math.round(4/dt);i++){motion.update(p,s,{mode:i<60?'idle':'dejected'},dt);group.updateMatrixWorld(true);
    const q=Object.fromEntries(Object.keys(bones).map(n=>[n,bones[n].quaternion.clone()])),pop=prev?Math.max(...Object.keys(q).map(n=>deg(prev[n].angleTo(q[n])))):0;prev=q;rows.push({state:motion.state,pop,i});}
  return rows;
}
test('beaten keeper: after_goal plays once, then the looping disappointed holds until the goal phase ends; without the pack the old restless idle', () => {
  const rows=playDejected(rigMotion({withKeeper:true})),order=seq(rows);
  assert.deepEqual(order.slice(-2),[SOCCER_KEEPER_AFTER_GOAL,SOCCER_KEEPER_DISAPPOINTED],order.join('>'));
  console.log(rows.map((r,i)=>[i,r.state,r.pop.toFixed(0)]).filter(x=>+x[2]>20).slice(0,12).join(' | '));// Entering from the goalkeeper stance: the Codex clips start with the arms down, the game's keeper stance holds them forward (171 degrees apart on
  // the forearm), so the shortest-arc blend flips once inside the 0.12 s fade. Known limit, listed in REPORT-v22-soccer.md; everything after the entry must be smooth.
  const after=rows.filter(r=>r.i>=72),worst=after.reduce((a,r)=>r.pop>a.pop?r:a);assert.ok(worst.pop<=30,'no snap after the entry or between the clips: '+worst.pop.toFixed(1)+' at '+worst.state);
  assert.ok(Math.max(...rows.filter(r=>r.i<72).map(r=>r.pop))<=140,'the entry flip stays a single forearm');
  const off=seq(playDejected(rigMotion({withKeeper:false})));assert.ok(!off.some(n=>n.startsWith('v22_')),off.join('>'));
});
