import test from 'node:test';
import assert from 'node:assert/strict';
import { RepCounter, PoseFilter, bodyReport, EXERCISES, FRAMING } from '../workout/cam-lab/counter.mjs';
import { pose, floorPose, lungePose } from './cam-lab-fixtures.js';

const motions = {
  squats: [() => pose(), () => pose({ angle: 110 })],
  'jumping-jacks': [() => pose(), () => pose({ feet: 2.2, hands: .07 })],
  'high-knees': [() => pose(), () => {
    const p = pose(); p.p[25].y = .41; p.p[27].y = .62; return p;
  }],
  lunges: [() => lungePose(), () => lungePose({ angle: 95 })],
  'push-ups': [() => floorPose({ bridge: 180 }), () => floorPose({ bridge: 180, elbow: 85 })],
  'knee-push-ups': [() => floorPose({ bridge: 180 }), () => floorPose({ bridge: 180, elbow: 85 })],
  'glute-bridge': [() => floorPose(), () => floorPose({ bridge: 175 })],
};
function run(exercise, transform = x => x, missing = 0) {
  const c = new RepCounter(exercise); let time = 0;
  const send = (sample, frames = 20) => {
    const transformed = sample && transform(structuredClone(sample));
    for (let i=0;i<frames;i++) { time+=50; c.update(transformed?.p || [], transformed?.world || [], time, 4/3); }
  };
  send(motions[exercise][0]()); send(motions[exercise][1]());
  if (missing) send(null, missing);
  send(motions[exercise][1]()); send(motions[exercise][0]());
  return c;
}
function oneSide(sample) {
  for (const id of [12,14,16,24,26,28,30,32]) { sample.p[id].visibility = sample.p[id].presence = .05; }
  return sample;
}
function small(sample) {
  const scale = .25/.77;
  sample.p = sample.p.map(p => ({ ...p, x:.5+(p.x-.5)*scale, y:.6+(p.y-.15)*scale }));
  return sample;
}
for (const exercise of EXERCISES) {
  test(`${exercise}: quarter-frame child still completes a full cycle`, () => {
    const c = run(exercise, small); assert.equal(c.count,1); assert.equal(c.rejected,0);
  });
  test(`${exercise}: one complete side counts without unrelated hands, head or feet`, () => {
    const c = run(exercise, oneSide); assert.equal(c.count,1); assert.equal(c.rejected,0);
  });
  for (const missing of [1,2,3]) test(`${exercise}: ${missing} missing frames preserve a cycle without counting held data`, () => {
    const c = run(exercise, x=>x, missing); assert.equal(c.count,1); assert.equal(c.rejected,0);
    assert.equal(c.snapshot().graceRecoveries,1);
  });
  for (const transform of [x=>x, small, oneSide]) test(`${exercise}: stationary jitter remains zero under each framing relaxation`, () => {
    const c = new RepCounter(exercise); const rest = motions[exercise][0]();
    for (let i=0;i<200;i++) {
      const sample = transform(structuredClone(rest));
      for (const p of sample.p) { p.x += Math.sin(i)*.002; p.y += Math.cos(i)*.002; p.visibility *= .7; p.presence *= .7; }
      for (const p of sample.world) { p.x += Math.sin(i)*.001; p.y += Math.cos(i)*.001; }
      c.update(sample.p,sample.world,(i+1)*50,4/3);
    }
    assert.equal(c.count,0); assert.equal(c.diagnostics.cyclesStarted,0);
  });
}
test('jumping jacks count with wrists outside the frame only when elbows are above shoulders', () => {
  const clipped = sample => {
    const up = sample.p[15].y < .1;
    sample.p[15].y = sample.p[16].y = up ? -.1 : .54;
    sample.p[13].y = sample.p[14].y = up ? .15 : .4;
    return sample;
  };
  assert.equal(run('jumping-jacks',clipped).count,1);
  const noArms = sample => { sample.p[15].y = sample.p[16].y = -.1; return sample; };
  assert.equal(run('jumping-jacks',noArms).count,0);
});
test('required-point confidence is EMA smoothed and held values expire at 400ms', () => {
  const filter = new PoseFilter('squats'), p = pose();
  const visible = filter.update(p.p,p.world,0,4/3); assert.equal(visible.fresh,true);
  const weak = structuredClone(p); weak.p[27].visibility = .1; weak.p[28].visibility = .1;
  const held = filter.update(weak.p,weak.world,50,4/3); assert.equal(held.usable,true); assert.equal(held.fresh,false);
  assert.equal(held.held[27],true); assert.equal(filter.update([],[],400).points[27] != null,true);
  assert.equal(filter.update([],[],401).points[27],undefined);
  assert.equal(FRAMING.pointHoldMs,400); assert.equal(bodyReport(oneSide(p).p).ok,true);
});
test('a held resting pose cannot finish a repetition until an observed return is complete', () => {
  const c = new RepCounter('squats'); let time=0;
  const send = (sample,frames) => { for(let i=0;i<frames;i++) {time+=50;c.update(sample?.p||[],sample?.world||[],time,4/3);} };
  send(pose(),20);send(pose({angle:110}),20);send(pose(),1);send(null,6);
  assert.equal(c.count,0); send(pose(),20);assert.equal(c.count,1);
});
