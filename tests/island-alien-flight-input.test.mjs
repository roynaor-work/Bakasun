import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {alienFlightAxis,createAlienFlightState,createAlienFlightInput} from '../workout/island/minigames/alien-flight-input.mjs';
import {alienFrameInput} from '../workout/island/minigames/alien-session.mjs';
import {moveAlienPlayer} from '../workout/island/minigames/g2m-motion.mjs';
import {alienFlightHudStatus,alienFlightFeedbackText,createAlienFlightHud} from '../workout/island/minigames/alien-flight-input-hud.mjs';
import {createAlienModel} from '../workout/island/minigames/alien-flight-model.mjs';
import {seededRandom} from '../workout/island/minigames/context.mjs';

const balance={playerRadius:18,playerSpeed:221,movement:{rampSeconds:.15,dragSeconds:.22}};
const pointer=(id,x,type='touch',y=120)=>({pointerId:id,clientX:x,clientY:y,pointerType:type,button:0});
const setup={playerX:422,modelWidth:844,cssWidth:844,playerRadius:18};
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('flight stick deadzone is continuous, symmetric and preserves useful fine movement',()=>{
 for(const value of [0,.05,.119,.12,-.12])assert.equal(alienFlightAxis(value),0);
 assert.ok(alienFlightAxis(.12001)>0&&alienFlightAxis(.12001)<.0001);
 let previous=0;for(let i=13;i<=100;i++){const value=alienFlightAxis(i/100);assert.ok(value>=previous);close(alienFlightAxis(-i/100),-value);previous=value;}
 assert.equal(alienFlightAxis(9),1);assert.equal(alienFlightAxis(-9),-1);assert.equal(alienFlightAxis(NaN),0);
 assert.ok(alienFlightAxis(.5)>.25&&alienFlightAxis(.5)<.4);
});

test('relative contact anchors the ship and a 20 CSS pixel movement scales with the real viewport',()=>{
 for(const width of [740,844,1280]){
  const state=createAlienFlightState();assert.ok(state.begin(pointer(1,52),{...setup,cssWidth:width}));assert.equal(state.sample().x,422);
  state.move(pointer(1,72));close(state.sample().x,422+20*844/width);
  state.move(pointer(1,32));close(state.sample().x,422-20*844/width);
 }
});

test('a second finger cannot take flight ownership or cancel the movement finger',()=>{
 const state=createAlienFlightState();state.begin(pointer(11,800),setup);
 assert.equal(state.begin(pointer(12,10),setup),false);assert.equal(state.move(pointer(12,40)),false);assert.equal(state.end(12),false);
 assert.equal(state.sample().id,11);assert.equal(state.sample().x,422);assert.ok(state.end(11));assert.equal(state.sample().autoFire,false);
});

test('drag clamps to the authored hit radius and a new gesture reanchors after release',()=>{
 const state=createAlienFlightState();state.begin(pointer(1,300),setup);state.move(pointer(1,9000));assert.equal(state.sample().x,826);
 state.move(pointer(1,-9000));assert.equal(state.sample().x,18);state.reset();
 state.begin(pointer(2,730),{...setup,playerX:190});assert.equal(state.sample().x,190);state.move(pointer(2,740));assert.equal(state.sample().x,200);
});

test('only a live touch or pen flight gesture requests automatic fire; mouse and idle stay manual',()=>{
 for(const type of ['touch','pen','mouse']){const state=createAlienFlightState();assert.equal(state.sample().autoFire,false);state.begin(pointer(1,300,type),setup);assert.equal(state.sample().autoFire,type!=='mouse');state.end(1);assert.equal(state.sample().autoFire,false);}
});

test('the one-dimensional stick ignores vertical displacement and has a horizontal deadzone',()=>{
 const state=createAlienFlightState();state.begin(pointer(1,100,'touch',100),{...setup,mode:'stick',centerX:100,radius:48});
 state.move(pointer(1,104,'touch',-500));assert.equal(state.sample().moveX,0);
 state.move(pointer(1,124,'touch',500));close(state.sample().moveX,alienFlightAxis(.5));
 state.move(pointer(1,180));assert.equal(state.sample().moveX,1);state.move(pointer(1,0));assert.equal(state.sample().moveX,-1);
});

test('zero-duration frames consume neither manual pulses nor relative input samples',()=>{
 let manualReads=0,flightReads=0;const controls={sample(){manualReads++;return {moveX:0,kickHeld:true,passHeld:true};}},flight={sample(){flightReads++;return {active:false,moveX:0,autoFire:false};}};
 assert.equal(alienFrameInput(controls,0,flight),null);assert.equal(manualReads,0);assert.equal(flightReads,0);
 assert.deepEqual(alienFrameInput(controls,.016,flight),{moveX:0,firing:true,nova:true,flight:true});assert.equal(manualReads,1);assert.equal(flightReads,1);
});

test('touch flight combines automatic fire with an independent missile pulse, then releases cleanly',()=>{
 const state=createAlienFlightState();state.begin(pointer(1,60),setup);state.move(pointer(1,80));
 let pulse=true;const controls={sample(){const passHeld=pulse;pulse=false;return {moveX:0,kickHeld:false,passHeld};}};
 assert.deepEqual(alienFrameInput(controls,.016,state),{moveX:0,firing:true,nova:true,flight:true,x:442});
 state.end(1);assert.deepEqual(alienFrameInput(controls,.016,state),{moveX:0,firing:false,nova:false,flight:true});
});

test('keyboard movement overrides a concurrent drag target while manual fire remains independent',()=>{
 const state=createAlienFlightState();state.begin(pointer(1,60,'mouse'),setup);state.move(pointer(1,80));
 assert.deepEqual(alienFrameInput({sample:()=>({moveX:-1,kickHeld:true,passHeld:false})},.02,state),{moveX:-1,firing:true,nova:false,flight:true});
});

test('processed flight stick is not squared twice and reaches full speed over the authored acceleration ramp',()=>{
 const player={x:422};for(let i=0;i<15;i++){const previous=player.vx||0;moveAlienPlayer(player,{moveX:1,flight:true},.01,balance,844);assert.ok(player.vx-previous<=221/.15*.01+1e-8);}close(player.vx,221);
 const fine={x:422};for(let i=0;i<15;i++)moveAlienPlayer(fine,{moveX:.2,flight:true},.01,balance,844);close(fine.vx,44.2);
 const legacy={x:422};for(let i=0;i<15;i++)moveAlienPlayer(legacy,{moveX:.2},.01,balance,844);close(legacy.vx,8.84);
});

test('release stops on the same frame and a reversal brakes before crossing direction',()=>{
 const player={x:422,vx:221,bank:1};moveAlienPlayer(player,{flight:true},.016,balance,844);assert.deepEqual(player,{x:422,vx:0,bank:0});
 player.vx=221;moveAlienPlayer(player,{moveX:-1,flight:true},.01,balance,844);assert.ok(player.vx>0&&player.vx<221);for(let i=0;i<7;i++)moveAlienPlayer(player,{moveX:-1,flight:true},.01,balance,844);assert.ok(player.vx<0);
});

test('relative targets cannot overshoot, and reaching a boundary clears velocity',()=>{
 const player={x:422};for(let i=0;i<100;i++){moveAlienPlayer(player,{x:442,flight:true},.01,balance,844);assert.ok(player.x>=422&&player.x<=442);}close(player.x,442);
 Object.assign(player,{x:825,vx:221});moveAlienPlayer(player,{moveX:1,flight:true},.02,balance,844);assert.equal(player.x,826);assert.equal(player.vx,0);
});

class Surface extends EventTarget{
 constructor(rect={left:0,top:0,width:844,height:390}){super();this.rect=rect;this.style={};this.captures=new Set();}
 getBoundingClientRect(){return this.rect;}setPointerCapture(id){this.captures.add(id);}hasPointerCapture(id){return this.captures.has(id);}releasePointerCapture(id){this.captures.delete(id);}
}
function bindFixture({captureFails=false}={}){
 const canvas=new Surface({left:120,top:20,width:740,height:360}),zone=new Surface(),stick=new Surface({left:150,top:270,width:100,height:100}),knob={style:{}},windowTarget=new EventTarget();let x=422,cancels=0;
 if(captureFails)canvas.setPointerCapture=()=>{throw Error('interrupted capture');};
 const map={'#joystick':stick,'#knob':knob,'.soccer-stick-zone':zone},controls={querySelector:selector=>map[selector]};
 const input=createAlienFlightInput({canvas,controls,config:{deadzone:.12,joystickRadius:48,kickKey:'Space',passKey:'KeyX'},modelWidth:844,playerRadius:18,getPlayerX:()=>x,onCancel:()=>cancels++,windowTarget});
 const emit=(target,type,data)=>{const event=new Event(type,{cancelable:true});for(const [key,value]of Object.entries(data))Object.defineProperty(event,key,{value});target.dispatchEvent(event);};
 input.setEnabled(true);return {input,canvas,zone,knob,windowTarget,emit,get cancels(){return cancels;},set playerX(value){x=value;}};
}

test('DOM adapter uses relative CSS displacement even when the game canvas is offset',()=>{
 const f=bindFixture();f.emit(f.canvas,'pointerdown',pointer(4,500));assert.equal(f.input.sample().x,422);assert.ok(f.canvas.hasPointerCapture(4));f.emit(f.canvas,'pointermove',pointer(4,520));close(f.input.sample().x,422+20*844/740);f.emit(f.windowTarget,'pointerup',pointer(5,520));assert.ok(f.input.sample().active);f.emit(f.windowTarget,'pointerup',pointer(4,520));assert.equal(f.input.sample().autoFire,false);assert.equal(f.canvas.captures.size,0);f.input.dispose();
});

test('capture cancellation resets the owner once; a fresh contact starts from the new ship location',()=>{
 const f=bindFixture();f.emit(f.canvas,'pointerdown',pointer(4,500));f.emit(f.canvas,'pointercancel',pointer(6,500));assert.equal(f.cancels,0);f.emit(f.canvas,'pointercancel',pointer(4,500));assert.equal(f.cancels,1);assert.equal(f.input.sample().active,false);assert.equal(f.canvas.captures.size,0);f.playerX=260;f.emit(f.canvas,'pointerdown',pointer(7,700));assert.equal(f.input.sample().x,260);f.input.dispose();
});

test('window release recovers from failed capture, and lost capture cannot leave automatic fire held',()=>{
 const f=bindFixture({captureFails:true});f.emit(f.canvas,'pointerdown',pointer(1,500));assert.ok(f.input.sample().autoFire);f.emit(f.windowTarget,'pointerup',pointer(1,500));assert.equal(f.input.sample().autoFire,false);f.emit(f.canvas,'pointerdown',pointer(2,500));f.emit(f.canvas,'lostpointercapture',pointer(2,500));assert.equal(f.input.sample().autoFire,false);assert.equal(f.cancels,1);f.input.dispose();
});

test('pause/reset/dispose remove intent and captures, and disabled gestures never start fire',()=>{
 const f=bindFixture();f.emit(f.zone,'pointerdown',pointer(1,200,'touch',320));f.emit(f.zone,'pointermove',pointer(1,240,'touch',320));assert.ok(f.input.sample().moveX>0);f.input.setEnabled(false);assert.equal(f.input.sample().autoFire,false);assert.equal(f.zone.captures.size,0);assert.equal(f.knob.style.transform,'translate(0px,0px)');f.emit(f.canvas,'pointerdown',pointer(2,500));assert.equal(f.input.sample().active,false);f.input.setEnabled(true);f.emit(f.canvas,'pointerdown',pointer(3,500));assert.ok(f.input.sample().active);f.input.reset();assert.equal(f.input.sample().autoFire,false);f.input.dispose();f.emit(f.canvas,'pointerdown',pointer(4,500));assert.equal(f.input.sample().active,false);
});

test('HUD readers accept absent feedback and report earned active weapons without altering the model',()=>{
 const model={powerup:-1,upgrades:{},wings:[],spreadTime:0};assert.deepEqual(alienFlightHudStatus(model),{weapon:'normal',weaponText:'נשק: תותח',controlText:'גוררים לתנועה ולירי'});assert.equal(alienFlightFeedbackText(),null);
 Object.assign(model,{powerup:1,spreadTime:2,wings:[{active:true},{active:true}]});const before=JSON.stringify(model),status=alienFlightHudStatus(model,'keyboard');assert.equal(status.weapon,'spread');assert.match(status.weaponText,/לייזר/);assert.match(status.weaponText,/2 מלווים/);assert.match(status.controlText,/רווח/);assert.equal(JSON.stringify(model),before);
 for(let kind=0;kind<6;kind++){const text=alienFlightFeedbackText({id:kind,kind:'pickup',value:kind,life:1});assert.ok(text.pickup&&text.text);}
 const purchased=alienFlightHudStatus({powerup:-1,upgrades:{},equipment:{weapon:2},wings:[],spreadTime:0});assert.equal(purchased.weapon,'laser');assert.equal(purchased.weaponText,'נשק: לייזר');
 assert.equal(alienFlightFeedbackText({kind:'pickup',value:5,life:0}),null);assert.equal(alienFlightFeedbackText({kind:'enemy-hit',value:1,life:1}),null);
});

test('HUD keeps decorator icon nodes intact, holds pickup text long enough to read and hides on pause',()=>{
 class Element{
  constructor(){this.dataset={};this.children=[];this.attributes={};this.hidden=false;this.textContent='';}
  setAttribute(key,value){this.attributes[key]=value;}append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}remove(){this.parent.children=this.parent.children.filter(node=>node!==this);}
 }
 const dialog=new Element(),controls={dataset:{movementSide:'right'}},hud=createAlienFlightHud({dialog,controls,documentTarget:{createElement:()=>new Element()}}),root=dialog.children[0],weapon=root.children[1],feedback=root.children[2],icon=weapon.children[0];
 icon.append(new Element());const model={time:0,powerup:0,spreadTime:3,wings:[],feedback:{id:1,kind:'pickup',value:0,life:.3}};
 hud.update(model,{active:true,mode:'drag',device:'touch'});assert.equal(root.dataset.side,'right');assert.equal(weapon.dataset.alienWeapon,'spread');assert.equal(feedback.dataset.alienPickup,'spread');assert.equal(feedback.hidden,false);
 model.time=.7;model.feedback={id:2,kind:'enemy-hit',value:1,life:.2};hud.update(model,{device:'keyboard'});assert.equal(feedback.hidden,false);assert.equal(weapon.children[0],icon);assert.equal(icon.children.length,1);
 model.time=1.41;hud.update(model,{device:'keyboard'});assert.equal(feedback.hidden,true);hud.setPaused(true);assert.equal(root.hidden,true);hud.dispose();assert.equal(dialog.children.length,0);
});

test('model input reset permits the first fresh missile press after resume without advancing simulation',async()=>{
 const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url))).minigames,balance=config.alienDefense,model=createAlienModel({config,balance,level:1,random:seededRandom(3),roundChoices:false,completion:'waves'});
 for(let i=0;i<100;i++)model.update(.02,{});
 const charges=model.novaCharges;model.update(.01,{nova:true});assert.equal(model.novaCharges,charges-1);
 model.nova.flight=model.nova.life=0;model.update(.01,{nova:true});assert.equal(model.novaCharges,charges-1,'holding does not retrigger');
 const time=model.time;model.resetInput();assert.equal(model.time,time);model.update(.01,{nova:true});assert.equal(model.novaCharges,charges-2,'fresh edge after lifecycle reset is not lost');
});
