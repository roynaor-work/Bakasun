import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlpineEngine} from '../workout/island/minigames/alpine-engine.mjs';
import {generateCourse} from '../workout/island/minigames/alpine-track.mjs';
const base = JSON.parse(await readFile(new URL('../workout/island/data/config.json', import.meta.url), 'utf8')).minigames.alpineRush;
const DT = base.physics.fixedStep;
function run(object, x0, off) {
  const balance = structuredClone(base); if (off) delete balance.physics.fall;
  balance.physics.grid = [{s: 0, x: x0}, ...Array.from({length: 5}, (_, i) => ({s: -200 - i * 5, x: 0}))];
  const course = {id: 'fall', length: 600, objects: [{id: 'o', ...object}], rows: [], path: null, coins: 0};
  const e = createAlpineEngine({balance, stage: 1, seed: 3, course}); e.command({type: 'start'});
  while (e.phase === 'countdown') e.step(DT);
  let crashedTicks = 0, speedBefore = 0, crashes = 0;
  for (let i = 0; i < 1500; i++) {
    const d = e.debug()[0]; if (!crashedTicks && d.crashes === 0) speedBefore = d.speed;
    if (e.snapshot().player.crashed) crashedTicks++;
    crashes = d.crashes; e.step(DT);
  }
  const after = e.debug()[0]; return {crashedTicks, crashes, speedBefore, after};
}
test('hitting the side of a ramp is a real fall (about 1.2 s), then the rider is back up and moving', () => {
  const r = run({type: 'ramp', s: 80, x: 0}, 2.2);
  assert.equal(r.crashes, 1); assert.ok(r.crashedTicks * DT > 1.0 && r.crashedTicks * DT < 1.5, `fall seconds ${r.crashedTicks * DT}`);
  assert.ok(r.after.speed > 10, 'speed recovers');
  const old = run({type: 'ramp', s: 80, x: 0}, 2.2, true); assert.equal(old.crashes, 0, 'without physics.fall (?alpineFall=0) a ramp wall is only a bump');
});
test('a gate post is a short fall; passing the gate between the posts is not', () => {
  const hit = run({type: 'gate', s: 80, x: 0}, -2.2);
  assert.equal(hit.crashes, 1); assert.ok(hit.crashedTicks * DT > .7 && hit.crashedTicks * DT < 1.1);
  assert.equal(run({type: 'gate', s: 80, x: 0}, 0).crashes, 0);
});
test('narrow passages come with warning signs 30 m ahead and stay passable', () => {
  const track = {...base.tracks['storm-ridge'], id: 'storm-ridge'}, c = generateCourse(track, base.physics);
  const warns = c.objects.filter(o => o.type === 'warn'); assert.ok(warns.length >= 2 && warns.length % 2 === 0);
  for (const row of c.rows) assert.ok(row.to - row.from >= 1.2, `corridor ${row.to - row.from} at ${row.s}`);
  const off = generateCourse({...track, narrow: undefined}, base.physics);
  assert.ok(off.objects.filter(o => o.type === 'warn').length < warns.length);
});
