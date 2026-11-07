import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacingControls} from '../minigames/racing-controls.mjs';

class Element extends EventTarget {
  constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.dataset={};this.attributes={};this.className='';
    this.style={values:new Map(),setProperty(k,v){this.values.set(k,v);},removeProperty(k){this.values.delete(k);},getPropertyValue(k){return this.values.get(k)||'';}};
    this.classList={add:(...v)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...v])].join(' ');},remove:(...v)=>{this.className=this.className.split(' ').filter(x=>!v.includes(x)).join(' ');},contains:v=>this.className.split(' ').includes(v)};}
  setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}
  append(...els){for(const e of els){e.parentElement=this;this.children.push(e);}}
  getBoundingClientRect(){return {left:0,top:0,width:422,height:390};}
  setPointerCapture(){}closest(){return null;}
}
const fire=(target,type,values={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,values);target.dispatchEvent(e);};
function fixture(t,wheelMode){
  const doc=new EventTarget();doc.defaultView=new EventTarget();doc.hidden=false;
  doc.createElement=tag=>new Element(tag,doc);doc.createElementNS=(_,tag)=>new Element(tag,doc);
  const root=doc.createElement('div'),canvas=doc.createElement('canvas'),controls=createRacingControls({root,canvas,t:k=>k,wheelMode});
  t.after(()=>controls.dispose());
  const walk=e=>[e,...e.children.flatMap(walk)],all=walk(root);
  return {controls,all,pad:all.find(e=>e.className==='racing-pad'),wheel:all.find(e=>e.className==='racing-wheel'),steering:all.find(e=>e.className.startsWith('racing-steering')&&e.dataset.wheel||e.className==='racing-steering'),slider:all.find(e=>e.className==='racing-steer')};
}

test('wheel is drawn as a real wheel: rim, spokes, hub, top mark',t=>{
  const f=fixture(t);const svg=f.wheel.children[0];
  for(const part of ['class="rim"','class="spokes"','class="hub"','class="mark"'])assert.ok(svg.innerHTML.includes(part),part);
});
test('a touch anywhere on the left pad puts the wheel under the thumb at once, and releasing returns it home',t=>{
  const f=fixture(t);let reacted=0,total=0;
  for(let x=2;x<422;x+=21)for(let y=2;y<390;y+=26){
    total++;fire(f.pad,'pointerdown',{pointerId:1,clientX:x,clientY:y});
    if(f.steering.classList.contains('floating')&&f.wheel.style.getPropertyValue('--wx')!=='')reacted++;
    fire(f.pad,'pointerup',{pointerId:1});assert.equal(f.steering.classList.contains('floating'),false);assert.equal(f.controls.sample().steer,0);
  }
  assert.equal(reacted,total,'100% of left-half touches activate the wheel in the same event');
});
test('wheel placed at the touch stays fully inside the pad',t=>{
  const f=fixture(t);fire(f.pad,'pointerdown',{pointerId:1,clientX:0,clientY:0});
  assert.equal(f.wheel.style.getPropertyValue('--wx'),'60px');assert.equal(f.wheel.style.getPropertyValue('--wy'),'60px');
});
test('dragging right steers right (negative world yaw), left steers left, wheel turns with it, full lock reachable',t=>{
  const f=fixture(t);fire(f.pad,'pointerdown',{pointerId:1,clientX:200,clientY:200});assert.equal(f.controls.sample().steer+0,0);
  fire(f.pad,'pointermove',{pointerId:1,clientX:200+8,clientY:200});const small=f.controls.sample().steer;
  assert.ok(small<0&&small>-.3,'a small stroke is a small steer: '+small);
  fire(f.pad,'pointermove',{pointerId:1,clientX:300,clientY:200});assert.equal(f.controls.sample().steer,-1);
  assert.ok(parseFloat(f.wheel.style.getPropertyValue('--turn'))>60);
  fire(f.pad,'pointermove',{pointerId:1,clientX:100,clientY:200});assert.equal(f.controls.sample().steer,1);
  assert.ok(parseFloat(f.wheel.style.getPropertyValue('--turn'))<-60);
  fire(f.pad,'pointercancel',{pointerId:1});assert.equal(f.controls.sample().steer,0);
});
test('a touch under the dead zone does not drift the car; a second finger on the pad is ignored; disabled ignores touches',t=>{
  const f=fixture(t);fire(f.pad,'pointerdown',{pointerId:1,clientX:100,clientY:100});fire(f.pad,'pointermove',{pointerId:1,clientX:101,clientY:100});
  assert.equal(f.controls.sample().steer,0);
  fire(f.pad,'pointerdown',{pointerId:2,clientX:300,clientY:100});fire(f.pad,'pointermove',{pointerId:2,clientX:380,clientY:100});assert.equal(f.controls.sample().steer,0);
  fire(f.pad,'pointerup',{pointerId:1});f.controls.setEnabled(false);fire(f.pad,'pointerdown',{pointerId:3,clientX:50,clientY:50});assert.equal(f.steering.classList.contains('floating'),false);
});
test('the keyboard slider still steers; wheelMode:false keeps the old slider layout with no pad',t=>{
  const f=fixture(t);f.slider.value='0.5';fire(f.slider,'input');assert.equal(f.controls.sample().steer,-.5);
  const old=fixture(t,false);assert.equal(old.pad,undefined);assert.equal(old.wheel.children[0].tagName,'SVG');
});
