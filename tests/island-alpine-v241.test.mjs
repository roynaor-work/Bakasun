import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createAlpineEngine} from '../workout/island/minigames/alpine-engine.mjs';
import {generateCourse, pipeProfile} from '../workout/island/minigames/alpine-track.mjs';
import {alpineResult} from '../workout/island/minigames/alpine-result.mjs';
import {alpineLeagueResult} from '../workout/island/minigames/alpine-league-result.mjs';
import * as L from '../workout/island/minigames/alpine-league-core.mjs';
import {leagueBalance, leagueTrack, stageGoals, courseFacts, AI_STRENGTH_V241, CURVE_V241} from '../workout/island/minigames/alpine-league-stages.mjs';
import {v241Enabled, withoutV241, balanceForPage, v241Rules, moverX, SECTION_NAMES, SECTION_HINTS, SECTION_KINDS, THEME_CONTENT, PICKUP_NAMES} from '../workout/island/minigames/alpine-v241.mjs';
import {createKidBot} from '../workout/island/tools/alpine-league-bot.mjs';
import {createAlpineControls} from '../workout/island/minigames/alpine-controls.mjs';
import {carvePose, travelYaw, followBody, bodyTarget} from '../workout/island/minigames/alpine-steer.mjs';
import {runAlpineSession} from '../workout/island/minigames/alpine-session.mjs';
import {buildShell} from '../workout/island/tools/offline-shell.mjs';

/** Ski v24.1 (Roy: the control and what is on the course, so it does not repeat itself). Node part; the real-touch browser proof is
 * workout/island/tools/alpine-v241-browser.mjs (screenshots and measurements in workout/island/verification/alpine-v24-1/). */
const root = new URL('../workout/island/', import.meta.url);
const data = await loadData(root, async url => ({ok: true, json: async () => JSON.parse(await readFile(url, 'utf8'))}));
const base = data.config.minigames.alpineRush, V24 = withoutV241(base), P = base.physics, PIPE = pipeProfile(P), DT = 1 / 60;
const courseOf = (b, n) => { const lb = leagueBalance(b, n), level = lb.levels[L.engineStageOf(n) - 1]; return generateCourse({...lb.tracks[level.trackId], id: level.trackId}, lb.physics); };
const pilot = (e, PP) => { const d = e.debug()[0], objs = e.course.objects.filter(o => o.s > d.s + 1 && o.s < d.s + 40); let best = d.x, bc = Infinity;
  for (let cx = -8; cx <= 8; cx += .4) { let c = Math.abs(cx - d.x) * .12; for (const o of objs) { const near = 1 / (1 + (o.s - d.s) / 18);
    if (o.type === 'rock' && Math.abs(cx - o.x) < o.radius * PP.rockHitScale + PP.board.halfWidth + .25) c += 100 * near;
    if (o.type === 'gate' && Math.abs(Math.abs(cx - o.x) - PP.gateHalfWidth) < 1.2) c += 100 * near;
    if (o.type === 'ramp') { const off = Math.abs(cx - o.x); if (off >= 1.6 && off < 2.5) c += 60 * near; }
    if (o.type === 'boost' && Math.abs(cx - o.x) < 1.3) c -= 4 * near; } if (c < bc) { bc = c; best = cx; } }
  e.command({type: 'steer', value: Math.max(-1, Math.min(1, (best - d.x) * .7))}); if (e.snapshot().boostReady) e.command({type: 'boost'}); };
function botRace(b, n, seed, gear = {skis: 2, helmet: 1, goggles: 1}) {
  const balance = leagueBalance(b, n), e = createAlpineEngine({balance, stage: L.engineStageOf(n), seed, equipment: L.equipmentFor(gear), power: 1}), bot = createKidBot({seed: seed * 31 + n, physics: balance.physics});
  e.command({type: 'start'}); const events = []; let sum = 0;
  for (let f = 0; f < 60 * 260 && e.phase !== 'finished'; f++) { if (e.phase === 'racing') { const d = bot.decide(e.snapshot()); e.command({type: 'steer', value: d.steer}); if (d.boost) e.command({type: 'boost'}); if (d.trick) e.command({type: 'trick', id: d.trick}); } e.step(DT); events.push(...e.drainEvents()); if (f % 60 === 0) { const d = e.debug()[0]; sum += d.x * 1000 + d.s; } }
  return {e, r: e.snapshot().result, stats: e.leagueStats(), events, sum: Math.round(sum)};
}
/** A straight or constant-turn bench with the real physics of `b`; rivals parked far behind. */
function bench(b, {objects = [], kappa = 0, turnFrom = 0, warm = 8, fast = false, length = 3000} = {}) {
  const bb = structuredClone(b); bb.physics.grid = [{s: 0, x: 0}, ...Array.from({length: 5}, (_, i) => ({s: -400 - i * 5, x: i * 2 - 4}))]; if (fast) bb.physics.baseSpeed = bb.physics.boostSpeed;
  const path = kappa ? {count: 4000, kappa: new Float64Array(4000).fill(kappa, turnFrom)} : null;
  const e = createAlpineEngine({balance: bb, stage: 1, seed: 9, course: {id: 'bench', length, objects: objects.map((o, i) => ({id: o.id || `o-${i}`, ...o})).sort((a, c) => a.s - c.s), rows: [], path, coins: objects.filter(o => o.type === 'coin').length, ...(b.physics.v241 ? {sections: objects.sections || []} : {})}});
  e.command({type: 'start'}); while (e.phase === 'countdown') e.step(DT); e.drainEvents();
  for (let i = 0; i < warm * 60; i++) { e.command({type: 'steer', value: 0}); e.step(DT); }
  return e;
}
const run = (e, seconds, steer = 0, extra = null) => { const events = []; for (let i = 0; i < Math.round(seconds * 60); i++) { e.command({type: 'steer', value: steer}); if (extra) e.command(extra); e.step(DT); events.push(...e.drainEvents()); } return events; };

test('?alpineV241=0 is v24 to the millisecond: courses, races, rivals and the bot, base stages and league', () => {
  // Fingerprints taken from origin/main (v24, island-v2-20261107-24): objects, sums of s and x, coins; races: rank, time, coins, falls,
  // tricks, gates, finishing order and a checksum of the player's path every second.
  const COURSES = {'ice-peak': [172, 14505249, -5107, 125], 'frost-forest': [213, 18977979, 8201, 130], 'storm-ridge': [210, 21315562, -7474, 95],
    'league-1': [127, 9152324, 9513, 90], 'league-7': [145, 10584630, 3933, 90], 'league-13': [194, 15700334, -17572, 115], 'league-18': [181, 14750599, -20634, 95], 'league-24': [180, 15587862, -4586, 95], 'league-30': [281, 38926021, -32101, 125]};
  const fp = c => [c.objects.length, Math.round(c.objects.reduce((a, o) => a + o.s, 0) * 100), Math.round(c.objects.reduce((a, o) => a + o.x, 0) * 100), c.coins];
  for (const [id, t] of Object.entries(V24.tracks)) { const c = generateCourse({...t, id}, V24.physics); assert.deepEqual(fp(c), COURSES[id], id); assert.deepEqual(Object.keys(c), ['id', 'length', 'objects', 'rows', 'path', 'coins']); }
  for (const n of [1, 7, 13, 18, 24, 30]) { const c = courseOf(V24, n); assert.deepEqual(fp(c), COURSES[`league-${n}`], `league ${n}`); assert.equal(c.sections, undefined); }
  const BASE = [[1, 11, 1, 64159, 5, 0, 0, 70606], [2, 11, 6, 78953, 15, 2, 0, -241554], [3, 42, 1, 77996, 0, 2, 0, 19848], [1, 5, 1, 64309, 5, 0, 0, 58785], [2, 9, 6, 77754, 10, 2, 0, 227896], [3, 3, 2, 79044, 0, 4, 0, 18200]];
  for (const [stage, seed, ...want] of BASE) {
    const e = createAlpineEngine({balance: V24, stage, seed}); e.command({type: 'start'}); let sum = 0;
    for (let f = 0; f < 30000 && e.phase !== 'finished'; f++) { if (e.phase === 'racing') { pilot(e, V24.physics); e.command({type: 'brake', value: 1}); } e.step(DT); if (f % 60 === 0) { const d = e.debug()[0]; sum += d.x * 1000 + d.s; } }
    const r = e.snapshot().result; assert.deepEqual([r.rank, r.elapsedMs, r.coins, r.crashes, r.trickScore, Math.round(sum)], want, `stage ${stage} seed ${seed} (a brake command changes nothing on v24)`);
    assert.equal(e.snapshot().v241, undefined); assert.equal(e.snapshot().player.braking, undefined, 'the v24 frame keeps its keys');
  }
  const LEAGUE = [[1, 7, 1, 58753, 19, 1, 150, 9, 'player,rival-1,rival-5,rival-4,rival-2,rival-3', -6534], [7, 3, 1, 60663, 33, 4, 300, 17, 'player,rival-1,rival-2,rival-3,rival-5,rival-4', -15013],
    [13, 5, 3, 68772, 32, 1, 300, 9, 'rival-1,rival-2,player,rival-4,rival-5,rival-3', 114311], [18, 9, 2, 66568, 18, 7, 450, 16, 'rival-1,player,rival-2,rival-4,rival-5,rival-3', 139760],
    [24, 2, 4, 72088, 27, 5, 300, 11, 'rival-1,rival-2,rival-3,player,rival-4,rival-5', -56208], [30, 4, 2, 98394, 39, 12, 450, 32, 'rival-1,player,rival-2,rival-4,rival-3,rival-5', 132961]];
  for (const [n, seed, ...want] of LEAGUE) { const {r, stats, sum} = botRace(V24, n, seed); assert.deepEqual([r.rank, r.elapsedMs, r.coins, r.crashes, r.trickScore, stats.gates, stats.order.join(','), sum], want, `league ${n}`); }
});

test('the flag: on by default, ?alpineV241=0 strips the balance (idempotent, cached), the island and the session read the same balance', async () => {
  assert.equal(v241Enabled(''), true); assert.equal(v241Enabled('?alpineV241=1'), true); assert.equal(v241Enabled('?dev=1&alpineV241=0'), false);
  assert.ok(base.physics.v241, 'config carries the v24.1 rules'); for (const t of Object.values(base.tracks)) assert.ok(t.content, 'every ski stage has content');
  assert.equal(V24.physics.v241, undefined); for (const t of Object.values(V24.tracks)) assert.equal(t.content, undefined);
  assert.equal(withoutV241(base), V24, 'cached'); assert.equal(withoutV241(V24), V24, 'idempotent'); assert.equal(balanceForPage(base, '?alpineV241=0'), V24); assert.equal(balanceForPage(base, ''), base);
  assert.equal(base.physics.v241.curveAssist, .9); assert.equal(v241Rules(V24.physics), null); assert.equal(v241Rules(P).brake.cut, .45);
  const ext = await readFile(new URL('extensions/alpine-rush.mjs', root), 'utf8'), island = await readFile(new URL('minigames/alpine-league-island.mjs', root), 'utf8'), session = await readFile(new URL('minigames/alpine-session.mjs', root), 'utf8');
  assert.match(ext, /balanceForPage\(data\.config\.minigames\.alpineRush\)/, 'the result check of the ski stages'); assert.match(island, /balanceForPage\(config\.minigames\.alpineRush\)/, 'the league (setup, goals, result check)');
  assert.match(session, /balanceForPage\(ctx\.balance\)/, 'the session');
  // The session headless: v24.1 by default, v24 with the flag.
  const memory = () => { const m = new Map(); return {getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k)}; };
  const start = () => runAlpineSession({balance: base, level: 2, seed: 4, equipment: {}, power: 1, storage: memory(), finish: () => ({ok: true}), cancel() {}});
  const on = start(); assert.equal(on.snapshot.v241, true); on.dispose();
  const saved = globalThis.location; globalThis.location = {search: '?alpineV241=0'};
  try { const off = start(); assert.equal(off.snapshot.v241, false); off.dispose(); } finally { globalThis.location = saved; }
});

test('control: a centred stick holds the line through a turn (v24: up the wall and over the lip at boost speed)', () => {
  const drift = (b, fast) => {
    const e = bench(b, {kappa: 1 / 90, turnFrom: 260, warm: 0, fast}); while (e.debug()[0].s < 260) { e.command({type: 'steer', value: 0}); e.step(DT); }
    const x0 = e.debug()[0].x; let lip = false, wall = false, x15 = null;
    for (let n = 1; n <= 240; n++) { e.command({type: 'steer', value: 0}); e.step(DT); const d = e.debug()[0]; wall ||= Math.abs(d.x) > PIPE.F; if (e.drainEvents().some(ev => ev.type === 'takeoff' && ev.objectId === 'lip')) lip = true; if (n === 90) x15 = Math.abs(d.x - x0); }
    return {x15, lip, wall};
  };
  const old = drift(V24, false), oldFast = drift(V24, true), now = drift(base, false), nowFast = drift(base, true);
  assert.ok(old.x15 > 1.5 && oldFast.x15 > 4, `v24 drifts: ${old.x15} / ${oldFast.x15} m in 1.5 s`); assert.ok(oldFast.lip, 'v24: over the lip at boost speed');
  assert.ok(now.x15 < .3 && nowFast.x15 < .6, `v24.1 holds: ${now.x15} / ${nowFast.x15} m`); assert.equal(nowFast.lip, false); assert.equal(nowFast.wall, false);
  // The assist is the computer riders' own feed-forward, never more: steering into the wall still climbs it and launches from the lip.
  const e = bench(base, {warm: 4}); let launched = false; for (let i = 0; i < 300 && !launched; i++) { e.command({type: 'steer', value: 1}); e.step(DT); launched = e.drainEvents().some(ev => ev.type === 'takeoff' && ev.objectId === 'lip'); }
  assert.ok(launched, 'a deliberate run at the wall still flies from the lip');
});

test('control: a child-like lane change overshoots less and settles sooner; the skis point where the rider goes', () => {
  const lane = b => { const e = bench(b); while (e.debug()[0].x < 3) { e.command({type: 'steer', value: 1}); e.step(DT); } let peak = 0, settled = null;
    for (let k = 1; k <= 240; k++) { e.command({type: 'steer', value: 0}); e.step(DT); const d = e.debug()[0]; peak = Math.max(peak, d.x); if (settled === null && Math.abs(d.vx) < .3) settled = k; } return {over: peak - 3, settleMs: settled * 1000 / 60}; };
  const old = lane(V24), now = lane(base);
  assert.ok(old.over > .6 && now.over < old.over * .8, `overshoot ${old.over.toFixed(2)} -> ${now.over.toFixed(2)} m`); assert.ok(now.settleMs < old.settleMs, `settle ${old.settleMs} -> ${now.settleMs} ms`);
  // response is not slowed: the first visible lean and the first 0.15 m sideways come as fast as in v24
  const first = b => { const e = bench(b), x0 = e.debug()[0].x; let lean = null, move = null; for (let n = 1; n <= 60; n++) { e.command({type: 'steer', value: 1}); e.step(DT); if (lean === null && e.snapshot().player.lean >= .2) lean = n; if (move === null && Math.abs(e.debug()[0].x - x0) >= .15) move = n; } return [lean, move]; };
  assert.deepEqual(first(base), first(V24));
  // Body yaw against the real heading in a slalom: v24 carvePose vs v24.1 travelYaw.
  const gap = useTravel => { const e = bench(base); let body = 0, sum = 0, n = 0; for (let k = 1; k <= 420; k++) { e.command({type: 'steer', value: Math.sin(k / 60 * Math.PI * 2 / 2.4)}); e.step(DT); const f = e.snapshot().player, d = e.debug()[0]; body = followBody(body, bodyTarget(f), DT);
    const yaw = useTravel ? travelYaw(body, f, d.speed, P.lateralSpeed) : carvePose(body, d.speed * 3.6 / 90).yaw; if (k > 60) { sum += Math.abs(yaw - Math.atan2(d.vx, d.speed)) * 180 / Math.PI; n++; } } return sum / n; };
  assert.ok(gap(true) < gap(false) * .5, `yaw gap ${gap(false).toFixed(1)} -> ${gap(true).toFixed(1)} deg`);
});

test('control: the stick pulled down brakes (a snowplough) and turns sharper; never in the air; the computer never brakes; ignored on v24', () => {
  const e = bench(base), v0 = e.debug()[0].speed; run(e, 1, 0, {type: 'brake', value: 1});
  const v1 = e.debug()[0].speed; assert.ok(v1 < v0 * .65, `1 s of brake: ${v0.toFixed(1)} -> ${v1.toFixed(1)} m/s`); assert.ok(v1 >= v2min() - 1e-9, 'never below the plough floor');
  assert.equal(e.snapshot().player.braking, 1); assert.equal(e.debug().slice(1).every(r => r.speed > v1), true, 'rivals do not brake');
  run(e, .5, 1, {type: 'brake', value: 1}); const braking = Math.atan2(e.debug()[0].vx, e.debug()[0].speed);
  const f = bench(base); run(f, .5, 1); const cruising = Math.atan2(f.debug()[0].vx, f.debug()[0].speed); assert.ok(braking > cruising + .15, `the same stick turns sharper while braking: ${braking.toFixed(2)} > ${cruising.toFixed(2)} rad`);
  run(e, 3, 0, {type: 'brake', value: 0}); assert.ok(e.debug()[0].speed > v0 * .97, 'back to speed after letting go');
  // In the air the brake does nothing.
  const air = bench(base, {objects: [{type: 'ramp', x: 0, s: 200}], warm: 0}); while (!air.debug()[0].airborne) { air.command({type: 'steer', value: 0}); air.step(DT); }
  air.command({type: 'brake', value: 1}); air.step(DT); assert.equal(air.snapshot().player.braking, 0);
  const old = bench(V24); run(old, 1, 0, {type: 'brake', value: 1}); assert.ok(Math.abs(old.debug()[0].speed - v0) < 1e-9, 'v24 ignores the brake');
  function v2min() { return v241Rules(P).brake.min; }
});

test('controls: the floating stick reads a downward pull as the brake past its dead zone; a sideways thumb never brakes; no brake without v24.1', () => {
  const listeners = new Map(), on = (target, type, fn) => { const key = target.__id + type; (listeners.get(key) || listeners.set(key, []).get(key)).push(fn); };
  const mk = id => ({__id: id, style: {}, dataset: {}, addEventListener: (t, fn) => on({__id: id}, t, fn), setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false, setAttribute() {}, querySelector: () => null, getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300})});
  const win = {addEventListener() {}}, doc = {defaultView: win, addEventListener() {}, hidden: false};
  const canvas = {...mk('c'), ownerDocument: doc}, joystick = {...mk('j'), getBoundingClientRect: () => ({left: 20, top: 200, width: 116, height: 116, right: 136, bottom: 316}), querySelector: () => ({style: {}})};
  const fire = (id, type, e) => (listeners.get(id + type) || []).forEach(fn => fn({preventDefault() {}, stopPropagation() {}, pointerType: 'touch', button: 0, ...e}));
  const controls = createAlpineControls({canvas, boostButton: null, joystick, trickButtons: [], config: {brake: {deadzone: .35}}}), reach = (116 / 2 - 8) * .62;
  fire('c', 'pointerdown', {pointerId: 1, clientX: 100, clientY: 220});
  fire('c', 'pointermove', {pointerId: 1, clientX: 100 + reach * .6, clientY: 220 + reach * .2}); let s = controls.sample({}); assert.ok(s.steer > .5 && s.brake === 0, 'sideways with a little drop: steering only');
  fire('c', 'pointermove', {pointerId: 1, clientX: 100, clientY: 220 + reach}); s = controls.sample({}); assert.ok(s.brake > .99 && Math.abs(s.steer) < .02, `pulled down a full reach: brake ${s.brake}`);
  fire('c', 'pointermove', {pointerId: 1, clientX: 100 - reach * .5, clientY: 220 + reach * .7}); s = controls.sample({}); assert.ok(s.brake > .4 && s.steer < -.4, 'down and to the left: brake and turn together');
  fire('c', 'pointerup', {pointerId: 1}); s = controls.sample({}); assert.equal(s.brake, 0); controls.dispose();
  const old = createAlpineControls({canvas, boostButton: null, joystick, trickButtons: [], config: {}});
  fire('c', 'pointerdown', {pointerId: 2, clientX: 100, clientY: 220}); fire('c', 'pointermove', {pointerId: 2, clientX: 100, clientY: 220 + reach}); assert.deepEqual(Object.keys(old.sample({})), ['steer', 'boost', 'trick'], 'v24 sample shape'); old.dispose();
});

test('content: every course has its sections, pickups and hazards; the themes differ; nothing breaks the calm opening or the finish', () => {
  const kinds = new Set(), perTheme = {};
  const check = (c, t, label) => {
    assert.ok(c.sections?.length >= 2, `${label}: sections`); assert.equal(new Set(c.objects.map(o => o.id)).size, c.objects.length, `${label}: ids`);
    for (let i = 1; i < c.objects.length; i++) assert.ok(c.objects[i].s >= c.objects[i - 1].s, `${label}: sorted`);
    let last = -Infinity; for (const z of c.sections) { assert.ok(SECTION_KINDS.includes(z.kind)); assert.ok(z.s0 >= t.calmStart + 100 && z.s1 < c.length - t.finishRunout && z.s0 > last + 50, `${label}: ${z.kind} ${z.s0}-${z.s1}`); last = z.s1; kinds.add(z.kind); }
    assert.ok(c.objects[0].s >= 100, `${label}: calm opening`); assert.ok(c.objects.at(-1).s < c.length - 40, `${label}: clear finish`);
    const types = new Set(c.objects.map(o => o.type)); assert.ok(types.has('star') && (types.has('magnet') || types.has('shield')), `${label}: stars and a power-up`); assert.ok(types.size >= 8, `${label}: ${[...types]}`);
    return types;
  };
  for (const [id, t] of Object.entries(base.tracks)) check(generateCourse({...t, id}, P), t, id);
  for (let n = 1; n <= 30; n++) { const lb = leagueBalance(base, n), level = lb.levels[L.engineStageOf(n) - 1], t = lb.tracks[level.trackId], c = generateCourse({...t, id: level.trackId}, lb.physics); const theme = L.stageInfo(n).theme;
    for (const ty of check(c, t, `league ${n}`)) (perTheme[theme] ||= new Set()).add(ty);
    if (L.stageInfo(n).boss) assert.equal(c.sections.length, 4, 'a boss course has four sections');
    for (const o of c.objects.filter(o => o.type === 'mover')) assert.equal(o.kind, THEME_CONTENT[theme].mover, `${theme} movers`); }
  assert.deepEqual([...kinds].sort(), [...SECTION_KINDS].sort(), 'all six section kinds appear');
  assert.ok(new Set(Object.values(perTheme).map(s => [...s].sort().join())).size >= 4, 'themes have their own mixes');
  assert.ok(perTheme.village.has('snowman') && perTheme.pine.has('snowman') && !perTheme.lava.has('snowman'), 'snowmen in the forest and the village');
  for (const id of ['pine', 'ice', 'lava', 'aurora', 'village', 'peak']) assert.ok(perTheme[id].has('mover'), `${id} has movers`);
  // the steep drop falls faster for the view: the grade is larger inside a speed section
  for (let n = 1; n <= 30; n++) { const c = courseOf(base, n), z = c.sections.find(x => x.pace === 'steep'); if (!z) continue; const p = c.path, mid = Math.round((z.s0 + z.s1) / 2); assert.ok(p.py[mid - 1] - p.py[mid] > .2, `stage ${n}: steeper in the speed section`); break; }
  assert.equal(Object.keys(SECTION_NAMES).length, 6); for (const text of [...Object.values(SECTION_NAMES), ...Object.values(SECTION_HINTS), ...Object.values(PICKUP_NAMES)]) { assert.match(text, /[֐-׿]/); assert.doesNotMatch(text, /!/); }
});

test('content is fair: every recorded corridor is open, snowmen and rocks stay out of it, a mover never reaches its free side, moves fit a boosted rider', () => {
  const all = [...Object.entries(base.tracks).map(([id, t]) => ({c: generateCourse({...t, id}, P), phys: P, label: id})), ...Array.from({length: 30}, (_, k) => ({c: courseOf(base, k + 1), phys: leagueBalance(base, k + 1).physics, label: `league ${k + 1}`}))];
  for (const {c, phys, label} of all) {
    for (const row of c.rows) {
      assert.ok(row.to - row.from >= .8, `${label}: corridor at ${row.s} is ${(row.to - row.from).toFixed(2)}`);
      for (const o of c.objects.filter(o => (o.type === 'rock' || o.type === 'snowman') && Math.abs(o.s - row.s) < 2)) for (const x of [row.from, row.to, (row.from + row.to) / 2])
        if (x > row.from + .01 && x < row.to - .01) assert.ok(Math.abs(x - o.x) >= o.radius * phys.rockHitScale, `${label} ${o.id}`);
      if (row.mover) { const m = c.objects.find(o => o.type === 'mover' && Math.abs(o.s - row.s) < .01); for (let t = 0; t < 12; t += .05) { const mx = moverX(m, t); assert.ok(mx + m.radius + phys.board.halfWidth <= row.from + 1e-6 || mx - m.radius - phys.board.halfWidth >= row.to - 1e-6 || (row.from + row.to) / 2 > mx + m.radius + phys.board.halfWidth || (row.from + row.to) / 2 < mx - m.radius - phys.board.halfWidth, `${label}: mover ${m.id} reaches the free side`); } }
    }
    for (const m of c.objects.filter(o => o.type === 'mover')) { assert.ok(Math.abs(m.x) + m.amp <= PIPE.F, `${label}: a mover stays on the floor`); assert.ok(m.period >= 2.5 && m.amp <= 3.3); }
    const rows = [...c.rows].sort((a, b) => a.s - b.s);
    for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], r = rows[i], gap = Math.max(0, r.from - a.to, a.from - r.to); assert.ok(gap <= phys.lateralSpeed * (r.s - a.s) / phys.boostSpeed + 1e-9, `${label} rows ${a.s}->${r.s}`); }
    // a jump line: a rider who holds the line from one kicker lands on the next one (shift <= 1.6 m, half width 2.3 m)
    const big = c.objects.filter(o => o.type === 'ramp' && o.big); for (let i = 1; i < big.length; i++) if (big[i].s - big[i - 1].s < 60) assert.ok(Math.abs(big[i].x - big[i - 1].x) <= 1.6 + 1e-9, `${label}: jump line`);
  }
});

test('pickups and hazards: stars once, a magnet pulls coins and stars for 8 s, a shield turns the next fall into a bump, rings count only in flight', () => {
  // star: points and a little tank, once per rider
  const s = bench(base, {objects: [{id: 'st', type: 'star', x: 0, s: 230, h: .9}], warm: 0}); const ev = run(s, 14);
  assert.equal(ev.filter(e => e.type === 'pickup' && e.objectType === 'star' && e.riderId === 'player').length, 1); assert.equal(s.snapshot().score, v241Rules(P).star.points);
  assert.equal(s.snapshot().obstacles.some(o => o.id === 'st'), false, 'a taken star leaves the player\'s view');
  // magnet: coins 3 m to the side come in while it lasts; after 8 s they do not
  const coins = (from, n, x) => Array.from({length: n}, (_, i) => ({id: `c${from}-${i}`, type: 'coin', x, s: from + i * 3, h: .85}));
  const m = bench(base, {objects: [{id: 'mg', type: 'magnet', x: 0, s: 200}, ...coins(230, 5, 3), ...coins(470, 5, 3)], warm: 0}); const evm = run(m, 30);
  const got = evm.filter(e => e.type === 'coin' && e.riderId === 'player').map(e => e.objectId);
  assert.ok(evm.some(e => e.type === 'pickup' && e.objectType === 'magnet'), 'magnet taken'); assert.equal(got.filter(id => id.startsWith('c230')).length, 5, 'coins 3 m away fly in');
  assert.equal(got.filter(id => id.startsWith('c470')).length, 0, 'not after the magnet ran out');
  const plain = bench(base, {objects: coins(230, 5, 3), warm: 0}); assert.equal(run(plain, 14).filter(e => e.type === 'coin' && e.riderId === 'player').length, 0, 'without it they stay');
  // shield: the rock is a bump, no fall; the next rock (the rider steers back onto the line) is a fall again
  const sh = bench(base, {objects: [{id: 'sd', type: 'shield', x: 0, s: 200}, {id: 'r1', type: 'rock', x: 0, s: 300, radius: .8}, {id: 'r2', type: 'rock', x: 0, s: 420, radius: .8}], warm: 0}), evs = [];
  for (let i = 0; i < 60 * 30; i++) { const d = sh.debug()[0]; sh.command({type: 'steer', value: Math.max(-1, Math.min(1, -d.x * .8))}); sh.step(DT); evs.push(...sh.drainEvents()); }
  assert.ok(evs.some(e => e.type === 'shield' && e.objectId === 'r1'), 'the shield saves the first rock'); assert.equal(evs.filter(e => e.type === 'crash' && e.riderId === 'player').map(e => e.objectId).join(), 'r2');
  // ring: a jump through it counts; riding under it on the snow does not
  const R = v241Rules(P).bigRamp, v = 20, vy = v * R.height / R.length + R.launch, t = 12 / v, h = R.height + vy * t - P.gravity * t * t / 2 + .9;
  const ring = obj => { const e = bench(base, {objects: obj, warm: 8}); return run(e, 6).filter(x => x.type === 'pickup' && x.objectType === 'ring').length; };
  const s0 = 165 + 3.75; assert.equal(ring([{type: 'ramp', big: 1, x: 0, s: 165}, {id: 'rg', type: 'ring', x: 0, s: s0 + 12, h}]), 1, 'through the ring off the big kicker');
  assert.equal(ring([{id: 'rg', type: 'ring', x: 0, s: 180, h}]), 0, 'not from the snow');
});

test('hazards and surfaces: snowmen and movers are short falls, a mover is where the clock says, ice slides, deep snow slows, a steep drop is faster but never above boost speed', () => {
  const snow = bench(base, {objects: [{id: 'sm', type: 'snowman', x: 0, s: 230, radius: .72}], warm: 0}); const ev = run(snow, 16); const crash = ev.find(e => e.type === 'crash' && e.riderId === 'player');
  assert.equal(crash?.objectType, 'snowman'); let down = 0; const sn = bench(base, {objects: [{id: 'sm', type: 'snowman', x: 0, s: 230, radius: .72}], warm: 0}); for (let i = 0; i < 60 * 16; i++) { sn.step(DT); if (sn.snapshot().player.crashed) down++; }
  assert.ok(down / 60 < P.crashSeconds * .7, `a snowman is a short fall (${(down / 60).toFixed(2)} s)`);
  // a mover sweeping the left half: passing on the right never hits; a mover that barely moves, ridden straight at, does
  const mover = {id: 'mv', type: 'mover', kind: 'penguin', x: -3.5, s: 300, amp: 2.5, period: 3, phase: 0, radius: .55};
  const pass = (m, x) => { const e = bench(base, {objects: [m], warm: 0}); let hit = false, clock = true; for (let i = 0; i < 60 * 20; i++) { const d = e.debug()[0]; e.command({type: 'steer', value: Math.max(-1, Math.min(1, (x - d.x) * .8))}); e.step(DT); hit ||= e.drainEvents().some(ev => ev.type === 'collision' && ev.objectType === 'mover');
    const snap = e.snapshot(), o = snap.obstacles.find(q => q.id === 'mv'); if (o) clock &&= Math.abs(o.x - moverX(m, snap.timeMs / 1000)) < .01; } return {hit, clock}; };
  const free = pass(mover, 2.5); assert.equal(free.hit, false, 'the free side is free'); assert.equal(free.clock, true, 'the snapshot shows the mover where the race clock puts it');
  assert.equal(pass({...mover, amp: .2}, -3.5).hit, true, 'its path is not');
  assert.ok(Math.abs(moverX(mover, .75) - (-3.5 + 2.5)) < 1e-9 && Math.abs(moverX(mover, 2.25) - (-6)) < 1e-9, 'a sine sweep on the race clock');
  // ice: the board keeps sliding; deep snow: slower unless boosting
  const slide = obj => { const e = bench(base, {objects: obj, warm: 4}); while (e.debug()[0].s < 140) { e.command({type: 'steer', value: e.debug()[0].s > 132 ? 1 : 0}); e.step(DT); } for (let i = 0; i < 8; i++) { e.command({type: 'steer', value: 0}); e.step(DT); } return e.debug()[0].vx; };
  const onIce = slide([{id: 'ic', type: 'ice', x: 0, s: 160, w: 24, len: 60}]), onSnow = slide([]);
  assert.ok(onIce > onSnow + 1.5, `on ice the sideways speed lasts (${onIce.toFixed(2)} vs ${onSnow.toFixed(2)} m/s)`);
  const deep = bench(base, {objects: [{id: 'pw', type: 'powder', x: 0, s: 400, w: 30, len: 300}], warm: 0}); while (deep.debug()[0].s < 380) { deep.command({type: 'steer', value: 0}); deep.step(DT); }
  assert.ok(deep.debug()[0].speed < P.baseSpeed * .85, `deep snow slows (${deep.debug()[0].speed.toFixed(1)} m/s)`);
  // a steep section: faster cruising, capped at boost speed; the player is told when it begins
  const steepObjects = Object.assign([], {sections: [{kind: 'speed', s0: 200, s1: 700, pace: 'steep'}]});
  const st = bench(base, {objects: steepObjects, warm: 0}); const evs = run(st, 25); assert.ok(evs.some(e => e.type === 'section' && e.kind === 'speed'));
  assert.ok(st.debug()[0].speed > P.baseSpeed * 1.08 && st.debug()[0].speed <= P.boostSpeed + 1e-9, `steep: ${st.debug()[0].speed.toFixed(1)} m/s`);
});

test('a full v24.1 race passes the island result check: ski stage and league stage, coins and gates within the course, flag-off runs check against v24', () => {
  for (const stage of [1, 2, 3]) {
    const e = createAlpineEngine({balance: base, stage, seed: 21}); e.command({type: 'start'});
    for (let f = 0; f < 30000 && e.phase !== 'finished'; f++) { if (e.phase === 'racing') pilot(e, P); e.step(DT); }
    const r = e.snapshot().result, raw = {outcome: r.won ? 'win' : 'lose', score: r.score, alpine: {...r}};
    assert.ok(alpineResult(raw, {level: stage, seed: 21}, base), `stage ${stage} validates on v24.1`); assert.ok(r.peakKmh <= Math.ceil(P.boostSpeed * 3.6 * 1.2));
  }
  for (const n of [1, 12, 25]) {
    const {r, stats} = botRace(base, n, 8), setup = {n, ...L.stageInfo(n)}, ctx = {level: L.engineStageOf(n), seed: 8, alpineLeague: setup};
    const v = alpineLeagueResult({outcome: r.won ? 'win' : 'lose', score: r.score, alpine: {...r}, league: {order: stats.order, gates: stats.gates}}, ctx, base);
    assert.ok(v, `league ${n} validates`); assert.ok(stats.gates <= courseFacts(base, n).gates && r.coins <= courseFacts(base, n).coins);
    assert.deepEqual(stageGoals(base, n).map(g => g.kind), stageGoals(V24, n).map(g => g.kind));
  }
  const {r, stats} = botRace(V24, 3, 8), ctx = {level: L.engineStageOf(3), seed: 8, alpineLeague: {n: 3, ...L.stageInfo(3)}};
  assert.ok(alpineLeagueResult({outcome: r.won ? 'win' : 'lose', score: r.score, alpine: {...r}, league: {order: stats.order, gates: stats.gates}}, ctx, V24), 'a flag-off run checks against the v24 balance');
});

test('rivals: the same rules, within the caps plus the gear a child owns by then; they take power-ups and avoid movers; a calibrated table', () => {
  assert.equal(AI_STRENGTH_V241.length, 30); assert.ok(AI_STRENGTH_V241.every(s => s >= 0 && s <= 1));
  for (let n = 1; n <= 30; n++) for (const ai of leagueBalance(base, n).levels[L.engineStageOf(n) - 1].ai) {
    assert.ok(ai.speed <= base.aiCaps.maxSpeed + CURVE_V241.gearPerTheme * (L.stageInfo(n).themeIndex - 1) + 1e-9 && ai.speed <= 1.05 + 1e-9 && ai.reaction >= base.aiCaps.minReaction && ai.lookahead <= base.aiCaps.maxLookahead, `caps at ${n}`); }
  for (let n = 1; n <= 30; n++) assert.ok(leagueBalance(V24, n).levels[L.engineStageOf(n) - 1].ai.every(ai => ai.speed <= 1), 'v24 rivals unchanged');
  let picks = 0, moverHits = 0, races = 0;
  for (const n of [3, 8, 14, 21, 27]) { const {events} = botRace(base, n, 5); races++; picks += events.filter(e => e.riderId !== 'player' && e.type === 'pickup' && (e.objectType === 'magnet' || e.objectType === 'shield')).length; moverHits += events.filter(e => e.riderId !== 'player' && e.type === 'collision' && e.objectType === 'mover').length; }
  assert.ok(picks >= races, `rivals take power-ups (${picks} in ${races} races)`); assert.ok(moverHits / races <= 1.5, `rivals mostly avoid movers (${moverHits} hits in ${races} races)`);
});

test('the league keeps its difficulty on v24.1: the child-like bot passes most early stages and few late ones, and falls less than on v24', () => {
  const pass = (b, n, runs) => { let p = 0, falls = 0; for (let k = 0; k < runs; k++) { const {r} = botRace(b, n, 600 + k * 13, {skis: Math.min(5, Math.floor((n - 1) / 5)), helmet: Math.max(0, Math.floor((n - 1) / 5) - 1), goggles: Math.max(0, Math.floor((n - 1) / 5) - 1)}); p += r.completed && r.rank <= L.stageInfo(n).targetRank ? 1 : 0; falls += r.crashes; } return {p: p / runs, falls: falls / runs}; };
  const early = [1, 2, 3].map(n => pass(base, n, 8)), late = [28, 29, 30].map(n => pass(base, n, 8));
  const earlyPass = early.reduce((a, x) => a + x.p, 0) / 3, latePass = late.reduce((a, x) => a + x.p, 0) / 3;
  assert.ok(earlyPass >= .65, `early stages ${(earlyPass * 100).toFixed(0)}%`); assert.ok(latePass <= .7, `late stages ${(latePass * 100).toFixed(0)}%`); assert.ok(earlyPass > latePass);
  const oldFalls = [13, 22].map(n => pass(V24, n, 6).falls), newFalls = [13, 22].map(n => pass(base, n, 6).falls);
  assert.ok(newFalls[0] + newFalls[1] < (oldFalls[0] + oldFalls[1]) * .75, `falls per race ${oldFalls} -> ${newFalls}`);
});

test('offline and wiring: the new module and style are in the shell; the view draws every v24.1 object; HUD texts are Hebrew without exclamation marks', async () => {
  const shell = await buildShell(); for (const f of ['minigames/alpine-v241.mjs', 'minigames/alpine-v241.css']) assert.ok(shell.includes(f), f);
  const view = await readFile(new URL('minigames/alpine-view.mjs', root), 'utf8'), session = await readFile(new URL('minigames/alpine-session.mjs', root), 'utf8');
  for (const key of ['rampBig', 'ring', 'magnet', 'shield', 'snowman', "'mover-penguin'", "'mover-snowball'", "'mover-boulder'", 'ice', 'powder']) assert.ok(view.includes(key), `view maker ${key}`);
  assert.match(view, /if \(V241\)/); assert.match(session, /type: 'brake'/);
  const hebrew = [...session.matchAll(/'([֐-׿][^'\n]{0,80})'/g)].map(m => m[1]); assert.ok(hebrew.length > 5); for (const text of hebrew) assert.doesNotMatch(text, /!/, text);
});
