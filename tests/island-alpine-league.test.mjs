import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../workout/island/minigames/alpine-league-core.mjs';
const order = place => { const o = ['rival-1', 'rival-2', 'rival-3', 'rival-4', 'rival-5']; o.splice(place - 1, 0, 'player'); return o; };
test('a season is six rounds, points and coins follow the place, par time adds a bonus', () => {
  const s = L.createLeague(); assert.ok(L.validLeague(s));
  const r = L.applyRound(s, { order: order(1), elapsedMs: 80000 });
  assert.deepEqual([r.place, r.points, r.coins, r.par], [1, 11, 150, true]);
  const r2 = L.applyRound(s, { order: order(6), elapsedMs: 120000 });
  assert.deepEqual([r2.place, r2.points, r2.coins, r2.par], [6, 1, 25, false]);
  for (let i = 0; i < 4; i++) L.applyRound(s, { order: order(2), elapsedMs: 90000 });
  assert.equal(s.round, 6); assert.ok(L.validLeague(s)); assert.throws(() => L.applyRound(s, { order: order(1) }));
  assert.ok(L.leagueSummary(s).done);
});
test('invalid orders are rejected', () => {
  const s = L.createLeague();
  assert.throws(() => L.applyRound(s, { order: ['player', 'rival-1'] }));
  assert.throws(() => L.applyRound(s, { order: ['player', 'rival-1', 'rival-1', 'rival-3', 'rival-4', 'rival-5'] }));
});
test('second season needs the top three, a cup is counted for a win, three seasons exist', () => {
  const s = L.createLeague(); for (let i = 0; i < 6; i++) L.applyRound(s, { order: order(1), elapsedMs: 80000 });
  assert.equal(s.cups, 1); assert.equal(s.seasonRank[1], 1); assert.equal(L.nextSeason(s).ok, true); assert.equal(s.season, 2); assert.equal(s.table.player, 0);
  const bad = L.createLeague(); for (let i = 0; i < 6; i++) L.applyRound(bad, { order: order(6), elapsedMs: 200000 });
  assert.equal(L.nextSeason(bad).ok, false); assert.equal(L.SEASONS.length, 3);
});
test('upgrades cost coins, cap at five levels and feed the engine equipment values', () => {
  const s = L.createLeague(); assert.equal(L.buyUpgrade(s, 'skis').reason, 'coins'); s.coins = 2000;
  for (let i = 0; i < 5; i++) assert.ok(L.buyUpgrade(s, 'skis').ok); assert.equal(L.buyUpgrade(s, 'skis').reason, 'max');
  assert.ok(L.equipmentFor(s.upgrades).wax <= 1.1 && L.equipmentFor(s.upgrades).tank === 1);
});
test('merge never lowers progress and the validator rejects damaged saves', () => {
  const a = L.createLeague(), b = L.createLeague(); b.season = 2; b.coins = 5; a.coins = 50; a.upgrades.boost = 3;
  const m = L.mergeLeague(a, b); assert.equal(m.season, 2); assert.equal(m.coins, 50); assert.equal(m.upgrades.boost, 3); assert.ok(L.validLeague(m));
  assert.equal(L.validLeague({ ...a, coins: -1 }), false); assert.equal(L.validLeague({ ...a, table: { player: 0 } }), false); assert.equal(L.validLeague(null), false);
});
test('?alpineLeague=0 turns the league off', () => { assert.equal(L.leagueEnabled('?alpineLeague=0'), false); assert.equal(L.leagueEnabled(''), true); });
