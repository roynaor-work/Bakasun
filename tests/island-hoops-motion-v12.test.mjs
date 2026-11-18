import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeTallPack, TALL_REQUIRED, gaitRate} from '../workout/island/minigames/hoops-tall.mjs';
const root = new URL('../workout/island/', import.meta.url);
const pack = decodeTallPack(JSON.parse(await readFile(new URL('assets/hoops-tall/motion-v12.json', root), 'utf8')));
const raw = JSON.parse(await readFile(new URL('assets/hoops-tall/motion-v12.json', root), 'utf8'));

test('the v12 pack has every clip the chooser needs, trimmed to the core, with the catalog scores', () => {
  for (const id of TALL_REQUIRED) assert.ok(pack.clips[id], id);
  const scores = Object.values(raw.clips).map(c => c.score);
  assert.ok(scores.every(s => s >= 90), 'no clip under 90');
  assert.ok(scores.reduce((a, b) => a + b, 0) / scores.length >= 92, 'average at least 92 (the M2 bar)');
  for (const [id, c] of Object.entries(pack.clips)) { assert.equal(c.frames, Math.round(c.duration * 30) + 1, id); assert.ok(c.duration > 0.5 && c.duration < 3.2, id + ' duration ' + c.duration); assert.equal(c.jumpScale, null, id + ' lift is baked'); }
});
test('gait rates use the clip reference speed and the repair time scale', () => {
  const run = pack.clips.run; assert.ok(run.refSpeed > 3 && run.refSpeed < 4.2, 'run ref ' + run.refSpeed); assert.ok(run.timeScale >= 1);
  assert.equal(gaitRate(4.6, 4.6), 1); assert.equal(gaitRate(9, 4.6), 1.45); assert.equal(gaitRate(20, 4.6, 1.45 * 1.5), 1.45 * 1.5);
  for (const g of ['walk', 'jog', 'run', 'sprint']) assert.ok(pack.clips[g].refSpeed > 0.8, g);
});
test('dribble clips carry a root-relative ball track that reaches the floor and the events the bounce phase needs', () => {
  for (const id of ['dribble_right', 'run_ball', 'jog_ball', 'dribble_crossover_right']) {
    const c = pack.clips[id]; assert.ok(c.ball, id + ' ball'); let minY = Infinity, maxX = 0; for (let i = 0; i < c.ball.length; i += 3) { minY = Math.min(minY, c.ball[i + 1]); maxX = Math.max(maxX, Math.abs(c.ball[i])); }
    assert.ok(minY < 0.16, id + ' floor ' + minY); assert.ok(maxX < 1.2, id + ' drift ' + maxX);
    if (id !== 'dribble_crossover_right') { assert.ok(c.events.contact?.length && c.events.bounce?.length, id + ' events'); }
  }
  for (const id of ['dunk_one_hand', 'jump_shot', 'layup_right']) { const c = pack.clips[id]; for (const e of ['takeoff', 'release', 'land']) assert.ok(c.events[e]?.length, id + ' ' + e); }
});
