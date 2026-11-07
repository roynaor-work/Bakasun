import test from 'node:test';
import assert from 'node:assert/strict';
import { RepCounter } from '../workout/cam-lab/counter.mjs';
import { pose } from './cam-lab-fixtures.js';

const moves = {
  squats: [() => pose(), () => pose({ angle: 110 })],
  'jumping-jacks': [() => pose(), () => pose({ feet: 2.2, hands: .07 })],
  'high-knees': [() => pose(), () => { const s = pose(); s.p[25].y = .40; s.p[27].y = .60; return s; }],
};
let flip = 0; // high-knees must alternate legs
moves['high-knees'][1] = () => { const s = pose(), [k, a] = flip++ % 2 ? [26, 28] : [25, 27]; s.p[k].y = .40; s.p[a].y = .60; return s; };
function rig(exercise) {
  const counter = new RepCounter(exercise); let time = 0;
  const send = (sample, frames = 16) => { for (let i = 0; i < frames; i++) { time += 50; counter.update(sample.p, sample.world, time, 4 / 3); } };
  const gap = (ms) => { for (let t = 0; t < ms; t += 50) { time += 50; counter.update([], [], time, 4 / 3); } };
  return { counter, send, gap };
}
for (const ex of Object.keys(moves)) {
  const [rest, move] = moves[ex];
  test(`${ex}: 5 clean reps count exactly 5`, () => {
    const r = rig(ex); r.send(rest());
    for (let i = 0; i < 5; i++) { r.send(move()); r.send(rest()); }
    assert.equal(r.counter.count, 5);
  });
  test(`${ex}: standing still with small jitter never counts`, () => {
    const r = rig(ex);
    for (let i = 0; i < 60; i++) { const s = rest(); s.p.forEach(p => { p.x += Math.sin(i + p.y * 9) * .004; p.y += Math.cos(i * 1.3 + p.x * 7) * .004; }); r.send(s, 1); }
    assert.equal(r.counter.count, 0);
  });
  test(`${ex}: the child leaving the frame for 2s between reps keeps the count and adds none`, () => {
    const r = rig(ex); r.send(rest());
    for (let i = 0; i < 3; i++) { r.send(move()); r.send(rest()); }
    r.gap(2000);
    assert.equal(r.counter.count, 3);
    r.send(rest(), 20);
    for (let i = 0; i < 2; i++) { r.send(move()); r.send(rest()); }
    assert.equal(r.counter.count, 5);
  });
}
