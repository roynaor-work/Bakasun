import test from 'node:test';
import assert from 'node:assert/strict';
import {leagueOrder} from '../minigames/racing-session.mjs';
import {createRacing} from '../minigames/racing-physics.mjs';
import {racingLeagueResult} from '../minigames/racing-league-result.mjs';
import {raceSetup, createLeague} from '../minigames/racing-league.mjs';

// Roy, v21 on the phone: "finished track 2, it froze with engine noise after it showed first place". Root cause: with ten cars on the grid the league
// order carried ten ids, the league result contract accepts the scoring cars only, the engine refused the result and the session froze.
test('league order of a 10-car race holds the scoring cars only and the league result contract accepts it', () => {
  const league = createLeague(), setup = raceSetup(league);
  const model = createRacing({stage: setup.stage, seed: 5, config: {countdown: 0, equipment: setup.equipment, drivers: setup.drivers, extraRivals: setup.extraRivals ?? 5, stage: setup.stageOverride}});
  assert.ok(model.state.cars.length >= 10, 'a full grid (ten cars in the short league, twelve in the long one)');
  const order = leagueOrder(model.state.cars);
  const scoring = model.state.cars.filter(c => c.scoring !== false);
  assert.equal(order.order.length, scoring.length, 'one id per scoring car');
  assert.ok(order.order.every(id => scoring.some(c => c.id === id)), 'no traffic car in the league order');
  // drive the player round with the real model until the race ends, then run the engine's contract on the session's payload
  const p = model.state.player, tr = model.track, w = a => Math.atan2(Math.sin(a), Math.cos(a));
  for (let n = 0; n < (model.stage.timeLimit + 2) * 60 && model.state.phase !== 'finished'; n++) {
    const pr = tr.project(p.x, p.z, p.s), tg = tr.sample(pr.s + 10 + p.speed * .5), e = w(Math.atan2(tg.x - p.x, tg.z - p.z) - p.heading);
    model.step(1 / 60, {steer: Math.max(-1, Math.min(1, e * 1.7)), throttle: 1, autoAccelerate: true});
  }
  assert.equal(model.state.phase, 'finished');
  const s = model.state, raw = {outcome: s.result.won ? 'win' : 'lose', score: s.result.checkpoints === s.result.requiredCheckpoints ? model.stage.opponents + 2 - s.result.rank : 0, racing: s.result, league: leagueOrder(s.cars)};
  const ctx = {league: setup, level: setup.stage, seed: 5};
  const lr = racingLeagueResult(raw, ctx, {maximumSeconds: 300});
  assert.ok(lr, 'the engine accepts the finished league race');
  assert.equal(lr.order.length, scoring.length);
});
