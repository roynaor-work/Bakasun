import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRuntime, runBot, runCampaign, SEEDS} from './helpers/fire-levels-bot.mjs';

const runtime = await loadRuntime(process.env.FIRE_LEVELS_ROOT);

function verifyIdle(run) {
  assert.equal(run.outcome, 'lose');
  assert.equal(run.stars, 1);
  assert.equal(run.reason, 'fireIdle');
  assert.equal(run.score, 0);
  assert.equal(run.money, 0);
  assert.equal(run.extinguished, 0);
  assert.equal(run.streetRescues, 0);
  assert.equal(run.interiorRescues, 0);
  assert.equal(run.sprayTicks, 0);
  assert.equal(run.navigationTaps, 0);
}

function verifyPatient(run) {
  const label = `${run.level}/${run.seed}: ${JSON.stringify(run)}`;
  assert.equal(run.outcome, 'win', label);
  assert.ok(run.stars >= 1, label);
  assert.ok(run.sprayTicks > 0 && run.extinguished > 0, label);
  assert.ok(run.streetRescues >= run.requiredRescues, label);
  if (run.level % 3 === 0) {
    const floors = Math.min(10, run.level / 3 + 2);
    assert.ok(run.doorSeconds > 0, label);
    assert.equal(run.floors, floors, label);
    assert.equal(run.interiorRescues, floors, label);
    assert.ok(run.interiorActions >= floors, label);
    assert.equal(run.handovers, 0, label);
  } else {
    assert.equal(run.doorSeconds, null, label);
    assert.equal(run.floors, 0, label);
  }
}

test('a patient player can win the full campaign with earned equipment; idle only earns one participation star', async () => {
  const runs = await runCampaign(runtime);
  assert.equal(runs.length, 30 * SEEDS.length * 2);
  assert.ok(runs.some(run => run.persona === 'patient' && run.hydrantTicks > 0));
  for (const run of runs) {
    if (run.persona === 'idle') verifyIdle(run);
    else verifyPatient(run);
  }
});

test('starter levels and the first three-floor building are winnable with starter equipment', async () => {
  const runs = await runCampaign(runtime, {levels: [1, 2, 3], buyUpgrades: false});
  for (const run of runs) {
    assert.deepEqual(run.equipment, {});
    if (run.persona === 'idle') verifyIdle(run);
    else verifyPatient(run);
  }
});

test('rollback restores original entry plan and idle score', async () => {
  const search = '?fireLevels=0';
  assert.equal(runtime.fireLevelsEnabled(search), false);
  assert.equal(runtime.entryPlan(3).rooms.length, 1);
  const run = await runBot(runtime, {level: 3, seed: 1, persona: 'idle', search});
  assert.equal(run.outcome, 'lose');
  assert.equal(run.stars, 0);
  assert.equal(run.score, 0);
});

test('letting the team clear every floor gives one star after the remaining street objectives are done', async () => {
  const run = await runBot(runtime, {level: 3, seed: 1, persona: 'patient', idleInside: true});
  assert.equal(run.outcome, 'win');
  assert.equal(run.stars, 1);
  assert.equal(run.floors, 3);
  assert.equal(run.handovers, 3);
  assert.equal(run.interiorActions, 0);
  assert.equal(run.interiorRescues, 0);
});
