import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {navalSteeringInput,navalVisibleTarget,createNavalInput} from '../workout/island/minigames/naval-controls.mjs';
import {navalCameraPose,navalWorldPoint,projectNavalPoint,navalWaterAt} from '../workout/island/minigames/naval-camera.mjs';
import {navalLockRadius,navalLockedPoint,navalJitter} from '../workout/island/minigames/naval-lock.mjs';
import {createNavalModel} from '../workout/island/minigames/naval.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.navalDuel;
const near=(a,b,epsilon=1e-7)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

test('naval analogue directions all travel in the visible stick direction at equal throttle',()=>{
 for(const camera of [0,.7,-2.8])for(let n=0;n<8;n++){
  const angle=n*Math.PI/4,x=Math.sin(angle),z=-Math.cos(angle),input=navalSteeringInput(x,z,camera);
  assert.equal(input.active,true);near(input.throttle,1);
  near(Math.sin(input.heading-camera),x);near(-Math.cos(input.heading-camera),z);
 }
 near(navalSteeringInput(.56,0).throttle,.5);near(navalSteeringInput(.56,0).heading,Math.PI/2);
 assert.equal(navalSteeringInput(0,0).active,false);assert.equal(navalSteeringInput(.1,0).throttle,0);
 assert.equal(navalSteeringInput(1,1).throttle,1);assert.equal(navalSteeringInput(Infinity,NaN).throttle,0);
});

const fleetAt=(x=340)=>[-78,-26,26,78].map((z,index)=>({x:x+index*5,z,index,active:true,hp:2,hullScale:1}));
const battle=(ship,enemies,size,previous,aiming=false)=>navalCameraPose(ship,enemies[0],aiming,balance,previous,.02,{battle:true,enemies,width:size[0],height:size[1]});
test('naval battle framing retains the player and an entire four-ship fleet on mobile and desktop',()=>{
 for(const size of [[844,390],[740,360],[1440,900],[390,844]])for(const ship of [{x:60,z:0,heading:Math.PI},{x:200,z:95,heading:-1.8},{x:390,z:-95,heading:2.8}]){
  const enemies=fleetAt(),camera=battle(ship,enemies,size);
  for(const e of [ship,...enemies]){
   const q=projectNavalPoint(navalWorldPoint(e.x,e.z,balance),camera,...size);
   assert.ok(q.depth>1&&q.x>size[0]*.1&&q.x<size[0]*.9&&q.y>size[1]*.18&&q.y<size[1]*.84,JSON.stringify({size,ship,e,q,camera}));
  }
 }
});
test('naval real campaign openings keep a large foreground ship and visible horizon at stages 1 and 30',()=>{
 for(const level of [1,30])for(const seed of [0,1,6,17])for(const [width,height]of [[844,390],[740,360],[1440,900]]){
  const model=createNavalModel({config:{...config,width,height},balance,level,seed}),camera=model.camera,ship=model.playerShip;
  assert.ok(camera.frameHeight<=13&&camera.frameDistance<=28,'openings retain the close third-person rig');
  const stern=model.screenPoint(ship.x-5.7/balance.render.worldScale,ship.z),mast=model.screenPoint(ship.x,ship.z,5.2),size=stern.y-mast.y;
  assert.ok(size>height*.27&&size<height*.37,JSON.stringify({level,seed,width,height,size,camera}));
  const horizon=model.screenPoint(ship.x+2000,ship.z);assert.ok(horizon.y>height*.2&&horizon.y<height*.38);
  for(const enemy of model.enemies.filter(e=>e.active)){const q=model.screenPoint(enemy.x,enemy.z);assert.ok(q.depth>0&&q.x>width*.1&&q.x<width*.9&&q.y>height*.25&&q.y<height*.6);}
 }
});
test('naval narrow hull framing retains bow, stern, beam and bridge through every player heading',()=>{
 const size=[844,390],enemies=fleetAt();
 for(let n=0;n<24;n++){
  const heading=n*Math.PI/12,ship={x:60,z:0,heading},camera=battle(ship,enemies,size),q=navalWorldPoint(ship.x,ship.z,balance);
  const points=[[-5.7,0,0],[5.7,0,0],[0,-1.8,0],[0,1.8,0],[0,0,5.2],[-2,1,4.6],[2,-1,4.6]];
  for(const [along,across,y]of points){const point={x:q.x+Math.sin(heading)*along+Math.cos(heading)*across,y,z:q.z-Math.cos(heading)*along+Math.sin(heading)*across},p=projectNavalPoint(point,camera,...size);assert.ok(p.depth>1&&p.x>size[0]*.1&&p.x<size[0]*.9&&p.y>size[1]*.18&&p.y<size[1]*.88);}
 }
});
test('naval aiming preserves the battle and changes FOV by at most three degrees',()=>{
 const ship={x:60,z:0,heading:0},enemies=fleetAt(),size=[844,390];let camera=battle(ship,enemies,size);const start=camera;
 for(let frame=0;frame<90;frame++){
  ship.heading+=.1;camera=battle(ship,enemies,size,camera,true);
  assert.ok(camera.fov>=start.fov-3&&camera.fov<=start.fov);
  for(const e of [ship,...enemies]){const q=projectNavalPoint(navalWorldPoint(e.x,e.z,balance),camera,...size);assert.ok(q.depth>0&&q.x>0&&q.x<size[0]&&q.y>0&&q.y<size[1]);}
 }
 near(camera.heading,start.heading);assert.ok(camera.position.y>balance.render.follow.height);
});
test('naval a stationary fleet produces a stationary camera without repeated fit-and-zoom pulses',()=>{
 const ship={x:60,z:0,heading:0},enemies=fleetAt(),size=[844,390];let camera=battle(ship,enemies,size);const start=structuredClone(camera);
 for(let frame=0;frame<600;frame++){camera=battle(ship,enemies,size,camera);near(camera.frameDistance,start.frameDistance);near(camera.frameHeight,start.frameHeight);near(camera.position.y,start.position.y);}
});
test('naval camera turns smoothly through target changes while its sea mapping stays reversible',()=>{
 const ship={x:220,z:0,heading:0},enemies=fleetAt(340),size=[740,360];let camera=battle(ship,enemies,size);
 for(let frame=0;frame<150;frame++){
  ship.z=Math.sin(frame/30)*80;ship.x=220+frame*.9;const before=camera;camera=battle(ship,enemies,size,camera,frame>50);
  assert.ok(Math.abs(camera.heading-before.heading)<=.85*.02+1e-7);
  for(const e of [ship,...enemies]){const q=projectNavalPoint(navalWorldPoint(e.x,e.z,balance),camera,...size),water=navalWaterAt(q.x,q.y,camera,...size,balance);assert.ok(q.depth>0&&q.x>0&&q.x<size[0]&&q.y>0&&q.y<size[1]);near(water.x,e.x);near(water.z,e.z);}
 }
});
test('naval lock sway stays within a readable hull-sized bound across all thirty stages',()=>{
 const ship={x:20,z:-110},enemy={x:420,z:110};let previous=0;
 for(let stage=1;stage<=30;stage++){
  const spread=navalLockRadius(ship,enemy,balance,stage,'hard').spread;
  assert.ok(spread>previous&&spread<balance.targeting.radius);previous=spread;
 }
 const inside=navalLockRadius({x:250,z:110},enemy,balance,10),outside=navalLockRadius(ship,enemy,balance,10);
 assert.ok(inside.inside&&!outside.inside);assert.ok(outside.spread>inside.spread&&outside.spread<inside.spread*1.351);
 assert.ok(navalLockRadius(ship,enemy,balance,10,'normal',{rate:1.65}).spread<outside.spread);
});
test('naval visible reticle leads moving hulls and limits wind without a hidden hit roll',()=>{
 const ship={x:60,z:0},enemy={x:340,z:0,vx:3,vz:9},wind={x:88,z:-88};
 for(const ammo of [0,1,2,4]){
  const point=navalLockedPoint(ship,enemy,wind,balance,30,'hard',{},819,.73,ammo);
  assert.ok(Math.hypot(point.windX,point.windZ)<=balance.targeting.radius*.22+1e-8);
  const lead=ammo===1?0:point.flight;near(point.x,enemy.x+enemy.vx*lead+point.jitter.x+point.windX);near(point.z,enemy.z+enemy.vz*lead+point.jitter.z+point.windZ);
  if(ammo===1||ammo===2){near(point.windX,0);near(point.windZ,0);}
 }
});
test('naval sway is deterministic and slow enough to release at the point actually seen',()=>{
 for(let seed=0;seed<30;seed++)for(let frame=0;frame<100;frame++){
  const point=navalJitter(seed,frame/60,24),next=navalJitter(seed,(frame+1)/60,24);
  assert.deepEqual(point,navalJitter(seed,frame/60,24));assert.ok(Math.hypot(point.x,point.z)<=24*Math.SQRT2);
  assert.ok(Math.hypot(next.x-point.x,next.z-point.z)<1.5);
 }
});

test('naval target selection respects explicit taps, visible depth and the retained target',()=>{
 const model={selectedTargetIndex:1,enemies:[{index:0,x:100,z:100,hp:1,active:true},{index:1,x:500,z:100,hp:1,active:true},{index:2,x:420,z:160,hp:1,active:false},{index:3,x:420,z:120,hp:1,active:true}]};
 const project=(x,z)=>({x,y:z,depth:x===420?-1:1});
 assert.equal(navalVisibleTarget(model,project,844,390),1);
 assert.equal(navalVisibleTarget(model,project,844,390,{x:101,y:103}),0);
 assert.equal(navalVisibleTarget(model,project,844,390,{x:420,y:120}),null);
 assert.equal(navalVisibleTarget(model,project,844,390,{x:200,y:260}),null);
 model.enemies[1].hp=0;assert.equal(navalVisibleTarget(model,project,844,390),0);
});

function inputHarness(t){
 const node=()=>{const listeners=new Map();return {matches:()=>false,addEventListener(type,fn,{signal}){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);signal.addEventListener('abort',()=>list.splice(list.indexOf(fn),1),{once:true});},emit(type,props={}){const e={target:this,pointerId:7,button:0,clientX:700,clientY:320,preventDefault(){},...props};for(const fn of [...listeners.get(type)||[]])fn(e);}};};
 const fire=node(),canvas={...node(),getBoundingClientRect:()=>({left:0,top:0,width:844,height:390})},win=node(),doc=node(),controls={querySelector:s=>s==='#shoot'?fire:null,dataset:{},style:{setProperty(){}}};
 const saved=new Map(['window','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));Object.defineProperty(globalThis,'window',{configurable:true,value:win});Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 const model={ammoIndex:0,enemies:[{index:0,x:300,z:100,hp:1,active:true},{index:1,x:500,z:100,hp:1,active:true}],aim:{x:300,z:100},yaw:0,aiming:false,lockedTargetIndex:null,selectedTargetIndex:0,screenPoint:(x,z)=>({x,y:z,depth:1}),beginAim(index=0){this.aiming=true;this.lockedTargetIndex=index;this.aim={x:this.enemies[index].x,z:this.enemies[index].z};},cancelAim(){this.aiming=false;}};
 model.camera=navalCameraPose({x:60,z:0,heading:0},{x:340,z:0},false,balance);model.turret={yaw:0,elevation:6,power:1};model.time=0;
 const input=createNavalInput({canvas,controls,balance},()=>model,()=>null);
 t.after(()=>{input.dispose();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 return {model,fire,canvas,win,input};
}
test('naval tapping an enemy selects it without spending a shot, then fire locks that enemy',t=>{
 const {model,fire,canvas,win,input}=inputHarness(t);canvas.emit('pointerdown',{clientX:500,clientY:100});win.emit('pointerup',{clientX:500,clientY:100});
 const tap=input.sample({});assert.equal(tap.selectTargetIndex,1);assert.equal(tap.fireRelease,false);assert.equal(tap.targetX,undefined);
 model.selectedTargetIndex=tap.selectTargetIndex;fire.emit('pointerdown');assert.equal(model.lockedTargetIndex,1);const held=input.sample({});assert.equal(held.aimHeld,true);assert.equal(held.fireRelease,false);
 // 25/10/2026: a short press is a quick shot; a hold releases the turret's own settings, never a reticle point.
 win.emit('pointerup');const shot=input.sample({});assert.equal(shot.quickShot,true);assert.equal(shot.fireRelease,false);assert.deepEqual(shot.releaseTarget,{target:1});assert.equal(input.sample({}).quickShot,false);
 model.time=0;fire.emit("pointerdown");model.time=1.3;win.emit('pointermove',{clientX:720,clientY:280});const aimed=input.sample({});assert.equal(aimed.aimHeld,true);assert.ok(aimed.aimYaw>0);assert.ok(aimed.aimElevation>model.turret?.elevation||aimed.aimElevation>6);win.emit('pointerup',{clientX:720,clientY:280});const release=input.sample({});assert.equal(release.fireRelease,true);assert.equal(release.quickShot,false);assert.equal(release.aimYaw,aimed.aimYaw);assert.equal(release.aimElevation,aimed.aimElevation);assert.ok(release.aimPower>.9);assert.equal(input.sample({}).fireRelease,false);
});
test('naval cancellation, blur and disposal never release a held shot',t=>{
 const {fire,win,input}=inputHarness(t);
 for(const type of ['pointercancel','blur']){fire.emit('pointerdown');assert.equal(input.sample({}).aimHeld,true);win.emit(type);const canceled=input.sample({});assert.equal(canceled.fireRelease,false);assert.equal(canceled.aimHeld,false);win.emit('pointerup');assert.equal(input.sample({}).fireRelease,false);}
 fire.emit('pointerdown');input.dispose();win.emit('pointerup');assert.equal(input.sample({}).fireRelease,false);
});
