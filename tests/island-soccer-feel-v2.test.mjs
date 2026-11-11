import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from '../workout/island/vendor/three.module.js';
import {resolveSoccerFeel,soccerFeelEnabled,soccerFeelDiveClip,soccerFeelDivePlan,soccerFeelSlidePlan,slideFeelCursor,slideFeelRecoverRate,flattenRootMotion,feelSwitchDwell,passInterceptPoint,spaceAhead,SOCCER_FEEL_DEFAULTS} from '../workout/island/minigames/soccer-feel.mjs';
import {soccerCodexStates,soccerV10States,soccerV12Overlay,SOCCER_FEEL_V9_ADD} from '../workout/island/minigames/soccer-codex-motion.mjs';
import {soccerV8States} from '../workout/island/minigames/soccer-v8.mjs';
import {composeSoccerRestartMotion} from '../workout/island/minigames/soccer-restart-motion.mjs';
import {compileSoccerDesignClips,createSoccerDesignMotion,feelTouchEta,FEEL_TOUCH_LEAD} from '../workout/island/minigames/soccer-design-character.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {playFeelMatch,summarizeFeel} from '../workout/island/tools/soccer-feel-metrics.mjs';

const read=f=>JSON.parse(readFileSync(new URL('../workout/island/'+f,import.meta.url),'utf8'));
const config=read('data/config.json').minigames.soccer;
const v12=read('assets/soccer-v12/clips.json'),v8raw=read('assets/soccer-v8/clips.json'),v9raw=read('assets/soccer-v9/clips.json'),v10raw=read('assets/soccer-v10/clips.json');
const packsFor=search=>soccerV12Overlay(v12,{v9:soccerCodexStates(v9raw),v10:soccerV10States(v10raw,''),v8:soccerV8States(v8raw),v11:{}},search);
const deg=r=>r*180/Math.PI,dt=1/60;

test('flag: v2 by default, ?soccerFeel=0 (or the option) restores v1', () => {
  assert.equal(resolveSoccerFeel(undefined,''),'v2');assert.equal(resolveSoccerFeel(undefined,'?soccerFeel=0'),'v1');
  assert.equal(resolveSoccerFeel('v1','?soccerFeel=v2'),'v1');assert.equal(resolveSoccerFeel('v2','?soccerFeel=0'),'v2');
  assert.equal(soccerFeelEnabled(undefined,'?soccerFeel=off'),false);
});
test('v12 overlay: repaired v8 slide and dives replace v8 (root flattened), v11 dives and v9 miss/get-up are added; off = untouched', () => {
  const on=packsFor(''),off=packsFor('?soccerFeel=0'),v8=soccerV8States(v8raw);
  assert.equal(on.counts.v8Replaced,8);assert.equal(on.counts.v8Added,3,'slide, receive_chest, first_touch_moving were not in the shipped v8 pack');assert.equal(on.counts.v11Added,2);assert.equal(on.counts.v9Added,SOCCER_FEEL_V9_ADD.length);
  assert.ok(on.v11.v11_keeper_dive_left&&on.v11.v11_keeper_dive_right&&on.v9.v9_slide_miss&&on.v9.v9_quick_getup&&on.v9.v9_goalkeeper_getup);
  assert.notDeepEqual(on.v8.v8_keeper_dive_low_left.keyframes,v8.v8_keeper_dive_low_left.keyframes);assert.ok(on.v8.v8_slide&&!v8.v8_slide);
  for(const name of ['v8_slide','v8_keeper_dive_low_left','v8_keeper_dive_high_right'])for(const k of on.v8[name].keyframes){assert.equal(k.hipsOffsetMeters[0],0,name);assert.equal(k.hipsOffsetMeters[2],0,name);}
  assert.ok(on.v8.v8_keeper_dive_low_left.keyframes.some(k=>k.hipsOffsetMeters[1]<-.4),'the drop to the ground stays');
  assert.ok(Number.isFinite(on.v8.v8_slide.standSeconds)&&on.v8.v8_slide.standSeconds<on.v8.v8_slide.durationSeconds);
  assert.deepEqual(off.v8,v8);assert.deepEqual(off.v11,{});assert.equal(off.v9.v9_slide_miss,undefined);assert.equal(off.counts.v8Replaced,0);
  assert.deepEqual(off.v9,packsFor('?soccerFeel=0').v9);assert.equal(JSON.stringify(off.v10),JSON.stringify(soccerV12Overlay(v12,{v9:soccerCodexStates(v9raw),v10:soccerV10States(v10raw,'')},'').v10));
});
test('dive routing and plan: v11 for a reachable ball, v8 rows for a high one; the glove contact lands at 70% of the simulated dive', () => {
  const on=packsFor(''),has=n=>Boolean(on.v8[n]||on.v11[n]);
  assert.equal(soccerFeelDiveClip(true,.5,has),'v11_keeper_dive_left');assert.equal(soccerFeelDiveClip(false,1.2,has),'v11_keeper_dive_right');
  assert.equal(soccerFeelDiveClip(true,1.6,has),'v8_keeper_dive_high_left');assert.equal(soccerFeelDiveClip(false,.3,n=>n.startsWith('v8_')),'v8_keeper_dive_low_right');
  const plan=soccerFeelDivePlan(on.v11.v11_keeper_dive_left,.65);
  assert.ok(Math.abs((plan.contact-plan.at)/plan.rate-.65*.7)<1e-9);assert.ok(plan.at<plan.contact&&plan.contact<plan.land&&plan.land<plan.stand&&plan.stand<=plan.duration);
  const v8plan=soccerFeelDivePlan(on.v8.v8_keeper_dive_high_right,.65);assert.ok(v8plan.at<v8plan.contact&&v8plan.rate>=1&&v8plan.land>v8plan.contact);
  assert.equal(soccerFeelDivePlan({events:[],durationSeconds:1}),null);
});
test('slide plan: one continuous axis, recovery never slower than real time, cursor runs through the parts into the tail', () => {
  const on=packsFor(''),plan=soccerFeelSlidePlan({...on.v8,...on.v9});
  assert.ok(plan.won.slide.from<plan.won.slide.to&&plan.won.recover[0].from===plan.won.slide.to&&plan.won.tail.from===plan.won.recover[0].to);
  assert.notEqual(plan.lost,plan.won);assert.equal(plan.lost.recover[1].clip,'v9_quick_getup');
  assert.ok(slideFeelRecoverRate(plan.won.recover,.6,.35)>=1&&slideFeelRecoverRate(plan.won.recover,10,0)===1);
  const c0=slideFeelCursor(plan.lost.recover,plan.lost.tail,0),c1=slideFeelCursor(plan.lost.recover,plan.lost.tail,.35),cEnd=slideFeelCursor(plan.lost.recover,plan.lost.tail,99);
  assert.equal(c0.clip,'v9_slide_miss');assert.equal(c1.clip,'v9_quick_getup');assert.ok(cEnd.done);
  assert.equal(soccerFeelSlidePlan({}),null);
  const flat=flattenRootMotion({keyframes:[{hipsOffsetMeters:[.5,-.3,.2]}]});assert.deepEqual(flat.keyframes[0].hipsOffsetMeters,[0,-.3,0]);
});

// ---- motion state machine on the real rig ---------------------------------------------------------------------------------------------
const rig=read('design/characters/rig.json'),map=read('design/viewer/retarget-map.json');
const base=read('design/motion/soccer.json'),library=composeSoccerRestartMotion(base,...['throws-receives','kicks-locomotion','tackles-reactions'].map(p=>read('design/motion2/soccer/'+p+'.json')));
function rigMotion(search){
  globalThis.location={search};
  try{
    const o=packsFor(search),data={...library,states:{...library.states,...read('assets/soccer-v7/clips.json').states,...o.v8,...o.v9,...o.v10,...o.v11}},clips=compileSoccerDesignClips(data,rig,map);
    const bones={};let root;
    for(const j of rig.joints){const b=new T.Bone();b.name=j.name;b.position.fromArray(j.translation);b.quaternion.fromArray(j.rotation);bones[j.name]=b;if(j.parent)bones[j.parent].add(b);else root=b;}
    const group=new T.Group();group.add(root);const mixer=new T.AnimationMixer(group);
    return {bones,group,motion:createSoccerDesignMotion(mixer,clips,data,config),data};
  }finally{delete globalThis.location;}
}
const player=over=>({id:0,x:0,z:0,vx:0,vz:0,fx:0,fz:1,kickTime:0,stealTime:0,slideKind:'straight',slideTime:0,recover:0,slideWon:false,...over});
const sim=()=>({ball:{owner:null,flight:null,y:.11,vx:0,vz:0,x:0,z:0},mode:'defense',event:null});
function playSlide(rt,won,after='stand'){
  const {motion,bones,group}=rt,variant={...config.slide,...config.slide.variants.straight},p=player({vz:4.5}),s=sim(),rows=[];let prev=null;
  const step=(mode,n)=>{for(let i=0;i<n;i++){motion.update(p,s,{mode},dt);group.updateMatrixWorld(true);
    const q=Object.fromEntries(Object.keys(bones).map(n=>[n,bones[n].quaternion.clone()])),pop=prev?Math.max(...Object.keys(q).map(n=>deg(prev[n].angleTo(q[n])))):0;prev=q;
    rows.push({mode,state:motion.state,pop,hipsY:bones.Hips.getWorldPosition(new T.Vector3()).y,slide:motion.slide});}};
  step('run',40);
  p.slideTime=variant.seconds;p.vz=variant.distance/variant.seconds;
  while(p.slideTime>1e-9){p.slideTime=Math.max(0,p.slideTime-dt);if(p.slideTime<variant.seconds*.5)p.slideWon=won;step('slide',1);}
  p.recover=variant.recoverSeconds;p.vz=0;
  while(p.recover>1e-9){p.recover=Math.max(0,p.recover-dt);step('recover',1);}
  if(after==='stand')step('idle',150);else{p.vz=4.5;step('run',40);}
  return rows;
}
const states=rows=>rows.reduce((a,r)=>a.at(-1)===r.state?a:[...a,r.state],[]);
test('slide v2: run -> repaired v8 slide (won) or v9 miss + quick get-up (lost) -> idle, every per-frame joint step under 25 degrees', () => {
  const won=playSlide(rigMotion(''),true),lost=playSlide(rigMotion(''),false);
  assert.deepEqual(states(won),['v10_run','v8_slide','v10_idle_relaxed']);
  assert.deepEqual(states(lost),['v10_run','v8_slide','v9_slide_miss','v9_quick_getup','v10_idle_relaxed']);
  for(const [name,rows] of [['won',won],['lost',lost]]){
    const worst=rows.reduce((a,r)=>r.pop>a.pop?r:a);assert.ok(worst.pop<=25,`${name}: ${worst.pop.toFixed(1)} deg at ${worst.state}`);
    assert.ok(Math.min(...rows.filter(r=>r.mode==='recover').map(r=>r.hipsY))<.2,name+': on the ground during the recovery');
    assert.ok(rows.at(-1).hipsY>.4,name+': standing again');
    assert.ok(rows.filter(r=>r.mode==='slide').every(r=>r.slide?.v2),name+': feel timeline');
  }
  const run=playSlide(rigMotion(''),true,'run');assert.equal(run.at(-1).state,'v10_run');assert.ok(Math.max(...run.slice(-40).map(r=>r.pop))<=25,'exit into the run');
});
test('slide v2 off: the v7 composite timeline plays as before', () => {
  const rows=playSlide(rigMotion('?soccerFeel=0'),false);
  assert.ok(states(rows).includes('slide-straight'),states(rows).join('>'));assert.ok(rows.filter(r=>r.mode==='slide').every(r=>r.slide&&!r.slide.v2));
});
function playDive(rt,{ballY=.5,hands=false}={}){
  const {motion,bones,group}=rt,p=player({slideKind:null,diveZ:1,fx:1,fz:0,role:'keeper',diveTime:0}),s={...sim(),ball:{owner:null,flight:null,y:ballY,x:0,z:1,vx:0,vz:0}},rows=[];let prev=null;
  const step=(mode,n,fn)=>{for(let i=0;i<n;i++){fn?.(i*dt);motion.update(p,s,{mode},dt);group.updateMatrixWorld(true);
    const q=Object.fromEntries(Object.keys(bones).map(n=>[n,bones[n].quaternion.clone()])),pop=prev?Math.max(...Object.keys(q).map(n=>deg(prev[n].angleTo(q[n])))):0;prev=q;const h=bones.Hips.getWorldPosition(new T.Vector3());
    rows.push({mode,state:motion.state,pop,hipsY:h.y,drift:Math.hypot(h.x,h.z),ground:motion.diveGround,dive:motion.dive});}};
  step('idle',30);
  step('dive',Math.round(config.goalkeeping.diveSeconds/dt),t=>{p.diveTime=Math.max(.001,config.goalkeeping.diveSeconds-t);});
  p.diveTime=0;if(hands)p.hands=true;step(hands?'catch':'idle',200);
  return rows;
}
test('dive v2: repaired v11 dive for a low ball (v8 row for a high one), lands where the engine says (no horizontal root), lies, gets up, holds position while on the ground', () => {
  const low=playDive(rigMotion(''));
  assert.deepEqual(states(low),['v9_goalkeeper_ready','v11_keeper_dive_right','v9_goalkeeper_ready']);
  const worst=low.reduce((a,r)=>r.pop>a.pop?r:a);assert.ok(worst.pop<=25,`${worst.pop.toFixed(1)} deg at ${worst.state}`);
  assert.ok(Math.max(...low.map(r=>r.drift))<.15,'hips stay over the simulated position: '+Math.max(...low.map(r=>r.drift)).toFixed(2));
  assert.ok(Math.min(...low.map(r=>r.hipsY))<.3,'on the ground');assert.ok(low.some(r=>r.ground),'diveGround reported while lying');assert.ok(!low.at(-1).ground&&low.at(-1).hipsY>.4,'back up');
  const diveRows=low.filter(r=>r.mode==='dive'),contactAt=diveRows.findIndex(r=>r.dive&&r.dive.time>=r.dive.contact);
  assert.ok(contactAt>0&&Math.abs(contactAt*dt-config.goalkeeping.diveSeconds*.7)<.06,'glove contact at 70% of the dive: '+(contactAt*dt).toFixed(2));
  const high=playDive(rigMotion(''),{ballY:1.7});assert.equal(states(high)[1],'v8_keeper_dive_high_right');assert.ok(Math.max(...high.map(r=>r.drift))<.15);
  const caught=playDive(rigMotion(''),{hands:true});assert.equal(states(caught)[1],'v11_keeper_dive_right');assert.ok(caught.filter(r=>r.mode==='catch').slice(0,60).every(r=>r.state==='v11_keeper_dive_right'),'a catch after the save keeps the dive on the ground');
  const before=playDive(rigMotion('?soccerFeel=0'));assert.equal(states(before)[1],'v8_keeper_dive_low_right');assert.ok(Math.max(...before.map(r=>r.drift))>.4,'before: the clip root carried the body sideways on top of the simulation');
});
test('first touch is armed before the ball arrives (feel v2) and only once per pass', () => {
  assert.ok(feelTouchEta({x:0,z:0},{x:-3,z:0,vx:6,vz:0})>.3&&feelTouchEta({x:0,z:0},{x:-1.2,z:0,vx:6,vz:0})<=FEEL_TOUCH_LEAD);
  assert.equal(feelTouchEta({x:0,z:0},{x:3,z:0,vx:6,vz:0}),Infinity);
  const {motion}=rigMotion(''),p=player({vx:3,fx:1,fz:0}),passTarget={player:0,x:2,z:0,time:2},s={...sim(),mode:'attack',passTarget,ball:{owner:null,flight:null,y:.11,x:-6,z:0,vx:7,vz:0}};
  for(let i=0;i<40;i++){motion.update(p,s,{mode:'run'},dt);if(!motion.state.startsWith('v10_first_touch'))s.ball.x+=7*dt;}
  assert.ok(motion.state.startsWith('v10_first_touch_'),motion.state);
  const armedAt=motion.state;s.ball.x=0;p.receiveTime=.5;motion.update(p,s,{mode:'run'},dt);assert.equal(motion.state,armedAt,'the arrival does not restart the clip');
});

// ---- simulation ------------------------------------------------------------------------------------------------------------------------
test('feel helpers: turnover dwell, intercept point, space ahead', () => {
  const feel=SOCCER_FEEL_DEFAULTS;
  assert.equal(feelSwitchDwell(feel,.5,10,9.5),feel.switchTurnoverSeconds);assert.equal(feelSwitchDwell(feel,.5,10,8),.5);assert.equal(feelSwitchDwell(feel,.1,10,9.9),.1);
  const at=passInterceptPoint({x:5,z:3},{x:0,z:0},{x:10,z:0});assert.ok(at.x>5&&at.x<=10&&at.z===0);
  assert.deepEqual(passInterceptPoint({x:5,z:3},{x:0,z:0},{x:0,z:0}),{x:0,z:0});
  assert.equal(spaceAhead({team:0,x:0,z:0},[{team:1,role:'striker',x:3,z:0},{team:1,role:'keeper',x:1,z:0},{team:1,role:'wing',x:-4,z:0}],1),3);
  assert.equal(spaceAhead({team:0,x:0,z:0},[],1),Infinity);
});
test('createSoccer: feel v2 by default (state.feel), off with the option; turnover tracked', () => {
  const on=createSoccer({config,seed:7,stage:2}),off=createSoccer({config,seed:7,stage:2,feelVersion:'0'});
  assert.equal(on.getState().feel,'v2');assert.equal(off.getState().feel,'off');
  for(let i=0;i<600;i++){on.update(1/60,{});off.update(1/60,{});}
  assert.ok(Number.isFinite(on.getState().turnoverAt)||on.getState().turnoverAt===-Infinity);
});
test('tactics: a rival pass in flight makes the presser run to the intercept point and the receiver gets marked after the reaction; the rival screens the pass lane', () => {
  const game=createSoccer({config,seed:11,stage:5}),s=game.getState();
  for(let i=0;i<120;i++)game.update(1/60,{});
  // Team 1 (rival) has just passed: ball loose, rolling from its carrier toward a team-mate.
  const passer=s.players.find(p=>p.team===1&&p.role==='support'),receiver=s.players.find(p=>p.team===1&&p.role==='striker');
  passer.x=4;passer.z=0;receiver.x=-6;receiver.z=5;s.ball.owner=null;s.ball.lastTeam=1;s.ball.lastPlayer=passer.id;s.ball.x=3;s.ball.z=.5;s.ball.vx=-9;s.ball.vz=4.5;s.ball.y=.11;s.ball.flight=null;
  s.passTarget={player:receiver.id,x:-6,z:5,startX:4,startZ:0,distance:11.2,time:2.5,kind:'ground'};s.phase='playing';
  const defenders=s.players.filter(p=>p.team===0&&p.role!=='keeper');
  for(const p of defenders)p.x=-2+p.id;
  const dutiesAt=()=>defenders.map(p=>game.tacticalTarget(p).duty);
  const first=dutiesAt();assert.ok(!first.includes('intercept'),'before the reaction time: '+first.join(','));
  s.elapsed+=config.feel.reaction.normal+.05;
  const after=dutiesAt();assert.ok(after.includes('intercept'),'after the reaction time: '+after.join(','));
  assert.ok(after.includes('mark'),'the receiver is marked: '+after.join(','));
  // The child's carrier with the ball: the rival's second defender screens the lane.
  const carrier=s.players[s.controlled];s.ball.owner=carrier.id;s.passTarget=null;s.ball.x=carrier.x;s.ball.z=carrier.z;s.elapsed+=.5;
  const rival=s.players.filter(p=>p.team===1&&p.role!=='keeper').map(p=>game.tacticalTarget(p).duty);
  assert.ok(rival.includes('lane'),rival.join(','));
  const off=createSoccer({config,seed:11,stage:5,feelVersion:'0'}),so=off.getState();for(let i=0;i<120;i++)off.update(1/60,{});
  so.ball.owner=so.players[so.controlled].id;so.passTarget=null;
  assert.ok(!so.players.filter(p=>p.team===1&&p.role!=='keeper').map(p=>off.tacticalTarget(p).duty).includes('lane'),'off: no lane duty');
});
test('reaction harness: AI receivers and defenders move at the release, switch follows a turnover (stage 2, typical bot)', () => {
  const results=[];for(let i=0;i<6;i++)results.push(playFeelMatch({config,seed:3000+i,stage:2,feel:'v2',maxSeconds:160}));
  const s=summarizeFeel(results),T=s.team;
  assert.ok(T[0].receiverMoveMedian<=.15,'child AI receiver median '+T[0].receiverMoveMedian);
  assert.ok(T[1].receiverMoveMedian<=.15,'rival receiver median '+T[1].receiverMoveMedian);
  assert.ok(T[0].defenderMoveMedian<=config.feel.reaction.normal+.1&&T[1].defenderMoveMedian<=config.feel.reaction.normal+.1,'defender medians '+T[0].defenderMoveMedian+'/'+T[1].defenderMoveMedian);
  assert.ok(s.switch.lagMedian<=.15&&s.switch.within0_3>=.75,'switch after turnover '+JSON.stringify(s.switch));
  const before=summarizeFeel([0,1,2].map(i=>playFeelMatch({config,seed:3000+i,stage:2,feel:'0',maxSeconds:160})));
  assert.ok(before.team[0].passes>0&&s.team[0].passes>0);
});
