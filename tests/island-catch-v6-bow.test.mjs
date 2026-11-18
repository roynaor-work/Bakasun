import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCatchEngine} from '../workout/island/minigames/catch-engine.mjs';
import {dragToAim, holdSway, autoAngle, BOW_CONTROLS, STRINGS as HUD_STRINGS} from '../workout/island/minigames/catch-bow-hud.mjs';
import {BOW, STRINGS as VIEW_STRINGS} from '../workout/island/minigames/catch-bow-view.mjs';

const root = new URL('../workout/island/', import.meta.url);
const config = JSON.parse(await readFile(new URL('data/config.json', root), 'utf8'));
const balance = config.minigames.catchCriminal;
const engineAt = (stage, dist) => createCatchEngine({balance, stage, seed: 7, equipment: {}, city: {}, v2: true, mods: dist ? {dist} : {}, feel: true, arch: true});

test('bow: dragging right turns the aim right, dragging up raises it, nothing else moves', () => {
  const start = {yaw: 0, angle: 20};
  const right = dragToAim(100, 0, start), up = dragToAim(0, -100, start), still = dragToAim(0, 0, start);
  assert.equal(right.yaw, 100 * BOW_CONTROLS.yawPerPx); assert.equal(right.angle, 20);
  assert.equal(up.angle, 20 + 100 * BOW_CONTROLS.anglePerPx); assert.equal(up.yaw, 0);
  assert.deepEqual(still, {yaw: 0, angle: 20});
  const left = dragToAim(-50, 30, {yaw: 5, angle: 30});
  assert.equal(left.yaw, 5 - 50 * BOW_CONTROLS.yawPerPx); assert.equal(left.angle, 30 - 30 * BOW_CONTROLS.anglePerPx);
  // the sensitivity is a small fraction of a degree per pixel: a full-width swipe is less than the engine's yaw limit times two
  assert.ok(BOW_CONTROLS.yawPerPx > .05 && BOW_CONTROLS.yawPerPx * 844 < balance.physics.yawMax * 5);
});

test('bow: the sight is still for the first second of holding, then sways up to the limit, more on later stages', () => {
  const still = s => Math.abs(s.yaw) === 0 && Math.abs(s.angle) === 0;
  for (const t of [0, .5, 1.3, 2]) assert.ok(still(holdSway(0, t)), 'no sway at the touch');
  assert.ok(still(holdSway(BOW_CONTROLS.swayAfter, 1.1)), 'no sway before swayAfter');
  let maxYaw = 0, maxAngle = 0;
  for (let t = 0; t < 10; t += .05) { const s = holdSway(9, t, 1); maxYaw = Math.max(maxYaw, Math.abs(s.yaw)); maxAngle = Math.max(maxAngle, Math.abs(s.angle)); }
  assert.ok(maxYaw > BOW_CONTROLS.swayMax * .5 && maxYaw <= BOW_CONTROLS.swayMax * (.6 + .04) + 1e-9, 'stage 1 sway reaches its limit: ' + maxYaw);
  assert.ok(maxAngle < maxYaw, 'the angle sways less than the direction');
  const amp = stage => { let m = 0; for (let t = 0; t < 10; t += .05) m = Math.max(m, Math.abs(holdSway(9, t, stage).yaw)); return m; };
  assert.ok(amp(10) > amp(1), 'later stages sway more');
  const half = Math.abs(holdSway(BOW_CONTROLS.swayAfter + 1.5, 0.75, 1).yaw), full = Math.abs(holdSway(BOW_CONTROLS.swayAfter + 3, 0.75, 1).yaw);
  assert.ok(half > 0 && half < full, 'the sway grows with the hold time');
});

test('bow: the automatic angle puts the arc on the thief and grows with his distance', () => {
  let last = -1;
  for (const dist of [10, 14, 18, 24, 32]) {
    const e = engineAt(1, dist), a = autoAngle(e);
    assert.ok(a > last, `angle grows with distance: ${dist} m -> ${a.toFixed(2)} (before ${last.toFixed(2)})`); last = a;
    const f = e.trajectory(a, 1, e.aim.tool, {withWind: false, yaw: 0, stopAtObstacle: false}), c = e.criminalAt(e.clock), at = f.path.find(p => p.x >= c.x);
    assert.ok(at && Math.abs(at.y - 1) < .12, `at ${dist} m the wind-free arc passes the chest: y=${at?.y.toFixed(2)}`);
    assert.ok(a >= balance.physics.angle.min && a <= 45);
  }
  // the real stages: the angle at the configured distance catches a standing thief when released at once
  for (const stage of [1, 5, 10]) {
    const e = engineAt(stage); e.setAim({power: 1, yaw: 0, angle: autoAngle(e)});
    const c = e.criminalAt(e.clock + balance.physics.throwSeconds + .6);
    const f = e.trajectory(e.aim.angle, 1, e.aim.tool, {resolve: true, withWind: false, t0: e.clock + balance.physics.throwSeconds, yaw: Math.atan2(c.z, c.x) * 180 / Math.PI});
    assert.ok(['catch', 'ground', 'out'].includes(f.kind), 'a flight resolves on stage ' + stage);
    assert.ok(f.near < 2.5, `stage ${stage}: the auto-angle flight passes within reach of the thief (${f.near.toFixed(2)})`);
  }
});

test('bow: Hebrew strings, no exclamation marks, no Arabic letters, and the numbers the stage promises', async () => {
  for (const S of [HUD_STRINGS, VIEW_STRINGS]) for (const [k, v] of Object.entries(S)) {
    assert.ok(k.startsWith('catch.bow.'), k);
    assert.ok(/[א-ת]/.test(v), 'Hebrew: ' + k);
    assert.equal(/[!؀-ۿ]/.test(v), false, 'no exclamation marks or Arabic letters: ' + k);
  }
  assert.ok(BOW.fovDrawn < BOW.fovIdle, 'drawing zooms in');
  assert.ok(BOW.eyeY > 1.4 && BOW.eyeY < 1.8, 'the eye is at a standing adult height');
  const source = await readFile(new URL('minigames/catch-bow-view.mjs', root), 'utf8') + await readFile(new URL('minigames/catch-bow-hud.mjs', root), 'utf8');
  assert.equal(/\b(gun|bullet|shoot)\b/i.test(source), false, 'the bow stage has nothing to do with firing');
  assert.ok(source.includes('catch-bow-sight') && source.includes('catch-bow-vignette') && source.includes('catch-bow-pulse'));
});
