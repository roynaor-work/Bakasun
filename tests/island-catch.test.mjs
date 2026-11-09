import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
import {loadData} from '../workout/island/engine/load-data.mjs';
import {createEngine} from '../workout/island/engine/engine.mjs';
import {gameContext} from '../workout/island/minigames/context.mjs';
import {migrateSave, validateSave} from '../workout/island/engine/persistence.mjs';
import {createCatchEngine, moveOffset, isExposed} from '../workout/island/minigames/catch-engine.mjs';
import {runCatchSession} from '../workout/island/minigames/catch-session.mjs';
import {playGame, SKILLS} from '../workout/island/tools/catch-sim.mjs';
import {ActivityInterface} from '../workout/island/ui/activity.mjs';

const root = new URL('../workout/island/', import.meta.url);
const data = await loadData(root, async url => ({ok: true, json: async () => JSON.parse(await readFile(url, 'utf8'))}));
const balance = data.config.minigames.catchCriminal;
const strings = JSON.parse(await readFile(new URL('data/strings.he.json', root), 'utf8'));

test('catch: ten stages, three tools, three throws, all inside the data', () => {
  assert.equal(balance.levels.length, 10);
  assert.equal(balance.throws, 3);
  assert.deepEqual(Object.keys(balance.tools).sort(), ['narrow', 'rope', 'wide']);
  balance.levels.forEach((l, i) => {
    assert.equal(l.stage, i + 1);
    assert.ok(strings[l.feature], 'feature text ' + l.feature);
    assert.ok(l.tools.length >= 2 && l.tools.every(t => balance.tools[t]));
    assert.ok(l.dist > 0 && l.flee > 0 && l.radiusScale > 0 && l.preview > 0 && l.preview <= 1);
  });
  for (const key of ['minigame.catchCriminal.title', 'minigame.catchCriminal.help.1', 'minigame.catchCriminal.help.2', 'minigame.catchCriminal.help.3']) assert.ok(strings[key], key);
  for (const tool of Object.values(balance.tools)) { assert.ok(strings[tool.title]); assert.ok(strings[tool.hint]); }
  for (const track of Object.values(balance.equipment)) { assert.ok(strings[track.title]); assert.ok(strings[track.description]); }
});

test('catch: nobody shoots, and no Arabic letters anywhere in the game text', async () => {
  const text = Object.entries(strings).filter(([k]) => /catch|catchCriminal/.test(k)).map(([, v]) => v).join(' ');
  assert.equal(/[؀-ۿ]/.test(text), false);
  for (const file of ['minigames/catch-engine.mjs', 'minigames/catch-session.mjs', 'minigames/catch-view.mjs', 'minigames/catch-actors.mjs']) {
    const source = await readFile(new URL(file, root), 'utf8');
    assert.equal(/[؀-ۿ]/.test(source), false, file);
    assert.equal(/\b(gun|bullet|shoot)\b/i.test(source), false, file + ' has nothing to do with firing');
  }
});

test('catch: the engine is a pure function of seed and inputs; a release resolves the same flight twice', () => {
  const run = () => { const e = createCatchEngine({balance, stage: 4, seed: 11}); e.step(.5); e.setAim({angle: 40, power: .6}); const f = e.release(); return JSON.stringify({kind: f.kind, d: f.duration, last: f.path.at(-1)}); };
  assert.equal(run(), run());
  const a = createCatchEngine({balance, stage: 1, seed: 1}), b = createCatchEngine({balance, stage: 1, seed: 1});
  for (let i = 0; i < 100; i++) { a.step(1 / 60); b.step(1 / 60); }
  assert.deepEqual(a.criminalAt(a.clock), b.criminalAt(b.clock));
});

test('catch: the preview is the wind-free arc and never longer than the stage allows', () => {
  for (const stage of [1, 5, 10]) {
    const e = createCatchEngine({balance, stage, seed: 3});
    e.setAim({angle: 45, power: .7});
    const pr = e.preview();
    assert.ok(pr.points.length > 3);
    assert.equal(pr.fraction, balance.levels[stage - 1].preview);
    assert.ok(pr.points.at(-1).t <= pr.land.t * pr.fraction + 1e-6);
  }
});

test('catch: a tool that hits is a catch and a perfect catch needs the head', () => {
  const e = createCatchEngine({balance, stage: 1, seed: 1});
  const c = e.criminalAt(0), tool = e.tools.find(t => t.id === 'narrow');
  let found = null;
  for (let angle = 20; angle <= 70 && !found; angle += .5) for (let p = .2; p <= 1 && !found; p += .005) {
    const f = e.trajectory(angle, p, 'narrow', {resolve: true, t0: 0});
    if (f.kind === 'catch' && Math.abs(f.contact.x - c.x) < .1) found = f;
  }
  assert.ok(found, 'a solution exists on stage 1');
  assert.equal(found.perfect, found.contact.y >= tool.perfectY && Math.abs(found.contact.x - c.x) <= tool.perfectX);
});

test('catch: moving and hiding thieves are functions of the clock only', () => {
  assert.equal(moveOffset({kind: 'stand'}, 3).offset, 0);
  const pace = {kind: 'pace', amp: 2, period: 4, phase: 0};
  assert.ok(Math.abs(moveOffset(pace, 1).offset - 2) < 1e-9);
  const dash = {kind: 'dash', amp: 2, speed: 4, pause: .5, phase: 0};
  assert.ok(moveOffset(dash, 0).offset <= -1.99 && moveOffset(dash, 1.2).offset >= 1.99);
  assert.equal(isExposed({up: 1, down: 1, phase: 0}, .5), true);
  assert.equal(isExposed({up: 1, down: 1, phase: 0}, 1.5), false);
  assert.equal(isExposed(null, 99), true);
});

test('catch: a full match always ends, and a catch pays through the island rules', () => {
  const e = createCatchEngine({balance, stage: 1, seed: 2});
  let guard = 0;
  while (e.state.phase !== 'done' && guard++ < 60 * 120) { if (e.state.phase === 'aim') { e.setAim({angle: 40, power: .5}); e.release(); } e.step(1 / 60); }
  assert.equal(e.state.phase, 'done');
  const sum = e.summary();
  assert.ok(['win', 'lose'].includes(sum.outcome));
  assert.ok(sum.score >= 0 && sum.score <= balance.maximumScore && sum.performance >= 0 && sum.performance <= 1);
  assert.ok(sum.throws >= 1 && sum.throws <= balance.throws);
  const full = playGame(1, 5, SKILLS.expert);
  assert.equal(typeof full.won, 'boolean');
});

test('catch: registered as a minigame with the flag, the daily-learning gate and the save intact', () => {
  const engine = createEngine(data, {storage: null}), game = engine.registry.minigames.get('catchCriminal');
  assert.ok(game); assert.equal(game.featureFlag, 'catchCriminal'); assert.equal(data.featureFlags.catchCriminal, true);
  assert.equal(data.config.gameShell.games.catchCriminal.orientation, 'landscape');
  let prompted = 0;
  assert.equal(ActivityInterface.prototype.requireDaily.call({engine: {learningStatus: () => ({locked: true})}, ui: {learningInterface: {daily() { prompted++; }}}}, 'catchCriminal'), true);
  assert.equal(prompted, 1);
  const off = {...data, featureFlags: {...data.featureFlags, catchCriminal: false}};
  assert.equal(createEngine(off, {storage: null}).startMinigame('catchCriminal').ok, false);
  assert.ok(engine.state.minigameProgress.catchCriminal);
  assert.equal(engine.state.minigameProgress.catchCriminal.stars.length, 10);
});

test('catch: enter, pause, win and cancel go through the island lifecycle', () => {
  const engine = createEngine(data, {storage: null}); engine.skipTutorial();
  const before = engine.exportJSON(), context = gameContext(engine, data.config.minigames, 7, 'catchCriminal', 1), finished = [];
  const run = engine.startMinigame('catchCriminal', {...context, t: k => k, onFinish: r => finished.push(r)});
  assert.equal(run.ok, true); assert.equal(engine.isMinigameActive(), true);
  assert.equal(engine.startMinigame('catchCriminal', context).ok, false);
  run.session.setPaused(true); assert.equal(run.session.snapshot.paused, true); run.session.setPaused(false);
  assert.equal(run.cancel().ok, true); assert.equal(run.session.snapshot.disposed, true);
  assert.equal(engine.isMinigameActive(), false); assert.deepEqual(finished, [{cancelled: true}]);
  assert.equal(engine.exportJSON(), before);
  // a win through the real session pays money, a star count and unlocks the next stage
  const e2 = createEngine(data, {storage: null}); e2.skipTutorial();
  const ctx2 = gameContext(e2, data.config.minigames, 7, 'catchCriminal', 1), results = [];
  const r2 = e2.startMinigame('catchCriminal', {...ctx2, t: k => k, onFinish: r => results.push(r)});
  const money = e2.state.money, s = r2.session.engine;
  // Drive the session's own engine with a solved throw, the way the player would.
  let guard = 0;
  while (s.state.phase !== 'done' && guard++ < 60 * 90) {
    if (s.state.phase === 'aim') {
      const c = s.criminalAt(s.clock); let best = null;
      for (let a = 20; a <= 70; a += .5) for (let p = .2; p <= 1; p += .004) { const f = s.trajectory(a, p, 'narrow', {resolve: true, t0: s.clock + balance.physics.throwSeconds}); if (f.kind === 'catch') { best = [a, p]; break; } if (best) break; }
      s.setAim({angle: best ? best[0] : 40, power: best ? best[1] : .5}); r2.session.debug?.release?.();
      if (s.state.phase === 'aim') s.release();
    }
    r2.session.debug ? r2.session.debug.step(1 / 60) : s.step(1 / 60);
  }
  assert.equal(s.state.phase, 'done');
});

test('catch: schema-18 saves from before the game load, gain stage one and stay valid', () => {
  const engine = createEngine(data, {storage: null}), old = JSON.parse(engine.exportJSON());
  delete old.minigameLevels.catchCriminal; delete old.minigameProgress.catchCriminal; delete old.minigameEquipment.catchCriminal;
  const migrated = migrateSave(old, data, engine.registry);
  assert.equal(migrated.ok, true);
  assert.equal(validateSave(migrated.state, data, engine.registry).ok, true);
  assert.equal(migrated.state.minigameProgress.catchCriminal.stage, 1);
  assert.equal(migrated.state.minigameLevels.catchCriminal, 1);
  assert.deepEqual(migrated.state.minigameEquipment.catchCriminal, {net: 0, scope: 0});
});

test('catch: city models are compressed copies under 3.6 MB in total, offline and listed once', async () => {
  const dir = new URL('assets/game-catch/models/', root), files = (await readdir(dir)).filter(f => f.endsWith('.glb'));
  assert.ok(files.length >= 8 && files.length <= 16, 'between eight and sixteen models: ' + files.length);
  let total = 0; for (const f of files) total += (await stat(new URL(f, dir))).size;
  assert.ok(total < 3.6 * 1024 * 1024, 'models total ' + total);
  const manifest = JSON.parse(await readFile(new URL('offline-manifest.json', root), 'utf8'));
  for (const f of files) assert.ok(manifest.games.catch.includes('assets/game-catch/models/' + f), f);
  assert.equal(new Set(manifest.games.catch).size, manifest.games.catch.length);
});

test('catch: the session without a canvas runs headless and the kill switches work', () => {
  const finished = [];
  const s = runCatchSession({balance, level: 1, seed: 1, t: k => k, finish: r => { finished.push(r); return {ok: true}; }, cancel() {}});
  assert.equal(s.snapshot.ready, true);
  s.setPaused(true); s.setPaused(false); s.dispose();
  assert.equal(s.snapshot.disposed, true);
});

test('catch: no stage is impossible; the model expert wins every stage of the full game', () => {
  for (let stage = 1; stage <= 10; stage++) {
    let wins = 0; const n = 12;
    for (let g = 1; g <= n; g++) if (playGame(stage, g, SKILLS.expert, balance, {v2: true, driving: DRIVING.expert}).won) wins++;
    assert.ok(wins >= 1, 'stage ' + stage + ' has winning lines (' + wins + '/' + n + ')');
  }
});

// ---------------- v2: the chase, gangs, bosses, moving cover ----------------
import {createChaseEngine} from '../workout/island/minigames/catch-chase.mjs';
import {driveChase, DRIVING} from '../workout/island/tools/catch-sim.mjs';
import {seededRandom as chaseRandom} from '../workout/island/minigames/catch-chase.mjs';

/** Brute-force a throw that catches the current thief and release it (what a perfect player would do). */
function throwAtThief(e) {
  const P = e.balance.physics, w = e.wobbleAt(e.clock);
  for (const tool of e.tools.map(t => t.id)) for (let a = 6; a <= 74; a += .5) for (let p = .2; p <= 1; p += .005) {
    const f = e.trajectory(Math.max(0, a), p, tool, {resolve: true, t0: e.clock + P.throwSeconds});
    if (f.kind === 'catch') { e.setTool(tool); e.setAim({angle: a - w.angle, power: p - w.power}); return e.release(); }
  }
  return null;
}
function runUntil(e, phases, limit = 60 * 60) { let n = 0; while (!phases.includes(e.state.phase) && e.state.phase !== 'done' && n++ < limit) e.step(1 / 60); return e.state.phase; }

test('catch v2: every stage has a chase, the data stays consistent and ten stages include a boss and a gang', () => {
  assert.equal(balance.version, 2);
  assert.ok(balance.levels.every(l => l.chase && l.chase.seconds >= 20 && l.chase.seconds <= 60 && l.chase.crimSpeed > 15 && l.chase.density > 0));
  assert.ok(balance.levels.some(l => l.boss && l.boss.hits >= 2), 'a boss stage');
  assert.ok(balance.levels.some(l => l.crew >= 2), 'a gang stage');
  assert.ok(balance.levels.some(l => l.movers?.length), 'moving cover');
  assert.ok(balance.levels.some(l => l.gust > 0), 'gusts');
  for (const k of ['catch.boost', 'catch.brake', 'catch.gap', 'catch.pop.near', 'catch.pop.bossHit', 'catch.pop.crew', 'catch.crew', 'catch.boss', 'catch.stars', 'catch.chase.close', 'catch.chase.far']) assert.ok(strings[k], k);
});

test('catch v2: the chase is deterministic, controls matter, crashes cost speed and closeness feeds the throw', () => {
  const run = (steer, boost, stage = 3) => { const c = createChaseEngine({balance, stage, seed: 5}); for (let i = 0; i < 60 * 8; i++) { c.setSteer(steer); c.setBoost(boost); c.step(1 / 60); c.drainEvents(); } return c; };
  const a = run(0, false), b = run(0, false), boosted = run(0, true), left = run(-1, false), right = run(1, false);
  assert.equal(JSON.stringify([a.state.x, a.state.gap]), JSON.stringify([b.state.x, b.state.gap]));
  assert.ok(boosted.state.x > a.state.x + 20, 'boost makes ground');
  assert.ok(left.state.lat < -.9 && right.state.lat > .9, 'steering reaches the outer lanes');
  const c = createChaseEngine({balance, stage: 6, seed: 2}); c.step(3); let crashes = 0, before = 0;
  for (let i = 0; i < 60 * 20 && crashes === 0; i++) { before = c.state.v; c.setBoost(true); c.step(1 / 60); for (const ev of c.drainEvents()) if (ev.type === 'crash') crashes++; }
  assert.ok(crashes === 0 || c.state.v < before, 'a crash slows the car');
  const close = driveChase(createChaseEngine({balance, stage: 1, seed: 1}), DRIVING.expert, chaseRandom(3)), far = driveChase(createChaseEngine({balance, stage: 10, seed: 1}), DRIVING.casual, chaseRandom(3));
  for (const r of [close, far]) { assert.ok(r.closeness >= 0 && r.closeness <= 1); assert.ok(r.mods.dist > 0); }
  assert.ok(close.closeness >= far.closeness, 'a good driver on an easy stage gets closer');
  const near = createChaseEngine({balance, stage: 3, seed: 1}); near.state.gap = 7; near.state.outcome = 'x';
  assert.ok(near.result().mods.dist < createChaseEngine({balance, stage: 3, seed: 1}).level.dist * balance.chase.farFactor);
});

test('catch v2: a gang needs every thief, a boss needs more than one hit, and the throws grow with them', () => {
  const gangStage = balance.levels.findIndex(l => l.crew >= 2) + 1, bossStage = balance.levels.findIndex(l => l.boss) + 1;
  const g = createCatchEngine({balance, stage: gangStage, seed: 4, v2: true});
  assert.equal(g.throwsTotal, balance.throws + (balance.levels[gangStage - 1].crew - 1) * balance.crewThrows);
  assert.ok(throwAtThief(g)); runUntil(g, ['rearm']);
  assert.equal(g.state.phase, 'rearm'); assert.equal(g.state.caught.length, 1); assert.equal(g.state.crimIndex, 1);
  assert.ok(g.drainEvents().some(ev => ev.type === 'crew'));
  runUntil(g, ['aim']); assert.equal(g.state.phase, 'aim'); assert.ok(g.criminalAt(g.clock).x > g.state.caught[0].x, 'the next thief is further down the street');
  const b = createCatchEngine({balance, stage: bossStage, seed: 4, v2: true}), hits = balance.levels[bossStage - 1].boss.hits;
  for (let i = 0; i < hits - 1; i++) { assert.ok(throwAtThief(b)); runUntil(b, ['flee', 'escape']); assert.notEqual(b.state.phase, 'caught'); assert.equal(b.state.bossHp, hits - 1 - i); runUntil(b, ['aim']); }
  assert.ok(throwAtThief(b)); runUntil(b, ['caught', 'done']); assert.equal(b.state.won, true);
  assert.equal(b.summary().boss, true);
  // the same stages play as v1 when v2 is off
  const v1 = createCatchEngine({balance, stage: gangStage, seed: 4, v2: false});
  assert.equal(v1.throwsTotal, balance.throws); assert.equal(v1.level.crew, 1);
});

test('catch v2: crossing cars move with the clock, gusts change the wind, and a near miss is reported', () => {
  const stage = balance.levels.findIndex(l => l.movers?.length) + 1, e = createCatchEngine({balance, stage, seed: 2, v2: true});
  const mv = e.level.obstacles.find(o => o.v);
  assert.ok(mv, 'a mover is part of the v2 obstacles');
  assert.notEqual(e.obstacleAt(mv, 0).x, e.obstacleAt(mv, 3).x);
  const gustStage = balance.levels.findIndex(l => l.gust > 0) + 1, gu = createCatchEngine({balance, stage: gustStage, seed: 2, v2: true});
  assert.notEqual(gu.windAt(0), gu.windAt(1.2));
  const off = createCatchEngine({balance, stage, seed: 2, v2: false});
  assert.equal(off.level.obstacles.some(o => o.v), false, 'v1 has no moving cover');
  const n = createCatchEngine({balance, stage: 1, seed: 3, v2: true}); const thief = n.criminalAt(n.clock);
  let near = null;
  for (let a = 6; a <= 70 && !near; a += 1) for (let p = .2; p <= 1 && !near; p += .01) { const f = n.trajectory(a, p, 'narrow', {resolve: true, t0: n.clock + balance.physics.throwSeconds}); if (f.kind !== 'catch' && f.kind !== 'blocked' && f.near > 1.2 && f.near < 2) near = [a, p]; }
  assert.ok(near, 'a throw that just misses exists'); assert.ok(Math.abs(thief.x - n.level.dist) < 1e-6);
});

test('catch v2: the session without a canvas plays only the throw, and ?catchV2=0 style off switch keeps v1 rules', () => {
  const on = runCatchSession({balance, level: 6, seed: 1, t: k => k, finish: () => ({ok: true}), cancel() {}});
  assert.equal(on.snapshot.v2, true); assert.equal(on.engine.v2, true); assert.equal(on.chase, null);
  on.dispose();
  const off = runCatchSession({balance, level: 6, seed: 1, v2: false, t: k => k, finish: () => ({ok: true}), cancel() {}});
  assert.equal(off.snapshot.v2, false); assert.equal(off.engine.v2, false); assert.equal(off.engine.throwsTotal, balance.throws);
  off.dispose();
});

// ---------------- v3: overtaking and ramming ----------------
test('catch v3: the officer can overtake, ramming fills the damage meter, a full meter stops the thief and ends the chase', () => {
  // boost down an empty road past the thief
  const c = createChaseEngine({balance, stage: 1, seed: 1}); c.obstacles.length = 0; c.state.crim.x = 16; c.step(3);
  let passed = false;
  for (let i = 0; i < 60 * 12 && c.state.phase !== 'end' && !passed; i++) { c.setSteer(c.state.crim.lat > c.state.lat ? .6 : -.6); c.setBoost(c.state.tank > .05); c.step(1 / 60); c.drainEvents(); passed = c.state.x > c.state.crim.x + 1; }
  assert.ok(passed || c.state.outcome === 'caught', 'with nothing in the way the officer reaches and passes him, or catches him on the way');
  // park the officer in contact with the thief: the meter fills and ends the chase as a catch
  const d = createChaseEngine({balance, stage: 1, seed: 1}); d.obstacles.length = 0; d.step(3);
  let events = [], steps = 0;
  while (d.state.phase !== 'end' && steps++ < 60 * 40) { d.state.x = d.state.crim.x - 1; d.state.lat = d.state.crim.lat + .8; d.state.v = d.state.crim.v + 2; d.step(1 / 60); events.push(...d.drainEvents()); }
  assert.equal(d.state.phase, 'end'); assert.equal(d.state.outcome, 'caught'); assert.ok(d.state.damage >= 1);
  assert.ok(events.some(e => e.type === 'ram' && e.side), 'a side hit is reported');
  const res = d.result(); assert.equal(res.caught, true); assert.equal(res.closeness, 1);
  // no contact: the damage stays at zero
  const e = createChaseEngine({balance, stage: 1, seed: 1}); e.obstacles.length = 0; for (let i = 0; i < 60 * 6; i++) { e.step(1 / 60); e.drainEvents(); }
  assert.equal(e.state.damage, 0);
});

test('catch v3: the siren is two alternating notes and the old sound is gone', async () => {
  const source = await readFile(new URL('minigames/catch-audio.mjs', root), 'utf8');
  assert.ok(/siren\(960 \* k, 800 \* k, 0\); siren\(740 \* k, 880 \* k, \.4\)/.test(source), 'two notes, each with a glide');
  assert.ok(/approach/.test(source), 'Doppler shift');
  assert.equal(/tone\(720, \.22, \{type: 'square', gain: \.035\}\)/.test(source), false, 'the old two-beep siren is removed');
});
