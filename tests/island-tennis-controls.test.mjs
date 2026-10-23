import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTennisControls,applyTennisSample,tennisStickVector} from '../workout/island/minigames/tennis-controls.mjs';
import {createTennis} from '../workout/island/minigames/tennis.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.tennis;

// DOM event boundary only. Layout and real browser capture are checked through CUA.
class Element extends EventTarget{
 constructor(tag='div',doc){super();this.tagName=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.hidden=false;this.style={setProperty(k,v){this[k]=v;}};this.tokens=new Set();this.classList={add:(...v)=>v.forEach(x=>this.tokens.add(x)),remove:(...v)=>v.forEach(x=>this.tokens.delete(x)),contains:v=>this.tokens.has(v),toggle:(v,on)=>{if(on??!this.tokens.has(v))this.tokens.add(v);else this.tokens.delete(v);}};this.captures=new Set();}
 set className(value){this.tokens=new Set(value.split(' ').filter(Boolean));}get className(){return [...this.tokens].join(' ');}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 setAttribute(k,v){this[k]=v;}
 matches(selector){return selector.split(',').some(s=>s.startsWith('.')?this.tokens.has(s.slice(1)):s.startsWith('#')?this.id===s.slice(1):this.tagName===s);}
 querySelectorAll(selector){return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 getBoundingClientRect(){return {left:0,top:0,width:108,height:108};}
 setPointerCapture(id){this.captures.add(id);}hasPointerCapture(id){return this.captures.has(id);}
 releasePointerCapture(id){this.captures.delete(id);dispatch(this,'lostpointercapture',{pointerId:id});}
}
function dispatch(node,type,data={}){const event=new Event(type,{cancelable:true});for(const [key,value]of Object.entries(data))Object.defineProperty(event,key,{value});node.dispatchEvent(event);return event;}
function fixture(t){
 const doc=new Element('document');doc.createElement=tag=>new Element(tag,doc);doc.defaultView=new Element('window',doc);doc.hidden=false;
 const root=new Element('div',doc),zone=new Element('div',doc),stick=new Element('div',doc),knob=new Element('span',doc),nodes={};zone.className='soccer-stick-zone';stick.id='joystick';knob.id='knob';stick.append(knob);zone.append(stick);root.append(zone);
 for(const [action,id]of [['hit','shoot'],['serve','pass'],['lob','sprint'],['drop','drop']]){nodes[action]=new Element('button',doc);nodes[action].id=id;root.append(nodes[action]);}
 let clock=0,cancels=0;const controls=createTennisControls({root,config:{...config.controls,deadzone:.08,responseExponent:1.3,joystickRadius:54},now:()=>clock,onCancel:()=>cancels++});controls.setEnabled(true);t.after(()=>controls.dispose());
 const touch=(action,type,id=1,x=300,y=240)=>dispatch(action==='move'?zone:nodes[action],type,{pointerId:id,clientX:x,clientY:y,button:0});
 return {controls,root,zone,stick,knob,nodes,doc,touch,at:ms=>clock=ms,get cancels(){return cancels;},key:(type,code,extra={})=>dispatch(doc.defaultView,type,{code,repeat:false,...extra})};
}
function returnBall(){const model=createTennis({config}),s=model.getState();s.phase='rally';s.shot={serving:false,side:1};s.contact={side:0,at:s.elapsed,eta:0};Object.assign(s.players[0],{x:0,z:6});Object.assign(s.ball,{x:0,z:6,y:config.ball.hitHeight,lastHitter:1,bounces:1,vx:0,vy:0,vz:0});return model;}
test('tennis stick is quiet at rest, starts smoothly and reaches full speed without diagonal advantage',()=>{
 for(const [x,z]of [[0,0],[.05,.02],[-.02,.06]])assert.deepEqual(tennisStickVector(x,z),{x:0,z:0});
 const start=tennisStickVector(.081,0),middle=tennisStickVector(.5,0),full=tennisStickVector(1,0),diagonal=tennisStickVector(1,1);
 assert.ok(start.x>0&&start.x<.005);assert.ok(middle.x>.25&&middle.x<.5);assert.equal(full.x,1);assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z)-1)<1e-12);
 assert.deepEqual(tennisStickVector(Infinity,0),{x:0,z:0});
});
test('a serve tap completed between frames tosses once, with no repeated serve on the next frame',t=>{
 const f=fixture(t),m=createTennis({config});f.touch('serve','pointerdown');f.touch('serve','pointerup');applyTennisSample(m,f.controls.sample(),1/60);assert.equal(m.getState().phase,'toss');
 applyTennisSample(m,f.controls.sample(),1/60);assert.equal(m.getState().phase,'toss');assert.equal(m.getState().rallyHits,0);
});
test('two complete serve taps before a sample both survive and produce exactly one served ball',t=>{
 const f=fixture(t),m=createTennis({config});for(const id of [1,2]){f.touch('serve','pointerdown',id);f.touch('serve','pointerup',id);}applyTennisSample(m,f.controls.sample(),0);
 assert.equal(m.getState().phase,'rally');assert.equal(m.getState().rallyHits,1);assert.equal(m.getState().shot.serving,true);assert.equal(f.controls.sample().events.length,0);
});
test('a complete short hit between samples returns an eligible ball once, rather than waiting for a second frame',t=>{
 const f=fixture(t),model=returnBall();f.touch('hit','pointerdown');f.touch('hit','pointerup');applyTennisSample(model,f.controls.sample(),0);assert.equal(model.getState().shot.side,0);assert.equal(model.getState().rallyHits,1);applyTennisSample(model,f.controls.sample(),0);assert.equal(model.getState().rallyHits,1);
});
test('holding and releasing a lob retains its charged power and dragged aim in the actual return',t=>{
 const f=fixture(t),model=returnBall(),s=model.getState();s.ball.y=50;f.touch('lob','pointerdown',2,300,240);
 for(let i=0;i<12;i++)applyTennisSample(model,f.controls.sample(),1/60);const charge=s.charge;assert.ok(charge>0);
 s.ball.y=config.ball.hitHeight;s.ball.vy=0;s.contact.at=s.elapsed;f.touch('lob','pointermove',2,240,240);f.touch('lob','pointerup',2,240,240);applyTennisSample(model,f.controls.sample(),0);
 assert.equal(s.shot.side,0);assert.equal(s.shot.lob,true);assert.equal(s.shot.charge,charge);assert.ok(s.shot.targetX<0);
});
test('movement and a second thumb remain independent; releasing a shot does not release the joystick',t=>{
 const f=fixture(t);f.touch('move','pointerdown',7,60,220);f.touch('move','pointermove',7,114,220);f.touch('hit','pointerdown',8);let s=f.controls.sample();assert.equal(s.moveX,1);assert.equal(s.holding.hit,true);
 f.touch('hit','pointerup',8);s=f.controls.sample();assert.equal(s.moveX,1);assert.equal(s.holding.hit,false);assert.equal(s.events.filter(e=>e.action==='hit'&&e.type==='release').length,1);
 f.touch('move','pointerup',7,114,220);assert.equal(f.controls.sample().moveX,0);
});
test('an unrelated third pointer cannot take over an existing movement or shot gesture',t=>{
 const f=fixture(t);f.touch('move','pointerdown',1,30,200);f.touch('move','pointermove',1,84,200);f.touch('move','pointerdown',2,10,10);f.touch('move','pointerup',2,10,10);f.touch('hit','pointerdown',3);f.touch('hit','pointerdown',4);f.touch('hit','pointerup',4);
 const s=f.controls.sample();assert.equal(s.moveX,1);assert.equal(s.holding.hit,true);assert.equal(s.events.filter(e=>e.action==='hit').length,1);
});
test('action dragging changes shot aim without moving the player and retains aim after release',t=>{
 const f=fixture(t);f.touch('lob','pointerdown',2,300,200);f.touch('lob','pointermove',2,300,120);const held=f.controls.sample();assert.equal(held.moveX,0);assert.equal(held.moveZ,0);assert.equal(held.lobAim.z,-1);assert.equal(held.lobAim.manual,true);
 f.touch('lob','pointerup',2,300,120);const released=f.controls.sample().events.find(e=>e.type==='release');assert.equal(released.action,'lob');assert.equal(released.aim.z,-1);assert.equal(released.aim.manual,true);
});
test('nearly simultaneous thumb releases preserve the movement direction chosen for a short drop shot',t=>{
 const f=fixture(t);f.touch('move','pointerdown',1,40,220);f.touch('move','pointermove',1,-14,220);f.touch('drop','pointerdown',2);f.controls.sample();f.at(100);f.touch('move','pointerup',1,-14,220);f.at(125);f.touch('drop','pointerup',2);
 const s=f.controls.sample();assert.equal(s.moveX,0);assert.equal(s.shotAim.x,-1);assert.equal(s.shotAim.manual,true);
});
test('returning to centre deliberately removes aim; old released movement does not stick to later taps',t=>{
 const f=fixture(t);f.touch('move','pointerdown',1,40,220);f.touch('move','pointermove',1,94,220);f.touch('move','pointerup',1,94,220);f.at(200);f.touch('hit','pointerdown',2);f.touch('hit','pointerup',2);assert.equal(f.controls.sample().shotAim.manual,false);
});
test('pointer cancellation cancels the current shot without firing it or interrupting the other thumb',t=>{
 const f=fixture(t);f.touch('move','pointerdown',1,40,220);f.touch('move','pointermove',1,94,220);f.touch('hit','pointerdown',2);const cancels=f.cancels;f.touch('hit','pointercancel',2);const s=f.controls.sample();assert.equal(s.events.some(e=>e.action==='hit'),false);assert.equal(s.holding.hit,false);assert.equal(s.moveX,1);assert.equal(f.cancels,cancels+1);
});
test('normal captured release is not mistaken for cancellation when lostpointercapture follows it',t=>{
 const f=fixture(t),before=f.cancels;f.touch('drop','pointerdown',9);f.touch('drop','pointerup',9);assert.equal(f.cancels,before);assert.equal(f.controls.sample().events.filter(e=>e.type==='release').length,1);
});
test('keyboard diagonals are normalized, repeated keys do not add shots, and short keys are buffered',t=>{
 const f=fixture(t);f.key('keydown','ArrowLeft');f.key('keydown','ArrowUp');f.key('keydown',config.controls.kickKey);f.key('keydown',config.controls.kickKey,{repeat:true});f.key('keyup',config.controls.kickKey);const s=f.controls.sample();assert.ok(Math.abs(Math.hypot(s.moveX,s.moveZ)-1)<1e-12);assert.equal(s.events.filter(e=>e.action==='hit'&&e.type==='release').length,1);assert.ok(s.shotAim.x<0&&s.shotAim.z<0);
});
test('a focused serve button can be activated with the keyboard and losing focus cancels an unfinished hold',t=>{
 const f=fixture(t);dispatch(f.nodes.serve,'keydown',{code:'Space',repeat:false});f.key('keyup','Space');let s=f.controls.sample();assert.deepEqual(s.events.map(e=>[e.action,e.type]),[['serve','press'],['serve','release']]);
 dispatch(f.nodes.drop,'keydown',{code:'Enter',repeat:false});dispatch(f.nodes.drop,'blur');s=f.controls.sample();assert.equal(s.holding.drop,false);assert.equal(s.events.length,0);
});
test('handedness and lifecycle reset captures, queued shots and movement without a release shot',t=>{
 const f=fixture(t);f.touch('move','pointerdown',1,40,220);f.touch('move','pointermove',1,94,220);f.touch('serve','pointerdown',2);f.controls.setHanded(false);let s=f.controls.sample();assert.equal(f.root.dataset.movementSide,'right');assert.equal(f.root.dataset.actionSide,'left');assert.equal(f.root.classList.contains('left-handed'),true);assert.equal(s.events.length,0);assert.equal(s.moveX,0);assert.equal(s.holding.serve,false);
 f.controls.setEnabled(false);f.touch('hit','pointerdown',3);assert.equal(f.controls.sample().events.length,0);f.controls.setEnabled(true);f.key('keydown','ArrowRight');dispatch(f.doc.defaultView,'blur');assert.equal(f.controls.sample().moveX,0);
 f.controls.dispose();f.touch('serve','pointerdown',4);s=f.controls.sample();assert.equal(s.events.length,0);assert.equal(s.holding.serve,false);
});
