import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {createTrack} from '../minigames/racing-tracks.mjs';
import {createRacing} from '../minigames/racing-physics.mjs';
import {createRacingEffects} from '../minigames/racing-effects.mjs';

function fixture({stage=1,night=false}={}){
 const resources=new Set(),scene=new T.Scene(),track=createTrack(stage),camera=new T.PerspectiveCamera();camera.position.set(0,3,-8);camera.lookAt(0,1,0);
 const context={createRadialGradient(){return {addColorStop(){}};},fillRect(){}};
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,getContext(kind){assert.equal(kind,'2d');return context;}};}}});
 let effects;try{effects=createRacingEffects({T,scene,track,night,keep:value=>(resources.add(value),value)});}
 finally{if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete globalThis.document;}
 const root=scene.getObjectByName('racing-effects'),meshes=new Map(root.children.map(mesh=>[mesh.instanceMatrix.count,mesh]));
 const point=track.sample(80),state={time:0,events:[],player:{...point,speed:34,drifting:true,offroad:false}};
 return {scene,track,camera,state,effects,resources,root,smoke:meshes.get(32),marks:meshes.get(128),sparks:meshes.get(20),
  step(dt=1/60,quality=0){state.time+=dt;effects.update(state,dt,camera,quality);},
  fill(frames=240){for(let i=0;i<frames;i++)this.step();},close(){effects.dispose();for(const resource of resources)resource.dispose?.();}};
}
const meshes=f=>[f.smoke,f.marks,f.sparks];
function renderedSnapshot(f){return meshes(f).map(mesh=>({count:mesh.count,matrix:Array.from(mesh.instanceMatrix.array)}));}

test('hundreds of racing-effect frames reuse fixed buffers and registered resources',()=>{
 const f=fixture(),buffers=meshes(f).map(mesh=>mesh.instanceMatrix),arrays=buffers.map(buffer=>buffer.array),registered=[...f.resources];
 try{
  assert.deepEqual(f.effects.metrics().capacity,{smoke:32,skidMarks:128,sparks:20});
  for(let i=0;i<720;i++){
   f.state.events=i%11===0?[{type:'bump',car:'player'}]:[];
   f.step(1/60,Math.floor(i/120)%3);
   const m=f.effects.metrics();assert.ok(m.smoke<=24&&m.skidMarks<=128&&m.sparks<=20);
   meshes(f).forEach((mesh,index)=>{assert.equal(mesh.instanceMatrix,buffers[index]);assert.equal(mesh.instanceMatrix.array,arrays[index]);assert.ok(mesh.instanceMatrix.array.every(Number.isFinite));});
  }
  assert.deepEqual([...f.resources],registered,'frames must not allocate more owner-managed GPU resources');
  assert.equal(f.root.children.length,3);
  for(const mesh of meshes(f)){
   assert.ok(f.resources.has(mesh.geometry));assert.ok(f.resources.has(mesh.material));
   if(mesh.material.map)assert.ok(f.resources.has(mesh.material.map));
  }
 }finally{f.close();}
});

for(const [quality,smoke,marks]of [[0,24,128],[1,16,96],[2,8,64]])test(`quality ${quality} respects its smoke and skid-mark drawing limits`,()=>{
 const f=fixture({night:true});
 try{f.fill();f.effects.update(f.state,0,f.camera,quality);assert.equal(f.smoke.count,smoke);assert.equal(f.marks.count,marks);assert.equal(f.smoke.instanceMatrix.count,32);assert.equal(f.marks.instanceMatrix.count,128);}
 finally{f.close();}
});

test('zero-delta pause frames freeze effect transforms, lifetimes and emissions',()=>{
 const f=fixture();
 try{
  f.fill();f.state.events=[{type:'bump',car:'player'}];f.step();const before=renderedSnapshot(f),metrics=f.effects.metrics();
  f.state.time+=100;f.state.player.x+=50;f.state.events=[{type:'bump',car:'player'}];
  for(let i=0;i<300;i++)f.effects.update(f.state,0,f.camera,0);
  assert.deepEqual(renderedSnapshot(f),before);assert.deepEqual(f.effects.metrics(),metrics);
 }finally{f.close();}
});

test('smoke, impact sparks and skid marks expire after emissions stop',()=>{
 const f=fixture();
 try{
  f.fill();f.state.events=[{type:'bump',car:'player'}];f.step();assert.ok(f.smoke.count>0&&f.marks.count>0&&f.sparks.count>0);
  f.state.player.drifting=false;f.state.player.offroad=false;f.state.player.speed=0;f.state.events=[];
  f.step(.36);assert.equal(f.sparks.count,0);assert.ok(f.marks.count>0);
  f.step(.7);assert.equal(f.smoke.count,0);assert.ok(f.marks.count>0);
  f.step(12.1);assert.equal(f.marks.count,0);assert.equal(f.sparks.count,0);
 }finally{f.close();}
});

test('an AI-only collision cannot create player impact sparks',()=>{
 const f=fixture();
 try{f.state.player.drifting=false;f.state.events=[{type:'bump',car:'ai-1'},{type:'carCollision',car:'ai-2'}];f.step();assert.equal(f.sparks.count,0);}
 finally{f.close();}
});

test('a real physics bump triggers sparks once and cannot replay at the same physics time',()=>{
 const f=fixture(),race=createRacing({stage:1,seed:97,config:{countdown:0}});
 try{
  const point=race.track.sample(80),player=race.state.player,other=race.state.cars[1];
  Object.assign(player,{...point,speed:24,routeS:80,previousS:80,progress:80,lateral:0});
  Object.assign(other,{...point,x:point.x+point.normal.x*1.6,z:point.z+point.normal.z*1.6,speed:24,routeS:80,previousS:80,progress:80,lateral:1.6});
  for(const car of race.state.cars.slice(2))car.finished=true;
  race.step(1/60,{autoAccelerate:true});
  assert.ok(race.state.events.some(event=>event.type==='bump'&&event.car==='player'),'fixture must produce the real physics collision event');
  f.effects.update(race.state,1/60,f.camera,0);assert.ok(f.sparks.count>0,'real physics event must activate collision feedback');
  f.effects.update(race.state,.36,f.camera,0);assert.equal(f.sparks.count,0);
  f.effects.update(race.state,1/60,f.camera,0);assert.equal(f.sparks.count,0,'rendering the same event again must not create a fresh burst');
 }finally{race.dispose();f.close();}
});

test('skid marks follow the vehicle heading through left and right turns',()=>{
 for(const heading of [0,Math.PI/4,Math.PI/2,-.9]){
  const f=fixture();try{
   f.state.player.heading=heading;f.step(.04);assert.ok(f.marks.count>0);
   const matrix=new T.Matrix4();f.marks.getMatrixAt(0,matrix);
   const markAxis=new T.Vector3(0,1,0).transformDirection(matrix),forward=new T.Vector3(Math.sin(heading),0,Math.cos(heading));
   assert.ok(Math.abs(markAxis.dot(forward))>.999,`skid direction must follow vehicle heading ${heading}`);
  }finally{f.close();}
 }
});

test('double disposal detaches effects and releases instance buffers once without consuming shared resources',()=>{
 const f=fixture(),unrelated=new T.Group();f.scene.add(unrelated);f.fill();
 const instanceDisposals=new Map(),resourceDisposals=new Map();
 for(const mesh of meshes(f)){instanceDisposals.set(mesh,0);mesh.addEventListener('dispose',()=>instanceDisposals.set(mesh,instanceDisposals.get(mesh)+1));}
 for(const resource of f.resources){resourceDisposals.set(resource,0);resource.addEventListener('dispose',()=>resourceDisposals.set(resource,resourceDisposals.get(resource)+1));}
 const before=renderedSnapshot(f);f.effects.dispose();f.effects.dispose();
 assert.deepEqual(f.scene.children,[unrelated]);assert.equal(f.effects.metrics().disposed,true);
 f.state.events=[{type:'bump',car:'player'}];f.step(.2);assert.deepEqual(renderedSnapshot(f),before);
 assert.ok([...instanceDisposals.values()].every(count=>count===1));
 assert.ok([...resourceDisposals.values()].every(count=>count===0),'shared geometry, materials and texture belong to the view');
 for(const resource of f.resources)resource.dispose();
 assert.ok([...resourceDisposals.values()].every(count=>count===1));
});
