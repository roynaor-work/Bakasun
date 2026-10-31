import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {consumeHoopsInput} from '../workout/island/minigames/hoops-session.mjs';
import {createHoopsControls} from '../workout/island/minigames/hoops-controls.mjs';
import {createHoopsEngine,HOOPS_DT} from '../workout/island/minigames/hoops-engine.mjs';
import {createFixedLoop} from '../workout/island/minigames/hoops-loop.mjs';
import {initialHoops,matchTeams} from '../workout/island/minigames/hoops-franchise.mjs';
const cfg=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.streetSlam;
class Node extends EventTarget{
 constructor(doc){super();this.ownerDocument=doc;this.children=[];this.dataset={};this.style={};this.attrs={};this.hidden=false;this.disabled=false;this.offsetWidth=104;this.tokens=new Set();this.pointers=new Set();this.classList={add:k=>this.tokens.add(k),remove:k=>this.tokens.delete(k),toggle:(k,on)=>{if(on)this.tokens.add(k);else this.tokens.delete(k);}};}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}
 getBoundingClientRect(){return {left:0,top:0,width:160,height:176};}
 setPointerCapture(id){this.pointers.add(id);}hasPointerCapture(id){return this.pointers.has(id);}releasePointerCapture(id){this.pointers.delete(id);}
}
function pointer(node,type,id){const e=new Event(type,{cancelable:true});for(const [k,v] of Object.entries({pointerId:id,button:0,clientX:60,clientY:80}))Object.defineProperty(e,k,{value:v});node.dispatchEvent(e);}
function controlsFixture(t){const doc=new Node(),win=new Node();doc.defaultView=win;doc.createElement=()=>new Node(doc);win.performance={now:()=>0};const root=new Node(doc);const controls=createHoopsControls({root,doc,icons:()=>new Node(doc)});t.after(()=>controls.dispose());return controls;}

test('session: ownership changes between fixed steps discard defence edges instead of turning them into passes',t=>{
 const config=structuredClone(cfg),teams=matchTeams(config,initialHoops(config),{stage:1}).teams;
 const engine=createHoopsEngine({config,teams,seed:731,userTeam:0,profile:'quick'});t.after(()=>engine.dispose());
 const S=engine.debug.state,a=engine.debug.api,mine=a.onCourt(0),theirs=a.onCourt(1);
 S.phase='live';S.clock=70;S.shotClock=24;S.controlled=mine[0].id;S.possession=1;
 for(const [i,p] of a.all().entries()){engine.debug.place(p.id,-10+i*2,i<5?-6:6);p.act=null;p.air=-1;p.think=1e6;p.goal=null;}
 engine.debug.place(mine[0].id,0,0);engine.debug.place(mine[1].id,3,0);
 Object.assign(S.ball,{state:'loose',owner:null,x:0,y:engine.court.ballR,z:0,vx:0,vy:0,vz:0,lastTouch:1,shot:null,pass:null});
 const controls=controlsFixture(t);controls.setMode('defense');
 pointer(controls.elements.switch,'pointerdown',1);pointer(controls.elements.steal,'pointerdown',2);pointer(controls.elements.sprint,'pointerdown',3);
 let current=engine.snapshot();const frames=[],events=[];
 const loop=createFixedLoop({dt:HOOPS_DT,maxFrame:1,maxSteps:8});
 loop.advance(HOOPS_DT*2,()=>{const input=consumeHoopsInput(controls,current);frames.push(input);engine.step(input);current=engine.snapshot();events.push(...engine.drainEvents());return true;});
 assert.equal(frames.length,2);assert.equal(frames[0].switchPress,true);assert.equal(current.ball.owner,mine[0].id,'the loose-ball pickup is an actual engine possession change');
 assert.equal(frames[1].passPress,false,'the old steal edge is cancelled before the new handler consumes it');assert.equal(frames[1].shootDown,false);assert.equal(controls.held.queued,0);
 assert.equal(mine[0].act,null);assert.ok(!events.some(e=>e.type==='pass'||e.type==='shotStart'));
 assert.equal(frames[0].sprint,true);assert.equal(frames[1].sprint,true);assert.equal(controls.held.sprint,true,'the independent sprint hold survives the context change');
});
