import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {seededRandom} from '../workout/island/minigames/catch-track.mjs';
import {createTyreGun} from '../workout/island/minigames/catch-tyres.mjs';
import {createChaseEngine6, driveChase6, DRIVING6, CHASE7} from '../workout/island/minigames/catch-chase6.mjs';
import {createArsenal, ARSENAL, assistChance, quality7, STRINGS as TOOL_STRINGS} from '../workout/island/minigames/catch-weapons.mjs';
import {createCatchEngine} from '../workout/island/minigames/catch-engine.mjs';
import {ASSIST7, levels7, leadPoint, idealAim, assistRelease, assistInfo, pullFor, visualAngle, arcPointAt} from '../workout/island/minigames/catch-assist.mjs';
import {createCatchAudio} from '../workout/island/minigames/catch-audio.mjs';
import {STRINGS as HUD_STRINGS, zoneWorld, dotWorld, pipStates7, toolLabel, resolveText, installArsenalHud} from '../workout/island/minigames/catch-arsenal-hud.mjs';
import {runCatchSession6, SIREN7} from '../workout/island/minigames/catch-session6.mjs';
import {measureKid, playKid} from '../workout/island/tools/catch-sim7.mjs';

/** v7 of "תפוס את הפושע" (13/11, Roy after v22): the chase gets more (nitro orbs, police roadblocks, oil the thief skids on, a
 * nitro bonus for close overtakes), five tools from the first second with one cycle button and one damage meter, an aim assist
 * for the chase and the catch, a softer siren, and the flags that bring v6/v22 back. */
const root = new URL('../workout/island/', import.meta.url);
const balance = JSON.parse(await readFile(new URL('data/config.json', root), 'utf8')).minigames.catchCriminal;
const V7 = {weapons: true, assist: true, elements: true};
const ctx = (over = {}) => ({gap: 12, lateral: .3, dOfficer: 0, dThief: .3, thiefTargetD: .3, vOfficer: 24, vThief: 21, sThief: 100, sOfficer: 88, stun: 0, scraping: false, thiefSwerve: 0, curvature: 0, crimSteer: 2.6, ...over});

test('v7 tools: five of them from the first second, one button cycles, each has its own ammo, a hit fills the meter', () => {
  const a = createArsenal({stage: 1, rnd: () => 0, assist: true, addDamage: x => (total = Math.min(1, total + x))}); let total = 0;
  assert.deepEqual(a.ids, ['tyres', 'net', 'spikes', 'emp', 'mark']);
  a.step(1 / 60, ctx()); assert.equal(a.state.locked, true, 'locked at once: no 14 s wait'); assert.equal(a.state.armed, true);
  const seen = [a.current]; for (let i = 0; i < 5; i++) seen.push(a.next());
  assert.deepEqual(seen, ['tyres', 'net', 'spikes', 'emp', 'mark', 'tyres'], 'the button goes round all five');
  assert.ok(a.drainEvents().filter(e => e.type === 'weapon').length === 5);
  a.step(1 / 60, ctx()); const ammo = a.state.ammo; assert.equal(a.fire(), true);
  assert.equal(a.state.ammo, ammo - 1); assert.equal(a.state.perTool.net.ammo, ARSENAL.tools.net.ammo, 'the other tools keep theirs');
  const ramp = t => Math.min(1, ARSENAL.rampFrom + (1 - ARSENAL.rampFrom) * t / ARSENAL.rampSeconds[0]);
  assert.ok(Math.abs(total - ramp(a.raw.t) / ARSENAL.hitsToStop[0]) < 1e-9, 'one tyre hit = 1/hitsToStop of the meter, less in the first seconds');
  assert.ok(ramp(0) < .7 && ramp(ARSENAL.rampSeconds[0]) === 1, 'early hits count less, so a sharp player still drives through the bends');
  const ev = a.drainEvents().map(e => e.type); assert.deepEqual(ev, ['shot', 'flat'], 'the v6 event shapes for the tyre fx');
  assert.equal(a.fire(), false, 'reloading');
  // the meter fills: the car goes down
  let guard = 0; while (!a.state.stopped && guard++ < 2000) { a.step(1 / 30, ctx()); if (a.state.reload <= 0 && a.state.ammo > 0) a.fire(); else if (a.state.ammo <= 0) a.next(); }
  assert.equal(a.state.stopped, true); assert.equal(a.state.damage, 1); assert.ok(a.drainEvents().some(e => e.type === 'stopped'));
  assert.equal(a.fire(), false, 'nothing to fire at a car that is down');
});

test('v7 tools: every target is a part of the car or the road; the net, the pulse and the tracker slow him; the strip waits for him', async () => {
  for (const [id, d] of Object.entries(ARSENAL.tools)) { assert.ok(d.zone && Number.isFinite(d.zone.y) && d.zone.w > 0, id); assert.ok(d.range[1] > d.range[0] && d.range[2] > d.range[0], id); }
  const run = (id, over = {}) => { let dmg = 0; const a = createArsenal({stage: 2, rnd: () => 0, addDamage: x => (dmg += x)}); a.select(id); a.drainEvents(); a.step(1 / 60, ctx(over)); const fired = a.fire(); return {a, fired, ev: a.drainEvents(), dmg: () => dmg}; };
  const net = run('net'); assert.ok(net.fired && net.ev.some(e => e.type === 'netted')); assert.ok(net.a.thiefSpeedScale() < .8, 'clogged engine');
  const emp = run('emp', {gap: 9}); assert.ok(emp.ev.some(e => e.type === 'emp')); assert.ok(emp.a.thiefSpeedScale() < .6, 'stalled');
  assert.equal(run('emp', {gap: 20}).fired, false, 'the pulse is short range');
  const mark = run('mark'); assert.ok(mark.ev.some(e => e.type === 'marked')); assert.ok(mark.a.raw.marked > 0 && mark.a.thiefSpeedScale() < 1);
  // the tracker widens the cone of the other tools
  const wide = (marked) => { const a = createArsenal({stage: 8, rnd: () => 0}); if (marked) { a.select('mark'); a.step(1 / 60, ctx()); a.fire(); a.select('net'); } else a.select('net'); a.step(1 / 60, ctx({gap: 14})); return a.raw.allowed; };
  assert.ok(wide(true) > wide(false), 'marked: a wider cone for the next tool');
  // spikes: the strip lands ahead in the officer's lane and catches him only if he drives over it
  const sp = run('spikes', {dOfficer: 0, dThief: 0, thiefTargetD: 0}); assert.ok(sp.fired && sp.ev.some(e => e.type === 'spikesOut'));
  const strip = sp.a.strips[0]; assert.equal(strip.s, 100 + ARSENAL.stripAhead); assert.equal(strip.d, 0);
  sp.a.step(1 / 60, ctx({sThief: strip.s - 1, dThief: .5})); const hitEv = sp.a.drainEvents();
  assert.ok(hitEv.some(e => e.type === 'wshot' && e.weapon === 'spikes' && e.hit && e.late) && hitEv.some(e => e.type === 'spikes'), 'he drove over it');
  assert.ok(sp.dmg() > 0 && sp.a.raw.flatCount >= 2);
  const miss = run('spikes', {dOfficer: 3.6, dThief: 0, thiefTargetD: 0}); miss.a.step(1 / 60, ctx({sThief: miss.a.strips[0].s - 1, dThief: 0}));
  assert.ok(miss.a.drainEvents().some(e => e.type === 'wshot' && e.hit === false), 'another lane: he passes it');
  const src = await readFile(new URL('minigames/catch-weapons.mjs', root), 'utf8');
  assert.match(src, /never a person/); assert.equal(/[؀-ۿ]/.test(src), false);
});

test('v7 aim assist in the chase: on target inside the cone, fading outside, the v6 roll without it, a close time on the first green lock', () => {
  assert.equal(assistChance(3, 10, .9), .9); assert.ok(assistChance(14, 10, .9) < .9 && assistChance(14, 10, .9) > assistChance(17.9, 10, .9)); assert.equal(assistChance(30, 10, .9), ARSENAL.outside);
  assert.equal(quality7(.61), 'green'); assert.equal(quality7(.31), 'yellow'); assert.equal(quality7(.2), 'grey');
  // assist off: the tyre tool rolls exactly the v6 tyre-gun chance
  const off = createArsenal({stage: 4, rnd: () => .5, assist: false}), v6 = createTyreGun({stage: 4, rnd: () => .5});
  for (const c of [ctx(), ctx({gap: 20, lateral: 2, dThief: 2}), ctx({curvature: 1 / 80, thiefSwerve: .5})]) { off.step(1 / 60, c); v6.step(1 / 60, {...c, armed: true}); assert.ok(Math.abs(off.state.hitChance - v6.state.hitChance) < 1e-12, 'same chance as v6'); }
  // assist on: lined up = green and better than v6; far off the line = grey
  const on = createArsenal({stage: 4, rnd: () => .5}); on.step(1 / 60, ctx({lateral: .85, dThief: .85})); assert.equal(on.state.quality, 'green');
  assert.ok(on.state.hitChance > v6.state.hitChance);
  const far = createArsenal({stage: 4, rnd: () => .5}); far.step(1 / 60, ctx({lateral: 4.4, dThief: 4.4, gap: 8})); assert.notEqual(far.state.quality, 'green');
  // close time: the first green lock slows him and stops his weaving for a moment, then a cool-down
  const ev = on.drainEvents(); assert.ok(ev.some(e => e.type === 'closeTime')); assert.equal(on.calm(), true); assert.ok(on.thiefSpeedScale() < 1);
  for (let i = 0; i < 60 * 2; i++) on.step(1 / 60, ctx({lateral: .85, dThief: .85})); assert.equal(on.calm(), false, 'over after about 1.5 s');
  for (let i = 0; i < 60; i++) on.step(1 / 60, ctx({lateral: .85, dThief: .85})); assert.equal(on.drainEvents().filter(e => e.type === 'closeTime').length, 0, 'cool-down');
});

test('v7 chase: v6 stays exact without the flags; the new road has nitro lines, police roadblocks with one open lane, oil he skids on', () => {
  const v6a = driveChase6(createChaseEngine6({balance, stage: 4, seed: 9}), DRIVING6.good, seededRandom(7));
  const v6b = driveChase6(createChaseEngine6({balance, stage: 4, seed: 9, v7: {weapons: false, assist: false, elements: false}}), DRIVING6.good, seededRandom(7));
  assert.deepEqual(v6a, v6b, 'all v7 parts off = v6');
  const plain = createChaseEngine6({balance, stage: 5, seed: 4}), seven = createChaseEngine6({balance, stage: 5, seed: 4, v7: V7});
  assert.deepEqual(seven.obstacles.slice(0, plain.obstacles.length).map(o => [o.kind, o.s, o.d]), plain.obstacles.map(o => [o.kind, o.s, o.d]), 'the v6 obstacles are untouched');
  const nitro = seven.obstacles.filter(o => o.kind === 'nitro'), blocks = seven.obstacles.filter(o => o.police);
  assert.ok(nitro.length >= 6 && nitro.length % CHASE7.nitroLine === 0, 'nitro lines: ' + nitro.length);
  assert.ok(blocks.length >= 2 && blocks.length % 2 === 0, 'roadblocks close two lanes: ' + blocks.length);
  for (const b of blocks) { const at = blocks.filter(x => Math.abs(x.s - b.s) < 1); assert.equal(at.length, 2); assert.equal(seven.C.lanes.filter(l => !at.some(x => x.d === l)).length, 1, 'one lane stays open'); }
  assert.equal(createChaseEngine6({balance, stage: 1, seed: 4, v7: V7}).obstacles.filter(o => o.police).length, 0, 'no roadblock on stage 1');
  // nitro: drive through an orb
  const ch = createChaseEngine6({balance, stage: 5, seed: 4, v7: V7}); for (let i = 0; i < 60 * 3; i++) ch.step(1 / 60);
  const orb = nitro[0]; ch.state.s = orb.s - 1.5; ch.state.d = orb.d; ch.state.tank = .2; ch.step(1 / 60); const ev = ch.drainEvents();
  assert.ok(ev.some(e => e.type === 'nitro') && ch.state.tank > .4, 'an orb refills the boost');
  // oil: the thief skids on it too
  const ch2 = createChaseEngine6({balance, stage: 3, seed: 2, v7: V7}); for (let i = 0; i < 60 * 3; i++) ch2.step(1 / 60);
  ch2.obstacles.push({id: 999, kind: 'oil', s: ch2.state.crim.s + .5, d: ch2.state.crim.d, len: 3}); const v0 = ch2.state.crim.v;
  let crimOil = false; for (let i = 0; i < 40; i++) { ch2.step(1 / 60); if (ch2.drainEvents().some(e => e.type === 'crimOil')) crimOil = true; }
  assert.ok(crimOil, 'crimOil event'); assert.ok(ch2.state.crim.v < v0, 'and he slows');
});

test('v7 chase: tools from the start bring the car down, the chase still runs through bends, and it ends caught at the skid', () => {
  for (const stage of [1, 5, 10]) {
    const {chase} = playKid(stage, 3, 'v7');
    assert.ok(chase.kid.firstShotAt !== null && chase.kid.firstShotAt < 8, `stage ${stage}: a shot within the first seconds (${chase.kid.firstShotAt})`);
    assert.ok(chase.seconds > 12, `stage ${stage}: the chase is not over at once (${chase.seconds.toFixed(1)} s)`);
  }
  const ch = createChaseEngine6({balance, stage: 2, seed: 4, v7: V7}); for (let i = 0; i < 60 * 3; i++) ch.step(1 / 60);
  assert.equal(ch.forceDown(), true); assert.equal(ch.state.phase, 'skid');
  let g = 0; while (ch.state.phase !== 'end' && g++ < 60 * 20) ch.step(1 / 60);
  const r = ch.result(); assert.equal(r.how, 'caught'); assert.equal(r.byWeapons, true); assert.equal(r.closeness, 1); assert.equal(ch.gun.state.stopped, true);
});

test('v7 chase: a sharp player who fires on every green still drives the bends (early hits count less)', () => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), secs = [];
  for (let seed = 1; seed <= 12; seed++) {
    const ch = createChaseEngine6({balance, stage: 1, seed, v7: V7}); let g = 0;
    while (ch.state.phase !== 'end' && g++ < 60 * 80) {
      const st = ch.state, gs = ch.gun.state, a = ch.gun.aimInfo();
      if (st.phase === 'run') {
        const free = lane => { let f = 60; for (const o of ch.obstacles) { if (['pad', 'nitro', 'oil'].includes(o.kind)) continue; const os = ch.obstacleS(o, st.t) - st.s; if (os > -2 && os < 60 && Math.abs(o.d - lane) < 2.2) f = Math.min(f, os); } return f; };
        const best = ch.C.lanes.reduce((b, l) => free(l) - Math.abs(l - st.d) * 1.5 > free(b) - Math.abs(b - st.d) * 1.5 ? l : b, 0);
        const zone = gs.locked && a ? (a.weapon === 'spikes' ? a.predD : a.zoneD) : st.crim.d, want = free(clamp(zone, -3.6, 3.6)) > 22 ? zone : best;
        ch.setSteer(clamp((want - st.d) * .55 - st.slide / 5.6, -1, 1)); ch.setBoost(st.tank > .15 && st.gap > 7 && Math.abs(ch.track.curvatureAt(st.s + 30)) < 1 / 110); ch.setBrake(st.gap < -1.5);
        if (gs.locked && gs.quality === 'green' && gs.reload <= 0 && gs.ammo > 0) ch.fire();
        if (gs.ammo <= 0 && gs.reload <= 0) ch.cycle();
      }
      ch.step(1 / 60); ch.drainEvents();
    }
    secs.push(ch.result().seconds);
  }
  secs.sort((a, b) => a - b); const median = secs[6];
  assert.ok(median >= 11, 'the chase lasts for a sharp player too: median ' + median.toFixed(1) + ' s');
});

test('v7 catch assist: the lead point, a pulled release catches inside the cone, nothing outside it, the close time slows him', () => {
  const L = levels7(balance);
  assert.ok(L.every(l => l.pop === null), 'no ducking in the open'); assert.ok(L[0].radiusScale > 1 && L[9].radiusScale >= 1);
  assert.ok(L.every((l, i) => l.throws >= ((balance.levels[i].v6 || {}).throws || balance.levels[i].throws)), 'never fewer throws'); assert.ok(L[8].throws > (balance.levels[8].v6.throws), 'more throws on the hard stages');
  const mk = stage => createCatchEngine({balance: {...balance, levels: L}, stage, seed: 5, v2: true, mods: {distScale: .75, windScale: .6}, feel: true, arch: true});
  // stage 6: a runner; the lead is where he is when the net arrives
  const e = mk(6); for (let i = 0; i < 30; i++) e.step(1 / 60);
  const lead = leadPoint(e), at = e.criminalAt(lead.t); assert.ok(Math.abs(lead.z - at.z) < 1e-9 && Math.abs(lead.x - at.x) < 1e-9);
  // an aim 9 degrees off to the side on stage 1 is pulled onto him and catches; 30 degrees off is left alone
  for (const [stage, offDeg, wantPull] of [[1, 9, true], [1, 30, false], [10, 25, false]]) {
    const g = mk(stage); for (let i = 0; i < 20; i++) g.step(1 / 60);
    const t = leadPoint(g), dist = Math.hypot(t.x - ASSIST7.eye.x, t.z), off = {...t, z: t.z + dist * Math.tan(offDeg * Math.PI / 180)};
    const aim = idealAim(g, off); g.setAim({...aim, yaw: aim.yaw - g.wobbleAt(g.clock).yaw, angle: aim.angle - g.wobbleAt(g.clock).angle});
    const r = assistRelease(g, stage); const f = g.release();
    assert.equal(r.pull > 0, wantPull, `stage ${stage}, ${offDeg} degrees: pull ${r.pull}`);
    if (wantPull) assert.equal(f.kind, 'catch', 'pulled onto him'); else assert.notEqual(f.kind, 'catch');
  }
  assert.ok(pullFor(1, 1) === 1 && pullFor(ASSIST7.cone[0] + 1, 1) === 0 && pullFor(ASSIST7.cone[0] * .9, 1) > 0, 'full pull inside, none outside');
  assert.ok(pullFor(12, 1) > pullFor(12, 10), 'stage 10 asks for a closer aim');
  // close time: he moves at a fraction of his speed for a moment, once per turn, and a flight resolved during it still matches
  const a = mk(6), b = mk(6); for (let i = 0; i < 30; i++) { a.step(1 / 60); b.step(1 / 60); }
  assert.equal(a.closeTime(1.2, .3), true); assert.equal(a.closeTime(1.2, .3), false, 'once per turn'); assert.equal(a.inCloseTime(), true);
  const zA = [], zB = []; for (let i = 0; i < 30; i++) { a.step(1 / 60); b.step(1 / 60); zA.push(a.criminalAt(a.clock).z); zB.push(b.criminalAt(b.clock).z); }
  const moveA = Math.abs(zA[29] - zA[0]), moveB = Math.abs(zB[29] - zB[0]); assert.ok(moveA < moveB * .6, `slower in close time: ${moveA.toFixed(2)} vs ${moveB.toFixed(2)}`);
  const f1 = a.trajectory(10, 1, a.aim.tool, {resolve: true, t0: a.clock + .26, yaw: 0}), f2 = a.trajectory(10, 1, a.aim.tool, {resolve: true, t0: a.clock + .26, yaw: 0}); assert.deepEqual(f1.contact, f2.contact, 'deterministic');
  // without a window the engine is the v6 engine: same thief at the same clock
  const c = mk(6), d = mk(6); for (let i = 0; i < 90; i++) { c.step(1 / 60); d.step(1 / 60); } assert.deepEqual(c.criminalAt(c.clock), d.criminalAt(d.clock));
  assert.ok(visualAngle({x: 10, y: 1.55, z: 0}, {x: 10, y: 1.55, z: 10 * Math.tan(.1)}).e > 5.6, 'visual angle in degrees');
  assert.ok(arcPointAt(e, {angle: 8, power: 1, yaw: 0}, 10).x === 10);
  assert.ok(assistInfo(e, 6).cone === ASSIST7.cone[5]);
});

test('v7 hit rates for an average child (aim noise 8-12 degrees, reaction 0.3-0.6 s): v22 against v7, the bands of the brief', () => {
  const games = 36, r = measureKid(games, [1, 5, 9], ['v22', 'v7']);
  const row = (v, stage) => r[v].find(x => x.stage === stage);
  for (const stage of [1, 5, 9]) {
    assert.ok(row('v7', stage).shots + row('v7', stage).throws >= 100, 'at least 100 attempts per stage');
    assert.ok(row('v7', stage).allHit > row('v22', stage).allHit + .2, `stage ${stage}: v7 hits far more than v22 (${row('v7', stage).allHit.toFixed(2)} vs ${row('v22', stage).allHit.toFixed(2)})`);
  }
  const band = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what}: ${(x * 100).toFixed(0)}% not in ${lo * 100}-${hi * 100}`);
  // the bands with a little room for the small sample (the 150-game run is in the report)
  band(row('v7', 1).shotHit, .64, .9, 'stage 1 chase'); band(row('v7', 1).throwHit, .64, .92, 'stage 1 throw');
  band(row('v7', 5).shotHit, .5, .76, 'stage 5 chase'); band(row('v7', 5).throwHit, .48, .76, 'stage 5 throw');
  band(row('v7', 9).shotHit, .36, .62, 'stage 9 chase'); band(row('v7', 9).throwHit, .34, .62, 'stage 9 throw');
  assert.ok(row('v22', 1).throwHit < .2, 'v22: the net almost never caught him for a child: ' + row('v22', 1).throwHit);
});

test('v7 siren: 45% softer by default (gain x0.55, about -5.2 dB), ?catchSiren=v6 brings the v6 level back', async () => {
  // a fake Web Audio context that records the gain ramps the synth siren schedules (the recorded loop is not decoded here)
  const peaks = [];
  class Param { constructor(rec) { this.value = 0; this.rec = rec; } setValueAtTime(v) { if (this.rec) peaks.push(v); this.value = v; } linearRampToValueAtTime(v) { if (this.rec) peaks.push(v); } exponentialRampToValueAtTime() {} setTargetAtTime() {} cancelScheduledValues() {} }
  class Node { constructor() { this.gain = new Param(true); this.frequency = new Param(); this.detune = new Param(); this.Q = new Param(); this.threshold = new Param(); this.knee = new Param(); this.ratio = new Param(); this.attack = new Param(); this.release = new Param(); this.playbackRate = new Param(); } connect(n) { return n || this; } start() {} stop() {} }
  class Ctx { constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.destination = new Node(); } createGain() { return new Node(); } createOscillator() { return new Node(); } createBiquadFilter() { return new Node(); } createDynamicsCompressor() { return new Node(); } createBuffer() { return {getChannelData: () => new Float32Array(8)}; } createBufferSource() { return new Node(); } resume() {} close() {} decodeAudioData() { return Promise.reject(new Error('no')); } }
  const peak = scale => { peaks.length = 0; globalThis.AudioContext = Ctx; try { const a = createCatchAudio(scale === undefined ? {} : {sirenScale: scale}); a.cue('siren', {approach: 0}); a.dispose(); } finally { delete globalThis.AudioContext; } return Math.max(...peaks); };
  const v6 = peak(), v7 = peak(SIREN7);
  assert.ok(Math.abs(v6 - .07) < 1e-9, 'v6 synth siren peak .07'); assert.ok(Math.abs(v7 / v6 - .55) < 1e-9, 'v7 = 55% of it');
  const db = 20 * Math.log10(v7 / v6); assert.ok(db < -4.4 && db > -6.1, '40 to 50 percent softer: ' + db.toFixed(2) + ' dB');
  const s6 = await readFile(new URL('minigames/catch-session6.mjs', root), 'utf8'), au = await readFile(new URL('minigames/catch-audio.mjs', root), 'utf8');
  assert.match(s6, /params\.get\('catchSiren'\)\) === 'v6' \? 1 : SIREN7/); assert.match(s6, /createCatchAudio\(\{sirenScale/);
  assert.match(au, /SIREN_GAIN \* level \* SIREN_SCALE/, 'the recorded loop is scaled too');
  for (const cue of ['pickup', 'toolSwap', 'sticky', 'spikes', 'zap', 'tracker', 'slowmo']) assert.match(au, new RegExp(`\\b${cue}: \\(\\)`), cue);
});

test('v7 flags: the session reads them, the defaults are on, and each one turns its part back to v6', async () => {
  const run = v7 => runCatchSession6({balance, level: 4, seed: 2, t: k => k, finish: () => ({ok: true}), cancel() {}, v7});
  const on = run(undefined); assert.deepEqual(on.v7, V7, 'all on without flags');
  assert.equal(on.engine.throwsTotal, levels7(balance)[3].throws, 'the v7 throws'); on.dispose();
  const off = run({weapons: false, assist: false, elements: false}); assert.deepEqual(off.v7, {weapons: false, assist: false, elements: false});
  assert.equal(off.engine.throwsTotal, balance.levels[3].v6?.throws ?? balance.levels[3].throws, 'the v6 throws'); off.dispose();
  const s6 = await readFile(new URL('minigames/catch-session6.mjs', root), 'utf8');
  for (const flag of ['catchWeapons', 'catchAssist', 'catchElements', 'catchSiren']) assert.ok(s6.includes(`params.get('${flag}')`), flag);
  assert.match(s6, /createChaseEngine6\(\{[^)]*v7: \(v7\.weapons \|\| v7\.elements\) \? v7 : null\}\)/, 'no flag on = the v6 chase');
  assert.match(s6, /installArsenalHud/); assert.match(s6, /installFireHud/, 'the v6 fire HUD stays for ?catchWeapons=0');
  assert.match(s6, /assistRelease\(engine, stage\)/);
  const ext = await readFile(new URL('extensions/catch-criminal.mjs', root), 'utf8'); assert.match(ext, /catchV6'\)!=='0'/, '?catchV6=0 still plays v5');
});

test('v7 HUD: tool button, fire button, zone ring and aim dot in a fake DOM; Hebrew strings without exclamation marks or Arabic', async () => {
  for (const [k, v] of Object.entries({...HUD_STRINGS, ...TOOL_STRINGS})) { assert.ok(/[א-ת]/.test(v), k); assert.equal(/[!؀-ۿ]/.test(v), false, k); }
  // the island's translator shows '…' (and reports an error) for a key it does not have: every v7 key is in strings.he.json
  const island = JSON.parse(await readFile(new URL('data/strings.he.json', root), 'utf8'));
  const keys = [...Object.keys(HUD_STRINGS), ...Object.keys(TOOL_STRINGS), 'catch.bow.lead', 'catch.bow.close', 'catch.help7.2', 'catch.help7.4', 'catch.pop.nitro', 'catch.pop.nearBonus', 'catch.pop.crimOil', 'catch.pop.block', ...ARSENAL.order.flatMap(id => [`catch.weapon.${id}`, `catch.weapon.${id}.hint`])];
  for (const k of keys) { assert.ok(Object.hasOwn(island, k), 'strings.he.json has ' + k); assert.equal(/[!؀-ۿ]/.test(island[k]), false, k); }
  for (const k of ['minigame.catchCriminal.help.1', 'minigame.catchCriminal.help.2', 'minigame.catchCriminal.help.3']) assert.equal(/רשת צרה|שמאלה לכוח|גורמים לרכב הנמלט להיפגע/.test(island[k]), false, 'the island intro describes v7, not v3: ' + k);
  assert.equal(resolveText(k => k, 'catch.weapon.net'), 'רשת דבק');
  assert.deepEqual(pipStates7({ammo: 1, ammoMax: 3, trickle: 3.5}, {trickleSeconds: 7}), {pips: ['full', 'next', 'used'], trickle: .5});
  const ch = createChaseEngine6({balance, stage: 2, seed: 3, v7: V7}); for (let i = 0; i < 60 * 3; i++) ch.step(1 / 60);
  ch.state.crim.s = ch.state.s + 12; ch.state.crim.d = ch.state.d + .9; ch.state.crim.targetD = ch.state.crim.d; ch.step(1 / 60); ch.drainEvents();
  const aim = ch.gun.aimInfo(); assert.ok(aim.inRange);
  const z = zoneWorld(ch.track, ch, aim), d = dotWorld(ch.track, ch, aim); assert.ok(Number.isFinite(z.x) && Number.isFinite(d.x) && z.y === aim.zoneY);
  assert.deepEqual(toolLabel(ch.gun.state, k => resolveText(k => k, k)), {name: 'פנצ׳ר', left: `${ARSENAL.tools.tyres.ammo}/${ARSENAL.tools.tyres.ammo}`});
  // fake DOM, enough for the HUD
  const el = tag => { const n = {tag, children: [], dataset: {}, style: {setProperty() {}, removeProperty() {}}, attrs: {}, listeners: {}, hidden: false, className: '', classList: {add() {}, remove() {}}, offsetWidth: 1,
    append(...k) { for (const c of k) { c.parent = n; n.children.push(c); } }, prepend(...k) { n.append(...k); }, remove() { if (n.parent) n.parent.children = n.parent.children.filter(c => c !== n); }, replaceChildren(...k) { n.children = []; n.append(...k); },
    setAttribute(k, v) { n.attrs[k] = String(v); }, addEventListener(t, f) { (n.listeners[t] ||= []).push(f); }, dispatch(t, e = {}) { for (const f of n.listeners[t] || []) f({preventDefault() {}, ...e}); },
    querySelector() { return null; }, querySelectorAll() { return []; }}; Object.defineProperty(n, 'innerHTML', {set() {}}); return n; };
  const doc = {createElement: el, createElementNS: (ns, t) => el(t)}, hud = el('div'), stageEl = el('div'); hud.ownerDocument = doc;
  let fired = 0, cycled = 0;
  const api = installArsenalHud({hud, stageEl, t: k => k, chase: () => ch, project: () => ({x: 100, y: 120, visible: true}), onFire: () => { fired++; ch.fire(); }, onCycle: () => { cycled++; ch.cycle(); }});
  assert.deepEqual(Object.keys(api).sort(), ['button', 'dispose', 'handle', 'refresh', 'show', 'weaponButton']);
  api.refresh(); assert.equal(api.button.className, 'catch-fire'); assert.equal(api.weaponButton.className, 'catch-weapon');
  const ret = hud.children.find(c => c.className === 'catch-reticle'), dot = hud.children.find(c => c.className === 'catch-aimdot');
  assert.equal(ret.hidden, false); assert.equal(dot.hidden, false); assert.equal(ret.dataset.q, ch.gun.state.quality);
  api.button.dispatch('pointerdown'); assert.equal(fired, 1); assert.equal(ch.gun.state.ammo, ARSENAL.tools.tyres.ammo - 1);
  api.weaponButton.dispatch('pointerdown'); assert.equal(cycled, 1); assert.equal(ch.gun.current, 'net');
  api.dispose(); assert.equal(hud.children.filter(c => c.className === 'catch-fire').length, 0);
  const src = await readFile(new URL('minigames/catch-arsenal-hud.mjs', root), 'utf8');
  assert.equal(/document\.addEventListener\(\s*['"]keydown/.test(src) || /doc\.addEventListener\(\s*['"]keydown/.test(src), false, 'keys stay in the session');
  const fx = await readFile(new URL('minigames/catch-chase-fx7.mjs', root), 'utf8'); assert.equal(/^import\s/m.test(fx), false, 'the fx module takes Three.js as a parameter');
  for (const s of [src, fx]) assert.equal(/[؀-ۿ]/.test(s), false);
});

test('v7 3D effects with the real three.js (no renderer): orbs, flashers, the strip, the sticky net, the pulse, the helicopter, then leave and dispose', async () => {
  const T = await import('../workout/island/vendor/three.module.js');
  const {createChaseFx7, FX7} = await import('../workout/island/minigames/catch-chase-fx7.mjs');
  const ch = createChaseEngine6({balance, stage: 6, seed: 4, v7: V7}); for (let i = 0; i < 60 * 3; i++) ch.step(1 / 60); ch.drainEvents();
  const scene = new T.Scene(), playerCar = new T.Group(), crimCar = new T.Group(); scene.add(playerCar, crimCar);
  const emits = [], part = {emit: (...a) => emits.push(a)}, tex = () => new T.Texture();
  const fx = createChaseFx7({T, scene, track: ch.track, chase: ch, playerCar, crimCar, sparks: part, dust: part, gfx: {glowTexture: tex, canvasTexture: tex, netTexture: tex}, theme: {lamps: true}});
  const place = () => { const st = ch.state, a = ch.track.toWorld(st.s, st.d), b = ch.track.toWorld(st.crim.s, st.crim.d); playerCar.position.set(a.x, 0, a.z); crimCar.position.set(b.x, 0, b.z); crimCar.rotation.y = ch.track.yawAt(st.crim.s); };
  const run = (n, hook) => { for (let i = 0; i < n; i++) { hook?.(i); ch.step(1 / 60); place(); fx.handle(ch.drainEvents()); fx.update(1 / 60); } };
  // an orb line and a roadblock in the window
  const orb = ch.obstacles.find(o => o.kind === 'nitro' && o.s > ch.state.s + 20), block = ch.obstacles.find(o => o.police);
  ch.state.s = orb.s - 60; ch.state.crim.s = ch.state.s + 12; run(2); assert.ok(fx.stats().orbs > 0, 'nitro orbs drawn (instanced)');
  ch.state.s = block.s - 60; ch.state.crim.s = ch.state.s + 12; run(2); assert.ok(fx.stats().flashes >= 2, 'roadblock flashers');
  // the tools: tracker (helicopter), sticky net, pulse, a spike strip
  ch.state.crim.d = ch.state.d; ch.state.crim.targetD = ch.state.d; ch.state.crim.s = ch.state.s + 11; run(1);
  const fire = id => { ch.gun.select(id); run(1); ch.gun.raw.locked = true; ch.gun.state.perTool[id].reload = 0; ch.gun.raw.hitChance = 1; return ch.fire(); };
  assert.equal(fire('mark'), true); assert.equal(fire('net'), true); assert.equal(fire('emp'), true); assert.equal(fire('spikes'), true);
  fx.handle(ch.drainEvents()); run(30);
  const s = fx.stats(); assert.equal(s.heli, true, 'the helicopter comes in while he is marked'); assert.equal(s.net, true, 'the net drapes over the car'); assert.ok(s.strips >= 1, 'a strip flies to the road');
  const heli = scene.children.find(o => o.isGroup && o !== playerCar && o !== crimCar && o.children.length >= 3);
  assert.ok(heli && heli.position.y > 8, 'the helicopter flies above the street: ' + heli?.position.y.toFixed(1));
  run(60 * 3); assert.ok(emits.length >= 2, 'spark bursts on the tracker and the pulse: ' + emits.length);
  fx.leave(); assert.equal(scene.children.filter(o => o.visible && o !== playerCar && o !== crimCar).length, 0, 'leave hides everything for the throw');
  fx.dispose(); assert.ok(FX7.heliY > 10);
});

test('v7 offline: the new modules are in the shell list', async () => {
  const manifest = JSON.parse(await readFile(new URL('offline-manifest.json', root), 'utf8'));
  for (const f of ['minigames/catch-weapons.mjs', 'minigames/catch-assist.mjs', 'minigames/catch-arsenal-hud.mjs', 'minigames/catch-chase-fx7.mjs']) assert.ok(manifest.shell.includes(f), f);
});
