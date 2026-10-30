// Island Pro Basketball performance helpers (hoops-perf.mjs): shared skeletons per avatar,
// allocation-free interpolation, DOM writes only on change, eased camera approach.
import test from 'node:test';
import assert from 'node:assert/strict';
import {shareSkeletons,interpPlayer,createInterpPool,setText,setAttr,setData,setHidden,markFirst,approach,smoothstep,lerpAngle} from '../workout/island/minigames/hoops-perf.mjs';

const ident=()=>({elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]});
function skeleton(bones,inv=ident){return {bones,boneInverses:bones.map(()=>inv())};}
function mesh(sk){const m={skeleton:sk,bindMatrix:{id:Math.random()},bound:0,bind(s,bm){this.skeleton=s;this.boundWith=bm;this.bound++;}};return m;}

test('shareSkeletons: every skinned mesh of a clone drives the same bones through one Skeleton',()=>{
 const bones=Array.from({length:65},(_,i)=>({uuid:'b'+i}));
 const meshes=Array.from({length:8},()=>mesh(skeleton(bones)));
 const lead=meshes[0].skeleton;
 assert.equal(shareSkeletons(meshes),7);
 for(const m of meshes)assert.equal(m.skeleton,lead);
 assert.equal(meshes[0].bound,0,'the lead keeps its own skeleton');
 assert.equal(meshes[3].boundWith,meshes[3].bindMatrix,'each mesh keeps its own bind matrix');
 assert.equal(shareSkeletons(meshes),0,'idempotent');
});
test('shareSkeletons: different bones or different inverses stay apart',()=>{
 const a=Array.from({length:3},(_,i)=>({uuid:'a'+i})),b=Array.from({length:3},(_,i)=>({uuid:'c'+i}));
 const other=()=>({elements:[2,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]});
 const meshes=[mesh(skeleton(a)),mesh(skeleton(b)),mesh(skeleton(a,other)),mesh(skeleton(a)),{skeleton:null}];
 assert.equal(shareSkeletons(meshes),1);
 assert.equal(meshes[3].skeleton,meshes[0].skeleton);
 assert.notEqual(meshes[1].skeleton,meshes[0].skeleton);
 assert.notEqual(meshes[2].skeleton,meshes[0].skeleton,'other bind poses are not merged');
});

const P=(o)=>({id:1,team:0,x:0,z:0,y:0,vx:0,vz:0,face:0,act:null,actT:0,hasBall:false,...o});
test('interpPlayer: positions, velocities and the short way round for the facing, into a reused object',()=>{
 const a=P({x:0,z:2,y:0,vx:1,vz:0,face:3.0,act:'shoot',actT:0.2}),b=P({x:2,z:4,y:0.5,vx:3,vz:2,face:-3.0,act:'shoot',actT:0.4});
 const out={};
 const r=interpPlayer(a,b,0.5,out);
 assert.equal(r,out);
 assert.deepEqual([r.x,r.z,r.y,r.vx,r.vz],[1,3,0.25,2,1]);
 assert.ok(Math.abs(Math.abs(r.face)-Math.PI)<0.15,'face crosses PI, not through 0: '+r.face);
 assert.ok(Math.abs(r.actT-0.3)<1e-9);
 assert.equal(r.hasBall,false);
 const r2=interpPlayer(P({act:'run',actT:0.9}),P({act:'shoot',actT:0.1}),0.5,out);
 assert.equal(r2.actT,0.1,'a new action starts at its own time');
 const r3=interpPlayer(null,b,0.5,out);assert.equal(r3.x,b.x);assert.equal(r3.face,b.face);
 assert.equal(interpPlayer(P({id:2,x:10}),P({id:1,x:0}),0.5,out).x,0,'a different id is not interpolated');
});
test('createInterpPool: one target object per player, previous snapshot re-indexed without new maps',()=>{
 const pool=createInterpPool();
 const prev=[P({id:1,x:0}),P({id:2,x:10})],cur=[P({id:1,x:1}),P({id:2,x:12})];
 const m1=pool.index(prev);
 const o1=pool.get(cur[0],0.5),o2=pool.get(cur[1],0.5);
 assert.equal(o1.x,0.5);assert.equal(o2.x,11);
 const m2=pool.index([P({id:3,x:5})]);
 assert.equal(m1,m2,'the same map is reused');assert.equal(m2.size,1);
 assert.equal(pool.get(cur[0],0.5),o1,'the same output object is reused for the same id');
 assert.equal(pool.get(cur[0],0.5).x,1,'no previous state: the current one');
 assert.equal(pool.size,2);
});

function fakeEl(){
 const el={writes:0,_text:'',attrs:{},dataset:null,_hidden:false,
  get textContent(){return this._text;},set textContent(v){this.writes++;this._text=v;},
  getAttribute(k){return k in this.attrs?this.attrs[k]:null;},setAttribute(k,v){this.writes++;this.attrs[k]=v;},
  get hidden(){return this._hidden;},set hidden(v){this.writes++;this._hidden=v;}};
 el.dataset=new Proxy({},{set(t,k,v){el.writes++;t[k]=v;return true;}});
 return el;
}
test('DOM helpers write only when the value changes',()=>{
 const el=fakeEl();
 setText(el,'12');setText(el,'12');setText(el,'13');
 setAttr(el,'aria-label','a');setAttr(el,'aria-label','a');
 setData(el,'low','true');setData(el,'low','true');setData(el,'low','false');
 setHidden(el,true);setHidden(el,1);setHidden(el,false);
 assert.equal(el._text,'13');assert.equal(el.attrs['aria-label'],'a');assert.equal(el.dataset.low,'false');assert.equal(el.hidden,false);
 assert.equal(el.writes,2+1+2+2);
});
test('markFirst toggles only the dots whose state differs',()=>{
 const nodes=Array.from({length:5},()=>{const on=new Set(),n={toggles:0};n.classList={contains:c=>on.has(c),toggle(c,f){n.toggles++;f?on.add(c):on.delete(c);}};return n;});
 markFirst(nodes,3);assert.deepEqual(nodes.map(n=>n.classList.contains('on')),[true,true,true,false,false]);
 markFirst(nodes,3);assert.equal(nodes.reduce((a,n)=>a+n.toggles,0),3);
 markFirst(nodes,1);assert.deepEqual(nodes.map(n=>n.classList.contains('on')),[true,false,false,false,false]);
 assert.equal(nodes.reduce((a,n)=>a+n.toggles,0),5);
});
test('approach reaches 99% of the target within the given seconds and never jumps',()=>{
 let v=-1,maxStep=0;const dt=1/60;
 for(let i=0;i<Math.round(0.65/dt);i++){const n=approach(v,1,dt,0.65);maxStep=Math.max(maxStep,Math.abs(n-v));v=n;}
 assert.ok(v>0.98&&v<=1,'reached: '+v);
 assert.ok(maxStep<0.25,'largest step '+maxStep);
 assert.equal(approach(null,1,dt,0.65),1);assert.equal(approach(0.5,1,dt,0),1);
 assert.equal(smoothstep(0),0);assert.equal(smoothstep(1),1);assert.equal(smoothstep(0.5),0.5);assert.ok(smoothstep(0.25)<0.25);
 assert.ok(Math.abs(lerpAngle(3.0,-3.0,0.5))>3,'the short arc through PI');
});
