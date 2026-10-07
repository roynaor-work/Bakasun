import test from 'node:test';
import assert from 'node:assert/strict';
import { RepCounter, fullBody, features, thresholds } from '../cam-lab/counter.mjs';

function pose({ angle = 180, feet = 1, hands = 'down', rise = 0, side = 'left', kneesIn = false } = {}) {
  const p = Array.from({ length: 33 }, () => ({ x: .5, y: .4, z: 0, visibility: 1, presence: 1 }));
  const set = (i,x,y) => Object.assign(p[i], { x,y });
  set(0,.5,.15); set(7,.46,.17); set(8,.54,.17);
  set(11,.4,.3); set(12,.6,.3); set(13,.38,.4); set(14,.62,.4);
  set(15,.36,hands === 'up' ? .07 : .54); set(16,.64,hands === 'up' ? .07 : .54);
  set(23,.44,.55); set(24,.56,.55);
  set(25,kneesIn ? .485 : .44,.73); set(26,kneesIn ? .515 : .56,.73);
  for (const i of [27,29,31]) set(i,.5 - .1 * feet,.92);
  for (const i of [28,30,32]) set(i,.5 + .1 * feet,.92);
  if (rise) {
    const i = side === 'left' ? 25 : 26;
    p[i].y = .55 - rise * (.92 - .15);
    for (const a of side === 'left' ? [27,29,31] : [28,30,32]) p[a].y = p[i].y + .20;
  }
  const world = p.map(q => ({ ...q }));
  for (const [h,k,a] of [[23,25,27],[24,26,28]]) {
    const x = world[h].x;
    world[h] = { x,y:.5,z:0 }; world[k] = { x,y:.7,z:0 };
    world[a] = { x,y:.7 - Math.cos(angle * Math.PI / 180) * .2,z: Math.sin(angle * Math.PI / 180) * .2 };
  }
  return { p,world };
}
function sequence(exercise = 'squats', profile = { age:7,height:120 }, step = 50) {
  const counter = new RepCounter(exercise, profile); let time = 0; const events = [];
  const feed = (opts, duration = 600) => {
    const sample = opts === null ? { p: [],world: [] } : pose(opts);
    for (let elapsed = 0; elapsed < duration; elapsed += step) {
      time += step;
      const event = counter.update(sample.p,sample.world,time,4/3);
      if (event) events.push(event);
    }
  };
  return { counter,feed,events, skip: gap => { time += gap; } };
}
test('whole body requires confident head, hands, ankles, feet and headroom', () => {
  const { p } = pose(); assert.ok(fullBody(p));
  for (const i of [0,15,25,27,31]) {
    const q = structuredClone(p); q[i].visibility = .1; assert.equal(fullBody(q),false);
    q[i].visibility = 1; q[i].x = 1; assert.equal(fullBody(q),false);
  }
  const q = structuredClone(p); q[0].y = .03; assert.equal(fullBody(q),false);
  assert.equal(fullBody([]),false);
});
test('configuration is validated; age and height affect documented thresholds', () => {
  assert.ok(thresholds({age:7,height:110}).kneeRise > thresholds({age:7,height:150}).kneeRise);
  assert.ok(thresholds({age:7,height:120}).squatDown > thresholds({age:10,height:120}).squatDown);
  for (const profile of [{age:NaN,height:120},{age:7,height:0},{age:20,height:120}]) assert.throws(() => thresholds(profile));
  assert.throws(() => new RepCounter('unknown'));
});
test('front-view squat uses world knee angle, not projected straight-looking legs', () => {
  const { p,world } = pose({angle:105});
  assert.ok(Math.abs(features(p,world,4/3).squat - 105) < .001);
  assert.equal(features(p,[],4/3).squat,null);
});
test('two full squats count once each, sustained bottom does not repeat', () => {
  const s = sequence(); s.feed({}); s.feed({angle:110},2000);
  assert.equal(s.counter.count,0); s.feed({}); assert.equal(s.counter.count,1);
  s.feed({angle:110}); s.feed({}); assert.equal(s.counter.count,2); assert.equal(s.counter.rejected,0);
});
test('no rep when starting at bottom before an upright reference', () => {
  const s = sequence(); s.feed({angle:110}); s.feed({}); assert.equal(s.counter.count,0);
});
test('partial squat rejects a completed attempted cycle with the right reason', () => {
  const s = sequence(); s.feed({}); s.feed({angle:140}); s.feed({});
  assert.equal(s.counter.count,0); assert.deepEqual(s.counter.reasons,{partial:1});
});
test('jitter at rest and a one-frame deep spike cannot count', () => {
  const s = sequence(); s.feed({});
  for (let i=0;i<30;i++) { s.feed({angle:159},50); s.feed({angle:172},50); }
  assert.equal(s.counter.count,0); assert.equal(s.counter.rejected,0);
  s.feed({angle:110},50); s.feed({}); assert.equal(s.counter.count,0);
});
test('sustained inward knee proxy rejects once; single frame does not', () => {
  const s = sequence(); s.feed({}); s.feed({angle:110,kneesIn:true}); s.feed({});
  assert.equal(s.counter.count,0); assert.deepEqual(s.counter.reasons,{knees:1});
  const q = sequence(); q.feed({}); q.feed({angle:110}); q.feed({angle:110,kneesIn:true},50); q.feed({angle:110}); q.feed({});
  assert.equal(q.counter.count,1);
});
test('tracking loss rejects active cycle once and requires rearming', () => {
  const s = sequence(); s.feed({}); s.feed({angle:110}); s.feed(null,1000); s.feed({});
  assert.equal(s.counter.count,0); assert.deepEqual(s.counter.reasons,{tracking:1});
  s.feed({angle:110}); s.feed({}); assert.equal(s.counter.count,1);
});
test('long frame gaps never bridge a rep; duplicate or reversed timestamps ignored', () => {
  const s = sequence(); s.feed({}); s.feed({angle:110}); s.skip(1000); s.feed({});
  assert.deepEqual(s.counter.reasons,{tracking:1}); assert.equal(s.counter.count,0);
  const {p,world} = pose(); const before = s.counter.lastTime;
  assert.equal(s.counter.update(p,world,before),null); assert.equal(s.counter.update(p,world,before-50),null);
  assert.equal(s.counter.lastTime,before);
});
test('missing or degenerate world coordinates disable squat counting', () => {
  const c = new RepCounter('squats'); const {p} = pose();
  assert.equal(c.update(p,[],50).type,'tracking');
  const world = p.map(() => ({x:0,y:0,z:0})); assert.equal(c.update(p,world,100).type,'tracking');
  assert.equal(c.count,0);
});
test('full jumping jack needs feet AND hands, then closed return', () => {
  const s = sequence('jumping-jacks'); s.feed({}); s.feed({feet:2.2,hands:'up'}); s.feed({});
  assert.equal(s.counter.count,1); assert.equal(s.counter.rejected,0);
  s.feed({feet:2.2}); s.feed({}); assert.deepEqual(s.counter.reasons,{partial:1});
  s.feed({hands:'up'}); s.feed({}); assert.deepEqual(s.counter.reasons,{partial:2});
});
test('jack arms/feet on separate frames do not form a valid open pose', () => {
  const s = sequence('jumping-jacks'); s.feed({}); s.feed({hands:'up'});
  s.feed({feet:2.2}); s.feed({}); assert.equal(s.counter.count,0);
});
test('high knees counts each lift-return and requires alternating legs', () => {
  const s = sequence('high-knees'); s.feed({}); s.feed({rise:.18,side:'left'}); s.feed({});
  s.feed({rise:.18,side:'right'}); s.feed({}); assert.equal(s.counter.count,2);
  s.feed({rise:.18,side:'right'}); s.feed({}); assert.deepEqual(s.counter.reasons,{alternate:1});
  s.feed({rise:.18,side:'left'}); s.feed({}); assert.equal(s.counter.count,3);
});
test('low knee lift is partial; holding raised knee does not repeat', () => {
  const s = sequence('high-knees'); s.feed({}); s.feed({rise:.07}); s.feed({});
  assert.deepEqual(s.counter.reasons,{partial:1});
  s.feed({rise:.18},2500); assert.equal(s.counter.count,0); s.feed({}); assert.equal(s.counter.count,1);
});
test('timeout and explicit finish explain unfinished motion without double rejection', () => {
  const s = sequence(); s.feed({}); s.feed({angle:110},9000);
  assert.deepEqual(s.counter.reasons,{timeout:1}); s.counter.finish(); assert.equal(s.counter.rejected,1);
  const q = sequence(); q.feed({}); q.feed({angle:110}); q.counter.finish(); q.counter.finish();
  assert.deepEqual(q.counter.reasons,{unfinished:1});
});
test('equivalent full cycles work at low and high frame rates', () => {
  for (const step of [33,100,200]) {
    const s = sequence('squats',{age:7,height:120},step); s.feed({},1200); s.feed({angle:110},1200); s.feed({},1200);
    assert.equal(s.counter.count,1,`step ${step}ms`);
  }
});
test('single fast downward spike rejects as uncertain speed rather than counting', () => {
  const s = sequence(); s.feed({}); s.feed({angle:90},50); s.feed({});
  assert.equal(s.counter.count,0); assert.deepEqual(s.counter.reasons,{fast:1});
});
test('raising both knees simultaneously is not an alternating knee lift', () => {
  const c = new RepCounter('high-knees'); let time = 0;
  const send = (sample,frames=16) => {
    for (let i=0;i<frames;i++) { time+=50;c.update(sample.p,sample.world,time,4/3); }
  };
  send(pose()); const sample=pose({rise:.18}); sample.p[26].y=sample.p[25].y;
  for(const i of [28,30,32]) sample.p[i].y=sample.p[27].y;
  send(sample); send(pose()); assert.equal(c.count,0); assert.deepEqual(c.reasons,{partial:1});
});
test('side-on framing and non-finite coordinates cannot arm a counter', () => {
  const sample=pose();sample.p[11].x=.49;sample.p[12].x=.51;
  assert.equal(features(sample.p,sample.world,4/3),null);
  const c=new RepCounter('squats');assert.equal(c.update(sample.p,sample.world,50).type,'tracking');
  const q=pose();q.p[27].y=NaN;assert.equal(fullBody(q.p),false);assert.equal(c.count,0);
});
