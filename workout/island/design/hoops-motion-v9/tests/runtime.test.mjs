/** Public runtime behavior tests. Fixtures are synthetic animation/resources. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../runtime/vendor/three.module.js';
import {CLIPS,CLIP_IDS} from '../runtime/catalog.mjs';
import {STATE_IDS,DRIBBLE_STATES,LEGAL_TRANSITIONS,TRANSITION_GRAPH,effectiveTransitionGraph,createStateMachine} from '../runtime/state-machine.mjs';
import {createClipController,createMotionPlayer,disposeClip,loadClip,disposeRuntime} from '../runtime/library.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function loaded(id,{loop=false,duration=1,events=[]}={}){
 const scene=new THREE.Group(),hips=new THREE.Object3D();hips.name='Hips';scene.add(hips);
 const animation=new THREE.AnimationClip(id,duration,[new THREE.VectorKeyframeTrack('Hips.position',[0,duration],[0,0,0,1,0,0])]);
 return{id,format:'glb',meta:{...CLIPS[id],loop,durationSeconds:duration,events},scene,animation,hips};
}
const nearly=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} should equal ${b}`);

test('expanded graph covers every state and only concrete, catalogued edges',()=>{
 assert.deepEqual(STATE_IDS,['idle',...CLIP_IDS]);
 assert.equal(STATE_IDS.length,84);
 assert.deepEqual(Object.keys(TRANSITION_GRAPH),STATE_IDS);
 const edgeKeys=new Set();
 for(const from of STATE_IDS){assert.ok(Object.isFrozen(TRANSITION_GRAPH[from]));assert.equal(new Set(TRANSITION_GRAPH[from]).size,TRANSITION_GRAPH[from].length);for(const to of TRANSITION_GRAPH[from]){assert.ok(STATE_IDS.includes(to),`${from} → ${to}`);edgeKeys.add(`${from}/${to}`);}}
 assert.equal(LEGAL_TRANSITIONS.length,edgeKeys.size);
 for(const edge of LEGAL_TRANSITIONS){assert.ok(edgeKeys.has(`${edge.from}/${edge.to}`));assert.equal(edge.requiresDribbleAvailable,DRIBBLE_STATES.includes(edge.to));}
 assert.throws(()=>createStateMachine({initialState:'missing-state'}),RangeError);
});

test('no presentation path through pivot, idle or a catch reopens a stopped dribble',()=>{
 const policy=createStateMachine({possession:{epoch:0,owner:'self'}});
 for(const id of ['walk_ball','brake_ball','pivot_reverse_left','idle_relaxed','rebound_land','idle'])assert.equal(policy.transition(id).ok,true,id);
 assert.equal(policy.context.dribbleEnded,true);
 assert.equal(policy.transition('walk_ball').reason,'dribble-ended-this-possession');
 const graph=policy.effectiveGraph(),visited=new Set(),queue=['brake_ball'];
 while(queue.length){const from=queue.shift();if(visited.has(from))continue;visited.add(from);for(const to of graph[from]){assert.ok(!DRIBBLE_STATES.includes(to),`${from} must not reopen ${to}`);if(!visited.has(to))queue.push(to);}}
 assert.ok(visited.has('pivot_reverse_right'));assert.ok(visited.has('rebound_land'));assert.ok(visited.has('idle'));
 for(const [from,targets] of Object.entries(effectiveTransitionGraph({owner:'self',dribbleEnded:true})))for(const to of targets)assert.ok(!DRIBBLE_STATES.includes(to),`${from} → ${to}`);
 policy.authorizePossession({epoch:1,owner:'self'});assert.equal(policy.transition('walk_ball').ok,true,'new authority epoch permits a new dribble');
});

test('authority epochs are monotonic; initial clips and presentation events cannot grant possession',()=>{
 const policy=createStateMachine({initialState:'walk_ball'});
 assert.equal(policy.context.hasPossession,false);
 assert.equal(policy.transition('run_ball').reason,'authoritative-possession-required');
 assert.throws(()=>policy.authorizePossession({epoch:-1,owner:'self'}),TypeError);
 assert.throws(()=>policy.authorizePossession({epoch:.5,owner:'self'}),TypeError);
 assert.throws(()=>policy.authorizePossession({epoch:0,owner:'unknown'}),TypeError);
 policy.authorizePossession({epoch:0,owner:'other'});
 assert.equal(policy.transition('run_ball').reason,'authoritative-possession-required');
 assert.throws(()=>policy.authorizePossession({epoch:0,owner:'self'}),RangeError);
 policy.authorizePossession({epoch:1,owner:'self'});
 assert.equal(policy.transition('run_ball').ok,true);
 assert.equal(policy.transition('brake_ball').ok,true);
 const before=policy.snapshot();
 for(const name of ['contact','secure','release','score','land'])assert.deepEqual(policy.handlePresentationEvent({domain:'presentation',name,owner:'self',epoch:999,score:3}),before);
 assert.throws(()=>policy.handlePresentationEvent({domain:'gameplay',name:'secure'}),TypeError);
 assert.throws(()=>policy.authorizePossession({epoch:1,owner:'self'}),RangeError);
 assert.throws(()=>policy.authorizePossession({epoch:0,owner:'self'}),RangeError);
 assert.equal(policy.context.dribbleEnded,true);
 policy.authorizePossession({epoch:2,owner:null});assert.equal(policy.context.dribbleEnded,false);assert.equal(policy.context.hasPossession,false);
});

test('a protected pivot before dribbling preserves the first dribble entitlement',()=>{
 const policy=createStateMachine({possession:{epoch:0,owner:'self'}});
 assert.equal(policy.transition('pivot_reverse_left').ok,true);
 assert.equal(policy.context.dribbleEnded,false);
 assert.equal(policy.transition('dribble_crossover_left').ok,true);
 assert.equal(policy.context.dribbleStarted,true);
 assert.equal(policy.transition('idle_ready_ball').ok,true);
 assert.equal(policy.transition('dribble_crossover_right').reason,'dribble-ended-this-possession');
});

test('real AnimationMixer controller clamps one-shots, seeks silently and preserves pause',()=>{
 const clip=loaded('jump_shot',{events:[{name:'release',time:.5,atSeconds:.5}]}),events=[];
 const player=createClipController({THREE,clip,onEvent:e=>events.push(e)});
 player.seek(.25);nearly(clip.hips.position.x,.25);assert.equal(events.length,0);
 player.pause().update(.3);nearly(player.time,.25);nearly(clip.hips.position.x,.25);
 player.resume().update(.5);nearly(player.time,.75);nearly(clip.hips.position.x,.75);
 assert.deepEqual(events.map(e=>[e.name,e.domain,e.clipId,e.cycle]),[['release','presentation','jump_shot',0]]);
 player.update(10);nearly(player.time,1);nearly(clip.hips.position.x,1);assert.equal(player.playing,false);
 player.update(1);assert.equal(events.length,1);
 assert.throws(()=>player.update(-.1),RangeError);assert.throws(()=>player.seek(Infinity),TypeError);
 player.dispose();assert.equal(player.clip,null);assert.equal(player.playing,false);
});

test('loop updates cross multiple cycles without losing or duplicating events',()=>{
 const clip=loaded('walk',{loop:true,events:[{name:'left_plant',time:.25},{name:'right_plant',time:.75}]}),events=[];
 const controller=createClipController({THREE,clip,onEvent:e=>events.push(e)});
 controller.update(2.8);nearly(controller.time,.8);nearly(clip.hips.position.x,.8);
 assert.deepEqual(events.map(e=>[e.name,e.cycle]),[['left_plant',0],['right_plant',0],['left_plant',1],['right_plant',1],['left_plant',2],['right_plant',2]]);
 controller.update(.4);nearly(controller.time,.2);assert.equal(events.length,6);
 controller.update(.1);assert.deepEqual(events.at(-1).name,'left_plant');assert.equal(events.at(-1).cycle,3);
 controller.dispose();
});

test('an event callback can replace playback without dispatching stale later events',()=>{
 const first=loaded('walk',{loop:true,events:[{name:'switch',time:.25},{name:'stale',time:.75}]}),second=loaded('jog'),events=[];
 const controller=createClipController({THREE,onEvent:e=>{events.push(e.name);if(e.name==='switch')controller.play(second);}});
 controller.play(first).update(3);assert.deepEqual(events,['switch']);assert.equal(controller.clip,second);nearly(controller.time,0);controller.dispose();
});

test('motion player checks authority before IO, then supersedes asynchronous requests',async()=>{
 const calls=[],pending=new Map();
 const load=(id,options)=>{calls.push({id,options});const d=deferred();pending.set(id,d);return d.promise;};
 const player=createMotionPlayer({THREE,load,loadOptions:{purpose:'runtime test'}});
 assert.equal((await player.play('walk_ball')).reason,'authoritative-possession-required');assert.equal(calls.length,0);
 const slow=player.play('idle_relaxed'),fast=player.play('run');
 pending.get('run').resolve(loaded('run'));
 assert.equal((await fast).ok,true);assert.equal(player.state,'run');
 pending.get('idle_relaxed').resolve(loaded('idle_relaxed'));
 assert.equal((await slow).reason,'superseded');assert.equal(player.clip.id,'run');
 assert.deepEqual(calls.map(c=>c.options),[{purpose:'runtime test',format:'glb'},{purpose:'runtime test',format:'glb'}]);
 player.dispose();
});

test('authority updates cancel an in-flight owned-ball playback request',async()=>{
 const d=deferred();let calls=0;
 const player=createMotionPlayer({THREE,possession:{epoch:0,owner:'self'},load:()=>{calls++;return d.promise;}});
 const request=player.play('walk_ball');player.authorizePossession({epoch:1,owner:'other'});d.resolve(loaded('walk_ball'));
 assert.equal((await request).reason,'superseded');assert.equal(player.clip,null);assert.equal(player.state,'idle');
 assert.equal((await player.play('walk_ball')).reason,'authoritative-possession-required');assert.equal(calls,1);player.dispose();
});

test('same-clip requests share one load, rejected loads can retry',async()=>{
 const d=deferred();let calls=0;
 const player=createMotionPlayer({THREE,load:()=>{calls++;return d.promise;}});
 const first=player.play('walk'),second=player.play('walk');assert.equal(calls,1);d.resolve(loaded('walk'));
 assert.equal((await first).reason,'superseded');assert.equal((await second).ok,true);player.dispose();
 let attempts=0;const retry=createMotionPlayer({THREE,load:()=>++attempts===1?Promise.reject(new Error('temporary read failure')):Promise.resolve(loaded('walk'))});
 await assert.rejects(retry.play('walk'),/temporary read failure/);assert.equal((await retry.play('walk')).ok,true);assert.equal(attempts,2);retry.dispose();
});

test('late load after disposal frees owned GPU resources exactly once',async()=>{
 const d=deferred(),geometry=new THREE.BufferGeometry(),material=new THREE.MeshBasicMaterial();let geometries=0,materials=0;
 geometry.addEventListener('dispose',()=>geometries++);material.addEventListener('dispose',()=>materials++);
 const clip=loaded('walk');clip.scene.add(new THREE.Mesh(geometry,material));
 const player=createMotionPlayer({THREE,load:()=>d.promise,ownsLoadedClips:true});
 const request=player.play('walk');player.dispose();d.resolve(clip);
 assert.equal((await request).reason,'superseded');assert.equal(geometries,1);assert.equal(materials,1);assert.equal(player.clip,null);
 player.dispose();assert.equal(geometries,1);assert.equal((await player.play('walk')).reason,'disposed');
});

test('disposeClip deduplicates shared scenes, material arrays, textures, skeletons and images',()=>{
 let geometries=0,materials=0,textures=0,images=0;
 const geometry=new THREE.BufferGeometry(),image={close(){images++;}},texture=new THREE.Texture(image),material=new THREE.MeshBasicMaterial({map:texture});
 geometry.addEventListener('dispose',()=>geometries++);material.addEventListener('dispose',()=>materials++);texture.addEventListener('dispose',()=>textures++);
 material.uniforms={sameTexture:{value:[texture,texture]}};
 const scene=new THREE.Group(),alternate=new THREE.Group(),parent=new THREE.Group();parent.add(scene);
 const skeleton=new THREE.Skeleton([new THREE.Bone()]);skeleton.boneTexture=texture;
 const mesh=new THREE.SkinnedMesh(geometry,[material,material]);mesh.skeleton=skeleton;scene.add(mesh);alternate.add(new THREE.Mesh(geometry,material));
 const clip={scene,gltf:{scenes:[scene,alternate]}};
 assert.deepEqual(disposeClip(clip),{geometries:1,materials:1,textures:1,skeletons:1,images:1});
 assert.equal(scene.parent,null);assert.equal(geometries,1);assert.equal(materials,1);assert.equal(textures,1);assert.equal(images,1);
 assert.deepEqual(disposeClip(clip),{geometries:0,materials:0,textures:0,skeletons:0,images:0});
});

const worldGuide=(controller,name,localPoint)=>controller.clip.scene.getObjectByName(name).localToWorld(new THREE.Vector3(...localPoint)).add(new THREE.Vector3(...controller.referenceRootTranslationMeters));

test('decoded run/sprint to brake matches the landing phase, locks the stance sole and introduces no airborne stop',async()=>{
 const cases=[['run','brake',0],['run','brake',.24],['run_ball','brake_ball',.24],['sprint','brake',.19]];
 try{for(const [sourceId,targetId,start]of cases){
   const source=await loadClip(sourceId,{format:'glb'}),target=await loadClip(targetId,{format:'glb'}),controller=createClipController({THREE,clip:source});
   try{
     controller.seek(start);const before=worldGuide(controller,'Hips',[0,0,0]);controller.play(target);
     assert.ok(controller.transition,'the transition must be reported');
     const requested=controller.transition;
     assert.ok(requested.blendSeconds>0&&requested.blendSeconds<=.18,'fast gaits may shorten the blend to their support duration');
     if(start){assert.equal(requested.waitingForContact,true);assert.equal(controller.clip.id,sourceId,'an airborne request keeps its source pose until actual touchdown');assert.ok(requested.secondsUntilContact>0);}
     assert.ok(worldGuide(controller,'Hips',[0,0,0]).distanceTo(before)<1e-6,'requesting a stop does not snap the hips');
     let anchor=null,foot=null,maximumSlip=0,maximumLowFoot=-Infinity,brakingSamples=0,priorLocked=null,handoffStep=0;
     for(let i=0;i<300;i++){
       if(i)controller.update(1/120);
       const transition=controller.transition;
       if(controller.clip.id!==targetId)continue;
       brakingSamples++;
       const left=worldGuide(controller,'LeftFoot',[0,-.08,0]),right=worldGuide(controller,'RightFoot',[0,-.08,0]);
       maximumLowFoot=Math.max(maximumLowFoot,Math.min(left.y,right.y));
       if(transition&&!transition.waitingForContact&&!transition.supportHandoff){
         foot=transition.plantedFoot;const point=foot==='LeftFoot'?left:right;anchor||=point.clone();maximumSlip=Math.max(maximumSlip,point.distanceTo(anchor));priorLocked=point.clone();
       }else if(priorLocked&&transition?.supportHandoff){
         const point=foot==='LeftFoot'?left:right;handoffStep=point.distanceTo(priorLocked);priorLocked=null;
       }
     }
     assert.ok(brakingSamples>=150,sourceId+' measured the entire braking action');
     assert.ok(anchor,sourceId+' reached an actual touchdown');
     assert.ok(maximumSlip<=.02,`${sourceId} → ${targetId} decoded stance sole drift ${maximumSlip}m`);
     assert.ok(maximumLowFoot<=.020001,`${sourceId} → ${targetId} creates no new airborne interval; lowest sole maximum ${maximumLowFoot}m`);
     assert.ok(handoffStep<.002,`${sourceId} → ${targetId} retains its foot anchor after the body blend (${handoffStep}m)`);
     assert.equal(controller.transition,null,'support handoff eventually completes');
   }finally{controller.dispose();disposeClip(source);disposeClip(target);}
 }}finally{await disposeRuntime();}
});

test('decoded run to brake has continuous hip position and incoming world velocity across its touchdown seam',async()=>{
 const source=await loadClip('run',{format:'glb'}),target=await loadClip('brake',{format:'glb'}),h=1e-4,controller=createClipController({THREE,clip:source});
 try{
   // Request while airborne; the next right touchdown is exactly one half-cycle.
   controller.seek(source.meta.durationSeconds/2-2*h);controller.play(target);
   controller.update(h);const before=worldGuide(controller,'Hips',[0,0,0]),referenceVelocityBefore=controller.referenceVelocityMetersPerSecond;
   controller.update(h);const at=worldGuide(controller,'Hips',[0,0,0]);
   assert.equal(controller.clip.id,'brake');assert.equal(controller.transition.waitingForContact,false);
   controller.update(h);const after=worldGuide(controller,'Hips',[0,0,0]),referenceVelocityAfter=controller.referenceVelocityMetersPerSecond;
   const incoming=at.clone().sub(before).multiplyScalar(1/h),outgoing=after.clone().sub(at).multiplyScalar(1/h);
   assert.ok(at.distanceTo(before)<.001,'no seam position jump');
   assert.ok(outgoing.distanceTo(incoming)<.03,`C1 hip velocity bridge: ${incoming.toArray()} → ${outgoing.toArray()}`);
   assert.ok(Math.hypot(...referenceVelocityAfter.map((v,k)=>v-referenceVelocityBefore[k]))<.01,'reference root velocity stays continuous instead of dropping 4.6 → 3.2m/s');
   assert.ok(Math.abs(referenceVelocityAfter[2]-source.meta.speed)<.01);
 }finally{controller.dispose();disposeClip(source);disposeClip(target);await disposeRuntime();}
});

test('motion player exposes queued contact readiness and continuous descriptive root guidance',async()=>{
 const player=createMotionPlayer({THREE});
 try{
   assert.equal((await player.play('run')).ok,true);player.seek(.24);
   const before=player.referenceRootTranslationMeters;
   assert.equal((await player.play('brake')).ok,true);
   assert.equal(player.state,'brake');assert.equal(player.transition.waitingForContact,true);assert.equal(player.clip.id,'run');
   assert.deepEqual(player.referenceRootTranslationMeters,before);
   player.update(player.transition.secondsUntilContact+1/120);
   assert.equal(player.clip.id,'brake');assert.equal(player.transition.waitingForContact,false);
   assert.ok(player.referenceRootTranslationMeters[2]>before[2]);
   assert.ok(player.referenceVelocityMetersPerSecond[2]>3.2,'source speed is preserved at entry');
   const root=player.scene.getObjectByName('Root');assert.deepEqual(root.position.toArray(),[0,0,0]);assert.deepEqual(root.quaternion.toArray(),[0,0,0,1]);
 }finally{player.dispose();await disposeRuntime();}
});
