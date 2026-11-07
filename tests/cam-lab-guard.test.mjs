import test from 'node:test';
import assert from 'node:assert/strict';
import { TrackingGuard, ChildFocus, analyzeLight, LightGuard, phoneState, ShakeGuard, missingPart, guardEnabled } from '../workout/cam-lab/guard.mjs';
import { pose, person } from './cam-lab-fixtures.js';

test('lost tracking: one "lost" after 1.2s absent, one "back" after 0.5s present, short gaps are silent', () => {
  const g = new TrackingGuard(), out = [];
  for (let t = 0; t <= 1000; t += 100) out.push(g.update(false, t)); assert.deepEqual(out.filter(Boolean), []);
  for (let t = 1000; t <= 1100; t += 100) g.update(true, t); // blink: back before the 1.2s mark... then gone again
  const events = []; for (let t = 1200; t <= 3000; t += 100) { const e = g.update(false, t); if (e) events.push(e); }
  assert.deepEqual(events, ['lost']);
  const back = []; for (let t = 3100; t <= 4000; t += 100) { const e = g.update(true, t); if (e) back.push(e); }
  assert.deepEqual(back, ['back']);
});

test('child focus: picks the larger torso, keeps the child when a parent walks past behind', () => {
  const child = person(pose(), { x: .35, size: .8 }), parent = person(pose(), { x: .75, size: .5 });
  const f = new ChildFocus();
  assert.equal(f.pick([parent, child]).pose, child);
  assert.equal(f.pick([child, parent]).pose, child);
  assert.equal(f.pick([child]).others, 0);
  assert.equal(f.pick([]), null);
});

test('light: dark, backlight (bright around a dark body), ok; one bad frame is not reported', () => {
  const w = 8, h = 8, fill = v => new Uint8Array(w * h).fill(v);
  assert.equal(analyzeLight(fill(30), w, h).state, 'dark');
  assert.equal(analyzeLight(fill(140), w, h).state, 'ok');
  const back = fill(200); for (let y = 0; y < h; y++) for (let x = 3; x < 5; x++) back[y * w + x] = 60;
  assert.equal(analyzeLight(back, w, h, { x0: .3, x1: .65, y0: 0, y1: 1 }).state, 'backlight');
  const lg = new LightGuard(); assert.equal(lg.update('dark', 0), null); assert.equal(lg.update('dark', 1600), 'dark');
  assert.equal(lg.update('ok', 1700), null);
});

test('phone: upright is fine; upside-down, landscape and tilted are named; shaking needs to persist', () => {
  assert.equal(phoneState({ x: 0, y: 9.8, z: 0 }), null);
  assert.equal(phoneState({ x: 0, y: -9.8, z: 0 }), 'upside-down');
  assert.equal(phoneState({ x: 9.8, y: 0, z: 0 }), 'landscape');
  assert.equal(phoneState({ x: 0, y: 7.5, z: 6.3 }), 'tilted');
  assert.equal(phoneState(null), null);
  const s = new ShakeGuard(); let shook = false;
  for (let t = 0; t < 1500; t += 50) shook = s.update({ x: 0, y: 9.8 + (t / 50 % 2 ? 4 : -4), z: 0 }, t) || shook;
  assert.equal(shook, true);
  const calm = new ShakeGuard(); assert.equal([0, 50, 100, 150].some(t => calm.update({ x: 0, y: 9.8, z: 0 }, t)), false);
});

test('missing part names legs when cut at the bottom, head when cut at the top', () => {
  const l = person(pose(), { x: .5, size: .8 }).landmarks;
  for (const i of [27, 28, 29, 30, 31, 32]) { l[i].visibility = .05; l[i].y = 1.1; }
  assert.equal(missingPart(l), 'legs');
  const t = person(pose(), { x: .5, size: .8 }).landmarks; for (const i of [0, 7, 8]) t[i].visibility = .05;
  assert.equal(missingPart(t), 'head');
  assert.equal(missingPart(person(pose(), { x: .5, size: .8 }).landmarks), null);
});

test('flags: ?camGuard=0 turns all guards off; ?camFocus defaults off', () => {
  assert.equal(guardEnabled('?camGuard=0'), false); assert.equal(guardEnabled(''), true);
  assert.equal(guardEnabled('', 'camFocus', false), false); assert.equal(guardEnabled('?camFocus=1', 'camFocus', false), true);
});
