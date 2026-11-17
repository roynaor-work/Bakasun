import test from 'node:test';
import assert from 'node:assert/strict';
import {
 API_VERSION,CLIPS,GRAPH,TRANSITIONS,HUBS,getClip,transitionsFrom,chooseLocomotion,
 createMotionState,restoreMotionState,requestMotion,advanceMotion,setLocomotion,
 sampleMotion,sampleClip,blendPoses,poseDifference,playbackRateFor,
} from '../src/index.mjs';

const fieldContext={hasBall:true,grounded:true,ballHeightMeters:.8,spaceForScissor:true};
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);
test('source-aware graph covers89 distinct authored clips and reaches every role node',()=>{
 assert.equal(API_VERSION,'1.0.0');assert.equal(CLIPS.length,89);assert.equal(new Set(CLIPS.map(c=>c.id)).size,89);
 assert.equal(TRANSITIONS.length,917);
 for(const role of ['field','keeper','referee']){
  const reached=new Set([HUBS[role]]);let old=-1;
  while(old!==reached.size){old=reached.size;for(const e of TRANSITIONS)if(reached.has(e.from))reached.add(e.to);}
  for(const c of CLIPS.filter(c=>c.role===role))assert.ok(reached.has(c.id),`unreachable ${c.id}`);
 }
 for(const c of CLIPS){assert.match(c.provenance.commit,/^[a-f0-9]{40}$/);assert.match(c.provenance.sha256,/^[a-f0-9]{64}$/);assert.equal(c.skeleton.length,18);assert.ok(c.tracks.length>0);}
 assert.ok(Object.isFrozen(GRAPH.nodes[0]));assert.throws(()=>{GRAPH.nodes[0].id='changed';},TypeError);
});
test('canonical game speeds have exact native stride rate and external displacement',()=>{
 for(const [speed,name] of [[2.6,'jog'],[4.5,'run'],[7.2,'sprint']]){
  const selected=chooseLocomotion(speed);assert.equal(selected,`soccer-run-cycles-v3:${name}`);
  assert.equal(playbackRateFor(selected,speed),1);
  const s=setLocomotion(createMotionState(),{speedMps:speed,heading:Math.PI/2}).state;
  const result=advanceMotion(s,10);near(result.rootDisplacement[0],10*speed);near(result.rootDisplacement[2],0);
  assert.equal(result.state.clipId,selected);assert.ok(result.state.time<getClip(selected).duration);
 }
 const old=createMotionState({speedMps:7.2});
 const blocked=requestMotion(old,{clipId:'soccer-locomotion-v2:strafe_left'});
 assert.equal(blocked.events[0].type,'request-rejected');assert.ok(blocked.events[0].guards.some(g=>g.startsWith('maxSpeed:')));
 assert.throws(()=>createMotionState({clipId:'soccer-locomotion-v2:strafe_left',speedMps:7.2}),/retiming envelope/);
});
test('complete tackle and keeper recovery chains consume large dt and continue queued request',()=>{
 let s=requestMotion(createMotionState(),{clipId:'soccer-tackle-keeper-v2:slide_tackle'}).state;
 s=requestMotion(s,{clipId:'soccer-kicks-v2:short_inside_pass',ttl:2},fieldContext).state;
 const result=advanceMotion(s,1.7,fieldContext);
 assert.equal(result.state.clipId,'soccer-kicks-v2:short_inside_pass');near(result.state.time,.1);
 assert.deepEqual(result.events.filter(e=>e.type==='transition').map(e=>e.to),['soccer-tackle-keeper-v2:getup_fast',HUBS.field,'soccer-kicks-v2:short_inside_pass']);
 for(const name of ['catch_chest','catch_high','punch','save_with_foot']){
  const id=`soccer-tackle-keeper-v2:${name}`,clip=getClip(id);
  const keeper=requestMotion(createMotionState({role:'keeper'}),{clipId:id}).state;
  const out=advanceMotion(keeper,clip.duration+.1);
  assert.equal(out.state.clipId,`soccer-tackle-keeper-v2:getup_keeper_${name==='punch'||name==='save_with_foot'?'right':'left'}`);
 }
});
test('source native handoff phases and running-kick world movement are preserved',()=>{
 for(const name of ['jog','run','sprint','referee_run']){
  const c=getClip(`soccer-run-cycles-v3:idle_to_${name}`),edge=transitionsFrom(c.id).find(e=>e.kind==='automatic');
  near(edge.entryPhase*getClip(edge.to).duration,c.rawMetadata.nativeHandoff.targetPhaseSeconds);
  const result=advanceMotion(createMotionState({role:c.role,clipId:c.id,speedMps:c.rawMetadata.endSpeedMps}),c.duration);
  near(result.state.time,c.rawMetadata.nativeHandoff.targetPhaseSeconds);
 }
 const c=getClip('soccer-kicks-v2:running_kick');
 let s=requestMotion(createMotionState({speedMps:4.5}),{clipId:c.id},fieldContext).state;
 const result=advanceMotion(s,c.duration+.1,fieldContext);
 assert.equal(result.state.clipId,'soccer-run-cycles-v3:run');near(result.rootDisplacement[2],4.5*(c.duration+.1));near(result.state.time,.5);
 assert.equal(requestMotion(createMotionState({speedMps:7.2}),{clipId:'soccer-run-cycles-v3:idle_to_jog'}).events[0].type,'request-rejected');
 let bridge=createMotionState({clipId:'soccer-run-cycles-v3:idle_to_jog',speedMps:2.6});
 bridge=setLocomotion(bridge,{speedMps:7.2}).state;
 const fallback=advanceMotion(bridge,2.25);
 assert.equal(fallback.state.clipId,HUBS.field);assert.ok(fallback.events.some(e=>e.type==='automatic-speed-fallback'));
});
test('queue priority, equal-priority replacement, TTL expiry and execution-time guards',()=>{
 let s=createMotionState({clipId:'soccer-kicks-v2:placed_kick'});
 s=requestMotion(s,{clipId:'soccer-tackle-keeper-v2:fall_foul',priority:100,ttl:3}).state;
 let low=requestMotion(s,{clipId:'soccer-kicks-v2:chip',priority:50,ttl:3},fieldContext);
 assert.equal(low.events[0].type,'queue-kept');assert.equal(low.state,s);
 s=requestMotion(s,{clipId:'soccer-tackle-keeper-v2:fall_soft',priority:100,ttl:.2}).state;
 let result=advanceMotion(s,.2);assert.equal(result.state.queue,null);assert.ok(result.events.some(e=>e.type==='queue-expired'));
 s=requestMotion(createMotionState({clipId:'soccer-kicks-v2:placed_kick'}),{clipId:'soccer-kicks-v2:chip',ttl:4},fieldContext).state;
 result=advanceMotion(s,3,{hasBall:false});assert.equal(result.state.queue,null);assert.ok(result.events.some(e=>e.type==='queue-rejected'));
});
test('cancellation has explicit early window; recoveries stay locked',()=>{
 let s=createMotionState({clipId:'soccer-kicks-v2:placed_kick'});
 s=advanceMotion(s,getClip(s.clipId).duration*.14).state;
 assert.equal(requestMotion(s,{clipId:HUBS.field,cancel:true}).state.clipId,HUBS.field);
 const late=advanceMotion(s,.001).state;
 assert.equal(requestMotion(late,{clipId:HUBS.field,cancel:true}).events[0].reason,'cancel-window-closed');
 const recovery=createMotionState({clipId:'soccer-tackle-keeper-v2:getup_fast'});
 assert.equal(requestMotion(recovery,{clipId:HUBS.field,cancel:true}).events[0].type,'request-rejected');
 assert.equal(requestMotion(createMotionState(),{clipId:recovery.clipId}).events[0].reason,'recovery-requires-predecessor');
});
test('context prevents wrong roles, ball-less kicks and unsuitable aerial heights',()=>{
 const s=createMotionState();
 assert.ok(requestMotion(s,{clipId:'soccer-keeper-motion-v3:keeper_throw'},{hasBall:true}).events[0].guards.includes('role:keeper'));
 assert.ok(requestMotion(s,{clipId:'soccer-kicks-v2:chip'}).events[0].guards.includes('hasBall'));
 assert.ok(requestMotion(s,{clipId:'soccer-volley-scissor-v1:volley_right'},{ballHeightMeters:2}).events[0].guards.includes('height:0.5:1.2'));
 assert.equal(requestMotion(s,{clipId:'soccer-volley-scissor-v1:volley_right'},fieldContext).state.clipId,'soccer-volley-scissor-v1:volley_right');
});
test('one large advance matches partitioned advance including action recovery and markers',()=>{
 const start=requestMotion(createMotionState(),{clipId:'soccer-tackle-keeper-v2:slide_tackle'}).state;
 const once=advanceMotion(start,2.4);let split=start;const events=[];
 for(let i=0;i<24;i++){const r=advanceMotion(split,.1);split=r.state;events.push(...r.events);}
 assert.equal(once.state.clipId,split.clipId);near(once.state.clock,split.clock);near(once.state.time,split.time);
 assert.deepEqual(once.events.filter(e=>e.type==='transition').map(e=>e.to),events.filter(e=>e.type==='transition').map(e=>e.to));
 const all=arr=>arr.filter(e=>e.type==='clip-event').reduce((s,e)=>s+e.count,0);assert.equal(all(once.events),all(events));
});
test('huge loop advances aggregate events and keep phase/displacement bounded',()=>{
 const s=setLocomotion(createMotionState(),{speedMps:7.2}).state;
 const result=advanceMotion(s,1e6);
 assert.ok(result.events.length<20);assert.ok(result.state.cycle>1e6);near(result.rootDisplacement[2],7.2e6);
 assert.ok(result.events.some(e=>e.type==='clip-event'&&e.count>1e6));
});
test('transition starts continuous, including a request during an existing blend',()=>{
 let s=setLocomotion(createMotionState(),{speedMps:4.5}).state;s=advanceMotion(s,.07).state;
 const before=sampleMotion(s,{floor:false}).pose;
 const next=requestMotion(s,{clipId:'soccer-kicks-v2:placed_kick'},fieldContext).state;
 const after=sampleMotion(next,{floor:false}).pose;
 near(poseDifference(getClip(next.clipId),before,after).maxJointMeters,0);
 const initial=sampleClip(getClip('soccer-kicks-v2:placed_kick'),0);
 assert.ok(poseDifference(getClip(next.clipId),initial,after).maxJointMeters>.01);
});
test('state is frozen, serializable and rejects malformed phases/quaternions',()=>{
 const s=setLocomotion(createMotionState(),{speedMps:4.5}).state;
 assert.deepEqual(restoreMotionState(JSON.stringify(s)),s);assert.ok(Object.isFrozen(s.blend.fromPose[0].rotation));
 const malformed=JSON.parse(JSON.stringify(s));malformed.blend.fromPose[0].rotation=[0,0,0,0];assert.throws(()=>restoreMotionState(malformed),/zero/);
 for(const dt of [-1,NaN,Infinity])assert.throws(()=>advanceMotion(s,dt),RangeError);
 for(const id of ['toString','constructor','__proto__']){assert.throws(()=>getClip(id),RangeError);assert.throws(()=>chooseLocomotion(2,id),RangeError);}
 assert.throws(()=>sampleClip(getClip(s.clipId),NaN),RangeError);assert.throws(()=>blendPoses([],[],NaN),RangeError);
 assert.equal(advanceMotion(s,0).state.clock,s.clock);
});
