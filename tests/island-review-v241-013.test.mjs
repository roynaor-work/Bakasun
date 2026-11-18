import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(process.env.REVIEW_FIX_ROOT || process.cwd());
const url = p => pathToFileURL(resolve(root, 'workout/island', p));
const {createAlpineEngine} = await import(url('minigames/alpine-engine.mjs'));
const {leagueBalance} = await import(url('minigames/alpine-league-stages.mjs'));
const {engineStageOf} = await import(url('minigames/alpine-league-core.mjs'));
const {withoutV241} = await import(url('minigames/alpine-v241.mjs'));
const base = JSON.parse(await readFile(url('data/config.json'), 'utf8')).minigames.alpineRush;

test('V241-013: every active point in the generated league-26 powder patch remains in the view snapshot', () => {
  const n = 26, balance = structuredClone(leagueBalance(base, n));
  balance.physics.grid = [{s: 0, x: 0}, ...Array.from({length: 5}, (_, i) => ({s: -400 - i * 5, x: i * 2 - 4}))];
  const engine = createAlpineEngine({balance, stage: engineStageOf(n), seed: 7});
  const patch = engine.course.objects.find(o => o.type === 'powder' && o.len > 2 * base.physics.viewBehind + 2);
  assert.ok(patch, 'exercise the same real generated patch as the review');
  engine.command({type: 'start'}); let active = 0, pastCentreWindow = 0;
  try {
    for (let f = 0; f < 12000 && engine.phase !== 'finished'; f++) {
      const d = engine.debug()[0];
      engine.command({type: 'steer', value: Math.max(-1, Math.min(1, (patch.x - d.x) * .8))}); engine.step(1 / 60);
      const snap = engine.snapshot(), player = snap.player;
      if (Math.abs(player.s - patch.s) <= patch.len / 2 && Math.abs(player.x - patch.x) < patch.w / 2 && player.surface === 'powder') {
        active++; if (player.s - patch.s > base.physics.viewBehind) pastCentreWindow++;
        assert.ok(snap.obstacles.some(o => o.id === patch.id), `active powder vanished at s=${player.s}, patch ends at ${patch.s + patch.len / 2}`);
      }
      if (player.s > patch.s + patch.len) break;
    }
    assert.ok(active > 0 && pastCentreWindow > 0, 'cover the trailing segment that previously disappeared');
    console.log(JSON.stringify({patch, activeFrames: active, activeFramesPastCentreWindow: pastCentreWindow}));
  } finally { engine.dispose(); }
});

test('V241-013: interval overlap works ahead and behind, and leaves v24 point-culling unchanged', () => {
  const build = balance => {
    const b = structuredClone(balance); b.physics.grid[0] = {s: 0, x: 0};
    const a = b.physics.viewAhead, z = b.physics.viewBehind;
    const objects = [{id: 'rear-ice', type: 'ice', x: 0, s: -z - 1, len: 4, w: 4},
      {id: 'point', type: 'rock', x: 0, s: a + .5, radius: .2},
      {id: 'front-powder', type: 'powder', x: 0, s: a + 2, len: 6, w: 4}];
    return createAlpineEngine({balance: b, stage: 1, course: {id: 'bounds', length: 3000, objects, rows: [], coins: 0}});
  };
  const on = build(base), off = build(withoutV241(base));
  try {
    on.command({type: 'start'}); off.command({type: 'start'});
    assert.deepEqual(on.snapshot().obstacles.map(o => o.id), ['rear-ice', 'front-powder']);
    assert.deepEqual(off.snapshot().obstacles, [], 'without the v24.1 rules, centres keep the exact old visibility window');
  } finally { on.dispose(); off.dispose(); }
});
