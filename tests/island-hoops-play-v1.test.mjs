// M3 (11/11/2026, sports-deep-fable): the basketball play layer behind `?hoopsPlay=v1` (config.play, default on).
// Alley-oops (lob to a cutter at the rim, caught in the air, finished as a dunk or layup), legible pass kinds
// (tap = chest or bounce under an arm, double tap = bounce, hold = overhead lob or the alley-oop), spacing and
// the doubled-handler cut. `play:false` (= ?hoopsPlay=0) is the previous engine, step for step.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHoopsEngine,NO_INPUT,alleyOopEligible,passLaneBlocked} from '../workout/island/minigames/hoops-engine.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';
const cfg=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
const PLAY=cfg.play;

test('config: the play layer exists, is on by default and carries the M3 numbers',()=>{
 assert.equal(PLAY.enabled,true);assert.equal(PLAY.oopRadius,3.2);assert.equal(PLAY.oopBonus,0.15);assert.equal(PLAY.aiOopChance,0.08);
 assert.equal(PLAY.spacingRadius,2.5);assert.equal(PLAY.spacingMax,2);assert.equal(PLAY.oopBox,0.9);assert.equal(PLAY.oopDunkRadius,1.6);
});

test('alley-oop eligibility: within 3.2 m of the rim, running at it or already near, not boxed by a defender within 0.9 m',()=>{
 const rim={x:12,z:0},q=(x,z,vx=0,vz=0,extra={})=>({x,z,vx,vz,air:-1,act:null,...extra});
 assert.equal(alleyOopEligible(q(9.5,0,3,0),rim,[],PLAY),true,'2.5 m out, running at the rim');
 assert.equal(alleyOopEligible(q(8,0,3,0),rim,[],PLAY),false,'4 m out is beyond the radius');
 assert.equal(alleyOopEligible(q(9.5,0,0,0),rim,[],PLAY),false,'2.5 m out and standing still: not a cut');
 assert.equal(alleyOopEligible(q(9.5,0,-3,0),rim,[],PLAY),false,'running away from the rim');
 assert.equal(alleyOopEligible(q(10.8,0.5,0,0),rim,[],PLAY),true,'1.3 m out and standing: already at the rim');
 assert.equal(alleyOopEligible(q(9.5,0,3,0),rim,[{x:9.9,z:0.6}],PLAY),false,'a defender 0.7 m away boxes him');
 assert.equal(alleyOopEligible(q(9.5,0,3,0),rim,[{x:10.8,z:0.9}],PLAY),true,'a defender 1.6 m away does not');
 assert.equal(alleyOopEligible(q(9.5,0,3,0,{act:'pass'}),rim,[],PLAY),false,'busy with an action');
 assert.equal(alleyOopEligible(q(9.5,0,3,0,{air:0.2}),rim,[],PLAY),false,'already in the air');
 assert.equal(alleyOopEligible(q(9.5,0,3,0),rim,[],null),false,'no play layer: never');
 assert.equal(passLaneBlocked({x:0,z:0},{x:6,z:0},[{x:3,z:0.4}],0.9),true);assert.equal(passLaneBlocked({x:0,z:0},{x:6,z:0},[{x:3,z:1.4}],0.9),false);
 assert.equal(passLaneBlocked({x:0,z:0},{x:6,z:0},[{x:6.2,z:0}],0.9),false,'a defender on the receiver is not in the lane');
});

/** A live frontcourt possession for team 0 with every player parked where the test wants him. */
function stage({seed=7,play,autopilot=true}={}){
 const config=structuredClone(cfg),clubs=matchTeams(config,initialHoops(config),{stage:1});
 const e=createHoopsEngine({config,seed,teams:clubs.teams,userTeam:0,profile:'quick',difficulty:'normal',autopilot,play});
 const S=e.debug.state,a=e.debug.api;
 let guard=0;while(S.phase!=='live'&&guard++<2000)e.step(NO_INPUT);e.step(NO_INPUT);e.drainEvents();   // one live step: the defence is assigned
 const s=a.side(0),rim=a.court.rim(s),mine=a.onCourt(0),theirs=a.onCourt(1);
 const h=mine.find(p=>p.pos==='PG'),big=[...mine].filter(p=>p!==h).sort((x,y)=>y.r.dunk-x.r.dunk)[0];
 const put=(p,x,z,vx=0,vz=0)=>{p.x=x;p.z=z;p.vx=vx;p.vz=vz;p.act=null;p.actT=0;p.shot=null;p.air=-1;p.jumpH=0;p.goal=null;p.role=null;p.think=0;p.intent={x:0,z:0,speed:0,face:null,sprint:false};};   // think 0: he decides on the next step
 put(h,rim.x-s*6.5,0);
 const others=mine.filter(p=>p!==h&&p!==big);others.forEach((p,i)=>put(p,rim.x-s*7,i===0?6:i===1?-6:7));
 theirs.forEach((p,i)=>put(p,rim.x-s*(9+i*0.6),(i-2)*2.6));   // the defence stands at the arc, 6+ m from the rim
 e.debug.give(h.id);S.frontcourtSet=true;S.shotClock=20;S.clock=60;e.drainEvents();
 // a settled half-court possession: no transition window, no pick-and-roll call in the way of the spot logic
 for(const T of S.teams){if(T.ai)T.ai.transition=0;T.tactics.offense='motion';T.call=null;}
 return {e,S,a,s,rim,h,big,others,theirs,put,config};
}
function run(e,until,max=600){const seen=[];for(let i=0;i<max;i++){e.step(NO_INPUT);for(const ev of e.drainEvents()){seen.push(ev);if(until(ev))return {hit:ev,seen};}}return {hit:null,seen};}

test('alley-oop: the lob to a cutter is caught in the air, the ball attaches with no gather or dribble, the dunk/layup starts at once and scores or misses as an alley-oop',()=>{
 for(const seed of [7,8,9]){
  const {e,S,a,s,rim,h,big,put}=stage({seed});
  put(big,rim.x-s*2.7,0.9,s*3.2,-0.9);                    // 2.8 m out, running at the rim
  assert.equal(a.oopEligible(big),true);
  assert.equal(a.startPass(h,big,'lob'),true);
  const start=e.drainEvents().find(ev=>ev.type==='passStart');assert.equal(start.kind,'lob');assert.equal(start.oop,true);
  const thrown=run(e,ev=>ev.type==='pass');assert.ok(thrown.hit,'the lob leaves the hands');assert.equal(thrown.hit.oop,true);assert.equal(thrown.hit.kind,'lob');
  assert.ok(S.ball.pass.target.y>2.4,`the lob is aimed above the standing reach (${S.ball.pass.target.y})`);
  const caught=run(e,ev=>ev.type==='catch'||ev.type==='interception'||ev.type==='violation',240);
  assert.ok(caught.hit&&caught.hit.type==='catch',`seed ${seed}: the cutter catches the lob (${caught.hit?.type})`);
  assert.equal(caught.hit.oop,true);assert.equal(caught.hit.playerId,big.id);
  const shotStart=caught.seen.find(ev=>ev.type==='shotStart');assert.ok(shotStart&&shotStart.oop,'the jump to meet the ball started before the catch');
  assert.ok(['dunk','layup'].includes(shotStart.shotType));
  assert.equal(S.ball.owner,big.id);assert.equal(S.ball.state,'held');
  assert.equal(big.act,'shoot');assert.ok(big.air>=0,'caught in the air');assert.equal(big.shot.type,shotStart.shotType);assert.ok(big.shot.oop);
  assert.equal(big.dead,false);assert.equal(S.ball.dribbleT,0);
  assert.equal(caught.seen.some(ev=>ev.type==='gather'),false,'no gather: the ball goes straight up');
  const released=run(e,ev=>ev.type==='release',60);assert.ok(released.hit,'released within a second of the catch');
  assert.equal(released.hit.oop,true);assert.equal(released.hit.playerId,big.id);assert.equal(released.hit.shotType,shotStart.shotType);
  assert.equal(released.seen.some(ev=>ev.type==='step'||ev.type==='gather'),false,'no steps, no gather between catch and release');
  const done=run(e,ev=>ev.type==='alleyoop',400);assert.ok(done.hit,'an alleyoop event closes the play');
  assert.equal(done.hit.from,h.id);assert.equal(done.hit.to,big.id);assert.ok(['score','miss'].includes(done.hit.result));
  if(done.hit.result==='score'){assert.equal(h.stats.ast,1,'the passer gets the assist');assert.equal(big.stats.pts,2);}
 }
});

test('alley-oop: a dunk only for a dunker inside 1.6 m of the rim at the catch; farther out, or a weak dunker, it is a layup',()=>{
 const far=stage({seed:11});far.put(far.big,far.rim.x-far.s*3.1,0.4,far.s*2.2,0);far.a.startPass(far.h,far.big,'lob');
 const f=run(far.e,ev=>ev.type==='shotStart',300);assert.ok(f.hit);
 const meet=far.S.ball.pass?.target||f.hit;assert.ok(meet);
 const weak=stage({seed:12});weak.big.r.dunk=40;weak.put(weak.big,weak.rim.x-weak.s*2.2,0.3,weak.s*3,0);weak.a.startPass(weak.h,weak.big,'lob');
 const w=run(weak.e,ev=>ev.type==='shotStart',300);assert.ok(w.hit);assert.equal(w.hit.shotType,'layup','a 40 dunk rating finishes with a layup');
 const strong=stage({seed:12});strong.big.r.dunk=90;strong.big.energy=1;strong.put(strong.big,strong.rim.x-strong.s*2.2,0.3,strong.s*3,0);strong.a.startPass(strong.h,strong.big,'lob');
 const st=run(strong.e,ev=>ev.type==='shotStart',300);assert.ok(st.hit);assert.equal(st.hit.shotType,'dunk','a 90 dunk rating arriving at the rim dunks');
});

test('alley-oop: the lob is refused when the cutter is boxed, standing far from the rim, or the layer is off; the pass is then an ordinary one',()=>{
 const boxed=stage({seed:21});boxed.put(boxed.big,boxed.rim.x-boxed.s*2.7,0.9,boxed.s*3,0);boxed.put(boxed.theirs[0],boxed.rim.x-boxed.s*2.4,1.3);
 assert.equal(boxed.a.oopEligible(boxed.big),false);boxed.a.startPass(boxed.h,boxed.big,'lob');assert.equal(boxed.e.drainEvents().find(ev=>ev.type==='passStart').oop,false);
 const still=stage({seed:22});still.put(still.big,still.rim.x-still.s*2.9,0.5);assert.equal(still.a.oopEligible(still.big),false);
 const off=stage({seed:23,play:false});off.put(off.big,off.rim.x-off.s*2.7,0.9,off.s*3,0);
 assert.equal(off.a.play,null);assert.equal(off.a.oopEligible(off.big),false);
 off.a.startPass(off.h,off.big,'lob');const ps=off.e.drainEvents().find(ev=>ev.type==='passStart');assert.equal(ps.kind,'lob');assert.equal(ps.oop,false);
 const r=run(off.e,ev=>ev.type==='alleyoop'||ev.type==='shotStart'&&ev.oop,300);assert.equal(r.hit,null,'no alley-oop machinery with the layer off');
 assert.equal(r.seen.some(ev=>ev.type==='catch'||ev.type==='interception'||ev.type==='violation'||ev.type==='possession'),true,'the lob is still an ordinary pass');
});

test('flag off: the whole game is the previous engine step for step (seed 500, standard: 28-30 after overtime, as measured before M3)',()=>{
 const config=structuredClone(cfg),setup=matchTeams(config,initialHoops(config),{stage:1});
 const e=createHoopsEngine({config,seed:500,teams:setup.teams,userTeam:0,profile:'standard',difficulty:setup.difficulty,assist:setup.assist,autopilot:true,play:false});
 let oops=0;while(e.snapshot().phase!=='final'){e.step(NO_INPUT);for(const ev of e.drainEvents())if(ev.type==='alleyoop'||ev.oop)oops++;}
 assert.deepEqual(e.result.score,[28,30]);assert.equal(e.result.overtime,1);assert.equal(oops,0);
});

test('pass kinds: tap = chest, or bounce when a defender\'s arm is in the lane; hold = overhead lob to a far man, chest to a near one, the alley-oop to a cutter',()=>{
 const t=stage({seed:31});const {a,h,s,rim,big,others,theirs,put,e}=t;
 const q=others[0];put(q,h.x+s*0,5.5);                        // 5.5 m to the side, lane clear
 a.startPass(h,q,null,true);assert.equal(e.drainEvents().find(ev=>ev.type==='passStart').kind,'chest');h.act=null;h.act2=null;
 put(theirs[0],h.x,2.7);                                        // an arm in the lane
 a.startPass(h,q,null,true);assert.equal(e.drainEvents().find(ev=>ev.type==='passStart').kind,'bounce');h.act=null;h.act2=null;
 a.startPass(h,q,'long',true);assert.equal(e.drainEvents().find(ev=>ev.type==='passStart').kind,'bounce','a held button to a near man under an arm: still the bounce pass');h.act=null;h.act2=null;
 put(theirs[0],rim.x-s*11,-5);put(q,h.x-s*4,6.5);               // 7.6 m away, lane clear
 a.startPass(h,q,'long',true);assert.equal(e.drainEvents().find(ev=>ev.type==='passStart').kind,'lob','a held button to a far man is the overhead lob');h.act=null;h.act2=null;
 a.startPass(h,q,null,true);assert.equal(e.drainEvents().find(ev=>ev.type==='passStart').kind,'chest','a tap to the same far man stays a chest pass');h.act=null;h.act2=null;
 a.startPass(h,q,'bounce',true);assert.equal(e.drainEvents().find(ev=>ev.type==='passStart').kind,'bounce','an asked-for bounce pass is a bounce pass');h.act=null;h.act2=null;
 put(big,rim.x-s*2.7,0.9,s*3,0);
 assert.equal(a.choosePassTarget(h,null,true),big,'a held pass button while a mate cuts picks the cutter, not the far man');
 a.startPass(h,big,'long',true);const ps=e.drainEvents().find(ev=>ev.type==='passStart');assert.equal(ps.kind,'lob');assert.equal(ps.oop,true);
 // the thrown pass carries the human flag for the session's toast
 const thrown=run(e,ev=>ev.type==='pass');assert.equal(thrown.hit.human,true);assert.equal(thrown.hit.oop,true);
});

test('pass kinds with the layer off: the previous rule (lob only beyond lobAbove, jump pass under pressure, otherwise chest)',()=>{
 const t=stage({seed:32,play:false});const {a,h,s,others,theirs,put,e}=t;
 const q=others[0];put(q,h.x,5.5);put(theirs[0],h.x,2.7);
 a.startPass(h,q,null,true);assert.equal(e.drainEvents().find(ev=>ev.type==='passStart').kind,'chest','no automatic bounce pass');h.act=null;h.act2=null;
 put(q,h.x-s*4,6.5);a.startPass(h,q,'long',true);assert.equal(e.drainEvents().find(ev=>ev.type==='passStart').kind,'chest','7.6 m is below the old 9 m lob threshold');
});

test('double tap: the child\'s second tap during the wind-up turns the pass into a bounce pass; a lone double tap asks for one directly',()=>{
 const t=stage({seed:41,autopilot:false});const {S,a,h,s,others,put,e}=t;
 const q=others[0];put(q,h.x,4.5);others.slice(1).forEach(p=>put(p,h.x-s*5,p.z));
 assert.equal(S.controlled,h.id);
 e.step({...NO_INPUT,passPress:true});let ev=e.drainEvents();const start=ev.find(x=>x.type==='passStart');assert.ok(start);assert.equal(start.kind,'chest');assert.equal(start.targetId,q.id);
 e.step({...NO_INPUT,passPress:true,passDouble:true});ev=e.drainEvents();assert.ok(ev.find(x=>x.type==='passKind'&&x.kind==='bounce'),'the second tap re-kinds the pass');
 const thrown=run(e,x=>x.type==='pass');assert.equal(thrown.hit.kind,'bounce');assert.equal(thrown.hit.human,true);
 const b=run(e,x=>x.type==='bounce',120);assert.ok(b.hit,'the ball touches the floor on its way');
 const t2=stage({seed:42,autopilot:false});const q2=t2.others[0];t2.put(q2,t2.h.x,4.5);t2.others.slice(1).forEach(p=>t2.put(p,t2.h.x-t2.s*5,p.z));
 t2.e.step({...NO_INPUT,passPress:true,passDouble:true});assert.equal(t2.e.drainEvents().find(x=>x.type==='passStart').kind,'bounce');
 const t3=stage({seed:43,autopilot:false,play:false});const q3=t3.others[0];t3.put(q3,t3.h.x,4.5);t3.others.slice(1).forEach(p=>t3.put(p,t3.h.x-t3.s*5,p.z));
 t3.e.step({...NO_INPUT,passPress:true,passDouble:true});assert.equal(t3.e.drainEvents().find(x=>x.type==='passStart').kind,'chest','layer off: a double tap is a plain tap');
});

test('off-ball shoot button near the rim asks the handler AI for the lob; the AI throws it when the line is open',()=>{
 const t=stage({seed:51,autopilot:false});const {S,a,h,s,rim,big,put,e}=t;
 S.controlled=big.id;put(big,rim.x-s*2.6,0.8,s*3,0);
 const toRim={...NO_INPUT,move:{x:s,z:-0.25}};             // the child keeps running at the rim while he asks
 e.step({...toRim,shootDown:true});const ev=e.drainEvents();
 assert.ok(ev.find(x=>x.type==='oopCall'&&x.playerId===big.id),'the call is made');assert.equal(ev.some(x=>x.type==='jump'),false,'he does not jump for nothing');
 assert.ok(h.intent.wantOop&&h.intent.wantOop.id===big.id);
 // on offence the auto-control hands the child the ball handler, so from here the request is answered by the AI
 // handler while the cutter keeps his run (autopilot: everybody is the computer)
 S.autopilot=true;
 const runIn=(until,max)=>{const seen=[];for(let i=0;i<max;i++){e.step(toRim);for(const x of e.drainEvents()){seen.push(x);if(until(x))return {hit:x,seen};}}return {hit:null,seen};};
 const start=runIn(x=>x.type==='passStart',60);assert.ok(start.hit,'the handler AI answers within a second');assert.equal(start.hit.targetId,big.id);assert.equal(start.hit.oop,true);
 const caught=runIn(x=>x.type==='catch'||x.type==='interception'||x.type==='violation',240);assert.equal(caught.hit?.type,'catch');assert.equal(caught.hit.oop,true);
});

test('AI alley-oops: with aiOopChance 1 an open cutter at the rim gets the lob from the computer handler; with 0 never',()=>{
 const count=(chance,seeds)=>{let oops=0,games=0;for(const seed of seeds){const config=structuredClone(cfg);config.play.aiOopChance=chance;const setup=matchTeams(config,initialHoops(config),{stage:1});
  const e=createHoopsEngine({config,seed,teams:setup.teams,userTeam:0,profile:'quick',autopilot:true});games++;
  while(e.snapshot().phase!=='final'){e.step(NO_INPUT);for(const ev of e.drainEvents())if(ev.type==='release'&&ev.oop)oops++;}}return oops/games;};
 // a far lob that happens to meet a mate running at the rim (transition) is an alley-oop at chance 0 too; the knob adds the half-court ones
 const none=count(0,[61,62]),all=count(1,[61,62]);
 assert.ok(none<=1.5,`chance 0: ${none} a game`);assert.ok(all>=none+2.5,`chance 1: ${all} a game against ${none}`);
});

test('spacing: at most two mates park within 2.5 m of the handler; a third spot is pushed out, cutters excepted; the layer off leaves the spots alone',()=>{
 const shape=({play})=>{
  const t=stage({seed:71,play});const {S,a,h,s,rim,big,others,theirs,put,e}=t;
  // three mates crowd the handler, each with his own defender on him (so nobody cuts) and the handler's man far off
  const mates=[big,...others];const near=[[1.2,1.3],[1.2,-1.3],[-1.0,1.6]];
  mates.slice(0,3).forEach((p,i)=>put(p,h.x+s*near[i][0],near[i][1]));put(mates[3],rim.x-s*7,-6);
  const assign=S.teams[1].ai?.assign||{};
  for(const d of theirs){const o=a.byId(assign[d.id]);if(o&&o.team===0&&o!==h)put(d,o.x+s*0.5,o.z*0.9);else put(d,rim.x-s*9.5,(d.slot-2)*3);}
  for(let i=0;i<3;i++)e.step(NO_INPUT);
  const R=PLAY.spacingRadius,parked=mates.filter(p=>p.goal&&p.role!=='cut'&&p.role!=='roll'&&p.role!=='giveGo'&&Math.hypot(p.goal.x-h.x,p.goal.z-h.z)<R).length;
  return {parked,R,goals:mates.map(p=>p.goal&&+Math.hypot(p.goal.x-h.x,p.goal.z-h.z).toFixed(2))};
 };
 const on=shape({play:undefined});assert.ok(on.parked<=PLAY.spacingMax,`on: ${on.parked} mates aimed inside ${on.R} m (${on.goals})`);
 const off=shape({play:false});assert.ok(off.parked>=on.parked,`off keeps the old spots (${off.goals})`);
});

test('a doubled handler gets a cutter: the nearest free mate runs to the rim',()=>{
 const t=stage({seed:81});const {S,a,h,s,rim,big,others,theirs,put,e}=t;
 const mates=[big,...others];put(mates[0],h.x+s*2.2,3.0);put(mates[1],h.x-s*1,6);put(mates[2],h.x-s*1,-6);put(mates[3],rim.x-s*2,-6.5);
 const assign=S.teams[1].ai?.assign||{};
 for(const d of theirs){const o=a.byId(assign[d.id]);if(o===h)put(d,h.x+s*0.6,0.2);else if(o)put(d,o.x+s*0.4,o.z);}
 const extra=theirs.find(d=>a.byId(assign[d.id])!==h);put(extra,h.x-s*0.4,-0.9);  // the trap: two men inside 1.6 m, one inside 0.8 m
 for(let i=0;i<3;i++)e.step(NO_INPUT);
 assert.equal(mates[0].role,'cut',`the nearest free mate cuts (roles ${mates.map(p=>p.role).join(',')})`);
 assert.ok(Math.hypot(mates[0].goal.x-rim.x,mates[0].goal.z-rim.z)<2,'to the rim');
});
