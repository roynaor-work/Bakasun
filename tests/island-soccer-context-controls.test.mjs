import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoccerButtonInput,soccerActionLabels} from '../workout/island/minigames/soccer-session.mjs';
import {createSoccer} from '../workout/island/minigames/soccer.mjs';
import {passInterceptionClearance,selectTeamPass} from '../workout/island/minigames/soccer-teamplay.mjs';
import {createControls} from '../workout/island/minigames/controls.mjs';

const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
class Button extends EventTarget{
 constructor(ownerDocument){super();this.ownerDocument=ownerDocument;this.held=new Set();this.classList={add:k=>this.held.add(k),remove:k=>this.held.delete(k)};}
}
function dispatch(node,type,properties={}){const e=new Event(type,{cancelable:true});for(const [k,v]of Object.entries(properties))Object.defineProperty(e,k,{value:v});node.dispatchEvent(e);return e;}
function fixture(t){
 const doc=new EventTarget();doc.defaultView=new EventTarget();const buttons={kickHeld:new Button(doc),passHeld:new Button(doc),sprintHeld:new Button(doc)},abort=new AbortController();
 let enabled=true,cancels=0,gestures=0;
 const input=createSoccerButtonInput({buttons,signal:abort.signal,enabled:()=>enabled,onCancel:()=>cancels++,onGesture:()=>gestures++});t.after(()=>abort.abort());
 return {input,buttons,doc,abort,setEnabled:value=>enabled=value,get cancels(){return cancels;},get gestures(){return gestures;}};
}

function shortcutFixture(t,keyboardFromButtons=true){
 const doc=new EventTarget(),win=new EventTarget(),savedWindow=globalThis.window,savedDocument=globalThis.document;doc.defaultView=win;
 globalThis.window=win;globalThis.document=doc;
 const nodes=Object.fromEntries(['joystick','knob','shoot','pass','sprint','outside'].map(id=>{const node=new Button(doc);node.style={};node.matches=selector=>selector.split(',').includes('button')&&!['joystick','knob'].includes(id);return [id,node];}));
 const root=new Button(doc);root.querySelector=selector=>nodes[selector.slice(1)]||null;root.querySelectorAll=()=>[];root.contains=node=>Object.entries(nodes).some(([id,candidate])=>id!=='outside'&&candidate===node);
 const input=createControls({root,config:config.controls,keyboardFromButtons});input.setEnabled(true);
 t.after(()=>{input.dispose();if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;});
 return {input,nodes,root,doc,win,key:(type,code,target=nodes.shoot,extra={})=>dispatch(win,type,{code,target,repeat:false,...extra})};
}

test('soccer X/C/Shift and arrow shortcuts work while an action button keeps focus',t=>{
 const f=shortcutFixture(t);
 f.key('keydown','KeyX');assert.equal(f.input.sample().passHeld,true);f.key('keyup','KeyX');assert.equal(f.input.sample().passHeld,false);
 f.key('keydown','KeyC',f.nodes.pass);assert.equal(f.input.sample().switchPlayer,true);assert.equal(f.input.sample().switchPlayer,false);f.key('keyup','KeyC',f.nodes.pass);
 f.key('keydown','ShiftLeft',f.nodes.sprint);f.key('keydown','ArrowRight',f.nodes.sprint);f.key('keydown','ArrowUp',f.nodes.sprint);
 let sample=f.input.sample();assert.equal(sample.sprintHeld,true);assert.equal(sample.moveX,1);assert.equal(sample.moveZ,-1);
 f.key('keyup','ShiftLeft',f.nodes.sprint);f.key('keyup','ArrowRight',f.nodes.sprint);f.key('keyup','ArrowUp',f.nodes.sprint);sample=f.input.sample();assert.equal(sample.sprintHeld,false);assert.equal(sample.moveX,0);assert.equal(sample.moveZ,0);
});

test('focused-button Space belongs to that button and never also triggers the global shot shortcut',t=>{
 const f=shortcutFixture(t),abort=new AbortController(),buttons=createSoccerButtonInput({buttons:{passHeld:f.nodes.pass},signal:abort.signal});t.after(()=>abort.abort());
 dispatch(f.nodes.pass,'keydown',{code:'Space'});f.key('keydown','Space',f.nodes.pass);
 const sample=buttons.sample(f.input.sample());assert.equal(sample.passHeld,true);assert.equal(sample.kickHeld,false);
 dispatch(f.nodes.pass,'keyup',{code:'Space'});f.key('keyup','Space',f.nodes.pass);assert.equal(buttons.sample(f.input.sample()).passHeld,false);
});

test('soccer focused-button shortcuts stay inactive outside the round and clear on window blur',t=>{
 const f=shortcutFixture(t);f.key('keydown','KeyX',f.nodes.outside);f.key('keydown','ArrowRight',f.nodes.outside);let sample=f.input.sample();assert.equal(sample.passHeld,false);assert.equal(sample.moveX,0);
 f.key('keydown','ShiftLeft');f.key('keydown','ArrowRight');assert.equal(f.input.sample().sprintHeld,true);dispatch(f.win,'blur');sample=f.input.sample();assert.equal(sample.sprintHeld,false);assert.equal(sample.moveX,0);
});

test('other games keep the previous default of ignoring shortcuts on focused buttons',t=>{
 const f=shortcutFixture(t,false);f.key('keydown','KeyX');f.key('keydown','ArrowRight');const sample=f.input.sample();assert.equal(sample.passHeld,false);assert.equal(sample.moveX,0);
});

for(const action of ['kickHeld','passHeld','sprintHeld'])for(const code of ['Space','Enter'])test(`focused ${action}: ${code} holds, releases and suppresses a duplicate native click`,t=>{
 const f=fixture(t),node=f.buttons[action];assert.equal(dispatch(node,'keydown',{code,repeat:false}).defaultPrevented,true);
 assert.equal(f.input.sample()[action],true);assert.equal(f.input.sample()[action],true,'holding survives across frames');
 dispatch(node,'keydown',{code,repeat:true});assert.equal(f.gestures,1,'repeat does not restart charging');
 assert.equal(dispatch(node,'keyup',{code}).defaultPrevented,true);assert.equal(f.input.sample()[action],undefined);assert.equal(node.held.has('held'),false);
});

test('a focused-button tap completed between render frames survives once',t=>{
 const f=fixture(t),node=f.buttons.passHeld;dispatch(node,'keydown',{code:'Space'});dispatch(node,'keyup',{code:'Space'});
 assert.equal(f.input.sample().passHeld,true);assert.equal(f.input.sample().passHeld,undefined);
});

test('assistive button activation works once while pointer compatibility clicks stay with touch input',t=>{
 const f=fixture(t),node=f.buttons.kickHeld;dispatch(node,'click',{detail:1});assert.deepEqual(f.input.sample(),{});
 dispatch(node,'click',{detail:0,pointerType:'touch'});assert.deepEqual(f.input.sample(),{});
 dispatch(node,'click',{detail:0});assert.equal(f.input.sample().kickHeld,true);assert.deepEqual(f.input.sample(),{});assert.equal(f.gestures,1);
});

test('focused buttons merge with independent movement and touch actions',t=>{
 const f=fixture(t);dispatch(f.buttons.kickHeld,'keydown',{code:'Enter'});
 assert.deepEqual(f.input.sample({moveX:.7,moveZ:-.3,passHeld:true}),{moveX:.7,moveZ:-.3,passHeld:true,kickHeld:true});
});

for(const stop of ['button-blur','window-blur','visibility','pause'])test(`${stop} cancels a charged focused button without releasing an accidental shot`,t=>{
 const f=fixture(t),node=f.buttons.kickHeld;dispatch(node,'keydown',{code:'Space'});assert.equal(f.input.sample().kickHeld,true);
 if(stop==='button-blur')dispatch(node,'blur');else if(stop==='window-blur')dispatch(f.doc.defaultView,'blur');else if(stop==='visibility')dispatch(f.doc,'visibilitychange');else f.input.reset();
 assert.deepEqual(f.input.sample(),{});assert.equal(f.cancels,1);assert.equal(node.held.has('held'),false);
});

test('paused controls reject keyboard and assistive activations, and disposal removes listeners',t=>{
 const f=fixture(t),node=f.buttons.kickHeld;f.setEnabled(false);dispatch(node,'keydown',{code:'Enter'});dispatch(node,'click',{detail:0});assert.deepEqual(f.input.sample(),{});
 f.setEnabled(true);f.abort.abort();dispatch(node,'keydown',{code:'Space'});dispatch(node,'click',{detail:0});assert.deepEqual(f.input.sample(),{});
});

for(const action of ['kickHeld','passHeld'])test(`focused ${action} charges and releases exactly one physical action in the real model`,t=>{
 const f=fixture(t),model=createSoccer({config}),state=model.getState(),player=state.players[state.controlled];
 for(const other of state.players)if(other!==player)other.recover=100;
 player.cooldown=0;state.ball.grace=100;
 dispatch(f.buttons[action],'keydown',{code:'Space'});
 for(let frame=0;frame<12;frame++)model.update(config.match.fixedStep,f.input.sample());
 assert.ok(state.charging&&state.charge>=.19,'a focused button supplies a continuous charge');
 dispatch(f.buttons[action],'keyup',{code:'Space'});model.update(config.match.fixedStep,f.input.sample());
 const kind=action==='kickHeld'?'shot':'pass',events=model.drainEvents();assert.equal(events.filter(e=>e.type===kind&&e.player===player.id).length,1);assert.equal(state.ball.owner,null);assert.ok(Math.hypot(state.ball.vx,state.ball.vz)>1);
 for(let frame=0;frame<6;frame++)model.update(config.match.fixedStep,f.input.sample());
 assert.equal(model.drainEvents().filter(e=>e.type===kind&&e.player===player.id).length,0,'release cannot repeat on following frames');
});

test('losing focused-button ownership clears a real shot charge before the release edge',t=>{
 const f=fixture(t),model=createSoccer({config}),state=model.getState();state.players[state.controlled].cooldown=0;state.ball.grace=100;
 dispatch(f.buttons.kickHeld,'keydown',{code:'Space'});for(let frame=0;frame<8;frame++)model.update(config.match.fixedStep,f.input.sample());assert.ok(state.charging);
 // Session onCancel calls this same model boundary before its next sample.
 dispatch(f.buttons.kickHeld,'blur');model.clearInput();model.update(config.match.fixedStep,f.input.sample());
 assert.equal(state.charging,false);assert.equal(model.drainEvents().some(e=>e.type==='shot'&&e.player===state.controlled),false);
});

test('visible action names match field defense, attack and keeper possession',()=>{
 const field=createSoccer({config}).getState();assert.equal(soccerActionLabels(field,config).shot,'minigame.soccer.shoot');assert.equal(soccerActionLabels(field,config).pass,'soccer.pass');
 field.mode='defense';field.ball.owner=3;assert.equal(soccerActionLabels(field,config).shot,'soccer.slide');assert.equal(soccerActionLabels(field,config).pass,'soccer.steal');assert.equal(soccerActionLabels(field,config).switchable,true);
 const keeper=createSoccer({config,role:'keeper'}).getState();keeper.ball.owner=null;keeper.mode='defense';assert.equal(soccerActionLabels(keeper,config).shot,'soccer.keeperDive');assert.equal(soccerActionLabels(keeper,config).pass,'soccer.steal');assert.equal(soccerActionLabels(keeper,config).switchable,false);
 keeper.ball.owner=keeper.controlled;keeper.mode='attack';assert.equal(soccerActionLabels(keeper,config).shot,'minigame.soccer.shoot');assert.equal(soccerActionLabels(keeper,config).pass,'soccer.pass');
});

test('pass prediction detects a defender crossing an otherwise empty corridor',()=>{
 const from={x:0,z:0},to={x:10,z:0},time=config.passing.groundTravelSeconds;
 assert.ok(passInterceptionClearance({x:5,z:3,vx:0,vz:-6/time},from,to,time)<1e-10);
 assert.equal(passInterceptionClearance({x:5,z:3,vx:0,vz:0},from,to,time),3);
 assert.ok(passInterceptionClearance({x:5,z:3,vx:0,vz:6/time},from,to,time)>3);
});

test('both teams choose a safe wide receiver over a defender running into the forward pass',()=>{
 for(const mirror of [false,true]){
  const state=createSoccer({config}).getState();for(const p of state.players)Object.assign(p,{x:16,z:-10,vx:0,vz:0,recover:0,slideTime:0});
  Object.assign(state.players[0],{x:0,z:0});Object.assign(state.players[1],{x:10,z:0});Object.assign(state.players[6],{x:3,z:7});Object.assign(state.players[3],{x:5,z:3});
  if(mirror)for(const p of state.players){p.team=1-p.team;p.x=-p.x;p.z=-p.z;}
  assert.equal(selectTeamPass(state.players[0],state,config).id,1,'the forward option is open while the defender stands still');
  state.players[3].vz=(mirror?1:-1)*6/config.passing.groundTravelSeconds;
  const before=JSON.stringify(state);assert.equal(selectTeamPass(state.players[0],state,config).id,6);assert.equal(JSON.stringify(state),before,'prediction never mutates players or reads commands');
 }
});
