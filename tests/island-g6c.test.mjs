import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createNavalModel,navalLead,navalSoftAim} from '../workout/island/minigames/naval.mjs';
import {navalCameraPose,navalWorldPoint,projectNavalPoint,navalWaterAt} from '../workout/island/minigames/naval-camera.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';
import {createNavalInput} from '../workout/island/minigames/naval-controls.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,b=config.navalDuel;
const make=(level=1,seed=0)=>createNavalModel({config,balance:b,level,seed,random:seededRandom(seed)});
const advance=(m,seconds,input={})=>{for(let i=0;i<Math.ceil(seconds/.02);i++)m.update(.02,input);};
const near=(a,z)=>assert.ok(Math.abs(a-z)<1e-7,`${a} != ${z}`);
function navalInputHarness(t){
 const node=()=>{const listeners=new Map();return {matches:()=>false,addEventListener(type,fn,{signal}){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);signal.addEventListener('abort',()=>list.splice(list.indexOf(fn),1),{once:true});},emit(type,props={}){const e={target:this,pointerId:7,button:0,clientX:700,clientY:320,preventDefault(){},...props};for(const fn of [...listeners.get(type)||[]])fn(e);}};};
 const fire=node(),canvas={...node(),getBoundingClientRect:()=>({left:0,top:0,width:844,height:390})},win=node(),doc=node(),controls={querySelector:s=>s==='#shoot'?fire:null,dataset:{},style:{setProperty(){}}},saved=new Map(['window','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.defineProperty(globalThis,'window',{configurable:true,value:win});Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 const model=make(),input=createNavalInput({canvas,controls,balance:b},()=>model,()=>null);
 t.after(()=>{input.dispose();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 return {model,fire,canvas,win,frame(raw={}){model.update(.02,input.sample(raw));},down(){fire.emit('pointerdown');win.emit('pointerdown',{target:fire});},up(){win.emit('pointerup',{target:fire});},click(pointerType,detail=0){fire.emit('click',{detail,pointerType});},key(type,code,target=fire){const event={code,key:code==='Space'?' ':code,repeat:false,target};if(target===fire)fire.emit(type,event);win.emit(type,event);}};
}
test('G6c touch pointerdown/up followed by a detail-zero compatibility click fires exactly once',t=>{
 const h=navalInputHarness(t);h.down();for(let i=0;i<35;i++)h.frame();assert.equal(h.model.fired,0);h.up();h.click('touch');for(let i=0;i<5;i++)h.frame();assert.equal(h.model.fired,1);assert.equal(h.model.snapshot().ammo[0],b.levels[0].ammunition[0]-1);
});
test('G6c detail-zero clicks require a fresh keydown on the fire button and reject pointer devices',t=>{
 const h=navalInputHarness(t);
 for(const pointerType of ['touch','mouse','pen',undefined]){h.click(pointerType);h.frame();}assert.equal(h.model.fired,0);
 for(const pointerType of ['touch','mouse','pen']){h.key('keydown','Enter');h.click(pointerType);h.frame();h.click(undefined);h.frame();}assert.equal(h.model.fired,0);
 h.key('keydown','Enter');h.click(undefined);h.frame();h.click(undefined);h.frame();assert.equal(h.model.fired,1);
 h.key('keydown','Enter',h.win);h.click(undefined);h.frame();assert.equal(h.model.fired,1);
});
test('G6c Space release cannot be counted again as a keyboard compatibility click',t=>{
 const h=navalInputHarness(t);h.key('keydown','Space');h.frame();assert.equal(h.model.fired,0);h.key('keyup','Space');h.click(undefined);for(let i=0;i<5;i++)h.frame();assert.equal(h.model.fired,1);
});
test('G6e the shared controller cannot overwrite the bearing selected on the water',t=>{
 const h=navalInputHarness(t),point={clientX:620,clientY:215};h.canvas.emit('pointerdown',point);h.frame({yaw:.8});const selected=h.model.yaw;h.win.emit('pointerup',point);h.frame({yaw:.8});h.frame({yaw:.8});near(h.model.yaw,selected);assert.notEqual(selected,.8);
 h.canvas.emit('pointerdown',point);h.win.emit('pointermove',{clientX:700,clientY:-2000});h.frame({yaw:.8});const horizon=h.model.yaw;near(horizon,selected);h.win.emit('pointerup',{clientX:700,clientY:-2000});h.frame({yaw:.8});h.frame({yaw:.8});near(h.model.yaw,horizon);
});
test('G6c camera is behind and above the bow at every ship heading',()=>{
 for(let i=0;i<24;i++){const heading=i*Math.PI/12,ship={x:100,z:12,heading},aim={x:300,z:0},c=navalCameraPose(ship,aim,false,b),p=navalWorldPoint(ship.x,ship.z,b),forward={x:Math.sin(heading),z:-Math.cos(heading)};
 assert.ok((c.position.x-p.x)*forward.x+(c.position.z-p.z)*forward.z<0);assert.ok(c.position.y>p.y);near((c.position.x-p.x)*Math.cos(heading)+(c.position.z-p.z)*Math.sin(heading),0);
 }
});
test('G6c follow turns smoothly through the shortest wrap and follows simulated movement',()=>{
 const ship={x:60,z:0,heading:Math.PI-.02},aim={x:300,z:0},before=navalCameraPose(ship,aim,false,b);ship.heading=-Math.PI+.02;const after=navalCameraPose(ship,aim,false,b,before,.02);assert.ok(after.heading>before.heading&&after.heading-before.heading<.04);
 const m=make(),position={...m.playerShip};advance(m,1,{moveX:.5,moveZ:-.5});assert.ok(Math.hypot(m.playerShip.x-position.x,m.playerShip.z-position.z)>1);assert.ok(Math.abs(m.camera.heading-m.playerShip.heading)>.05);for(const e of [m.playerShip,...m.enemies.filter(e=>e.active)]){const q=m.screenPoint(e.x,e.z);assert.ok(q.depth>0&&q.x>0&&q.x<config.width&&q.y>0&&q.y<config.height);}
});
test('G6c aiming gives a modest lens change while retaining the player and targets',()=>{
 const m=make(),before=m.camera;advance(m,.8,{aimHeld:true,autoAim:true});const aimed=m.camera;assert.ok(m.aiming);assert.equal(m.fired,0);assert.ok(aimed.fov<before.fov&&aimed.fov>=before.fov-3);for(const e of [m.playerShip,...m.enemies.filter(e=>e.active)]){const q=m.screenPoint(e.x,e.z);assert.ok(q.depth>0&&q.x>0&&q.x<config.width&&q.y>0&&q.y<config.height);}advance(m,1);assert.equal(m.aiming,false);assert.ok(m.camera.fov>aimed.fov);
});
test('G6c screen/water mapping roundtrips at zoom, normal and turned views',()=>{
 for(const heading of [0,.5,-.6])for(const aiming of [true,false]){const ship={x:90,z:20,heading},c=navalCameraPose(ship,{x:300,z:0},aiming,b);for(const size of [[844,390],[740,360],[1440,1000]]){const point={x:260,z:30},q=projectNavalPoint(navalWorldPoint(point.x,point.z,b),c,...size),actual=navalWaterAt(q.x,q.y,c,...size,b);near(actual.x,point.x);near(actual.z,point.z);}}
});
test('G6c lead uses the actual flight time and manual assistance decreases by difficulty',()=>{
 const ship={x:60,z:0},e={x:300,z:10,vx:4,vz:2,active:true,hp:1};const lead=navalLead(ship,e,b),flight=b.targeting.flightSeconds+Math.hypot(lead.x-ship.x,lead.z-ship.z)*b.targeting.secondsPerRange;assert.ok(Math.abs(lead.x-e.x-e.vx*flight)<.001);const aim={x:260,z:10};assert.ok(navalSoftAim(aim,[e],b,1).x>navalSoftAim(aim,[e],b,10).x);
});
test('G6e a quick release locks and fires at the visible reticle',()=>{const m=make();m.beginAim();const aim={...m.aim};m.update(.02,{fireRelease:true});assert.equal(m.fired,1);assert.equal(m.ball.targetX,aim.x);assert.equal(m.ball.targetZ,aim.z);});
test('G6c overlapping cannon fire preserves the older torpedo weapon',()=>{
 const m=make();m.update(.02,{ammoIndex:2,targetX:b.enemyX,targetZ:0,firing:true});m.update(.02,{});m.update(.02,{ammoIndex:0,targetX:65,targetZ:180,firing:true});assert.equal(m.extraShots[0].ammo,2);assert.equal(m.ball.ammo,0);advance(m,2);assert.ok(m.snapshot().hits>0);
});
test('G6c a touching torpedo contacts the hull before its distant aim point',()=>{
 const nearBalance={...b,enemyX:140},m=createNavalModel({config,balance:nearBalance,level:1,seed:0,random:seededRandom(0)});m.playerShip.x=140-b.aim.hullLength/2;const hp=m.enemyShip.hp;m.update(.02,{ammoIndex:2,targetX:420,targetZ:0,firing:true});advance(m,.1);assert.ok(m.enemyShip.hp<hp);assert.ok(m.ball.age<m.ball.duration||m.blast.hit);
});
test('G6c submerged hull rejects quick shells while guided missile selects it',()=>{
 const m=make(11,0),sub=m.enemies.find(e=>e.active&&b.shipTypes[e.kind].submarine);assert.ok(sub);advance(m,b.combat.submarineSurface+.2);const hp=sub.hp;m.update(.02,{targetX:sub.x,targetZ:sub.z,firing:true});advance(m,1);assert.equal(sub.hp,hp);m.update(.02,{ammoIndex:1});m.beginAim(sub.index);m.update(.02,{fireRelease:true});advance(m,1);assert.ok(sub.hp<hp);
});
test('G6c calibration is finite, local, monotonic and under the requested render budget',()=>{
 assert.equal(b.aim.difficulty.length,10);for(let i=0;i<10;i++){const d=b.aim.difficulty[i];assert.ok(d.assist>0&&d.assist<=1&&d.radius>0);if(i)assert.ok(d.assist<b.aim.difficulty[i-1].assist&&d.radius<b.aim.difficulty[i-1].radius);}
 assert.ok(b.render.follow.distance>b.render.follow.aimDistance);assert.ok(b.render.follow.fov>b.render.follow.aimFov);assert.ok(b.render.maxTriangles<=90000&&b.render.maxDrawCalls<=70);for(const spec of [b.playerModel,b.enemyModel,b.shipTypes[1].modelSpec,b.boss.modelSpec])assert.match(spec.path,/^assets\/models\/[\w-]+\.glb$/);
});
test('G6c simulation and camera remain deterministic across identical input streams',()=>{
 const a=make(7,22),z=make(7,22);for(let i=0;i<800;i++){const input={autoAim:true,aimHeld:i%60<25,firing:i%60===25,moveX:Math.sin(i)*.1,moveZ:-.2,ammoIndex:i>400?2:0};a.update(.02,input);z.update(.02,input);}assert.deepEqual(a.snapshot(),z.snapshot());
});
test('G6c the short path and shell share muzzle height while torpedoes remain at sea level',async()=>{
 const {navalProjectileHeight}=await import('../workout/island/minigames/naval-camera.mjs');near(navalProjectileHeight(0,0,0,b),b.render.effects.muzzleY*b.render.playerScale);near(navalProjectileHeight(0,1,0,b),0);assert.ok(navalProjectileHeight(0,.5,0,b)>1);for(let t=0;t<4;t+=.1)assert.ok(navalProjectileHeight(2,.5,t,b)<b.render.effects.torpedoHeight+b.aim.torpedoBob*b.render.worldScale+.001);
});
test('G6c a target astern cannot flip the aiming camera away from the bow',()=>{
 const ship={x:300,z:0,heading:0},aim={x:60,z:0};let camera=navalCameraPose(ship,aim,false,b);for(let i=0;i<150;i++){camera=navalCameraPose(ship,aim,true,b,camera,.02);assert.ok(camera.focus.z<camera.position.z);assert.ok(Object.values(projectNavalPoint(navalWorldPoint(320,0,b),camera,844,390)).every(Number.isFinite));}
});
test('G6c a later shell cannot inherit the last torpedo contact as a guaranteed hit',()=>{
 const nearBalance={...b,enemyX:140},m=createNavalModel({config,balance:nearBalance,level:1,seed:0,random:seededRandom(0)});m.playerShip.x=123;m.update(.02,{ammoIndex:2,targetX:420,targetZ:0,firing:true});advance(m,.15);const hp=m.enemyShip.hp;assert.ok(hp<2&&hp>0);m.update(.02,{ammoIndex:0,targetX:65,targetZ:180,firing:true});advance(m,1.2);assert.equal(m.enemyShip.hp,hp);assert.equal(m.snapshot().hits,1);
});
