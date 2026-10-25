import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacingControls} from '../minigames/racing-controls.mjs';
import {createRacing} from '../minigames/racing-physics.mjs';

/** Only DOM plumbing is substituted: controls and the driving model are real. */
class Element extends EventTarget {
  constructor(tag,doc){
    super();this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.dataset={};this.attributes={};this.className='';
    this.style={values:new Map(),setProperty(key,value){this.values.set(key,value);},getPropertyValue(key){return this.values.get(key)||'';}};
    this.classList={add:(...values)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...values])].join(' ');},
      remove:(...values)=>{this.className=this.className.split(' ').filter(value=>!values.includes(value)).join(' ');},
      contains:value=>this.className.split(' ').includes(value)};
  }
  setAttribute(key,value){this.attributes[key]=String(value);}
  getAttribute(key){return this.attributes[key]??null;}
  append(...elements){for(const element of elements){element.parentElement=this;this.children.push(element);}}
  setPointerCapture(){}
  closest(){return null;}
}
const fire=(target,type,values={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,values);target.dispatchEvent(event);};
function controlsFixture(t){
  const doc=new EventTarget();doc.defaultView=new EventTarget();doc.hidden=false;
  doc.createElement=tag=>new Element(tag,doc);doc.createElementNS=(_,tag)=>new Element(tag,doc);
  const root=doc.createElement('div'),canvas=doc.createElement('canvas'),controls=createRacingControls({root,canvas,t:key=>key});
  t.after(()=>controls.dispose());
  const walk=element=>[element,...element.children.flatMap(walk)],elements=walk(root);
  const slider=elements.find(element=>element.className==='racing-steer'),wheel=elements.find(element=>element.className==='racing-wheel');
  const buttons=Object.fromEntries(elements.filter(element=>element.dataset.gameControl).map(element=>[element.dataset.gameControl,element]));
  const auto=elements.find(element=>element.className==='racing-auto');
  return {controls,doc,slider,wheel,buttons,auto,
    keyDown:code=>fire(doc.defaultView,'keydown',{code}),keyUp:code=>fire(doc.defaultView,'keyup',{code}),
    drag(value){fire(slider,'pointerdown',{pointerId:1});slider.value=String(value);fire(slider,'input');}};
}

function raceAtHeading(heading,stage){
  const race=createRacing({stage,seed:17,config:{countdown:0,steeringAssist:false}});
  const distance=race.track.length*.24,point=race.track.sample(distance),player=race.state.player;
  const checkpoints=Math.floor(distance/(race.track.length/race.track.checkpoints.length));
  // An isolated, credited section avoids AI collisions and shortcut recovery in the short measurement.
  Object.assign(player,{x:point.x,y:point.y,z:point.z,heading,speed:20,steer:0,slipAngle:0,s:point.s,
    routeS:distance,previousS:distance,progress:distance,lateral:0,offroad:false,checkpoints,nextCheckpoint:checkpoints+1});
  return race;
}
function driverSideMovement(input,heading,stage){
  const driven=raceAtHeading(heading,stage),straight=raceAtHeading(heading,stage);
  for(let frame=0;frame<15;frame++){
    driven.step(1/60,input);straight.step(1/60,{autoAccelerate:true,steer:0});
  }
  const delta={x:driven.state.player.x-straight.state.player.x,z:driven.state.player.z-straight.state.player.z};
  // Screen-right is forward × up for the camera behind the driver, at every world heading.
  const forward={x:Math.sin(heading),y:0,z:Math.cos(heading)},up={x:0,y:1,z:0};
  const right={x:forward.y*up.z-forward.z*up.y,z:forward.x*up.y-forward.y*up.x};
  assert.equal(driven.state.player.recoveries,0,'the measured turn must not come from recovery');
  const movement=delta.x*right.x+delta.z*right.z;driven.dispose();straight.dispose();return movement;
}

function straightRace(t,speed=0){
  const race=createRacing({seed:17,config:{countdown:0,steeringAssist:false,stage:{opponents:0}}});
  const distance=race.track.length-2,point=race.track.sample(distance),checkpoints=15;
  Object.assign(race.state.player,{x:point.x,y:point.y,z:point.z,heading:point.heading,speed,
    s:point.s,routeS:distance,previousS:distance,progress:distance,lateral:0,offroad:false,checkpoints,nextCheckpoint:checkpoints+1});
  t.after(()=>race.dispose());return race;
}
function driveControls(race,controls,seconds){
  for(let frame=0;frame<Math.round(seconds*60);frame++)race.step(1/60,controls.sample());
  assert.equal(race.state.player.offroad,false,'speed is measured on the road');
  assert.equal(race.state.player.recoveries,0,'recovery must not supply acceleration');
  return race.state.player;
}
function holdNitro(f,source){
  if(source==='touch')fire(f.buttons.nitro,'pointerdown',{pointerId:20});else f.keyDown(source);
}
function releaseNitro(f,source){
  if(source==='touch')fire(f.buttons.nitro,'pointerup',{pointerId:20});else f.keyUp(source);
}

for(const source of ['touch','ShiftLeft','ShiftRight']){
  test(`manual ${source} nitro starts from rest, boosts physical speed, keeps driving on empty and coasts on release`,t=>{
    const f=controlsFixture(t),race=straightRace(t),plain=straightRace(t);fire(f.auto,'click');
    driveControls(race,f.controls,.3);assert.equal(race.state.player.speed,0);
    holdNitro(f,source);
    assert.equal(f.controls.sample().autoAccelerate,false);assert.equal(f.controls.sample().throttle,1);
    const p=driveControls(race,f.controls,1);
    for(let frame=0;frame<60;frame++)plain.step(1/60,{autoAccelerate:false,throttle:1});
    assert.ok(p.speed>plain.state.player.speed+2,'real nitro input accelerates faster than ordinary gas');
    assert.ok(p.nitro<65);assert.equal(p.boosting,true);
    driveControls(race,f.controls,1.7);assert.equal(p.nitro,0);assert.equal(p.boosting,false);
    const emptySpeed=p.speed;driveControls(race,f.controls,.2);
    assert.ok(p.speed>=Math.min(emptySpeed,race.stage.playerSpeed)-1e-9,'empty nitro continues ordinary gas');
    releaseNitro(f,source);assert.equal(f.controls.sample().throttle,0);
    const releasedSpeed=p.speed;driveControls(race,f.controls,.2);assert.ok(p.speed<releasedSpeed);
  });

  test(`manual ${source} nitro increases moving speed and explicit braking still wins`,t=>{
    const f=controlsFixture(t),race=straightRace(t,20);fire(f.auto,'click');holdNitro(f,source);
    const p=driveControls(race,f.controls,.3);assert.ok(p.speed>24,'holding turbo must increase speed on a straight');
    for(const code of ['ArrowDown','KeyS']){
      const before=p.speed;f.keyDown(code);assert.equal(f.controls.sample().brake,true);
      driveControls(race,f.controls,.2);assert.ok(p.speed<before,'brake overcomes nitro acceleration');f.keyUp(code);
    }
    driveControls(race,f.controls,.2);assert.ok(p.speed>20,'releasing brake restores the still-held turbo');
  });
}

for(const accelerator of ['touch','ArrowUp','KeyW'])test(`releasing turbo retains independently held ${accelerator} acceleration`,t=>{
  const f=controlsFixture(t),race=straightRace(t,15);fire(f.auto,'click');holdNitro(f,'ShiftLeft');
  if(accelerator==='touch')fire(f.buttons.accelerate,'pointerdown',{pointerId:21});else f.keyDown(accelerator);
  releaseNitro(f,'ShiftLeft');assert.equal(f.controls.sample().nitro,false);assert.equal(f.controls.sample().throttle,1);
  assert.ok(driveControls(race,f.controls,.3).speed>18);
  if(accelerator==='touch')fire(f.buttons.accelerate,'pointerup',{pointerId:21});else f.keyUp(accelerator);
  assert.equal(f.controls.sample().throttle,0);
});

test('both Shift keys and touch retain turbo until the last independent source is released',t=>{
  const f=controlsFixture(t);fire(f.auto,'click');holdNitro(f,'ShiftLeft');holdNitro(f,'ShiftRight');holdNitro(f,'touch');
  releaseNitro(f,'ShiftLeft');releaseNitro(f,'touch');assert.equal(f.controls.sample().throttle,1);assert.equal(f.controls.sample().nitro,true);
  releaseNitro(f,'ShiftRight');assert.equal(f.controls.sample().throttle,0);assert.equal(f.controls.sample().nitro,false);
});

for(const reason of ['pointercancel','lostpointercapture','blur','visibility','pause','dispose'])test(`manual turbo ${reason} releases gas and boost in the real driving model`,t=>{
  const f=controlsFixture(t),race=straightRace(t,20);fire(f.auto,'click');holdNitro(f,'touch');
  driveControls(race,f.controls,.2);
  if(reason==='pointercancel'||reason==='lostpointercapture')fire(f.buttons.nitro,reason,{pointerId:20});
  if(reason==='blur')fire(f.doc.defaultView,'blur');
  if(reason==='visibility'){f.doc.hidden=true;fire(f.doc,'visibilitychange');}
  if(reason==='pause'){
    f.controls.setEnabled(false);race.pause();const frozen=JSON.stringify(race.state);
    race.step(.2,f.controls.sample());assert.equal(JSON.stringify(race.state),frozen);
    holdNitro(f,'touch');holdNitro(f,'ShiftRight');f.controls.setEnabled(true);race.resume();
  }
  if(reason==='dispose')f.controls.dispose();
  assert.equal(f.controls.sample().throttle,0);assert.equal(f.controls.sample().nitro,false);
  const speed=race.state.player.speed,energy=race.state.player.nitro;
  const p=driveControls(race,f.controls,.2);assert.ok(p.speed<speed);assert.equal(p.nitro,energy);assert.equal(p.boosting,false);
});

for(const [code,direction]of [['ArrowRight',1],['KeyD',1],['ArrowLeft',-1],['KeyA',-1]]){
  test(`real ${code} input turns ${direction>0?'right':'left'} in the driver frame, including a reversed circuit`,t=>{
    const f=controlsFixture(t);f.keyDown(code);const input=f.controls.sample();
    for(const stage of [1,19])for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2]){
      assert.ok(driverSideMovement(input,heading,stage)*direction>.05,`${code}, stage ${stage}, heading ${heading}: driver-relative movement`);
    }
    f.keyUp(code);assert.equal(f.controls.sample().steer,0);
  });
}

for(const direction of [-1,1])test(`native range toward ${direction>0?'right':'left'} preserves its visible direction and turns the car the same way`,t=>{
  const f=controlsFixture(t);assert.equal(f.slider.type,'range');assert.equal(f.slider.min,'-1');assert.equal(f.slider.max,'1');assert.equal(f.slider.step,'.01');
  f.drag(direction*.75);
  assert.equal(f.slider.value,String(direction*.75));assert.equal(f.slider.getAttribute('aria-valuetext'),`75% ${direction>0?'ימינה':'שמאלה'}`);
  assert.equal(Number.parseFloat(f.wheel.style.getPropertyValue('--turn')),direction*28.5,'the visible arc keeps clockwise right');
  const input=f.controls.sample();
  for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2])assert.ok(driverSideMovement(input,heading,1)*direction>.05);
  fire(f.slider,'pointerup',{pointerId:1});assert.equal(f.controls.sample().steer,0);
});

test('keyboard direction overrides a held range without double-inverting either input',t=>{
  const f=controlsFixture(t);f.drag(-.75);f.keyDown('ArrowRight');
  assert.ok(driverSideMovement(f.controls.sample(),0,1)>.05);
  assert.equal(f.slider.getAttribute('aria-valuetext'),'75% שמאלה','the thumb remains at its actual touch position');
  f.keyUp('ArrowRight');assert.ok(driverSideMovement(f.controls.sample(),0,1)<-.05);
});

for(const type of ['pointerup','pointercancel','lostpointercapture','blur'])test(`range ${type} recentres the native value, visible arc, label and physical input`,t=>{
  const f=controlsFixture(t);f.drag(.65);assert.notEqual(f.controls.sample().steer,0);
  fire(f.slider,type,{pointerId:1});assert.equal(f.controls.sample().steer,0);
  assert.equal(f.slider.value,'0');assert.equal(f.wheel.style.getPropertyValue('--turn'),'0deg');assert.equal(f.slider.getAttribute('aria-valuetext'),'מרכז');
});

test('drift and nitro remain independent with multiple pointers, including two fingers on nitro',t=>{
  const f=controlsFixture(t),{drift,nitro}=f.buttons;fire(f.auto,'click');
  fire(nitro,'pointerdown',{pointerId:10});fire(drift,'pointerdown',{pointerId:11});fire(nitro,'pointerdown',{pointerId:12});
  assert.equal(f.controls.sample().nitro,true);assert.equal(f.controls.sample().drift,true);assert.equal(f.controls.sample().brake,true);
  fire(nitro,'pointerup',{pointerId:10});assert.equal(f.controls.sample().nitro,true);assert.equal(f.controls.sample().throttle,1);
  fire(drift,'pointercancel',{pointerId:11});assert.equal(f.controls.sample().drift,false);assert.equal(f.controls.sample().nitro,true);
  fire(nitro,'lostpointercapture',{pointerId:12});assert.equal(f.controls.sample().nitro,false);assert.equal(f.controls.sample().throttle,0);
});

test('pause clears physical inputs and prevents new keyboard, touch and auto-toggle actions until resumed',t=>{
  const f=controlsFixture(t);f.drag(.7);f.keyDown('ArrowRight');fire(f.buttons.nitro,'pointerdown',{pointerId:3});
  f.controls.setEnabled(false);f.keyDown('ArrowLeft');fire(f.buttons.drift,'pointerdown',{pointerId:4});fire(f.auto,'click');
  assert.deepEqual(f.controls.sample(),{steer:0,throttle:0,autoAccelerate:true,brake:false,drift:false,nitro:false});
  assert.equal(f.slider.disabled,true);assert.equal(f.buttons.nitro.disabled,true);
  f.controls.setEnabled(true);assert.equal(f.slider.disabled,false);assert.equal(f.controls.sample().steer,0);
  f.keyDown('ArrowRight');assert.ok(driverSideMovement(f.controls.sample(),0,1)>.05);
});

for(const reason of ['blur','visibility','dispose'])test(`${reason} releases every held control without retaining input`,t=>{
  const f=controlsFixture(t);fire(f.auto,'click');fire(f.buttons.accelerate,'pointerdown',{pointerId:5});
  f.drag(-.5);f.keyDown('Space');f.keyDown('ShiftLeft');
  if(reason==='blur')fire(f.doc.defaultView,'blur');
  if(reason==='visibility'){f.doc.hidden=true;fire(f.doc,'visibilitychange');}
  if(reason==='dispose')f.controls.dispose();
  assert.deepEqual(f.controls.sample(),{steer:0,throttle:0,autoAccelerate:false,brake:false,drift:false,nitro:false});
  assert.equal(f.slider.value,'0');
  if(reason==='dispose'){f.keyDown('ArrowRight');fire(f.buttons.nitro,'pointerdown',{pointerId:6});assert.equal(f.controls.sample().steer,0);assert.equal(f.controls.sample().nitro,false);}
});
