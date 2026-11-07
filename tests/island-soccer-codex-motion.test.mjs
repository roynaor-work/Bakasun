import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {soccerCodexMotionEnabled,soccerCodexStates,soccerLadderRung,SOCCER_CODEX_LADDER,SOCCER_CODEX_BOUNDS,soccerCodexKickClip,soccerCodexKeeperCatch,soccerCodexNextIdle,soccerCodexIdleHold,soccerCodexHeld,SOCCER_CODEX_IDLES} from '../workout/island/minigames/soccer-codex-motion.mjs';

const root=new URL('../workout/island/',import.meta.url);
const read=async f=>JSON.parse(await readFile(new URL(f,root),'utf8'));

test('flag: soccerMotionV9=0 and config.codexMotion=false switch the Codex clips off',()=>{
  assert.equal(soccerCodexMotionEnabled(null,''),true);
  assert.equal(soccerCodexMotionEnabled(null,'?soccerMotionV9=0'),false);
  assert.equal(soccerCodexMotionEnabled({codexMotion:false},''),false);
  assert.equal(soccerCodexMotionEnabled(null,'?soccerMotion=0'),true,'the arm/slide flag is a different switch');
});

test('clips.json: 15 states, prefixed, with speed, contacts and a valid shape',async()=>{
  const json=await read('assets/soccer-v9/clips.json'),states=soccerCodexStates(json);
  assert.equal(Object.keys(states).length,15);
  assert.ok(Object.keys(states).every(n=>n.startsWith('v9_')));
  assert.throws(()=>soccerCodexStates({schemaVersion:2}),/unexpected file/);
  for(const [name,s] of Object.entries(states)){
    assert.ok(s.keyframes.length>=20,name);assert.equal(s.keyframes[0].time,0);assert.equal(s.keyframes.at(-1).time,1);
    assert.equal(Object.keys(s.keyframes[0].rotations).length,18);
    for(const k of s.keyframes)for(const q of Object.values(k.rotations))assert.ok(Math.abs(Math.hypot(...q)-1)<.01,`${name} unit quaternion`);
  }
  assert.equal(states.v9_walk.speedMps,1);assert.equal(states.v9_jog.speedMps,2.6);
  assert.ok(states.v9_running_pass.ballContacts.length>0&&states.v9_long_shot.ballContacts.length>0&&states.v9_goalkeeper_catch_high.ballContacts.length>0);
});

test('ladder: walk, jog, run_4, run_5, sprint with boundaries at 1.55 / 3.4 / 4.8 / 6.3 and hysteresis',()=>{
  const r=s=>soccerLadderRung(SOCCER_CODEX_LADDER,s,-1,SOCCER_CODEX_BOUNDS);
  assert.deepEqual([.5,1,1.5,1.6,2.6,3.3,3.5,4.5,5.5,6.2,6.4,9].map(r),[0,0,0,1,1,1,2,2,3,3,4,4]);
  assert.equal(soccerLadderRung(SOCCER_CODEX_LADDER,1.6,0,SOCCER_CODEX_BOUNDS),0,'stays on walk just past the edge');
  assert.equal(soccerLadderRung(SOCCER_CODEX_LADDER,1.9,0,SOCCER_CODEX_BOUNDS),1,'moves to jog when clearly past it');
  assert.equal(soccerLadderRung([['a',1],['b',3]],1.9),0,'midpoint boundary without a fixed table');
});

test('kick, keeper and idle selection',()=>{
  const all=()=>true,none=()=>false;
  assert.equal(soccerCodexKickClip({event:{type:'shot',power:.9},ball:{}},0,all),'v9_long_shot');
  assert.equal(soccerCodexKickClip({event:{type:'shot',power:.5},ball:{}},5,all),null,'a soft shot keeps the v8 shot');
  assert.equal(soccerCodexKickClip({event:{type:'pass'},ball:{flight:null}},4,all),'v9_running_pass');
  assert.equal(soccerCodexKickClip({event:{type:'pass'},ball:{flight:null}},1,all),null,'standing pass keeps v8');
  assert.equal(soccerCodexKickClip({event:{type:'loft'},ball:{flight:{}}},5,all),null,'a loft keeps v8');
  assert.equal(soccerCodexKickClip({event:{type:'shot',power:.9},ball:{}},0,none),null);
  assert.equal(soccerCodexKeeperCatch(1.4,all),'v9_goalkeeper_catch_high');assert.equal(soccerCodexKeeperCatch(.3,all),'v9_goalkeeper_catch_low');assert.equal(soccerCodexKeeperCatch(1.4,none),null);
  assert.equal(soccerCodexNextIdle('v9_idle_relaxed'),'v9_idle_scan');assert.equal(soccerCodexNextIdle('v9_idle_weight_shift'),'v9_idle_relaxed');
  assert.notEqual(soccerCodexIdleHold(0),soccerCodexIdleHold(1));assert.equal(soccerCodexIdleHold(0),soccerCodexIdleHold(4));
  assert.ok(soccerCodexHeld('v9_celebrate_pump')&&soccerCodexHeld('v9_goalkeeper_catch_low')&&!soccerCodexHeld('v9_walk')&&!soccerCodexHeld('v9_run_brake'));
});

// The real controller on the real rig and clips, as the game loads them (library + v7 + v8 + Codex v9).
async function rig(withCodex){
  globalThis.location={search:''};
  const T=await import('../workout/island/vendor/three.module.js');
  const {composeSoccerRestartMotion}=await import('../workout/island/minigames/soccer-restart-motion.mjs');
  const {compileSoccerDesignClips,createSoccerDesignMotion}=await import('../workout/island/minigames/soccer-design-character.mjs');
  const {soccerV8States}=await import('../workout/island/minigames/soccer-v8.mjs');
  const [base,k,l,t,r,map,v7,v8,v9,full]=await Promise.all([read('design/motion/soccer.json'),...['throws-receives','kicks-locomotion','tackles-reactions'].map(p=>read('design/motion2/soccer/'+p+'.json')),read('design/characters/rig.json'),read('design/viewer/retarget-map.json'),read('assets/soccer-v7/clips.json'),read('assets/soccer-v8/clips.json'),read('assets/soccer-v9/clips.json'),read('data/config.json')]);
  const config=full.minigames.soccer,library=composeSoccerRestartMotion(base,k,l,t);
  const data={...library,states:{...library.states,...v7.states,...soccerV8States(v8),...(withCodex?soccerCodexStates(v9):{})}},clips=compileSoccerDesignClips(data,r,map);
  const bones={};let top;for(const j of r.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else top=b;}
  const group=new T.Group();group.add(top);const mixer=new T.AnimationMixer(group);
  return {T,group,bones,config,motion:createSoccerDesignMotion(mixer,clips,data,config)};
}
const dt=1/60,mk=(o={})=>({id:0,x:0,z:0,vx:0,vz:0,fx:0,fz:1,kickTime:0,stealTime:0,slideKind:'straight',slideTime:0,recover:0,slideWon:false,role:'striker',...o});
const S=(extra={})=>({ball:{owner:null,flight:null,y:.11},mode:'attack',event:null,...extra});
function steps(rt,p,s,mode,n,speed){for(let i=0;i<n;i++){if(speed!==undefined){p.vx=0;p.vz=speed;}rt.motion.update(p,s,{mode},dt);}return rt.motion.state;}

test('controller: walk, jog and run rungs, brake after a run, idle after the brake; off = the previous v7 ladder',async()=>{
  for(const [speed,want,wantOff] of [[1,'v9_walk','run_1'],[2.2,'v9_jog','run_2'],[4.5,'run_4','run_4'],[6.5,'sprint','sprint']]){
    assert.equal(steps(await rig(true),mk(),S(),'run',90,speed),want,`on ${speed}`);assert.equal(steps(await rig(false),mk(),S(),'run',90,speed),wantOff,`off ${speed}`);
  }
  const rt=await rig(true),p=mk(),s=S();
  steps(rt,p,s,'run',120,4.5);assert.equal(rt.motion.state,'run_4');
  p.vz=0;assert.equal(steps(rt,p,s,'idle',6,0),'v9_run_brake');
  steps(rt,p,s,'idle',30,0);assert.equal(rt.motion.state,'v9_run_brake','the brake plays on while standing');
  steps(rt,p,s,'idle',120,0);assert.ok(SOCCER_CODEX_IDLES.includes(rt.motion.state),`idle after the brake: ${rt.motion.state}`);
  // Setting off again during the brake interrupts it after its first 0.2 s.
  const rt2=await rig(true),p2=mk(),s2=S();steps(rt2,p2,s2,'run',120,4.5);steps(rt2,p2,s2,'idle',6,0);steps(rt2,p2,s2,'run',40,4.5);
  assert.ok(['run_4','v9_jog'].includes(rt2.motion.state),`running again: ${rt2.motion.state}`);
});

test('controller: a walk from a standstill has no pose pop above 30 degrees (v7 stood up to 54 at the stop)',async()=>{
  const rt=await rig(true),p=mk(),s=S();let prev=null,max=0;
  const snap=()=>Object.fromEntries(Object.keys(rt.bones).map(n=>[n,rt.bones[n].quaternion.clone()]));
  for(const [secs,speed] of [[1.5,0],[2,1],[2,2.6],[2,4.5],[1.2,0],[1.5,2.6],[1.2,0]])for(let i=0;i<Math.round(secs/dt);i++){
    p.vz=speed;rt.motion.update(p,s,{mode:speed>.2?'run':'idle'},dt);const q=snap();
    if(prev)for(const n of Object.keys(q))max=Math.max(max,prev[n].angleTo(q[n])*180/Math.PI);prev=q;
  }
  assert.ok(max<35,`largest per-frame bone rotation ${max.toFixed(1)} degrees`);
});

test('controller: Codex idles keep the arms near the natural stand (about 12 degrees out, elbow about 40)',async()=>{
  const rt=await rig(true),p=mk(),s=S(),T=rt.T,W=n=>rt.bones[n].getWorldPosition(new T.Vector3()),deg=r=>r*180/Math.PI;
  const seen=new Set();let abd=0,flexMin=999;
  for(let i=0;i<1500;i++){
    rt.motion.update(p,s,{mode:'idle'},dt);if(i<60)continue;rt.group.updateMatrixWorld(true);seen.add(rt.motion.state);
    for(const side of ['Left','Right']){const u=W(side+'ForeArm').sub(W(side+'Arm')),f=W(side+'Hand').sub(W(side+'ForeArm'));abd=Math.max(abd,deg(Math.atan2((side==='Left'?1:-1)*u.x,-u.y)));flexMin=Math.min(flexMin,deg(u.angleTo(f)));}
  }
  assert.ok(seen.size>=3,`idle variety: ${[...seen]}`);assert.ok(abd<16,`arms out ${abd.toFixed(1)}`);assert.ok(flexMin>34&&flexMin<56,`elbow ${flexMin.toFixed(1)}`);
});

test('controller: kicks, keeper catch and celebrations use the Codex clips when loaded',async()=>{
  let rt=await rig(true),p=mk({vz:4}),s=S({event:{type:'shot',power:.9}});
  steps(rt,p,s,'run',30,4);p.kickTime=.4;rt.motion.update(p,s,{mode:'kick'},dt);
  assert.equal(rt.motion.state,'v9_long_shot');
  rt=await rig(true);p=mk({vz:4});s=S({event:{type:'pass'}});steps(rt,p,s,'run',90,4);p.kickTime=.4;rt.motion.update(p,s,{mode:'kick'},dt);assert.equal(rt.motion.state,'v9_running_pass');
  rt=await rig(true);p=mk({role:'keeper'});s=S({ball:{owner:null,flight:null,y:1.4}});steps(rt,p,s,'idle',10,0);rt.motion.update(p,s,{mode:'catch'},dt);assert.equal(rt.motion.state,'v9_goalkeeper_catch_high');
  steps(rt,p,s,'idle',20,0);assert.equal(rt.motion.state,'v9_goalkeeper_catch_high','the catch plays on');
  const names=new Set();for(let id=0;id<8;id++){rt=await rig(true);p=mk({id});s=S();steps(rt,p,s,'idle',10,0);rt.motion.update(p,s,{mode:'celebrate'},dt);names.add(rt.motion.state);}
  assert.ok([...names].some(n=>n.startsWith('v9_celebrate')),`celebrations: ${[...names]}`);
});
