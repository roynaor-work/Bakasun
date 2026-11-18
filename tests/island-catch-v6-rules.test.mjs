import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildTrack, seededRandom} from '../workout/island/minigames/catch-track.mjs';
import {createTyreGun, TYRES} from '../workout/island/minigames/catch-tyres.mjs';
import {createChaseEngine6, driveChase6, DRIVING6, CHASE6} from '../workout/island/minigames/catch-chase6.mjs';

const balance = JSON.parse(await readFile(new URL('../workout/island/data/config.json', import.meta.url), 'utf8')).minigames.catchCriminal;
const ctx = (over = {}) => ({gap: 12, lateral: .4, vOfficer: 24, vThief: 21, stun: 0, scraping: false, thiefSwerve: 0, curvature: 0, ...over});

test('track: continuous, exact arc lengths, right-hand offset, bends on every stage', () => {
  const t = buildTrack({seed: 5, length: 1200, curve: .6});
  assert.ok(t.length >= 1200);
  let maxJump = 0; for (let s = 0; s < t.length; s += .5) { const a = t.sample(s), b = t.sample(s + .5); maxJump = Math.max(maxJump, Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - .5)); }
  assert.ok(maxJump < .02, 'samples are one metre apart along the path: ' + maxJump);
  const p = t.toWorld(100, 2), back = t.toTrack(p.x, p.z, 90); assert.ok(Math.abs(back.s - 100) < .01 && Math.abs(back.d - 2) < .01);
  assert.ok(t.segments.some(s => s.kind === 'arc'), 'has turns');
  assert.equal(t.segments[0].kind, 'straight'); assert.equal(t.segments.at(-1).kind, 'straight');
  // the start heads +x and a left arc turns toward -z (right = +z)
  const r = t.toWorld(10, 1); assert.ok(Math.abs(r.z - 1) < 1e-9 && Math.abs(r.x - 10) < 1e-9);
  for (const seg of t.segments.filter(s => s.kind === 'arc')) assert.ok(seg.radius >= 45 && seg.radius <= 175, 'radius in the drivable band: ' + seg.radius);
  for (let stage = 1; stage <= 10; stage++) { const tt = buildTrack({seed: 31 + stage, length: 1000, curve: balance.levels[stage - 1].chase.curve}); assert.ok(tt.segments.filter(s => s.kind === 'arc').length >= 3, 'stage ' + stage + ' has at least three bends'); }
  // beyond the ends the road is straight
  const e = t.sample(t.length + 50); assert.equal(e.k, 0);
});

test('tyre gun: locks only when close, in front and in line; chance falls with distance, bends and instability', () => {
  const g = createTyreGun({stage: 1, rnd: seededRandom(1)});
  g.step(1 / 60, ctx({gap: 40})); assert.equal(g.state.locked, false);
  g.step(1 / 60, ctx({gap: 12})); assert.equal(g.state.locked, true); assert.equal(g.state.lockWheel, 'RL');
  const near = g.state.hitChance; g.step(1 / 60, ctx({gap: 26})); const far = g.state.hitChance; assert.ok(far < near);
  g.step(1 / 60, ctx({gap: 12, curvature: 1 / 50})); assert.ok(g.state.hitChance < near);
  g.step(1 / 60, ctx({gap: 12, stun: .5})); assert.ok(g.state.hitChance < near * .5);
  g.step(1 / 60, ctx({gap: 12, lateral: 5})); assert.equal(g.state.locked, false);
  g.step(1 / 60, ctx({gap: 12, lateral: -1})); assert.equal(g.state.lockWheel, 'RR');
  assert.deepEqual(g.drainEvents().map(e => e.type), ['lock', 'lock', 'lock']);
});

test('tyre gun: reload, ammo trickle, flats slow the thief and stop the car after flatsToStop', () => {
  const g = createTyreGun({stage: 1, rnd: () => 0}); // every shot hits
  g.step(1 / 60, ctx()); assert.equal(g.fire(), true); assert.equal(g.fire(), false, 'reloading');
  const ev = g.drainEvents(); assert.deepEqual(ev.map(e => e.type), ['lock', 'shot', 'flat']); assert.equal(ev[1].hit, true); assert.equal(ev[1].wheel, 'RL');
  assert.ok(g.thiefSpeedScale() < 1 && g.thiefSpeedScale() > .6);
  for (let i = 0; i < 60; i++) g.step(1 / 60, ctx());
  assert.equal(g.state.reload, 0); assert.equal(g.fire(), true);
  const ev2 = g.drainEvents().map(e => e.type); assert.ok(ev2.includes('flat') && ev2.includes('stopped'));
  assert.equal(g.state.stopped, true); assert.equal(g.fire(), false);
  assert.ok(Math.abs(g.thiefWobble(1)) > 0);
  // trickle: one bullet back every trickleSeconds
  const h = createTyreGun({stage: 1, rnd: () => 1}); h.step(1 / 60, ctx()); h.fire(); const ammo = h.state.ammo;
  for (let i = 0; i < 60 * (TYRES.trickleSeconds + .1); i++) h.step(1 / 60, ctx({gap: 40}));
  assert.equal(h.state.ammo, ammo + 1);
  // no ammo: fire refuses with an event
  const n = createTyreGun({stage: 1, rnd: () => 1}); n.step(1 / 60, ctx()); for (let i = 0; i < 20; i++) { n.fire(); for (let k = 0; k < 60; k++) n.step(1 / 60, ctx()); }
  assert.equal(n.state.ammo, 0); assert.equal(n.fire(), false); assert.ok(n.drainEvents().some(e => e.type === 'noAmmo'));
});

test('chase6: countdown, a bend pushes the car outward unless it steers, the kerb slows it', () => {
  const ch = createChaseEngine6({balance, stage: 3, seed: 2});
  const dt = 1 / 60; let types = [];
  for (let i = 0; i < 60 * 3; i++) { ch.step(dt); types.push(...ch.drainEvents().map(e => e.type)); }
  assert.deepEqual(types.filter(t => t === 'count' || t === 'go'), ['count', 'count', 'go']);
  assert.equal(ch.state.phase, 'run');
  // drive into the first arc without steering
  const arc = ch.track.segments.find(s => s.kind === 'arc');
  let scraped = false, maxD = 0; const v0 = ch.state.v;
  while (ch.state.s < arc.s1 && ch.state.phase === 'run') { ch.step(dt); for (const e of ch.drainEvents()) if (e.type === 'scrape') scraped = true; maxD = Math.max(maxD, Math.abs(ch.state.d)); }
  assert.ok(maxD > CHASE6.shoulder, 'carried to the shoulder: ' + maxD); assert.ok(scraped, 'the kerb scrapes');
  assert.ok(ch.state.v < v0, 'the kerb slows the car');
  // steering into the bend keeps the car on the road
  const ch2 = createChaseEngine6({balance, stage: 3, seed: 2});
  for (let i = 0; i < 60 * 3; i++) ch2.step(dt);
  let maxD2 = 0;
  while (ch2.state.s < arc.s1 && ch2.state.phase === 'run') { ch2.setSteer(-Math.sign(ch2.state.slide || ch2.state.curvature) * Math.min(1, Math.abs(ch2.state.slide) / CHASE6.steerSpeed * 1.1)); ch2.step(dt); ch2.drainEvents(); maxD2 = Math.max(maxD2, Math.abs(ch2.state.d)); }
  assert.ok(maxD2 < CHASE6.shoulder, 'steering into the bend holds the lane: ' + maxD2);
});

test('chase6: a turn is announced ahead, the thief brakes for tight corners, flats stop the car and the chase ends caught with a frame', () => {
  const ch = createChaseEngine6({balance, stage: 2, seed: 4});
  const dt = 1 / 60; const seen = new Set();
  for (let i = 0; i < 60 * 12; i++) { ch.setSteer(-ch.state.slide / CHASE6.steerSpeed); ch.step(dt); for (const e of ch.drainEvents()) seen.add(e.type); }
  assert.ok(seen.has('turn'), 'a bend was announced');
  // force two hits through the gun
  const g = ch.gun; let guard = 0;
  while (!g.state.stopped && guard++ < 60 * 60) { ch.setSteer(((ch.state.crim.d - ch.state.d) * .5 - ch.state.slide / CHASE6.steerSpeed)); ch.setBoost(ch.state.gap > 6); ch.step(dt); if (g.state.locked) { g.state.hitChance = 1; ch.fire(); } ch.drainEvents(); }
  assert.ok(g.state.stopped, 'stopped by flats'); assert.equal(ch.state.phase, 'skid');
  guard = 0; while (ch.state.phase !== 'end' && guard++ < 60 * 20) { ch.step(dt); ch.drainEvents(); }
  const r = ch.result();
  assert.equal(r.how, 'caught'); assert.equal(r.byTyres, true); assert.equal(r.closeness, 1);
  assert.ok(Number.isFinite(r.frame.s0) && Math.abs(r.frame.d0) <= 3);
  assert.ok(Math.abs(ch.state.crim.s - ch.state.crim.stopS) < .2, 'the car stops where the skid said');
  assert.ok(Math.abs(ch.track.curvatureAt(r.frame.s0 + 10)) < 1 / 60, 'stops on a gentle stretch');
});

test('chase6: deterministic, the model driver catches most at stage 1 and fewer at stage 10', () => {
  const a = driveChase6(createChaseEngine6({balance, stage: 4, seed: 9}), DRIVING6.good, seededRandom(7));
  const b = driveChase6(createChaseEngine6({balance, stage: 4, seed: 9}), DRIVING6.good, seededRandom(7));
  assert.deepEqual(a, b);
  const rate = stage => { let n = 0; for (let g = 1; g <= 30; g++) n += driveChase6(createChaseEngine6({balance, stage, seed: g}), DRIVING6.good, seededRandom(g * 13 + stage)).byTyres ? 1 : 0; return n / 30; };
  const r1 = rate(1), r10 = rate(10);
  assert.ok(r1 >= .7, 'stage 1 tyre stops: ' + r1); assert.ok(r10 <= .75 && r10 >= .1, 'stage 10 tyre stops: ' + r10); assert.ok(r1 > r10);
});
