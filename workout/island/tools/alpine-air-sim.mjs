/** Alpine ramp-air measurement (headless, 60 Hz, real physics from config.json).
 * Usage: node tools/alpine-air-sim.mjs [--root <island dir>] [--label x] [--json out.json] [--off]  (--off removes physics.airBoost)
 * Part 1: jumps on a straight bench (speed / lateral drift / landing). Part 2: stage times (rivals share the physics). */
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const arg = (n, f) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : f; };
const root = path.resolve(arg('--root', fileURLToPath(new URL('..', import.meta.url))));
const {createAlpineEngine} = await import(pathToFileURL(path.join(root, 'minigames/alpine-engine.mjs')).href);
const config = JSON.parse(await readFile(path.join(root, 'data/config.json'), 'utf8'));
const DT = 1 / 60;
const mk = () => { const b = structuredClone(config.minigames.alpineRush); if (process.argv.includes('--off')) delete b.physics.airBoost; return b; };

function jump({rampS = 150, steer = 0, steerAt = 0, boost = false, ramp = 1, x0 = 0}) {
  const b = mk(); b.physics.grid = [{s: 0, x: x0}, ...Array.from({length: 5}, (_, i) => ({s: -200 - i * 5, x: i * 2 - 4}))];
  const course = {id: 'bench', length: 2400, objects: [{id: 'r', type: 'ramp', s: rampS, x: 0}], rows: [], path: null, coins: 0};
  const e = createAlpineEngine({balance: b, stage: 1, seed: 9, course}); e.command({type: 'start'});
  while (e.phase === 'countdown') e.step(DT); e.drainEvents();
  // hold speed0 by running until the player reaches it (base speed 20 or boosted 31), else start low by an early ramp
  let t = 0, out = {}, took = null, landed = null;
  for (let i = 0; i < 3000; i++) {
    const d = e.debug()[0];
    if (boost && d.boostTime <= 0 && d.s < 100 && e.snapshot().boostReady) e.command({type: 'boost'});
    if (took === null && d.airborne) took = {s: d.s, x: d.x, speed: d.speed, vy: d.vy, t: i * DT};
    if (took && !landed) e.command({type: 'steer', value: (i * DT - took.t) >= steerAt ? steer : 0});
    else e.command({type: 'steer', value: 0});
    if (took && !d.airborne && !landed) { landed = {s: d.s, x: d.x, speed: d.speed, vx: d.vx, t: i * DT}; break; }
    e.step(DT);
  }
  const d = e.debug()[0];
  // after landing: speed 1.6 s later, and crash check
  let ev = [];
  for (let i = 0; i < 100; i++) { e.step(DT); }
  const after = e.debug()[0];
  ev = e.drainEvents().filter(x => x.riderId === 'player').map(x => x.type);
  e.dispose();
  return {takeoffSpeed: took.speed, landSpeed: landed.speed, gainPct: (landed.speed / took.speed - 1) * 100, air: landed.t - took.t, drift: landed.x - took.x, landVx: landed.vx, speed16: after.speed, crashes: after.crashes, events: [...new Set(ev)]};
}
const r = {};
r.cruise = jump({});
r.slowRamp = jump({rampS: 18});
r.midRamp = jump({rampS: 40});
r.boosted = jump({boost: true});
r.cruiseSteerRight = jump({steer: 1});
r.boostedSteerRight = jump({boost: true, steer: 1});
r.cruiseSteerHalf = jump({steer: .5});
r.cruiseSteerLate = jump({steer: 1, steerAt: .6});
// landing crooked: steer hard right in the whole air time, vx at landing large -> expect slideLoss
// Part 2: stage times. (a) rivals on the full generated course (they share the physics and take ramps by desire);
// (b) "floor" = a clean player bot on the real course with only its ramps (never crashes), with and without ramps.
const {alpineTrack} = await import(pathToFileURL(path.join(root, 'minigames/alpine-engine.mjs')).href);
const {generateCourse} = await import(pathToFileURL(path.join(root, 'minigames/alpine-track.mjs')).href);
function raceRivals(stage, seed) {
  const e = createAlpineEngine({balance: mk(), stage, seed}); e.command({type: 'start'});
  const fin = new Map(); let n = 0;
  while (e.phase !== 'finished' && n < 60 * 400) { e.step(DT); n++; for (const d of e.debug()) if (d.finished && !fin.has(d.id)) fin.set(d.id, n * DT); }
  const rivals = [...fin].filter(([k]) => k !== 'player').map(([, v]) => v).sort((a, b) => a - b);
  e.dispose(); return {best: rivals[0], median: rivals[Math.floor(rivals.length / 2)], n: rivals.length};
}
function floor(stage, withRamps, boostUse) {
  const b = mk(); const {track} = alpineTrack(b, stage);
  const c = generateCourse(track, b.physics);
  const objects = c.objects.filter(o => withRamps && o.type === 'ramp');
  const course = {...c, objects, rows: [], coins: 0};
  const e = createAlpineEngine({balance: b, stage, seed: 5, course}); e.command({type: 'start'});
  let n = 0;
  while (e.phase !== 'finished' && n < 60 * 400) {
    const d = e.debug()[0]; let tx = 0;
    const next = objects.find(o => o.s > d.s - 4 && o.s < d.s + 60);
    if (next) tx = next.x;
    if (boostUse && d.boostTime <= 0 && !d.airborne && e.snapshot().boostFraction > .9) e.command({type: 'boost'});
    e.command({type: 'steer', value: Math.max(-1, Math.min(1, (tx - d.x) * 1.2))});
    e.step(DT); n++;
  }
  const d = e.debug()[0]; e.dispose(); return {t: +(n * DT).toFixed(2), crashes: d.crashes, ramps: objects.filter(o => o.type === 'ramp').length};
}
r.stages = [];
for (let stage = 1; stage <= Object.keys(config.minigames.alpineRush.tracks).length; stage++) {
  const rv = [1, 2, 3].map(sd => raceRivals(stage, sd));
  r.stages.push({stage, rivalBest: rv.map(x => +x.best.toFixed(2)), rivalMedian: rv.map(x => +x.median.toFixed(2)),
    floorRamps: floor(stage, true, false), floorNoRamps: floor(stage, false, false), floorRampsBoost: floor(stage, true, true), floorNoRampsBoost: floor(stage, false, true)});
}
const json = JSON.stringify(r, null, 1);
if (arg('--json')) await writeFile(arg('--json'), json); else console.log(json);
