import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAlpineEngine} from '../workout/island/minigames/alpine-engine.mjs';
const base = JSON.parse(await readFile(new URL('../workout/island/data/config.json', import.meta.url), 'utf8')).minigames.alpineRush;
const DT = base.physics.fixedStep;
function jump(steer, off) {
  const balance = structuredClone(base); if (off) delete balance.physics.airBoost;
  balance.physics.grid = [{s: 0, x: 0}, ...Array.from({length: 5}, (_, i) => ({s: -200 - i * 5, x: 0}))];
  const course = {id: 'air', length: 600, objects: [{id: 'r', type: 'ramp', s: 150, x: 0}], rows: [], path: null, coins: 0};
  const e = createAlpineEngine({balance, stage: 1, seed: 3, course}); e.command({type: 'start'});
  while (e.phase === 'countdown') e.step(DT);
  let took = null, maxBoost = false;
  for (let i = 0; i < 3000; i++) {
    const d = e.debug()[0];
    if (d.airborne && !took) took = d;
    if (took) { e.command({type: 'steer', value: steer}); maxBoost ||= e.snapshot().player.airBoost; }
    if (took && !d.airborne) return {took, land: d, flagged: maxBoost};
    e.step(DT);
  }
}
test('ramp air boost: small, capped gain flying straight; none with the flag removed', () => {
  const on = jump(0), off = jump(0, true);
  const gain = on.land.speed / on.took.speed - 1;
  assert.ok(gain > .05 && gain <= .0801, `straight jump gains 5-8% (${gain})`);
  assert.ok(on.flagged, 'frame.airBoost is true while pushing');
  assert.ok(off.land.speed <= off.took.speed + 1e-9 && !off.flagged, 'no gain and no flag without physics.airBoost');
});
test('steering in the air still works, costs part of the boost and stays within lateral limits', () => {
  const s = jump(1), straight = jump(0);
  assert.ok(Math.abs(s.land.x) > 5 && Math.abs(s.land.x) < 9, `lateral air drift ${s.land.x}`);
  assert.ok(s.land.speed < straight.land.speed, 'a crooked jump is slower than a straight one');
  assert.equal(s.land.crashes, 0);
});
