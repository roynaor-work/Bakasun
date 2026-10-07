import test from 'node:test';
import assert from 'node:assert/strict';
import {RepCounter,fullBody,thresholds,features} from '../counter.mjs';
function pose(kind='stand') {
 const p=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:.99}));
 const put=(i,x,y)=>Object.assign(p[i],{x,y});
 for(const [i,x,y]of [[0,.5,.14],[11,.4,.3],[12,.6,.3],[13,.3,.5],[14,.7,.5],[15,.3,.7],[16,.7,.7],[23,.43,.45],[24,.57,.45],[25,.4,.66],[26,.6,.66],[27,.4,.86],[28,.6,.86]])put(i,x,y);
 if(['deep','partial','collapse'].includes(kind)) {
   put(23,.43,kind==='partial'?.55:.65);put(24,.57,kind==='partial'?.55:.65);
   put(25,kind==='collapse'?.46:.35,.68);put(26,kind==='collapse'?.54:.65,.68);
 }
 if(kind==='open'||kind==='feet-only'){put(27,.25,.86);put(28,.75,.86);if(kind==='open'){put(15,.25,.18);put(16,.75,.18);}}
 if(kind==='left'){put(25,.32,.45);put(27,.4,.68);}
 if(kind==='right'){put(26,.68,.45);put(28,.6,.68);}
 if(kind==='little-knee')put(27,.4,.825);
 return p;
}
function runner(exercise='squats',profile){
 const c=new RepCounter(exercise,profile);let time=0;const events=[];
 return {c,feed(p,n=22,step=50){for(let i=0;i<n;i++){time+=step;const e=c.update(p,time,null,.72);if(e)events.push(e);}return this;},events};
}
for(const [ex,active]of [['squats','deep'],['jumping-jacks','open'],['high-knees','left']]){
 test(`${ex}: two cycles counted once each`,()=>{const r=runner(ex);r.feed(pose()).feed(pose(active)).feed(pose()).feed(pose(active)).feed(pose());assert.deepEqual(r.c.summary(),{count:2,rejected:0,reasons:{}});});
 test(`${ex}: starts active, no count`,()=>{const r=runner(ex);r.feed(pose(active)).feed(pose());assert.equal(r.c.count,0);assert.equal(r.c.rejected,0);});
 test(`${ex}: tracking loss rejects once and rearms`,()=>{const r=runner(ex);r.feed(pose()).feed(pose(active)).feed(null).feed(pose());assert.equal(r.c.count,0);assert.deepEqual(r.c.why,{tracking:1});r.feed(pose(active)).feed(pose());assert.equal(r.c.count,1);});
 test(`${ex}: stationary does not count`,()=>{const r=runner(ex);r.feed(pose(),150);assert.equal(r.c.count,0);assert.equal(r.c.rejected,0);});
}
test('squat partial depth',()=>{const r=runner();r.feed(pose()).feed(pose('partial')).feed(pose());assert.deepEqual(r.c.summary(),{count:0,rejected:1,reasons:{partial:1}});});
test('sustained inward knees',()=>{const r=runner();r.feed(pose()).feed(pose('collapse')).feed(pose());assert.equal(r.c.count,0);assert.deepEqual(r.c.why,{knees:1});});
test('jacks require hands and feet',()=>{const r=runner('jumping-jacks');r.feed(pose()).feed(pose('feet-only')).feed(pose());assert.deepEqual(r.c.why,{arms:1});});
test('small knee lift rejected and alternating knees counted individually',()=>{const r=runner('high-knees');r.feed(pose()).feed(pose('little-knee')).feed(pose());assert.deepEqual(r.c.why,{partial:1});r.feed(pose('left')).feed(pose()).feed(pose('right')).feed(pose());assert.equal(r.c.count,2);});
test('single-frame spikes do not count',()=>{const r=runner();r.feed(pose());for(let i=0;i<15;i++)r.feed(pose('deep'),1).feed(pose(),5);assert.equal(r.c.count,0);assert.equal(r.c.rejected,0);});
test('one deep spike cannot rescue partial squat',()=>{const r=runner();r.feed(pose()).feed(pose('partial')).feed(pose('deep'),1).feed(pose('partial')).feed(pose());assert.equal(r.c.count,0);assert.deepEqual(r.c.why,{partial:1});});
test('holding down never repeatedly counts',()=>{const r=runner();r.feed(pose()).feed(pose('deep'),100);assert.equal(r.c.count,0);r.feed(pose());assert.equal(r.c.count,1);});
test('gap interrupts rather than joining motion',()=>{const r=runner();r.feed(pose()).feed(pose('deep')).feed(pose(),1,900).feed(pose());assert.deepEqual(r.c.why,{tracking:1});assert.equal(r.c.count,0);});
test('timeout requires rearming',()=>{const r=runner();r.feed(pose()).feed(pose('deep'),280).feed(pose());assert.equal(r.c.count,0);assert.deepEqual(r.c.why,{timeout:1});});
test('duplicate and backward timestamps ignored',()=>{const c=new RepCounter('squats');c.update(pose(),100);assert.equal(c.update(pose('deep'),100),null);assert.equal(c.update(pose('deep'),99),null);assert.equal(c.phase,'unarmed');});
test('interrupt rejects unfinished attempt once',()=>{const r=runner();r.feed(pose()).feed(pose('deep'));assert.equal(r.c.interrupt().reason,'tracking');assert.equal(r.c.interrupt(),null);});
test('head wrists ankles must be visible inside frame',()=>{for(const i of [0,15,16,27,28]){const p=pose();p[i].visibility=.2;assert.equal(fullBody(p),false);p[i].visibility=.99;p[i].y=.99;assert.equal(fullBody(p),false);}assert.equal(fullBody(pose()),true);assert.equal(fullBody([]),false);});
test('invalid points cannot count',()=>{const r=runner();r.feed(pose()).feed(pose('deep'));const p=pose();p[25].x=NaN;r.feed(p);assert.deepEqual(r.c.why,{tracking:1});});
test('age and height tune bounded thresholds',()=>{const a=thresholds({age:7,height:110}),b=thresholds({age:10,height:150});assert.equal(a.squatDown,120);assert.equal(b.squatDown,115);assert.ok(a.kneeUp>b.kneeUp);assert.ok(a.holdMs>b.holdMs);assert.ok(thresholds({height:0}).kneeUp<=.085);});
test('translation and scale invariant features',()=>{const p=pose('left'),a=features(p,null,.72),q=p.map(v=>({...v,x:v.x*.7+.1,y:v.y*.7+.1})),b=features(q,null,.72*.7);assert.ok(Math.abs(a.leftLift-b.leftLift)<1e-10);assert.ok(Math.abs(a.kneeAngle-b.kneeAngle)<1e-8);});
test('unknown exercise explicitly fails',()=>assert.throws(()=>new RepCounter('anything')));
test('heel toward buttock is not a high knee',()=>{
 const r=runner('high-knees'),p=pose();p[27].y=.7;
 r.feed(pose()).feed(p).feed(pose());assert.equal(r.c.count,0);assert.deepEqual(r.c.why,{partial:1});
});
test('minimum cycle duration is enforced',()=>{
 const r=runner();r.c.t.minRepMs=5000;r.feed(pose()).feed(pose('deep')).feed(pose());assert.deepEqual(r.c.why,{fast:1});
});
test('world landmark knee angles are used when supplied',()=>{
 const c=new RepCounter('squats');let now=0;
 for(const kind of ['stand','deep','stand'])for(let i=0;i<22;i++)c.update(pose(),now+=50,pose(kind),.72);
 assert.equal(c.count,1);
});
test('nose in frame is insufficient when crown margin is clipped',()=>{const p=pose();p[0].y=.07;assert.equal(fullBody(p),false);});
