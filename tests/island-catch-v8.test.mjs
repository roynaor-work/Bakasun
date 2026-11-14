import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {seededRandom} from '../workout/island/minigames/catch-track.mjs';
import {createChaseEngine6, driveChase6, DRIVING6, CHASE8} from '../workout/island/minigames/catch-chase6.mjs';
import {createArsenal, ARSENAL, ARSENAL8, STRINGS as TOOL_STRINGS} from '../workout/island/minigames/catch-weapons.mjs';
import {createCatchAudio, CUE_NAMES} from '../workout/island/minigames/catch-audio.mjs';
import {AUDIO8, gearFor, rpmIn, startGear, burstRounds} from '../workout/island/minigames/catch-audio8.mjs';
import {BURST8, burstPlan} from '../workout/island/minigames/catch-burst8.mjs';
import {installArsenalHud, acceptHalfWidth, ringSize} from '../workout/island/minigames/catch-arsenal-hud.mjs';
import {runCatchSession6, flags8, SIREN7} from '../workout/island/minigames/catch-session6.mjs';
import {measureKid, KID_BLIND} from '../workout/island/tools/catch-sim7.mjs';

/** v8 of "תפוס את הפושע" (14/11, Roy after v23): a quiet opening, a V6 engine instead of the buzz and its turbo whine, a soft two-tone siren
 * 7 dB under v7, the tools fixed (the police car follows instead of passing him, an honest spike ring, a tap that cannot fire says why, a
 * ring sized and named for the target), and every tyre shot a rapid burst. Each part has a flag that brings v7 back. */
const root = new URL('../workout/island/', import.meta.url);
const balance = JSON.parse(await readFile(new URL('data/config.json', root), 'utf8')).minigames.catchCriminal;
const V7 = {weapons: true, assist: true, elements: true}, F8 = {weaponsFix: true};
const ctx = (over = {}) => ({gap: 12, lateral: 0, dOfficer: 0, dThief: 0, thiefTargetD: 0, vOfficer: 22, vThief: 21, sThief: 100, sOfficer: 88, stun: 0, scraping: false, thiefSwerve: 0, curvature: 0, crimSteer: 2.6, ...over});

// ----- a fake Web Audio context that records what is built: oscillators (type, frequency and its targets, periodic wave), buffer sources -----
function fakeAudio() {
  const made = {osc: [], src: [], gain: [], filter: [], waves: [], conv: 0};
  class Param { constructor(v = 0) { this.value = v; this.targets = []; } setValueAtTime(v) { this.value = v; this.targets.push(v); } linearRampToValueAtTime(v) { this.targets.push(v); } exponentialRampToValueAtTime(v) { this.targets.push(v); } setTargetAtTime(v) { this.targets.push(v); } cancelScheduledValues() {} }
  class Node { constructor(kind) { this.kind = kind; this.gain = new Param(1); this.frequency = new Param(440); this.detune = new Param(); this.Q = new Param(1); this.threshold = new Param(); this.knee = new Param(); this.ratio = new Param(); this.attack = new Param(); this.release = new Param(); this.playbackRate = new Param(1); this.inputs = []; this.started = 0; this.stopped = false; }
    connect(n) { if (n instanceof Node) n.inputs.push(this); if (n instanceof Param) (n.mods ||= []).push(this); return n; } disconnect() {} start() { this.started++; } stop() { this.stopped = true; } setPeriodicWave(w) { this.wave = w; } }
  class Ctx { constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.destination = new Node('dest'); made.ctx = this; }
    createGain() { const n = new Node('gain'); made.gain.push(n); return n; } createOscillator() { const n = new Node('osc'); n.type = 'sine'; made.osc.push(n); return n; }
    createBiquadFilter() { const n = new Node('filter'); n.type = 'lowpass'; made.filter.push(n); return n; } createDynamicsCompressor() { return new Node('comp'); }
    createBuffer(ch, len) { return {length: len, duration: len / 8000, getChannelData: () => new Float32Array(len)}; } createBufferSource() { const n = new Node('src'); made.src.push(n); return n; }
    createPeriodicWave(re, im) { const w = {re: Array.from(re), im: Array.from(im)}; made.waves.push(w); return w; } createConvolver() { made.conv++; return new Node('conv'); }
    resume() {} suspend() {} close() {} decodeAudioData() { return Promise.reject(new Error('no file in the test')); } }
  return {Ctx, made};
}
async function withAudio(fn) {
  const {Ctx, made} = fakeAudio(), realFetch = globalThis.fetch;
  globalThis.AudioContext = Ctx; globalThis.fetch = undefined;
  try { return await fn(made); } finally { delete globalThis.AudioContext; globalThis.fetch = realFetch; }
}
const V8A = {intro: true, engine: true, siren: true, burst: true};

test('v8 flags: every part on by default, each URL flag brings its v7 part back (and ?catchSiren=v6 the v6 siren)', async () => {
  const p = q => flags8(new URLSearchParams(q));
  assert.deepEqual(p(''), {intro: true, engine: true, siren: true, weaponsFix: true, burst: true});
  assert.equal(p('catchIntro=v7').intro, false); assert.equal(p('catchEngine=v7').engine, false); assert.equal(p('catchSiren=v7').siren, false);
  assert.equal(p('catchSiren=v6').siren, false); assert.equal(p('catchWeaponsFix=0').weaponsFix, false); assert.equal(p('catchBurst=0').burst, false);
  assert.deepEqual(flags8(new URLSearchParams(''), {v8: {burst: false}}).burst, false, 'a test context can switch a part off');
  const s = runCatchSession6({balance, level: 3, seed: 2, t: k => k, finish: () => ({ok: true}), cancel() {}});
  assert.deepEqual(s.v8, {intro: true, engine: true, siren: true, weaponsFix: true, burst: true}); assert.equal(s.snapshot.v8.weaponsFix, true); s.dispose();
  const src = await readFile(new URL('minigames/catch-session6.mjs', root), 'utf8');
  for (const flag of ['catchIntro', 'catchEngine', 'catchWeaponsFix', 'catchBurst']) assert.ok(src.includes(`params.get('${flag}')`), flag);
  assert.match(src, /createCatchAudio\(\{sirenScale, pack: assets7 \? 'v7' : null, v8: audio8/, 'the audio gets the v8 parts');
  assert.match(src, /createChaseEngine6\(\{[^)]*v8: chase8, v7:/, 'the chase gets the tool fix'); assert.match(src, /createCatchView6\(\{[^)]*burst8: v8\.burst/, 'the view draws the burst');
  assert.match(src, /installArsenalHud\(\{.*fix8: Boolean\(chase8\)\}\)/, 'the HUD shows the v8 ring');
  assert.equal(SIREN7, .55, 'v7 untouched');
});

test('v8 audio, v7 untouched: without v8 the status has no v8 part and the cue list is complete', async () => {
  const a = createCatchAudio(); assert.equal(a.status().v8, undefined); for (const n of ['burst', 'launch', 'charge', 'dry']) assert.ok(CUE_NAMES.includes(n) && a.cueNames().includes(n), n); a.dispose();
  await withAudio(async made => {
    const v7 = createCatchAudio({sirenScale: SIREN7}); v7.cue('engine'); v7.engine(22, true);
    assert.ok(made.osc.some(o => o.frequency.value === 900), 'v7 builds its turbo whine oscillator (900 Hz)'); assert.ok(made.osc.some(o => o.type === 'sawtooth' && o.frequency.targets.includes(80)), 'and its saw "vroom"'); v7.dispose();
  });
});

test('v8 siren: a soft two-tone (a fourth apart, second harmonics under 1.5 kHz), one voice, 7 dB under the v7 siren as measured', async () => {
  const S = AUDIO8.siren; assert.ok(S.lo < 900 && S.hi < 900 && S.hi * 2 < 1500, 'fundamentals under the guard floor, second harmonics under 1.5 kHz');
  assert.ok(Math.abs(S.hi / S.lo - 4 / 3) < .01, 'a fourth'); assert.ok(S.wave[1] <= .1 && S.wave[2] <= .03, 'a soft tone: few harmonics'); assert.ok(S.cut <= 1200);
  await withAudio(async made => {
    const a = createCatchAudio({sirenScale: SIREN7, pack: 'v7', v8: V8A});
    a.cue('siren', {approach: 0}); a.cue('siren', {approach: .5}); a.cue('siren', {approach: 0, near: true});
    const sq = made.osc.filter(o => o.type === 'square'); assert.equal(sq.length, 1, 'one LFO: one siren voice for all the cues');
    assert.ok(Math.abs(sq[0].frequency.value - 1 / (2 * S.note)) < 1e-9, 'it swings between the notes every ' + S.note + ' s');
    assert.equal(made.src.filter(s => s.loop).length, 0, 'no looped file plays (the v7 pack siren is not used)');
    assert.equal(a.status().v8.live.siren, 'near'); a.dispose();
  });
  const m = JSON.parse(await readFile(new URL('verification/catch-v8/audio8.json', root), 'utf8')).summary;
  assert.ok(m.sirenDb <= -6 && m.sirenDb >= -9, 'siren ' + m.sirenDb + ' dB (target: 6 to 8 dB under v7)');
  assert.ok(m.sirenNearDb <= -6 && m.sirenCrewDb <= -6, 'the roadblock and crew variants too');
  assert.ok(m.sirenOverEngine.v8 > 2 && m.sirenOverEnginePhone.v8 > 3, 'the engine stays under the siren (on a phone speaker too)');
});

test('v8 engine: a V6 with gears (cruise high, kickdown on the boost, soft shifts), no whine, nothing above 1.5 kHz in its waves', async () => {
  const E = AUDIO8.engine;
  assert.ok(gearFor(22, .28, 6).gear >= 5, 'cruise at 79 km/h in a high gear'); const cruise = rpmIn(22, gearFor(22, .28, 5).gear);
  assert.ok(cruise > 1500 && cruise < 2800, 'cruise rpm ' + cruise);
  let g = 6; for (let i = 0; i < 4; i++) g = gearFor(22, 1, g).gear; assert.ok(g <= 4, 'full throttle kicks down: gear ' + g);
  assert.ok(rpmIn(31, g) > cruise + 1000, 'and the rpm climbs under the boost'); assert.equal(startGear(22, 1), 3, 'pulls away at "go" in third');
  for (let v = 0; v <= 32; v += 2) for (const thr of [0, .3, 1]) { const r = rpmIn(v, gearFor(v, thr, 3).gear); assert.ok(r >= E.idle && r <= E.red, `${v} m/s: ${r} rpm`); }
  assert.ok(E.red / 40 * E.a.length < 2400 && 3500 / 40 * E.a.length < 1500, 'its harmonics stay under 1.5 kHz in the chase (rpm/40 x 16)');
  await withAudio(async made => {
    const a = createCatchAudio({sirenScale: SIREN7, pack: 'v7', v8: V8A});
    a.cue('engine'); a.engineState('countdown', false); a.engine(22, false); made.ctx.currentTime += .1; a.engine(22, false);
    assert.equal(a.status().v8.live.rpm < 1000, true, 'idles through the countdown: ' + a.status().v8.live.rpm);
    a.engineState('run', false); for (let i = 1; i <= 120; i++) { made.ctx.currentTime += 1 / 60; a.engine(22 + Math.min(9, i * .15), i > 30); }
    const st = a.status().v8.live; assert.ok(st.engine && st.rpm > 2500, 'revs up on the boost: ' + st.rpm + ' rpm, gear ' + st.gear);
    assert.equal(made.osc.some(o => o.frequency.value === 900 || o.frequency.targets.some(f => f >= 900 && f <= 2400 && o.type === 'sine')), false, 'no turbo whine');
    const engOsc = made.osc.filter(o => o.wave && o.wave.im.length === E.a.length + 1); assert.ok(engOsc.length >= 1, 'the V6 wave');
    assert.ok(Math.max(...engOsc.flatMap(o => o.frequency.targets)) < 160, 'its base frequency (rpm/40) stays under 160 Hz');
    assert.equal(made.osc.some(o => o.type === 'sawtooth' && o.frequency.targets.includes(80)), false, 'no saw "vroom" at the start'); a.dispose();
  });
});

test('v8 burst: a tap is 6 to 8 rounds over about 0.6 to 0.9 s with a short echo, fading; ?catchBurst=0 keeps the single sound', async () => {
  const r = burstRounds({rnd: seededRandom(3)}); assert.ok(r.length >= 6 && r.length <= 8, 'rounds ' + r.length);
  const span = r.at(-1).t + .1; assert.ok(span >= .55 && span <= .9, 'burst ' + span.toFixed(2) + ' s'); assert.ok(AUDIO8.burst.rate >= 9 && AUDIO8.burst.rate <= 13, 'an automatic rifle rate');
  assert.ok(r.at(-1).level < r[0].level, 'the rounds fade'); assert.equal(BURST8.rounds, AUDIO8.burst.rounds); assert.equal(BURST8.rate, AUDIO8.burst.rate, 'the picture and the sound share the rhythm');
  await withAudio(async made => {
    const a = createCatchAudio({sirenScale: SIREN7, pack: 'v7', v8: V8A}); a.cue('shot');
    const crack = made.src.filter(s => !s.loop), body = made.osc.filter(o => o.type === 'sine' && o.frequency.targets.includes(52));
    assert.equal(body.length, AUDIO8.burst.rounds, 'one body thump per round'); assert.equal(crack.length, AUDIO8.burst.rounds * 2, 'a crack and a click per round');
    assert.equal(made.conv, 1, 'a short echo'); a.dispose();
  });
  await withAudio(async made => {
    const a = createCatchAudio({sirenScale: SIREN7, pack: 'v7', v8: {...V8A, burst: false}}); a.cue('shot');
    assert.ok(made.osc.length <= 3 && made.src.length <= 1, 'one shot sound (the v7 synth while the pack is not decoded)'); a.dispose();
  });
  const m = JSON.parse(await readFile(new URL('verification/catch-v8/audio8.json', root), 'utf8')), shot = m.rows.find(x => x.cue === 'shot');
  assert.ok(m.summary.burstOverSiren.v8 > 4, 'the burst sits over the siren: ' + m.summary.burstOverSiren.v8 + ' dB'); assert.ok(shot.v8.mean > shot.v7.mean * 3, 'a long burst, not one beep');
});

test('v8 intro: no saw sweep or square buzz at the start, soft dings, one whoop at "go", then the siren fades in', async () => {
  await withAudio(async made => {
    const a = createCatchAudio({sirenScale: SIREN7, pack: 'v7', v8: V8A});
    a.cue('engine'); a.cue('count'); a.cue('count');
    assert.equal(made.osc.filter(o => o.type === 'sawtooth' || o.type === 'square' || o.type === 'triangle' && o.frequency.targets.includes(520)).length, 0, 'no v7 saw, square buzz or triangle beep');
    const dings = made.osc.filter(o => o.frequency.value === AUDIO8.ding.hz); assert.equal(dings.length, 2, 'two soft dings');
    const before = made.osc.length; a.cue('go'); const whoop = made.osc.slice(before).find(o => o.frequency.targets.includes(AUDIO8.whoop.peak)); assert.ok(whoop, 'the whoop up to ' + AUDIO8.whoop.peak + ' Hz');
    a.cue('siren', {approach: 0}); const sirenGain = made.gain.at(-1); assert.equal(sirenGain.gain.targets[0], 0, 'the siren starts from silence');
    a.dispose();
  });
  const m = JSON.parse(await readFile(new URL('verification/catch-v8/audio8.json', root), 'utf8')).rows, o = m.find(x => x.cue === 'opening');
  assert.ok(o.v8.mean < o.v7.mean / 2, 'the opening is quieter than v7'); assert.ok(o.v8.linePromMax < 20 && o.v7.linePromMax > 40, 'and has no whistle line (v7: the beeps and the buzz)');
});

test('v8 tools: the spike ring is honest (green = the strip lands under him and he drives over it); v7 went green 3.6 m off his path', () => {
  const run = (fix8, dO) => { const a = createArsenal({stage: 1, rnd: () => .9, fix8}); a.select('spikes'); a.step(1 / 60, ctx({dOfficer: dO, dThief: 0, thiefTargetD: 0, lateral: -dO})); const shown = a.state.quality; a.fire(); const strip = a.strips[0];
    a.step(1 / 60, ctx({sThief: strip.s - 1, dThief: 0, dOfficer: dO})); return {shown, strip, hit: a.drainEvents().some(e => e.type === 'wshot' && e.hit)}; };
  const v7off = run(false, 3.6); assert.equal(v7off.shown, 'green', 'v7: green a lane away'); assert.equal(v7off.hit, false, 'v7: and the strip misses (the bug)');
  const v8off = run(true, 3.6); assert.notEqual(v8off.shown, 'green', 'v8: a lane away is not green'); assert.equal(v8off.hit, false);
  const v8on = run(true, 1.2); assert.equal(v8on.shown, 'green', 'v8: within the window'); assert.equal(v8on.strip.d, 0, 'the strip is put on his path'); assert.equal(v8on.hit, true, 'and catches him');
  for (let s = 1; s <= 10; s++) { const a = createArsenal({stage: s, rnd: () => .9, fix8: true}); a.select('spikes'); a.step(1 / 60, ctx()); assert.equal(a.state.quality, 'green', 'stage ' + s + ': a lined-up strip can go green'); assert.ok(a.aimInfo().window === ARSENAL8.spikeWindow[s - 1]); }
});

test('v8 tools: a tap that cannot fire says why (behind / far / near / side); v7 stayed silent', () => {
  const tryFire = (fix8, over) => { const a = createArsenal({stage: 1, rnd: () => .5, fix8}); a.select('emp'); a.step(1 / 60, ctx(over)); a.drainEvents(); a.fire(); return {ev: a.drainEvents().filter(e => e.type === 'dry'), reason: a.aimInfo().reason}; };
  for (const [over, why] of [[{gap: -6}, 'behind'], [{gap: 20}, 'far'], [{gap: 1.5}, 'near'], [{gap: 8, lateral: 6, dThief: 6}, 'side']]) {
    const v8 = tryFire(true, over); assert.equal(v8.ev.length, 1, why); assert.equal(v8.ev[0].reason, why); assert.equal(v8.reason, why, 'the HUD reads the reason too');
    assert.equal(tryFire(false, over).ev.length, 0, 'v7: nothing (' + why + ')');
  }
  const a = createArsenal({stage: 1, rnd: () => .5, fix8: true}); a.step(1 / 60, ctx()); a.fire(); a.drainEvents(); a.fire(); assert.equal(a.drainEvents().some(e => e.type === 'dry'), false, 'reloading is not a dry tap');
  for (const k of ['behind', 'far', 'near', 'side']) assert.ok(TOOL_STRINGS['catch.dry.' + k] && TOOL_STRINGS['catch.range.' + k], k);
});

test('v8 tools: the police car follows him instead of driving past after a hit slows him; v7 passed him and every tool went out of range', () => {
  const ride = fix8 => {
    const ch = createChaseEngine6({balance, stage: 2, seed: 4, v8: fix8 ? F8 : null, v7: V7}); for (let i = 0; i < 60 * 3; i++) ch.step(1 / 60);
    ch.state.crim.s = ch.state.s + 9; ch.state.crim.d = ch.state.d; ch.state.crim.targetD = ch.state.d; ch.gun.raw.slows.emp = 4; ch.gun.raw.slows.net = 4; // a pulse and a net: he slows down hard
    let minGap = 99, inRange = 0; for (let i = 0; i < 60 * 4; i++) { ch.setSteer(Math.max(-1, Math.min(1, (ch.state.crim.d - ch.state.d) * .5))); ch.step(1 / 60); ch.drainEvents(); minGap = Math.min(minGap, ch.state.gap); if (ch.gun.state.locked) inRange++; }
    return {minGap, inRange: inRange / 240};
  };
  const v7 = ride(false), v8 = ride(true);
  assert.ok(v7.minGap < 0, 'v7 drives past him: gap ' + v7.minGap.toFixed(1)); assert.ok(v8.minGap > 1.5, 'v8 stays behind him: gap ' + v8.minGap.toFixed(1));
  assert.ok(v8.inRange > .9 && v8.inRange > v7.inRange, `the tool stays in range: ${(v8.inRange * 100).toFixed(0)}% against ${(v7.inRange * 100).toFixed(0)}%`);
  assert.ok(CHASE8.followGap > ARSENAL.tools.emp.range[0] && CHASE8.followGap < ARSENAL.tools.emp.range[2], 'the follow gap is inside every tool range, the pulse too');
  // v7 exactly as before when the fix is off
  const a = driveChase6(createChaseEngine6({balance, stage: 4, seed: 9, v7: V7}), DRIVING6.good, seededRandom(7)), b = driveChase6(createChaseEngine6({balance, stage: 4, seed: 9, v8: {weaponsFix: false}, v7: V7}), DRIVING6.good, seededRandom(7));
  assert.deepEqual(a, b, 'no fix = v7');
  const plain = createChaseEngine6({balance, stage: 4, seed: 9}); assert.equal(plain.v8.weaponsFix, false, 'and without the v7 tools the fix does nothing');
});

test('v8 tools for a child who does not brake for a thief he cannot see: v7 left him behind most of the chase, v8 keeps him in front', () => {
  const r = measureKid(16, [1, 8], ['v7', 'v8'], balance, KID_BLIND), row = (v, s) => r[v].find(x => x.stage === s);
  for (const s of [1, 8]) {
    assert.ok(row('v7', s).behind / 16 > 10, `stage ${s} v7: ${(row('v7', s).behind / 16).toFixed(1)} s a game with the thief behind`);
    assert.ok(row('v8', s).behind / 16 < 1, `stage ${s} v8: ${(row('v8', s).behind / 16).toFixed(1)} s`);
    assert.ok(row('v8', s).stopRate > row('v7', s).stopRate + .4, `stage ${s}: the tools bring the car down (${row('v8', s).stopRate} against ${row('v7', s).stopRate})`);
    assert.ok(row('v8', s).winRate >= row('v7', s).winRate - .1, `and the stage is won about as often or more (${row('v8', s).winRate} against ${row('v7', s).winRate})`);
    assert.ok(row('v8', s).chaseSecAvg > 12, 'the chase still lasts: ' + row('v8', s).chaseSecAvg.toFixed(0) + ' s');
  }
  const g = row('v8', 1).spikeGreen + row('v8', 8).spikeGreen, h = row('v8', 1).spikeGreenHit + row('v8', 8).spikeGreenHit;
  assert.ok(g >= 10 && h / g >= .8, `a green spike ring catches him: ${h}/${g}`);
});

test('v8 HUD: the ring shows where the tool aims (grey with the reason out of range), named and sized to the area that counts; a chip when he is behind', () => {
  assert.equal(acceptHalfWidth({window: 1.7}), 1.7); assert.ok(Math.abs(acceptHalfWidth({allowed: 45, dist: 10}) - 10) < 1e-9); assert.equal(acceptHalfWidth({weapon: 'net', allowed: 0}, ARSENAL.tools), ARSENAL.tools.net.zone.w);
  assert.deepEqual(ringSize({x: 0, y: 0}, {x: 30, y: 0}, 'net'), {w: 60, h: 60}); assert.equal(ringSize({x: 0, y: 0}, {x: 30, y: 0}, 'spikes').h, 25, 'the spike ring lies on the road'); assert.equal(ringSize({x: 0, y: 0}, {x: 1, y: 0}).w, 34, 'never tiny');
  const el = tag => { const n = {tag, children: [], dataset: {}, style: {setProperty() {}, removeProperty() {}}, attrs: {}, listeners: {}, hidden: false, className: '', textContent: '', classList: {add() {}, remove() {}}, offsetWidth: 1,
    append(...k) { for (const c of k) { c.parent = n; n.children.push(c); } }, prepend(...k) { n.append(...k); }, remove() { if (n.parent) n.parent.children = n.parent.children.filter(c => c !== n); }, replaceChildren(...k) { n.children = []; n.append(...k); },
    setAttribute(k, v) { n.attrs[k] = String(v); }, addEventListener(t, f) { (n.listeners[t] ||= []).push(f); }, querySelector() { return null; }, querySelectorAll() { return []; }}; Object.defineProperty(n, 'innerHTML', {set() {}}); return n; };
  const doc = {createElement: el, createElementNS: (ns, t) => el(t)}, hud = el('div'), stageEl = el('div'); hud.ownerDocument = doc;
  const ch = createChaseEngine6({balance, stage: 2, seed: 3, v8: F8, v7: V7}); for (let i = 0; i < 60 * 3; i++) ch.step(1 / 60);
  const api = installArsenalHud({hud, stageEl, t: k => k, chase: () => ch, project: (x, y, z) => ({x: 400 + z * 10, y: 200 - x * .1, visible: true}), onFire: () => ch.fire(), onCycle: () => ch.cycle(), fix8: true});
  const ret = hud.children.find(c => c.className === 'catch-reticle'), chip = hud.children.find(c => c.className === 'catch-behind8'), text = n => n.children.map(c => c.textContent).join('|');
  ch.state.crim.s = ch.state.s + 40; ch.state.crim.d = ch.state.d; ch.step(1 / 60); ch.drainEvents(); api.refresh();
  assert.equal(ret.hidden, false, 'far away: the ring still shows'); assert.equal(ret.dataset.q, 'off'); assert.match(text(ret), /רחוק מדי/, 'with the reason'); assert.match(text(ret), /גלגל/, 'and the target');
  ch.state.crim.s = ch.state.s + 11; ch.step(1 / 60); ch.drainEvents(); api.refresh(); assert.notEqual(ret.dataset.q, 'off'); assert.match(text(ret), /%/, 'in range: the chance');
  ch.cycle(); ch.cycle(); ch.step(1 / 60); ch.drainEvents(); api.refresh(); assert.equal(ret.dataset.tool, 'spikes'); assert.match(text(ret), /הכביש לפניו/, 'the spike ring is named for the road');
  assert.ok(parseFloat(ret.style.height) < parseFloat(ret.style.width), 'and lies flat');
  ch.state.crim.s = ch.state.s - 6; ch.step(1 / 60); ch.drainEvents(); api.refresh(); assert.equal(chip.hidden, false, 'behind: the chip'); assert.equal(ret.hidden, true);
  api.dispose(); assert.equal(hud.children.length, 0);
});

test('v8 burst picture: the rounds walk onto the target on a hit and spray the road on a miss; tracers and flashes with the real three.js', async () => {
  const hit = burstPlan({hit: true, rnd: seededRandom(5)}), miss = burstPlan({hit: false, rnd: seededRandom(5)});
  assert.equal(hit.length, BURST8.rounds); assert.ok(!hit[0].on && hit.at(-1).on && hit.filter(r => r.on).length === BURST8.rounds - BURST8.walk, 'a hit walks in'); assert.equal(miss.filter(r => r.on).length, 0, 'a miss never strikes the car');
  assert.ok(hit.every((r, i) => Math.abs(r.t - i / BURST8.rate) < 1e-9));
  const T = await import('../workout/island/vendor/three.module.js'), {createBurstFx} = await import('../workout/island/minigames/catch-burst8.mjs');
  const scene = new T.Scene(), playerCar = new T.Group(), crimCar = new T.Group(); crimCar.position.set(14, 0, 0); scene.add(playerCar, crimCar);
  const wheel = new T.Object3D(); wheel.name = 'Wheel_RL'; wheel.position.set(-1.4, .35, -.9); crimCar.add(wheel);
  const emits = [], part = {emit: (...a) => emits.push(a)}, tex = () => new T.Texture(); let rounds = 0;
  const fx = createBurstFx({T, scene, playerCar, crimCar, sparks: part, dust: part, gfx: {glowTexture: tex, canvasTexture: tex}, onRound: () => rounds++});
  fx.fire({hit: true, target: fx.targets.wheel('RL')}); for (let i = 0; i < 6; i++) fx.update(1 / 60);
  assert.ok(fx.stats().inAir >= 1 && fx.stats().flash, 'a tracer in the air and the muzzle flash');
  for (let i = 0; i < 70; i++) fx.update(1 / 60); const s = fx.stats();
  assert.equal(s.rounds, BURST8.rounds); assert.equal(s.onTarget, BURST8.rounds - BURST8.walk); assert.equal(rounds, BURST8.rounds, 'a camera kick per round');
  assert.ok(emits.length >= BURST8.rounds, 'sparks or dust for every round'); assert.equal(s.inAir, 0);
  fx.fire({hit: false, target: fx.targets.trunk(), rounds: 4}); for (let i = 0; i < 60; i++) fx.update(1 / 60); assert.equal(fx.stats().onTarget, BURST8.rounds - BURST8.walk, 'the miss added no hits');
  fx.leave(); fx.dispose();
  const src = await readFile(new URL('minigames/catch-burst8.mjs', root), 'utf8'); assert.equal(/^import\s/m.test(src), false, 'three.js comes in as a parameter'); assert.match(src, /car parts/);
});

test('v8 burst changes no rule: one roll and the v7 damage per tap; the view, not the rules, gets the burst', async () => {
  const dmg = fix8 => { let d = 0; const a = createArsenal({stage: 3, rnd: () => 0, fix8, addDamage: x => (d += x)}); a.step(1 / 60, ctx()); a.fire(); return {d, ev: a.drainEvents().filter(e => e.type === 'shot').length}; };
  assert.deepEqual(dmg(true), dmg(false), 'the same damage and one shot event per tap');
  const s6 = await readFile(new URL('minigames/catch-session6.mjs', root), 'utf8'), w = await readFile(new URL('minigames/catch-weapons.mjs', root), 'utf8'), c6 = await readFile(new URL('minigames/catch-chase6.mjs', root), 'utf8');
  assert.equal(/catch-burst8|BURST8|burst8|AUDIO8/.test(w + c6), false, 'the rules do not know about the burst');
  assert.match(s6, /burst8: v8\.burst/);
  const v6 = await readFile(new URL('minigames/catch-view6.mjs', root), 'utf8'); assert.match(v6, /if \(burst\) events = events\.filter/, 'the burst replaces the single bolt only when on');
});

test('v8 strings and offline: every new key is in the island strings (no exclamation marks, no Arabic), the new modules are in the shell', async () => {
  const island = JSON.parse(await readFile(new URL('data/strings.he.json', root), 'utf8'));
  for (const k of Object.keys(TOOL_STRINGS)) { assert.ok(Object.hasOwn(island, k), k); assert.equal(/[!؀-ۿ]/.test(island[k]), false, k); assert.ok(/[א-ת]/.test(island[k]), k); }
  const manifest = JSON.parse(await readFile(new URL('offline-manifest.json', root), 'utf8'));
  for (const f of ['minigames/catch-audio8.mjs', 'minigames/catch-burst8.mjs']) assert.ok(manifest.shell.includes(f), f);
  for (const f of ['catch-audio8.mjs', 'catch-burst8.mjs']) { const s = await readFile(new URL('minigames/' + f, root), 'utf8'); assert.equal(/[؀-ۿ]/.test(s), false, f); }
});

test('v8 forensics in the real island: v7 had a whistle line during the chase (the turbo whine), v8 has none', async () => {
  const f = JSON.parse(await readFile(new URL('verification/catch-v8/forensics.json', root), 'utf8'));
  const live = g => g.liveTones + g.liveHums + g.liveGlides;
  assert.ok(f.v7.liveTones + f.v7.liveGlides >= 1, 'v7: ' + JSON.stringify(f.v7.segments)); assert.ok(f.v7.segments.some(s => s.hz > 2000 && s.sources.some(x => /sine 900Hz/.test(x))), 'from the 900 Hz turbo whine oscillator');
  assert.equal(live(f.v8), 0, 'v8: no tone, hum or glide while the chase runs'); assert.ok(f.v8.runSeconds > 15, 'over ' + f.v8.runSeconds + ' s of chase');
  assert.equal(f.v8.sources.some(s => /police-soft/.test(s)), false, 'the pack wail does not play');
});
