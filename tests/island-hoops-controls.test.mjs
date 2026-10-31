import test from 'node:test';
import assert from 'node:assert/strict';
import {createHoopsControls} from '../workout/island/minigames/hoops-controls.mjs';
class Element extends EventTarget{
 constructor(tag='div',doc){super();this.tagName=tag;this.ownerDocument=doc;this.children=[];this.dataset={};this.attrs={};this.tokens=new Set();this.hidden=false;this.disabled=false;this.style={};this.captures=new Set();this.offsetWidth=104;this.replacements=0;this.classList={add:(...v)=>v.forEach(k=>this.tokens.add(k)),remove:(...v)=>v.forEach(k=>this.tokens.delete(k)),contains:k=>this.tokens.has(k),toggle:(k,on)=>{if(on??!this.tokens.has(k))this.tokens.add(k);else this.tokens.delete(k);}};}
 set className(value){this.tokens=new Set(value.split(' ').filter(Boolean));}get className(){return [...this.tokens].join(' ');}
 append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);this.replacements++;}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
 matches(selector){return selector.split(',').some(s=>s==='[data-hoops-control]'?this.dataset.hoopsControl!==undefined:s==='[role=dialog]'?this.attrs.role==='dialog':s.startsWith('.')?this.tokens.has(s.slice(1)):this.tagName===s);}
 closest(selector){return this.matches(selector)?this:this.parent?.closest(selector)||null;}
 getBoundingClientRect(){return {left:12,top:200,width:160,height:176};}
 setPointerCapture(id){this.captures.add(id);}hasPointerCapture(id){return this.captures.has(id);}
 releasePointerCapture(id){this.captures.delete(id);send(this,'lostpointercapture',{pointerId:id});}
}
function send(node,type,data={}){const event=new Event(type,{cancelable:true});for(const [k,v] of Object.entries(data))Object.defineProperty(event,k,{value:v});node.dispatchEvent(event);return event;}
function fixture(t){
 const doc=new Element('document'),win=new Element('window');doc.defaultView=win;doc.hidden=false;doc.createElement=tag=>new Element(tag,doc);let clock=0,basis={rx:1,rz:0,ux:0,uz:1},escapes=0;win.performance={now:()=>clock};
 const root=new Element('div',doc),controls=createHoopsControls({root,doc,labels:{},icons:icon=>{const s=doc.createElement('svg');s.dataset.icon=icon;return s;},basis:()=>basis,onEscape:()=>escapes++});t.after(()=>controls.dispose());
 const nodes=controls.elements;
 return {controls,nodes,root,doc,win,at:ms=>clock=ms,setBasis:b=>basis=b,get escapes(){return escapes;},
  touch:(key,type,id=1,x=100,y=280)=>send(key==='stick'?nodes.zone:nodes[key],type,{pointerId:id,button:0,clientX:x,clientY:y}),
  key:(type,code,target=win,extra={})=>send(win,type,{code,target,repeat:false,...extra})};
}
const pressed=frame=>Object.entries(frame).filter(([k,v])=>v===true&&k!=='sprint').map(([k])=>k);
const visible=f=>Object.entries(f.nodes).filter(([k,n])=>n.dataset?.hoopsControl&&k!=='alt'&&!n.hidden).map(([k])=>k).sort();
test('context exposes named defence actions, a separate held sprint, and Hebrew fallbacks',t=>{
 const f=fixture(t);assert.deepEqual(visible(f),['fake','move','pass','shoot','sprint','timeout']);
 for(const node of Object.values(f.nodes).filter(n=>n.dataset?.hoopsControl)){assert.match(node.getAttribute('aria-label'),/[א-ת]/);assert.equal(node.children[0].tagName,'svg');}
 f.controls.setMode('defense');assert.deepEqual(visible(f),['block','sprint','steal','switch','timeout']);
 assert.match(f.nodes.switch.getAttribute('aria-label'),/הקרוב לכדור/);
 f.controls.setMode('offense');assert.deepEqual(visible(f),['pass','shoot','sprint','switch','timeout']);assert.match(f.nodes.pass.getAttribute('aria-label'),/בקשת/);
});
test('defence block, steal and nearest-ball switch produce distinct engine edges once',t=>{
 const f=fixture(t);f.controls.setMode('defense');
 for(const [key,edge] of [['block','shootDown'],['steal','passPress'],['switch','switchPress']]){
  f.touch(key,'pointerdown');assert.deepEqual(pressed(f.controls.consume()),[edge]);assert.deepEqual(pressed(f.controls.consume()),[]);
  f.touch(key,'pointerup');assert.deepEqual(pressed(f.controls.consume()),key==='block'?['shootUp']:[]);
 }
});
test('three independent touches can move, hold sprint and charge a shot',t=>{
 const f=fixture(t);f.touch('stick','pointerdown',1);f.touch('stick','pointermove',1,124,280);f.touch('sprint','pointerdown',2);f.touch('shoot','pointerdown',3);
 const a=f.controls.consume();assert.ok(a.move.x>.1&&a.move.x<.9);assert.equal(a.sprint,true);assert.equal(a.shootDown,true);
 assert.equal(f.controls.consume().sprint,true);f.touch('sprint','pointerup',2);
 const b=f.controls.consume();assert.equal(b.sprint,false);assert.equal(b.move.x,a.move.x);assert.equal(f.controls.held.shoot,true);
 f.touch('shoot','pointerup',3);assert.equal(f.controls.consume().shootUp,true);assert.equal(f.controls.held.stick,true);
});
test('full tilt retains automatic sprint and releasing the stick clears it',t=>{
 const f=fixture(t);f.touch('stick','pointerdown',1);f.touch('stick','pointermove',1,180,280);
 const frame=f.controls.consume();assert.equal(frame.sprint,true);assert.ok(Math.abs(Math.hypot(frame.move.x,frame.move.z)-1)<1e-12);
 f.touch('stick','pointerup',1);assert.equal(f.controls.consume().sprint,false);
});
test('either Shift key can sustain sprint while the other key is released',t=>{
 const f=fixture(t);f.key('keydown','ShiftLeft');f.key('keydown','ShiftRight');f.key('keyup','ShiftLeft');assert.equal(f.controls.consume().sprint,true);
 f.key('keyup','ShiftRight');assert.equal(f.controls.consume().sprint,false);
});
test('move tap crosses over, a held move spins, and fake is a separate one-shot action',t=>{
 const f=fixture(t);f.touch('move','pointerdown');f.at(100);f.touch('move','pointerup');assert.deepEqual(pressed(f.controls.consume()),['movePress']);
 f.at(1000);f.touch('move','pointerdown');f.at(1320);f.touch('move','pointerup');assert.deepEqual(pressed(f.controls.consume()),['spinPress']);
 f.touch('fake','pointerdown');f.touch('fake','pointerup');assert.deepEqual(pressed(f.controls.consume()),['fakePress']);assert.deepEqual(pressed(f.controls.consume()),[]);
});
test('Q uses tap/hold, R spins immediately and F fakes without repeated keydown edges',t=>{
 const f=fixture(t);f.key('keydown','KeyQ');f.key('keydown','KeyQ',f.win,{repeat:true});f.at(400);f.key('keyup','KeyQ');assert.deepEqual(pressed(f.controls.consume()),['spinPress']);
 f.key('keydown','KeyR');f.key('keydown','KeyF');assert.deepEqual(pressed(f.controls.consume()),['spinPress']);assert.deepEqual(pressed(f.controls.consume()),['fakePress']);
 f.controls.setMode('defense');f.key('keydown','KeyQ');assert.deepEqual(pressed(f.controls.consume()),['switchPress']);
});
test('short and held passes release once and cancellation does not leak a long pass',t=>{
 const f=fixture(t);f.touch('pass','pointerdown');assert.equal(f.controls.held.queued,0);f.at(80);f.touch('pass','pointerup');let frame=f.controls.consume();assert.equal(frame.passPress,true);assert.equal(frame.passLong,false);
 f.at(1000);f.touch('pass','pointerdown');f.at(1400);f.touch('pass','pointerup');frame=f.controls.consume();assert.equal(frame.passPress,true);assert.equal(frame.passLong,true);
 f.at(2000);f.touch('pass','pointerdown');f.at(2500);f.touch('pass','pointercancel');assert.deepEqual(pressed(f.controls.consume()),[]);
});
test('an unrelated pointer cannot release or take over a held shot',t=>{
 const f=fixture(t);f.touch('shoot','pointerdown',1);f.touch('shoot','pointerdown',2);f.touch('shoot','pointerup',2);assert.equal(f.controls.held.shoot,true);assert.equal(f.controls.consume().shootDown,true);
 f.touch('shoot','pointerup',1);assert.equal(f.controls.consume().shootUp,true);assert.deepEqual(pressed(f.controls.consume()),[]);
});
test('a complete shot between frames preserves down/up and ignores compatibility clicks',t=>{
 const f=fixture(t);f.touch('shoot','pointerdown');f.touch('shoot','pointerup');send(f.nodes.shoot,'click',{detail:1});send(f.nodes.shoot,'click',{detail:0,pointerType:'touch'});
 assert.deepEqual(pressed(f.controls.consume()),['shootDown']);assert.deepEqual(pressed(f.controls.consume()),['shootUp']);assert.deepEqual(pressed(f.controls.consume()),[]);
});
for(const cancellation of ['pointercancel','lostpointercapture'])test('a completed pass survives a later '+cancellation+' on the same button',t=>{
 const f=fixture(t);f.touch('pass','pointerdown',1);f.at(80);f.touch('pass','pointerup',1);
 f.at(100);f.touch('pass','pointerdown',2);f.at(500);f.touch('pass',cancellation,2);
 const frame=f.controls.consume();assert.equal(frame.passPress,true);assert.equal(frame.passLong,false);assert.deepEqual(pressed(f.controls.consume()),[]);
});
test('a completed shot survives a later cancelled hold before either edge is consumed',t=>{
 const f=fixture(t);f.touch('shoot','pointerdown',1);f.touch('shoot','pointerup',1);f.touch('shoot','pointerdown',2);f.touch('shoot','pointercancel',2);
 assert.deepEqual(pressed(f.controls.consume()),['shootDown']);assert.deepEqual(pressed(f.controls.consume()),['shootUp']);assert.deepEqual(pressed(f.controls.consume()),[]);
});
test('cancelling a new shot gesture does not cancel the previous consumed charge awaiting its valid release',t=>{
 const f=fixture(t);f.touch('shoot','pointerdown',1);f.touch('shoot','pointerup',1);assert.deepEqual(pressed(f.controls.consume()),['shootDown']);
 f.touch('shoot','pointerdown',2);f.touch('shoot','pointercancel',2);
 assert.deepEqual(pressed(f.controls.consume()),['shootUp']);assert.deepEqual(pressed(f.controls.consume()),[]);
});
test('cancelling the consumed current charge still emits one safe cancellation and retains another action',t=>{
 const f=fixture(t);f.touch('shoot','pointerdown',1);assert.deepEqual(pressed(f.controls.consume()),['shootDown']);
 f.touch('fake','pointerdown',2);f.touch('fake','pointerup',2);f.touch('shoot','pointercancel',1);
 assert.deepEqual(pressed(f.controls.consume()),['shootCancel']);assert.deepEqual(pressed(f.controls.consume()),['fakePress']);assert.deepEqual(pressed(f.controls.consume()),[]);
});
test('focused fake/sprint buttons own Space/Enter and suppress the later native click',t=>{
 const f=fixture(t);f.key('keydown','Space',f.nodes.fake);send(f.nodes.fake,'keydown',{code:'Space',repeat:false});assert.deepEqual(pressed(f.controls.consume()),['fakePress']);
 send(f.nodes.fake,'keyup',{code:'Space'});send(f.nodes.fake,'click',{detail:0});assert.deepEqual(pressed(f.controls.consume()),[]);
 send(f.nodes.sprint,'keydown',{code:'Enter',repeat:false});assert.equal(f.controls.consume().sprint,true);f.key('keyup','Enter',f.win);assert.equal(f.controls.consume().sprint,false);
});
test('assistive complete taps activate once, including a one-frame sprint pulse',t=>{
 const f=fixture(t);send(f.nodes.move,'click',{detail:0});assert.deepEqual(pressed(f.controls.consume()),['movePress']);assert.deepEqual(pressed(f.controls.consume()),[]);
 send(f.nodes.sprint,'click',{detail:0});assert.equal(f.controls.consume().sprint,true);assert.equal(f.controls.consume().sprint,false);
});
test('releasing a shortcut after focus moves to another action still ends its original charge',t=>{
 const f=fixture(t);f.key('keydown','Space');assert.equal(f.controls.consume().shootDown,true);
 f.key('keyup','Space',f.nodes.fake);assert.equal(f.controls.consume().shootUp,true);assert.equal(f.controls.held.shoot,false);
});
test('mode changes discard stale actions and cancel a consumed charge before new defence input',t=>{
 const f=fixture(t);f.touch('shoot','pointerdown',1);assert.equal(f.controls.consume().shootDown,true);f.touch('move','pointerdown',2);f.touch('sprint','pointerdown',3);
 f.controls.setMode('defense');f.touch('shoot','pointerup',1);f.touch('move','pointerup',2);f.touch('block','pointerdown',4);
 assert.equal(f.controls.held.sprint,true);assert.deepEqual(pressed(f.controls.consume()),['shootCancel']);assert.deepEqual(pressed(f.controls.consume()),['shootDown']);assert.deepEqual(pressed(f.controls.consume()),[]);
 f.touch('sprint','pointerup',3);assert.equal(f.controls.consume().sprint,false);
});
test('a held sprint touch and movement continue through possession changes until their own releases',t=>{
 const f=fixture(t);f.touch('stick','pointerdown',1);f.touch('stick','pointermove',1,124,280);f.touch('sprint','pointerdown',2);
 const before=f.controls.consume();assert.equal(before.sprint,true);assert.ok(before.move.x>0&&before.move.x<.93);
 f.controls.setMode('defense');const defense=f.controls.consume();assert.equal(defense.sprint,true);assert.deepEqual(defense.move,before.move);assert.equal(f.nodes.sprint.captures.has(2),true);
 f.controls.setMode('offense');assert.equal(f.controls.consume().sprint,true);f.controls.setMode('ball');assert.equal(f.controls.consume().sprint,true);
 f.touch('sprint','pointerup',2);const released=f.controls.consume();assert.equal(released.sprint,false);assert.deepEqual(released.move,before.move);
 f.touch('stick','pointerup',1);assert.deepEqual(f.controls.consume().move,{x:0,z:0});
});
test('held Shift sprint survives possession changes while a full cancellation still clears it',t=>{
 const f=fixture(t);f.key('keydown','ShiftLeft');assert.equal(f.controls.consume().sprint,true);f.controls.setMode('defense');assert.equal(f.controls.consume().sprint,true);
 f.key('keydown','ShiftRight');f.key('keyup','ShiftLeft');f.controls.setMode('ball');assert.equal(f.controls.consume().sprint,true);
 f.controls.setEnabled(false);f.controls.setEnabled(true);assert.equal(f.controls.consume().sprint,false);
});
test('cancelled charges never emit a release shot, whether the down edge was sampled or queued',t=>{
 const f=fixture(t);f.touch('shoot','pointerdown');f.touch('shoot','pointercancel');assert.deepEqual(pressed(f.controls.consume()),[]);
 f.touch('shoot','pointerdown',2);assert.equal(f.controls.consume().shootDown,true);f.touch('shoot','lostpointercapture',2);assert.deepEqual(pressed(f.controls.consume()),['shootCancel']);assert.deepEqual(pressed(f.controls.consume()),[]);
});
for(const stop of ['pause','blur','hidden','resize'])test(stop+' clears held movement, actions and capture without an accidental shot',t=>{
 const f=fixture(t);f.touch('stick','pointerdown',1);f.touch('stick','pointermove',1,124,280);f.touch('shoot','pointerdown',2);assert.equal(f.controls.consume().shootDown,true);f.touch('sprint','pointerdown',3);
 if(stop==='pause')f.controls.setEnabled(false);else if(stop==='hidden'){f.doc.hidden=true;send(f.doc,'visibilitychange');}else send(f.win,stop);
 const frame=f.controls.consume();assert.equal(frame.sprint,false);assert.deepEqual(frame.move,{x:0,z:0});assert.equal(frame.shootCancel,true);assert.equal(frame.shootUp,false);
 assert.equal(f.nodes.zone.captures.size,0);assert.equal(f.nodes.shoot.captures.size,0);assert.equal(f.nodes.sprint.captures.size,0);
});
test('disabled and disposed controls reject action edges and sprint holds',t=>{
 const f=fixture(t);f.controls.setEnabled(false);f.touch('fake','pointerdown');f.key('keydown','ShiftLeft');assert.deepEqual(pressed(f.controls.consume()),[]);assert.equal(f.controls.consume().sprint,false);
 f.controls.setEnabled(true);f.controls.dispose();f.touch('shoot','pointerdown');f.key('keydown','KeyR');send(f.nodes.move,'click',{detail:0});assert.deepEqual(pressed(f.controls.consume()),[]);
});
test('camera basis is locked during a gesture and keyboard diagonals remain normalized',t=>{
 const f=fixture(t);f.key('keydown','ArrowRight');f.key('keydown','ArrowUp');const first=f.controls.consume();assert.ok(Math.abs(Math.hypot(first.move.x,first.move.z)-1)<1e-12);
 f.setBasis({rx:0,rz:1,ux:-1,uz:0});assert.deepEqual(f.controls.consume().move,first.move);
 f.key('keyup','ArrowRight');f.key('keyup','ArrowUp');f.controls.consume();f.key('keydown','ArrowRight');assert.deepEqual(f.controls.consume().move,{x:0,z:1});
});
test('repeated HUD mode updates reuse icons and do not reconstruct the controls',t=>{
 const f=fixture(t),counts=[...new Set(Object.values(f.nodes))].map(n=>n.replacements);
 for(let i=0;i<100;i++)f.controls.setMode('ball');assert.deepEqual([...new Set(Object.values(f.nodes))].map(n=>n.replacements),counts);
});
