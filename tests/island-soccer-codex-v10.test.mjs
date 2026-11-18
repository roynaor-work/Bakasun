import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {soccerMotionV10Enabled,soccerV10States,SOCCER_V10_IDLES,soccerRunLadder,soccerV10CutClip,soccerV10FirstTouchClip,soccerV10Held,soccerMotionLoadSummary,soccerCodexStates} from '../workout/island/minigames/soccer-codex-motion.mjs';

const root=new URL('../workout/island/',import.meta.url),read=async f=>JSON.parse(await readFile(new URL(f,root),'utf8'));

test('v10 flag: soccerMotionV10=0, config.codexV10=false and the whole-Codex flag switch it off; v9 flags stay separate',()=>{
  assert.equal(soccerMotionV10Enabled(null,''),true);
  assert.equal(soccerMotionV10Enabled(null,'?soccerMotionV10=0'),false);
  assert.equal(soccerMotionV10Enabled({codexV10:false},''),false);
  assert.equal(soccerMotionV10Enabled(null,'?soccerMotionV9=0'),false,'no Codex at all');
  assert.equal(soccerMotionV10Enabled(null,'?soccerRunV9=0'),true);
});

test('v10 clips.json: 30 states, 23 played by default (the 7 that snap an arm are behind ?soccerCuts=all)',async()=>{
  const json=await read('assets/soccer-v10/clips.json'),states=soccerV10States(json,'?soccerCuts=all');
  assert.equal(Object.keys(states).length,30);
  const played=Object.keys(soccerV10States(json,''));assert.equal(played.length,23);
  assert.deepEqual(Object.keys(states).filter(n=>!played.includes(n)).sort(),['v10_brake_reaccelerate','v10_cut_135_left','v10_cut_135_right','v10_cut_45_left','v10_cut_45_right','v10_cut_90_left','v10_cut_90_right']);
  assert.ok(played.includes('v10_cut_180_left')&&played.includes('v10_run'));
  for(const n of played)assert.ok(json.states[n.slice(4)].maxKeyDeg<=70,n);assert.ok(Object.keys(states).every(n=>n.startsWith('v10_')));
  assert.throws(()=>soccerV10States({schemaVersion:2}),/unexpected file/);
  for(const [name,s] of Object.entries(states)){
    assert.equal(s.keyframes[0].time,0);assert.equal(s.keyframes.at(-1).time,1);assert.equal(Object.keys(s.keyframes[0].rotations).length,18,name);
    for(const k of s.keyframes)for(const q of Object.values(k.rotations))assert.ok(Math.abs(Math.hypot(...q)-1)<.01,`${name} unit quaternion`);
  }
  for(const n of Object.keys(states).filter(n=>n.startsWith('v10_first_touch_'))){assert.equal(states[n].durationSeconds,.5);assert.equal(states[n].ballContacts[0].kind,'receive');assert.ok(Math.abs(states[n].ballContacts[0].atSeconds-1/3)<.01);}
  for(const n of ['hand_roll','short_foot_pass','long_goal_kick'])assert.ok(states['v10_goalkeeper_'+n].ballContacts.length>0,n);
  for(const side of ['left','right'])for(const a of [45,90,135,180]){const d=states[`v10_cut_${a}_${side}`].durationSeconds;assert.ok(d>=.35&&d<=.6,`cut ${a} ${side} ${d}`);}
});

test('cut choice: nearest of 45/90/135/180, side from the sign (positive = anatomical left), nothing below 35 degrees',()=>{
  const all=()=>true;
  assert.equal(soccerV10CutClip(.5,all),null);assert.equal(soccerV10CutClip(-.5,all),null);
  assert.equal(soccerV10CutClip(.8,all),'v10_cut_45_left');assert.equal(soccerV10CutClip(-.8,all),'v10_cut_45_right');
  assert.equal(soccerV10CutClip(1.57,all),'v10_cut_90_left');assert.equal(soccerV10CutClip(-1.57,all),'v10_cut_90_right');
  assert.equal(soccerV10CutClip(2.36,all),'v10_cut_135_left');assert.equal(soccerV10CutClip(-3,all),'v10_cut_180_right');
  assert.equal(soccerV10CutClip(1.57,()=>false),null);
  assert.equal(soccerV10CutClip(.3,all,20),'v10_cut_90_left','first frame of a sharp turn: 0.3 turned plus 20/16 still to turn');
  assert.equal(soccerV10CutClip(-.33,all,-20),'v10_cut_90_right');assert.equal(soccerV10CutClip(.1,all,2),null,'a gentle turn plays no cut');
});

test('first touch choice: chest above 1.05 m, thigh 0.45-1.05, foot below (inside, every third player outside); running from 2 m/s',()=>{
  const all=()=>true;
  assert.equal(soccerV10FirstTouchClip(1.3,3,1,all),'v10_first_touch_chest_running_quick');
  assert.equal(soccerV10FirstTouchClip(.7,0,1,all),'v10_first_touch_thigh_standing_quick');
  assert.equal(soccerV10FirstTouchClip(.11,2,1,all),'v10_first_touch_inside_running_quick');
  assert.equal(soccerV10FirstTouchClip(.11,2,3,all),'v10_first_touch_outside_running_quick');
  assert.equal(soccerV10FirstTouchClip(.11,2,1,()=>false),null);
  assert.ok(soccerV10Held('v10_cut_90_left')&&soccerV10Held('v10_first_touch_chest_running_quick')&&!soccerV10Held('v10_run'));
  assert.equal(soccerRunLadder(true)[2][0],'v10_run');assert.equal(soccerRunLadder(false)[2][0],'v9_run');
  assert.match(soccerMotionLoadSummary({v8:14,v9:17,v10:30},[]),/v8 14, v9 17, v10 30/);assert.match(soccerMotionLoadSummary({v8:0,v9:0,v10:0},['v10: 404']),/skipped: v10: 404/);
});

test('simulation: a received pass leaves a first-touch hint for the view in v2 only (never read by the model)',async()=>{
  const config=(await read('data/config.json')).minigames.soccer;
  const run=v=>{
    const g=createSoccer({config,seed:5,stage:3,difficulty:'normal',role:'field',aiVersion:v});let hint=false,n=7;const rnd=()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};let mx=1,mz=0;
    for(let t=0;t<7200&&!g.result;t++){if(t%20===0){const a=rnd()*6.283;mx=Math.cos(a);mz=Math.sin(a);}g.update(1/60,{moveX:mx,moveZ:mz,passPressed:rnd()<.03,sprintHeld:true});g.drainEvents();if(g.getState().players.some(p=>p.receiveTime>0))hint=true;}
    return hint;
  };
  assert.equal(run('v2'),true);assert.equal(run('v1'),false);
});

async function rig(all=false){
  globalThis.location={search:''};
  const T=await import('../workout/island/vendor/three.module.js');
  const {composeSoccerRestartMotion}=await import('../workout/island/minigames/soccer-restart-motion.mjs');
  const {compileSoccerDesignClips,createSoccerDesignMotion}=await import('../workout/island/minigames/soccer-design-character.mjs');
  const {soccerV8States}=await import('../workout/island/minigames/soccer-v8.mjs');
  const [base,k,l,t,r,map,v7,v8,v9,v10,full]=await Promise.all([read('design/motion/soccer.json'),...['throws-receives','kicks-locomotion','tackles-reactions'].map(p=>read('design/motion2/soccer/'+p+'.json')),read('design/characters/rig.json'),read('design/viewer/retarget-map.json'),read('assets/soccer-v7/clips.json'),read('assets/soccer-v8/clips.json'),read('assets/soccer-v9/clips.json'),read('assets/soccer-v10/clips.json'),read('data/config.json')]);
  const config=full.minigames.soccer,library=composeSoccerRestartMotion(base,k,l,t);
  const data={...library,states:{...library.states,...v7.states,...soccerV8States(v8),...soccerCodexStates(v9),...soccerV10States(v10,all?'?soccerCuts=all':'')}},clips=compileSoccerDesignClips(data,r,map);
  const bones={};let top;for(const j of r.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else top=b;}
  const group=new T.Group();group.add(top);const mixer=new T.AnimationMixer(group);
  return {T,bones,motion:createSoccerDesignMotion(mixer,clips,data,config),data};
}
const dt=1/60,mk=(o={})=>({id:1,x:0,z:0,vx:0,vz:0,fx:0,fz:1,kickTime:0,stealTime:0,slideKind:'straight',slideTime:0,recover:0,slideWon:false,role:'striker',receiveTime:0,...o});
const S=(extra={})=>({ball:{owner:null,flight:null,y:.11},mode:'attack',event:null,...extra});
const steps=(rt,p,s,mode,n,speed)=>{for(let i=0;i<n;i++){if(speed!==undefined){p.vx=0;p.vz=speed;}rt.motion.update(p,s,{mode},dt);}return rt.motion.state;};

test('controller with v10 and ?soccerCuts=all: corrected run and idle, a 90 degree turn at a run plays the left or right cut and returns to the run',async()=>{
  const rt=await rig(true),p=mk(),s=S();
  assert.equal(steps(rt,p,s,'run',90,4.5),'v10_run');
  // Turn the player 90 degrees to his left (positive yaw change) over 0.2 s while running.
  const yaw0=Math.atan2(p.fx,p.fz);for(let i=1;i<=12;i++){const y=yaw0+i/12*Math.PI/2;p.fx=Math.sin(y);p.fz=Math.cos(y);rt.motion.update(p,s,{mode:'run'},dt);if(rt.motion.state.startsWith('v10_cut'))break;}
  assert.match(rt.motion.state,/^v10_cut_(45|90)_left$/);
  const cut=rt.motion.state;steps(rt,p,s,'run',10,4.5);assert.equal(rt.motion.state,cut,'the cut plays on');
  steps(rt,p,s,'run',60,4.5);assert.ok(['v10_run','v9_jog'].includes(rt.motion.state),`back to running: ${rt.motion.state}`);
  const rt2=await rig(true),p2=mk();steps(rt2,p2,S(),'run',90,4.5);const y2=Math.atan2(p2.fx,p2.fz);
  for(let i=1;i<=12;i++){const y=y2-i/12*Math.PI*.75;p2.fx=Math.sin(y);p2.fz=Math.cos(y);rt2.motion.update(p2,S(),{mode:'run'},dt);if(rt2.motion.state.startsWith('v10_cut'))break;}
  assert.match(rt2.motion.state,/^v10_cut_(45|90|135)_right$/);
  const rt3=await rig(true),p3=mk();steps(rt3,p3,S(),'idle',200,0);assert.ok(SOCCER_V10_IDLES.includes(rt3.motion.state));
  const rt4=await rig(true),p4=mk();steps(rt4,p4,S(),'run',90,2.0);const y4=Math.atan2(p4.fx,p4.fz);for(let i=1;i<=12;i++){const y=y4+i/12*Math.PI/2;p4.fx=Math.sin(y);p4.fz=Math.cos(y);rt4.motion.update(p4,S(),{mode:'run'},dt);}
  assert.ok(!rt4.motion.state.startsWith('v10_cut'),'no cut below 3 m/s');
});

test('controller with v10 by default: 45-135 degree turns keep the v7 turn (their cuts snap an arm); a 180 turn plays the cut',async()=>{
  const turnTo=async(deg)=>{const rt=await rig(false),p=mk(),s=S();steps(rt,p,s,'run',90,4.5);const y0=Math.atan2(p.fx,p.fz),seen=new Set();
    for(let i=1;i<=30;i++){const cur=Math.atan2(p.fx,p.fz),target=y0+deg*Math.PI/180*.999,d=Math.atan2(Math.sin(target-cur),Math.cos(target-cur)),y=cur+d*(1-Math.exp(-14*dt));p.fx=Math.sin(y);p.fz=Math.cos(y);p.vz=4.5;rt.motion.update(p,s,{mode:'run'},dt);seen.add(rt.motion.state);}
    return [...seen];};
  assert.ok(!(await turnTo(90)).some(n=>n.startsWith('v10_cut')),'no 90 degree cut by default');
  assert.ok((await turnTo(170)).some(n=>/^v10_cut_180_/.test(n)),'the 180 degree cut is played');
});

test('controller with v10: a received ball plays the short first touch for its height, then the player runs on',async()=>{
  let rt=await rig(),p=mk(),s=S();steps(rt,p,s,'run',90,4);
  p.receiveTime=.5;p.receiveHeight=1.3;p.receiveSpeed=4;rt.motion.update(p,s,{mode:'run'},dt);
  assert.equal(rt.motion.state,'v10_first_touch_chest_running_quick');
  for(let i=0;i<8;i++){p.receiveTime=Math.max(0,p.receiveTime-dt);steps(rt,p,s,'run',1,4);}
  assert.equal(rt.motion.state,'v10_first_touch_chest_running_quick','it plays on');
  for(let i=0;i<40;i++){p.receiveTime=Math.max(0,p.receiveTime-dt);steps(rt,p,s,'run',1,4);}
  assert.ok(!rt.motion.state.startsWith('v10_first_touch'),`finished: ${rt.motion.state}`);
  rt=await rig();p=mk();s=S();steps(rt,p,s,'idle',60,0);p.receiveTime=.5;p.receiveHeight=.11;p.receiveSpeed=0;rt.motion.update(p,s,{mode:'idle'},dt);
  assert.equal(rt.motion.state,'v10_first_touch_inside_standing_quick');
  rt=await rig();p=mk({role:'keeper'});s=S();steps(rt,p,s,'idle',30,0);p.receiveTime=.5;p.receiveHeight=1.3;rt.motion.update(p,s,{mode:'idle'},dt);assert.ok(!rt.motion.state.startsWith('v10_first_touch'),'keepers do not use it');
});
